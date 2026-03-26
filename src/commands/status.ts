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

  touchProject(project.project_id);

  const memoryExists    = fs.existsSync(paths.memoryDir);
  const eventsExists    = fs.existsSync(paths.eventsFile);
  const dispatchExists  = fs.existsSync(paths.dispatchesDir);
  const dotClaudeExists = fs.existsSync(paths.dotClaudeDir);

  const tick = (ok: boolean) => (ok ? '✓' : '✗');

  let eventCount = 0;
  if (eventsExists) {
    try { eventCount = readEvents(project, 10_000).length; } catch { /* silent */ }
  }

  let dispatchCount = 0;
  if (dispatchExists) {
    try {
      dispatchCount = fs.readdirSync(paths.dispatchesDir).filter((f) => f.endsWith('.json')).length;
    } catch { /* silent */ }
  }

  const regEntry = lookupProject(project.project_id);

  console.log(
    `\n  Project:      ${project.name}  (${shortId(project)})  v${project.version ?? '5.0'}\n` +
    `  Description:  ${project.description || '(none)'}\n` +
    `  Stage:        ${project.stage || '(none)'}\n` +
    `  Created:      ${project.created ?? ''} by ${project.created_by ?? ''}\n` +
    `  File:         ${filePath}\n`,
  );

  console.log(
    `  Paths:\n` +
    `    ${tick(memoryExists)}  Memory:     ${paths.memoryDir}\n` +
    `    ${tick(eventsExists)}  Events:     ${paths.eventsFile}${eventsExists ? `  (${eventCount} events)` : ''}\n` +
    `    ${tick(dispatchExists)}  Dispatches: ${paths.dispatchesDir}${dispatchExists ? `  (${dispatchCount} pending)` : ''}\n` +
    `    ${tick(dotClaudeExists)}  Config:     ${paths.dotClaudeDir}\n`,
  );

  if (regEntry) {
    console.log(`  Registry:     ✓ registered  (last seen: ${regEntry.last_seen.slice(0, 19)})\n`);
  } else {
    console.log(`  Registry:     ✗ not in registry  (run: claude-project init to register)\n`);
  }

  const agents = project.agents ?? {};
  if (Object.keys(agents).length > 0) {
    console.log(`  Agents (${Object.keys(agents).length}):`);
    for (const [name, def] of Object.entries(agents)) {
      console.log(`    • ${name}: ${def.role}  [${def.model ?? 'default'}]`);
    }
    console.log('');
  }

  const services = project.services ?? {};
  if (Object.keys(services).length > 0) {
    console.log(`  Services (${Object.keys(services).length}):`);
    for (const [name, def] of Object.entries(services)) {
      console.log(`    • ${name}: ${def.type}  ${def.url ?? def.command ?? ''}  ${def.description ?? ''}`);
    }
    console.log('');
  }

  const automations = project.automations ?? [];
  if (automations.length > 0) {
    console.log(`  Automations (${automations.length}):`);
    for (const auto of automations) {
      const enabled = auto.enabled !== false ? '✓' : '✗';
      console.log(`    ${enabled} ${auto.id}: ${auto.description ?? ''}`);
    }
    console.log('');
  }
}
