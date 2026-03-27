// src/lib/research-db.ts
// SQLite research database: stores full DispatchObservations for token-efficiency research.
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { ClaudeProject } from './project.js';
import { resolvePaths } from './paths.js';

export type TaskType =
  | 'code_gen' | 'refactor' | 'analysis' | 'retrieval'
  | 'planning' | 'test_gen' | 'pipeline' | 'documentation' | 'unknown';

export interface DispatchObservation {
  id: string;
  dispatch_id: string;
  session_id: string;
  interaction_pair: string;
  task_type: TaskType;
  protocol_condition: 'natural_language' | 'typed_schema' | 'pd_negotiated';
  protocol_id?: string;
  pd_was_cached: boolean;
  tokens: {
    system_prompt: number;
    project_context: number;
    tool_schemas: number;
    user_message: number;
    tool_outputs: number;
    total_input: number;
    output: number;
    cache_write: number;
    cache_read: number;
  };
  compression?: {
    input_raw_chars: number;
    input_post_clarity: number;
    input_post_lingua: number;
    compression_ratio: number;
  };
  latency_ms: {
    clarity_layer: number;
    compression: number;
    pd_lookup: number;
    inference: number;
    tool_execution: number;
    total: number;
  };
  outcome: 'success' | 'failure' | 'partial';
  iterations: number;
  task_completed: boolean;
  ablation_condition?: string | null;
  cost_usd?: number;
  model?: string;
  ts: string;
}

export function getResearchDbPath(project: ClaudeProject, projectDir: string): string {
  const paths = resolvePaths(project, projectDir);
  return path.join(path.dirname(paths.memoryDir), 'research.db');
}

export function initResearchDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS dispatch_observations (
      id TEXT PRIMARY KEY,
      dispatch_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      interaction_pair TEXT NOT NULL,
      task_type TEXT NOT NULL,
      protocol_condition TEXT NOT NULL,
      protocol_id TEXT,
      pd_was_cached INTEGER NOT NULL DEFAULT 0,
      tokens_system_prompt INTEGER NOT NULL DEFAULT 0,
      tokens_project_context INTEGER NOT NULL DEFAULT 0,
      tokens_tool_schemas INTEGER NOT NULL DEFAULT 0,
      tokens_user_message INTEGER NOT NULL DEFAULT 0,
      tokens_tool_outputs INTEGER NOT NULL DEFAULT 0,
      tokens_total_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      tokens_cache_write INTEGER NOT NULL DEFAULT 0,
      tokens_cache_read INTEGER NOT NULL DEFAULT 0,
      latency_clarity_ms INTEGER NOT NULL DEFAULT 0,
      latency_compression_ms INTEGER NOT NULL DEFAULT 0,
      latency_pd_lookup_ms INTEGER NOT NULL DEFAULT 0,
      latency_inference_ms INTEGER NOT NULL DEFAULT 0,
      latency_tool_exec_ms INTEGER NOT NULL DEFAULT 0,
      latency_total_ms INTEGER NOT NULL DEFAULT 0,
      compression_ratio REAL,
      compression_input_raw INTEGER,
      compression_post_clarity INTEGER,
      compression_post_lingua INTEGER,
      outcome TEXT NOT NULL,
      iterations INTEGER NOT NULL DEFAULT 0,
      task_completed INTEGER NOT NULL DEFAULT 0,
      ablation_condition TEXT,
      cost_usd REAL DEFAULT 0,
      model TEXT DEFAULT 'unknown',
      ts TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pd_registry (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      yaml_meta TEXT,
      task_type TEXT,
      interaction_pair TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used TEXT,
      deprecated INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT
    );

    CREATE TABLE IF NOT EXISTS pd_usage_log (
      id TEXT PRIMARY KEY,
      pd_id TEXT NOT NULL REFERENCES pd_registry(id),
      dispatch_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      tokens_saved INTEGER,
      ts TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_summaries (
      path TEXT NOT NULL,
      project_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      summary_hash TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (path, project_id)
    );

    CREATE TABLE IF NOT EXISTS interaction_counts (
      pair TEXT NOT NULL,
      project_id TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      last_seen TEXT NOT NULL,
      pd_assigned TEXT,
      PRIMARY KEY (pair, project_id)
    );

    CREATE TABLE IF NOT EXISTS pd_research_results (
      id TEXT PRIMARY KEY,
      interaction_pair TEXT NOT NULL,
      task_type TEXT NOT NULL,
      c_negotiate INTEGER,
      c_nl_mean REAL,
      c_pd_mean REAL,
      n_breakeven REAL,
      n_observations INTEGER,
      confidence REAL,
      computed_at TEXT NOT NULL
    );

    -- Migrations for columns added after initial schema
    -- SQLite ignores duplicate column errors when using ALTER TABLE
  `);

  // Additive column migrations — safe to run repeatedly
  for (const migration of [
    "ALTER TABLE dispatch_observations ADD COLUMN cost_usd REAL DEFAULT 0",
    "ALTER TABLE dispatch_observations ADD COLUMN model TEXT DEFAULT 'unknown'",
  ]) {
    try { db.exec(migration); } catch { /* column already exists */ }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_obs_dispatch   ON dispatch_observations(dispatch_id);
    CREATE INDEX IF NOT EXISTS idx_obs_task_type  ON dispatch_observations(task_type);
    CREATE INDEX IF NOT EXISTS idx_obs_protocol   ON dispatch_observations(protocol_condition);
    CREATE INDEX IF NOT EXISTS idx_obs_ts         ON dispatch_observations(ts);
    CREATE INDEX IF NOT EXISTS idx_pd_task        ON pd_registry(task_type);
    CREATE INDEX IF NOT EXISTS idx_ic_pair        ON interaction_counts(pair, project_id);
  `);

  return db;
}

