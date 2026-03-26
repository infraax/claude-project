# claude-project — Claude Project Config

This directory is the project-scoped configuration for Claude.
It lives alongside `.claude-project` and can be committed to version control.

| Directory | Purpose |
|-----------|----------|
| `agents/` | Sub-agent definitions (YAML or JSON) |
| `services/` | Service descriptors |
| `automations/` | Trigger → action rules |
| `tools/` | Project-local scripts and tool definitions |

Runtime state (events, sessions, dispatches) is stored in:
`~/.claude/projects/project-0bf67307`
