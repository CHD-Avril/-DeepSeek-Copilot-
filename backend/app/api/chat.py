from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

from app.audit.logger import audit
from app.config import env_path, get_settings
from app.llm.deepseek import DeepSeekClient


router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    model: str | None = None


class ModelConfigUpdate(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    default_model: str | None = None


def _read_env_lines() -> list[str]:
    path = env_path()
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8").splitlines()


def _upsert_env_values(values: dict[str, str]) -> None:
    path = env_path()
    lines = _read_env_lines()
    remaining = dict(values)
    updated: list[str] = []

    for line in lines:
        if not line or line.lstrip().startswith("#") or "=" not in line:
            updated.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in remaining:
            updated.append(f"{key}={remaining.pop(key)}")
        else:
            updated.append(line)

    for key, value in remaining.items():
        updated.append(f"{key}={value}")

    path.write_text("\n".join(updated) + "\n", encoding="utf-8")


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


@router.post("/models/config")
def update_model_config(request: ModelConfigUpdate) -> dict[str, str | bool]:
    values: dict[str, str] = {}
    if request.api_key is not None and request.api_key.strip():
        values["DEEPSEEK_API_KEY"] = request.api_key.strip()
    if request.base_url is not None and request.base_url.strip():
        values["DEEPSEEK_BASE_URL"] = request.base_url.strip().rstrip("/")
    if request.default_model is not None and request.default_model.strip():
        values["DEFAULT_MODEL"] = request.default_model.strip()

    if not values:
        raise HTTPException(status_code=400, detail="No model configuration values provided")

    try:
        _upsert_env_values(values)
        get_settings.cache_clear()
    except Exception as exc:
        audit("model.config_update_failed", {"error": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    audit("model.config_updated", {"updated": [key for key in values if key != "DEEPSEEK_API_KEY"]})
    return model_config()


@router.post("/models/test")
async def test_model() -> dict:
    try:
        result = await DeepSeekClient().test()
    except Exception as exc:
        audit("model.test_failed", {"error": str(exc)})
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    audit("model.test_completed", {"model": result.get("model")})
    return result
