// Attach a customer phone number to an existing photo in R2 (replaces the old Supabase phone_number column).
// POST { keys: ["photos/<id>-full.jpg", ...], phone: "60123456789" }
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type'
    }
  });

const resolveBucket = (env) => env.MEDIA_BUCKET || env.R2_BUCKET || env.PHOTOS_BUCKET;
const PHOTO_KEY = /^photos\/[0-9a-f-]{36}(?:-layer-\d+)?-(?:full|preview)\.jpg$/i;

export const onRequestOptions = async () => json({ success: true });

export const onRequestPost = async ({ request, env }) => {
  try {
    const bucket = resolveBucket(env);
    if (!bucket) return json({ success: false, error: 'R2 bucket binding is missing.' }, 500);

    const payload = await request.json().catch(() => null);
    const phone = String(payload?.phone || '').replace(/[^0-9+]/g, '').slice(0, 20);
    const keys = (Array.isArray(payload?.keys) ? payload.keys : []).filter((k) => typeof k === 'string' && PHOTO_KEY.test(k)).slice(0, 10);
    if (!phone || keys.length === 0) return json({ success: false, error: 'Missing phone or valid keys' }, 400);

    let updated = 0;
    for (const key of keys) {
      const object = await bucket.get(key);
      if (!object) continue;
      await bucket.put(key, await object.arrayBuffer(), {
        httpMetadata: object.httpMetadata,
        customMetadata: { ...(object.customMetadata || {}), phone }
      });
      updated += 1;
    }
    return json({ success: true, updated });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : 'Update failed' }, 500);
  }
};
