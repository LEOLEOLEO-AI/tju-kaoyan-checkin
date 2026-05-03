module.exports = async function handler(req, res) {
  res.status(200).setHeader('content-type', 'application/json; charset=utf-8').send(JSON.stringify({
    ok: true,
    runtime: 'probe-cjs',
    method: req && req.method ? req.method : 'unknown',
    ts: Date.now()
  }));
};
