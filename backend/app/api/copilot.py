from fastapi import APIRouter, HTTPException

from app.copilot.agent import copilot_agent
from app.copilot.schemas import CopilotPermissionDecision, CopilotRun, CopilotRunRequest


router = APIRouter(prefix="/copilot", tags=["copilot"])


def serialize(run: CopilotRun) -> dict:
    return {
        "id": run.id,
        "prompt": run.prompt,
        "status": run.status,
        "final_answer": run.final_answer,
        "error": run.error,
        "max_steps": run.max_steps,
        "model": run.model,
        "created_at": run.created_at,
        "updated_at": run.updated_at,
        "event_count": len(run.events),
    }


@router.post("/runs")
def start_run(request: CopilotRunRequest) -> dict:
    return serialize(copilot_agent.start(request.prompt, request.max_steps, request.model))


@router.get("/runs")
def list_runs(limit: int = 50) -> dict:
    safe_limit = max(1, min(limit, 100))
    return {"runs": [serialize(run) for run in copilot_agent.list(safe_limit)]}


@router.get("/runs/{run_id}")
def get_run(run_id: str) -> dict:
    run = copilot_agent.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return serialize(run)


@router.get("/runs/{run_id}/events")
def get_run_events(run_id: str) -> dict:
    run = copilot_agent.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run_id": run.id, "events": [event.model_dump() for event in run.events]}


@router.delete("/runs/{run_id}")
def delete_run(run_id: str) -> dict:
    deleted = copilot_agent.delete(run_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"deleted": True, "run_id": run_id}


@router.post("/runs/{run_id}/stop")
def stop_run(run_id: str) -> dict:
    run = copilot_agent.stop(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return serialize(run)


@router.post("/runs/{run_id}/permissions")
def decide_permission(run_id: str, decision: CopilotPermissionDecision) -> dict:
    run = copilot_agent.decide_permission(run_id, decision.request_id, decision.approved)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return serialize(run)
