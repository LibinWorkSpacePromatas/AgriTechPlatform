from __future__ import annotations

import json
from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import SQLAlchemyError

from app.services.utils import build_satellite_contract_payload, calculate_data_age, calculate_confidence
from app.services.llm_service import llm_service
from app.services.satellite_access import satellite_access_service
from app.services.satellite_insights import SatelliteInsightsUnavailableError

from pydantic import BaseModel
from typing import Optional
from app.schemas.insights import GrowerGPTInsight, GrowerGPTResponse, MetricInsight, UserGPTInsight, UserGPTResponse

router = APIRouter()

PRIORITY_ORDER = {
    "ndwi": 1,
    "ndvi": 2,
    "ndre": 3,
    "evi": 4,
    "lai": 5,
}
INSIGHT_TYPE_BY_METRIC = {
    "ndwi": "water",
    "ndvi": "health",
    "ndre": "nutrient",
    "evi": "canopy",
    "lai": "yield",
}


class ChatRequest(BaseModel):
    message: str
    system_prompt: Optional[str] = None
    context: Optional[str] = None


class ChatResponse(BaseModel):
    response: str


@router.post("/gpt/chat", response_model=ChatResponse)
async def chat_with_grower_gpt(request: ChatRequest):
    """
    General chat endpoint for Grower GPT.
    Proxies requests to OpenRouter LLM using the backend API key.
    """
    full_prompt = request.message
    if request.context:
        full_prompt = f"{request.context}\n\nUser Question:\n{request.message}"
    
    response = await llm_service.generate_response(full_prompt, request.system_prompt or "")
    return {"response": response}


@router.get("/gpt/{block_id}", response_model=GrowerGPTResponse)
async def get_gpt(block_id: str):
    """
    Main GPT endpoint for a single block.
    Matches PDF requirements for insights, data age, and confidence.
    Now enhanced with natural language advice from OpenRouter LLM.
    """
    try:
        snapshot = satellite_access_service.get_block_snapshot(block_id)
        satellite_response = snapshot.insights
        is_fresh = satellite_response.freshness_status == "fresh"
        insights = _build_action_insights(satellite_response)
        confidence = calculate_confidence(satellite_response)

        reason = insights[0].reason if insights else None
        if not is_fresh:
            ai_message = _build_freshness_guardrail_message(satellite_response.freshness_status, satellite_response.error)
        elif satellite_response.data_quality == "no_data" and not insights:
            ai_message = "No satellite data available for this block yet."
        elif confidence != "high":
            ai_message = None
        else:
            system_prompt = "You are an expert viticulturist and agricultural advisor. Provide concise, actionable advice based on satellite indices (NDVI, NDWI, NDRE, EVI, LAI)."
            prompt = f"""
            Block Name: {snapshot.lanslu or 'Field'}
            Crop: {snapshot.crop}
            Satellite Indices (Latest):
            - NDVI (Health): {satellite_response.ndvi if satellite_response.ndvi is not None else 'N/A'}
            - NDWI (Water): {satellite_response.ndwi if satellite_response.ndwi is not None else 'N/A'}
            - NDRE (Nutrient): {satellite_response.ndre if satellite_response.ndre is not None else 'N/A'}
            - EVI (Canopy): {satellite_response.evi if satellite_response.evi is not None else 'N/A'}
            - LAI (Yield): {satellite_response.lai if satellite_response.lai is not None else 'N/A'}

            Current Interpretations: {json.dumps([insight.model_dump(mode="json") for insight in insights])}
            Active Alerts: {json.dumps(_build_alert_summaries(satellite_response))}
            Scientific Limitations: {json.dumps(satellite_response.limitations)}

            Provide a professional, brief summary of the field status and 1-2 key recommendations for the grower.
            Keep it under 100 words.
            """
            ai_message = await llm_service.generate_response(prompt, system_prompt)

        payload = build_satellite_contract_payload(satellite_response)
        payload["data_age_days"] = calculate_data_age(satellite_response)

        return GrowerGPTResponse(
            **payload,
            crop=snapshot.crop,
            date=satellite_response.composite_date_to,
            confidence=confidence,
            insights=insights,
            message=ai_message,
            reason=reason,
        )
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching GPT block summary: {exc}") from exc


