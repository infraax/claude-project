# 08 — PHASE 5: COMPRESSION LAYER
## LLMLingua + Clarity Layer + Stable Prefix + Prompt Cache

> **Checkpoint ID:** `phase8_compression`
> **Prerequisites:** Phase 7 (typed dispatch) complete
> **Goal:** Every token that hits the API has been earned. Cache hits > 80% steady state.
> **Research:** `llmlingua2_2403.12968.pdf`, `tokenization_impact_2511.03825.pdf`,
>               `plan_caching.pdf`, `caveagent_2601.01569.pdf`

---

## Context Budget Warning

This phase creates two new Python modules and modifies server.py + dispatch-runner.ts.
If context compacts mid-phase:
1. Read AGENT_STATE.md → find last completed step
2. Read ONLY this file
3. Resume from last completed step
4. Clarity layer and LLMLingua are independent — either can be skipped if Ollama unavailable

---

## Architecture Recap (read before implementing)

```
raw user input
    │
    ▼
[CLARITY LAYER]  ← Ollama/Qwen2.5-7B, local, ~1-2s, $0
    │  cleans input, resolves ambiguity
    ▼
[LLMLINGUA]      ← local Python, ~200ms, $0
    │  compresses natural language portions only
    │  NEVER compresses typed_pseudocode / DSL / TOON (already dense)
    ▼
[STABLE PREFIX BUILDER]
    │  prepends byte-identical cached prefix to every request
    │  prefix = system_prompt + project_context + tool_schemas
    ▼
[CLAUDE API]
    │  stable prefix hits cache (90% cost reduction on prefix tokens)
    ▼
[CACHE STATE TRACKER]
    │  records cache_write vs cache_read per request
    ▼
[OBSERVATION RECORDER]  ← from Phase 4
```

---

## Step 8.1 — Create clarity-layer.py Module

**Create file:** `mcp/clarity_layer.py`

The Clarity Layer uses a local Ollama model to clean user input before it reaches Claude.
It runs at zero API cost. If Ollama is unavailable, it passes input through unchanged.

```python
# mcp/clarity_layer.py
"""
Clarity Layer: local LLM pre-processor for user input.
Cleans, completes, and deambiguates input before sending to Claude API.
Falls back to passthrough if Ollama is unavailable.
"""
import time
import urllib.request
import urllib.error
import json
import os
from typing import Optional


OLLAMA_HOST   = os.getenv("OLLAMA_HOST", "http://localhost:11434")
CLARITY_MODEL = os.getenv("CLARITY_MODEL", "qwen2.5:7b")

CLARITY_SYSTEM_PROMPT = """You are a precision input processor. Your only job:
1. Fix typos and grammatical errors silently
2. Expand abbreviations to full terms
3. Resolve ambiguous pronouns using prior context
4. Complete incomplete sentences into full instructions
5. If input is already clear and complete, return it unchanged

RULES:
- Output ONLY the cleaned input text. No commentary. No explanation.
- Never add information not implied by the input
- Never change the meaning or intent
- If genuinely ambiguous with no resolution possible, prepend: [AMBIGUOUS: <question>]
- Max output length: same as input length ± 20%"""


def _ollama_available() -> bool:
    try:
        req = urllib.request.Request(f"{OLLAMA_HOST}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def _call_ollama(text: str, context: Optional[str] = None) -> str:
    messages = [{"role": "system", "content": CLARITY_SYSTEM_PROMPT}]
    if context:
        messages.append({"role": "user", "content": f"Context: {context}"})
        messages.append({"role": "assistant", "content": "Understood."})
    messages.append({"role": "user", "content": text})

    payload = json.dumps({
        "model": CLARITY_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 2048},
    }).encode()

    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        result = json.loads(r.read())
        return result["message"]["content"].strip()


def clarify(
    text: str,
    context: Optional[str] = None,
    force: bool = False
) -> dict:
    """
    Run input through the Clarity Layer.

    Returns:
    {
        "output": str,          # cleaned text (or original if passthrough)
        "passthrough": bool,    # True if Clarity Layer was skipped
        "latency_ms": int,
        "input_chars": int,
        "output_chars": int,
    }
    """
    start = time.monotonic()
    input_chars = len(text)

    # Skip clarity for short, clearly structured inputs
    if not force and len(text) < 50:
        return {
            "output": text, "passthrough": True,
            "latency_ms": 0, "input_chars": input_chars, "output_chars": len(text)
        }

    # Skip if Ollama unavailable (unless forced)
    if not force and not _ollama_available():
        return {
            "output": text, "passthrough": True,
            "latency_ms": 0, "input_chars": input_chars, "output_chars": len(text)
        }

    try:
        cleaned = _call_ollama(text, context)
        latency_ms = int((time.monotonic() - start) * 1000)
        return {
            "output": cleaned, "passthrough": False,
            "latency_ms": latency_ms,
            "input_chars": input_chars, "output_chars": len(cleaned)
        }
    except Exception as e:
        # Always fall through — never block on Clarity Layer failure
        return {
            "output": text, "passthrough": True,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "input_chars": input_chars, "output_chars": len(text),
            "error": str(e)
        }
```

