/**
 * extension.ts — VS Code extension entry point for claude-project
 *
 * Activates when a .claude-project file is present anywhere in the workspace.
 * Provides:
 *   - Status bar: ⬡ ProjectName  [current stage]
 *   - Commands palette (Cmd+Shift+P → "Claude Project: ...")
 *   - Auto-inject claude-project MCP into ~/.mcp.json on first activation
 *   - JSON schema validation for .claude-project files
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeProject } from './lib/project.js';
import { inject, isInjected, eject, getMcpJsonPath } from './lib/mcp-inject.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Single-quote a string for safe shell use — handles all metacharacters. */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ── State ─────────────────────────────────────────────────────────────────────

let statusBarItem: vscode.StatusBarItem;
let fileWatcher: vscode.FileSystemWatcher | undefined;

// ── Activation ────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  // Status bar
  const config = vscode.workspace.getConfiguration('claudeProject');
  if (config.get<boolean>('statusBarEnabled', true)) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    statusBarItem.command = 'claudeProject.status';
    statusBarItem.tooltip = 'Claude Project — click for details';
    context.subscriptions.push(statusBarItem);
    updateStatusBar();
  }

  // Watch .claude-project files for changes
  fileWatcher = vscode.workspace.createFileSystemWatcher('**/.claude-project');
  fileWatcher.onDidChange(updateStatusBar);
  fileWatcher.onDidCreate(updateStatusBar);
  fileWatcher.onDidDelete(updateStatusBar);
  context.subscriptions.push(fileWatcher);

  // Re-read on workspace folder change
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(updateStatusBar),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProject.status', cmdStatus),
    vscode.commands.registerCommand('claudeProject.init', cmdInit),
    vscode.commands.registerCommand('claudeProject.sync', cmdSync),
    vscode.commands.registerCommand('claudeProject.injectMcp', cmdInjectMcp),
    vscode.commands.registerCommand('claudeProject.openMemory', cmdOpenMemory),
    vscode.commands.registerCommand('claudeProject.showEvents', cmdShowEvents),
    vscode.commands.registerCommand('claudeProject.listDispatches', cmdListDispatches),
    vscode.commands.registerCommand('claudeProject.daemonStatus', cmdDaemonStatus),
    vscode.commands.registerCommand('claudeProject.openRegistry', cmdOpenRegistry),
  );

  // Auto-inject MCP if configured
  if (config.get<boolean>('mcpAutoInject', true)) {
    runAutoInject(context);
  }
}

export function deactivate(): void {
  fileWatcher?.dispose();
}

// ── Status Bar ────────────────────────────────────────────────────────────────

function updateStatusBar(): void {
  if (!statusBarItem) return;

  const project = findWorkspaceProject();
  if (!project) {
    statusBarItem.hide();
    return;
  }

  const stage = project.stage ? `  [${project.stage}]` : '';
  statusBarItem.text = `⬡ ${project.name}${stage}`;
  statusBarItem.show();
}

// ── Project Detection ─────────────────────────────────────────────────────────

