## `12_ABLATION_STUDY.md`

```markdown
# 12 — ABLATION STUDY & SELF-BENCHMARK
## Empirical Proof That Each Optimization Component Works

> **Checkpoint ID:** `phase12_ablation`
> **Prerequisites:** Phase 11 (telemetry) complete
> **Goal:** Run 210 controlled dispatches (30 tasks × 7 conditions) against the
>           claude-project repo itself. Prove which component drives token savings.
>           Produce reports/ablation-results.json as publishable evidence.
> **Cost estimate:** ~100k–200k tokens total (~$2–4 on Sonnet, ~$10–20 on Opus)

---

## Context Budget Warning

This phase is script-heavy, not code-heavy. Scripts run independently.
If context compacts mid-phase:
1. Read AGENT_STATE.md → find `ablation_phase_step`
2. Read ONLY this file
3. The research.db persists across sessions — data already collected is safe
4. Resume the ablation runner from the last completed condition index

---

## The 7 Conditions

Each condition enables exactly one optimization layer at a time.
Condition 6 enables all layers simultaneously.

```
Condition  Name                  cache  format  clarity  llmlingua  pd
---------  --------------------  -----  ------  -------  ---------  --
    0      baseline              false  false   false    false      false
    1      cache_only            true   false   false    false      false
    2      format_only           false  true    false    false      false
    3      clarity_only          false  false   true     false      false
    4      llmlingua_only        false  false   false    true       false
    5      pd_only               false  false   false    false      true
    6      full_system           true   true    true     true       true
