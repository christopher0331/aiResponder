// Minimal Node HTTP server (no external packages)
// Endpoints:
// - POST /intake  -> accepts JSON form data and enqueues to Upstash list (FIFO)
// - POST /api/worker/run -> manually trigger worker to process queue now
// - GET /healthz -> liveness

const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { enqueueJob, queueLength } = require('./src/lib/queue');
const { getSettings, saveSettings } = require('./src/lib/settings');
const { buildEmail } = require('./src/lib/template');
const { logEvent, fetchLogs } = require('./src/lib/logger');
const { setAuthCookie, clearAuthCookie, isAuthed, checkPassword } = require('./src/lib/auth');
const { runOnce } = require('./worker');

const PORT = process.env.PORT || 8080;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) { // 1MB guard
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        const json = data ? JSON.parse(data) : {};
        resolve(json);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, baseDir, urlPath) {
  const filePath = path.join(baseDir, urlPath === '/' ? '/index.html' : urlPath);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(resolved).toLowerCase();
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // Basic CORS for browser-based form posts if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === 'POST' && url.pathname === '/intake') {
      const payload = await readJsonBody(req);
      // minimal validation
      const now = Date.now();
      const job = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        receivedAt: now,
        form: payload || {},
      };
      await logEvent('intake.received', { id: job.id, from: job.form?.email || null, subject: job.form?.subject || null });
      await enqueueJob(job);
      await logEvent('queue.enqueued', { id: job.id });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ queued: true, id: job.id }));
    }

    // Authentication endpoints
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await readJsonBody(req);
      const pass = (body && body.password) || '';
      if (checkPassword(pass)) {
        setAuthCookie(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid credentials' }));
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      clearAuthCookie(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === 'GET' && url.pathname === '/api/me') {
      const authed = isAuthed(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ authed }));
    }

    // Protect API routes (except public ones)
    const isApi = url.pathname.startsWith('/api/');
    const publicApi = ['/api/login', '/api/me'].includes(url.pathname);
    if (isApi && !publicApi && !isAuthed(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    // Settings API
    if (req.method === 'GET' && url.pathname === '/api/settings') {
      const s = await getSettings();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(s));
    }
    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const body = await readJsonBody(req);
      const s = await saveSettings(body || {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(s));
    }

    // Queue info
    if (req.method === 'GET' && url.pathname === '/api/queue') {
      const length = await queueLength();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ length }));
    }

    // Tester: returns preview built from settings + provided form (no send)
    if (req.method === 'POST' && url.pathname === '/api/tester') {
      const body = await readJsonBody(req);
      const settings = await getSettings();
      const preview = buildEmail({ settings, job: { form: body || {} } });
      await logEvent('tester.preview', { to: preview.toEmail, subject: preview.subject });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(preview));
    }

    if (req.method === 'POST' && url.pathname === '/api/worker/run') {
      await logEvent('worker.run.request', {});
      const result = await runOnce();
      await logEvent('worker.run.result', result);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    // Logs API (auth required)
    if (req.method === 'GET' && url.pathname === '/api/logs') {
      const limit = Number(url.searchParams.get('limit') || 200);
      const logs = await fetchLogs(limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ logs }));
    }

    // Admin UI static files (gate: redirect to login if not authed)
    if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname.startsWith('/admin/'))) {
      if (!isAuthed(req) && url.pathname !== '/admin/login') {
        // Serve login page
        return serveStatic(req, res, path.join(__dirname, 'public', 'admin'), '/login.html');
      }
      const rel = url.pathname === '/admin' ? '/index.html' : url.pathname.replace('/admin', '');
      return serveStatic(req, res, path.join(__dirname, 'public', 'admin'), rel);
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error('Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
});

server.listen(PORT, () => {
  console.log(`[aiResponder] listening on port ${PORT}`);
});
