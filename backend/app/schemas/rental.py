from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CreateListingRequest(BaseModel):
    equipment_name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    price: float = Field(gt=0)
    price_type: str
    latitude: float | None = None
    longitude: float | None = None
    block_id: UUID | None = None

    @model_validator(mode="after")
    def validate_price_type(self) -> "CreateListingRequest":
        if self.price_type not in {"hourly", "daily"}:
            raise ValueError("price_type must be 'hourly' or 'daily'")
        return self


class ListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    block_id: UUID | None
    equipment_name: str
    description: str | None
    price: float
    price_type: str
    latitude: float | None
    longitude: float | None
    is_active: bool
    created_at: datetime
    distance_m: float | None = None


class ToggleListingResponse(BaseModel):
    listing: ListingResponse


class CheckAvailabilityRequest(BaseModel):
    listing_id: UUID
    start_datetime: datetime
    end_datetime: datetime

    @model_validator(mode="after")
    def validate_time_range(self) -> "CheckAvailabilityRequest":
        if self.start_datetime >= self.end_datetime:
            raise ValueError("start_datetime must be earlier than end_datetime")
        return self


class CheckAvailabilityResponse(BaseModel):
    listing_id: UUID
    available: bool
    conflict: bool


class CreateBookingRequest(BaseModel):
    listing_id: UUID
    start_datetime: datetime
    end_datetime: datetime

    @model_validator(mode="after")
    def validate_time_range(self) -> "CreateBookingRequest":
        if self.start_datetime >= self.end_datetime:
            raise ValueError("start_datetime must be earlier than end_datetime")
        return self


class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    listing_id: UUID
    renter_id: UUID
    owner_id: UUID
    start_datetime: datetime
    end_datetime: datetime
    status: str
    total_price: float | None
    created_at: datetime


class BookingActionResponse(BaseModel):
    booking: BookingResponse
    availability: bool


class BookingPaymentResponse(BaseModel):
    booking: BookingResponse
    payment_status: str


class BookingListItem(BookingResponse):
    equipment_name: str
    listing_is_active: bool


class ListingListItem(ListingResponse):
    pass


class RentalRecommendationListing(BaseModel):
    id: UUID
    equipment_name: str
    price: float
    price_type: str
    latitude: float | None = None
    longitude: float | None = None
    distance_m: float | None = None


class RentalRecommendationResponse(BaseModel):
    block_id: UUID
    recommendations: list[str] = Field(default_factory=list)
    reason: str
    weather_guardrail: str | None = None
    reasons: list[str] = Field(default_factory=list)
    has_irrigation_equipment: bool = False
    listings: list[RentalRecommendationListing] = Field(default_factory=list)


class BookingCalendarSlot(BaseModel):
    start_datetime: datetime
    end_datetime: datetime
    status: str


class BookingCalendarResponse(BaseModel):
    listing_id: UUID
    date: str
    slots: list[BookingCalendarSlot] = Field(default_factory=list)
