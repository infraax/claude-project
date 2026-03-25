/**
 * automation.ts
 * Automation execution engine for claude-project.
 *
 * Evaluates automation triggers and dispatches actions.
 * Designed to be modular: trigger evaluators and action handlers
 * are registered in plain maps — easy to extend without touching core logic.
 *
 * State tracking: ~/.claude/projects/project-XXXX/automation-state.json
 * Idempotent: each automation tracks last_fired + last_event_id to avoid
 * double-firing on the same event.
 *
 * Trigger types supported:
 *   event       — fires when a project event matches event_type
 *   schedule    — fires based on cron expression (evaluated on daemon tick)
 *   manual      — only fires via explicit CLI call
 *   file_change — fires when a file matching pattern changes
 *   service_up / service_down — service health transitions
 *
 * Action types supported:
 *   run_command      — spawn a shell command
 *   dispatch_agent   — create a dispatch JSON → processed by dispatch-runner
 *   write_event      — append a custom event to the event log
 *   send_notification — macOS/webhook notification
 *   sync_obsidian    — copy memory → Obsidian
 *   call_webhook     — HTTP POST to a URL
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import { randomUUID } from 'crypto';

import { ClaudeProject, Automation, AutomationTrigger, AutomationAction } from './project.js';
import { resolvePaths } from './paths.js';
import { appendEvent, readEvents, ProjectEvent } from './events.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutomationState {
  [automationId: string]: {
    last_fired?: string;       // ISO timestamp
    last_event_id?: string;    // prevents re-firing on same event
    fire_count?: number;
  };
}

export interface TriggerContext {
  type: 'event' | 'schedule' | 'manual' | 'file_change' | 'service_up' | 'service_down';
  event?: ProjectEvent;
  filePath?: string;
  service?: string;
  forceAll?: boolean;          // --force flag: run regardless of last_fired
}

export interface AutomationResult {
  automationId: string;
  fired: boolean;
  action?: string;
  output?: string;
  error?: string;
}

// ── State file ────────────────────────────────────────────────────────────────

function getStatePath(project: ClaudeProject): string {
  const paths = resolvePaths(project);
  return path.join(paths.runtimeDir, 'automation-state.json');
}

function readState(project: ClaudeProject): AutomationState {
  const statePath = getStatePath(project);
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as AutomationState;
  } catch {
    return {};
  }
}

function writeState(project: ClaudeProject, state: AutomationState): void {
  const statePath = getStatePath(project);
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  } catch {
    // non-fatal
  }
}

// ── Cron evaluation ───────────────────────────────────────────────────────────

/**
 * Very lightweight cron matcher. Supports:
 *   @hourly, @daily, @weekly, @monthly
 *   standard 5-field cron: "minute hour dom month dow"
 *   wildcard (*) only — no ranges or steps (good enough for daemon use)
 */
function cronMatches(cron: string, now: Date, lastFired?: string): boolean {
  // Aliases
  const aliases: Record<string, string> = {
    '@hourly':  '0 * * * *',
    '@daily':   '0 0 * * *',
    '@weekly':  '0 0 * * 0',
    '@monthly': '0 0 1 * *',
  };
  const expr = aliases[cron] ?? cron;

  const [minField, hourField, domField, monField, dowField] = expr.split(/\s+/);

  const matches = (field: string, value: number) =>
    field === '*' || field.split(',').includes(String(value));

  const ok =
    matches(minField,  now.getMinutes()) &&
    matches(hourField, now.getHours()) &&
    matches(domField,  now.getDate()) &&
    matches(monField,  now.getMonth() + 1) &&
    matches(dowField,  now.getDay());

  if (!ok) return false;

  // Avoid firing twice in the same minute
  if (lastFired) {
    const last = new Date(lastFired);
    if (
      last.getFullYear() === now.getFullYear() &&
      last.getMonth()    === now.getMonth() &&
      last.getDate()     === now.getDate() &&
      last.getHours()    === now.getHours() &&
      last.getMinutes()  === now.getMinutes()
    ) return false;
  }
  return true;
}

// ── Trigger evaluators ────────────────────────────────────────────────────────

type TriggerEvaluator = (
  trigger: AutomationTrigger,
  ctx: TriggerContext,
  state: AutomationState,
  automationId: string,
) => boolean;

