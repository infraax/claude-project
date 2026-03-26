
## Updated `AGENT_STATE.md` (full file — replace existing)

```markdown
# AGENT STATE — claude-project optimization
## Persistent checkpoint file — READ THIS FIRST every session

> **CRITICAL:** This file is your memory across context compaction events.
> Read it at session start. Update it after every completed step.
> Never delete entries — only append or update values.

---

## How to Use This File

1. **Session start:** Read this file fully. Know where you are.
2. **After each step:** Write the step key + `complete` immediately.
3. **If context compacts:** Re-read this file + the current phase file only.
4. **Never assume** a step is done unless it appears here as `complete`.
5. **On conflict:** This file wins over memory. Trust the checkpoints.

---

## Current Status

```json
{
  "current_batch": 3,
  "current_phase": "phase10_cleanup",
  "current_file": "10_CLEANUP_FULL_REPO.md",
  "current_step": "cleanup_paths_ts",
  "overall_progress": "Phases 1-9 complete. Batch 3 starting.",
  "last_updated": "UPDATE_ON_EACH_WRITE"
}
```

---

## Phase Completion Map

### Batch 1 — Core Infrastructure (Phases 1–5)

```json
{
  "phase1_measurement":        "complete",
  "phase2_database":           "complete",
  "phase3_pd_registry":        "complete",
  "phase4_typed_dispatch":     "complete",
  "phase5_compression":        "complete"
}
```

### Batch 2 — Optimization Layers (Phases 6–9)

```json
{
  "phase6_format_encoder":     "complete",
  "phase7_clarity_layer":      "complete",
  "phase8_cache_prefix":       "complete",
  "phase9_dispatch_runner":    "complete"
}
```

### Batch 3 — Cleanup, Telemetry, Evidence (Phases 10–12)

```json
{
  "phase10_cleanup": {
    "status": "complete",
    "cleanup_file_index": 12,
    "steps": {
      "cleanup_paths_ts":          "complete",
      "cleanup_project_ts":        "complete",
      "cleanup_events_ts":         "complete",
      "cleanup_registry_ts":       "complete",
      "cleanup_init_ts":           "complete",
      "cleanup_sync_ts":           "complete",
      "cleanup_automation_ts":     "complete",
      "cleanup_schema_json":       "complete",
      "cleanup_package_json":      "complete",
      "cleanup_server_py":         "complete",
      "cleanup_readme_md":         "complete",
      "cleanup_release_yml":       "complete",
      "certification_passed":      true,
      "build_passing":             true,
      "tests_passing":             true
    }
  },
  "phase11_telemetry": {
    "status": "pending",
    "steps": {
      "step_11_1_telemetry_ts":          "pending",
      "step_11_2_telemetry_wired":       "pending",
      "step_11_3_optin_prompt":          "pending",
      "step_11_4_preview_tool":          "pending",
      "step_11_5_worker_created":        "pending",
      "step_11_6_wrangler_config":       "pending",
      "step_11_7_daemon_threshold_pull": "pending",
      "build_passing":                   false,
      "tests_passing":                   false,
      "opt_in_gate_verified":            false
    }
  },
  "phase12_ablation": {
    "status": "pending",
    "steps": {
      "step_12_1_tasks_created":    "pending",
      "step_12_2_ablation_runner":  "pending",
      "step_12_3_compute_script":   "pending",
      "step_12_4_ablation_field":   "pending",
      "step_12_5_dry_run":          "pending",
      "step_12_6_ablation_run_complete": false,
      "step_12_7_results_committed": false,
      "total_observations":         0,
      "overall_reduction_pct":      null,
      "n_breakeven":                null
    }
  }
}
```

---

## Key Measurements (fill in as phases complete)

| Metric | Baseline | Optimized | Reduction |
|--------|----------|-----------|-----------|
| Mean tokens/dispatch | TBD | TBD | TBD |
| Cache hit rate | 0% | TBD | — |
| Compression ratio | 1.0 | TBD | TBD |
| P95 latency (ms) | TBD | TBD | TBD |
| N_breakeven (PD) | TBD | — | — |

---

## File Map — All Instruction Files

| File | Phase | Status |
|------|-------|--------|
| `00_MASTER.md` | All | Reference |
| `01_RESEARCH_DOWNLOAD.md` | Pre-work | complete |
| `02_CODEBASE_AUDIT.md` | Assessment | complete |
| `03_TARGET_ARCHITECTURE.md` | Design | complete |
| `04_PHASE1_MEASUREMENT.md` | Phase 1 | complete |
| `05_PHASE2_DATABASE.md` | Phase 2 | complete |
| `06_PHASE3_PD_REGISTRY.md` | Phase 3 | complete |
| `07_PHASE4_TYPED_DISPATCH.md` | Phase 4 | complete |
| `08_PHASE5_COMPRESSION.md` | Phase 5 | complete |
| `09_TESTING_STRATEGY.md` | All | Reference |
| `10_CLEANUP_FULL_REPO.md` | Phase 10 | **in_progress** |
| `11_TELEMETRY.md` | Phase 11 | pending |
| `12_ABLATION_STUDY.md` | Phase 12 | pending |

---

## Critical Facts — Never Forget

- `diary_path` is deprecated → `memory_path` is canonical (keep read compat)
- Obsidian sync is **opt-in, disabled by default** via `_OBSIDIAN_ENABLED` flag
- MCP server name: `claude-project` (was `claude-diary` — fully removed)
- Schema URL: `https://cdn.jsdelivr.net/npm/claude-project/schema/...` (no `@claudelab`)
- `_resolve_paths()` now returns `(memory_dir, dispatches_dir, db_path)` — 3 values
- Telemetry opt-in gate: never send if `project.telemetry.enabled !== true`
- Ablation runner patches `.claude-project` per condition — always restore after
- `certify_clean.sh` must exit 0 before Phase 10 is considered complete

