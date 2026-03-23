#!/usr/bin/env node
'use strict';

import { Command } from 'commander';
import { init }                                        from './commands/init.js';
import { status }                                      from './commands/status.js';
import { list }                                        from './commands/list.js';
import { sync }                                        from './commands/sync.js';
import { mcp }                                         from './commands/mcp.js';
import { injectCmd, ejectCmd, statusCmd as mcpStatusCmd } from './commands/inject.js';
import { daemonInstall, daemonUninstall, daemonStatus, daemonRun } from './commands/daemon.js';
import { installExt, uninstallExt, createClaudepStub } from './commands/install-ext.js';

const program = new Command();

program
  .name('claude-project')
  .description(
    'Project brain for Claude Code.\n' +
    'Drop a .claude-project file in any directory to give Claude\n' +
    'persistent memory, a registry, event log, agent orchestration,\n' +
    'dispatch queue, Obsidian sync, and macOS-native .claudep support.',
  )
  .version('4.0.0');

// ── init ──────────────────────────────────────────────────────────────────────

program
  .command('init <name>')
  .description('Initialise a .claude-project (v4) in the current directory')
  .option('-d, --description <text>', 'One-line project description', '')
  .option('-o, --obsidian <path>',    'Override Obsidian vault path')
  .option('--diary <path>',           'Override diary memory path')
  .option('-s, --stage <text>',       'Set initial stage label')
  .action((name: string, options) => {
    init(name, options);
  });

// ── status ────────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show full project context (v4: registry, events, dispatches, agents, services)')
  .action(() => {
    status();
  });

// ── list ──────────────────────────────────────────────────────────────────────

program
  .command('list')
  .description('List all known projects (from ~/.claude/registry.json — instant, no scan)')
  .option('--scan', 'Force a filesystem scan instead of reading the registry')
  .action((options) => {
    list(options);
  });

// ── sync ──────────────────────────────────────────────────────────────────────

program
  .command('sync')
  .description('Copy all memory .md files → Obsidian vault folder for this project')
  .action(() => {
    sync();
  });

// ── mcp ───────────────────────────────────────────────────────────────────────

program
  .command('mcp')
  .description(
    'Start the claude-diary MCP server (stdio by default).\n' +
    'Provides: memory, journal, events, dispatches, registry, and project info tools.\n' +
    'Add to ~/.mcp.json:  { "claude-diary": { "command": "claude-project", "args": ["mcp"] } }',
  )
  .option('--http',         'Run in HTTP/SSE mode instead of stdio')
  .option('--port <port>',  'HTTP port (default 8765)', (v) => parseInt(v, 10), 8765)
  .action((options) => {
    mcp(options);
  });

// ── inject / eject ────────────────────────────────────────────────────────────

program
  .command('inject')
  .description('Add the claude-diary MCP entry to ~/.mcp.json')
  .action(() => { injectCmd(); });

program
  .command('eject')
  .description('Remove the claude-diary MCP entry from ~/.mcp.json')
  .action(() => { ejectCmd(); });

program
  .command('mcp-status')
  .description('Show whether the claude-diary MCP is configured in ~/.mcp.json')
  .action(() => { mcpStatusCmd(); });

// ── daemon ────────────────────────────────────────────────────────────────────

const daemon = program
  .command('daemon')
  .description('Manage the background daemon (macOS launchd — keeps registry hot, fires automations)');

daemon
  .command('install')
  .description('Install and start the launchd daemon')
  .action(() => { daemonInstall(); });

daemon
  .command('uninstall')
  .description('Stop and remove the launchd daemon')
  .action(() => { daemonUninstall(); });

daemon
  .command('status')
  .description('Show whether the daemon is installed and running')
  .action(() => { daemonStatus(); });

daemon
  .command('run')
  .description('Run a single daemon scan cycle (called by launchd — not for direct use)')
  .action(() => { daemonRun(); });

// ── install-ext ───────────────────────────────────────────────────────────────

const ext = program
  .command('install-ext')
  .description('Install the .claudep file type on macOS (native UTI via app bundle + LaunchServices)');

ext
  .command('install')
  .description('Create the app bundle and register .claudep with macOS')
  .action(() => { installExt(); });

ext
  .command('uninstall')
  .description('Remove the app bundle and unregister .claudep')
  .action(() => { uninstallExt(); });

ext
  .command('create [name]')
  .description('Create a .claudep stub for the current project (for Finder / sharing)')
  .action((name?: string) => { createClaudepStub(name); });

program.parse(process.argv);
