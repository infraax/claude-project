import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
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
import { generateInstallationId } from '../lib/telemetry.js';

export interface InitOptions {
  description: string;
  diary?: string;   // kept for CLI backward compat — maps to memory_path
  stage?: string;
  claudeMd?: boolean;  // default true — set false via --no-claude-md
}

async function promptTelemetryOptIn(): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log('\n  ┌─────────────────────────────────────────────────────┐');
    console.log('  │  Share anonymous token usage metrics?               │');
    console.log('  │                                                     │');
    console.log('  │  Sends ONLY: token counts, latency, task types.     │');
    console.log('  │  NEVER sends: code, prompts, file names, results.   │');
    console.log('  │  Opt out anytime: set telemetry.enabled=false       │');
    console.log('  │  in .claude-project                                 │');
    console.log('  └─────────────────────────────────────────────────────┘');
    rl.question('\n  Enable? [y/N]: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function init(name: string, options: InitOptions): Promise<void> {
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
  if (options.diary)  project.memory_path = options.diary;
  if (options.stage)  project.stage       = options.stage;

  const targetDir = process.cwd();
  const filePath  = writeProject(targetDir, project);
  const paths     = resolvePaths(project, targetDir);

  // ── Machine-local runtime dirs ──────────────────────────────────────────────
  ensureDir(paths.memoryDir);
  ensureDir(paths.sessionsDir);
  ensureDir(paths.dispatchesDir);

  // ── Project config dirs (alongside .claude-project, committable) ────────────
  ensureDir(paths.agentsDir);
  ensureDir(paths.servicesDir);
  ensureDir(paths.automationsDir);
  ensureDir(paths.toolsDir);

  // Seed initial context.json for get_context() MCP tool
  const contextPath = path.join(paths.runtimeDir, 'context.json');
  if (!fs.existsSync(contextPath)) {
    fs.writeFileSync(contextPath, JSON.stringify({
      stage: 'initialized',
      summary: `Project ${name} initialized.`,
      blockers: [],
      critical_facts: [],
      next_steps: [],
      updated_at: new Date().toISOString(),
    }, null, 2) + '\n', 'utf-8');
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
  let claudeMdPath = '';
  if (options.claudeMd !== false) {
    try {
      claudeMdPath = generateClaudeMd({ quiet: true });
    } catch {
      // Non-fatal — init succeeded, CLAUDE.md generation failed silently
    }
  }

  // ── Telemetry opt-in ────────────────────────────────────────────────────────
  const optIn = await promptTelemetryOptIn();
  if (optIn) {
    project.telemetry = {
      enabled: true,
      installation_id: generateInstallationId(),
      opted_in_at: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2) + '\n', 'utf-8');
    console.log('\n  Telemetry enabled — thank you!\n');
  } else {
    console.log('\n  Telemetry disabled. Enable later in .claude-project\n');
  }

  console.log(
    `\n  Initialised project '${name}'\n\n` +
    `    ID:        ${project.project_id}\n` +
    `    Version:   ${project.version}\n` +
    `    File:      ${filePath}\n` +
    `    Memory:    ${paths.memoryDir}\n` +
    `    Runtime:   ${paths.runtimeDir}\n` +
    `    Config:    ${paths.dotClaudeDir}/\n` +
    `    Context:   ${contextPath}\n` +
    `    CLAUDE.md: ${claudeMdPath || '(skipped)'}\n` +
    `    Source:    ${project.created_by}\n\n` +
    `  MCP config (add to ~/.mcp.json):\n` +
    `  { "mcpServers": { "claude-project": { "command": "claude-project", "args": ["mcp"] } } }\n`,
  );
}
