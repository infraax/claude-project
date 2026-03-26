# 01 — RESEARCH DOWNLOAD & ENVIRONMENT SETUP
## Phase 1: Acquire All Reference Material

> **Checkpoint ID:** `phase1_research_download`
> **Prerequisite:** None — this is always the first phase
> **Estimated tokens:** Low — mostly shell commands

---

## Step 1.1 — Create Research Directory

```bash
mkdir -p ~/claude-project-research/papers
mkdir -p ~/claude-project-research/repos
mkdir -p ~/claude-project-research/benchmarks
cd ~/claude-project-research
```

Write to AGENT_STATE.md: `step_1_1_complete: true`

---

## Step 1.2 — Download Research Papers

Download each paper as PDF. Use `curl -L` for arxiv links.
If a download fails, note it in AGENT_STATE.md and continue — do not block on one paper.

### Core Papers (Required)

```bash
# CodeAgents: Typed pseudocode inter-agent communication (55-87% token reduction)
curl -L "https://arxiv.org/pdf/2507.03254.pdf" -o papers/codeagents_2507.03254.pdf

# CodeAct: Executable code actions for LLM agents
curl -L "https://arxiv.org/pdf/2402.01030.pdf" -o papers/codeact_2402.01030.pdf

# CaveAgent: Dual-stream stateful runtime for LLMs
curl -L "https://arxiv.org/pdf/2601.01569.pdf" -o papers/caveagent_2601.01569.pdf

# Anka DSL: Domain-specific language for reliable LLM code generation
curl -L "https://arxiv.org/pdf/2512.23214.pdf" -o papers/anka_dsl_2512.23214.pdf

# LLMLingua-2: Token-level prompt compression
curl -L "https://arxiv.org/pdf/2403.12968.pdf" -o papers/llmlingua2_2403.12968.pdf

# How Different Tokenization Algorithms Impact LLMs
curl -L "https://arxiv.org/pdf/2511.03825.pdf" -o papers/tokenization_impact_2511.03825.pdf

# Beyond Self-Talk: Communication-Centric Survey of LLM Multi-Agent Systems
curl -L "https://arxiv.org/pdf/2502.14321.pdf" -o papers/multiagent_survey_2502.14321.pdf
```

### Protocol Papers (Required)

```bash
# Agora protocol
curl -L "https://arxiv.org/pdf/2501.00003.pdf" -o papers/agora_protocol.pdf || \
  echo "WARN: Agora PDF not at this URL — check agent-network-protocol.com/paper"

# ANP (Agent Network Protocol) specification
curl -L "https://agent-network-protocol.com/papers/anp-spec.pdf" -o papers/anp_spec.pdf || \
  echo "WARN: ANP spec PDF not found — note in AGENT_STATE.md"

# LACP: LLM Agent Communication Protocol
curl -L "https://arxiv.org/pdf/2504.15854.pdf" -o papers/lacp_2504.15854.pdf

# LDP: LLM Delegate Protocol
curl -L "https://arxiv.org/pdf/2505.00001.pdf" -o papers/ldp_protocol.pdf || \
  echo "WARN: LDP PDF URL uncertain — note in AGENT_STATE.md"
```

### Supplementary Papers (Download if possible, not blocking)

```bash
# CaveAgent extended version
curl -L "https://arxiv.org/pdf/2601.01569v3.pdf" -o papers/caveagent_v3.pdf

# CodeAgent: Tool-integrated code generation
curl -L "https://arxiv.org/pdf/2401.07339.pdf" -o papers/codeagent_2401.07339.pdf

# Chain of Agents: LLMs collaborating on long-context tasks
curl -L "https://arxiv.org/pdf/2406.02818.pdf" -o papers/chain_of_agents.pdf

# Agentic Plan Caching
curl -L "https://arxiv.org/pdf/2504.09823.pdf" -o papers/plan_caching.pdf || \
  echo "WARN: Plan caching paper URL uncertain"
```

