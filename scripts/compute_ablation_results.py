#!/usr/bin/env python3
"""
Compute ablation study results from research.db.
Reads all dispatch_observations tagged with ablation_condition.
Writes reports/ablation-results.json with full statistics.

Usage:
  python3 scripts/compute_ablation_results.py
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


def get_research_dbs() -> list:
    paths = sorted(glob.glob(
        str(Path.home() / ".claude" / "projects" / "*" / "research.db")
    ))
    assert paths, "No research.db found. Run: python3 scripts/ablation_runner.py"
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
    db_path = get_research_dbs()[0]
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

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
        success_rate   = sum(1 for o in obs if o["outcome"] == "success") / len(obs)
        cache_hit_rate = sum(1 for o in obs if o["tokens_cache_read"] > 0) / len(obs)

        condition_stats[cond] = {
            "n_observations":    len(obs),
            "tokens_input":      compute_stats(tokens_in),
            "tokens_output":     compute_stats(tokens_out),
            "cache_read":        compute_stats(cache_read),
            "latency_ms":        compute_stats(latency),
            "compression_ratio": compute_stats(compression) if compression else None,
            "success_rate":      round(success_rate * 100, 1),
            "cache_hit_rate":    round(cache_hit_rate * 100, 1),
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
                "reduction_pct":     reduction_pct,
                "tokens_saved_mean": tokens_saved,
            }

    # Per-task-type breakdown for full_system vs baseline
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
                "n_baseline":     len(base_tt),
                "n_optimized":    len(full_tt),
                "baseline_mean":  round(base_m, 1),
                "optimized_mean": round(full_m, 1),
                "reduction_pct":  round((1 - full_m / base_m) * 100, 1),
            }

    # N_breakeven computation
    baseline_m = condition_stats.get("baseline", {}).get("tokens_input", {}).get("mean")
    full_m     = condition_stats.get("full_system", {}).get("tokens_input", {}).get("mean")
    n_breakeven = None
    if baseline_m and full_m and baseline_m > full_m:
        C_NEGOTIATE = 1500  # estimated one-time PD negotiation cost
        n_breakeven = round(C_NEGOTIATE / (baseline_m - full_m), 2)

    # Biggest single-component win
    single_deltas = {c: d for c, d in deltas.items()
                     if d and c not in ("baseline", "full_system")}
    biggest_win = max(single_deltas.items(),
                      key=lambda x: x[1]["reduction_pct"],
                      default=(None, {"reduction_pct": 0}))

    results = {
        "computed_at":                    datetime.now(timezone.utc).isoformat(),
        "total_observations":             len(rows),
        "conditions_run":                 list(condition_stats.keys()),
        "per_condition":                  condition_stats,
        "vs_baseline":                    deltas,
        "per_task_type_full_system":      task_type_stats,
        "n_breakeven_pd_negotiation":     n_breakeven,
        "summary": {
            "baseline_mean_tokens":    baseline_mean,
            "full_system_mean_tokens": full_m,
            "overall_reduction_pct":   deltas.get("full_system", {}).get("reduction_pct") if deltas.get("full_system") else None,
            "biggest_single_win":      biggest_win[0],
            "biggest_single_win_pct":  biggest_win[1]["reduction_pct"],
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
        if d:
            print(f"{cond:<20} {s['n_observations']:>4} "
                  f"{s['tokens_input']['mean']:>12.0f} "
                  f"{str(d['reduction_pct'])+'%':>10} "
                  f"{str(s['cache_hit_rate'])+'%':>11}")
        else:
            print(f"{cond:<20} {s['n_observations']:>4} "
                  f"{s['tokens_input']['mean']:>12.0f} "
                  f"{'baseline':>10} "
                  f"{str(s['cache_hit_rate'])+'%':>11}")

    print(f"\nN_breakeven (PD negotiation): {n_breakeven}")
    print(f"\nResults written: {out_path}")


if __name__ == "__main__":
    main()
