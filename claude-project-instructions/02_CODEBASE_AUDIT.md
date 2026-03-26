# 02 — CODEBASE AUDIT: Current State
## Reference Document — Read Only, No Changes

> **Checkpoint ID:** `phase2_audit_read`
> **Action:** Read and understand. Write nothing to the codebase yet.
> **Purpose:** Ground truth before any changes. Return here if confused about original state.

---

## Repository Structure

```
claude-project/
├── src/
│   ├── extension.ts              # VS Code extension entry
│   ├── cli.ts                    # CLI entry point
│   └── lib/
│       ├── registry.ts           # Global ~/.claude/registry.json
│       ├── project.ts            # .claude-project schema + file-finding
│       ├── paths.ts              # Path resolution utilities
│       ├── mcp-inject.ts         # MCP config injection into Claude Code
│       ├── events.ts             # Append-only JSONL event log
│       ├── dispatch-runner.ts    # Claude API agentic tool loop
│       └── automation.ts         # Trigger/action automation engine
│   └── commands/
│       ├── init.ts               # Project initialization
│       ├── sync.ts               # Registry sync
│       ├── status.ts             # Project status display
│       ├── dispatch.ts           # Dispatch CLI commands
│       ├── generate-claude-md.ts # CLAUDE.md auto-generation
│       ├── hooks.ts              # Session hook management
│       ├── hook-run.ts           # Hook execution
│       └── ...
├── mcp/
│   └── server.py                 # Python MCP server (FastMCP)
├── schema/
│   └── claude-project.schema.json
└── docs/
```

---

## Component Assessment: Human-Oriented vs Agent-Optimized

### ❌ REMOVE FROM AGENT DATA LAYER (human-oriented, zero agent value)

| Component | Location | Why It Must Change |
|-----------|----------|-------------------|
| `WAKEUP.md` | `memory/WAKEUP.md` | Markdown prose for human reading. Agent needs typed JSON state record. |
| `SESSION_JOURNAL.md` | `memory/SESSION_JOURNAL.md` | Narrative journal duplicates event log. Redundant. Delete. |
| `generate-claude-md.ts` | `src/commands/generate-claude-md.ts` | Generates a human-readable document. Replace with MCP `get_context()` typed struct. |
| Obsidian sync (every write) | `mcp/server.py`, `automation.ts` | Pure human UX. Adds write latency, machine-specific paths. Decouple to optional async export. |
| Source attribution as strings | `events.ts`, `mcp/server.py` | `"MacBook / gebruiker"` is human-readable. Replace with structured `{device_id, hostname, user}`. |

### 🟡 KEEP BUT UPGRADE (right intent, wrong implementation)

| Component | Location | What Must Change |
|-----------|----------|--------------------|
| `events.jsonl` | Per-project JSONL file | Add mandatory typed fields per event type. Add research measurement fields. |
| `DispatchFile.usage` | `dispatch-runner.ts` | Currently `{input_tokens, output_tokens}` only. Expand to full `DispatchObservation`. |
| `mcp/server.py` tools | `mcp/server.py` | Tools return raw text. Add compression pass on output. Add PD registry tools. |
| `dispatch-runner.ts` | `src/lib/dispatch-runner.ts` | Dispatch body is free-form string. Add task classification, protocol condition, full timing. |
| `.claude-project` schema | `schema/claude-project.schema.json` | Missing `backend` field on agents. Missing `protocol_id` on dispatches. |

### ✅ KEEP AS-IS (agent-optimized, correct design)

| Component | Location | Why It Is Correct |
|-----------|----------|------------------|
| `registry.ts` | `src/lib/registry.ts` | Global JSON lookup, no filesystem scan — correct pattern. |
| `project.ts` walk-up | `src/lib/project.ts` | .git-style project discovery — correct pattern. |
| `events.ts` JSONL append | `src/lib/events.ts` | Structured, queryable, append-only — correct pattern. |
| `AgentDefinition` interface | `src/lib/project.ts` | Typed agent roster with model, tools, tags — correct pattern. |
| `automation.ts` trigger system | `src/lib/automation.ts` | Event/cron/file-change triggers — correct. Extend, not replace. |
| VS Code extension | `src/extension.ts` | Human UX layer — keep isolated, never let it influence agent data. |
| Background daemon | Launchd plist | Correct pattern. Extend to systemd for Linux. |

---

## Current MCP Server Tools (server.py)

| Tool | Input | Output | Problem |
|------|-------|--------|---------|
| `journal_write` | category, content, tags | Writes .md file | Prose-based, markdown output |
| `journal_read` | category, limit | Raw markdown text | No compression, full text returned |
| `remember` | key, value | Stores text blob | No structure, no semantic indexing |
| `recall` | query | Raw stored text | No compression on output |
| `list_memories` | — | File list | Files as memory — wrong abstraction |

**Missing entirely:** PD registry tools, file summary tools, semantic search, compression, cache management.

---

## Current Dispatch File Schema

```typescript
interface DispatchFile {
  id: string;
  title: string;        // FREE-FORM STRING — no type safety
  body: string;         // FREE-FORM STRING — no schema
  agent?: string;
  priority?: "low" | "normal" | "high";
  status: "pending" | "running" | "completed" | "failed";
  created?: string;
  started_at?: string;
  completed_at?: string;
  source?: string;
  result?: string;
  error?: string;
  tool_calls?: Array<{ tool: string; input: unknown; output_summary: string }>;
  usage?: { input_tokens: number; output_tokens: number };  // INCOMPLETE
}
```

**Missing:** task_type, protocol_condition, protocol_id, session_id, interaction_pair, token breakdown (cache fields), latency timing, compression stats, backend routing.

---

## Current Event Schema

```typescript
interface ProjectEvent {
  id: string;        // 8-char UUID prefix
  ts: string;        // ISO timestamp
  type: EventType;   // union of strings
  source: string;    // HUMAN STRING: "MacBook / gebruiker"
  project_id: string;
   Record<string, unknown>;  // UNTYPED — no enforcement
  tags?: string[];
}
```

**Missing:** typed data schemas per event type, session_id grouping, research fields.

---

## Baseline Metrics to Record NOW (before any changes)

```bash
cat ~/.claude/projects/*/dispatches/*.json | python3 -c "
import json, sys
for line in sys.stdin:
    d = json.loads(line)
    if d.get('usage'):
        print(json.dumps(d['usage']))
" | head -20

wc -l ~/.claude/projects/*/events.jsonl 2>/dev/null
du -sh ~/.claude/projects/*/memory/ 2>/dev/null
ls ~/.claude/projects/*/dispatches/*.json 2>/dev/null | wc -l
```

Write all output to AGENT_STATE.md under `baseline_metrics`.

---

## Completion Checkpoint

```json
{
  "phase": "phase2_audit_complete",
  "baseline_metrics_recorded": true,
  "audit_understood": true
}
```

**Then read: `03_TARGET_ARCHITECTURE.md`**
```

***

Say **"next"** for `03_TARGET_ARCHITECTURE.md`.

Bronnen


## `03_TARGET_ARCHITECTURE.md`

```markdown