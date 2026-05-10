import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.copilot.schemas import CopilotEvent, CopilotRun


class CopilotStore:
    def __init__(self, db_path: Path | None = None) -> None:
        settings = get_settings()
        self.db_path = db_path or Path(settings.log_dir) / "copilot.sqlite3"
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _init_db(self) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS copilot_runs (
                    id TEXT PRIMARY KEY,
                    prompt TEXT NOT NULL,
                    status TEXT NOT NULL,
                    final_answer TEXT NOT NULL DEFAULT '',
                    error TEXT NOT NULL DEFAULT '',
                    max_steps INTEGER NOT NULL DEFAULT 8,
                    model TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS copilot_events (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    data TEXT NOT NULL DEFAULT '{}',
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY(run_id) REFERENCES copilot_runs(id) ON DELETE CASCADE
                )
                """
            )
            connection.execute("CREATE INDEX IF NOT EXISTS idx_copilot_events_run_id ON copilot_events(run_id)")
            connection.commit()

    def save_run(self, run: CopilotRun) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO copilot_runs (
                    id, prompt, status, final_answer, error, max_steps, model, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    prompt=excluded.prompt,
                    status=excluded.status,
                    final_answer=excluded.final_answer,
                    error=excluded.error,
                    max_steps=excluded.max_steps,
                    model=excluded.model,
                    updated_at=excluded.updated_at
                """,
                (
                    run.id,
                    run.prompt,
                    run.status,
                    run.final_answer,
                    run.error,
                    run.max_steps,
                    run.model,
                    run.created_at,
                    run.updated_at,
                ),
            )
            connection.commit()

    def save_event(self, run_id: str, event: CopilotEvent) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO copilot_events (id, run_id, type, message, data, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (event.id, run_id, event.type, event.message, json.dumps(event.data, ensure_ascii=False), event.timestamp),
            )
            connection.commit()

    def get_run(self, run_id: str) -> CopilotRun | None:
        with self._lock, self._connect() as connection:
            row = connection.execute("SELECT * FROM copilot_runs WHERE id = ?", (run_id,)).fetchone()
            if not row:
                return None
            events = self._load_events(connection, run_id)
            return self._row_to_run(row, events)

    def list_runs(self, limit: int = 50) -> list[CopilotRun]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM copilot_runs ORDER BY updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [self._row_to_run(row, self._load_events(connection, row["id"])) for row in rows]

    def delete_run(self, run_id: str) -> bool:
        with self._lock, self._connect() as connection:
            cursor = connection.execute("DELETE FROM copilot_runs WHERE id = ?", (run_id,))
            connection.commit()
            return cursor.rowcount > 0

    def _load_events(self, connection: sqlite3.Connection, run_id: str) -> list[CopilotEvent]:
        rows = connection.execute(
            "SELECT * FROM copilot_events WHERE run_id = ? ORDER BY timestamp ASC",
            (run_id,),
        ).fetchall()
        events: list[CopilotEvent] = []
        for row in rows:
            try:
                data: dict[str, Any] = json.loads(row["data"])
            except json.JSONDecodeError:
                data = {}
            events.append(
                CopilotEvent(
                    id=row["id"],
                    type=row["type"],
                    message=row["message"],
                    data=data,
                    timestamp=row["timestamp"],
                )
            )
        return events

    @staticmethod
    def _row_to_run(row: sqlite3.Row, events: list[CopilotEvent]) -> CopilotRun:
        return CopilotRun(
            id=row["id"],
            prompt=row["prompt"],
            status=row["status"],
            final_answer=row["final_answer"],
            error=row["error"],
            max_steps=row["max_steps"],
            model=row["model"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            events=events,
        )
