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

export interface AgentDefinition {
  role: string;
  model?: string;
  instructions?: string;
  tools?: string[];
  max_tokens?: number;
  tags?: string[];
}

export interface ServiceDefinition {
  type: 'process' | 'http' | 'grpc' | 'mqtt' | 'websocket' | 'other';
  url?: string;
  command?: string;
  healthcheck?: string;
  description?: string;
  env?: Record<string, string>;
  tags?: string[];
}

export interface AutomationTrigger {
  type: 'file_change' | 'schedule' | 'event' | 'manual' | 'dispatch' | 'service_up' | 'service_down';
  pattern?: string;
  cron?: string;
  event_type?: string;
  service?: string;
}

export interface AutomationAction {
  type: 'run_command' | 'dispatch_agent' | 'write_event' | 'send_notification' | 'sync_obsidian' | 'call_webhook';
  command?: string;
  agent?: string;
  prompt?: string;
  event_type?: string;
  message?: string;
  url?: string;
}

export interface Automation {
  id: string;
  description?: string;
  enabled?: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
}

export interface ToolDefinition {
  command: string;
  description?: string;
  args?: string[];
  env?: Record<string, string>;
  tags?: string[];
}

export interface MonitoringConfig {
  enabled?: boolean;
  watch_paths?: string[];
  healthcheck_interval_seconds?: number;
  log_retention_days?: number;
  notify?: {
    macos_notifications?: boolean;
    webhook_url?: string;
  };
}

export interface ClaudeProject {
  version: '3' | '4';
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
  // v4 fields
  agents?: Record<string, AgentDefinition>;
  services?: Record<string, ServiceDefinition>;
  automations?: Automation[];
  tools?: Record<string, ToolDefinition>;
  monitoring?: MonitoringConfig;
}

export interface FoundProject {
  filePath: string;
  projectDir: string;
  project: ClaudeProject;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULTS = {
  obsidianVault: process.env['CLAUDE_OBSIDIAN_VAULT']
    ?? path.join(os.homedir(), '.claude', 'obsidian'),

  diaryBase: process.env['CLAUDE_DIARY_BASE']
    ?? path.join(os.homedir(), '.claude', 'projects'),

  // jsdelivr CDN — enterprise-trusted, backed by npm package, no raw GitHub
  schemaUrl:
    'https://cdn.jsdelivr.net/npm/@claudelab/project/schema/claude-project.schema.json',
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
    version: '4',
    project_id: projectId,
    name,
    description,
    created: new Date().toISOString().split('T')[0],
    created_by: `${os.hostname()} / ${os.userInfo().username}`,
    obsidian_vault: DEFAULTS.obsidianVault,
    obsidian_folder: `Projects/${name}`,
    diary_path: diaryPath,
    monitoring: {
      enabled: true,
      log_retention_days: 90,
      notify: { macos_notifications: true },
    },
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
