from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import agent, chat, knowledge, logs
from app.config import get_settings


settings = get_settings()

app = FastAPI(title="DeepSeek Copilot Workbench", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(agent.router, prefix="/api")
app.include_router(knowledge.router, prefix="/api")
app.include_router(logs.router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
