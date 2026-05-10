import subprocess
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.agent.permissions import assert_command_allowed
from app.audit.logger import audit
from app.config import get_settings


@dataclass
class AgentRun:
    id: str
    prompt: str
    command: str
    status: str = "queued"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    logs: list[str] = field(default_factory=list)
    process: subprocess.Popen | None = None


class CopilotRunner:
    def __init__(self) -> None:
        self.runs: dict[str, AgentRun] = {}

    def start(self, prompt: str, command: str | None = None) -> AgentRun:
        settings = get_settings()
        base_command = command or f'{settings.copilot_command} "{prompt}"'
        assert_command_allowed(base_command, settings.agent_permission)

        run = AgentRun(id=str(uuid4()), prompt=prompt, command=base_command)
        self.runs[run.id] = run
        audit("agent.run_requested", {"run_id": run.id, "command": base_command})
        thread = threading.Thread(target=self._execute, args=(run,), daemon=True)
        thread.start()
        return run

    def _execute(self, run: AgentRun) -> None:
        settings = get_settings()
        workspace = Path(settings.workspace_root)
        workspace.mkdir(parents=True, exist_ok=True)
        run.status = "running"
        run.updated_at = datetime.now(timezone.utc).isoformat()
        try:
            process = subprocess.Popen(
                run.command,
                cwd=workspace,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            run.process = process
            assert process.stdout is not None
            for line in process.stdout:
                run.logs.append(line.rstrip())
            exit_code = process.wait()
            run.status = "completed" if exit_code == 0 else "failed"
            audit("agent.run_finished", {"run_id": run.id, "status": run.status, "exit_code": exit_code})
        except Exception as exc:
            run.status = "failed"
            run.logs.append(str(exc))
            audit("agent.run_failed", {"run_id": run.id, "error": str(exc)})
        finally:
            run.updated_at = datetime.now(timezone.utc).isoformat()

    def get(self, run_id: str) -> AgentRun | None:
        return self.runs.get(run_id)

    def stop(self, run_id: str) -> AgentRun | None:
        run = self.runs.get(run_id)
        if run and run.process and run.status == "running":
            run.process.terminate()
            run.status = "stopped"
            run.updated_at = datetime.now(timezone.utc).isoformat()
            audit("agent.run_stopped", {"run_id": run.id})
        return run


runner = CopilotRunner()
