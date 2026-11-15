import { supabase } from './supabase';
import { compressImage } from './imageCompression';
import { deleteR2Keys, getPhotoDeliveryUrl, listR2Objects, listR2VideoObjects, setR2PhotoPhone, uploadBlobToR2 } from './r2Storage';

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

export interface VideoGalleryResult {
  videos: SavedPhoto[];
  total: number;
}

const PREVIEW_VIDEO_EXTENSIONS = ['webm', 'mp4', 'mov', 'ogv'] as const;
const PREVIEW_VIDEO_OBJECT_PATTERN = /-preview-video(?:-(?:portrait|strips))?\.(webm|mp4|mov|ogv)$/i;
const STRIP_PREVIEW_VIDEO_OBJECT_PATTERN = /-preview-video-strips\.(webm|mp4|mov|ogv)$/i;

export const getPhotoPreviewVideoStorageKeys = (photoId: string): string[] =>
  PREVIEW_VIDEO_EXTENSIONS.flatMap(extension => [
    `photos/${photoId}-preview-video.${extension}`,
    `photos/${photoId}-preview-video-portrait.${extension}`,
    `photos/${photoId}-preview-video-strips.${extension}`
  ]);

export const getVideoGallery = async (limit: number = 100): Promise<VideoGalleryResult> => {
  const r2Videos = await listR2VideoObjects();
  const previewVideos = r2Videos
    .filter(video => STRIP_PREVIEW_VIDEO_OBJECT_PATTERN.test(video.key))
    .sort((left, right) => right.uploadedAt - left.uploadedAt);

  return {
    videos: previewVideos.slice(0, limit).map(video => {
      const deliveryUrl = getPhotoDeliveryUrl(video.key);
      const photoToken = video.key.match(
        /photos\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-preview-video-strips\./i
      )?.[1];

      return {
        id: `r2:${encodeURIComponent(video.key)}`,
        timestamp: Number.isFinite(video.uploadedAt) ? video.uploadedAt : Date.now(),
        dataUrl: deliveryUrl,
        fullSizeUrl: deliveryUrl,
        isVideo: true,
        sessionId: photoToken || null
      };
    }),
    total: previewVideos.length
  };
};

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

/* ------------------------------------------------------------------------------------------
 * R2 is the source of truth. The old Supabase "photos" table is only written "best effort":
 * if Supabase is down (it was shut down in Oct 2026) photos are still kept in R2 and shown in admin.
 * ---------------------------------------------------------------------------------------- */
const SUPABASE_TIMEOUT_MS = 4000;

const bestEffortSupabase = async (label: string, run: () => PromiseLike<{ error: unknown }>): Promise<void> => {
  try {
    const result = await Promise.race([
      Promise.resolve(run()),
      new Promise<{ error: unknown }>(resolve =>
        setTimeout(() => resolve({ error: new Error('timeout') }), SUPABASE_TIMEOUT_MS)
      )
    ]);
    if (result?.error) {
      console.warn(`[optional] Supabase ${label} skipped:`, result.error);
    }
  } catch (error) {
    console.warn(`[optional] Supabase ${label} skipped:`, error);
  }
};

const photoKeys = (photoId: string) => ({
  full: `photos/${photoId}-full.jpg`,
  preview: `photos/${photoId}-preview.jpg`
});

export const updatePhotoPhoneNumber = async (photoId: string, phoneNumber: string): Promise<void> => {
  const keys = photoKeys(photoId);
  await setR2PhotoPhone([keys.full, keys.preview], phoneNumber);
  await bestEffortSupabase('phone update', () =>
    supabase.from('photos').update({ phone_number: phoneNumber }).eq('id', photoId)
  );
  console.log('Photo phone number updated');
};

