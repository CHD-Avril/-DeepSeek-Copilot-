# DeepSeek Copilot Workbench

DeepSeek Copilot Workbench is a local web console for combining DeepSeek chat, a controlled Copilot/Codex-style CLI runner, lightweight RAG, audit logs, and Docker-based deployment.

## Features

- FastAPI backend with chat, model config, agent, knowledge base, and logs APIs.
- React frontend with dashboard, agent runs, knowledge search, logs, and settings views.
- Local file ingestion for `.txt`, `.md`, `.pdf`, and `.docx` documents.
- Simple local vector-like retrieval using hashed bag-of-words embeddings.
- Permission checks for agent execution and an append-only JSONL audit log.
- Persistent Copilot run history in SQLite at `logs/copilot.sqlite3`, including run state and event timelines.
- Controlled file-edit tools for patch preview, patch application, file creation, replacement, and deletion with approval gates.
- Docker Compose services for backend, frontend, and optional Chroma.

## Quick Start

```powershell
copy .env.example .env
notepad .env
.\start-copilot-deepseek.cmd
```

Open `http://localhost:3000`.

## Docker

```powershell
copy .env.example .env
docker compose up --build
```

## Important Environment Variables

- `DEEPSEEK_API_KEY`: DeepSeek API key.
- `DEEPSEEK_BASE_URL`: defaults to `https://api.deepseek.com`.
- `DEFAULT_MODEL`: defaults to `deepseek-chat`.
- `WORKSPACE_ROOT`: folder exposed to the agent runner.
- `COPILOT_COMMAND`: CLI command used by the agent runner, for example `codex`.
- `AGENT_PERMISSION`: `READ_ONLY`, `EDIT_ALLOWED`, `COMMAND_ALLOWED`, or `ADMIN`.

## API Surface

- `POST /api/chat`
- `POST /api/models/test`
- `GET /api/models/config`
- `POST /api/copilot/runs`
- `GET /api/copilot/runs`
- `GET /api/copilot/runs/{id}`
- `GET /api/copilot/runs/{id}/events`
- `DELETE /api/copilot/runs/{id}`
- `POST /api/copilot/runs/{id}/stop`
- `POST /api/copilot/runs/{id}/permissions`
- `POST /api/agent/run`
- `GET /api/agent/runs/{id}`
- `GET /api/agent/runs/{id}/logs`
- `POST /api/agent/runs/{id}/stop`
- `POST /api/kb/upload`
- `POST /api/kb/ingest`
- `GET /api/kb/files`
- `DELETE /api/kb/files/{id}`
- `POST /api/kb/query`
- `GET /api/logs`

## Safety Model

Agent commands are checked before execution. Destructive shell patterns such as recursive deletion, disk formatting, or hard git resets are blocked unless `AGENT_PERMISSION=ADMIN`. Copilot file changes require explicit approval, and patch application is validated with `git apply --check` before writing. Every command request, execution result, model test, upload, ingest, and query is written to `logs/audit.jsonl`.
