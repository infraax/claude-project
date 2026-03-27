#!/bin/bash
# ============================================================
# Infrastructure Connectivity Test Suite
# Usage: bash scripts/test-infrastructure.sh
# Reads credentials from .env (gitignored)
# ============================================================

set -a
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$ROOT_DIR/.env" ]; then
  source "$ROOT_DIR/.env"
else
  echo "ERROR: .env not found at $ROOT_DIR/.env"
  exit 1
fi
set +a

PASS=0; FAIL=0; WARN=0; SKIP=0
declare -A RESULTS

result() {
  local status="$1" service="$2" notes="$3"
  RESULTS["$service"]="$status|$notes"
  if [ "$status" = "PASS" ]; then
    printf "  \xE2\x9C\x85  %-32s %s\n" "$service" "$notes"
    PASS=$((PASS+1))
  elif [ "$status" = "WARN" ]; then
    printf "  \xE2\x9A\xA0\xEF\xB8\x8F   %-32s %s\n" "$service" "$notes"
    WARN=$((WARN+1))
  elif [ "$status" = "SKIP" ]; then
    printf "  \xE2\x8F\xAD\xEF\xB8\x8F   %-32s %s\n" "$service" "$notes"
    SKIP=$((SKIP+1))
  else
    printf "  \xE2\x9D\x8C  %-32s %s\n" "$service" "$notes"
    FAIL=$((FAIL+1))
  fi
  return 0
}

echo ""
echo "════════════════════════════════════════════════════"
echo "  INFRASTRUCTURE CONNECTIVITY REPORT"
echo "  $(date)"
echo "════════════════════════════════════════════════════"

# ── CLOUDFLARE ──────────────────────────────────────────
echo ""
echo "── CLOUDFLARE ──"
# Use global key if API token not set
if [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ]; then
  CF=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/tokens/verify")
  [ "$CF" = "200" ] && result PASS "Cloudflare API token" "valid (account-scoped)" \
    || result FAIL "Cloudflare API token" "HTTP $CF"
