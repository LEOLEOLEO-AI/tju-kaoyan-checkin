# 部署检查清单（Vercel 单后端）

## A. Vercel 代理部署

- [ ] 已在 Vercel 导入仓库并设置 `Root Directory = vercel-proxy`
- [ ] 已配置环境变量 `SILICONFLOW_API_KEY`
- [ ] 已配置环境变量 `PROXY_TOKEN`（建议，示例：`20031118`）
- [ ] 已点击 Deploy 并成功发布
- [ ] 已获得可访问地址：`https://<your-app>.vercel.app`
- [ ] 访问 `https://<your-app>.vercel.app/v1/chat/completions`（GET）返回 405/Not Allowed（说明路由生效）

## B. 小程序代码配置

- [ ] `utils/ai-config.js` 中 `useProxy = true`
- [ ] `baseURL = https://<your-app>.vercel.app/v1/chat/completions`
- [ ] `proxyBaseURLs = ['https://<your-app>.vercel.app/v1/chat/completions']`
- [ ] `proxyAuthToken` 与 Vercel 的 `PROXY_TOKEN` 一致
- [ ] `apiKey = ''`（前端不放硅基 Key）

## C. 微信后台配置

- [ ] 小程序后台已添加 `request 合法域名`：`https://<your-app>.vercel.app`
- [ ] 域名仅填写主域名，不带路径
- [ ] 管理员扫码确认已完成

## D. 本地缓存与编译

- [ ] 开发者工具已“清缓存并重新编译”
- [ ] 或已执行 `wx.removeStorageSync('aiConfig')`
- [ ] 页面重新进入后读取到新配置

## E. 端到端联调

- [ ] 当日分析可生成（优先看到 `AI生成/快速模式/缓存命中` 标签）
- [ ] 当周分析可生成且结果写入 `reviews`
- [ ] 整体分析可在上限时长内返回（超时也能本地兜底）
- [ ] 题目数量固定 4 道，四门课各 1 题
- [ ] 难度规则正确（9 月前中级，9 月起高级）

## F. 故障快速定位

- [ ] 提示 `代理鉴权失败(401)`：检查 `proxyAuthToken` 与 `PROXY_TOKEN`
- [ ] 提示 `域名未加入白名单`：检查微信后台 `request 合法域名`
- [ ] 持续 `请求超时`：检查 Vercel 函数日志与网络可达性
- [ ] 一直本地兜底：确认代理地址与 token 已生效并清过缓存

## G. 发布前安全项

- [ ] 已确认前端无 `SILICONFLOW_API_KEY` 明文
- [ ] 已确认 `.env*` 未提交敏感值
- [ ] 已确认 `PROXY_TOKEN` 非弱口令（建议后续改为高强度随机值）
