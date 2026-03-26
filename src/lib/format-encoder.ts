// src/lib/format-encoder.ts
// Selects and applies the most token-efficient encoding format per task type.
// Grounded in: CodeAgents (55-87% reduction), Anka DSL, CodeAct, TOON.
import { TaskType } from './research-db.js';

export type DispatchFormat =
  | 'typed_pseudocode'
  | 'codeact'
  | 'dsl'
  | 'toon'
  | 'natural_language';

export interface EncodedDispatch {
  format: DispatchFormat;
  encoded_body: string;
  original_chars: number;
  encoded_chars: number;
  compression_ratio: number;
}

// Anka-style DSL grammar header for pipeline tasks
const DSL_GRAMMAR_HEADER = `# DSL Grammar v1.0
# PIPELINE := STEP+
# STEP := step_id ":" ACTION ("→" STEP_ID)*
# ACTION := "read" | "transform" | "write" | "call" | "branch"
# Types: str, int, float, bool, list[T], dict[K,V], optional[T]`.trim();

function encodeAsTypedPseudocode(body: string, taskType: TaskType): string {
  return `[DISPATCH:${taskType.toUpperCase()}]
INPUT: string
OUTPUT: {
  result: string,
  files_modified: list[string],
  next_action: "done" | "needs_review" | "blocked",
  summary: string  // max 1 sentence
}
RULES:
  - Omit all preamble. Start directly with OUTPUT.
  - File paths relative to project root.
  - summary: one sentence max.
TASK:
${body.trim()}
[/DISPATCH]`;
}

function encodeAsCodeAct(body: string): string {
  return `<action_request>
<format>codeact</format>
<task>${body.trim()}</task>
<constraints>
  - Express actions as executable code blocks
  - Use <execute_python> or <execute_bash> tags
  - Return final result in <result> tag
</constraints>
</action_request>`;
}

function encodeAsTOON(body: string, taskType: TaskType): string {
  return `{T:${taskType}|Q:${body.trim().replace(/\s+/g, ' ')}|O:struct}`;
}

function encodeAsDSL(body: string): string {
  return `${DSL_GRAMMAR_HEADER}\n\nPIPELINE:\n${body.trim()}`;
}

export function selectFormat(taskType: TaskType, protocolCondition: string): DispatchFormat {
  if (protocolCondition === 'pd_negotiated') return 'typed_pseudocode';
  switch (taskType) {
    case 'code_gen':
    case 'refactor':
    case 'test_gen':
      return 'typed_pseudocode';
    case 'pipeline':
      return 'dsl';
    case 'analysis':
    case 'retrieval':
      return 'toon';
    case 'planning':
    case 'documentation':
    case 'unknown':
    default:
      return 'natural_language';
  }
}

export function encodeDispatchBody(
  body: string,
  taskType: TaskType,
  format: DispatchFormat,
): EncodedDispatch {
  const original_chars = body.length;
  let encoded_body: string;

  switch (format) {
    case 'typed_pseudocode':
      encoded_body = encodeAsTypedPseudocode(body, taskType);
      break;
    case 'codeact':
      encoded_body = encodeAsCodeAct(body);
      break;
    case 'toon':
      encoded_body = encodeAsTOON(body, taskType);
      break;
    case 'dsl':
      encoded_body = encodeAsDSL(body);
      break;
    case 'natural_language':
    default:
      encoded_body = body;
      break;
  }

  const encoded_chars = encoded_body.length;
  const compression_ratio =
    original_chars > 0 ? parseFloat((1 - encoded_chars / original_chars).toFixed(4)) : 0;

  return { format, encoded_body, original_chars, encoded_chars, compression_ratio };
}
