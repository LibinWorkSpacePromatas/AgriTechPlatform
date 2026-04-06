from __future__ import annotations

import json
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.routes import get_db
from app.schemas.rental import (
    BookingActionResponse,
    BookingCalendarResponse,
    BookingListItem,
    BookingPaymentResponse,
    BookingResponse,
    CheckAvailabilityRequest,
    CheckAvailabilityResponse,
    CreateBookingRequest,
    CreateListingRequest,
    ListingListItem,
    RentalRecommendationResponse,
    ListingResponse,
    ToggleListingResponse,
)
from app.services.block_lookup import resolve_block
from app.services import rental_service
from app.services import rental_recommendation_service
from app.services.rental_service import RentalServiceError


router = APIRouter(tags=["rental"])


def _parse_specifications(specifications: str | None) -> dict[str, str] | None:
    if not specifications:
        return None

    try:
        parsed = json.loads(specifications)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid specifications payload.") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Specifications must be a key/value object.")

    normalized: dict[str, str] = {}
    for key, value in parsed.items():
        cleaned_key = str(key).strip()
        cleaned_value = str(value).strip()
        if cleaned_key and cleaned_value:
            normalized[cleaned_key] = cleaned_value
    return normalized or None


@router.get("/dashboard")
def dashboard(
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return rental_service.get_dashboard(db, user_id)
    except RentalServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching rental dashboard: {exc}") from exc


@router.post("/listings", response_model=ListingResponse)
def create_listing(
    equipment_name: str = Form(...),
    description: str | None = Form(default=None),
    specifications: str | None = Form(default=None),
    price: float = Form(...),
    price_type: str = Form(...),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
    block_id: UUID | None = Form(default=None),
    image: UploadFile = File(...),
    user_id: UUID = Query(..., description="Owner user ID"),
    db: Session = Depends(get_db),
):
    try:
        content_type = (image.content_type or "").lower()
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Listing image must be an image file.")

        image_bytes = image.file.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Listing image is empty.")

        payload = CreateListingRequest(
            equipment_name=equipment_name,
            description=description,
            specifications=_parse_specifications(specifications),
            price=price,
            price_type=price_type,
            latitude=latitude,
            longitude=longitude,
            block_id=block_id,
        )
        return rental_service.create_listing_with_image(
            db,
            user_id,
            payload,
            image_bytes=image_bytes,
            image_filename=image.filename or "listing-image",
            image_content_type=image.content_type,
        )
    except RentalServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while creating listing: {exc}") from exc


@router.get("/listings", response_model=list[ListingListItem])
def get_listings(
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    radius: float | None = Query(default=None, description="Radius in kilometers"),
    db: Session = Depends(get_db),
):
    try:
        return rental_service.get_listings(db, lat=lat, lon=lon, radius_km=radius)
    except RentalServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching listings: {exc}") from exc


@router.patch("/listings/{listing_id}/toggle", response_model=ToggleListingResponse)
def toggle_listing(
    listing_id: UUID,
    user_id: UUID = Query(..., description="Owner user ID"),
    db: Session = Depends(get_db),
):
    try:
        listing = rental_service.toggle_listing(db, user_id, listing_id)
        return {"listing": listing}
    except RentalServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while toggling listing: {exc}") from exc


@router.patch("/listings/{listing_id}", response_model=ListingResponse)
def update_listing(
    listing_id: UUID,
    equipment_name: str = Form(...),
    description: str | None = Form(default=None),
    specifications: str | None = Form(default=None),
    price: float = Form(...),
    price_type: str = Form(...),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
    block_id: UUID | None = Form(default=None),
    image: UploadFile | None = File(default=None),
    user_id: UUID = Query(..., description="Owner user ID"),
    db: Session = Depends(get_db),
):
    try:
        image_bytes: bytes | None = None
        if image is not None:
            content_type = (image.content_type or "").lower()
            if not content_type.startswith("image/"):
                raise HTTPException(status_code=400, detail="Listing image must be an image file.")
            image_bytes = image.file.read()
            if not image_bytes:
                raise HTTPException(status_code=400, detail="Listing image is empty.")

        payload = CreateListingRequest(
            equipment_name=equipment_name,
            description=description,
            specifications=_parse_specifications(specifications),
            price=price,
            price_type=price_type,
            latitude=latitude,
            longitude=longitude,
            block_id=block_id,
        )
        return rental_service.update_listing_with_optional_image(
            db,
            user_id,
            listing_id,
            payload,
            image_bytes=image_bytes,
            image_filename=image.filename if image is not None else None,
            image_content_type=image.content_type if image is not None else None,
        )
    except RentalServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while updating listing: {exc}") from exc


@router.post("/check-availability", response_model=CheckAvailabilityResponse)
def check_availability(payload: CheckAvailabilityRequest, db: Session = Depends(get_db)):
    try:
        availability = rental_service.check_availability_with_reason(
            db,
            payload.listing_id,
            payload.start_datetime,
            payload.end_datetime,
        )
        return {
            "listing_id": payload.listing_id,
            "available": availability["available"],
            "conflict": not availability["available"],
            "reason": availability["reason"],
        }
    except RentalServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while checking availability: {exc}") from exc


@router.post("/book", response_model=BookingActionResponse)
def create_booking(
    payload: CreateBookingRequest,
    user_id: UUID = Query(..., description="Renter user ID"),
    db: Session = Depends(get_db),
):
    try:
        booking = rental_service.create_booking(db, user_id, payload)
        return {"booking": booking, "availability": True}
    except RentalServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while creating booking: {exc}") from exc


@router.post("/bookings/{booking_id}/approve", response_model=BookingActionResponse)
def approve_booking(
    booking_id: UUID,
    user_id: UUID = Query(..., description="Owner user ID"),
    db: Session = Depends(get_db),
):
    try:
        booking = rental_service.approve_booking(db, booking_id, user_id)
        return {"booking": booking, "availability": True}
    except RentalServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while approving booking: {exc}") from exc


@router.post("/bookings/{booking_id}/reject", response_model=BookingResponse)
def reject_booking(
    booking_id: UUID,
    user_id: UUID = Query(..., description="Owner user ID"),
    db: Session = Depends(get_db),
):
    try:
        return rental_service.reject_booking(db, booking_id, user_id)
    except RentalServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while rejecting booking: {exc}") from exc


@router.get("/my-bookings", response_model=list[BookingListItem])
def my_bookings(
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return rental_service.get_my_bookings(db, user_id)
    except RentalServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching my bookings: {exc}") from exc


@router.get("/my-listings", response_model=list[ListingListItem])
def my_listings(
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return rental_service.get_my_listings(db, user_id)
    except RentalServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching my listings: {exc}") from exc


@router.get("/requests", response_model=list[BookingListItem])
def owner_requests(
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return rental_service.get_owner_requests(db, user_id)
    except RentalServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching owner requests: {exc}") from exc


@router.post("/pay/{booking_id}", response_model=BookingPaymentResponse)
def pay_booking(
    booking_id: UUID,
    user_id: UUID = Query(..., description="Renter user ID"),
    db: Session = Depends(get_db),
):
    try:
        booking = rental_service.pay_booking(db, booking_id, user_id)
        return {"booking": booking, "payment_status": "paid"}
    except RentalServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while paying booking: {exc}") from exc


@router.get("/listings/{listing_id}/calendar", response_model=BookingCalendarResponse)
def listing_calendar(
    listing_id: UUID,
    date_value: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
):
    try:
        return rental_service.get_listing_calendar(db, listing_id, date_value)
    except RentalServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching listing calendar: {exc}") from exc


@router.get("/recommendations/{block_id}", response_model=RentalRecommendationResponse)
def get_recommendations(
    block_id: str,
    db: Session = Depends(get_db),
):
    try:
        block = resolve_block(db, block_id)
        return rental_recommendation_service.get_block_recommendations(db, block.id)
    except RentalServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching rental recommendations: {exc}") from exc
