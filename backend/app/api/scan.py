from fastapi import APIRouter

router = APIRouter()

@router.post("/")
def scan_endpoint():
    return {"message": "Scan endpoint"}
