#!/bin/bash
# Reusable secret scanner — exit 1 if secrets found
# Usage: bash scripts/hooks/scan-secrets.sh [path]

SCAN_PATH="${1:-.}"
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