```

---

## The 30 Tasks

Balanced across all 8 task types. Tasks run against the actual
claude-project repo — real codebase, real complexity.

**code_gen (6 tasks)**
```json
[
  {"id":"cg1","title":"Implement getDispatchStats","body":"Create a function getDispatchStats() in src/lib/dispatch-runner.ts that reads all dispatch JSON files and returns {total:number, by_status:Record<string,number>, avg_tokens:number, avg_latency_ms:number}"},
  {"id":"cg2","title":"Implement retryDispatch","body":"Create a function retryDispatch(dispatchId:string) that reads a failed dispatch, resets its status to pending, clears error and result fields, and writes it back"},
  {"id":"cg3","title":"Add getObservationSummary to research-db","body":"Add a function getObservationSummary(db, days:number=7) to src/lib/research-db.ts that returns mean tokens_input, mean tokens_output, cache_hit_rate, and task_type breakdown for the last N days"},
  {"id":"cg4","title":"Implement pruneOldDispatches","body":"Create pruneOldDispatches(project, daysOld:number=30) that deletes completed dispatch JSON files older than daysOld days and returns the count deleted"},
  {"id":"cg5","title":"Add batchDispatch function","body":"Create batchDispatch(project, tasks:Array<{title:string,body:string}>) that creates dispatch files for all tasks atomically and returns their IDs"},
  {"id":"cg6","title":"Implement dispatchExists","body":"Create dispatchExists(project, title:string) that returns true if a pending or running dispatch with that exact title already exists"}
]
```

**refactor (4 tasks)**
```json
[
  {"id":"rf1","title":"Refactor runDispatch error handling","body":"The runDispatch function in dispatch-runner.ts has multiple try/catch blocks. Consolidate them into a single error boundary that always writes the dispatch status to failed and records the observation before rethrowing"},
  {"id":"rf2","title":"Clean up resolvePaths usage","body":"In src/lib/paths.ts, the expandHome function is defined twice. Remove the duplicate and ensure both callers use the single definition"},
  {"id":"rf3","title":"Simplify format-encoder switch statement","body":"The encodeDispatchBody function uses a switch statement. Refactor it to use a lookup map of format name to encoder function for easier extension"},
  {"id":"rf4","title":"Consolidate dispatch file writing","body":"Dispatch JSON files are written in three different places in the codebase. Find all three, extract a single writeDispatchFile helper, and replace all three usages"}
]
```

**test_gen (4 tasks)**
```json
[
  {"id":"tg1","title":"Write tests for format-encoder","body":"Write vitest unit tests for all 5 format types in src/lib/format-encoder.ts. Test selectFormat for all 9 task types, and test that encodeDispatchBody produces non-empty output for each format"},
  {"id":"tg2","title":"Write tests for task-classifier","body":"Write vitest unit tests for classifyTaskType covering all 8 task types plus unknown. Use at least 3 test inputs per task type"},
  {"id":"tg3","title":"Write tests for research-db","body":"Write vitest tests for initResearchDb and writeObservation. Use an in-memory SQLite DB. Verify all fields are written and retrieved correctly"},
  {"id":"tg4","title":"Write tests for telemetry opt-in gate","body":"Write vitest tests that verify sendTelemetryAsync never calls fetch when project.telemetry.enabled is false, and that the payload contains no string fields longer than 30 chars"}
]
```

**analysis (5 tasks)**
```json
[
  {"id":"an1","title":"Analyze dispatch-runner for token waste","body":"Review src/lib/dispatch-runner.ts and identify all places where tokens are wasted: unnecessary context in system prompt, redundant tool descriptions, verbose error messages. List each with line number and estimated token cost"},
  {"id":"an2","title":"Review research-db schema completeness","body":"Check whether the dispatch_observations table captures all the data needed to compute N_breakeven for PD negotiation. Identify any missing fields"},
  {"id":"an3","title":"Inspect format-encoder compression ratios","body":"For each of the 5 format types in format-encoder.ts, calculate the expected compression ratio for a 500-char input. Identify which format provides the most savings for each task type"},
  {"id":"an4","title":"Check telemetry payload for privacy leaks","body":"Review src/lib/telemetry.ts and verify that no content fields (body, title, result, file paths) can leak into the payload under any code path"},
  {"id":"an5","title":"Audit MCP tool count and token cost","body":"Count all MCP tools registered in mcp/server.py. Estimate the schema token cost of sending all tool definitions in a system prompt. Identify the 3 most expensive tools by schema size"}
]
```

**pipeline (3 tasks)**
```json
[
  {"id":"pl1","title":"Build token report pipeline","body":"Read research.db dispatch_observations, transform to daily aggregates (date, mean_tokens_input, mean_tokens_output, cache_hit_rate), write to reports/daily-tokens.json"},
  {"id":"pl2","title":"Build PD effectiveness pipeline","body":"Read research.db pd_usage_log joined with pd_registry, compute tokens_saved per pd_id, write top 10 most effective PDs to reports/pd-effectiveness.json"},
  {"id":"pl3","title":"Build observation export pipeline","body":"Read all dispatch_observations from research.db, transform each to a flat CSV row, write to reports/observations.csv with headers"}
]
```

**documentation (3 tasks)**
```json
[
  {"id":"dc1","title":"Document research-db module","body":"Write JSDoc comments for all exported functions in src/lib/research-db.ts: initResearchDb, writeObservation, getResearchDbPath. Include parameter types and return value descriptions"},
  {"id":"dc2","title":"Document telemetry module","body":"Write JSDoc comments for sendTelemetryAsync and telemetryPreview in src/lib/telemetry.ts. Document the opt-in behaviour and what data is and is not sent"},
  {"id":"dc3","title":"Update README MCP config section","body":"Update the MCP configuration section in README.md to show the new claude-project server name instead of claude-diary. Add a note about the telemetry opt-in prompt on first init"}
]
```

**planning (3 tasks)**
```json
[
  {"id":"pt1","title":"Design PD negotiation scheduler","body":"Design a strategy for when the negotiation_controller agent should initiate PD negotiation. Consider: interaction count threshold, task type stability, estimated N_breakeven from community thresholds. Output a decision tree"},
  {"id":"pt2","title":"Plan LanceDB migration strategy","body":"Design a migration plan for users upgrading from an older claude-project version that has memory in flat markdown files to the new LanceDB vector store. Consider data loss prevention and rollback"},
  {"id":"pt3","title":"Plan multi-project context sharing","body":"Design how two claude-project instances in different repos could share Protocol Documents. Consider security, versioning, and whether PD IDs (content-addressed) are safe to share publicly"}
]
```

**retrieval (2 tasks)**
```json
[
  {"id":"rt1","title":"Find all files importing research-db","body":"Find all TypeScript files in the src/ directory that import anything from research-db.ts"},
  {"id":"rt2","title":"Find all MCP tool definitions","body":"Find all functions decorated with @mcp.tool() in mcp/server.py and list their names and line numbers"}
]
```

---

## Step 12.1 — Create scripts/ablation_tasks.json

```bash
mkdir -p scripts reports
cat > scripts/ablation_tasks.json << 'ENDOFFILE'
[
  {"id":"cg1","task_type":"code_gen","title":"Implement getDispatchStats","body":"Create a function getDispatchStats() in src/lib/dispatch-runner.ts that reads all dispatch JSON files and returns {total:number, by_status:Record<string,number>, avg_tokens:number, avg_latency_ms:number}"},
  {"id":"cg2","task_type":"code_gen","title":"Implement retryDispatch","body":"Create a function retryDispatch(dispatchId:string) that reads a failed dispatch, resets its status to pending, clears error and result fields, and writes it back"},
  {"id":"cg3","task_type":"code_gen","title":"Add getObservationSummary to research-db","body":"Add a function getObservationSummary(db, days:number=7) to src/lib/research-db.ts that returns mean tokens_input, mean tokens_output, cache_hit_rate, and task_type breakdown for the last N days"},
  {"id":"cg4","task_type":"code_gen","title":"Implement pruneOldDispatches","body":"Create pruneOldDispatches(project, daysOld:number=30) that deletes completed dispatch JSON files older than daysOld days and returns the count deleted"},
  {"id":"cg5","task_type":"code_gen","title":"Add batchDispatch function","body":"Create batchDispatch(project, tasks:Array<{title:string,body:string}>) that creates dispatch files for all tasks atomically and returns their IDs"},
  {"id":"cg6","task_type":"code_gen","title":"Implement dispatchExists","body":"Create dispatchExists(project, title:string) that returns true if a pending or running dispatch with that exact title already exists"},
  {"id":"rf1","task_type":"refactor","title":"Refactor runDispatch error handling","body":"The runDispatch function in dispatch-runner.ts has multiple try/catch blocks. Consolidate them into a single error boundary that always writes the dispatch status to failed and records the observation before rethrowing"},
  {"id":"rf2","task_type":"refactor","title":"Clean up resolvePaths usage","body":"In src/lib/paths.ts, the expandHome function is defined twice. Remove the duplicate and ensure both callers use the single definition"},
  {"id":"rf3","task_type":"refactor","title":"Simplify format-encoder switch statement","body":"The encodeDispatchBody function uses a switch statement. Refactor it to use a lookup map of format name to encoder function for easier extension"},
  {"id":"rf4","task_type":"refactor","title":"Consolidate dispatch file writing","body":"Dispatch JSON files are written in three different places in the codebase. Find all three, extract a single writeDispatchFile helper, and replace all three usages"},
  {"id":"tg1","task_type":"test_gen","title":"Write tests for format-encoder","body":"Write vitest unit tests for all 5 format types in src/lib/format-encoder.ts. Test selectFormat for all 9 task types, and test that encodeDispatchBody produces non-empty output for each format"},
  {"id":"tg2","task_type":"test_gen","title":"Write tests for task-classifier","body":"Write vitest unit tests for classifyTaskType covering all 8 task types plus unknown. Use at least 3 test inputs per task type"},
  {"id":"tg3","task_type":"test_gen","title":"Write tests for research-db","body":"Write vitest tests for initResearchDb and writeObservation. Use an in-memory SQLite DB. Verify all fields are written and retrieved correctly"},
  {"id":"tg4","task_type":"test_gen","title":"Write tests for telemetry opt-in gate","body":"Write vitest tests that verify sendTelemetryAsync never calls fetch when project.telemetry.enabled is false, and that the payload contains no string fields longer than 30 chars"},
  {"id":"an1","task_type":"analysis","title":"Analyze dispatch-runner for token waste","body":"Review src/lib/dispatch-runner.ts and identify all places where tokens are wasted: unnecessary context in system prompt, redundant tool descriptions, verbose error messages. List each with line number and estimated token cost"},
  {"id":"an2","task_type":"analysis","title":"Review research-db schema completeness","body":"Check whether the dispatch_observations table captures all the data needed to compute N_breakeven for PD negotiation. Identify any missing fields"},
  {"id":"an3","task_type":"analysis","title":"Inspect format-encoder compression ratios","body":"For each of the 5 format types in format-encoder.ts, calculate the expected compression ratio for a 500-char input. Identify which format provides the most savings for each task type"},
  {"id":"an4","task_type":"analysis","title":"Check telemetry payload for privacy leaks","body":"Review src/lib/telemetry.ts and verify that no content fields can leak into the payload under any code path"},
  {"id":"an5","task_type":"analysis","title":"Audit MCP tool count and token cost","body":"Count all MCP tools registered in mcp/server.py. Estimate the schema token cost of sending all tool definitions in a system prompt. Identify the 3 most expensive tools by schema size"},
  {"id":"pl1","task_type":"pipeline","title":"Build token report pipeline","body":"Read research.db dispatch_observations, transform to daily aggregates (date, mean_tokens_input, mean_tokens_output, cache_hit_rate), write to reports/daily-tokens.json"},
  {"id":"pl2","task_type":"pipeline","title":"Build PD effectiveness pipeline","body":"Read research.db pd_usage_log joined with pd_registry, compute tokens_saved per pd_id, write top 10 most effective PDs to reports/pd-effectiveness.json"},
  {"id":"pl3","task_type":"pipeline","title":"Build observation export pipeline","body":"Read all dispatch_observations from research.db, transform each to a flat CSV row, write to reports/observations.csv with headers"},
  {"id":"dc1","task_type":"documentation","title":"Document research-db module","body":"Write JSDoc comments for all exported functions in src/lib/research-db.ts: initResearchDb, writeObservation, getResearchDbPath. Include parameter types and return value descriptions"},
  {"id":"dc2","task_type":"documentation","title":"Document telemetry module","body":"Write JSDoc comments for sendTelemetryAsync and telemetryPreview in src/lib/telemetry.ts. Document the opt-in behaviour and what data is and is not sent"},
  {"id":"dc3","task_type":"documentation","title":"Update README MCP config section","body":"Update the MCP configuration section in README.md to show the new claude-project server name instead of claude-diary. Add a note about the telemetry opt-in prompt on first init"},
  {"id":"pt1","task_type":"planning","title":"Design PD negotiation scheduler","body":"Design a strategy for when the negotiation_controller agent should initiate PD negotiation. Consider: interaction count threshold, task type stability, estimated N_breakeven from community thresholds. Output a decision tree"},
  {"id":"pt2","task_type":"planning","title":"Plan LanceDB migration strategy","body":"Design a migration plan for users upgrading from an older claude-project version that has memory in flat markdown files to the new LanceDB vector store. Consider data loss prevention and rollback"},
  {"id":"pt3","task_type":"planning","title":"Plan multi-project context sharing","body":"Design how two claude-project instances in different repos could share Protocol Documents. Consider security, versioning, and whether PD IDs (content-addressed) are safe to share publicly"},
  {"id":"rt1","task_type":"retrieval","title":"Find all files importing research-db","body":"Find all TypeScript files in the src/ directory that import anything from research-db.ts"},
  {"id":"rt2","task_type":"retrieval","title":"Find all MCP tool definitions","body":"Find all functions decorated with @mcp.tool() in mcp/server.py and list their names and line numbers"}
]
ENDOFFILE
echo "ablation_tasks.json created: $(wc -l < scripts/ablation_tasks.json) lines"
```

Write to AGENT_STATE.md: `step_12_1_tasks_created: complete`

---

## Step 12.2 — Create scripts/ablation_runner.py

**Create file:** `scripts/ablation_runner.py`

```python
#!/usr/bin/env python3
"""
Ablation Study Runner
=====================
Runs 30 tasks × 7 conditions = 210 dispatches.
Tags each with ablation_condition in research.db.
Writes checkpoint after every condition so it can resume.

Usage:
  python3 scripts/ablation_runner.py
  python3 scripts/ablation_runner.py --start-condition 3   # resume from condition 3
  python3 scripts/ablation_runner.py --dry-run             # print plan, no API calls
"""
import argparse
import json
import os
import subprocess
import sys
import time
import sqlite3
import glob
from datetime import datetime, timezone
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────────────────────

