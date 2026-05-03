function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
        return json({ ok: false, message: 'Not Found' }, 404);
      }

      if (!env.SILICONFLOW_API_KEY) {
        return json({ ok: false, message: 'Missing SILICONFLOW_API_KEY' }, 500);
      }

      if (env.PROXY_TOKEN) {
        const token = request.headers.get('x-proxy-token');
        if (!token || token !== env.PROXY_TOKEN) {
          return json({ ok: false, message: 'Unauthorized' }, 401);
        }
      }

      const body = await request.json();
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
        upstream = await fetch(env.PROVIDER_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${env.SILICONFLOW_API_KEY}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      const text = await upstream.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        return json({ ok: false, message: `Upstream JSON parse error: ${e.message}` }, 502);
      }

      return new Response(JSON.stringify(data), {
        status: upstream.status,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    } catch (error) {
      const message = error && error.name === 'AbortError'
        ? 'Upstream timeout'
        : (error && error.message) || 'Unknown error';
      return json({ ok: false, message }, 500);
    }
  }
};
