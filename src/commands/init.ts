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
import { registerProject } from '../lib/registry.js';
import { appendEvent } from '../lib/events.js';
import { generateClaudeMd } from './generate-claude-md.js';

export interface InitOptions {
  description: string;
  obsidian?: string;
  diary?: string;
  stage?: string;
  claudeMd?: boolean;  // default true — set false via --no-claude-md
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
  const paths     = resolvePaths(project, targetDir);

  // ── Machine-local runtime dirs ──────────────────────────────────────────────
  // memory/ — WAKEUP.md, SESSION_JOURNAL.md (existing)
  ensureDir(paths.memoryDir);
  // sessions/ — per-session transcripts
  ensureDir(paths.sessionsDir);
  // dispatches/ — task queue
  ensureDir(paths.dispatchesDir);

  // ── Project config dirs (alongside .claude-project, committable) ────────────
  ensureDir(paths.agentsDir);
  ensureDir(paths.servicesDir);
  ensureDir(paths.automationsDir);
  ensureDir(paths.toolsDir);

  // Seed WAKEUP.md
  const wakeupPath = path.join(paths.memoryDir, 'WAKEUP.md');
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

  // Seed .claude/README.md so the directory is self-documenting
  const dotClaudeReadme = path.join(paths.dotClaudeDir, 'README.md');
  if (!fs.existsSync(dotClaudeReadme)) {
    fs.writeFileSync(
      dotClaudeReadme,
      `# ${name} — Claude Project Config\n\n` +
      `This directory is the project-scoped configuration for Claude.\n` +
      `It lives alongside \`.claude-project\` and can be committed to version control.\n\n` +
      `| Directory | Purpose |\n` +
      `|-----------|----------|\n` +
      `| \`agents/\` | Sub-agent definitions (YAML or JSON) |\n` +
      `| \`services/\` | Service descriptors |\n` +
      `| \`automations/\` | Trigger → action rules |\n` +
      `| \`tools/\` | Project-local scripts and tool definitions |\n\n` +
      `Runtime state (events, sessions, dispatches) is stored in:\n` +
      `\`${paths.runtimeDir}\`\n`,
      'utf-8',
    );
  }

  // Create Obsidian project folder + README if vault exists
  if (fs.existsSync(project.obsidian_vault)) {
    ensureDir(paths.obsidianProjectDir);
    const readmePath = path.join(paths.obsidianProjectDir, 'README.md');
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
        `| **Diary** | \`${paths.memoryDir}\` |\n` +
        `| **Runtime** | \`${paths.runtimeDir}\` |\n`,
        'utf-8',
      );
    }
  }

  // ── Register in global registry ─────────────────────────────────────────────
  registerProject(project, targetDir);

  // ── Log project_init event ──────────────────────────────────────────────────
  appendEvent(project, 'project_init', {
    name,
    description: options.description,
    stage: project.stage,
    project_dir: targetDir,
  });

  // ── Auto-generate CLAUDE.md ─────────────────────────────────────────────────
  // Default true; skipped only if --no-claude-md is passed.
  let claudeMdPath = '';
  if (options.claudeMd !== false) {
    try {
      claudeMdPath = generateClaudeMd({ quiet: true });
    } catch {
      // Non-fatal — init succeeded, CLAUDE.md generation failed silently
    }
  }

  console.log(
    `\n  Initialised project '${name}'\n\n` +
    `    ID:        ${project.project_id}\n` +
    `    Version:   ${project.version}\n` +
    `    File:      ${filePath}\n` +
    `    Diary:     ${paths.memoryDir}\n` +
    `    Runtime:   ${paths.runtimeDir}\n` +
    `    Config:    ${paths.dotClaudeDir}/\n` +
    `    Obsidian:  ${paths.obsidianProjectDir}\n` +
    `    CLAUDE.md: ${claudeMdPath || '(skipped)'}\n` +
    `    Source:    ${project.created_by}\n`,
  );
}
