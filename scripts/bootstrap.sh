#!/bin/bash
# bootstrap.sh — environment-aware session startup
# Usage: source scripts/bootstrap.sh
set -a

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
cd "$REPO_ROOT"

source scripts/detect-env.sh --print

echo ""
echo "── Step 1: Install git-crypt if missing ──"
if ! command -v git-crypt &>/dev/null; then
  if [ "$ENV_PACKAGE_MGR" = "brew" ]; then
    brew install git-crypt -q && echo "✅ git-crypt installed (brew)"
  else
    sudo apt-get install -y git-crypt -q 2>/dev/null && echo "✅ git-crypt installed (apt)"
  fi
else
  echo "✅ git-crypt present: $(git-crypt --version 2>/dev/null || echo 'installed')"
fi

echo ""
echo "── Step 2: Unlock secrets ──"
UNLOCKED=false

if [ -f .keys/git-crypt-master.key ]; then
  git-crypt unlock .keys/git-crypt-master.key 2>/dev/null && {
    echo "✅ Unlocked via .keys/git-crypt-master.key"
    UNLOCKED=true
  } || UNLOCKED=true  # already unlocked is fine
fi

if [ "$UNLOCKED" = false ] && [ -n "$GIT_CRYPT_KEY_B64" ]; then
  echo "$GIT_CRYPT_KEY_B64" | base64 -d > /tmp/gc.key 2>/dev/null
  git-crypt unlock /tmp/gc.key 2>/dev/null && {
    echo "✅ Unlocked via GIT_CRYPT_KEY_B64"
    UNLOCKED=true
  }
  rm -f /tmp/gc.key
fi

if [ "$UNLOCKED" = false ] && [ "$ENV_TYPE" = "github-actions" ]; then
  echo "⚠️  In GitHub Actions — unlock should happen via workflow step"
fi

if [ "$UNLOCKED" = false ]; then
  echo "⚠️  Could not auto-unlock git-crypt"
  echo "   Options:"
  echo "   a) Copy .keys/git-crypt-master.key to this environment"
  echo "   b) Set GIT_CRYPT_KEY_B64 env var (base64 of the key)"
  echo "   c) Paste .env content directly"
fi

echo ""
echo "── Step 3: Load .env ──"
if [ -f .env ]; then
  if file .env | grep -qE "ASCII|text"; then
    source .env 2>/dev/null
    KEY_COUNT=$(grep -v '^#' .env | grep -v '^$' | grep '=.' | wc -l | tr -d ' ')
    echo "✅ .env loaded: $KEY_COUNT keys"
  else
    echo "❌ .env appears encrypted — git-crypt unlock needed first"
    echo "   Run: git-crypt unlock .keys/git-crypt-master.key"
  fi
else
  echo "⚠️  .env not found"
fi

echo ""
echo "── Step 4: Environment-specific setup ──"

if [ "$ENV_TYPE" = "macbook" ]; then
  echo "MacBook: persistent environment — skipping tool install"

elif [ "$ENV_TYPE" = "claude-sandbox" ] || [ "$ENV_TYPE" = "linux-container" ]; then
  echo "Sandbox: checking runtime deps..."

  command -v aws &>/dev/null && echo "✅ aws-cli present" || {
    curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscli.zip 2>/dev/null
    unzip -q /tmp/awscli.zip -d /tmp 2>/dev/null && sudo /tmp/aws/install -q 2>/dev/null && echo "✅ aws-cli installed"
    rm -rf /tmp/aws /tmp/awscli.zip
  }

  command -v firebase &>/dev/null && echo "✅ firebase-tools present" || {
    npm install -g firebase-tools --silent 2>/dev/null && echo "✅ firebase-tools installed"
  }

  python3 -c "import psycopg2" 2>/dev/null && echo "✅ psycopg2 present" || {
    pip3 install psycopg2-binary -q 2>/dev/null && echo "✅ psycopg2 installed"
  }

elif [ "$ENV_TYPE" = "codespaces" ]; then
  echo "Codespaces: deps handled by devcontainer.json"
fi

echo ""
echo "── Step 5: Verify npm deps ──"
if [ -f package.json ]; then
  if [ -d node_modules ]; then
    echo "✅ node_modules present"
  else
    npm ci --silent 2>/dev/null && echo "✅ npm ci complete"
  fi
fi

echo ""
echo "════════════════════════════════════════"
echo "  BOOTSTRAP COMPLETE — $ENV_LABEL"
echo "  Secrets: $([ -n "$ANTHROPIC_API_KEY" ] && echo "✅ loaded" || echo "❌ missing ANTHROPIC_API_KEY")"
echo "  Ready for: dispatch / orchestrator / ablation"
echo "════════════════════════════════════════"

set +a