Write to AGENT_STATE.md: `step_8_1_clarity_layer: complete`

---

## Step 8.2 — Create prompt-cache.py Module

**Create file:** `mcp/prompt_cache.py`

```python
# mcp/prompt_cache.py
"""
Stable Prefix Builder + Prompt Cache State Tracker.

The stable prefix is the byte-identical system block sent on every request.
By making it deterministic and tagging it with cache_control: ephemeral,
Claude caches it after the first request — 90% cost reduction on prefix tokens.

Rules for stable prefix:
1. Content must be IDENTICAL byte-for-byte on every request (same session or not)
2. Order: system_prompt → project_context → tool_schemas → DSL_grammar (if applicable)
3. Never include session-specific data in the stable prefix
4. Minimum 1024 tokens for cache to activate (Anthropic minimum)
"""
import hashlib
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


# ── Stable prefix construction ─────────────────────────────────────────────────

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
    tool_schemas: list[dict],
    include_dsl: bool = False,
) -> list[dict]:
    """
    Build the stable prefix as a list of Anthropic message system blocks.
    All blocks tagged with cache_control for prompt caching.

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


def prefix_hash(blocks: list[dict]) -> str:
    """Compute deterministic hash of prefix for cache tracking."""
    content = json.dumps(blocks, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# ── Cache state tracking ───────────────────────────────────────────────────────

def record_cache_event(
    conn: sqlite3.Connection,
    dispatch_id: str,
    session_id: str,
    prefix_hash_val: str,
    cache_write_tokens: int,
    cache_read_tokens: int,
    total_input_tokens: int,
) -> None:
    """Record cache hit/miss data for a dispatch."""
    now = datetime.now(timezone.utc).isoformat()
    is_hit = cache_read_tokens > 0
    savings_tokens = cache_read_tokens  # tokens NOT charged at full price

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

    import uuid
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
    """Return cache hit rate stats."""
    where = f"WHERE session_id = '{session_id}'" if session_id else ""
    row = conn.execute(f"""
        SELECT
            COUNT(*) as total,
            SUM(is_hit) as hits,
            SUM(savings_tokens) as tokens_saved,
            AVG(CAST(cache_read_tokens AS FLOAT) /
                NULLIF(total_input_tokens, 0)) as avg_cache_ratio
        FROM cache_events {where}
    """).fetchone()
    if not row or row["total"] == 0:
        return {"total": 0, "hits": 0, "hit_rate": 0.0, "tokens_saved": 0}
    return {
        "total": row["total"],
        "hits": row["hits"],
        "hit_rate": round((row["hits"] / row["total"]) * 100, 1),
        "tokens_saved": row["tokens_saved"] or 0,
        "avg_cache_ratio": round(row["avg_cache_ratio"] or 0, 4),
    }
```

Write to AGENT_STATE.md: `step_8_2_prompt_cache_module: complete`

---

## Step 8.3 — Add LLMLingua Compression to server.py

**Add to `mcp/server.py`** — LLMLingua compressor:

