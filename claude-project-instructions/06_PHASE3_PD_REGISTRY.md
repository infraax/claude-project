# 06 — PHASE 3: PROTOCOL DOCUMENT REGISTRY
## Content-Addressed PD Store + Negotiation Controller

> **Checkpoint ID:** `phase6_pd_registry`
> **Prerequisites:** Phase 5 (database layer) complete
> **Goal:** Every inter-agent interaction can be governed by a reusable, hash-addressed Protocol Document.
> **Research:** `agora_protocol.pdf`, `lacp_2504.15854.pdf`, `multiagent_survey_2502.14321.pdf`

---

## Context Budget Warning

This phase creates one new Python module and adds 5 MCP tools.
If context compacts mid-phase:
1. Read AGENT_STATE.md → find last completed step
2. Read ONLY this file
3. Resume from last completed step
4. The pd_registry table already exists from Phase 4 — do not recreate it

---

## What a Protocol Document Is

A Protocol Document (PD) is a compact, machine-readable agreement between two agents
about how they will communicate for a specific task type. It replaces natural language
negotiation on every message with a one-time negotiation cost.

**PD format (YAML header + body):**

```yaml
***
pd_version: "1.0"
task_type: code_gen
interaction_pair: user→main
format: typed_pseudocode
compression: llmlingua
token_budget: 2000
output_schema:
  type: object
  fields:
    - name: files_modified
      type: list[string]
    - name: summary
      type: string
      max_chars: 200
    - name: next_action
      type: enum
      values: [done, needs_review, blocked]
negotiated_at: "2026-03-26T14:00:00Z"
negotiated_by: negotiation_controller
***
# Communication Rules
1. Omit all preamble. Start directly with output.
2. File paths are relative to project root.
3. summary field: one sentence max.
4. next_action: always explicit.
```

The SHA-256 of the full PD text (header + body) is its permanent ID.

---

## Step 6.1 — Create pd-registry.py Module

**Create file:** `mcp/pd_registry.py`

```python
# mcp/pd_registry.py
import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
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
    If identical PD already exists, returns existing id with is_new=False.
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
) -> list[dict]:
    """
    Find matching PDs by task_type and/or interaction_pair.
    Returns most-used, non-deprecated PDs first.
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
    """Record a PD usage event and increment use_count."""
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
    conn.execute(
        "UPDATE pd_registry SET deprecated = 1, superseded_by = ? WHERE id = ?",
        (superseded_by, pd_id),
    )
    conn.commit()
    return {"deprecated": pd_id, "superseded_by": superseded_by}


def increment_interaction_count(
    conn: sqlite3.Connection, pair: str, project_id: str
) -> int:
    """Increment and return new count for an interaction pair."""
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
```

Write to AGENT_STATE.md: `step_6_1_pd_registry_module: complete`

---

## Step 6.2 — Add PD MCP Tools to server.py

**Add to `mcp/server.py`:**

```python
from pd_registry import (
    register_pd_entry, get_pd_entry, search_pd_entries,
    log_pd_use, deprecate_pd, increment_interaction_count,
)

@mcp.tool()
def register_pd(text: str, task_type: str, interaction_pair: str) -> dict:
    """
    Register a new Protocol Document.
    text: full PD content (YAML header + body rules).
    Returns: {id, is_new} — id is SHA-256, stable forever.
    If same PD already registered, returns existing id without duplication.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    result = register_pd_entry(
        conn, text, task_type, interaction_pair,
        created_by="negotiation_controller"
    )
    conn.close()
    return result


@mcp.tool()
def get_pd(pd_id: str) -> dict:
    """
    Retrieve a Protocol Document by its SHA-256 id.
    Returns full PD text + metadata, or {found: false}.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    entry = get_pd_entry(conn, pd_id)
    conn.close()
    if not entry:
        return {"found": False, "id": pd_id}
    return {
        "found": True,
        "id": entry["id"],
        "text": entry["text"],
        "task_type": entry["task_type"],
        "interaction_pair": entry["interaction_pair"],
        "use_count": entry["use_count"],
        "created_at": entry["created_at"],
        "deprecated": bool(entry["deprecated"]),
        "superseded_by": entry["superseded_by"],
    }


@mcp.tool()
def search_pd(task_type: str | None = None,
              interaction_pair: str | None = None,
              limit: int = 5) -> list[dict]:
    """
    Search for existing Protocol Documents.
    Call this BEFORE negotiating a new PD — reuse before creating.
    Returns: [{id, task_type, interaction_pair, use_count, created_at}]
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    results = search_pd_entries(conn, task_type, interaction_pair, limit)
    conn.close()
    return results


@mcp.tool()
def log_pd_usage(pd_id: str, dispatch_id: str, tokens_saved: int | None = None) -> dict:
    """
    Record that a PD was used in a dispatch. Increments use_count.
    tokens_saved: estimated tokens saved vs natural language baseline.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    session_id = os.getenv("CLAUDE_SESSION_ID", "unknown")
    log_pd_use(conn, pd_id, dispatch_id, session_id, project_id, tokens_saved)
    conn.close()
    return {"logged": True, "pd_id": pd_id}


@mcp.tool()
def check_negotiation_threshold(interaction_pair: str) -> dict:
    """
    Check if an interaction pair has hit the PD negotiation threshold.
    Returns: {pair, count, threshold, should_negotiate, existing_pd_id}
    Call this at the start of each dispatch to decide if a PD should be negotiated.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    threshold = 3  # default; read from .claude-project if configured

    row = conn.execute(
        "SELECT count, pd_assigned FROM interaction_counts WHERE pair = ? AND project_id = ?",
        (interaction_pair, project_id)
    ).fetchone()

    count = row["count"] if row else 0
    pd_assigned = row["pd_assigned"] if row else None

    conn.close()
    return {
        "pair": interaction_pair,
        "count": count,
        "threshold": threshold,
        "should_negotiate": count >= threshold and pd_assigned is None,
        "existing_pd_id": pd_assigned,
    }
```