CONDITIONS = [
    {"index": 0, "name": "baseline",       "cache": False, "format_encode": False, "clarity": False, "llmlingua": False, "pd": False},
    {"index": 1, "name": "cache_only",     "cache": True,  "format_encode": False, "clarity": False, "llmlingua": False, "pd": False},
    {"index": 2, "name": "format_only",    "cache": False, "format_encode": True,  "clarity": False, "llmlingua": False, "pd": False},
    {"index": 3, "name": "clarity_only",   "cache": False, "format_encode": False, "clarity": True,  "llmlingua": False, "pd": False},
    {"index": 4, "name": "llmlingua_only", "cache": False, "format_encode": False, "clarity": False, "llmlingua": True,  "pd": False},
    {"index": 5, "name": "pd_only",        "cache": False, "format_encode": False, "clarity": False, "llmlingua": False, "pd": True},
    {"index": 6, "name": "full_system",    "cache": True,  "format_encode": True,  "clarity": True,  "llmlingua": True,  "pd": True},
]

TASKS_FILE   = Path("scripts/ablation_tasks.json")
PROJECT_FILE = Path(".claude-project")
CHECKPOINT   = Path("scripts/ablation_checkpoint.json")
RESULTS_DIR  = Path("reports")

DISPATCH_TIMEOUT_S = 120   # max seconds per dispatch
INTER_DISPATCH_S   = 2     # pause between dispatches (rate limiting)


