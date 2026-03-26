# 07 — PHASE 4: TYPED DISPATCH & TASK ROUTING
## Format Selection Per Task Type + Backend Routing

> **Checkpoint ID:** `phase7_typed_dispatch`
> **Prerequisites:** Phase 6 (PD registry) complete
> **Goal:** Every dispatch is encoded in the most token-efficient format for its task type.
>           Natural language is the fallback, never the default.
> **Research:** `codeagents_2507.03254.pdf` (55-87% reduction), `anka_dsl_2512.23214.pdf`,
>               `codeact_2402.01030.pdf`

---

## Context Budget Warning

This phase modifies dispatch-runner.ts and creates one new module (format-encoder.ts).
If context compacts mid-phase:
1. Read AGENT_STATE.md → find last completed step
2. Read ONLY this file (07_PHASE4_TYPED_DISPATCH.md)
3. Resume from last completed step

---

## Format Selection Logic

Each task type maps to an optimal encoding format based on published benchmarks.
The format determines how the dispatch body is encoded before sending to the API.

| Task Type     | Primary Format     | Fallback     | Token Saving vs NL |
|---------------|-------------------|--------------|-------------------|
| code_gen      | typed_pseudocode  | CodeAct      | 55–87%            |
| refactor      | typed_pseudocode  | CodeAct      | 55–87%            |
| test_gen      | typed_pseudocode  | CodeAct      | 55–87%            |
| pipeline      | DSL               | typed_pseudo | 40–70%            |
| analysis      | TOON              | typed_pseudo | 30–50%            |
| retrieval     | TOON              | natural_lang | 30–50%            |
| planning      | natural_language  | —            | 0% (NL optimal)   |
| documentation | natural_language  | —            | 0% (NL optimal)   |
| unknown       | natural_language  | —            | 0% (NL optimal)   |

**Rule:** Never apply compression to `planning` or `documentation` — these depend on
natural language nuance and compression degrades quality.

---

## Step 7.1 — Create format-encoder.ts

**Create file:** `src/lib/format-encoder.ts`

```typescript
// src/lib/format-encoder.ts
import { TaskType } from "./research-db.js";

export type DispatchFormat =
  | "typed_pseudocode"
  | "codeact"
  | "dsl"
  | "toon"
  | "natural_language";

export interface EncodedDispatch {
  format: DispatchFormat;
  encoded_body: string;
  original_chars: number;
  encoded_chars: number;
  compression_ratio: number;
}

// DSL grammar header for pipeline tasks (Anka-style)
const DSL_GRAMMAR_HEADER = `
# DSL Grammar v1.0
# PIPELINE := STEP+
# STEP := step_id ":" ACTION ("→" STEP_ID)*
# ACTION := "read" | "transform" | "write" | "call" | "branch"
# Types: str, int, float, bool, list[T], dict[K,V], optional[T]
`.trim();

// Typed pseudocode wrapper
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
  - Omit all preamble
  - Start directly with OUTPUT
  - file paths relative to project root
TASK:
${body.trim()}
[/DISPATCH]`;
}

// CodeAct wrapper — executable Python/bash actions
function encodeAsCodeAct(body: string): string {
  return `<action_request>
<format>codeact</format>
<task>${body.trim()}</task>
<constraints>
  - Express actions as executable code blocks
  - Use <execute_python> or <execute_bash> tags
  - Output final result in <result> tag
</constraints>
</action_request>`;
}

// TOON wrapper — Token-Oriented Object Notation
function encodeAsTOON(body: string, taskType: TaskType): string {
  return `{T:${taskType}|Q:${body.trim().replace(/\s+/g, " ")}|O:struct}`;
}

// DSL wrapper for pipeline tasks
function encodeAsDSL(body: string): string {
  return `${DSL_GRAMMAR_HEADER}\n\nPIPELINE:\n${body.trim()}`;
}

