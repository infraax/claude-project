/**
 * orchestration/api-server.ts — lightweight HTTP server for dashboard data
 *
 * Runs locally (or via cloudflared tunnel) and serves JSON to the live dashboard.
 * Start with: npm run orchestrator
 * Port: DASHBOARD_PORT env var (default 3456)
 */

import http from 'http';
import { orchestrator } from './index.js';

const PORT = Number(process.env['DASHBOARD_PORT'] ?? 3456);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  try {
    if (url.pathname === '/health') {
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }));
      return;
    }

    if (url.pathname === '/api/services') {
      const services = await orchestrator.checkAllServices();
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ services, ts: new Date().toISOString() }));
      return;
    }

    if (url.pathname === '/api/metrics') {
      const metrics = await orchestrator.getPipelineMetrics();
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ metrics, ts: new Date().toISOString() }));
      return;
    }

    if (url.pathname === '/api/all') {
      const [services, metrics] = await Promise.all([
        orchestrator.checkAllServices(),
        orchestrator.getPipelineMetrics(),
      ]);
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ services, metrics, ts: new Date().toISOString() }));
      return;
    }

    res.writeHead(404, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'not found' }));
  } catch (err) {
    console.error('[orchestrator]', err);
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`[orchestrator] API server running on http://localhost:${PORT}`);
  console.log(`[orchestrator] Endpoints: /health  /api/services  /api/metrics  /api/all`);
});
