const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

function sendJson(status, data) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

export default async function handler(request) {
  if (!request || request.method !== 'POST') {
    return sendJson(405, { ok: false, message: 'Method Not Allowed' });
  }

  try {
    const proxyToken = process.env.PROXY_TOKEN || '';
    const reqToken = request.headers.get('x-proxy-token') || '';
    if (proxyToken && reqToken !== proxyToken) {
      return sendJson(401, { ok: false, message: 'Unauthorized' });
    }

    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return sendJson(500, { ok: false, message: 'Missing SILICONFLOW_API_KEY' });
    }

    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return sendJson(400, { ok: false, message: `Invalid JSON body: ${e.message}` });
    }

    const payload = {
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      response_format: body.response_format
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    let upstream;
    try {
      upstream = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await upstream.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      return sendJson(502, { ok: false, message: `Upstream JSON parse error: ${e.message}` });
    }

    return sendJson(upstream.status, data);
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'Upstream timeout'
      : (error && error.message) || 'Unknown error';
    return sendJson(500, { ok: false, message, runtime: 'vercel-web' });
  }
}
