Now writing — this replaces the original `10_CLEANUP_SERVER.md` and becomes **one comprehensive file**:

***

## `10_CLEANUP_FULL_REPO.md`

```markdown
# 10 — FULL REPOSITORY CLEANUP
## Remove All Legacy Code: Obsidian, diary_path, Machine-Specific Paths

> **Checkpoint ID:** `phase10_cleanup`
> **Prerequisites:** AGENT_STATE.md shows `phase: complete` (all phases 1–9 done)
> **Goal:** Zero legacy references across all 12 affected files.
>           155 issues across the repo — every one fixed and test-certified.
> **Scope:** mcp/server.py, src/lib/*.ts, src/commands/*.ts,
>            schema/*.json, package.json, README.md, .github/

---

## Context Budget Warning

This phase touches 12 files. Never load them all at once.
Work file-by-file. After each file: verify → checkpoint → move on.
If context compacts mid-phase:
1. Read AGENT_STATE.md → find `cleanup_file_index`
2. Read ONLY this file
3. Resume from the file at that index

---

## Master File Index

Process files in this exact order. Check off each in AGENT_STATE.md.

```
Index  File                                    Issues  Priority
  1    src/lib/paths.ts                          11    CRITICAL — all paths flow from here
  2    src/lib/project.ts                         9    CRITICAL — schema types
  3    src/lib/events.ts                          5    HIGH — uses diary_path
  4    src/lib/registry.ts                        2    HIGH — uses diary_path
  5    src/commands/init.ts                       8    HIGH — seeds legacy files
  6    src/commands/sync.ts                       9    HIGH — entire file is obsidian-only
  7    src/lib/automation.ts                      7    MEDIUM — sync_obsidian action
  8    schema/claude-project.schema.json         12    MEDIUM — public schema
  9    package.json                               6    MEDIUM — publisher, VS Code commands
 10    mcp/server.py                             70    HIGH — largest file, do last
 11    README.md                                 14    LOW — docs only
 12    .github/workflows/release.yml              2    LOW — CI only
```

---

## FILE 1: src/lib/paths.ts (CRITICAL — do first)

This is the root of the path problem. Everything reads from here.

**Replace the entire file with:**

```typescript
// src/lib/paths.ts
// Resolves all file-system paths for a claude-project project.
// Single source of truth — no obsidian paths, no legacy WAKEUP/journal paths.

import * as os from 'os';
import * as path from 'path';
import { ClaudeProject } from './project.js';

export interface ProjectPaths {
  memoryDir: string;
  dispatchesDir: string;
  eventsFile: string;
  dbPath: string;
  researchDbPath: string;
}

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

export function resolvePaths(project: ClaudeProject, projectDir?: string): ProjectPaths {
  // memory_path is the new field. diary_path kept for backward compat read-only.
  const rawMemory =
    project.memory_path ??
    (project as any).diary_path ??
    process.env['CLAUDE_PROJECT_DIR'] ??
    path.join(os.homedir(), '.claude', 'projects', `project-${project.id?.slice(0, 8) ?? 'default'}`, 'memory');

  const memoryDir = expandHome(rawMemory);
  const projectRoot = path.dirname(memoryDir);

  return {
    memoryDir,
    dispatchesDir: path.join(projectRoot, 'dispatches'),
    eventsFile:    path.join(projectRoot, 'events.jsonl'),
    dbPath:        path.join(projectRoot, 'memory.db'),
    researchDbPath: path.join(projectRoot, 'research.db'),
  };
}

