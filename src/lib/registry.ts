/**
 * registry.ts
 * Global project registry at ~/.claude/registry.json.
 * Instant lookup of all known projects on this machine — no disk scan needed.
 * Updated automatically by init, and optionally by the daemon.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeProject, expandHome } from './project.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegistryEntry {
  project_id: string;
  name: string;
  description: string;
  project_dir: string;
  diary_path: string;
  created: string;
  created_by: string;
  stage?: string;
  registered_at: string;
  last_seen: string;
  version: string;
}

export interface Registry {
  version: '1';
  updated: string;
  machine: string;
  projects: Record<string, RegistryEntry>;
}

// ── Paths ─────────────────────────────────────────────────────────────────────

export function getRegistryPath(): string {
  return process.env['CLAUDE_REGISTRY_PATH']
    ?? path.join(os.homedir(), '.claude', 'registry.json');
}

// ── I/O ───────────────────────────────────────────────────────────────────────

function read(): Registry {
  const file = getRegistryPath();
  if (!fs.existsSync(file)) {
    return {
      version: '1',
      updated: new Date().toISOString(),
      machine: os.hostname(),
      projects: {},
    };
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Registry;
  } catch {
    return {
      version: '1',
      updated: new Date().toISOString(),
      machine: os.hostname(),
      projects: {},
    };
  }
}

function write(registry: Registry): void {
  const file = getRegistryPath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  registry.updated = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register or refresh a project in the registry.
 * Called by `init` and optionally by the daemon scanner.
 */
export function registerProject(project: ClaudeProject, projectDir: string): void {
  const registry = read();
  const now = new Date().toISOString();
  const existing = registry.projects[project.project_id];

  registry.projects[project.project_id] = {
    project_id: project.project_id,
    name: project.name,
    description: project.description ?? '',
    project_dir: projectDir,
    diary_path: expandHome(project.diary_path),
    created: project.created,
    created_by: project.created_by,
    stage: project.stage,
    version: project.version,
    registered_at: existing?.registered_at ?? now,
    last_seen: now,
  };

  write(registry);
}

/**
 * Update last_seen timestamp for an existing entry (called on status/find).
 */
export function touchProject(projectId: string): void {
  const registry = read();
  const entry = registry.projects[projectId];
  if (!entry) return;
  entry.last_seen = new Date().toISOString();
  write(registry);
}

/**
 * Remove a project from the registry.
 */
export function unregisterProject(projectId: string): boolean {
  const registry = read();
  if (!registry.projects[projectId]) return false;
  delete registry.projects[projectId];
  write(registry);
  return true;
}

/**
 * Look up a single project by ID or name prefix.
 */
export function lookupProject(idOrName: string): RegistryEntry | null {
  const registry = read();

  // Exact UUID match
  if (registry.projects[idOrName]) return registry.projects[idOrName];

  // Short-ID prefix match (first 8 chars of UUID)
  const byShortId = Object.values(registry.projects).find((e) =>
    e.project_id.startsWith(idOrName),
  );
  if (byShortId) return byShortId;

  // Case-insensitive name match
  const byName = Object.values(registry.projects).find(
    (e) => e.name.toLowerCase() === idOrName.toLowerCase(),
  );
  return byName ?? null;
}

/**
 * Return all registered projects, sorted by last_seen descending.
 */
export function listRegistry(): RegistryEntry[] {
  const registry = read();
  return Object.values(registry.projects).sort(
    (a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(),
  );
}

/**
 * Return the raw registry object (for MCP tools etc).
 */
export function getRegistry(): Registry {
  return read();
}