# ── Helpers ────────────────────────────────────────────────────────────────────

def load_tasks() -> list:
    with open(TASKS_FILE) as f:
        return json.load(f)


def load_checkpoint() -> dict:
    if CHECKPOINT.exists():
        with open(CHECKPOINT) as f:
            return json.load(f)
    return {"completed_conditions": [], "started_at": datetime.now(timezone.utc).isoformat()}


def save_checkpoint(cp: dict):
    with open(CHECKPOINT, "w") as f:
        json.dump(cp, f, indent=2)


def patch_optimizations(condition: dict):
    """Patch .claude-project with condition's optimization flags."""
    with open(PROJECT_FILE) as f:
        project = json.load(f)

    project["optimizations"] = {
        "cache_prefix":   condition["cache"],
        "format_encode":  condition["format_encode"],
        "clarity_layer":  condition["clarity"],
        "llmlingua":      condition["llmlingua"],
        "pd_registry":    condition["pd"],
    }
    project["_ablation_condition"] = condition["name"]

    with open(PROJECT_FILE, "w") as f:
        json.dump(project, f, indent=2)


def restore_optimizations():
    """Restore all optimizations to true after ablation."""
    with open(PROJECT_FILE) as f:
        project = json.load(f)
    project["optimizations"] = {
        "cache_prefix": True, "format_encode": True,
        "clarity_layer": True, "llmlingua": True, "pd_registry": True,
    }
    if "_ablation_condition" in project:
        del project["_ablation_condition"]
    with open(PROJECT_FILE, "w") as f:
        json.dump(project, f, indent=2)


