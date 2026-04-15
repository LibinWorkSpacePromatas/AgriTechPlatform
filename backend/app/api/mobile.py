from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import SessionLocal
from app.schemas.sensors import BlockSensorsResponse
from app.services.sensor_service import sensor_service


router = APIRouter(tags=["mobile"])
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)


class MobileHealthResponse(BaseModel):
    status: str
    service: str
    generated_at: str


class MobileBlockDashboardResponse(BaseModel):
    block_id: str
    generated_at: str
    sensors: BlockSensorsResponse


class MobileLoginRequest(BaseModel):
    email: str
    password: str


class MobileUserResponse(BaseModel):
    id: str
    name: str | None = None
    email: str
    role: str | None = None


class MobileLoginResponse(BaseModel):
    message: str
    user: MobileUserResponse


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/health", response_model=MobileHealthResponse)
def mobile_health():
    return MobileHealthResponse(
        status="ok",
        service="mobile-api",
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/auth/login", response_model=MobileLoginResponse)
def mobile_login(payload: MobileLoginRequest, db: Session = Depends(get_db)):
    normalized_email = payload.email.strip().lower()
    logger.info(
        "Mobile login payload received: email=%s normalized_email=%s password_length=%s",
        payload.email,
        normalized_email,
        len(payload.password or ""),
    )

    try:
        user = db.query(User).filter(User.email == normalized_email).first()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Mobile login database error for email=%s", normalized_email)
        raise HTTPException(status_code=500, detail=f"Database error while logging in mobile user: {exc}") from exc

    if not user or not user.password_hash:
        logger.warning(
            "Mobile login failed during user lookup: normalized_email=%s user_found=%s has_password_hash=%s",
            normalized_email,
            bool(user),
            bool(getattr(user, "password_hash", None)),
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    try:
        password_valid = password_context.verify(payload.password, user.password_hash)
    except Exception as exc:
        logger.exception("Mobile login password verification error for email=%s", normalized_email)
        raise HTTPException(status_code=500, detail=f"Unable to verify password: {exc}") from exc

    if not password_valid:
        logger.warning("Mobile login rejected: normalized_email=%s password_valid=%s", normalized_email, password_valid)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    logger.info("Mobile login successful: normalized_email=%s user_id=%s role=%s", normalized_email, user.id, user.role)

    return MobileLoginResponse(
        message="Mobile login successful",
        user=MobileUserResponse(
            id=str(user.id),
            name=user.name,
            email=user.email,
            role=user.role,
        ),
    )


@router.get("/blocks/{block_id}/dashboard", response_model=MobileBlockDashboardResponse)
def get_mobile_block_dashboard(block_id: str, db: Session = Depends(get_db)):
    try:
        sensors = sensor_service.get_block_sensor_dashboard(db, block_id)
        return MobileBlockDashboardResponse(
            block_id=block_id,
            generated_at=datetime.now(timezone.utc).isoformat(),
            sensors=sensors,
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while fetching mobile dashboard: {exc}") from exc


@router.get("/blocks/{block_id}/sensors", response_model=BlockSensorsResponse)
def get_mobile_block_sensors(block_id: str, db: Session = Depends(get_db)):
    try:
        return sensor_service.get_block_sensor_dashboard(db, block_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while fetching mobile sensors: {exc}") from exc
