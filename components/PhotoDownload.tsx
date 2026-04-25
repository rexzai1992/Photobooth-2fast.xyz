import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { savePhotoToGallery, updatePhotoPhoneNumber } from '../utils/storage';
import { Download, Phone, CheckCircle, ArrowLeft, Video } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { getPhotoDeliveryUrl } from '../utils/r2Storage';

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const LOOKUP_RETRIES = 5;
const LOOKUP_RETRY_DELAY_MS = 600;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRED_MESSAGE = 'This download link expired after 10 minutes. Please scan a new QR code.';
const MAX_PHONE_INPUT_LENGTH = 20;
const PREVIEW_VIDEO_REPLAY_COUNT = 1;
const PREVIEW_VIDEO_EXTENSION = 'webm';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to read image blob.'));
    };
    reader.onerror = () => reject(new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });

const ensureDataUrl = async (value: string): Promise<string> => {
  if (value.startsWith('data:')) {
    return value;
  }

  const response = await fetch(value);
  if (!response.ok) {
    throw new Error(`Failed to load image source (${response.status})`);
  }

  const blob = await response.blob();
  return blobToDataUrl(blob);
};

const parseExpiresAtValue = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const isExpired = (expiresAt: number | null): boolean =>
  expiresAt !== null && Date.now() > expiresAt;

const getExpiryFromCreatedAt = (createdAt: string | null | undefined): number | null => {
  if (!createdAt) {
    return null;
  }
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return null;
  }
  return createdAtMs + TOKEN_TTL_MS;
};

const normalizeToken = (value: string): string => {
  const trimmed = value.trim();
  try {
    return decodeURIComponent(trimmed).trim();
  } catch {
    return trimmed;
  }
};

const extractTokenCandidates = (rawToken: string): string[] => {
  const normalized = normalizeToken(rawToken);
  const candidates: string[] = [];

  if (UUID_PATTERN.test(normalized)) {
    candidates.push(normalized.toLowerCase());
  }

  const matched = normalized.match(UUID_PATTERN)?.[0]?.toLowerCase();
  if (matched && !candidates.includes(matched)) {
    candidates.push(matched);
  }

  return candidates;
};

const numberPadRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['+', '0', '⌫']
];

const getFileExtensionFromMimeType = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  return 'jpg';
};

