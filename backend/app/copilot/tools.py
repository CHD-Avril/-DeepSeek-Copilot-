import subprocess
import re
from pathlib import Path
from typing import Any, Callable

from app.agent.permissions import assert_command_allowed
from app.config import get_settings
from app.copilot.safety import (
    COMMAND_TIMEOUT_SECONDS,
    MAX_COMMAND_OUTPUT_BYTES,
    MAX_READ_BYTES,
    display_path,
    is_in_allowed_roots,
    is_blocked_path,
    project_root,
    resolve_safe_path,
)


def _clip(text: str, limit: int = MAX_COMMAND_OUTPUT_BYTES) -> str:
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= limit:
        return text
    return encoded[:limit].decode("utf-8", errors="replace") + "\n...[truncated]"


class ToolPermissionRequired(PermissionError):
    def __init__(self, tool: str, arguments: dict[str, Any], reason: str) -> None:
        super().__init__(reason)
        self.tool = tool
        self.arguments = arguments
        self.reason = reason


def _resolve_tool_path(path: str | None, allow_external: bool) -> Path:
    return resolve_safe_path(path, allow_external=allow_external)


def _requires_external_path_permission(path: str | None) -> bool:
    candidate = Path(path or ".")
    if not candidate.is_absolute():
        candidate = project_root() / candidate
    return not is_in_allowed_roots(candidate.resolve())


def list_dir(path: str = ".", allow_external: bool = False) -> dict[str, Any]:
    target = _resolve_tool_path(path, allow_external)
    if not target.exists():
        raise FileNotFoundError(f"Path does not exist: {path}")
    if not target.is_dir():
        raise NotADirectoryError(f"Not a directory: {path}")

    entries = []
    for item in sorted(target.iterdir(), key=lambda value: (not value.is_dir(), value.name.lower()))[:200]:
        if item.name in {".git", "__pycache__"} or is_blocked_path(item):
            continue
        entries.append(
            {
                "name": item.name,
                "path": display_path(item),
                "type": "directory" if item.is_dir() else "file",
                "size": item.stat().st_size if item.is_file() else None,
            }
        )
    return {"path": display_path(target), "entries": entries}


def read_file(path: str, allow_external: bool = False) -> dict[str, Any]:
    target = _resolve_tool_path(path, allow_external)
    if not target.exists():
        raise FileNotFoundError(f"Path does not exist: {path}")
    if not target.is_file():
        raise IsADirectoryError(f"Not a file: {path}")
    size = target.stat().st_size
    if size > MAX_READ_BYTES:
        raise ValueError(f"File exceeds {MAX_READ_BYTES} byte read limit: {path}")
    return {"path": display_path(target), "content": target.read_text(encoding="utf-8", errors="replace")}


