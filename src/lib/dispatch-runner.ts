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
import { buildSystemPrompt } from './system-prompt-builder.js';
import { getModel, estimateCost, CACHE_MIN_TOKENS } from '../config/models.js';

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
  cost_usd?: number;
  model_used?: string;
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

// ── Python compressor helper ──────────────────────────────────────────────────

function callPythonCompressor(
  mode: string,
  text: string,
  projectDir: string,
): { output: string; latency_ms: number } {
  try {
    const venvPython = path.join(projectDir, '.venv-research', 'bin', 'python3');
    const python = fs.existsSync(venvPython) ? venvPython : 'python3';
    const scriptPath = path.join(projectDir, 'mcp', 'compress_cli.py');

    const t0 = Date.now();
    const result = spawnSync(python, [scriptPath], {
      input: JSON.stringify({ mode, text }),
      encoding: 'utf-8',
      timeout: 30_000,
      env: { ...process.env },
    });
    const latency_ms = Date.now() - t0;

    if (result.status !== 0 || result.error) {
      return { output: text, latency_ms };
    }
    const parsed = JSON.parse(result.stdout.trim()) as { output?: string };
    return {
      output: typeof parsed.output === 'string' && parsed.output.length > 0
        ? parsed.output : text,
      latency_ms,
    };
  } catch {
    return { output: text, latency_ms: 0 };
  }
}

// ── PD registry lookup helper ─────────────────────────────────────────────────

