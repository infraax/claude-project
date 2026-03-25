/**
 * log-event.ts
 * CLI wrapper for appendEvent — lets shell scripts (hooks, daemon, CI) log events.
 *
 * Usage:
 *   claude-project log-event session_start
 *   claude-project log-event deploy "deployed to prod" --tags deploy,prod
 *   claude-project log-event custom --data '{"key":"value"}'
 */

import { findProject } from '../lib/project.js';
import { appendEvent } from '../lib/events.js';

export interface LogEventOptions {
  summary?: string;
  tags?: string;
  data?: string;
  quiet?: boolean;
}

export function logEventCmd(
  eventType: string,
  summaryArg: string | undefined,
  options: LogEventOptions,
): void {
  const found = findProject();
  if (!found) {
    if (!options.quiet) {
      console.error('\n  No .claude-project found — cannot log event.\n');
    }
    process.exit(1);
  }

  const { project } = found;

  // Build data payload
  let data: Record<string, unknown> = {};
  const summary = summaryArg ?? options.summary ?? '';
  if (summary) data.summary = summary;

  if (options.data) {
    try {
      const extra = JSON.parse(options.data) as Record<string, unknown>;
      data = { ...data, ...extra };
    } catch {
      if (!options.quiet) {
        console.error(`\n  Warning: --data is not valid JSON, ignoring.\n`);
      }
    }
  }

  // Parse tags
  const tags = options.tags
    ? options.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : undefined;

  const event = appendEvent(project, eventType, data, tags);

  if (!options.quiet) {
    console.log(
      `\n  Event logged\n\n` +
      `    ID:      ${event.id}\n` +
      `    Type:    ${event.type}\n` +
      `    Source:  ${event.source}\n` +
      `    Project: ${project.name}  (${project.project_id.slice(0, 8)})\n` +
      (Object.keys(data).length > 0 ? `    Data:    ${JSON.stringify(data)}\n` : '') +
      (tags?.length ? `    Tags:    ${tags.join(', ')}\n` : '') +
      `    Time:    ${event.ts}\n`,
    );
  }
}
