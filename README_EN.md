# DeepSeek Copilot Workbench

DeepSeek Copilot Workbench is a local web console that combines DeepSeek chat, controlled Agent execution, lightweight knowledge-base retrieval, audit logging, and Docker deployment in one interface.

## Current Capabilities

- FastAPI backend with chat, model config, Copilot Agent, legacy command Agent, knowledge base, and audit log APIs.
- React frontend with dashboard, AI Agent, knowledge base, audit log, and settings views.
- Copilot Agent that asks DeepSeek for structured JSON, invokes controlled tools step by step, and exposes the full event stream in the UI.
- Persistent run history: Copilot runs and events are stored in SQLite at `logs/copilot.sqlite3`.
- Approval gates for command execution, file writes, patch application, file creation, and file deletion.
- File tools for `preview_patch`, `apply_patch`, `write_file`, `create_file`, and `delete_file`.
- Knowledge-base ingestion for `.txt`, `.md`, `.pdf`, and `.docx` files with lightweight local hashed bag-of-words retrieval.
- Audit logging for model tests, command requests, execution results, uploads, ingestion, and queries in `logs/audit.jsonl`.

## Quick Start

```powershell
copy .env.example .env
notepad .env
.\start-copilot-deepseek.cmd
```

Then open:

- Frontend: `http://localhost:3000`
- Backend health check: `http://localhost:8000/health`

You can also start the services manually:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
cd frontend
npm.cmd run dev
```

## Docker

```powershell
copy .env.example .env
docker compose up --build
```

## Important Environment Variables

- `DEEPSEEK_API_KEY`: DeepSeek API key.
- `DEEPSEEK_BASE_URL`: DeepSeek API base URL, defaults to `https://api.deepseek.com`.
- `DEFAULT_MODEL`: default model, defaults to `deepseek-chat`.
- `WORKSPACE_ROOT`: workspace folder exposed to the Agent.
- `KNOWLEDGE_BASE_DIR`: knowledge-base file directory.
- `LOG_DIR`: directory for audit logs and the Copilot SQLite database.
- `AGENT_PERMISSION`: legacy command Agent permission mode: `READ_ONLY`, `EDIT_ALLOWED`, `COMMAND_ALLOWED`, or `ADMIN`.
- `BACKEND_CORS_ORIGINS`: comma-separated list of frontend origins allowed by the backend.

## Copilot Agent Flow

1. The frontend calls `POST /api/copilot/runs` to create a run.
2. The backend persists run state and events to SQLite.
3. DeepSeek must return one JSON object: either `tool_call` or `final`.
4. The backend validates the JSON schema; invalid output records `model_json_invalid` and gets one repair attempt.
5. Tool calls, tool results, permission requests, permission decisions, and final answers are appended to the event stream.
6. The frontend polls the run and events, showing history, current status, final output, and permission prompts.

## Copilot Tools

- `list_dir(path)`: list files in an allowed directory.
- `read_file(path)`: read a UTF-8 text file.
- `search_text(query, path)`: search text.
- `get_project_tree()`: return a compact project tree.
- `run_command(command)`: run an allowed command after approval.
- `preview_patch(patch)`: validate and preview a unified diff without writing files.
- `apply_patch(patch)`: apply a unified diff after approval and `git apply --check`.
- `write_file(path, content)`: replace an existing file after approval.
- `create_file(path, content)`: create a new file after approval.
- `delete_file(path)`: delete a file after approval.

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

Copilot access is limited to allowed roots such as the project root, `workspace`, and `knowledge_base`, and blocked files such as `.env`, private keys, and key material are rejected. File-editing tools require explicit frontend approval, and patch application is checked with `git apply --check` before writing. Command execution goes through the permission policy; unless `AGENT_PERMISSION=ADMIN`, destructive shell patterns such as recursive deletion, disk formatting, and hard Git resets are blocked.

## Development Checks

```powershell
python -m compileall backend\app
```

```powershell
cd backend
.\.venv\Scripts\python.exe -c "from app.main import app; print(app.title)"
```

```powershell
cd frontend
npm.cmd run build
```