export const savePhotoToGallery = async (
  dataUrl: string,
  phoneNumber?: string,
  existingPhotoId?: string
): Promise<string> => {
  const photoId = existingPhotoId || crypto.randomUUID();
  const isOverwrite = Boolean(existingPhotoId);
  const { full: fullStoragePath, preview: previewStoragePath } = photoKeys(photoId);

  let compressedPreview = dataUrl;
  try {
    compressedPreview = await compressImage(dataUrl, 800, 0.7);
  } catch (compressionError) {
    console.warn('Preview compression failed, using original image data for preview.', compressionError);
  }

  const fullBlob = dataUrlToBlob(dataUrl);
  const previewBlob = dataUrlToBlob(compressedPreview);

  // Upload to R2. If this fails we throw (nothing was saved) - but we NEVER delete a photo
  // that reached R2 just because the database is unavailable.
  await Promise.all([
    uploadBlobToR2(fullStoragePath, fullBlob, 'image/jpeg', phoneNumber),
    uploadBlobToR2(previewStoragePath, previewBlob, 'image/jpeg', phoneNumber)
  ]);

  if (isOverwrite) {
    await bestEffortSupabase('overwrite phone', () =>
      phoneNumber
        ? supabase.from('photos').update({ phone_number: phoneNumber }).eq('id', photoId)
        : Promise.resolve({ error: null })
    );
    console.log('Existing photo and preview overwritten in R2');
    return photoId;
  }

  await bestEffortSupabase('insert', () =>
    supabase.from('photos').insert({
      id: photoId,
      storage_path: fullStoragePath,
      preview_path: previewStoragePath,
      image_data: null,
      phone_number: phoneNumber || null
    })
  );

  console.log('Photo and preview saved to R2');
  return photoId;
};

export const saveCaptureLayersToGallery = async (
  photoLayers: string[],
  videoLayers: string[],
  phoneNumber?: string
): Promise<string> => {
  const sessionId = crypto.randomUUID();

  for (const [index, photoLayer] of photoLayers.entries()) {
    const photoId = crypto.randomUUID();
    const fullStoragePath = `photos/${photoId}-layer-${index + 1}-full.jpg`;
    const previewStoragePath = `photos/${photoId}-layer-${index + 1}-preview.jpg`;

    let compressedPreview = photoLayer;
    try {
      compressedPreview = await compressImage(photoLayer, 800, 0.7);
    } catch {
      // use original
    }

    await Promise.all([
      uploadBlobToR2(fullStoragePath, dataUrlToBlob(photoLayer), 'image/jpeg', phoneNumber),
      uploadBlobToR2(previewStoragePath, dataUrlToBlob(compressedPreview), 'image/jpeg', phoneNumber)
    ]);

    await bestEffortSupabase('layer insert', () =>
      supabase.from('photos').insert({
        id: photoId,
        storage_path: fullStoragePath,
        preview_path: previewStoragePath,
        phone_number: phoneNumber || null,
        is_video: false,
        slot_index: index,
        session_id: sessionId
      })
    );
  }

  for (const [index, videoLayer] of videoLayers.entries()) {
    const videoId = crypto.randomUUID();
    const mimeType = getDataUrlMimeType(videoLayer, 'video/webm');
    const extension = getFileExtensionFromMimeType(mimeType);
    const videoStoragePath = `photos/${videoId}-layer-${index + 1}.${extension}`;

    await uploadBlobToR2(videoStoragePath, dataUrlToBlob(videoLayer), mimeType, phoneNumber);

    await bestEffortSupabase('video layer insert', () =>
      supabase.from('photos').insert({
        id: videoId,
        storage_path: videoStoragePath,
        preview_path: null,
        phone_number: phoneNumber || null,
        is_video: true,
        slot_index: index,
        session_id: sessionId
      })
    );
  }

  return sessionId;
};

export interface GalleryResult {
  photos: SavedPhoto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// photos/<uuid>[-layer-N]-(full|preview).jpg
const PHOTO_OBJECT_PATTERN = /^photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-layer-(\d+))?)-(full|preview)\.(?:jpe?g|png|webp)$/i;

let galleryCache: { at: number; items: SavedPhoto[] } | null = null;
const GALLERY_CACHE_MS = 60_000;
const invalidateGalleryCache = () => { galleryCache = null; };

const buildR2Gallery = async (): Promise<SavedPhoto[]> => {
  if (galleryCache && Date.now() - galleryCache.at < GALLERY_CACHE_MS) {
    return galleryCache.items;
  }
  const items = await buildR2GalleryUncached();
  galleryCache = { at: Date.now(), items };
  return items;
};