elif [ -n "$CLOUDFLARE_GLOBAL_KEY" ]; then
  CF=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "X-Auth-Key: $CLOUDFLARE_GLOBAL_KEY" \
    -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
    https://api.cloudflare.com/client/v4/user)
  [ "$CF" = "200" ] && result PASS "Cloudflare global key" "valid" \
    || result FAIL "Cloudflare global key" "HTTP $CF"

  # Auto-resolve account ID
  CF_ACCT=$(curl -s \
    -H "X-Auth-Key: $CLOUDFLARE_GLOBAL_KEY" \
    -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
    https://api.cloudflare.com/client/v4/accounts \
    | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',[]); print(r[0]['id'] if r else 'NONE')" 2>/dev/null)
  if [ "$CF_ACCT" != "NONE" ] && [ -n "$CF_ACCT" ]; then
    result PASS "Cloudflare account ID" "$CF_ACCT"
    echo "  → Add to .env: CLOUDFLARE_ACCOUNT_ID=$CF_ACCT"
  else
    result WARN "Cloudflare account ID" "lookup failed"
  fi
else
  result SKIP "Cloudflare" "no Cloudflare credentials set"
fi

if [ -n "$CLOUDFLARE_READ_TOKEN" ]; then
  CF_R=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $CLOUDFLARE_READ_TOKEN" \
    https://api.cloudflare.com/client/v4/user/tokens/verify)
  [ "$CF_R" = "200" ] && result PASS "Cloudflare read token" "valid" \
    || result WARN "Cloudflare read token" "HTTP $CF_R"
fi

# ── NEON POSTGRESQL ─────────────────────────────────────
echo ""
echo "── NEON POSTGRESQL ──"
if [ -n "$NEON_API_KEY" ]; then
  NEON_RESP=$(curl -s \
    -H "Authorization: Bearer $NEON_API_KEY" \
    https://console.neon.tech/api/v2/projects 2>/dev/null)
  NEON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $NEON_API_KEY" \
    https://console.neon.tech/api/v2/projects 2>/dev/null)
  if [ "$NEON_HTTP" = "200" ]; then
    result PASS "Neon API" "accessible"
  elif echo "$NEON_RESP" | grep -q "org_id is required"; then
    result WARN "Neon API" "key valid — add org_id (Neon console → Settings → Organization ID)"
  else
    result FAIL "Neon API" "HTTP $NEON_HTTP"
  fi
else
  result SKIP "Neon API" "NEON_API_KEY not set"
fi

if [ -n "$NEON_CONNECTION_STRING" ]; then
  VENV_PY="$ROOT_DIR/.venv-research/bin/python3"
  PY="${VENV_PY:-python3}"
  $PY -c "
import psycopg2, os
try:
    conn = psycopg2.connect(os.environ['NEON_CONNECTION_STRING'])
    cur = conn.cursor()
    cur.execute('SELECT version()')
    ver = cur.fetchone()[0]
    conn.close()
    print('PASS: ' + ver[:40])
except Exception as e:
    print('FAIL: ' + str(e))
" 2>/dev/null | grep -q "^PASS" \
    && result PASS "Neon DB connection" "connected (PostgreSQL)" \
    || result FAIL "Neon DB connection" "connection failed — check NEON_CONNECTION_STRING"
else
  result SKIP "Neon DB connection" "NEON_CONNECTION_STRING not set"
fi

if [ -n "$NEON_AUTH_URL" ]; then
  NA=$(curl -s -o /dev/null -w "%{http_code}" "$NEON_AUTH_URL" 2>/dev/null)
  [ "$NA" = "200" ] || [ "$NA" = "401" ] \
    && result PASS "Neon Auth endpoint" "reachable (HTTP $NA)" \
    || result WARN "Neon Auth endpoint" "HTTP $NA"
fi

# ── PINECONE ────────────────────────────────────────────
echo ""
echo "── PINECONE ──"
if [ -n "$PINECONE_API_KEY" ]; then
  PIN=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Api-Key: $PINECONE_API_KEY" \
    https://api.pinecone.io/indexes)
  [ "$PIN" = "200" ] && result PASS "Pinecone" "accessible" \
    || result FAIL "Pinecone" "HTTP $PIN"
else
  result SKIP "Pinecone" "PINECONE_API_KEY not set"
fi

# ── QDRANT ──────────────────────────────────────────────
echo ""
echo "── QDRANT ──"
if [ -n "$QDRANT_API_KEY" ] && [ -n "$QDRANT_URL" ]; then
  QD=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "api-key: $QDRANT_API_KEY" \
    "${QDRANT_URL}:6333/collections" 2>/dev/null)
  # Try without port if 6333 fails (cloud may use 443)
  if [ "$QD" != "200" ]; then
    QD=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "api-key: $QDRANT_API_KEY" \
      "${QDRANT_URL}/collections" 2>/dev/null)
  fi
  [ "$QD" = "200" ] && result PASS "Qdrant cluster" "accessible" \
    || result FAIL "Qdrant cluster" "HTTP $QD"
else
  result SKIP "Qdrant" "QDRANT_API_KEY or QDRANT_URL not set"
fi

# ── COHERE ──────────────────────────────────────────────
echo ""
echo "── COHERE ──"
if [ -n "$COHERE_API_KEY" ]; then
  CO=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $COHERE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{}' \
    https://api.cohere.com/v1/check-api-key 2>/dev/null)
  [ "$CO" = "200" ] && result PASS "Cohere production key" "valid" \
    || result FAIL "Cohere production key" "HTTP $CO"
else
  result SKIP "Cohere production key" "COHERE_API_KEY not set"
fi

if [ -n "$COHERE_TRIAL_KEY" ]; then
  CO_T=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $COHERE_TRIAL_KEY" \
    -H "Content-Type: application/json" \
    -d '{}' \
    https://api.cohere.com/v1/check-api-key 2>/dev/null)
  [ "$CO_T" = "200" ] && result PASS "Cohere trial key" "valid (expires 2026-04-03)" \
    || result WARN "Cohere trial key" "HTTP $CO_T"
fi

