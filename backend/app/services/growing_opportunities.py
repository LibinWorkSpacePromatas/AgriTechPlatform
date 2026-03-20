from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.models import Block, SatelliteCache, SatelliteTimeseries
from app.schemas.growing_opportunities import (
    GrowingOpportunitiesResponse,
    GrowingOpportunityFeedbackRequest,
    GrowingOpportunityFeedbackResponse,
    GrowingOpportunityRecommendation,
)
from app.services.utils import calculate_confidence


class GrowingOpportunitiesService:
    def build_page_payload(self, db: Session, block: Block) -> GrowingOpportunitiesResponse:
        cache = db.query(SatelliteCache).filter(SatelliteCache.block_id == block.id).first()
        if not cache:
            return GrowingOpportunitiesResponse(
                block_id=str(block.id),
                crop=block.crop,
                status="updating",
                source="cache",
                data_quality="no_data",
                composite_date_from=None,
                composite_date_to=None,
                data_age_days=None,
                confidence="low",
                warning="Satellite intelligence is still being prepared for this block.",
                trend_summary="Trend analysis will be available once multiple satellite passes have been cached.",
                recommendations=[
                    GrowingOpportunityRecommendation(
                        id="system-waiting",
                        title="Satellite Recommendations Pending",
                        category="system",
                        severity="info",
                        metric_key="system",
                        metric_label="System",
                        current_value=None,
                        threshold="Live insight required",
                        recommended_action="Retry after the next refresh",
                        message="This block does not yet have a cached satellite composite for recommendation generation.",
                        detail="Once a block composite is available, this page will automatically create nutrient, canopy, and irrigation cards from the latest satellite pass.",
                        trend_note=None,
                        message_to_farmer="Satellite recommendations are not ready yet for this block."
                    )
                ],
            )

        payload = cache.payload or {}
        observed_series = (
            db.query(SatelliteTimeseries)
            .filter(SatelliteTimeseries.block_id == block.id)
            .order_by(SatelliteTimeseries.observed_on.desc())
            .limit(3)
            .all()
        )
        recommendations = self._build_recommendations(block, payload, observed_series)
        trend_summary = self._build_trend_summary(observed_series)
        data_age_days = (date.today() - cache.composite_date_to).days if cache.composite_date_to else None

        return GrowingOpportunitiesResponse(
            block_id=str(block.id),
            crop=block.crop,
            status="fresh",
            source="gee",
            data_quality=cache.data_quality,
            composite_date_from=cache.composite_date_from,
            composite_date_to=cache.composite_date_to,
            data_age_days=data_age_days,
            confidence=calculate_confidence(cache),
            warning=self._build_warning(cache),
            trend_summary=trend_summary,
            recommendations=recommendations,
        )

    def save_feedback(
        self,
        block: Block,
        feedback: GrowingOpportunityFeedbackRequest,
    ) -> GrowingOpportunityFeedbackResponse:
        feedback_id = str(uuid4())
        feedback_path = Path(__file__).resolve().parents[2] / "data" / "growing_opportunities_feedback.jsonl"
        feedback_path.parent.mkdir(parents=True, exist_ok=True)

        record = {
            "feedback_id": feedback_id,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "block_id": str(block.id),
            "block_lanslu": block.lanslu,
            "recommendation_id": feedback.recommendation_id,
            "helpful": feedback.helpful,
            "notes": feedback.notes or "",
        }

        with feedback_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")

        return GrowingOpportunityFeedbackResponse(saved=True, feedback_id=feedback_id)

    def _build_recommendations(
        self,
        block: Block,
        payload: dict,
        observed_series: list[SatelliteTimeseries],
    ) -> list[GrowingOpportunityRecommendation]:
        block_label = block.lanslu or block.crop or "this block"
        recommendations: list[GrowingOpportunityRecommendation] = []

        ndre = self._as_float(payload.get("ndre"))
        evi = self._as_float(payload.get("evi"))
        ndwi = self._as_float(payload.get("ndwi"))

        if ndre is not None and ndre < 0.25:
            recommendations.append(
                GrowingOpportunityRecommendation(
                    id="foliar-nutrient-application",
                    title="Foliar Nutrient Application",
                    category="nutrient",
                    severity="critical" if ndre < 0.12 else "warning",
                    metric_key="ndre",
                    metric_label="NDRE",
                        current_value=round(ndre, 4),
                        threshold="< 0.25",
                        recommended_action="Check this block for a foliar nutrient application.",
                        message=f"Nitrogen deficiency is likely in {block_label}.",
                        detail="The latest satellite reading suggests chlorophyll activity is weaker than expected in this block, so a nutrient check is worth prioritising.",
                        trend_note=self._ndre_trend_note(observed_series),
                        message_to_farmer=f"Nitrogen deficiency likely in {block_label}. Foliar spray recommended.",
                    )
            )

        if evi is not None and evi > 0.50:
            recommendations.append(
                GrowingOpportunityRecommendation(
                    id="canopy-management",
                    title="Canopy Management",
                    category="canopy",
                    severity="info",
                    metric_key="evi",
                    metric_label="EVI",
                        current_value=round(evi, 4),
                        threshold="> 0.50",
                        recommended_action="Review leaf removal and canopy airflow in this block.",
                        message=f"Dense canopy conditions are present in {block_label}.",
                        detail="The canopy looks quite dense in the latest pass, which can reduce airflow and raise mildew risk if it continues.",
                        trend_note=self._metric_momentum_note(observed_series, "evi", "canopy density"),
                        message_to_farmer=f"Dense canopy in {block_label}. Leaf removal may improve airflow and reduce mildew risk.",
                    )
            )

        if ndwi is not None and ndwi < -0.10:
            urgent = ndwi < -0.30
            recommendations.append(
                GrowingOpportunityRecommendation(
                    id="irrigation-opportunity",
                    title="Irrigation Opportunity",
                    category="irrigation",
                    severity="critical" if urgent else "warning",
                    metric_key="ndwi",
                    metric_label="NDWI",
                        current_value=round(ndwi, 4),
                        threshold="< -0.10",
                        recommended_action="Irrigate today." if urgent else "Consider irrigation within 2-3 days.",
                        message=f"Water stress is being detected in {block_label}.",
                        detail="The latest reading suggests this block is drying down, so irrigation timing should be reviewed before stress deepens.",
                        trend_note=self._metric_momentum_note(observed_series, "ndwi", "water status"),
                        message_to_farmer=(
                            f"Severe water deficit in {block_label}. Irrigate today. Yield damage risk."
                        if urgent
                        else f"Water stress detected in {block_label}. Consider irrigation within 2-3 days."
                    ),
                )
            )

        if ndre is not None and 0.25 <= ndre <= 0.40 and self._is_declining_over_two_passes(observed_series, "ndre"):
            recommendations.append(
                GrowingOpportunityRecommendation(
                    id="nutrient-trend-watch",
                    title="Nutrient Trend Watch",
                    category="trend",
                    severity="info",
                    metric_key="ndre",
                    metric_label="NDRE trend",
                        current_value=round(ndre, 4),
                        threshold="0.25 to 0.40 and declining over 2 passes",
                        recommended_action="Keep an eye on this block and prepare for a nutrient review if the decline continues.",
                        message=f"Chlorophyll activity is still moderate in {block_label}, but the trend is softening.",
                        detail="This is not an urgent nutrient issue yet, but the recent trend is moving the wrong way and deserves attention.",
                        trend_note=self._ndre_trend_note(observed_series),
                        message_to_farmer=f"NDRE is declining across consecutive passes in {block_label}. Plan foliar nutrient review if the next pass continues downward.",
                    )
            )

        if not recommendations:
            recommendations.append(
                GrowingOpportunityRecommendation(
                    id="stable-conditions",
                    title="Stable Conditions",
                    category="system",
                    severity="positive",
                    metric_key="system",
                    metric_label="Status",
                        current_value="stable",
                        threshold="No Growing Opportunities trigger crossed",
                        recommended_action="Continue monitoring until the next satellite refresh.",
                        message=f"{block_label} is not currently triggering the nutrient, canopy, or irrigation rules for this page.",
                        detail="Nothing in the latest pass stands out as an immediate nutrient, canopy, or irrigation concern for this block.",
                        trend_note=self._build_trend_summary(observed_series),
                        message_to_farmer=f"No immediate Growing Opportunities action is triggered for {block_label}. Continue monitoring.",
                    )
            )

        return recommendations[:4]

    def _build_warning(self, cache: SatelliteCache) -> str | None:
        if cache.data_quality == "degraded":
            return "Cloud-heavy imagery reduced confidence in the current recommendation set."
        if cache.data_quality == "no_data":
            return "No usable satellite pixels were available for the selected period."
        return None

    def _build_trend_summary(self, observed_series: list[SatelliteTimeseries]) -> str | None:
        if len(observed_series) < 2:
            return "Only one cached satellite pass is available, so trend analysis is limited."

        latest = observed_series[0]
        previous = observed_series[1]
        messages: list[str] = []

        if latest.ndre is not None and previous.ndre is not None:
            direction = "up" if latest.ndre > previous.ndre else "down" if latest.ndre < previous.ndre else "flat"
            messages.append(f"NDRE is trending {direction} versus the previous cached pass.")

        if latest.evi is not None and previous.evi is not None:
            direction = "up" if latest.evi > previous.evi else "down" if latest.evi < previous.evi else "flat"
            messages.append(f"EVI is trending {direction} versus the previous cached pass.")

        if latest.ndwi is not None and previous.ndwi is not None:
            direction = "up" if latest.ndwi > previous.ndwi else "down" if latest.ndwi < previous.ndwi else "flat"
            messages.append(f"NDWI is trending {direction} versus the previous cached pass.")

        return " ".join(messages) if messages else "Recent trend comparison is not available for this block."

    def _ndre_trend_note(self, observed_series: list[SatelliteTimeseries]) -> str | None:
        if self._is_declining_over_two_passes(observed_series, "ndre"):
            return "Nutrient activity has softened across the last two passes."
        if len(observed_series) < 2:
            return "A few more satellite passes are needed before we can comment on the trend with confidence."
        return "The nutrient trend is not showing a clear two-pass decline right now."

    def _metric_momentum_note(self, observed_series: list[SatelliteTimeseries], field_name: str, label: str) -> str | None:
        if len(observed_series) < 2:
            return f"More cached passes are needed to confirm {label} momentum."

        latest_value = getattr(observed_series[0], field_name, None)
        previous_value = getattr(observed_series[1], field_name, None)
        if latest_value is None or previous_value is None:
            return f"The recent {label} trend could not be calculated."
        if latest_value > previous_value:
            return f"The latest pass looks slightly stronger than the previous one for {label}."
        if latest_value < previous_value:
            return f"The latest pass looks slightly weaker than the previous one for {label}."
        return f"The last two passes are mostly steady for {label}."

    def _is_declining_over_two_passes(self, observed_series: list[SatelliteTimeseries], field_name: str) -> bool:
        if len(observed_series) < 3:
            return False

        latest = getattr(observed_series[0], field_name, None)
        previous = getattr(observed_series[1], field_name, None)
        older = getattr(observed_series[2], field_name, None)
        if latest is None or previous is None or older is None:
            return False

        return latest < previous < older

    @staticmethod
    def _as_float(value: object) -> float | None:
        if value is None:
            return None
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        return numeric


growing_opportunities_service = GrowingOpportunitiesService()
