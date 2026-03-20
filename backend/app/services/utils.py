from __future__ import annotations

from datetime import date
from typing import Any


def calculate_data_age(cache: Any) -> int:
    """
    Calculates the data age in days based on the composite_date_to of the cache.
    """
    if not cache or not cache.composite_date_to:
        return 0
    return (date.today() - cache.composite_date_to).days


def calculate_confidence(cache: Any) -> str:
    """
    Calculates the confidence level (low, medium, high) based on data quality and pixel count.
    """
    if not cache:
        return "low"
    
    if cache.data_quality != "good":
        return "low"
    
    if cache.pixel_count < 20:
        return "medium"
    
    return "high"