export function getDefaultMemoryDir(): string {
  return (
    process.env['CLAUDE_PROJECT_DIR'] ??
    path.join(os.homedir(), '.claude', 'projects', 'default', 'memory')
  );
}
```

**Verify:**
```bash
npx ts-node -e "
import { resolvePaths } from './src/lib/paths.js';
const p = resolvePaths({ id: 'test1234', name: 'test', memory_path: '~/.claude/projects/test/memory' } as any);
console.assert(!JSON.stringify(p).includes('obsidian'), 'obsidian ref found');
console.assert(!JSON.stringify(p).includes('WAKEUP'), 'WAKEUP ref found');
console.assert(!JSON.stringify(p).includes('journal'), 'journal ref found');
console.log('paths.ts clean:', JSON.stringify(p, null, 2));
"
```

Write to AGENT_STATE.md: `cleanup_file_index: 1, cleanup_paths_ts: complete`

---

## FILE 2: src/lib/project.ts (CRITICAL — schema types)

**Changes:**

1. In `ClaudeProject` interface — remove obsidian fields, rename diary_path:

```typescript
export interface ClaudeProject {
  $schema?: string;
  id: string;
  name: string;
  description?: string;
  version?: string;
  memory_path?: string;         // NEW canonical name
  diary_path?: string;          // KEEP for backward compat read-only (deprecated)
  agents?: Record<string, AgentDefinition>;
  tools?: string[];
  tech_stack?: string[];
  optimizations?: {
    cache_prefix?: boolean;
    format_encode?: boolean;
    clarity_layer?: boolean;
    llmlingua?: boolean;
    pd_registry?: boolean;
  };
  telemetry?: {
    enabled?: boolean;
    installation_id?: string;
    opted_in_at?: string;
  };
  hooks?: HookDefinition[];
  automations?: AutomationDefinition[];
  // REMOVED: obsidian_vault, obsidian_folder
}
```

2. In `AutomationAction` union — remove `sync_obsidian`:

```typescript
export type AutomationActionType =
  | 'run_command'
  | 'dispatch_agent'
  | 'write_event'
  | 'send_notification';
  // sync_obsidian REMOVED — use CLAUDE_OBSIDIAN_VAULT env var directly
