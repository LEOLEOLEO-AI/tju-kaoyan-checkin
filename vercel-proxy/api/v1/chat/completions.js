const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

function createResponder(req, res) {
  const isNodeRes = !!(res && typeof res.status === 'function' && typeof res.json === 'function');
  return {
    isNodeRes,
    method: (req && req.method) || 'GET',
    getHeader: (name) => {
      if (!req || !req.headers) return '';
      if (typeof req.headers.get === 'function') {
        return req.headers.get(name) || '';
      }
      return req.headers[name.toLowerCase()] || req.headers[name] || '';
    },
    sendJson: (status, data) => {
      if (isNodeRes) {
        return res.status(status).json(data);
      }
      return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
    }
  };
}

async function readBody(req, isNodeRes) {
  if (isNodeRes) {
    let body = req.body || {};
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    return body;
  }
  const text = await req.text();
  if (!text) return {};
  return JSON.parse(text);
}

export default async function handler(req, res) {
  const io = createResponder(req, res);

  if (io.method !== 'POST') {
    return io.sendJson(405, { ok: false, message: 'Method Not Allowed' });
  }

  try {
    const proxyToken = process.env.PROXY_TOKEN || '';
    const reqToken = io.getHeader('x-proxy-token');
    if (proxyToken && reqToken !== proxyToken) {
      return io.sendJson(401, { ok: false, message: 'Unauthorized' });
    }

    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return io.sendJson(500, { ok: false, message: 'Missing SILICONFLOW_API_KEY' });
    }

    let body;
    try {
      body = await readBody(req, io.isNodeRes);
    } catch (e) {
      return io.sendJson(400, { ok: false, message: `Invalid JSON body: ${e.message}` });
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
      return io.sendJson(502, { ok: false, message: `Upstream JSON parse error: ${e.message}` });
    }

    return io.sendJson(upstream.status, data);
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'Upstream timeout'
      : (error && error.message) || 'Unknown error';
    return io.sendJson(500, {
      ok: false,
      message,
      runtime: 'vercel-node'
    });
  }
}
