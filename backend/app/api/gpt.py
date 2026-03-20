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
from app.schemas.insights import GrowerGPTResponse, MetricInsight, UserGPTInsight, UserGPTResponse

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
        insights = _build_metric_insights(satellite_response)
        data_age = calculate_data_age(satellite_response)
        confidence = calculate_confidence(satellite_response)

        if not is_fresh:
            ai_message = _build_freshness_guardrail_message(satellite_response.freshness_status, satellite_response.error)
        elif satellite_response.data_quality == "no_data" and not insights:
            ai_message = "No satellite data available for this block yet."
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

        return GrowerGPTResponse(
            **build_satellite_contract_payload(satellite_response),
            crop=snapshot.crop,
            date=satellite_response.composite_date_to,
            data_age_days=data_age,
            confidence=confidence,
            insights=insights,
            message=ai_message,
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
    fresh_block_summaries = []
    stale_block_names: list[str] = []

    try:
        snapshots = satellite_access_service.get_user_block_snapshots(user_id)

        for snapshot in snapshots:
            satellite_response = snapshot.insights
            block_name = snapshot.lanslu or snapshot.block_id
            is_fresh = satellite_response.freshness_status == "fresh"
            insights = _build_metric_insights(satellite_response) if is_fresh else []
            alert_summaries = _build_alert_summaries(satellite_response) if is_fresh else []

            if alert_summaries:
                fresh_block_summaries.append({
                    "block_name": block_name,
                    "crop": snapshot.crop,
                    "status": alert_summaries[0],
                })
            elif insights:
                primary_alert = insights[0]
                fresh_block_summaries.append({
                    "block_name": block_name,
                    "crop": snapshot.crop,
                    "status": f"{primary_alert.metric.upper()}: {primary_alert.status}"
                })
            elif not is_fresh:
                stale_block_names.append(block_name)

            for alert in insights:
                all_insights.append(
                    UserGPTInsight(
                        block_id=snapshot.block_id,
                        block_name=block_name,
                        crop=snapshot.crop,
                        freshness_status=satellite_response.freshness_status,
                        insight=alert,
                    )
                )

        if fresh_block_summaries:
            system_prompt = "You are a regional vineyard manager. Provide a 1-sentence executive summary for the entire property."
            prompt = f"Provide a brief property-wide summary based on these block statuses: {json.dumps(fresh_block_summaries)}. Focus on the most urgent issues."
            summary = await llm_service.generate_response(prompt, system_prompt)
            if stale_block_names:
                summary = f"{summary} Freshness note: {len(stale_block_names)} block(s) are still stale or updating and were excluded."
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


def _build_alert_summaries(satellite_response) -> list[str]:
    return [f"{alert.metric.upper()}: {alert.message}" for alert in satellite_response.alerts]
