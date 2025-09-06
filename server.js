// Minimal Node HTTP server (no external packages)
// Endpoints:
// - POST /intake  -> accepts JSON form data and enqueues to Upstash list (FIFO)
// - POST /api/worker/run -> manually trigger worker to process queue now
// - GET /healthz -> liveness

const http = require('http');
const { URL } = require('url');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');
const { enqueueJob, queueLength } = require('./src/lib/queue');
const { getSettings, saveSettings } = require('./src/lib/settings');
const { buildEmail } = require('./src/lib/template');
const { logEvent, fetchLogs } = require('./src/lib/logger');
const { fetchOutbox } = require('./src/lib/outbox');
const { lrange, lrem, setJson, getJson } = require('./src/lib/upstash');
const { setAuthCookie, clearAuthCookie, isAuthed, checkPassword } = require('./src/lib/auth');
const { runOnce } = require('./worker');

const PORT = process.env.PORT || 8080;
const LAST_RUN_KEY = 'air:lastRun';

function readBody(req) {
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
      const ctype = (req.headers['content-type'] || '').split(';')[0].trim();
      const out = { raw: data, type: ctype, body: null };
      try {
        if (!data) {
          out.body = {};
        } else if (ctype === 'application/json') {
          out.body = JSON.parse(data);
        } else if (ctype === 'application/x-www-form-urlencoded') {
          out.body = querystring.parse(data);
        } else {
          // Fallback: try JSON first, else ignore
          try { out.body = JSON.parse(data); }
          catch { out.body = { _raw: data }; }
        }
        resolve(out);
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
    // Request start log
    await logEvent('http.request', { method: req.method, path: url.pathname });
    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === 'POST' && url.pathname === '/intake') {
      const parsed = await readBody(req);
      const payload = parsed.body || {};
      // minimal validation
      const now = Date.now();
      const job = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        receivedAt: now,
        form: payload || {},
      };
      await logEvent('intake.received', { id: job.id, ctype: parsed.type, from: job.form?.email || null, subject: job.form?.subject || null });
      await enqueueJob(job);
      await logEvent('queue.enqueued', { id: job.id });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ queued: true, id: job.id }));
    }

    // Authentication endpoints
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const { body } = await readBody(req);
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
      const { body } = await readBody(req);
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

    // List queued items (peek; newest at end since we RPUSH)
    if (req.method === 'GET' && url.pathname === '/api/queue/items') {
      const out = await lrange(require('./src/lib/queue').QUEUE_KEY, 0, -1);
      const arr = out?.result || [];
      const items = arr.map((raw) => {
        try {
          const j = JSON.parse(raw);
          return {
            id: j.id,
            receivedAt: j.receivedAt,
            email: j.form?.email || null,
            subject: j.form?.subject || '',
            name: j.form?.name || j.form?.fullName || '',
          };
        } catch { return null; }
      }).filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ items }));
    }

    // Respond to a single queued item by id (remove from queue and process)
    if (req.method === 'POST' && url.pathname === '/api/queue/respond') {
      const { body } = await readBody(req);
      const id = body?.id;
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'id required' }));
      }
      const listOut = await lrange(require('./src/lib/queue').QUEUE_KEY, 0, -1);
      const arr = listOut?.result || [];
      let raw = null;
      for (const r of arr) {
        try { const j = JSON.parse(r); if (j && j.id === id) { raw = r; break; } } catch {}
      }
      if (!raw) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'not_found' }));
      }
      // Remove the found job
      await lrem(require('./src/lib/queue').QUEUE_KEY, 1, raw);
      let job;
      try { job = JSON.parse(raw); } catch { job = null; }
      if (!job) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'bad_job' }));
      }
      // Process using the same pipeline as worker
      const settings = await getSettings();
      const mail = await require('./src/lib/template').buildEmail({ settings, job });
      await require('./src/lib/resend').sendEmail({
        to: mail.toEmail, subject: mail.subject, html: mail.html, text: mail.text, from: settings.fromEmail || process.env.RESEND_FROM,
      });
      await logEvent('queue.respond.single', { id });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    // Tester: returns preview built from settings + provided form (no send)
    if (req.method === 'POST' && url.pathname === '/api/tester') {
      const { body } = await readBody(req);
      const settings = await getSettings();
      const preview = await buildEmail({ settings, job: { form: body || {} } });
      await logEvent('tester.preview', { to: preview.toEmail, subject: preview.subject });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(preview));
    }

    if (req.method === 'POST' && url.pathname === '/api/worker/run') {
      const settings = await getSettings();
      const minSec = Number(settings.workerMinIntervalSec || 0);
      if (minSec > 0) {
        const last = await getJson(LAST_RUN_KEY);
        const now = Date.now();
        if (last && now - Number(last.ts || 0) < minSec * 1000) {
          const remaining = Math.max(0, Math.ceil((minSec * 1000 - (now - Number(last.ts || 0))) / 1000));
          await logEvent('worker.run.skipped_throttle', { remaining });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ processed: 0, skipped: 'throttle', remainingSeconds: remaining }));
        }
      }
      await logEvent('worker.run.request', {});
      const result = await runOnce();
      await setJson(LAST_RUN_KEY, { ts: Date.now() });
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

    // Outbox (paginated)
    if (req.method === 'GET' && url.pathname === '/api/outbox') {
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20)));
      const { items, totalApprox } = await fetchOutbox(offset, limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ items, offset, limit, totalApprox }));
    }

    // Admin UI static files (gate: redirect to login if not authed)
    if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname.startsWith('/admin/'))) {
      // Allow the login stylesheet without auth so the page isn't unstyled
      if (!isAuthed(req) && url.pathname === '/admin/styles.css') {
        return serveStatic(req, res, path.join(__dirname, 'public', 'admin'), '/styles.css');
      }
      if (!isAuthed(req) && url.pathname !== '/admin/login') {
        // Serve login page
        return serveStatic(req, res, path.join(__dirname, 'public', 'admin'), '/login.html');
      }
      let rel = '/index.html';
      if (url.pathname === '/admin/login') {
        rel = '/login.html';
      } else if (url.pathname !== '/admin') {
        rel = url.pathname.replace('/admin', '');
      }
      return serveStatic(req, res, path.join(__dirname, 'public', 'admin'), rel);
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error('Error:', err);
    try { await logEvent('http.error', { message: String(err && err.message || err) }); } catch {}
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
});

server.listen(PORT, () => {
  console.log(`[aiResponder] listening on port ${PORT}`);
});
