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
  const { memoryDir, obsidianProjectDir, obsidianVault } = resolvePaths(project);

  if (!fs.existsSync(obsidianVault)) {
    console.error(
      `\n  Obsidian vault not found: ${obsidianVault}\n` +
      '  Mount ClaudeLab SSD or set a different vault path in .claude-project\n',
    );
    process.exit(1);
  }

  if (!fs.existsSync(memoryDir)) {
    console.error(`\n  Memory directory not found: ${memoryDir}\n`);
    process.exit(1);
  }

  fs.mkdirSync(obsidianProjectDir, { recursive: true });

  const files = fs.readdirSync(memoryDir).filter((f) => f.endsWith('.md'));
  let count = 0;

  for (const filename of files) {
    const src  = path.join(memoryDir, filename);
    const dest = path.join(obsidianProjectDir, filename);
    const content = fs.readFileSync(src, 'utf-8');
    fs.writeFileSync(dest, content, 'utf-8');
    count++;
  }

  console.log(
    `\n  Synced ${count} file(s)\n` +
    `    From: ${memoryDir}\n` +
    `    To:   ${obsidianProjectDir}\n`,
  );
}
