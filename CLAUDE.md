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
- Phase 10: 10_Cleanup.md  ← current work
- Phase 11: 11_TELEMETRY.md
- Phase 12: 12_ABLATION_STUDY.md
- State:    claude-project-instructions/AGENT_STATE.md

## Token Budget Per Session
- CLAUDE.md (this): ~400 tokens
- AGENT_STATE.md: ~3k tokens
- Phase file: ~10k tokens
- Total overhead: ~14k tokens
- Available for work: ~186k tokens

## CLI / Terminal Setup
Start with: `cc` (shell function in ~/.zshrc) — launches Claude Code with MCP auto-connected.
MCP registered globally in ~/.claude.json + locally in .mcp.json.
Pipeline env var: CLAUDE_PROJECT_DIR=${CLAUDE_PROJECT_DIR}

## Current Version
v5.1.0 — legacy tools removed, schema updated, MCP globally registered, CLI ready.

## USE THE PIPELINE FOR ALL CODING TASKS

When implementing any non-trivial code change (>20 lines or >1 file):

1. PLAN first — write the plan as a dispatch:
   Use dispatch_task(title="plan: [task]", body="[full spec]", agent="main")
   
2. IMPLEMENT via dispatch — do not write code directly for complex tasks:
   Use dispatch_task(title="impl: [task]", body="[plan output + requirements]", agent="main")

3. VERIFY via dispatch:
   Use dispatch_task(title="verify: [task]", body="[what to check]", agent="main")

For simple fixes (<20 lines, 1 file): write directly is fine.

ALWAYS store significant decisions:
  store_memory(category="decision", text="[what and why]")

ALWAYS store new patterns you notice:
  store_memory(category="pattern", text="[repeated pattern description]")

This is how the system learns and improves itself.

---

## COMMIT MESSAGE RULES — ABSOLUTE

### Never include in any commit message
1. **Claude session URLs** (`https://claude.ai/code/session_*`)
   → Auto-stripped by `prepare-commit-msg` hook. Never add manually.

2. **OPSEC narration** — never document what went wrong:
   - ❌ `"Previous key was accidentally embedded in commit 570e326"`
   - ❌ `"Old key fingerprint: AEdJVENS..."`
   - ✅ `"security: rotate credentials"`
   - ✅ `"security: key rotation — vault entry v-XXXX"`

3. **Base64 blobs** or key material of any kind

4. **Specific SHAs in security context** (`"fixes exposure in 570e326"`)

### For sensitive operational commits — use encrypted commits
```bash
bash scripts/commit-secure.sh "real detailed message here"
# Git log shows: VAULT:v-a3f7b2c1 [security]
# Decrypt with:  bash scripts/read-commit.sh HEAD
```

### Session URLs are auto-stripped
The `prepare-commit-msg` hook removes them before the commit lands.
NEVER add them back manually. They reveal agent session identity.
