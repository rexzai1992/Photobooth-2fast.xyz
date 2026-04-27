import React, { useState, useRef, useEffect } from 'react';
import { LayoutType, Sticker } from '../types';
import { generateComposite } from '../utils/canvasUtils';
import { savePhotoToGallery } from '../utils/storage';
import { uploadBlobToR2 } from '../utils/r2Storage';
import { Save, Palette, Image as ImageIcon, Sliders, X, RotateCw, QrCode, Play, Pause, Video, ExternalLink } from 'lucide-react';
import { getCustomStickers, CustomSticker } from '../utils/stickerStorage';
import { SVG_STRINGS } from './AssetLibrary';
import PhoneInputModal from './PhoneInputModal';
import QRCode from 'qrcode';

interface Props {
  photos: string[];
  layout: LayoutType;
  captureVideos: string[];
  onRestart: () => void;
}


const FRAME_COLORS = [
  { name: 'Classic White', hex: '#ffffff' },
  { name: 'Cream', hex: '#fffbeb' },
  { name: 'Soft Rose', hex: '#ffe4e6' },
  { name: 'Pale Azure', hex: '#e0f2fe' },
  { name: 'Mint', hex: '#d1fae5' },
  { name: 'Lavender', hex: '#f3e8ff' },
  { name: 'Peach', hex: '#ffedd5' },
  { name: 'Lemon', hex: '#fef9c3' },
  { name: 'Slate Gray', hex: '#cbd5e1' },
  { name: 'Obsidian', hex: '#0f172a' },
];

const COMPOSITE_VIDEO_WIDTH = 960;
const COMPOSITE_VIDEO_HEIGHT = 1440;
const COMPOSITE_GAP = 12;
const COMPOSITE_TOP_PADDING = 24;
const COMPOSITE_BOTTOM_PADDING = 24;
const COMPOSITE_CANVAS_PADDING = 16;
const COMPOSITE_CONTENT_SIDE_PADDING = 8;
const COMPOSITE_CONTENT_BOTTOM_SPACER = 16;
const COMPOSITE_SLOT_BORDER_WIDTH = 2;
const COMPOSITE_SLOT_BORDER_COLOR = '#1f2937';
const COMPOSITE_SLOT_BACKGROUND = '#0f172a';
const COMPOSITE_STICKER_BASE_WIDTH = COMPOSITE_VIDEO_WIDTH * 0.125;
const COMPOSITE_FRAME_RATE = 30;
const COMPOSITE_TIMESLICE = 200;
const DOWNLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;
const PREVIEW_VIDEO_EXPORT_REPLAY_COUNT = 1;
const PREVIEW_VIDEO_UI_REPLAY_COUNT = 0;
const PREVIEW_VIDEO_DURATION_SECONDS = 3;
const PREVIEW_VIDEO_EXPORT_DURATION_SECONDS =
  PREVIEW_VIDEO_DURATION_SECONDS * (PREVIEW_VIDEO_EXPORT_REPLAY_COUNT + 1);
const MIN_PREVIEW_VIDEO_DURATION_SECONDS = PREVIEW_VIDEO_EXPORT_DURATION_SECONDS - 0.4;

const blobToDataUrl = (blob: Blob): Promise<string | null> => {
  return new Promise(resolve => {
    if (!blob.size) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64Data = ''] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

const getVideoFileExtension = (mimeType: string): string => {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  return 'webm';
};

const uploadVideoPreviewToR2 = async (photoToken: string, videoDataUrl: string): Promise<string | null> => {
  if (!videoDataUrl.startsWith('data:')) {
    return null;
  }

  try {
    const mimeType = videoDataUrl.match(/^data:(.*?);base64,/)?.[1] || 'video/webm';
    const extension = getVideoFileExtension(mimeType);
    const key = `photos/${photoToken}-preview-video.${extension}`;
    const blob = dataUrlToBlob(videoDataUrl);
    await uploadBlobToR2(key, blob, mimeType);
    return key;
  } catch (error) {
    console.warn('Failed to upload preview video for QR download.', error);
    return null;
  }
};

const getSupportedCompositeMimeTypes = (): string[] => {
  if (typeof MediaRecorder === 'undefined') return ['video/webm'];

  const candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs="avc1.42E01E"',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];

  const supported: string[] = [];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type) && !supported.includes(type)) {
        supported.push(type);
      }
    } catch {
      // Ignore support probe errors.
    }
  }

  if (supported.length === 0) {
    supported.push('video/webm');
  }

  return supported;
};

const loadVideoElement = (src: string): Promise<HTMLVideoElement> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const onLoaded = () => {
      cleanup();
      resolve(video);
    };

    const onError = () => {
      cleanup();
      reject(new Error('Failed to load video layer for composite preview.'));
    };

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
};

const getVideoDurationFromSource = async (source: string): Promise<number | null> => {
  const trimmedSource = typeof source === 'string' ? source.trim() : '';
  if (!trimmedSource) {
    return null;
  }

  try {
    const video = await loadVideoElement(trimmedSource);
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      return null;
    }
    return duration;
  } catch {
    return null;
  }
};

const hasExpectedBoomerangDuration = async (source: string | null): Promise<boolean> => {
  if (!source) {
    return false;
  }

  const duration = await getVideoDurationFromSource(source);
  return duration !== null && duration >= MIN_PREVIEW_VIDEO_DURATION_SECONDS;
};

const loadImageElement = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    const onLoaded = () => {
      cleanup();
      resolve(image);
    };

    const onError = () => {
      cleanup();
      reject(new Error('Failed to load sticker image for composite video.'));
    };

    const cleanup = () => {
      image.removeEventListener('load', onLoaded);
      image.removeEventListener('error', onError);
    };

    image.addEventListener('load', onLoaded, { once: true });
    image.addEventListener('error', onError, { once: true });
    image.src = src;
  });
};

