#!/usr/bin/env bash
# env-register.sh — register this machine in the environment registry
#
# Each environment gets an anonymous ID (env-XXXXXXXX).
# No hostnames, usernames, or paths stored in git.
# Registry: .env-registry/ (gitignored)
# Identity: ~/.claude-project-envid (local, never leaves machine)
#
# Usage:
#   bash scripts/env-register.sh              -- register/show current env
#   bash scripts/env-register.sh --list       -- list all registered envs
#   bash scripts/env-register.sh --remove     -- deregister this env

set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY_DIR="$REPO_ROOT/.env-registry"
ENV_ID_FILE="$HOME/.claude-project-envid"
mkdir -p "$REGISTRY_DIR"

source "$REPO_ROOT/scripts/detect-env.sh"

# ── Get or create this machine's anonymous ID ─────────────────────────────
get_env_id() {
  if [ -f "$ENV_ID_FILE" ]; then
    cat "$ENV_ID_FILE"
  else
    local id="env-$(openssl rand -hex 4)"
    echo "$id" > "$ENV_ID_FILE"
    echo "$id"
  fi
}

# ── Register ──────────────────────────────────────────────────────────────
register() {
  local env_id
  env_id=$(get_env_id)
  local reg_file="$REGISTRY_DIR/${env_id}.json"

  # Gather anonymous facts — no usernames, no real paths
  local os_version=""
  if [[ "$OSTYPE" == "darwin"* ]]; then
    os_version="macOS-$(sw_vers -productVersion 2>/dev/null || echo 'unknown')"
  else
    os_version="$(uname -r 2>/dev/null | cut -d- -f1 || echo 'linux')"
  fi

  cat > "$reg_file" << EOF
{
  "env_id": "$env_id",
  "type": "$ENV_TYPE",
  "registered": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "last_seen": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "os": "$os_version",
  "node": "$(node --version 2>/dev/null || echo 'n/a')",
  "python": "$(python3 --version 2>/dev/null | cut -d' ' -f2 || echo 'n/a')",
  "git_crypt": "$(git-crypt --version 2>/dev/null && echo 'present' || echo 'absent')",
  "secrets_unlocked": "$([ -f "$REPO_ROOT/.env" ] && file "$REPO_ROOT/.env" | grep -q 'text' && echo 'yes' || echo 'no')"
}
EOF

  echo "════════════════════════════════════"
  echo "  Environment registered"
  echo "  ID:   $env_id"
  echo "  Type: $ENV_TYPE"
  echo "  OS:   $os_version"
  echo "  File: ~/.claude-project-envid"
  echo "════════════════════════════════════"
  echo ""
  echo "This ID is stored locally at: $ENV_ID_FILE"
  echo "Registry entry: $reg_file (gitignored)"
}

# ── List ──────────────────────────────────────────────────────────────────
list_envs() {
  echo "=== Registered environments ==="
  local current
  current=$(get_env_id 2>/dev/null || echo "none")
  for f in "$REGISTRY_DIR"/env-*.json; do
    [ -f "$f" ] || continue
    local id type registered last_seen os
    id=$(python3 -c "import json; d=json.load(open('$f')); print(d['env_id'])" 2>/dev/null)
    type=$(python3 -c "import json; d=json.load(open('$f')); print(d['type'])" 2>/dev/null)
    registered=$(python3 -c "import json; d=json.load(open('$f')); print(d['registered'][:10])" 2>/dev/null)
    last_seen=$(python3 -c "import json; d=json.load(open('$f')); print(d['last_seen'][:10])" 2>/dev/null)
    os=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('os','?'))" 2>/dev/null)
    local marker=""
    [ "$id" = "$current" ] && marker=" ← THIS MACHINE"
    echo "  $id  [$type]  $os  registered: $registered  last: $last_seen$marker"
  done
}

# ── Remove ────────────────────────────────────────────────────────────────
remove() {
  local env_id
  env_id=$(get_env_id)
  rm -f "$REGISTRY_DIR/${env_id}.json"
  rm -f "$ENV_ID_FILE"
  echo "✅ Environment $env_id deregistered"
}

# ── Update last_seen on every call ────────────────────────────────────────
update_last_seen() {
  local env_id
  env_id=$(get_env_id 2>/dev/null || return)
  local reg_file="$REGISTRY_DIR/${env_id}.json"
  [ -f "$reg_file" ] || return
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  python3 -c "
import json
d = json.load(open('$reg_file'))
d['last_seen'] = '$ts'
open('$reg_file', 'w').write(json.dumps(d, indent=2))
" 2>/dev/null || true
}

case "${1:-register}" in
  --list)    list_envs ;;
  --remove)  remove ;;
  *)         register; update_last_seen ;;
esac
