/**
 * dispatch-runner.ts
 * Runs a pending dispatch by calling the Claude API with an agentic tool loop.
 *
 * Dispatch lifecycle: pending → running → completed | failed
 *
 * Simple mode (no tools): single API call, write result.
 * Tool loop mode: multi-turn conversation with read_file, list_files,
 *   write_file, bash, log_event tools. MAX_ITERATIONS = 10.
 *
 * Path traversal guard: all file tool calls are clamped to projectDir.
 *
 * Requires ANTHROPIC_API_KEY in environment.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeProject } from './project.js';
import { resolvePaths } from './paths.js';
import { appendEvent } from './events.js';
import { initResearchDb, writeObservation, getResearchDbPath, DispatchObservation } from './research-db.js';
import { classifyTaskType, inferInteractionPair } from './task-classifier.js';
import { selectFormat, encodeDispatchBody, DispatchFormat } from './format-encoder.js';
import { sendTelemetryAsync } from './telemetry.js';

// Approximate token cost of sending BUILTIN_TOOLS to the API (measured: 5 tools ≈ 350 tokens).
const BUILTIN_TOOLS_TOKEN_COUNT = 350;

// ── Dispatch file schema ──────────────────────────────────────────────────────

export interface DispatchFile {
  id: string;
  title: string;
  body: string;
  agent?: string;
  priority?: 'low' | 'normal' | 'high';
  status: 'pending' | 'running' | 'completed' | 'failed';
  created?: string;
  started_at?: string;
  completed_at?: string;
  source?: string;
  result?: string;
  error?: string;
  tool_calls?: Array<{ tool: string; input: unknown; output_summary: string }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  protocol_id?: string;
  protocol_condition?: 'natural_language' | 'typed_schema' | 'pd_negotiated';
  session_id?: string;
  task_type?: string;
  dispatch_format?: DispatchFormat;
  encoded_chars?: number;
  original_chars?: number;
  compression_ratio?: number;
}

// ── Built-in tool definitions sent to the Claude API ─────────────────────────

const BUILTIN_TOOLS: Record<string, Anthropic.Messages.Tool> = {
  read_file: {
    name: 'read_file',
    description: 'Read a file from the project directory. Path is relative to the project root.',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'Relative file path' } },
      required: ['path'],
    },
  },
  list_files: {
    name: 'list_files',
    description: 'List files in a directory relative to the project root.',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'Relative directory path (default: ".")' } },
      required: [],
    },
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to a file in the project directory.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
  },
  bash: {
    name: 'bash',
    description: 'Run a shell command in the project directory.',
    input_schema: {
      type: 'object' as const,
      properties: { command: { type: 'string', description: 'Shell command to run' } },
      required: ['command'],
    },
  },
  log_event: {
    name: 'log_event',
    description: 'Append a custom event to the project event log.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Event type string' },
        data: { type: 'object', description: 'Optional extra data' },
      },
      required: ['type'],
    },
  },
};

// ── Path safety guard ─────────────────────────────────────────────────────────

function safePath(projectDir: string, relPath: string): string | null {
  const resolved = path.resolve(projectDir, relPath);
  if (!resolved.startsWith(path.resolve(projectDir) + path.sep) &&
      resolved !== path.resolve(projectDir)) {
    return null; // path traversal attempt
  }
  return resolved;
}

// ── Tool executor ─────────────────────────────────────────────────────────────

function executeTool(
  name: string,
  input: Record<string, unknown>,
  projectDir: string,
  project: ClaudeProject,
): string {
  try {
    switch (name) {
      case 'read_file': {
        const safe = safePath(projectDir, String(input['path'] ?? ''));
        if (!safe) return 'Error: path traversal not allowed';
        if (!fs.existsSync(safe)) return `Error: file not found: ${input['path']}`;
        const content = fs.readFileSync(safe, 'utf-8');
        return content.slice(0, 8000); // limit large files
      }

      case 'list_files': {
        const rel = String(input['path'] ?? '.');
        const safe = safePath(projectDir, rel);
        if (!safe) return 'Error: path traversal not allowed';
        if (!fs.existsSync(safe)) return `Error: directory not found: ${rel}`;
        const entries = fs.readdirSync(safe, { withFileTypes: true });
        return entries
          .map((e) => `${e.isDirectory() ? 'd' : 'f'}  ${e.name}`)
          .join('\n') || '(empty)';
      }

      case 'write_file': {
        const safe = safePath(projectDir, String(input['path'] ?? ''));
        if (!safe) return 'Error: path traversal not allowed';
        fs.mkdirSync(path.dirname(safe), { recursive: true });
        fs.writeFileSync(safe, String(input['content'] ?? ''), 'utf-8');
        return `Written: ${input['path']}`;
      }

      case 'bash': {
        const result = spawnSync('sh', ['-c', String(input['command'] ?? '')], {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: 30_000,
          env: { ...process.env },
        });
        const out = ((result.stdout ?? '') + (result.stderr ?? '')).slice(0, 4000);
        return out || `(exit ${result.status})`;
      }

      case 'log_event': {
        appendEvent(project, String(input['type'] ?? 'custom'), (input['data'] as Record<string, unknown>) ?? {});
        return `Event logged: ${input['type']}`;
      }

      default:
        return `Error: unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error: ${String(err)}`;
  }
}

// ── Dispatch reader / writer ──────────────────────────────────────────────────

function readDispatch(filePath: string): DispatchFile {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DispatchFile;
}

function writeDispatch(filePath: string, data: Partial<DispatchFile>): void {
  const existing = fs.existsSync(filePath) ? readDispatch(filePath) : {} as DispatchFile;
  const updated = { ...existing, ...data };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}

// ── Main entry: run one dispatch ──────────────────────────────────────────────

export async function runDispatch(
  dispatchFilePath: string,
  project: ClaudeProject,
  projectDir: string,
  apiKey: string,
): Promise<void> {
  let dispatch: DispatchFile;
  try {
    dispatch = readDispatch(dispatchFilePath);
  } catch (err) {
    console.error(`dispatch-runner: cannot read ${dispatchFilePath}: ${err}`);
    return;
  }

  if (dispatch.status !== 'pending') {
    console.log(`dispatch-runner: skipping ${dispatch.id} (status=${dispatch.status})`);
    return;
  }

  const sessionId = process.env['CLAUDE_SESSION_ID'] ?? process.env['CP_SESSION_ID'] ?? randomUUID().slice(0, 8);
  const taskStart = Date.now();
  const timings = { clarity_layer: 0, compression: 0, pd_lookup: 0, inference: 0, tool_execution: 0, total: 0 };
  let lastResponse: Anthropic.Messages.Message | undefined;

  // Claim the dispatch immediately
  writeDispatch(dispatchFilePath, {
    status: 'running',
    started_at: new Date().toISOString(),
    session_id: sessionId,
  });

  const client = new Anthropic({ apiKey });

  // Resolve agent definition
  const agentKey = dispatch.agent ?? Object.keys(project.agents ?? {})[0];
  const agentDef = agentKey ? (project.agents ?? {})[agentKey] : undefined;
  const systemPrompt = agentDef?.instructions
    ?? `You are a helpful agent for the project "${project.name}". Complete the given task clearly and concisely.`;
  const model = agentDef?.model ?? 'claude-sonnet-4-6';
  const maxTokens = agentDef?.max_tokens ?? 4096;
  const agentTools = agentDef?.tools ?? [];

  // ── Format encoding ─────────────────────────────────────────────────────────
  const taskType = classifyTaskType(dispatch.title, dispatch.body ?? '');
  const protocolCondition = dispatch.protocol_id ? 'pd_negotiated' : 'natural_language';
  const selectedFormat = selectFormat(taskType, protocolCondition);
  const encodingStart = Date.now();
  const encoded = encodeDispatchBody(dispatch.body ?? '', taskType, selectedFormat);
  timings.compression = Date.now() - encodingStart;
  dispatch.task_type = taskType;
  dispatch.dispatch_format = selectedFormat;
  dispatch.encoded_chars = encoded.encoded_chars;
  dispatch.original_chars = encoded.original_chars;
  dispatch.compression_ratio = encoded.compression_ratio;
  const messageBody = encoded.encoded_body;

  const toolCallLog: DispatchFile['tool_calls'] = [];
  let totalUsage = { input_tokens: 0, output_tokens: 0 };

  try {
    let resultText = '';

    if (agentTools.length === 0) {
      // ── Simple mode: single API call ────────────────────────────────────────
      const inferStart = Date.now();
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: messageBody }],
      });
      timings.inference = Date.now() - inferStart;
      lastResponse = response;
      totalUsage.input_tokens += response.usage.input_tokens;
      totalUsage.output_tokens += response.usage.output_tokens;
      resultText = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
    } else {
      // ── Tool loop mode ───────────────────────────────────────────────────────
      const allowedTools = agentTools
        .filter((n) => BUILTIN_TOOLS[n])
        .map((n) => BUILTIN_TOOLS[n]!);

      const messages: Anthropic.Messages.MessageParam[] = [
        { role: 'user', content: messageBody },
      ];

      const MAX_ITERATIONS = 10;
      let iterations = 0;

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const iterStart = Date.now();
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
          tools: allowedTools,
        });
        timings.inference += Date.now() - iterStart;
        lastResponse = response;

        totalUsage.input_tokens += response.usage.input_tokens;
        totalUsage.output_tokens += response.usage.output_tokens;

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          resultText = response.content
            .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n');
          break;
        }

        if (response.stop_reason !== 'tool_use') {
          resultText = response.content
            .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n');
          break;
        }

        // Process tool_use blocks
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const toolInput = block.input as Record<string, unknown>;
          const toolOutput = executeTool(block.name, toolInput, projectDir, project);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: toolOutput,
          });
          toolCallLog.push({
            tool: block.name,
            input: toolInput,
            output_summary: toolOutput.slice(0, 200),
          });
        }
        messages.push({ role: 'user', content: toolResults });
      }

      if (iterations >= MAX_ITERATIONS) {
        resultText += '\n[Stopped: reached max iterations limit]';
      }
    }

    // Success
    writeDispatch(dispatchFilePath, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: resultText,
      tool_calls: toolCallLog,
      usage: totalUsage,
      task_type: classifyTaskType(dispatch.title, dispatch.body ?? ''),
    });

    // Record research observation + increment interaction pair counter
    try {
      timings.total = Date.now() - taskStart;
      const dbPath = getResearchDbPath(project, projectDir);
      const db = initResearchDb(dbPath);

      // Increment interaction count for this pair (PD negotiation threshold tracking)
      const pair = inferInteractionPair(dispatch.agent);
      const projectId = project.project_id ?? project.name ?? 'unknown';
      const now = new Date().toISOString();
      const existingCount = db.prepare(
        'SELECT count FROM interaction_counts WHERE pair=? AND project_id=?'
      ).get(pair, projectId) as { count: number } | undefined;
      const newCount = (existingCount?.count ?? 0) + 1;
      if (existingCount) {
        db.prepare('UPDATE interaction_counts SET count=?, last_seen=? WHERE pair=? AND project_id=?')
          .run(newCount, now, pair, projectId);
      } else {
        db.prepare('INSERT INTO interaction_counts (pair, project_id, count, last_seen) VALUES (?,?,?,?)')
          .run(pair, projectId, 1, now);
      }
      if (newCount >= 3) {
        console.log(`[research] Interaction pair "${pair}" hit threshold (${newCount}) — consider PD negotiation`);
      }
      const usage = lastResponse?.usage ?? { input_tokens: 0, output_tokens: 0 };
      const obs: DispatchObservation = {
        id: randomUUID().slice(0, 8),
        dispatch_id: dispatch.id,
        session_id: sessionId,
        interaction_pair: inferInteractionPair(dispatch.agent),
        task_type: classifyTaskType(dispatch.title, dispatch.body ?? ''),
        protocol_condition: dispatch.protocol_id ? 'pd_negotiated' : 'natural_language',
        protocol_id: dispatch.protocol_id,
        pd_was_cached: false,
        tokens: {
          system_prompt: 0,
          project_context: 0,
          tool_schemas: BUILTIN_TOOLS_TOKEN_COUNT,
          user_message: 0,
          tool_outputs: 0,
          total_input: totalUsage.input_tokens,
          output: totalUsage.output_tokens,
          cache_write: (usage as Record<string, unknown>)['cache_creation_input_tokens'] as number ?? 0,
          cache_read: (usage as Record<string, unknown>)['cache_read_input_tokens'] as number ?? 0,
        },
        latency_ms: timings,
        compression: {
          input_raw_chars: dispatch.original_chars ?? dispatch.body?.length ?? 0,
          input_post_clarity: dispatch.original_chars ?? 0,
          input_post_lingua: dispatch.encoded_chars ?? 0,
          compression_ratio: dispatch.compression_ratio ?? 0,
        },
        outcome: 'success',
        iterations: toolCallLog.length,
        task_completed: true,
        ts: new Date().toISOString(),
      };
      writeObservation(db, obs);
      // Fire-and-forget telemetry — never awaited, never blocks dispatch
      const optimizationFlags = {
        cache:         project.optimizations?.cache_prefix   ?? true,
        format_encode: project.optimizations?.format_encode  ?? true,
        clarity:       project.optimizations?.clarity_layer  ?? true,
        llmlingua:     project.optimizations?.llmlingua      ?? true,
        pd:            project.optimizations?.pd_registry    ?? true,
      };
      sendTelemetryAsync(obs, project, projectDir, optimizationFlags,
        (dispatch as any).ablation_condition ?? null);
      db.close();
    } catch (obsErr) {
      console.error('[research] Failed to write observation:', obsErr);
    }

    appendEvent(project, 'dispatch_completed', {
      summary: `Dispatch ${dispatch.id} completed`,
      dispatch_id: dispatch.id,
      agent: agentKey ?? '(none)',
      tool_calls: toolCallLog.length,
      usage: totalUsage,
    });

  } catch (err) {
    writeDispatch(dispatchFilePath, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: String(err),
    });

    // Record failure observation
    try {
      timings.total = Date.now() - taskStart;
      const dbPath = getResearchDbPath(project, projectDir);
      const db = initResearchDb(dbPath);
      const obs: DispatchObservation = {
        id: randomUUID().slice(0, 8),
        dispatch_id: dispatch.id,
        session_id: sessionId,
        interaction_pair: inferInteractionPair(dispatch.agent),
        task_type: classifyTaskType(dispatch.title, dispatch.body ?? ''),
        protocol_condition: dispatch.protocol_id ? 'pd_negotiated' : 'natural_language',
        protocol_id: dispatch.protocol_id,
        pd_was_cached: false,
        tokens: {
          system_prompt: 0, project_context: 0, tool_schemas: BUILTIN_TOOLS_TOKEN_COUNT,
          user_message: 0, tool_outputs: 0,
          total_input: totalUsage.input_tokens, output: totalUsage.output_tokens,
          cache_write: 0, cache_read: 0,
        },
        latency_ms: timings,
        outcome: 'failure',
        iterations: toolCallLog.length,
        task_completed: false,
        ts: new Date().toISOString(),
      };
      writeObservation(db, obs);
      const optimizationFlagsErr = {
        cache:         project.optimizations?.cache_prefix   ?? true,
        format_encode: project.optimizations?.format_encode  ?? true,
        clarity:       project.optimizations?.clarity_layer  ?? true,
        llmlingua:     project.optimizations?.llmlingua      ?? true,
        pd:            project.optimizations?.pd_registry    ?? true,
      };
      sendTelemetryAsync(obs, project, projectDir, optimizationFlagsErr,
        (dispatch as any).ablation_condition ?? null);
      db.close();
    } catch { /* observation failure must not mask original error */ }

    appendEvent(project, 'dispatch_failed', {
      summary: `Dispatch ${dispatch.id} failed: ${String(err).slice(0, 200)}`,
      dispatch_id: dispatch.id,
      agent: agentKey ?? '(none)',
      error: String(err),
    });

    throw err; // re-throw so caller can log
  }
}

