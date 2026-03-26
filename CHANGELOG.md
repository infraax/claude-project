# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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

[4.1.0]: https://github.com/infraax/claude-project/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/infraax/claude-project/compare/v3.0.0...v4.0.0
[3.0.0]: https://github.com/infraax/claude-project/releases/tag/v3.0.0
