import * as fs from 'fs';
import * as path from 'path';
import { ClaudeProject, shortId } from '../lib/project.js';
import { getSearchRoots } from '../lib/paths.js';

interface Found {
  filePath: string;
  project: ClaudeProject;
}

function findAllProjects(roots: string[]): Found[] {
  const results: Found[] = [];
  const seen = new Set<string>();

  function walk(dir: string, depth: number): void {
    if (depth > 5) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.claude-project') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.name === '.claude-project') {
        if (seen.has(fullPath)) continue;
        seen.add(fullPath);
        try {
          const project = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as ClaudeProject;
          results.push({ filePath: fullPath, project });
        } catch {
          // skip malformed files
        }
      }
    }
  }

  for (const root of roots) {
    walk(root, 0);
  }

  return results;
}

export function list(): void {
  const roots = getSearchRoots();
  const found = findAllProjects(roots);

  if (found.length === 0) {
    console.log(
      '\n  No .claude-project files found.\n\n' +
      '  Run: claude-project init <name>\n',
    );
    return;
  }

  console.log(`\n  Found ${found.length} project(s):\n`);
  for (const { filePath, project } of found) {
    const stage = project.stage ? `  [${project.stage}]` : '';
    console.log(`  ⬡  ${project.name}  (${shortId(project)})${stage}`);
    console.log(`       ${project.description || '(no description)'}`);
    console.log(`       ${filePath}\n`);
  }
}