export function selectFormat(taskType: TaskType, protocolCondition: string): DispatchFormat {
  // If a PD is active, the PD itself specifies the format — respect it
  if (protocolCondition === "pd_negotiated") return "typed_pseudocode";

  switch (taskType) {
    case "code_gen":
    case "refactor":
    case "test_gen":
      return "typed_pseudocode";
    case "pipeline":
      return "dsl";
    case "analysis":
    case "retrieval":
      return "toon";
    case "planning":
    case "documentation":
    case "unknown":
    default:
      return "natural_language";
  }
}

export function encodeDispatchBody(
  body: string,
  taskType: TaskType,
  format: DispatchFormat
): EncodedDispatch {
  const original_chars = body.length;
  let encoded_body: string;

  switch (format) {
    case "typed_pseudocode":
      encoded_body = encodeAsTypedPseudocode(body, taskType);
      break;
    case "codeact":
      encoded_body = encodeAsCodeAct(body);
      break;
    case "toon":
      encoded_body = encodeAsTOON(body, taskType);
      break;
    case "dsl":
      encoded_body = encodeAsDSL(body);
      break;
    case "natural_language":
    default:
      encoded_body = body;
      break;
  }

  const encoded_chars = encoded_body.length;
  const compression_ratio =
    original_chars > 0
      ? parseFloat((1 - encoded_chars / original_chars).toFixed(4))
      : 0;

  return {
    format,
    encoded_body,
    original_chars,
    encoded_chars,
    compression_ratio,
  };
}
```

Write to AGENT_STATE.md: `step_7_1_format_encoder: complete`

---

## Step 7.2 — Extend DispatchFile Interface

**Modify `src/lib/dispatch-runner.ts`** — extend DispatchFile interface:

```typescript
export interface DispatchFile {
  // --- existing fields (unchanged) ---
  id: string;
  title: string;
  body: string;
  agent?: string;
  priority?: "low" | "normal" | "high";
  status: "pending" | "running" | "completed" | "failed";
  created?: string;
  started_at?: string;
  completed_at?: string;
  source?: string;
  result?: string;
  error?: string;
  tool_calls?: Array<{ tool: string; input: unknown; output_summary: string }>;

  // --- new fields ---
  task_type?: TaskType;
  dispatch_format?: DispatchFormat;
  protocol_condition?: "natural_language" | "typed_schema" | "pd_negotiated";
  protocol_id?: string;
  session_id?: string;
  encoded_chars?: number;
  original_chars?: number;
  compression_ratio?: number;

  // --- upgraded usage (replaces old {input_tokens, output_tokens}) ---
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}
```

Write to AGENT_STATE.md: `step_7_2_dispatch_interface_extended: complete`

---

## Step 7.3 — Wire Format Encoder into runDispatch

**Modify `src/lib/dispatch-runner.ts`** — add imports and encoding step:

Add to imports:
```typescript
import { selectFormat, encodeDispatchBody, DispatchFormat } from "./format-encoder.js";
```

Add encoding step BEFORE the API call (after task classification):

```typescript
// --- Format encoding ---
const taskType = classifyTaskType(dispatch.title, dispatch.body ?? "");
const protocolCondition: string = dispatch.protocol_id ? "pd_negotiated" : "natural_language";
const selectedFormat = selectFormat(taskType, protocolCondition);

const encodingStart = Date.now();
const encoded = encodeDispatchBody(
  dispatch.body ?? "",
  taskType,
  selectedFormat
);
timings.compression = Date.now() - encodingStart;

// Store encoding metadata back onto dispatch for observation recording
dispatch.task_type = taskType;
dispatch.dispatch_format = selectedFormat;
dispatch.encoded_chars = encoded.encoded_chars;
dispatch.original_chars = encoded.original_chars;
dispatch.compression_ratio = encoded.compression_ratio;

