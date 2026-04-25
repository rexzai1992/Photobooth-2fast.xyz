const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'PUT, OPTIONS',
      'access-control-allow-headers': 'content-type'
    }
  });

const resolveBucket = (env) => env.MEDIA_BUCKET || env.R2_BUCKET || env.PHOTOS_BUCKET;

const resolveKey = (requestUrl) => {
  const key = (new URL(requestUrl).searchParams.get('key') || '').replace(/^\/+/, '').trim();
  if (!key) {
    return { error: 'Missing object key' };
  }
  if (key.includes('..')) {
    return { error: 'Invalid object key' };
  }
  return { key };
};

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

    const body = await request.arrayBuffer();
    if (!body || body.byteLength === 0) {
      return json({ success: false, error: 'Empty upload payload' }, 400);
    }

    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    await bucket.put(key, body, {
      httpMetadata: {
        contentType
      }
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
