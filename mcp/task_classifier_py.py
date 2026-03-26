# mcp/task_classifier_py.py
# Python port of src/lib/task-classifier.ts — used in server.py and clarity pipeline.
import re

TASK_PATTERNS = [
    ("test_gen",      [r"\btest(s|ing)?\b", r"\bspec\b", r"\bvitest\b", r"\bjest\b"]),
    ("pipeline",      [r"\bpipeline\b", r"\betl\b", r"\btransform\b"]),
    ("refactor",      [r"\brefactor\b", r"\bclean.?up\b", r"\brewrite\b"]),
    ("analysis",      [r"\banalyse?\b", r"\breview\b", r"\bcheck\b", r"\binspect\b"]),
    ("documentation", [r"\bdoc(s|ument(ation)?)?\b", r"\breadme\b", r"\bcomment\b"]),
    ("planning",      [r"\bplan\b", r"\barchitect\b", r"\bdesign\b", r"\bstrateg\b"]),
    ("retrieval",     [r"\bfind\b", r"\bsearch\b", r"\blookup\b", r"\bwhere\b.{0,10}\bis\b"]),
    ("code_gen",      [r"\bimplement\b", r"\bcreate\b", r"\bbuild\b", r"\badd\b.{0,20}\bfunction\b"]),
]


def classify_task_type(title: str, body: str) -> str:
    combined = f"{title} {body}".lower()
    for task_type, patterns in TASK_PATTERNS:
        if any(re.search(p, combined) for p in patterns):
            return task_type
    return "unknown"