```python
# Add after existing imports in server.py
from llmlingua import PromptCompressor

_LINGUA_COMPRESSOR = None

def _get_lingua_compressor():
    """Lazy-load LLMLingua compressor. Falls back to passthrough if unavailable."""
    global _LINGUA_COMPRESSOR
    if _LINGUA_COMPRESSOR is None:
        try:
            _LINGUA_COMPRESSOR = PromptCompressor(
                model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank",
                use_llmlingua2=True,
                device_map="cpu",
            )
        except Exception as e:
            print(f"[compression] LLMLingua unavailable: {e}. Using passthrough.")
            _LINGUA_COMPRESSOR = "unavailable"
    return _LINGUA_COMPRESSOR


def compress_natural_language(text: str, target_ratio: float = 0.6) -> dict:
    """
    Compress natural language text using LLMLingua-2.
    ONLY call on natural_language format dispatches.
    Never call on typed_pseudocode, DSL, or TOON — they are already dense.

    target_ratio: 0.6 = keep 60% of tokens (40% compression)
    Returns: {compressed: str, original_chars: int, compressed_chars: int, ratio: float}
    """
    import time
    start = time.monotonic()
    original_chars = len(text)

    compressor = _get_lingua_compressor()
    if compressor == "unavailable" or len(text) < 200:
        # Don't compress short texts — overhead not worth it
        return {
            "compressed": text, "original_chars": original_chars,
            "compressed_chars": original_chars, "ratio": 1.0,
            "latency_ms": 0, "passthrough": True
        }

    try:
        result = compressor.compress_prompt(
            text,
            rate=target_ratio,
            force_tokens=["\n", ".", "!", "?"],  # preserve sentence structure
            drop_consecutive=True,
        )
        compressed = result["compressed_prompt"]
        latency_ms = int((time.monotonic() - start) * 1000)
        return {
            "compressed": compressed,
            "original_chars": original_chars,
            "compressed_chars": len(compressed),
            "ratio": round(len(compressed) / original_chars, 4),
            "latency_ms": latency_ms,
            "passthrough": False,
        }
    except Exception as e:
        return {
            "compressed": text, "original_chars": original_chars,
            "compressed_chars": original_chars, "ratio": 1.0,
            "latency_ms": 0, "passthrough": True, "error": str(e)
        }
```

Write to AGENT_STATE.md: `step_8_3_llmlingua_added: complete`

---

## Step 8.4 — Wire Clarity + Compression into MCP Tool dispatch_task

Add a new MCP tool that runs the full pipeline before dispatching:

```python
@mcp.tool()
def dispatch_task(
    title: str,
    body: str,
    agent: str | None = None,
    priority: str = "normal",
    context: str | None = None,
) -> dict:
    """
    Full-pipeline dispatch: Clarity → Compression → Format Encode → Submit.
    Prefer this over direct dispatch for all natural language inputs.
    Returns: {dispatch_id, task_type, format, compression_ratio, clarity_passthrough}
    """
    from clarity_layer import clarify
    import time

    timings = {}

    # Step 1: Clarity Layer
    t0 = time.monotonic()
    clarity_result = clarify(body, context=context)
    timings["clarity_ms"] = clarity_result["latency_ms"]
    clean_body = clarity_result["output"]

    # Step 2: LLMLingua compression (only for natural language)
    # Task classification happens first to decide if compression is appropriate
    from task_classifier_py import classify_task_type  # Python port of task-classifier.ts
    task_type = classify_task_type(title, clean_body)

    compress_result = {"ratio": 1.0, "passthrough": True, "latency_ms": 0}
    if task_type in ("planning", "documentation", "unknown"):
        compress_result = compress_natural_language(clean_body, target_ratio=0.65)
        clean_body = compress_result["compressed"]
    timings["compression_ms"] = compress_result.get("latency_ms", 0)

    # Step 3: Create dispatch file and queue it
    memory_dir, dispatches_dir, _ = _resolve_paths()
    dispatch_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()

    dispatch_data = {
        "id": dispatch_id,
        "title": title,
        "body": clean_body,
        "original_body_chars": len(body),
        "encoded_body_chars": len(clean_body),
        "compression_ratio": compress_result["ratio"],
        "task_type": task_type,
        "agent": agent,
        "priority": priority,
        "status": "pending",
        "created": now,
        "protocol_condition": "natural_language",
    }

    dispatch_path = dispatches_dir / f"{dispatch_id}.json"
    with open(dispatch_path, "w") as f:
        json.dump(dispatch_data, f, indent=2)

    return {
        "dispatch_id": dispatch_id,
        "task_type": task_type,
        "clarity_passthrough": clarity_result["passthrough"],
        "compression_ratio": compress_result["ratio"],
        "original_chars": len(body),
        "final_chars": len(clean_body),
        "timings_ms": timings,
    }
```

