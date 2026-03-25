/**
 * dispatch.ts
 * CLI commands for managing and running agent dispatches.
 *
 * Usage:
 *   claude-project dispatch list [--status <s>] [--agent <a>]
 *   claude-project dispatch show <id>
 *   claude-project dispatch create <title> [--body <text>] [--agent <name>] [--priority <p>]
 *   claude-project dispatch run [id] [--all] [--agent <name>] [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';
import { findProject } from '../lib/project.js';
import {
  runDispatch,
  findDispatchFiles,
  createDispatchFile,
  DispatchFile,
} from '../lib/dispatch-runner.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireProject() {
  const found = findProject();
  if (!found) {
    console.error('\n  Error: no .claude-project found in this directory or any parent.\n');
    process.exit(1);
  }
  return found;
}

function requireApiKey(): string {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) {
    console.error(
      '\n  Error: ANTHROPIC_API_KEY environment variable is required.\n' +
      '  Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n',
    );
    process.exit(1);
  }
  return key;
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    pending:   '[ pending  ]',
    running:   '[ running  ]',
    completed: '[completed ]',
    failed:    '[  failed  ]',
  };
  return map[status] ?? `[${status.padEnd(10).slice(0, 10)}]`;
}

// ── dispatch list ─────────────────────────────────────────────────────────────

export function dispatchList(opts: { status?: string; agent?: string } = {}): void {
  const { project } = requireProject();
  const items = findDispatchFiles(project, opts);

  if (items.length === 0) {
    const filter = opts.status ? ` (status=${opts.status})` : '';
    console.log(`\n  No dispatches found${filter}.\n`);
    return;
  }

  console.log(`\n  Dispatches (${items.length})\n  ${'─'.repeat(70)}`);
  for (const { dispatch: d } of items) {
    const ts = d.created ? d.created.slice(0, 16).replace('T', ' ') : '?';
    const agent = d.agent ? `  agent=${d.agent}` : '';
    console.log(`  ${statusBadge(d.status)}  ${d.id}  ${ts}  ${d.title.slice(0, 40)}${agent}`);
  }
  console.log('');
}

// ── dispatch show ─────────────────────────────────────────────────────────────

export function dispatchShow(id: string): void {
  const { project } = requireProject();
  const items = findDispatchFiles(project);
  const match = items.find(({ dispatch: d }) => d.id === id || d.id.startsWith(id));

  if (!match) {
    console.error(`\n  Error: dispatch not found: ${id}\n`);
    process.exit(1);
  }

  const d = match.dispatch;
  console.log(`\n  Dispatch: ${d.id}`);
  console.log(`  Status:   ${d.status}`);
  console.log(`  Title:    ${d.title}`);
  if (d.agent)        console.log(`  Agent:    ${d.agent}`);
  if (d.priority)     console.log(`  Priority: ${d.priority}`);
  if (d.created)      console.log(`  Created:  ${d.created}`);
  if (d.started_at)   console.log(`  Started:  ${d.started_at}`);
  if (d.completed_at) console.log(`  Finished: ${d.completed_at}`);
  if (d.usage)        console.log(`  Tokens:   in=${d.usage.input_tokens} out=${d.usage.output_tokens}`);
  console.log(`\n  Body:\n  ${d.body.split('\n').join('\n  ')}`);
  if (d.result) {
    console.log(`\n  Result:\n  ${d.result.split('\n').join('\n  ')}`);
  }
  if (d.error) {
    console.log(`\n  Error:\n  ${d.error}`);
  }
  if (d.tool_calls && d.tool_calls.length > 0) {
    console.log(`\n  Tool calls (${d.tool_calls.length}):`);
    for (const tc of d.tool_calls) {
      console.log(`    ${tc.tool}: ${tc.output_summary.slice(0, 80)}`);
    }
  }
  console.log('');
}

// ── dispatch create ───────────────────────────────────────────────────────────

export function dispatchCreate(
  title: string,
  opts: { body?: string; agent?: string; priority?: string } = {},
): void {
  const { project } = requireProject();

  const priority = (['low', 'normal', 'high'].includes(opts.priority ?? ''))
    ? (opts.priority as 'low' | 'normal' | 'high')
    : 'normal';

  const filePath = createDispatchFile(project, {
    title,
    body: opts.body ?? '',
    agent: opts.agent,
    priority,
    source: 'cli',
  });

  const id = path.basename(filePath, '.json');
  console.log(`\n  Created dispatch: ${id}\n  File: ${filePath}\n`);
  console.log(`  Run it with: claude-project dispatch run ${id}\n`);
}

// ── dispatch run ──────────────────────────────────────────────────────────────

export async function dispatchRun(
  id: string | undefined,
  opts: { all?: boolean; agent?: string; dryRun?: boolean } = {},
): Promise<void> {
  const { project, projectDir } = requireProject();
  const apiKey = opts.dryRun ? 'dry-run' : requireApiKey();

  const items = findDispatchFiles(project, { status: 'pending', agent: opts.agent });

  if (id) {
    // Run a specific dispatch by ID
    const match = items.find(({ dispatch: d }) => d.id === id || d.id.startsWith(id));
    if (!match) {
      // Try any status so we can give a helpful error
      const anyMatch = findDispatchFiles(project).find(
        ({ dispatch: d }) => d.id === id || d.id.startsWith(id),
      );
      if (anyMatch) {
        console.error(`\n  Error: dispatch ${id} is not pending (status=${anyMatch.dispatch.status})\n`);
      } else {
        console.error(`\n  Error: dispatch not found: ${id}\n`);
      }
      process.exit(1);
    }

    if (opts.dryRun) {
      console.log(`\n  [dry-run] Would run: ${match.dispatch.id}  "${match.dispatch.title}"\n`);
      return;
    }

    console.log(`\n  Running dispatch: ${match.dispatch.id}  "${match.dispatch.title}"`);
    try {
      await runDispatch(match.filePath, project, projectDir, apiKey);
      console.log(`  Completed: ${match.dispatch.id}\n`);
    } catch (err) {
      console.error(`  Failed: ${match.dispatch.id}: ${err}\n`);
      process.exit(1);
    }
    return;
  }

  if (!opts.all) {
    if (items.length === 0) {
      console.log('\n  No pending dispatches found.\n');
    } else {
      console.log(`\n  ${items.length} pending dispatch(es). Use --all to run all, or provide an ID.\n`);
      dispatchList({ status: 'pending', agent: opts.agent });
    }
    return;
  }

  // --all: run all pending dispatches serially
  if (items.length === 0) {
    console.log('\n  No pending dispatches.\n');
    return;
  }

  if (opts.dryRun) {
    console.log(`\n  [dry-run] Would run ${items.length} dispatch(es):`);
    for (const { dispatch: d } of items) {
      console.log(`    ${d.id}  "${d.title}"`);
    }
    console.log('');
    return;
  }

  console.log(`\n  Running ${items.length} dispatch(es)...\n`);
  let succeeded = 0;
  let failed = 0;

  for (const { filePath, dispatch: d } of items) {
    console.log(`  → ${d.id}  "${d.title.slice(0, 50)}"`);
    try {
      await runDispatch(filePath, project, projectDir, apiKey);
      console.log(`    ✓ completed`);
      succeeded++;
    } catch (err) {
      console.error(`    ✗ failed: ${String(err).slice(0, 100)}`);
      failed++;
    }
  }

  console.log(`\n  Done. ${succeeded} succeeded, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}