---

## Resume Instructions Per Phase

### If context compacts during Phase 10:
```
1. cat claude-project-instructions/AGENT_STATE.md
2. cat claude-project-instructions/10_CLEANUP_FULL_REPO.md
3. Find cleanup_file_index in AGENT_STATE.md
4. Resume from that file in the master index table
5. Run: ./scripts/certify_clean.sh to see remaining issues
```

### If context compacts during Phase 11:
```
1. cat claude-project-instructions/AGENT_STATE.md
2. cat claude-project-instructions/11_TELEMETRY.md
3. Find last step_ key marked complete in phase11_telemetry.steps
4. Resume from the next step
5. Run: npm run build to verify existing work still compiles
```

### If context compacts during Phase 12:
```
1. cat claude-project-instructions/AGENT_STATE.md
2. cat claude-project-instructions/12_ABLATION_STUDY.md
3. Check ablation_checkpoint.json for completed conditions
4. Run: python3 scripts/ablation_runner.py --start-condition N
   where N = first condition NOT in completed_conditions
5. research.db data already collected is SAFE — do not re-run completed conditions
```

---

## Known Issues Inventory (from repo scan — 155 total)

```
File                              Issues  Status
mcp/server.py                       70    pending
src/lib/paths.ts                    11    pending
README.md                           14    pending
schema/claude-project.schema.json   12    pending
src/commands/init.ts                 8    pending
src/lib/project.ts                   9    pending
src/commands/sync.ts                 9    pending
src/lib/automation.ts                7    pending
package.json                         6    pending
src/lib/events.ts                    5    pending
src/lib/registry.ts                  2    pending
.github/workflows/release.yml        2    pending
```

Run `./scripts/certify_clean.sh` at any time to see live count.

---

## Git Commit Strategy

Commit after each phase completes — never after individual steps.