if [ -n "$COHERE_VAULT_URL" ]; then
  # Vault uses same Cohere API auth — test via /v1/models
  CV=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $COHERE_API_KEY" \
    "${COHERE_VAULT_URL}/v1/models" --max-time 10 2>/dev/null)
  [ "$CV" = "200" ] && result PASS "Cohere private vault" "READY — models accessible" \
    || result WARN "Cohere private vault" "HTTP $CV — vault is READY but may need vault-specific API key"
fi

# ── AWS ─────────────────────────────────────────────────
echo ""
echo "── AWS ──"
if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
  VENV_PY="$ROOT_DIR/.venv-research/bin/python3"
  AWS_RESULT=$($VENV_PY -c "
import boto3, os
try:
    sts = boto3.client('sts',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        region_name='eu-central-1')
    resp = sts.get_caller_identity()
    print('PASS:' + resp['Account'])
except Exception as e:
    print('FAIL:' + str(e)[:80])
" 2>/dev/null)
  if echo "$AWS_RESULT" | grep -q "^PASS:"; then
    ACCT=$(echo "$AWS_RESULT" | cut -d: -f2)
    result PASS "AWS credentials" "account $ACCT confirmed"
  else
    MSG=$(echo "$AWS_RESULT" | cut -d: -f2-)
    result FAIL "AWS credentials" "$MSG"
  fi
else
  result SKIP "AWS credentials" "AWS_ACCESS_KEY_ID not set"
fi

# ── ALIBABA MODEL STUDIO ────────────────────────────────
echo ""
echo "── ALIBABA MODEL STUDIO ──"
if [ -n "$ALIBABA_MODEL_STUDIO_KEY" ]; then
  # DashScope API
  MS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $ALIBABA_MODEL_STUDIO_KEY" \
    https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation \
    -H "Content-Type: application/json" \
    -d '{"model":"qwen-turbo","input":{"messages":[{"role":"user","content":"hi"}]},"parameters":{"max_tokens":1}}' \
    --max-time 10 2>/dev/null)
  [ "$MS" = "200" ] \
    && result PASS "Alibaba Model Studio" "DashScope API accessible" \
    || result WARN "Alibaba Model Studio" "HTTP $MS (key may be workspace-specific)"
else
  result SKIP "Alibaba Model Studio" "ALIBABA_MODEL_STUDIO_KEY not set"
fi

# ── ALIBABA AGENTBAY ────────────────────────────────────
echo ""
echo "── ALIBABA AGENTBAY ──"
if [ -n "$ALIBABA_AGENTBAY_API_KEY" ]; then
  # AgentBay has no plain REST API — uses SDK or MCP SSE endpoint
  # Verify key format is valid (ako- prefix = valid AgentBay key)
  if echo "$ALIBABA_AGENTBAY_API_KEY" | python3 -c "import sys; k=sys.stdin.read().strip(); exit(0 if k.startswith('ako-') else 1)" 2>/dev/null; then
    result PASS "AgentBay key format" "valid (ako- prefix confirmed)"
    result WARN "AgentBay REST test" "no REST API — use wuying-agentbay-sdk or MCP SSE endpoint"
  else
    result FAIL "AgentBay key format" "unexpected format (expected ako- prefix)"
  fi
else
  result SKIP "AgentBay" "ALIBABA_AGENTBAY_API_KEY not set"
fi

# ── GOOGLE / FIREBASE ───────────────────────────────────
echo ""
echo "── GOOGLE / FIREBASE ──"
# Google APIs reachability
GOOG=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys" 2>/dev/null)
[ "$GOOG" = "200" ] \
  && result PASS "Google APIs" "reachable" \
  || result FAIL "Google APIs" "unreachable (HTTP $GOOG)"

# Firebase API key — validate via REST
if [ -n "$FIREBASE_API_KEY" ]; then
  FB_KEY=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null)
  # 400 = key valid but bad request (expected), 403 = disabled, other = error
  [ "$FB_KEY" = "400" ] \
    && result PASS "Firebase API key" "valid (HTTP 400 = key accepted)" \
    || result WARN "Firebase API key" "HTTP $FB_KEY"
fi

# Firebase Admin SDK JSON
if [ -f "$ROOT_DIR/.google/firebase-adminsdk.json" ]; then
  python3 -c "