@router.get("/gpt/user/{user_id}", response_model=UserGPTResponse)
async def user_gpt(user_id: str):
    """
    Multi-block GPT endpoint for a user.
    Prioritizes critical alerts across all blocks and generates a property-wide summary.
    """
    all_insights: list[UserGPTInsight] = []
    urgency_counts = {"critical": 0, "warning": 0, "info": 0, "positive": 0}
    urgent_blocks: list[str] = []
    stale_block_names: list[str] = []

    try:
        snapshots = satellite_access_service.get_user_block_snapshots(user_id)

        for snapshot in snapshots:
            satellite_response = snapshot.insights
            block_name = snapshot.lanslu or snapshot.block_id
            is_fresh = satellite_response.freshness_status == "fresh"
            insights = _build_action_insights(satellite_response) if is_fresh else []

            if insights:
                severity = insights[0].severity
                urgency_counts[severity] = urgency_counts.get(severity, 0) + 1
                if severity == "critical":
                    urgent_blocks.append(block_name)
            elif not is_fresh:
                stale_block_names.append(block_name)

            for alert in _build_metric_insights_for_user(satellite_response) if is_fresh else []:
                all_insights.append(
                    UserGPTInsight(
                        block_id=snapshot.block_id,
                        block_name=block_name,
                        crop=snapshot.crop,
                        freshness_status=satellite_response.freshness_status,
                        insight=alert,
                    )
                )

        if urgency_counts["critical"] or urgency_counts["warning"] or urgency_counts["info"] or urgency_counts["positive"]:
            summary = (
                f"{urgency_counts['critical']} block(s) need urgent attention, "
                f"{urgency_counts['warning']} block(s) need action soon, "
                f"{urgency_counts['info']} block(s) have advisory notes."
            )
            if urgent_blocks:
                summary = f"{summary} Urgent: {', '.join(sorted(set(urgent_blocks))[:5])}."
            if stale_block_names:
                summary = f"{summary} Freshness note: {len(stale_block_names)} block(s) were stale/updating and excluded."
        elif stale_block_names:
            summary = "Fresh property-wide GPT advice is temporarily unavailable because all block refreshes are still pending."
        else:
            summary = "All blocks are performing within optimal ranges."

        prioritized_insights = sorted(
            all_insights,
            key=lambda item: (
                item.freshness_status != "fresh",
                PRIORITY_ORDER.get(item.insight.metric, 999),
                item.block_name,
            ),
        )[:3]

        return UserGPTResponse(
            user_id=user_id,
            summary=summary,
            insights=prioritized_insights,
        )
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching user GPT summary: {exc}") from exc


def _build_freshness_guardrail_message(freshness_status: str, error: str | None) -> str:
    if freshness_status == "updating":
        return "Grower GPT is waiting for a fresh satellite refresh to finish before generating advice for this block."
    if error:
        return f"Grower GPT withheld advice because the latest satellite refresh is not ready yet: {error}"
    return "Grower GPT withheld advice because the latest satellite refresh is not ready yet."


def _build_metric_insights(satellite_response) -> list[MetricInsight]:
    return [
        MetricInsight(metric=metric, value=getattr(satellite_response, metric), status=detail.status)
        for metric, detail in satellite_response.interpretations.items()
        if detail.status != "No data"
    ]


def _build_metric_insights_for_user(satellite_response) -> list[MetricInsight]:
    insights = _build_metric_insights(satellite_response)
    alert_metrics = {
        alert.metric
        for alert in satellite_response.alerts
        if alert.metric in PRIORITY_ORDER
    }
    if alert_metrics:
        insights = [insight for insight in insights if insight.metric in alert_metrics]
    return sorted(insights, key=lambda insight: PRIORITY_ORDER.get(insight.metric, 999))[:3]


def _build_action_insights(satellite_response) -> list[GrowerGPTInsight]:
    actionable_metrics = {"ndwi", "ndvi", "ndre", "evi", "lai"}
    prioritized_alerts = sorted(
        [alert for alert in satellite_response.alerts if alert.metric in actionable_metrics],
        key=lambda alert: PRIORITY_ORDER.get(alert.metric, 999),
    )[:3]

    return [
        GrowerGPTInsight(
            type=INSIGHT_TYPE_BY_METRIC[alert.metric],
            severity=alert.severity,
            message=alert.message,
            action_window=_action_window_for_alert(alert.metric, alert.severity),
            reason=f"{alert.metric.upper()} = {alert.value} ({alert.threshold})",
        )
        for alert in prioritized_alerts
    ]


def _action_window_for_alert(metric: str, severity: str) -> str:
    if metric == "ndwi":
        return "today" if severity == "critical" else "2-3 days"
    if metric == "ndvi":
        return "today" if severity == "critical" else "this week"
    if metric == "ndre":
        return "this week"
    if metric == "evi":
        return "this week"
    if metric == "lai":
        return "this week"
    return "this week"

def _build_alert_summaries(satellite_response) -> list[str]:
    return [f"{alert.metric.upper()}: {alert.message}" for alert in satellite_response.alerts]