def search_text(query: str, path: str = ".", allow_external: bool = False) -> dict[str, Any]:
    if not query:
        raise ValueError("query is required")
    target = _resolve_tool_path(path, allow_external)
    if not target.exists():
        raise FileNotFoundError(f"Path does not exist: {path}")

    matches: list[dict[str, Any]] = []
    files = [target] if target.is_file() else [item for item in target.rglob("*") if item.is_file()]
    for file_path in files:
        if len(matches) >= 100 or is_blocked_path(file_path):
            continue
        try:
            if file_path.stat().st_size > MAX_READ_BYTES:
                continue
            for line_number, line in enumerate(file_path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                if query.lower() in line.lower():
                    matches.append(
                        {"path": display_path(file_path), "line": line_number, "text": line.strip()[:500]}
                    )
                    if len(matches) >= 100:
                        break
        except (OSError, UnicodeError):
            continue
    return {"query": query, "path": display_path(target), "matches": matches}


def run_command(command: str, allow_execute: bool = False) -> dict[str, Any]:
    if not allow_execute:
        raise ToolPermissionRequired("run_command", {"command": command}, "Command execution requires approval.")
    settings = get_settings()
    assert_command_allowed(command, settings.agent_permission)
    completed = subprocess.run(
        command,
        cwd=project_root(),
        shell=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    return {"exit_code": completed.returncode, "output": _clip(completed.stdout)}


def _patch_paths(patch: str) -> list[str]:
    paths: list[str] = []
    for line in patch.splitlines():
        if not line.startswith(("--- ", "+++ ")):
            continue
        raw = line[4:].split("\t", 1)[0].strip()
        if raw == "/dev/null":
            continue
        raw = re.sub(r"^[ab]/", "", raw)
        paths.append(raw)
    return paths


def _validate_patch_paths(patch: str) -> list[str]:
    paths = _patch_paths(patch)
    if not paths:
        raise ValueError("Patch does not contain any file paths.")
    for path in paths:
        target = resolve_safe_path(path)
        if not is_in_allowed_roots(target):
            raise PermissionError(f"Patch touches a path outside allowed roots: {path}")
        if is_blocked_path(target):
            raise PermissionError(f"Patch touches a blocked path: {path}")
    return sorted(set(paths))


def preview_patch(patch: str) -> dict[str, Any]:
    paths = _validate_patch_paths(patch)
    normalized_patch = patch if patch.endswith("\n") else f"{patch}\n"
    check = subprocess.run(
        ["git", "apply", "--check", "--whitespace=nowarn"],
        cwd=project_root(),
        input=normalized_patch,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    return {"ok": check.returncode == 0, "paths": paths, "patch": _clip(normalized_patch), "check_output": _clip(check.stdout)}


def apply_patch(patch: str, allow_edit: bool = False) -> dict[str, Any]:
    if not allow_edit:
        raise ToolPermissionRequired("apply_patch", {"patch": patch}, "Applying a patch requires approval.")
    preview = preview_patch(patch)
    if not preview["ok"]:
        raise ValueError(f"Patch check failed: {preview['check_output']}")
    applied = subprocess.run(
        ["git", "apply", "--whitespace=nowarn"],
        cwd=project_root(),
        input=patch if patch.endswith("\n") else f"{patch}\n",
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    return {"ok": applied.returncode == 0, "paths": preview["paths"], "output": _clip(applied.stdout)}


def write_file(path: str, content: str, allow_edit: bool = False) -> dict[str, Any]:
    target = _resolve_tool_path(path, allow_external=False)
    if not allow_edit:
        raise ToolPermissionRequired("write_file", {"path": path, "content": content}, "Writing a file requires approval.")
    if not target.exists():
        raise FileNotFoundError(f"File does not exist: {path}")
    if not target.is_file():
        raise IsADirectoryError(f"Not a file: {path}")
    target.write_text(content, encoding="utf-8")
    return {"path": display_path(target), "bytes": len(content.encode("utf-8"))}


def create_file(path: str, content: str, allow_edit: bool = False) -> dict[str, Any]:
    target = _resolve_tool_path(path, allow_external=False)
    if not allow_edit:
        raise ToolPermissionRequired("create_file", {"path": path, "content": content}, "Creating a file requires approval.")
    if target.exists():
        raise FileExistsError(f"File already exists: {path}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"path": display_path(target), "bytes": len(content.encode("utf-8"))}


def delete_file(path: str, allow_edit: bool = False) -> dict[str, Any]:
    target = _resolve_tool_path(path, allow_external=False)
    if not allow_edit:
        raise ToolPermissionRequired("delete_file", {"path": path}, "Deleting a file requires approval.")
    if not target.exists():
        raise FileNotFoundError(f"File does not exist: {path}")
    if not target.is_file():
        raise IsADirectoryError(f"Not a file: {path}")
    size = target.stat().st_size
    target.unlink()
    return {"path": display_path(target), "deleted_bytes": size}


def get_project_tree() -> dict[str, Any]:
    root = project_root()
    ignored = {".git", "node_modules", "__pycache__", ".pytest_cache", "dist", "build"}
    lines: list[str] = []

    def walk(path: Path, prefix: str = "", depth: int = 0) -> None:
        if depth > 4 or len(lines) >= 300:
            return
        children = [
            item
            for item in sorted(path.iterdir(), key=lambda value: value.name.lower())
            if item.name not in ignored and not is_blocked_path(item)
        ]
        for index, child in enumerate(children):
            connector = "`-- " if index == len(children) - 1 else "|-- "
            lines.append(f"{prefix}{connector}{child.name}")
            if child.is_dir():
                extension = "    " if index == len(children) - 1 else "|   "
                walk(child, prefix + extension, depth + 1)

    walk(root)
    return {"root": str(root), "tree": "\n".join(lines)}


TOOLS: dict[str, Callable[..., dict[str, Any]]] = {
    "list_dir": list_dir,
    "read_file": read_file,
    "search_text": search_text,
    "run_command": run_command,
    "preview_patch": preview_patch,
    "apply_patch": apply_patch,
    "write_file": write_file,
    "create_file": create_file,
    "delete_file": delete_file,
    "get_project_tree": get_project_tree,
}


def execute_tool(name: str, arguments: dict[str, Any], approved: bool = False) -> dict[str, Any]:
    tool = TOOLS.get(name)
    if not tool:
        raise ValueError(f"Unknown tool: {name}")
    if name in {"list_dir", "read_file", "search_text"} and _requires_external_path_permission(arguments.get("path")):
        if not approved:
            raise ToolPermissionRequired(name, arguments, "Reading outside the project requires approval.")
        return tool(**arguments, allow_external=True)
    if name == "run_command":
        return tool(**arguments, allow_execute=approved)
    if name in {"apply_patch", "write_file", "create_file", "delete_file"}:
        return tool(**arguments, allow_edit=approved)
    return tool(**arguments)
