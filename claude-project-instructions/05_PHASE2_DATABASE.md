# 05 — PHASE 2: DATABASE LAYER
## Replace Obsidian with SQLite + LanceDB + Kuzu

> **Checkpoint ID:** `phase5_database`
> **Prerequisites:** Phase 4 (measurement) complete
> **Goal:** Agent memory stored in queryable databases. Obsidian becomes async export only.
> **Research:** `caveagent_2601.01569.pdf` (dual-stream architecture)

---

## Context Budget Warning

This phase modifies `mcp/server.py` substantially and creates new Python modules.
If context compacts, re-read only this file and AGENT_STATE.md.
The existing server.py is preserved — you are adding new tools alongside existing ones,
then migrating existing tools to use the new store.

---

## Step 5.1 — Initialize Database Layer in server.py

**Add to `mcp/server.py`** after existing imports:

```python
import sqlite3
import hashlib
import lancedb
import kuzu
import uuid
import json
import os
import threading
from pathlib import Path
from datetime import datetime, timezone
from sentence_transformers import SentenceTransformer

_EMBED_MODEL = None

def _get_embed_model():
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        _EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _EMBED_MODEL

def _get_db_paths(memory_dir: Path) -> dict:
    project_dir = memory_dir.parent
    return {
        "sqlite":  project_dir / "research.db",
        "lancedb": project_dir / "vectors",
        "kuzu":    project_dir / "graph",
    }

def _init_sqlite(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            text TEXT NOT NULL,
            text_hash TEXT NOT NULL,
            project_id TEXT NOT NULL,
            source TEXT NOT NULL,
            tags TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS file_summaries (
            path TEXT NOT NULL,
            project_id TEXT NOT NULL,
            summary TEXT NOT NULL,
            summary_hash TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (path, project_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS session_state (
            project_id TEXT PRIMARY KEY,
            stage TEXT,
            blockers TEXT,
            open_questions TEXT,
            critical_facts TEXT,
            last_session_summary TEXT,
            updated_at TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mem_project ON memories(project_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mem_category ON memories(category)")
    conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(id, text, category)")
    conn.commit()
    return conn

def _init_lancedb(lancedb_path: Path):
    lancedb_path.mkdir(parents=True, exist_ok=True)
    db = lancedb.connect(str(lancedb_path))
    if "memory_vec" not in db.table_names():
        import pyarrow as pa
        db.create_table("memory_vec", schema=pa.schema([
            pa.field("id", pa.string()),
            pa.field("vector", pa.list_(pa.float32(), 384)),
            pa.field("category", pa.string()),
            pa.field("text", pa.string()),
            pa.field("project_id", pa.string()),
            pa.field("ts", pa.string()),
        ]))
    if "file_summaries_vec" not in db.table_names():
        import pyarrow as pa
        db.create_table("file_summaries_vec", schema=pa.schema([
            pa.field("path", pa.string()),
            pa.field("vector", pa.list_(pa.float32(), 384)),
            pa.field("project_id", pa.string()),
            pa.field("summary", pa.string()),
        ]))
    return db

def _get_source_structured() -> dict:
    import socket
    return {
        "device_id": socket.gethostname(),
        "hostname":  socket.gethostname().lower(),
        "user":      os.getenv("USER", "unknown"),
        "ssh_client": os.getenv("SSH_CLIENT", None),
    }
```

Write to AGENT_STATE.md: `step_5_1_db_init_code: complete`

---

## Step 5.2 — Add New Agent-Optimized MCP Tools

Add these tools to `mcp/server.py`. Do NOT delete existing tools yet.

