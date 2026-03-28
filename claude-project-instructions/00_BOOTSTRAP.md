

## `00_BOOTSTRAP.md`

This is the **only file the agent reads first** — short, dense, all commands.

```markdown
# 00 — BOOTSTRAP
## Read this first. Nothing else. Execute sequentially.

> **Token budget:** This file = ~1.5k tokens. AGENT_STATE = ~3k. Phase file = ~10k.
> Total startup overhead target: ≤15k tokens. Do NOT read other files yet.

---

## Step B.1 — Orient (no file reads)

```bash
# Confirm location and state
pwd && git log --oneline -3
node --version && python3 --version
echo "Package: $(node -e "console.log(require('./package.json').version)")"
echo "Build: $(ls dist/cli.js 2>/dev/null && echo EXISTS || echo MISSING)"
```

If build is MISSING: run Step B.2.
If build EXISTS: skip to Step B.3.

---

## Step B.2 — Build

```bash
npm ci
npm run build
node dist/cli.js --version
```

---

## Step B.3 — Publish Updated Package to npm

```bash
# Bump to v5.0.0 (major — new schema, breaking legacy tools removed)
npm version 5.0.0 --no-git-tag-version

# Login check (uses stored npm token)
npm whoami || npm login

# Dry run first
npm publish --dry-run

# If dry run clean:
npm publish --access public
echo "Published: $(node -e "console.log(require('./package.json').version)")"
```

If publish fails due to auth: check `~/.npmrc` for stored token.
Do NOT block on publish — continue with B.4 using local build.

---

## Step B.4 — Init claude-project on THIS repo (use yourself)

```bash
# Init from local build — this repo becomes a claude-project
node dist/cli.js init \
  --name "claude-project" \
  --description "MCP memory and dispatch server — self-hosted" \
  --no-telemetry

# Verify .claude-project created with v5 schema
node -e "
const p = require('./.claude-project');
console.assert(p.version === '5.0', 'wrong version: ' + p.version);
console.assert(p.memory_path, 'memory_path missing');
console.assert(!p.diary_path, 'diary_path still present');
console.assert(!p.obsidian_vault, 'obsidian_vault still present');
console.log('Schema v5 OK:', p.memory_path);
"
```

---

## Step B.5 — Start MCP Server (background)

```bash
# Start in background — you will use this for all dispatches during cleanup
python3 mcp/server.py &
MCP_PID=$!
echo "MCP server PID: $MCP_PID"

# Verify it started
sleep 2
curl -s http://127.0.0.1:8765/health 2>/dev/null \
  && echo "MCP server: RUNNING" \
  || echo "MCP server: stdio mode (OK for Claude Code)"
```

Note: Claude Code uses stdio mode automatically. HTTP mode is for verification only.

---

## Step B.6 — Audit Context Files WITHOUT Reading Them

```bash
echo "=== CONTEXT FILE SIZES ==="
for f in CLAUDE.md README.md CHANGELOG.md .claude-project; do
  [ -f "$f" ] && echo "$(wc -l < $f)L $(wc -c < $f)b  $f" || echo "MISSING: $f"
done

echo ""
echo "=== LEGACY REFS STILL IN CONTEXT FILES ==="
grep -c "obsidian\|diary_path\|claude-diary\|MacBook\|<user>\|<robot-platform>" \
  CLAUDE.md README.md CHANGELOG.md 2>/dev/null || echo "none found"

echo ""
echo "=== CLAUDE.MD STRUCTURE ONLY ==="
[ -f CLAUDE.md ] && grep -n "^#" CLAUDE.md | head -30 || echo "no CLAUDE.md"
```

---

## Step B.7 — Surgical Context File Cleanup (no full reads)

```bash
# Fix CLAUDE.md — remove legacy sections by header, not by reading content
if [ -f CLAUDE.md ]; then
  BEFORE=$(wc -l < CLAUDE.md)

  # Remove lines with legacy references
  sed -i '/claude-diary/d' CLAUDE.md
  sed -i '/CLAUDE_DIARY_PATH/d' CLAUDE.md
  sed -i '/diary_path/d' CLAUDE.md
  sed -i '/obsidian_vault/d' CLAUDE.md
  sed -i '/obsidian_folder/d' CLAUDE.md
  sed -i '/Obsidian sync/d' CLAUDE.md
  sed -i '/WAKEUP\.md/d' CLAUDE.md
  sed -i '/SESSION_JOURNAL/d' CLAUDE.md
  sed -i '/MacBook \//d' CLAUDE.md
  sed -i '/<user>/d' CLAUDE.md

  AFTER=$(wc -l < CLAUDE.md)
  echo "CLAUDE.md: $BEFORE → $AFTER lines (removed $((BEFORE - AFTER)))"
fi

# Fix README.md MCP config block only — no full read
sed -i 's/"claude-diary"/"claude-project"/g' README.md
sed -i 's/CLAUDE_DIARY_PATH/CLAUDE_PROJECT_DIR/g' README.md

echo "Context files cleaned ✓"
```

---

## Step B.8 — Regenerate Lean CLAUDE.md

Write a fresh, minimal CLAUDE.md — the one Claude Code reads as its persistent context.
This replaces whatever was there before. Keep it under 80 lines.

```bash
cat > CLAUDE.md << 'EOF'
# claude-project — Agent Context

## What This Is
MCP memory + dispatch server for Claude Code. Schema v5. No Obsidian dependency.

## Session Start
Always call: get_context() — never ask what was done before.

