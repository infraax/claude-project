import * as fs from 'fs';
import * as path from 'path';
import {
  buildProject,
  ensureDir,
  findProject,
  shortId,
  writeProject,
} from '../lib/project.js';
import { resolvePaths } from '../lib/paths.js';

export interface InitOptions {
  description: string;
  obsidian?: string;
  diary?: string;
  stage?: string;
}

export function init(name: string, options: InitOptions): void {
  // Guard: already inside a project?
  const existing = findProject();
  if (existing) {
    const p = existing.project;
    console.error(
      `\n  .claude-project already exists:\n` +
      `    Project: ${p.name}  (${shortId(p)})\n` +
      `    File:    ${existing.filePath}\n\n` +
      `  Run 'claude-project status' to see details.\n`,
    );
    process.exit(1);
  }

  const project = buildProject(name, options.description);

  // Apply overrides from flags
  if (options.obsidian) project.obsidian_vault = options.obsidian;
  if (options.diary)    project.diary_path     = options.diary;
  if (options.stage)    project.stage          = options.stage;

  const targetDir = process.cwd();
  const filePath  = writeProject(targetDir, project);

  // Create memory directory
  const { memoryDir, obsidianProjectDir } = resolvePaths(project);
  ensureDir(memoryDir);

  // Seed WAKEUP.md
  const wakeupPath = path.join(memoryDir, 'WAKEUP.md');
  if (!fs.existsSync(wakeupPath)) {
    fs.writeFileSync(
      wakeupPath,
      `# WAKEUP — ${name}\n\n` +
      `## Current Stage\n${project.stage ?? '(not set)'}\n\n` +
      `## Last Session Summary\n(none yet)\n\n` +
      `## Open Questions / Pending Decisions\n\n` +
      `## Critical Facts\n\n`,
      'utf-8',
    );
  }

  // Create Obsidian project folder + README if vault exists
  if (fs.existsSync(project.obsidian_vault)) {
    ensureDir(obsidianProjectDir);
    const readmePath = path.join(obsidianProjectDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(
        readmePath,
        `# ${name}\n\n` +
        `${options.description}\n\n` +
        `| Field | Value |\n` +
        `|-------|-------|\n` +
        `| **Project ID** | \`${project.project_id}\` |\n` +
        `| **Created** | ${project.created} |\n` +
        `| **Created by** | ${project.created_by} |\n` +
        `| **Diary** | \`${memoryDir}\` |\n`,
        'utf-8',
      );
    }
  }

  console.log(
    `\n  Initialised project '${name}'\n\n` +
    `    ID:       ${project.project_id}\n` +
    `    File:     ${filePath}\n` +
    `    Diary:    ${memoryDir}\n` +
    `    Obsidian: ${obsidianProjectDir}\n` +
    `    Source:   ${project.created_by}\n`,
  );
}
