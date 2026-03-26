# GitHub Repository Setup Guide

This file documents the one-time manual steps required to fully activate all GitHub features for this repository. The code and config files are all committed — these are the settings-level steps only a maintainer can perform.

---

## 1. Branch Protection (Settings → Branches)

Add a rule for `main`:

| Setting | Value |
|---|---|
| Require status checks before merging | ✅ |
| Required checks | `Build, Lint & Test` |
| Require branches to be up to date | ✅ |
| Require pull request reviews | ✅ (1 approver) |
| Dismiss stale reviews on push | ✅ |
| Restrict pushes to matching branches | ✅ (only admins) |

---

## 2. Environments (Settings → Environments)

Create two environments:

**`production`** — gates the release job
- Required reviewers: `@infraax`
- Deployment branches: tag pattern `v*`

**`github-pages`** — gates the Pages deploy
- Deployment branches: `main` only

---

## 3. Secrets (Settings → Secrets and variables → Actions)

| Secret | Where to get it |
|---|---|
| `NPM_TOKEN` | npmjs.com → Access Tokens → Automation token |
| `VSCE_PAT` | dev.azure.com → Personal Access Tokens (Marketplace publish scope) |

For Dependabot secrets (Settings → Secrets → Dependabot): add the same `NPM_TOKEN`.

---

## 4. Deploy Key (Settings → Deploy keys)

Title: `claude-project-github-deploy`
Key (public):
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMhv2p4uvF2QxG1P7c5PA5H2DGxYd6mq84j3hWd4yJYF claude-project-github-deploy
```
Allow write access: **No** (read-only is sufficient for CI checkout)

Store the private key in `DEPLOY_KEY` Actions secret if you need SSH-based checkout in workflows.

---

## 5. GitHub Pages (Settings → Pages)

| Setting | Value |
|---|---|
| Source | **GitHub Actions** |
| Custom domain | *(optional)* |
| Enforce HTTPS | ✅ |

The `pages.yml` workflow deploys `docs/` automatically on every push to `main`.

---

## 6. Codespaces Secrets (Settings → Secrets → Codespaces)

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables `dispatch run` in dev containers |
| `NPM_TOKEN` | Enables publishing from Codespaces |

---

## 7. Discussions (Settings → Features)

Enable **Discussions** and create these categories:
- **Q&A** — help and troubleshooting
- **Ideas** — feature suggestions before opening issues
- **Show and tell** — share how you're using claude-project
- **Announcements** — releases and important updates (maintainers only)

---

## 8. Repository Metadata (Settings → General)

- **Description**: `Project brain for Claude Code — persistent memory, event log, agent dispatch, automations, MCP server`
- **Website**: `https://infraax.github.io/claude-project/`
- **Topics**: `claude`, `claude-code`, `mcp`, `anthropic`, `ai-agent`, `developer-tools`, `automation`, `obsidian`, `typescript`, `nodejs`
- Enable: Wikis, Issues, Discussions, Projects

---

## 9. Recommended GitHub Apps

Install from the [GitHub Marketplace](https://github.com/marketplace):

### Code Quality & Security
| App | Purpose | Link |
|---|---|---|
| **Codecov** | Coverage reports on PRs | [marketplace](https://github.com/marketplace/codecov) |
| **Snyk** | Dependency vulnerability scanning | [marketplace](https://github.com/marketplace/snyk) |
| **CodeClimate** | Code quality + maintainability score | [marketplace](https://github.com/marketplace/code-climate) |
| **Socket** | Supply chain security for npm | [marketplace](https://github.com/marketplace/socket-security) |

### Automation & Workflow
| App | Purpose | Link |
|---|---|---|
| **Renovate** | Smarter dependency updates than Dependabot | [marketplace](https://github.com/marketplace/renovate) |
| **Semantic Release** | Automated versioning and changelog from commits | [marketplace](https://github.com/marketplace/semantic-release) |
| **Release Drafter** | Auto-drafts release notes from merged PRs | [marketplace](https://github.com/marketplace/release-drafter) |
| **Pull Request Size** | Labels PRs by diff size to encourage small PRs | [marketplace](https://github.com/marketplace/pull-request-size) |

### Community
| App | Purpose | Link |
|---|---|---|
| **All Contributors** | Credits all types of contributors in README | [marketplace](https://github.com/marketplace/all-contributors) |
| **Welcome Bot** | Greets first-time contributors | Built-in via Actions |

### Recommended priority order
1. **Codecov** — install first, add `npm run test -- --coverage` to CI
2. **Snyk** — passive security scanning, no config needed
3. **Release Drafter** — auto-populates release notes between tags
4. **Renovate** — replaces Dependabot with smarter grouping (disable dependabot.yml if switching)

---

## 10. Wiki

The wiki is enabled. Suggested pages:
- **Home** — overview and quick links
- **Configuration Reference** — full `.claude-project` schema
- **Automation Cookbook** — example automation patterns
- **Agent Dispatch Guide** — setting up agents and tools
- **MCP Server Setup** — connecting to Claude Code
- **Troubleshooting** — common issues and fixes

---

## 11. Projects (Settings → Features → Projects)

Create a GitHub Project board:
- **Backlog** — ideas and future work
- **In Progress** — active development
- **Review** — PRs open
- **Done** — shipped

Link the project to the repo for automatic issue/PR tracking.
