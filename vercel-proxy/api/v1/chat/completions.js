export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  }

  try {
    const proxyToken = process.env.PROXY_TOKEN || '';
    const reqToken = req.headers['x-proxy-token'] || '';
    if (proxyToken && reqToken !== proxyToken) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, message: 'Missing SILICONFLOW_API_KEY' });
    }

    const body = req.body || {};
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
      return res.status(502).json({ ok: false, message: `Upstream JSON parse error: ${e.message}` });
    }

    return res.status(upstream.status).json(data);
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'Upstream timeout'
      : (error && error.message) || 'Unknown error';
    return res.status(500).json({ ok: false, message });
  }
}
