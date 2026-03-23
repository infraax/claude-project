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
  // v4: runtime dirs
  runtimeDir: string;       // <diary_parent>/  e.g. ~/.claude/projects/project-XXXX/
  eventsFile: string;       // runtimeDir/events.jsonl
  sessionsDir: string;      // runtimeDir/sessions/
  dispatchesDir: string;    // runtimeDir/dispatches/
  // v4: project config dirs (alongside .claude-project)
  dotClaudeDir: string;     // projectDir/.claude/
  agentsDir: string;        // projectDir/.claude/agents/
  servicesDir: string;      // projectDir/.claude/services/
  automationsDir: string;   // projectDir/.claude/automations/
  toolsDir: string;         // projectDir/.claude/tools/
}

export function resolvePaths(project: ClaudeProject, projectDir?: string): ResolvedPaths {
  const memoryDir = expandHome(project.diary_path);
  const obsidianVault = expandHome(project.obsidian_vault ?? DEFAULTS.obsidianVault);
  const obsidianFolder = project.obsidian_folder ?? 'Projects/Unsorted';
  const obsidianProjectDir = path.join(obsidianVault, obsidianFolder);

  // Runtime dir lives one level above memory/ (the project-XXXX folder)
  const runtimeDir = path.dirname(memoryDir);

  // .claude/ config dir lives alongside .claude-project in the project root
  const dotClaudeDir = projectDir
    ? path.join(projectDir, '.claude')
    : path.join(process.cwd(), '.claude');

  return {
    memoryDir,
    obsidianVault,
    obsidianFolder,
    obsidianProjectDir,
    wakeupFile: path.join(memoryDir, 'WAKEUP.md'),
    journalFile: path.join(memoryDir, 'SESSION_JOURNAL.md'),
    // v4 runtime dirs
    runtimeDir,
    eventsFile: path.join(runtimeDir, 'events.jsonl'),
    sessionsDir: path.join(runtimeDir, 'sessions'),
    dispatchesDir: path.join(runtimeDir, 'dispatches'),
    // v4 project config dirs
    dotClaudeDir,
    agentsDir: path.join(dotClaudeDir, 'agents'),
    servicesDir: path.join(dotClaudeDir, 'services'),
    automationsDir: path.join(dotClaudeDir, 'automations'),
    toolsDir: path.join(dotClaudeDir, 'tools'),
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
