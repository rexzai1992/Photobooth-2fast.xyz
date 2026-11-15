const jsonError = (message, status) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });

export const onRequestPost = async ({ request, env }) => {
  const encoderUrl = (env.VIDEO_ENCODER_URL || '').trim().replace(/\/+$/, '');
  const encoderToken = (env.VIDEO_ENCODER_TOKEN || '').trim();
  if (!encoderUrl || !encoderToken) {
    return jsonError('Video encoder is not configured.', 503);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return jsonError('Expected multipart video upload.', 415);
  }

  try {
    const upstream = await fetch(`${encoderUrl}/api/encode/strip`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${encoderToken}`,
        'content-type': contentType
      },
      body: request.body
    });

    const headers = new Headers();
    headers.set('content-type', upstream.headers.get('content-type') || 'application/octet-stream');
    headers.set('cache-control', 'no-store');
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) {
      headers.set('content-disposition', disposition);
    }
    const encodeTime = upstream.headers.get('x-encode-ms');
    if (encodeTime) {
      headers.set('x-encode-ms', encodeTime);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? `Video encoder unavailable: ${error.message}` : 'Video encoder unavailable.',
      502
    );
  }
};
