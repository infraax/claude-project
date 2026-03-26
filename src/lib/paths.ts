// src/lib/paths.ts
// Resolves all file-system paths for a claude-project project.
// Single source of truth — no obsidian paths, no legacy WAKEUP/journal paths.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeProject } from './project.js';

// ── Resolved paths for a project ──────────────────────────────────────────────

export interface ProjectPaths {
  memoryDir: string;
  dispatchesDir: string;
  eventsFile: string;
  dbPath: string;
  researchDbPath: string;
  // project-local config dirs (alongside .claude-project)
  runtimeDir: string;
  sessionsDir: string;
  dotClaudeDir: string;
  agentsDir: string;
  servicesDir: string;
  automationsDir: string;
  toolsDir: string;
}

// Backward-compat alias — callers will be updated file by file in Phase 10.
export type ResolvedPaths = ProjectPaths;

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

export function resolvePaths(project: ClaudeProject, projectDir?: string): ProjectPaths {
  // memory_path is the new field; diary_path kept for backward-compat read-only.
  const rawMemory =
    project.memory_path ??
    (project as any).diary_path ??
    process.env['CLAUDE_PROJECT_DIR'] ??
    path.join(os.homedir(), '.claude', 'projects', `project-${((project as any).project_id ?? (project as any).id ?? 'default').slice(0, 8)}`, 'memory');

  const memoryDir = expandHome(rawMemory);
  const runtimeDir = path.dirname(memoryDir); // project-XXXX folder

  const dotClaudeDir = projectDir
    ? path.join(projectDir, '.claude')
    : path.join(process.cwd(), '.claude');

  return {
    memoryDir,
    runtimeDir,
    dispatchesDir:  path.join(runtimeDir, 'dispatches'),
    eventsFile:     path.join(runtimeDir, 'events.jsonl'),
    sessionsDir:    path.join(runtimeDir, 'sessions'),
    dbPath:         path.join(runtimeDir, 'memory.db'),
    researchDbPath: path.join(runtimeDir, 'research.db'),
    dotClaudeDir,
    agentsDir:      path.join(dotClaudeDir, 'agents'),
    servicesDir:    path.join(dotClaudeDir, 'services'),
    automationsDir: path.join(dotClaudeDir, 'automations'),
    toolsDir:       path.join(dotClaudeDir, 'tools'),
  };
}

// ── MCP server path (bundled server.py) ───────────────────────────────────────

export function getMcpServerPath(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'mcp', 'server.py'),
    path.join(__dirname, '..', 'mcp', 'server.py'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `MCP server.py not found. Expected at: ${candidates[0]}\n` +
    'Run: npm install -g claude-project',
  );
}

// ── Python binary resolution ───────────────────────────────────────────────────

export function getPython(): string {
  const candidates = [
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    'python3',
    'python',
  ];
  for (const p of candidates) {
    if (!p.includes('/')) return p;
    if (fs.existsSync(p)) return p;
  }
  return 'python3';
}

// ── Default memory dir (used when no project context) ────────────────────────

export function getDefaultMemoryDir(): string {
  return (
    process.env['CLAUDE_PROJECT_DIR'] ??
    path.join(os.homedir(), '.claude', 'projects', 'default', 'memory')
  );
}

// ── Known project search roots ────────────────────────────────────────────────

export function getSearchRoots(): string[] {
  const roots = [
    path.join(os.homedir(), '.claude', 'projects'),
    path.join(os.homedir(), 'projects'),
    path.join(os.homedir(), 'Projects'),
    os.homedir(),
  ];
  const extra = process.env['CLAUDE_PROJECTS_ROOT'];
  if (extra) roots.unshift(extra);
  return roots.filter(fs.existsSync);
}
