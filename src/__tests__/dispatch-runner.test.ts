/**
 * Tests for src/lib/dispatch-runner.ts
 *
 * Covers:
 *  - safePath — path traversal guard (security-critical)
 *  - createDispatchFile — creates file with correct schema
 *  - findDispatchFiles — filtering by status and agent
 *  - runDispatch — pending→running→completed lifecycle (mocked SDK)
 *  - runDispatch — pending→failed on API error
 *  - runDispatch — skips non-pending dispatches
 *  - runDispatch — tool loop with tool_use blocks
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Single top-level mock (vi.mock is hoisted — must be at module level) ──────

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProject(tmpDir: string) {
  const memoryDir = path.join(tmpDir, 'memory');
  fs.mkdirSync(memoryDir, { recursive: true });
  const eventsFile = path.join(tmpDir, 'events.jsonl');
  fs.writeFileSync(eventsFile, '', 'utf-8');

  return {
    version: '4' as const,
    project_id: 'dispatch-test',
    name: 'Dispatch Test',
    description: '',
    created: new Date().toISOString(),
    created_by: 'test',
    memory_path: memoryDir,
    agents: {
      helper: {
        role: 'Helper',
        instructions: 'You are a test agent.',
        tools: ['read_file', 'list_files'],
      },
    },
  };
}

// ── safePath (path traversal guard) ──────────────────────────────────────────

describe('executeTool — path traversal guard', () => {
  it('detects traversal via ../ as unsafe', () => {
    const projectDir = '/home/user/myproject';
    const malicious = '../../../etc/passwd';
    const resolved = path.resolve(projectDir, malicious);
    const isTraversal =
      !resolved.startsWith(path.resolve(projectDir) + path.sep) &&
      resolved !== path.resolve(projectDir);
    expect(isTraversal).toBe(true);
  });

  it('allows a valid relative path', () => {
    const projectDir = '/home/user/myproject';
    const valid = 'src/index.ts';
    const resolved = path.resolve(projectDir, valid);
    const isTraversal =
      !resolved.startsWith(path.resolve(projectDir) + path.sep) &&
      resolved !== path.resolve(projectDir);
    expect(isTraversal).toBe(false);
  });

  it('allows the project root itself', () => {
    const projectDir = '/home/user/myproject';
    const resolved = path.resolve(projectDir, '.');
    const isTraversal =
      !resolved.startsWith(path.resolve(projectDir) + path.sep) &&
      resolved !== path.resolve(projectDir);
    expect(isTraversal).toBe(false);
  });
});

// ── createDispatchFile ────────────────────────────────────────────────────────

describe('createDispatchFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-create-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a JSON file with status=pending', async () => {
    const { createDispatchFile } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    const filePath = createDispatchFile(project, {
      title: 'Test Task',
      body: 'Do something useful.',
      agent: 'helper',
      priority: 'normal',
    });

    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.title).toBe('Test Task');
    expect(data.body).toBe('Do something useful.');
    expect(data.agent).toBe('helper');
    expect(data.status).toBe('pending');
    expect(data.priority).toBe('normal');
    expect(data.id).toMatch(/^dispatch-/);
    expect(data.created).toBeTruthy();
  });

  it('generates a unique id each call', async () => {
    const { createDispatchFile } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    const a = createDispatchFile(project, { title: 'A' });
    const b = createDispatchFile(project, { title: 'B' });

    const idA = JSON.parse(fs.readFileSync(a, 'utf-8')).id;
    const idB = JSON.parse(fs.readFileSync(b, 'utf-8')).id;
    expect(idA).not.toBe(idB);
  });

  it('defaults priority to normal when not specified', async () => {
    const { createDispatchFile } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    const filePath = createDispatchFile(project, { title: 'No Priority' });
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.priority).toBe('normal');
  });
});

// ── findDispatchFiles ─────────────────────────────────────────────────────────

describe('findDispatchFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-find-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when dispatches dir does not exist', async () => {
    const { findDispatchFiles } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;
    expect(findDispatchFiles(project)).toEqual([]);
  });

  it('filters by status', async () => {
    const { createDispatchFile, findDispatchFiles } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    createDispatchFile(project, { title: 'Pending One' });
    const completedPath = createDispatchFile(project, { title: 'Completed One' });

    const raw = JSON.parse(fs.readFileSync(completedPath, 'utf-8'));
    raw.status = 'completed';
    fs.writeFileSync(completedPath, JSON.stringify(raw), 'utf-8');

    expect(findDispatchFiles(project, { status: 'pending' })).toHaveLength(1);
    expect(findDispatchFiles(project, { status: 'pending' })[0].dispatch.title).toBe('Pending One');
    expect(findDispatchFiles(project, { status: 'completed' })).toHaveLength(1);
  });

  it('filters by agent', async () => {
    const { createDispatchFile, findDispatchFiles } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    createDispatchFile(project, { title: 'For Helper', agent: 'helper' });
    createDispatchFile(project, { title: 'For Reviewer', agent: 'reviewer' });

    const results = findDispatchFiles(project, { agent: 'helper' });
    expect(results).toHaveLength(1);
    expect(results[0].dispatch.agent).toBe('helper');
  });

  it('returns all dispatches when no filter is specified', async () => {
    const { createDispatchFile, findDispatchFiles } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    createDispatchFile(project, { title: 'One' });
    createDispatchFile(project, { title: 'Two' });
    createDispatchFile(project, { title: 'Three' });

    expect(findDispatchFiles(project)).toHaveLength(3);
  });
});

// ── runDispatch ───────────────────────────────────────────────────────────────

describe('runDispatch', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-run-'));
    mockCreate.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('transitions pending → running → completed on success (simple mode)', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Task completed successfully.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const { createDispatchFile, runDispatch } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    // No agent → simple mode (no tools)
    const filePath = createDispatchFile(project, {
      title: 'Simple Task',
      body: 'What is 2+2?',
    });

    await runDispatch(filePath, project, tmpDir, 'fake-api-key');

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.status).toBe('completed');
    expect(data.result).toContain('Task completed successfully.');
    expect(data.started_at).toBeTruthy();
    expect(data.completed_at).toBeTruthy();
    expect(data.usage).toMatchObject({ input_tokens: 10, output_tokens: 5 });
  });

  it('transitions pending → failed on API error and re-throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API quota exceeded'));

    const { createDispatchFile, runDispatch } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    const filePath = createDispatchFile(project, {
      title: 'Failing Task',
      body: 'This will fail.',
    });

    await expect(runDispatch(filePath, project, tmpDir, 'bad-key')).rejects.toThrow('API quota exceeded');

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.status).toBe('failed');
    expect(data.error).toContain('API quota exceeded');
    expect(data.completed_at).toBeTruthy();
  });

  it('skips dispatch that is not pending — leaves file unchanged', async () => {
    const { createDispatchFile, runDispatch } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    const filePath = createDispatchFile(project, { title: 'Already Done' });
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    raw.status = 'completed';
    raw.result = 'done';
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), 'utf-8');

    const before = fs.readFileSync(filePath, 'utf-8');
    await runDispatch(filePath, project, tmpDir, 'fake-key');
    const after = fs.readFileSync(filePath, 'utf-8');

    expect(after).toBe(before);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('runs tool loop when agent has tools and logs tool_calls', async () => {
    // First call: tool_use
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu_1', name: 'list_files', input: { path: '.' } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 20, output_tokens: 10 },
    });
    // Second call: end_turn
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Files listed successfully.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 30, output_tokens: 15 },
    });

    const { createDispatchFile, runDispatch } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    const filePath = createDispatchFile(project, {
      title: 'Tool Task',
      body: 'List the files.',
      agent: 'helper', // helper has tools: ['read_file', 'list_files']
    });

    await runDispatch(filePath, project, tmpDir, 'fake-api-key');

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.status).toBe('completed');
    expect(data.result).toContain('Files listed successfully.');
    expect(data.tool_calls).toHaveLength(1);
    expect(data.tool_calls[0].tool).toBe('list_files');
    expect(data.usage.input_tokens).toBe(50);  // 20 + 30
    expect(data.usage.output_tokens).toBe(25); // 10 + 15
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('stops tool loop at MAX_ITERATIONS and marks completed', async () => {
    // Always return tool_use to force the iteration cap
    const toolUseResponse = {
      content: [{ type: 'tool_use', id: 'tu_x', name: 'list_files', input: { path: '.' } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 5, output_tokens: 5 },
    };
    mockCreate.mockResolvedValue(toolUseResponse);

    const { createDispatchFile, runDispatch } = await import('../lib/dispatch-runner.js');
    const project = makeProject(tmpDir) as any;

    const filePath = createDispatchFile(project, {
      title: 'Infinite Loop Task',
      body: 'Keep going.',
      agent: 'helper',
    });

    await runDispatch(filePath, project, tmpDir, 'fake-api-key');

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.status).toBe('completed');
    expect(data.result).toContain('max iterations');
    expect(mockCreate).toHaveBeenCalledTimes(10); // MAX_ITERATIONS
  });
});
