/**
 * hooks.ts
 * Manages Claude Code hook entries in settings.json.
 *
 * Writes to:
 *   --global   → ~/.claude/settings.json        (fires for all projects)
 *   (default)  → .claude/settings.json           (project-level, committable)
 *   --local    → .claude/settings.local.json     (project-level, not committed)
 *
 * Installed hooks:
 *   SessionStart → claude-project hook-run SessionStart
 *   Stop         → claude-project hook-run Stop
 *
 * The hook-run command reads the full JSON payload from stdin so it knows
 * the session_id, cwd, and stop_hook_active flag.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findProject } from '../lib/project.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HookEntry {
  type: 'command';
  command: string;
}

interface HookGroup {
  matcher: string;
  hooks: HookEntry[];
}

interface Settings {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

export interface HooksOptions {
  global?: boolean;
  local?: boolean;
}

// ── Hook definitions ──────────────────────────────────────────────────────────

// Marker present in every hook command we write, regardless of how the CLI
// is invoked (globally as 'claude-project' or via 'node dist/cli.js').
const HOOK_MARKER = 'hook-run';

// Resolve the CLI binary path — use 'claude-project' if installed globally,
// otherwise fall back to the current dist/cli.js for development use.
function getCliCommand(): string {
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    const which = execSync('which claude-project 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (which) return 'claude-project';
  } catch { /* not installed globally */ }
  // Development fallback: use node + absolute path to dist/cli.js
  const distCli = path.join(__dirname, '..', 'cli.js');
  return `node "${distCli}"`;
}

function buildHookGroups(cli: string): Record<string, HookGroup[]> {
  return {
    SessionStart: [
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: `${cli} hook-run SessionStart`,
          },
        ],
      },
    ],
    Stop: [
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: `${cli} hook-run Stop`,
          },
        ],
      },
    ],
  };
}

// ── Settings file path resolution ─────────────────────────────────────────────

function resolveSettingsPath(options: HooksOptions): string {
  if (options.global) {
    return path.join(os.homedir(), '.claude', 'settings.json');
  }

  // Project-level: requires being in a claude-project directory
  const found = findProject();
  if (!found) {
    throw new Error(
      'No .claude-project found. Run from a project directory, or use --global.',
    );
  }

  const settingsDir = path.join(found.projectDir, '.claude');
  fs.mkdirSync(settingsDir, { recursive: true });

  return options.local
    ? path.join(settingsDir, 'settings.local.json')
    : path.join(settingsDir, 'settings.json');
}

// ── Read / write settings ─────────────────────────────────────────────────────

function readSettings(filePath: string): Settings {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Settings;
  } catch {
    return {};
  }
}

function writeSettings(filePath: string, settings: Settings): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

// ── Detect installed hooks ────────────────────────────────────────────────────

function isInstalled(settings: Settings): boolean {
  if (!settings.hooks) return false;
  return Object.values(settings.hooks).some((groups) =>
    groups.some((g) =>
      g.hooks.some((h) => h.command?.includes(HOOK_MARKER)),
    ),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function hooksInstall(options: HooksOptions): void {
  const settingsPath = resolveSettingsPath(options);
  const settings = readSettings(settingsPath);
  const cli = getCliCommand();

  if (isInstalled(settings)) {
    console.log(
      `\n  Hooks already installed in:\n  ${settingsPath}\n\n` +
      `  Run 'claude-project hooks status' to verify.\n`,
    );
    return;
  }

  const newGroups = buildHookGroups(cli);

  if (!settings.hooks) settings.hooks = {};

  for (const [event, groups] of Object.entries(newGroups)) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = groups;
    } else {
      // Append our groups, avoid duplicates
      for (const group of groups) {
        const alreadyPresent = settings.hooks[event].some((g) =>
          g.hooks.some((h) => h.command?.includes(HOOK_MARKER)),
        );
        if (!alreadyPresent) {
          settings.hooks[event].push(group);
        }
      }
    }
  }

  writeSettings(settingsPath, settings);

  const scope = options.global ? 'global' : options.local ? 'project (local)' : 'project';
  console.log(
    `\n  Hooks installed (${scope})\n\n` +
    `  File: ${settingsPath}\n\n` +
    `  Events wired:\n` +
    `    • SessionStart → log session_start event + refresh CLAUDE.md\n` +
    `    • Stop         → log session_end event + sync Obsidian + refresh CLAUDE.md\n\n` +
    `  Claude Code will pick up these hooks immediately (no restart needed).\n`,
  );
}

export function hooksUninstall(options: HooksOptions): void {
  const settingsPath = resolveSettingsPath(options);

  if (!fs.existsSync(settingsPath)) {
    console.log(`\n  No settings file found at ${settingsPath}\n`);
    return;
  }

  const settings = readSettings(settingsPath);

  if (!isInstalled(settings)) {
    console.log(`\n  No claude-project hooks found in ${settingsPath}\n`);
    return;
  }

  if (settings.hooks) {
    for (const event of Object.keys(settings.hooks)) {
      settings.hooks[event] = settings.hooks[event]
        .map((group) => ({
          ...group,
          hooks: group.hooks.filter((h) => !h.command?.includes(HOOK_MARKER)),
        }))
        .filter((group) => group.hooks.length > 0);

      if (settings.hooks[event].length === 0) {
        delete settings.hooks[event];
      }
    }

    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
  }

  writeSettings(settingsPath, settings);
  console.log(`\n  Hooks removed from ${settingsPath}\n`);
}

export function hooksStatus(): void {
  const locations: Array<{ label: string; path: string }> = [
    { label: 'Global', path: path.join(os.homedir(), '.claude', 'settings.json') },
  ];

  // Add project-level paths if in a project
  const found = findProject();
  if (found) {
    const dotClaude = path.join(found.projectDir, '.claude');
    locations.push(
      { label: 'Project', path: path.join(dotClaude, 'settings.json') },
      { label: 'Project (local)', path: path.join(dotClaude, 'settings.local.json') },
    );
  }

  console.log('\n  Claude Code Hooks — claude-project\n');

  let anyInstalled = false;
  for (const loc of locations) {
    const exists = fs.existsSync(loc.path);
    if (!exists) {
      console.log(`  ${loc.label.padEnd(18)} ✗ ${loc.path}  (not found)`);
      continue;
    }
    const settings = readSettings(loc.path);
    const installed = isInstalled(settings);
    anyInstalled = anyInstalled || installed;

    if (installed) {
      const events = Object.keys(settings.hooks ?? {}).filter((e) =>
        settings.hooks![e].some((g) => g.hooks.some((h) => h.command?.includes(HOOK_MARKER))),
      );
      console.log(`  ${loc.label.padEnd(18)} ✓ ${loc.path}`);
      console.log(`  ${''.padEnd(18)}   Events: ${events.join(', ')}`);
    } else {
      console.log(`  ${loc.label.padEnd(18)} — ${loc.path}  (no claude-project hooks)`);
    }
  }

  console.log('');

  if (!anyInstalled) {
    const scope = found ? '' : '--global ';
    console.log(
      `  No hooks installed yet.\n\n` +
      `  Install with:\n` +
      `    claude-project hooks install ${scope}          (${found ? 'project-level .claude/settings.json' : 'global ~/.claude/settings.json'})\n` +
      `    claude-project hooks install --global         (global, fires for all projects)\n`,
    );
  }
}
