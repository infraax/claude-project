// src/commands/sync.ts
// Displays project sync status. Obsidian export is optional (set CLAUDE_OBSIDIAN_VAULT).
import * as fs from 'fs';
import * as path from 'path';
import { findProject } from '../lib/project.js';
import { resolvePaths } from '../lib/paths.js';

export function sync(): void {
  const found = findProject();
  if (!found) {
    console.error('\n  No .claude-project found. Run: claude-project init <name>\n');
    process.exit(1);
  }
  const { project } = found;
  const paths = resolvePaths(project);

  console.log('\n  claude-project — sync status\n');
  console.log(`  Project:    ${project.name} (${project.project_id})`);
  console.log(`  Memory:     ${paths.memoryDir}`);
  console.log(`  Dispatches: ${paths.dispatchesDir}`);
  console.log(`  Events:     ${paths.eventsFile}`);
  console.log(`  DB:         ${paths.dbPath}`);

  const memFiles = fs.existsSync(paths.memoryDir)
    ? fs.readdirSync(paths.memoryDir).length
    : 0;
  console.log(`\n  Memory files: ${memFiles}`);

  // Optional Obsidian export (env-gated, disabled by default)
  const vaultPath = process.env['CLAUDE_OBSIDIAN_VAULT'];
  if (vaultPath) {
    const obsFolder = process.env['CLAUDE_OBSIDIAN_FOLDER'] ?? `Projects/${project.name}`;
    const obsDir = path.join(vaultPath, obsFolder);
    if (!fs.existsSync(vaultPath)) {
      console.log(`\n  Obsidian vault not found: ${vaultPath}`);
      console.log('  Set CLAUDE_OBSIDIAN_VAULT to a valid path to enable sync.\n');
      return;
    }
    fs.mkdirSync(obsDir, { recursive: true });
    let count = 0;
    for (const f of fs.readdirSync(paths.memoryDir)) {
      if (f.endsWith('.md') || f.endsWith('.json')) {
        fs.copyFileSync(path.join(paths.memoryDir, f), path.join(obsDir, f));
        count++;
      }
    }
    console.log(`\n  Synced ${count} files → ${obsDir}\n`);
  } else {
    console.log('\n  Obsidian sync: disabled (set CLAUDE_OBSIDIAN_VAULT to enable)\n');
  }
}
