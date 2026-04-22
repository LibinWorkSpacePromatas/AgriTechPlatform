from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.routes import get_db
from app.core.security import encrypt_auction_account_number, mask_account_number
from app.db.models import Auction, AuctionBid, AuctionProfile, User


router = APIRouter()

AuctionStatus = Literal["upcoming", "active", "ended", "cancelled"]

# ── WebSocket connection manager ──────────────────────────────────────────────

class AuctionConnectionManager:
    def __init__(self) -> None:
        # auction_id -> list of connected websockets
        self._rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, auction_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._rooms.setdefault(auction_id, []).append(ws)

    def disconnect(self, auction_id: str, ws: WebSocket) -> None:
        room = self._rooms.get(auction_id, [])
        if ws in room:
            room.remove(ws)

    async def broadcast(self, auction_id: str, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(auction_id, [])):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(auction_id, ws)


ws_manager = AuctionConnectionManager()


def _utc_iso(dt: datetime) -> str:
    return f"{dt.isoformat()}Z"


def _build_initials(name: str | None) -> str:
    parts = [part[0].upper() for part in (name or "Anonymous").split() if part]
    return "".join(parts[:2]) or "AN"


def _seller_meta_rows(db: Session, seller_ids: list[UUID]) -> dict[UUID, dict[str, str | None]]:
    if not seller_ids:
        return {}

    rows = (
        db.query(AuctionProfile, User)
        .outerjoin(User, AuctionProfile.user_id == User.id)
        .filter(AuctionProfile.id.in_(seller_ids))
        .all()
    )

    result: dict[UUID, dict[str, str | None]] = {}
    for profile, user in rows:
        seller_name = (
            profile.business_name
            or (user.farm_name if user else None)
            or (user.name if user else None)
            or "Seller"
        )
        seller_location = (
            (user.farm_location if user else None)
            or (user.region if user else None)
        )
        result[profile.id] = {
            "seller_name": seller_name,
            "seller_location": seller_location,
        }
    return result


def _serialize_auction(
    auction: Auction,
    highest_bid: Decimal | None = None,
    seller_meta: dict[str, str | None] | None = None,
) -> dict:
    return {
        "id": str(auction.id),
        "produce_name": auction.produce_name,
        "quantity": float(auction.quantity),
        "unit": auction.unit,
        "base_price": float(auction.base_price),
        "status": auction.status,
        "start_time": _utc_iso(auction.start_time),
        "end_time": _utc_iso(auction.end_time),
        "winner_id": str(auction.winner_id) if auction.winner_id else None,
        "final_price": float(auction.final_price) if auction.final_price is not None else None,
        "highest_bid": float(highest_bid) if highest_bid is not None else None,
        "image_url": auction.image_url,
        "seller_name": seller_meta.get("seller_name") if seller_meta else None,
        "seller_location": seller_meta.get("seller_location") if seller_meta else None,
        "created_at": _utc_iso(auction.created_at),
        "updated_at": _utc_iso(auction.updated_at),
    }


def _serialize_bid(bid: AuctionBid, bidder_name: str | None, is_top: bool) -> dict:
    name = bidder_name or "Anonymous"
    return {
        "id": str(bid.id),
        "auction_id": str(bid.auction_id),
        "bidder_id": str(bid.bidder_id),
        "bidder_name": name,
        "bidder_initials": _build_initials(name),
        "amount": float(bid.bid_amount),
        "created_at": _utc_iso(bid.created_at),
        "is_top": is_top,
    }


def _highest_bid_rows(db: Session, auction_ids: list[UUID]) -> dict[UUID, Decimal]:
    if not auction_ids:
        return {}

    bid_rows = (
        db.query(AuctionBid.auction_id, func.max(AuctionBid.bid_amount))
        .filter(AuctionBid.auction_id.in_(auction_ids))
        .group_by(AuctionBid.auction_id)
        .all()
    )
    return {auction_id: amount for auction_id, amount in bid_rows if amount is not None}


def _now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _validate_abn_checksum(abn: str) -> bool:
    if len(abn) != 11 or not abn.isdigit():
        return False
    digits = [int(ch) for ch in abn]
    digits[0] -= 1
    weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
    total = sum(d * w for d, w in zip(digits, weights))
    return total % 89 == 0


