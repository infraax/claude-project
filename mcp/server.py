#!/usr/bin/env python3
"""
Claude Project — MCP Memory & Dispatch Server v5
=================================================
Persistent memory, project context, and research instrumentation for Claude Code.
Bundled inside claude-project — invoked via: claude-project mcp

Features:
  • Source attribution  — every entry records hostname/user
  • UUID per entry      — every memory/decision/milestone gets a short UUID
  • Project context     — reads .claude-project v5 from CWD upward (like .git)
  • Obsidian sync       — opt-in only via CLAUDE_OBSIDIAN_VAULT env var
  • Dynamic MEMORY_DIR  — routes to the right project's memory folder automatically
  • Schema v5           — memory_path, optimizations, telemetry; no diary_path required

Run modes:
  python3 server.py              → stdio (default, for Claude Code)
  python3 server.py --http       → HTTP/SSE on localhost:8765
  claude-project mcp             → same as stdio, invoked by the CLI

Memory files live in:
  Per project:  <project.memory_path>/   (from .claude-project)
  Default:      ~/.claude/projects/default/memory/
"""

import argparse
import json
import os
import re
import secrets
import socket
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from mcp.server.fastmcp import FastMCP

# ── Defaults (all resolved from env vars — nothing machine-specific) ───────────
# Override any of these with environment variables:
#   CLAUDE_PROJECT_DIR      — default memory directory when no .claude-project found
#   CLAUDE_OBSIDIAN_VAULT   — enable optional Obsidian sync (disabled by default)
#   CLAUDE_OBSIDIAN_FOLDER  — default subfolder inside the vault

_DEFAULT_MEMORY_DIR = Path(
    os.environ.get("CLAUDE_PROJECT_DIR", str(Path.home() / ".claude" / "projects" / "default" / "memory"))
)
_DEFAULT_OBSIDIAN_VAULT = Path(
    os.environ.get("CLAUDE_OBSIDIAN_VAULT", str(Path.home() / ".claude" / "obsidian"))
)
_DEFAULT_OBSIDIAN_FOLDER = os.environ.get("CLAUDE_OBSIDIAN_FOLDER", "Projects/Unsorted")

# Obsidian sync is opt-in — only enabled when CLAUDE_OBSIDIAN_VAULT is explicitly set
_OBSIDIAN_ENABLED = bool(os.environ.get("CLAUDE_OBSIDIAN_VAULT", ""))

SERVER_DIR = Path.home() / ".claude" / "memory_mcp"
TOKEN_FILE   = SERVER_DIR / ".mcp_token"
MACHINE_FILE = SERVER_DIR / ".machine_id"
AUDIT_FILE   = SERVER_DIR / "audit.log"
SERVER_DIR.mkdir(parents=True, exist_ok=True)

# ── Input length caps ──────────────────────────────────────────────────────────
_SHORT  = 300
_MEDIUM = 1000
_LONG   = 8192


# ══════════════════════════════════════════════════════════════════════════════
# SOURCE ATTRIBUTION
# ══════════════════════════════════════════════════════════════════════════════

def _get_source() -> str:
    """
    Detect where this MCP call originates.
    Returns a human-readable source label: hostname / user.
    SSH connections are detected via SSH_CLIENT env var.
    """
    user = os.getenv("USER", "unknown")
    hostname = socket.gethostname().lower()

    # SSH connection — someone is SSHing into this machine
    ssh_client = os.getenv("SSH_CLIENT", "")
    ssh_tty    = os.getenv("SSH_TTY", "")
    if ssh_client or ssh_tty:
        client_ip = ssh_client.split(" ")[0] if ssh_client else "unknown"
        if any(k in hostname for k in ("pi", "raspberry")):
            return f"SSH → Pi5 ({client_ip})"
        elif any(k in hostname for k in ("thinkpad", "think", "lenovo")):
            return f"SSH → Thinkpad ({client_ip})"
        else:
            return f"SSH → {hostname} ({client_ip})"

    # Local machine detection
    if any(k in hostname for k in ("macbook", "mac-", "imac", "apple")):
        return f"mac / {user}"
    elif hostname.endswith(".local"):
        # macOS default — hostname is <name>.local
        return f"mac / {user}"
    elif any(k in hostname for k in ("pi", "raspberry")):
        return f"Pi5 / {user}"
    elif any(k in hostname for k in ("thinkpad", "think", "lenovo")):
        return f"Thinkpad / {user}"
    else:
        return f"{hostname} / {user}"


# ══════════════════════════════════════════════════════════════════════════════
# PROJECT CONTEXT  (like .git — walks up from CWD)
# ══════════════════════════════════════════════════════════════════════════════

def _find_project_context() -> dict | None:
    """
    Walk up from CWD to find a .claude-project file (like how git finds .git).
    Returns the parsed JSON dict, or None if not found.
    """
    path = Path.cwd()
    for parent in [path, *path.parents]:
        candidate = parent / ".claude-project"
        if candidate.exists():
            try:
                return json.loads(candidate.read_text(encoding="utf-8"))
            except Exception:
                return None
    return None


def _resolve_paths() -> tuple[Path, Path, Path]:
    """
    Returns (memory_dir, dispatches_dir, db_path) for the current context.
    Checks .claude-project (v5: memory_path; v4 compat: diary_path) → defaults.
    """
    ctx = _find_project_context()

    if ctx:
        # memory_path is canonical; diary_path kept for backward compat
        raw = ctx.get("memory_path") or ctx.get("diary_path")
        memory_dir = Path(raw).expanduser() if raw else _DEFAULT_MEMORY_DIR
    else:
        memory_dir = _DEFAULT_MEMORY_DIR

    memory_dir.mkdir(parents=True, exist_ok=True)
    project_root = memory_dir.parent
    dispatches_dir = project_root / "dispatches"
    db_path = project_root / "research.db"
    dispatches_dir.mkdir(parents=True, exist_ok=True)
    return memory_dir, dispatches_dir, db_path


def _current_project_id() -> str:
    """Return the current project UUID or 'default'."""
    ctx = _find_project_context()
    if ctx:
        return ctx.get("project_id", "default")[:8]
    return "default"


# ══════════════════════════════════════════════════════════════════════════════
# OBSIDIAN SYNC
# ══════════════════════════════════════════════════════════════════════════════

def _sync_obsidian(vault: Path, folder: str, filename: str, content: str, source: str) -> None:
    """
    Silently mirror an entry to the Obsidian vault (opt-in via CLAUDE_OBSIDIAN_VAULT).
    Never raises — Obsidian sync failure must never crash the MCP.
    """
    if not _OBSIDIAN_ENABLED:
        return
    try:
        target_dir = vault / folder
        target_dir.mkdir(parents=True, exist_ok=True)
        target_file = target_dir / filename
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
        attributed = f"\n> *{ts} · {source}*\n\n{content.strip()}\n\n---\n"
        with target_file.open("a", encoding="utf-8") as fh:
            fh.write(attributed)
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# SECURITY HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _get_or_create_token() -> str:
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    token = secrets.token_urlsafe(32)
    TOKEN_FILE.write_text(token, encoding="utf-8")
    TOKEN_FILE.chmod(0o600)
    return token


def _get_or_create_machine_id() -> str:
    if MACHINE_FILE.exists():
        return MACHINE_FILE.read_text(encoding="utf-8").strip()
    mid = str(uuid.uuid4())
    MACHINE_FILE.write_text(mid, encoding="utf-8")
    MACHINE_FILE.chmod(0o600)
    return mid