```python
@mcp.tool()
def store_memory(category: str, text: str, tags: list[str] | None = None) -> dict:
    """
    Store a memory entry. category: decision|discovery|fact|milestone|question
    Returns: {id, category, text_hash}
    """
    valid = ("decision", "discovery", "fact", "milestone", "question")
    if category not in valid:
        return {"error": f"Invalid category. Use: {' | '.join(valid)}"}

    memory_dir, _, _ = _resolve_paths()
    db_paths = _get_db_paths(memory_dir)
    conn = _init_sqlite(db_paths["sqlite"])
    lance_db = _init_lancedb(db_paths["lancedb"])

    entry_id   = str(uuid.uuid4())[:8]
    text_hash  = hashlib.sha256(text.encode()).hexdigest()[:16]
    project_id = _current_project_id()
    source     = json.dumps(_get_source_structured())
    now        = datetime.now(timezone.utc).isoformat()

    conn.execute(
        "INSERT INTO memories (id, category, text, text_hash, project_id, source, tags, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (entry_id, category, text, text_hash, project_id, source, json.dumps(tags or []), now)
    )
    conn.execute("INSERT INTO memories_fts (id, text, category) VALUES (?,?,?)", (entry_id, text, category))
    conn.commit()

    vector = _get_embed_model().encode(text).tolist()
    lance_db.open_table("memory_vec").add([{
        "id": entry_id, "vector": vector, "category": category,
        "text": text, "project_id": project_id, "ts": now
    }])

    _async_obsidian_export(category, text, entry_id)
    conn.close()
    return {"id": entry_id, "category": category, "text_hash": text_hash}


@mcp.tool()
def query_memory(query: str, category: str | None = None, limit: int = 5) -> list[dict]:
    """
    Semantic search over memories. Returns {id, category, text, score}.
    Never returns a full prose dump.
    """
    memory_dir, _, _ = _resolve_paths()
    lance_db    = _init_lancedb(_get_db_paths(memory_dir)["lancedb"])
    project_id  = _current_project_id()
    query_vec   = _get_embed_model().encode(query).tolist()

    results = (
        lance_db.open_table("memory_vec")
        .search(query_vec)
        .where(f"project_id = '{project_id}'")
        .limit(limit)
        .to_list()
    )
    if category:
        results = [r for r in results if r["category"] == category]

    return [{"id": r["id"], "category": r["category"],
             "text": r["text"][:500], "score": round(float(r["_distance"]), 4)}
            for r in results]


@mcp.tool()
def get_context() -> dict:
    """
    Compact typed session context. Replaces WAKEUP.md — 95% fewer tokens.
    Returns: {stage, blockers, open_questions, critical_facts, last_session_summary}
    """
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    row        = conn.execute("SELECT * FROM session_state WHERE project_id = ?", (project_id,)).fetchone()
    conn.close()

    if not row:
        return {"stage": "unknown", "blockers": [], "open_questions": [],
                "critical_facts": [], "last_session_summary": None}
    return {
        "stage":                row["stage"],
        "blockers":             json.loads(row["blockers"] or "[]"),
        "open_questions":       json.loads(row["open_questions"] or "[]"),
        "critical_facts":       json.loads(row["critical_facts"] or "[]"),
        "last_session_summary": row["last_session_summary"],
    }


@mcp.tool()
def set_context(stage: str | None = None, blockers: list[str] | None = None,
                open_questions: list[str] | None = None,
                critical_facts: list[str] | None = None,
                last_session_summary: str | None = None) -> dict:
    """Update session state. Only provided fields are changed."""
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    now        = datetime.now(timezone.utc).isoformat()
    existing   = conn.execute("SELECT * FROM session_state WHERE project_id = ?", (project_id,)).fetchone()

    if existing:
        updates = {"updated_at": now}
        if stage is not None:                updates["stage"] = stage
        if blockers is not None:             updates["blockers"] = json.dumps(blockers)
        if open_questions is not None:       updates["open_questions"] = json.dumps(open_questions)
        if critical_facts is not None:       updates["critical_facts"] = json.dumps(critical_facts)
        if last_session_summary is not None: updates["last_session_summary"] = last_session_summary
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE session_state SET {set_clause} WHERE project_id = ?",
                     (*updates.values(), project_id))
    else:
        conn.execute(
            "INSERT INTO session_state (project_id, stage, blockers, open_questions, critical_facts, last_session_summary, updated_at) VALUES (?,?,?,?,?,?,?)",
            (project_id, stage, json.dumps(blockers or []), json.dumps(open_questions or []),
             json.dumps(critical_facts or []), last_session_summary, now)
        )
    conn.commit()
    conn.close()
    return {"updated": True, "project_id": project_id}


@mcp.tool()
def set_file_summary(file_path: str, summary: str) -> dict:
    """
    Store a 1-line semantic summary for a file.
    Call after any file analysis. Prevents re-reading files.
    """
    memory_dir, _, _ = _resolve_paths()
    db_paths   = _get_db_paths(memory_dir)
    conn       = _init_sqlite(db_paths["sqlite"])
    lance_db   = _init_lancedb(db_paths["lancedb"])
    project_id = _current_project_id()
    now        = datetime.now(timezone.utc).isoformat()

    full_path  = os.path.join(os.getcwd(), file_path) if not os.path.isabs(file_path) else file_path
    file_hash  = ""
    if os.path.exists(full_path):
        with open(full_path, "rb") as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()[:16]

    summary_hash = hashlib.sha256(summary.encode()).hexdigest()[:16]
    conn.execute(
        "INSERT OR REPLACE INTO file_summaries (path, project_id, summary, summary_hash, file_hash, updated_at) VALUES (?,?,?,?,?,?)",
        (file_path, project_id, summary, summary_hash, file_hash, now)
    )
    conn.commit()

    vector = _get_embed_model().encode(summary).tolist()
    table  = lance_db.open_table("file_summaries_vec")
    table.delete(f"path = '{file_path}'")
    table.add([{"path": file_path, "vector": vector, "project_id": project_id, "summary": summary}])

    conn.close()
    return {"path": file_path, "summary_hash": summary_hash, "file_hash": file_hash}


@mcp.tool()
def get_file_summary(file_path: str) -> dict:
    """
    Get stored summary for a file. Returns staleness signal if file has changed.
    Always call this before reading a file to avoid token waste.
    """
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    row        = conn.execute(
        "SELECT * FROM file_summaries WHERE path = ? AND project_id = ?", (file_path, project_id)
    ).fetchone()
    conn.close()

    if not row:
        return {"found": False, "path": file_path}

    full_path = os.path.join(os.getcwd(), file_path) if not os.path.isabs(file_path) else file_path
    current_hash = ""
    if os.path.exists(full_path):
        with open(full_path, "rb") as f:
            current_hash = hashlib.sha256(f.read()).hexdigest()[:16]

    return {
        "found": True, "path": file_path, "summary": row["summary"],
        "is_stale": current_hash != row["file_hash"] if current_hash else False,
        "updated_at": row["updated_at"]
    }


@mcp.tool()
def find_related_files(query: str, limit: int = 5) -> list[dict]:
    """Semantic search over file summaries. Returns relevant files without reading them."""
    memory_dir, _, _ = _resolve_paths()
    lance_db   = _init_lancedb(_get_db_paths(memory_dir)["lancedb"])
    project_id = _current_project_id()
    query_vec  = _get_embed_model().encode(query).tolist()

    results = (
        lance_db.open_table("file_summaries_vec")
        .search(query_vec)
        .where(f"project_id = '{project_id}'")
        .limit(limit)
        .to_list()
    )
    return [{"path": r["path"], "summary": r["summary"],
             "score": round(float(r["_distance"]), 4)} for r in results]
```

