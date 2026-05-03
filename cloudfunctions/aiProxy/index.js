const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  // 最佳实践：云函数只负责下发配置和 Key，不负责转发长耗时的 LLM 请求
  // 完美避开免费版云函数 3 秒超时限制，同时避免前端源码明文硬编码 Key 导致泄露
  const apiKey = process.env.SILICONFLOW_API_KEY || '';
  
  return {
    ok: true,
    data: {
      apiKey: apiKey,
      baseURL: 'https://api.siliconflow.cn/v1/chat/completions'
    }
  };
};