Write to AGENT_STATE.md: `step_6_2_pd_mcp_tools: complete`

---

## Step 6.3 — Add Negotiation Controller Agent to .claude-project

In `.claude-project` (or the default schema), add this agent definition:

```json
{
  "agents": {
    "negotiation_controller": {
      "id": "negotiation_controller",
      "role": "protocol_negotiator",
      "model": "claude-opus-4-5",
      "backend": "claude",
      "system_prompt": "You design Protocol Documents (PDs) for inter-agent communication. A PD is a compact YAML+rules document that replaces natural language negotiation. When asked to negotiate a PD: 1) call search_pd first — reuse if match found. 2) If no match: design a minimal PD with YAML header (pd_version, task_type, interaction_pair, format, output_schema) and numbered rules. 3) Call register_pd to store it. 4) Return only the pd_id. Never return the full PD text in your response.",
      "tools": ["search_pd", "register_pd", "get_pd", "log_pd_usage", "check_negotiation_threshold"],
      "trigger": "interaction_threshold_reached"
    }
  }
}
```

Write to AGENT_STATE.md: `step_6_3_negotiation_controller_defined: complete`

---

## Step 6.4 — Wire Threshold Check into dispatch-runner.ts

In `dispatch-runner.ts`, before the API call, add:

```typescript
// Check if PD negotiation is needed for this interaction pair
const interactionPair = inferInteractionPair(dispatch.agent);
// Call check_negotiation_threshold via MCP, or direct DB query
// If should_negotiate === true and no existing_pd_id:
//   fire negotiation_controller agent (async, non-blocking for current dispatch)
//   current dispatch continues in natural_language mode
// If existing_pd_id present:
//   dispatch.protocol_id = existing_pd_id
//   dispatch.protocol_condition = "pd_negotiated"
```

The negotiation always happens **after the current dispatch completes** — never blocking it.
Record `protocol_condition = "natural_language"` for the current dispatch regardless.

Write to AGENT_STATE.md: `step_6_4_threshold_wired: complete`

---

## Step 6.5 — Test PD Registry

```bash
python3 -c "
import sys; sys.path.insert(0, 'mcp')
import sqlite3
from pd_registry import register_pd_entry, search_pd_entries, log_pd_use, get_pd_entry

conn = sqlite3.connect('/tmp/test_pd.db')
conn.row_factory = sqlite3.Row
conn.execute(open('schema_init.sql').read())  # or inline CREATE TABLE

test_pd = '''---
pd_version: \"1.0\"
task_type: code_gen
interaction_pair: user→main
format: typed_pseudocode
***
1. Output files_modified list first.
2. Summary max 1 sentence.
3. next_action always explicit.
'''

r1 = register_pd_entry(conn, test_pd, 'code_gen', 'user→main', 'test')
r2 = register_pd_entry(conn, test_pd, 'code_gen', 'user→main', 'test')  # should return is_new=False
assert r1['id'] == r2['id'], 'Content-addressing broken'
assert not r2['is_new'], 'Dedup broken'

results = search_pd_entries(conn, task_type='code_gen')
assert len(results) > 0, 'Search broken'

entry = get_pd_entry(conn, r1['id'])
assert entry['text'] == test_pd, 'Retrieval broken'

print('ALL PD REGISTRY TESTS PASSED')
conn.close()
"
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase6_pd_registry_complete",
  "pd_module_created": true,
  "mcp_tools_added": 5,
  "dedup_test_passed": true,
  "negotiation_controller_defined": true
}
```

**Phase 3 complete. Then read: `07_PHASE4_TYPED_DISPATCH.md`**
```

***

Say **"next"** for `07_PHASE4_TYPED_DISPATCH.md`.

Bronnen


## `07_PHASE4_TYPED_DISPATCH.md`

```markdown