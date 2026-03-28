#!/bin/bash
# Reusable secret scanner — exit 1 if secrets found
# Usage: bash scripts/hooks/scan-secrets.sh [path]

SCAN_PATH="${1:-.}"
REPO_ROOT=$(git -C "$SCAN_PATH" rev-parse --show-toplevel 2>/dev/null || echo "$SCAN_PATH")
FOUND=0

PATTERNS=(
  "sk-ant-api[0-9a-zA-Z_\-]{20,}"
  "npm_[a-zA-Z0-9]{36}"
  "ghp_[a-zA-Z0-9]{36}"
  "pplx-[a-zA-Z0-9]{40,}"
  "ANTHROPIC_API_KEY=['\"]?sk-ant-api[0-9a-zA-Z_\-]{20,}"
  "-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----"
)

while IFS= read -r -d '' file; do
  # Get path relative to repo root for git check-attr
  REL="${file#$REPO_ROOT/}"
  REL="${REL#./}"

  # Skip git-crypt encrypted files
  ATTR=$(git -C "$REPO_ROOT" check-attr filter -- "$REL" 2>/dev/null | grep -o 'git-crypt')
  [ "$ATTR" = "git-crypt" ] && continue

  for PATTERN in "${PATTERNS[@]}"; do
    if grep -qE "$PATTERN" "$file" 2>/dev/null; then
      echo "❌ SECRET FOUND in $file"
      echo "   Pattern: $PATTERN"
      grep -nE "$PATTERN" "$file" | head -3
      FOUND=1
    fi
  done
done < <(find "$SCAN_PATH" \
  -type f \
  \( -name "*.ts" -o -name "*.js" -o -name "*.json" \
     -o -name "*.md" -o -name "*.env" -o -name "*.txt" \
     -o -name "*.yaml" -o -name "*.yml" -o -name "*.sh" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -print0)

if [ "$FOUND" -eq 1 ]; then
  echo "SCAN FAILED — secrets detected"
  exit 1
fi

echo "✅ SCAN PASSED — no secrets found in $SCAN_PATH"
exit 0
