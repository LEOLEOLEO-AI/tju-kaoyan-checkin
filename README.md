# 天大考研打卡（微信小程序）

本项目是天津大学精仪方向考研打卡与 AI 辅导小程序，支持：

- 打卡记录（`logs`）
- 周报与测试题（`reviews`）
- AI 三模式分析（当日 / 当周 / 整体）
- AI 波动时本地兜底建议，保证可用性

## 目录说明

- `pages/`：小程序页面
- `utils/`：AI 配置、客户端、Prompt
- `vercel-proxy/`：Vercel 免费代理（推荐）
- `worker-proxy/`：Cloudflare Worker 代理（备用）

## 推荐部署方式（仅 Vercel）

### 1) 部署后端代理

1. 将本仓库导入 Vercel。
2. Project Root 选择 `vercel-proxy`。
3. 在 Vercel Project -> Settings -> Environment Variables 配置：
   - `SILICONFLOW_API_KEY`（必填）
   - `PROXY_TOKEN`（建议，示例：`20031118`）
4. 点击 Deploy，拿到域名：`https://<your-app>.vercel.app`

### 2) 配置小程序 AI 地址

修改 `utils/ai-config.js` 默认值：

- `useProxy: true`
- `baseURL: 'https://<your-app>.vercel.app/v1/chat/completions'`
- `proxyBaseURLs: ['https://<your-app>.vercel.app/v1/chat/completions']`
- `proxyAuthToken: '与你的 PROXY_TOKEN 一致'`
- `apiKey: ''`（前端不放硅基 Key）

### 3) 微信后台配置合法域名

在小程序后台（mp.weixin.qq.com）添加 `request` 合法域名：

- `https://<your-app>.vercel.app`

注意：不能带路径，不能填 IP。

### 4) 清缓存并重编译

开发者工具里清缓存并重新编译，或删除本地配置缓存：

- `wx.removeStorageSync('aiConfig')`

## 常见问题排查

- 提示 `域名未加入白名单`：未配置 request 合法域名。
- 提示 `代理鉴权失败(401)`：`proxyAuthToken` 与 Vercel 的 `PROXY_TOKEN` 不一致。
- 长时间无结果：检查 Vercel 函数日志，或确认网络是否可达 `vercel.app`。
- 出现 `SourceMap` 报错：开发者工具提示，可忽略，不影响业务。

## 安全建议

- 不要把 `SILICONFLOW_API_KEY` 放在小程序前端。
- 使用代理后端存放 API Key。
- 定期轮换 `PROXY_TOKEN` 与 `SILICONFLOW_API_KEY`。
