# Ablation v2 — Realistic Task Run

Run the full ablation study with the new realistic tasks.
All conditions, 10 tasks each.

## Prerequisites check

```bash
[ -f scripts/ablation_tasks.json ] && echo "Tasks file exists" || echo "MISSING"
[ -f scripts/ablation_runner.py ] && echo "Runner exists" || echo "MISSING"
python3 -c "
import json
tasks = json.load(open('scripts/ablation_tasks.json'))
lengths = [len(t['body']) for t in tasks]
print(f'Tasks: {len(tasks)}, Avg chars: {sum(lengths)//len(lengths)}')
"
```

## Run baseline first (condition 0)

```bash
rm -f scripts/ablation_checkpoint.json
python3 scripts/ablation_runner.py --condition 0 --reset 2>&1 | tail -15
```

## Verify baseline results look realistic

```bash
python3 - << 'PYEOF'
import sqlite3, json
from pathlib import Path
p = json.load(open('.claude-project'))
db = Path(p['memory_path']).expanduser().parent / 'research.db'
conn = sqlite3.connect(str(db))
rows = conn.execute("""
  SELECT AVG(tokens_total_input), AVG(tokens_output),
         AVG(iterations), COUNT(*)
  FROM dispatch_observations
  WHERE ablation_condition = 'baseline'
  ORDER BY ts DESC
""").fetchone()
avg_in = rows[0] or 0
avg_out = rows[1] or 0
avg_iter = rows[2] or 0
n = rows[3] or 0
print(f"Baseline v2: n={n}, avg_in={avg_in:.0f}, avg_out={avg_out:.0f}, avg_iter={avg_iter:.2f}")
if avg_in > 200:
    print("Token counts realistic - tasks are proper size")
else:
    print("WARNING: Token counts still low - check task bodies")
conn.close()
PYEOF
```

## Run remaining 6 conditions

```bash
python3 scripts/ablation_runner.py --start-condition 1 2>&1 | tail -40
```

## Compute and display results

```bash
python3 scripts/compute_ablation_results.py 2>&1 | head -60
```

## Commit results

```bash
git add reports/ scripts/ablation_checkpoint.json
git commit -m "data: ablation v2 results — realistic tasks, all 7 conditions"
git push -u origin claude/review-agent-state-YGM4Q
```
