// Upload a photo/video from the booth into R2.
// Only photos/... (images/videos) are accepted publicly; stickers/... needs the admin PIN.
// Optional X-Meta-Phone header is stored with the object (customer WhatsApp number).
const MAX_BYTES = 80 * 1024 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'PUT, OPTIONS',
      'access-control-allow-headers': 'content-type, x-admin-pin, x-meta-phone'
    }
  });

const resolveBucket = (env) => env.MEDIA_BUCKET || env.R2_BUCKET || env.PHOTOS_BUCKET;

const isAdmin = (request, env) => {
  const expected = (env.ADMIN_PIN || '').trim();
  const provided = (request.headers.get('x-admin-pin') || '').trim();
  return Boolean(expected) && provided === expected;
};

const resolveKey = (requestUrl) => {
  const key = (new URL(requestUrl).searchParams.get('key') || '').replace(/^\/+/, '').trim();
  if (!key) {
    return { error: 'Missing object key' };
  }
  if (key.includes('..') || !/^(photos|stickers)\/[A-Za-z0-9._-]+$/.test(key)) {
    return { error: 'Invalid object key' };
  }
  return { key };
};

const cleanPhone = (value) => (value || '').replace(/[^0-9+]/g, '').slice(0, 20);

export const onRequestOptions = async () => json({ success: true });

export const onRequestPut = async ({ request, env }) => {
  try {
    const bucket = resolveBucket(env);
    if (!bucket) {
      return json({ success: false, error: 'R2 bucket binding is missing (MEDIA_BUCKET, R2_BUCKET, or PHOTOS_BUCKET).' }, 500);
    }

    const { key, error } = resolveKey(request.url);
    if (error) {
      return json({ success: false, error }, 400);
    }
    if (key.startsWith('stickers/') && !isAdmin(request, env)) {
      return json({ success: false, error: 'Admin PIN required' }, 401);
    }

    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    if (!/^(image|video)\//i.test(contentType)) {
      return json({ success: false, error: 'Only images and videos can be uploaded' }, 415);
    }

    const body = await request.arrayBuffer();
    if (!body || body.byteLength === 0) {
      return json({ success: false, error: 'Empty upload payload' }, 400);
    }
    if (body.byteLength > MAX_BYTES) {
      return json({ success: false, error: 'File too large' }, 413);
    }

    const phone = cleanPhone(request.headers.get('x-meta-phone'));
    await bucket.put(key, body, {
      httpMetadata: { contentType },
      customMetadata: phone ? { phone } : undefined
    });

    const publicBase = (env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
    const url = publicBase
      ? `${publicBase}/${key}`
      : `/api/r2/object?key=${encodeURIComponent(key)}`;

    return json({
      success: true,
      key,
      url
    });
  } catch (err) {
    return json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Upload failed'
      },
      500
    );
  }
};