```

3. Fix `DEFAULTS` block — remove obsidian, fix schema URL:

```typescript
export const DEFAULTS = {
  schemaUrl:
    'https://cdn.jsdelivr.net/npm/claude-project/schema/claude-project.schema.json',
  // obsidianVault REMOVED
} as const;
```

4. Fix `createDefaultProject()` — remove obsidian/diary writes:

```typescript
export function createDefaultProject(name: string, id: string): ClaudeProject {
  const memoryPath = path.join(
    os.homedir(), '.claude', 'projects', `project-${id.slice(0, 8)}`, 'memory'
  );
  return {
    $schema: DEFAULTS.schemaUrl,
    id,
    name,
    version: '5.0',
    memory_path: memoryPath,
    agents: {},
    tools: [],
    tech_stack: [],
    optimizations: {
      cache_prefix: true,
      format_encode: true,
      clarity_layer: true,
      llmlingua: true,
      pd_registry: true,
    },
    telemetry: { enabled: false },
    automations: [],
    hooks: [],
  };
}
```

**Verify:**
```bash
npx ts-node -e "
import { createDefaultProject } from './src/lib/project.js';
const p = createDefaultProject('test', 'abc12345');
const s = JSON.stringify(p);
console.assert(!s.includes('obsidian'), 'obsidian in project');
console.assert(!s.includes('diary'), 'diary in project');
console.assert(s.includes('memory_path'), 'memory_path missing');
console.assert(s.includes('optimizations'), 'optimizations missing');
console.log('project.ts clean ✓');
"
npm run build
```

Write to AGENT_STATE.md: `cleanup_file_index: 2, cleanup_project_ts: complete`

---

## FILE 3: src/lib/events.ts

**Changes (surgical — 3 lines only):**

1. L4 comment: change `<diary_path>` → `<memory_path>`
2. L34: remove `| 'sync_obsidian'` from EventType union
3. L52–L58: fix the `appendEvent` path resolution:

```typescript
// OLD:
const diaryDir = expandHome(project.diary_path);
// NEW:
import { resolvePaths } from './paths.js';
// inside appendEvent():
const { eventsFile } = resolvePaths(project);
// use eventsFile directly instead of constructing from diary_path
```

Full corrected appendEvent signature area:
```typescript
export function appendEvent(
  project: ClaudeProject,
  eventType: EventType,
  data: Record<string, unknown>,
): void {
  const { eventsFile } = resolvePaths(project);
  // ... rest of function uses eventsFile directly
}
```

**Verify:**
```bash
npx ts-node -e "
import { appendEvent } from './src/lib/events.js';
const p = { id: 'test1234', name: 'test', memory_path: '/tmp/test-memory' } as any;
// Should not throw
console.log('events.ts clean ✓');
"
npm run build
```

Write to AGENT_STATE.md: `cleanup_file_index: 3, cleanup_events_ts: complete`

---

## FILE 4: src/lib/registry.ts

**Changes:**

1. L20: rename `diary_path: string` → `memory_path: string` in RegistryEntry interface
2. L91: rename field in registry write

```typescript
// OLD:
diary_path: expandHome(project.diary_path),
// NEW:
memory_path: expandHome(project.memory_path ?? (project as any).diary_path ?? ''),
```

**Verify:**
```bash
npm run build
grep -n "diary_path" src/lib/registry.ts && echo "STILL PRESENT" || echo "Clean ✓"
```

Write to AGENT_STATE.md: `cleanup_file_index: 4, cleanup_registry_ts: complete`

---

## FILE 5: src/commands/init.ts

**Changes:**

1. Remove `obsidian?: string` from options interface
2. Remove `if (options.obsidian) project.obsidian_vault = ...` line
3. Remove `if (options.diary) project.diary_path = ...` line
4. Remove the WAKEUP.md seeding block (L62–L73)
5. Remove the SESSION_JOURNAL.md seeding block if present
6. Remove the Obsidian project folder creation block (L96–L105)
7. Remove Obsidian path from the success message (L147)

**Add instead — seed CONTEXT.json (replaces WAKEUP.md):**

```typescript
// Seed initial context file for get_context() tool
const projectRoot = path.dirname(paths.memoryDir);
const contextPath = path.join(projectRoot, 'context.json');
if (!fs.existsSync(contextPath)) {
  fs.writeFileSync(contextPath, JSON.stringify({
    stage: 'initialized',
    summary: `Project ${project.name} initialized.`,
    blockers: [],
    critical_facts: [],
    next_steps: [],
    updated_at: new Date().toISOString(),
  }, null, 2));
}
```

**Updated success message:**
```typescript
console.log(
  `\n  ✓ claude-project initialized\n\n` +
  `  Project:  ${project.name}\n` +
  `  Memory:   ${paths.memoryDir}\n` +
  `  Context:  ${contextPath}\n` +
  `  Dispatches: ${paths.dispatchesDir}\n\n` +
  `  MCP config (add to ~/.mcp.json):\n` +
  `  { "mcpServers": { "claude-project": { "command": "claude-project", "args": ["mcp"] } } }\n`
);
```

**Verify:**
```bash
npm run build
grep -n "obsidian\|WAKEUP\|journal\|diary" src/commands/init.ts \
  && echo "ISSUES REMAIN" || echo "Clean ✓"
```

Write to AGENT_STATE.md: `cleanup_file_index: 5, cleanup_init_ts: complete`

---

## FILE 6: src/commands/sync.ts

The entire current file syncs memory to Obsidian. Rewrite it as a general
export/status command that shows project state and optionally syncs to Obsidian
only if `CLAUDE_OBSIDIAN_VAULT` is set.

**Replace entire file:**

```typescript
// src/commands/sync.ts
// Displays project sync status. Obsidian export is optional (set CLAUDE_OBSIDIAN_VAULT).
import * as fs from 'fs';
import * as path from 'path';
import { loadProject } from '../lib/project.js';
import { resolvePaths } from '../lib/paths.js';

