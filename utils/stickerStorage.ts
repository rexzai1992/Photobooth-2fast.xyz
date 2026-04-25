import { supabase } from './supabase';
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
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `stickers/${fileName}`;
      await uploadBlobToR2(filePath, file, file.type);

      const { data: dbData, error: dbError } = await supabase
        .from('custom_stickers')
        .insert({
          name: file.name,
          image_url: getR2PublicUrl(filePath),
          file_type: file.type
        })
        .select()
        .single();

      if (dbError) {
        await deleteR2Keys([filePath]).catch(() => undefined);
        errors.push({ file: file.name, error: dbError.message });
        continue;
      }

      success.push(dbData);
    } catch (err) {
      errors.push({ file: file.name, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return { success, errors };
};

export const getCustomStickers = async (): Promise<CustomSticker[]> => {
  try {
    const { data, error } = await supabase
      .from('custom_stickers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching custom stickers:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching custom stickers:', err);
    return [];
  }
};

export const deleteCustomSticker = async (sticker: CustomSticker): Promise<boolean> => {
  try {
    const objectKey = extractObjectKeyFromUrl(sticker.image_url, 'stickers');
    if (objectKey) {
      try {
        await deleteR2Keys([objectKey]);
      } catch (storageError) {
        console.error('Error deleting sticker from R2:', storageError);
      }
    }

    const { error: dbError } = await supabase
      .from('custom_stickers')
      .delete()
      .eq('id', sticker.id);

    if (dbError) {
      console.error('Error deleting sticker from database:', dbError);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error deleting custom sticker:', err);
    return false;
  }
};
