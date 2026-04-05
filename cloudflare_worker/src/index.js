export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname;

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/health') {
      const payload = {
        ok: true,
        service: 'meta-pulse-worker',
        time: new Date().toISOString()
      };
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }
      return json(payload, 200);
    }

    if (!isAllowedHost(host, env)) {
      return json({ ok: false, message: 'Host not allowed' }, 403);
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/') {
      return homePage(url, env, request.method);
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

async function homePage(url, env, method) {
  const allowedDomain = String(env.ALLOWED_DOMAIN || 'pulse.cepat.top');
  const dashboardStatus = await probeDashboard(env.GAS_WEB_APP_URL || '');

  if (
    method === 'GET' &&
    dashboardStatus.ready &&
    url.searchParams.get('landing') !== '1'
  ) {
    return Response.redirect(dashboardStatus.url, 302);
  }

  const dashboardLink = dashboardStatus.url ? `
          <div class="item">
            <span class="label">Dashboard URL</span>
            <a href="${escapeHtml(dashboardStatus.url)}"><code>${escapeHtml(dashboardStatus.url)}</code></a>
          </div>` : '';

  const html = `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Meta Pulse - Bot Telegram Cerdas yang memantau performa iklan Meta (Facebook & Instagram) secara otomatis.">
    <meta name="theme-color" content="#102a43">
    <title>Meta Pulse - Bot Telegram Cerdas yang memantau performa iklan Meta (Facebook & Instagram) secara otomatis.</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f2eee4;
        --panel: rgba(255, 252, 246, 0.94);
        --ink: #17212f;
        --muted: #5b6574;
        --line: rgba(196, 182, 157, 0.72);
        --brand-deep: #102a43;
        --brand-mid: #1f5b7a;
        --brand-sky: #26a7de;
        --brand-mint: #37b7a5;
        --ok: #137b66;
        --warn: #b7791f;
        --shadow: 0 24px 64px rgba(16, 34, 55, 0.14);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", system-ui, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(38, 167, 222, 0.16), transparent 34%),
          radial-gradient(circle at top right, rgba(55, 183, 165, 0.14), transparent 30%),
          linear-gradient(180deg, #f7f3ea 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 32px 18px 56px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 28px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }
      .hero {
        overflow: hidden;
        position: relative;
        margin-bottom: 18px;
        background:
          linear-gradient(135deg, rgba(16, 42, 67, 0.98) 0%, rgba(21, 66, 99, 0.98) 50%, rgba(43, 124, 137, 0.96) 100%);
        color: #f4fbff;
      }
      .hero::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          radial-gradient(circle at 82% 24%, rgba(255, 255, 255, 0.18), transparent 20%),
          radial-gradient(circle at 78% 70%, rgba(55, 183, 165, 0.26), transparent 22%);
      }
      .hero-grid {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.9fr);
        gap: 22px;
        align-items: start;
      }
      .brand-lockup {
        display: flex;
        gap: 18px;
        align-items: flex-start;
      }
      .brand-mark {
        width: 78px;
        height: 78px;
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.18);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
      }
      .brand-svg {
        width: 48px;
        height: 48px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        padding: 7px 12px;
        border-radius: 999px;
        margin-bottom: 12px;
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.14);
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(240, 248, 255, 0.9);
      }
      h1, h2 {
        margin: 0;
        font-family: "Space Grotesk", "IBM Plex Sans", system-ui, sans-serif;
        letter-spacing: -0.03em;
      }
      h1 {
        font-size: clamp(2.5rem, 5vw, 4rem);
        line-height: 0.98;
        margin-bottom: 12px;
      }
      h2 {
        font-size: 1.45rem;
        line-height: 1.12;
        margin-bottom: 10px;
      }
      p {
        margin: 0 0 14px;
        font-size: 16px;
        line-height: 1.6;
        color: var(--muted);
      }
      .hero-copy {
        color: rgba(241, 248, 255, 0.92);
        max-width: 760px;
      }
      .hero-description {
        color: rgba(237, 246, 255, 0.82);
        max-width: 760px;
      }
      .hero-pills {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 18px;
      }
      .hero-pill {
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.14);
        font-size: 12px;
        color: rgba(243, 250, 255, 0.92);
      }
      .grid {
        display: grid;
        gap: 14px;
      }
      .hero-rail {
        display: grid;
        gap: 14px;
      }
      .item {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 16px 18px;
        background: rgba(255, 255, 255, 0.84);
      }
      .hero .item {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.12);
      }
      .label {
        display: block;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 8px;
      }
      .hero .label {
        color: rgba(239, 247, 255, 0.7);
      }
      code {
        font-family: Consolas, "Courier New", monospace;
        font-size: 14px;
        color: var(--ink);
        word-break: break-word;
      }
      .hero code {
        color: #f8fcff;
      }
      a {
        color: var(--brand-mid);
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
      .hero a {
        color: #d8f4ff;
      }
      .status-pill {
        display: inline-flex;
        align-items: center;
        padding: 7px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .status-pill.ok {
        background: rgba(55, 183, 165, 0.18);
        color: var(--ok);
      }
      .status-pill.warn {
        background: rgba(183, 121, 31, 0.14);
        color: var(--warn);
      }
      .actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 18px;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 10px 16px;
        border-radius: 999px;
        border: 1px solid var(--brand-deep);
        background: linear-gradient(180deg, var(--brand-mid), var(--brand-deep));
        color: #f8fcff;
        font-weight: 600;
        letter-spacing: 0.01em;
        text-decoration: none;
        box-shadow: 0 10px 24px rgba(16, 42, 67, 0.16);
      }
      .button.secondary {
        background: rgba(255, 255, 255, 0.94);
        color: var(--brand-deep);
        border-color: rgba(16, 42, 67, 0.15);
        box-shadow: none;
      }
      .muted {
        color: var(--muted);
      }
      .footer-note {
        margin-top: 18px;
        text-align: center;
        color: var(--muted);
        font-size: 12px;
      }
      @media (max-width: 920px) {
        .hero-grid,
        .grid {
          grid-template-columns: 1fr;
        }
        .brand-lockup {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card hero">
        <div class="hero-grid">
          <div class="item">
            <div class="brand-lockup">
              <div class="brand-mark" aria-hidden="true">
                <svg class="brand-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="2" width="60" height="60" rx="18" stroke="rgba(255,255,255,0.18)" />
                  <rect x="12" y="18" width="5" height="12" rx="2.5" fill="#26A7DE" fill-opacity="0.82" />
                  <rect x="21" y="14" width="5" height="16" rx="2.5" fill="#26A7DE" fill-opacity="0.94" />
                  <rect x="30" y="20" width="5" height="10" rx="2.5" fill="#26A7DE" fill-opacity="0.76" />
                  <path d="M10 41H19L25 30L33 45L40 33H53" stroke="#37B7A5" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" />
                  <circle cx="47" cy="18" r="6.5" fill="#7DD3FC" />
                </svg>
              </div>
              <div>
                <div class="eyebrow">Meta Ads Internal Analytics</div>
                <h1>Meta Pulse</h1>
                <p class="hero-copy">Meta Pulse - Bot Telegram Cerdas yang memantau performa iklan Meta (Facebook &amp; Instagram) secara otomatis.</p>
                <p class="hero-description">Domain ini berjalan di atas Cloudflare Worker sebagai gateway operasional. Jika dashboard Apps Script sudah valid, root domain akan diarahkan ke sana secara otomatis.</p>
                <div class="hero-pills">
                  <span class="hero-pill">Bot Telegram Cerdas</span>
                  <span class="hero-pill">Gateway Worker</span>
                  <span class="hero-pill">Dashboard Analitik Internal</span>
                </div>
              </div>
            </div>
          </div>
          <div class="hero-rail">
            <div class="item">
              <span class="label">Allowed Domain</span>
              <code>${escapeHtml(allowedDomain)}</code>
            </div>
            <div class="item">
              <span class="label">Dashboard Status</span>
              <div class="status-pill ${dashboardStatus.ready ? 'ok' : 'warn'}">${escapeHtml(dashboardStatus.label)}</div>
              <p class="hero-description" style="margin-top:10px;">${escapeHtml(dashboardStatus.detail)}</p>
            </div>
            <div class="item">
              <span class="label">Health Check</span>
              <a href="${escapeHtml(url.origin)}/health"><code>GET /health</code></a>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Operasional Domain</h2>
        <p class="muted">Halaman ini bukan lagi landing demo generik. Ini adalah fallback operasional Meta Pulse untuk domain custom <code>pulse.cepat.top</code> selama dashboard Web App belum tervalidasi.</p>
        <div class="grid">
          <div class="item">
            <span class="label">API Report</span>
            <code>POST /run-report</code>
          </div>
          <div class="item">
            <span class="label">Custom Domain</span>
            <code>${escapeHtml(url.origin)}</code>
          </div>
          ${dashboardLink}
        </div>
        <div class="actions">
          ${dashboardStatus.url ? `<a class="button" href="${escapeHtml(dashboardStatus.url)}">Buka Dashboard</a>` : ''}
          <a class="button secondary" href="${escapeHtml(url.origin)}/health">Cek Health</a>
          <a class="button secondary" href="${escapeHtml(url.origin)}/?landing=1">Lihat Landing</a>
        </div>
      </section>
      <div class="footer-note">Meta Pulse digunakan sebagai workspace internal untuk monitoring performa iklan Meta dan orkestrasi report berbasis Telegram.</div>
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

async function probeDashboard(inputUrl) {
  const url = String(inputUrl || '').trim();
  if (!url) {
    return {
      ready: false,
      url: '',
      label: 'Belum dikonfigurasi',
      detail: 'Secret GAS_WEB_APP_URL belum di-set di Worker.'
    };
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml'
      }
    });
    const body = await response.text();
    const normalized = body.toLowerCase();
    const hasBrand = normalized.includes('meta pulse');
    const hasMissingDoGet =
      normalized.includes('fungsi skrip tidak ditemukan: doget') ||
      normalized.includes('script function not found: doget');
    const hasMissingPage =
      normalized.includes('halaman tidak ditemukan') ||
      normalized.includes('saat ini tidak dapat membuka file');

    if (response.ok && hasBrand && !hasMissingDoGet && !hasMissingPage) {
      return {
        ready: true,
        url,
        label: 'Dashboard siap',
        detail: 'Dashboard Apps Script terdeteksi valid dan bisa dibuka dari domain ini.'
      };
    }

    let detail = 'URL dashboard tersimpan, tetapi Web App belum mengembalikan halaman Meta Pulse yang valid.';
    if (hasMissingDoGet) {
      detail = 'URL dashboard aktif masih membalas error doGet, jadi deploy Web App Apps Script belum benar.';
    } else if (hasMissingPage) {
      detail = 'URL dashboard yang tersimpan tidak ditemukan atau deployment Web App-nya belum tersedia.';
    } else if (!response.ok) {
      detail = `URL dashboard membalas status ${response.status}.`;
    }

    return {
      ready: false,
      url,
      label: 'Dashboard belum aktif',
      detail
    };
  } catch (error) {
    return {
      ready: false,
      url,
      label: 'Dashboard belum terjangkau',
      detail: error.message
    };
  }
}
