const resolveBucket = (env) => env.MEDIA_BUCKET || env.R2_BUCKET || env.PHOTOS_BUCKET;

const getKey = (requestUrl) => {
  const key = (new URL(requestUrl).searchParams.get('key') || '').replace(/^\/+/, '').trim();
  if (!key || key.includes('..')) {
    return null;
  }
  return key;
};

export const onRequestGet = async ({ request, env }) => {
  try {
    const bucket = resolveBucket(env);
    if (!bucket) {
      return new Response('R2 bucket binding is missing (MEDIA_BUCKET, R2_BUCKET, or PHOTOS_BUCKET).', { status: 500 });
    }

    const key = getKey(request.url);
    if (!key) {
      return new Response('Invalid object key', { status: 400 });
    }

    const object = await bucket.get(key);
    if (!object) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    if (!headers.has('cache-control')) {
      headers.set('cache-control', 'public, max-age=31536000, immutable');
    }

    return new Response(object.body, {
      status: 200,
      headers
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'Failed to load object', { status: 500 });
  }
};
