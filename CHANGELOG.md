# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [5.1.0] — 2026-03-26

### Added
- **Anonymous federated telemetry** (`src/lib/telemetry.ts`)
  - Opt-in only — never sends without `telemetry.enabled: true` in `.claude-project`
  - Sends ONLY: token counts, latency_ms, task_type, compression_ratio, outcome, iterations
  - NEVER sends: code, prompts, file names, results, or any string > 30 chars
  - Installation ID: `sha256(hostname:user)[:16]` — irreversible hash, stable across sessions
  - Project ID: `sha256(project-path)[:12]` — not reversible
  - 3s timeout, silent fail — never blocks dispatch
- **Telemetry wired into dispatch-runner** — fires `setImmediate` after every `writeObservation`
- **Opt-in prompt in `init` command** — interactive TTY prompt with privacy details; skipped in non-TTY
- **`telemetry_preview` MCP tool** — shows exact payload that would be sent; zero surprises
- **Cloudflare Worker** (`workers/telemetry-ingest.ts`)
  - POST `/ingest` — validates schema, rejects strings > 30 chars, writes to D1
  - GET `/thresholds` — public JSON; per-task-type breakeven / cache hit rates (last 30 days, n≥10)
  - GET `/stats` — aggregate health check
- **D1 schema** (`workers/schema.sql`) and **wrangler config** (`workers/wrangler.toml`)
- **Daemon threshold pull** — `daemon run` fetches community thresholds once/day into `.claude-project._community_thresholds`

### Changed (schema v5 — **breaking from v4**)
- `.claude-project` uses `memory_path` (canonical) instead of `diary_path` (now deprecated read-only)
- Removed: `obsidian_vault`, `obsidian_folder`, `devices`, `shared_paths`
- Added: `optimizations`, `telemetry` fields
- `$schema` URL updated to `https://cdn.jsdelivr.net/npm/claude-project/schema/...`
- MCP server renamed `claude-diary` → `claude-project` — **update your `~/.mcp.json` key**
- Removed 10 legacy MCP tools: `get_context_legacy`, `wakeup_read`, `wakeup_update_section`, `journal_append`, `list_sessions`, `get_today`, `memory_append_thought`, `read_memory_file`, `update_dexter_profile`, `get_source_info`
- `init_project` MCP tool now writes v5 schema with `memory_path`
- Publisher: `claudelab` → `infraax`
- VS Code `claudeProject.sync` command: "Sync Status" (was "Sync Memory → Obsidian")
- Removed `claudeProject.obsidianVault` VS Code setting

### Fixed
- All legacy machine-specific paths (``, ``, ``) removed
- `CLAUDE_DIARY_PATH` env var → `CLAUDE_PROJECT_DIR`
- Certification script `scripts/certify_clean.sh` created; passes on all 12 files

---

## [4.2.0] — 2026-03-26

### Added
- **Research instrumentation** (`src/lib/research-db.ts`)
  - SQLite database (WAL mode) recording every API dispatch as a `DispatchObservation`
  - Captures: input/output/cache_write/cache_read tokens, latency_ms, task_type, dispatch_format, protocol condition, encoding compression ratio
  - Tables: `dispatch_observations`, `pd_registry`, `pd_usage_log`, `file_summaries`, `interaction_counts`, `pd_research_results`
  - DB stored per-project at `~/.claude/projects/{id}/research.db`
- **Task classifier** (`src/lib/task-classifier.ts`)
  - 8 task types via regex patterns: `code_gen`, `refactor`, `test_gen`, `pipeline`, `analysis`, `retrieval`, `planning`, `documentation`
  - Pattern order fix: `pipeline` (etl/transform) matched before `code_gen` (build) to prevent false positives
  - `classifyTaskType(title, body): TaskType`
  - `inferInteractionPair(agentName?, callerContext?): string`
- **Format encoder** (`src/lib/format-encoder.ts`)
  - `selectFormat(taskType, protocolCondition): DispatchFormat`
  - `encodeDispatchBody(body, taskType, format): EncodedDispatch`
  - Formats: `typed_pseudocode` (code/refactor/test), `dsl` (pipeline tasks), `toon` (analysis/retrieval), `codeact` (XML actions), `natural_language` (passthrough)
- **Research-aware dispatch runner** (`src/lib/dispatch-runner.ts` extended)
  - Classifies task type before every API call; selects and encodes dispatch format
  - Writes full `DispatchObservation` to SQLite on success and failure
  - Increments `interaction_counts` table; warns at ≥3 interactions for same pair
  - Extended `DispatchFile`: `protocol_id`, `protocol_condition`, `session_id`, `task_type`, `dispatch_format`, `encoded_chars`, `original_chars`, `compression_ratio`, cache token fields
- **Protocol Documents (PD) registry** (`mcp/pd_registry.py`)
  - Content-addressed deduplication via `SHA-256(full_text)[:16]`
  - `register_pd_entry` — idempotent insert; returns `{id, is_new, use_count}`
  - `search_pd_entries` — filter by task_type + interaction_pair; ordered by use_count DESC
  - `log_pd_use`, `deprecate_pd`, `increment_interaction_count`
- **MCP server — 13 new tools** (`mcp/server.py`)
  - Memory tools: `store_memory`, `query_memory`, `get_context` (typed), `set_context`, `set_file_summary`, `get_file_summary`, `find_related_files`
  - PD tools: `register_pd`, `get_pd`, `search_pd`, `log_pd_usage`, `check_negotiation_threshold`
  - Dispatch tool: `dispatch_task` — full pipeline (clarity → classify → compress → create dispatch file)
  - LanceDB semantic memory (384-dim, all-MiniLM-L6-v2 embeddings)
