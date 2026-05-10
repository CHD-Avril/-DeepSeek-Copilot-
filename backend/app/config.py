from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def backend_root() -> Path:
    return Path(__file__).resolve().parents[1]


def resolve_repo_path(path: Path) -> Path:
    return path if path.is_absolute() else (backend_root() / path).resolve()


class Settings(BaseSettings):
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    default_model: str = "deepseek-chat"
    workspace_root: Path = Path("../workspace")
    knowledge_base_dir: Path = Path("../knowledge_base")
    log_dir: Path = Path("../logs")
    copilot_command: str = "codex"
    agent_permission: str = "READ_ONLY"
    backend_cors_origins: str = "http://localhost:3000,http://localhost:5173"

    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.workspace_root = resolve_repo_path(settings.workspace_root)
    settings.knowledge_base_dir = resolve_repo_path(settings.knowledge_base_dir)
    settings.log_dir = resolve_repo_path(settings.log_dir)
    settings.workspace_root.mkdir(parents=True, exist_ok=True)
    settings.knowledge_base_dir.mkdir(parents=True, exist_ok=True)
    settings.log_dir.mkdir(parents=True, exist_ok=True)
    return settings
