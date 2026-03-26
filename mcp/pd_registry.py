# mcp/pd_registry.py
# Content-addressed Protocol Document registry.
# A PD's id is SHA-256(full_pd_text) — identical PDs deduplicate automatically.
import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Optional


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def register_pd_entry(
    conn: sqlite3.Connection,
    text: str,
    task_type: str,
    interaction_pair: str,
    created_by: str,
    yaml_meta: Optional[dict] = None,
) -> dict:
    """
    Content-address and store a Protocol Document.
    Returns {id, is_new} — id is SHA-256 of full text.
    Identical PD text always maps to the same id (no duplicates).
    """
    pd_id = _sha256(text)
    now = datetime.now(timezone.utc).isoformat()

    existing = conn.execute(
        "SELECT id, use_count FROM pd_registry WHERE id = ?", (pd_id,)
    ).fetchone()

    if existing:
        return {"id": pd_id, "is_new": False, "use_count": existing["use_count"]}

    conn.execute(
        """INSERT INTO pd_registry
           (id, text, yaml_meta, task_type, interaction_pair, created_at, created_by,
            use_count, deprecated)
           VALUES (?,?,?,?,?,?,?,0,0)""",
        (
            pd_id, text,
            json.dumps(yaml_meta) if yaml_meta else None,
            task_type, interaction_pair, now, created_by,
        ),
    )
    conn.commit()
    return {"id": pd_id, "is_new": True, "use_count": 0}


def get_pd_entry(conn: sqlite3.Connection, pd_id: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM pd_registry WHERE id = ?", (pd_id,)).fetchone()
    if not row:
        return None
    return dict(row)


def search_pd_entries(
    conn: sqlite3.Connection,
    task_type: Optional[str] = None,
    interaction_pair: Optional[str] = None,
    limit: int = 5,
) -> list:
    """
    Find non-deprecated PDs matching task_type and/or interaction_pair.
    Returns most-used first.
    """
    clauses = ["deprecated = 0"]
    params = []
    if task_type:
        clauses.append("task_type = ?")
        params.append(task_type)
    if interaction_pair:
        clauses.append("interaction_pair = ?")
        params.append(interaction_pair)

    where = " AND ".join(clauses)
    rows = conn.execute(
        f"SELECT id, task_type, interaction_pair, use_count, created_at "
        f"FROM pd_registry WHERE {where} ORDER BY use_count DESC LIMIT ?",
        (*params, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def log_pd_use(
    conn: sqlite3.Connection,
    pd_id: str,
    dispatch_id: str,
    session_id: str,
    project_id: str,
    tokens_saved: Optional[int] = None,
) -> None:
    """Record a PD usage event and increment use_count + last_used."""
    now = datetime.now(timezone.utc).isoformat()
    log_id = str(uuid.uuid4())[:8]

    conn.execute(
        """INSERT INTO pd_usage_log
           (id, pd_id, dispatch_id, session_id, project_id, tokens_saved, ts)
           VALUES (?,?,?,?,?,?,?)""",
        (log_id, pd_id, dispatch_id, session_id, project_id, tokens_saved, now),
    )
    conn.execute(
        "UPDATE pd_registry SET use_count = use_count + 1, last_used = ? WHERE id = ?",
        (now, pd_id),
    )
    conn.commit()


def deprecate_pd(
    conn: sqlite3.Connection, pd_id: str, superseded_by: Optional[str] = None
) -> dict:
    """Mark a PD as deprecated. It will no longer appear in search results."""
    conn.execute(
        "UPDATE pd_registry SET deprecated = 1, superseded_by = ? WHERE id = ?",
        (superseded_by, pd_id),
    )
    conn.commit()
    return {"deprecated": pd_id, "superseded_by": superseded_by}


def increment_interaction_count(
    conn: sqlite3.Connection, pair: str, project_id: str
) -> int:
    """Increment interaction pair count and return new value."""
    now = datetime.now(timezone.utc).isoformat()
    existing = conn.execute(
        "SELECT count FROM interaction_counts WHERE pair = ? AND project_id = ?",
        (pair, project_id),
    ).fetchone()

    if existing:
        new_count = existing["count"] + 1
        conn.execute(
            "UPDATE interaction_counts SET count = ?, last_seen = ? WHERE pair = ? AND project_id = ?",
            (new_count, now, pair, project_id),
        )
    else:
        new_count = 1
        conn.execute(
            "INSERT INTO interaction_counts (pair, project_id, count, last_seen) VALUES (?,?,?,?)",
            (pair, project_id, 1, now),
        )
    conn.commit()
    return new_count
