# Deploy Guide: `photobooth.izzul.xyz`

This project is deployed with **Cloudflare Pages**.

- Pages project name: `photobooth-izzul`
- Production branch: `main`
- Production domain: `photobooth.izzul.xyz`

## 1) Prerequisites

1. Install dependencies:

```bash
npm install
```

2. Make sure Wrangler can access your Cloudflare account:

```bash
npx wrangler whoami
```

3. (Optional) Confirm the Pages project exists:

```bash
npx wrangler pages project list
```

## 2) Deploy to Production

Run these commands from the repo root:

```bash
npm run build
npx wrangler pages deploy dist --project-name photobooth-izzul --branch main --commit-dirty=true
```

Notes:

- Build output directory is `dist`.
- Pages Functions are auto-uploaded from `functions/`.
- `--commit-dirty=true` allows deployment from local uncommitted changes.

## 3) Verify Deployment

1. Check latest deployment:

```bash
npx wrangler pages deployment list --project-name photobooth-izzul
```

2. Check production domain response:

```bash
curl -I https://photobooth.izzul.xyz
```

You should see HTTP `200`.

## 4) Common Problems

### A) "Unable to resolve Cloudflare API hostname"

Cause: network/DNS issue on local machine.

Fix:

- Check internet connection.
- Retry command after DNS/network stabilizes.
- Disable/reconfigure VPN/firewall if blocking Cloudflare endpoints.

### B) "R2 bucket binding is missing"

Cause: Pages Functions do not have the R2 bucket binding.

Fix in Cloudflare Pages project settings:

1. Go to `Settings -> Functions -> R2 bucket bindings`.
2. Add binding name `MEDIA_BUCKET` (preferred).
3. Bind to bucket `photobooth-izzul`.
4. Redeploy.

### C) Download links/media issues after deploy

Check:

- `functions/api/r2/object.js`, `functions/api/r2/upload.js`, `functions/api/r2/delete.js` are present.
- `.env` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `VITE_PUBLIC_URL` points to your public domain if needed.

## 5) Quick Command Block

```bash
npm run build
npx wrangler pages deploy dist --project-name photobooth-izzul --branch main --commit-dirty=true
npx wrangler pages deployment list --project-name photobooth-izzul
curl -I https://photobooth.izzul.xyz
```
