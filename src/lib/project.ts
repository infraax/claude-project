import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ClaudeProject {
  version: '3';
  project_id: string;
  name: string;
  description: string;
  created: string;
  created_by: string;
  obsidian_vault: string;
  obsidian_folder: string;
  diary_path: string;
  stage?: string;
  shared_paths?: Record<string, string>;
  devices?: Record<string, string>;
  mcp?: {
    servers?: Record<string, McpServerConfig>;
  };
}

export interface FoundProject {
  filePath: string;
  projectDir: string;
  project: ClaudeProject;
}

// ── Defaults ──────────────────────────────────────────────────────────────────
// All paths are resolved at runtime from env vars or cross-platform standards.
// Nothing here is machine-specific.

export const DEFAULTS = {
  // Obsidian vault: env override → ~/.claude/obsidian (works on any system)
  obsidianVault: process.env['CLAUDE_OBSIDIAN_VAULT']
    ?? path.join(os.homedir(), '.claude', 'obsidian'),

  // Diary base: env override → ~/.claude/projects
  diaryBase: process.env['CLAUDE_DIARY_BASE']
    ?? path.join(os.homedir(), '.claude', 'projects'),

  schemaUrl:
    'https://raw.githubusercontent.com/infraax/claude-project/main/schema/claude-project.schema.json',
} as const;

// ── Core: find .claude-project walking up ─────────────────────────────────────

export function findProject(): FoundProject | null {
  let current = process.cwd();

  while (true) {
    const candidate = path.join(current, '.claude-project');
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        const project = JSON.parse(raw) as ClaudeProject;
        return { filePath: candidate, projectDir: current, project };
      } catch {
        return null;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

// ── Core: create a new project ────────────────────────────────────────────────

export function buildProject(name: string, description: string): ClaudeProject {
  const projectId = randomUUID();
  const shortId = projectId.slice(0, 8);
  const diaryPath = path.join(DEFAULTS.diaryBase, `project-${shortId}`, 'memory');

  return {
    version: '3',
    project_id: projectId,
    name,
    description,
    created: new Date().toISOString().split('T')[0],
    created_by: `${os.hostname()} / ${os.userInfo().username}`,
    obsidian_vault: DEFAULTS.obsidianVault,
    obsidian_folder: `Projects/${name}`,
    diary_path: diaryPath,
  };
}

// ── Core: write .claude-project ───────────────────────────────────────────────

export function writeProject(dir: string, project: ClaudeProject): string {
  const filePath = path.join(dir, '.claude-project');
  const withSchema = {
    $schema: DEFAULTS.schemaUrl,
    ...project,
  };
  fs.writeFileSync(filePath, JSON.stringify(withSchema, null, 2) + '\n', 'utf-8');
  return filePath;
}

// ── Core: update a field in existing .claude-project ─────────────────────────

export function updateProject(
  filePath: string,
  updates: Partial<ClaudeProject>,
): ClaudeProject {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const existing = JSON.parse(raw) as ClaudeProject;
  const updated = { ...existing, ...updates };
  const withSchema = {
    $schema: DEFAULTS.schemaUrl,
    ...updated,
  };
  fs.writeFileSync(filePath, JSON.stringify(withSchema, null, 2) + '\n', 'utf-8');
  return updated;
}

// ── Core: ensure directories exist ────────────────────────────────────────────

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

export function shortId(project: ClaudeProject): string {
  return project.project_id.slice(0, 8);
}