const TRIGGER_EVALUATORS: Record<string, TriggerEvaluator> = {

  event: (trigger, ctx, state, id) => {
    if (ctx.type !== 'event' || !ctx.event) return false;
    // Match event_type if specified
    if (trigger.event_type && ctx.event.type !== trigger.event_type) return false;
    // Don't re-fire on the same event id
    const prevEventId = state[id]?.last_event_id;
    if (prevEventId && prevEventId === ctx.event.id) return false;
    return true;
  },

  schedule: (trigger, ctx, state, id) => {
    if (ctx.type !== 'schedule') return false;
    if (!trigger.cron) return false;
    return cronMatches(trigger.cron, new Date(), state[id]?.last_fired);
  },

  manual: (_trigger, ctx) => {
    return ctx.type === 'manual' || (ctx.forceAll === true);
  },

  file_change: (trigger, ctx) => {
    if (ctx.type !== 'file_change' || !ctx.filePath) return false;
    if (!trigger.pattern) return true;
    // Simple glob: check suffix or path contains pattern
    const pat = trigger.pattern;
    if (pat.startsWith('**/*.')) {
      const ext = pat.slice(4); // e.g. ".ts"
      return ctx.filePath.endsWith(ext);
    }
    return ctx.filePath.includes(pat);
  },

  service_up: (trigger, ctx) => {
    if (ctx.type !== 'service_up') return false;
    return !trigger.service || trigger.service === ctx.service;
  },

  service_down: (trigger, ctx) => {
    if (ctx.type !== 'service_down') return false;
    return !trigger.service || trigger.service === ctx.service;
  },

  // dispatch trigger fires when a dispatch is completed (wired via event 'dispatch_completed')
  dispatch: (trigger, ctx) => {
    if (ctx.type !== 'event' || !ctx.event) return false;
    return ctx.event.type === 'dispatch_completed';
  },
};

function evaluateTrigger(
  automation: Automation,
  ctx: TriggerContext,
  state: AutomationState,
): boolean {
  const evaluator = TRIGGER_EVALUATORS[automation.trigger.type];
  if (!evaluator) return false;
  return evaluator(automation.trigger, ctx, state, automation.id);
}

// ── Action handlers ───────────────────────────────────────────────────────────

export interface ActionContext {
  project: ClaudeProject;
  projectDir: string;
  automation: Automation;
  triggerCtx: TriggerContext;
}

type ActionHandler = (action: AutomationAction, ctx: ActionContext) => string; // returns summary

const ACTION_HANDLERS: Record<string, ActionHandler> = {

  run_command: (action, ctx) => {
    if (!action.command) throw new Error('run_command: missing command');
    const result = spawnSync('sh', ['-c', action.command], {
      cwd: ctx.projectDir,
      encoding: 'utf-8',
      timeout: 30_000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: ctx.projectDir },
    });
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    if (result.status !== 0) {
      throw new Error(`command exited ${result.status}: ${output.slice(0, 500)}`);
    }
    return output.slice(0, 500) || '(ok)';
  },

  dispatch_agent: (action, ctx) => {
    // Create a dispatch JSON file — picked up by dispatch-runner
    const paths = resolvePaths(ctx.project, ctx.projectDir);
    fs.mkdirSync(paths.dispatchesDir, { recursive: true });
    const dispatchId = `dispatch-${randomUUID().slice(0, 8)}`;
    const dispatch = {
      id: dispatchId,
      title: action.prompt ?? `Automation: ${ctx.automation.id}`,
      body: action.prompt ?? '',
      agent: action.agent ?? Object.keys(ctx.project.agents ?? {})[0] ?? '',
      priority: 'normal',
      status: 'pending',
      created: new Date().toISOString(),
      source: `automation:${ctx.automation.id}`,
    };
    const dispatchPath = path.join(paths.dispatchesDir, `${dispatchId}.json`);
    fs.writeFileSync(dispatchPath, JSON.stringify(dispatch, null, 2) + '\n', 'utf-8');
    return `Created dispatch ${dispatchId}`;
  },

  write_event: (action, ctx) => {
    const eventType = action.event_type ?? 'automation_fired';
    appendEvent(ctx.project, eventType, {
      automation_id: ctx.automation.id,
      message: action.message ?? '',
      summary: action.message ?? `Automation ${ctx.automation.id} fired`,
    });
    return `Logged event: ${eventType}`;
  },

  send_notification: (action, ctx) => {
    const msg = action.message ?? `Automation ${ctx.automation.id} fired`;
    const notifyEnabled = ctx.project.monitoring?.notify?.macos_notifications;
    // macOS notification (silent on error)
    if (notifyEnabled && process.platform === 'darwin') {
      try {
        spawnSync('osascript', [
          '-e',
          `display notification "${msg.replace(/"/g, '\\"')}" with title "claude-project"`,
        ], { timeout: 5000 });
      } catch { /* non-fatal */ }
    }
    // Webhook notification (if configured)
    const webhookUrl = action.url ?? ctx.project.monitoring?.notify?.webhook_url;
    if (webhookUrl) {
      return ACTION_HANDLERS['call_webhook']!({ ...action, url: webhookUrl }, ctx);
    }
    return `Notification sent: ${msg}`;
  },

  sync_obsidian: (_action, ctx) => {
    const paths = resolvePaths(ctx.project, ctx.projectDir);
    if (!fs.existsSync(paths.obsidianVault)) return 'Obsidian vault not found — skipped';
    if (!fs.existsSync(paths.memoryDir)) return 'Memory dir not found — skipped';
    fs.mkdirSync(paths.obsidianProjectDir, { recursive: true });
    let count = 0;
    for (const f of fs.readdirSync(paths.memoryDir).filter(f => f.endsWith('.md'))) {
      fs.writeFileSync(
        path.join(paths.obsidianProjectDir, f),
        fs.readFileSync(path.join(paths.memoryDir, f), 'utf-8'),
        'utf-8',
      );
      count++;
    }
    return `Synced ${count} files to Obsidian`;
  },

  call_webhook: (action, _ctx) => {
    if (!action.url) throw new Error('call_webhook: missing url');
    // Use curl (widely available, avoids adding http lib dep)
    const result = spawnSync(
      'curl',
      ['-s', '-X', 'POST', '-H', 'Content-Type: application/json',
       '-d', JSON.stringify({ automation_id: _ctx.automation.id }),
       action.url],
      { timeout: 10_000, encoding: 'utf-8' },
    );
    if (result.status !== 0) {
      throw new Error(`webhook call failed: ${result.stderr?.slice(0, 200)}`);
    }
    return `Webhook called: ${action.url}`;
  },
};

