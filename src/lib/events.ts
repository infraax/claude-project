/**
 * events.ts
 * Append-only JSONL event log per project.
 * Stored at: <memory_path>/../events.jsonl
 * (one level above the memory/ dir, inside the project-XXXX folder)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ClaudeProject } from './project.js';
import { resolvePaths } from './paths.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventType =
  | 'project_init'
  | 'project_update'
  | 'session_start'
  | 'session_end'
  | 'tool_call'
  | 'file_change'
  | 'dispatch_created'
  | 'dispatch_completed'
  | 'dispatch_failed'
  | 'agent_dispatched'
  | 'agent_completed'
  | 'service_up'
  | 'service_down'
  | 'automation_fired'
  | 'daemon_scan'
  | 'custom';
  // sync_obsidian REMOVED — use `claude-project sync` instead

export interface ProjectEvent {
  id: string;
  ts: string;
  type: EventType | string;
  source: string;
  project_id: string;
  data: Record<string, unknown>;
  tags?: string[];
}

// ── Path resolution ───────────────────────────────────────────────────────────

export function getEventsPath(project: ClaudeProject): string {
  const { eventsFile } = resolvePaths(project);
  return eventsFile;
}

// ── Source attribution ────────────────────────────────────────────────────────

function getSource(): string {
  const user = process.env['USER'] ?? os.userInfo().username;
  return `${os.hostname()} / ${user}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append an event to the project's events.jsonl.
 * Never throws — event logging must never crash the caller.
 */
export function appendEvent(
  project: ClaudeProject,
  type: EventType | string,
  data: Record<string, unknown> = {},
  tags?: string[],
): ProjectEvent {
  const event: ProjectEvent = {
    id: randomUUID().slice(0, 8),
    ts: new Date().toISOString(),
    type,
    source: getSource(),
    project_id: project.project_id.slice(0, 8),
    data,
    ...(tags && tags.length > 0 ? { tags } : {}),
  };

  try {
    const eventsPath = getEventsPath(project);
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.appendFileSync(eventsPath, JSON.stringify(event) + '\n', 'utf-8');
  } catch {
    // silent — logging never crashes callers
  }

  return event;
}

/**
 * Read the last N events from the project's event log.
 */
export function readEvents(
  project: ClaudeProject,
  limit = 50,
  filterType?: string,
): ProjectEvent[] {
  const eventsPath = getEventsPath(project);
  if (!fs.existsSync(eventsPath)) return [];

  try {
    const lines = fs.readFileSync(eventsPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as ProjectEvent; } catch { return null; }
      })
      .filter((e): e is ProjectEvent => e !== null);

    const filtered = filterType ? lines.filter((e) => e.type === filterType) : lines;
    return filtered.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Query events since a given ISO timestamp.
 */
export function queryEventsSince(
  project: ClaudeProject,
  since: string,
  filterType?: string,
): ProjectEvent[] {
  const sinceMs = new Date(since).getTime();
  const all = readEvents(project, 10_000, filterType);
  return all.filter((e) => new Date(e.ts).getTime() >= sinceMs);
}

/**
 * Purge events older than retentionDays. Returns count of removed lines.
 */
export function purgeOldEvents(project: ClaudeProject, retentionDays: number): number {
  const eventsPath = getEventsPath(project);
  if (!fs.existsSync(eventsPath)) return 0;

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  try {
    const lines = fs.readFileSync(eventsPath, 'utf-8').split('\n').filter(Boolean);
    const kept = lines.filter((line) => {
      try {
        const e = JSON.parse(line) as ProjectEvent;
        return new Date(e.ts).getTime() >= cutoff;
      } catch {
        return true;
      }
    });
    const removed = lines.length - kept.length;
    if (removed > 0) {
      fs.writeFileSync(eventsPath, kept.join('\n') + '\n', 'utf-8');
    }
    return removed;
  } catch {
    return 0;
  }
}
