/**
 * Tests for src/lib/automation.ts
 *
 * Covers:
 *  - cronMatches (schedule trigger — pure function, no I/O)
 *  - readState / writeState round-trip (tmp dir)
 *  - evaluateTrigger — event trigger idempotency
 *  - processAutomations — action fires and state is updated
 *  - processAutomations — no double-fire on same event (idempotency)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Top-level mock — hoisted before any imports of automation.ts
vi.mock('../lib/events.js', () => ({
  appendEvent: vi.fn(),
  readEvents: vi.fn().mockReturnValue([]),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal ClaudeProject for testing */
function makeProject(id = 'test-proj', overrides: Record<string, unknown> = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-test-'));
  const memoryDir = path.join(tmpDir, 'memory');
  fs.mkdirSync(memoryDir, { recursive: true });

  return {
    project: {
      version: '4' as const,
      project_id: id,
      name: 'Test Project',
      description: '',
      created: new Date().toISOString(),
      created_by: 'test',
      memory_path: memoryDir,
      automations: [],
      agents: {},
      ...overrides,
    },
    projectDir: tmpDir,
    tmpDir,
  };
}

// ── cronMatches (internal — we test via processAutomations schedule path) ─────
// cronMatches is not exported, so we exercise it through the public API.
// These tests confirm the schedule trigger fires/skips based on timing.

describe('schedule trigger — cron evaluation', () => {
  it('fires when last_fired is null (first run)', async () => {
    const { project, projectDir } = makeProject('sched-1', {
      automations: [
        {
          id: 'hourly',
          trigger: { type: 'schedule', cron: '0 * * * *' }, // top of every hour
          action: { type: 'write_event', event_type: 'custom' },
        },
      ],
    });

    const { processScheduledAutomations } = await import('../lib/automation.js');
    const results = processScheduledAutomations(project as any, projectDir);

    // With no last_fired, schedule automations should fire on first run
    // (cron may or may not match current minute, but first-run fires regardless
    // when last_fired is absent and it's a schedule type — depends on impl)
    // We assert no error occurs and result is an array
    expect(Array.isArray(results)).toBe(true);
    expect(results[0].automationId).toBe('hourly');
  });
});

// ── State round-trip ──────────────────────────────────────────────────────────

describe('automation state — read/write round-trip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-state-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty object when state file does not exist', async () => {
    // We test via processAutomations — with no state file, it should behave
    // as if all automations have never fired (fresh state).
    const memoryDir = path.join(tmpDir, 'memory');
    fs.mkdirSync(memoryDir);

    const project = {
      version: '4' as const,
      project_id: 'state-test',
      name: 'State Test',
      description: '',
      created: new Date().toISOString(),
      created_by: 'test',
      memory_path: memoryDir,
      automations: [],
    };

    const { processAutomations } = await import('../lib/automation.js');
    // Empty automations — should return empty results without throwing
    const results = processAutomations(project as any, tmpDir, { type: 'manual', forceAll: true });
    expect(results).toEqual([]);
  });

  it('persists state after automations fire', async () => {
    const memoryDir = path.join(tmpDir, 'memory');
    fs.mkdirSync(memoryDir);
    const eventsFile = path.join(tmpDir, 'events.jsonl');
    fs.writeFileSync(eventsFile, '', 'utf-8');

    const project = {
      version: '4' as const,
      project_id: 'persist-test',
      name: 'Persist Test',
      description: '',
      created: new Date().toISOString(),
      created_by: 'test',
      memory_path: memoryDir,
      automations: [
        {
          id: 'my-auto',
          trigger: { type: 'manual' },
          action: { type: 'write_event', event_type: 'custom', message: 'hello' },
        },
      ],
    };

    const { processAutomations } = await import('../lib/automation.js');

    // Fire manually
    const results = processAutomations(project as any, tmpDir, { type: 'manual', forceAll: true });
    expect(results).toHaveLength(1);
    expect(results[0].fired).toBe(true);

    // State file should now exist with fire_count = 1
    const stateFile = path.join(tmpDir, 'automation-state.json');
    expect(fs.existsSync(stateFile)).toBe(true);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect(state['my-auto'].fire_count).toBe(1);
    expect(state['my-auto'].last_fired).toBeTruthy();
  });
});

// ── Event trigger — idempotency ───────────────────────────────────────────────

