import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AppState, LayoutType } from './types';
import LayoutSelection from './components/LayoutSelection';
import CameraCapture from './components/CameraCapture';
import PhotoReview from './components/PhotoReview';
import PhotoEditor from './components/PhotoEditor';
import AdminDashboard from './components/AdminDashboard';
import PhotoDownload from './components/PhotoDownload';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

const KioskModeGuard: React.FC = () => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const shouldForceKiosk = !isAdminRoute;
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const enterFullscreen = useCallback(async () => {
    if (!shouldForceKiosk) {
      return true;
    }

    if (document.fullscreenElement) {
      setShowFullscreenPrompt(false);
      return true;
    }

    if (!document.documentElement.requestFullscreen) {
      setShowFullscreenPrompt(false);
      return true;
    }

    try {
      await document.documentElement.requestFullscreen();
      setShowFullscreenPrompt(false);
      return true;
    } catch (error) {
      console.log('Kiosk fullscreen request was blocked until user interaction.', error);
      setShowFullscreenPrompt(true);
      return false;
    }
  }, [shouldForceKiosk]);

  const exitFullscreen = useCallback(async () => {
    if (!document.fullscreenElement || !document.exitFullscreen) {
      return;
    }

    try {
      await document.exitFullscreen();
    } catch (error) {
      console.log('Exit fullscreen failed on admin route.', error);
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!shouldForceKiosk || wakeLockRef.current) {
      return;
    }

    const navigatorWithWakeLock = navigator as Navigator & {
      wakeLock?: {
        request: (type: 'screen') => Promise<WakeLockSentinelLike>;
      };
    };

    if (!navigatorWithWakeLock.wakeLock) {
      return;
    }

    try {
      wakeLockRef.current = await navigatorWithWakeLock.wakeLock.request('screen');
    } catch (error) {
      console.log('Wake lock request failed.', error);
    }
  }, [shouldForceKiosk]);

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) {
      return;
    }

    try {
      await wakeLockRef.current.release();
    } catch (error) {
      console.log('Wake lock release failed.', error);
    } finally {
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    const previousUserSelect = document.body.style.userSelect;
    const previousTouchAction = document.body.style.touchAction;
    const previousOverscroll = document.body.style.overscrollBehavior;

    if (shouldForceKiosk) {
      document.body.style.userSelect = 'none';
      document.body.style.touchAction = 'manipulation';
      document.body.style.overscrollBehavior = 'none';
    }

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.touchAction = previousTouchAction;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [shouldForceKiosk]);

  useEffect(() => {
    if (!shouldForceKiosk) {
      setShowFullscreenPrompt(false);
      void releaseWakeLock();
      void exitFullscreen();
      return;
    }

    void enterFullscreen();
    void requestWakeLock();

    const handleFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setShowFullscreenPrompt(!isFullscreen);
      if (isFullscreen) {
        void requestWakeLock();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void enterFullscreen();
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    };

    const handleUserInteraction = () => {
      if (!document.fullscreenElement) {
        void enterFullscreen();
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrlLike = event.ctrlKey || event.metaKey;

      const blockedShortcut =
        (ctrlLike && ['l', 'n', 'r', 't', 'w'].includes(key)) ||
        key === 'f5' ||
        key === 'escape' ||
        (event.altKey && (key === 'arrowleft' || key === 'arrowright'));

      if (!blockedShortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (!document.fullscreenElement) {
        void enterFullscreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pointerdown', handleUserInteraction, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pointerdown', handleUserInteraction, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [shouldForceKiosk, enterFullscreen, exitFullscreen, requestWakeLock, releaseWakeLock]);

  if (!shouldForceKiosk || !showFullscreenPrompt) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-amber-200/20 rounded-2xl p-6 text-center shadow-2xl">
        <h2 className="text-2xl font-serif text-amber-100 mb-2">Kiosk Mode</h2>
        <p className="text-slate-300 mb-6">
          Tap below to continue in full screen. Admin page is excluded from kiosk lock.
        </p>
        <button
          onClick={() => {
            void enterFullscreen();
          }}
          className="w-full bg-amber-200 text-slate-900 font-bold py-3 rounded-lg hover:bg-white transition-colors"
        >
          Continue Full Screen
        </button>
      </div>
    </div>
  );
};

const PhotoboothApp: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<AppState>({
    step: 'home',
    layout: 'postcard',
    photos: [],
    captureVideos: [],
    stickers: []
  });

  const handleLayoutSelect = (layout: LayoutType) => {
    setState(prev => ({ ...prev, layout, step: 'capture' }));
  };

  const handleCaptureComplete = useCallback((photos: string[], captureVideos: string[]) => {
    setState(prev => ({ ...prev, photos, captureVideos, step: 'review' }));
  }, []);

  const handleReviewContinue = useCallback(() => {
    setState(prev => ({ ...prev, step: 'editor' }));
  }, []);

  const handleReviewRetake = useCallback(() => {
    setState(prev => ({ ...prev, step: 'capture', captureVideos: [] }));
  }, []);

  const handlePhotosChange = useCallback((photos: string[]) => {
    setState(prev => ({ ...prev, photos }));
  }, []);

  const handleRestart = () => {
    setState({
      step: 'home',
      layout: 'postcard',
      photos: [],
      captureVideos: [],
      stickers: []
    });
    navigate('/');
  };

  const handleAdminEnter = () => {
    navigate('/admin');
  };

  // Background Bubbles Renderer (Subtle)
  const renderBubbles = () => {
    return Array.from({ length: 8 }).map((_, i) => (
      <div 
        key={i} 
        className="bubble opacity-5" 
        style={{
          left: `${Math.random() * 100}%`,
          width: `${10 + Math.random() * 20}px`,
          height: `${10 + Math.random() * 20}px`,
          animationDelay: `${Math.random() * 20}s`,
          animationDuration: `${15 + Math.random() * 20}s`
        }} 
      />
    ));
  };

  return (
    <div className="w-full min-h-[100dvh] relative overflow-hidden bg-slate-950">
      {state.step !== 'admin' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
           {/* Classic Light Rays */}
          <div className="absolute -top-40 left-1/4 w-1/2 h-[150%] bg-gradient-to-b from-blue-900/10 to-transparent transform -skew-x-12 blur-3xl rounded-full" />
          {renderBubbles()}
        </div>
      )}

      {/* Main Content */}
      <main className="relative z-10 w-full h-full">
        {state.step === 'home' && (
          <LayoutSelection onSelect={handleLayoutSelect} onAdmin={handleAdminEnter} />
        )}

        {state.step === 'capture' && (
          <CameraCapture
            layout={state.layout}
            onComplete={handleCaptureComplete}
          />
        )}

        {state.step === 'review' && (
          <PhotoReview
            photos={state.photos}
            onPhotosChange={handlePhotosChange}
            onContinue={handleReviewContinue}
            onRetake={handleReviewRetake}
          />
        )}

        {state.step === 'editor' && (
          <PhotoEditor
            photos={state.photos}
            layout={state.layout}
            captureVideos={state.captureVideos}
            onRestart={handleRestart}
          />
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <KioskModeGuard />
      <Routes>
        <Route path="/" element={<PhotoboothApp />} />
        <Route path="/admin" element={<AdminDashboard onBack={() => window.location.href = '/'} />} />
        <Route path="/download/:token" element={<PhotoDownload />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
