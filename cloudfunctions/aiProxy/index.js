const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const DEFAULT_CONFIG = {
  model: 'Pro/deepseek-ai/DeepSeek-V3.2',
  temperature: 0.45,
  max_tokens: 1800,
  baseURL: 'https://api.siliconflow.cn/v1/chat/completions',
  timeoutMs: 18000
};

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeConfig(rawConfig = {}) {
  return {
    model: rawConfig.model || DEFAULT_CONFIG.model,
    temperature: Math.min(1.5, Math.max(0, normalizeNumber(rawConfig.temperature, DEFAULT_CONFIG.temperature))),
    max_tokens: Math.max(256, Math.floor(normalizeNumber(rawConfig.max_tokens, DEFAULT_CONFIG.max_tokens))),
    baseURL: rawConfig.baseURL || DEFAULT_CONFIG.baseURL,
    timeoutMs: Math.max(3000, Math.floor(normalizeNumber(rawConfig.timeoutMs, DEFAULT_CONFIG.timeoutMs)))
  };
}

function requestJSON(url, payload, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const data = raw ? JSON.parse(raw) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
              return;
            }
            reject(new Error(`上游状态码 ${res.statusCode}: ${data.message || raw || '未知错误'}`));
          } catch (error) {
            reject(new Error(`上游响应解析失败: ${error.message}`));
          }
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('上游请求超时'));
    });

    req.on('error', (error) => reject(error));
    req.write(body);
    req.end();
  });
}

exports.main = async (event) => {
  try {
    const prompt = event && event.prompt;
    const config = sanitizeConfig((event && event.aiConfig) || {});

    if (!prompt || typeof prompt !== 'string') {
      return { ok: false, code: 'MISSING_PROMPT', message: '请求参数缺少 prompt' };
    }

    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return { ok: false, code: 'MISSING_API_KEY', message: '云函数未配置 SILICONFLOW_API_KEY' };
    }

    const payload = {
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      response_format: { type: 'json_object' }
    };

    const response = await requestJSON(
      config.baseURL,
      payload,
      { Authorization: `Bearer ${apiKey}` },
      config.timeoutMs
    );

    return { ok: true, data: response };
  } catch (error) {
    return {
      ok: false,
      code: 'UPSTREAM_REQUEST_FAILED',
      message: error.message || '云函数调用失败'
    };
  }
};
