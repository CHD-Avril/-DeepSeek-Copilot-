from pathlib import Path

from app.config import get_settings


BLOCKED_NAMES = {".env", "id_rsa"}
BLOCKED_SUFFIXES = {".pem", ".key"}
MAX_READ_BYTES = 80 * 1024
MAX_COMMAND_OUTPUT_BYTES = 120 * 1024
COMMAND_TIMEOUT_SECONDS = 30


def project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def allowed_roots() -> list[Path]:
    settings = get_settings()
    return [
        project_root(),
        Path(settings.workspace_root).resolve(),
        Path(settings.knowledge_base_dir).resolve(),
    ]


def is_in_allowed_roots(path: Path) -> bool:
    return any(path == root or root in path.parents for root in allowed_roots())


def resolve_safe_path(path: str | None = None, allow_external: bool = False) -> Path:
    candidate = Path(path or ".")
    if not candidate.is_absolute():
        candidate = project_root() / candidate
    resolved = candidate.resolve()

    if not allow_external and not is_in_allowed_roots(resolved):
        raise PermissionError(f"Path is outside allowed roots: {path}")
    if resolved.name in BLOCKED_NAMES or resolved.suffix.lower() in BLOCKED_SUFFIXES:
        raise PermissionError(f"Path is blocked: {path}")
    if any(part in BLOCKED_NAMES for part in resolved.parts):
        raise PermissionError(f"Path contains blocked segment: {path}")
    return resolved


def is_blocked_path(path: Path) -> bool:
    return (
        path.name in BLOCKED_NAMES
        or path.suffix.lower() in BLOCKED_SUFFIXES
        or any(part in BLOCKED_NAMES for part in path.parts)
    )


def display_path(path: Path) -> str:
    root = project_root()
    try:
        return str(path.resolve().relative_to(root))
    except ValueError:
        return str(path)
