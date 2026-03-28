# Skill: secure-commit

## When to load
Before committing anything to git, especially anything that touches `.env`, credentials, keys, or agent session output.

## Decision tree: which commit method to use

```
Is the commit message sensitive?
  (mentions key rotation, vulnerability details, specific SHAs in security context,
   internal infrastructure info, API endpoint details)
    YES → use scripts/commit-secure.sh
    NO  → use regular git commit
```

## Regular commit

```bash
git add <files>
git commit -m "$(cat <<'EOF'
type: short description

- bullet point detail
- another detail
EOF
)"
```

## Secure commit (vault-encrypted)

```bash
# Commit is stored encrypted — git log shows: VAULT:v-XXXXXXXX [type]
bash scripts/commit-secure.sh "real detailed message here" -a

# Read back later:
bash scripts/read-commit.sh HEAD
bash scripts/read-commit.sh v-5f4c0573
```

## ABSOLUTE rules — never put these in any commit message

| Forbidden | Example of violation | Correct |
|-----------|---------------------|---------|
| Session URLs | `https://claude.ai/code/session_01AX...` | *(omit entirely — hook strips them)* |
| Key material | `Old key: AEdJVENSWVBUS0VZ` | `security: key rotation` |
| OPSEC narration | `Previous key was in commit 570e326` | `security: rotate credentials` |
| Base64 blobs | `key=SGVsbG8gV29ybGQ=` | *(never in commit messages)* |
| SHA + security context | `fixes exposure in 570e326` | `security: patch XSS in dispatcher` |

## Pre-push security scan

The `pre-push` hook runs automatically and scans for:
- git-crypt header patterns (`AEdJVENSWVBUS0VZ`)
- Anthropic API key patterns (`sk-ant-`)
- AWS key patterns (`AKIA`, `ASIA`)
- 14 total patterns — see `.github/workflows/security-guardian.yml`

If scan fails: **do not use `--no-verify`**. Fix the underlying issue.

## Conventional commit types

| Type | When |
|------|------|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `chore:` | Build, deps, version bumps |
| `docs:` | README, comments, CLAUDE.md |
| `security:` | Any security-related change |
| `refactor:` | Code restructure, no behaviour change |
| `test:` | Tests only |
| `ci:` | Workflow changes |

## Files that must never be committed unencrypted

- `.env` — git-crypt encrypted ✅ (already in .gitattributes)
- `.keys/` — gitignored ✅
- `.env-registry/` — gitignored ✅
- `data/usage-snapshot.json` — gitignored
- `reports/infra-test-*.json` — gitignored (may contain infra details)

## Branch rules

- All work goes on the designated feature branch (see CLAUDE.md / session start)
- Never push directly to `main` — always via PR
- Tag pushes (`v*`) must be done from Mac (proxy blocks them in sandbox)
