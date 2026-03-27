#!/bin/bash
# Cost dashboard — tracks API spend per ablation condition

python3 - << 'EOF'
import sqlite3, json
from pathlib import Path
from datetime import datetime

p = json.load(open('.claude-project'))
db = Path(p['memory_path']).expanduser().parent / 'research.db'
conn = sqlite3.connect(str(db))

# Pricing (session token auth = same Haiku pricing)
INPUT_CPM  = 1.00   # $ per million tokens
OUTPUT_CPM = 5.00   # $ per million tokens

print("╔════════════════════════════════════════════════════════╗")
print("║          API Cost Dashboard — claude-project           ║")
print("╚════════════════════════════════════════════════════════╝\n")

# All-time totals
row = conn.execute("""
  SELECT COUNT(*), SUM(tokens_total_input), SUM(tokens_output)
  FROM dispatch_observations
""").fetchone()
n_total = row[0] or 0
total_in = row[1] or 0
total_out = row[2] or 0
total_cost = (total_in / 1e6) * INPUT_CPM + (total_out / 1e6) * OUTPUT_CPM

print(f"All-time dispatches:    {n_total}")
print(f"Total tokens in/out:    {total_in:,} / {total_out:,}")
print(f"Total API cost:         ${total_cost:.4f}")
print(f"Budget used (of $100):  {total_cost:.1f}%")
print(f"Budget remaining:       ${100 - total_cost:.2f}")
print()

# By ablation condition
print("Cost by Ablation Condition:")
print("─" * 55)
cond_rows = conn.execute("""
  SELECT ablation_condition, COUNT(*),
         SUM(tokens_total_input), SUM(tokens_output)
  FROM dispatch_observations
  WHERE ablation_condition IS NOT NULL
  GROUP BY ablation_condition
  ORDER BY ablation_condition
""").fetchall()

for cond, n, inp, out in cond_rows:
    inp = inp or 0; out = out or 0
    cost = (inp / 1e6) * INPUT_CPM + (out / 1e6) * OUTPUT_CPM
    print(f"  {str(cond):<22} n={n:<3} ${cost:.4f}  ({inp:,} in / {out:,} out)")

print()
# Budget status
if total_cost < 10:
    print("✅ Budget health: EXCELLENT")
elif total_cost < 50:
    print("⚠️  Budget health: CAUTION")
else:
    print("🚨 Budget health: ALERT — review usage")

print(f"\nModel: claude-haiku-4-5 @ $1.00/M in, $5.00/M out")
print(f"Run date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
conn.close()
EOF
