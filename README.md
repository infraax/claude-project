# claude-project

Project context system for Claude Code — gives Claude persistent memory, Obsidian sync, and source-attributed journal entries for any project.

## Install

```bash
npm install -g claude-project
```

Or install the VS Code extension: search `claudelab.claude-project` in the Extensions panel.

## Usage

```bash
claude-project init "MyProject" -d "What it does" -s "Stage 1"
claude-project status
claude-project sync        # diary → Obsidian vault
claude-project inject      # add MCP to ~/.mcp.json
claude-project mcp         # start the diary MCP server
```

## How it works

Drop a `.claude-project` file in any directory. Claude Code detects it (like `.git`) and routes all memory — journal entries, discoveries, decisions, milestones — to that project's diary folder. Every entry is timestamped, UUID-tagged, and source-attributed (which machine/user wrote it).

## MCP Server

Add to `~/.mcp.json`:

```json
{
  "mcpServers": {
    "claude-diary": {
      "command": "npx",
      "args": ["-y", "claude-project", "mcp"]
    }
  }
}
```

Or run `claude-project inject` to do it automatically.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAUDE_OBSIDIAN_VAULT` | `~/.claude/obsidian` | Obsidian vault path |
| `CLAUDE_DIARY_PATH` | `~/.claude/memory` | Default diary directory |
| `CLAUDE_DIARY_BASE` | `~/.claude/projects` | Base dir for per-project diaries |
| `CLAUDE_PROJECTS_ROOT` | *(none)* | Extra root for `claude-project list` |
| `CLAUDE_MCP_JSON` | `~/.mcp.json` | Override `.mcp.json` path |

## License

MIT