const PhotoDownload: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [captureVideoUrl, setCaptureVideoUrl] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const previewVideoReplayCountRef = useRef(0);

  const handleNumberPadInput = (value: string) => {
    setPhoneNumber(prev => {
      if (value === '⌫') {
        return prev.slice(0, -1);
      }

      if (value === '+') {
        if (prev.length > 0 || prev.includes('+')) {
          return prev;
        }
        return '+';
      }

      if (prev.length >= MAX_PHONE_INPUT_LENGTH) {
        return prev;
      }

      return `${prev}${value}`;
    });
  };

  const handlePhoneClear = () => {
    setPhoneNumber('');
  };

  const showExpiredState = () => {
    setPhotoDataUrl(null);
    setCaptureVideoUrl(null);
    setPhotoId(null);
    setError(TOKEN_EXPIRED_MESSAGE);
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'auto';
    document.body.style.overscrollBehavior = 'contain';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, []);

  useEffect(() => {
    if (!expiresAt) {
      return;
    }

    if (isExpired(expiresAt)) {
      showExpiredState();
      return;
    }

    const timeout = window.setTimeout(() => {
      showExpiredState();
    }, Math.max(0, expiresAt - Date.now()));

    return () => {
      window.clearTimeout(timeout);
    };
  }, [expiresAt]);

  useEffect(() => {
    if (!token) return;

    let isCancelled = false;

    const loadPhoto = async () => {
      setIsSaved(false);
      setError('');
      setCaptureVideoUrl(null);

      const normalizedToken = normalizeToken(token);
      const tokenCandidates = extractTokenCandidates(normalizedToken);
      const searchParams = new URLSearchParams(location.search);
      const previewPathHint = searchParams.get('preview')?.trim() || '';
      const fullPathHint = searchParams.get('full')?.trim() || '';
      const videoPathHint = searchParams.get('video')?.trim() || '';
      const videoFlag = (searchParams.get('v') || '').trim().toLowerCase();
      const hasVideoFlag = videoFlag === '1' || videoFlag === 'true' || videoFlag === 'yes';
      const expiryFromQuery = parseExpiresAtValue(searchParams.get('exp'));
      const primaryToken = tokenCandidates[0] || null;
      const inferredPreviewPath = primaryToken ? `photos/${primaryToken}-preview.jpg` : '';
      const inferredFullPath = primaryToken ? `photos/${primaryToken}-full.jpg` : '';
      const inferredVideoPath = primaryToken ? `photos/${primaryToken}-preview-video.${PREVIEW_VIDEO_EXTENSION}` : '';
      const hintedPath = previewPathHint || fullPathHint || inferredPreviewPath || inferredFullPath;
      const resolvedVideoPathHint = videoPathHint || (hasVideoFlag ? inferredVideoPath : '');
      setExpiresAt(expiryFromQuery);

      if (isExpired(expiryFromQuery)) {
        if (!isCancelled) {
          showExpiredState();
        }
        return;
      }

      if (resolvedVideoPathHint && !isCancelled) {
        setCaptureVideoUrl(getPhotoDeliveryUrl(resolvedVideoPathHint));
      }

      // 1) Fast path for same-browser flow (legacy/session behavior).
      const sessionKeyCandidates = Array.from(new Set([token, normalizedToken])).filter(Boolean);
      for (const sessionToken of sessionKeyCandidates) {
        const alreadySavedOnce = sessionStorage.getItem(`phone_saved_${sessionToken}`) === '1';
        const storedData = sessionStorage.getItem(`photo_${sessionToken}`);
        if (!storedData) {
          continue;
        }

        try {
          const parsed = JSON.parse(storedData);
          const expiryFromStorage =
            typeof parsed?.expiresAt === 'number' && Number.isFinite(parsed.expiresAt)
              ? parsed.expiresAt
              : expiryFromQuery;

          if (isExpired(expiryFromStorage)) {
            sessionStorage.removeItem(`photo_${sessionToken}`);
            continue;
          }

          if (typeof parsed === 'string') {
            if (!isCancelled) {
              setPhotoDataUrl(parsed);
              setPhotoId(tokenCandidates[0] || normalizedToken || sessionToken);
              if (alreadySavedOnce) {
                setIsSaved(true);
              }
            }
            return;
          }

          if (!isCancelled) {
            setPhotoDataUrl(typeof parsed?.dataUrl === 'string' ? parsed.dataUrl : null);
            setPhotoId(typeof parsed?.photoId === 'string' ? parsed.photoId : tokenCandidates[0] || normalizedToken || sessionToken);
            if (typeof parsed?.captureVideoPath === 'string' && parsed.captureVideoPath.trim()) {
              setCaptureVideoUrl(getPhotoDeliveryUrl(parsed.captureVideoPath));
            } else if (typeof parsed?.captureVideo === 'string') {
              setCaptureVideoUrl(getPhotoDeliveryUrl(parsed.captureVideo));
            } else if (Array.isArray(parsed?.captureVideos)) {
              const firstVideo = parsed.captureVideos.find((item: unknown) => typeof item === 'string');
              setCaptureVideoUrl(typeof firstVideo === 'string' ? getPhotoDeliveryUrl(firstVideo) : null);
            }
            if (alreadySavedOnce) {
              setIsSaved(true);
            }
          }
          return;
        } catch {
          if (isExpired(expiryFromQuery)) {
            sessionStorage.removeItem(`photo_${sessionToken}`);
            continue;
          }

          if (!isCancelled) {
            setPhotoDataUrl(storedData);
            setPhotoId(tokenCandidates[0] || normalizedToken || sessionToken);
            if (alreadySavedOnce) {
              setIsSaved(true);
            }
          }
          return;
        }
      }

      // 2) R2-first path for cross-device flows with inferred or explicit object hints.
      if (hintedPath) {
        setPhotoDataUrl(getPhotoDeliveryUrl(hintedPath));
        setPhotoId(tokenCandidates[0] || null);
      }

      // 3) Cross-device: read persisted record by token (retry to absorb replication delays).
      let data: {
        id: string;
        storage_path?: string | null;
        preview_path?: string | null;
        image_data?: string | null;
        created_at?: string | null;
        phone_number?: string | null;
      } | null = null;
      let fetchError: unknown = null;

      for (let attempt = 0; attempt < LOOKUP_RETRIES && !data && !isCancelled; attempt += 1) {
        for (const candidateId of tokenCandidates) {
          const response = await supabase
            .from('photos')
            .select('id, storage_path, preview_path, image_data, created_at, phone_number')
            .eq('id', candidateId)
            .maybeSingle();

          if (response.error) {
            fetchError = response.error;
            continue;
          }

          if (response.data) {
            data = response.data;
            break;
          }
        }

        if (!data && attempt < LOOKUP_RETRIES - 1) {
          await sleep(LOOKUP_RETRY_DELAY_MS);
        }
      }

      if (isCancelled) {
        return;
      }

      if (data) {
        const expiryFromRecord = getExpiryFromCreatedAt(data.created_at);
        const effectiveExpiry = expiryFromQuery ?? expiryFromRecord;
        if (effectiveExpiry) {
          setExpiresAt(effectiveExpiry);
        }

        if (isExpired(effectiveExpiry)) {
          showExpiredState();
          return;
        }

        const savedPhoneNumber = typeof data.phone_number === 'string' ? data.phone_number.trim() : '';
        if (savedPhoneNumber) {
          setPhoneNumber(savedPhoneNumber);
          setIsSaved(true);
          if (tokenCandidates.length > 0) {
            tokenCandidates.forEach(candidate => {
              sessionStorage.setItem(`phone_saved_${candidate}`, '1');
            });
          }
        }

        const path = data.preview_path || data.storage_path;
        if (path) {
          setPhotoDataUrl(getPhotoDeliveryUrl(path));
          setPhotoId(data.id);
          return;
        }

        if (typeof data.image_data === 'string' && data.image_data) {
          setPhotoDataUrl(data.image_data);
          setPhotoId(data.id);
          return;
        }
      }

      // 4) Fallback from inferred/URL hint if record lookup is delayed/unavailable.
      if (hintedPath) {
        return;
      }

      if (fetchError) {
        console.error('Error loading photo by token:', fetchError);
      }
      setError('Photo not found or link expired. Please scan a new QR code.');
    };

    loadPhoto();

    return () => {
      isCancelled = true;
    };
  }, [token, location.search]);

  useEffect(() => {
    previewVideoReplayCountRef.current = 0;
  }, [captureVideoUrl]);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoDataUrl || !phoneNumber.trim()) return;

    if (isExpired(expiresAt)) {
      showExpiredState();
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (photoId) {
        // Update existing photo record with phone number.
        // In R2-first mode, metadata row may not exist yet, so fall back to creating one.
        try {
          await updatePhotoPhoneNumber(photoId, phoneNumber.trim());
        } catch {
          const dataUrlForSave = await ensureDataUrl(photoDataUrl);
          const newPhotoId = await savePhotoToGallery(dataUrlForSave, phoneNumber.trim());
          setPhotoId(newPhotoId);
        }
      } else {
        // Fallback: save as new photo (for legacy compatibility / R2-only flows)
        const dataUrlForSave = await ensureDataUrl(photoDataUrl);
        const newPhotoId = await savePhotoToGallery(dataUrlForSave, phoneNumber.trim());
        setPhotoId(newPhotoId);
      }
      setIsSaved(true);

      // Clear the photo from sessionStorage after successful save
      if (token) {
        sessionStorage.removeItem(`photo_${token}`);
        sessionStorage.setItem(`phone_saved_${token}`, '1');
        const normalizedToken = normalizeToken(token);
        if (normalizedToken !== token) {
          sessionStorage.setItem(`phone_saved_${normalizedToken}`, '1');
        }
      }
    } catch (err) {
      console.error('Error saving photo:', err);
      setError('Failed to save photo. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!photoDataUrl) return;

    try {
      if (photoDataUrl.startsWith('data:')) {
        const mimeType = photoDataUrl.match(/^data:(.*?);base64,/)?.[1] || 'image/jpeg';
        const extension = getFileExtensionFromMimeType(mimeType);
        const link = document.createElement('a');
        link.href = photoDataUrl;
        link.download = `deep-blue-photobooth-${Date.now()}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const response = await fetch(photoDataUrl);
      if (!response.ok) {
        throw new Error(`Failed to download photo (${response.status})`);
      }
      const blob = await response.blob();
      const extension = getFileExtensionFromMimeType(blob.type || 'image/jpeg');
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `deep-blue-photobooth-${Date.now()}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      console.error('Photo download failed:', downloadError);
      setError('Failed to download photo. Please try again.');
    }
  };

  const handleVideoDownload = () => {
    if (!captureVideoUrl) return;

    const link = document.createElement('a');
    link.href = captureVideoUrl;
    link.download = `deep-blue-preview-video-${Date.now()}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error && !photoDataUrl) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-900 border border-red-200/20 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-200/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-red-200" />
          </div>
          <h2 className="text-2xl font-serif text-white mb-2">Photo Not Found</h2>
          <p className="text-slate-300 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-amber-200 text-slate-900 font-bold py-3 rounded-lg hover:bg-white transition-colors"
          >
            Back to Photobooth
          </button>
        </div>
      </div>
    );
  }

  if (isSaved) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-900 border border-amber-200/20 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-200/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-amber-200" />
          </div>
          <h2 className="text-2xl font-serif text-white mb-2">Photo Saved!</h2>
          <p className="text-slate-300 mb-6">
            {captureVideoUrl
              ? 'Your photo has been saved successfully. You can now download the photo and video.'
              : 'Your photo has been saved successfully. You can now download it.'}
          </p>

          <div className="mb-6">
            <img
              src={photoDataUrl!}
              alt="Your Photo"
              className="w-full max-w-sm mx-auto rounded-lg shadow-lg"
            />
          </div>

          {captureVideoUrl && (
            <div className="mb-6">
              <p className="text-amber-100 text-sm font-serif mb-2">Preview Video</p>
              <video
                src={captureVideoUrl}
                autoPlay
                controls
                muted
                playsInline
                onEnded={(event) => {
                  if (previewVideoReplayCountRef.current >= PREVIEW_VIDEO_REPLAY_COUNT) {
                    return;
                  }
                  previewVideoReplayCountRef.current += 1;
                  const video = event.currentTarget;
                  video.currentTime = 0;
                  void video.play().catch(() => undefined);
                }}
                onError={() => {
                  setCaptureVideoUrl(null);
                }}
                className="w-full max-w-sm mx-auto rounded-lg shadow-lg border border-amber-200/20"
              />
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleDownload}
              className="w-full bg-amber-200 text-slate-900 font-bold py-3 rounded-lg hover:bg-white transition-colors flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Download Photo
            </button>

            {captureVideoUrl && (
              <button
                onClick={handleVideoDownload}
                className="w-full bg-slate-800 border border-amber-200/20 text-amber-100 font-bold py-3 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
              >
                <Video size={20} />
                Download Video
              </button>
            )}

            <button
              onClick={() => navigate('/')}
              className="w-full bg-transparent border border-amber-200/30 text-amber-100 py-3 rounded-lg hover:bg-amber-200/5 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft size={20} />
              Back to Photobooth
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-200/20 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
        <div className="w-16 h-16 bg-amber-200/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Phone size={32} className="text-amber-200" />
        </div>
        <h2 className="text-2xl font-serif text-white mb-2">Enter Your Phone Number</h2>
        <p className="text-slate-300 mb-6">
          Please enter your phone number to save and download your photo
        </p>

        <form onSubmit={handlePhoneSubmit} className="space-y-4">
          <div className="w-full bg-slate-950 border border-slate-700 text-center text-xl tracking-widest text-white rounded-lg p-4 min-h-[64px] flex items-center justify-center font-mono">
            {phoneNumber || 'Enter number'}
          </div>

          <div className="grid gap-3">
            {numberPadRows.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-3 gap-3">
                {row.map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleNumberPadInput(digit)}
                    className={`py-3 rounded-lg transition-colors active:scale-95 text-lg font-semibold ${
                      digit === '⌫'
                        ? 'bg-slate-800 hover:bg-red-900/50 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                  >
                    {digit}
                  </button>
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={handlePhoneClear}
              className="w-full bg-transparent border border-slate-700 text-slate-300 py-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Clear
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !phoneNumber.trim()}
            className="w-full bg-amber-200 text-slate-900 font-bold py-3 rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? 'Saving...' : (
              <>
                <CheckCircle size={20} />
                Save & Download
              </>
            )}
          </button>
        </form>

        <button
          onClick={() => navigate('/')}
          className="mt-6 text-slate-500 hover:text-slate-300 text-sm flex items-center justify-center gap-2 mx-auto"
        >
          <ArrowLeft size={16} />
          Back to Photobooth
        </button>
      </div>
    </div>
  );
};

export default PhotoDownload;