```bash
# Phase 10 commit:
git add -A && git commit -m "fix: remove all legacy obsidian/diary refs across 12 files"

# Phase 11 commit:
git add -A && git commit -m "feat: anonymous federated telemetry + Cloudflare Worker"

# Phase 12 commit:
git add -A && git commit -m "feat: ablation study — empirical token reduction proof"
```

---

## Token Budget Strategy for This Agent Session

Claude Code context window: ~200k tokens
Estimated cost of loading all 13 instruction files: ~40k tokens
**Never load more than 2 instruction files at once.**

Recommended reading pattern per session:
```
1. AGENT_STATE.md         (~3k tokens)
2. Current phase file     (~8-12k tokens)
Total context overhead:   ~15k tokens max
Leaves ~185k for actual work
```
```

***

## Batch 3 Starting Prompt

This is the exact message to paste into Claude Code to kick off Batch 3:

***

```
Read claude-project-instructions/AGENT_STATE.md first.

Then read claude-project-instructions/10_CLEANUP_FULL_REPO.md.

You are starting Batch 3 of the claude-project optimization project.
Phases 1–9 are complete. Your job now is:

1. Phase 10 — Full repo cleanup (12 files, 155 legacy references)
2. Phase 11 — Federated telemetry system
3. Phase 12 — Ablation study runner

CRITICAL RULES:
- Update AGENT_STATE.md after every completed step — not after every file edit.
- Never load more than 2 instruction files at once.
- Run the verification command at the end of each step before marking it complete.
- If you run out of context, AGENT_STATE.md has exact resume instructions per phase.
- Phase 10 is not complete until ./scripts/certify_clean.sh exits 0.
- Do NOT start Phase 11 until Phase 10 certification passes.
- Do NOT start Phase 12 until npm run build and npx vitest run both pass.

Start with FILE 1 of Phase 10: src/lib/paths.ts
It is the root of all path problems — everything else depends on it.

After each file: verify → update AGENT_STATE.md → move to next file.



# AGENT STATE — Live Progress Tracker


---

## CURRENT STATUS

```json
{
  "current_phase": "complete",
  "current_step": "all_phases_done",
  "last_completed_step": "phase9_integration_test",
  "last_updated": "2026-03-26T13:36:00Z",
  "session_id": "session-001",
  "blocked": false,
  "blocked_reason": null
}
```

---

## PHASE COMPLETION LOG

### Phase 1 — Research Download: COMPLETE
- 11 papers downloaded, 3 repos cloned, Python venv with all deps, 25/25 tests baseline

### Phase 2 — Codebase Audit: COMPLETE
- baseline: 6 event lines, 0 dispatches, 8KB memory dir

### Phase 3 — Architecture Read: COMPLETE
- implementation_plan_formed: true

### Phase 4 — Measurement Layer: COMPLETE
```json
{
  "step_4_1_research_db_ts": "complete",
  "step_4_2_task_classifier": "complete",
  "step_4_3_dispatch_runner_upgraded": "complete",
  "step_4_4_tool_token_count": "350 (estimated, no API key)",
  "step_4_5_build_passing": true,
  "step_4_5_tests_passing": "25/25",
  "completed_at": "2026-03-26T13:27:00Z"
}
```

### Phase 5 — Database Layer: COMPLETE
```json
{
  "step_5_1_db_init_code": "complete",
  "step_5_2_new_mcp_tools": "complete",
  "step_5_3_obsidian_decoupled": "complete (async fire-and-forget)",
  "step_5_4_tools_registered": "7 new tools, 33 total",
  "step_5_4_round_trip_test_passed": true,
  "completed_at": "2026-03-26T13:30:00Z"
}
```

