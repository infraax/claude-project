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
