/**
 * Model selection config — always use lowest cost model
 * capable of the task. Never auto-select Opus.
 */
export const MODELS = {
  // Short tasks, ablation micro-tasks — no caching needed
  dispatch: "claude-haiku-4-5",

  // Repeated/long tasks where cache activates (Sonnet min = 1024 tokens)
  dispatch_cached: "claude-sonnet-4-6",

  // Clarity rewrite layer (prefer Ollama local, fall back here)
  clarity: "claude-haiku-4-5",

  // Complex agent tasks, planning, multi-step reasoning
  reasoning: "claude-sonnet-4-6",

  // Manual only — never auto-selected
  premium: "claude-opus-4-6",
} as const;

export type ModelTier = keyof typeof MODELS;

export function getModel(tier: ModelTier = "dispatch"): string {
  return MODELS[tier];
}

// Minimum system prompt tokens required to activate prompt caching per model.
// Below this threshold, setting cache_control is wasteful overhead.
export const CACHE_MIN_TOKENS: Record<string, number> = {
  "claude-haiku-4-5":  4096,
  "claude-sonnet-4-6": 1024,
  "claude-opus-4-6":   1024,
};

// Cost per 1M tokens (USD) — for spend estimation
export const COST_PER_MILLION = {
  "claude-haiku-4-5":  { input: 1.00, output: 5.00,  cache_read: 0.10 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00, cache_read: 0.30 },
  "claude-opus-4-6":   { input: 5.00, output: 25.00, cache_read: 0.50 },
} as const;

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0
): number {
  const costs = COST_PER_MILLION[model as keyof typeof COST_PER_MILLION];
  if (!costs) return 0;
  return (
    (inputTokens / 1_000_000) * costs.input +
    (outputTokens / 1_000_000) * costs.output +
    (cacheReadTokens / 1_000_000) * costs.cache_read
  );
}
