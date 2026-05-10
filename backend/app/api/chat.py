from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

from app.audit.logger import audit
from app.config import get_settings
from app.llm.deepseek import DeepSeekClient


router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    model: str | None = None


@router.post("/chat")
async def chat(request: ChatRequest) -> dict:
    client = DeepSeekClient()
    try:
        result = await client.chat([message.model_dump() for message in request.messages], request.model)
    except Exception as exc:
        audit("chat.failed", {"error": str(exc)})
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    audit("chat.completed", {"model": request.model or get_settings().default_model})
    return result


@router.get("/models/config")
def model_config() -> dict[str, str | bool]:
    settings = get_settings()
    return {
        "base_url": settings.deepseek_base_url,
        "default_model": settings.default_model,
        "api_key_configured": bool(settings.deepseek_api_key),
    }


@router.post("/models/test")
async def test_model() -> dict:
    try:
        result = await DeepSeekClient().test()
    except Exception as exc:
        audit("model.test_failed", {"error": str(exc)})
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    audit("model.test_completed", {"model": result.get("model")})
    return result