export async function syncCommand(): Promise<void> {
  const { project } = loadProject(process.cwd());
  const paths = resolvePaths(project);

  console.log('\n  claude-project — sync status\n');
  console.log(`  Project:    ${project.name} (${project.id})`);
  console.log(`  Memory:     ${paths.memoryDir}`);
  console.log(`  Dispatches: ${paths.dispatchesDir}`);
  console.log(`  Events:     ${paths.eventsFile}`);
  console.log(`  DB:         ${paths.dbPath}`);

  // Count files in memory dir
  const memFiles = fs.existsSync(paths.memoryDir)
    ? fs.readdirSync(paths.memoryDir).length
    : 0;
  console.log(`\n  Memory files: ${memFiles}`);

  // Optional Obsidian export
  const obsidianVault = process.env['CLAUDE_OBSIDIAN_VAULT'];
  if (obsidianVault) {
    const obsFolder = process.env['CLAUDE_OBSIDIAN_FOLDER'] ?? `Projects/${project.name}`;
    const obsDir = path.join(obsidianVault, obsFolder);
    if (!fs.existsSync(obsidianVault)) {
      console.log(`\n  Obsidian vault not found: ${obsidianVault}`);
      console.log('  Set CLAUDE_OBSIDIAN_VAULT to a valid path to enable sync.\n');
      return;
    }
    fs.mkdirSync(obsDir, { recursive: true });
    let count = 0;
    for (const f of fs.readdirSync(paths.memoryDir)) {
      if (f.endsWith('.md') || f.endsWith('.json')) {
        fs.copyFileSync(path.join(paths.memoryDir, f), path.join(obsDir, f));
        count++;
      }
    }
    console.log(`\n  Synced ${count} files → ${obsDir}\n`);
  } else {
    console.log('\n  Obsidian sync: disabled (set CLAUDE_OBSIDIAN_VAULT to enable)\n');
  }
}
```

**Verify:**
```bash
npm run build
grep -n "ClaudeLab\|obsidianProjectDir\|obsidianVault\b" src/commands/sync.ts \
  && echo "ISSUES REMAIN" || echo "Clean ✓"
```

Write to AGENT_STATE.md: `cleanup_file_index: 6, cleanup_sync_ts: complete`

---

## FILE 7: src/lib/automation.ts

**Change (surgical):**

In the action handler map, replace the `sync_obsidian` handler with a no-op:

```typescript
// OLD:
sync_obsidian: (_action, ctx) => {
  if (!fs.existsSync(paths.obsidianVault)) return 'Obsidian vault not found — skipped';
  // ... copy files ...
  return `Synced ${count} files to Obsidian`;
},

// NEW:
sync_obsidian: (_action, _ctx) => {
  // Deprecated — use CLAUDE_OBSIDIAN_VAULT env var and claude-project sync instead
  const vault = process.env['CLAUDE_OBSIDIAN_VAULT'];
  if (!vault) return 'sync_obsidian: CLAUDE_OBSIDIAN_VAULT not set — skipped';
  // Delegate to sync command
  return 'sync_obsidian: use `claude-project sync` CLI command instead';
},
```

Remove `obsidianVault`, `obsidianFolder`, `obsidianProjectDir` from any
`paths` destructuring in this file — they no longer exist in ProjectPaths.

**Verify:**
```bash
npm run build
grep -n "obsidianProjectDir\|obsidianFolder\|obsidianVault" src/lib/automation.ts \
  && echo "ISSUES REMAIN" || echo "Clean ✓"
```

Write to AGENT_STATE.md: `cleanup_file_index: 7, cleanup_automation_ts: complete`

---

## FILE 8: schema/claude-project.schema.json

**Changes:**

1. Fix `$id` URL:
```json
"$id": "https://cdn.jsdelivr.net/npm/claude-project/schema/claude-project.schema.json"
```

2. Replace `diary_path` property with `memory_path`:
```json
"memory_path": {
  "type": "string",
  "description": "Absolute path to the memory directory for this project.",
  "examples": ["~/.claude/projects/my-project/memory"]
},
"diary_path": {
  "type": "string",
  "description": "DEPRECATED — use memory_path. Kept for backward compatibility.",
  "deprecated": true
}
```

3. Remove `obsidian_vault` and `obsidian_folder` properties entirely.

4. In `source` field examples — remove machine-specific examples:
```json
"examples": ["devbox/user", "thinkpad/user", "pi5/pi"]
```

5. Remove `sync_obsidian` from the `AutomationAction.type` enum.

6. Add `optimizations` and `telemetry` to schema:
```json
"optimizations": {
  "type": "object",
  "description": "Token optimization flags for agent dispatches.",
  "properties": {
    "cache_prefix":   { "type": "boolean", "default": true },
    "format_encode":  { "type": "boolean", "default": true },
    "clarity_layer":  { "type": "boolean", "default": true },
    "llmlingua":      { "type": "boolean", "default": true },
    "pd_registry":    { "type": "boolean", "default": true }
  }
},
"telemetry": {
  "type": "object",
  "description": "Anonymous usage telemetry — opt-in only.",
  "properties": {
    "enabled":          { "type": "boolean", "default": false },
    "installation_id":  { "type": "string" },
    "opted_in_at":      { "type": "string", "format": "date-time" }
  }
}
```

**Verify:**
```bash
python3 -c "import json; s=json.load(open('schema/claude-project.schema.json')); \
  text=json.dumps(s); \
  assert 'obsidian_vault' not in text, 'obsidian_vault in schema'; \
  assert 'diary_path' not in text or 'deprecated' in text, 'diary_path not deprecated'; \
  assert 'memory_path' in text, 'memory_path missing'; \
  assert 'optimizations' in text, 'optimizations missing'; \
  print('schema clean ✓')"
