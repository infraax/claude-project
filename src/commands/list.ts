import * as fs from 'fs';
import * as path from 'path';
import { ClaudeProject, shortId } from '../lib/project.js';
import { getSearchRoots } from '../lib/paths.js';
import { listRegistry, registerProject, getRegistryPath } from '../lib/registry.js';

export interface ListOptions {
  scan?: boolean;
}

// ── Registry-based list (fast) ────────────────────────────────────────────────

function listFromRegistry(): void {
  const entries = listRegistry();

  if (entries.length === 0) {
    console.log(
      '\n  Registry is empty.\n\n' +
      `  Registry: ${getRegistryPath()}\n\n` +
      '  Run: claude-project init <name>   to create a project\n' +
      '  Run: claude-project list --scan   to discover existing projects\n' +
      '  Run: claude-project daemon install to keep the registry hot automatically\n',
    );
    return;
  }

  console.log(`\n  ${entries.length} project(s) in registry:\n`);
  for (const e of entries) {
    const stage = e.stage ? `  [${e.stage}]` : '';
    const version = `v${e.version ?? '3'}`;
    console.log(`  ⬡  ${e.name}  (${e.project_id.slice(0, 8)})  ${version}${stage}`);
    console.log(`       ${e.description || '(no description)'}`);
    console.log(`       ${e.project_dir}`);
    console.log(`       last seen: ${e.last_seen.slice(0, 19)}\n`);
  }

  console.log(`  Registry: ${getRegistryPath()}\n`);
}

// ── Filesystem scan (slow, updates registry) ──────────────────────────────────

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

function listFromScan(): void {
  const roots = getSearchRoots();
  console.log('\n  Scanning filesystem (this may take a moment)...\n');
  const found = findAllProjects(roots);

  if (found.length === 0) {
    console.log(
      '  No .claude-project files found.\n\n' +
      '  Run: claude-project init <name>\n',
    );
    return;
  }

  console.log(`  Found ${found.length} project(s):\n`);
  for (const { filePath, project } of found) {
    const stage = project.stage ? `  [${project.stage}]` : '';
    const version = `v${project.version ?? '3'}`;
    console.log(`  ⬡  ${project.name}  (${shortId(project)})  ${version}${stage}`);
    console.log(`       ${project.description || '(no description)'}`);
    console.log(`       ${filePath}\n`);

    // Update registry while we're at it
    const projectDir = path.dirname(filePath);
    registerProject(project, projectDir);
  }

  console.log(`  Registry updated: ${getRegistryPath()}\n`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function list(options: ListOptions = {}): void {
  if (options.scan) {
    listFromScan();
  } else {
    listFromRegistry();
  }
}
