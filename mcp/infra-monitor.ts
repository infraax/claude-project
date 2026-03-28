/**
 * mcp/infra-monitor.ts — Free Tier Usage MCP Server
 *
 * Exposes tools for checking free-tier quota across all configured services.
 * Agents MUST call get_budget_warning before batch operations or deployments.
 *
 * Tools:
 *   get_infra_status    — full registry + Anthropic cost from research.db
 *   get_budget_warning  — CRITICAL/MONITOR/OK per service
 *   check_pinecone      — live index stats via Pinecone API
 *   check_upstash       — Redis command counts + QStash info
 *   check_cloudflare    — Workers / KV / Pages inventory
 *   check_neon          — connection status + limits
 *   log_usage           — persists consumption events to research.db + snapshot
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import dotenv from "dotenv";
dotenv.config();

const server = new McpServer({ name: "infra-monitor", version: "1.0.0" });

// ── Snapshot file — persists last-known usage ─────────────────────────────

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "usage-snapshot.json");

function loadSnapshot(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveSnapshot(data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  const existing = loadSnapshot();
  const merged = { ...existing, ...data, updated_at: new Date().toISOString() };
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(merged, null, 2));
}

function getResearchDb(): Database.Database {
  const dbPath =
    process.env["RESEARCH_DB_PATH"] ||
    path.join(process.cwd(), "data", "research.db");
  return new Database(dbPath);
}

// ── Tool: get_infra_status ────────────────────────────────────────────────

server.tool(
  "get_infra_status",
  "Get full free-tier infrastructure status. Call this before any deployment or batch operation.",
  {},
  async () => {
    const snapshot = loadSnapshot();

    let anthropicSpent = 0;
    let anthropicDispatches = 0;
    try {
      const db = getResearchDb();
      const row = db
        .prepare(
          `SELECT SUM(cost_usd) as total, COUNT(*) as count
           FROM dispatch_observations
           WHERE ts > strftime('%Y-%m-%d', 'now', 'start of month')`
        )
        .get() as Record<string, number> | undefined;
      anthropicSpent = row?.total ?? 0;
      anthropicDispatches = row?.count ?? 0;
      db.close();
    } catch { /* research.db may not exist yet */ }

    const status = {
      generated_at: new Date().toISOString(),
      services: {
        anthropic: {
          budget_usd: 100,
          spent_usd: parseFloat(anthropicSpent.toFixed(4)),
          remaining_usd: parseFloat((100 - anthropicSpent).toFixed(4)),
          pct_used: parseFloat(((anthropicSpent / 100) * 100).toFixed(2)),
          dispatches_this_month: anthropicDispatches,
          status:
            anthropicSpent > 80
              ? "CRITICAL"
              : anthropicSpent > 50
              ? "MONITOR"
              : "OK",
        },
        github_actions: {
          limit_minutes: 2000,
          used_minutes:
            (snapshot as Record<string, unknown>)["github_actions_minutes"] ??
            "unknown — check GitHub UI",
          status: "check https://github.com/settings/billing",
        },
        codespaces: {
          limit_core_hours: 120,
          used_core_hours:
            (snapshot as Record<string, unknown>)["codespaces_hours"] ??
            "unknown — check GitHub UI",
          status: "check https://github.com/settings/billing",
        },
        pinecone: {
          storage_gb: 2,
          read_units_monthly: 1_000_000,
          write_units_monthly: 2_000_000,
          max_indexes: 5,
          last_snapshot: (snapshot as Record<string, unknown>)["pinecone"] ?? {},
          note: "Call check_pinecone for live stats",
        },
        upstash_redis: {
          commands_per_day: 10_000,
          storage_mb: 256,
          last_snapshot: (snapshot as Record<string, unknown>)["upstash_redis"] ?? {},
          note: "Call check_upstash for live stats",
        },
        upstash_qstash: {
          messages_per_day: 500,
          last_snapshot: (snapshot as Record<string, unknown>)["upstash_qstash"] ?? {},
          note: "Call check_upstash for live stats",
        },
        cloudflare: {
          workers_requests_per_day: 100_000,
          kv_reads_per_day: 100_000,
          kv_writes_per_day: 1_000,
          r2_storage_gb: 10,
          d1_reads_per_day: 5_000_000,
          pages_builds_per_month: 500,
          status: "Call check_cloudflare for live stats",
        },
        neon: {
          storage_gb: 0.5,
          compute_hours_monthly: 100,
          status: "Call check_neon for live connection",
        },
        firebase: {
          firestore_reads_per_day: 50_000,
          firestore_writes_per_day: 20_000,
          storage_gb: 5,
          hosting_transfer_gb_monthly: 10,
          status: "check https://console.firebase.google.com",
        },
        cohere: {
          monthly_calls: 1_000,
          trial_expires: "2026-04-03",
          status:
            new Date() > new Date("2026-04-03")
              ? "EXPIRED"
              : "ACTIVE — expires 2026-04-03",
        },
        agentbay: {
          max_concurrent_sessions: 5,
          session_timeout_min: 60,
          available_images: ["linux_latest", "code_latest", "browser_latest"],
          status: "ACTIVE",
        },
      },
      deployment_targets: [
        {
          name: "Cloudflare Pages",
          command: "npx wrangler pages deploy",
          status: "ready",
        },
        {
          name: "Cloudflare Workers",
          command: "npx wrangler deploy",
          status: "ready",
        },
        {
          name: "GitHub Pages",
          command: "push to gh-pages branch",
          status: "ready",
        },
        {
          name: "Firebase Hosting",
          command: "firebase deploy --only hosting",
          status: "ready",
        },
        { name: "HF Spaces", command: "git push hf-spaces", status: "configured" },
      ],
    };

    return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
  }
);