- **Clarity Layer** (`mcp/clarity_layer.py`)
  - Ollama/Qwen2.5-7B local pre-processor — fixes typos, expands abbreviations, resolves pronouns
  - Passthrough when Ollama unavailable or input < 50 chars — never blocks
  - Returns `{output, passthrough, latency_ms, input_chars, output_chars}`
- **Prompt cache tracker** (`mcp/prompt_cache.py`)
  - `build_stable_prefix()` — deterministic system blocks tagged `cache_control: ephemeral`
  - `record_cache_event()` / `get_cache_hit_rate()` — tracks hit/miss and tokens saved in SQLite
- **Python task classifier** (`mcp/task_classifier_py.py`)
  - Python port of `task-classifier.ts` with same pattern ordering
  - Used in `server.py` and the clarity pipeline
- **Python research requirements** (`requirements-research.txt`)
  - `lancedb`, `sentence-transformers`, `llmlingua`, `kuzu`, `mcp`, `fastmcp`
- **Agent `backend` field** (`src/lib/project.ts`)
  - `AgentDefinition.backend`: `'claude' | 'ollama' | 'openai' | 'local'`
  - `AgentDefinition.system_prompt`, `AgentDefinition.trigger` fields added

### Changed
- Dispatch runner now measures end-to-end latency and records observations regardless of success/failure
- `get_context` MCP tool returns typed structured dict (replaces prose WAKEUP.md output); legacy tool retained as `get_context_legacy`

---

## [4.1.0] — 2026-03-26

### Added
- **Automation execution engine** (`src/lib/automation.ts`)
  - Trigger types: `event`, `schedule` (cron with aliases), `manual`, `file_change`, `service_up`, `service_down`
  - Action types: `run_command`, `dispatch_agent`, `write_event`, `send_notification`, `sync_obsidian`, `call_webhook`
  - Idempotent state tracking in `runtimeDir/automation-state.json` — `last_fired` + `last_event_id` prevent double-firing
  - Daemon fires `processScheduledAutomations()` on every 5-minute scan cycle
  - Session hooks fire `processEventAutomations()` on `session_start` and `session_end`
- **Agent dispatch runner** (`src/lib/dispatch-runner.ts`)
  - Real Claude API calls via `@anthropic-ai/sdk`
  - Simple mode (no tools) and tool loop mode (MAX_ITERATIONS = 10)
  - Built-in sandboxed tools: `read_file`, `list_files`, `write_file`, `bash`, `log_event`
  - Path traversal guard — all file operations clamped to `projectDir`
  - Full lifecycle: `pending` → `running` → `completed` | `failed`
- **CLI commands**: `dispatch list/show/create/run`, `automation list/run`
- **`--dry-run` flag** on `dispatch run` — previews without calling API
- **Test suite** (Vitest, 25 tests)
  - `automation.test.ts` — cron, trigger idempotency, state round-trip, disabled automations, unknown action safety
  - `dispatch-runner.test.ts` — path traversal guard, dispatch lifecycle, tool loop, MAX_ITERATIONS guard, status/agent filtering
- **GitHub repository setup**
  - `.devcontainer/devcontainer.json` — Codespaces with Node 20 + Python 3.11
  - Issue templates (bug report, feature request, config)
  - PR template with checklist
  - `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `FUNDING.yml`, `CODEOWNERS`
  - `dependabot.yml` — weekly npm + Actions updates
  - GitHub Pages docs site (`docs/index.html`) with feature grid and code examples
  - `CHANGELOG.md` (this file)
- **CI improvements**
  - `npm test` step added to every push and PR build
  - `pull_request` trigger added to CI workflow
  - `production` environment gate on release job
  - GitHub Packages publishing (alongside npm)
  - npm provenance attestation (`--provenance` flag)

### Changed
- `release.yml` — renamed release job from "Triple Release" to "Release", added 4th publisher (GitHub Packages), added `environment: production`
- README rewritten with badge row, Codespaces badge, full CLI reference, schema reference, integrations table

---

## [4.0.0] — 2026-03-23

### Added
- `.claude-project` v4 schema — `agents`, `services`, `automations`, `tools`, `monitoring` fields
- Global project registry (`~/.claude/registry.json`) with `registerProject`, `touchProject`, `getRegistry`
- Append-only JSONL event log (`events.jsonl`) with `appendEvent`, `readEvents`
- Dispatch queue — JSON files in `runtimeDir/dispatches/`
- `CLAUDE.md` auto-generation from live project brain (`generate-claude-md` command)
- Background daemon via macOS launchd (`daemon install/uninstall/status/run`)
- Session hooks — `SessionStart` and `Stop` events via Claude Code `settings.json`
- `hooks install/uninstall/status` commands
- VS Code extension with status bar, `.claudep` file type, JSON Schema validation
- MCP server expanded with registry, events, dispatch, and full project info tools
- `log-event` CLI command for shell script / hook integration

### Changed
- Version schema bumped from `"3"` to `"4"`

---

## [3.0.0] — 2026-03-01

### Added
- Initial release
- `.claude-project` v3 schema — name, description, diary path, Obsidian vault
- Persistent memory files in project diary folder
- Obsidian vault sync (`sync` command)
- MCP server (stdio) with memory and journal tools
- `inject` / `eject` commands for `~/.mcp.json` management
- VS Code extension (basic) — language support for `.claude-project`

[4.2.0]: https://github.com/infraax/claude-project/compare/v4.1.0...v4.2.0
[4.1.0]: https://github.com/infraax/claude-project/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/infraax/claude-project/compare/v3.0.0...v4.0.0
[3.0.0]: https://github.com/infraax/claude-project/releases/tag/v3.0.0
