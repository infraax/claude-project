/**
 * orchestration/index.ts — central coordinator for service health and pipeline metrics
 *
 * Connects to all registered infrastructure services and exposes health + metrics data
 * for the live dashboard. Does NOT mutate external state — read-only probes only.
 */

export interface ServiceHealth {
  name: string;
  status: 'online' | 'degraded' | 'offline';
  latencyMs?: number;
  lastChecked: Date;
  meta?: Record<string, unknown>;
}

export interface PipelineMetrics {
  totalRuns: number;
  successRate: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  cacheHitRate: number;
  totalCostUSD: number;
  lastRun?: Date;
}

/** Probe a single HTTP endpoint and return a ServiceHealth result. */
async function probe(
  name: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    // 401 = key valid but unauthorised scope — still "online"
    const ok = res.status < 400 || res.status === 401;
    return {
      name,
      status: ok ? 'online' : 'degraded',
      latencyMs: Date.now() - start,
      lastChecked: new Date(),
      meta: { httpStatus: res.status },
    };
  } catch {
    return { name, status: 'offline', lastChecked: new Date() };
  }
}

// ── Individual service checks ────────────────────────────────────────────────

function checkCloudflare(): Promise<ServiceHealth> {
  const id = process.env['CLOUDFLARE_ACCOUNT_ID'];
  return probe(
    'cloudflare',
    `https://api.cloudflare.com/client/v4/accounts/${id}/tokens/verify`,
    { Authorization: `Bearer ${process.env['CLOUDFLARE_API_TOKEN']}` },
  );
}

function checkPinecone(): Promise<ServiceHealth> {
  return probe('pinecone', 'https://api.pinecone.io/indexes', {
    'Api-Key': process.env['PINECONE_API_KEY'] ?? '',
  });
}

function checkQdrant(): Promise<ServiceHealth> {
  const base = process.env['QDRANT_URL'] ?? '';
  return probe(`${base}:6333/collections`, 'qdrant', {
    'api-key': process.env['QDRANT_API_KEY'] ?? '',
  });
}

function checkNeon(): Promise<ServiceHealth> {
  return probe('neon', 'https://console.neon.tech/api/v2/projects', {
    Authorization: `Bearer ${process.env['NEON_API_KEY']}`,
  });
}

function checkCohere(): Promise<ServiceHealth> {
  return probe('cohere', 'https://api.cohere.com/v1/check-api-key', {
    Authorization: `Bearer ${process.env['COHERE_API_KEY']}`,
  });
}

function checkUpstash(): Promise<ServiceHealth> {
  return probe('upstash', 'https://api.upstash.com/v2/redis/databases', {
    Authorization: `Bearer ${process.env['UPSTASH_REDIS_KEY']}`,
  });
}

function checkHuggingFace(): Promise<ServiceHealth> {
  return probe('huggingface', 'https://huggingface.co/api/whoami-v2', {
    Authorization: `Bearer ${process.env['HF_TOKEN_READ']}`,
  });
}

function checkFirebase(): Promise<ServiceHealth> {
  return probe(
    'firebase',
    `https://firebase.googleapis.com/v1beta1/projects/${process.env['FIREBASE_PROJECT_ID']}`,
    { Authorization: `Bearer ${process.env['GOOGLE_API_KEY']}` },
  );
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export class Orchestrator {
  private services: Map<string, ServiceHealth> = new Map();

  async checkAllServices(): Promise<ServiceHealth[]> {
    const checks = await Promise.allSettled([
      checkCloudflare(),
      checkPinecone(),
      checkQdrant(),
      checkNeon(),
      checkCohere(),
      checkUpstash(),
      checkHuggingFace(),
      checkFirebase(),
    ]);

    const results: ServiceHealth[] = [];
    for (const result of checks) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        this.services.set(result.value.name, result.value);
      }
    }
    return results;
  }

  async getPipelineMetrics(): Promise<PipelineMetrics> {
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database('research.db', { readonly: true });

      type StatsRow = {
        total_runs: number;
        success_rate: number;
        avg_input: number;
        avg_output: number;
        cache_hit_rate: number;
        total_cost: number;
        last_run: string | null;
      };

      const stats = db.prepare(`
        SELECT
          COUNT(*)                                                    AS total_runs,
          AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END)          AS success_rate,
          AVG(input_tokens)                                           AS avg_input,
          AVG(output_tokens)                                          AS avg_output,
          AVG(CASE WHEN cache_read_tokens > 0 THEN 1.0 ELSE 0.0 END) AS cache_hit_rate,
          SUM(cost_usd)                                               AS total_cost,
          MAX(created_at)                                             AS last_run
        FROM research_runs
      `).get() as StatsRow;

      db.close();

      return {
        totalRuns: stats.total_runs ?? 0,
        successRate: stats.success_rate ?? 0,
        avgInputTokens: stats.avg_input ?? 0,
        avgOutputTokens: stats.avg_output ?? 0,
        cacheHitRate: stats.cache_hit_rate ?? 0,
        totalCostUSD: stats.total_cost ?? 0,
        lastRun: stats.last_run ? new Date(stats.last_run) : undefined,
      };
    } catch {
      return {
        totalRuns: 0,
        successRate: 0,
        avgInputTokens: 0,
        avgOutputTokens: 0,
        cacheHitRate: 0,
        totalCostUSD: 0,
      };
    }
  }

  getServiceMap(): Record<string, ServiceHealth> {
    return Object.fromEntries(this.services);
  }
}

export const orchestrator = new Orchestrator();