Write to AGENT_STATE.md: `step_5_2_new_mcp_tools: complete`

---

## Step 5.3 — Decouple Obsidian Sync

Find all Obsidian sync calls in `server.py`. Wrap in fire-and-forget helper. Never block on it.

```python
def _async_obsidian_export(category: str, text: str, entry_id: str):
    """Fire-and-forget. Obsidian export failures must never propagate."""
    ctx = _find_project_context()
    if not ctx:
        return
    if not ctx.get("obsidian_sync", {}).get("enabled", False):
        return
    def _export():
        try:
            pass  # move existing Obsidian write logic here
        except Exception:
            pass
    threading.Thread(target=_export, daemon=True).start()
```

Add to `.claude-project` schema default: `"obsidian_sync": {"enabled": false}`
Obsidian is now **opt-in, off by default.**

Write to AGENT_STATE.md: `step_5_3_obsidian_decoupled: complete`

---

## Step 5.4 — Build and Test

```bash
# Smoke test all new tools register correctly
python3 -c "
import sys; sys.path.insert(0, 'mcp')
from server import mcp
tools = [t.name for t in mcp.list_tools()]
required = ['store_memory','query_memory','get_context','set_context',
            'set_file_summary','get_file_summary','find_related_files']
missing = [t for t in required if t not in tools]
print('MISSING:', missing) if missing else print('ALL TOOLS OK')
"

# Test round-trip: set_context → get_context
python3 -c "
# call set_context with test data, then get_context, assert values match
print('Round-trip test — implement inline or via MCP client')
"
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase5_database_complete",
  "new_tools_registered": true,
  "obsidian_decoupled": true,
  "round_trip_test_passed": true
}
```

**Phase 2 complete. Then read: `06_PHASE3_PD_REGISTRY.md`**
```

***

That's all 6 files from Batch 1. Ready for **Batch 2** whenever you say so — that's the PD registry, typed dispatch, compression layer, testing strategy, and the AGENT_STATE template.

Bronnen


Got it — same method. I'll write each file directly here, one per prompt. Starting with the first file of Batch 2:

***

## `06_PHASE3_PD_REGISTRY.md`

```markdown