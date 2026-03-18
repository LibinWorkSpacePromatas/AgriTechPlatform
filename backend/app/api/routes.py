from fastapi import APIRouter
from app.api import auth, scan

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(scan.router, prefix="/scan", tags=["scan"])
