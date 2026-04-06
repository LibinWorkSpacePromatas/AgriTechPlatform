from __future__ import annotations

import math
from datetime import date, datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.schemas.rental import CreateBookingRequest, CreateListingRequest
from app.services import rental_queries as queries


class RentalServiceError(Exception):
    def __init__(self, detail: str, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def get_dashboard(db: Session, user_id: UUID) -> dict:
    _ensure_user_exists(db, user_id)
    row = db.execute(queries.DASHBOARD_SQL, {"user_id": str(user_id)}).mappings().first()
    if not row:
        return {
            "total_listings": 0,
            "active_listings": 0,
            "inactive_listings": 0,
            "bookings_given": 0,
            "bookings_taken": 0,
            "pending_requests": 0,
            "upcoming_bookings": 0,
            "revenue": 0,
        }
    return dict(row)


def _ensure_user_exists(db: Session, user_id: UUID) -> None:
    exists = db.execute(queries.CHECK_USER_EXISTS_SQL, {"user_id": str(user_id)}).first()
    if not exists:
        raise RentalServiceError("User not found", status_code=404)


def _ensure_block_owned_by_user(db: Session, block_id: UUID, user_id: UUID) -> None:
    exists = db.execute(
        queries.CHECK_BLOCK_OWNERSHIP_SQL,
        {"block_id": str(block_id), "user_id": str(user_id)},
    ).first()
    if not exists:
        raise RentalServiceError("block_id does not belong to this user", status_code=400)


def _get_block_centroid(db: Session, block_id: UUID) -> tuple[float | None, float | None]:
    row = db.execute(queries.BLOCK_CENTROID_SQL, {"block_id": str(block_id)}).mappings().first()
    if not row:
        raise RentalServiceError("Block not found", status_code=404)

    latitude = row.get("latitude")
    longitude = row.get("longitude")
    return (
        float(latitude) if latitude is not None else None,
        float(longitude) if longitude is not None else None,
    )


def calculate_price(start: datetime, end: datetime, price: float, price_type: str) -> float:
    duration_hours = (end - start).total_seconds() / 3600
    if price_type == "hourly":
        return round(duration_hours * price, 2)

    days = math.ceil(duration_hours / 24)
    return round(days * price, 2)


def _get_listing_or_404(db: Session, listing_id: UUID) -> dict:
    row = db.execute(queries.SELECT_LISTING_SQL, {"listing_id": str(listing_id)}).mappings().first()
    if not row:
        raise RentalServiceError("Listing not found", status_code=404)
    return dict(row)


def create_listing(db: Session, user_id: UUID, payload: CreateListingRequest) -> dict:
    _ensure_user_exists(db, user_id)
    latitude = payload.latitude
    longitude = payload.longitude

    if payload.block_id is not None:
        _ensure_block_owned_by_user(db, payload.block_id, user_id)
        block_lat, block_lon = _get_block_centroid(db, payload.block_id)
        latitude = block_lat
        longitude = block_lon

    created = db.execute(
        queries.INSERT_LISTING_SQL,
        {
            "owner_id": str(user_id),
            "block_id": str(payload.block_id) if payload.block_id is not None else None,
            "equipment_name": payload.equipment_name.strip(),
            "description": payload.description,
            "price": float(payload.price),
            "price_type": payload.price_type,
            "latitude": latitude,
            "longitude": longitude,
        },
    ).mappings().first()
    db.commit()
    return dict(created)


def get_listings(
    db: Session,
    lat: float | None = None,
    lon: float | None = None,
    radius_km: float | None = None,
) -> list[dict]:
    if radius_km is None:
        rows = db.execute(queries.LIST_LISTINGS_SQL).mappings().all()
        return [dict(row) for row in rows]

    if radius_km <= 0:
        raise RentalServiceError("radius must be greater than 0", status_code=400)

    rows = db.execute(
        queries.LIST_LISTINGS_WITH_RADIUS_SQL,
        {
            "lat": lat,
            "lon": lon,
            "radius_in_meters": radius_km * 1000.0,
        },
    ).mappings().all()
    return [dict(row) for row in rows]


def toggle_listing(db: Session, user_id: UUID, listing_id: UUID) -> dict:
    toggled = db.execute(
        queries.TOGGLE_LISTING_SQL,
        {"listing_id": str(listing_id), "owner_id": str(user_id)},
    ).mappings().first()
    if not toggled:
        raise RentalServiceError("Listing not found or not owned by user", status_code=404)

    db.commit()
    return dict(toggled)


def check_availability(
    db: Session,
    listing_id: UUID,
    start: datetime,
    end: datetime,
    *,
    exclude_booking_id: UUID | None = None,
) -> bool:
    result = check_availability_with_reason(
        db,
        listing_id,
        start,
        end,
        exclude_booking_id=exclude_booking_id,
    )
    return bool(result["available"])


def check_availability_with_reason(
    db: Session,
    listing_id: UUID,
    start: datetime,
    end: datetime,
    *,
    exclude_booking_id: UUID | None = None,
) -> dict:
    if start >= end:
        raise RentalServiceError("start_datetime must be earlier than end_datetime", status_code=400)

    listing = _get_listing_or_404(db, listing_id)
    if not listing.get("is_active", False):
        return {"available": False, "reason": "Listing is inactive"}

    detail = db.execute(
        queries.BOOKING_CONFLICT_DETAIL_SQL,
        {
            "listing_id": str(listing_id),
            "start_datetime": start,
            "end_datetime": end,
            "exclude_booking_id": str(exclude_booking_id) if exclude_booking_id else None,
        },
    ).mappings().first()
    reason = detail["conflict_reason"] if detail else None
    if reason == "overlap":
        return {"available": False, "reason": "Overlapping booking"}
    if reason == "buffer":
        return {"available": False, "reason": "Buffer period conflict"}
    return {"available": True, "reason": None}


def create_booking(db: Session, user_id: UUID, payload: CreateBookingRequest) -> dict:
    _ensure_user_exists(db, user_id)
    listing = _get_listing_or_404(db, payload.listing_id)
    if not listing.get("is_active", False):
        raise RentalServiceError("Listing is inactive", status_code=400)

    owner_id = listing["owner_id"]
    if str(owner_id) == str(user_id):
        raise RentalServiceError("Owner cannot book own listing", status_code=400)

    is_available = check_availability(db, payload.listing_id, payload.start_datetime, payload.end_datetime)
    if not is_available:
        raise RentalServiceError("Not available", status_code=409)

    total_price = calculate_price(
        payload.start_datetime,
        payload.end_datetime,
        float(listing["price"]),
        str(listing["price_type"]),
    )
    booking = db.execute(
        queries.INSERT_BOOKING_SQL,
        {
            "listing_id": str(payload.listing_id),
            "renter_id": str(user_id),
            "owner_id": str(owner_id),
            "start_datetime": payload.start_datetime,
            "end_datetime": payload.end_datetime,
            "total_price": total_price,
        },
    ).mappings().first()
    db.commit()
    return dict(booking)


def _update_booking_status(db: Session, booking_id: UUID, owner_id: UUID, status: str) -> dict:
    booking = db.execute(queries.SELECT_BOOKING_SQL, {"booking_id": str(booking_id)}).mappings().first()
    if not booking:
        raise RentalServiceError("Booking not found", status_code=404)

    if str(booking["owner_id"]) != str(owner_id):
        raise RentalServiceError("Only listing owner can update booking status", status_code=403)

    if booking["status"] != "pending":
        raise RentalServiceError("Only pending bookings can be updated", status_code=400)

    if status == "approved":
        is_available = check_availability(
            db,
            booking["listing_id"],
            booking["start_datetime"],
            booking["end_datetime"],
            exclude_booking_id=booking_id,
        )
        if not is_available:
            raise RentalServiceError("Cannot approve booking because slot is no longer available", status_code=409)

    updated = db.execute(
        queries.UPDATE_BOOKING_STATUS_SQL,
        {"booking_id": str(booking_id), "status": status},
    ).mappings().first()
    db.commit()
    return dict(updated)


def approve_booking(db: Session, booking_id: UUID, owner_id: UUID) -> dict:
    return _update_booking_status(db, booking_id, owner_id, "approved")


def reject_booking(db: Session, booking_id: UUID, owner_id: UUID) -> dict:
    return _update_booking_status(db, booking_id, owner_id, "rejected")


def get_my_bookings(db: Session, user_id: UUID) -> list[dict]:
    _ensure_user_exists(db, user_id)
    rows = db.execute(queries.MY_BOOKINGS_SQL, {"user_id": str(user_id)}).mappings().all()
    return [dict(row) for row in rows]


def get_my_listings(db: Session, user_id: UUID) -> list[dict]:
    _ensure_user_exists(db, user_id)
    rows = db.execute(queries.MY_LISTINGS_SQL, {"user_id": str(user_id)}).mappings().all()
    return [dict(row) for row in rows]


def get_owner_requests(db: Session, user_id: UUID) -> list[dict]:
    _ensure_user_exists(db, user_id)
    rows = db.execute(queries.MY_REQUESTS_SQL, {"user_id": str(user_id)}).mappings().all()
    return [dict(row) for row in rows]


def pay_booking(db: Session, booking_id: UUID, renter_id: UUID) -> dict:
    _ensure_user_exists(db, renter_id)
    booking = db.execute(queries.SELECT_BOOKING_SQL, {"booking_id": str(booking_id)}).mappings().first()
    if not booking:
        raise RentalServiceError("Booking not found", status_code=404)

    if str(booking["renter_id"]) != str(renter_id):
        raise RentalServiceError("Only renter can pay for this booking", status_code=403)

    if booking["status"] != "approved":
        raise RentalServiceError("Only approved bookings can be paid", status_code=400)

    db.execute(
        queries.INSERT_PAYMENT_SQL,
        {
            "booking_id": str(booking_id),
            "amount": float(booking["total_price"] or 0.0),
        },
    )
    updated = db.execute(
        queries.UPDATE_BOOKING_STATUS_SQL,
        {"booking_id": str(booking_id), "status": "completed"},
    ).mappings().first()
    db.commit()
    return dict(updated)


def get_listing_calendar(db: Session, listing_id: UUID, day: date) -> dict:
    _get_listing_or_404(db, listing_id)
    day_start = datetime.combine(day, datetime.min.time())
    rows = db.execute(
        queries.LISTING_CALENDAR_SLOTS_SQL,
        {
            "listing_id": str(listing_id),
            "day_start": day_start,
        },
    ).mappings().all()
    slots = [
        {
            "start_datetime": row["slot_start"],
            "end_datetime": row["slot_end"],
            "status": row["status"],
        }
        for row in rows
    ]
    return {
        "listing_id": str(listing_id),
        "date": day.isoformat(),
        "slots": slots,
    }


def suggest_equipment(data: dict) -> list[str]:
    ndwi = data.get("ndwi")
    rain_next_48h = data.get("rain_next_48h")

    if isinstance(ndwi, (int, float)) and ndwi < -0.3:
        return ["irrigation_pump"]

    if isinstance(rain_next_48h, (int, float)) and rain_next_48h > 10:
        return ["harvester_delay"]

    return []