def _audit(event: str, client: str = "stdio") -> None:
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    machine = _get_or_create_machine_id()[:8]
    line = f"{ts}  {client:<22}  {event}  [machine:{machine}]\n"
    try:
        with AUDIT_FILE.open("a", encoding="utf-8") as fh:
            fh.write(line)
    except Exception:
        pass


def _check(value: str, name: str, max_len: int) -> str | None:
    if len(value) > max_len:
        return f"Input '{name}' is too long ({len(value)} chars). Maximum: {max_len}."
    return None


def _short_uuid() -> str:
    return str(uuid.uuid4())[:8]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_prefix() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ── HTTP security middleware ────────────────────────────────────────────────────

def _build_protected_app(base_app, token: str):
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.responses import JSONResponse

    _RATE_WINDOW   = 60
    _RATE_MAX_REQS = 30

    class _SecurityMiddleware(BaseHTTPMiddleware):
        def __init__(self, app):
            super().__init__(app)
            self._token = token.encode("utf-8")
            self._hits: dict[str, list[float]] = {}

        async def dispatch(self, request, call_next):
            client_ip = request.client.host if request.client else "unknown"
            path      = request.url.path
            now       = time.monotonic()
            bucket    = self._hits.setdefault(client_ip, [])
            self._hits[client_ip] = [t for t in bucket if now - t < _RATE_WINDOW]
            if len(self._hits[client_ip]) >= _RATE_MAX_REQS:
                _audit(f"RATE_LIMITED {path}", client_ip)
                return JSONResponse({"error": "rate_limit_exceeded"}, status_code=429)
            self._hits[client_ip].append(now)
            auth = request.headers.get("Authorization", "")
            if not auth.lower().startswith("bearer "):
                _audit(f"DENIED_NO_TOKEN {path}", client_ip)
                return JSONResponse({"error": "unauthorized"}, status_code=401,
                                    headers={"WWW-Authenticate": "Bearer"})
            provided = auth[7:].encode("utf-8")
            if not secrets.compare_digest(provided, self._token):
                _audit(f"DENIED_WRONG_TOKEN {path}", client_ip)
                return JSONResponse({"error": "unauthorized"}, status_code=401,
                                    headers={"WWW-Authenticate": "Bearer"})
            _audit(f"OK {path}", client_ip)
            return await call_next(request)

    return _SecurityMiddleware(base_app)


# ── File helpers ───────────────────────────────────────────────────────────────

def _prepend_to_file(path: Path, header: str, entry: str) -> None:
    if path.exists():
        existing = path.read_text(encoding="utf-8")
        match = re.search(r"^## \d{4}-\d{2}-\d{2}", existing, re.MULTILINE)
        if match:
            updated = existing[: match.start()] + entry + existing[match.start():]
        else:
            updated = existing.rstrip() + "\n" + entry
    else:
        updated = header + "\n" + entry
    path.write_text(updated, encoding="utf-8")


def _append_to_file(path: Path, header: str, entry: str) -> None:
    if path.exists():
        path.write_text(path.read_text(encoding="utf-8") + entry, encoding="utf-8")
    else:
        path.write_text(header + "\n" + entry, encoding="utf-8")


# ══════════════════════════════════════════════════════════════════════════════
# MCP SERVER
# ══════════════════════════════════════════════════════════════════════════════

mcp = FastMCP(
    name="claude-project",
    instructions=(
        "Persistent memory, project context, and dispatch queue for Claude across all sessions. "
        "Part of claude-project v5 — .claude-project schema v5. "
        "START every session with get_context. "
        "In a new project directory, call init_project first to create .claude-project. "
        "Use store_memory / recall_memory to persist and retrieve knowledge. "
        "Use log_event to record any significant action. "
        "Use create_dispatch / list_dispatches to manage the task queue. "
        "Use list_projects to see all known projects on this machine."
    ),
    host="127.0.0.1",
    port=8765,
)


# ══════════════════════════════════════════════════════════════════════════════
# PROJECT MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def init_project(name: str, description: str = "") -> str:
    """
    Initialises a .claude-project file in the current directory.
    Like `git init` but for Claude project context.
    Creates the file, assigns a UUID, and sets up the memory directory.
    Safe to call even if .claude-project already exists — will not overwrite.

    Args:
        name:        Project name, e.g. 'VectorBrain' or 'HomeAutomation'
        description: One-line description of what the project is
    """
    for val, nm, lim in [(name, "name", _SHORT), (description, "description", _MEDIUM)]:
        err = _check(val, nm, lim)
        if err:
            return err

    target = Path.cwd() / ".claude-project"
    if target.exists():
        existing = json.loads(target.read_text(encoding="utf-8"))
        return (
            f".claude-project already exists.\n"
            f"Project: {existing.get('name')} (ID: {existing.get('project_id', '?')[:8]})"
        )

    project_id = str(uuid.uuid4())
    memory_path = str(Path.home() / ".claude" / "projects" / f"project-{project_id[:8]}" / "memory")

    data = {
        "$schema": "https://cdn.jsdelivr.net/npm/claude-project/schema/claude-project.schema.json",
        "version": "5.0",
        "project_id": project_id,
        "name": name,
        "description": description,
        "created": _today_prefix(),
        "created_by": _get_source(),
        "memory_path": memory_path,
    }

    target.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    Path(memory_path).mkdir(parents=True, exist_ok=True)

    return (
        f"Initialised project '{name}'\n"
        f"  UUID:     {project_id}\n"
        f"  Memory:   {memory_path}\n"
        f"  Source:   {_get_source()}\n"
        f"\n.claude-project written to {target}"
    )



@mcp.tool()
def list_files() -> str:
    """Lists all .md files in the memory directory with sizes."""
    memory_dir, _, _ = _resolve_paths()
    files = sorted(memory_dir.glob("*.md"))
    if not files:
        return "No .md files found in memory directory."
    lines = [f"Memory directory: {memory_dir}", ""]
    for f in files:
        lines.append(f"  {f.name:<35} {f.stat().st_size:>6} bytes")
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# TIME
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def get_time() -> str:
    """Returns the current UTC date and time as ISO 8601. Always use this for timestamps."""
    return _now()




# ══════════════════════════════════════════════════════════════════════════════
# KNOWLEDGE TOOLS  (all now include UUID + source + Obsidian sync)
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def note_discovery(topic: str, detail: str, tags: str = "") -> str:
    """
    Records a technical discovery with UUID and source attribution.
    Syncs to Obsidian Discoveries.md automatically.

    Args:
        topic:  Short identifier for the discovery
        detail: The full technical finding
        tags:   Optional comma-separated tags, e.g. 'go,sdk,events'
    """
    for val, name, lim in [
        (topic, "topic", _SHORT),
        (detail, "detail", _LONG),
        (tags, "tags", _SHORT),
    ]:
        err = _check(val, name, lim)
        if err:
            return err

    memory_dir, dispatches_dir, db_path = _resolve_paths()
    discoveries_file = memory_dir / "discoveries.md"
    source = _get_source()
    ts = _now()
    eid = _short_uuid()
    tag_line = f"\n*Tags: {tags}*" if tags.strip() else ""
    entry = (
        f"\n## {ts} — {topic}\n"
        f"*`{eid}` · {source}*\n\n"
        f"{detail.strip()}{tag_line}\n\n---\n"
    )
    _prepend_to_file(
        discoveries_file,
        "# Technical Discoveries\n\n*Factual findings. Newest first.*",
        entry,
    )
    _sync_obsidian(
        _DEFAULT_OBSIDIAN_VAULT, _DEFAULT_OBSIDIAN_FOLDER, "Discoveries.md",
        f"### {topic}\n\n{detail.strip()}{tag_line}", source
    )
    return f"Discovery `{eid}` logged: '{topic}' ({source})."


