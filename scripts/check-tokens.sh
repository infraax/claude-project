#!/bin/bash
# Estimates session token usage from dispatch_observations
# Claude Code sessions reset every 5 hours

python3 - << 'EOF'
import sqlite3, json
from pathlib import Path
from datetime import datetime, timedelta

p = json.load(open('.claude-project'))
db = Path(p['memory_path']).expanduser().parent / 'research.db'
conn = sqlite3.connect(str(db))

# Get dispatches in last 5 hours (one session window)
cutoff = (datetime.utcnow() - timedelta(hours=5)).isoformat()
rows = conn.execute("""
  SELECT SUM(tokens_total_input + tokens_output) as total,
         COUNT(*) as n,
         SUM(cost_usd) as cost
  FROM dispatch_observations
  WHERE ts > ?
""", (cutoff,)).fetchone()

total_tokens = int(rows[0] or 0)
dispatch_count = int(rows[1] or 0)
total_cost = float(rows[2] or 0)

# Claude Code session limit is approximately 200k tokens
SESSION_LIMIT = 200000
pct_used = (total_tokens / SESSION_LIMIT) * 100

print(f"╔═══════════════════════════════════╗")
print(f"║     Session Token Estimate        ║")
print(f"╠═══════════════════════════════════╣")
print(f"║ Dispatched tokens:  {total_tokens:>10,}  ║")
print(f"║ Dispatches run:     {dispatch_count:>10}  ║")
print(f"║ API cost (session): ${total_cost:>9.4f}  ║")
print(f"║ Est. % of limit:    {pct_used:>9.1f}%  ║")
print(f"╚═══════════════════════════════════╝")
print(f"Note: This tracks dispatch tokens only.")
print(f"Claude Code conversation tokens are")
print(f"separate and not accessible via API.")
conn.close()
EOF
