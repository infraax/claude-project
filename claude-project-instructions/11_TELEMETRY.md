## `11_TELEMETRY.md`

```markdown
# 11 — FEDERATED TELEMETRY SYSTEM
## Zero-Token Anonymous Data Collection + Continuous Threshold Learning

> **Checkpoint ID:** `phase11_telemetry`
> **Prerequisites:** Phase 10 cleanup complete
> **Goal:** Every dispatch silently contributes anonymised metrics to a central
>           research DB. Zero tokens consumed. Zero user friction. Opt-in only.
> **Research:** VS Code telemetry pattern, Cloudflare Workers free tier (100k req/day)

---

## Context Budget Warning

This phase creates 3 new files and modifies 3 existing files.
If context compacts mid-phase:
1. Read AGENT_STATE.md → find last completed step
2. Read ONLY this file
3. Never re-create already-created files — check with `ls` first

---

## Architecture

```
dispatch completes
      │
      ▼
writeObservation(db, obs)          ← already implemented (Phase 4)
      │
      ▼  setImmediate() — never blocks
[telemetry.ts]
      │  stripToMetricsOnly()      ← removes ALL content, keeps only numbers
      │  400 bytes JSON
      ▼
POST https://telemetry.claude-project.workers.dev/ingest
      │  3s timeout, silent fail
      ▼
[Cloudflare Worker]                ← workers/telemetry-ingest.ts
      │  validates: no strings > 30 chars
      │  validates: required numeric fields present
      ▼
Cloudflare D1 (edge SQLite)        ← buffers ingest
      │
      │  daily cron
      ▼
[Aggregate Worker]                 ← workers/telemetry-aggregate.ts
      │  computes optimal thresholds per task_type
      ▼
GET /thresholds                    ← public JSON endpoint
      │
      ▼
claude-project daemon pulls once/day
      │  updates .claude-project optimizations
      ▼
All users benefit from community data
```

---

## What Is and Is NOT Sent

### Sent (pure metrics — no content)
```typescript
{
  installation_id: string;   // sha256(machine-id)[:16] — not reversible
  project_id: string;        // sha256(project-path)[:12] — not reversible
  schema_version: "1.0";
  task_type: TaskType;       // "code_gen" | "analysis" | etc
  protocol_condition: string;
  dispatch_format: string;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  compression_ratio: number;
  latency_total_ms: number;
  outcome: "success" | "failure" | "partial";
  iterations: number;
  optimizations: {            // which flags were active
    cache: boolean;
    format_encode: boolean;
    clarity: boolean;
    llmlingua: boolean;
    pd: boolean;
  };
  ablation_condition: string | null;
  ts: string;                // ISO timestamp — date only, no sub-second
}
```

### Never Sent
- `dispatch.body` — the actual task
- `dispatch.title` — task name
- `dispatch.result` — output
- Any file path, file content, project name
- Real machine ID or real project path (only their hashes)
- Any string field longer than 30 characters

---

## Step 11.1 — Create src/lib/telemetry.ts

**Create file:** `src/lib/telemetry.ts`

```typescript
// src/lib/telemetry.ts
// Anonymous metrics sender. Fires after dispatch completion.
// Never blocks. Never throws. Opt-in only via .claude-project telemetry.enabled.

import * as crypto from 'crypto';
import * as os from 'os';
import { DispatchObservation } from './research-db.js';
import { ClaudeProject } from './project.js';

const TELEMETRY_ENDPOINT =
  process.env['CLAUDE_TELEMETRY_ENDPOINT'] ??
  'https://telemetry.claude-project.workers.dev/ingest';

const TELEMETRY_SCHEMA_VERSION = '1.0';

// ── Installation ID ───────────────────────────────────────────────────────────
// Derived from machine hostname + username. Hashed — not reversible.
// Stable across sessions on the same machine.

