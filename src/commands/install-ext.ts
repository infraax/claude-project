/**
 * install-ext.ts
 * Installs the .claudep file extension as a macOS-native file type.
 *
 * Strategy:
 *   1. Create a minimal shell-script app bundle at ~/Applications/Claude Project.app
 *   2. The bundle's Info.plist declares the UTI (dev.claudelab.claudep) for .claudep files
 *   3. Register with LaunchServices via /System/Library/Frameworks/.../lsregister
 *   4. The app, when opened with a .claudep file, opens the project in VS Code (or $EDITOR)
 *
 * A .claudep file is a JSON file that acts as a named entry point for a project:
 *   { "project_id": "a1b2c3d4-...", "name": "MyProject", "path": "/path/to/project" }
 *
 * Usage:
 *   claude-project install-ext           — installs the app + registers UTI
 *   claude-project install-ext --uninstall — removes the app
 *   claude-project install-ext --create <name> — create a .claudep stub for the current project
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findProject } from '../lib/project.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_NAME   = 'Claude Project';
const APP_DIR    = path.join(os.homedir(), 'Applications', `${APP_NAME}.app`);
const UTI        = 'dev.claudelab.claudep';
const EXTENSION  = 'claudep';

const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister';

// ── Info.plist ────────────────────────────────────────────────────────────────

function buildInfoPlist(execPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>${UTI}.app</string>

    <key>CFBundleName</key>
    <string>${APP_NAME}</string>

    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>

    <key>CFBundleVersion</key>
    <string>4.0.0</string>

    <key>CFBundleShortVersionString</key>
    <string>4.0</string>

    <key>CFBundleExecutable</key>
    <string>open-project</string>

    <key>CFBundlePackageType</key>
    <string>APPL</string>

    <key>CFBundleSignature</key>
    <string>????</string>

    ${'<!-- Declare the .claudep UTI so macOS recognises it natively -->'}
    <key>UTExportedTypeDeclarations</key>
    <array>
        <dict>
            <key>UTTypeIdentifier</key>
            <string>${UTI}</string>
            <key>UTTypeDescription</key>
            <string>Claude Project</string>
            <key>UTTypeConformsTo</key>
            <array>
                <string>public.json</string>
                <string>public.text</string>
            </array>
            <key>UTTypeTagSpecification</key>
            <dict>
                <key>public.filename-extension</key>
                <string>${EXTENSION}</string>
                <key>public.mime-type</key>
                <string>application/vnd.claudelab.project+json</string>
            </dict>
        </dict>
    </array>

    ${'<!-- Handle .claudep files when double-clicked or opened via `open` -->'}
    <key>CFBundleDocumentTypes</key>
    <array>
        <dict>
            <key>CFBundleTypeName</key>
            <string>Claude Project</string>
            <key>CFBundleTypeRole</key>
            <string>Editor</string>
            <key>LSItemContentTypes</key>
            <array>
                <string>${UTI}</string>
            </array>
            <key>CFBundleTypeExtensions</key>
            <array>
                <string>${EXTENSION}</string>
            </array>
            <key>CFBundleTypeIconFile</key>
            <string>AppIcon</string>
        </dict>
    </array>

    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>

    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
`;
}

// ── Shell launcher script ─────────────────────────────────────────────────────

function buildLauncher(): string {
  return `#!/usr/bin/env bash
# Claude Project opener — invoked by macOS when a .claudep file is double-clicked.
# $1 = path to the .claudep file (passed by LaunchServices)

CLAUDEP="$1"

if [ -z "$CLAUDEP" ]; then
    # Launched directly — open Terminal at home
    open -a Terminal ~
    exit 0
fi

# Parse project path from the .claudep file
PROJECT_PATH=$(python3 -c "
import json, sys
try:
    d = json.load(open('$CLAUDEP'))
    print(d.get('path', ''))
except:
    pass
" 2>/dev/null)

if [ -n "$PROJECT_PATH" ] && [ -d "$PROJECT_PATH" ]; then
    # Open in VS Code if available, else Terminal
    if command -v code &>/dev/null; then
        code "$PROJECT_PATH"
    else
        open -a Terminal "$PROJECT_PATH"
    fi
else
    # Fall back: open the .claudep file itself in VS Code
    if command -v code &>/dev/null; then
        code "$CLAUDEP"
    else
        open "$CLAUDEP"
    fi
fi
`;
}

// ── Install ───────────────────────────────────────────────────────────────────

export function installExt(): void {
  if (os.platform() !== 'darwin') {
    console.error('\n  .claudep file type registration is only supported on macOS.\n');
    process.exit(1);
  }

  console.log(`\n  Installing .claudep file type...\n`);

  // Build app bundle structure
  const contentsDir = path.join(APP_DIR, 'Contents');
  const macosDir    = path.join(contentsDir, 'MacOS');
  const execPath    = path.join(macosDir, 'open-project');

  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(path.join(contentsDir, 'Resources'), { recursive: true });

  // Write Info.plist
  fs.writeFileSync(
    path.join(contentsDir, 'Info.plist'),
    buildInfoPlist(execPath),
    'utf-8',
  );

  // Write launcher script
  fs.writeFileSync(execPath, buildLauncher(), { encoding: 'utf-8', mode: 0o755 });

  // Write PkgInfo
  fs.writeFileSync(path.join(contentsDir, 'PkgInfo'), 'APPL????', 'utf-8');

  console.log(`  App bundle: ${APP_DIR}`);

  // Register with LaunchServices
  if (fs.existsSync(LSREGISTER)) {
    try {
      const { execSync } = require('child_process');
      execSync(`"${LSREGISTER}" -f "${APP_DIR}"`, { encoding: 'utf-8' });
      console.log(`  Registered with LaunchServices`);
    } catch (err) {
      console.error(`  Warning: lsregister failed: ${String(err)}`);
      console.error(`  You can register manually:\n    "${LSREGISTER}" -f "${APP_DIR}"\n`);
    }
  } else {
    console.log(`  Note: lsregister not found — restart Finder to pick up the new type:`);
    console.log(`    killall Finder`);
  }

  console.log(
    `\n  Done! .claudep files are now recognised by macOS.\n\n` +
    `  Create a .claudep stub for your current project:\n` +
    `    claude-project install-ext --create\n`,
  );
}

// ── Uninstall ─────────────────────────────────────────────────────────────────

export function uninstallExt(): void {
  if (!fs.existsSync(APP_DIR)) {
    console.log(`\n  App not found at ${APP_DIR}\n`);
    return;
  }

  // Unregister from LaunchServices first
  if (fs.existsSync(LSREGISTER)) {
    try {
      const { execSync } = require('child_process');
      execSync(`"${LSREGISTER}" -u "${APP_DIR}"`, { encoding: 'utf-8' });
    } catch {
      // ignore
    }
  }

  fs.rmSync(APP_DIR, { recursive: true, force: true });
  console.log(`\n  Removed ${APP_DIR}\n  .claudep file type unregistered.\n`);
}

// ── Create .claudep stub ──────────────────────────────────────────────────────

export function createClaudepStub(outputName?: string): void {
  const found = findProject();
  if (!found) {
    console.error('\n  No .claude-project found in this directory.\n');
    process.exit(1);
  }

  const { project, projectDir } = found;
  const filename = outputName ?? `${project.name}.claudep`;
  const outputPath = path.join(projectDir, filename);

  const stub = {
    $schema: 'https://cdn.jsdelivr.net/npm/@claudelab/project/schema/claudep.schema.json',
    project_id: project.project_id,
    name: project.name,
    description: project.description,
    path: projectDir,
    created: new Date().toISOString(),
  };

  fs.writeFileSync(outputPath, JSON.stringify(stub, null, 2) + '\n', 'utf-8');

  console.log(
    `\n  Created: ${outputPath}\n\n` +
    `  Double-click this file in Finder to open the project in VS Code.\n` +
    `  You can share it or put it anywhere — it's just a pointer.\n`,
  );
}
