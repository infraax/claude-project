/**
 * generate-claude-md.ts
 *
 * Generates (or refreshes) CLAUDE.md in the project root from the live project brain:
 *   - Project identity + stage
 *   - Pending dispatches
 *   - Recent events (last 8, summarised)
 *   - Key WAKEUP.md sections (Critical Facts, Last Session Summary, Open Questions)
 *   - Agent roster
 *   - Services
 *   - Enabled automations
 *   - Device map
 *   - Key paths
 *
 * CLAUDE.md is read automatically by Claude Code at session start — it is the
 * primary mechanism for giving Claude instant, always-fresh project context
 * without requiring any MCP tool calls.
 *
 * The file is marked with a sentinel comment so tooling can detect it is
 * auto-generated. Claude is instructed not to edit it manually.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { findProject, shortId } from '../lib/project.js';
import { resolvePaths } from '../lib/paths.js';
import { readEvents } from '../lib/events.js';
import { lookupProject } from '../lib/registry.js';

export interface GenerateOptions {
  output?: string;   // override output path (default: project root CLAUDE.md)
  quiet?: boolean;   // suppress console output
}

// ── WAKEUP section extractor ──────────────────────────────────────────────────

function extractWakeupSection(text: string, heading: string, maxChars = 600): string {
  // Match "## Heading\n...content...until next ## or end"
  const pattern = new RegExp(
    `## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n([\\s\\S]*?)(?=\\n## |$)`,
  );
  const match = text.match(pattern);
  if (!match) return '';
  const content = match[1].trim();
  if (!content || content === '(none yet)' || content === '(not set)') return '';
  return content.length > maxChars
    ? content.slice(0, maxChars) + '\n*(truncated — see WAKEUP.md for full content)*'
    : content;
}

// ── Dispatch reader ───────────────────────────────────────────────────────────

function readPendingDispatches(dispatchesDir: string, limit = 5): string[] {
  if (!fs.existsSync(dispatchesDir)) return [];
  try {
    return fs
      .readdirSync(dispatchesDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(dispatchesDir, f), 'utf-8'));
          return d.status === 'pending' ? d : null;
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const pri: Record<string, number> = { high: 0, normal: 1, low: 2 };
        return (pri[a.priority] ?? 1) - (pri[b.priority] ?? 1);
      })
      .slice(0, limit)
      .map((d: any) => {
        const icon = d.priority === 'high' ? '🔴' : d.priority === 'low' ? '🔵' : '🟡';
        return `- ${icon} **[${d.id}]** ${d.title}${d.body ? `\n  ${d.body.slice(0, 120)}${d.body.length > 120 ? '…' : ''}` : ''}`;
      }) as string[];
  } catch { return []; }
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateClaudeMd(options: GenerateOptions = {}): string {
  const found = findProject();
  if (!found) {
    throw new Error('No .claude-project found in this directory or any parent.');
  }

  const { project, projectDir } = found;
  const paths = resolvePaths(project, projectDir);
  const now = new Date().toISOString();
  const source = `${os.hostname()} / ${os.userInfo().username}`;
  const sid = shortId(project);

  // ── Registry last-seen ────────────────────────────────────────────────────
  const regEntry = lookupProject(project.project_id);
  const lastSeen = regEntry?.last_seen?.slice(0, 19) ?? now.slice(0, 19);

  // ── Recent events ─────────────────────────────────────────────────────────
  const events = readEvents(project, 8);
  const eventsSection = events.length === 0
    ? '_No events logged yet._'
    : events
        .slice()
        .reverse()
        .map((e) => {
          const d = e.data as Record<string, unknown>;
          // Use summary if present; for well-known types build a readable label; else JSON
          const summary =
            d.summary as string
            ?? (d.name ? `${d.name}${d.stage ? ` [${d.stage}]` : ''}` : null)
            ?? (d.title as string | undefined)
            ?? (d.dispatch_id ? `dispatch ${d.dispatch_id}` : null)
            ?? JSON.stringify(d).slice(0, 80);
          return `- \`${e.ts.slice(0, 19)}\` **${e.type}** — ${summary} _(${e.source})_`;
        })
        .join('\n');

  // ── Pending dispatches ────────────────────────────────────────────────────
  const dispatches = readPendingDispatches(paths.dispatchesDir);
  const dispatchSection = dispatches.length === 0
    ? '_No pending dispatches._'
    : dispatches.join('\n');

  // ── WAKEUP.md sections ────────────────────────────────────────────────────
  let wakeupCriticalFacts = '';
  let wakeupLastSession = '';
  let wakeupOpenQuestions = '';

  if (fs.existsSync(paths.wakeupFile)) {
    const wakeupText = fs.readFileSync(paths.wakeupFile, 'utf-8');
    wakeupCriticalFacts  = extractWakeupSection(wakeupText, 'Critical Facts');
    wakeupLastSession    = extractWakeupSection(wakeupText, 'Last Session Summary', 400);
    wakeupOpenQuestions  = extractWakeupSection(wakeupText, 'Open Questions / Pending Decisions', 400);
  }

  // ── Agents section ────────────────────────────────────────────────────────
  const agents = project.agents ?? {};
  const agentsSection = Object.keys(agents).length === 0
    ? '_No agents defined._'
    : Object.entries(agents)
        .map(([name, def]) =>
          `- **${name}** (\`${def.model ?? 'default'}\`): ${def.role}` +
          (def.tools?.length ? `\n  Tools: ${def.tools.join(', ')}` : ''),
        )
        .join('\n');

  // ── Services section ──────────────────────────────────────────────────────
  const services = project.services ?? {};
  const servicesSection = Object.keys(services).length === 0
    ? '_No services defined._'
    : Object.entries(services)
        .map(([name, def]) => {
          const endpoint = def.url ?? def.command ?? '(no endpoint)';
          const health = def.healthcheck ? ` · healthcheck: \`${def.healthcheck}\`` : '';
          return `- **${name}** (\`${def.type}\`): \`${endpoint}\`${health}${def.description ? ` — ${def.description}` : ''}`;
        })
        .join('\n');

  // ── Automations section ───────────────────────────────────────────────────
  const automations = (project.automations ?? []).filter((a) => a.enabled !== false);
  const automationsSection = automations.length === 0
    ? '_No automations enabled._'
    : automations
        .map((a) =>
          `- **${a.id}**: ${a.description ?? `${a.trigger.type} → ${a.action.type}`}`,
        )
        .join('\n');

  // ── Tools section ─────────────────────────────────────────────────────────
  const tools = project.tools ?? {};
  const toolsSection = Object.keys(tools).length === 0
    ? ''
    : `\n## Project Tools\n\n` +
      Object.entries(tools)
        .map(([name, def]) => `- **${name}**: \`${def.command}\`${def.description ? ` — ${def.description}` : ''}`)
        .join('\n');

  // ── Devices ───────────────────────────────────────────────────────────────
  const devices = project.devices ?? {};
  const devicesSection = Object.keys(devices).length === 0
    ? ''
    : `\n## Devices\n\n` +
      Object.entries(devices)
        .map(([name, addr]) => `- **${name}**: \`${addr}\``)
        .join('\n');

  // ── Shared paths ──────────────────────────────────────────────────────────
  const sharedPaths = project.shared_paths ?? {};
  const sharedSection = Object.keys(sharedPaths).length === 0
    ? ''
    : `\n## Shared Paths\n\n` +
      Object.entries(sharedPaths)
        .map(([name, p]) => `- **${name}**: \`${p}\``)
        .join('\n');

  // ── Compose the document ─────────────────────────────────────────────────
  const lines: string[] = [
    `<!-- claude-project:generated version="${project.version}" updated="${now}" -->`,
    `<!-- Do not edit manually — regenerated by \`claude-project generate-claude-md\` -->`,
    ``,
    `# ${project.name}`,
    ``,
    `> **Stage:** ${project.stage ?? '(not set)'}  |  **ID:** \`${sid}\`  |  **Updated:** ${now.slice(0, 19)} by ${source}`,
    ``,
  ];

  if (project.description) {
    lines.push(project.description, '');
  }

  // Pending work — first thing Claude should see
  lines.push(
    `## Pending Dispatches`,
    ``,
    dispatchSection,
    ``,
  );

  // Memory briefing from WAKEUP.md
  if (wakeupLastSession) {
    lines.push(`## Last Session Summary`, ``, wakeupLastSession, ``);
  }
  if (wakeupCriticalFacts) {
    lines.push(`## Critical Facts`, ``, wakeupCriticalFacts, ``);
  }
  if (wakeupOpenQuestions) {
    lines.push(`## Open Questions`, ``, wakeupOpenQuestions, ``);
  }

  // Recent activity
  lines.push(`## Recent Activity`, ``, eventsSection, ``);

  // Agents
  lines.push(`## Agents`, ``, agentsSection, ``);

  // Services
  lines.push(`## Services`, ``, servicesSection, ``);

  // Automations
  lines.push(`## Automations`, ``, automationsSection, ``);

  // Tools (only if defined)
  if (toolsSection) lines.push(toolsSection, '');

  // Devices (only if defined)
  if (devicesSection) lines.push(devicesSection, '');

  // Shared paths (only if defined)
  if (sharedSection) lines.push(sharedSection, '');

  // Key paths — always last
  lines.push(
    `## Key Paths`,
    ``,
    `- **Diary:** \`${paths.memoryDir}\``,
    `- **Events:** \`${paths.eventsFile}\`${fs.existsSync(paths.eventsFile) ? ` (${events.length} recent events)` : ''}`,
    `- **Dispatches:** \`${paths.dispatchesDir}\``,
    `- **Config:** \`${paths.dotClaudeDir}/\``,
    `- **Obsidian:** \`${paths.obsidianVault}/${project.obsidian_folder}\``,
    ``,
    `---`,
    ``,
    `*Auto-generated by [claude-project](https://github.com/infraax/claude-project) v4.*`,
    `*Run \`claude-project generate-claude-md\` to refresh, or install hooks for automatic refresh.*`,
  );

  const content = lines.join('\n') + '\n';

  // ── Write ─────────────────────────────────────────────────────────────────
  const outputPath = options.output ?? path.join(projectDir, 'CLAUDE.md');
  fs.writeFileSync(outputPath, content, 'utf-8');

  if (!options.quiet) {
    console.log(
      `\n  CLAUDE.md generated\n\n` +
      `    File:      ${outputPath}\n` +
      `    Project:   ${project.name}  (${sid})\n` +
      `    Stage:     ${project.stage ?? '(not set)'}\n` +
      `    Events:    ${events.length} recent\n` +
      `    Dispatches: ${dispatches.length} pending\n` +
      `    Agents:    ${Object.keys(agents).length}\n` +
      `    Services:  ${Object.keys(services).length}\n\n` +
      `  Claude Code will read this automatically on next session start.\n`,
    );
  }

  return outputPath;
}

// ── Check if a CLAUDE.md is auto-generated by us ─────────────────────────────

export function isAutoGenerated(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    const first = fs.readFileSync(filePath, 'utf-8').slice(0, 120);
    return first.includes('claude-project:generated');
  } catch { return false; }
}