def _refresh_auction_statuses(db: Session) -> None:
    now = _now_utc_naive()

    db.query(Auction).filter(
        Auction.status == "upcoming",
        Auction.start_time <= now,
        Auction.end_time > now,
    ).update(
        {"status": "active", "updated_at": now},
        synchronize_session=False,
    )

    closing_auctions = (
        db.query(Auction)
        .filter(
            Auction.status.in_(["upcoming", "active"]),
            Auction.end_time <= now,
        )
        .all()
    )

    for auction in closing_auctions:
        winning_bid = (
            db.query(AuctionBid)
            .filter(AuctionBid.auction_id == auction.id)
            .order_by(AuctionBid.bid_amount.desc(), AuctionBid.created_at.asc())
            .first()
        )
        auction.status = "ended"
        auction.updated_at = now
        if winning_bid:
            auction.winner_id = winning_bid.bidder_id
            auction.final_price = winning_bid.bid_amount
        else:
            auction.winner_id = None
            auction.final_price = None

    db.commit()
    # Always expire the identity map so callers see the freshly committed statuses
    db.expire_all()


class AuctionProfileCreateRequest(BaseModel):
    user_id: UUID
    abn: str = Field(min_length=11, max_length=11)
    business_name: str = Field(min_length=1)
    gst_registered: bool
    bsb: str = Field(min_length=6, max_length=6)
    account_number: str = Field(min_length=4, max_length=32)

    @field_validator("abn")
    @classmethod
    def validate_abn(cls, value: str) -> str:
        normalized = "".join(ch for ch in value if ch.isdigit())
        if not _validate_abn_checksum(normalized):
            raise ValueError("ABN failed checksum validation.")
        return normalized

    @field_validator("bsb")
    @classmethod
    def validate_bsb(cls, value: str) -> str:
        normalized = "".join(ch for ch in value if ch.isdigit())
        if len(normalized) != 6:
            raise ValueError("BSB must contain 6 digits.")
        return normalized


class AuctionCreateRequest(BaseModel):
    user_id: UUID
    produce_name: str = Field(min_length=1)
    quantity: Decimal = Field(gt=0)
    unit: str = Field(default="kg")
    base_price: Decimal = Field(gt=0)
    start_time: datetime
    end_time: datetime
    image_url: str | None = None


class AuctionBidCreateRequest(BaseModel):
    bidder_id: UUID
    bid_amount: Decimal = Field(gt=0)