Write to AGENT_STATE.md: `step_8_4_dispatch_task_tool: complete`

---

## Step 8.5 — Create Python Task Classifier Port

**Create file:** `mcp/task_classifier_py.py`
(Python port of `src/lib/task-classifier.ts` for use in server.py)

```python
# mcp/task_classifier_py.py
import re
from typing import Optional

TASK_PATTERNS = [
    ("test_gen",      [r"\btest(s|ing)?\b", r"\bspec\b", r"\bvitest\b", r"\bjest\b"]),
    ("refactor",      [r"\brefactor\b", r"\bclean up\b", r"\brewrite\b", r"\bimprove\b"]),
    ("code_gen",      [r"\bimplement\b", r"\bcreate\b", r"\bbuild\b", r"\badd\b.{0,20}\bfunction\b"]),
    ("analysis",      [r"\banalyze\b", r"\banalyse\b", r"\breview\b", r"\bcheck\b", r"\binspect\b"]),
    ("documentation", [r"\bdoc(s|ument)?\b", r"\breadme\b", r"\bcomment\b", r"\bjsdoc\b"]),
    ("pipeline",      [r"\bpipeline\b", r"\btransform\b", r"\bprocess\b", r"\betl\b"]),
    ("planning",      [r"\bplan\b", r"\barchitect\b", r"\bdesign\b", r"\bstrateg\b"]),
    ("retrieval",     [r"\bfind\b", r"\bsearch\b", r"\blookup\b", r"\bwhere\b.{0,10}\bis\b"]),
]

def classify_task_type(title: str, body: str) -> str:
    combined = f"{title} {body}".lower()
    for task_type, patterns in TASK_PATTERNS:
        if any(re.search(p, combined) for p in patterns):
            return task_type
    return "unknown"
```

Write to AGENT_STATE.md: `step_8_5_python_classifier: complete`

---

## Step 8.6 — Verify Ollama + Qwen Available

```bash
# Check Ollama is running
curl -s http://localhost:11434/api/tags | python3 -c "import json,sys; d=json.load(sys.stdin); print([m['name'] for m in d.get('models',[])])"

# Pull Qwen2.5 if not present
ollama pull qwen2.5:7b

# Test clarity layer
python3 -c "
import sys; sys.path.insert(0, 'mcp')
from clarity_layer import clarify
result = clarify('implment the fiel reader thingy we talked about')
print('Passthrough:', result['passthrough'])
print('Output:', result['output'])
print('Latency:', result['latency_ms'], 'ms')
"
```

If Ollama is unavailable, note in AGENT_STATE.md — clarity layer will passthrough silently.
This is acceptable; compression still runs via LLMLingua.

Write to AGENT_STATE.md: `step_8_6_ollama_verified: true/false`

---

## Step 8.7 — Full Pipeline Integration Test

```python
# scripts/test_full_pipeline.py
import sys
sys.path.insert(0, 'mcp')

from clarity_layer import clarify
from task_classifier_py import classify_task_type

test_cases = [
    ("Implement file reader", "create a funtion that reads json files form the projct directory and returns parsed content", "code_gen"),
    ("Build ETL pipeline", "read from sqlite transform to json write to lancedb", "pipeline"),
    ("Review auth module", "check the authentication code for security issues", "analysis"),
]

for title, body, expected_type in test_cases:
    clarity = clarify(body)
    task_type = classify_task_type(title, clarity["output"])
    status = "OK" if task_type == expected_type else f"FAIL (got {task_type})"
    print(f"{title[:30]:30s} | type: {task_type:15s} | clarity: {'pass' if clarity['passthrough'] else 'cleaned':8s} | {status}")
```

```bash
python3 scripts/test_full_pipeline.py
npm run build
npx vitest run
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase8_compression_complete",
  "clarity_layer_created": true,
  "llmlingua_integrated": true,
  "stable_prefix_builder_created": true,
  "cache_tracker_created": true,
  "dispatch_task_tool_added": true,
  "pipeline_test_passed": true,
  "ollama_available": true
}
```

**Phase 5 complete. Then read: `09_TESTING_STRATEGY.md`**
```

***

Say **"next"** for `09_TESTING_STRATEGY.md`.

Bronnen


## `09_TESTING_STRATEGY.md`

```markdown