const loadStickerForComposite = async (sticker: Sticker): Promise<{ sticker: Sticker; image: HTMLImageElement } | null> => {
  const stickerType = String(sticker.type || '');

  try {
    if (!stickerType) return null;

    if (sticker.isCustom || !SVG_STRINGS[stickerType]) {
      const image = await loadImageElement(stickerType);
      return { sticker, image };
    }

    const svgBlob = new Blob([SVG_STRINGS[stickerType]], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);
    try {
      const image = await loadImageElement(objectUrl);
      return { sticker, image };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    console.warn('Unable to load sticker for composite video.', stickerType, error);
    return null;
  }
};

const drawCompositeStickers = (
  ctx: CanvasRenderingContext2D,
  loadedStickers: Array<{ sticker: Sticker; image: HTMLImageElement }>
) => {
  loadedStickers.forEach(({ sticker, image }) => {
    const xPosition = (sticker.x / 100) * COMPOSITE_VIDEO_WIDTH;
    const yPosition = (sticker.y / 100) * COMPOSITE_VIDEO_HEIGHT;
    const width = COMPOSITE_STICKER_BASE_WIDTH * sticker.scale;
    const aspectRatio = image.naturalWidth > 0 ? image.naturalHeight / image.naturalWidth : 1;
    const height = width * aspectRatio;

    ctx.save();
    ctx.translate(xPosition, yPosition);
    ctx.rotate((sticker.rotation * Math.PI) / 180);
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  });
};

const drawVideoCover = (
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  width: number,
  height: number,
  mirrored: boolean = false
) => {
  const sourceWidth = video.videoWidth || 1;
  const sourceHeight = video.videoHeight || 1;
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = width / height;

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceAspect > targetAspect) {
    cropWidth = sourceHeight * targetAspect;
    cropX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetAspect;
    cropY = (sourceHeight - cropHeight) / 2;
  }

  if (!mirrored) {
    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, x, y, width, height);
    return;
  }

  ctx.save();
  ctx.translate(x + width, y);
  ctx.scale(-1, 1);
  ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
  ctx.restore();
};

const buildPostcardCompositeVideo = async (
  videoLayers: string[],
  stickers: Sticker[],
  frameColor: string,
  mimeType: string
): Promise<string | null> => {
  if (typeof MediaRecorder === 'undefined' || videoLayers.length === 0) {
    return null;
  }

  const layers = videoLayers.slice(0, 3);
  const videos = await Promise.all(
    layers.map(async (layer) => {
      const source = typeof layer === 'string' ? layer.trim() : '';
      if (!source || !source.startsWith('data:')) {
        return null;
      }

      try {
        return await loadVideoElement(source);
      } catch (error) {
        console.warn('Skipping an invalid video layer during postcard video composition.', error);
        return null;
      }
    })
  );
  const playableVideos = videos.filter((video): video is HTMLVideoElement => Boolean(video));
  if (playableVideos.length === 0) {
    return null;
  }
  const loadedStickers = (await Promise.all(stickers.map(loadStickerForComposite))).filter(
    (item): item is { sticker: Sticker; image: HTMLImageElement } => Boolean(item)
  );

  const canvas = document.createElement('canvas');
  canvas.width = COMPOSITE_VIDEO_WIDTH;
  canvas.height = COMPOSITE_VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const stream = canvas.captureStream(COMPOSITE_FRAME_RATE);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000
    });
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    console.warn('Unable to initialize postcard preview video recorder.', error);
    return null;
  }
  const chunks: Blob[] = [];

  recorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const stopped = new Promise<Blob>(resolve => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  const contentHeight =
    COMPOSITE_VIDEO_HEIGHT -
    (COMPOSITE_CANVAS_PADDING * 2) -
    COMPOSITE_TOP_PADDING -
    COMPOSITE_BOTTOM_PADDING -
    COMPOSITE_CONTENT_BOTTOM_SPACER -
    (COMPOSITE_GAP * 2);
  const slotHeight = contentHeight / 3;
  const slotWidth = COMPOSITE_VIDEO_WIDTH - (COMPOSITE_CANVAS_PADDING * 2) - (COMPOSITE_CONTENT_SIDE_PADDING * 2);
  const slotX = COMPOSITE_CANVAS_PADDING + COMPOSITE_CONTENT_SIDE_PADDING;
  const slotInset = COMPOSITE_SLOT_BORDER_WIDTH / 2;

  const drawFrame = () => {
    ctx.fillStyle = frameColor;
    ctx.fillRect(0, 0, COMPOSITE_VIDEO_WIDTH, COMPOSITE_VIDEO_HEIGHT);

    for (let index = 0; index < 3; index += 1) {
      const y = COMPOSITE_CANVAS_PADDING + COMPOSITE_TOP_PADDING + index * (slotHeight + COMPOSITE_GAP);
      const video = videos[index];
      ctx.fillStyle = COMPOSITE_SLOT_BACKGROUND;
      ctx.fillRect(slotX, y, slotWidth, slotHeight);

      if (video) {
        drawVideoCover(
          ctx,
          video,
          slotX + slotInset,
          y + slotInset,
          Math.max(1, slotWidth - COMPOSITE_SLOT_BORDER_WIDTH),
          Math.max(1, slotHeight - COMPOSITE_SLOT_BORDER_WIDTH),
          true
        );
      }

      ctx.lineWidth = COMPOSITE_SLOT_BORDER_WIDTH;
      ctx.strokeStyle = COMPOSITE_SLOT_BORDER_COLOR;
      ctx.strokeRect(
        slotX + slotInset,
        y + slotInset,
        Math.max(1, slotWidth - COMPOSITE_SLOT_BORDER_WIDTH),
        Math.max(1, slotHeight - COMPOSITE_SLOT_BORDER_WIDTH)
      );
    }

    drawCompositeStickers(ctx, loadedStickers);
  };

  recorder.start(COMPOSITE_TIMESLICE);
  playableVideos.forEach(video => {
    video.currentTime = 0;
  });
  await Promise.all(playableVideos.map(video => video.play().catch(() => undefined)));

  let animationFrame = 0;
  const start = performance.now();

  await new Promise<void>(resolve => {
    const render = () => {
      playableVideos.forEach(video => {
        if (video.ended) {
          video.currentTime = 0;
          void video.play().catch(() => undefined);
        }
      });
      drawFrame();
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed >= PREVIEW_VIDEO_EXPORT_DURATION_SECONDS) {
        resolve();
        return;
      }
      animationFrame = requestAnimationFrame(render);
    };
    render();
  });

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }

  playableVideos.forEach(video => {
    video.pause();
  });

  if (recorder.state !== 'inactive') {
    recorder.stop();
  }
  stream.getTracks().forEach(track => track.stop());

  const blob = await stopped;
  return blobToDataUrl(blob);
};

