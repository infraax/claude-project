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
import { generateClaudeMd }                            from './commands/generate-claude-md.js';
import { logEventCmd }                                 from './commands/log-event.js';
import { hookRun }                                     from './commands/hook-run.js';
import { hooksInstall, hooksUninstall, hooksStatus }  from './commands/hooks.js';
import { dispatchList, dispatchShow, dispatchCreate, dispatchRun } from './commands/dispatch.js';
import { automationList, automationRun }               from './commands/automation.js';

const program = new Command();

program
  .name('claude-project')
  .description(
    'Project brain for Claude Code.\n' +
    'Drop a .claude-project file in any directory to give Claude\n' +
    'persistent memory, a registry, event log, agent orchestration,\n' +
    'dispatch queue, automatic CLAUDE.md, session hooks, and more.',
  )
  .version('4.1.0');

// ── init ──────────────────────────────────────────────────────────────────────

program
  .command('init <name>')
  .description('Initialise a .claude-project (v4) in the current directory')
  .option('-d, --description <text>', 'One-line project description', '')
  .option('-o, --obsidian <path>',    'Override Obsidian vault path')
  .option('--diary <path>',           'Override diary memory path')
  .option('-s, --stage <text>',       'Set initial stage label')
  .option('--no-claude-md',           'Skip generating CLAUDE.md')
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

// ── generate-claude-md ────────────────────────────────────────────────────────

program
  .command('generate-claude-md')
  .alias('gcm')
  .description('Generate (or refresh) CLAUDE.md from the live project brain')
  .option('-o, --output <path>', 'Override output path (default: project root CLAUDE.md)')
  .option('-q, --quiet',         'Suppress console output')
  .action((options) => {
    try {
      generateClaudeMd(options);
    } catch (err) {
      console.error(`\n  Error: ${String(err)}\n`);
      process.exit(1);
    }
  });

// ── log-event ─────────────────────────────────────────────────────────────────

program
  .command('log-event <type> [summary]')
  .description('Append an event to the project event log (useful in shell scripts and hooks)')
  .option('--tags <tags>',  'Comma-separated tags, e.g. deploy,prod')
  .option('--data <json>',  'Extra JSON data to attach to the event')
  .option('-q, --quiet',    'Suppress console output')
  .action((type: string, summary: string | undefined, options) => {
    logEventCmd(type, summary, options);
  });

// ── hook-run ──────────────────────────────────────────────────────────────────

program
  .command('hook-run <event>')
  .description(
    'Run a lifecycle hook action (called by Claude Code via settings.json hooks).\n' +
    'Reads hook payload JSON from stdin.\n' +
    'Events: SessionStart, Stop, SessionEnd',
  )
  .action(async (event: string) => {
    await hookRun(event);
  });

// ── hooks ─────────────────────────────────────────────────────────────────────

const hooks = program
  .command('hooks')
  .description('Manage Claude Code session hooks (wires session lifecycle into the project brain)');

hooks
  .command('install')
  .description('Add SessionStart + Stop hooks to settings.json')
  .option('--global', 'Write to ~/.claude/settings.json (fires for all projects)')
  .option('--local',  'Write to .claude/settings.local.json (not committed)')
  .action((options) => {
    try { hooksInstall(options); }
    catch (err) { console.error(`\n  Error: ${String(err)}\n`); process.exit(1); }
  });

hooks
  .command('uninstall')
  .description('Remove claude-project hooks from settings.json')
  .option('--global', 'Remove from ~/.claude/settings.json')
  .option('--local',  'Remove from .claude/settings.local.json')
  .action((options) => {
    try { hooksUninstall(options); }
    catch (err) { console.error(`\n  Error: ${String(err)}\n`); process.exit(1); }
  });

hooks
  .command('status')
  .description('Show which settings files have claude-project hooks installed')
  .action(() => { hooksStatus(); });

// ── mcp ───────────────────────────────────────────────────────────────────────

program
  .command('mcp')
  .description(
    'Start the claude-project MCP server (stdio by default).\n' +
    'Provides: memory, journal, events, dispatches, registry, and project info tools.\n' +
    'Add to ~/.mcp.json:  { "claude-project": { "command": "claude-project", "args": ["mcp"] } }',
  )
  .option('--http',         'Run in HTTP/SSE mode instead of stdio')
  .option('--port <port>',  'HTTP port (default 8765)', (v) => parseInt(v, 10), 8765)
  .action((options) => {
    mcp(options);
  });

// ── inject / eject ────────────────────────────────────────────────────────────

program
  .command('inject')
  .description('Add the claude-project MCP entry to ~/.mcp.json')
  .action(() => { injectCmd(); });

program
  .command('eject')
  .description('Remove the claude-project MCP entry from ~/.mcp.json')
  .action(() => { ejectCmd(); });

program
  .command('mcp-status')
  .description('Show whether the claude-project MCP is configured in ~/.mcp.json')
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

// ── dispatch ──────────────────────────────────────────────────────────────────

const dispatch = program
  .command('dispatch')
  .description('Manage and run agent dispatches');

dispatch
  .command('list')
  .description('List dispatches')
  .option('-s, --status <status>', 'Filter by status: pending|running|completed|failed')
  .option('-a, --agent <name>',    'Filter by agent name')
  .action((options) => { dispatchList(options); });

dispatch
  .command('show <id>')
  .description('Show full dispatch details and result')
  .action((id: string) => { dispatchShow(id); });

dispatch
  .command('create <title>')
  .description('Create a new pending dispatch')
  .option('-b, --body <text>',     'Task body / prompt for the agent')
  .option('-a, --agent <name>',    'Agent name (references project.agents key)')
  .option('-p, --priority <level>','Priority: low|normal|high (default: normal)')
  .action((title: string, options) => { dispatchCreate(title, options); });

dispatch
  .command('run [id]')
  .description('Run a pending dispatch (requires ANTHROPIC_API_KEY)')
  .option('--all',              'Run all pending dispatches')
  .option('-a, --agent <name>', 'Filter to dispatches for this agent')
  .option('--dry-run',          'Show what would run without calling the API')
  .action(async (id: string | undefined, options) => {
    await dispatchRun(id, options);
  });

// ── automation ────────────────────────────────────────────────────────────────

const automation = program
  .command('automation')
  .description('Inspect and manually trigger automations');

automation
  .command('list')
  .description('List all automations with last-fired time and fire count')
  .action(() => { automationList(); });

automation
  .command('run <id>')
  .description('Manually fire an automation by ID (fires as manual trigger)')
  .action((id: string) => { automationRun(id); });

program.parse(process.argv);
