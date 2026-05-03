# Cloudflare Worker Proxy

## 1) Install

```bash
cd worker-proxy
npm install
```

## 2) Login

```bash
npx wrangler login
```

## 3) Set secrets

```bash
npx wrangler secret put SILICONFLOW_API_KEY
npx wrangler secret put PROXY_TOKEN
```

`PROXY_TOKEN` is optional but recommended.

## 4) Deploy

```bash
npm run deploy
```

After deploy, you will get:

`https://<your-worker-subdomain>.workers.dev/v1/chat/completions`

## 5) Configure mini program

Update `utils/ai-config.js` defaults or storage config:

- `useProxy: true`
- `baseURL: "https://<your-worker-subdomain>.workers.dev/v1/chat/completions"`
- `proxyAuthToken: "<same PROXY_TOKEN>"`
- `apiKey: ""`

Then add the worker domain to WeChat mini program `request` legal domains.
