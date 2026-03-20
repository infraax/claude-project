import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeProject, DEFAULTS, expandHome } from './project.js';

// ── Resolved paths for a project ──────────────────────────────────────────────

export interface ResolvedPaths {
  memoryDir: string;
  obsidianVault: string;
  obsidianFolder: string;
  obsidianProjectDir: string;
  wakeupFile: string;
  journalFile: string;
}

export function resolvePaths(project: ClaudeProject): ResolvedPaths {
  const memoryDir = expandHome(project.diary_path);
  const obsidianVault = expandHome(project.obsidian_vault ?? DEFAULTS.obsidianVault);
  const obsidianFolder = project.obsidian_folder ?? 'Projects/Unsorted';
  const obsidianProjectDir = path.join(obsidianVault, obsidianFolder);

  return {
    memoryDir,
    obsidianVault,
    obsidianFolder,
    obsidianProjectDir,
    wakeupFile: path.join(memoryDir, 'WAKEUP.md'),
    journalFile: path.join(memoryDir, 'SESSION_JOURNAL.md'),
  };
}

// ── MCP server path (bundled server.py) ───────────────────────────────────────

export function getMcpServerPath(): string {
  // Resolve relative to this file's location so it works whether running
  // from source (dist/) or installed globally (node_modules/.bin → dist/).
  const candidates = [
    path.join(__dirname, '..', '..', 'mcp', 'server.py'),   // dist/ → repo root
    path.join(__dirname, '..', 'mcp', 'server.py'),          // fallback
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `MCP server.py not found. Expected at: ${candidates[0]}\n` +
    'Run: npm install -g @claudelab/project',
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
    if (!p.includes('/')) return p; // bare name — let PATH handle it
    if (fs.existsSync(p)) return p;
  }
  return 'python3';
}

// ── Default diary dir (used when no project context) ─────────────────────────

export function getDefaultMemoryDir(): string {
  return process.env['CLAUDE_DIARY_PATH']
    ?? path.join(os.homedir(), '.claude', 'memory');
}

// ── Known project search roots ────────────────────────────────────────────────

export function getSearchRoots(): string[] {
  const roots = [
    path.join(os.homedir(), '.claude', 'projects'),
    path.join(os.homedir(), 'projects'),
    path.join(os.homedir(), 'Projects'),
    os.homedir(),
  ];

  // Optional extra root from env (e.g. a shared SSD or network drive)
  const extra = process.env['CLAUDE_PROJECTS_ROOT'];
  if (extra) roots.unshift(extra);

  return roots.filter(fs.existsSync);
}
