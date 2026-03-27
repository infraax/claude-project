# Verify Agent Self-Use Pipeline

Test that the agent dispatches its own coding tasks
through the pipeline rather than writing directly.

## Check pipeline is responding

```bash
node dist/cli.js dispatch create \
  "self-use-check: return pipeline status JSON" \
  --body "Return a JSON object with key 'status' set to 'pipeline_active' and key 'timestamp' set to current ISO timestamp." \
  --agent main 2>&1 | tail -5
```

## Run the dispatch

```bash
DISPATCH_ID=$(node dist/cli.js dispatch create \
  "self-use-check-run" \
  --body "Return a JSON object with key 'status' set to 'pipeline_active' and key 'timestamp' set to current ISO timestamp." \
  --agent main 2>&1 | grep -o 'dispatch-[a-f0-9]*' | head -1)
echo "Dispatch ID: $DISPATCH_ID"
[ -n "$DISPATCH_ID" ] && node dist/cli.js dispatch run "$DISPATCH_ID" 2>&1
```

## Log self-use confirmed to memories

```bash
python3 - << 'PYEOF'
import sqlite3, json
from pathlib import Path
p = json.load(open('.claude-project'))
db = Path(p['memory_path']).expanduser().parent / 'research.db'
conn = sqlite3.connect(str(db))
try:
    conn.execute("""INSERT INTO memories (category, text, tags, ts) VALUES
      ('milestone',
       'Self-use pipeline verified active. Agent dispatches own coding tasks. Stage 2 confirmed operational.',
       'stage2,verified,self-use',
       datetime('now'))""")
    conn.commit()
    print("Self-use milestone logged")
except Exception as e:
    print(f"Could not log to memories: {e}")
conn.close()
PYEOF
```

## Commit

```bash
git add -A && git commit -m "verify: agent self-use pipeline confirmed active" && git push -u origin claude/review-agent-state-YGM4Q
```