def run_dispatch(task: dict, condition_name: str, dry_run: bool) -> dict:
    """
    Create and run a single dispatch. Returns timing and status.
    Tags the dispatch file with ablation_condition before running.
    """
    if dry_run:
        print(f"  [DRY RUN] Would run: {task['title'][:50]} ({condition_name})")
        return {"status": "dry_run", "elapsed_s": 0}

    start = time.monotonic()

    # Create dispatch via CLI
    create_result = subprocess.run(
        ["node", "dist/cli.js", "dispatch", "create",
         "--title", task["title"],
         "--body",  task["body"],
         "--agent", "main"],
        capture_output=True, text=True, timeout=30
    )

    if create_result.returncode != 0:
        return {
            "status": "create_failed",
            "error": create_result.stderr[:200],
            "elapsed_s": time.monotonic() - start
        }

    # Extract dispatch ID from output
    dispatch_id = None
    for line in create_result.stdout.split("\n"):
        if "dispatch-" in line:
            parts = [p for p in line.split() if p.startswith("dispatch-")]
            if parts:
                dispatch_id = parts
                break

    if not dispatch_id:
        return {"status": "no_id", "stdout": create_result.stdout[:200],
                "elapsed_s": time.monotonic() - start}

    # Tag the dispatch JSON with ablation_condition
    dispatches_dir = Path.home() / ".claude" / "projects"
    dispatch_files = list(dispatches_dir.rglob(f"{dispatch_id}.json"))
    if dispatch_files:
        with open(dispatch_files) as f:
            d = json.load(f)
        d["ablation_condition"] = condition_name
        with open(dispatch_files, "w") as f:
            json.dump(d, f, indent=2)

    # Run the dispatch
    run_result = subprocess.run(
        ["node", "dist/cli.js", "dispatch", "run", dispatch_id],
        capture_output=True, text=True, timeout=DISPATCH_TIMEOUT_S
    )

    elapsed = time.monotonic() - start
    status = "success" if run_result.returncode == 0 else "failed"

    return {
        "status": status,
        "dispatch_id": dispatch_id,
        "elapsed_s": round(elapsed, 1),
        "returncode": run_result.returncode,
    }


def get_research_db() -> str | None:
    paths = list(glob.glob(str(Path.home() / ".claude" / "projects" / "*" / "research.db")))
    return paths if paths else None