const buildMirroredSingleVideo = async (videoSource: string, mimeType: string): Promise<string | null> => {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }

  const source = typeof videoSource === 'string' ? videoSource.trim() : '';
  if (!source || !source.startsWith('data:')) {
    return null;
  }

  let video: HTMLVideoElement;
  try {
    video = await loadVideoElement(source);
  } catch (error) {
    console.warn('Unable to load captured video for mirrored export.', error);
    return null;
  }

  const outputWidth = Math.max(1, video.videoWidth || 1280);
  const outputHeight = Math.max(1, video.videoHeight || 720);

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const stream = canvas.captureStream(COMPOSITE_FRAME_RATE);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000
    });
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    console.warn('Unable to initialize mirrored video recorder.', error);
    return null;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const stopped = new Promise<Blob>(resolve => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  const drawFrame = () => {
    ctx.save();
    ctx.translate(outputWidth, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, outputWidth, outputHeight);
    ctx.restore();
  };

  recorder.start(COMPOSITE_TIMESLICE);
  video.currentTime = 0;
  await video.play().catch(() => undefined);

  let animationFrame = 0;
  const start = performance.now();

  await new Promise<void>(resolve => {
    const render = () => {
      if (video.ended) {
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }
      drawFrame();
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed >= PREVIEW_VIDEO_EXPORT_DURATION_SECONDS) {
        resolve();
        return;
      }
      animationFrame = requestAnimationFrame(render);
    };
    render();
  });

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }

  video.pause();
  if (recorder.state !== 'inactive') {
    recorder.stop();
  }
  stream.getTracks().forEach(track => track.stop());

  const blob = await stopped;
  return blobToDataUrl(blob);
};

const buildPostcardCompositeVideoWithFallback = async (
  videoLayers: string[],
  stickers: Sticker[],
  frameColor: string
): Promise<string | null> => {
  for (const mimeType of getSupportedCompositeMimeTypes()) {
    const exportedVideo = await buildPostcardCompositeVideo(videoLayers, stickers, frameColor, mimeType);
    if (!exportedVideo) {
      continue;
    }

    if (await hasExpectedBoomerangDuration(exportedVideo)) {
      return exportedVideo;
    }

    console.warn(`Discarding postcard preview export with short duration using ${mimeType}.`);
  }

  return null;
};

const buildMirroredSingleVideoWithFallback = async (videoSource: string): Promise<string | null> => {
  for (const mimeType of getSupportedCompositeMimeTypes()) {
    const exportedVideo = await buildMirroredSingleVideo(videoSource, mimeType);
    if (!exportedVideo) {
      continue;
    }

    if (await hasExpectedBoomerangDuration(exportedVideo)) {
      return exportedVideo;
    }

    console.warn(`Discarding mirrored preview export with short duration using ${mimeType}.`);
  }

  return null;
};

