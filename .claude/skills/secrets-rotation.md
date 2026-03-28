# Skill: secrets-rotation

## When to load
When any credential has expired, a key needs rotating, a new service is being onboarded, or after any suspected exposure.

## How secrets are stored in this repo

```
.env                    ← git-crypt AES-256 encrypted (never commit unencrypted)
.keys/git-crypt-master.key  ← gitignored (backed up to iCloud)
GitHub Actions secrets  ← GIT_CRYPT_KEY_B64, NPM_TOKEN, ANTHROPIC_API_KEY, etc.
Codespaces secrets      ← GIT_CRYPT_KEY_B64, ANTHROPIC_API_KEY
```

## Process: rotate a key in .env

```bash
# 1. Unlock .env (must have git-crypt key)
source scripts/bootstrap.sh

# 2. Edit .env with new value
# Use your editor — .env is decrypted in place after git-crypt unlock

# 3. Stage and commit via secure commit (don't narrate the old key)
git add .env
bash scripts/commit-secure.sh "security: rotate <service> credentials" -a
git push origin <branch>
```

**Never**: put old key value, SHA, or "previously was X" in any commit message.

## Process: rotate GitHub Actions secret

1. Go to: `https://github.com/infraax/claude-project/settings/secrets/actions`
2. Click the secret → "Update"
3. Paste new value → Save
4. If it's `GIT_CRYPT_KEY_B64`: also update Codespaces secrets at `https://github.com/settings/codespaces`
5. If it's `GIT_CRYPT_KEY_B64`: update local `.keys/git-crypt-master.key`

## Cohere trial key — expires 2026-04-03

```bash
# Check days remaining
python3 -c "from datetime import date; print((date(2026,4,3)-date.today()).days, 'days left')"

# After getting new key:
# 1. Update COHERE_TRIAL_KEY in .env
# 2. Update COHERE_API_KEY if upgrading to paid
# 3. Commit via scripts/commit-secure.sh
```

## Re-generate git-crypt key (nuclear option — only if key is compromised)

```bash
# WARNING: This re-encrypts all encrypted files with a new key.
# All existing key holders must receive the new key.

# 1. Generate new key
git-crypt init   # creates .git/git-crypt/keys/default

# 2. Export new key
git-crypt export-key .keys/git-crypt-master.key

# 3. Re-encrypt (git-crypt handles this automatically on next commit of encrypted files)
# 4. Update GIT_CRYPT_KEY_B64:
base64 -i .keys/git-crypt-master.key | tr -d '\n'
# Paste output into GitHub Actions + Codespaces secrets

# 5. Commit
bash scripts/commit-secure.sh "security: key rotation — vault entry v-XXXX"
git push origin <branch>
```

## What's in .env (categories)

```bash
# AI / LLM
ANTHROPIC_API_KEY        # pay-as-you-go, no expiry
COHERE_TRIAL_KEY         # expires 2026-04-03 ⚠️
COHERE_API_KEY           # production (upgrade from trial)
ALIBABA_MODEL_STUDIO_KEY

# Vector stores
PINECONE_API_KEY
QDRANT_API_KEY
QDRANT_URL
QDRANT_MANAGEMENT_KEY

# Edge / CDN
CLOUDFLARE_API_TOKEN
CLOUDFLARE_GLOBAL_KEY
CLOUDFLARE_ACCOUNT_ID    # not secret, but stored for convenience

# Database
NEON_API_KEY
NEON_CONNECTION_STRING   # not yet set — add when Neon DB is provisioned
NEON_AUTH_URL
NEON_JWKS_URL

# Messaging
UPSTASH_REDIS_KEY
UPSTASH_REDIS_URL
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY

# DevOps / source control
GITLAB_ACCESS_TOKEN      # check expiry in GitLab UI
GITPOD_TOKEN
BITBUCKET_API_TOKEN      # ⚠️ HTTP 401 — may be expired, regenerate at bitbucket.org
```

## Rotation schedule recommendations

| Key | Rotation frequency | Notes |
|-----|--------------------|-------|
| `COHERE_TRIAL_KEY` | Before 2026-04-03 | Set calendar reminder |
| `BITBUCKET_API_TOKEN` | Now (currently 401) | Regenerate at bitbucket.org/account/settings/app-passwords |
| `GITLAB_ACCESS_TOKEN` | Check expiry date in GitLab | Settings → Access Tokens |
| `CLOUDFLARE_API_TOKEN` | Annually or on suspected exposure | Scoped tokens — rotate with minimal blast radius |
| `ANTHROPIC_API_KEY` | On suspected exposure only | No expiry |
| `GIT_CRYPT_KEY_B64` | On suspected exposure only | Nuclear — requires all holders to update |

## After any rotation — verify

```bash
bash scripts/test-infrastructure.sh 2>&1 | grep -E "✅|❌|⚠️"
```
