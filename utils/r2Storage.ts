const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL || '').replace(/\/+$/, '');

const normalizeKey = (key: string): string => key.replace(/^\/+/, '').trim();

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    if (data?.error && typeof data.error === 'string') {
      return data.error;
    }
  } catch {
    // Ignore JSON parsing errors and fall back to HTTP status text.
  }
  return `Request failed with status ${response.status}`;
};

export const getR2PublicUrl = (key: string): string => {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) {
    return '';
  }

  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${normalizedKey}`;
  }

  const proxyPath = `/api/r2/object?key=${encodeURIComponent(normalizedKey)}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${proxyPath}`;
  }
  return proxyPath;
};

export const uploadBlobToR2 = async (key: string, blob: Blob, contentType?: string): Promise<string> => {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) {
    throw new Error('Missing R2 object key');
  }

  const response = await fetch(`/api/r2/upload?key=${encodeURIComponent(normalizedKey)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType || blob.type || 'application/octet-stream'
    },
    body: blob
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = await response.json().catch(() => null) as { success?: boolean; url?: string; error?: string } | null;
  if (payload && payload.success === false) {
    throw new Error(payload.error || 'Failed to upload to R2');
  }

  return payload?.url || getR2PublicUrl(normalizedKey);
};

export const deleteR2Keys = async (keys: string[]): Promise<void> => {
  const normalizedKeys = Array.from(new Set(keys.map(normalizeKey).filter(Boolean)));
  if (normalizedKeys.length === 0) {
    return;
  }

  const response = await fetch('/api/r2/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ keys: normalizedKeys })
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
  if (payload && payload.success === false) {
    throw new Error(payload.error || 'Failed to delete files from R2');
  }
};

export const extractObjectKeyFromUrl = (value: string, defaultPrefix?: string): string | null => {
  if (!value) {
    return null;
  }

  const normalizeWithPrefix = (candidate: string): string | null => {
    const normalized = normalizeKey(decodeURIComponent(candidate));
    if (!normalized) {
      return null;
    }

    if (!defaultPrefix) {
      return normalized;
    }

    if (normalized.startsWith(`${defaultPrefix}/`)) {
      return normalized;
    }

    const fileName = normalized.split('/').pop();
    return fileName ? `${defaultPrefix}/${fileName}` : null;
  };

  try {
    const parsed = new URL(value, window.location.origin);
    const queryKey = parsed.searchParams.get('key');
    if (queryKey) {
      return normalizeWithPrefix(queryKey);
    }

    if (defaultPrefix) {
      const marker = `/${defaultPrefix}/`;
      const path = decodeURIComponent(parsed.pathname || '');
      if (path.includes(marker)) {
        const suffix = path.slice(path.indexOf(marker) + marker.length).replace(/^\/+/, '');
        return suffix ? `${defaultPrefix}/${suffix}` : null;
      }
    }

    return normalizeWithPrefix(parsed.pathname || '');
  } catch {
    return normalizeWithPrefix(value);
  }
};