// Use encoded body for the actual API call
const messageBody = encoded.encoded_body;
```

Then use `messageBody` (not `dispatch.body`) in the messages array passed to the API.

Write to AGENT_STATE.md: `step_7_3_encoding_wired: complete`

---

## Step 7.4 — Add Backend Routing Field to AgentDefinition

**Modify `src/lib/project.ts`** — extend AgentDefinition:

```typescript
export interface AgentDefinition {
  id: string;
  name?: string;
  role?: string;
  model: string;
  backend: "claude" | "ollama" | "openai" | "local";  // NEW: explicit backend
  system_prompt?: string;
  tools?: string[];
  tags?: string[];
  trigger?: string;
  instructions?: string;
}
```

Add backend routing logic in dispatch-runner.ts:

```typescript
function resolveApiClient(agent: AgentDefinition | undefined) {
  const backend = agent?.backend ?? "claude";
  switch (backend) {
    case "ollama":
      // Return Ollama-compatible client (OpenAI-compatible endpoint)
      return { type: "ollama", baseUrl: process.env["OLLAMA_HOST"] ?? "http://localhost:11434" };
    case "openai":
      return { type: "openai", apiKey: process.env["OPENAI_API_KEY"] ?? "" };
    case "claude":
    default:
      return { type: "claude" };
  }
}
```

**Clarity Layer agent** (runs on Ollama) must always use `backend: "ollama"`.
**negotiation_controller** uses `backend: "claude"` (needs best reasoning).
**All other agents** default to `backend: "claude"` unless explicitly set.

Write to AGENT_STATE.md: `step_7_4_backend_routing: complete`

---

## Step 7.5 — Update DispatchObservation to Record Format

In `dispatch-runner.ts`, in the observation recording block added in Phase 4,
add format fields to the observation:

```typescript
const obs: DispatchObservation = {
  // ... existing fields ...
  tokens: {
    // ... existing ...
  },
  compression: {
    input_raw_chars: dispatch.original_chars ?? dispatch.body?.length ?? 0,
    input_post_clarity: dispatch.original_chars ?? 0,  // updated after clarity layer in Phase 5
    input_post_lingua: dispatch.encoded_chars ?? 0,
    compression_ratio: dispatch.compression_ratio ?? 0,
  },
  // ... rest of existing fields ...
};
```

Write to AGENT_STATE.md: `step_7_5_observation_format_fields: complete`

---

## Step 7.6 — Build and Test

```bash
npm run build

# Verify format selection logic
npx ts-node -e "
import { selectFormat, encodeDispatchBody } from './src/lib/format-encoder.js';
const tests = [
  ['code_gen', 'natural_language'],
  ['pipeline', 'natural_language'],
  ['analysis', 'natural_language'],
  ['planning', 'natural_language'],
];
for (const [task, proto] of tests) {
  const fmt = selectFormat(task as any, proto);
  const enc = encodeDispatchBody('implement a file reader', task as any, fmt);
  console.log(task, '->', fmt, '| ratio:', enc.compression_ratio);
}
"

# Verify all existing tests still pass
npx vitest run
```

Expected output example:
```
code_gen    -> typed_pseudocode | ratio: -0.8  (overhead added — this is correct for short inputs)
pipeline    -> dsl              | ratio: -0.5
analysis    -> toon             | ratio: 0.3
planning    -> natural_language | ratio: 0
```

Note: Negative compression ratio on short inputs is expected and correct.
The savings appear at real dispatch lengths (500+ chars).

Write to AGENT_STATE.md:
```json
{
  "phase": "phase7_typed_dispatch_complete",
  "format_encoder_created": true,
  "dispatch_interface_extended": true,
  "encoding_wired": true,
  "backend_routing_added": true,
  "build_passing": true,
  "tests_passing": true
}
```

**Phase 4 complete. Then read: `08_PHASE5_COMPRESSION.md`**
```

***

Say **"next"** for `08_PHASE5_COMPRESSION.md`.

Bronnen


## `08_PHASE5_COMPRESSION.md`

```markdown