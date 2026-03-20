import { inject, eject, isInjected, getMcpJsonPath } from '../lib/mcp-inject.js';

export function injectCmd(): void {
  const result = inject();

  switch (result.status) {
    case 'already_present':
      console.log(`\n  claude-diary MCP already present in ${getMcpJsonPath()}\n`);
      break;

    case 'injected':
      console.log(
        `\n  claude-diary MCP added to ${result.path}\n\n` +
        `  Restart Claude Code to activate.\n`,
      );
      break;

    case 'created':
      console.log(
        `\n  Created ${result.path} with claude-diary MCP entry.\n\n` +
        `  Restart Claude Code to activate.\n`,
      );
      break;

    case 'error':
      console.error(`\n  Error: ${result.message}\n`);
      process.exit(1);
  }
}

export function ejectCmd(): void {
  const removed = eject();
  if (removed) {
    console.log(`\n  claude-diary MCP removed from ${getMcpJsonPath()}\n`);
  } else {
    console.log(`\n  claude-diary MCP was not present in ${getMcpJsonPath()}\n`);
  }
}

export function statusCmd(): void {
  const present = isInjected();
  const file    = getMcpJsonPath();

  console.log(
    `\n  ~/.mcp.json: ${file}\n` +
    `  claude-diary: ${present ? '✓ configured' : '✗ not found'}\n\n` +
    (present
      ? '  Claude Code will pick up the MCP on next restart.\n'
      : '  Run: claude-project inject\n'),
  );
}
