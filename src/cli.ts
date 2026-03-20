#!/usr/bin/env node
'use strict';

import { Command } from 'commander';
import { init }                        from './commands/init.js';
import { status }                      from './commands/status.js';
import { list }                        from './commands/list.js';
import { sync }                        from './commands/sync.js';
import { mcp }                         from './commands/mcp.js';
import { injectCmd, ejectCmd, statusCmd as mcpStatusCmd } from './commands/inject.js';

const program = new Command();

program
  .name('claude-project')
  .description(
    'Project context system for Claude Code.\n' +
    'Drop a .claude-project file in any directory to give Claude\n' +
    'persistent memory, Obsidian sync, and source-attributed journal entries.',
  )
  .version('3.0.0');

// ── init ──────────────────────────────────────────────────────────────────────

program
  .command('init <name>')
  .description('Initialise a .claude-project in the current directory')
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
  .description('Show the current project context (.claude-project detected from CWD upward)')
  .action(() => {
    status();
  });

// ── list ──────────────────────────────────────────────────────────────────────

program
  .command('list')
  .description('Find all .claude-project files on this machine')
  .action(() => {
    list();
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
    'Add to ~/.mcp.json:  { "claude-diary": { "command": "npx", "args": ["-y", "@claudelab/project", "mcp"] } }',
  )
  .option('--http',         'Run in HTTP/SSE mode instead of stdio')
  .option('--port <port>',  'HTTP port (default 8765)', (v) => parseInt(v, 10), 8765)
  .action((options) => {
    mcp(options);
  });

// ── inject ────────────────────────────────────────────────────────────────────

program
  .command('inject')
  .description('Add the claude-diary MCP entry to ~/.mcp.json')
  .action(() => {
    injectCmd();
  });

program
  .command('eject')
  .description('Remove the claude-diary MCP entry from ~/.mcp.json')
  .action(() => {
    ejectCmd();
  });

program
  .command('mcp-status')
  .description('Show whether the claude-diary MCP is configured in ~/.mcp.json')
  .action(() => {
    mcpStatusCmd();
  });

program.parse(process.argv);