```

Write to AGENT_STATE.md: `cleanup_file_index: 8, cleanup_schema_json: complete`

---

## FILE 9: package.json

**Changes:**

1. Fix author and publisher:
```json
"author": "infraax",
"publisher": "infraax"
```

2. Remove the VS Code command for Obsidian sync:
```json
// REMOVE this entire block:
{
  "command": "claude-project.syncObsidian",
  "title": "Sync Memory → Obsidian"
}
```

3. Remove `claudeProject.obsidianVault` configuration setting.

4. Fix MCP server name in the auto-install description (L124):
```json
"description": "Automatically add claude-project MCP entry to ~/.mcp.json when a .claude-project file is detected"
```

**Verify:**
```bash
node -e "const p=require('./package.json'); \
  console.assert(p.author==='infraax','author wrong'); \
  console.assert(!JSON.stringify(p).includes('obsidianVault'),'obsidianVault in package.json'); \
  console.assert(!JSON.stringify(p).includes('claudelab'),'claudelab in package.json'); \
  console.log('package.json clean ✓')"
npm run build
```

Write to AGENT_STATE.md: `cleanup_file_index: 9, cleanup_package_json: complete`

---

## FILE 10: mcp/server.py

Apply all changes from the detailed spec below in this order:

**10a — Rewrite module docstring (L1–L65)**
Replace with clean v5 docstring. No machine paths, no diary references.
New header: `Claude Project — MCP Memory & Dispatch Server v5`

**10b — Fix env vars (L44–L55)**
- `CLAUDE_DIARY_PATH` → `CLAUDE_PROJECT_DIR`
- Add `_OBSIDIAN_ENABLED = bool(os.environ.get("CLAUDE_OBSIDIAN_VAULT", ""))`

**10c — Fix _get_source() (L72)**
Remove all `MacBook/gebruiker` hardcodes. Use `hostname/user` generic pattern.

**10d — Fix _resolve_paths() (L132)**
Return `(memory_dir, dispatches_dir, db_path)` — remove all obsidian return values.
Update every caller.

**10e — Fix _sync_obsidian() (L167)**
First line: `if not _OBSIDIAN_ENABLED: return`

**10f — Fix MCP server name (L304)**
`name="claude-diary"` → `name="claude-project"`

**10g — Fix init_project tool (L326)**
Remove `diary_path`, `obsidian_vault`, `obsidian_folder` from written JSON.
Add `memory_path`, `optimizations`, `telemetry` instead.

**10h — Remove 10 legacy tools (bottom-up order):**
`update_dexter_profile` → `read_memory_file` → `memory_append_thought` →
`get_today` → `list_sessions` → `journal_append` → `wakeup_update_section` →
`wakeup_read` → `get_context_legacy` → `get_source_info`

**10i — Fix _async_obsidian_export() (L1443)**
First line: `if not _OBSIDIAN_ENABLED: return`

**Verify:**
```bash
echo "=== Checking server.py for legacy refs ==="
grep -n "diary_path\|obsidian_vault\|obsidian_folder\|CLAUDE_DIARY_PATH\
\|claude-diary\|MacBook\|gebruiker\|WirePod\|ClaudeLab\
\|update_dexter_profile\|journal_append\|wakeup_read\|wakeup_update\
\|get_context_legacy\|list_sessions\|get_today\|memory_append_thought\
\|read_memory_file\|get_source_info" mcp/server.py \
  | grep -v "#.*compat\|diary_path.*compat" \
  && echo "ISSUES REMAIN ✗" || echo "Clean ✓"

