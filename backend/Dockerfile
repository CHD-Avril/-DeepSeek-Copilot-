FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

ENV WORKSPACE_ROOT=/workspace
ENV KNOWLEDGE_BASE_DIR=/app/knowledge_base
ENV LOG_DIR=/app/logs

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
