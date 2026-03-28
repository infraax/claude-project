#!/usr/bin/env bash
# sanitize-commit-msg.sh — strips known OPSEC leaks from commit messages
# Called by prepare-commit-msg hook

COMMIT_MSG_FILE="$1"

# 1. Strip Claude session URLs (agent habit)
sed -i '/https:\/\/claude\.ai\/code\/session_/d' "$COMMIT_MSG_FILE"

# 2. Strip Anthropic session URLs
sed -i '/https:\/\/api\.anthropic\.com\/sessions\//d' "$COMMIT_MSG_FILE"

# 3. Remove bare URL-only lines
sed -i '/^https:\/\//d' "$COMMIT_MSG_FILE"

# 4. Replace remaining session IDs inline
sed -i 's/session_[A-Za-z0-9]\{10,\}/<session-redacted>/g' "$COMMIT_MSG_FILE"

# 5. Remove key fingerprint lines
sed -i '/[Ff]ingerprint:/d' "$COMMIT_MSG_FILE"
sed -i '/[Oo]ld key:/d' "$COMMIT_MSG_FILE"
sed -i '/[Nn]ew key:/d' "$COMMIT_MSG_FILE"
sed -i '/[Pp]revious key/d' "$COMMIT_MSG_FILE"

# 6. Remove lines with raw base64 blobs > 40 chars
sed -i '/^[A-Za-z0-9+\/=]\{40,\}$/d' "$COMMIT_MSG_FILE"

# 7. Redact inline Value: <blob> patterns
sed -i 's/Value: [A-Za-z0-9+\/=]\{20,\}/Value: <ENCRYPTED-SEE-VAULT>/g' "$COMMIT_MSG_FILE"

# 8. Trim trailing blank lines
sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$COMMIT_MSG_FILE" 2>/dev/null || true
