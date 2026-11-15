const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL || '').replace(/\/+$/, '');
const SUPABASE_PUBLIC_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');

const normalizeKey = (key: string): string => key.replace(/^\/+/, '').trim();

// Admin PIN is checked on the server; we only keep what the admin typed for this browser session.
const ADMIN_PIN_STORAGE_KEY = 'dbp_admin_pin';
export const setAdminPin = (pin: string | null): void => {
  try {
    if (pin) sessionStorage.setItem(ADMIN_PIN_STORAGE_KEY, pin);
    else sessionStorage.removeItem(ADMIN_PIN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
};
export const getAdminPin = (): string => {
  try {
    return sessionStorage.getItem(ADMIN_PIN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};
const adminHeaders = (): Record<string, string> => {
  const pin = getAdminPin();
  return pin ? { 'X-Admin-Pin': pin } : {};
};

export const verifyAdminPin = async (pin: string): Promise<boolean> => {
  try {
    const response = await fetch('/api/admin/verify', { method: 'POST', headers: { 'X-Admin-Pin': pin } });
    const data = await response.json().catch(() => null) as { ok?: boolean } | null;
    return Boolean(response.ok && data?.ok);
  } catch {
    return false;
  }
};
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

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

  if (ABSOLUTE_URL_PATTERN.test(normalizedKey) || normalizedKey.startsWith('data:')) {
    return normalizedKey;
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

export const getPhotoDeliveryUrl = (key: string): string => {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) {
    return '';
  }

  if (ABSOLUTE_URL_PATTERN.test(normalizedKey) || normalizedKey.startsWith('data:')) {
    return normalizedKey;
  }

  const params = new URLSearchParams({
    key: normalizedKey,
    fallback: 'supabase'
  });
  if (SUPABASE_PUBLIC_URL) {
    params.set('supabase_url', SUPABASE_PUBLIC_URL);
  }

  const proxyPath = `/api/r2/object?${params.toString()}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${proxyPath}`;
  }
  return proxyPath;
};

export const uploadBlobToR2 = async (key: string, blob: Blob, contentType?: string, phoneNumber?: string): Promise<string> => {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) {
    throw new Error('Missing R2 object key');
  }

  const response = await fetch(`/api/r2/upload?key=${encodeURIComponent(normalizedKey)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType || blob.type || 'application/octet-stream',
      ...adminHeaders(),
      ...(phoneNumber ? { 'X-Meta-Phone': phoneNumber } : {})
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
      'Content-Type': 'application/json',
      ...adminHeaders()
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

export interface R2ObjectSummary {
  key: string;
  uploadedAt: number;
  size: number;
  phone?: string | null;
}

export const setR2PhotoPhone = async (keys: string[], phone: string): Promise<void> => {
  const response = await fetch('/api/r2/meta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: keys.map(normalizeKey), phone })
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
};

export const listR2VideoObjects = async (): Promise<R2ObjectSummary[]> => listR2Objects('video');

export const listR2Objects = async (type: 'video' | 'photo' | 'all' = 'all'): Promise<R2ObjectSummary[]> => {
  const response = await fetch(`/api/r2/list${type === 'all' ? '' : `?type=${type}`}`, { headers: adminHeaders() });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = await response.json().catch(() => null) as {
    objects?: Array<{ key?: string; uploaded?: string; size?: number; phone?: string | null }>;
    error?: string;
  } | null;

  if (payload?.error) {
    throw new Error(payload.error);
  }

  return (payload?.objects || [])
    .filter(item => typeof item.key === 'string' && item.key)
    .map(item => ({
      key: item.key as string,
      uploadedAt: item.uploaded ? Date.parse(item.uploaded) : Date.now(),
      size: typeof item.size === 'number' ? item.size : 0,
      phone: item.phone || null
    }));
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