export function writeObservation(db: Database.Database, obs: DispatchObservation): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO dispatch_observations VALUES (
      @id, @dispatch_id, @session_id, @interaction_pair, @task_type,
      @protocol_condition, @protocol_id, @pd_was_cached,
      @tokens_system_prompt, @tokens_project_context, @tokens_tool_schemas,
      @tokens_user_message, @tokens_tool_outputs, @tokens_total_input,
      @tokens_output, @tokens_cache_write, @tokens_cache_read,
      @latency_clarity_ms, @latency_compression_ms, @latency_pd_lookup_ms,
      @latency_inference_ms, @latency_tool_exec_ms, @latency_total_ms,
      @compression_ratio, @compression_input_raw, @compression_post_clarity,
      @compression_post_lingua, @outcome, @iterations, @task_completed, @ablation_condition,
      @cost_usd, @model, @ts
    )
  `);
  stmt.run({
    id: obs.id,
    dispatch_id: obs.dispatch_id,
    session_id: obs.session_id,
    interaction_pair: obs.interaction_pair,
    task_type: obs.task_type,
    protocol_condition: obs.protocol_condition,
    protocol_id: obs.protocol_id ?? null,
    pd_was_cached: obs.pd_was_cached ? 1 : 0,
    tokens_system_prompt: obs.tokens.system_prompt,
    tokens_project_context: obs.tokens.project_context,
    tokens_tool_schemas: obs.tokens.tool_schemas,
    tokens_user_message: obs.tokens.user_message,
    tokens_tool_outputs: obs.tokens.tool_outputs,
    tokens_total_input: obs.tokens.total_input,
    tokens_output: obs.tokens.output,
    tokens_cache_write: obs.tokens.cache_write,
    tokens_cache_read: obs.tokens.cache_read,
    latency_clarity_ms: obs.latency_ms.clarity_layer,
    latency_compression_ms: obs.latency_ms.compression,
    latency_pd_lookup_ms: obs.latency_ms.pd_lookup,
    latency_inference_ms: obs.latency_ms.inference,
    latency_tool_exec_ms: obs.latency_ms.tool_execution,
    latency_total_ms: obs.latency_ms.total,
    compression_ratio: obs.compression?.compression_ratio ?? null,
    compression_input_raw: obs.compression?.input_raw_chars ?? null,
    compression_post_clarity: obs.compression?.input_post_clarity ?? null,
    compression_post_lingua: obs.compression?.input_post_lingua ?? null,
    outcome: obs.outcome,
    iterations: obs.iterations,
    task_completed: obs.task_completed ? 1 : 0,
    ablation_condition: obs.ablation_condition ?? null,
    cost_usd: obs.cost_usd ?? 0,
    model: obs.model ?? 'unknown',
    ts: obs.ts,
  });
}