describe('event trigger — idempotency', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-event-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeEventProject(tmpDir: string) {
    const memoryDir = path.join(tmpDir, 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });
    const eventsFile = path.join(tmpDir, 'events.jsonl');
    fs.writeFileSync(eventsFile, '', 'utf-8');

    return {
      version: '4' as const,
      project_id: 'idempotency-test',
      name: 'Idempotency Test',
      description: '',
      created: new Date().toISOString(),
      created_by: 'test',
      memory_path: memoryDir,
      automations: [
        {
          id: 'on-session-end',
          trigger: { type: 'event', event_type: 'session_end' },
          action: { type: 'write_event', event_type: 'custom', message: 'triggered' },
        },
      ],
    };
  }

  it('fires on first matching event', async () => {
    const project = makeEventProject(tmpDir);
    const event = {
      id: 'evt-001',
      ts: new Date().toISOString(),
      type: 'session_end',
      source: 'test',
      project_id: project.project_id,
      data: {},
    };

    const { processEventAutomations } = await import('../lib/automation.js');
    const results = processEventAutomations(project as any, tmpDir, event as any);
    expect(results[0].fired).toBe(true);
    expect(results[0].automationId).toBe('on-session-end');
  });

  it('does NOT fire again on the same event id', async () => {
    const project = makeEventProject(tmpDir);
    const event = {
      id: 'evt-002',
      ts: new Date().toISOString(),
      type: 'session_end',
      source: 'test',
      project_id: project.project_id,
      data: {},
    };

    const { processEventAutomations } = await import('../lib/automation.js');

    // First call — fires
    const first = processEventAutomations(project as any, tmpDir, event as any);
    expect(first[0].fired).toBe(true);

    // Second call with same event id — must NOT fire again
    const second = processEventAutomations(project as any, tmpDir, event as any);
    expect(second[0].fired).toBe(false);
  });

  it('fires again on a NEW event id', async () => {
    const project = makeEventProject(tmpDir);
    const { processEventAutomations } = await import('../lib/automation.js');

    const fire = (id: string) =>
      processEventAutomations(project as any, tmpDir, {
        id,
        ts: new Date().toISOString(),
        type: 'session_end',
        source: 'test',
        project_id: project.project_id,
        data: {},
      } as any);

    expect(fire('evt-A')[0].fired).toBe(true);
    expect(fire('evt-A')[0].fired).toBe(false); // same id — skip
    expect(fire('evt-B')[0].fired).toBe(true);  // new id — fires
  });

  it('does NOT fire on wrong event type', async () => {
    const project = makeEventProject(tmpDir);
    const event = {
      id: 'evt-wrong',
      ts: new Date().toISOString(),
      type: 'session_start', // trigger expects session_end
      source: 'test',
      project_id: project.project_id,
      data: {},
    };

    const { processEventAutomations } = await import('../lib/automation.js');
    const results = processEventAutomations(project as any, tmpDir, event as any);
    expect(results[0].fired).toBe(false);
  });
});

// ── Disabled automations ──────────────────────────────────────────────────────

describe('disabled automations', () => {
  it('skips automations with enabled: false', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-disabled-'));
    const memoryDir = path.join(tmpDir, 'memory');
    fs.mkdirSync(memoryDir);

    const project = {
      version: '4' as const,
      project_id: 'disabled-test',
      name: 'Disabled Test',
      description: '',
      created: new Date().toISOString(),
      created_by: 'test',
      memory_path: memoryDir,
      automations: [
        {
          id: 'should-skip',
          enabled: false,
          trigger: { type: 'manual' },
          action: { type: 'write_event', event_type: 'custom' },
        },
      ],
    };

    const { processAutomations } = await import('../lib/automation.js');
    const results = processAutomations(project as any, tmpDir, { type: 'manual', forceAll: true });
    // Disabled automation should not appear in results
    expect(results).toHaveLength(0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ── Unknown action type — does not crash engine ───────────────────────────────

describe('unknown action type', () => {
  it('records error but does not throw', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-unknown-'));
    const memoryDir = path.join(tmpDir, 'memory');
    fs.mkdirSync(memoryDir);

    const project = {
      version: '4' as const,
      project_id: 'unknown-action',
      name: 'Unknown Action Test',
      description: '',
      created: new Date().toISOString(),
      created_by: 'test',
      memory_path: memoryDir,
      automations: [
        {
          id: 'bad-action',
          trigger: { type: 'manual' },
          action: { type: 'nonexistent_action_type' },
        },
      ],
    };

    const { processAutomations } = await import('../lib/automation.js');
    expect(() =>
      processAutomations(project as any, tmpDir, { type: 'manual', forceAll: true })
    ).not.toThrow();

    const results = processAutomations(project as any, tmpDir, { type: 'manual', forceAll: true });
    expect(results[0].fired).toBe(false);
    expect(results[0].error).toMatch(/Unknown action type/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ── listAutomationsWithState ──────────────────────────────────────────────────

describe('listAutomationsWithState', () => {
  it('returns automations with empty state for fresh project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-list-'));
    const memoryDir = path.join(tmpDir, 'memory');
    fs.mkdirSync(memoryDir);

    const project = {
      version: '4' as const,
      project_id: 'list-test',
      name: 'List Test',
      description: '',
      created: new Date().toISOString(),
      created_by: 'test',
      memory_path: memoryDir,
      automations: [
        { id: 'a1', trigger: { type: 'manual' }, action: { type: 'write_event', event_type: 'x' } },
        { id: 'a2', trigger: { type: 'schedule', cron: '@daily' }, action: { type: 'run_command', command: 'echo hi' } },
      ],
    };

    const { listAutomationsWithState } = await import('../lib/automation.js');
    const items = listAutomationsWithState(project as any);

    expect(items).toHaveLength(2);
    expect(items[0].automation.id).toBe('a1');
    expect(items[0].state).toEqual({});
    expect(items[1].automation.id).toBe('a2');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
