// Admin-only: list photos/videos stored in R2 (needs the X-Admin-Pin header).
const VIDEO_EXTENSION_PATTERN = /\.(webm|mp4|mov|ogv)$/i;
const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|gif)$/i;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type, x-admin-pin'
    }
  });

const resolveBucket = (env) => env.MEDIA_BUCKET || env.R2_BUCKET || env.PHOTOS_BUCKET;

const isAdmin = (request, env) => {
  const expected = (env.ADMIN_PIN || '').trim();
  const provided = (request.headers.get('x-admin-pin') || '').trim();
  return Boolean(expected) && provided === expected;
};

export const onRequestOptions = async () => json({ success: true });

export const onRequestGet = async ({ request, env }) => {
  if (!isAdmin(request, env)) {
    return json({ error: 'Admin PIN required' }, 401);
  }
  try {
    const bucket = resolveBucket(env);
    if (!bucket) {
      return json({ error: 'R2 bucket binding is missing.' }, 500);
    }

    const type = new URL(request.url).searchParams.get('type');
    const objects = [];
    let cursor;

    do {
      const page = await bucket.list({
        prefix: 'photos/',
        cursor,
        limit: 1000,
        include: ['customMetadata']
      });

      for (const object of page.objects) {
        if (type === 'video' && !VIDEO_EXTENSION_PATTERN.test(object.key)) continue;
        if (type === 'photo' && !IMAGE_EXTENSION_PATTERN.test(object.key)) continue;
        objects.push({
          key: object.key,
          uploaded: object.uploaded?.toISOString?.() || null,
          size: object.size,
          phone: object.customMetadata?.phone || null
        });
      }

      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    return json({ objects });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Failed to list R2 objects.'
    }, 500);
  }
};
