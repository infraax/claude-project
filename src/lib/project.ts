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
  backend?: 'claude' | 'ollama' | 'openai' | 'local';
  instructions?: string;
  system_prompt?: string;
  tools?: string[];
  max_tokens?: number;
  tags?: string[];
  trigger?: string;
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
  // sync_obsidian REMOVED — use CLAUDE_OBSIDIAN_VAULT env var + `claude-project sync` instead
  type: 'run_command' | 'dispatch_agent' | 'write_event' | 'send_notification' | 'call_webhook';
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
  $schema?: string;
  version?: string;
  project_id: string;
  name: string;
  description?: string;
  created?: string;
  created_by?: string;
  // v5: canonical memory field
  memory_path?: string;
  // DEPRECATED — kept for backward-compat read-only; prefer memory_path
  diary_path?: string;
  // REMOVED: obsidian_vault, obsidian_folder
  stage?: string;
  mcp?: {
    servers?: Record<string, McpServerConfig>;
  };
  agents?: Record<string, AgentDefinition>;
  services?: Record<string, ServiceDefinition>;
  automations?: Automation[];
  tools?: Record<string, ToolDefinition>;
  monitoring?: MonitoringConfig;
  optimizations?: {
    cache_prefix?: boolean;
    format_encode?: boolean;
    clarity_layer?: boolean;
    llmlingua?: boolean;
    pd_registry?: boolean;
  };
  telemetry?: {
    enabled?: boolean;
    installation_id?: string;
    opted_in_at?: string;
  };
}

export interface FoundProject {
  filePath: string;
  projectDir: string;
  project: ClaudeProject;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULTS = {
  schemaUrl:
    'https://cdn.jsdelivr.net/npm/claude-project/schema/claude-project.schema.json',
  memoryBase:
    process.env['CLAUDE_PROJECT_DIR'] ??
    path.join(os.homedir(), '.claude', 'projects'),
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

// ── Alias used by init.ts ─────────────────────────────────────────────────────

export const loadProject = findProject;

// ── Core: create a new v5 project ────────────────────────────────────────────

export function buildProject(name: string, description: string): ClaudeProject {
  const projectId = randomUUID();
  const shortId = projectId.slice(0, 8);
  const memoryPath = path.join(DEFAULTS.memoryBase, `project-${shortId}`, 'memory');

  return {
    $schema: DEFAULTS.schemaUrl,
    version: '5.0',
    project_id: projectId,
    name,
    description,
    created: new Date().toISOString().split('T')[0],
    created_by: `${os.hostname()} / ${os.userInfo().username}`,
    memory_path: memoryPath,
    monitoring: {
      enabled: true,
      log_retention_days: 90,
      notify: { macos_notifications: true },
    },
    optimizations: {
      cache_prefix: true,
      format_encode: true,
      clarity_layer: true,
      llmlingua: true,
      pd_registry: true,
    },
    telemetry: { enabled: false },
  };
}

// Alias used by Phase 10 spec
export const createDefaultProject = buildProject;

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
