import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Video } from 'lucide-react';
import { Results as SegmentationResults, SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { LAYOUT_CONFIG, LayoutType } from '../types';

interface Props {
  layout: LayoutType;
  onComplete: (photos: string[], captureVideos: string[]) => void;
}

const COUNTDOWN_SECONDS = 3;
const FLASH_MS = 180;
const FINISH_DELAY_MS = 600;
const VIDEO_CHUNK_MS = 250;
const SHOT_RECORD_POST_CAPTURE_MS = 350;
const DEFAULT_VIDEO_MIME = 'video/webm';
const SEGMENTATION_MAX_FRAME_WIDTH = 1280;
const FOREGROUND_CONFIDENCE_LOW = 0.12;
const FOREGROUND_CONFIDENCE_HIGH = 0.58;
const TEMPORAL_MASK_BLEND_PREVIOUS = 0.7;
const SEGMENTATION_INIT_RETRY_MS = 1600;
const SEGMENTATION_INIT_MAX_ATTEMPTS = 4;
const MASK_CHANNEL_SAMPLE_STRIDE = 48;

const resolveMediapipeAssetUrl = (path: string): string => {
  const fileName = path.split('/').pop();
  if (!fileName) return path;
  return `/mediapipe/${fileName}`;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getIdleStatusText = (layout: LayoutType) =>
  layout === 'postcard'
    ? 'Tap the camera to begin your session. Video is recording too.'
    : 'Tap the camera to begin your session.';

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

const getSupportedVideoMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined') return DEFAULT_VIDEO_MIME;

  const preferredMimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs="avc1.42E01E"',
    'video/mp4'
  ];

  for (const type of preferredMimeTypes) {
    try {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    } catch {
      // Ignore capability probe errors and continue
    }
  }

  return DEFAULT_VIDEO_MIME;
};

