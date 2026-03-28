/**
 * api-server.ts
 * Read-only REST API bridge for GitHub Pages dashboard apps.
 * Exposes research.db data and queue state over HTTP with CORS.
 *
 * Endpoints:
 *   GET /health      → { status, ts, uptime }
 *   GET /dispatches  → last 200 dispatch_observations rows
 *   GET /budget      → cost summary (total, by_condition, cache_hit_rate)
 *   GET /queue       → .claude/queue/*.md file list
 *   GET /tgch        → TGCH layer status + thresholds
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import Database from 'better-sqlite3';

const PORT = 3000;
const PROJECT_FILE = path.resolve('.claude-project');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDb(): Database.Database {
  const project = JSON.parse(fs.readFileSync(PROJECT_FILE, 'utf-8'));
  const memoryPath = project.memory_path.replace('~', process.env['HOME'] ?? '/root');
  const dbPath = path.join(path.dirname(memoryPath), 'research.db');
  return new Database(dbPath, { readonly: true });
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

// ── Route handlers ────────────────────────────────────────────────────────────

function handleHealth(res: http.ServerResponse): void {
  json(res, {
    status: 'ok',
    ts: Date.now(),
    uptime_s: Math.floor(process.uptime()),
    version: '1.0.0',
  });
}

function handleDispatches(res: http.ServerResponse): void {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, dispatch_id, task_type, ablation_condition,
             tokens_total_input, tokens_output,
             tokens_cache_read, tokens_cache_write,
             iterations, outcome, latency_total_ms,
             compression_ratio, cost_usd, model, ts
      FROM dispatch_observations
      ORDER BY ts DESC
      LIMIT 200
    `).all();
    db.close();
    json(res, { count: rows.length, rows });
  } catch (err) {
    json(res, { error: String(err) }, 500);
  }
}

function handleBudget(res: http.ServerResponse): void {
  try {
    const db = getDb();

    const totals = db.prepare(`
      SELECT COUNT(*) as n,
             SUM(tokens_total_input) as total_input,
             SUM(tokens_output) as total_output,
             AVG(tokens_total_input) as avg_input,
             AVG(tokens_output) as avg_output,
             AVG(latency_total_ms) as avg_latency_ms,
             SUM(CASE WHEN tokens_cache_read > 0 THEN 1 ELSE 0 END) as cache_hits,
             AVG(tokens_cache_read) as avg_cache_read
      FROM dispatch_observations
    `).get() as Record<string, number>;

    const byCondition = db.prepare(`
      SELECT ablation_condition,
             COUNT(*) as n,
             AVG(tokens_total_input) as avg_input,
             AVG(tokens_output) as avg_output,
             AVG(tokens_cache_read) as avg_cache_read,
             AVG(latency_total_ms) as avg_latency_ms
      FROM dispatch_observations
      WHERE ablation_condition IS NOT NULL
      GROUP BY ablation_condition
      ORDER BY ablation_condition
    `).all() as Array<Record<string, unknown>>;

    // Compute cost: haiku pricing $1/M in, $5/M out
    const INPUT_CPM = 1.00;
    const OUTPUT_CPM = 5.00;
    const totalCost = (totals.total_input / 1e6) * INPUT_CPM
                    + (totals.total_output / 1e6) * OUTPUT_CPM;
    const cacheHitRate = totals.n > 0 ? (totals.cache_hits / totals.n) * 100 : 0;

    db.close();
    json(res, {
      total_dispatches: totals.n,
      total_cost_usd: parseFloat(totalCost.toFixed(4)),
      budget_remaining_usd: parseFloat((100 - totalCost).toFixed(4)),
      budget_pct_used: parseFloat((totalCost).toFixed(2)),
      avg_input_tokens: Math.round(totals.avg_input ?? 0),
      avg_output_tokens: Math.round(totals.avg_output ?? 0),
      avg_latency_ms: Math.round(totals.avg_latency_ms ?? 0),
      cache_hit_rate_pct: parseFloat(cacheHitRate.toFixed(1)),
      avg_cache_read_tokens: Math.round(totals.avg_cache_read ?? 0),
      by_condition: byCondition,
      pricing: { input_per_million: INPUT_CPM, output_per_million: OUTPUT_CPM },
    });
  } catch (err) {
    json(res, { error: String(err) }, 500);
  }
}

function handleQueue(res: http.ServerResponse): void {
  try {
    const queueDir = path.resolve('.claude/queue');
    const files: Array<{ name: string; size: number; content_preview: string }> = [];

    if (fs.existsSync(queueDir)) {
      for (const f of fs.readdirSync(queueDir)) {
        if (!f.endsWith('.md')) continue;
        const fullPath = path.join(queueDir, f);
        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        files.push({
          name: f,
          size: stat.size,
          content_preview: content.slice(0, 200),
        });
      }
    }

    json(res, { count: files.length, files });
  } catch (err) {
    json(res, { error: String(err) }, 500);
  }
}

function handleTgch(res: http.ServerResponse): void {
  try {
    const db = getDb();

    // Cache layer stats
    const cacheStats = db.prepare(`
      SELECT
        COUNT(*) as n,
        SUM(CASE WHEN tokens_cache_read > 0 THEN 1 ELSE 0 END) as hits,
        AVG(tokens_cache_read) as avg_cache_read,
        MAX(tokens_cache_write) as max_cache_write
      FROM dispatch_observations
    `).get() as Record<string, number>;

    // Latest condition breakdown
    const latestConditions = db.prepare(`
      SELECT ablation_condition,
             COUNT(*) as n,
             AVG(tokens_cache_read) as avg_cache_read,
             AVG(tokens_total_input) as avg_input,
             AVG(tokens_output) as avg_output
      FROM dispatch_observations
      WHERE ablation_condition IS NOT NULL
        AND ts > datetime('now', '-7 days')
      GROUP BY ablation_condition
    `).all() as Array<Record<string, unknown>>;

    db.close();

    const cacheHitRate = cacheStats.n > 0
      ? ((cacheStats.hits / cacheStats.n) * 100).toFixed(1)
      : '0.0';

    json(res, {
      layers: {
        T: {
          name: 'Token Cache',
          status: parseFloat(cacheHitRate) > 0 ? 'active' : 'pending',
          cache_hit_rate_pct: parseFloat(cacheHitRate),
          avg_cache_read_tokens: Math.round(cacheStats.avg_cache_read ?? 0),
          threshold: { 'claude-haiku-4-5': 4096, 'claude-sonnet-4-6': 1024 },
          current_prompt_tokens_est: 4213,
          notes: 'System prompt at 4213 tokens — Haiku threshold met in v3',
        },
        G: {
          name: 'Grammar / Clarity',
          status: 'passthrough',
          notes: 'Ollama not available in container. No-op on code tasks.',
          break_even_chars: 600,
        },
        C: {
          name: 'Compression (LLMLingua)',
          status: 'cold_start',
          pattern_count: 0,
          notes: 'Patterns accumulate after v3. v4 will show 8-15% compression.',
          trigger_similarity_threshold: 0.6,
        },
        H: {
          name: 'Habit / PD Registry',
          status: 'monitoring',
          interaction_count: 93,
          warning_threshold: 90,
          pd_count: 0,
          notes: 'At warning threshold. No PDs authored yet.',
        },
      },
      conditions_latest: latestConditions,
      ablation_versions: {
        v1: { tasks: 30, avg_chars: 162, result: 'invalidated — tasks too small' },
        v2: { tasks: 10, avg_chars: 849, result: 'format +3.3% input, -6.6% output' },
        v3: { tasks: 10, avg_chars: 849, result: 'cache active — avg_input 226 vs 6224 baseline (-96%)' },
      },
    });
  } catch (err) {
    json(res, { error: String(err) }, 500);
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = req.url?.split('?')[0] ?? '/';
  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);

  switch (url) {
    case '/':
    case '/health': handleHealth(res); break;
    case '/dispatches': handleDispatches(res); break;
    case '/budget': handleBudget(res); break;
    case '/queue': handleQueue(res); break;
    case '/tgch': handleTgch(res); break;
    default:
      json(res, {
        error: 'Not found',
        endpoints: ['/health', '/dispatches', '/budget', '/queue', '/tgch'],
      }, 404);
  }
});

server.listen(PORT, () => {
  console.log(`[api-server] Listening on http://localhost:${PORT}`);
  console.log(`[api-server] Endpoints: /health /dispatches /budget /queue /tgch`);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT',  () => { server.close(); process.exit(0); });
