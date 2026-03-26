# Contributing to claude-project

Thank you for taking the time to contribute! This document covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Release Process](#release-process)

---

## Code of Conduct

By participating in this project you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/claude-project.git
   cd claude-project
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/infraax/claude-project.git
   ```

---

## Development Setup

**Requirements:** Node.js ≥ 18, npm ≥ 9, Python 3.9+ (for MCP server)

```bash
npm install          # install dependencies
npm run build        # compile TypeScript → dist/
npm link             # make claude-project available globally
npm test             # run the Vitest test suite
npm run lint         # TypeScript type-check (no emit)
npm run test:watch   # watch mode for TDD
```

### Codespaces / devcontainer

Open this repo in a GitHub Codespace and everything is set up automatically — Node 20, Python 3.11, `claude-project` linked globally.

Set `ANTHROPIC_API_KEY` in your Codespace secrets for dispatch agent features.

---

## Project Structure

```
src/
  cli.ts                    Entry point — commander wiring
  commands/                 CLI command handlers (one file per command group)
    daemon.ts               Background daemon (launchd)
    dispatch.ts             Agent dispatch CLI
    automation.ts           Automation list/run CLI
    hook-run.ts             Claude Code session hook handler
    hooks.ts                Hook install/uninstall
    generate-claude-md.ts   CLAUDE.md generator
    init.ts                 Project initialisation
    ...
  lib/                      Pure library modules (no CLI I/O)
    automation.ts           Automation engine (triggers + actions)
    dispatch-runner.ts      Claude API call loop + tool executor
    events.ts               Append-only JSONL event log
    paths.ts                Path resolution
    project.ts              Types + project file finder
    registry.ts             Global project registry
  __tests__/                Vitest test suites
    automation.test.ts
    dispatch-runner.test.ts
mcp/
  server.py                 MCP server (stdio + HTTP/SSE)
schema/
  claude-project.schema.json  JSON Schema for .claude-project
docs/                       GitHub Pages documentation site
.github/
  workflows/
    release.yml             CI + release pipeline
  ISSUE_TEMPLATE/           Bug report + feature request forms
```

### Key conventions

- **Commands** export a single named function and have no side effects at import time.
- **Library modules** (`src/lib/`) are pure: no `process.exit`, no `console.log`, always return values.
- **Error handling** at execution boundaries — catch, log as event, never propagate to daemon.
- Use `resolvePaths(project, projectDir)` for all filesystem paths.
- New trigger/action types: add to `TRIGGER_EVALUATORS` / `ACTION_HANDLERS` in `src/lib/automation.ts`.

---

## Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout main && git pull upstream main
   git checkout -b feat/my-feature
   ```
2. Make your changes and add tests for any new behaviour.
3. Ensure all checks pass:
   ```bash
   npm run lint && npm test && npm run build
   node dist/cli.js --version   # smoke test
   ```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add file_change trigger support
fix: prevent double-fire on same event id
docs: update automation schema reference
test: add MAX_ITERATIONS guard test
chore: bump @anthropic-ai/sdk to 0.55
```

---

## Testing

```bash
npm test              # run all tests once
npm run test:watch    # watch mode
```

Tests use [Vitest](https://vitest.dev/) and real filesystem operations via `fs.mkdtempSync` — no mocks for I/O unless testing the Claude SDK (which is mocked via `vi.mock`).

When adding a new feature, add tests in `src/__tests__/`. Cover:
- The happy path
- Edge cases (missing files, empty arrays, disabled flags)
- Idempotency where relevant
- Security boundaries (path traversal for any file-touching code)

---

## Submitting a Pull Request

1. Push your branch and open a PR against `main`.
2. Fill in the PR template — describe **what** changed and **why**.
3. CI will run: lint → test → build → CLI smoke test.
4. A maintainer will review and merge.

**PR title** should follow the same Conventional Commits format as commit messages.

---

## Release Process

Releases are created by maintainers:

1. Bump version in `package.json` and `src/cli.ts`.
2. Update `CHANGELOG.md` (or the README changelog section).
3. Commit: `chore: bump version to X.Y.Z`.
4. Push and tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. GitHub Actions automatically: publishes to npm, publishes to GitHub Packages, packages the VS Code `.vsix`, and creates a GitHub Release.
