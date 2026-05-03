export default async function handler(request) {
  return new Response(JSON.stringify({
    ok: true,
    runtime: 'probe',
    method: request?.method || 'unknown',
    ts: Date.now()
  }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