// ── Core: process automations for a given trigger context ─────────────────────

export function processAutomations(
  project: ClaudeProject,
  projectDir: string,
  ctx: TriggerContext,
): AutomationResult[] {
  const automations = (project.automations ?? []).filter(
    (a) => a.enabled !== false,
  );
  if (automations.length === 0) return [];

  const state = readState(project);
  const results: AutomationResult[] = [];

  for (const automation of automations) {
    const shouldFire = ctx.forceAll || evaluateTrigger(automation, ctx, state);
    if (!shouldFire) {
      results.push({ automationId: automation.id, fired: false });
      continue;
    }

    const handler = ACTION_HANDLERS[automation.action.type];
    if (!handler) {
      results.push({
        automationId: automation.id,
        fired: false,
        error: `Unknown action type: ${automation.action.type}`,
      });
      continue;
    }

    let output: string | undefined;
    let error: string | undefined;

    try {
      output = handler(automation.action, { project, projectDir, automation, triggerCtx: ctx });
    } catch (err) {
      error = String(err);
    }

    // Update state
    const entry = state[automation.id] ?? {};
    entry.last_fired = new Date().toISOString();
    entry.fire_count = (entry.fire_count ?? 0) + 1;
    if (ctx.event) entry.last_event_id = ctx.event.id;
    state[automation.id] = entry;

    // Log automation fired event
    appendEvent(project, 'automation_fired', {
      summary: `Automation ${automation.id}: ${automation.action.type}${output ? ` → ${output.slice(0, 80)}` : ''}${error ? ` ERROR: ${error.slice(0, 80)}` : ''}`,
      automation_id: automation.id,
      action_type: automation.action.type,
      trigger_type: ctx.type,
      output: output?.slice(0, 500),
      error: error?.slice(0, 500),
    });

    results.push({
      automationId: automation.id,
      fired: true,
      action: automation.action.type,
      output,
      error,
    });
  }

  writeState(project, state);
  return results;
}

// ── Convenience: fire automations for an event (called from hook-run / daemon) ─

export function processEventAutomations(
  project: ClaudeProject,
  projectDir: string,
  event: ProjectEvent,
): AutomationResult[] {
  return processAutomations(project, projectDir, {
    type: 'event',
    event,
  });
}

// ── Convenience: fire scheduled automations (called from daemon) ───────────────

export function processScheduledAutomations(
  project: ClaudeProject,
  projectDir: string,
): AutomationResult[] {
  return processAutomations(project, projectDir, { type: 'schedule' });
}

// ── List automations with their state ────────────────────────────────────────

export function listAutomationsWithState(
  project: ClaudeProject,
): Array<{ automation: Automation; state: AutomationState[string] }> {
  const state = readState(project);
  return (project.automations ?? []).map((a) => ({
    automation: a,
    state: state[a.id] ?? {},
  }));
}
