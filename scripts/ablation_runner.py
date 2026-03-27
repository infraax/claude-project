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
        "cache_prefix":  condition["cache"],
        "format_encode": condition["format_encode"],
        "clarity_layer": condition["clarity"],
        "llmlingua":     condition["llmlingua"],
        "pd_registry":   condition["pd"],
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
    """Create and run a single dispatch. Returns timing and status."""
    if dry_run:
        print(f"  [DRY RUN] Would run: {task['title'][:50]} ({condition_name})")
        return {"status": "dry_run", "elapsed_s": 0}

    start = time.monotonic()

    # Create dispatch via CLI  (title is a positional arg, not a flag)
    create_result = subprocess.run(
        ["node", "dist/cli.js", "dispatch", "create",
         task["title"],
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
                dispatch_id = parts[0]
                break

    if not dispatch_id:
        return {"status": "no_id", "stdout": create_result.stdout[:200],
                "elapsed_s": time.monotonic() - start}

    # Tag the dispatch JSON with ablation_condition.
    # Derive dispatches_dir from .claude-project memory_path rather than
    # Path.home(), which may differ in container environments.
    memory_path = Path(json.load(open(PROJECT_FILE))["memory_path"]).expanduser()
    dispatches_dir = memory_path.parent / "dispatches"
    dispatch_files = list(dispatches_dir.rglob(f"{dispatch_id}.json"))
    if dispatch_files:
        with open(dispatch_files[0]) as f:
            d = json.load(f)
        d["ablation_condition"] = condition_name
        with open(dispatch_files[0], "w") as f:
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


def get_research_dbs() -> list:
    memory_path = Path(json.load(open(PROJECT_FILE))["memory_path"]).expanduser()
    db_path = memory_path.parent / "research.db"
    return [str(db_path)] if db_path.exists() else []


def count_observations_for_condition(condition_name: str) -> int:
    dbs = get_research_dbs()
    if not dbs:
        return 0
    conn = sqlite3.connect(dbs[0])
    row = conn.execute(
        "SELECT COUNT(*) FROM dispatch_observations WHERE ablation_condition = ?",
        (condition_name,)
    ).fetchone()
    conn.close()
    return row[0] if row else 0


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-condition", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--condition", type=int, default=None,
                        help="Run only this condition index (0-6)")
    parser.add_argument("--max-tasks", type=int, default=None,
                        help="Limit tasks per condition (for validation runs)")
    parser.add_argument("--reset", action="store_true",
                        help="Delete checkpoint and start fresh")
    args = parser.parse_args()

    if not TASKS_FILE.exists():
        print(f"ERROR: {TASKS_FILE} not found.")
        sys.exit(1)

    if not PROJECT_FILE.exists():
        print("ERROR: .claude-project not found. Run: claude-project init")
        sys.exit(1)

    if args.reset and CHECKPOINT.exists():
        CHECKPOINT.unlink()
        print("Checkpoint deleted — starting fresh.")

    RESULTS_DIR.mkdir(exist_ok=True)
    tasks = load_tasks()
    if args.max_tasks:
        tasks = tasks[:args.max_tasks]
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
                "task_id":   task.get("id", f"t{i+1:02d}"),
                "task_type": task["task_type"],
                **result,
            })

            if not args.dry_run and i < len(tasks) - 1:
                time.sleep(INTER_DISPATCH_S)

        all_results.extend(condition_results)

        if not args.dry_run:
            obs_count = count_observations_for_condition(cname)
            success_count = sum(1 for r in condition_results if r["status"] == "success")
            if success_count == 0:
                print(f"  WARNING: 0/{len(tasks)} dispatches succeeded — skipping checkpoint for {cname}")
                print(f"  Check that ANTHROPIC_API_KEY is set and dist/cli.js is built.")
            else:
                checkpoint["completed_conditions"].append(cname)
                checkpoint[f"condition_{cname}_completed_at"] = \
                    datetime.now(timezone.utc).isoformat()
                checkpoint[f"condition_{cname}_obs_count"] = obs_count
                save_checkpoint(checkpoint)
                print(f"  Checkpoint saved ✓  ({success_count}/{len(tasks)} success, {obs_count} obs)")
                print(f"  Observations in DB: {obs_count}")

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