function lookupPD(
  db: import('better-sqlite3').Database,
  taskType: string,
  _interactionPair: string,
): { id: string; text: string } | null {
  try {
    const row = db.prepare(
      `SELECT id, text FROM pd_registry
       WHERE (task_type=? OR task_type IS NULL) AND deprecated=0
       ORDER BY use_count DESC LIMIT 1`
    ).get(taskType) as { id: string; text: string } | undefined;
    return row ?? null;
  } catch {
    return null;
  }
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

  // ── Optimization flags ───────────────────────────────────────────────────────
  const opts = project.optimizations ?? {};
  const useFormatEncode = opts.format_encode  ?? true;
  const useCache        = opts.cache_prefix   ?? true;
  const useClarity      = opts.clarity_layer  ?? true;
  const useLLMlingua    = opts.llmlingua      ?? true;
  const usePdRegistry   = opts.pd_registry    ?? true;

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
  // Always use the rich cacheable prompt as the base (≥1024 tokens required for cache activation).
  // Append any agent-specific instructions from the config on top.
  const basePrompt = buildSystemPrompt(agentKey ?? 'main');
  const systemPrompt = agentDef?.instructions
    ? `${basePrompt}\n\n## Agent-Specific Instructions\n\n${agentDef.instructions}`
    : basePrompt;
  const model = agentDef?.model ?? getModel('dispatch');
  const maxTokens = agentDef?.max_tokens ?? 4096;
  const agentTools = agentDef?.tools ?? [];

  // ── Classify task ────────────────────────────────────────────────────────────
  const taskType = classifyTaskType(dispatch.title, dispatch.body ?? '');
  dispatch.task_type = taskType;
  const protocolCondition = dispatch.protocol_id ? 'pd_negotiated' : 'natural_language';

  // ── Processing pipeline: clarity → format-encode → llmlingua → PD ───────────

  // (a) Raw body
  const bodyRaw = dispatch.body ?? '';

  // (b/c) Clarity layer
  let postClarityBody = bodyRaw;
  if (useClarity) {
    const clarityStart = Date.now();
    postClarityBody = callPythonCompressor('clarity', bodyRaw, projectDir).output;
    timings.clarity_layer = Date.now() - clarityStart;
  }

  // (d/e/f) Format encoding — gated by flag; passthrough object when disabled
  const selectedFormat = useFormatEncode
    ? selectFormat(taskType, protocolCondition)
    : 'natural_language' as const;
  const encodingStart = Date.now();
  const encoded = useFormatEncode
    ? encodeDispatchBody(postClarityBody, taskType, selectedFormat)
    : {
        format: 'natural_language' as const,
        encoded_body: postClarityBody,
        original_chars: postClarityBody.length,
        encoded_chars: postClarityBody.length,
        compression_ratio: 0,
      };
  timings.compression = Date.now() - encodingStart;

  dispatch.dispatch_format = selectedFormat as DispatchFormat;
  dispatch.original_chars  = encoded.original_chars;
  dispatch.encoded_chars   = encoded.encoded_chars;
  dispatch.compression_ratio = encoded.compression_ratio;

  // (g/h/i) LLMlingua compression
  let messageBody = encoded.encoded_body;
  let postLinguaChars = messageBody.length;
  if (useLLMlingua && messageBody.length > 100) {
    const linguaResult = callPythonCompressor('llmlingua', messageBody, projectDir);
    messageBody = linguaResult.output;
    postLinguaChars = messageBody.length;
  }

  // (j) PD registry lookup
  let pdId: string | null = null;
  let effectiveSystemPrompt = systemPrompt;
  if (usePdRegistry) {
    const pdLookupStart = Date.now();
    try {
      const dbPath = getResearchDbPath(project, projectDir);
      const dbForPd = initResearchDb(dbPath);
      const pd = lookupPD(dbForPd, taskType, inferInteractionPair(dispatch.agent));
      dbForPd.close();
      if (pd) {
        pdId = pd.id;
        effectiveSystemPrompt = `${systemPrompt}\n\n---\n${pd.text}`;
        dispatch.protocol_id = pdId;
      }
    } catch { /* pd lookup must never block dispatch */ }
    timings.pd_lookup = Date.now() - pdLookupStart;
  }

  // (k) Build system: cached block array or plain string.
  // Cache is only activated when system prompt is above the model's minimum token threshold.
  // Below threshold, cache_control is wasteful — strip it.
  const estSystemTokens = Math.round(effectiveSystemPrompt.split(/\s+/).length * 1.3);
  const cacheMinForModel = CACHE_MIN_TOKENS[model] ?? 1024;
  const activateCache = useCache && estSystemTokens >= cacheMinForModel;
  const system: string | Anthropic.Messages.TextBlockParam[] = activateCache
    ? [{ type: 'text' as const, text: effectiveSystemPrompt, cache_control: { type: 'ephemeral' as const } }]
    : effectiveSystemPrompt;

  const toolCallLog: DispatchFile['tool_calls'] = [];
  let totalUsage = { input_tokens: 0, output_tokens: 0 };

  try {
    let resultText = '';

    // Beta header opts-in to prompt caching and overrides cross-region routing blocks.
    // Only sent when cache is actually active (system prompt above model minimum).
    const cacheApiOpts = activateCache
      ? { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
      : {};

    if (agentTools.length === 0) {
      // ── Simple mode: single API call ────────────────────────────────────────
      const inferStart = Date.now();
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: messageBody }],
      }, cacheApiOpts);
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
          system,
          messages,
          tools: allowedTools,
        }, cacheApiOpts);
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
    const cacheRead = ((lastResponse?.usage as unknown) as Record<string, unknown>)?.['cache_read_input_tokens'] as number ?? 0;
    const dispatchCost = estimateCost(model, totalUsage.input_tokens, totalUsage.output_tokens, cacheRead);
    writeDispatch(dispatchFilePath, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: resultText,
      tool_calls: toolCallLog,
      usage: totalUsage,
      task_type: classifyTaskType(dispatch.title, dispatch.body ?? ''),
      cost_usd: dispatchCost,
      model_used: model,
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
          input_raw_chars:    bodyRaw.length,
          input_post_clarity: postClarityBody.length,
          input_post_lingua:  postLinguaChars,
          // Ratio measures llmlingua's effect only (0 = no compression, 0.4 = 40% smaller)
          compression_ratio:  encoded.encoded_chars > 0
            ? parseFloat(((1 - postLinguaChars / encoded.encoded_chars)).toFixed(4))
            : 0,
        },
        outcome: 'success',
        iterations: toolCallLog.length,
        task_completed: true,
        ablation_condition: (dispatch as any).ablation_condition ?? null,
        cost_usd: dispatchCost,
        model,
        ts: new Date().toISOString(),
      };
      writeObservation(db, obs);
      // Fire-and-forget telemetry — never awaited, never blocks dispatch
      const optimizationFlags = {
        cache:         useCache,
        format_encode: useFormatEncode,
        clarity:       useClarity,
        llmlingua:     useLLMlingua,
        pd:            usePdRegistry,
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
        ablation_condition: (dispatch as any).ablation_condition ?? null,
        ts: new Date().toISOString(),
      };
      writeObservation(db, obs);
      const optimizationFlagsErr = {
        cache:         useCache,
        format_encode: useFormatEncode,
        clarity:       useClarity,
        llmlingua:     useLLMlingua,
        pd:            usePdRegistry,
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
