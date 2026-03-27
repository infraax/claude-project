#!/bin/bash
# scripts/certify_clean.sh
# Exit 1 if ANY legacy reference found. Zero output = clean.

set -e

PATTERNS=(
  "<user>"
  "<robot-platform>"
  "<local-app>"
  "Volumes/Claude"
  "MacBook / "
  "claude-diary"
  "CLAUDE_DIARY_PATH"
  "@claudelab"
  "obsidianVault ="
  "obsidianFolder ="
  "obsidianProjectDir ="
  "obsidian_vault:"
  "obsidian_folder:"
  "diary_path ="
  "diary_path:"
  "SESSION_JOURNAL"
  "WAKEUP\.md"
  "wakeup_read"
  "wakeup_update_section"
  "get_context_legacy"
  "update_dexter_profile"
  "journal_append"
  "list_sessions\(\)"
  "read_memory_file\("
  "memory_append_thought\("
)

SEARCH_DIRS="src mcp schema"
SEARCH_FILES="package.json README.md .github/workflows/release.yml"
ERRORS=0

for pattern in "${PATTERNS[@]}"; do
  results=$(grep -rn "$pattern" $SEARCH_DIRS $SEARCH_FILES \
    --include="*.ts" --include="*.py" --include="*.json" \
    --include="*.md" --include="*.yml" \
    2>/dev/null | grep -v "^Binary\|#.*backward.compat\|diary_path.*compat" || true)
  if [ -n "$results" ]; then
    echo "FAIL [$pattern]:"
    echo "$results"
    ERRORS=$((ERRORS + 1))
  fi
done


echo "=== secret scan ==="
bash scripts/hooks/scan-secrets.sh . || ERRORS=$((ERRORS+1))
if [ $ERRORS -eq 0 ]; then
  echo "✓ CERTIFICATION PASSED — zero legacy references"
else
  echo "✗ CERTIFICATION FAILED — $ERRORS patterns found"
  exit 1
fi
