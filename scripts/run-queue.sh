#!/bin/bash
# Auto-executes .claude/queue/*.md files in alphabetical order
# Usage: bash scripts/run-queue.sh [--sleep-until HH:MM]

QUEUE_DIR=".claude/queue"
DONE_DIR=".claude/queue/completed"
FAIL_DIR=".claude/queue/failed"
LOG=".claude/queue/run.log"

# Optional sleep until a specific time
if [ "$1" = "--sleep-until" ] && [ -n "$2" ]; then
  TARGET="$2"
  echo "[$(date '+%H:%M:%S')] Sleeping until $TARGET..." | tee -a "$LOG"
  while true; do
    NOW=$(date '+%H:%M')
    if [ "$NOW" = "$TARGET" ]; then
      echo "[$(date '+%H:%M:%S')] Wake time reached — starting queue" | tee -a "$LOG"
      break
    fi
    sleep 30
  done
fi

# Count pending tasks
PENDING=$(ls "$QUEUE_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "[$(date '+%H:%M:%S')] Queue runner started — $PENDING tasks pending" | tee -a "$LOG"

if [ "$PENDING" -eq 0 ]; then
  echo "No tasks in queue. Add .md files to $QUEUE_DIR/" | tee -a "$LOG"
  exit 0
fi

# Execute each task file in order
for TASK_FILE in $(ls "$QUEUE_DIR"/*.md 2>/dev/null | sort); do
  TASK_NAME=$(basename "$TASK_FILE")
  echo "" | tee -a "$LOG"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG"
  echo "[$(date '+%H:%M:%S')] EXECUTING: $TASK_NAME" | tee -a "$LOG"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG"

  # Extract bash blocks from the markdown and run them
  python3 - "$TASK_FILE" << 'PYEOF'
import sys, re, subprocess, os

task_file = sys.argv[1]
content = open(task_file).read()

# Extract all ```bash blocks
blocks = re.findall(r'```bash\n(.*?)```', content, re.DOTALL)

if not blocks:
    print(f"No bash blocks found in {task_file}")
    sys.exit(0)

print(f"Found {len(blocks)} bash block(s)")
exit_codes = []

for i, block in enumerate(blocks, 1):
    print(f"\n--- Block {i} ---")
    result = subprocess.run(
        block, shell=True, text=True,
        capture_output=False,
        env={**os.environ}
    )
    exit_codes.append(result.returncode)
    if result.returncode != 0:
        print(f"Block {i} exited with code {result.returncode}")

failed = sum(1 for c in exit_codes if c != 0)
if failed > 0:
    print(f"\n⚠️  {failed}/{len(blocks)} blocks failed")
    sys.exit(1)
else:
    print(f"\n✅ All {len(blocks)} blocks passed")
    sys.exit(0)
PYEOF

  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    mv "$TASK_FILE" "$DONE_DIR/$TASK_NAME"
    echo "[$(date '+%H:%M:%S')] ✅ DONE: $TASK_NAME → moved to completed/" | tee -a "$LOG"
  else
    mv "$TASK_FILE" "$FAIL_DIR/$TASK_NAME"
    echo "[$(date '+%H:%M:%S')] ❌ FAILED: $TASK_NAME → moved to failed/" | tee -a "$LOG"
    echo "[$(date '+%H:%M:%S')] Stopping queue on failure" | tee -a "$LOG"
    exit 1
  fi
done

echo "" | tee -a "$LOG"
echo "[$(date '+%H:%M:%S')] Queue complete — all tasks done" | tee -a "$LOG"