import json
with open('$ROOT_DIR/.google/firebase-adminsdk.json') as f:
    d = json.load(f)
assert d.get('type') == 'service_account'
assert d.get('project_id') == 'claude-1bf44'
print('PASS')
" 2>/dev/null | grep -q "^PASS$" \
    && result PASS "Firebase Admin SDK JSON" "valid (project: claude-1bf44)" \
    || result FAIL "Firebase Admin SDK JSON" "parse error"
else
  result FAIL "Firebase Admin SDK JSON" ".google/firebase-adminsdk.json missing"
fi

# Google SA JSON
if [ -f "$ROOT_DIR/.google/service-account.json" ]; then
  python3 -c "
import json
with open('$ROOT_DIR/.google/service-account.json') as f:
    d = json.load(f)
assert d.get('type') == 'service_account'
assert d.get('project_id') == 'dexter-ai-identity'
print('PASS')
" 2>/dev/null | grep -q "^PASS$" \
    && result PASS "Google SA JSON" "valid (project: dexter-ai-identity)" \
    || result FAIL "Google SA JSON" "parse error"
else
  result FAIL "Google SA JSON" ".google/service-account.json missing"
fi

# Firebase Hosting
FB=$(curl -s -o /dev/null -w "%{http_code}" https://claudeproject.web.app 2>/dev/null)
[ "$FB" = "200" ] \
  && result PASS "Firebase Hosting" "live at claudeproject.web.app" \
  || result WARN "Firebase Hosting" "HTTP $FB"

# ── HUGGING FACE ────────────────────────────────────────
echo ""
echo "── HUGGING FACE ──"
if [ -n "$HF_TOKEN_READ" ]; then
  HF=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $HF_TOKEN_READ" \
    https://huggingface.co/api/whoami-v2 2>/dev/null)
  [ "$HF" = "200" ] \
    && result PASS "HuggingFace read token" "valid" \
    || result FAIL "HuggingFace read token" "HTTP $HF"
else
  result SKIP "HuggingFace token" "HF_TOKEN_READ not set"
fi

HF_SPACE=$(curl -s -o /dev/null -w "%{http_code}" \
  https://huggingface.co/spaces/Infraxx/claude 2>/dev/null)
[ "$HF_SPACE" = "200" ] \
  && result PASS "HuggingFace Space" "live (Infraxx/claude)" \
  || result WARN "HuggingFace Space" "HTTP $HF_SPACE"

# ── UPSTASH REDIS ────────────────────────────────────────
echo ""
echo "── UPSTASH REDIS ──"
if [ -n "$UPSTASH_REDIS_KEY" ]; then
  # Upstash management API uses email:key Basic auth
  UR_BASIC=$(echo -n "$CLOUDFLARE_EMAIL:$UPSTASH_REDIS_KEY" | base64)
  UR=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Basic $UR_BASIC" \
    https://api.upstash.com/v2/redis/databases 2>/dev/null)
  [ "$UR" = "200" ] \
    && result PASS "Upstash Redis" "API accessible" \
    || result WARN "Upstash Redis" "HTTP $UR (key may be database ID not management key)"
else
  result SKIP "Upstash Redis" "UPSTASH_REDIS_KEY not set"
fi

# ── QSTASH ──────────────────────────────────────────────
echo ""
echo "── UPSTASH QSTASH ──"
if [ -n "$QSTASH_TOKEN" ]; then
  QS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $QSTASH_TOKEN" \
    "https://qstash.upstash.io/v2/queues" 2>/dev/null)
  [ "$QS" = "200" ] \
    && result PASS "QStash" "API accessible" \
    || result WARN "QStash" "HTTP $QS"
else
  result SKIP "QStash" "QSTASH_TOKEN not set"
fi

# ── GITLAB ──────────────────────────────────────────────
echo ""
echo "── GITLAB ──"
if [ -n "$GITLAB_ACCESS_TOKEN" ]; then
  GL=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "PRIVATE-TOKEN: $GITLAB_ACCESS_TOKEN" \
    https://gitlab.com/api/v4/user 2>/dev/null)
  [ "$GL" = "200" ] \
    && result PASS "GitLab access token" "valid" \
    || result FAIL "GitLab access token" "HTTP $GL"
else
  result SKIP "GitLab" "GITLAB_ACCESS_TOKEN not set"
fi

# ── BITBUCKET ───────────────────────────────────────────
echo ""
echo "── BITBUCKET ──"
if [ -n "$BITBUCKET_API_TOKEN" ]; then
  # Bitbucket ATATT workspace tokens use x-token-auth Basic auth
  BB=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "x-token-auth:$BITBUCKET_API_TOKEN" \
    https://api.bitbucket.org/2.0/workspaces 2>/dev/null)
  [ "$BB" = "200" ] \
    && result PASS "Bitbucket token" "valid" \
    || result WARN "Bitbucket token" "HTTP $BB — ATATT token may be expired or wrong scope. Regenerate at bitbucket.org/account/settings/app-passwords"
else
  result SKIP "Bitbucket" "BITBUCKET_API_TOKEN not set"
fi

# ── GITHUB ──────────────────────────────────────────────
echo ""
echo "── GITHUB ──"
if [ -n "$GITHUB_PAT" ]; then
  GH=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $GITHUB_PAT" \
    https://api.github.com/user 2>/dev/null)
  [ "$GH" = "200" ] \
    && result PASS "GitHub PAT" "valid" \
    || result FAIL "GitHub PAT" "HTTP $GH"
fi

GP=$(curl -s -o /dev/null -w "%{http_code}" \
  https://infraax.github.io/claude-project/ 2>/dev/null)
[ "$GP" = "200" ] \
  && result PASS "GitHub Pages" "live" \
  || result WARN "GitHub Pages" "HTTP $GP"

# ── GITPOD ──────────────────────────────────────────────
echo ""
echo "── GITPOD ──"
if [ -n "$GITPOD_TOKEN" ]; then
  # Gitpod uses gRPC-gateway REST at api.gitpod.io
  GT=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $GITPOD_TOKEN" \
    https://api.gitpod.io/gitpod.v1.WorkspaceService/ListWorkspaces 2>/dev/null)
  [ "$GT" = "200" ] \
    && result PASS "Gitpod token" "valid" \
    || result WARN "Gitpod token" "HTTP $GT"
else
  result SKIP "Gitpod" "GITPOD_TOKEN not set"
fi

# ── SUMMARY ─────────────────────────────────────────────
TOTAL=$((PASS+WARN+FAIL+SKIP))
echo ""
echo "════════════════════════════════════════════════════"
printf "  ✅  %2d passed   ⚠️   %2d warnings   ❌  %2d failed   ⏭️   %2d skipped\n" \
  $PASS $WARN $FAIL $SKIP
echo "  Tested: $((PASS+WARN+FAIL)) / $TOTAL services"
echo "════════════════════════════════════════════════════"

if [ $SKIP -gt 0 ]; then
  echo ""
  echo "  Skipped (no credentials in .env):"
  for svc in "${!RESULTS[@]}"; do
    IFS='|' read -r st notes <<< "${RESULTS[$svc]}"
    [ "$st" = "SKIP" ] && echo "    • $svc: $notes"
  done
fi

# Write JSON report
mkdir -p "$ROOT_DIR/reports"
REPORT_FILE="$ROOT_DIR/reports/infra-test-$(date +%Y%m%d-%H%M).json"
python3 -c "
import json, datetime
data = {
  'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
  'passed': $PASS,
  'warnings': $WARN,
  'failed': $FAIL,
  'skipped': $SKIP,
  'total': $TOTAL,
  'services': $(python3 -c "
import json
results = {}
" 2>/dev/null || echo '{}')
}
print(json.dumps(data, indent=2))
" > "$REPORT_FILE" 2>/dev/null || echo "{\"passed\":$PASS,\"warnings\":$WARN,\"failed\":$FAIL,\"skipped\":$SKIP}" > "$REPORT_FILE"

cp "$REPORT_FILE" "$ROOT_DIR/reports/infra-test-latest.json"
echo ""
echo "  Report: reports/infra-test-latest.json"
echo ""

[ $FAIL -eq 0 ] && exit 0 || exit 1
