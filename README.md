<div align="center">

# 🧠 claude-project

**Project brain for Claude Code**

Drop a `.claude-project` file in any directory to give Claude persistent memory, an event log, agent dispatch, automations, session hooks, and auto-generated `CLAUDE.md`.

[![npm version](https://img.shields.io/npm/v/claude-project?style=flat-square&color=f78166)](https://www.npmjs.com/package/claude-project)
[![npm downloads](https://img.shields.io/npm/dm/claude-project?style=flat-square&color=79c0ff)](https://www.npmjs.com/package/claude-project)
[![CI](https://img.shields.io/github/actions/workflow/status/infraax/claude-project/release.yml?style=flat-square&label=CI)](https://github.com/infraax/claude-project/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-56d364?style=flat-square)](LICENSE.txt)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-brightgreen?style=flat-square)](https://nodejs.org)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-orange?style=flat-square)](https://claude.ai/code)
[![VS Code](https://img.shields.io/visual-studio-marketplace/v/claudelab.claude-project?style=flat-square&label=VS%20Code&color=007acc)](https://marketplace.visualstudio.com/items?itemName=claudelab.claude-project)

[**Docs**](https://infraax.github.io/claude-project/) · [npm](https://www.npmjs.com/package/claude-project) · [GitHub Packages](https://github.com/infraax/claude-project/pkgs/npm/claude-project) · [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=claudelab.claude-project) · [Discussions](https://github.com/infraax/claude-project/discussions)

</div>

---

## What it does

| Capability | What you get |
|---|---|
| **Persistent memory** | Structured `.md` files Claude reads at session start |
| **Event log** | Append-only JSONL log of every session, dispatch, and automation |
| **Automation engine** | Trigger actions on events, cron, file changes, or service health |
| **Agent dispatch** | Queue tasks for Claude agents — full tool loop, sandboxed to your project |
| **Auto CLAUDE.md** | Generated and refreshed automatically from your live project brain |
| **Session hooks** | Fire on SessionStart/Stop — sync Obsidian, log events, run automations |
| **MCP server** | Memory, journal, events, dispatch, and registry tools for Claude Code |
| **Project registry** | Global `~/.claude/registry.json` — instant lookup, no filesystem scans |
| **Background daemon** | macOS launchd — refreshes registry + fires scheduled automations every 5 min |
| **VS Code extension** | Status bar, syntax highlighting, schema validation, command palette |

---

## Install

```bash
# npm (recommended)
npm install -g claude-project

# GitHub Packages
npm install -g claude-project --registry https://npm.pkg.github.com

# VS Code extension — search "claudelab.claude-project"
```

**Open in Codespaces** — zero setup dev environment:

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/infraax/claude-project)

---

## Quick Start

```bash
# 1. Initialise a project
claude-project init "My Project" -d "What it does" -s "Planning"

# 2. Add MCP server to Claude Code (~/.mcp.json)
claude-project inject

# 3. Install session hooks
claude-project hooks install --global

# 4. Start the background daemon (macOS)
claude-project daemon install

# 5. Check status
claude-project status
```

---

## CLI Reference

### Core

```bash
claude-project init <name>                 # create .claude-project
claude-project status                      # show full project brain
claude-project list [--scan]              # list all known projects
claude-project sync                        # memory → Obsidian vault
claude-project generate-claude-md         # regenerate CLAUDE.md
claude-project log-event <type> [summary] # append event to log
```

### Automation Engine

```bash
claude-project automation list            # list automations + last-fired time
claude-project automation run <id>        # manually trigger an automation
```

**Trigger types:** `event` · `schedule` (cron) · `manual` · `file_change` · `service_up` · `service_down`

**Action types:** `run_command` · `dispatch_agent` · `write_event` · `send_notification` · `sync_obsidian` · `call_webhook`

```jsonc
// .claude-project
"automations": [
  {
    "id": "sync-on-session-end",
    "trigger": { "type": "event", "event_type": "session_end" },
    "action":  { "type": "sync_obsidian" }
  },
  {
    "id": "daily-standup",
    "trigger": { "type": "schedule", "cron": "0 9 * * 1-5" },
    "action":  { "type": "dispatch_agent", "agent": "summariser",
                 "prompt": "Summarise yesterday's events and flag blockers." }
  },
  {
    "id": "alert-on-api-down",
    "trigger": { "type": "service_down", "service": "api" },
    "action":  { "type": "send_notification", "message": "API is down!" }
  }
]
```

### Agent Dispatch

```bash
# Create
claude-project dispatch create "Review PR #42" --agent reviewer \
  --body "Check for security issues."

# List
claude-project dispatch list
claude-project dispatch list --status pending --agent reviewer

# Run (requires ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY=sk-ant-...
claude-project dispatch run --all           # all pending
claude-project dispatch run dispatch-abc12  # specific
claude-project dispatch run --dry-run       # preview

# Inspect
claude-project dispatch show dispatch-abc12
```

**Built-in agent tools:** `read_file` · `list_files` · `write_file` · `bash` · `log_event`

All file ops are sandboxed to the project directory.

```jsonc
"agents": {
  "reviewer": {
    "role": "Code reviewer",
    "model": "claude-sonnet-4-6",
    "instructions": "You are a thorough code reviewer.",
    "tools": ["read_file", "list_files", "bash", "log_event"],
    "max_tokens": 4096
  }
}
```

### Session Hooks

```bash
claude-project hooks install           # local settings
claude-project hooks install --global  # global (~/.claude/settings.json)
claude-project hooks uninstall
claude-project hooks status
```

### Daemon

```bash
claude-project daemon install    # install + start launchd (macOS)
claude-project daemon uninstall
claude-project daemon status
claude-project daemon run        # one manual scan cycle
```

### MCP Server

```bash
claude-project mcp               # stdio (for Claude Code)
claude-project mcp --http        # HTTP/SSE on port 8765
claude-project inject            # add to ~/.mcp.json
claude-project eject
claude-project mcp-status
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
  "project_id": "auto-generated",
  "name": "My Project",
  "description": "What this project does",
  "stage": "Planning",
  "diary_path": "~/.claude/projects/my-project/memory",
  "obsidian_vault": "~/Documents/Obsidian",
  "obsidian_folder": "Projects/MyProject",

  "agents": {
    "reviewer": {
      "role": "Code reviewer",
      "model": "claude-sonnet-4-6",
      "instructions": "...",
      "tools": ["read_file", "list_files", "bash"],
      "max_tokens": 4096
    }
  },

  "automations": [
    {
      "id": "my-automation",
      "enabled": true,
      "trigger": { "type": "event", "event_type": "session_end" },
      "action":  { "type": "sync_obsidian" }
    }
  ],

  "services": {
    "api": {
      "type": "http",
      "url": "http://localhost:3000",
      "healthcheck": "http://localhost:3000/health"
    }
  },

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
|---|---|---|
| `ANTHROPIC_API_KEY` | *(required for dispatch)* | Claude API key |
| `CLAUDE_OBSIDIAN_VAULT` | `~/.claude/obsidian` | Obsidian vault path |
| `CLAUDE_DIARY_PATH` | `~/.claude/memory` | Default diary directory |
| `CLAUDE_DIARY_BASE` | `~/.claude/projects` | Base dir for per-project diaries |
| `CLAUDE_PROJECTS_ROOT` | *(none)* | Extra root for daemon + list |
| `CLAUDE_MCP_JSON` | `~/.mcp.json` | Override MCP config path |

---

## Integrations & Registries

| Registry / Platform | Install |
|---|---|
| **npm** | `npm install -g claude-project` |
| **GitHub Packages** | `npm install -g claude-project --registry https://npm.pkg.github.com` |
| **VS Code Marketplace** | Search `claudelab.claude-project` |
| **Claude Code MCP** | `claude-project inject` |
| **Obsidian** | Auto-synced via `sync_obsidian` action |
| **macOS launchd** | `claude-project daemon install` |

---

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md). All contributions welcome.

```bash
git clone https://github.com/infraax/claude-project.git
cd claude-project && npm install && npm run build && npm link
npm test       # 25 Vitest tests
npm run lint   # TypeScript type-check
```

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/infraax/claude-project)

---

## Changelog

### v4.1.0
- **Automation engine** — event, schedule, manual, file_change, service_up/down triggers; 6 action types; idempotent state per automation
- **Agent dispatch** — Claude API tool loop (MAX 10 iterations), path traversal guard, full dispatch lifecycle
- **CLI**: `dispatch list/show/create/run`, `automation list/run`
- **Tests**: 25 Vitest tests — idempotency, path traversal, lifecycle, tool loop
- **CI**: tests on every push/PR; GitHub Packages publishing; `production` environment gate
- **Docs**: GitHub Pages site, devcontainer, issue templates, CONTRIBUTING, SECURITY, dependabot

### v4.0.0
- v4 schema: agents, services, automations, monitoring
- Project registry + background daemon
- JSONL event log, dispatch queue, CLAUDE.md auto-generation
- Session hooks, VS Code extension, MCP server

### v3.0.0
- Initial release — persistent memory, Obsidian sync, MCP server

---

## License

[MIT](LICENSE.txt) © [infraax](https://github.com/infraax/claude-project)