function findWorkspaceProject(): ClaudeProject | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return null;

  for (const folder of folders) {
    let current = folder.uri.fsPath;
    while (true) {
      const candidate = path.join(current, '.claude-project');
      if (fs.existsSync(candidate)) {
        try {
          return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as ClaudeProject;
        } catch {
          return null;
        }
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return null;
}

function findWorkspaceProjectFile(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return null;

  for (const folder of folders) {
    let current = folder.uri.fsPath;
    while (true) {
      const candidate = path.join(current, '.claude-project');
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return null;
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdStatus(): void {
  const filePath = findWorkspaceProjectFile();
  if (!filePath) {
    vscode.window.showInformationMessage(
      'No .claude-project found in this workspace.',
      'Init now',
    ).then((choice) => {
      if (choice === 'Init now') cmdInit();
    });
    return;
  }

  let project: ClaudeProject;
  try {
    project = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ClaudeProject;
  } catch {
    vscode.window.showErrorMessage(`Failed to read ${filePath}`);
    return;
  }

  const memPath = (project.memory_path ?? (project as any).diary_path ?? '').replace('~', os.homedir());
  const memOk   = fs.existsSync(memPath) ? '✓' : '✗';

  const details = [
    `**${project.name}** (${project.project_id.slice(0, 8)})`,
    ``,
    `Stage: ${project.stage ?? '(none)'}`,
    `Created: ${project.created ?? ''} by ${project.created_by ?? ''}`,
    ``,
    `${memOk} Memory: ${memPath}`,
    ``,
    `File: ${filePath}`,
  ].join('\n');

  vscode.window.showInformationMessage(details, { modal: true }, 'Open File', 'Open Memory').then((choice) => {
    if (choice === 'Open File') {
      vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
    } else if (choice === 'Open Memory') {
      cmdOpenMemory();
    }
  });
}

function cmdInit(): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Open a folder first before running Claude Project: Init.');
    return;
  }

  const targetFile = path.join(folder.uri.fsPath, '.claude-project');
  if (fs.existsSync(targetFile)) {
    vscode.window.showWarningMessage(
      '.claude-project already exists in this workspace.',
      'Open it',
    ).then((choice) => {
      if (choice === 'Open it') {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetFile));
      }
    });
    return;
  }

  vscode.window.showInputBox({
    prompt: 'Project name',
    placeHolder: 'MyProject',
  }).then((name) => {
    if (!name) return;
    return vscode.window.showInputBox({
      prompt: 'One-line description (optional)',
      placeHolder: 'What this project does',
    }).then((description) => {
      // Run CLI in integrated terminal — keeps output visible and familiar
      const terminal = vscode.window.createTerminal('Claude Project');
      terminal.show();
      const desc = description ? ` -d ${shellQuote(description)}` : '';
      terminal.sendText(`claude-project init ${shellQuote(name)}${desc}`);
    });
  });
}

function cmdSync(): void {
  const project = findWorkspaceProject();
  if (!project) {
    vscode.window.showErrorMessage('No .claude-project found in this workspace.');
    return;
  }

  const terminal = vscode.window.createTerminal('Claude Project Sync');
  terminal.show();
  terminal.sendText('claude-project sync');
}

function cmdInjectMcp(): void {
  const result = inject();

  switch (result.status) {
    case 'already_present':
      vscode.window.showInformationMessage(
        'claude-project MCP is already configured in ~/.mcp.json.',
      );
      break;

    case 'injected':
    case 'created':
      vscode.window.showInformationMessage(
        `claude-project MCP added to ${result.path}. Restart Claude Code to activate.`,
        'Open ~/.mcp.json',
      ).then((choice) => {
        if (choice === 'Open ~/.mcp.json') {
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(getMcpJsonPath()));
        }
      });
      break;

    case 'error':
      vscode.window.showErrorMessage(`MCP inject failed: ${result.message}`);
      break;
  }
}

function cmdOpenMemory(): void {
  const project = findWorkspaceProject();
  if (!project) {
    vscode.window.showErrorMessage('No .claude-project found in this workspace.');
    return;
  }

  const memPath = (project.memory_path ?? (project as any).diary_path ?? '').replace('~', os.homedir());
  if (!fs.existsSync(memPath)) {
    vscode.window.showWarningMessage(
      `Memory directory not found: ${memPath}\n\nRun 'claude-project init' to initialise it.`,
    );
    return;
  }

  vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(memPath));
}

function cmdShowEvents(): void {
  const terminal = vscode.window.createTerminal('Claude Project Events');
  terminal.show();
  terminal.sendText('claude-project mcp-status && echo "" && echo "Event log:" && claude-project status');
}

function cmdListDispatches(): void {
  const terminal = vscode.window.createTerminal('Claude Project Dispatches');
  terminal.show();
  terminal.sendText('claude-project status');
}

function cmdDaemonStatus(): void {
  const terminal = vscode.window.createTerminal('Claude Project Daemon');
  terminal.show();
  terminal.sendText('claude-project daemon status');
}

function cmdOpenRegistry(): void {
  const registryPath = path.join(os.homedir(), '.claude', 'registry.json');
  if (!fs.existsSync(registryPath)) {
    vscode.window.showWarningMessage(
      'Registry not found. Run: claude-project init <name> to create your first project.',
    );
    return;
  }
  vscode.commands.executeCommand('vscode.open', vscode.Uri.file(registryPath));
}

// ── Auto-inject ───────────────────────────────────────────────────────────────

function runAutoInject(context: vscode.ExtensionContext): void {
  // Only suggest once per install, not on every window open
  const KEY = 'mcpInjectedV3';
  const alreadyDone = context.globalState.get<boolean>(KEY, false);

  if (alreadyDone || isInjected()) {
    context.globalState.update(KEY, true);
    return;
  }

  const project = findWorkspaceProject();
  if (!project) return; // no .claude-project — don't nag

  vscode.window.showInformationMessage(
    `Claude Project detected: **${project.name}**\nAdd the claude-project MCP server to ~/.mcp.json?`,
    { modal: false },
    'Add MCP',
    'Not now',
  ).then((choice) => {
    if (choice === 'Add MCP') {
      cmdInjectMcp();
      context.globalState.update(KEY, true);
    } else if (choice === 'Not now') {
      // Remind next session
    }
  });
}
