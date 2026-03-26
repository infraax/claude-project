// src/lib/task-classifier.ts
// Classifies dispatch task type from title + body text using pattern matching.
import { TaskType } from './research-db.js';

const TASK_PATTERNS: Array<{ type: TaskType; patterns: RegExp[] }> = [
  { type: 'test_gen',      patterns: [/\btest(s|ing)?\b/i, /\bspec\b/i, /\bvitest\b/i, /\bjest\b/i] },
  { type: 'pipeline',      patterns: [/\bpipeline\b/i, /\betl\b/i, /\btransform\b/i] },
  { type: 'refactor',      patterns: [/\brefactor\b/i, /\bclean.?up\b/i, /\brewrite\b/i] },
  { type: 'analysis',      patterns: [/\banalyse?\b/i, /\breview\b/i, /\bcheck\b/i, /\binspect\b/i] },
  { type: 'documentation', patterns: [/\bdoc(s|ument(ation)?)?\b/i, /\breadme\b/i, /\bcomment\b/i] },
  { type: 'planning',      patterns: [/\bplan\b/i, /\barchitect\b/i, /\bdesign\b/i, /\bstrateg\b/i] },
  { type: 'retrieval',     patterns: [/\bfind\b/i, /\bsearch\b/i, /\blookup\b/i, /\bwhere\b.*\bis\b/i] },
  { type: 'code_gen',      patterns: [/\bimplement\b/i, /\bcreate\b/i, /\bbuild\b/i, /\badd\b.*\bfunction\b/i] },
];

export function classifyTaskType(title: string, body: string): TaskType {
  const combined = `${title} ${body}`;
  for (const { type, patterns } of TASK_PATTERNS) {
    if (patterns.some((p) => p.test(combined))) return type;
  }
  return 'unknown';
}

export function inferInteractionPair(agentName?: string, callerContext?: string): string {
  const caller = callerContext ?? 'user';
  const target = agentName ?? 'main';
  return `${caller}\u2192${target}`;
}