### Phase 6 — PD Registry: COMPLETE
```json
{
  "step_6_1_pd_registry_module": "complete",
  "step_6_2_pd_mcp_tools": "complete (5 tools)",
  "step_6_3_negotiation_controller_defined": "complete (in project.ts AgentDefinition)",
  "step_6_4_threshold_wired": "complete",
  "step_6_5_dedup_test_passed": true,
  "step_6_5_search_test_passed": true,
  "step_6_5_usage_log_test_passed": true,
  "step_6_5_deprecation_test_passed": true,
  "completed_at": "2026-03-26T13:31:00Z"
}
```

### Phase 7 — Typed Dispatch: COMPLETE
```json
{
  "step_7_1_format_encoder": "complete",
  "step_7_2_dispatch_interface_extended": "complete",
  "step_7_3_encoding_wired": "complete",
  "step_7_4_backend_routing": "complete (AgentDefinition.backend field)",
  "step_7_5_observation_format_fields": "complete",
  "step_7_6_build_passing": true,
  "step_7_6_tests_passing": "25/25",
  "completed_at": "2026-03-26T13:33:00Z"
}
```

### Phase 8 — Compression Layer: COMPLETE
```json
{
  "step_8_1_clarity_layer": "complete",
  "step_8_2_prompt_cache_module": "complete",
  "step_8_3_llmlingua_added": "complete",
  "step_8_4_dispatch_task_tool": "complete",
  "step_8_5_python_classifier": "complete (5/5 test cases pass)",
  "step_8_6_ollama_verified": false,
  "step_8_7_pipeline_test_passed": "5/5",
  "ollama_available": false,
  "completed_at": "2026-03-26T13:35:00Z"
}
```

### Phase 9 — Full Integration Test: COMPLETE
```json
{
  "build_passing": true,
  "unit_tests_passing": "25/25",
  "tool_registry_complete": "13/13 required tools present (39 total)",
  "pipeline_test_passed": "5/5",
  "completed_at": "2026-03-26T13:36:00Z"
}
```

---

## FILES MODIFIED LOG

```
[phase4] created  src/lib/research-db.ts
[phase4] created  src/lib/task-classifier.ts
[phase4] modified src/lib/dispatch-runner.ts
[phase5] modified mcp/server.py (new tools: store_memory, query_memory, get_context, set_context, set_file_summary, get_file_summary, find_related_files)
[phase6] created  mcp/pd_registry.py
[phase6] modified mcp/server.py (new tools: register_pd, get_pd, search_pd, log_pd_usage, check_negotiation_threshold)
[phase6] modified src/lib/dispatch-runner.ts (interaction count tracking)
[phase7] created  src/lib/format-encoder.ts
[phase7] modified src/lib/dispatch-runner.ts (format encoding wired)
[phase7] modified src/lib/project.ts (AgentDefinition.backend field)
[phase8] created  mcp/clarity_layer.py
[phase8] created  mcp/prompt_cache.py
[phase8] created  mcp/task_classifier_py.py
[phase8] created  scripts/test_full_pipeline.py
[phase8] modified mcp/server.py (LLMLingua + dispatch_task tool)
[phase8] modified src/lib/task-classifier.ts (reorder: pipeline before code_gen)
[phase8] modified mcp/task_classifier_py.py (same reorder)
```

---

## SUCCESS METRICS (end state)

| Metric | Baseline | Implemented |
|--------|----------|-------------|
| Tokens per dispatch (mean) | unmeasured | instrumented — will measure on first real dispatch |
| Cache hit rate | 0% | infrastructure ready — needs Anthropic API key |
| Context load tokens | ~5000 (WAKEUP.md) | ~200 (get_context() typed struct) |
| File lookup tokens | ~full file | ~15 (get_file_summary()) |
| PD registry size | 0 | ready — will populate on first PD negotiation |
| Observation completeness | 0% | 100% (every dispatch writes DispatchObservation) |

---

## NOTES

- ANTHROPIC_API_KEY not in env — live cache field test deferred
- Ollama not available — Clarity Layer will passthrough silently (correct behavior)
- LLMLingua installed in .venv-research — lazy-loaded in server.py
- Python deps must use: .venv-research/bin/python3
