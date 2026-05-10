from enum import Enum


class PermissionLevel(str, Enum):
    READ_ONLY = "READ_ONLY"
    EDIT_ALLOWED = "EDIT_ALLOWED"
    COMMAND_ALLOWED = "COMMAND_ALLOWED"
    ADMIN = "ADMIN"


READ_ONLY_COMMANDS = ("dir", "ls", "rg", "git status", "git diff", "python -m pytest", "npm test", "npm run build")
BLOCKED_PATTERNS = ("rm -rf", "del /s", "format", "git reset --hard", "shutdown", "powershell -enc")


def assert_command_allowed(command: str, permission: str) -> None:
    normalized = " ".join(command.lower().split())
    level = PermissionLevel(permission)
    if level == PermissionLevel.ADMIN:
        return
    if any(pattern in normalized for pattern in BLOCKED_PATTERNS):
        raise PermissionError(f"Blocked command pattern: {command}")
    if level == PermissionLevel.READ_ONLY:
        if not any(normalized.startswith(allowed) for allowed in READ_ONLY_COMMANDS):
            raise PermissionError(f"READ_ONLY does not allow command: {command}")
    if level == PermissionLevel.EDIT_ALLOWED and any(pattern in normalized for pattern in BLOCKED_PATTERNS):
        raise PermissionError(f"EDIT_ALLOWED blocked command: {command}")
