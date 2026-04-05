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