Write to AGENT_STATE.md: `step_1_2_papers_downloaded: true` with list of any failures.

---

## Step 1.3 — Clone Reference Repositories

```bash
cd ~/claude-project-research/repos

# Agora reference implementation
git clone --depth=1 https://github.com/agora-protocol/agora.git || \
  echo "WARN: Agora repo URL may differ — check agent-network-protocol.com/github"

# ANP reference implementation
git clone --depth=1 https://github.com/agent-network-protocol/python-sdk.git anp-sdk || \
  echo "WARN: ANP SDK repo not found"

# LLMLingua: Microsoft prompt compression
git clone --depth=1 https://github.com/microsoft/LLMLingua.git

# CaveAgent reference implementation
git clone --depth=1 https://github.com/acodercat/cave-agent.git || \
  echo "WARN: CaveAgent repo URL uncertain — check arxiv paper for GitHub link"

# TOON: Token-Oriented Object Notation
git clone --depth=1 https://github.com/toon-format/toon.git

# claude-code-mcp-enhanced: MCP orchestration reference
git clone --depth=1 https://github.com/grahama1970/claude-code-mcp-enhanced.git
```

Write to AGENT_STATE.md: `step_1_3_repos_cloned: true` with list of any failures.

---

## Step 1.4 — Install Python Dependencies

```bash
cd /path/to/claude-project   # adjust to actual repo path
python3 -m venv .venv-research
source .venv-research/bin/activate

pip install mcp fastmcp
pip install llmlingua
pip install lancedb
pip install kuzu
pip install sqlite-utils
pip install sentence-transformers
pip install toon-format || pip install git+https://github.com/toon-format/toon.git
pip install anthropic>=0.40.0
pip install pandas numpy scipy

pip freeze > requirements-research.txt
```

Write to AGENT_STATE.md: `step_1_4_python_deps: true`

---

## Step 1.5 — Install Node Dependencies

```bash
cd /path/to/claude-project
npm install

npm run build 2>&1 | tail -5
npx vitest run 2>&1 | tail -10
```

Record build status and test results in AGENT_STATE.md under `step_1_5_node_build`.
If tests fail before any changes, record exact failures — this is your baseline.

---

## Step 1.6 — Verify Anthropic API Key Returns Cache Fields

```python
# Save as ~/claude-project-research/verify_cache_fields.py
import anthropic, json

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=10,
    system=[{"type": "text", "text": "You are a test assistant.", "cache_control": {"type": "ephemeral"}}],
    messages=[{"role": "user", "content": "Say hi"}]
)
print(json.dumps({
    "input_tokens": response.usage.input_tokens,
    "output_tokens": response.usage.output_tokens,
    "cache_creation_input_tokens": getattr(response.usage, "cache_creation_input_tokens", "MISSING"),
    "cache_read_input_tokens": getattr(response.usage, "cache_read_input_tokens", "MISSING"),
}, indent=2))
```

```bash
python3 ~/claude-project-research/verify_cache_fields.py
```

Expected: both cache fields present (even if 0).
If `MISSING` appears — note in AGENT_STATE.md, Phase 4 measurement will need adjustment.

Write to AGENT_STATE.md: `step_1_6_api_cache_fields_verified: true/false`

---

## Completion Checkpoint

```bash
ls ~/claude-project-research/papers/ | wc -l   # should be >= 6
ls ~/claude-project-research/repos/ | wc -l    # should be >= 4
python3 -c "import llmlingua, lancedb, kuzu; print('OK')"
npm run build
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase1_complete",
  "papers_downloaded": N,
  "repos_cloned": N,
  "python_deps_ok": true,
  "node_build_ok": true,
  "api_cache_fields": true,
  "baseline_test_failures": []
}
```

**Then read: `02_CODEBASE_AUDIT.md`**
```

***

Say **"next"** for `02_CODEBASE_AUDIT.md`.

Bronnen


## `02_CODEBASE_AUDIT.md`

```markdown