@mcp.tool()
def log_decision(decision: str, rationale: str, alternatives: str = "") -> str:
    """
    Records an architectural decision with UUID and source attribution.
    Syncs to Obsidian Architecture.md automatically.

    Args:
        decision:     What was decided
        rationale:    Why
        alternatives: Other options considered (optional)
    """
    for val, name, lim in [
        (decision, "decision", _MEDIUM),
        (rationale, "rationale", _LONG),
        (alternatives, "alternatives", _MEDIUM),
    ]:
        err = _check(val, name, lim)
        if err:
            return err

    memory_dir, dispatches_dir, db_path = _resolve_paths()
    decisions_file = memory_dir / "decisions.md"
    source = _get_source()
    ts = _now()
    eid = _short_uuid()
    alt_section = f"\n**Alternatives:** {alternatives.strip()}" if alternatives.strip() else ""
    entry = (
        f"\n## {ts}\n"
        f"*`{eid}` · {source}*\n\n"
        f"**Decision:** {decision.strip()}\n\n"
        f"**Rationale:** {rationale.strip()}"
        f"{alt_section}\n\n---\n"
    )
    _prepend_to_file(
        decisions_file,
        "# Architecture & Design Decisions\n\n*Settled decisions. Newest first.*",
        entry,
    )
    _sync_obsidian(
        _DEFAULT_OBSIDIAN_VAULT, _DEFAULT_OBSIDIAN_FOLDER, "Architecture.md",
        f"**Decision:** {decision.strip()}\n\n**Rationale:** {rationale.strip()}{alt_section}",
        source,
    )
    return f"Decision `{eid}` logged ({source})."


@mcp.tool()
def milestone(name: str, description: str) -> str:
    """
    Records a significant milestone with UUID and source attribution.
    Syncs to Obsidian Milestones.md automatically.

    Args:
        name:        Short milestone name
        description: What was achieved
    """
    for val, nm, lim in [
        (name, "name", _SHORT),
        (description, "description", _LONG),
    ]:
        err = _check(val, nm, lim)
        if err:
            return err

    memory_dir, dispatches_dir, db_path = _resolve_paths()
    milestones_file = memory_dir / "milestones.md"
    source = _get_source()
    ts = _now()
    eid = _short_uuid()
    entry = (
        f"\n## {ts} — {name}\n"
        f"*`{eid}` · {source}*\n\n"
        f"{description.strip()}\n\n---\n"
    )
    _prepend_to_file(
        milestones_file,
        "# Project Milestones\n\n*Significant achievements. Newest first.*",
        entry,
    )
    _sync_obsidian(
        _DEFAULT_OBSIDIAN_VAULT, _DEFAULT_OBSIDIAN_FOLDER, "Milestones.md",
        f"### {name}\n\n{description.strip()}", source
    )
    return f"Milestone `{eid}` logged: '{name}' ({source})."


# ══════════════════════════════════════════════════════════════════════════════
# MEMORY TOOLS
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def memory_search(query: str) -> str:
    """Case-insensitive search across all .md files in the memory directory."""
    if not query.strip():
        return "No query provided."
    err = _check(query, "query", _SHORT)
    if err:
        return err
    memory_dir, _, _ = _resolve_paths()
    q = query.lower()
    results: list[str] = []
    for md_file in sorted(memory_dir.glob("*.md")):
        try:
            lines = md_file.read_text(encoding="utf-8").split("\n")
            for i, line in enumerate(lines, 1):
                if q in line.lower():
                    results.append(f"{md_file.name}:{i}: {line.strip()}")
                if len(results) >= 40:
                    break
        except Exception:
            pass
        if len(results) >= 40:
            break
    if not results:
        return f"No matches for '{query}'."
    return f"{len(results)} match(es) for '{query}':\n\n" + "\n".join(results)



# ══════════════════════════════════════════════════════════════════════════════
# v4: REGISTRY HELPERS  (reads ~/.claude/registry.json)
# ══════════════════════════════════════════════════════════════════════════════

def _get_registry_path() -> Path:
    return Path(os.environ.get("CLAUDE_REGISTRY_PATH", str(Path.home() / ".claude" / "registry.json")))


def _read_registry() -> dict:
    rp = _get_registry_path()
    if not rp.exists():
        return {"version": "1", "projects": {}}
    try:
        return json.loads(rp.read_text(encoding="utf-8"))
    except Exception:
        return {"version": "1", "projects": {}}


def _write_registry(reg: dict) -> None:
    rp = _get_registry_path()
    rp.parent.mkdir(parents=True, exist_ok=True)
    reg["updated"] = _now()
    rp.write_text(json.dumps(reg, indent=2) + "\n", encoding="utf-8")


# ══════════════════════════════════════════════════════════════════════════════
# v4: EVENT LOG HELPERS  (appends to <project-XXXX>/events.jsonl)
# ══════════════════════════════════════════════════════════════════════════════

def _get_events_path(ctx: dict | None) -> Path | None:
    """Returns path to events.jsonl for the current project context."""
    if not ctx:
        return None
    # v5: memory_path; v4 backward compat: diary_path
    raw = ctx.get("memory_path") or ctx.get("diary_path")  # diary_path compat
    if not raw:
        return None
    memory_dir = Path(raw).expanduser()
    # memory_path ends with /memory — events.jsonl is one level up
    return memory_dir.parent / "events.jsonl"


def _append_event_py(event_type: str, data: dict, tags: list[str] | None = None) -> dict:
    """Appends an event to the project's events.jsonl. Never raises."""
    ctx = _find_project_context()
    event = {
        "id": str(uuid.uuid4())[:8],
        "ts": _now(),
        "type": event_type,
        "source": _get_source(),
        "project_id": ctx.get("project_id", "default")[:8] if ctx else "default",
        "data": data,
    }
    if tags:
        event["tags"] = tags
    try:
        events_path = _get_events_path(ctx)
        if events_path:
            events_path.parent.mkdir(parents=True, exist_ok=True)
            with events_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(event) + "\n")
    except Exception:
        pass
    return event


def _get_dispatches_dir(ctx: dict | None) -> Path | None:
    """Returns path to dispatches/ for the current project context."""
    if not ctx:
        return None
    # v5: memory_path; v4 backward compat: diary_path
    raw = ctx.get("memory_path") or ctx.get("diary_path")  # diary_path compat
    if not raw:
        return None
    memory_dir = Path(raw).expanduser()
    return memory_dir.parent / "dispatches"


