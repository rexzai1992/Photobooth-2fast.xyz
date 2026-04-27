# Deep Blue Photobooth

Event photobooth web app built with React + Vite.

Media files (photos, previews, stickers, videos) are stored in Cloudflare R2 via Pages Functions.  
Metadata (gallery records, sticker records, phone numbers) is stored in Supabase.

## Features

- Multi-step photobooth flow (layout selection, capture, review, editor).
- Admin dashboard for gallery management, sticker upload, and WhatsApp send tools.
- Download page with token route (`/download/:token`).
- R2-backed media pipeline with Supabase metadata tables.

## Requirements

- Node.js 18+.
- A Supabase project with the SQL migrations in `supabase/migrations`.
- A Cloudflare Pages project (for `/functions/api/r2/*` endpoints).
- An R2 bucket bound to Pages Functions.

## Environment Variables

Create a local `.env` file (see `.env.example`):

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_PUBLIC_URL=https://your-public-domain
VITE_R2_PUBLIC_URL=
```

Notes:

- Leave `VITE_R2_PUBLIC_URL` empty if you want media served through `/api/r2/object?key=...`.
- Set `VITE_R2_PUBLIC_URL` only when you already expose your R2 objects at a public base URL.

## Local Development

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

## Desktop Kiosk (.exe) Mode

This project can now run in two modes:

- Web app (existing): `npm run dev` / Cloudflare Pages deploy.
- Windows kiosk app (`.exe`): Electron wrapper that opens in fullscreen kiosk mode.

Set the kiosk URL in `electron/kiosk.config.json`:

```json
{
  "startUrl": "https://photobooth.izzul.xyz",
  "allowNavigationHosts": ["photobooth.izzul.xyz"]
}
```

Desktop development mode:

```bash
npm run desktop:dev
```

Build Windows installer (`.exe`):

```bash
npm run desktop:build
```

This command is pinned to Windows `x64` (standard Intel/AMD PCs).

Output:

- Installer: `release/DeepBluePhotobooth-Setup-<version>.exe`
- Unpacked app (optional): `npm run desktop:build:dir`

Note:

- The kiosk wrapper blocks common browser escape shortcuts, but OS-level kiosk policy is still recommended for strict lock-down.
- If Windows packaging from macOS fails in your environment, run the same command on a Windows machine/CI runner.

## Cloudflare Pages Setup

In your Pages project:

1. Open `Settings -> Functions -> R2 bucket bindings`.
2. Add one of these binding names (preferred first): `MEDIA_BUCKET`, `R2_BUCKET`, or `PHOTOS_BUCKET`.
3. Point it to your target R2 bucket.

Optional function variable:

- `R2_PUBLIC_URL`: public base URL for direct media links.

## Deployment

- Build command: `npm run build`
- Output directory: `dist`
- Functions directory: `functions`
- Detailed production deploy reference: `docs/deployment-photobooth-izzul.md`

The app uses SPA routing, so ensure `/* -> /index.html` fallback is enabled in your host config.