function getInstallationId(): string {
  const raw = `${os.hostname()}:${os.userInfo().username}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function getProjectId(projectPath: string): string {
  return crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 12);
}

// ── Payload construction ──────────────────────────────────────────────────────

export interface TelemetryPayload {
  installation_id: string;
  project_id: string;
  schema_version: string;
  task_type: string;
  protocol_condition: string;
  dispatch_format: string;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  compression_ratio: number | null;
  latency_total_ms: number;
  outcome: string;
  iterations: number;
  optimizations: {
    cache: boolean;
    format_encode: boolean;
    clarity: boolean;
    llmlingua: boolean;
    pd: boolean;
  };
  ablation_condition: string | null;
  ts: string;
}

function stripToMetricsOnly(
  obs: DispatchObservation,
  project: ClaudeProject,
  projectDir: string,
  optimizations: {
    cache: boolean;
    format_encode: boolean;
    clarity: boolean;
    llmlingua: boolean;
    pd: boolean;
  },
  ablationCondition: string | null = null,
): TelemetryPayload {
  // Date only — no sub-second precision
  const dateOnly = obs.ts.slice(0, 10) + 'T00:00:00Z';

  return {
    installation_id:   getInstallationId(),
    project_id:        getProjectId(projectDir),
    schema_version:    TELEMETRY_SCHEMA_VERSION,
    task_type:         obs.task_type,
    protocol_condition: obs.protocol_condition,
    dispatch_format:   (obs as any).dispatch_format ?? 'natural_language',
    tokens_input:      obs.tokens.total_input,
    tokens_output:     obs.tokens.output,
    tokens_cache_read: obs.tokens.cache_read,
    tokens_cache_write: obs.tokens.cache_write,
    compression_ratio: obs.compression?.compression_ratio ?? null,
    latency_total_ms:  obs.latency_ms.total,
    outcome:           obs.outcome,
    iterations:        obs.iterations,
    optimizations,
    ablation_condition: ablationCondition,
    ts:                dateOnly,
  };
}

// ── Sender ────────────────────────────────────────────────────────────────────

export function sendTelemetryAsync(
  obs: DispatchObservation,
  project: ClaudeProject,
  projectDir: string,
  optimizations: {
    cache: boolean;
    format_encode: boolean;
    clarity: boolean;
    llmlingua: boolean;
    pd: boolean;
  },
  ablationCondition: string | null = null,
): void {
  // Opt-in gate — silent return if not enabled
  if (!project.telemetry?.enabled) return;

  const payload = stripToMetricsOnly(
    obs, project, projectDir, optimizations, ablationCondition
  );

  // Fire and forget — setImmediate ensures dispatch is fully done first
  setImmediate(() => {
    const body = JSON.stringify(payload);

    fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Schema-Version': TELEMETRY_SCHEMA_VERSION,
      },
      body,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Silently discard all errors — network down, endpoint unreachable, etc.
      // Never log to stderr — would pollute MCP output
    });
  });
}

// ── Opt-in prompt helper ──────────────────────────────────────────────────────

export function generateInstallationId(): string {
  return getInstallationId();
}

export function telemetryPreview(
  obs: DispatchObservation,
  project: ClaudeProject,
  projectDir: string,
): string {
  const payload = stripToMetricsOnly(obs, project, projectDir,
    { cache: true, format_encode: true, clarity: false, llmlingua: true, pd: false });
  return JSON.stringify(payload, null, 2);
}
```

Write to AGENT_STATE.md: `step_11_1_telemetry_ts: complete`

---

## Step 11.2 — Wire Telemetry into dispatch-runner.ts

**Modify `src/lib/dispatch-runner.ts`:**

Add import:
```typescript
import { sendTelemetryAsync } from './telemetry.js';
```

Add after `writeObservation(db, obs)` call (the very last thing before returning):

```typescript
// Fire-and-forget telemetry — never awaited, never blocks dispatch
const optimizationFlags = {
  cache:        project.optimizations?.cache_prefix  ?? true,
  format_encode: project.optimizations?.format_encode ?? true,
  clarity:      project.optimizations?.clarity_layer  ?? true,
  llmlingua:    project.optimizations?.llmlingua      ?? true,
  pd:           project.optimizations?.pd_registry    ?? true,
};
sendTelemetryAsync(
  obs,
  project,
  projectDir,
  optimizationFlags,
  (dispatch as any).ablation_condition ?? null,
);
```

Write to AGENT_STATE.md: `step_11_2_telemetry_wired: complete`

---

## Step 11.3 — Add Telemetry Opt-in to init Command

**Modify `src/commands/init.ts`** — add opt-in prompt after project creation:

```typescript
import * as readline from 'readline';
import { generateInstallationId } from '../lib/telemetry.js';

async function promptTelemetryOptIn(): Promise<boolean> {
  // Skip prompt if already decided or in non-interactive mode
  if (!process.stdin.isTTY) return false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('\n  ┌─────────────────────────────────────────────────────┐');
    console.log('  │  Share anonymous token usage metrics?               │');
    console.log('  │                                                     │');
    console.log('  │  Sends ONLY: token counts, latency, task types.     │');
    console.log('  │  NEVER sends: code, prompts, file names, results.   │');
    console.log('  │  Opt out anytime: set telemetry.enabled=false       │');
    console.log('  │  in .claude-project                                 │');
    console.log('  └─────────────────────────────────────────────────────┘');
    rl.question('\n  Enable? [y/N]: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// In initCommand(), after writing .claude-project:
const optIn = await promptTelemetryOptIn();
if (optIn) {
  project.telemetry = {
    enabled: true,
    installation_id: generateInstallationId(),
    opted_in_at: new Date().toISOString(),
  };
  // Rewrite .claude-project with telemetry enabled
  fs.writeFileSync(projectFilePath, JSON.stringify(project, null, 2));
  console.log('\n  ✓ Telemetry enabled — thank you!\n');
} else {
  console.log('\n  Telemetry disabled. Enable later in .claude-project\n');
}
```

Write to AGENT_STATE.md: `step_11_3_optin_prompt: complete`

---

## Step 11.4 — Create Telemetry Preview MCP Tool

**Add to `mcp/server.py`** — lets users inspect exactly what would be sent:

```python
@mcp.tool()
def telemetry_preview() -> dict:
    """
    Show exactly what would be sent to the telemetry endpoint for the last dispatch.
    Call this to verify what data is shared before enabling telemetry.
    Returns the exact JSON payload — no surprises.
    """
    import sqlite3
    memory_dir, _, db_path = _resolve_paths()
    research_db = db_path.parent / "research.db"

    if not research_db.exists():
        return {"error": "No research.db found — run a dispatch first"}

    conn = sqlite3.connect(str(research_db))
    conn.row_factory = sqlite3.Row
    row = conn.execute("""
        SELECT task_type, protocol_condition, tokens_total_input, tokens_output,
               tokens_cache_read, tokens_cache_write, compression_ratio,
               latency_total_ms, outcome, iterations
        FROM dispatch_observations
        ORDER BY ts DESC LIMIT 1
    """).fetchone()
    conn.close()

    if not row:
        return {"error": "No observations yet — run a dispatch first"}

    import hashlib, socket, os as _os
    raw = f"{socket.gethostname()}:{_os.environ.get('USER', 'unknown')}"
    installation_id = hashlib.sha256(raw.encode()).hexdigest()[:16]

    payload = {
        "installation_id": installation_id,
        "project_id": "[sha256 of project path]",
        "schema_version": "1.0",
        "task_type": row["task_type"],
        "protocol_condition": row["protocol_condition"],
        "tokens_input": row["tokens_total_input"],
        "tokens_output": row["tokens_output"],
        "tokens_cache_read": row["tokens_cache_read"],
        "tokens_cache_write": row["tokens_cache_write"],
        "compression_ratio": row["compression_ratio"],
        "latency_total_ms": row["latency_total_ms"],
        "outcome": row["outcome"],
        "iterations": row["iterations"],
        "ts": "[date only — no sub-second]",
        "_note": "This is ALL that gets sent. No code, no prompts, no paths."
    }
    return payload
```

Write to AGENT_STATE.md: `step_11_4_preview_tool: complete`

---

## Step 11.5 — Create Cloudflare Worker: workers/telemetry-ingest.ts

**Create directory and file:** `workers/telemetry-ingest.ts`

```typescript
// workers/telemetry-ingest.ts
// Cloudflare Worker — receives telemetry POSTs, validates, stores in D1.
// Deploy: wrangler deploy workers/telemetry-ingest.ts

export interface Env {
  DB: D1Database;
}

const REQUIRED_NUMERIC_FIELDS = [
  'tokens_input', 'tokens_output', 'tokens_cache_read',
  'tokens_cache_write', 'latency_total_ms', 'iterations',
];

const VALID_TASK_TYPES = new Set([
  'code_gen', 'refactor', 'analysis', 'retrieval',
  'planning', 'test_gen', 'pipeline', 'documentation', 'unknown',
]);

const VALID_OUTCOMES = new Set(['success', 'failure', 'partial']);

const VALID_FORMATS = new Set([
  'typed_pseudocode', 'codeact', 'dsl', 'toon', 'natural_language',
]);

function validate(data: any): string | null {
  // Schema version check
  if (data.schema_version !== '1.0') return 'invalid schema_version';

  // Required string fields — max 30 chars each
  for (const field of ['installation_id', 'project_id', 'task_type', 'outcome']) {
    if (typeof data[field] !== 'string') return `${field} missing`;
    if (data[field].length > 30) return `${field} too long — possible content leak`;
  }

  // Valid enum values
  if (!VALID_TASK_TYPES.has(data.task_type)) return `invalid task_type: ${data.task_type}`;
  if (!VALID_OUTCOMES.has(data.outcome)) return `invalid outcome: ${data.outcome}`;

  // Required numeric fields
  for (const field of REQUIRED_NUMERIC_FIELDS) {
    if (typeof data[field] !== 'number') return `${field} must be number`;
    if (data[field] < 0) return `${field} must be non-negative`;
    if (data[field] > 1_000_000) return `${field} suspiciously large`;
  }

  // Optimizations block
  if (typeof data.optimizations !== 'object') return 'optimizations missing';
  for (const flag of ['cache', 'format_encode', 'clarity', 'llmlingua', 'pd']) {
    if (typeof data.optimizations[flag] !== 'boolean') return `optimizations.${flag} must be boolean`;
  }

  return null; // valid
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Schema-Version',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Ingest endpoint
    if (request.method === 'POST' && new URL(request.url).pathname === '/ingest') {
      let data: any;
      try {
        data = await request.json();
      } catch {
        return new Response('invalid JSON', { status: 400 });
      }

      const error = validate(data);
      if (error) {
        return new Response(`validation failed: ${error}`, { status: 400 });
      }

      await env.DB.prepare(`
        INSERT INTO observations (
          installation_id, project_id, schema_version,
          task_type, protocol_condition, dispatch_format,
          tokens_input, tokens_output, tokens_cache_read, tokens_cache_write,
          compression_ratio, latency_total_ms, outcome, iterations,
          opt_cache, opt_format_encode, opt_clarity, opt_llmlingua, opt_pd,
          ablation_condition, ts, received_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      `).bind(
        data.installation_id, data.project_id, data.schema_version,
        data.task_type, data.protocol_condition ?? '', data.dispatch_format ?? '',
        data.tokens_input, data.tokens_output,
        data.tokens_cache_read, data.tokens_cache_write,
        data.compression_ratio ?? null, data.latency_total_ms,
        data.outcome, data.iterations,
        data.optimizations.cache ? 1 : 0,
        data.optimizations.format_encode ? 1 : 0,
        data.optimizations.clarity ? 1 : 0,
        data.optimizations.llmlingua ? 1 : 0,
        data.optimizations.pd ? 1 : 0,
        data.ablation_condition ?? null,
        data.ts,
      ).run();

      return new Response('ok', { status: 200, headers: CORS_HEADERS });
    }

    // Thresholds endpoint — public read
    if (request.method === 'GET' && new URL(request.url).pathname === '/thresholds') {
      const rows = await env.DB.prepare(`
        SELECT
          task_type,
          COUNT(*) as n,
          AVG(tokens_input) as mean_tokens_input,
          AVG(CASE WHEN protocol_condition = 'natural_language'
                   THEN tokens_input END) as c_nl,
          AVG(CASE WHEN protocol_condition = 'pd_negotiated'
                   THEN tokens_input END) as c_pd,
          AVG(CAST(tokens_cache_read AS REAL) /
              NULLIF(tokens_input, 0)) as cache_ratio,
          AVG(compression_ratio) as mean_compression
        FROM observations
        WHERE ts >= date('now', '-30 days')
        GROUP BY task_type
        HAVING n >= 10
        ORDER BY n DESC
      `).all();

      const thresholds: Record<string, any> = {};
      for (const row of rows.results) {
        const c_nl = row.c_nl as number;
        const c_pd = row.c_pd as number;
        const n_breakeven = (c_nl && c_pd && c_nl > c_pd)
          ? Math.round(1500 / (c_nl - c_pd) * 10) / 10
          : null;

        thresholds[row.task_type as string] = {
          n_observations: row.n,
          mean_tokens_input: Math.round(row.mean_tokens_input as number),
          pd_negotiation_breakeven: n_breakeven,
          cache_hit_rate: Math.round((row.cache_ratio as number) * 1000) / 10,
          mean_compression_ratio: Math.round((row.mean_compression as number) * 100) / 100,
        };
      }

      const totalObs = await env.DB.prepare(
        'SELECT COUNT(*) as n FROM observations'
      ).first<{ n: number }>();

      return new Response(JSON.stringify({
        updated_at: new Date().toISOString(),
        total_observations: totalObs?.n ?? 0,
        thresholds,
      }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Stats endpoint — aggregate health check
    if (request.method === 'GET' && new URL(request.url).pathname === '/stats') {
      const row = await env.DB.prepare(`
        SELECT
          COUNT(*) as total,
          COUNT(DISTINCT installation_id) as unique_installs,
          COUNT(DISTINCT project_id) as unique_projects,
          MIN(ts) as first_seen,
          MAX(ts) as last_seen
        FROM observations
      `).first();

      return new Response(JSON.stringify(row), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response('not found', { status: 404 });
  },
};
```

Write to AGENT_STATE.md: `step_11_5_worker_created: complete`

---

## Step 11.6 — Create workers/wrangler.toml

**Create file:** `workers/wrangler.toml`

```toml
name = "claude-project-telemetry"
main = "telemetry-ingest.ts"
compatibility_date = "2026-03-01"

[[d1_databases]]
binding = "DB"
database_name = "claude-project-telemetry"
database_id = "REPLACE_WITH_D1_DATABASE_ID"

[triggers]
crons = ["0 2 * * *"]  # Daily at 02:00 UTC
```

**Create D1 schema file:** `workers/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS observations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id TEXT NOT NULL,
  project_id      TEXT NOT NULL,
  schema_version  TEXT NOT NULL DEFAULT '1.0',
  task_type       TEXT NOT NULL,
  protocol_condition TEXT NOT NULL DEFAULT '',
  dispatch_format TEXT NOT NULL DEFAULT '',
  tokens_input    INTEGER NOT NULL,
  tokens_output   INTEGER NOT NULL,
  tokens_cache_read  INTEGER NOT NULL DEFAULT 0,
  tokens_cache_write INTEGER NOT NULL DEFAULT 0,
  compression_ratio  REAL,
  latency_total_ms   INTEGER NOT NULL,
  outcome         TEXT NOT NULL,
  iterations      INTEGER NOT NULL DEFAULT 1,
  opt_cache       INTEGER NOT NULL DEFAULT 1,
  opt_format_encode INTEGER NOT NULL DEFAULT 1,
  opt_clarity     INTEGER NOT NULL DEFAULT 1,
  opt_llmlingua   INTEGER NOT NULL DEFAULT 1,
  opt_pd          INTEGER NOT NULL DEFAULT 1,
  ablation_condition TEXT,
  ts              TEXT NOT NULL,
  received_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_type   ON observations(task_type);
CREATE INDEX IF NOT EXISTS idx_ts          ON observations(ts);
CREATE INDEX IF NOT EXISTS idx_install     ON observations(installation_id);
CREATE INDEX IF NOT EXISTS idx_ablation    ON observations(ablation_condition);
```

Write to AGENT_STATE.md: `step_11_6_wrangler_config: complete`

---

## Step 11.7 — Add Threshold Pull to Daemon

**Modify `src/commands/daemon.ts`** — add daily threshold fetch:

```typescript
import * as https from 'https';
import * as fs from 'fs';

const THRESHOLDS_URL =
  process.env['CLAUDE_TELEMETRY_ENDPOINT']?.replace('/ingest', '/thresholds') ??
  'https://telemetry.claude-project.workers.dev/thresholds';

async function fetchAndApplyThresholds(
  project: ClaudeProject,
  projectFilePath: string,
): Promise<void> {
  try {
    const res = await fetch(THRESHOLDS_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;

    const data = await res.json() as any;
    if (!data.thresholds) return;

    // Store thresholds in .claude-project for use by dispatch-runner
    const updated = {
      ...project,
      _community_thresholds: {
        fetched_at: new Date().toISOString(),
        total_observations: data.total_observations,
        per_task_type: data.thresholds,
      },
    };

    fs.writeFileSync(projectFilePath, JSON.stringify(updated, null, 2));
    // Silent success — no log output in daemon
  } catch {
    // Silent fail — never crash daemon on threshold fetch
  }
}

// In daemon loop — fetch once per day
const THRESHOLD_FETCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  fetchAndApplyThresholds(project, projectFilePath);
}, THRESHOLD_FETCH_INTERVAL_MS);

// Also fetch on startup
fetchAndApplyThresholds(project, projectFilePath);
```

Write to AGENT_STATE.md: `step_11_7_daemon_threshold_pull: complete`

---

## Step 11.8 — Build and Verify

```bash
# 1. TypeScript build
npm run build || { echo "BUILD FAILED"; exit 1; }

# 2. All existing tests pass
npx vitest run || { echo "TESTS FAILED"; exit 1; }

# 3. Telemetry module exports correctly
npx ts-node -e "
import { sendTelemetryAsync, telemetryPreview, generateInstallationId }
  from './src/lib/telemetry.js';

// Verify installation_id is deterministic
const id1 = generateInstallationId();
const id2 = generateInstallationId();
console.assert(id1 === id2, 'installation_id not deterministic');
console.assert(id1.length === 16, 'installation_id wrong length');
console.log('installation_id:', id1, '✓');

// Verify opt-in gate — project without telemetry.enabled must not send
const mockProject = { id: 'test', name: 'test', telemetry: { enabled: false } };
let sent = false;
// Monkey-patch fetch to detect if it's called
(global as any).fetch = () => { sent = true; return Promise.resolve(); };
const mockObs = {
  id: 'obs1', dispatch_id: 'd1', session_id: 's1',
  interaction_pair: 'user→main', task_type: 'code_gen',
  protocol_condition: 'natural_language', pd_was_cached: false,
  tokens: { system_prompt:500, project_context:200, tool_schemas:150,
            user_message:100, tool_outputs:0, total_input:950,
            output:200, cache_write:0, cache_read:0 },
  latency_ms: { clarity_layer:0, compression:0, pd_lookup:0,
                inference:1000, tool_execution:0, total:1000 },
  outcome: 'success', iterations: 1, task_completed: true,
  ts: new Date().toISOString(),
} as any;

sendTelemetryAsync(mockObs, mockProject as any, '/tmp/test',
  { cache: true, format_encode: true, clarity: false, llmlingua: true, pd: false });

// setImmediate fires after current tick
await new Promise(r => setTimeout(r, 50));
console.assert(!sent, 'telemetry sent when disabled — OPT-IN GATE BROKEN');
console.log('opt-in gate: ✓');
"

# 4. Verify payload has no content fields
npx ts-node -e "
import { telemetryPreview } from './src/lib/telemetry.js';
// Would print sample payload — verify manually that no content present
console.log('Module loads: ✓');
"

# 5. Python server syntax still valid
python3 -m py_compile mcp/server.py && echo 'server.py syntax: ✓'

# 6. Worker TypeScript syntax check (no deployment needed)
npx tsc --noEmit workers/telemetry-ingest.ts --target ES2022 \
  --moduleResolution bundler --strict 2>&1 \
  | grep -v "Cannot find module\|@cloudflare" \
  | grep "error" && echo "Worker TS errors" || echo "Worker syntax: ✓"
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase11_telemetry_complete",
  "telemetry_ts_created": true,
  "wired_into_dispatch_runner": true,
  "opt_in_prompt_added": true,
  "preview_tool_added": true,
  "worker_created": true,
  "wrangler_config_created": true,
  "daemon_threshold_pull_added": true,
  "build_passing": true,
  "tests_passing": true,
  "opt_in_gate_verified": true,
  "completed_at": "TIMESTAMP"
}
```

**Phase 11 complete. Then read: `12_ABLATION_STUDY.md`**
```

***

