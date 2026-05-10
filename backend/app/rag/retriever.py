import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.config import get_settings
from app.rag.embeddings import cosine, embed
from app.rag.loader import load_text
from app.rag.splitter import split_text


def index_path() -> Path:
    path = Path(get_settings().knowledge_base_dir) / "index" / "documents.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def docs_dir() -> Path:
    path = Path(get_settings().knowledge_base_dir) / "docs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def list_files() -> list[dict[str, Any]]:
    directory = docs_dir()
    return [
        {"id": path.stem, "filename": path.name, "size": path.stat().st_size}
        for path in sorted(directory.iterdir())
        if path.is_file()
    ]


def ingest_file(path: Path) -> dict[str, Any]:
    text = load_text(path)
    chunks = split_text(text)
    file_id = path.stem
    entries = [
        {
            "id": str(uuid4()),
            "file_id": file_id,
            "filename": path.name,
            "chunk": chunk,
            "embedding": embed(chunk),
        }
        for chunk in chunks
    ]
    existing = [entry for entry in read_index() if entry.get("file_id") != file_id]
    with index_path().open("w", encoding="utf-8") as handle:
        for entry in existing + entries:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return {"file_id": file_id, "filename": path.name, "chunks": len(entries)}


def read_index() -> list[dict[str, Any]]:
    path = index_path()
    if not path.exists():
        return []
    entries: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return entries


def remove_file(file_id: str) -> bool:
    removed = False
    for path in docs_dir().iterdir():
        if path.is_file() and path.stem == file_id:
            path.unlink()
            removed = True
    remaining = [entry for entry in read_index() if entry.get("file_id") != file_id]
    with index_path().open("w", encoding="utf-8") as handle:
        for entry in remaining:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return removed


def query(text: str, top_k: int = 5) -> list[dict[str, Any]]:
    query_vector = embed(text)
    scored = []
    for entry in read_index():
        scored.append(
            {
                "id": entry["id"],
                "file_id": entry["file_id"],
                "filename": entry["filename"],
                "chunk": entry["chunk"],
                "score": cosine(query_vector, entry["embedding"]),
            }
        )
    return sorted(scored, key=lambda item: item["score"], reverse=True)[:top_k]
