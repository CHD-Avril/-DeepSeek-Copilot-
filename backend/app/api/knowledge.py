from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.audit.logger import audit
from app.rag import retriever


router = APIRouter(prefix="/kb", tags=["knowledge"])


class IngestRequest(BaseModel):
    file_id: str | None = None


class QueryRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = 5


@router.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".txt", ".md", ".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    file_id = str(uuid4())
    safe_name = f"{file_id}{suffix}"
    target = retriever.docs_dir() / safe_name
    target.write_bytes(await file.read())
    audit("kb.uploaded", {"file_id": file_id, "filename": file.filename})
    return {"id": file_id, "filename": safe_name}


@router.post("/ingest")
def ingest(request: IngestRequest) -> dict:
    files = retriever.list_files()
    selected = [item for item in files if not request.file_id or item["id"] == request.file_id]
    if not selected:
        raise HTTPException(status_code=404, detail="No files to ingest")
    results = [retriever.ingest_file(retriever.docs_dir() / item["filename"]) for item in selected]
    audit("kb.ingested", {"count": len(results)})
    return {"results": results}


@router.get("/files")
def files() -> dict:
    return {"files": retriever.list_files()}


@router.delete("/files/{file_id}")
def delete_file(file_id: str) -> dict:
    removed = retriever.remove_file(file_id)
    if not removed:
        raise HTTPException(status_code=404, detail="File not found")
    audit("kb.deleted", {"file_id": file_id})
    return {"removed": True}


@router.post("/query")
def query(request: QueryRequest) -> dict:
    results = retriever.query(request.query, request.top_k)
    audit("kb.queried", {"query": request.query, "results": len(results)})
    return {"results": results}
