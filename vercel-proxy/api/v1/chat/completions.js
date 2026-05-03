export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.replace('Bearer ', '');
    // 兼容 Vercel 环境变量读取
    const proxyToken = process.env.PROXY_TOKEN || '20031118'; 

    // 简单探针模式: 如果 body 是 ping，直接返回 pong
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
    }

    if (body.model === 'probe' && body.messages?.[0]?.content === 'ping') {
       return new Response(JSON.stringify({ ok: true, runtime: 'vercel-edge', message: 'pong' }), {
         status: 200,
         headers: { 'content-type': 'application/json; charset=utf-8' }
       });
    }

    if (proxyToken && token !== proxyToken) {
      // 兼容旧的小程序请求头
      const xProxyToken = req.headers.get('x-proxy-token');
      if (xProxyToken !== proxyToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
    }

    const upstream = 'https://api.siliconflow.cn/v1/chat/completions';
    const siliconflowKey = process.env.SILICONFLOW_API_KEY || 'sk-ewvmxpqaoqdmzyrizltymazqkbbzhberrgdwhrinpssoauum';

    if (!siliconflowKey) {
      return new Response(JSON.stringify({ error: 'Missing SILICONFLOW_API_KEY' }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    // 为了防止 Vercel Edge 等待上游大模型生成时发生 504 Gateway Timeout，
    // 我们必须向下游小程序传递上游大模型的超时错误，而不是直接崩溃。
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 23000); // Vercel Edge 免费版硬限制是 25 秒，这里设为 23 秒保底

    const resp = await fetch(upstream, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${siliconflowKey}`
      },
      body: JSON.stringify(body),
      signal: abortController.signal
    });
    
    clearTimeout(timeoutId);

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.name === 'AbortError' ? 'Upstream generation timeout' : err.message }), {
      status: 504,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
}
