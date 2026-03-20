from __future__ import annotations

import json
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import Block, SatelliteCache
from app.db.session import SessionLocal
from app.services.insights import generate_insights
from app.services.utils import calculate_data_age, calculate_confidence
from app.services.llm_service import llm_service

from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    system_prompt: Optional[str] = None
    context: Optional[str] = None

@router.post("/gpt/chat")
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/gpt/{block_id}")
async def get_gpt(block_id: str, db: Session = Depends(get_db)):
    """
    Main GPT endpoint for a single block.
    Matches PDF requirements for insights, data age, and confidence.
    Now enhanced with natural language advice from OpenRouter LLM.
    """
    block = None
    
    # Try finding by UUID first
    try:
        block_uuid = UUID(block_id)
        block = db.query(Block).filter(Block.id == block_uuid).first()
    except (ValueError, AttributeError):
        pass

    # If not found by UUID, try finding by LANSLU
    if not block:
        block = db.query(Block).filter(Block.lanslu == block_id).first()

    if not block:
        raise HTTPException(status_code=404, detail=f"Block {block_id} not found")

    cache = db.query(SatelliteCache).filter(
        SatelliteCache.block_id == block.id
    ).first()

    if not cache:
        return {
            "block_id": str(block.id),
            "crop": block.crop,
            "insights": [],
            "message": "No satellite data available for this block yet."
        }

    payload = cache.payload
    insights = generate_insights(payload)
    data_age = calculate_data_age(cache)
    confidence = calculate_confidence(cache)

    # Generate natural language advice using LLM
    system_prompt = "You are an expert viticulturist and agricultural advisor. Provide concise, actionable advice based on satellite indices (NDVI, NDWI, NDRE, EVI, LAI)."
    
    # Map technical labels to readable descriptions
    prompt = f"""
    Block Name: {block.lanslu or 'Field'}
    Crop: {block.crop}
    Satellite Indices (Latest):
    - NDVI (Health): {payload.get('ndvi', 'N/A')}
    - NDWI (Water): {payload.get('ndwi', 'N/A')}
    - NDRE (Nutrient): {payload.get('ndre', 'N/A')}
    - EVI (Canopy): {payload.get('evi', 'N/A')}
    - LAI (Yield): {payload.get('lai', 'N/A')}
    
    Current Insights: {json.dumps(insights)}
    
    Provide a professional, brief summary of the field status and 1-2 key recommendations for the grower.
    Keep it under 100 words.
    """
    
    ai_message = await llm_service.generate_response(prompt, system_prompt)

    return {
        "block_id": str(block.id),
        "crop": block.crop,
        "date": cache.composite_date_to,
        "data_age_days": data_age,
        "confidence": confidence,
        "insights": insights,
        "message": ai_message
    }


@router.get("/gpt/user/{user_id}")
async def user_gpt(user_id: str, db: Session = Depends(get_db)):
    """
    Multi-block GPT endpoint for a user.
    Prioritizes critical alerts across all blocks and generates a property-wide summary.
    """
    try:
        user_uuid = UUID(user_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail=f"Invalid user_id format: {user_id}")

    blocks = db.query(Block).filter(Block.user_id == user_uuid).all()
    if not blocks:
        raise HTTPException(status_code=404, detail=f"No blocks found for user {user_id}")

    all_insights = []
    block_summaries = []

    for b in blocks:
        cache = db.query(SatelliteCache).filter(
            SatelliteCache.block_id == b.id
        ).first()

        if not cache:
            continue

        insights = generate_insights(cache.payload)
        
        if insights:
            block_summaries.append({
                "block_name": b.lanslu or str(b.id),
                "crop": b.crop,
                "status": insights[0]["message"]
            })

        for i in insights:
            # Create a copy to avoid modifying original or shared refs
            insight_copy = i.copy()
            insight_copy["block_id"] = str(b.id)
            insight_copy["block_name"] = b.lanslu or str(b.id)
            all_insights.append(insight_copy)

    # prioritize critical
    all_insights.sort(key=lambda x: x["severity"] == "critical", reverse=True)

    # Generate a property-wide summary using LLM
    if block_summaries:
        system_prompt = "You are a regional vineyard manager. Provide a 1-sentence executive summary for the entire property."
        prompt = f"Provide a brief property-wide summary based on these block statuses: {json.dumps(block_summaries)}. Focus on the most urgent issues."
        summary = await llm_service.generate_response(prompt, system_prompt)
    else:
        summary = "All blocks are performing within optimal ranges."

    return {
        "user_id": user_id,
        "summary": summary,
        "insights": all_insights[:5]
    }