const buildR2GalleryUncached = async (): Promise<SavedPhoto[]> => {
  const objects = await listR2Objects('all');

  const groups = new Map<string, { full?: string; preview?: string; uploadedAt: number; phone?: string | null; layer?: number }>();
  const videoItems: SavedPhoto[] = [];

  for (const object of objects) {
    const match = object.key.match(PHOTO_OBJECT_PATTERN);
    if (match) {
      const [, id, layer, kind] = match;
      const group = groups.get(id) || { uploadedAt: object.uploadedAt, layer: layer ? Number(layer) : undefined };
      if (kind.toLowerCase() === 'full') group.full = object.key;
      else group.preview = object.key;
      group.uploadedAt = Math.max(group.uploadedAt || 0, object.uploadedAt || 0);
      group.phone = group.phone || object.phone || null;
      groups.set(id, group);
      continue;
    }

    // stand-alone recorded videos (not the per-photo preview videos, which belong to a photo)
    if (/\.(webm|mp4|mov|ogv)$/i.test(object.key) && !PREVIEW_VIDEO_OBJECT_PATTERN.test(object.key)) {
      const sessionId = object.key.match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i
      )?.[1] || null;
      const deliveryUrl = getPhotoDeliveryUrl(object.key);
      videoItems.push({
        id: `r2:${encodeURIComponent(object.key)}`,
        timestamp: Number.isFinite(object.uploadedAt) ? object.uploadedAt : Date.now(),
        dataUrl: deliveryUrl,
        fullSizeUrl: deliveryUrl,
        phoneNumber: object.phone || undefined,
        isVideo: true,
        slotIndex: null,
        sessionId
      });
    }
  }

  const photoItems: SavedPhoto[] = [];
  for (const [id, group] of groups) {
    const fullKey = group.full || group.preview;
    const previewKey = group.preview || group.full;
    if (!fullKey || !previewKey) continue;
    photoItems.push({
      id,
      timestamp: Number.isFinite(group.uploadedAt) ? group.uploadedAt : Date.now(),
      dataUrl: getPhotoDeliveryUrl(previewKey),
      fullSizeUrl: getPhotoDeliveryUrl(fullKey),
      phoneNumber: group.phone || undefined,
      isVideo: false,
      slotIndex: group.layer ? group.layer - 1 : null,
      sessionId: null
    });
  }

  return [...photoItems, ...videoItems].sort((left, right) => right.timestamp - left.timestamp);
};

export const getTotalPhotoCount = async (): Promise<number> => {
  try {
    return (await buildR2Gallery()).length;
  } catch (e) {
    console.error('Error getting photo count:', e);
    return 0;
  }
};

export const getGallery = async (page: number = 1, pageSize: number = 30): Promise<GalleryResult> => {
  try {
    const all = await buildR2Gallery();
    const offset = (page - 1) * pageSize;
    return {
      photos: all.slice(offset, offset + pageSize),
      total: all.length,
      page,
      pageSize,
      totalPages: Math.ceil(all.length / pageSize)
    };
  } catch (e) {
    console.error('Error fetching gallery:', e);
    return { photos: [], total: 0, page, pageSize, totalPages: 0 };
  }
};

export const deletePhotoFromGallery = async (id: string): Promise<void> => {
  invalidateGalleryCache();
  try {
    if (id.startsWith('r2:')) {
      await deleteR2Keys([decodeURIComponent(id.slice(3))]);
      return;
    }

    const token = id.match(/^[0-9a-f-]{36}/i)?.[0] || id;
    const keys = [
      `photos/${id}-full.jpg`,
      `photos/${id}-preview.jpg`,
      ...getPhotoPreviewVideoStorageKeys(token)
    ];
    await deleteR2Keys(keys);
    await bestEffortSupabase('delete', () => supabase.from('photos').delete().eq('id', token));
  } catch (e) {
    console.error('Error deleting photo:', e);
  }
};

export const clearGallery = async (): Promise<void> => {
  invalidateGalleryCache();
  try {
    const objects = await listR2Objects('all');
    const keys = objects.map(object => object.key);
    for (let i = 0; i < keys.length; i += 500) {
      await deleteR2Keys(keys.slice(i, i + 500));
    }
    await bestEffortSupabase('clear', () =>
      supabase.from('photos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    );
  } catch (e) {
    console.error('Error clearing gallery:', e);
  }
};
