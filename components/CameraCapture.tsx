import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Video } from 'lucide-react';
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
    'video/webm'
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  const targetCount = LAYOUT_CONFIG[layout].photoCount;
  const targetAspect = layout === 'postcard' ? 16 / 9 : 4 / 3;
  const shouldRecordVideo = layout === 'postcard' || layout === 'strips';

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

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    const context = canvas.getContext('2d');
    if (!context) return null;

    const videoAspect = video.videoWidth / video.videoHeight;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    let sourceX = 0;
    let sourceY = 0;

    if (videoAspect > targetAspect) {
      sourceWidth = video.videoHeight * targetAspect;
      sourceX = (video.videoWidth - sourceWidth) / 2;
    } else {
      sourceHeight = video.videoWidth / targetAspect;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }

    canvas.width = targetAspect > 1.5 ? 1280 : 960;
    canvas.height = canvas.width / targetAspect;

    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
    context.restore();

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
    <div className="flex flex-col items-center justify-center min-h-screen relative z-10 w-full classic-gradient p-4">
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
            className="w-full h-full object-cover transform -scale-x-100 filter contrast-110 saturate-110"
          />
          <canvas ref={canvasRef} className="hidden" />

          {isFlashing && <div className="absolute inset-0 bg-white z-50 flash-overlay" />}

          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 md:p-6">
            <div className="flex justify-between items-start gap-2">
              <div className="bg-slate-900/60 backdrop-blur px-4 py-1 md:px-6 md:py-2 rounded-full text-amber-100 font-serif border border-amber-200/20 text-xs md:text-base">
                Exposure {Math.min(capturedPhotos.length + 1, targetCount)} / {targetCount}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="hidden md:block text-amber-200/80 text-sm font-serif italic tracking-wider">
                  Deep Blue Studio
                </div>
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