python3 -m py_compile mcp/server.py && echo "Syntax OK ✓"
echo "Line count: $(wc -l < mcp/server.py)"
```

Write to AGENT_STATE.md: `cleanup_file_index: 10, cleanup_server_py: complete`

---

## FILE 11: README.md

**Changes:**

1. Update MCP config block (L201):
```json
{ "mcpServers": { "claude-project": { "command": "claude-project", "args": ["mcp"] } } }
```

2. Remove `claude-project sync` from Obsidian-only usage.

3. Update `.claude-project` example schema block — remove obsidian fields, add optimizations/telemetry.

4. Update env vars table (L300–L302):
```
| CLAUDE_PROJECT_DIR    | ~/.claude/projects/default/memory | Default memory path            |
| CLAUDE_OBSIDIAN_VAULT | (unset)                           | Enable optional Obsidian sync  |
```

5. Update VS Code badge URL: `claudelab.claude-project` → `infraax.claude-project`

**Verify:**
```bash
grep -n "ClaudeLab\|WirePod\|gebruiker\|claude-diary\|diary_path\b" README.md \
  && echo "ISSUES REMAIN" || echo "Clean ✓"
```

Write to AGENT_STATE.md: `cleanup_file_index: 11, cleanup_readme_md: complete`

---

## FILE 12: .github/workflows/release.yml

**Change (one line):**
L160: `"claude-diary"` → `"claude-project"` in the MCP config example.

**Verify:**
```bash
grep -n "claude-diary" .github/workflows/release.yml \
  && echo "ISSUES REMAIN" || echo "Clean ✓"
```

Write to AGENT_STATE.md: `cleanup_file_index: 12, cleanup_release_yml: complete`

---

## Final Certification Test Suite

After all 12 files done, run this full sweep — **must produce zero output:**

```bash
#!/bin/bash
# scripts/certify_clean.sh
# Exit 1 if ANY legacy reference found. Zero output = clean.

set -e

PATTERNS=(
  "gebruiker"
  "WirePod"
  "ClaudeLab"
  "Volumes/Claude"
  "MacBook / "
  "claude-diary"
  "CLAUDE_DIARY_PATH"
  "@claudelab"
  "obsidianVault ="
  "obsidianFolder ="
  "obsidianProjectDir ="
  "obsidian_vault:"
  "obsidian_folder:"
  "diary_path ="
  "diary_path:"
  "SESSION_JOURNAL"
  "WAKEUP\.md"
  "wakeup_read"
  "wakeup_update_section"
  "get_context_legacy"
  "update_dexter_profile"
  "journal_append"
  "list_sessions\(\)"
  "read_memory_file\("
  "memory_append_thought\("
)

SEARCH_DIRS="src mcp schema"
SEARCH_FILES="package.json README.md .github/workflows/release.yml"
ERRORS=0

for pattern in "${PATTERNS[@]}"; do
  results=$(grep -rn "$pattern" $SEARCH_DIRS $SEARCH_FILES \
    --include="*.ts" --include="*.py" --include="*.json" \
    --include="*.md" --include="*.yml" \
    2>/dev/null | grep -v "^Binary\|#.*backward.compat\|diary_path.*compat" || true)
  if [ -n "$results" ]; then
    echo "FAIL [$pattern]:"
    echo "$results"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo "✓ CERTIFICATION PASSED — zero legacy references"
else
  echo "✗ CERTIFICATION FAILED — $ERRORS patterns found"
  exit 1
fi
```

```bash
chmod +x scripts/certify_clean.sh
./scripts/certify_clean.sh
npm run build
npx vitest run
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase10_cleanup_complete",
  "files_cleaned": 12,
  "legacy_refs_removed": 155,
  "certification_passed": true,
  "build_passing": true,
  "tests_passing": true,
  "completed_at": "TIMESTAMP"
}
```

**Phase 10 complete. Then read: `11_TELEMETRY.md`**
```
