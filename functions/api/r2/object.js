const resolveBucket = (env) => env.MEDIA_BUCKET || env.R2_BUCKET || env.PHOTOS_BUCKET;
const SUPABASE_URL_KEYS = ['SUPABASE_URL', 'VITE_SUPABASE_URL'];
const SUPABASE_PHOTOS_BUCKET_KEYS = ['SUPABASE_PHOTOS_BUCKET', 'VITE_SUPABASE_PHOTOS_BUCKET'];
const MAX_MIME_PROBE_BYTES = 20 * 1024 * 1024;

const getKey = (requestUrl) => {
  const key = (new URL(requestUrl).searchParams.get('key') || '').replace(/^\/+/, '').trim();
  if (!key || key.includes('..')) {
    return null;
  }
  return key;
};

const shouldUseSupabaseFallback = (requestUrl) => {
  const fallback = (new URL(requestUrl).searchParams.get('fallback') || '').trim().toLowerCase();
  return fallback === 'supabase' || fallback === '1' || fallback === 'true';
};

const resolveSupabaseUrlFromQuery = (requestUrl) => {
  const requested = (new URL(requestUrl).searchParams.get('supabase_url') || '').trim();
  if (!requested) {
    return '';
  }

  try {
    const parsed = new URL(requested);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
};

const resolveSupabaseUrl = (requestUrl, env) => {
  const fromQuery = resolveSupabaseUrlFromQuery(requestUrl);
  if (fromQuery) {
    return fromQuery;
  }

  for (const key of SUPABASE_URL_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.replace(/\/+$/, '');
    }
  }
  return '';
};

const resolveSupabaseBucket = (env) => {
  for (const key of SUPABASE_PHOTOS_BUCKET_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return 'photos';
};

const encodePath = (value) =>
  value
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');

const buildSupabasePublicUrl = (requestUrl, env, key) => {
  const supabaseUrl = resolveSupabaseUrl(requestUrl, env);
  if (!supabaseUrl) {
    return '';
  }

  const bucket = resolveSupabaseBucket(env);
  const normalizedKey = key.replace(/^\/+/, '');
  const bucketPrefix = `${bucket}/`;
  const bucketScopedPath = normalizedKey.startsWith(bucketPrefix)
    ? normalizedKey.slice(bucketPrefix.length)
    : normalizedKey;

  const encodedPath = encodePath(bucketScopedPath);
  if (!encodedPath) {
    return '';
  }

  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
};

const inferMimeTypeFromBuffer = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 4) {
    return null;
  }

  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (isPng) {
    return 'image/png';
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) {
    return 'image/jpeg';
  }

  const isGif =
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38;
  if (isGif) {
    return 'image/gif';
  }

  const isWebp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (isWebp) {
    return 'image/webp';
  }

  return null;
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
      if (!shouldUseSupabaseFallback(request.url)) {
        return new Response('Not found', { status: 404 });
      }

      const supabaseObjectUrl = buildSupabasePublicUrl(request.url, env, key);
      if (!supabaseObjectUrl) {
        return new Response('Not found', { status: 404 });
      }

      const fallbackResponse = await fetch(supabaseObjectUrl, { method: 'GET' });
      if (!fallbackResponse.ok) {
        return new Response('Not found', { status: 404 });
      }

      const headers = new Headers(fallbackResponse.headers);
      if (!headers.has('cache-control')) {
        headers.set('cache-control', 'public, max-age=600');
      }

      return new Response(fallbackResponse.body, {
        status: 200,
        headers
      });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=0, must-revalidate');

    const contentType = (headers.get('content-type') || '').toLowerCase();
    const shouldProbeMime =
      key.startsWith('photos/') &&
      object.size > 0 &&
      object.size <= MAX_MIME_PROBE_BYTES &&
      (!contentType || contentType === 'application/octet-stream' || contentType.startsWith('image/'));

    if (!shouldProbeMime) {
      return new Response(object.body, {
        status: 200,
        headers
      });
    }

    const objectBuffer = await object.arrayBuffer();
    const inferredMimeType = inferMimeTypeFromBuffer(objectBuffer);
    if (inferredMimeType && inferredMimeType !== contentType) {
      headers.set('content-type', inferredMimeType);
    }

    return new Response(objectBuffer, {
      status: 200,
      headers
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'Failed to load object', { status: 500 });
  }
};
