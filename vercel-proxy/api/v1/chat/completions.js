module.exports = async function handler(req, res) {
  const payload = JSON.stringify({
    ok: true,
    runtime: 'probe-cjs',
    method: req && req.method ? req.method : 'unknown',
    ts: Date.now()
  });

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(payload);
};
