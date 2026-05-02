import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AppState, LayoutType } from './types';
import LayoutSelection from './components/LayoutSelection';
import CameraCapture from './components/CameraCapture';
import PhotoReview from './components/PhotoReview';
import PhotoEditor from './components/PhotoEditor';
import AdminDashboard from './components/AdminDashboard';
import PhotoDownload from './components/PhotoDownload';
import { Home, Power, X } from 'lucide-react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

declare global {
  interface Window {
    kioskBridge?: {
      closeApp?: () => void;
      isDesktopApp?: boolean;
    };
  }
}

const HIDDEN_KIOSK_MENU_TAP_THRESHOLD = 7;
const HIDDEN_KIOSK_MENU_RESET_MS = 3500;

const KioskModeGuard: React.FC = () => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isDownloadRoute = location.pathname.startsWith('/download/');
  const shouldForceKiosk = !isAdminRoute && !isDownloadRoute;
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
  const hiddenTapCountRef = useRef(0);
  const hiddenTapResetTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<AppState>({
    step: 'home',
    layout: 'postcard',
    photos: [],
    captureVideos: [],
    stickers: []
  });
  const [showKioskMenu, setShowKioskMenu] = useState(false);
  const [closeAppError, setCloseAppError] = useState('');

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

  const clearHiddenTapResetTimer = useCallback(() => {
    if (hiddenTapResetTimerRef.current === null) {
      return;
    }

    window.clearTimeout(hiddenTapResetTimerRef.current);
    hiddenTapResetTimerRef.current = null;
  }, []);

  const closeKioskMenu = useCallback(() => {
    setShowKioskMenu(false);
    setCloseAppError('');
    hiddenTapCountRef.current = 0;
    clearHiddenTapResetTimer();
  }, [clearHiddenTapResetTimer]);

  const handleBackToMainMenu = useCallback(() => {
    if (state.step === 'home') {
      return;
    }

    const shouldDiscardSession = window.confirm(
      'Return to main menu? Current session progress will be cleared.'
    );

    if (!shouldDiscardSession) {
      return;
    }

    closeKioskMenu();
    handleRestart();
  }, [closeKioskMenu, handleRestart, state.step]);

  const handleHiddenKioskTap = useCallback(() => {
    setCloseAppError('');
    if (showKioskMenu) {
      return;
    }

    hiddenTapCountRef.current += 1;
    if (hiddenTapCountRef.current >= HIDDEN_KIOSK_MENU_TAP_THRESHOLD) {
      hiddenTapCountRef.current = 0;
      clearHiddenTapResetTimer();
      setShowKioskMenu(true);
      return;
    }

    clearHiddenTapResetTimer();
    hiddenTapResetTimerRef.current = window.setTimeout(() => {
      hiddenTapCountRef.current = 0;
      hiddenTapResetTimerRef.current = null;
    }, HIDDEN_KIOSK_MENU_RESET_MS);
  }, [clearHiddenTapResetTimer, showKioskMenu]);

  const handleCloseApplication = useCallback(() => {
    const shouldCloseApplication = window.confirm('Close application now?');
    if (!shouldCloseApplication) {
      return;
    }

    setCloseAppError('');
    if (window.kioskBridge?.closeApp) {
      window.kioskBridge.closeApp();
      return;
    }

    window.close();
    window.setTimeout(() => {
      setCloseAppError('Close app works only in desktop kiosk .exe mode.');
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      clearHiddenTapResetTimer();
    };
  }, [clearHiddenTapResetTimer]);

  const showMainMenuButton =
    state.step === 'capture' || state.step === 'review' || state.step === 'editor';

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
        <button
          type="button"
          aria-label="Open kiosk menu"
          onClick={handleHiddenKioskTap}
          className="fixed top-0 right-0 z-[80] h-16 w-16 md:h-20 md:w-20 bg-transparent"
        />

        {showKioskMenu && (
          <div className="fixed top-4 right-4 z-[100] w-[min(90vw,280px)] rounded-2xl border border-amber-200/35 bg-slate-900/95 p-3 backdrop-blur-md shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-amber-100 font-serif text-sm tracking-wide">Kiosk Menu</h3>
              <button
                type="button"
                onClick={closeKioskMenu}
                className="rounded-full border border-amber-200/30 bg-slate-800/80 p-1.5 text-amber-100 hover:bg-slate-700/90 transition-colors"
                aria-label="Close kiosk menu"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2">
              {showMainMenuButton && (
                <button
                  onClick={handleBackToMainMenu}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200/35 bg-slate-800/85 px-3 py-2 text-xs md:text-sm font-serif font-bold tracking-wide text-amber-100 hover:bg-slate-700/90 hover:border-amber-200/55 transition-all"
                >
                  <Home size={14} />
                  Main Menu
                </button>
              )}

              <button
                onClick={handleCloseApplication}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-300/40 bg-red-900/40 px-3 py-2 text-xs md:text-sm font-serif font-bold tracking-wide text-red-100 hover:bg-red-900/60 hover:border-red-200/70 transition-all"
              >
                <Power size={14} />
                Close Application
              </button>
            </div>

            {closeAppError && (
              <p className="mt-2 text-[11px] md:text-xs text-amber-100/90">{closeAppError}</p>
            )}
          </div>
        )}

        {showMainMenuButton && (
          <div className="fixed top-3 left-3 md:top-5 md:left-5 z-[90]">
            <button
              onClick={handleBackToMainMenu}
              className="inline-flex items-center gap-2 rounded-full border border-amber-200/35 bg-slate-900/80 px-4 py-2 text-xs md:text-sm font-serif font-bold tracking-wide text-amber-100 backdrop-blur-md shadow-[0_10px_30px_rgba(2,6,23,0.55)] hover:bg-slate-800/90 hover:border-amber-200/60 transition-all active:scale-[0.98]"
            >
              <Home size={14} />
              Main Menu
            </button>
          </div>
        )}

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
