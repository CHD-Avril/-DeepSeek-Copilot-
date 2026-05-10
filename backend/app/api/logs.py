from fastapi import APIRouter, Query

from app.audit.logger import read_audit


router = APIRouter(tags=["logs"])


@router.get("/logs")
def logs(limit: int = Query(default=200, ge=1, le=1000)) -> dict:
    return {"logs": read_audit(limit)}
