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
  usage?: { input_tokens: number; output_tokens: number };
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

  // Claim the dispatch immediately
  writeDispatch(dispatchFilePath, {
    status: 'running',
    started_at: new Date().toISOString(),
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

  const toolCallLog: DispatchFile['tool_calls'] = [];
  let totalUsage = { input_tokens: 0, output_tokens: 0 };

  try {
    let resultText = '';

    if (agentTools.length === 0) {
      // ── Simple mode: single API call ────────────────────────────────────────
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: dispatch.body }],
      });
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
        { role: 'user', content: dispatch.body },
      ];

      const MAX_ITERATIONS = 10;
      let iterations = 0;

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
          tools: allowedTools,
        });

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
    });

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
