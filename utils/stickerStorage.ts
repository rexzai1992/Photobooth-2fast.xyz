import { deleteR2Keys, extractObjectKeyFromUrl, getR2PublicUrl, uploadBlobToR2 } from './r2Storage';

export interface CustomSticker {
  id: string;
  name: string;
  image_url: string;
  file_type: string;
  created_at: string;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/webp', 'image/jpeg', 'image/jpg', 'image/svg+xml'];

export const validateStickerFile = (file: File): string | null => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Invalid file type. Allowed types: PNG, WEBP, JPG, SVG`;
  }

  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size: 2MB`;
  }

  return null;
};

export const uploadStickers = async (files: File[]): Promise<{ success: CustomSticker[], errors: { file: string, error: string }[] }> => {
  const success: CustomSticker[] = [];
  const errors: { file: string, error: string }[] = [];

  for (const file of files) {
    const validationError = validateStickerFile(file);
    if (validationError) {
      errors.push({ file: file.name, error: validationError });
      continue;
    }

    try {
      // Stickers live only in R2 now (the old Supabase table is gone).
      const fileExt = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
      const safeName = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sticker';
      const filePath = `stickers/${Date.now()}-${safeName}.${fileExt}`;
      await uploadBlobToR2(filePath, file, file.type);
      success.push({
        id: filePath,
        name: file.name,
        image_url: getR2PublicUrl(filePath),
        file_type: file.type,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      errors.push({ file: file.name, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return { success, errors };
};

const typeFromKey = (key: string): string => {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'image/png';
};

const nameFromKey = (key: string): string =>
  (key.split('/').pop() || key)
    .replace(/\.[^.]+$/, '')
    .replace(/^\d{10,}-/, '')
    .replace(/^deepblue-(text-)?/, '')
    .replace(/[-_]+/g, ' ')
    .trim();

export const getCustomStickers = async (): Promise<CustomSticker[]> => {
  try {
    const response = await fetch('/api/r2/list?prefix=stickers');
    if (!response.ok) {
      console.error('Error fetching custom stickers:', response.status);
      return [];
    }
    const payload = await response.json().catch(() => null) as { objects?: Array<{ key: string; uploaded?: string }> } | null;
    return (payload?.objects || [])
      .filter(item => /\.(png|webp|jpe?g|svg)$/i.test(item.key))
      .sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || '') || a.key.localeCompare(b.key))
      .map(item => ({
        id: item.key,
        name: nameFromKey(item.key),
        image_url: getR2PublicUrl(item.key),
        file_type: typeFromKey(item.key),
        created_at: item.uploaded || new Date().toISOString()
      }));
  } catch (err) {
    console.error('Error fetching custom stickers:', err);
    return [];
  }
};

export const deleteCustomSticker = async (sticker: CustomSticker): Promise<boolean> => {
  try {
    const objectKey = sticker.id.startsWith('stickers/') ? sticker.id : extractObjectKeyFromUrl(sticker.image_url, 'stickers');
    if (!objectKey) return false;
    await deleteR2Keys([objectKey]);
    return true;
  } catch (err) {
    console.error('Error deleting sticker:', err);
    return false;
  }
};
