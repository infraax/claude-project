# 09 — TESTING STRATEGY
## Phase-by-Phase Verification, Success Criteria & Rollback

> **Checkpoint ID:** `phase9_testing`
> **Role:** Reference throughout all phases — not a one-time read
> **Return here:** After every phase completes AND after any unexpected failure

---

## Testing Philosophy

Each phase must be independently verifiable before the next starts.
A phase is only "complete" when ALL of the following are true:
1. Build passes (`npm run build`)
2. Existing tests pass (`npx vitest run`)
3. Phase-specific verification script passes (defined below)
4. AGENT_STATE.md checkpoint written

**Never mark a phase complete on build alone.**

---

## Phase 1 — Research Download Verification

```bash
# Minimum viable: 6 papers + 4 repos + 3 Python packages
echo "=== Papers ===" && ls ~/claude-project-research/papers/*.pdf | wc -l
echo "=== Repos ===" && ls ~/claude-project-research/repos/ | wc -l
echo "=== Python ===" && python3 -c "import llmlingua, lancedb, kuzu; print('OK')"
echo "=== Node ===" && npm run build 2>&1 | tail -3
echo "=== API Cache Fields ===" && python3 ~/claude-project-research/verify_cache_fields.py
```

**Pass criteria:**
- Papers >= 6
- Repos >= 4
- Python: prints `OK`
- Node build: exits 0
- API: no `MISSING` fields

---

## Phase 2 — Codebase Audit Verification

No code was changed. Verify audit understanding:

```bash
# Baseline metrics must be recorded in AGENT_STATE.md
python3 -c "
import json
state = json.load(open('AGENT_STATE.md'))  # or parse YAML
assert 'baseline_metrics' in state, 'baseline_metrics missing from AGENT_STATE'
print('Audit checkpoint OK')
"
```

**Pass criteria:** AGENT_STATE.md contains `baseline_metrics` block with at least one non-null value.

---

## Phase 3 — Architecture Read Verification

No code was changed. Verify plan is formed:

```bash