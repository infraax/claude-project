# claude-project

**v4.1** — Project brain for Claude Code. Drop a `.claude-project` file in any directory to give Claude persistent memory, a registry, event log, agent orchestration, dispatch queue, session hooks, automation engine, and auto-generated `CLAUDE.md`.

## Install

```bash
npm install -g claude-project
```

Or install the VS Code extension: search `claudelab.claude-project` in the Extensions panel.

---

## Quick Start

```bash
# Initialise a project in the current directory
claude-project init "MyProject" -d "What it does" -s "Planning"

# Show full project context
claude-project status

# Sync memory → Obsidian vault
claude-project sync

# Add the MCP server to ~/.mcp.json
claude-project inject

# Start the MCP server (stdio)
claude-project mcp
```

---

## CLI Reference

### Core

| Command | Description |
|---------|-------------|
| `init <name>` | Create a `.claude-project` in the current directory |
| `status` | Show registry, events, dispatches, agents, services |
| `list [--scan]` | List all known projects |
| `sync` | Copy memory `.md` files → Obsidian vault |
| `generate-claude-md` | Regenerate `CLAUDE.md` from the project brain |
| `log-event <type> [summary]` | Append an event to the project event log |

### Automation Engine

Automations are defined in `.claude-project` under `automations[]`. They fire automatically via the daemon or hooks, or manually via the CLI.

```jsonc
// .claude-project (excerpt)
"automations": [
  {
    "id": "sync-on-session-end",
    "trigger": { "type": "event", "event_type": "session_end" },
    "action": { "type": "sync_obsidian" }
  },
  {
    "id": "daily-summary",
    "trigger": { "type": "schedule", "cron": "0 9 * * *" },
    "action": { "type": "dispatch_agent", "agent": "summariser", "prompt": "Summarise yesterday's events." }
  }
]
```

**Trigger types:** `event`, `schedule` (cron), `manual`, `file_change`, `service_up`, `service_down`

**Action types:** `run_command`, `dispatch_agent`, `write_event`, `send_notification`, `sync_obsidian`, `call_webhook`

| Command | Description |
|---------|-------------|
| `automation list` | List all automations with last-fired time and fire count |
| `automation run <id>` | Manually fire an automation by ID |

### Agent Dispatch

Dispatches are tasks queued for a Claude agent. They run serially and support a full tool loop (read/write files, run shell commands, log events).

```bash
# Create a dispatch
claude-project dispatch create "Review PR #42" --agent reviewer --body "Check for security issues."

# List pending dispatches
claude-project dispatch list --status pending

# Run all pending (requires ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY=sk-ant-...
claude-project dispatch run --all

# Run one by ID
claude-project dispatch run dispatch-abc12345

# Show result
claude-project dispatch show dispatch-abc12345
```

Agents are defined in `.claude-project` under `agents{}`:

```jsonc
"agents": {
  "reviewer": {
    "role": "Code reviewer",
    "model": "claude-sonnet-4-6",
    "instructions": "You are a thorough code reviewer. Focus on correctness and security.",
    "tools": ["read_file", "list_files", "bash", "log_event"],
    "max_tokens": 4096
  }
}
```

**Built-in agent tools:** `read_file`, `list_files`, `write_file`, `bash`, `log_event`

All file tool calls are sandboxed to the project directory (path traversal is blocked).

### Daemon

The daemon runs every 5 minutes via macOS launchd. It refreshes the project registry, regenerates `CLAUDE.md`, and fires scheduled automations.

```bash
claude-project daemon install    # install + start launchd service
claude-project daemon uninstall  # stop + remove
claude-project daemon status     # show whether it's running
claude-project daemon run        # run one scan cycle manually
```

### Session Hooks

Hooks wire Claude Code session lifecycle events into the project brain — logging `session_start`/`session_end` events, syncing Obsidian, regenerating `CLAUDE.md`, and firing event-triggered automations.

```bash
claude-project hooks install     # add hooks to settings.json
claude-project hooks install --global  # add to ~/.claude/settings.json
claude-project hooks uninstall
claude-project hooks status
```

### MCP Server

```bash
claude-project mcp               # start stdio MCP server
claude-project mcp --http        # start HTTP/SSE MCP server
claude-project inject            # add claude-diary entry to ~/.mcp.json
claude-project eject             # remove it
claude-project mcp-status        # check if configured
```

Add to `~/.mcp.json`:

```json
{
  "mcpServers": {
    "claude-diary": {
      "command": "claude-project",
      "args": ["mcp"]
    }
  }
}
```

---

## `.claude-project` Schema

```jsonc
{
  "version": "4",
  "project_id": "unique-id",
  "name": "My Project",
  "description": "What this project does",
  "stage": "Planning",
  "diary_path": "~/.claude/projects/my-project/memory",
  "obsidian_vault": "~/Documents/Obsidian",
  "obsidian_folder": "Projects/MyProject",

  // v4: Agents for dispatch tasks
  "agents": {
    "reviewer": {
      "role": "Code reviewer",
      "model": "claude-sonnet-4-6",
      "instructions": "...",
      "tools": ["read_file", "list_files", "bash"]
    }
  },

  // v4: Automations (triggers + actions)
  "automations": [
    {
      "id": "sync-on-end",
      "trigger": { "type": "event", "event_type": "session_end" },
      "action": { "type": "sync_obsidian" }
    }
  ],

  // v4: Services with health checks
  "services": {
    "api": {
      "type": "http",
      "url": "http://localhost:3000",
      "healthcheck": "http://localhost:3000/health"
    }
  },

  // v4: Monitoring config
  "monitoring": {
    "enabled": true,
    "notify": {
      "macos_notifications": true,
      "webhook_url": "https://hooks.slack.com/..."
    }
  }
}
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | *(required for dispatch run)* | Claude API key |
| `CLAUDE_OBSIDIAN_VAULT` | `~/.claude/obsidian` | Obsidian vault path |
| `CLAUDE_DIARY_PATH` | `~/.claude/memory` | Default diary directory |
| `CLAUDE_DIARY_BASE` | `~/.claude/projects` | Base dir for per-project diaries |
| `CLAUDE_PROJECTS_ROOT` | *(none)* | Extra root for `claude-project list` |
| `CLAUDE_MCP_JSON` | `~/.mcp.json` | Override `.mcp.json` path |

---

## Changelog

### v4.1.0
- **Automation engine** — event, schedule, manual, file_change, service_up/down triggers; run_command, dispatch_agent, write_event, send_notification, sync_obsidian, call_webhook actions; idempotent state tracking
- **Real agent dispatch** — `dispatch run` calls the Claude API with a multi-turn tool loop (read_file, list_files, write_file, bash, log_event); path traversal guard; dispatch lifecycle pending→running→completed|failed
- **CLI**: `dispatch list/show/create/run`, `automation list/run`
- Daemon fires scheduled automations every 5 minutes
- Session hooks fire event-triggered automations on session_start/end

### v4.0.0
- `.claude-project` v4 schema with agents, services, automations, tools, monitoring
- Project registry (`~/.claude/registry.json`) with daemon support
- Append-only JSONL event log
- Dispatch queue (JSON files in runtimeDir/dispatches/)
- `CLAUDE.md` auto-generation from project brain
- Session hooks (SessionStart, Stop)
- VS Code extension, `.claudep` file type
- MCP server with full diary/events/dispatch/registry tools

### v3.0.0
- Initial release with persistent memory, Obsidian sync, MCP server

---

## License

MIT
