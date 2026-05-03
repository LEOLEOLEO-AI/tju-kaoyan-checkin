# Vercel Proxy (Free Tier)

## 1) Deploy

1. Push `vercel-proxy` folder to GitHub repo.
2. Import this repo in Vercel dashboard.
3. Set project root to `vercel-proxy`.

## 2) Environment Variables

In Vercel project settings -> Environment Variables:

- `SILICONFLOW_API_KEY` (required)
- `PROXY_TOKEN` (optional but recommended)

Then redeploy.

## 3) Endpoint

After deploy, endpoint is:

`https://<your-vercel-app>.vercel.app/v1/chat/completions`

## 4) Mini Program

In `utils/ai-config.js`, put your Vercel endpoint into `proxyBaseURLs`.
Keep Worker and Vercel both in list for automatic failover.
