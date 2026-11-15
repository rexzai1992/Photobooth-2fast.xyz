import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AppState, LayoutType } from './types';
import LayoutSelection from './components/LayoutSelection';
import CameraCapture from './components/CameraCapture';
import PhotoReview from './components/PhotoReview';
import PhotoEditor from './components/PhotoEditor';
import AdminDashboard from './components/AdminDashboard';
import PhotoDownload from './components/PhotoDownload';
import { Home, Power, X } from 'lucide-react';

declare global {
  interface Window {
    kioskBridge?: {
      closeApp?: () => void;
      isDesktopApp?: boolean;
    };
  }
}

const HIDDEN_APP_MENU_TAP_THRESHOLD = 7;
const HIDDEN_APP_MENU_RESET_MS = 10000;

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
  const [showAppMenu, setShowAppMenu] = useState(false);

  // Auto-update the website inside the booth: when a new build is deployed, reload
  // as soon as the booth is back on the home screen (never in the middle of a session).
  const stepRef = useRef(state.step);
  const updateReadyRef = useRef(false);
  useEffect(() => { stepRef.current = state.step; if (state.step === 'home' && updateReadyRef.current) window.location.reload(); }, [state.step]);
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = await res.json();
        if (build && build !== __BUILD_ID__) {
          updateReadyRef.current = true;
          if (stepRef.current === 'home') window.location.reload();
        }
      } catch {
        // offline - try again later
      }
    };
    const timer = window.setInterval(check, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
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

  const closeAppMenu = useCallback(() => {
    setShowAppMenu(false);
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

    closeAppMenu();
    handleRestart();
  }, [closeAppMenu, handleRestart, state.step]);

  const handleHiddenAppMenuTap = useCallback(() => {
    setCloseAppError('');
    if (showAppMenu) {
      return;
    }

    hiddenTapCountRef.current += 1;
    if (hiddenTapCountRef.current >= HIDDEN_APP_MENU_TAP_THRESHOLD) {
      hiddenTapCountRef.current = 0;
      clearHiddenTapResetTimer();
      setShowAppMenu(true);
      return;
    }

    clearHiddenTapResetTimer();
    hiddenTapResetTimerRef.current = window.setTimeout(() => {
      hiddenTapCountRef.current = 0;
      hiddenTapResetTimerRef.current = null;
    }, HIDDEN_APP_MENU_RESET_MS);
  }, [clearHiddenTapResetTimer, showAppMenu]);

  const handleCloseApplication = useCallback(() => {
    setCloseAppError('');
    if (window.kioskBridge?.closeApp) {
      window.kioskBridge.closeApp();
      return;
    }

    window.close();
    window.setTimeout(() => {
      setCloseAppError('Close app works only in the desktop wrapper.');
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
          aria-label="Open app menu"
          onPointerDown={handleHiddenAppMenuTap}
          className="fixed top-0 right-0 z-[80] h-20 w-20 md:h-24 md:w-24 bg-transparent touch-manipulation"
        />

        {showAppMenu && (
          <div className="fixed top-4 right-4 z-[100] w-[min(90vw,280px)] rounded-2xl border border-amber-200/35 bg-slate-900/95 p-3 backdrop-blur-md shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-amber-100 font-serif text-sm tracking-wide">App Menu</h3>
              <button
                type="button"
                onClick={closeAppMenu}
                className="rounded-full border border-amber-200/30 bg-slate-800/80 p-1.5 text-amber-100 hover:bg-slate-700/90 transition-colors"
                aria-label="Close app menu"
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
      <Routes>
        <Route path="/" element={<PhotoboothApp />} />
        <Route path="/admin" element={<AdminDashboard onBack={() => window.location.href = '/'} />} />
        <Route path="/download/:token" element={<PhotoDownload />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
