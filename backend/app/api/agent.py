from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agent.copilot_runner import AgentRun, runner


router = APIRouter(prefix="/agent", tags=["agent"])


class AgentRunRequest(BaseModel):
    prompt: str = Field(min_length=1)
    command: str | None = None


def serialize(run: AgentRun) -> dict:
    return {
        "id": run.id,
        "prompt": run.prompt,
        "command": run.command,
        "status": run.status,
        "created_at": run.created_at,
        "updated_at": run.updated_at,
        "log_count": len(run.logs),
    }


@router.post("/run")
def start_run(request: AgentRunRequest) -> dict:
    try:
        return serialize(runner.start(request.prompt, request.command))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/runs/{run_id}")
def get_run(run_id: str) -> dict:
    run = runner.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return serialize(run)


@router.get("/runs/{run_id}/logs")
def get_run_logs(run_id: str) -> dict:
    run = runner.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run_id": run.id, "logs": run.logs}


@router.post("/runs/{run_id}/stop")
def stop_run(run_id: str) -> dict:
    run = runner.stop(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return serialize(run)
