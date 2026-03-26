#!/usr/bin/env python3
"""Full pipeline test: clarity → task classification → compression."""
import sys
sys.path.insert(0, 'mcp')

from clarity_layer import clarify
from task_classifier_py import classify_task_type

test_cases = [
    ("Implement file reader", "create a funtion that reads json files form the projct directory and returns parsed content", "code_gen"),
    ("Build ETL pipeline",    "read from sqlite transform to json write to lancedb", "pipeline"),
    ("Review auth module",    "check the authentication code for security issues", "analysis"),
    ("Write tests",           "add vitest specs for the dispatch runner module", "test_gen"),
    ("Find the config file",  "search for the main configuration file location", "retrieval"),
]

passed = 0
for title, body, expected_type in test_cases:
    clarity = clarify(body)
    task_type = classify_task_type(title, clarity["output"])
    ok = task_type == expected_type
    if ok:
        passed += 1
    status = "OK" if ok else f"FAIL (got {task_type}, expected {expected_type})"
    print(f"{title[:30]:30s} | type: {task_type:15s} | clarity: {'pass' if clarity['passthrough'] else 'cleaned':8s} | {status}")

print(f"\n{passed}/{len(test_cases)} passed")
if passed < len(test_cases):
    sys.exit(1)
