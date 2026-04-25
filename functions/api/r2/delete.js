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

const normalizeKeys = (keys) =>
  Array.from(
    new Set(
      keys
        .map((key) => (typeof key === 'string' ? key.replace(/^\/+/, '').trim() : ''))
        .filter((key) => key && !key.includes('..'))
    )
  );

export const onRequestOptions = async () => json({ success: true });

export const onRequestPost = async ({ request, env }) => {
  try {
    const bucket = resolveBucket(env);
    if (!bucket) {
      return json({ success: false, error: 'R2 bucket binding is missing (MEDIA_BUCKET, R2_BUCKET, or PHOTOS_BUCKET).' }, 500);
    }

    const payload = await request.json().catch(() => null);
    const keys = normalizeKeys(payload?.keys || []);

    if (keys.length === 0) {
      return json({ success: false, error: 'No valid keys provided' }, 400);
    }

    await Promise.all(keys.map((key) => bucket.delete(key)));

    return json({
      success: true,
      deleted: keys.length
    });
  } catch (err) {
    return json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Delete failed'
      },
      500
    );
  }
};
