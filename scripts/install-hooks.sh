#!/bin/bash
# Run once after git clone to install local git hooks
# Usage: bash scripts/install-hooks.sh

REPO_ROOT=$(git rev-parse --show-toplevel)
HOOKS_DIR="$REPO_ROOT/.git/hooks"

cp "$REPO_ROOT/scripts/hooks/pre-commit-template" \
   "$HOOKS_DIR/pre-commit"
cp "$REPO_ROOT/scripts/hooks/pre-push-template" \
   "$HOOKS_DIR/pre-push"

chmod +x "$HOOKS_DIR/pre-commit" "$HOOKS_DIR/pre-push"

echo "✅ Git hooks installed:"
echo "   $HOOKS_DIR/pre-commit"
echo "   $HOOKS_DIR/pre-push"