const PhotoEditor: React.FC<Props> = ({ photos, layout, captureVideos, onRestart }) => {
  const [frameColor, setFrameColor] = useState<string>('#ffffff');
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'paper' | 'stickers'>('stickers');
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [activeStickerId, setActiveStickerId] = useState<string | null>(null);
  const [customStickers, setCustomStickers] = useState<CustomSticker[]>([]);
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState<string | null>(null);
  const [confirmationTimeLeft, setConfirmationTimeLeft] = useState<number>(15);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [qrDownloadUrl, setQrDownloadUrl] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [previewScale, setPreviewScale] = useState<number>(55);

  const containerRef = useRef<HTMLDivElement>(null);
  const previewVideoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const confirmationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const confirmationCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isExportInFlightRef = useRef(false);
  const hasSavedToCloudRef = useRef(false);
  const draggingRef = useRef<{
    id: string;
    mode: 'move' | 'transform';
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialScale: number;
    initialRotation: number;
  } | null>(null);

  useEffect(() => {
    loadCustomStickers();
    startAutoSaveTimeout();

    // Add event listeners for user activity
    const handleUserActivity = () => {
      resetAutoSaveTimeout();
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'touchmove', 'click'];

    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, true);
    });

    return () => {
      clearConfirmationTimers();
      clearAutoSaveTimeout();

      // Remove event listeners
      events.forEach(event => {
        document.removeEventListener(event, handleUserActivity, true);
      });
    };
  }, []);

  useEffect(() => {
    if (!showVideoPreview) {
      previewVideoRefs.current.forEach(video => {
        if (!video) return;
        video.pause();
        video.currentTime = 0;
        delete video.dataset.previewReplayCount;
      });
      setIsVideoPlaying(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void startPreviewVideoPlayback();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showVideoPreview]);

  const loadCustomStickers = async () => {
    const stickers = await getCustomStickers();
    setCustomStickers(stickers);
  };

  const addSticker = (imageUrl: string) => {
    resetAutoSaveTimeout();
    const newSticker: Sticker = {
      id: Math.random().toString(36).substr(2, 9),
      type: imageUrl,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      isCustom: true
    };
    setStickers([...stickers, newSticker]);
    setActiveStickerId(newSticker.id);
  };

  const removeSticker = (id: string, e?: React.MouseEvent | React.PointerEvent) => {
    e?.stopPropagation();
    resetAutoSaveTimeout();
    setStickers(stickers.filter(s => s.id !== id));
    if (activeStickerId === id) setActiveStickerId(null);
  };

  const updateStickerScale = (newScale: number) => {
    if (!activeStickerId) return;
    resetAutoSaveTimeout();
    setStickers(prev => prev.map(s => s.id === activeStickerId ? { ...s, scale: newScale } : s));
  };

  const handlePointerDown = (e: React.PointerEvent, id: string, mode: 'move' | 'transform') => {
    e.stopPropagation();
    e.preventDefault();
    resetAutoSaveTimeout();
    setActiveStickerId(id);
    setActiveTab('stickers');
    const sticker = stickers.find(s => s.id === id);
    if (!sticker) return;
    draggingRef.current = {
      id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialX: sticker.x,
      initialY: sticker.y,
      initialScale: sticker.scale,
      initialRotation: sticker.rotation
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    e.preventDefault();

    const { id, mode, startX, startY, initialX, initialY } = draggingRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();

    if (mode === 'move') {
      const deltaXPx = e.clientX - startX;
      const deltaYPx = e.clientY - startY;
      const deltaXPct = (deltaXPx / containerRect.width) * 100;
      const deltaYPct = (deltaYPx / containerRect.height) * 100;

      let nextX = Math.max(0, Math.min(100, initialX + deltaXPct));
      let nextY = Math.max(0, Math.min(100, initialY + deltaYPct));

      setStickers(prev => prev.map(s => s.id === id ? { ...s, x: nextX, y: nextY } : s));
    } else if (mode === 'transform') {
      const sticker = stickers.find(s => s.id === id);
      if (!sticker) return;
      const centerX = containerRect.left + (initialX / 100) * containerRect.width;
      const centerY = containerRect.top + (initialY / 100) * containerRect.height;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const angleRad = Math.atan2(dy, dx);
      const angleDeg = angleRad * (180 / Math.PI);
      const rotation = angleDeg - 45;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const baseRadius = (containerRect.width * 0.125) / 1.414;
      const newScale = Math.max(0.2, distance / baseRadius);

      setStickers(prev => prev.map(s => s.id === id ? { ...s, rotation: rotation, scale: newScale } : s));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingRef.current) {
      (e.target as Element).releasePointerCapture(e.pointerId);
      draggingRef.current = null;
    }
  };

  const activeSticker = stickers.find(s => s.id === activeStickerId);
  const hasVideoLayersForPreview = layout === 'postcard' && captureVideos.length > 0;

  const setPreviewVideoRef = (index: number, element: HTMLVideoElement | null) => {
    previewVideoRefs.current[index] = element;
  };

  const getPreviewVideos = () =>
    previewVideoRefs.current.filter((video): video is HTMLVideoElement => Boolean(video));

  const syncPreviewVideoPlayingState = () => {
    const videos = getPreviewVideos();
    setIsVideoPlaying(videos.some(video => !video.paused && !video.ended));
  };

  const startPreviewVideoPlayback = async () => {
    const videos = getPreviewVideos();
    if (videos.length === 0) {
      setIsVideoPlaying(false);
      return;
    }

    try {
      await Promise.all(
        videos.map(video => {
          video.dataset.previewReplayCount = '0';
          video.currentTime = 0;
          return video.play().catch(() => undefined);
        })
      );
      syncPreviewVideoPlayingState();
    } catch (err) {
      console.error('Video preview playback failed:', err);
      setIsVideoPlaying(false);
    }
  };

  const handlePreviewVideoEnded = (video: HTMLVideoElement) => {
    const replayCountRaw = Number(video.dataset.previewReplayCount ?? '0');
    const replayCount = Number.isFinite(replayCountRaw) ? replayCountRaw : 0;

    if (replayCount < PREVIEW_VIDEO_UI_REPLAY_COUNT) {
      video.dataset.previewReplayCount = String(replayCount + 1);
      video.currentTime = 0;
      void video.play().catch(() => {
        syncPreviewVideoPlayingState();
      });
      return;
    }

    syncPreviewVideoPlayingState();
  };

  const handleVideoPlaybackToggle = async () => {
    if (!hasVideoLayersForPreview) return;

    if (!showVideoPreview) {
      setShowVideoPreview(true);
      return;
    }

    const videos = getPreviewVideos();
    if (videos.length === 0) return;

    const currentlyPlaying = videos.some(video => !video.paused && !video.ended);
    if (currentlyPlaying) {
      videos.forEach(video => video.pause());
      setIsVideoPlaying(false);
      return;
    }

    try {
      await startPreviewVideoPlayback();
    } catch (err) {
      console.error('Video preview playback failed:', err);
      setIsVideoPlaying(false);
    }
  };

  const handleExport = async () => {
    if (isExportInFlightRef.current) {
      return;
    }

    if (hasSavedToCloudRef.current) {
      if (qrCodeUrl) {
        setShowQrCode(true);
      }
      return;
    }

    isExportInFlightRef.current = true;
    setIsExporting(true);
    clearAutoSaveTimeout();
    try {
      const dataUrl = await generateComposite(layout, photos, stickers, frameColor);
      setPendingPhotoDataUrl(dataUrl);

      // Save the photo to the gallery and get the photo ID
      const photoId = await savePhotoToGallery(dataUrl);
      hasSavedToCloudRef.current = true;
      console.log('Photo saved successfully with ID:', photoId);

      // Use persisted photo ID as download token so links work on any device.
      const photoToken = photoId;
      const configuredPublicUrlRaw = (import.meta.env.VITE_PUBLIC_URL || '').trim();
      const configuredPublicUrl = configuredPublicUrlRaw
        ? (/^https?:\/\//i.test(configuredPublicUrlRaw) ? configuredPublicUrlRaw : `https://${configuredPublicUrlRaw}`)
        : '';
      const downloadBaseUrl = (configuredPublicUrl || window.location.origin).replace(/\/+$/, '');
      const expiresAt = Date.now() + DOWNLOAD_TOKEN_TTL_MS;

      // Store the photo temporarily with the token for same-browser download page.
      let selectedVideoForDownload: string | null = captureVideos[0] || null;
      let usedComposedVideo = false;
      if (layout === 'postcard' && captureVideos.length > 0) {
        try {
          const composedPreviewVideo = await buildPostcardCompositeVideoWithFallback(
            captureVideos,
            stickers,
            frameColor
          );
          if (composedPreviewVideo) {
            selectedVideoForDownload = composedPreviewVideo;
            usedComposedVideo = true;
          }
        } catch (videoComposeError) {
          console.warn('Postcard video composition failed, continuing with photo QR flow.', videoComposeError);
        }
      }

      if (selectedVideoForDownload && !usedComposedVideo) {
        try {
          const mirroredPreviewVideo = await buildMirroredSingleVideoWithFallback(selectedVideoForDownload);
          if (mirroredPreviewVideo) {
            selectedVideoForDownload = mirroredPreviewVideo;
          }
        } catch (videoMirrorError) {
          console.warn('Mirroring preview video failed, using original capture orientation.', videoMirrorError);
        }
      }

      if (selectedVideoForDownload && !(await hasExpectedBoomerangDuration(selectedVideoForDownload))) {
        console.warn('Preview video is shorter than expected 6s boomerang target; skipping video upload.');
        selectedVideoForDownload = null;
      }

      const expectedVideoPath = selectedVideoForDownload
        ? await uploadVideoPreviewToR2(photoToken, selectedVideoForDownload)
        : null;
      const downloadParams = new URLSearchParams();
      if (expectedVideoPath) {
        downloadParams.set('v', '1');
        const videoExtension = expectedVideoPath.split('.').pop()?.toLowerCase();
        if (videoExtension) {
          downloadParams.set('ve', videoExtension);
        }
      }
      const downloadUrl = `${downloadBaseUrl}/download/${encodeURIComponent(photoToken)}${downloadParams.size ? `?${downloadParams.toString()}` : ''}`;

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(downloadUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Include photoId so we can update metadata with phone number later.
      try {
        sessionStorage.setItem(`photo_${photoToken}`, JSON.stringify({
          dataUrl,
          photoId,
          captureVideo: selectedVideoForDownload,
          captureVideoPath: expectedVideoPath,
          expiresAt
        }));
      } catch (storageError) {
        console.warn('Session storage is full, saving photo payload without video.', storageError);
        sessionStorage.setItem(`photo_${photoToken}`, JSON.stringify({
          dataUrl,
          photoId,
          expiresAt
        }));
      }

      setQrCodeUrl(qrCodeDataUrl);
      setQrDownloadUrl(downloadUrl);
      setShowQrCode(true);

    } catch (err) {
      console.error('Error during save process:', err);
      const reason = err instanceof Error ? err.message : 'Unknown save error';

      if (reason.toLowerCase().includes('r2 bucket binding is missing')) {
        alert('Storage is not configured correctly. Please check your Cloudflare R2 binding.');
      } else {
        alert("Something went wrong while saving your photo. Please try again.");
      }
    } finally {
      setIsExporting(false);
      isExportInFlightRef.current = false;
    }
  };

  const startConfirmationCountdown = () => {
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
    }
    if (confirmationCountdownRef.current) {
      clearTimeout(confirmationCountdownRef.current);
    }
    setConfirmationTimeLeft(15);

    confirmationTimeoutRef.current = setTimeout(() => {
      onRestart();
    }, 15000);

    const startTime = Date.now();
    const updateCountdown = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((15000 - elapsed) / 1000));
      setConfirmationTimeLeft(remaining);

      if (remaining > 0) {
        confirmationCountdownRef.current = setTimeout(updateCountdown, 1000);
      }
    };
    updateCountdown();
  };

  const clearConfirmationTimers = () => {
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
    }
    if (confirmationCountdownRef.current) {
      clearTimeout(confirmationCountdownRef.current);
    }
  };

  const startAutoSaveTimeout = () => {
    if (hasSavedToCloudRef.current) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      handleAutoSave();
    }, 60000); // 1 minute = 60000ms
  };

  const resetAutoSaveTimeout = () => {
    if (hasSavedToCloudRef.current) {
      return;
    }

    startAutoSaveTimeout();
  };

  const clearAutoSaveTimeout = () => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
  };

  const handleAutoSave = async () => {
    if (isExporting || isExportInFlightRef.current || hasSavedToCloudRef.current) {
      return;
    }

    setIsExporting(true);
    try {
      const dataUrl = await generateComposite(layout, photos, stickers, frameColor);
      await savePhotoToGallery(dataUrl); // Save without phone number for auto-save
      hasSavedToCloudRef.current = true;
      // Return to main page after auto-save
      onRestart();
    } catch (err) {
      console.error('Auto-save failed:', err);
      // If auto-save fails, still return to main page
      onRestart();
    } finally {
      setIsExporting(false);
    }
  };

  const handlePhoneSubmit = async (phoneNumber: string) => {
    if (!pendingPhotoDataUrl) return;

    setIsExporting(true);
    try {
      await savePhotoToGallery(pendingPhotoDataUrl, phoneNumber);
      hasSavedToCloudRef.current = true;
      setShowPhoneInput(false);
      setShowSaveConfirmation(true);
      setPendingPhotoDataUrl(null);
      startConfirmationCountdown();
    } catch (err) {
      console.error(err);
      alert("Something went wrong while saving your photo.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSkipPhone = async () => {
    if (!pendingPhotoDataUrl) return;

    setIsExporting(true);
    try {
      await savePhotoToGallery(pendingPhotoDataUrl);
      hasSavedToCloudRef.current = true;
      setShowPhoneInput(false);
      setShowSaveConfirmation(true);
      setPendingPhotoDataUrl(null);
      startConfirmationCountdown();
    } catch (err) {
      console.error(err);
      alert("Something went wrong while saving your photo.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancelPhoneInput = () => {
    setShowPhoneInput(false);
    setPendingPhotoDataUrl(null);
  };

  const showSaveProcessingOverlay = isExporting && isExportInFlightRef.current && !showQrCode;

  return (
    <div className="flex flex-row h-[100dvh] w-full relative z-20 overflow-hidden bg-slate-950">
      
      {/* 1. Canvas Preview Area (Left side, takes remaining width) */}
      <div
        className="flex-1 h-full relative overflow-hidden bg-slate-900 flex items-center justify-center p-2"
        onPointerDown={() => setActiveStickerId(null)}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-20 pointer-events-none"
             style={{ backgroundImage: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)' }}>
        </div>

        {/* The Scalable Canvas Container */}
        <div
          ref={containerRef}
          className="relative shrink-0 transition-all group border-4 border-slate-800 shadow-2xl touch-none"
          style={{
             height: `${previewScale}vh`,
             width: 'auto',
             aspectRatio: '2/3',
             background: frameColor,
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        > 
           {/* Aspect Ratio Enforcer: Invisible SVG matches the 2/3 aspect ratio to prevent collapse */}
           <svg 
              viewBox="0 0 200 300" 
              className="w-full h-full opacity-0 pointer-events-none block" 
              style={{ maxHeight: '100%', maxWidth: '100%' }}
           />

           {/* ================= Photos Layer ================= */}
           <div className="absolute inset-0 p-4 flex flex-col items-center z-10 select-none">
              {showVideoPreview && hasVideoLayersForPreview ? (
                <div className="w-full h-full flex flex-col gap-2 items-center justify-start py-6 px-2">
                  {photos.map((_, index) => {
                    const layerVideo = captureVideos[index];
                    return (
                      <div key={`video-layer-${index}`} className="bg-black shadow-md w-full flex-1 relative overflow-hidden border border-amber-200/15 rounded-sm">
                        {layerVideo ? (
                          <video
                            ref={(node) => setPreviewVideoRef(index, node)}
                            src={layerVideo}
                            autoPlay
                            muted
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                            onPause={syncPreviewVideoPlayingState}
                            onEnded={(event) => handlePreviewVideoEnded(event.currentTarget)}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs uppercase tracking-widest">
                            No Video Layer
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="h-4 md:h-6 w-full"></div>
                </div>
              ) : (
                <>
                  {layout === 'postcard' && (
                    <div className="w-full h-full flex flex-col gap-2 items-center justify-start py-6 px-2">
                      {photos.map((src, i) => (
                        <div key={i} className="bg-transparent shadow-md w-full flex-1 relative overflow-hidden">
                            <img src={src} alt={`Capture ${i}`} className="w-full h-full object-cover block pointer-events-none" />
                        </div>
                      ))}
                      <div className="h-4 md:h-6 w-full"></div>
                    </div>
                  )}
                  
                  {layout === 'strips' && (
                    <div className="w-full h-full flex gap-[1%] justify-center px-[3%] py-[2%] items-center">
                      {[0, 1].map(stripIdx => {
                        return (
                          <div key={stripIdx} className="flex-1 h-full flex flex-col py-[3%] px-[3%] gap-[1%]" style={{ backgroundColor: frameColor }}>
                            {photos.slice(0, 4).map((src, i) => (
                              <div key={`${stripIdx}-${i}`} className="w-full relative overflow-hidden pointer-events-none" style={{ aspectRatio: '4/3' }}>
                                <img src={src} className="absolute inset-0 w-full h-full object-cover" alt="strip" />
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
           </div>

           {/* ================= Stickers Layer ================= */}
           {stickers.map(sticker => (
             <div
               key={sticker.id}
               style={{
                 position: 'absolute',
                 left: `${sticker.x}%`,
                 top: `${sticker.y}%`,
                 width: `${12.5 * sticker.scale}%`,
                 height: 'auto',
                 transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
                 cursor: activeStickerId === sticker.id ? 'move' : 'grab',
                 touchAction: 'none'
               }}
               className={`group transition-all duration-75 ${activeStickerId === sticker.id ? 'z-50' : 'z-40'}`}
             >
                <div
                    onPointerDown={(e) => handlePointerDown(e, sticker.id, 'move')}
                    className={`relative transition-all duration-200 rounded-lg ${
                        activeStickerId === sticker.id
                        ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-transparent shadow-[0_0_15px_rgba(251,191,36,0.3)] bg-white/5'
                        : 'hover:ring-1 hover:ring-white/30'
                    }`}>
                    <img
                      src={sticker.type}
                      alt="Custom sticker"
                      className="w-full h-full drop-shadow-lg select-none pointer-events-none object-contain"
                    />

                    {activeStickerId === sticker.id && (
                        <>
                            <button
                                onPointerDown={(e) => removeSticker(sticker.id, e)}
                                className="absolute -top-8 -right-8 bg-red-500 text-white rounded-full p-3 shadow-lg hover:bg-red-600 transition-colors z-50 transform hover:scale-110 active:scale-90"
                            >
                                <X size={16} />
                            </button>
                            <div
                                onPointerDown={(e) => handlePointerDown(e, sticker.id, 'transform')}
                                className="absolute -bottom-8 -right-8 bg-amber-400 text-slate-900 rounded-full p-3 shadow-lg hover:bg-amber-300 transition-colors z-50 cursor-nwse-resize transform hover:scale-110 active:scale-90"
                            >
                                <RotateCw size={16} />
                            </div>
                        </>
                    )}
                </div>
             </div>
           ))}

        </div>
      </div>

      {/* 2. Tools Panel (Right side sidebar) */}
      <div className="w-72 lg:w-64 xl:w-72 h-full flex-shrink-0 bg-slate-950 border-l border-white/5 flex flex-col p-4 md:p-5 z-30 overflow-hidden">
        {/* Retouching Header & Tabs */}
        <div className="shrink-0 mb-4 sticky top-0 bg-slate-950 z-10">
            <h2 className="text-xl md:text-2xl font-serif text-amber-100 mb-4">Retouching</h2>

            <div className="flex border-b border-white/10">
                <button 
                  onClick={() => {
                    resetAutoSaveTimeout();
                    setActiveTab('stickers');
                  }}
                  className={`flex-1 py-3 text-center text-xs md:text-sm uppercase tracking-widest font-serif transition-all flex items-center justify-center gap-2 ${activeTab === 'stickers' ? 'text-amber-200 border-b-2 border-amber-200 bg-white/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                >
                  <ImageIcon size={14} /> Embellish
                </button>
                <button 
                  onClick={() => {
                    resetAutoSaveTimeout();
                    setActiveTab('paper');
                  }}
                  className={`flex-1 py-3 text-center text-xs md:text-sm uppercase tracking-widest font-serif transition-all flex items-center justify-center gap-2 ${activeTab === 'paper' ? 'text-amber-200 border-b-2 border-amber-200 bg-white/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                >
                  <Palette size={14} /> Paper
                </button>
            </div>

	            {/* Save Button */}
	            <div className="mt-4 mb-4">
	              <button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full bg-amber-200 text-slate-900 py-3 rounded font-serif font-bold tracking-wide flex items-center justify-center gap-2 hover:bg-white hover:shadow-[0_0_20px_rgba(253,230,138,0.3)] transition-all disabled:opacity-50 text-sm active:scale-[0.98]"
              >
                {showSaveProcessingOverlay ? (
                  <>
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-900/35 border-t-slate-900 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <QrCode size={16} /> Save
                  </>
                )}
	              </button>
	            </div>

              <div className="mb-4 p-3 bg-slate-900/60 border border-amber-200/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-amber-100 text-xs uppercase tracking-widest font-serif">
                    <Sliders size={12} />
                    Preview Size
                  </div>
                  <span className="text-xs text-amber-200 font-mono">{previewScale}%</span>
                </div>
                <input
                  type="range"
                  min="55"
                  max="90"
                  step="1"
                  value={previewScale}
                  onChange={(event) => setPreviewScale(parseInt(event.target.value, 10))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
              </div>

	            {hasVideoLayersForPreview && (
              <div className="mb-4 p-3 bg-slate-900/60 border border-amber-200/20 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-amber-100 text-xs uppercase tracking-widest font-serif">
                  <Video size={12} />
                  Portrait Video Layers
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleVideoPlaybackToggle}
                    className="flex-1 bg-slate-800/70 border border-amber-200/30 text-amber-100 py-2 rounded font-serif text-sm font-bold tracking-wide flex items-center justify-center gap-2 hover:bg-slate-700 transition-all active:scale-[0.98]"
                  >
                    {isVideoPlaying ? <Pause size={14} /> : <Play size={14} />}
                    {isVideoPlaying ? 'Pause Video' : 'Play Video'}
                  </button>
                  <button
                    onClick={() => {
                      setShowVideoPreview(false);
                      setIsVideoPlaying(false);
                    }}
                    className="px-3 bg-slate-800/70 border border-amber-200/30 text-amber-100 rounded font-serif text-xs hover:bg-slate-700 transition-all active:scale-[0.98]"
                  >
                    Photo View
                  </button>
                </div>
              </div>
            )}
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
            {activeTab === 'stickers' && (
              <div className="animate-fade-in space-y-4">
                  {activeSticker && (
                    <div className="p-4 bg-slate-900/50 rounded-lg border border-amber-200/20">
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-xs uppercase tracking-widest text-amber-100 flex items-center gap-2">
                          <Sliders size={12} /> Size
                        </label>
                        <span className="text-xs text-amber-200 font-mono">{(activeSticker.scale * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="2.5"
                        step="0.05"
                        value={activeSticker.scale}
                        onChange={(e) => updateStickerScale(parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                      />
                    </div>
                  )}

                  {customStickers.length > 0 ? (
                    <div>
                      <h3 className="text-xs uppercase tracking-widest text-amber-100 mb-3">Available Stickers</h3>
                      <div className="grid grid-cols-3 gap-2">
                        {customStickers.map(sticker => (
                          <button
                            key={sticker.id}
                            onClick={() => addSticker(sticker.image_url)}
                            className="aspect-square bg-slate-900 rounded border border-white/5 hover:border-amber-200/40 hover:bg-slate-800 transition-all p-1 flex items-center justify-center w-full active:scale-95 group"
                          >
                            <img
                              src={sticker.image_url}
                              alt={sticker.name}
                              className="w-full h-full object-contain opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <ImageIcon size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No stickers available yet</p>
                      <p className="text-xs mt-1">Contact admin to add stickers</p>
                    </div>
                  )}
              </div>
            )}

            {activeTab === 'paper' && (
              <div className="animate-fade-in pt-2">
                  <div className="flex flex-wrap gap-4 justify-center">
                      {FRAME_COLORS.map(color => (
                      <button
                          key={color.name}
                          onClick={() => {
                            resetAutoSaveTimeout();
                            setFrameColor(color.hex);
                          }}
                          className={`w-16 h-16 rounded-full border border-white/10 transition-all transform hover:scale-110 active:scale-95 shadow-lg ${frameColor === color.hex ? 'ring-4 ring-amber-200 ring-offset-4 ring-offset-slate-950 scale-110' : ''}`}
                          style={{ backgroundColor: color.hex }}
                          title={color.name}
                      />
                      ))}
                  </div>
                  <p className="text-center text-slate-500 mt-6 text-sm font-serif italic">Select a paper stock for your print.</p>
              </div>
            )}
        </div>

        {/* Actions - Fixed at bottom of tools panel */}
        <div className="pt-4 border-t border-white/5 bg-slate-950 mt-2">
        </div>
      </div>

      {showSaveProcessingOverlay && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-200/20 rounded-2xl p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-amber-200/25 border-t-amber-200 animate-spin" />
            <h2 className="text-xl font-serif text-amber-100 mb-2">Processing</h2>
            <p className="text-slate-300 text-sm">
              Saving your photo and preparing your download link. Please wait.
            </p>
          </div>
        </div>
      )}

      {/* Phone Input Modal */}
      {showPhoneInput && (
        <PhoneInputModal
          onSubmit={handlePhoneSubmit}
          onSkip={handleSkipPhone}
          onCancel={handleCancelPhoneInput}
          isSubmitting={isExporting}
        />
      )}

      {/* QR Code Modal */}
      {showQrCode && qrCodeUrl && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-200/20 rounded-lg shadow-2xl max-w-md w-full p-8 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-amber-200/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <QrCode size={32} className="text-amber-200" />
              </div>
              <h2 className="text-2xl font-serif text-white mb-2">Download Your Photo</h2>
              <p className="text-slate-300 text-lg mb-4">
                Scan this QR on another device, or open the link directly on this phone.
              </p>
              <div className="bg-white p-4 rounded-lg inline-block">
                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
              </div>
              {qrDownloadUrl && (
                <p className="mt-4 text-xs text-slate-400 break-all px-2">
                  {qrDownloadUrl}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              {qrDownloadUrl && (
                <button
                  onClick={() => {
                    window.location.href = qrDownloadUrl;
                  }}
                  className="flex-1 bg-white/5 border border-white/15 text-white py-3 rounded font-serif hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink size={16} />
                  Open Link
                </button>
              )}
              <button
                onClick={() => {
                  setShowQrCode(false);
                  setQrCodeUrl(null);
                  setQrDownloadUrl(null);
                  // Don't clear pendingPhotoDataUrl here as it might be used later
                  onRestart();
                }}
                className={`${qrDownloadUrl ? 'flex-1' : 'w-full'} bg-amber-200 text-slate-900 py-3 rounded font-serif font-bold hover:bg-white hover:shadow-[0_0_20px_rgba(253,230,138,0.3)] transition-all`}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal */}
      {showSaveConfirmation && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-200/20 rounded-lg shadow-2xl max-w-md w-full p-8 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-amber-200/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Save size={32} className="text-amber-200" />
              </div>
              <h2 className="text-2xl font-serif text-white mb-2">Photo Saved!</h2>
              <p className="text-slate-300 text-lg">
                Photo Print Promotion <span className="text-amber-200 font-bold">RM 5</span> get 1 picture <span className="text-amber-200 font-bold">RM 10</span> get 3 Picture.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  clearConfirmationTimers();
                  setShowSaveConfirmation(false);
                }}
                className="flex-1 bg-transparent border border-amber-200/30 text-amber-100 py-3 rounded font-serif hover:bg-amber-200/5 transition-colors"
              >
                Continue
              </button>
              <button
                onClick={() => {
                  clearConfirmationTimers();
                  onRestart();
                }}
                className="flex-1 bg-amber-200 text-slate-900 py-3 rounded font-serif font-bold hover:bg-white hover:shadow-[0_0_20px_rgba(253,230,138,0.3)] transition-all"
              >
                Back to Home
              </button>
            </div>

            <p className="text-center text-slate-600 text-xs mt-4 flex items-center justify-center gap-2">
              <span>Returning to home in</span>
              <span className="text-amber-200 font-mono font-semibold">{confirmationTimeLeft}s</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoEditor;