## Memory Operations
- Store decisions: store_memory(category="decision", text=...)
- Store discoveries: store_memory(category="discovery", text=...)
- Look up files: get_file_summary(path) before reading any file
- End session: set_context(stage=..., summary=...)

## Dispatch
- Create tasks: dispatch_task(title, body, agent)
- Check status: list_dispatches(status="pending")

## Key Paths
- Memory: see .claude-project → memory_path
- DB: research.db (SQLite + LanceDB)
- Dispatches: dispatches/ directory

## Instruction Files (Batch 3)
Read ONE at a time. Never load more than 2 files at once.
- Phase 10: 10_CLEANUP_FULL_REPO.md  ← current work
- Phase 11: 11_TELEMETRY.md
- Phase 12: 12_ABLATION_STUDY.md
- State:    claude-project-instructions/AGENT_STATE.md

## Token Budget Per Session
- CLAUDE.md (this): ~400 tokens
- AGENT_STATE.md: ~3k tokens
- Phase file: ~10k tokens
- Total overhead: ~14k tokens
- Available for work: ~186k tokens

## Current Version
v5.0.0 — legacy tools removed, schema updated, Obsidian opt-in only.
EOF

echo "CLAUDE.md regenerated: $(wc -l < CLAUDE.md) lines"
```

---

## Step B.9 — Verify MCP Tools (spot check)

```bash
python3 - << 'EOF'
import sqlite3, json
from pathlib import Path

# Load project config
p = json.load(open('.claude-project'))
mem = Path(p['memory_path']).expanduser()
print(f"Memory path: {mem}")
print(f"Memory exists: {mem.exists()}")

# Check DB
db = mem.parent / "research.db"
print(f"Research DB: {db.exists()}")

# Verify server.py has no legacy tools
text = open('mcp/server.py').read()
legacy = ['def get_context_legacy', 'def wakeup_read', 'def journal_append',
          'def update_dexter_profile', 'def list_sessions(', 'def get_today(']
for fn in legacy:
    if fn in text:
        print(f"LEGACY STILL PRESENT: {fn}")
    else:
        print(f"✓ removed: {fn}")

# Verify server name
if '"claude-project"' in text or "name='claude-project'" in text or 'name="claude-project"' in text:
    print("✓ MCP name: claude-project")
else:
    print("✗ MCP name still wrong — check server.py L304")
EOF
```

---

## Step B.10 — Log Session Start via MCP

```bash
python3 - << 'EOF'
import subprocess, json

# Use the MCP server to log that Batch 3 has started
# This is the first real dispatch through the new system
result = subprocess.run(
    ['python3', 'mcp/server.py'],
    input=json.dumps({
        "method": "tools/call",
        "params": {
            "name": "store_memory",
            "arguments": {
                "category": "milestone",
                "text": "Batch 3 bootstrap complete. v5.0.0 built and initialized. Starting Phase 10 cleanup.",
                "tags": ["batch3", "bootstrap", "phase10"]
            }
        }
    }),
    capture_output=True, text=True, timeout=10
)
print("MCP store_memory:", result.returncode)
EOF
```

If MCP call fails — skip and continue. Step B.10 is not blocking.

---

## Step B.11 — Read State and Start Phase 10

**Now and only now** read two files:

```bash
# 1. Read checkpoint state
cat claude-project-instructions/AGENT_STATE.md

# 2. Read current phase file
cat claude-project-instructions/10_CLEANUP_FULL_REPO.md
```

Resume from `cleanup_file_index` in AGENT_STATE.md.
If `cleanup_file_index = 0` → start with `src/lib/paths.ts`.

**Do not read any other instruction file until Phase 10 certification passes.**

---

## Bootstrap Complete Checklist

Before starting Phase 10, confirm all of these:

```bash
echo "=== PRE-FLIGHT ==="
node dist/cli.js --version | grep "5\." && echo "✓ v5 built" || echo "✗ build"
[ -f .claude-project ] && echo "✓ .claude-project exists" || echo "✗ init"
node -e "const p=require('./.claude-project'); process.exit(p.version==='5.0'?0:1)" \
  && echo "✓ schema v5" || echo "✗ schema"
grep -q '"claude-project"' mcp/server.py && echo "✓ MCP name" || echo "✗ MCP name"
grep -q "def get_context_legacy" mcp/server.py && echo "✗ LEGACY PRESENT" || echo "✓ legacy gone"
[ $(wc -l < CLAUDE.md) -lt 100 ] && echo "✓ CLAUDE.md lean" || echo "✗ CLAUDE.md bloated"
echo "=== START PHASE 10 ==="
```

All 6 checks must pass before proceeding.
```

***

## Starting Prompt (paste into Claude Code)

```
Read claude-project-instructions/00_BOOTSTRAP.md only.
Execute every step sequentially.
Do not read any other file until Step B.11.
After B.11 completes, proceed with Phase 10 from the file index in AGENT_STATE.md.

You are using claude-project on itself — every dispatch you create
during this work is a real DispatchObservation in research.db.
The system you are building is the system you are running on.
Maintain AGENT_STATE.md after each completed step.
```

***

Two files to add to your Google Drive alongside the others:

| File | Purpose | Size |
|------|---------|------|
| `00_BOOTSTRAP.md` | First-read pre-flight sequence | ~1.5k tokens |
| Starting prompt | Paste into Claude Code to kick off | 4 lines |

The bootstrap is ordered deliberately — build before init, init before MCP, MCP before any dispatches, context cleanup before any instruction file reading. The agent is on its own minimal CLAUDE.md by Step B.8, so every token from B.9 onward is clean.