@router.post("/auctions/profile")
def create_auction_profile(request: AuctionProfileCreateRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    encrypted_account = encrypt_auction_account_number(request.account_number)
    now = _now_utc_naive()

    existing_profile = db.query(AuctionProfile).filter(AuctionProfile.user_id == request.user_id).first()
    if existing_profile:
        existing_profile.abn = request.abn
        existing_profile.business_name = request.business_name
        existing_profile.gst_registered = request.gst_registered
        existing_profile.bsb = request.bsb
        existing_profile.account_number_encrypted = encrypted_account
        existing_profile.status = "active"
        existing_profile.updated_at = now
        db.commit()
        db.refresh(existing_profile)
        return {
            "id": str(existing_profile.id),
            "user_id": str(existing_profile.user_id),
            "abn": existing_profile.abn,
            "business_name": existing_profile.business_name,
            "gst_registered": existing_profile.gst_registered,
            "bsb_masked": f"{existing_profile.bsb[:3]}-{existing_profile.bsb[3:]}",
            "account_number_masked": mask_account_number(request.account_number),
            "status": existing_profile.status,
            "created_at": existing_profile.created_at.isoformat(),
            "updated_at": existing_profile.updated_at.isoformat(),
        }

    profile = AuctionProfile(
        user_id=request.user_id,
        abn=request.abn,
        business_name=request.business_name,
        gst_registered=request.gst_registered,
        bsb=request.bsb,
        account_number_encrypted=encrypted_account,
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(profile)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="ABN is already registered.") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create auction profile: {exc}") from exc

    db.refresh(profile)
    return {
        "id": str(profile.id),
        "user_id": str(profile.user_id),
        "abn": profile.abn,
        "business_name": profile.business_name,
        "gst_registered": profile.gst_registered,
        "bsb_masked": f"{profile.bsb[:3]}-{profile.bsb[3:]}",
        "account_number_masked": mask_account_number(request.account_number),
        "status": profile.status,
        "created_at": profile.created_at.isoformat(),
        "updated_at": profile.updated_at.isoformat(),
    }


@router.get("/auctions/profile/{user_id}")
def get_auction_profile(user_id: UUID, db: Session = Depends(get_db)):
    profile = db.query(AuctionProfile).filter(AuctionProfile.user_id == user_id).first()
    if not profile:
        return {"exists": False}

    return {
        "exists": True,
        "id": str(profile.id),
        "user_id": str(profile.user_id),
        "abn": profile.abn,
        "business_name": profile.business_name,
        "gst_registered": profile.gst_registered,
        "bsb_masked": f"{profile.bsb[:3]}-{profile.bsb[3:]}",
        "account_number_masked": "********",
        "status": profile.status,
        "created_at": profile.created_at.isoformat(),
        "updated_at": profile.updated_at.isoformat(),
    }


@router.post("/auctions")
def create_auction(request: AuctionCreateRequest, db: Session = Depends(get_db)):
    # Normalise to UTC naive for consistent comparison
    start_utc = request.start_time.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = request.end_time.astimezone(timezone.utc).replace(tzinfo=None)

    if end_utc <= start_utc:
        raise HTTPException(status_code=400, detail="end_time must be after start_time.")

    profile = db.query(AuctionProfile).filter(AuctionProfile.user_id == request.user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Seller profile not found.")

    now = _now_utc_naive()
    auction = Auction(
        seller_id=profile.id,
        produce_name=request.produce_name.strip(),
        quantity=request.quantity,
        unit=request.unit.strip() or "kg",
        base_price=request.base_price,
        status="upcoming",
        start_time=start_utc,
        end_time=end_utc,
        image_url=request.image_url,
        created_at=now,
        updated_at=now,
    )
    db.add(auction)
    db.commit()
    db.refresh(auction)

    _refresh_auction_statuses(db)
    db.refresh(auction)

    return _serialize_auction(auction)


@router.post("/auctions/{auction_id}/cancel")
def cancel_auction(auction_id: UUID, seller_user_id: UUID = Query(...), db: Session = Depends(get_db)):
    profile = db.query(AuctionProfile).filter(AuctionProfile.user_id == seller_user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Seller profile not found.")

    auction = db.query(Auction).filter(Auction.id == auction_id, Auction.seller_id == profile.id).first()
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found.")

    if auction.status == "ended":
        raise HTTPException(status_code=409, detail="Ended auctions cannot be cancelled.")

    auction.status = "cancelled"
    auction.updated_at = _now_utc_naive()
    db.commit()
    return {"id": str(auction.id), "status": auction.status}


@router.post("/auctions/{auction_id}/bids")
async def place_bid(auction_id: UUID, request: AuctionBidCreateRequest, db: Session = Depends(get_db)):
    auction = (
        db.query(Auction)
        .filter(Auction.id == auction_id)
        .with_for_update()
        .first()
    )
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found.")

    now = _now_utc_naive()
    if auction.status == "cancelled":
        raise HTTPException(status_code=409, detail="Cancelled auctions do not accept bids.")
    if not (auction.start_time <= now < auction.end_time):
        raise HTTPException(status_code=409, detail="Bids are only allowed on active auctions.")

    highest_bid = db.query(func.max(AuctionBid.bid_amount)).filter(AuctionBid.auction_id == auction_id).scalar()
    current_highest = highest_bid if highest_bid is not None else Decimal("0")

    if request.bid_amount < auction.base_price:
        raise HTTPException(status_code=400, detail="Bid must be greater than or equal to base_price.")
    if request.bid_amount <= current_highest:
        raise HTTPException(status_code=400, detail="Bid must be greater than current highest bid.")

    bidder = db.query(User).filter(User.id == request.bidder_id).first()
    if not bidder:
        raise HTTPException(status_code=404, detail="Bidder not found.")
    seller_profile = db.query(AuctionProfile).filter(AuctionProfile.id == auction.seller_id).first()
    if seller_profile and seller_profile.user_id == request.bidder_id:
        raise HTTPException(status_code=403, detail="Sellers cannot bid on their own auctions.")

    bid = AuctionBid(
        auction_id=auction_id,
        bidder_id=request.bidder_id,
        bid_amount=request.bid_amount,
        created_at=_now_utc_naive(),
    )
    db.add(bid)
    db.commit()
    db.refresh(bid)

    bid_count = db.query(func.count(AuctionBid.id)).filter(AuctionBid.auction_id == auction_id).scalar() or 0
    bid_payload = _serialize_bid(bid, bidder.name, True)

    await ws_manager.broadcast(str(auction_id), {
        "type": "new_bid",
        "bid": bid_payload,
        "highest_bid": float(bid.bid_amount),
        "bid_count": int(bid_count),
    })

    return {
        "id": str(bid.id),
        "auction_id": str(bid.auction_id),
        "bidder_id": str(bid.bidder_id),
        "bid_amount": float(bid.bid_amount),
        "created_at": _utc_iso(bid.created_at),
    }


@router.get("/auctions/my/{user_id}")
def get_my_auctions(
    user_id: UUID,
    status: AuctionStatus | Literal["all"] = Query(default="all"),
    db: Session = Depends(get_db),
):
    _refresh_auction_statuses(db)

    profile = db.query(AuctionProfile).filter(AuctionProfile.user_id == user_id).first()
    if not profile:
        return []

    query = db.query(Auction).filter(Auction.seller_id == profile.id)
    if status != "all":
        query = query.filter(Auction.status == status)

    auctions = query.order_by(Auction.created_at.desc()).all()

    highest_rows = _highest_bid_rows(db, [auction.id for auction in auctions])
    seller_rows = _seller_meta_rows(db, [auction.seller_id for auction in auctions])
    return [
        _serialize_auction(auction, highest_rows.get(auction.id), seller_rows.get(auction.seller_id))
        for auction in auctions
    ]


@router.get("/auctions/dashboard/{user_id}")
def get_dashboard_summary(user_id: UUID, db: Session = Depends(get_db)):
    _refresh_auction_statuses(db)

    profile = db.query(AuctionProfile).filter(AuctionProfile.user_id == user_id).first()
    if not profile:
        return {
            "registered": False,
            "stats": {
                "active": 0,
                "upcoming": 0,
                "ended": 0,
            },
        }

    status_counts = (
        db.query(Auction.status, func.count(Auction.id))
        .filter(Auction.seller_id == profile.id)
        .group_by(Auction.status)
        .all()
    )
    counts = {status_key: count for status_key, count in status_counts}

    return {
        "registered": True,
        "profile": {
            "business_name": profile.business_name,
            "status": profile.status,
            "gst_registered": profile.gst_registered,
        },
        "stats": {
            "active": int(counts.get("active", 0)),
            "upcoming": int(counts.get("upcoming", 0)),
            "ended": int(counts.get("ended", 0)),
        },
    }


# ── Bidder endpoints ──────────────────────────────────────────────────────────

@router.get("/auctions/all")
def get_all_auctions(
    status: AuctionStatus | Literal["all"] = Query(default="all"),
    db: Session = Depends(get_db),
):
    """Return all auctions visible to bidders (active + upcoming + ended)."""
    _refresh_auction_statuses(db)

    query = db.query(Auction)
    if status != "all":
        query = query.filter(Auction.status == status)
    else:
        query = query.filter(Auction.status.in_(["active", "upcoming", "ended"]))

    auctions = query.order_by(Auction.created_at.desc()).all()

    highest_rows = _highest_bid_rows(db, [auction.id for auction in auctions])
    seller_rows = _seller_meta_rows(db, [auction.seller_id for auction in auctions])
    return [
        _serialize_auction(auction, highest_rows.get(auction.id), seller_rows.get(auction.seller_id))
        for auction in auctions
    ]


@router.get("/auctions/{auction_id}")
def get_auction_by_id(auction_id: UUID, db: Session = Depends(get_db)):
    _refresh_auction_statuses(db)
    auction = db.query(Auction).filter(Auction.id == auction_id).first()
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found.")

    highest = (
        db.query(func.max(AuctionBid.bid_amount))
        .filter(AuctionBid.auction_id == auction_id)
        .scalar()
    )
    seller_rows = _seller_meta_rows(db, [auction.seller_id])
    return _serialize_auction(auction, highest, seller_rows.get(auction.seller_id))


@router.get("/auctions/{auction_id}/bids")
def get_auction_bids(auction_id: UUID, db: Session = Depends(get_db)):
    bids = (
        db.query(AuctionBid, User)
        .join(User, AuctionBid.bidder_id == User.id)
        .filter(AuctionBid.auction_id == auction_id)
        .order_by(AuctionBid.bid_amount.desc(), AuctionBid.created_at.asc())
        .all()
    )

    if not bids:
        return []

    top_amount = bids[0][0].bid_amount

    result = []
    for bid, user in bids:
        result.append(_serialize_bid(bid, user.name, bid.bid_amount == top_amount))
    return result


@router.get("/auctions/bidder/dashboard/{user_id}")
def get_bidder_dashboard(user_id: UUID, db: Session = Depends(get_db)):
    """Stats for the bidder dashboard."""
    _refresh_auction_statuses(db)

    active_count = db.query(func.count(Auction.id)).filter(Auction.status == "active").scalar() or 0
    upcoming_count = db.query(func.count(Auction.id)).filter(Auction.status == "upcoming").scalar() or 0

    my_bids = (
        db.query(AuctionBid.auction_id, func.max(AuctionBid.bid_amount).label("my_max"))
        .filter(AuctionBid.bidder_id == user_id)
        .group_by(AuctionBid.auction_id)
        .subquery()
    )
    global_max = (
        db.query(AuctionBid.auction_id, func.max(AuctionBid.bid_amount).label("global_max"))
        .group_by(AuctionBid.auction_id)
        .subquery()
    )

    winning_count = (
        db.query(func.count())
        .select_from(my_bids)
        .join(global_max, my_bids.c.auction_id == global_max.c.auction_id)
        .filter(my_bids.c.my_max == global_max.c.global_max)
        .scalar()
    ) or 0

    total_bids = db.query(func.count(AuctionBid.id)).filter(AuctionBid.bidder_id == user_id).scalar() or 0
    auctions_won = db.query(func.count(Auction.id)).filter(Auction.winner_id == user_id).scalar() or 0

    return {
        "active_auctions": int(active_count),
        "upcoming_auctions": int(upcoming_count),
        "my_total_bids": int(total_bids),
        "my_winning_bids": int(winning_count),
        "auctions_won": int(auctions_won),
    }


# ── WebSocket real-time bidding ───────────────────────────────────────────────

@router.websocket("/auctions/{auction_id}/ws")
async def auction_websocket(auction_id: str, ws: WebSocket, db: Session = Depends(get_db)):
    await ws_manager.connect(auction_id, ws)
    try:
        # Send current state on connect
        try:
            auction_uuid = UUID(auction_id)
        except ValueError:
            await ws.close(code=4000)
            return

        auction = db.query(Auction).filter(Auction.id == auction_uuid).first()
        if not auction:
            await ws.close(code=4004)
            return

        highest = (
            db.query(func.max(AuctionBid.bid_amount))
            .filter(AuctionBid.auction_id == auction_uuid)
            .scalar()
        )
        bid_count = (
            db.query(func.count(AuctionBid.id))
            .filter(AuctionBid.auction_id == auction_uuid)
            .scalar()
        ) or 0

        await ws.send_json({
            "type": "init",
            "auction_id": auction_id,
            "status": auction.status,
            "highest_bid": float(highest) if highest else None,
            "base_price": float(auction.base_price),
            "bid_count": int(bid_count),
        })

        while True:
            data = await ws.receive_json()
            if data.get("type") == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        ws_manager.disconnect(auction_id, ws)
    except Exception:
        ws_manager.disconnect(auction_id, ws)
