from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import pytest

from app.services import rental_service
from app.services.rental_service import RentalServiceError


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


class _FakeDb:
    def __init__(self, rows):
        self._rows = rows

    def execute(self, *args, **kwargs):
        return _FakeResult(self._rows)


def test_hourly_booking_rejects_past_start(monkeypatch: pytest.MonkeyPatch) -> None:
    listing_id = uuid4()
    now = datetime(2026, 4, 10, 12, 0, 0)

    monkeypatch.setattr(
        rental_service,
        "_get_listing_or_404",
        lambda db, requested_listing_id: {
            "id": requested_listing_id,
            "is_active": True,
            "price_type": "hourly",
            "quantity_total": 1,
            "availability_settings": None,
        },
    )
    monkeypatch.setattr(rental_service, "datetime", type("FrozenDateTime", (), {"now": staticmethod(lambda tz=None: now), "utcnow": staticmethod(lambda: now)}))

    with pytest.raises(RentalServiceError, match="at least 30 minutes in the future"):
        rental_service.check_availability_with_reason(
            db=None,
            listing_id=listing_id,
            start=datetime(2026, 4, 10, 12, 15, 0),
            end=datetime(2026, 4, 10, 13, 15, 0),
        )


def test_daily_booking_rejects_past_day(monkeypatch: pytest.MonkeyPatch) -> None:
    listing_id = uuid4()
    now = datetime(2026, 4, 10, 12, 0, 0)

    monkeypatch.setattr(
        rental_service,
        "_get_listing_or_404",
        lambda db, requested_listing_id: {
            "id": requested_listing_id,
            "is_active": True,
            "price_type": "daily",
            "quantity_total": 1,
            "availability_settings": None,
        },
    )
    monkeypatch.setattr(rental_service, "datetime", type("FrozenDateTime", (), {"now": staticmethod(lambda tz=None: now), "utcnow": staticmethod(lambda: now)}))

    with pytest.raises(RentalServiceError, match="start date cannot be in the past"):
        rental_service.check_availability_with_reason(
            db=None,
            listing_id=listing_id,
            start=datetime(2026, 4, 9, 0, 0, 0),
            end=datetime(2026, 4, 10, 0, 0, 0),
        )


def test_calendar_marks_disallowed_weekdays_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    listing_id = uuid4()

    monkeypatch.setattr(
        rental_service,
        "_get_listing_or_404",
        lambda db, requested_listing_id: {
            "id": requested_listing_id,
            "is_active": True,
            "price_type": "hourly",
            "quantity_total": 1,
            "availability_settings": {
                "available_all_days": False,
                "available_days": ["mon", "wed"],
                "working_hours_start": None,
                "working_hours_end": None,
                "unavailable_dates": [],
                "minimum_booking_hours": None,
                "advance_notice_hours": None,
            },
        },
    )

    calendar = rental_service.get_listing_calendar(_FakeDb([]), listing_id, datetime(2026, 4, 14).date())

    assert calendar["date"] == "2026-04-14"
    assert all(slot["status"] == "unavailable" for slot in calendar["slots"])


def test_calendar_marks_hours_outside_working_window_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    listing_id = uuid4()

    monkeypatch.setattr(
        rental_service,
        "_get_listing_or_404",
        lambda db, requested_listing_id: {
            "id": requested_listing_id,
            "is_active": True,
            "price_type": "hourly",
            "quantity_total": 1,
            "availability_settings": {
                "available_all_days": True,
                "available_days": [],
                "working_hours_start": "09:00",
                "working_hours_end": "17:00",
                "unavailable_dates": [],
                "minimum_booking_hours": None,
                "advance_notice_hours": None,
            },
        },
    )

    calendar = rental_service.get_listing_calendar(_FakeDb([]), listing_id, datetime(2026, 4, 13).date())

    assert calendar["slots"][8]["status"] == "unavailable"
    assert calendar["slots"][9]["status"] == "available"
    assert calendar["slots"][16]["status"] == "available"
    assert calendar["slots"][17]["status"] == "unavailable"