// ── Utility: find all dispatch files for a project ───────────────────────────

export function findDispatchFiles(
  project: ClaudeProject,
  opts: { status?: string; agent?: string } = {},
): Array<{ filePath: string; dispatch: DispatchFile }> {
  const paths = resolvePaths(project);
  if (!fs.existsSync(paths.dispatchesDir)) return [];

  return fs
    .readdirSync(paths.dispatchesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const filePath = path.join(paths.dispatchesDir, f);
      try {
        const dispatch = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DispatchFile;
        return { filePath, dispatch };
      } catch {
        return null;
      }
    })
    .filter((x): x is { filePath: string; dispatch: DispatchFile } => x !== null)
    .filter((x) => !opts.status || x.dispatch.status === opts.status)
    .filter((x) => !opts.agent || x.dispatch.agent === opts.agent)
    .sort((a, b) => (a.dispatch.created ?? '').localeCompare(b.dispatch.created ?? ''));
}

// ── Utility: create a new dispatch file ──────────────────────────────────────

export function createDispatchFile(
  project: ClaudeProject,
  opts: {
    title: string;
    body?: string;
    agent?: string;
    priority?: 'low' | 'normal' | 'high';
    source?: string;
  },
): string {
  const paths = resolvePaths(project);
  fs.mkdirSync(paths.dispatchesDir, { recursive: true });

  const id = `dispatch-${randomUUID().slice(0, 8)}`;
  const dispatch: DispatchFile = {
    id,
    title: opts.title,
    body: opts.body ?? '',
    agent: opts.agent,
    priority: opts.priority ?? 'normal',
    status: 'pending',
    created: new Date().toISOString(),
    source: opts.source ?? 'cli',
  };

  const filePath = path.join(paths.dispatchesDir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(dispatch, null, 2) + '\n', 'utf-8');

  appendEvent(project, 'dispatch_created', {
    summary: `Dispatch created: ${opts.title}`,
    dispatch_id: id,
    agent: opts.agent ?? '(none)',
  });

  return filePath;
}
