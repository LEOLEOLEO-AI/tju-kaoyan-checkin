const AI_CONFIG_STORAGE_KEY = 'aiConfig';

const DEFAULT_AI_CONFIG = {
  model: 'Pro/deepseek-ai/DeepSeek-V3.2',
  modelCandidates: [
    'Pro/deepseek-ai/DeepSeek-V3.2',
    'Qwen/Qwen2.5-72B-Instruct',
    'deepseek-ai/DeepSeek-V3',
    'Qwen/Qwen2.5-32B-Instruct'
  ],
  temperature: 0.45,
  max_tokens: 1200,
  apiKey: '',
  useProxy: false,
  proxyAuthToken: '',
  baseURL: 'https://api.siliconflow.cn/v1/chat/completions',
  proxyBaseURLs: [
    'https://api.siliconflow.cn/v1/chat/completions',
    'https://tju-kaoyan-checkin.vercel.app/v1/chat/completions'
  ],
  timeoutMs: 45000,
  retryCount: 0,
  cacheTTL: 15 * 60 * 1000
};

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeConfig(rawConfig = {}) {
  const rawCandidates = Array.isArray(rawConfig.modelCandidates) ? rawConfig.modelCandidates : [];
  const rawProxyURLs = Array.isArray(rawConfig.proxyBaseURLs) ? rawConfig.proxyBaseURLs : [];
  const mergedCandidates = [rawConfig.model || DEFAULT_AI_CONFIG.model, ...rawCandidates, ...DEFAULT_AI_CONFIG.modelCandidates]
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter((item, index, arr) => arr.indexOf(item) === index);
  const mergedProxyURLs = [rawConfig.baseURL || DEFAULT_AI_CONFIG.baseURL, ...rawProxyURLs, ...DEFAULT_AI_CONFIG.proxyBaseURLs]
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter((item, index, arr) => arr.indexOf(item) === index);
  return {
    model: rawConfig.model || DEFAULT_AI_CONFIG.model,
    modelCandidates: mergedCandidates,
    proxyBaseURLs: mergedProxyURLs,
    temperature: Math.min(1.5, Math.max(0, normalizeNumber(rawConfig.temperature, DEFAULT_AI_CONFIG.temperature))),
    max_tokens: Math.max(256, Math.floor(normalizeNumber(rawConfig.max_tokens, DEFAULT_AI_CONFIG.max_tokens))),
    apiKey: String(rawConfig.apiKey || DEFAULT_AI_CONFIG.apiKey).trim(),
    useProxy: rawConfig.useProxy !== undefined ? Boolean(rawConfig.useProxy) : DEFAULT_AI_CONFIG.useProxy,
    proxyAuthToken: String(rawConfig.proxyAuthToken || DEFAULT_AI_CONFIG.proxyAuthToken).trim(),
    baseURL: mergedProxyURLs[0] || DEFAULT_AI_CONFIG.baseURL,
    timeoutMs: Math.max(3000, Math.floor(normalizeNumber(rawConfig.timeoutMs, DEFAULT_AI_CONFIG.timeoutMs))),
    retryCount: Math.max(0, Math.min(2, Math.floor(normalizeNumber(rawConfig.retryCount, DEFAULT_AI_CONFIG.retryCount)))),
    cacheTTL: Math.max(60 * 1000, Math.floor(normalizeNumber(rawConfig.cacheTTL, DEFAULT_AI_CONFIG.cacheTTL)))
  };
}

function getAIConfig() {
  const userConfig = wx.getStorageSync(AI_CONFIG_STORAGE_KEY) || {};
  const merged = { ...DEFAULT_AI_CONFIG, ...userConfig };
  // 新版架构：优先使用云函数下发 Key + 硅基直连，不再强制重写为 proxy
  if (/workers\.dev/i.test(String(merged.baseURL || ''))) {
    merged.baseURL = DEFAULT_AI_CONFIG.baseURL;
    merged.proxyBaseURLs = DEFAULT_AI_CONFIG.proxyBaseURLs.slice();
  }
  return sanitizeConfig(merged);
}

function setAIConfig(partialConfig = {}) {
  const current = getAIConfig();
  const next = sanitizeConfig({ ...current, ...partialConfig });
  wx.setStorageSync(AI_CONFIG_STORAGE_KEY, next);
  return next;
}

module.exports = {
  AI_CONFIG_STORAGE_KEY,
  DEFAULT_AI_CONFIG,
  getAIConfig,
  setAIConfig
};
