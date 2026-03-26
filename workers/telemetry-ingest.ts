// workers/telemetry-ingest.ts
// Cloudflare Worker — receives telemetry POSTs, validates, stores in D1.
// Deploy: wrangler deploy workers/telemetry-ingest.ts

export interface Env {
  DB: D1Database;
}

const REQUIRED_NUMERIC_FIELDS = [
  'tokens_input', 'tokens_output', 'tokens_cache_read',
  'tokens_cache_write', 'latency_total_ms', 'iterations',
];

const VALID_TASK_TYPES = new Set([
  'code_gen', 'refactor', 'analysis', 'retrieval',
  'planning', 'test_gen', 'pipeline', 'documentation', 'unknown',
]);

const VALID_OUTCOMES = new Set(['success', 'failure', 'partial']);

const VALID_FORMATS = new Set([
  'typed_pseudocode', 'codeact', 'dsl', 'toon', 'natural_language',
]);

function validate(data: any): string | null {
  if (data.schema_version !== '1.0') return 'invalid schema_version';

  for (const field of ['installation_id', 'project_id', 'task_type', 'outcome']) {
    if (typeof data[field] !== 'string') return `${field} missing`;
    if (data[field].length > 30) return `${field} too long — possible content leak`;
  }

  if (!VALID_TASK_TYPES.has(data.task_type)) return `invalid task_type: ${data.task_type}`;
  if (!VALID_OUTCOMES.has(data.outcome)) return `invalid outcome: ${data.outcome}`;

  for (const field of REQUIRED_NUMERIC_FIELDS) {
    if (typeof data[field] !== 'number') return `${field} must be number`;
    if (data[field] < 0) return `${field} must be non-negative`;
    if (data[field] > 1_000_000) return `${field} suspiciously large`;
  }

  if (typeof data.optimizations !== 'object') return 'optimizations missing';
  for (const flag of ['cache', 'format_encode', 'clarity', 'llmlingua', 'pd']) {
    if (typeof data.optimizations[flag] !== 'boolean') return `optimizations.${flag} must be boolean`;
  }

  return null;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Schema-Version',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method === 'POST' && new URL(request.url).pathname === '/ingest') {
      let data: any;
      try {
        data = await request.json();
      } catch {
        return new Response('invalid JSON', { status: 400 });
      }

      const error = validate(data);
      if (error) {
        return new Response(`validation failed: ${error}`, { status: 400 });
      }

      await env.DB.prepare(`
        INSERT INTO observations (
          installation_id, project_id, schema_version,
          task_type, protocol_condition, dispatch_format,
          tokens_input, tokens_output, tokens_cache_read, tokens_cache_write,
          compression_ratio, latency_total_ms, outcome, iterations,
          opt_cache, opt_format_encode, opt_clarity, opt_llmlingua, opt_pd,
          ablation_condition, ts, received_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      `).bind(
        data.installation_id, data.project_id, data.schema_version,
        data.task_type, data.protocol_condition ?? '', data.dispatch_format ?? '',
        data.tokens_input, data.tokens_output,
        data.tokens_cache_read, data.tokens_cache_write,
        data.compression_ratio ?? null, data.latency_total_ms,
        data.outcome, data.iterations,
        data.optimizations.cache ? 1 : 0,
        data.optimizations.format_encode ? 1 : 0,
        data.optimizations.clarity ? 1 : 0,
        data.optimizations.llmlingua ? 1 : 0,
        data.optimizations.pd ? 1 : 0,
        data.ablation_condition ?? null,
        data.ts,
      ).run();

      return new Response('ok', { status: 200, headers: CORS_HEADERS });
    }

    if (request.method === 'GET' && new URL(request.url).pathname === '/thresholds') {
      const rows = await env.DB.prepare(`
        SELECT
          task_type,
          COUNT(*) as n,
          AVG(tokens_input) as mean_tokens_input,
          AVG(CASE WHEN protocol_condition = 'natural_language'
                   THEN tokens_input END) as c_nl,
          AVG(CASE WHEN protocol_condition = 'pd_negotiated'
                   THEN tokens_input END) as c_pd,
          AVG(CAST(tokens_cache_read AS REAL) /
              NULLIF(tokens_input, 0)) as cache_ratio,
          AVG(compression_ratio) as mean_compression
        FROM observations
        WHERE ts >= date('now', '-30 days')
        GROUP BY task_type
        HAVING n >= 10
        ORDER BY n DESC
      `).all();

      const thresholds: Record<string, any> = {};
      for (const row of rows.results) {
        const c_nl = row.c_nl as number;
        const c_pd = row.c_pd as number;
        const n_breakeven = (c_nl && c_pd && c_nl > c_pd)
          ? Math.round(1500 / (c_nl - c_pd) * 10) / 10
          : null;

        thresholds[row.task_type as string] = {
          n_observations:           row.n,
          mean_tokens_input:        Math.round(row.mean_tokens_input as number),
          pd_negotiation_breakeven: n_breakeven,
          cache_hit_rate:           Math.round((row.cache_ratio as number) * 1000) / 10,
          mean_compression_ratio:   Math.round((row.mean_compression as number) * 100) / 100,
        };
      }

      const totalObs = await env.DB.prepare(
        'SELECT COUNT(*) as n FROM observations'
      ).first<{ n: number }>();

      return new Response(JSON.stringify({
        updated_at:         new Date().toISOString(),
        total_observations: totalObs?.n ?? 0,
        thresholds,
      }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    if (request.method === 'GET' && new URL(request.url).pathname === '/stats') {
      const row = await env.DB.prepare(`
        SELECT
          COUNT(*) as total,
          COUNT(DISTINCT installation_id) as unique_installs,
          COUNT(DISTINCT project_id) as unique_projects,
          MIN(ts) as first_seen,
          MAX(ts) as last_seen
        FROM observations
      `).first();

      return new Response(JSON.stringify(row), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response('not found', { status: 404 });
  },
};
