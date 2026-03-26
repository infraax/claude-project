"""
mcp/prompt_cache.py
Stable Prefix Builder + Prompt Cache State Tracker.

The stable prefix is the byte-identical system block sent on every request.
By making it deterministic and tagging with cache_control: ephemeral,
Claude caches it after the first request — 90% cost reduction on prefix tokens.

Rules for stable prefix:
1. Content must be IDENTICAL byte-for-byte on every request
2. Order: system_prompt → project_context → tool_schemas → DSL_grammar
3. Never include session-specific data in the stable prefix
4. Minimum 1024 tokens required for Anthropic cache to activate
"""
import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Optional

BASE_SYSTEM_PROMPT = """You are an expert software engineer working inside claude-project,
an agent-optimized project brain. You have access to structured tools for memory,
file summaries, Protocol Documents, and session state.

Core operating principles:
1. Always call get_context() at session start — never ask what was done before
2. Always call get_file_summary(path) before reading any file
3. Store decisions with store_memory(category="decision", ...)
4. Store discoveries with store_memory(category="discovery", ...)
5. Output in the format specified by the active dispatch format
6. Never produce prose when a structured output schema is defined
7. Call set_context() at session end with updated stage and summary"""

DSL_GRAMMAR_BLOCK = """
## Active DSL Grammar (pipeline tasks)
PIPELINE := STEP+
STEP     := step_id ":" ACTION ("→" STEP_ID)*
ACTION   := "read" | "transform" | "write" | "call" | "branch" | "filter"
Types    : str, int, float, bool, list[T], dict[K,V], optional[T]
"""

TYPED_PSEUDO_SCHEMA = """
## Typed Pseudocode Schema (code tasks)
DISPATCH[TASK_TYPE]
  INPUT:  <type>
  OUTPUT: { result: str, files_modified: list[str],
            next_action: "done"|"needs_review"|"blocked",
            summary: str }
"""


def build_stable_prefix(
    project_context: dict,
    tool_schemas: list,
    include_dsl: bool = False,
) -> list:
    """
    Build the stable prefix as a list of Anthropic system blocks with cache_control.
    All blocks are tagged ephemeral for prompt caching.
    Returns list ready for use as `system` param in messages.create().
    """
    blocks = []

    # Block 1: Base system prompt (always identical)
    blocks.append({
        "type": "text",
        "text": BASE_SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    })

    # Block 2: Project context (stable per-project, changes rarely)
    context_text = (
        f"## Project Context\n"
        f"project_id: {project_context.get('id', 'unknown')}\n"
        f"name: {project_context.get('name', 'unknown')}\n"
        f"description: {project_context.get('description', '')}\n"
        f"tech_stack: {json.dumps(project_context.get('tech_stack', []))}\n"
        f"agents: {json.dumps(list(project_context.get('agents', {}).keys()))}\n"
    )
    blocks.append({
        "type": "text",
        "text": context_text,
        "cache_control": {"type": "ephemeral"},
    })

    # Block 3: Tool schemas (stable, changes only on tool additions)
    if tool_schemas:
        tool_text = "## Available MCP Tools\n" + json.dumps(tool_schemas, indent=2)
        blocks.append({
            "type": "text",
            "text": tool_text,
            "cache_control": {"type": "ephemeral"},
        })

    # Block 4: DSL grammar (only for pipeline tasks)
    if include_dsl:
        blocks.append({
            "type": "text",
            "text": DSL_GRAMMAR_BLOCK + TYPED_PSEUDO_SCHEMA,
            "cache_control": {"type": "ephemeral"},
        })

    return blocks


def prefix_hash(blocks: list) -> str:
    """Compute a deterministic hash of the stable prefix for cache tracking."""
    content = json.dumps(blocks, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def record_cache_event(
    conn: sqlite3.Connection,
    dispatch_id: str,
    session_id: str,
    prefix_hash_val: str,
    cache_write_tokens: int,
    cache_read_tokens: int,
    total_input_tokens: int,
) -> None:
    """Record cache hit/miss for a dispatch into SQLite."""
    now = datetime.now(timezone.utc).isoformat()
    is_hit = cache_read_tokens > 0
    savings_tokens = cache_read_tokens

    conn.execute("""
        CREATE TABLE IF NOT EXISTS cache_events (
            id TEXT PRIMARY KEY,
            dispatch_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            prefix_hash TEXT NOT NULL,
            cache_write_tokens INTEGER,
            cache_read_tokens INTEGER,
            total_input_tokens INTEGER,
            is_hit INTEGER NOT NULL,
            savings_tokens INTEGER,
            ts TEXT NOT NULL
        )
    """)
    conn.execute(
        """INSERT INTO cache_events
           (id, dispatch_id, session_id, prefix_hash,
            cache_write_tokens, cache_read_tokens,
            total_input_tokens, is_hit, savings_tokens, ts)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (str(uuid.uuid4())[:8], dispatch_id, session_id, prefix_hash_val,
         cache_write_tokens, cache_read_tokens, total_input_tokens,
         1 if is_hit else 0, savings_tokens, now)
    )
    conn.commit()


def get_cache_hit_rate(conn: sqlite3.Connection, session_id: Optional[str] = None) -> dict:
    """Return cache hit rate stats, optionally filtered by session."""
    where = f"WHERE session_id = '{session_id}'" if session_id else ""
    try:
        row = conn.execute(f"""
            SELECT COUNT(*) as total, SUM(is_hit) as hits,
                   SUM(savings_tokens) as tokens_saved,
                   AVG(CAST(cache_read_tokens AS FLOAT) /
                       NULLIF(total_input_tokens, 0)) as avg_cache_ratio
            FROM cache_events {where}
        """).fetchone()
    except Exception:
        return {"total": 0, "hits": 0, "hit_rate": 0.0, "tokens_saved": 0}
    if not row or row["total"] == 0:
        return {"total": 0, "hits": 0, "hit_rate": 0.0, "tokens_saved": 0}
    return {
        "total": row["total"],
        "hits": row["hits"] or 0,
        "hit_rate": round(((row["hits"] or 0) / row["total"]) * 100, 1),
        "tokens_saved": row["tokens_saved"] or 0,
        "avg_cache_ratio": round(row["avg_cache_ratio"] or 0, 4),
    }
