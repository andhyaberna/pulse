export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname;

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'meta-ads-worker', time: new Date().toISOString() }, 200);
    }

    if (!isAllowedHost(host, env)) {
      return json({ ok: false, message: 'Host not allowed' }, 403);
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/') {
      return homePage(url, env);
    }

    if (request.method !== 'POST' || url.pathname !== '/run-report') {
      return json({ ok: false, message: 'Not found' }, 404);
    }

    try {
      const incomingKey = request.headers.get('x-api-key') || '';
      if (!env.WORKER_API_KEY || incomingKey !== env.WORKER_API_KEY) {
        return json({ ok: false, message: 'Unauthorized' }, 401);
      }

      const payload = await request.json();
      if (!payload.report_id) {
        return json({ ok: false, message: 'report_id is required' }, 400);
      }

      if (!env.GAS_WEB_APP_URL) {
        return json({ ok: false, message: 'Missing secret GAS_WEB_APP_URL' }, 500);
      }

      const gasResponse = await fetch(env.GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'run-report',
          report_id: payload.report_id,
          source: 'cloudflare_worker',
          api_key: env.GAS_API_KEY
        })
      });

      const text = await gasResponse.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }

      return json(
        {
          ok: gasResponse.ok,
          status_from_gas: gasResponse.status,
          gas_response: body,
          target_sheet_id: env.DB_TARGET_SHEET_ID || null
        },
        gasResponse.ok ? 200 : 502
      );
    } catch (err) {
      return json({ ok: false, message: err.message }, 500);
    }
  }
};

function isAllowedHost(host, env) {
  const allowed = String(env.ALLOWED_DOMAIN || 'pulse.cepat.top').toLowerCase();
  const current = String(host || '').toLowerCase();
  if (current === allowed) return true;
  if (current === 'localhost' || current === '127.0.0.1') return true;
  if (current.endsWith('.workers.dev')) return true;
  return false;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function homePage(url, env) {
  const allowedDomain = String(env.ALLOWED_DOMAIN || 'pulse.cepat.top');
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pulse Worker</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f1e8;
        --panel: #fffaf0;
        --ink: #1b1b18;
        --muted: #5c574d;
        --line: #d8cfbd;
        --accent: #1f6f5f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background: radial-gradient(circle at top, #fffdf7 0, var(--bg) 58%);
        color: var(--ink);
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 48px 20px 64px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 28px;
        box-shadow: 0 20px 60px rgba(32, 26, 14, 0.08);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 42px;
        line-height: 1.05;
      }
      p {
        margin: 0 0 16px;
        font-size: 18px;
        line-height: 1.6;
        color: var(--muted);
      }
      .grid {
        display: grid;
        gap: 14px;
        margin-top: 24px;
      }
      .item {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 16px 18px;
        background: #fff;
      }
      .label {
        display: block;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 8px;
      }
      code {
        font-family: Consolas, "Courier New", monospace;
        font-size: 14px;
        color: var(--ink);
        word-break: break-word;
      }
      a {
        color: var(--accent);
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>Pulse Worker is live</h1>
        <p>This domain is serving the Cloudflare Worker middleware for report execution.</p>
        <div class="grid">
          <div class="item">
            <span class="label">Allowed Domain</span>
            <code>${escapeHtml(allowedDomain)}</code>
          </div>
          <div class="item">
            <span class="label">Health Check</span>
            <a href="${escapeHtml(url.origin)}/health"><code>GET /health</code></a>
          </div>
          <div class="item">
            <span class="label">Run Report API</span>
            <code>POST /run-report</code>
          </div>
          <div class="item">
            <span class="label">Notes</span>
            <p>The Google Apps Script dashboard can be deployed separately. This root page is intentionally handled by the Worker.</p>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
