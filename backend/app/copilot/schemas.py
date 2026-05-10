from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


RunStatus = Literal["queued", "running", "waiting_permission", "completed", "failed", "stopped"]
EventType = Literal[
    "status",
    "model",
    "model_json_invalid",
    "tool_call",
    "tool_result",
    "permission_request",
    "permission_decision",
    "final",
    "error",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class CopilotRunRequest(BaseModel):
    prompt: str = Field(min_length=1)
    max_steps: int = Field(default=8, ge=1, le=8)
    model: str | None = None


class CopilotPermissionDecision(BaseModel):
    request_id: str
    approved: bool


class CopilotEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: str = Field(default_factory=utc_now)
    type: EventType
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class CopilotRun(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    prompt: str
    status: RunStatus = "queued"
    final_answer: str = ""
    error: str = ""
    max_steps: int = 8
    model: str | None = None
    created_at: str = Field(default_factory=utc_now)
    updated_at: str = Field(default_factory=utc_now)
    events: list[CopilotEvent] = Field(default_factory=list)


class ModelToolCall(BaseModel):
    type: Literal["tool_call"]
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ModelFinal(BaseModel):
    type: Literal["final"]
    answer: str
