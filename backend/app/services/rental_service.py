from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from datetime import time as dt_time
from uuid import UUID

from sqlalchemy.orm import Session

from app.schemas.rental import CreateBookingRequest, CreateListingRequest
from app.services import rental_queries as queries
from app.services.cloudinary_service import CloudinaryUploadError, upload_rental_listing_image


class RentalServiceError(Exception):
    def __init__(self, detail: str, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


VALID_WEEKDAYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}


def _normalize_availability_settings(raw_settings: dict | None) -> dict | None:
    if not raw_settings:
        return None

    available_all_days = bool(raw_settings.get("available_all_days", True))
    available_days = [
        str(day).strip().lower()
        for day in (raw_settings.get("available_days") or [])
        if str(day).strip().lower() in VALID_WEEKDAYS
    ]
    unavailable_dates = sorted({
        str(value).strip()
        for value in (raw_settings.get("unavailable_dates") or [])
        if str(value).strip()
    })
    working_hours_start = str(raw_settings.get("working_hours_start") or "").strip() or None
    working_hours_end = str(raw_settings.get("working_hours_end") or "").strip() or None
    minimum_booking_hours = raw_settings.get("minimum_booking_hours")
    advance_notice_hours = raw_settings.get("advance_notice_hours")

    settings = {
        "available_all_days": available_all_days,
        "available_days": available_days if not available_all_days else [],
        "working_hours_start": working_hours_start,
        "working_hours_end": working_hours_end,
        "unavailable_dates": unavailable_dates,
        "minimum_booking_hours": int(minimum_booking_hours) if minimum_booking_hours is not None else None,
        "advance_notice_hours": int(advance_notice_hours) if advance_notice_hours is not None else None,
    }
    return settings


def _parse_clock(value: str | None) -> dt_time | None:
    if not value:
        return None
    hour, minute = value.split(":", 1)
    return dt_time(hour=int(hour), minute=int(minute))


def _booking_dates(start: datetime, end: datetime) -> list[date]:
    current = start.date()
    final = (end - timedelta(seconds=1)).date()
    dates: list[date] = []
    while current <= final:
        dates.append(current)
        current += timedelta(days=1)
    return dates


def _validate_listing_rules(listing: dict, start: datetime, end: datetime) -> dict | None:
    settings = listing.get("availability_settings") or {}
    if not settings:
        return None

    minimum_booking_hours = settings.get("minimum_booking_hours")
    if minimum_booking_hours is not None:
        duration_hours = (end - start).total_seconds() / 3600
        if duration_hours < int(minimum_booking_hours):
            return {"available": False, "reason": f"Minimum booking is {minimum_booking_hours} hour(s)"}

    advance_notice_hours = settings.get("advance_notice_hours")
    if advance_notice_hours is not None:
        now_reference = datetime.now(start.tzinfo) if start.tzinfo else datetime.utcnow()
        min_start = now_reference + timedelta(hours=int(advance_notice_hours))
        if start < min_start:
            return {"available": False, "reason": f"Requires {advance_notice_hours} hour(s) advance notice"}

    if not settings.get("available_all_days", True):
        allowed = set(settings.get("available_days") or [])
        if allowed:
            for booking_date in _booking_dates(start, end):
                weekday = booking_date.strftime("%a").lower()[:3]
                if weekday not in allowed:
                    return {"available": False, "reason": "Tool is not available on the selected day(s)"}

    blocked_dates = set(settings.get("unavailable_dates") or [])
    if blocked_dates:
        for booking_date in _booking_dates(start, end):
            if booking_date.isoformat() in blocked_dates:
                return {"available": False, "reason": "Tool is unavailable on one or more selected dates"}

    working_start = _parse_clock(settings.get("working_hours_start"))
    working_end = _parse_clock(settings.get("working_hours_end"))
    if working_start and working_end and listing.get("price_type") == "hourly":
        if start.time() < working_start or end.time() > working_end:
            return {
                "available": False,
                "reason": f"Bookings must stay within {working_start.strftime('%H:%M')} - {working_end.strftime('%H:%M')}",
            }

    return None


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

    # Daily listings bill by converted hourly rate to support partial-day bookings.
    hourly_rate = price / 24
    return round(duration_hours * hourly_rate, 2)