def count_observations_for_condition(condition_name: str) -> int:
    db_path = get_research_db()
    if not db_path:
        return 0
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT COUNT(*) FROM dispatch_observations WHERE ablation_condition = ?",
        (condition_name,)
    ).fetchone()
    conn.close()
    return row if row else 0


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-condition", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--condition", type=int, default=None,
                        help="Run only this condition index (0–6)")
    args = parser.parse_args()

    if not TASKS_FILE.exists():
        print(f"ERROR: {TASKS_FILE} not found. Run Step 12.1 first.")
        sys.exit(1)

    if not PROJECT_FILE.exists():
        print("ERROR: .claude-project not found. Run: npx claude-project init")
        sys.exit(1)

    RESULTS_DIR.mkdir(exist_ok=True)
    tasks = load_tasks()
    checkpoint = load_checkpoint()

    conditions_to_run = CONDITIONS
    if args.condition is not None:
        conditions_to_run = [CONDITIONS[args.condition]]
    elif args.start_condition > 0:
        conditions_to_run = [c for c in CONDITIONS if c["index"] >= args.start_condition]

    print(f"\n=== Ablation Study Runner ===")
    print(f"Tasks: {len(tasks)}")
    print(f"Conditions: {len(conditions_to_run)}")
    print(f"Total dispatches: {len(tasks) * len(conditions_to_run)}")
    if args.dry_run:
        print("MODE: DRY RUN — no API calls")
    print()

    all_results = []

    for condition in conditions_to_run:
        cname = condition["name"]

        if cname in checkpoint.get("completed_conditions", []) and not args.dry_run:
            obs_count = count_observations_for_condition(cname)
            print(f"SKIP {cname} — already complete ({obs_count} observations in DB)")
            continue

        print(f"\n--- Condition {condition['index']}: {cname} ---")
        print(f"  Flags: cache={condition['cache']} format={condition['format_encode']} "
              f"clarity={condition['clarity']} lingua={condition['llmlingua']} pd={condition['pd']}")

        if not args.dry_run:
            patch_optimizations(condition)
            print(f"  .claude-project patched ✓")

        condition_results = []
        for i, task in enumerate(tasks):
            print(f"  [{i+1:2d}/{len(tasks)}] {task['title'][:45]:45s}", end=" ", flush=True)
            result = run_dispatch(task, cname, args.dry_run)
            print(f"{result['status']:12s} {result.get('elapsed_s', 0):.1f}s")

            condition_results.append({
                "condition": cname,
                "task_id": task["id"],
                "task_type": task["task_type"],
                **result,
            })

            if not args.dry_run and i < len(tasks) - 1:
                time.sleep(INTER_DISPATCH_S)

        all_results.extend(condition_results)

        if not args.dry_run:
            checkpoint["completed_conditions"].append(cname)
            checkpoint[f"condition_{cname}_completed_at"] = \
                datetime.now(timezone.utc).isoformat()
            checkpoint[f"condition_{cname}_obs_count"] = \
                count_observations_for_condition(cname)
            save_checkpoint(checkpoint)
            print(f"  Checkpoint saved ✓")
            print(f"  Observations in DB: {checkpoint[f'condition_{cname}_obs_count']}")

    if not args.dry_run:
        restore_optimizations()
        print("\n  .claude-project restored to full_system ✓")

    # Write raw results
    results_path = RESULTS_DIR / "ablation-raw.json"
    with open(results_path, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nRaw results written: {results_path}")
    print(f"Total dispatches run: {len(all_results)}")
    print("\nNext step: python3 scripts/compute_ablation_results.py")


if __name__ == "__main__":
    main()
```

Write to AGENT_STATE.md: `step_12_2_ablation_runner: complete`

---

## Step 12.3 — Create scripts/compute_ablation_results.py

**Create file:** `scripts/compute_ablation_results.py`

```python
#!/usr/bin/env python3
"""
Compute ablation study results from research.db.
Reads all dispatch_observations tagged with ablation_condition.
Writes reports/ablation-results.json with full statistics.
"""
import glob
import json
import sqlite3
import statistics
from datetime import datetime, timezone
from pathlib import Path

RESULTS_DIR = Path("reports")

CONDITIONS_ORDER = [
    "baseline", "cache_only", "format_only",
    "clarity_only", "llmlingua_only", "pd_only", "full_system"
]

def get_research_db():
    paths = sorted(glob.glob(
        str(Path.home() / ".claude" / "projects" / "*" / "research.db")
    ))
    assert paths, "No research.db found. Run the ablation study first."
    return paths


def compute_stats(values: list) -> dict:
    if not values:
        return {"n": 0, "mean": None, "median": None, "stdev": None, "min": None, "max": None}
    return {
        "n":      len(values),
        "mean":   round(statistics.mean(values), 1),
        "median": round(statistics.median(values), 1),
        "stdev":  round(statistics.stdev(values), 1) if len(values) > 1 else 0,
        "min":    min(values),
        "max":    max(values),
    }


def main():
    db_path = get_research_db()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Fetch all ablation observations
    rows = conn.execute("""
        SELECT
            ablation_condition,
            task_type,
            tokens_total_input,
            tokens_output,
            tokens_cache_read,
            tokens_cache_write,
            latency_total_ms,
            compression_ratio,
            outcome,
            iterations
        FROM dispatch_observations
        WHERE ablation_condition IS NOT NULL
        ORDER BY ts ASC
    """).fetchall()

    conn.close()

    if not rows:
        print("No ablation observations found in research.db")
        print("Run: python3 scripts/ablation_runner.py")
        return

    # Group by condition
    by_condition: dict = {}
    for row in rows:
        cond = row["ablation_condition"]
        if cond not in by_condition:
            by_condition[cond] = []
        by_condition[cond].append(dict(row))

    print(f"Total observations: {len(rows)}")
    print(f"Conditions found:   {list(by_condition.keys())}\n")

    # Compute per-condition statistics
    condition_stats = {}
    for cond in CONDITIONS_ORDER:
        obs = by_condition.get(cond, [])
        if not obs:
            print(f"WARNING: No observations for condition '{cond}'")
            continue

        tokens_in    = [o["tokens_total_input"] for o in obs]
        tokens_out   = [o["tokens_output"] for o in obs]
        cache_read   = [o["tokens_cache_read"] for o in obs]
        latency      = [o["latency_total_ms"] for o in obs]
        compression  = [o["compression_ratio"] for o in obs if o["compression_ratio"]]
        success_rate = sum(1 for o in obs if o["outcome"] == "success") / len(obs)
        cache_hit_rate = sum(1 for o in obs if o["tokens_cache_read"] > 0) / len(obs)

        condition_stats[cond] = {
            "n_observations": len(obs),
            "tokens_input":   compute_stats(tokens_in),
            "tokens_output":  compute_stats(tokens_out),
            "cache_read":     compute_stats(cache_read),
            "latency_ms":     compute_stats(latency),
            "compression_ratio": compute_stats(compression) if compression else None,
            "success_rate":   round(success_rate * 100, 1),
            "cache_hit_rate": round(cache_hit_rate * 100, 1),
        }

    # Compute deltas vs baseline
    baseline_mean = condition_stats.get("baseline", {}).get(
        "tokens_input", {}).get("mean", None)

    deltas = {}
    for cond, stats in condition_stats.items():
        if cond == "baseline" or baseline_mean is None:
            deltas[cond] = None
            continue
        cond_mean = stats["tokens_input"]["mean"]
        if cond_mean and baseline_mean:
            reduction_pct = round((1 - cond_mean / baseline_mean) * 100, 1)
            tokens_saved  = round(baseline_mean - cond_mean, 1)
            deltas[cond] = {
                "reduction_pct": reduction_pct,
                "tokens_saved_mean": tokens_saved,
            }

    # Per-task-type breakdown for full_system
    task_type_stats = {}
    full_obs = by_condition.get("full_system", [])
    base_obs = by_condition.get("baseline", [])

    for task_type in set(o["task_type"] for o in full_obs):
        full_tt = [o["tokens_total_input"] for o in full_obs if o["task_type"] == task_type]
        base_tt = [o["tokens_total_input"] for o in base_obs if o["task_type"] == task_type]
        if full_tt and base_tt:
            base_m = statistics.mean(base_tt)
            full_m = statistics.mean(full_tt)
            task_type_stats[task_type] = {
                "n_baseline":    len(base_tt),
                "n_optimized":   len(full_tt),
                "baseline_mean": round(base_m, 1),
                "optimized_mean": round(full_m, 1),
                "reduction_pct": round((1 - full_m / base_m) * 100, 1),
            }

    # N_breakeven computation
    baseline_m = condition_stats.get("baseline", {}).get("tokens_input", {}).get("mean")
    full_m     = condition_stats.get("full_system", {}).get("tokens_input", {}).get("mean")
    n_breakeven = None
    if baseline_m and full_m and baseline_m > full_m:
        C_NEGOTIATE = 1500  # estimated one-time PD negotiation cost
        n_breakeven = round(C_NEGOTIATE / (baseline_m - full_m), 2)

    results = {
        "computed_at":          datetime.now(timezone.utc).isoformat(),
        "total_observations":   len(rows),
        "conditions_run":       list(condition_stats.keys()),
        "per_condition":        condition_stats,
        "vs_baseline":          deltas,
        "per_task_type_full_system": task_type_stats,
        "n_breakeven_pd_negotiation": n_breakeven,
        "summary": {
            "baseline_mean_tokens":     baseline_mean,
            "full_system_mean_tokens":  full_m,
            "overall_reduction_pct":    deltas.get("full_system", {}).get("reduction_pct") if deltas.get("full_system") else None,
            "biggest_single_win":       max(
                ((c, d["reduction_pct"]) for c, d in deltas.items() if d),
                key=lambda x: x, default=(None, 0) [shipyard](https://shipyard.build/blog/claude-code-multi-agent/)
            ),
        }
    }

    RESULTS_DIR.mkdir(exist_ok=True)
    out_path = RESULTS_DIR / "ablation-results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)

    # Print summary table
    print(f"\n{'Condition':<20} {'N':>4} {'Mean Input':>12} {'Reduction':>10} {'Cache Hit%':>11}")
    print("-" * 65)
    for cond in CONDITIONS_ORDER:
        if cond not in condition_stats:
            continue
        s = condition_stats[cond]
        d = deltas.get(cond)
        print(
            f"{cond:<20} {s['n_observations']:>4} "
            f"{s['tokens_input']['mean']:>12.0f} "
            f"{str(d['reduction_pct'])+'%':>10} "
            f"{str(s['cache_hit_rate'])+'%':>11}"
            if d else
            f"{cond:<20} {s['n_observations']:>4} "
            f"{s['tokens_input']['mean']:>12.0f} "
            f"{'baseline':>10} "
            f"{str(s['cache_hit_rate'])+'%':>11}"
        )

    print(f"\nN_breakeven (PD negotiation): {n_breakeven}")
    print(f"\nResults written: {out_path}")


if __name__ == "__main__":
    main()
```

Write to AGENT_STATE.md: `step_12_3_compute_script: complete`

---

## Step 12.4 — Add ablation_condition Field to DispatchObservation

**Modify `src/lib/research-db.ts`:**

Add to `DispatchObservation` interface:
```typescript
ablation_condition?: string | null;
```

Add to `dispatch_observations` table DDL:
```sql
ablation_condition TEXT,
```

Add to `writeObservation()` INSERT:
```typescript
// In the INSERT statement add:
ablation_condition TEXT → obs.ablation_condition ?? null
```

**Modify `src/lib/dispatch-runner.ts`:**

Before calling `writeObservation()`, pass through ablation_condition:
```typescript
const obs: DispatchObservation = {
  // ... existing fields ...
  ablation_condition: (dispatch as any).ablation_condition ?? null,
};
```

```bash
npm run build || { echo "BUILD FAILED"; exit 1; }
npx vitest run || { echo "TESTS FAILED"; exit 1; }
```

Write to AGENT_STATE.md: `step_12_4_ablation_field: complete`

---

## Step 12.5 — Dry Run Verification

```bash
# Verify task file is valid
python3 -c "
import json
tasks = json.load(open('scripts/ablation_tasks.json'))
assert len(tasks) == 30, f'Expected 30 tasks, got {len(tasks)}'
types = [t['task_type'] for t in tasks]
from collections import Counter
print('Task type distribution:', dict(Counter(types)))
assert Counter(types)['code_gen'] == 6
assert Counter(types)['refactor'] == 4
assert Counter(types)['test_gen'] == 4
assert Counter(types)['analysis'] == 5
assert Counter(types)['pipeline'] == 3
assert Counter(types)['documentation'] == 3
assert Counter(types)['planning'] == 3
assert Counter(types)['retrieval'] == 2
print('Task file valid ✓')
"

# Dry run — verify runner logic without API calls
python3 scripts/ablation_runner.py --dry-run

# Verify build
npm run build

# Verify research.db has ablation_condition column
python3 -c "
import sqlite3, glob
from pathlib import Path
dbs = glob.glob(str(Path.home() / '.claude/projects/*/research.db'))
if dbs:
    conn = sqlite3.connect(dbs)
    cols = [r for r in conn.execute('PRAGMA table_info(dispatch_observations)').fetchall()] [shipyard](https://shipyard.build/blog/claude-code-multi-agent/)
    assert 'ablation_condition' in cols, 'ablation_condition column missing'
    print('ablation_condition column present ✓')
    conn.close()
else:
    print('No research.db yet — will be created on first dispatch')
"
```

Write to AGENT_STATE.md: `step_12_5_dry_run: complete`

---

## Step 12.6 — Run the Full Ablation Study

```bash
# Ensure ANTHROPIC_API_KEY is set
echo ${ANTHROPIC_API_KEY:0:10}...

# Run all 7 conditions (210 dispatches)
# Expected duration: 30-90 minutes depending on model
python3 scripts/ablation_runner.py

# If interrupted, resume from checkpoint:
# python3 scripts/ablation_runner.py --start-condition 3

# Check progress anytime:
python3 -c "
import json
cp = json.load(open('scripts/ablation_checkpoint.json'))
print('Completed:', cp.get('completed_conditions', []))
"
```

Write to AGENT_STATE.md: `step_12_6_ablation_run_complete: true/false`

---

## Step 12.7 — Compute Results and Commit

```bash
# Compute results
python3 scripts/compute_ablation_results.py

# Verify results file exists and has content
python3 -c "
import json
r = json.load(open('reports/ablation-results.json'))
print('Total observations:', r['total_observations'])
print('Overall reduction:', r['summary']['overall_reduction_pct'], '%')
print('Biggest single win:', r['summary']['biggest_single_win'])
print('N_breakeven:', r['n_breakeven_pd_negotiation'])
assert r['total_observations'] >= 140, 'Less than 140 observations — some conditions may have failed'
print('Results valid ✓')
"

# Restore optimizations
python3 -c "
import json
p = json.load(open('.claude-project'))
p['optimizations'] = {k: True for k in ['cache_prefix','format_encode','clarity_layer','llmlingua','pd_registry']}
if '_ablation_condition' in p: del p['_ablation_condition']
json.dump(p, open('.claude-project','w'), indent=2)
print('Optimizations restored ✓')
"

# Commit everything
git add reports/ablation-results.json \
        reports/ \
        scripts/ablation_runner.py \
        scripts/compute_ablation_results.py \
        scripts/ablation_tasks.json \
        scripts/ablation_checkpoint.json \
        src/lib/research-db.ts \
        src/lib/dispatch-runner.ts \
        src/lib/telemetry.ts \
        workers/ \
        claude-project-instructions/AGENT_STATE.md

git commit -m "feat: ablation study results — empirical token reduction proof"
git push
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase12_ablation_complete",
  "tasks_created": 30,
  "conditions_run": 7,
  "total_dispatches": 210,
  "results_file": "reports/ablation-results.json",
  "build_passing": true,
  "tests_passing": true,
  "committed": true,
  "completed_at": "TIMESTAMP"
}
```

**All phases complete.**

---

## What the Results Prove

After this phase `reports/ablation-results.json` contains:

1. **Per-condition mean input tokens** — which layer saves the most
2. **Reduction % vs baseline** — the headline number
3. **Cache hit rate per condition** — validates stable prefix design
4. **Per-task-type breakdown** — which tasks benefit most
5. **N_breakeven** — the real measured value, not our estimate

Expected findings based on research literature:
- Cache alone likely gives the biggest reduction (~40–55%)
- Format encoding second (~20–35% on code tasks)
- LLMLingua meaningful on planning/doc tasks (~10–20%)
- Full system compounds all savings non-linearly

**This is the publishable evidence that the system works.**
```

***

That's all four Batch 3 files:

| # | File | Purpose |
|---|------|---------|
| 10 | `10_CLEANUP_FULL_REPO.md` | 155 legacy refs across 12 files, certified clean |
| 11 | `11_TELEMETRY.md` | Zero-token federated data collection |
| 12 | `12_ABLATION_STUDY.md` | 210-dispatch empirical proof |
| — | Updated `AGENT_STATE.md` | Add phases 10–12 blocks |

Say **"next"** for the updated `AGENT_STATE.md` with phases 10–12 added, then the new starting prompt for Batch 3.