# ══════════════════════════════════════════════════════════════════════════════
# v4: PROJECT INFO & REGISTRY TOOLS
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def get_project_info() -> str:
    """
    Returns full v4 project context including agents, services, automations, tools,
    monitoring config, and runtime paths. More detailed than get_source_info.
    Call when you need the complete project configuration.
    """
    ctx = _find_project_context()
    if not ctx:
        return "No .claude-project found in this directory or any parent."

    memory_dir, dispatches_dir, db_path = _resolve_paths()
    events_path = _get_events_path(ctx)
    dispatches_dir = _get_dispatches_dir(ctx)

    # Count events
    event_count = 0
    if events_path and events_path.exists():
        try:
            event_count = sum(1 for _ in events_path.open(encoding="utf-8"))
        except Exception:
            pass

    # Count dispatches
    pending_dispatches = 0
    if dispatches_dir and dispatches_dir.exists():
        try:
            pending_dispatches = len(list(dispatches_dir.glob("*.json")))
        except Exception:
            pass

    lines = [
        f"## Project: {ctx.get('name')} (v{ctx.get('version', '3')})",
        f"**ID:** `{ctx.get('project_id', '?')[:8]}`",
        f"**Description:** {ctx.get('description', '(none)')}",
        f"**Stage:** {ctx.get('stage', '(none)')}",
        f"**Created:** {ctx.get('created', '?')} by {ctx.get('created_by', '?')}",
        "",
        "### Runtime Paths",
        f"- Memory: `{memory_dir}`",
        f"- Events: `{events_path}` ({event_count} events)",
        f"- Dispatches: `{dispatches_dir}` ({pending_dispatches} pending)",
        f"- Obsidian sync: {'enabled' if _OBSIDIAN_ENABLED else 'disabled'}",
        "",
    ]

    # Agents
    agents = ctx.get("agents", {})
    if agents:
        lines.append(f"### Agents ({len(agents)})")
        for aname, adef in agents.items():
            lines.append(f"- **{aname}**: {adef.get('role', '?')} ({adef.get('model', 'default model')})")
        lines.append("")

    # Services
    services = ctx.get("services", {})
    if services:
        lines.append(f"### Services ({len(services)})")
        for sname, sdef in services.items():
            lines.append(f"- **{sname}**: {sdef.get('type', '?')} — {sdef.get('url', sdef.get('command', '?'))} — {sdef.get('description', '')}")
        lines.append("")

    # Automations
    automations = ctx.get("automations", [])
    if automations:
        lines.append(f"### Automations ({len(automations)})")
        for auto in automations:
            enabled = "✓" if auto.get("enabled", True) else "✗"
            lines.append(f"- {enabled} **{auto.get('id', '?')}**: {auto.get('description', '?')}")
        lines.append("")

    # Tools
    tools = ctx.get("tools", {})
    if tools:
        lines.append(f"### Tools ({len(tools)})")
        for tname, tdef in tools.items():
            lines.append(f"- **{tname}**: `{tdef.get('command', '?')}` — {tdef.get('description', '')}")
        lines.append("")

    # Monitoring
    monitoring = ctx.get("monitoring", {})
    if monitoring:
        lines.append("### Monitoring")
        lines.append(f"- Enabled: {monitoring.get('enabled', True)}")
        lines.append(f"- Log retention: {monitoring.get('log_retention_days', 90)} days")
        lines.append(f"- Health interval: {monitoring.get('healthcheck_interval_seconds', 60)}s")

    return "\n".join(lines)


@mcp.tool()
def list_projects() -> str:
    """
    Lists all Claude projects registered on this machine (from ~/.claude/registry.json).
    Much faster than a filesystem scan. Updated by 'claude-project daemon' or 'init'.
    """
    reg = _read_registry()
    projects = reg.get("projects", {})

    if not projects:
        return (
            "No projects in registry yet.\n"
            "Run: claude-project init <name>\n"
            "Or:  claude-project daemon install  (to auto-populate via daemon)"
        )

    # Sort by last_seen descending
    sorted_projects = sorted(
        projects.values(),
        key=lambda p: p.get("last_seen", ""),
        reverse=True,
    )

    lines = [
        f"## {len(sorted_projects)} project(s) on {reg.get('machine', 'this machine')}",
        f"Registry: `{_get_registry_path()}`",
        f"Updated: {reg.get('updated', '?')}",
        "",
    ]
    for p in sorted_projects:
        stage = f"  [{p['stage']}]" if p.get("stage") else ""
        lines.append(f"### ⬡ {p['name']}  ({p['project_id'][:8]}){stage}")
        lines.append(f"- **Description:** {p.get('description', '(none)')}")
        lines.append(f"- **Path:** `{p.get('project_dir', '?')}`")
        lines.append(f"- **Version:** v{p.get('version', '3')}")
        lines.append(f"- **Last seen:** {p.get('last_seen', '?')}")
        lines.append("")

    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# v4: EVENT LOG TOOLS
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def log_event(event_type: str, summary: str, tags: str = "") -> str:
    """
    Appends a structured event to the project's append-only event log (events.jsonl).
    Use this to record any significant action, decision, tool call, or state change.

    Args:
        event_type: Type identifier, e.g. 'tool_call', 'session_start', 'deploy', 'custom'
        summary:    Human-readable description of what happened
        tags:       Optional comma-separated tags for filtering, e.g. 'deploy,prod'
    """
    for val, name, lim in [
        (event_type, "event_type", _SHORT),
        (summary, "summary", _MEDIUM),
        (tags, "tags", _SHORT),
    ]:
        err = _check(val, name, lim)
        if err:
            return err

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags.strip() else []
    event = _append_event_py(event_type, {"summary": summary}, tag_list if tag_list else None)
    return f"Event `{event['id']}` logged: [{event_type}] {summary} ({event['source']})"


@mcp.tool()
def get_events(limit: int = 20, event_type: str = "") -> str:
    """
    Returns the most recent events from the project's event log.
    Optionally filter by event_type.

    Args:
        limit:      Number of events to return (max 100, default 20)
        event_type: Filter to only this type, e.g. 'session_start' (empty = all types)
    """
    limit = min(max(int(limit), 1), 100)
    ctx = _find_project_context()
    events_path = _get_events_path(ctx)

    if not events_path or not events_path.exists():
        return "No events log found for this project. Log events with log_event()."

    try:
        lines = events_path.read_text(encoding="utf-8").strip().split("\n")
        events = []
        for line in lines:
            if not line.strip():
                continue
            try:
                e = json.loads(line)
                events.append(e)
            except Exception:
                pass

        if event_type.strip():
            events = [e for e in events if e.get("type") == event_type.strip()]

        recent = events[-limit:]
        recent.reverse()  # newest first

        if not recent:
            filter_note = f" of type '{event_type}'" if event_type.strip() else ""
            return f"No events{filter_note} found."

        result_lines = [f"## Last {len(recent)} event(s)", ""]
        for e in recent:
            tags = f"  [{', '.join(e['tags'])}]" if e.get("tags") else ""
            summary = e.get("data", {}).get("summary", json.dumps(e.get("data", {}))[:80])
            result_lines.append(
                f"- `{e['id']}` **{e['type']}**{tags}  {e['ts'][:19]}  _{e['source']}_\n"
                f"  {summary}"
            )

        return "\n".join(result_lines)

    except Exception as ex:
        return f"Error reading events: {ex}"


