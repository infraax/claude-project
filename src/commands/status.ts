import * as fs from 'fs';
import { findProject, shortId } from '../lib/project.js';
import { resolvePaths } from '../lib/paths.js';

export function status(): void {
  const found = findProject();

  if (!found) {
    console.log(
      '\n  No .claude-project found in current directory or any parent.\n\n' +
      '  Run: claude-project init <name>\n',
    );
    return;
  }

  const { project, filePath } = found;
  const paths = resolvePaths(project);

  const memoryExists   = fs.existsSync(paths.memoryDir);
  const obsidianExists = fs.existsSync(paths.obsidianVault);
  const wakeupExists   = fs.existsSync(paths.wakeupFile);
  const journalExists  = fs.existsSync(paths.journalFile);

  const tick  = (ok: boolean) => (ok ? '✓' : '✗');

  console.log(
    `\n  Project:      ${project.name}  (${shortId(project)})\n` +
    `  Description:  ${project.description || '(none)'}\n` +
    `  Stage:        ${project.stage || '(none)'}\n` +
    `  Created:      ${project.created} by ${project.created_by}\n` +
    `  File:         ${filePath}\n` +
    `\n` +
    `  Paths:\n` +
    `    ${tick(memoryExists)}  Diary:    ${paths.memoryDir}\n` +
    `    ${tick(obsidianExists)}  Obsidian: ${paths.obsidianVault}\n` +
    `\n` +
    `  Memory files:\n` +
    `    ${tick(wakeupExists)}  WAKEUP.md\n` +
    `    ${tick(journalExists)}  SESSION_JOURNAL.md\n`,
  );

  if (project.devices && Object.keys(project.devices).length > 0) {
    console.log('  Devices:');
    for (const [k, v] of Object.entries(project.devices)) {
      console.log(`    ${k}: ${v}`);
    }
    console.log('');
  }

  if (project.shared_paths && Object.keys(project.shared_paths).length > 0) {
    console.log('  Shared paths:');
    for (const [k, v] of Object.entries(project.shared_paths)) {
      console.log(`    ${k}: ${v}`);
    }
    console.log('');
  }
}
