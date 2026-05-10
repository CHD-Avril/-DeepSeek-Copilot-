@echo off
setlocal

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env from .env.example. Update DEEPSEEK_API_KEY before using chat features.
)

if "%~1"=="docker" (
  start "DeepSeek Copilot Docker" cmd /k "cd /d %~dp0 && docker compose up --build"
  echo Waiting for Docker services...
  timeout /t 8 /nobreak >nul
  start "" "http://localhost:3000"
  goto :eof
)

echo Starting backend and frontend in separate windows...
start "DeepSeek Copilot Backend" cmd /k "cd /d %~dp0backend && python -m venv .venv && call .venv\Scripts\activate && pip install -r requirements.txt && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "DeepSeek Copilot Frontend" cmd /k "cd /d %~dp0frontend && npm install && npm run dev -- --host 0.0.0.0 --port 3000"

echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo Opening browser...
timeout /t 5 /nobreak >nul
start "" "http://localhost:3000"
