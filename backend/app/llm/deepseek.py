from typing import Any

import httpx

from app.config import get_settings


class DeepSeekClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def chat(self, messages: list[dict[str, str]], model: str | None = None) -> dict[str, Any]:
        if not self.settings.deepseek_api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")

        payload = {
            "model": model or self.settings.default_model,
            "messages": messages,
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {self.settings.deepseek_api_key}"}
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.settings.deepseek_base_url.rstrip('/')}/chat/completions",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()

    async def test(self) -> dict[str, Any]:
        result = await self.chat([{"role": "user", "content": "Reply with ok."}])
        return {
            "ok": True,
            "model": result.get("model", self.settings.default_model),
            "reply": result.get("choices", [{}])[0].get("message", {}).get("content", ""),
        }
