/**
 * mcp-inject.ts
 * Manages the claude-diary entry in ~/.mcp.json.
 * Pure logic — no VS Code or CLI dependencies.
 * Used by both the extension (extension.ts) and the CLI (commands/inject.ts).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

export type InjectResult =
  | { status: 'already_present' }
  | { status: 'injected'; path: string }
  | { status: 'created'; path: string }
  | { status: 'error'; message: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const MCP_ENTRY_KEY = 'claude-diary';

const MCP_ENTRY_VALUE: McpServerEntry = {
  command: 'claude-project',
  args: ['mcp'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getMcpJsonPath(): string {
  return process.env['CLAUDE_MCP_JSON']
    ?? path.join(os.homedir(), '.mcp.json');
}

function readConfig(filePath: string): McpConfig {
  if (!fs.existsSync(filePath)) return { mcpServers: {} };
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as McpConfig;
}

function writeConfig(filePath: string, config: McpConfig): void {
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Checks if the claude-diary MCP entry exists in ~/.mcp.json.
 */
export function isInjected(): boolean {
  try {
    const config = readConfig(getMcpJsonPath());
    return !!(config.mcpServers && config.mcpServers[MCP_ENTRY_KEY]);
  } catch {
    return false;
  }
}

/**
 * Adds the claude-diary entry to ~/.mcp.json.
 * Creates the file if it does not exist.
 * Returns a result describing what happened — never throws.
 */
export function inject(): InjectResult {
  const filePath = getMcpJsonPath();

  let config: McpConfig;
  let existed: boolean;

  try {
    existed = fs.existsSync(filePath);
    config = existed ? readConfig(filePath) : { mcpServers: {} };
  } catch (err) {
    return { status: 'error', message: `Failed to read ${filePath}: ${String(err)}` };
  }

  if (config.mcpServers?.[MCP_ENTRY_KEY]) {
    return { status: 'already_present' };
  }

  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers[MCP_ENTRY_KEY] = MCP_ENTRY_VALUE;

  try {
    writeConfig(filePath, config);
  } catch (err) {
    return { status: 'error', message: `Failed to write ${filePath}: ${String(err)}` };
  }

  return existed
    ? { status: 'injected', path: filePath }
    : { status: 'created', path: filePath };
}

/**
 * Removes the claude-diary entry from ~/.mcp.json.
 * Returns true if it was removed, false if it was not present.
 */
export function eject(): boolean {
  const filePath = getMcpJsonPath();
  if (!fs.existsSync(filePath)) return false;

  const config = readConfig(filePath);
  if (!config.mcpServers?.[MCP_ENTRY_KEY]) return false;

  delete config.mcpServers[MCP_ENTRY_KEY];
  writeConfig(filePath, config);
  return true;
}
