// src/lib/telemetry.ts
// Anonymous metrics sender. Fires after dispatch completion.
// Never blocks. Never throws. Opt-in only via .claude-project telemetry.enabled.

import * as crypto from 'crypto';
import * as os from 'os';
import { DispatchObservation } from './research-db.js';
import { ClaudeProject } from './project.js';

const TELEMETRY_ENDPOINT =
  process.env['CLAUDE_TELEMETRY_ENDPOINT'] ??
  'https://telemetry.claude-project.workers.dev/ingest';

const TELEMETRY_SCHEMA_VERSION = '1.0';

// ── Installation ID ───────────────────────────────────────────────────────────
// Derived from machine hostname + username. Hashed — not reversible.
// Stable across sessions on the same machine.

function getInstallationId(): string {
  const raw = `${os.hostname()}:${os.userInfo().username}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function getProjectId(projectPath: string): string {
  return crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 12);
}

// ── Payload construction ──────────────────────────────────────────────────────

export interface TelemetryPayload {
  installation_id: string;
  project_id: string;
  schema_version: string;
  task_type: string;
  protocol_condition: string;
  dispatch_format: string;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  compression_ratio: number | null;
  latency_total_ms: number;
  outcome: string;
  iterations: number;
  optimizations: {
    cache: boolean;
    format_encode: boolean;
    clarity: boolean;
    llmlingua: boolean;
    pd: boolean;
  };
  ablation_condition: string | null;
  ts: string;
}

function stripToMetricsOnly(
  obs: DispatchObservation,
  project: ClaudeProject,
  projectDir: string,
  optimizations: {
    cache: boolean;
    format_encode: boolean;
    clarity: boolean;
    llmlingua: boolean;
    pd: boolean;
  },
  ablationCondition: string | null = null,
): TelemetryPayload {
  // Date only — no sub-second precision
  const dateOnly = obs.ts.slice(0, 10) + 'T00:00:00Z';

  return {
    installation_id:    getInstallationId(),
    project_id:         getProjectId(projectDir),
    schema_version:     TELEMETRY_SCHEMA_VERSION,
    task_type:          obs.task_type,
    protocol_condition: obs.protocol_condition,
    dispatch_format:    (obs as any).dispatch_format ?? 'natural_language',
    tokens_input:       obs.tokens.total_input,
    tokens_output:      obs.tokens.output,
    tokens_cache_read:  obs.tokens.cache_read,
    tokens_cache_write: obs.tokens.cache_write,
    compression_ratio:  obs.compression?.compression_ratio ?? null,
    latency_total_ms:   obs.latency_ms.total,
    outcome:            obs.outcome,
    iterations:         obs.iterations,
    optimizations,
    ablation_condition: ablationCondition,
    ts:                 dateOnly,
  };
}

// ── Sender ────────────────────────────────────────────────────────────────────

export function sendTelemetryAsync(
  obs: DispatchObservation,
  project: ClaudeProject,
  projectDir: string,
  optimizations: {
    cache: boolean;
    format_encode: boolean;
    clarity: boolean;
    llmlingua: boolean;
    pd: boolean;
  },
  ablationCondition: string | null = null,
): void {
  // Opt-in gate — silent return if not enabled
  if (!project.telemetry?.enabled) return;

  const payload = stripToMetricsOnly(
    obs, project, projectDir, optimizations, ablationCondition,
  );

  // Fire and forget — setImmediate ensures dispatch is fully done first
  setImmediate(() => {
    const body = JSON.stringify(payload);

    fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Schema-Version': TELEMETRY_SCHEMA_VERSION,
      },
      body,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Silently discard all errors — network down, endpoint unreachable, etc.
      // Never log to stderr — would pollute MCP output
    });
  });
}

// ── Opt-in prompt helper ──────────────────────────────────────────────────────

export function generateInstallationId(): string {
  return getInstallationId();
}

export function telemetryPreview(
  obs: DispatchObservation,
  project: ClaudeProject,
  projectDir: string,
): string {
  const payload = stripToMetricsOnly(obs, project, projectDir,
    { cache: true, format_encode: true, clarity: false, llmlingua: true, pd: false });
  return JSON.stringify(payload, null, 2);
}