const CameraCapture: React.FC<Props> = ({ layout, onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositedFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selfieSegmentationRef = useRef<SelfieSegmentation | null>(null);
  const segmentationLoopIdRef = useRef<number | null>(null);
  const segmentationInFlightRef = useRef(false);
  const hasSegmentedFrameRef = useRef(false);
  const maskChannelIndexRef = useRef<number>(0);
  const segmentationStatusLockedRef = useRef(false);
  const segmentationInitAttemptsRef = useRef(0);
  const previousMaskAlphaRef = useRef<Float32Array | null>(null);
  const previousMaskPixelCountRef = useRef(0);
  const isCapturingRef = useRef(false);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [capturedVideos, setCapturedVideos] = useState<string[]>([]);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState(getIdleStatusText(layout));
  const [isSegmentationActive, setIsSegmentationActive] = useState(false);
  const [isSegmentationUnavailable, setIsSegmentationUnavailable] = useState(false);
  const [segmentationErrorDetail, setSegmentationErrorDetail] = useState<string | null>(null);

  const targetCount = LAYOUT_CONFIG[layout].photoCount;
  const targetAspect = layout === 'postcard' ? 16 / 9 : 4 / 3;
  const shouldRecordVideo = layout === 'postcard' || layout === 'strips';

  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const smoothstep = (edge0: number, edge1: number, value: number) => {
    const t = clamp01((value - edge0) / Math.max(edge1 - edge0, 0.00001));
    return t * t * (3 - 2 * t);
  };

  const getOrCreateWorkerCanvas = useCallback((canvasRef: React.MutableRefObject<HTMLCanvasElement | null>) => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    return canvasRef.current;
  }, []);

  const syncCanvasToVideo = useCallback((canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return false;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    return true;
  }, []);

  const drawRawPreviewFrame = useCallback(() => {
    const video = videoRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!video || !previewCanvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    if (!syncCanvasToVideo(previewCanvas, video)) {
      return;
    }

    const context = previewCanvas.getContext('2d');
    if (!context) return;

    context.save();
    context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    context.translate(previewCanvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);
    context.restore();
  }, [syncCanvasToVideo]);

  const drawSegmentedPreviewFrame = useCallback((results: SegmentationResults) => {
    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas) return;

    const resultImage = results.image as { width?: number; height?: number };
    const sourceWidth = resultImage.width ?? previewCanvas.width;
    const sourceHeight = resultImage.height ?? previewCanvas.height;
    if (!sourceWidth || !sourceHeight) return;

    const scale = Math.min(1, SEGMENTATION_MAX_FRAME_WIDTH / sourceWidth);
    const width = Math.max(2, Math.round(sourceWidth * scale));
    const height = Math.max(2, Math.round(sourceHeight * scale));

    if (previewCanvas.width !== width || previewCanvas.height !== height) {
      previewCanvas.width = width;
      previewCanvas.height = height;
    }

    const sourceCanvas = getOrCreateWorkerCanvas(sourceFrameCanvasRef);
    const maskCanvas = getOrCreateWorkerCanvas(maskFrameCanvasRef);
    const compositedCanvas = getOrCreateWorkerCanvas(compositedFrameCanvasRef);

    if (sourceCanvas.width !== width || sourceCanvas.height !== height) {
      sourceCanvas.width = width;
      sourceCanvas.height = height;
    }
    if (maskCanvas.width !== width || maskCanvas.height !== height) {
      maskCanvas.width = width;
      maskCanvas.height = height;
    }
    if (compositedCanvas.width !== width || compositedCanvas.height !== height) {
      compositedCanvas.width = width;
      compositedCanvas.height = height;
    }

    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
    const compositedContext = compositedCanvas.getContext('2d');
    const context = previewCanvas.getContext('2d');
    if (!sourceContext || !maskContext || !compositedContext || !context) return;

    sourceContext.clearRect(0, 0, width, height);
    sourceContext.drawImage(results.image, 0, 0, width, height);

    maskContext.clearRect(0, 0, width, height);
    maskContext.filter = 'blur(1px)';
    maskContext.drawImage(results.segmentationMask, 0, 0, width, height);
    maskContext.filter = 'none';

    const sourcePixels = sourceContext.getImageData(0, 0, width, height);
    const maskPixels = maskContext.getImageData(0, 0, width, height);
    const sourceData = sourcePixels.data;
    const maskData = maskPixels.data;

    if (!hasSegmentedFrameRef.current) {
      const channelRange = [0, 1, 2, 3].map(channelOffset => {
        let min = 255;
        let max = 0;
        for (let i = channelOffset; i < maskData.length; i += 4 * MASK_CHANNEL_SAMPLE_STRIDE) {
          const value = maskData[i];
          if (value < min) min = value;
          if (value > max) max = value;
        }
        return max - min;
      });

      let bestChannelIndex = 0;
      for (let i = 1; i < channelRange.length; i += 1) {
        if (channelRange[i] > channelRange[bestChannelIndex]) {
          bestChannelIndex = i;
        }
      }
      maskChannelIndexRef.current = bestChannelIndex;
    }

    const maskChannelIndex = maskChannelIndexRef.current;
    const pixelCount = width * height;
    if (!previousMaskAlphaRef.current || previousMaskPixelCountRef.current !== pixelCount) {
      previousMaskAlphaRef.current = new Float32Array(pixelCount);
      previousMaskPixelCountRef.current = pixelCount;
    }
    const previousMaskAlpha = previousMaskAlphaRef.current;

    for (let i = 0, pixelIndex = 0; i < sourceData.length; i += 4, pixelIndex += 1) {
      const confidence = maskData[i + maskChannelIndex] / 255;
      const matte = smoothstep(FOREGROUND_CONFIDENCE_LOW, FOREGROUND_CONFIDENCE_HIGH, confidence);
      const previousAlpha = hasSegmentedFrameRef.current ? previousMaskAlpha[pixelIndex] : matte;
      const temporalAlpha = (previousAlpha * TEMPORAL_MASK_BLEND_PREVIOUS) + (matte * (1 - TEMPORAL_MASK_BLEND_PREVIOUS));
      previousMaskAlpha[pixelIndex] = temporalAlpha;
      const alpha = Math.pow(temporalAlpha, 0.55);
      const invAlpha = 1 - alpha;

      sourceData[i] = sourceData[i] * alpha + 255 * invAlpha;
      sourceData[i + 1] = sourceData[i + 1] * alpha + 255 * invAlpha;
      sourceData[i + 2] = sourceData[i + 2] * alpha + 255 * invAlpha;
      sourceData[i + 3] = 255;
    }

    compositedContext.putImageData(sourcePixels, 0, 0);

    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(compositedCanvas, 0, 0, width, height);
    context.restore();

    hasSegmentedFrameRef.current = true;
  }, [getOrCreateWorkerCanvas]);

  useEffect(() => {
    let mounted = true;
    let activeStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'user'
          },
          audio: false
        });

        if (!mounted) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        activeStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError('Unable to access camera. Please check permissions.');
      }
    };

    startCamera();

    return () => {
      mounted = false;
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimeoutId: number | null = null;

    const scheduleRetry = () => {
      if (cancelled) return;
      if (segmentationInitAttemptsRef.current >= SEGMENTATION_INIT_MAX_ATTEMPTS) {
        setIsSegmentationUnavailable(true);
        return;
      }

      retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null;
        void initializeSegmentation();
      }, SEGMENTATION_INIT_RETRY_MS);
    };

    const initializeSegmentation = async () => {
      if (cancelled || selfieSegmentationRef.current) return;
      const segmenter = new SelfieSegmentation({
        locateFile: (file) => resolveMediapipeAssetUrl(file),
      });

      segmenter.setOptions({
        modelSelection: 0,
        selfieMode: true,
      });

      segmenter.onResults(results => {
        segmentationInFlightRef.current = false;
        if (cancelled) return;
        if (!segmentationStatusLockedRef.current) {
          segmentationStatusLockedRef.current = true;
          setIsSegmentationActive(true);
          setIsSegmentationUnavailable(false);
        }
        drawSegmentedPreviewFrame(results);
      });

      try {
        segmentationInitAttemptsRef.current += 1;
        await segmenter.initialize();
        if (cancelled) {
          await segmenter.close();
          return;
        }
        selfieSegmentationRef.current = segmenter;
        setSegmentationErrorDetail(null);
      } catch (segmentationError) {
        console.error('Person segmentation initialization failed, using fallback preview.', segmentationError);
        if (!cancelled) {
          setIsSegmentationActive(false);
          const message = segmentationError instanceof Error ? segmentationError.message : String(segmentationError);
          setSegmentationErrorDetail(message);
          scheduleRetry();
        }
      }
    };

    void initializeSegmentation();

    return () => {
      cancelled = true;
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
      }
      const segmenter = selfieSegmentationRef.current;
      selfieSegmentationRef.current = null;
      segmentationInFlightRef.current = false;
      hasSegmentedFrameRef.current = false;
      previousMaskAlphaRef.current = null;
      previousMaskPixelCountRef.current = 0;
      segmentationStatusLockedRef.current = false;
      segmentationInitAttemptsRef.current = 0;
      setIsSegmentationActive(false);
      setIsSegmentationUnavailable(false);
      setSegmentationErrorDetail(null);
      if (segmenter) {
        void segmenter.close().catch(() => undefined);
      }
    };
  }, [drawSegmentedPreviewFrame]);

  useEffect(() => {
    const renderLoop = () => {
      const video = videoRef.current;
      const segmenter = selfieSegmentationRef.current;

      if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        if (segmenter) {
          if (!segmentationInFlightRef.current) {
            segmentationInFlightRef.current = true;
            void segmenter.send({ image: video }).catch(segmentationError => {
              segmentationInFlightRef.current = false;
              console.error('Person segmentation frame failed, using fallback preview.', segmentationError);
              setIsSegmentationActive(false);
              const message = segmentationError instanceof Error ? segmentationError.message : String(segmentationError);
              setSegmentationErrorDetail(message);
            });
          }

          if (!hasSegmentedFrameRef.current) {
            drawRawPreviewFrame();
          }
        } else {
          drawRawPreviewFrame();
        }
      }

      segmentationLoopIdRef.current = window.requestAnimationFrame(renderLoop);
    };

    segmentationLoopIdRef.current = window.requestAnimationFrame(renderLoop);

    return () => {
      if (segmentationLoopIdRef.current !== null) {
        window.cancelAnimationFrame(segmentationLoopIdRef.current);
        segmentationLoopIdRef.current = null;
      }
    };
  }, [drawRawPreviewFrame]);

  const captureFrame = useCallback((): string | null => {
    const sourceCanvas = previewCanvasRef.current;
    const canvas = captureCanvasRef.current;

    if (!sourceCanvas || !canvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
      return null;
    }

    const context = canvas.getContext('2d');
    if (!context) return null;

    const sourceAspect = sourceCanvas.width / sourceCanvas.height;
    let sourceWidth = sourceCanvas.width;
    let sourceHeight = sourceCanvas.height;
    let sourceX = 0;
    let sourceY = 0;

    if (sourceAspect > targetAspect) {
      sourceWidth = sourceCanvas.height * targetAspect;
      sourceX = (sourceCanvas.width - sourceWidth) / 2;
    } else {
      sourceHeight = sourceCanvas.width / targetAspect;
      sourceY = (sourceCanvas.height - sourceHeight) / 2;
    }

    canvas.width = targetAspect > 1.5 ? 1280 : 960;
    canvas.height = canvas.width / targetAspect;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      sourceCanvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL('image/jpeg', 0.95);
  }, [targetAspect]);

  const runShotCountdown = useCallback(async (shotIndex: number) => {
    const shotNumber = shotIndex + 1;
    for (let remaining = COUNTDOWN_SECONDS; remaining >= 1; remaining -= 1) {
      setCountdown(remaining);
      setStatusText(`Photo ${shotNumber}/${targetCount} in ${remaining}...`);
      await sleep(1000);
    }
    setCountdown(null);
  }, [targetCount]);

  const captureShotVideo = useCallback(async (work: () => Promise<void>): Promise<string | null> => {
    if (!shouldRecordVideo || !stream || typeof MediaRecorder === 'undefined') {
      await work();
      return null;
    }

    let recorder: MediaRecorder;
    const mimeType = getSupportedVideoMimeType();

    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1_500_000
      });
    } catch (err) {
      console.error('Shot video recorder unavailable, proceeding with photo only:', err);
      await work();
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

    recorder.start(VIDEO_CHUNK_MS);
    setIsRecordingVideo(true);

    let workError: unknown;
    try {
      await work();
      await sleep(SHOT_RECORD_POST_CAPTURE_MS);
    } catch (err) {
      workError = err;
    } finally {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }

    const blob = await stopped;
    const dataUrl = await blobToDataUrl(blob);
    setIsRecordingVideo(false);

    if (workError) {
      throw workError;
    }

    return dataUrl;
  }, [shouldRecordVideo, stream]);

  const runCaptureSequence = useCallback(async () => {
    if (isCapturingRef.current) return;

    if (!stream) {
      setError('Camera is still initializing. Please try again.');
      return;
    }

    setError('');
    setCapturedPhotos([]);
    setCapturedVideos([]);
    setIsSessionRunning(true);
    setStatusText('Get ready for your session.');
    isCapturingRef.current = true;

    const nextPhotos: string[] = [];
    const nextVideos: string[] = [];

    try {
      for (let index = 0; index < targetCount; index += 1) {
        let photoData: string | null = null;

        const shotVideo = await captureShotVideo(async () => {
          await runShotCountdown(index);
          photoData = captureFrame();
          if (!photoData) {
            throw new Error('Unable to capture frame from camera stream.');
          }

          setIsFlashing(true);
          await sleep(FLASH_MS);
          setIsFlashing(false);
        });

        if (!photoData) {
          throw new Error('Photo capture returned empty data.');
        }

        nextPhotos.push(photoData);
        setCapturedPhotos([...nextPhotos]);

        if (shotVideo) {
          nextVideos.push(shotVideo);
          setCapturedVideos([...nextVideos]);
        }

        if (index < targetCount - 1) {
          setStatusText(`Photo ${index + 1} captured. Get ready for the next shot.`);
        }
      }

      setStatusText('Capture complete.');
      await sleep(FINISH_DELAY_MS);
      onComplete(nextPhotos, nextVideos);
    } catch (err) {
      console.error('Capture sequence failed:', err);
      setError('Capture failed. Please retake your session.');
      setStatusText(getIdleStatusText(layout));
    } finally {
      isCapturingRef.current = false;
      setIsSessionRunning(false);
      setIsRecordingVideo(false);
      setIsFlashing(false);
      setCountdown(null);
    }
  }, [captureFrame, captureShotVideo, onComplete, runShotCountdown, stream, targetCount]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen relative z-10 w-full classic-gradient camera-surface-white p-4">
      <div className="absolute inset-0 gold-shimmer opacity-20 pointer-events-none" />

      {error ? (
        <div className="bg-red-900/50 border border-red-500 text-red-100 p-6 rounded-sm font-serif">
          {error}
        </div>
      ) : (
        <div
          className="relative w-full max-w-3xl bg-black rounded-lg overflow-hidden shadow-2xl border-4 border-amber-200/20 transition-all duration-500"
          style={{
            aspectRatio: `${targetAspect}`,
            maxHeight: '75vh'
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
          />
          <canvas
            ref={previewCanvasRef}
            className="w-full h-full object-cover filter contrast-110 saturate-110"
          />
          <canvas ref={captureCanvasRef} className="hidden" />

          {isFlashing && <div className="absolute inset-0 bg-white z-50 flash-overlay" />}

          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 md:p-6">
            <div className="flex justify-between items-start gap-2">
              <div className="bg-slate-900/60 backdrop-blur px-4 py-1 md:px-6 md:py-2 rounded-full text-amber-100 font-serif border border-amber-200/20 text-xs md:text-base">
                Exposure {Math.min(capturedPhotos.length + 1, targetCount)} / {targetCount}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="hidden md:block text-amber-200/80 text-sm font-serif italic tracking-wider">
                  Deep Blue Photobooth
                </div>
                <div className={`px-3 py-1 rounded-full text-[11px] md:text-xs font-serif border ${
                  isSegmentationActive
                    ? 'bg-emerald-950/80 border-emerald-300/40 text-emerald-100'
                    : isSegmentationUnavailable
                      ? 'bg-red-950/80 border-red-400/50 text-red-200'
                      : 'bg-slate-900/70 border-amber-200/20 text-amber-100/80'
                }`}>
                  {isSegmentationActive
                    ? 'AI white background on'
                    : isSegmentationUnavailable
                      ? 'AI white background unavailable'
                      : 'Starting AI white background...'}
                </div>
                {isSegmentationUnavailable && segmentationErrorDetail && (
                  <div className="max-w-[260px] text-right text-[10px] leading-snug text-red-200/90 font-sans">
                    {segmentationErrorDetail}
                  </div>
                )}
                {shouldRecordVideo && (
                  <div className={`px-3 py-1 rounded-full text-[11px] md:text-xs font-serif border flex items-center gap-1 ${
                    isRecordingVideo
                      ? 'bg-red-950/80 border-red-400/50 text-red-200'
                      : 'bg-slate-900/70 border-amber-200/20 text-amber-100/80'
                  }`}>
                    <Video className="w-3.5 h-3.5" />
                    {isRecordingVideo
                      ? `Recording layer ${capturedVideos.length + 1}/${targetCount}`
                      : `Video layers ${capturedVideos.length}/${targetCount}`}
                  </div>
                )}
              </div>
            </div>

            {isSessionRunning && countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center z-50">
                <div className="bg-slate-900/85 backdrop-blur-sm border border-amber-200/20 rounded-2xl px-8 py-6 text-center min-w-[180px]">
                  <div className="text-amber-100 font-serif text-5xl md:text-6xl leading-none">
                    {countdown}
                  </div>
                  <div className="text-amber-200/80 uppercase tracking-[0.18em] text-xs mt-3">
                    Get Ready
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-3 pb-2 md:pb-4">
              {!isSessionRunning && capturedPhotos.length === 0 && layout === 'postcard' && (
                <div className="pointer-events-none rounded-full bg-amber-300/15 border border-amber-200/35 px-4 py-2 text-[11px] md:text-xs uppercase tracking-[0.16em] text-amber-100 font-serif shadow-[0_0_16px_rgba(251,191,36,0.18)]">
                  Video is recording too
                </div>
              )}
              {!isSessionRunning && capturedPhotos.length === 0 && (
                <button
                  onClick={runCaptureSequence}
                  className="pointer-events-auto bg-amber-200 hover:bg-white text-slate-900 rounded-full p-4 md:p-6 shadow-[0_0_30px_rgba(251,191,36,0.4)] transition-all transform hover:scale-105 active:scale-95 group disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={!stream}
                >
                  <Camera className="w-8 h-8 md:w-10 md:h-10 text-slate-900" />
                </button>
              )}
            </div>
          </div>

          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            {Array.from({ length: targetCount }).map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full border border-amber-200 transition-colors duration-300 ${
                  index < capturedPhotos.length ? 'bg-amber-200' : 'bg-transparent'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 md:mt-8 text-center text-amber-100/60 font-serif text-base md:text-lg tracking-wide px-4">
        {statusText}
      </div>
    </div>
  );
};

export default CameraCapture;
