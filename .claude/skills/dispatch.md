# Skill: dispatch

## When to load
Before creating any dispatch task, running the agent pipeline, or debugging why a dispatch failed.

## Pipeline stages (in order)

```
dispatch_task(title, body, agent)
  │
  ├─ 1. Clarity Layer (mcp/clarity_layer.py)
  │      Ollama/qwen2.5:7b cleans + completes the input
  │      Passthrough when Ollama not running — never blocks
  │
  ├─ 2. Task Classifier (mcp/task_classifier_py.py)
  │      8 task types: code_gen, code_review, bug_fix, pipeline,
  │                    refactor, analysis, documentation, general
  │      Pipeline patterns matched BEFORE code_gen to avoid false positives
  │
  ├─ 3. Format Encoder
  │      code_gen/bug_fix/refactor  → typed_pseudocode
  │      pipeline/analysis          → dsl
  │      documentation              → toon
  │      code_review                → codeact
  │      general                    → natural_language (+ LLMLingua)
  │
  ├─ 4. LLMLingua Compression (natural_language only)
  │      Target ratio: 0.65 (35% reduction)
  │      Skipped if: input < 200 chars, or format != natural_language
  │
  └─ 5. Dispatch file written to dispatches/
         Filename: dispatch-{short-uuid}.json
```

## MCP tool signature

```python
dispatch_task(
    title: str,       # short task title — used for classification
    body: str,        # full task body — passed through pipeline
    agent: str = None # agent name from .claude-project agents{}
)
# Returns: {dispatch_id, task_type, clarity_passthrough, compression_ratio, original_chars, final_chars}
```

## When to use which format

| Task type | Format | Use when |
|-----------|--------|----------|
| `code_gen` | `typed_pseudocode` | Writing new functions/classes |
| `bug_fix` | `typed_pseudocode` | Fixing specific broken behaviour |
| `refactor` | `typed_pseudocode` | Restructuring existing code |
| `pipeline` | `dsl` | Dispatch chains, orchestration flows |
| `analysis` | `dsl` | Research queries, data analysis |
| `documentation` | `toon` | Docs, READMEs, changelogs |
| `code_review` | `codeact` | PR reviews, security audits |
| `general` | `natural_language` | Anything else — gets LLMLingua compression |

## Checking dispatch status

```bash
# List pending
claude-project dispatch list --status pending

# Show specific dispatch
claude-project dispatch show dispatch-abc12

# Run all pending
export ANTHROPIC_API_KEY=...
claude-project dispatch run --all

# Dry run (no API calls)
claude-project dispatch run --dry-run
```

## Dispatch file location

```
dispatches/
  dispatch-{uuid}.json   ← created by dispatch_task()
  dispatch-{uuid}.result ← written after agent completes
```

## Agent tool sandbox

Agents have access to: `read_file`, `list_files`, `write_file`, `bash`, `log_event`
All file ops are path-traversal guarded to the project directory.
MAX 10 tool-use iterations per dispatch.

## Common mistakes to avoid

- Do NOT call `dispatch_task` with a single-word title — classifier needs context
- Do NOT use `dispatch_task` for tasks under ~20 lines / 1 file — write directly
- Do NOT forget to check `list_dispatches(status="pending")` before creating duplicates
- Always store the `dispatch_id` from the return value — needed to retrieve results