def _get_listing_or_404(db: Session, listing_id: UUID) -> dict:
    row = db.execute(queries.SELECT_LISTING_SQL, {"listing_id": str(listing_id)}).mappings().first()
    if not row:
        raise RentalServiceError("Listing not found", status_code=404)
    return dict(row)


def create_listing(
    db: Session,
    user_id: UUID,
    payload: CreateListingRequest,
    *,
    image_url: str,
    image_public_id: str,
) -> dict:
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
            "specifications": json.dumps(payload.specifications) if payload.specifications else None,
            "availability_settings": json.dumps(_normalize_availability_settings(payload.availability_settings.model_dump())) if payload.availability_settings else None,
            "price": float(payload.price),
            "price_type": payload.price_type,
            "quantity_total": int(payload.quantity_total),
            "image_url": image_url,
            "image_public_id": image_public_id,
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
    exclude_owner_id: UUID | None = None,
) -> list[dict]:
    if radius_km is None:
        if lat is not None and lon is not None:
            rows = db.execute(
                queries.LIST_LISTINGS_WITH_DISTANCE_SQL,
                {
                    "lat": lat,
                    "lon": lon,
                    "exclude_owner_id": str(exclude_owner_id) if exclude_owner_id else None,
                },
            ).mappings().all()
            return [dict(row) for row in rows]

        rows = db.execute(
            queries.LIST_LISTINGS_SQL,
            {"exclude_owner_id": str(exclude_owner_id) if exclude_owner_id else None},
        ).mappings().all()
        return [dict(row) for row in rows]

    if radius_km <= 0:
        raise RentalServiceError("radius must be greater than 0", status_code=400)

    rows = db.execute(
        queries.LIST_LISTINGS_WITH_RADIUS_SQL,
        {
            "lat": lat,
            "lon": lon,
            "radius_in_meters": radius_km * 1000.0,
            "exclude_owner_id": str(exclude_owner_id) if exclude_owner_id else None,
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


def update_listing(
    db: Session,
    user_id: UUID,
    listing_id: UUID,
    payload: CreateListingRequest,
    *,
    image_url: str | None = None,
    image_public_id: str | None = None,
) -> dict:
    _ensure_user_exists(db, user_id)
    existing = _get_listing_or_404(db, listing_id)
    if str(existing["owner_id"]) != str(user_id):
        raise RentalServiceError("Listing not found or not owned by user", status_code=404)

    block_id = payload.block_id if payload.block_id is not None else existing.get("block_id")
    latitude = payload.latitude if payload.latitude is not None else existing.get("latitude")
    longitude = payload.longitude if payload.longitude is not None else existing.get("longitude")
    availability_settings = (
        json.dumps(_normalize_availability_settings(payload.availability_settings.model_dump()))
        if payload.availability_settings is not None
        else json.dumps(existing.get("availability_settings")) if existing.get("availability_settings") is not None else None
    )

    if block_id is not None:
        _ensure_block_owned_by_user(db, UUID(str(block_id)), user_id)
        block_lat, block_lon = _get_block_centroid(db, UUID(str(block_id)))
        latitude = block_lat
        longitude = block_lon

    updated = db.execute(
        queries.UPDATE_LISTING_SQL,
        {
            "listing_id": str(listing_id),
            "owner_id": str(user_id),
            "block_id": str(block_id) if block_id is not None else None,
            "equipment_name": payload.equipment_name.strip(),
            "description": payload.description,
            "specifications": json.dumps(payload.specifications) if payload.specifications else None,
            "availability_settings": availability_settings,
            "price": float(payload.price),
            "price_type": payload.price_type,
            "quantity_total": int(payload.quantity_total),
            "image_url": image_url if image_url is not None else existing.get("image_url"),
            "image_public_id": image_public_id if image_public_id is not None else existing.get("image_public_id"),
            "latitude": latitude,
            "longitude": longitude,
        },
    ).mappings().first()
    if not updated:
        raise RentalServiceError("Listing not found or not owned by user", status_code=404)

    db.commit()
    return dict(updated)


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
        quantity_requested=1,
        exclude_booking_id=exclude_booking_id,
    )
    return bool(result["available"])


def check_availability_with_reason(
    db: Session,
    listing_id: UUID,
    start: datetime,
    end: datetime,
    *,
    quantity_requested: int = 1,
    exclude_booking_id: UUID | None = None,
) -> dict:
    if start >= end:
        raise RentalServiceError("start_datetime must be earlier than end_datetime", status_code=400)
    now_reference = datetime.now(start.tzinfo) if start.tzinfo else datetime.utcnow()
    min_start = now_reference + timedelta(minutes=30)
    if start < min_start:
        raise RentalServiceError("start_datetime must be at least 30 minutes in the future", status_code=400)

    listing = _get_listing_or_404(db, listing_id)
    if not listing.get("is_active", False):
        return {"available": False, "reason": "Listing is inactive", "available_quantity": 0}

    if quantity_requested <= 0:
        raise RentalServiceError("quantity_requested must be at least 1", status_code=400)

    quantity_total = int(listing.get("quantity_total") or 1)
    if quantity_requested > quantity_total:
        return {
            "available": False,
            "reason": f"Only {quantity_total} unit(s) available",
            "available_quantity": quantity_total,
        }

    rules_result = _validate_listing_rules(listing, start, end)
    if rules_result:
        rules_result["available_quantity"] = quantity_total
        return rules_result

    reserved_overlap = db.execute(
        queries.BOOKING_RESERVED_UNITS_SQL,
        {
            "listing_id": str(listing_id),
            "start_datetime": start,
            "end_datetime": end,
            "exclude_booking_id": str(exclude_booking_id) if exclude_booking_id else None,
        },
    ).scalar() or 0
    available_overlap = max(0, quantity_total - int(reserved_overlap))
    if quantity_requested > available_overlap:
        return {
            "available": False,
            "reason": "Overlapping booking",
            "available_quantity": available_overlap,
        }

    reserved_buffer = db.execute(
        queries.BOOKING_BUFFER_RESERVED_UNITS_SQL,
        {
            "listing_id": str(listing_id),
            "start_datetime": start,
            "end_datetime": end,
            "exclude_booking_id": str(exclude_booking_id) if exclude_booking_id else None,
        },
    ).scalar() or 0
    available_buffer = max(0, quantity_total - int(reserved_buffer))
    if quantity_requested > available_buffer:
        return {
            "available": False,
            "reason": "Buffer period conflict",
            "available_quantity": available_buffer,
        }

    return {
        "available": True,
        "reason": None,
        "available_quantity": min(available_overlap, available_buffer),
    }


def create_booking(db: Session, user_id: UUID, payload: CreateBookingRequest) -> dict:
    _ensure_user_exists(db, user_id)
    listing = _get_listing_or_404(db, payload.listing_id)
    if not listing.get("is_active", False):
        raise RentalServiceError("Listing is inactive", status_code=400)

    owner_id = listing["owner_id"]
    if str(owner_id) == str(user_id):
        raise RentalServiceError("Owner cannot book own listing", status_code=400)

    db.execute(queries.LOCK_LISTING_FOR_BOOKING_SQL, {"listing_id": str(payload.listing_id)})

    availability = check_availability_with_reason(
        db,
        payload.listing_id,
        payload.start_datetime,
        payload.end_datetime,
        quantity_requested=payload.quantity_requested,
    )
    if not availability["available"]:
        raise RentalServiceError(availability["reason"] or "Not available", status_code=409)

    total_price = calculate_price(
        payload.start_datetime,
        payload.end_datetime,
        float(listing["price"]),
        str(listing["price_type"]),
    )
    total_price = round(total_price * int(payload.quantity_requested), 2)
    booking = db.execute(
        queries.INSERT_BOOKING_SQL,
        {
            "listing_id": str(payload.listing_id),
            "renter_id": str(user_id),
            "owner_id": str(owner_id),
            "start_datetime": payload.start_datetime,
            "end_datetime": payload.end_datetime,
            "quantity_requested": int(payload.quantity_requested),
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
        db.execute(queries.LOCK_LISTING_FOR_BOOKING_SQL, {"listing_id": str(booking["listing_id"])})
        availability = check_availability_with_reason(
            db,
            booking["listing_id"],
            booking["start_datetime"],
            booking["end_datetime"],
            quantity_requested=int(booking.get("quantity_requested") or 1),
            exclude_booking_id=booking_id,
        )
        if not availability["available"]:
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
    day_end = day_start + timedelta(days=1)
    day_start_minus_buffer = day_start - timedelta(hours=1)

    rows = db.execute(
        queries.LISTING_CALENDAR_BOOKINGS_SQL,
        {
            "listing_id": str(listing_id),
            "day_start_minus_buffer": day_start_minus_buffer,
            "day_end": day_end,
        },
    ).mappings().all()

    def to_naive(dt: datetime) -> datetime:
        return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt

    bookings = []
    for row in rows:
        start_dt = row["start_datetime"]
        end_dt = row["end_datetime"]
        if start_dt is None or end_dt is None:
            continue
        bookings.append((to_naive(start_dt), to_naive(end_dt)))

    def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
        return a_start < b_end and a_end > b_start

    slots = []
    for hour in range(24):
        slot_start = day_start + timedelta(hours=hour)
        slot_end = slot_start + timedelta(hours=1)
        status = "available"

        for booking_start, booking_end in bookings:
            if overlaps(slot_start, slot_end, booking_start, booking_end):
                status = "booked"
                break

        if status == "available":
            for _, booking_end in bookings:
                buffer_end = booking_end + timedelta(hours=1)
                if overlaps(slot_start, slot_end, booking_end, buffer_end):
                    status = "buffer"
                    break

        slots.append(
            {
                "start_datetime": slot_start,
                "end_datetime": slot_end,
                "status": status,
            }
        )

    return {
        "listing_id": str(listing_id),
        "date": day.isoformat(),
        "slots": slots,
    }


def create_listing_with_image(
    db: Session,
    user_id: UUID,
    payload: CreateListingRequest,
    *,
    image_bytes: bytes,
    image_filename: str,
    image_content_type: str | None = None,
) -> dict:
    try:
        uploaded = upload_rental_listing_image(
            file_bytes=image_bytes,
            filename=image_filename,
            content_type=image_content_type,
        )
    except CloudinaryUploadError as exc:
        raise RentalServiceError(str(exc), status_code=502) from exc

    return create_listing(
        db,
        user_id,
        payload,
        image_url=str(uploaded["image_url"]),
        image_public_id=str(uploaded["image_public_id"]),
    )


def update_listing_with_optional_image(
    db: Session,
    user_id: UUID,
    listing_id: UUID,
    payload: CreateListingRequest,
    *,
    image_bytes: bytes | None = None,
    image_filename: str | None = None,
    image_content_type: str | None = None,
) -> dict:
    image_url: str | None = None
    image_public_id: str | None = None

    if image_bytes is not None:
        try:
            uploaded = upload_rental_listing_image(
                file_bytes=image_bytes,
                filename=image_filename or "listing-image",
                content_type=image_content_type,
            )
        except CloudinaryUploadError as exc:
            raise RentalServiceError(str(exc), status_code=502) from exc

        image_url = str(uploaded["image_url"])
        image_public_id = str(uploaded["image_public_id"])

    return update_listing(
        db,
        user_id,
        listing_id,
        payload,
        image_url=image_url,
        image_public_id=image_public_id,
    )


def suggest_equipment(data: dict) -> list[str]:
    ndwi = data.get("ndwi")
    rain_next_48h = data.get("rain_next_48h")

    if isinstance(ndwi, (int, float)) and ndwi < -0.3:
        return ["irrigation_pump"]

    if isinstance(rain_next_48h, (int, float)) and rain_next_48h > 10:
        return ["harvester_delay"]

    return []