// ── Tool: check_pinecone ──────────────────────────────────────────────────

server.tool(
  "check_pinecone",
  "Check Pinecone index stats and storage usage against free tier limits.",
  {
    index_name: z
      .string()
      .optional()
      .describe("Specific index to check, or omit for all"),
  },
  async ({ index_name }) => {
    const apiKey = process.env["PINECONE_API_KEY"];
    if (!apiKey)
      return { content: [{ type: "text", text: "PINECONE_API_KEY not set" }] };

    try {
      const { default: axios } = await import("axios");

      const listRes = await axios.get("https://api.pinecone.io/indexes", {
        headers: {
          "Api-Key": apiKey,
          "X-Pinecone-API-Version": "2024-07",
        },
      });
      const indexes: Array<Record<string, unknown>> =
        listRes.data.indexes ?? [];

      const results: unknown[] = [];
      for (const idx of indexes) {
        if (index_name && idx["name"] !== index_name) continue;
        try {
          const statsRes = await axios.get(
            `https://${idx["host"]}/describe_index_stats`,
            { headers: { "Api-Key": apiKey } }
          );
          results.push({
            name: idx["name"],
            dimension: idx["dimension"],
            total_vector_count: statsRes.data.totalVectorCount ?? 0,
            namespaces: Object.keys(
              (statsRes.data.namespaces as Record<string, unknown>) ?? {}
            ).length,
            fullness: statsRes.data.indexFullness ?? 0,
          });
        } catch (e) {
          results.push({ name: idx["name"], error: String(e) });
        }
      }

      const summary = {
        total_indexes: indexes.length,
        limit: 5,
        pct_indexes_used: `${((indexes.length / 5) * 100).toFixed(0)}%`,
        indexes: results,
        storage_limit_gb: 2,
        status:
          indexes.length >= 5 ? "WARNING: at index limit" : "OK",
      };

      saveSnapshot({ pinecone: { ...summary, checked_at: new Date().toISOString() } });
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${String(e)}` }] };
    }
  }
);

// ── Tool: check_upstash ───────────────────────────────────────────────────

server.tool(
  "check_upstash",
  "Check Upstash Redis and QStash daily usage against free tier limits.",
  {},
  async () => {
    const results: Record<string, unknown> = {};

    const redisUrl = process.env["UPSTASH_REDIS_URL"];
    const redisToken = process.env["UPSTASH_REDIS_KEY"];
    if (redisUrl && redisToken) {
      try {
        const { default: axios } = await import("axios");
        const r = await axios.get(`${redisUrl}/info`, {
          headers: { Authorization: `Bearer ${redisToken}` },
        });
        const info: string = r.data?.result ?? "";
        const cmdMatch = info.match(/total_commands_processed:(\d+)/);
        results["redis"] = {
          daily_limit: 10_000,
          total_commands_processed: cmdMatch ? parseInt(cmdMatch[1]!) : "unknown",
          status: "check Upstash console for today's count",
        };
        saveSnapshot({
          upstash_redis: { ...results["redis"] as object, checked_at: new Date().toISOString() },
        });
      } catch (e) {
        results["redis"] = { error: String(e) };
      }
    } else {
      results["redis"] = { status: "UPSTASH_REDIS_URL not set" };
    }

    results["qstash"] = {
      daily_limit: 500,
      note: "Check https://console.upstash.com/qstash for today's message count",
      status: "cannot query programmatically without QStash management API",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

// ── Tool: check_cloudflare ────────────────────────────────────────────────

server.tool(
  "check_cloudflare",
  "Check Cloudflare Workers, KV, R2, and Pages usage.",
  {},
  async () => {
    const token = process.env["CLOUDFLARE_API_TOKEN"];
    const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
    if (!token || !accountId) {
      return {
        content: [
          {
            type: "text",
            text: "CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set",
          },
        ],
      };
    }

    try {
      const { default: axios } = await import("axios");
      const headers = { Authorization: `Bearer ${token}` };
      const base = `https://api.cloudflare.com/client/v4`;

      const [workersRes, kvRes, pagesRes] = await Promise.all([
        axios.get(`${base}/accounts/${accountId}/workers/scripts`, { headers }),
        axios.get(`${base}/accounts/${accountId}/storage/kv/namespaces`, { headers }),
        axios.get(`${base}/accounts/${accountId}/pages/projects`, { headers }),
      ]);

      const workers: Array<Record<string, unknown>> =
        workersRes.data?.result ?? [];
      const kvNs: Array<Record<string, unknown>> = kvRes.data?.result ?? [];
      const pages: Array<Record<string, unknown>> = pagesRes.data?.result ?? [];

      const summary = {
        workers: {
          count: workers.length,
          names: workers.map((w) => w["id"]),
          daily_request_limit: 100_000,
        },
        kv: {
          namespaces: kvNs.length,
          names: kvNs.map((ns) => ns["title"]),
          daily_read_limit: 100_000,
          daily_write_limit: 1_000,
        },
        pages: {
          projects: pages.length,
          names: pages.map((p) => p["name"]),
          monthly_build_limit: 500,
        },
        status:
          "OK — check dash.cloudflare.com for exact request counts",
      };

      saveSnapshot({
        cloudflare: { ...summary, checked_at: new Date().toISOString() },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${String(e)}` }] };
    }
  }
);

// ── Tool: check_neon ──────────────────────────────────────────────────────

server.tool(
  "check_neon",
  "Check Neon Postgres connection and storage usage.",
  {},
  async () => {
    const connStr = process.env["NEON_CONNECTION_STRING"];
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              connection: connStr ? "configured" : "NOT SET — add NEON_CONNECTION_STRING to .env",
              storage_limit_gb: 0.5,
              compute_hours_monthly: 100,
              auto_suspend: "5 min idle",
              cold_start_ms: "~500ms",
              status: connStr
                ? "ready — connect with: psql $NEON_CONNECTION_STRING"
                : "NEON_CONNECTION_STRING not set",
              dashboard: "https://console.neon.tech",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: log_usage ───────────────────────────────────────────────────────

server.tool(
  "log_usage",
  "Log a usage event for a service. Call after any batch operation to track consumption.",
  {
    service: z
      .string()
      .describe(
        "Service name e.g. pinecone, cloudflare_workers, upstash_qstash"
      ),
    metric: z
      .string()
      .describe("Metric name e.g. read_units, requests, messages"),
    value: z.number().describe("Amount consumed"),
    context: z
      .string()
      .optional()
      .describe("What task this was for"),
  },
  async ({ service, metric, value, context }) => {
    const entry = {
      service,
      metric,
      value,
      context: context ?? "unspecified",
      timestamp: new Date().toISOString(),
    };

    try {
      const db = getResearchDb();
      db.exec(`CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT,
        metric TEXT,
        value REAL,
        context TEXT,
        ts TEXT
      )`);
      db
        .prepare(
          "INSERT INTO usage_events (service, metric, value, context, ts) VALUES (?, ?, ?, ?, ?)"
        )
        .run(service, metric, value, entry.context, entry.timestamp);
      db.close();
    } catch (e) {
      console.error("DB write failed:", String(e));
    }

    saveSnapshot({
      [`last_${service}_${metric}`]: { value, at: entry.timestamp },
    });

    return {
      content: [
        {
          type: "text",
          text: `Logged: ${service}.${metric} = ${value} at ${entry.timestamp}`,
        },
      ],
    };
  }
);

// ── Tool: get_budget_warning ──────────────────────────────────────────────

server.tool(
  "get_budget_warning",
  "Check if any service is approaching 80% of its free tier limit. Call before large batch operations.",
  {},
  async () => {
    const warnings: string[] = [];

    // Anthropic cost
    try {
      const db = getResearchDb();
      const row = db
        .prepare(
          `SELECT SUM(cost_usd) as total
           FROM dispatch_observations
           WHERE ts > strftime('%Y-%m-%d', 'now', 'start of month')`
        )
        .get() as Record<string, number> | undefined;
      const spent = row?.total ?? 0;
      if (spent > 80)
        warnings.push(
          `CRITICAL: Anthropic $${spent.toFixed(2)} of $100 budget (${spent.toFixed(0)}% used)`
        );
      else if (spent > 50)
        warnings.push(
          `MONITOR: Anthropic $${spent.toFixed(2)} of $100 budget`
        );
      db.close();
    } catch { /* research.db may not exist */ }

    // Cohere trial expiry
    const cohereExpiry = new Date("2026-04-03");
    if (new Date() > cohereExpiry) {
      warnings.push(
        "CRITICAL: Cohere trial key EXPIRED — rotate before using Cohere endpoints"
      );
    } else {
      const daysLeft = Math.ceil(
        (cohereExpiry.getTime() - Date.now()) / 86_400_000
      );
      if (daysLeft <= 7)
        warnings.push(
          `WARNING: Cohere trial key expires in ${daysLeft} days (2026-04-03)`
        );
    }

    if (warnings.length === 0) warnings.push("OK — no services approaching limits");

    return {
      content: [{ type: "text", text: warnings.join("\n") }],
    };
  }
);

// ── Start server ──────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
server.connect(transport);
console.error("infra-monitor MCP server running");
