# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 4.x     | ✅ Active support |
| 3.x     | ❌ No longer supported |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report security issues by opening a [GitHub Security Advisory](https://github.com/infraax/claude-project/security/advisories/new) — this keeps the details private until a fix is released.

Include as much of the following as possible:

- Type of issue (e.g. path traversal, command injection, credential leak)
- Full paths of source files related to the issue
- Step-by-step reproduction instructions
- Proof-of-concept or exploit code (if possible)
- Impact assessment

We will acknowledge your report within **48 hours** and aim to release a fix within **7 days** for critical issues.

## Security Considerations

### File system access
`dispatch run` agents with `write_file` and `bash` tools can modify files within the project directory. All file operations are sandboxed to the project root via a path traversal guard — paths resolving outside `projectDir` return an error and are never executed.

### API keys
`ANTHROPIC_API_KEY` is read from the environment and never written to disk by this tool. Do not commit `.env` files containing API keys.

### Daemon
The launchd daemon runs as the current user (not root) and inherits the standard `PATH`. It does not open any network ports.

### MCP server
The MCP server exposes project memory, events, and dispatch files to Claude Code. It binds to stdio by default. When run in HTTP mode (`--http`), it binds to `localhost` only — never expose it to external networks.
