#!/usr/bin/env bash
# commit-secure.sh — encrypted commit messages (AES-256-CBC)
# Usage: bash scripts/commit-secure.sh "real commit message" [-- git-add-args]
#
# Git log shows: VAULT:v-a3f7b2c1 [type]
# Decrypt with:  bash scripts/read-commit.sh HEAD

set -euo pipefail

VAULT_KEY=".keys/commit-vault.key"
VAULT_DIR=".commit-vault"
REAL_MSG="${1:-}"

if [ -z "$REAL_MSG" ]; then
  echo "Usage: bash scripts/commit-secure.sh 'real commit message'"
  exit 1
fi
shift || true

# Ensure vault key exists
if [ ! -f "$VAULT_KEY" ]; then
  echo "Generating commit vault key (AES-256)..."
  mkdir -p .keys
  openssl rand -hex 32 > "$VAULT_KEY"
  chmod 600 "$VAULT_KEY"
  grep -q "commit-vault.key" .gitattributes 2>/dev/null || \
    echo ".keys/commit-vault.key filter=git-crypt diff=git-crypt" >> .gitattributes
  echo "✅ Vault key created: $VAULT_KEY"
fi

KEY=$(cat "$VAULT_KEY")
VAULT_ID="v-$(openssl rand -hex 4)"
mkdir -p "$VAULT_DIR"

# Encrypt with AES-256-CBC
ENCRYPTED=$(printf '%s' "$REAL_MSG" | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass "pass:$KEY" 2>/dev/null | base64 -w 0)

# Write vault entry
cat > "$VAULT_DIR/${VAULT_ID}.enc" << EOF
VAULT_ID=$VAULT_ID
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AUTHOR=$(git config user.email 2>/dev/null || echo "unknown")
ENCRYPTED=$ENCRYPTED
EOF

# Determine commit type
TYPE="update"
echo "$REAL_MSG" | grep -qi "^security\|^sec:" && TYPE="security"
echo "$REAL_MSG" | grep -qi "^feat" && TYPE="feat"
echo "$REAL_MSG" | grep -qi "^fix" && TYPE="fix"
echo "$REAL_MSG" | grep -qi "^infra\|^deploy" && TYPE="infra"
echo "$REAL_MSG" | grep -qi "^refactor" && TYPE="refactor"
echo "$REAL_MSG" | grep -qi "^docs" && TYPE="docs"
echo "$REAL_MSG" | grep -qi "^chore" && TYPE="chore"
echo "$REAL_MSG" | grep -qi "^ci\|^workflow" && TYPE="ci"

git add "$VAULT_DIR/${VAULT_ID}.enc" 2>/dev/null || true

git commit "$@" -m "VAULT:${VAULT_ID} [${TYPE}]

Decrypt: bash scripts/read-commit.sh ${VAULT_ID}"

echo ""
echo "✅ Commit: VAULT:${VAULT_ID} [${TYPE}]"
echo "   Vault: ${VAULT_DIR}/${VAULT_ID}.enc"
echo "   Read:  bash scripts/read-commit.sh ${VAULT_ID}"
