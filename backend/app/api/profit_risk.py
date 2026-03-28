from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.routes import get_db
from app.schemas.profit_risk import ProfitRiskResponse
from app.services.block_lookup import resolve_block
from app.services.profit_risk import get_profit_risk_service


router = APIRouter()


@router.get("/blocks/{block_id}/profit-risk", response_model=ProfitRiskResponse)
def get_profit_risk(
    block_id: str,
    water_price: float = Query(default=153.0, ge=80.0, le=420.0),
    db: Session = Depends(get_db),
):
    try:
        block = resolve_block(db, block_id)
        service = get_profit_risk_service()
        payload = service.build_response(block.crop or "Unknown crop", water_price)
        payload["block_id"] = str(block.id)
        payload["block_name"] = block.lanslu or block.crop or "Selected block"
        return payload
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while resolving block data: {exc}") from exc

