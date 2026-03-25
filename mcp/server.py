#!/usr/bin/env python3
"""
Claude Diary — MCP Memory Server v3
=====================================
Persistent memory, project context, and Obsidian sync for Claude across all surfaces.
Bundled inside @claudelab/project — invoked via: claude-project mcp

Features:
  • Source attribution  — every entry records who/where wrote it
                          (MacBook/gebruiker, MacBook/lab, SSH→Pi5, Thinkpad/direct, etc.)
  • UUID per entry      — every journal/discovery/decision/milestone gets a short UUID
  • Project context     — reads .claude-project v3 from CWD upward (like .git)
  • Obsidian sync       — every write mirrors to the Obsidian vault, silently
  • Dynamic MEMORY_DIR  — routes to the right project's memory folder automatically
  • Schema v3           — .claude-project files validated against claude-project.schema.json

Run modes:
  python3 server.py              → stdio (default, for Claude Code)
  python3 server.py --http       → HTTP/SSE on localhost:8765
  claude-project mcp             → same as stdio, invoked by the CLI

Memory files live in:
  Per project:  <project.diary_path>/   (from .claude-project)
  Default:      ~/.claude/projects/-Users-gebruiker-WirePod/memory/

Obsidian vault: /Volumes/ClaudeLab/Knowledge/obsidian-vault/
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
#   CLAUDE_DIARY_PATH       — default memory directory when no .claude-project found
#   CLAUDE_OBSIDIAN_VAULT   — path to your Obsidian vault root
#   CLAUDE_OBSIDIAN_FOLDER  — default subfolder inside the vault

_DEFAULT_MEMORY_DIR = Path(
    os.environ.get("CLAUDE_DIARY_PATH", str(Path.home() / ".claude" / "memory"))
)
_DEFAULT_OBSIDIAN_VAULT = Path(
    os.environ.get("CLAUDE_OBSIDIAN_VAULT", str(Path.home() / ".claude" / "obsidian"))
)
_DEFAULT_OBSIDIAN_FOLDER = os.environ.get("CLAUDE_OBSIDIAN_FOLDER", "Projects/Unsorted")

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
    Returns a human-readable source label for Obsidian entries:
      MacBook / gebruiker
      MacBook / lab
      SSH → Pi5 (192.168.x.x)
      SSH → Thinkpad (192.168.x.x)
      Pi5 / direct
      Thinkpad / direct
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
        return f"MacBook / {user}"
    elif hostname.endswith(".local"):
        # macOS default — hostname is <name>.local
        return f"MacBook / {user}"
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


def _resolve_paths() -> tuple[Path, Path, str]:
    """
    Returns (memory_dir, obsidian_vault, obsidian_folder) for the current context.
    Checks .claude-project → lab .claude-project → defaults.
    """
    ctx = _find_project_context()

    if ctx:
        # Project-level context found
        diary_path = ctx.get("diary_path")
        vault_path = ctx.get("obsidian_vault")
        vault_folder = ctx.get("obsidian_folder", _DEFAULT_OBSIDIAN_FOLDER)

        memory_dir = Path(diary_path).expanduser() if diary_path else _DEFAULT_MEMORY_DIR
        obsidian_vault = Path(vault_path).expanduser() if vault_path else _DEFAULT_OBSIDIAN_VAULT
        memory_dir.mkdir(parents=True, exist_ok=True)
        return memory_dir, obsidian_vault, vault_folder

    # No project context — use defaults
    _DEFAULT_MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    return _DEFAULT_MEMORY_DIR, _DEFAULT_OBSIDIAN_VAULT, _DEFAULT_OBSIDIAN_FOLDER


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
    Silently mirror an entry to the Obsidian vault.
    Never raises — Obsidian sync failure must never crash the MCP.
    Adds source attribution and timestamp as a blockquote.
    """
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
    name="claude-diary",
    instructions=(
        "Persistent memory, project context, and Obsidian sync for Claude across all sessions. "
        "Part of @claudelab/project v4 — .claude-project schema v4. "
        "START every session with get_context. "
        "END every session with journal_append + wakeup_update_section. "
        "Every entry is automatically attributed to its source device and synced to Obsidian. "
        "In a new project directory, call init_project first to create .claude-project. "
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
    Creates the file, assigns a UUID, links to the Obsidian vault.
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
    obsidian_folder = f"Projects/{name}"
    diary_path = str(Path.home() / ".claude" / "projects" / f"project-{project_id[:8]}" / "memory")

    data = {
        "$schema": "https://cdn.jsdelivr.net/npm/@claudelab/project/schema/claude-project.schema.json",
        "version": "4",
        "project_id": project_id,
        "name": name,
        "description": description,
        "created": _today_prefix(),
        "created_by": _get_source(),
        "obsidian_vault": str(_DEFAULT_OBSIDIAN_VAULT),
        "obsidian_folder": obsidian_folder,
        "diary_path": diary_path,
    }

    target.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    Path(diary_path).mkdir(parents=True, exist_ok=True)

    # Create Obsidian folder structure
    obs_dir = _DEFAULT_OBSIDIAN_VAULT / obsidian_folder
    obs_dir.mkdir(parents=True, exist_ok=True)
    index_file = obs_dir / "README.md"
    index_file.write_text(
        f"# {name}\n\n{description}\n\n"
        f"- **Project ID:** `{project_id}`\n"
        f"- **Created:** {_today_prefix()} by {_get_source()}\n"
        f"- **Diary:** `{diary_path}`\n",
        encoding="utf-8",
    )

    return (
        f"Initialised project '{name}'\n"
        f"  UUID:     {project_id}\n"
        f"  Diary:    {diary_path}\n"
        f"  Obsidian: {obs_dir}\n"
        f"  Source:   {_get_source()}\n"
        f"\n.claude-project written to {target}"
    )


@mcp.tool()
def get_source_info() -> str:
    """
    Returns the current source attribution label and project context.
    Call this to confirm what device/user/connection the MCP detects.
    Useful for verifying the setup on a new machine or user account.
    """
    source = _get_source()
    ctx = _find_project_context()
    memory_dir, obsidian_vault, obsidian_folder = _resolve_paths()

    lines = [
        f"**Source:** {source}",
        f"**Hostname:** {socket.gethostname()}",
        f"**User:** {os.getenv('USER', 'unknown')}",
        f"**SSH session:** {'yes' if os.getenv('SSH_CLIENT') or os.getenv('SSH_TTY') else 'no'}",
        "",
        f"**Memory dir:** {memory_dir}",
        f"**Obsidian vault:** {obsidian_vault}",
        f"**Obsidian folder:** {obsidian_folder}",
    ]
    if ctx:
        lines += [
            "",
            f"**Project:** {ctx.get('name', '?')}",
            f"**Project ID:** {ctx.get('project_id', '?')[:8]}",
            f"**.claude-project found at:** {Path.cwd()}",
        ]
    else:
        lines += ["", "**Project context:** none (.claude-project not found — using defaults)"]

    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# ORIENTATION TOOLS
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def get_context() -> str:
    """
    Single-call morning briefing — the FIRST tool to call at every session start.
    Returns: current UTC time + source info + full WAKEUP.md + last 2 journal entries.
    """
    memory_dir, _, _ = _resolve_paths()
    wakeup_file  = memory_dir / "WAKEUP.md"
    journal_file = memory_dir / "SESSION_JOURNAL.md"

    parts: list[str] = []
    parts.append(f"## Current UTC Time\n{_now()}")
    parts.append(f"## Source\n{_get_source()}")

    ctx = _find_project_context()
    if ctx:
        parts.append(
            f"## Project Context\n"
            f"**{ctx.get('name')}** (ID: `{ctx.get('project_id','?')[:8]}`)\n"
            f"{ctx.get('description','')}"
        )

    if wakeup_file.exists():
        parts.append("## WAKEUP.md\n" + wakeup_file.read_text(encoding="utf-8"))
    else:
        parts.append("## WAKEUP.md\n(not found — memory may not be initialised yet)")

    if journal_file.exists():
        text = journal_file.read_text(encoding="utf-8")
        entries = re.split(r"(?=^## \d{4}-\d{2}-\d{2})", text, flags=re.MULTILINE)
        recent = [e.strip() for e in entries if re.match(r"^## \d{4}-\d{2}-\d{2}", e.strip())][:2]
        if recent:
            parts.append("## Last 2 Journal Entries\n\n" + "\n\n---\n\n".join(recent))
    else:
        parts.append("## Last 2 Journal Entries\n(no journal yet)")

    return "\n\n" + "\n\n---\n\n".join(parts)


@mcp.tool()
def wakeup_read() -> str:
    """Reads and returns the full contents of WAKEUP.md."""
    memory_dir, _, _ = _resolve_paths()
    wakeup_file = memory_dir / "WAKEUP.md"
    if not wakeup_file.exists():
        return "WAKEUP.md not found."
    return wakeup_file.read_text(encoding="utf-8")


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
# JOURNAL
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def journal_append(title: str, content: str) -> str:
    """
    Prepends a timestamped, UUID-tagged entry to SESSION_JOURNAL.md.
    Also syncs to Obsidian with source attribution.
    Call at session START with goal, and at session END with what happened.

    Args:
        title:   One-line session title, e.g. 'Milestone 1 — SDK connection'
        content: Full markdown content for this entry
    """
    for val, name, lim in [(title, "title", _SHORT), (content, "content", _LONG)]:
        err = _check(val, name, lim)
        if err:
            return err

    memory_dir, obsidian_vault, obsidian_folder = _resolve_paths()
    journal_file = memory_dir / "SESSION_JOURNAL.md"
    source = _get_source()
    ts = _now()
    eid = _short_uuid()

    entry = f"\n## {ts} — {title}\n*`{eid}` · {source}*\n\n{content.strip()}\n\n---\n"
    _prepend_to_file(journal_file, "# Session Journal", entry)
    _sync_obsidian(obsidian_vault, obsidian_folder, "Diary.md", f"### {title}\n\n{content.strip()}", source)

    return f"Journal entry `{eid}` prepended at {ts} ({source})."


@mcp.tool()
def list_sessions(count: int = 3) -> str:
    """Returns the most recent N session journal entries."""
    count = min(max(int(count), 1), 10)
    memory_dir, _, _ = _resolve_paths()
    journal_file = memory_dir / "SESSION_JOURNAL.md"
    if not journal_file.exists():
        return "SESSION_JOURNAL.md not found yet."
    text = journal_file.read_text(encoding="utf-8")
    entries = re.split(r"(?=^## \d{4}-\d{2}-\d{2})", text, flags=re.MULTILINE)
    recent = [e.strip() for e in entries if re.match(r"^## \d{4}-\d{2}-\d{2}", e.strip())][:count]
    if not recent:
        return "No timestamped session entries found yet."
    return f"Last {len(recent)} session(s):\n\n" + "\n\n---\n\n".join(recent)


@mcp.tool()
def get_today() -> str:
    """Returns all journal entries from today (UTC)."""
    prefix = _today_prefix()
    memory_dir, _, _ = _resolve_paths()
    journal_file = memory_dir / "SESSION_JOURNAL.md"
    if not journal_file.exists():
        return "No journal yet."
    text = journal_file.read_text(encoding="utf-8")
    entries = re.split(r"(?=^## \d{4}-\d{2}-\d{2})", text, flags=re.MULTILINE)
    today = [e.strip() for e in entries if e.strip().startswith(f"## {prefix}")]
    if not today:
        return f"No journal entries for {prefix} yet."
    return f"Entries for {prefix}:\n\n" + "\n\n---\n\n".join(today)


# ══════════════════════════════════════════════════════════════════════════════
# WAKEUP MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def wakeup_update_section(section_heading: str, new_content: str) -> str:
    """
    Replaces the content of a named section in WAKEUP.md.
    Also syncs the update to Obsidian with source attribution.

    Args:
        section_heading: Exact ## heading text, e.g. 'Last Session Summary'
        new_content:     New markdown content
    """
    for val, name, lim in [
        (section_heading, "section_heading", _SHORT),
        (new_content, "new_content", _LONG),
    ]:
        err = _check(val, name, lim)
        if err:
            return err

    memory_dir, obsidian_vault, obsidian_folder = _resolve_paths()
    wakeup_file = memory_dir / "WAKEUP.md"
    source = _get_source()

    if not wakeup_file.exists():
        return "WAKEUP.md not found."
    text = wakeup_file.read_text(encoding="utf-8")
    pattern = rf"(## {re.escape(section_heading)}\n)(.*?)(?=\n## |\Z)"
    replacement = f"## {section_heading}\n{new_content.strip()}\n"
    updated, count = re.subn(pattern, replacement, text, flags=re.DOTALL)
    if count == 0:
        headings = re.findall(r"^## (.+)$", text, re.MULTILINE)
        return f"Section '## {section_heading}' not found. Available: {', '.join(headings)}"
    wakeup_file.write_text(updated, encoding="utf-8")
    _sync_obsidian(
        obsidian_vault, obsidian_folder, "WAKEUP.md",
        f"**{section_heading}** updated:\n\n{new_content.strip()}", source
    )
    return f"Section '## {section_heading}' updated ({source})."


@mcp.tool()
def add_open_question(question: str) -> str:
    """Adds an unchecked item to 'Open Questions / Pending Decisions' in WAKEUP.md."""
    err = _check(question, "question", _SHORT)
    if err:
        return err
    memory_dir, _, _ = _resolve_paths()
    wakeup_file = memory_dir / "WAKEUP.md"
    if not wakeup_file.exists():
        return "WAKEUP.md not found."
    text = wakeup_file.read_text(encoding="utf-8")
    pattern = r"(## Open Questions / Pending Decisions\n)(.*?)(?=\n## |\Z)"
    def inserter(m):
        return m.group(1) + m.group(2).rstrip() + f"\n- [ ] {question}\n"
    updated, count = re.subn(pattern, inserter, text, flags=re.DOTALL)
    if count == 0:
        updated = text.rstrip() + f"\n\n## Open Questions / Pending Decisions\n\n- [ ] {question}\n"
    wakeup_file.write_text(updated, encoding="utf-8")
    return f"Question added: '{question}'"


@mcp.tool()
def resolve_question(question_fragment: str, resolution: str) -> str:
    """Marks an open question as resolved in WAKEUP.md."""
    for val, name, lim in [
        (question_fragment, "question_fragment", _SHORT),
        (resolution, "resolution", _MEDIUM),
    ]:
        err = _check(val, name, lim)
        if err:
            return err
    memory_dir, _, _ = _resolve_paths()
    wakeup_file = memory_dir / "WAKEUP.md"
    if not wakeup_file.exists():
        return "WAKEUP.md not found."
    text = wakeup_file.read_text(encoding="utf-8")
    pattern = rf"(- \[ \] )(.{{0,200}}{re.escape(question_fragment)}.{{0,200}})"
    def resolver(m):
        return f"- [x] {m.group(2).strip()} → *{resolution}*"
    updated, count = re.subn(pattern, resolver, text, flags=re.IGNORECASE)
    if count == 0:
        return f"No unchecked question matching '{question_fragment}' found."
    wakeup_file.write_text(updated, encoding="utf-8")
    return f"Question resolved: '{question_fragment}' → {resolution}"


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

    memory_dir, obsidian_vault, obsidian_folder = _resolve_paths()
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
        obsidian_vault, obsidian_folder, "Discoveries.md",
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

    memory_dir, obsidian_vault, obsidian_folder = _resolve_paths()
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
        obsidian_vault, obsidian_folder, "Architecture.md",
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

    memory_dir, obsidian_vault, obsidian_folder = _resolve_paths()
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
        obsidian_vault, obsidian_folder, "Milestones.md",
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


@mcp.tool()
def memory_append_thought(thought: str) -> str:
    """
    Appends a timestamped thought to THOUGHTS.md with source attribution.
    Also syncs to Obsidian.

    Args:
        thought: The thought, question, or observation to preserve
    """
    err = _check(thought, "thought", _LONG)
    if err:
        return err
    memory_dir, obsidian_vault, obsidian_folder = _resolve_paths()
    thoughts_file = memory_dir / "THOUGHTS.md"
    source = _get_source()
    ts = _now()
    eid = _short_uuid()
    entry = f"\n---\n\n## {ts}\n*`{eid}` · {source}*\n\n{thought.strip()}\n"
    _append_to_file(thoughts_file, "# Thoughts", entry)
    _sync_obsidian(obsidian_vault, obsidian_folder, "Thoughts.md", thought.strip(), source)
    return f"Thought `{eid}` appended ({source})."


@mcp.tool()
def read_memory_file(filename: str) -> str:
    """
    Reads any named .md file from the memory directory.
    Pass just the filename (not the full path).

    Args:
        filename: e.g. 'DEXTER.md' or 'discoveries.md'
    """
    err = _check(filename, "filename", 100)
    if err:
        return err
    memory_dir, _, _ = _resolve_paths()
    target = (memory_dir / filename).resolve()
    if memory_dir.resolve() not in target.parents and target != memory_dir.resolve():
        return f"Access denied: '{filename}' is outside the memory directory."
    if target.suffix.lower() != ".md":
        return "Only .md files can be read via this tool."
    if not target.exists():
        available = [f.name for f in memory_dir.glob("*.md")]
        return f"'{filename}' not found. Available: {', '.join(sorted(available))}"
    return target.read_text(encoding="utf-8")


# ══════════════════════════════════════════════════════════════════════════════
# PROFILE TOOL
# ══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
def update_dexter_profile(section: str, note: str) -> str:
    """
    Appends a note to a specific section of DEXTER.md.

    Args:
        section: Which section to update, e.g. 'Who He Is'
        note:    The note to append
    """
    for val, name, lim in [(section, "section", _SHORT), (note, "note", _MEDIUM)]:
        err = _check(val, name, lim)
        if err:
            return err
    memory_dir, _, _ = _resolve_paths()
    dexter_file = memory_dir / "DEXTER.md"
    if not dexter_file.exists():
        return "DEXTER.md not found."
    text = dexter_file.read_text(encoding="utf-8")
    ts = _today_prefix()
    source = _get_source()
    pattern = rf"(## {re.escape(section)}\n)(.*?)(?=\n## |\Z)"
    def appender(m):
        existing = m.group(2).rstrip()
        return f"{m.group(1)}{existing}\n- *[{ts} · {source}]* {note.strip()}\n"
    updated, count = re.subn(pattern, appender, text, flags=re.DOTALL)
    if count == 0:
        updated = text.rstrip() + f"\n\n## {section}\n\n- *[{ts} · {source}]* {note.strip()}\n"
    dexter_file.write_text(updated, encoding="utf-8")
    return f"DEXTER.md updated: '{section}' ({source})."


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
    diary_path = ctx.get("diary_path")
    if not diary_path:
        return None
    memory_dir = Path(diary_path).expanduser()
    # diary_path ends with /memory — events.jsonl is one level up
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
    diary_path = ctx.get("diary_path")
    if not diary_path:
        return None
    memory_dir = Path(diary_path).expanduser()
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

    memory_dir, obsidian_vault, obsidian_folder = _resolve_paths()
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
        f"- Obsidian: `{obsidian_vault}/{obsidian_folder}`",
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