# ══════════════════════════════════════════════════════════════════════════════
# v4: DISPATCH QUEUE TOOLS
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def create_dispatch(title: str, body: str, priority: str = "normal") -> str:
    """
    Creates a task dispatch — a queued unit of work for Claude or a sub-agent.
    Stored as a JSON file in the project's dispatches/ directory.
    Use this to queue tasks that should happen asynchronously or in a future session.

    Args:
        title:    Short task title, e.g. 'Review API docs', 'Run integration tests'
        body:     Full task description with context and acceptance criteria
        priority: 'low', 'normal', or 'high' (default: 'normal')
    """
    for val, name, lim in [
        (title, "title", _SHORT),
        (body, "body", _LONG),
        (priority, "priority", 20),
    ]:
        err = _check(val, name, lim)
        if err:
            return err

    if priority not in ("low", "normal", "high"):
        priority = "normal"

    ctx = _find_project_context()
    dispatches_dir = _get_dispatches_dir(ctx)
    if not dispatches_dir:
        return "No .claude-project found. Cannot create dispatch without project context."

    dispatches_dir.mkdir(parents=True, exist_ok=True)

    dispatch_id = _short_uuid()
    ts = _now()
    source = _get_source()

    dispatch = {
        "id": dispatch_id,
        "created_at": ts,
        "created_by": source,
        "status": "pending",
        "priority": priority,
        "title": title,
        "body": body,
        "project_id": ctx.get("project_id", "")[:8] if ctx else "",
    }

    dispatch_file = dispatches_dir / f"{dispatch_id}.json"
    dispatch_file.write_text(json.dumps(dispatch, indent=2) + "\n", encoding="utf-8")

    _append_event_py("dispatch_created", {"dispatch_id": dispatch_id, "title": title, "priority": priority})

    return (
        f"Dispatch `{dispatch_id}` created (priority: {priority})\n"
        f"Title: {title}\n"
        f"File:  {dispatch_file}"
    )


