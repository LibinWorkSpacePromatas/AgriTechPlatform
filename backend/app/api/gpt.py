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
                item.block_name,
                item.insight.metric,
            ),
        )[:5]

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
    priority = {"ndwi": 0, "ndre": 1, "ndvi": 2, "evi": 3, "lai": 4}
    return sorted(insights, key=lambda insight: priority.get(insight.metric, 999))[:3]


def _build_action_insights(satellite_response) -> list[GrowerGPTInsight]:
    ndwi = satellite_response.ndwi
    ndre = satellite_response.ndre
    ndvi = satellite_response.ndvi
    evi = satellite_response.evi
    lai = satellite_response.lai

    insights: list[GrowerGPTInsight] = []

    irrigation_insight = _build_irrigation_insight(ndwi)
    if irrigation_insight is not None:
        insights.append(irrigation_insight)

    nutrient_insight = _build_nutrient_insight(ndre)
    if nutrient_insight is not None:
        insights.append(nutrient_insight)

    health_insight = _build_health_insight(ndvi, evi, lai)
    if health_insight is not None:
        insights.append(health_insight)

    priority = {"irrigation": 0, "nutrient": 1, "health": 2}
    return sorted(insights, key=lambda insight: priority[insight.type])[:3]


def _build_irrigation_insight(ndwi: float | None) -> GrowerGPTInsight | None:
    if ndwi is None:
        return None
    if ndwi < -0.30:
        return GrowerGPTInsight(
            type="irrigation",
            severity="critical",
            message="Severe water stress. Irrigate immediately.",
            action_window="today",
            reason=f"NDWI = {round(ndwi, 4)} (< -0.30)",
        )
    if ndwi < -0.15:
        return GrowerGPTInsight(
            type="irrigation",
            severity="warning",
            message="Water stress detected. Irrigate today.",
            action_window="today",
            reason=f"NDWI = {round(ndwi, 4)} (< -0.15)",
        )
    return None


def _build_nutrient_insight(ndre: float | None) -> GrowerGPTInsight | None:
    if ndre is None:
        return None
    if ndre < 0.12:
        return GrowerGPTInsight(
            type="nutrient",
            severity="critical",
            message="Severe nutrient stress likely. Prioritise foliar nutrient review.",
            action_window="this week",
            reason=f"NDRE = {round(ndre, 4)} (< 0.12)",
        )
    if ndre < 0.25:
        return GrowerGPTInsight(
            type="nutrient",
            severity="warning",
            message="Nutrient deficiency likely. Plan a foliar nutrient check.",
            action_window="this week",
            reason=f"NDRE = {round(ndre, 4)} (< 0.25)",
        )
    return None


def _build_health_insight(ndvi: float | None, evi: float | None, lai: float | None) -> GrowerGPTInsight | None:
    if ndvi is not None:
        if ndvi < 0.20:
            return GrowerGPTInsight(
                type="health",
                severity="critical",
                message="Critical vine stress. Inspect immediately.",
                action_window="today",
                reason=f"NDVI = {round(ndvi, 4)} (< 0.20)",
            )
        if ndvi < 0.35:
            return GrowerGPTInsight(
                type="health",
                severity="warning",
                message="Vine health declining. Inspect soon.",
                action_window="this week",
                reason=f"NDVI = {round(ndvi, 4)} (< 0.35)",
            )

    if evi is not None and evi > 0.50:
        return GrowerGPTInsight(
            type="health",
            severity="warning",
            message="Dense canopy detected. Review leaf removal and airflow.",
            action_window="this week",
            reason=f"EVI = {round(evi, 4)} (> 0.50)",
        )

    if lai is not None and lai < 2.0:
        return GrowerGPTInsight(
            type="health",
            severity="warning",
            message="Low yield potential signal. Review block constraints and stress drivers.",
            action_window="this week",
            reason=f"LAI = {round(lai, 4)} (< 2.0)",
        )

    return None

def _build_alert_summaries(satellite_response) -> list[str]:
    return [f"{alert.metric.upper()}: {alert.message}" for alert in satellite_response.alerts]
