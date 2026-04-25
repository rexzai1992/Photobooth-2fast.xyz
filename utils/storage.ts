import { supabase } from './supabase';
import { compressImage } from './imageCompression';
import { deleteR2Keys, getPhotoDeliveryUrl, uploadBlobToR2 } from './r2Storage';

export interface SavedPhoto {
  id: string;
  timestamp: number;
  dataUrl: string;
  fullSizeUrl?: string;
  phoneNumber?: string;
  isVideo?: boolean;
  slotIndex?: number | null;
  sessionId?: string | null;
}

const dataUrlToBlob = (dataUrl: string): Blob => {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

const getDataUrlMimeType = (dataUrl: string, fallback: string): string => {
  const mime = dataUrl.match(/^data:(.*?);base64,/)?.[1];
  return mime || fallback;
};

const getFileExtensionFromMimeType = (mimeType: string): string => {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('png')) return 'png';
  return 'bin';
};

export const updatePhotoPhoneNumber = async (photoId: string, phoneNumber: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('photos')
      .update({ phone_number: phoneNumber })
      .eq('id', photoId);

    if (error) {
      console.error("Error updating photo phone number:", error);
      throw error;
    }

    console.log('Photo phone number updated successfully');
  } catch (e) {
    console.error("Error updating photo phone number:", e);
    throw e;
  }
};

export const savePhotoToGallery = async (dataUrl: string, phoneNumber?: string): Promise<string> => {
  try {
    const photoId = crypto.randomUUID();
    const fullFileName = `${photoId}-full.jpg`;
    const previewFileName = `${photoId}-preview.jpg`;
    const fullStoragePath = `photos/${fullFileName}`;
    const previewStoragePath = `photos/${previewFileName}`;

    let compressedPreview = dataUrl;
    try {
      compressedPreview = await compressImage(dataUrl, 800, 0.7);
    } catch (compressionError) {
      console.warn('Preview compression failed, using original image data for preview.', compressionError);
    }

    const fullBlob = dataUrlToBlob(dataUrl);
    const previewBlob = dataUrlToBlob(compressedPreview);
    let uploadedToR2 = false;

    try {
      await Promise.all([
        uploadBlobToR2(fullStoragePath, fullBlob, 'image/jpeg'),
        uploadBlobToR2(previewStoragePath, previewBlob, 'image/jpeg')
      ]);
      uploadedToR2 = true;
    } catch (uploadError) {
      console.warn('R2 upload failed, saving photo with legacy image_data fallback.', uploadError);
      await deleteR2Keys([fullStoragePath, previewStoragePath]).catch(() => undefined);
    }

    const insertPayload = uploadedToR2
      ? {
          id: photoId,
          storage_path: fullStoragePath,
          preview_path: previewStoragePath,
          image_data: null,
          phone_number: phoneNumber || null
        }
      : {
          id: photoId,
          storage_path: null,
          preview_path: null,
          image_data: dataUrl,
          phone_number: phoneNumber || null
        };

    const { error: dbError } = await supabase
      .from('photos')
      .insert(insertPayload);

    if (dbError) {
      console.error("Error saving photo metadata to database:", dbError);
      if (uploadedToR2) {
        await deleteR2Keys([fullStoragePath, previewStoragePath]).catch(() => undefined);
      }
      throw dbError;
    }

    if (uploadedToR2) {
      console.log('Photo and preview saved to R2');
    } else {
      console.log('Photo saved with legacy image_data fallback');
    }
    return photoId;
  } catch (e) {
    console.error("Error saving photo:", e);
    throw e;
  }
};

export const saveCaptureLayersToGallery = async (
  photoLayers: string[],
  videoLayers: string[],
  phoneNumber?: string
): Promise<string> => {
  try {
    const sessionId = crypto.randomUUID();

    for (const [index, photoLayer] of photoLayers.entries()) {
      const photoId = crypto.randomUUID();
      const fullFileName = `${photoId}-layer-${index + 1}-full.jpg`;
      const previewFileName = `${photoId}-layer-${index + 1}-preview.jpg`;
      const fullStoragePath = `photos/${fullFileName}`;
      const previewStoragePath = `photos/${previewFileName}`;

      const compressedPreview = await compressImage(photoLayer, 800, 0.7);
      const fullBlob = dataUrlToBlob(photoLayer);
      const previewBlob = dataUrlToBlob(compressedPreview);

      try {
        await Promise.all([
          uploadBlobToR2(fullStoragePath, fullBlob, 'image/jpeg'),
          uploadBlobToR2(previewStoragePath, previewBlob, 'image/jpeg')
        ]);
      } catch (uploadError) {
        await deleteR2Keys([fullStoragePath, previewStoragePath]).catch(() => undefined);
        throw uploadError;
      }

      const { error: dbError } = await supabase
        .from('photos')
        .insert({
          id: photoId,
          storage_path: fullStoragePath,
          preview_path: previewStoragePath,
          phone_number: phoneNumber || null,
          is_video: false,
          slot_index: index,
          session_id: sessionId
        });

      if (dbError) {
        await deleteR2Keys([fullStoragePath, previewStoragePath]).catch(() => undefined);
        throw dbError;
      }
    }

    for (const [index, videoLayer] of videoLayers.entries()) {
      const videoId = crypto.randomUUID();
      const mimeType = getDataUrlMimeType(videoLayer, 'video/webm');
      const extension = getFileExtensionFromMimeType(mimeType);
      const videoFileName = `${videoId}-layer-${index + 1}.${extension}`;
      const videoStoragePath = `photos/${videoFileName}`;
      const videoBlob = dataUrlToBlob(videoLayer);

      await uploadBlobToR2(videoStoragePath, videoBlob, mimeType);

      const { error: dbError } = await supabase
        .from('photos')
        .insert({
          id: videoId,
          storage_path: videoStoragePath,
          preview_path: null,
          phone_number: phoneNumber || null,
          is_video: true,
          slot_index: index,
          session_id: sessionId
        });

      if (dbError) {
        await deleteR2Keys([videoStoragePath]).catch(() => undefined);
        throw dbError;
      }
    }

    return sessionId;
  } catch (e) {
    console.error("Error saving capture layers:", e);
    throw e;
  }
};

