import * as fs from 'fs';
import { findProject, shortId } from '../lib/project.js';
import { resolvePaths } from '../lib/paths.js';
import { lookupProject, touchProject } from '../lib/registry.js';
import { readEvents } from '../lib/events.js';

export function status(): void {
  const found = findProject();

  if (!found) {
    console.log(
      '\n  No .claude-project found in current directory or any parent.\n\n' +
      '  Run: claude-project init <name>\n',
    );
    return;
  }

  const { project, filePath, projectDir } = found;
  const paths = resolvePaths(project, projectDir);

  // Touch registry entry
  touchProject(project.project_id);

  const memoryExists    = fs.existsSync(paths.memoryDir);
  const obsidianExists  = fs.existsSync(paths.obsidianVault);
  const wakeupExists    = fs.existsSync(paths.wakeupFile);
  const journalExists   = fs.existsSync(paths.journalFile);
  const eventsExists    = fs.existsSync(paths.eventsFile);
  const sessionsExists  = fs.existsSync(paths.sessionsDir);
  const dispatchExists  = fs.existsSync(paths.dispatchesDir);
  const dotClaudeExists = fs.existsSync(paths.dotClaudeDir);

  const tick = (ok: boolean) => (ok ? '✓' : '✗');

  // Event count
  let eventCount = 0;
  if (eventsExists) {
    try {
      const events = readEvents(project, 10_000);
      eventCount = events.length;
    } catch { /* silent */ }
  }

  // Dispatch count
  let dispatchCount = 0;
  if (dispatchExists) {
    try {
      dispatchCount = fs.readdirSync(paths.dispatchesDir).filter((f) => f.endsWith('.json')).length;
    } catch { /* silent */ }
  }

  // Registry info
  const regEntry = lookupProject(project.project_id);

  console.log(
    `\n  Project:      ${project.name}  (${shortId(project)})  v${project.version}\n` +
    `  Description:  ${project.description || '(none)'}\n` +
    `  Stage:        ${project.stage || '(none)'}\n` +
    `  Created:      ${project.created} by ${project.created_by}\n` +
    `  File:         ${filePath}\n`,
  );

  console.log(
    `  Paths:\n` +
    `    ${tick(memoryExists)}  Memory:     ${paths.memoryDir}\n` +
    `    ${tick(eventsExists)}  Events:     ${paths.eventsFile}${eventsExists ? `  (${eventCount} events)` : ''}\n` +
    `    ${tick(dispatchExists)}  Dispatches: ${paths.dispatchesDir}${dispatchExists ? `  (${dispatchCount} pending)` : ''}\n` +
    `    ${tick(dotClaudeExists)}  Config:     ${paths.dotClaudeDir}\n` +
    `    ${tick(obsidianExists)}  Obsidian:   ${paths.obsidianVault}\n`,
  );

  console.log(
    `  Memory files:\n` +
    `    ${tick(wakeupExists)}  WAKEUP.md\n` +
    `    ${tick(journalExists)}  SESSION_JOURNAL.md\n`,
  );

  // Registry status
  if (regEntry) {
    console.log(`  Registry:     ✓ registered  (last seen: ${regEntry.last_seen.slice(0, 19)})\n`);
  } else {
    console.log(`  Registry:     ✗ not in registry  (run: claude-project init to register)\n`);
  }

  // v4: agents
  const agents = project.agents ?? {};
  if (Object.keys(agents).length > 0) {
    console.log(`  Agents (${Object.keys(agents).length}):`);
    for (const [name, def] of Object.entries(agents)) {
      console.log(`    • ${name}: ${def.role}  [${def.model ?? 'default'}]`);
    }
    console.log('');
  }

  // v4: services
  const services = project.services ?? {};
  if (Object.keys(services).length > 0) {
    console.log(`  Services (${Object.keys(services).length}):`);
    for (const [name, def] of Object.entries(services)) {
      console.log(`    • ${name}: ${def.type}  ${def.url ?? def.command ?? ''}  ${def.description ?? ''}`);
    }
    console.log('');
  }

  // v4: automations
  const automations = project.automations ?? [];
  if (automations.length > 0) {
    console.log(`  Automations (${automations.length}):`);
    for (const auto of automations) {
      const enabled = auto.enabled !== false ? '✓' : '✗';
      console.log(`    ${enabled} ${auto.id}: ${auto.description ?? ''}`);
    }
    console.log('');
  }

  // devices
  if (project.devices && Object.keys(project.devices).length > 0) {
    console.log('  Devices:');
    for (const [k, v] of Object.entries(project.devices)) {
      console.log(`    ${k}: ${v}`);
    }
    console.log('');
  }

  // shared_paths
  if (project.shared_paths && Object.keys(project.shared_paths).length > 0) {
    console.log('  Shared paths:');
    for (const [k, v] of Object.entries(project.shared_paths)) {
      console.log(`    ${k}: ${v}`);
    }
    console.log('');
  }
}
