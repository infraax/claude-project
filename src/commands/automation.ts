/**
 * automation.ts
 * CLI commands for inspecting and manually triggering automations.
 *
 * Usage:
 *   claude-project automation list
 *   claude-project automation run <id>
 */

import { findProject } from '../lib/project.js';
import {
  processAutomations,
  listAutomationsWithState,
} from '../lib/automation.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireProject() {
  const found = findProject();
  if (!found) {
    console.error('\n  Error: no .claude-project found in this directory or any parent.\n');
    process.exit(1);
  }
  return found;
}

// ── automation list ───────────────────────────────────────────────────────────

export function automationList(): void {
  const { project } = requireProject();
  const items = listAutomationsWithState(project);

  if (items.length === 0) {
    console.log('\n  No automations defined in this project.\n');
    return;
  }

  console.log(`\n  Automations (${items.length})\n  ${'─'.repeat(70)}`);
  for (const { automation: a, state: s } of items) {
    const enabled = a.enabled === false ? '[disabled]' : '[enabled ]';
    const trigger = `${a.trigger.type}${a.trigger.cron ? `:${a.trigger.cron}` : a.trigger.event_type ? `:${a.trigger.event_type}` : ''}`;
    const lastFired = s?.last_fired
      ? s.last_fired.slice(0, 16).replace('T', ' ')
      : 'never';
    const count = s?.fire_count ? `  (fired ${s.fire_count}x)` : '';
    const desc = a.description ? `  — ${a.description}` : '';
    console.log(
      `  ${enabled}  ${a.id.padEnd(30).slice(0, 30)}  ` +
      `trigger=${trigger.slice(0, 25).padEnd(25)}  ` +
      `action=${a.action.type.slice(0, 16).padEnd(16)}  ` +
      `last=${lastFired}${count}${desc}`,
    );
  }
  console.log('');
}

// ── automation run ────────────────────────────────────────────────────────────

export function automationRun(id: string): void {
  const { project, projectDir } = requireProject();
  const automations = project.automations ?? [];
  const target = automations.find((a) => a.id === id);

  if (!target) {
    console.error(`\n  Error: automation not found: ${id}\n`);
    const available = automations.map((a) => `  • ${a.id}`).join('\n');
    if (available) console.error(`  Available automations:\n${available}\n`);
    process.exit(1);
  }

  console.log(`\n  Running automation: ${id}`);

  const results = processAutomations(project, projectDir, {
    type: 'manual',
    forceAll: false,
  });

  const result = results.find((r) => r.automationId === id);

  if (!result) {
    console.error(`  Automation ${id} did not fire (may be disabled or condition not met)\n`);
    return;
  }

  if (result.error) {
    console.error(`  ✗ Error: ${result.error}\n`);
    process.exit(1);
  }

  console.log(`  ✓ ${result.action}: ${result.output?.slice(0, 100) ?? '(ok)'}\n`);
}