export interface GalleryResult {
  photos: SavedPhoto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const getTotalPhotoCount = async (): Promise<number> => {
  try {
    const { count, error } = await supabase
      .from('photos')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error("Error getting photo count:", error);
      return 0;
    }

    return count || 0;
  } catch (e) {
    console.error("Error getting photo count:", e);
    return 0;
  }
};

export const getGallery = async (page: number = 1, pageSize: number = 30): Promise<GalleryResult> => {
  try {
    const offset = (page - 1) * pageSize;

    const [countResult, scopedPhotosResult] = await Promise.all([
      getTotalPhotoCount(),
      supabase
        .from('photos')
        .select('id, storage_path, preview_path, created_at, phone_number, is_video, slot_index, session_id')
        .eq('is_video', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1)
    ]);

    const photosResult = scopedPhotosResult.error && scopedPhotosResult.error.message?.includes('is_video')
      ? await supabase
          .from('photos')
          .select('id, storage_path, preview_path, created_at, phone_number')
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1)
      : scopedPhotosResult;

    const total = countResult;
    const { data, error } = photosResult;

    if (error) {
      console.error("Error fetching gallery:", error);
      return {
        photos: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0
      };
    }

    if (!data) {
      return {
        photos: [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    }

    const legacyPhotoIds = data
      .filter(photo => !photo.storage_path && !photo.preview_path)
      .map(photo => photo.id);

    let legacyPhotosData: { [key: string]: string } = {};

    if (legacyPhotoIds.length > 0) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('photos')
        .select('id, image_data')
        .in('id', legacyPhotoIds);

      if (!legacyError && legacyData) {
        legacyPhotosData = legacyData.reduce((acc, photo) => {
          if (photo.image_data) {
            acc[photo.id] = photo.image_data;
          }
          return acc;
        }, {} as { [key: string]: string });
      }
    }

    const photosWithUrls = data.map((photo) => {
      let dataUrl = '';
      let fullSizeUrl = '';

      if (photo.preview_path && photo.storage_path) {
        dataUrl = getPhotoDeliveryUrl(photo.preview_path);
        fullSizeUrl = getPhotoDeliveryUrl(photo.storage_path);
      } else if (photo.storage_path) {
        dataUrl = getPhotoDeliveryUrl(photo.storage_path);
        fullSizeUrl = getPhotoDeliveryUrl(photo.storage_path);
      } else if (legacyPhotosData[photo.id]) {
        dataUrl = legacyPhotosData[photo.id];
        fullSizeUrl = legacyPhotosData[photo.id];
      }

      return {
        id: photo.id,
        timestamp: new Date(photo.created_at).getTime(),
        dataUrl,
        fullSizeUrl,
        phoneNumber: photo.phone_number || undefined,
        isVideo: 'is_video' in photo ? (photo as { is_video?: boolean }).is_video : false,
        slotIndex: 'slot_index' in photo ? (photo as { slot_index?: number | null }).slot_index ?? null : null,
        sessionId: 'session_id' in photo ? (photo as { session_id?: string | null }).session_id ?? null : null
      };
    });

    return {
      photos: photosWithUrls,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  } catch (e) {
    console.error("Error fetching gallery:", e);
    return {
      photos: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0
    };
  }
};

export const deletePhotoFromGallery = async (id: string): Promise<void> => {
  try {
    const { data: photo } = await supabase
      .from('photos')
      .select('storage_path, preview_path')
      .eq('id', id)
      .maybeSingle();

    if (photo) {
      const filesToDelete: string[] = [];
      if (photo.storage_path) {
        filesToDelete.push(photo.storage_path);
      }
      if (photo.preview_path) {
        filesToDelete.push(photo.preview_path);
      }

      if (filesToDelete.length > 0) {
        await deleteR2Keys(filesToDelete).catch(() => undefined);
      }
    }

    const { error } = await supabase
      .from('photos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Error deleting photo:", error);
    }
  } catch (e) {
    console.error("Error deleting photo:", e);
  }
};

export const clearGallery = async (): Promise<void> => {
  try {
    const { data: photos } = await supabase
      .from('photos')
      .select('storage_path, preview_path');

    if (photos) {
      const filesToDelete: string[] = [];
      photos.forEach(p => {
        if (p.storage_path) filesToDelete.push(p.storage_path);
        if (p.preview_path) filesToDelete.push(p.preview_path);
      });

      if (filesToDelete.length > 0) {
        await deleteR2Keys(filesToDelete).catch(() => undefined);
      }
    }

    const { error } = await supabase
      .from('photos')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.error("Error clearing gallery:", error);
    }
  } catch (e) {
    console.error("Error clearing gallery:", e);
  }
};