@mcp.tool()
def list_dispatches(status: str = "pending") -> str:
    """
    Lists task dispatches in the project's dispatch queue.

    Args:
        status: Filter by status — 'pending', 'completed', 'failed', or 'all' (default: 'pending')
    """
    ctx = _find_project_context()
    dispatches_dir = _get_dispatches_dir(ctx)

    if not dispatches_dir or not dispatches_dir.exists():
        return "No dispatches directory found. Create one with create_dispatch()."

    files = sorted(dispatches_dir.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
    dispatches = []
    for f in files:
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            dispatches.append(d)
        except Exception:
            pass

    if status != "all":
        dispatches = [d for d in dispatches if d.get("status") == status]

    if not dispatches:
        return f"No {status} dispatches found."

    lines = [f"## {len(dispatches)} {status} dispatch(es)", ""]
    for d in dispatches:
        pri_icon = {"high": "🔴", "normal": "🟡", "low": "🔵"}.get(d.get("priority", "normal"), "⚪")
        lines.append(
            f"- `{d['id']}` {pri_icon} **{d.get('title', '?')}**  "
            f"[{d.get('status', '?')}]  {d.get('created_at', '?')[:19]}"
        )
        if d.get("body"):
            lines.append(f"  {d['body'][:120]}{'...' if len(d.get('body','')) > 120 else ''}")
        lines.append("")

    return "\n".join(lines)


@mcp.tool()
def complete_dispatch(dispatch_id: str, outcome: str = "") -> str:
    """
    Marks a dispatch as completed and records the outcome.

    Args:
        dispatch_id: The 8-char ID of the dispatch (from list_dispatches)
        outcome:     Optional description of what was done / the result
    """
    err = _check(dispatch_id, "dispatch_id", 20)
    if err:
        return err

    ctx = _find_project_context()
    dispatches_dir = _get_dispatches_dir(ctx)

    if not dispatches_dir or not dispatches_dir.exists():
        return "No dispatches directory found."

    # Find the file
    matches = list(dispatches_dir.glob(f"{dispatch_id}*.json"))
    if not matches:
        return f"Dispatch `{dispatch_id}` not found."

    dispatch_file = matches[0]
    try:
        d = json.loads(dispatch_file.read_text(encoding="utf-8"))
    except Exception as ex:
        return f"Could not read dispatch file: {ex}"

    d["status"] = "completed"
    d["completed_at"] = _now()
    d["completed_by"] = _get_source()
    if outcome.strip():
        d["outcome"] = outcome.strip()

    dispatch_file.write_text(json.dumps(d, indent=2) + "\n", encoding="utf-8")
    _append_event_py("dispatch_completed", {
        "dispatch_id": dispatch_id,
        "title": d.get("title", ""),
        "outcome": outcome,
    })

    return f"Dispatch `{dispatch_id}` marked as completed ({_get_source()})."


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 5 — Agent-Optimized Database Layer
# SQLite + LanceDB for semantic memory, file summaries, session state
# ══════════════════════════════════════════════════════════════════════════════

import sqlite3
import hashlib
import threading
from typing import Optional

try:
    import lancedb as _lancedb_mod
    _LANCEDB_AVAILABLE = True
except ImportError:
    _LANCEDB_AVAILABLE = False

_EMBED_MODEL = None

def _get_embed_model():
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        from sentence_transformers import SentenceTransformer
        _EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _EMBED_MODEL

def _get_db_paths(memory_dir: Path) -> dict:
    project_dir = memory_dir.parent
    return {
        "sqlite":  project_dir / "research.db",
        "lancedb": project_dir / "vectors",
    }

def _init_sqlite_v5(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY, category TEXT NOT NULL,
            text TEXT NOT NULL, text_hash TEXT NOT NULL,
            project_id TEXT NOT NULL, source TEXT NOT NULL,
            tags TEXT, created_at TEXT NOT NULL, updated_at TEXT
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS file_summaries (
            path TEXT NOT NULL, project_id TEXT NOT NULL,
            summary TEXT NOT NULL, summary_hash TEXT NOT NULL,
            file_hash TEXT NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY (path, project_id)
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS session_state (
            project_id TEXT PRIMARY KEY, stage TEXT,
            blockers TEXT, open_questions TEXT,
            critical_facts TEXT, last_session_summary TEXT,
            updated_at TEXT NOT NULL
        )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mem_project ON memories(project_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mem_category ON memories(category)")
    try:
        conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(id, text, category)")
    except Exception:
        pass
    conn.commit()
    return conn

def _init_lancedb_v5(lancedb_path: Path):
    if not _LANCEDB_AVAILABLE:
        return None
    lancedb_path.mkdir(parents=True, exist_ok=True)
    db = _lancedb_mod.connect(str(lancedb_path))
    if "memory_vec" not in db.table_names():
        import pyarrow as pa
        db.create_table("memory_vec", schema=pa.schema([
            pa.field("id", pa.string()), pa.field("vector", pa.list_(pa.float32(), 384)),
            pa.field("category", pa.string()), pa.field("text", pa.string()),
            pa.field("project_id", pa.string()), pa.field("ts", pa.string()),
        ]))
    if "file_summaries_vec" not in db.table_names():
        import pyarrow as pa
        db.create_table("file_summaries_vec", schema=pa.schema([
            pa.field("path", pa.string()), pa.field("vector", pa.list_(pa.float32(), 384)),
            pa.field("project_id", pa.string()), pa.field("summary", pa.string()),
        ]))
    return db

def _get_source_structured() -> dict:
    return {
        "device_id": socket.gethostname(),
        "hostname": socket.gethostname().lower(),
        "user": os.getenv("USER", "unknown"),
        "ssh_client": os.getenv("SSH_CLIENT"),
    }

def _async_obsidian_export(category: str, text: str, entry_id: str):
    """Fire-and-forget Obsidian export — never blocks the caller."""
    if not _OBSIDIAN_ENABLED:
        return
    ctx = _find_project_context()
    if not ctx:
        return
    if not ctx.get("obsidian_sync", {}).get("enabled", False):
        return
    def _export():
        try:
            pass  # placeholder — obsidian write logic would go here
        except Exception:
            pass
    threading.Thread(target=_export, daemon=True).start()


@mcp.tool()
def store_memory(category: str, text: str, tags: Optional[list] = None) -> dict:
    """
    Store a typed memory entry.
    category: decision | discovery | fact | milestone | question
    Returns: {id, category, text_hash}
    """
    valid = ("decision", "discovery", "fact", "milestone", "question")
    if category not in valid:
        return {"error": f"Invalid category. Use one of: {' | '.join(valid)}"}

    memory_dir, _, _ = _resolve_paths()
    db_paths   = _get_db_paths(memory_dir)
    conn       = _init_sqlite_v5(db_paths["sqlite"])
    lance_db   = _init_lancedb_v5(db_paths["lancedb"])
    project_id = _current_project_id()
    entry_id   = str(uuid.uuid4())[:8]
    text_hash  = hashlib.sha256(text.encode()).hexdigest()[:16]
    source     = json.dumps(_get_source_structured())
    now        = datetime.now(timezone.utc).isoformat()

    conn.execute(
        "INSERT INTO memories (id, category, text, text_hash, project_id, source, tags, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (entry_id, category, text, text_hash, project_id, source, json.dumps(tags or []), now)
    )
    try:
        conn.execute("INSERT INTO memories_fts (id, text, category) VALUES (?,?,?)", (entry_id, text, category))
    except Exception:
        pass
    conn.commit()

    if lance_db is not None:
        try:
            vector = _get_embed_model().encode(text).tolist()
            lance_db.open_table("memory_vec").add([{
                "id": entry_id, "vector": vector, "category": category,
                "text": text, "project_id": project_id, "ts": now,
            }])
        except Exception:
            pass

    _async_obsidian_export(category, text, entry_id)
    conn.close()
    return {"id": entry_id, "category": category, "text_hash": text_hash}


@mcp.tool()
def query_memory(query: str, category: Optional[str] = None, limit: int = 5) -> list:
    """
    Semantic search over stored memories. Returns [{id, category, text, score}].
    Prefer this over reading memory files directly.
    """
    memory_dir, _, _ = _resolve_paths()
    db_paths   = _get_db_paths(memory_dir)
    project_id = _current_project_id()

    if _LANCEDB_AVAILABLE:
        try:
            lance_db  = _init_lancedb_v5(db_paths["lancedb"])
            query_vec = _get_embed_model().encode(query).tolist()
            results   = (
                lance_db.open_table("memory_vec")
                .search(query_vec)
                .where(f"project_id = '{project_id}'")
                .limit(limit)
                .to_list()
            )
            if category:
                results = [r for r in results if r["category"] == category]
            return [{"id": r["id"], "category": r["category"],
                     "text": r["text"][:500], "score": round(float(r["_distance"]), 4)}
                    for r in results]
        except Exception:
            pass

    # FTS5 fallback
    conn = _init_sqlite_v5(db_paths["sqlite"])
    try:
        rows = conn.execute(
            "SELECT id, category, text FROM memories_fts WHERE memories_fts MATCH ? AND id IN (SELECT id FROM memories WHERE project_id=?) LIMIT ?",
            (query, project_id, limit)
        ).fetchall()
    except Exception:
        rows = conn.execute(
            "SELECT id, category, text FROM memories WHERE project_id=? AND text LIKE ? LIMIT ?",
            (project_id, f"%{query}%", limit)
        ).fetchall()
    conn.close()
    return [{"id": r["id"], "category": r["category"], "text": r["text"][:500], "score": None} for r in rows]


@mcp.tool()
def telemetry_preview() -> dict:
    """
    Show exactly what would be sent to the telemetry endpoint for the last dispatch.
    Call this to verify what data is shared before enabling telemetry.
    Returns the exact JSON payload — no surprises.
    """
    import sqlite3 as _sqlite3
    import hashlib as _hashlib
    memory_dir, _, db_path = _resolve_paths()
    research_db = db_path.parent / "research.db"

    if not research_db.exists():
        return {"error": "No research.db found — run a dispatch first"}

    conn = _sqlite3.connect(str(research_db))
    conn.row_factory = _sqlite3.Row
    row = conn.execute("""
        SELECT task_type, protocol_condition, tokens_total_input, tokens_output,
               tokens_cache_read, tokens_cache_write, compression_ratio,
               latency_total_ms, outcome, iterations
        FROM dispatch_observations
        ORDER BY ts DESC LIMIT 1
    """).fetchone()
    conn.close()

    if not row:
        return {"error": "No observations yet — run a dispatch first"}

    raw = f"{socket.gethostname()}:{os.environ.get('USER', 'unknown')}"
    installation_id = _hashlib.sha256(raw.encode()).hexdigest()[:16]

    return {
        "installation_id": installation_id,
        "project_id": "[sha256 of project path]",
        "schema_version": "1.0",
        "task_type": row["task_type"],
        "protocol_condition": row["protocol_condition"],
        "tokens_input": row["tokens_total_input"],
        "tokens_output": row["tokens_output"],
        "tokens_cache_read": row["tokens_cache_read"],
        "tokens_cache_write": row["tokens_cache_write"],
        "compression_ratio": row["compression_ratio"],
        "latency_total_ms": row["latency_total_ms"],
        "outcome": row["outcome"],
        "iterations": row["iterations"],
        "ts": "[date only — no sub-second]",
        "_note": "This is ALL that gets sent. No code, no prompts, no paths.",
    }


@mcp.tool()
def get_context() -> dict:
    """
    Compact typed session state. Call at every session start.
    Returns: {stage, blockers, open_questions, critical_facts, last_session_summary}
    """
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite_v5(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    row        = conn.execute("SELECT * FROM session_state WHERE project_id=?", (project_id,)).fetchone()
    conn.close()
    if not row:
        return {"stage": "unknown", "blockers": [], "open_questions": [], "critical_facts": [], "last_session_summary": None}
    return {
        "stage":                row["stage"],
        "blockers":             json.loads(row["blockers"] or "[]"),
        "open_questions":       json.loads(row["open_questions"] or "[]"),
        "critical_facts":       json.loads(row["critical_facts"] or "[]"),
        "last_session_summary": row["last_session_summary"],
    }


@mcp.tool()
def set_context(stage: Optional[str] = None, blockers: Optional[list] = None,
                open_questions: Optional[list] = None, critical_facts: Optional[list] = None,
                last_session_summary: Optional[str] = None) -> dict:
    """Update typed session state. Only provided fields are written. Others unchanged."""
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite_v5(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    now        = datetime.now(timezone.utc).isoformat()
    existing   = conn.execute("SELECT * FROM session_state WHERE project_id=?", (project_id,)).fetchone()

    if existing:
        updates = {"updated_at": now}
        if stage is not None:                updates["stage"] = stage
        if blockers is not None:             updates["blockers"] = json.dumps(blockers)
        if open_questions is not None:       updates["open_questions"] = json.dumps(open_questions)
        if critical_facts is not None:       updates["critical_facts"] = json.dumps(critical_facts)
        if last_session_summary is not None: updates["last_session_summary"] = last_session_summary
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE session_state SET {set_clause} WHERE project_id=?",
                     (*updates.values(), project_id))
    else:
        conn.execute(
            "INSERT INTO session_state (project_id, stage, blockers, open_questions, critical_facts, last_session_summary, updated_at) VALUES (?,?,?,?,?,?,?)",
            (project_id, stage, json.dumps(blockers or []), json.dumps(open_questions or []),
             json.dumps(critical_facts or []), last_session_summary, now)
        )
    conn.commit()
    conn.close()
    return {"updated": True, "project_id": project_id}


@mcp.tool()
def set_file_summary(file_path: str, summary: str) -> dict:
    """
    Store a 1-line semantic summary for a file (~15 tokens vs reading the full file).
    Always call after analysing any file. Prevents token waste on re-reads.
    """
    memory_dir, _, _ = _resolve_paths()
    db_paths   = _get_db_paths(memory_dir)
    conn       = _init_sqlite_v5(db_paths["sqlite"])
    lance_db   = _init_lancedb_v5(db_paths["lancedb"])
    project_id = _current_project_id()
    now        = datetime.now(timezone.utc).isoformat()

    full_path = os.path.join(os.getcwd(), file_path) if not os.path.isabs(file_path) else file_path
    file_hash = ""
    if os.path.exists(full_path):
        with open(full_path, "rb") as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()[:16]

    summary_hash = hashlib.sha256(summary.encode()).hexdigest()[:16]
    conn.execute(
        "INSERT OR REPLACE INTO file_summaries (path, project_id, summary, summary_hash, file_hash, updated_at) VALUES (?,?,?,?,?,?)",
        (file_path, project_id, summary, summary_hash, file_hash, now)
    )
    conn.commit()

    if lance_db is not None:
        try:
            vector = _get_embed_model().encode(summary).tolist()
            tbl = lance_db.open_table("file_summaries_vec")
            tbl.delete(f"path = '{file_path}'")
            tbl.add([{"path": file_path, "vector": vector, "project_id": project_id, "summary": summary}])
        except Exception:
            pass

    conn.close()
    return {"path": file_path, "summary_hash": summary_hash, "file_hash": file_hash}


@mcp.tool()
def get_file_summary(file_path: str) -> dict:
    """
    Get stored 1-line summary for a file. Always call this before reading a file.
    Returns: {found, path, summary, is_stale, updated_at}
    """
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite_v5(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    row        = conn.execute(
        "SELECT * FROM file_summaries WHERE path=? AND project_id=?", (file_path, project_id)
    ).fetchone()
    conn.close()

    if not row:
        return {"found": False, "path": file_path}

    full_path = os.path.join(os.getcwd(), file_path) if not os.path.isabs(file_path) else file_path
    current_hash = ""
    if os.path.exists(full_path):
        with open(full_path, "rb") as f:
            current_hash = hashlib.sha256(f.read()).hexdigest()[:16]
    return {
        "found": True, "path": file_path, "summary": row["summary"],
        "is_stale": current_hash != row["file_hash"] if current_hash else False,
        "updated_at": row["updated_at"],
    }


@mcp.tool()
def find_related_files(query: str, limit: int = 5) -> list:
    """Semantic search over file summaries. Returns relevant files without reading them."""
    memory_dir, _, _ = _resolve_paths()
    db_paths   = _get_db_paths(memory_dir)
    project_id = _current_project_id()

    if _LANCEDB_AVAILABLE:
        try:
            lance_db  = _init_lancedb_v5(db_paths["lancedb"])
            query_vec = _get_embed_model().encode(query).tolist()
            results   = (
                lance_db.open_table("file_summaries_vec")
                .search(query_vec)
                .where(f"project_id = '{project_id}'")
                .limit(limit)
                .to_list()
            )
            return [{"path": r["path"], "summary": r["summary"],
                     "score": round(float(r["_distance"]), 4)} for r in results]
        except Exception:
            pass

    conn = _init_sqlite_v5(db_paths["sqlite"])
    rows = conn.execute(
        "SELECT path, summary FROM file_summaries WHERE project_id=? AND summary LIKE ? LIMIT ?",
        (project_id, f"%{query}%", limit)
    ).fetchall()
    conn.close()
    return [{"path": r["path"], "summary": r["summary"], "score": None} for r in rows]


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 8 — Compression Layer: LLMLingua + dispatch_task full pipeline tool
# ══════════════════════════════════════════════════════════════════════════════

_LINGUA_COMPRESSOR = None


def _get_lingua_compressor():
    """Lazy-load LLMLingua-2. Returns 'unavailable' string on failure — callers must check."""
    global _LINGUA_COMPRESSOR
    if _LINGUA_COMPRESSOR is None:
        try:
            from llmlingua import PromptCompressor
            _LINGUA_COMPRESSOR = PromptCompressor(
                model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank",
                use_llmlingua2=True,
                device_map="cpu",
            )
        except Exception as e:
            print(f"[compression] LLMLingua unavailable: {e}. Using passthrough.")
            _LINGUA_COMPRESSOR = "unavailable"
    return _LINGUA_COMPRESSOR


def compress_natural_language(text: str, target_ratio: float = 0.6) -> dict:
    """
    Compress natural-language text using LLMLingua-2.
    ONLY call on natural_language format dispatches — never on typed_pseudocode/DSL/TOON.
    """
    import time
    start = time.monotonic()
    original_chars = len(text)

    compressor = _get_lingua_compressor()
    if compressor == "unavailable" or len(text) < 200:
        return {
            "compressed": text, "original_chars": original_chars,
            "compressed_chars": original_chars, "ratio": 1.0,
            "latency_ms": 0, "passthrough": True,
        }

    try:
        result = compressor.compress_prompt(
            text,
            rate=target_ratio,
            force_tokens=["\n", ".", "!", "?"],
            drop_consecutive=True,
        )
        compressed = result["compressed_prompt"]
        latency_ms = int((time.monotonic() - start) * 1000)
        return {
            "compressed": compressed,
            "original_chars": original_chars,
            "compressed_chars": len(compressed),
            "ratio": round(len(compressed) / original_chars, 4),
            "latency_ms": latency_ms,
            "passthrough": False,
        }
    except Exception as e:
        return {
            "compressed": text, "original_chars": original_chars,
            "compressed_chars": original_chars, "ratio": 1.0,
            "latency_ms": 0, "passthrough": True, "error": str(e),
        }


@mcp.tool()
def dispatch_task(title: str, body: str, agent: Optional[str] = None,
                  priority: str = "normal", context: Optional[str] = None) -> dict:
    """
    Full-pipeline dispatch: Clarity Layer → LLMLingua compression → Submit.
    Prefer over raw dispatch for all natural language inputs.
    Returns: {dispatch_id, task_type, clarity_passthrough, compression_ratio, original_chars, final_chars}
    """
    import sys as _sys2
    _sys2.path.insert(0, str(Path(__file__).parent))
    from clarity_layer import clarify
    from task_classifier_py import classify_task_type
    import time

    timings = {}

    # Step 1: Clarity Layer
    clarity_result = clarify(body, context=context)
    timings["clarity_ms"] = clarity_result["latency_ms"]
    clean_body = clarity_result["output"]

    # Step 2: Classify then compress (only NL tasks)
    task_type = classify_task_type(title, clean_body)
    compress_result = {"ratio": 1.0, "passthrough": True, "latency_ms": 0}
    if task_type in ("planning", "documentation", "unknown"):
        compress_result = compress_natural_language(clean_body, target_ratio=0.65)
        clean_body = compress_result["compressed"]
    timings["compression_ms"] = compress_result.get("latency_ms", 0)

    # Step 3: Create dispatch file
    memory_dir, dispatches_dir, _ = _resolve_paths()
    dispatch_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()

    dispatch_data = {
        "id": dispatch_id, "title": title, "body": clean_body,
        "original_body_chars": len(body), "encoded_body_chars": len(clean_body),
        "compression_ratio": compress_result["ratio"],
        "task_type": task_type, "agent": agent, "priority": priority,
        "status": "pending", "created": now, "protocol_condition": "natural_language",
    }
    with open(dispatches_dir / f"{dispatch_id}.json", "w") as f:
        json.dump(dispatch_data, f, indent=2)

    return {
        "dispatch_id": dispatch_id, "task_type": task_type,
        "clarity_passthrough": clarity_result["passthrough"],
        "compression_ratio": compress_result["ratio"],
        "original_chars": len(body), "final_chars": len(clean_body),
        "timings_ms": timings,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 6 — Protocol Document Registry MCP Tools
# ══════════════════════════════════════════════════════════════════════════════

import sys as _sys
_sys.path.insert(0, str(Path(__file__).parent))
from pd_registry import (
    register_pd_entry, get_pd_entry, search_pd_entries,
    log_pd_use, deprecate_pd, increment_interaction_count,
)

_PD_NEGOTIATION_THRESHOLD = 3


@mcp.tool()
def register_pd(text: str, task_type: str, interaction_pair: str) -> dict:
    """
    Register a new Protocol Document (content-addressed by SHA-256).
    Returns {id, is_new}. Identical text always returns the same id — no duplicates.
    Call search_pd first to avoid creating redundant PDs.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite_v5(_get_db_paths(memory_dir)["sqlite"])
    result = register_pd_entry(conn, text, task_type, interaction_pair, created_by="negotiation_controller")
    conn.close()
    return result


@mcp.tool()
def get_pd(pd_id: str) -> dict:
    """
    Retrieve a Protocol Document by its SHA-256 id.
    Returns {found, id, text, task_type, interaction_pair, use_count, deprecated}.
    """
    memory_dir, _, _ = _resolve_paths()
    conn  = _init_sqlite_v5(_get_db_paths(memory_dir)["sqlite"])
    entry = get_pd_entry(conn, pd_id)
    conn.close()
    if not entry:
        return {"found": False, "id": pd_id}
    return {
        "found": True,
        "id": entry["id"], "text": entry["text"],
        "task_type": entry["task_type"], "interaction_pair": entry["interaction_pair"],
        "use_count": entry["use_count"], "created_at": entry["created_at"],
        "deprecated": bool(entry["deprecated"]), "superseded_by": entry["superseded_by"],
    }


@mcp.tool()
def search_pd(task_type: Optional[str] = None, interaction_pair: Optional[str] = None,
              limit: int = 5) -> list:
    """
    Find existing Protocol Documents. Always call this before negotiating a new PD.
    Returns [{id, task_type, interaction_pair, use_count, created_at}] ordered by use_count.
    """
    memory_dir, _, _ = _resolve_paths()
    conn    = _init_sqlite_v5(_get_db_paths(memory_dir)["sqlite"])
    results = search_pd_entries(conn, task_type, interaction_pair, limit)
    conn.close()
    return results


@mcp.tool()
def log_pd_usage(pd_id: str, dispatch_id: str, tokens_saved: Optional[int] = None) -> dict:
    """
    Record a PD usage event and increment its use_count.
    tokens_saved: estimated tokens saved vs natural-language baseline.
    """
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite_v5(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    session_id = os.getenv("CLAUDE_SESSION_ID", "unknown")
    log_pd_use(conn, pd_id, dispatch_id, session_id, project_id, tokens_saved)
    conn.close()
    return {"logged": True, "pd_id": pd_id}


@mcp.tool()
def check_negotiation_threshold(interaction_pair: str) -> dict:
    """
    Check if an interaction pair has reached the PD negotiation threshold (default 3).
    Returns {pair, count, threshold, should_negotiate, existing_pd_id}.
    Call at dispatch start to decide whether to trigger the negotiation_controller.
    """
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite_v5(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()

    row = conn.execute(
        "SELECT count, pd_assigned FROM interaction_counts WHERE pair=? AND project_id=?",
        (interaction_pair, project_id)
    ).fetchone()
    count       = row["count"]      if row else 0
    pd_assigned = row["pd_assigned"] if row else None

    # Increment counter for this interaction
    increment_interaction_count(conn, interaction_pair, project_id)
    conn.close()

    return {
        "pair": interaction_pair,
        "count": count + 1,
        "threshold": _PD_NEGOTIATION_THRESHOLD,
        "should_negotiate": (count + 1) >= _PD_NEGOTIATION_THRESHOLD and pd_assigned is None,
        "existing_pd_id": pd_assigned,
    }


# ══════════════════════════════════════════════════════════════════════════════
# SKILLS — discovery and loading
# ══════════════════════════════════════════════════════════════════════════════

def _skills_dir() -> Path:
    """Resolve .claude/skills/ relative to the project root (CWD upward, same as .claude-project)."""
    ctx = _find_project_context()
    if ctx and ctx.get("_project_file"):
        base = Path(ctx["_project_file"]).parent
    else:
        base = Path(os.environ.get("CLAUDE_PROJECT_DIR", Path.cwd()))
    return base / ".claude" / "skills"


@mcp.tool()
def list_skills() -> list:
    """
    List all available skills in .claude/skills/.
    Returns [{name, description, path}] — description is the first non-empty line after the h1.
    Call at session start or before beginning a task type you haven't done recently.
    """
    skills_dir = _skills_dir()
    if not skills_dir.exists():
        return []

    results = []
    for md_file in sorted(skills_dir.glob("*.md")):
        name = md_file.stem
        description = ""
        try:
            lines = md_file.read_text().splitlines()
            # Find "## When to load" section and grab its first content line
            for i, line in enumerate(lines):
                if line.startswith("## When to load"):
                    for j in range(i + 1, min(i + 4, len(lines))):
                        stripped = lines[j].strip()
                        if stripped:
                            description = stripped
                            break
                    break
        except Exception:
            pass
        results.append({"name": name, "description": description, "path": str(md_file)})

    return results


@mcp.tool()
def load_skill(name: str) -> str:
    """
    Load the full content of a skill by name (without .md extension).
    Example: load_skill("dispatch") returns the dispatch skill guide.
    Use list_skills() to see available names.
    """
    if not name or "/" in name or ".." in name:
        return "ERROR: invalid skill name"

    skills_dir = _skills_dir()
    skill_file = skills_dir / f"{name}.md"

    if not skill_file.exists():
        available = [f.stem for f in skills_dir.glob("*.md")] if skills_dir.exists() else []
        return f"Skill '{name}' not found. Available: {', '.join(sorted(available))}"

    return skill_file.read_text()


# ══════════════════════════════════════════════════════════════════════════════
# Entry point
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Claude Diary MCP Server v2 — stdio (default) or HTTP/SSE (--http)"
    )
    parser.add_argument("--http", action="store_true", help="Run in HTTP/SSE mode")
    parser.add_argument("--port", type=int, default=8765, help="HTTP port (default 8765)")
    args = parser.parse_args()

    if args.http:
        import uvicorn
        TOKEN = _get_or_create_token()
        MID   = _get_or_create_machine_id()
        print(f"\n  Claude Diary v2 — HTTP/SSE")
        print(f"  Source: {_get_source()}")
        print(f"  http://127.0.0.1:{args.port}/sse")
        print(f"  Token: {TOKEN}\n")
        _audit("SERVER_START http", f"127.0.0.1:{args.port}")
        mcp.settings.port = args.port
        mcp.settings.host = "127.0.0.1"
        base_app = mcp.sse_app()
        protected_app = _build_protected_app(base_app, TOKEN)
        uvicorn.run(protected_app, host="127.0.0.1", port=args.port, log_level="warning")
    else:
        _audit("SERVER_START stdio")
        mcp.run(transport="stdio")
