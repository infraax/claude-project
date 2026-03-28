#!/bin/bash
# postCreate.sh — runs once when the Codespace is first created
set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   claude-project Codespace — First Setup    ║"
echo "╚══════════════════════════════════════════════╝"

# ── 1. Unlock secrets ────────────────────────────────────────────────────
echo ""
echo "── [1/6] Unlocking secrets ──"
if [ -n "${GIT_CRYPT_KEY_B64:-}" ]; then
  echo "$GIT_CRYPT_KEY_B64" | base64 -d > /tmp/gc.key
  git-crypt unlock /tmp/gc.key && echo "✅ git-crypt unlocked"
  rm -f /tmp/gc.key
else
  echo "⚠️  GIT_CRYPT_KEY_B64 not set — .env will remain encrypted"
fi

# ── 2. Install Node deps ──────────────────────────────────────────────────
echo ""
echo "── [2/6] Installing Node.js dependencies ──"
npm ci --silent && echo "✅ npm ci complete"

# ── 3. Install Python deps ────────────────────────────────────────────────
echo ""
echo "── [3/6] Installing Python dependencies ──"
pip install -q anthropic 2>/dev/null && echo "✅ anthropic SDK"
if [ -f requirements-research.txt ]; then
  pip install -q -r requirements-research.txt 2>/dev/null && echo "✅ requirements-research.txt"
fi

# ── 4. Install Claude Code CLI ────────────────────────────────────────────
echo ""
echo "── [4/6] Installing Claude Code CLI ──"
if ! command -v claude &>/dev/null; then
  npm install -g @anthropic-ai/claude-code --silent 2>/dev/null && echo "✅ Claude Code CLI installed"
else
  echo "✅ Claude Code CLI already present: $(claude --version 2>/dev/null | head -1)"
fi

# ── 5. Install cloudflared ────────────────────────────────────────────────
echo ""
echo "── [5/6] Installing cloudflared ──"
if ! command -v cloudflared &>/dev/null; then
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    -o /usr/local/bin/cloudflared 2>/dev/null
  chmod +x /usr/local/bin/cloudflared
  echo "✅ cloudflared installed: $(cloudflared --version 2>/dev/null | head -1)"
else
  echo "✅ cloudflared present: $(cloudflared --version 2>/dev/null | head -1)"
fi

# ── 6. Generate .mcp.json + shell profile ─────────────────────────────────
echo ""
echo "── [6/6] Wiring MCP + shell profile ──"
if [ -f .mcp.json.template ] && [ ! -f .mcp.json ]; then
  sed "s|\${CLAUDE_PROJECT_DIR}|$REPO_ROOT|g" .mcp.json.template > .mcp.json
  echo "✅ .mcp.json generated"
fi

# Write shell profile additions
PROFILE="$HOME/.bashrc"
if ! grep -q "claude-project-codespace" "$PROFILE" 2>/dev/null; then
  cat >> "$PROFILE" << PROFILE_EOF

# ── claude-project Codespace setup ──────────────────────────────────────
export CLAUDE_PROJECT_DIR="$REPO_ROOT"

# cc — launch Claude Code with MCP auto-connected
cc() {
  cd "\$CLAUDE_PROJECT_DIR"
  CLAUDE_PROJECT_DIR="\$CLAUDE_PROJECT_DIR" claude --mcp-config "\$CLAUDE_PROJECT_DIR/.mcp.json" "\$@"
}

# bridge — start/stop the live API bridge
bridge-start() { bash "\$CLAUDE_PROJECT_DIR/scripts/start-live-bridge.sh" & }
bridge-stop()  { pkill -f "start-live-bridge\|cloudflared\|api-server" 2>/dev/null; echo "Bridge stopped"; }
bridge-url()   { cat "\$CLAUDE_PROJECT_DIR/data/tunnel.json" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])" 2>/dev/null || echo "Bridge not running"; }

# ablation shortcuts
ablate-full()    { cd "\$CLAUDE_PROJECT_DIR" && source .env && python3 scripts/ablation_runner.py --condition 6 --max-tasks \${1:-10}; }
ablate-cache()   { cd "\$CLAUDE_PROJECT_DIR" && source .env && python3 scripts/ablation_runner.py --condition 1 --max-tasks \${1:-10}; }
ablate-all()     { cd "\$CLAUDE_PROJECT_DIR" && source .env && python3 scripts/ablation_runner.py --max-tasks \${1:-10}; }
ablate-results() { cd "\$CLAUDE_PROJECT_DIR" && python3 scripts/compute_ablation_results.py; }
# ────────────────────────────────────────────────────────────────────────
PROFILE_EOF
  echo "✅ Shell profile configured (~/.bashrc)"
fi

# Register environment
bash scripts/env-register.sh >/dev/null 2>&1 || true

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Codespace ready!                                     ║"
echo "║                                                          ║"
echo "║  Start Claude Code:  cc                                  ║"
echo "║  Start API bridge:   bridge-start                        ║"
echo "║  Run ablation:       ablate-full 10                      ║"
echo "║  Get bridge URL:     bridge-url                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
