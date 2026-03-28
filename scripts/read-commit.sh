#!/usr/bin/env bash
# read-commit.sh — decrypt vault commit messages
# Usage:
#   bash scripts/read-commit.sh <vault-id>   e.g. v-a3f7b2c1
#   bash scripts/read-commit.sh <git-sha>    e.g. 570e326 or HEAD
#   bash scripts/read-commit.sh --log        all vault commits decrypted

set -euo pipefail

VAULT_KEY=".keys/commit-vault.key"
VAULT_DIR=".commit-vault"
ARG="${1:-HEAD}"

if [ ! -f "$VAULT_KEY" ]; then
  echo "❌ Vault key not found: $VAULT_KEY"
  echo "   Unlock git-crypt: git-crypt unlock .keys/git-crypt-master.key"
  exit 1
fi

KEY=$(cat "$VAULT_KEY")

decrypt_vault() {
  local vault_id="$1"
  local enc_file="$VAULT_DIR/${vault_id}.enc"
  [ -f "$enc_file" ] || { echo "⚠️  Not found: $enc_file"; return 1; }

  local encrypted timestamp author
  encrypted=$(grep "^ENCRYPTED=" "$enc_file" | cut -d= -f2-)
  timestamp=$(grep "^TIMESTAMP=" "$enc_file" | cut -d= -f2-)
  author=$(grep "^AUTHOR=" "$enc_file" | cut -d= -f2-)

  local plaintext
  plaintext=$(printf '%s' "$encrypted" | base64 -d | \
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass "pass:$KEY" 2>/dev/null) || {
    echo "❌ Decryption failed — wrong key or corrupted entry"; return 1
  }

  echo "════════════════════════════════════════"
  echo "  VAULT: $vault_id"
  echo "  Time:  $timestamp"
  echo "  Author: $author"
  echo "────────────────────────────────────────"
  echo "$plaintext"
  echo "════════════════════════════════════════"
}

if [ "$ARG" = "--log" ]; then
  git log --format="%H %s" | grep "VAULT:" | while read -r sha msg; do
    vault_id=$(echo "$msg" | grep -oP 'v-[a-f0-9]{8}' | head -1)
    [ -n "$vault_id" ] && { echo ""; echo "Git SHA: $sha"; decrypt_vault "$vault_id"; }
  done
  exit 0
fi

if echo "$ARG" | grep -qP '^v-[a-f0-9]{8}$'; then
  decrypt_vault "$ARG"
else
  SHA=$(git rev-parse "$ARG" 2>/dev/null) || { echo "❌ Cannot resolve: $ARG"; exit 1; }
  COMMIT_MSG=$(git log -1 --format="%B" "$SHA")
  VAULT_ID=$(echo "$COMMIT_MSG" | grep -oP 'v-[a-f0-9]{8}' | head -1)

  if [ -z "$VAULT_ID" ]; then
    echo "ℹ️  Plaintext commit (not encrypted):"
    echo ""
    git log -1 --format="%B" "$SHA"
  else
    decrypt_vault "$VAULT_ID"
  fi
fi
