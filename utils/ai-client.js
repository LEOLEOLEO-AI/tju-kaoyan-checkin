const { getAIConfig } = require('./ai-config');

const AI_CACHE_STORAGE_KEY = 'aiReviewCacheV1';

function hashString(input = '') {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

function getCacheEntry(key, ttl) {
  const cacheMap = wx.getStorageSync(AI_CACHE_STORAGE_KEY) || {};
  const entry = cacheMap[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) return null;
  return entry.value;
}

function setCacheEntry(key, value) {
  const cacheMap = wx.getStorageSync(AI_CACHE_STORAGE_KEY) || {};
  cacheMap[key] = {
    timestamp: Date.now(),
    value
  };
  wx.setStorageSync(AI_CACHE_STORAGE_KEY, cacheMap);
}

function callAIDirectly({ prompt, aiConfig, requestOptions = {}, modelOverride = '', endpointOverride = '' }) {
  const useProxy = Boolean(aiConfig.useProxy) || !/api\.siliconflow\.cn/i.test(String(aiConfig.baseURL || ''));
  if (!useProxy && !aiConfig.apiKey) {
    const error = new Error('未配置前端API Key');
    error.userMessage = '请先配置 AI API Key';
    throw error;
  }

  const headers = {
    'Content-Type': 'application/json'
  };
  if (useProxy) {
    if (aiConfig.proxyAuthToken) {
      headers['x-proxy-token'] = aiConfig.proxyAuthToken;
    }
  } else {
    headers.Authorization = `Bearer ${aiConfig.apiKey}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: endpointOverride || aiConfig.baseURL,
      method: 'POST',
      timeout: aiConfig.timeoutMs,
      header: headers,
      data: {
        model: modelOverride || aiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: aiConfig.temperature,
        max_tokens: requestOptions.maxTokens || aiConfig.max_tokens,
        response_format: { type: 'json_object' }
      },
      success: (res) => resolve(res),
      fail: (err) => {
        const error = new Error((err && err.errMsg) || '网络请求失败');
        error.userMessage = `网络请求失败：${(err && err.errMsg) || '未知错误'}。请检查 request 合法域名、代理地址与网络。`;
        reject(error);
      }
    });
  });
}

function extractTextFromResponse(response) {
  if (!response || response.statusCode !== 200) {
    const statusCode = response ? response.statusCode : 'unknown';
    const providerMessage = response && response.data && (response.data.message || response.data.error);
    const error = new Error(`请求失败(${statusCode}): ${providerMessage || '未知错误'}`);
    error.userMessage = `AI请求失败(${statusCode})，请检查 API Key/模型名/额度。`;
    throw error;
  }

  const content =
    response.data &&
    response.data.choices &&
    response.data.choices[0] &&
    response.data.choices[0].message &&
    response.data.choices[0].message.content;

  if (!content) {
    const error = new Error('AI返回为空');
    error.userMessage = 'AI返回内容为空，请重试';
    throw error;
  }
  return content;
}

function parseModelJson(text) {
  let cleanText = String(text || '').trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(cleanText);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.quiz)) {
    throw new Error('JSON结构不符合预期');
  }
  if (typeof parsed.evaluation !== 'string') {
    throw new Error('evaluation字段缺失');
  }
  return parsed;
}

async function requestAIReviewWithCache({ weekKey, logSummary, prompt, fallbackPrompt = '', requestOptions = {} }) {
  const aiConfig = getAIConfig();
  const modelCandidates = Array.isArray(requestOptions.modelCandidates) && requestOptions.modelCandidates.length
    ? requestOptions.modelCandidates
    : aiConfig.modelCandidates;
  const endpointCandidates = Array.isArray(requestOptions.proxyBaseURLs) && requestOptions.proxyBaseURLs.length
    ? requestOptions.proxyBaseURLs
    : (aiConfig.useProxy ? aiConfig.proxyBaseURLs : [aiConfig.baseURL]);
  const startedAt = Date.now();
  const maxTotalMs = Math.max(6000, Number(requestOptions.maxTotalMs || 18000));
  const cacheKey = `${weekKey}:${hashString(`${prompt}|${logSummary}|${modelCandidates.join('|')}|${endpointCandidates.join('|')}`)}`;

  const cached = getCacheEntry(cacheKey, aiConfig.cacheTTL);
  if (cached) {
    return { parsedResult: cached, fromCache: true };
  }

  let lastError = null;
  for (let e = 0; e < endpointCandidates.length; e += 1) {
    const endpoint = endpointCandidates[e];
    for (let m = 0; m < modelCandidates.length; m += 1) {
      if (Date.now() - startedAt > maxTotalMs) {
        const timeoutError = new Error(`请求总时长超限（>${maxTotalMs}ms）`);
        timeoutError.userMessage = 'AI请求耗时过长，已切换快速建议';
        lastError = timeoutError;
        break;
      }
      const modelName = modelCandidates[m];
      try {
        const response = await callAIDirectly({
          prompt,
          aiConfig,
          requestOptions,
          modelOverride: modelName,
          endpointOverride: endpoint
        });
        const rawText = extractTextFromResponse(response);
        const parsedResult = parseModelJson(rawText);
        setCacheEntry(cacheKey, parsedResult);
        return { parsedResult, fromCache: false, usedModel: modelName };
      } catch (error) {
        lastError = error;
      }
    }
  }

  // 快速降级：用更短提示词+更少token再试一次，优先保障可用性
  if (fallbackPrompt) {
    try {
      const fallbackOptions = {
        ...requestOptions,
        maxTokens: Math.max(480, Math.floor((requestOptions.maxTokens || aiConfig.max_tokens) * 0.65))
      };
      for (let e = 0; e < endpointCandidates.length; e += 1) {
        const endpoint = endpointCandidates[e];
        for (let m = 0; m < modelCandidates.length; m += 1) {
          if (Date.now() - startedAt > maxTotalMs) {
            const timeoutError = new Error(`降级请求总时长超限（>${maxTotalMs}ms）`);
            timeoutError.userMessage = 'AI请求耗时过长，已切换快速建议';
            lastError = timeoutError;
            break;
          }
          const modelName = modelCandidates[m];
          try {
            const response = await callAIDirectly({
              prompt: fallbackPrompt,
              aiConfig,
              requestOptions: fallbackOptions,
              modelOverride: modelName,
              endpointOverride: endpoint
            });
            const rawText = extractTextFromResponse(response);
            const parsedResult = parseModelJson(rawText);
            setCacheEntry(cacheKey, parsedResult);
            return { parsedResult, fromCache: false, fromFallback: true, usedModel: modelName };
          } catch (error) {
            lastError = error;
          }
        }
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('AI请求失败');
}

module.exports = {
  requestAIReviewWithCache
};
