import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PROJECT_FILES: Record<string, string> = {
  ".env": `VITE_SUPABASE_URL=https://mngxpbwscmgmgzfctcwl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ3hwYndzY21nbWd6ZmN0Y3dsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MTU3MDEsImV4cCI6MjA4NDI5MTcwMX0.DoA-B3SsnxGBhlMtY5owJBU7-ZHXHmyFClgb7N4SvIc`,
  ".gitignore": `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
.env
`,
  "App.tsx": `import React, { useState, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AppState, LayoutType } from './types';
import LayoutSelection from './components/LayoutSelection';
import CameraCapture from './components/CameraCapture';
import PhotoEditor from './components/PhotoEditor';
import AdminDashboard from './components/AdminDashboard';

const PhotoboothApp: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<AppState>({
    step: 'home',
    layout: 'postcard',
    photos: [],
    stickers: []
  });

  const lastTapRef = useRef(0);

  const handleLayoutSelect = (layout: LayoutType) => {
    setState(prev => ({ ...prev, layout, step: 'capture' }));
  };

  const handleCaptureComplete = useCallback((photos: string[]) => {
    setState(prev => ({ ...prev, photos, step: 'editor' }));
  }, []);

  const handleRestart = () => {
    setState({
      step: 'home',
      layout: 'postcard',
      photos: [],
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
          left: \`\${Math.random() * 100}%\`,
          width: \`\${10 + Math.random() * 20}px\`,
          height: \`\${10 + Math.random() * 20}px\`,
          animationDelay: \`\${Math.random() * 20}s\`,
          animationDuration: \`\${15 + Math.random() * 20}s\`
        }} 
      />
    ));
  };

  // Improved Tap Logic using only Refs for immediate action
  const handleCornerTapRef = useRef(0);
  const handleCornerClickInstant = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      handleCornerTapRef.current += 1;
    } else {
      handleCornerTapRef.current = 1;
    }
    lastTapRef.current = now;

    if (handleCornerTapRef.current === 3) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(e => console.log('Fullscreen blocked', e));
      } else {
        document.exitFullscreen().catch(e => console.log('Exit fullscreen error', e));
      }
      handleCornerTapRef.current = 0; // Reset
    }
  };

  return (
    <div className="w-full min-h-[100dvh] relative overflow-hidden bg-slate-950">
      
      {/* Triple Tap Trigger Zone (Top Right) */}
      <div 
        className="fixed top-0 right-0 w-20 h-20 z-[100] cursor-default active:bg-white/5 transition-colors"
        onClick={handleCornerClickInstant}
      />

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

        {state.step === 'editor' && (
          <PhotoEditor
            photos={state.photos}
            layout={state.layout}
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
      </Routes>
    </BrowserRouter>
  );
};

export default App;`,
  "README.md": `<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1OmexlLrW9wCyhPIMmQbr6NZ-Tspapw7f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   \`npm install\`
2. Set the \`GEMINI_API_KEY\` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   \`npm run dev\`
# Deep-blue-web
`,
  "components/AdminDashboard.tsx": `import React, { useState, useRef, useEffect } from 'react';
import { getGallery, deletePhotoFromGallery, clearGallery, SavedPhoto, GalleryResult } from '../utils/storage';
import { ArrowLeft, Trash2, Download, Image as ImageIcon, Lock, Sticker as StickerIcon, ChevronLeft, ChevronRight, Send, Upload, CheckCircle, XCircle, Clock, MessageSquare, Archive } from 'lucide-react';
import { StickerUpload } from './StickerUpload';
import { getCustomStickers, CustomSticker } from '../utils/stickerStorage';
import { supabase } from '../utils/supabase';

interface Props {
  onBack: () => void;
}

interface ApiConfig {
  id?: string;
  api_key: string;
  sender_number: string;
}

interface SentMessage {
  id: string;
  recipient_number: string;
  image_url: string;
  caption: string;
  sent_at: string;
  status: 'pending' | 'success' | 'failed';
  error_message?: string;
}

const AdminDashboard: React.FC<Props> = ({ onBack }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'photos' | 'stickers' | 'whatsapp'>('photos');
  const [customStickers, setCustomStickers] = useState<CustomSticker[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<SavedPhoto | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalPhotos, setTotalPhotos] = useState(0);

  const [config, setConfig] = useState<ApiConfig>({ api_key: '', sender_number: '' });
  const [recipientNumber, setRecipientNumber] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showGallery, setShowGallery] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<SavedPhoto[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [filterWithPhone, setFilterWithPhone] = useState(true);

  const photoModalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const thumbnailScrollRef = useRef<HTMLDivElement>(null);

  const startPhotoModalTimeout = () => {
    if (photoModalTimeoutRef.current) {
      clearTimeout(photoModalTimeoutRef.current);
    }
    photoModalTimeoutRef.current = setTimeout(() => {
      setSelectedPhoto(null);
    }, 10000);
  };

  const clearPhotoModalTimeout = () => {
    if (photoModalTimeoutRef.current) {
      clearTimeout(photoModalTimeoutRef.current);
      photoModalTimeoutRef.current = null;
    }
  };

  const resetPhotoModalTimeout = () => {
    startPhotoModalTimeout();
  };

  useEffect(() => {
    if (selectedPhoto) {
      startPhotoModalTimeout();
    } else {
      clearPhotoModalTimeout();
    }

    return () => {
      clearPhotoModalTimeout();
    };
  }, [selectedPhoto]);

  // Authentication Logic
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') {
        setIsAuthenticated(true);
        loadPhotos(1);
        loadCustomStickers();
        setConfig({ api_key: 'configured', sender_number: '601116366799' });
        loadSentMessages();
    } else {
        alert('Incorrect PIN');
        setPin('');
    }
  };

  const loadPhotos = async (page: number = currentPage) => {
    setLoading(true);
    try {
        const result: GalleryResult = await getGallery(page, 30);
        setPhotos(result.photos);
        setCurrentPage(result.page);
        setTotalPages(result.totalPages);
        setTotalPhotos(result.total);
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  const loadCustomStickers = async () => {
    const stickers = await getCustomStickers();
    setCustomStickers(stickers);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this photo?')) {
      await deletePhotoFromGallery(id);
      await loadPhotos(currentPage);
      setCurrentPhotoIndex(0);
    }
  };

  const handleClearAll = async () => {
    if (confirm('WARNING: This will delete ALL photos. This cannot be undone.')) {
      await clearGallery();
      setPhotos([]);
      setCurrentPhotoIndex(0);
      setCurrentPage(1);
      setTotalPages(0);
      setTotalPhotos(0);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      loadPhotos(page);
      setCurrentPhotoIndex(0);
    }
  };

  const handleDownload = async (photo: SavedPhoto) => {
    try {
      const downloadUrl = photo.fullSizeUrl || photo.dataUrl;

      if (downloadUrl.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = \`deep-blue-archive-\${photo.id}.jpg\`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const response = await fetch(downloadUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = \`deep-blue-archive-\${photo.id}.jpg\`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download photo');
    }
  };

  const scrollThumbnails = (direction: 'left' | 'right') => {
    if (thumbnailScrollRef.current) {
      const scrollAmount = 200;
      thumbnailScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const scrollToCurrentThumbnail = () => {
    if (thumbnailScrollRef.current) {
      const thumbnailWidth = 64;
      const gap = 8;
      const scrollPosition = currentPhotoIndex * (thumbnailWidth + gap);
      thumbnailScrollRef.current.scrollTo({
        left: scrollPosition - thumbnailScrollRef.current.clientWidth / 2 + thumbnailWidth / 2,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (selectedPhoto) {
      scrollToCurrentThumbnail();
    }
  }, [currentPhotoIndex, selectedPhoto]);

  const goToPrevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
    resetPhotoModalTimeout();
  };

  const goToNextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
    resetPhotoModalTimeout();
  };


  const loadSentMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_sent_messages')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSentMessages(data || []);
    } catch (err) {
      console.error('Error loading sent messages:', err);
    }
  };

  const loadGalleryForWhatsApp = async () => {
    try {
      setLoadingGallery(true);
      const result = await getGallery(1, 100);
      const filteredPhotos = filterWithPhone
        ? result.photos.filter(p => p.phoneNumber)
        : result.photos;
      setGalleryPhotos(filteredPhotos);
    } catch (err) {
      console.error('Error loading gallery:', err);
      setError('Failed to load gallery');
    } finally {
      setLoadingGallery(false);
    }
  };


  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setShowGallery(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const selectFromGallery = (photo: SavedPhoto) => {
    setSelectedImage(photo.fullSizeUrl || photo.dataUrl);
    if (photo.phoneNumber) {
      setRecipientNumber(photo.phoneNumber);
    }
    setShowGallery(false);
  };

  const sendImage = async () => {
    try {
      setError('');
      setSending(true);

      if (!selectedImage) {
        setError('Please select an image');
        return;
      }

      if (!recipientNumber) {
        setError('Please enter recipient number');
        return;
      }

      const response = await fetch(
        \`\${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp-image\`,
        {
          method: 'POST',
          headers: {
            'X-Admin-Pin': '1234',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipientNumber,
            imageUrl: selectedImage.startsWith('http') ? selectedImage : undefined,
            imageBase64: selectedImage.startsWith('data:') ? selectedImage : undefined,
            caption,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send image');
      }

      setSuccess('Image sent successfully!');
      setSelectedImage(null);
      setRecipientNumber('');
      setCaption('');
      loadSentMessages();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error sending image:', err);
      setError(err instanceof Error ? err.message : 'Failed to send image');
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated) {
      return (
          <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4">
              <div className="bg-slate-900 border border-amber-200/20 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
                  <div className="mx-auto bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mb-6 text-amber-200">
                      <Lock size={32} />
                  </div>
                  <h2 className="text-2xl font-serif text-amber-100 mb-2">Admin Access</h2>
                  <p className="text-slate-400 mb-6 text-sm">Enter security PIN to view archives.</p>
                  
                  <form onSubmit={handlePinSubmit} className="space-y-4">
                      <input 
                        type="password" 
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-center text-2xl tracking-widest text-white rounded-lg p-3 focus:border-amber-400 focus:outline-none transition-colors font-mono"
                        placeholder="••••"
                        maxLength={4}
                        autoFocus
                      />
                      <button 
                        type="submit"
                        className="w-full bg-amber-200 text-slate-900 font-bold py-3 rounded-lg hover:bg-white transition-colors"
                      >
                          Unlock
                      </button>
                  </form>
                  <button onClick={onBack} className="mt-6 text-slate-500 hover:text-slate-300 text-sm">
                      Return to App
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-200 flex flex-col font-sans">
      <style>{\`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      \`}</style>
      {/* Header */}
      <div className="bg-slate-900 border-b border-white/10 sticky top-0 z-50">
        <div className="p-4 md:p-6 flex justify-between items-center">
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            <h1 className="text-xl md:text-2xl font-serif text-amber-200">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-slate-400">
             <a
               href={\`\${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-project\`}
               download="deep-blue-photobooth.zip"
               className="px-3 py-1.5 md:px-4 md:py-2 bg-slate-800 border-2 border-slate-600 text-slate-300 font-semibold rounded hover:bg-slate-700 hover:border-slate-500 active:scale-95 transition-all flex items-center gap-2"
             >
               <Archive className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">Project ZIP</span><span className="sm:hidden">ZIP</span>
             </a>
             {activeTab === 'photos' && (
               <>
                 <span className="hidden sm:inline">{totalPhotos} Photos Stored</span>
                 <span className="sm:hidden">{totalPhotos} Items</span>
                 <button
                    onClick={async () => {
                      for (const photo of photos) {
                        await handleDownload(photo);
                        await new Promise(resolve => setTimeout(resolve, 100));
                      }
                    }}
                    disabled={photos.length === 0}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-amber-500/20 border-2 border-amber-500 text-amber-200 font-semibold rounded hover:bg-amber-500/30 hover:border-amber-400 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">Download All</span><span className="sm:hidden">Download</span>
                 </button>
                 <button
                    onClick={handleClearAll}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-red-500/20 border-2 border-red-500 text-red-300 font-semibold rounded hover:bg-red-500/30 hover:border-red-400 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                 >
                    <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span>Clear All</span>
                 </button>
               </>
             )}
             {activeTab === 'stickers' && (
               <>
                 <span className="hidden sm:inline">{customStickers.length} Custom Stickers</span>
                 <span className="sm:hidden">{customStickers.length} Items</span>
               </>
             )}
             {activeTab === 'whatsapp' && (
               <>
                 <span className="hidden sm:inline">{sentMessages.length} Messages Sent</span>
                 <span className="sm:hidden">{sentMessages.length} Sent</span>
               </>
             )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-white/10">
          <button
            onClick={() => setActiveTab('photos')}
            className={\`flex-1 py-3 text-center text-xs md:text-sm uppercase tracking-widest font-serif transition-all flex items-center justify-center gap-2 \${
              activeTab === 'photos'
                ? 'text-amber-200 border-b-2 border-amber-200 bg-white/5'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }\`}
          >
            <ImageIcon size={14} /> Photos
          </button>
          <button
            onClick={() => setActiveTab('stickers')}
            className={\`flex-1 py-3 text-center text-xs md:text-sm uppercase tracking-widest font-serif transition-all flex items-center justify-center gap-2 \${
              activeTab === 'stickers'
                ? 'text-amber-200 border-b-2 border-amber-200 bg-white/5'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }\`}
          >
            <StickerIcon size={14} /> Stickers
          </button>
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={\`flex-1 py-3 text-center text-xs md:text-sm uppercase tracking-widest font-serif transition-all flex items-center justify-center gap-2 \${
              activeTab === 'whatsapp'
                ? 'text-amber-200 border-b-2 border-amber-200 bg-white/5'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }\`}
          >
            <MessageSquare size={14} /> WhatsApp
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'photos' && (
          <>
            {loading ? (
              <div className="h-full flex items-center justify-center text-amber-200 animate-pulse">
                Loading Archive...
              </div>
            ) : photos.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
                <div className="p-6 rounded-full bg-slate-900">
                  <ImageIcon size={48} />
                </div>
                <p className="text-lg md:text-xl font-light">No photos generated yet.</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="group relative aspect-[2/3] bg-slate-900 rounded-lg overflow-hidden border border-white/10 hover:border-amber-200/50 transition-all cursor-pointer shadow-lg hover:shadow-2xl hover:scale-[1.02]"
                        onClick={() => {
                          setSelectedPhoto(photo);
                          setCurrentPhotoIndex(index);
                        }}
                      >
                        <img
                          src={photo.dataUrl}
                          alt={\`Photo \${index + 1}\`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-3 text-xs">
                            <div className="text-amber-200 font-serif mb-1">
                              Photo #{photo.id.slice(-8)}
                            </div>
                            <div className="text-slate-400 text-xs">
                              {new Date(photo.timestamp).toLocaleDateString()}
                            </div>
                            {photo.phoneNumber && (
                              <div className="text-amber-100 text-xs mt-1">
                                📱 {photo.phoneNumber}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-8 flex flex-col items-center gap-4 pb-4">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => goToPage(currentPage - 1)}
                          disabled={currentPage === 1}
                          className="p-2 rounded-lg bg-slate-900 border border-white/10 text-amber-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
                        >
                          <ChevronLeft size={24} />
                        </button>

                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 text-sm whitespace-nowrap">
                            Page {currentPage} of {totalPages}
                          </span>
                          <input
                            type="range"
                            min="1"
                            max={totalPages}
                            value={currentPage}
                            onChange={(e) => goToPage(parseInt(e.target.value))}
                            className="w-48 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-200"
                          />
                        </div>

                        <button
                          onClick={() => goToPage(currentPage + 1)}
                          disabled={currentPage === totalPages}
                          className="p-2 rounded-lg bg-slate-900 border border-white/10 text-amber-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
                        >
                          <ChevronRight size={24} />
                        </button>
                      </div>

                      <div className="text-slate-500 text-xs">
                        Showing {((currentPage - 1) * 30) + 1} - {Math.min(currentPage * 30, totalPhotos)} of {totalPhotos} photos
                      </div>
                    </div>
                  )}
                </div>

                {selectedPhoto && (
                  <div
                    className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4"
                    onClick={() => {
                      clearPhotoModalTimeout();
                      setSelectedPhoto(null);
                    }}
                    onMouseMove={resetPhotoModalTimeout}
                    onKeyDown={resetPhotoModalTimeout}
                  >
                    <button
                      onClick={() => {
                        clearPhotoModalTimeout();
                        setSelectedPhoto(null);
                      }}
                      className="absolute top-4 right-4 z-10 bg-slate-900/80 hover:bg-slate-800 text-white p-3 rounded-full border border-white/10 shadow-lg transition-all"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    <div className="relative w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                      <div className="relative bg-slate-900 rounded-lg overflow-hidden border border-white/20 shadow-2xl">
                        <div className="p-4 md:p-6 bg-slate-900 border-b border-white/10">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-slate-400 text-xs md:text-sm font-mono">
                              <div>Photo #{photos[currentPhotoIndex]?.id.slice(-8)}</div>
                              <div className="text-slate-500 text-xs mt-1">
                                {new Date(photos[currentPhotoIndex]?.timestamp).toLocaleString()}
                              </div>
                              {photos[currentPhotoIndex]?.phoneNumber && (
                                <div className="text-amber-200 text-xs mt-1 flex items-center gap-1">
                                  <span className="text-slate-500">Phone:</span> {photos[currentPhotoIndex].phoneNumber}
                                </div>
                              )}
                            </div>
                            <div className="text-amber-200 font-serif text-sm">
                              {currentPhotoIndex + 1} / {photos.length}
                            </div>
                          </div>
                          <div className="flex gap-3 flex-wrap">
                            <button
                              onClick={() => {
                                handleDownload(photos[currentPhotoIndex]);
                                resetPhotoModalTimeout();
                              }}
                              className="flex-1 bg-amber-200 text-slate-950 py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-white transition-colors text-sm"
                            >
                              <Download size={16} /> Download
                            </button>
                            <button
                              onClick={() => {
                                clearPhotoModalTimeout();
                                handleDelete(photos[currentPhotoIndex].id);
                                setSelectedPhoto(null);
                              }}
                              className="px-4 py-3 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors flex items-center gap-2 text-sm"
                            >
                              <Trash2 size={16} /> Delete
                            </button>
                          </div>
                        </div>

                        <div className="aspect-[2/3] w-full relative max-h-[70vh]">
                          <img
                            src={photos[currentPhotoIndex]?.dataUrl}
                            alt="Photo"
                            className="w-full h-full object-contain bg-slate-950"
                          />
                        </div>
                      </div>

                      {photos.length > 1 && (
                        <>
                          <button
                            onClick={goToPrevPhoto}
                            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-16 bg-slate-900 hover:bg-slate-800 text-amber-200 p-3 md:p-4 rounded-full border border-white/10 shadow-lg transition-all"
                          >
                            <ChevronLeft size={24} />
                          </button>
                          <button
                            onClick={goToNextPhoto}
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-16 bg-slate-900 hover:bg-slate-800 text-amber-200 p-3 md:p-4 rounded-full border border-white/10 shadow-lg transition-all"
                          >
                            <ChevronRight size={24} />
                          </button>
                        </>
                      )}
                    </div>

                    {photos.length > 1 && (
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 max-w-[90%]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            scrollThumbnails('left');
                            resetPhotoModalTimeout();
                          }}
                          className="flex-shrink-0 bg-slate-900/90 hover:bg-slate-800 text-amber-200 p-2 rounded-full border border-white/20 transition-all"
                        >
                          <ChevronLeft size={20} />
                        </button>

                        <div
                          ref={thumbnailScrollRef}
                          className="flex gap-2 overflow-x-auto scrollbar-hide"
                          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                        >
                          {photos.map((photo, index) => (
                            <button
                              key={photo.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentPhotoIndex(index);
                                setSelectedPhoto(photo);
                                resetPhotoModalTimeout();
                              }}
                              className={\`flex-shrink-0 w-12 h-16 md:w-16 md:h-24 rounded border-2 transition-all overflow-hidden \${
                                index === currentPhotoIndex
                                  ? 'border-amber-200 opacity-100 scale-110'
                                  : 'border-white/30 opacity-50 hover:opacity-75'
                              }\`}
                            >
                              <img
                                src={photo.dataUrl}
                                alt={\`Thumbnail\`}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            scrollThumbnails('right');
                            resetPhotoModalTimeout();
                          }}
                          className="flex-shrink-0 bg-slate-900/90 hover:bg-slate-800 text-amber-200 p-2 rounded-full border border-white/20 transition-all"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'stickers' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-900 rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-serif text-amber-100 mb-4">Manage Custom Stickers</h2>
              <p className="text-slate-400 text-sm mb-6">
                Upload custom stickers that will be available for use in the photo editor.
              </p>
              <StickerUpload
                customStickers={customStickers}
                onStickersUpdated={loadCustomStickers}
                onAddSticker={() => {}}
              />
            </div>
          </div>
        )}

        {activeTab === 'whatsapp' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-serif text-amber-200">WhatsApp Image Sender</h2>
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 p-4 bg-green-900/30 border border-green-500/50 rounded-lg text-green-300">
                  {success}
                </div>
              )}

              {config.api_key && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-xl font-serif text-amber-100">Send Image</h3>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Select Image Source
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="relative">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="hidden"
                            id="image-upload"
                          />
                          <label
                            htmlFor="image-upload"
                            className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-amber-500/50 hover:border-amber-500 rounded-lg cursor-pointer transition-colors text-amber-200"
                          >
                            <Upload className="w-5 h-5" />
                            <span>Upload New</span>
                          </label>
                        </div>
                        <button
                          onClick={() => {
                            setShowGallery(true);
                            loadGalleryForWhatsApp();
                          }}
                          className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-amber-500/50 hover:border-amber-500 rounded-lg transition-colors text-amber-200"
                        >
                          <ImageIcon className="w-5 h-5" />
                          <span>From Gallery</span>
                        </button>
                      </div>

                      {showGallery && (
                        <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-amber-200/20 max-h-[500px] overflow-y-auto">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-amber-100">Select from Gallery</h4>
                            <button
                              onClick={() => setShowGallery(false)}
                              className="text-slate-400 hover:text-white"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="mb-3 pb-3 border-b border-amber-200/20 space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={filterWithPhone}
                                onChange={async (e) => {
                                  setFilterWithPhone(e.target.checked);
                                  setLoadingGallery(true);
                                  try {
                                    const result = await getGallery(1, 100);
                                    const filteredPhotos = e.target.checked
                                      ? result.photos.filter(p => p.phoneNumber)
                                      : result.photos;
                                    setGalleryPhotos(filteredPhotos);
                                  } catch (err) {
                                    console.error('Error loading gallery:', err);
                                  } finally {
                                    setLoadingGallery(false);
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                              />
                              <span className="text-sm text-slate-300">Only show photos with phone numbers</span>
                            </label>
                            <div className="text-xs text-slate-500">
                              Showing {galleryPhotos.length} photo{galleryPhotos.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                          {loadingGallery ? (
                            <div className="text-center py-4 text-slate-400">Loading gallery...</div>
                          ) : galleryPhotos.length === 0 ? (
                            <div className="text-center py-4 text-slate-400">
                              {filterWithPhone ? 'No photos with phone numbers found' : 'No photos in gallery'}
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              {galleryPhotos.map((photo) => (
                                <button
                                  key={photo.id}
                                  onClick={() => selectFromGallery(photo)}
                                  className="relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-500 transition-all group"
                                >
                                  <img
                                    src={photo.dataUrl}
                                    alt="Gallery"
                                    className="w-full h-full object-cover"
                                  />
                                  {photo.phoneNumber && (
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                      <div className="absolute bottom-0 left-0 right-0 p-2">
                                        <div className="text-xs text-white font-semibold truncate">
                                          {photo.phoneNumber}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  {photo.phoneNumber && (
                                    <div className="absolute top-1 right-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">
                                      📱
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {selectedImage && (
                        <div className="mt-4 relative">
                          <img
                            src={selectedImage}
                            alt="Selected"
                            className="w-full h-48 object-cover rounded-lg border-2 border-amber-500/50"
                          />
                          <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Recipient Number
                      </label>
                      <input
                        type="text"
                        value={recipientNumber}
                        onChange={(e) => setRecipientNumber(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-950 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        placeholder="60123456789"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-300">
                          Caption (Optional)
                        </label>
                        <button
                          onClick={() => setCaption("Hey! 😄🎉\\nHere's your strip Photo Booth pictures from Wonderpark 📸✨\\nHope you had fun and love the memories! 💖\\nEnjoy & see you again!")}
                          className="text-xs px-3 py-1 bg-amber-500/20 border border-amber-500/50 text-amber-200 rounded hover:bg-amber-500/30 transition-colors"
                        >
                          Use Preset
                        </button>
                      </div>
                      <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-950 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        rows={5}
                        placeholder="Enter caption..."
                      />
                    </div>

                    <button
                      onClick={sendImage}
                      disabled={sending || !selectedImage || !recipientNumber}
                      className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {sending ? (
                        <>
                          <Clock className="w-5 h-5 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          Send Image
                        </>
                      )}
                    </button>
                  </div>

                  <div>
                    <h3 className="text-xl font-serif text-amber-100 mb-4">Sent Messages</h3>
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {sentMessages.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                          No messages sent yet
                        </div>
                      ) : (
                        sentMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className="p-4 bg-slate-800 rounded-lg border border-amber-200/20"
                          >
                            <div className="flex items-start gap-3">
                              <img
                                src={msg.image_url}
                                alt="Sent"
                                className="w-16 h-16 object-cover rounded"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-amber-100">
                                    {msg.recipient_number}
                                  </span>
                                  {msg.status === 'success' && (
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  )}
                                  {msg.status === 'failed' && (
                                    <XCircle className="w-4 h-4 text-red-500" />
                                  )}
                                  {msg.status === 'pending' && (
                                    <Clock className="w-4 h-4 text-yellow-500" />
                                  )}
                                </div>
                                {msg.caption && (
                                  <p className="text-sm text-slate-400 mb-1 truncate">
                                    {msg.caption}
                                  </p>
                                )}
                                <p className="text-xs text-slate-500">
                                  {new Date(msg.sent_at).toLocaleString()}
                                </p>
                                {msg.error_message && (
                                  <p className="text-xs text-red-400 mt-1">
                                    {msg.error_message}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;`,
  "components/AssetLibrary.tsx": `import React from 'react';
import { StickerType } from '../types';

// Extended types for internal frame assets + stickers
export type AssetType = StickerType | 'jellyfish' | 'school';

export const SVG_STRINGS: Record<string, string> = {
  betta: \`
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bettaGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" style="stop-color:rgb(244,63,94);stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:rgb(136,19,55);stop-opacity:0" />
        </radialGradient>
        <linearGradient id="bettaBody" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#be123c;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#fb7185;stop-opacity:1" />
        </linearGradient>
      </defs>
      <g filter="drop-shadow(3px 5px 2px rgb(0 0 0 / 0.4))">
        <path d="M140,80 Q160,50 120,40 Q90,30 60,60 Q30,40 10,70 Q20,110 50,130 Q90,160 130,130 Q180,140 190,100 Z" fill="url(#bettaBody)" />
        <path d="M130,85 Q170,60 180,90 T140,110" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" />
        <circle cx="150" cy="70" r="15" fill="url(#bettaGlow)" opacity="0.3" />
        <path d="M60,60 Q40,20 80,30" fill="#9f1239" opacity="0.8" />
        <path d="M50,130 Q40,170 80,150" fill="#9f1239" opacity="0.8" />
        <circle cx="50" cy="85" r="4" fill="white" />
        <circle cx="51" cy="85" r="1.5" fill="black" />
      </g>
    </svg>
  \`,
  starfish: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="starGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:#fbbf24;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#d97706;stop-opacity:1" />
        </radialGradient>
      </defs>
      <g filter="drop-shadow(2px 2px 2px rgb(0 0 0 / 0.3))">
        <path d="M50,5 L63,35 L95,38 L70,58 L78,90 L50,72 L22,90 L30,58 L5,38 L37,35 Z" fill="url(#starGrad)" stroke="#b45309" stroke-width="1" stroke-linejoin="round" />
        <circle cx="50" cy="50" r="2" fill="#fff" opacity="0.6"/>
        <circle cx="50" cy="20" r="1" fill="#fff" opacity="0.5"/>
        <circle cx="75" cy="40" r="1" fill="#fff" opacity="0.5"/>
      </g>
    </svg>
  \`,
  shell: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="shellGrad" x1="0%" y1="0%" x2="0%" y2="100%">
           <stop offset="0%" style="stop-color:#fde68a;stop-opacity:1" />
           <stop offset="100%" style="stop-color:#d97706;stop-opacity:1" />
         </linearGradient>
       </defs>
       <g filter="drop-shadow(2px 2px 1px rgb(0 0 0 / 0.3))">
         <path d="M20,80 Q50,10 80,80 L50,90 Z" fill="url(#shellGrad)" />
         <path d="M20,80 Q35,45 50,90" fill="none" stroke="#92400e" stroke-width="1" />
         <path d="M80,80 Q65,45 50,90" fill="none" stroke="#92400e" stroke-width="1" />
         <path d="M50,90 L50,25" fill="none" stroke="#92400e" stroke-width="1" opacity="0.5" />
       </g>
    </svg>
  \`,
  bubble: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
       <radialGradient id="bubbleGrad" cx="30%" cy="30%" r="70%">
         <stop offset="0%" style="stop-color:white;stop-opacity:0.8" />
         <stop offset="80%" style="stop-color:#bae6fd;stop-opacity:0.2" />
         <stop offset="100%" style="stop-color:#0ea5e9;stop-opacity:0.1" />
       </radialGradient>
       <circle cx="50" cy="50" r="40" fill="url(#bubbleGrad)" stroke="rgba(255,255,255,0.4)" stroke-width="1" />
       <path d="M60,25 Q75,30 75,45" fill="none" stroke="white" stroke-width="2" opacity="0.6" stroke-linecap="round" />
    </svg>
  \`,
  seaweed: \`
    <svg viewBox="0 0 100 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="weedGrad" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" style="stop-color:#84cc16;stop-opacity:1" />
           <stop offset="100%" style="stop-color:#14532d;stop-opacity:1" />
        </linearGradient>
      </defs>
      <path d="M50,200 Q20,150 50,120 Q80,90 40,60 Q10,30 50,0 Q80,40 60,80 Q40,120 70,160 Q90,190 50,200 Z" fill="url(#weedGrad)" opacity="0.9" />
    </svg>
  \`,
  coral: \`
     <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="coralGrad" x1="0" y1="1" x2="1" y2="0">
           <stop offset="0%" style="stop-color:#fda4af;stop-opacity:1" />
           <stop offset="100%" style="stop-color:#e11d48;stop-opacity:1" />
        </linearGradient>
      </defs>
      <g filter="drop-shadow(2px 2px 2px rgb(0 0 0 / 0.4))">
         <path d="M100,200 C100,200 20,150 50,80 C60,50 30,30 20,50 M100,200 C100,200 180,150 150,80 C140,50 170,30 180,50 M100,200 L100,100 C100,100 80,60 90,30 M100,100 C100,100 120,60 110,30" 
         stroke="url(#coralGrad)" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round" />
         <circle cx="50" cy="80" r="5" fill="#ffe4e6" opacity="0.6"/>
         <circle cx="150" cy="80" r="5" fill="#ffe4e6" opacity="0.6"/>
      </g>
    </svg>
  \`,
  crab: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.2))">
        <!-- Legs -->
        <path d="M20,60 Q10,50 15,40" stroke="#f87171" stroke-width="5" fill="none" stroke-linecap="round" />
        <path d="M80,60 Q90,50 85,40" stroke="#f87171" stroke-width="5" fill="none" stroke-linecap="round" />
        <path d="M25,65 Q10,70 15,80" stroke="#f87171" stroke-width="5" fill="none" stroke-linecap="round" />
        <path d="M75,65 Q90,70 85,80" stroke="#f87171" stroke-width="5" fill="none" stroke-linecap="round" />
        <!-- Body -->
        <ellipse cx="50" cy="60" rx="30" ry="20" fill="#ef4444" />
        <!-- Eyes -->
        <circle cx="35" cy="45" r="5" fill="white" stroke="#ef4444" stroke-width="2"/>
        <circle cx="35" cy="45" r="2" fill="black"/>
        <circle cx="65" cy="45" r="5" fill="white" stroke="#ef4444" stroke-width="2"/>
        <circle cx="65" cy="45" r="2" fill="black"/>
        <!-- Smile -->
        <path d="M45,65 Q50,68 55,65" fill="none" stroke="#7f1d1d" stroke-width="2" stroke-linecap="round"/>
        <!-- Claws -->
        <path d="M15,40 Q5,30 15,25 Q20,35 15,40" fill="#ef4444" />
        <path d="M85,40 Q95,30 85,25 Q80,35 85,40" fill="#ef4444" />
      </g>
    </svg>
  \`,
  octopus: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.2))">
        <!-- Tentacles -->
        <path d="M30,70 Q20,90 35,90" stroke="#d8b4fe" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M45,70 Q45,95 55,90" stroke="#d8b4fe" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M60,70 Q70,90 80,80" stroke="#d8b4fe" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M70,65 Q90,70 90,50" stroke="#d8b4fe" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M20,65 Q10,70 10,50" stroke="#d8b4fe" stroke-width="6" fill="none" stroke-linecap="round"/>
        <!-- Head -->
        <path d="M20,50 Q20,10 50,10 Q80,10 80,50 L80,60 Q80,70 50,70 Q20,70 20,60 Z" fill="#c084fc" />
        <!-- Eyes -->
        <circle cx="35" cy="45" r="4" fill="white" />
        <circle cx="35" cy="45" r="2" fill="black" />
        <circle cx="65" cy="45" r="4" fill="white" />
        <circle cx="65" cy="45" r="2" fill="black" />
        <!-- Blush -->
        <circle cx="28" cy="55" r="3" fill="#f0abfc" opacity="0.6"/>
        <circle cx="72" cy="55" r="3" fill="#f0abfc" opacity="0.6"/>
      </g>
    </svg>
  \`,
  bow: \`
    <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(1px 2px 2px rgba(0,0,0,0.2))">
         <path d="M50,30 Q30,0 10,20 Q0,30 10,40 Q30,60 50,30 Z" fill="#f9a8d4" />
         <path d="M50,30 Q70,0 90,20 Q100,30 90,40 Q70,60 50,30 Z" fill="#f9a8d4" />
         <circle cx="50" cy="30" r="8" fill="#f472b6" />
         <path d="M20,25 Q25,25 25,30" fill="none" stroke="#fbcfe8" stroke-width="2" />
         <path d="M80,25 Q75,25 75,30" fill="none" stroke="#fbcfe8" stroke-width="2" />
      </g>
    </svg>
  \`,
  sparkles: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="sparkleGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:#fef08a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0" />
        </radialGradient>
      </defs>
      <path d="M50,10 Q60,40 90,50 Q60,60 50,90 Q40,60 10,50 Q40,40 50,10 Z" fill="#fef08a" />
      <path d="M20,20 Q25,30 35,35 Q25,40 20,50 Q15,40 5,35 Q15,30 20,20 Z" fill="#fef9c3" opacity="0.8" />
      <path d="M80,80 Q82,85 85,87 Q82,89 80,94 Q78,89 75,87 Q78,85 80,80 Z" fill="#fef9c3" opacity="0.8" />
    </svg>
  \`,
  heart: \`
     <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
       <path d="M50,85 C50,85 10,55 10,30 C10,15 25,5 40,10 C45,12 50,20 50,20 C50,20 55,12 60,10 C75,5 90,15 90,30 C90,55 50,85 50,85 Z" fill="#fda4af" stroke="#f43f5e" stroke-width="2" stroke-linejoin="round"/>
       <path d="M25,20 Q30,15 35,20" fill="none" stroke="white" stroke-width="3" opacity="0.5" stroke-linecap="round"/>
     </svg>
  \`,
  jellyfish_cute: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
        <!-- Tentacles -->
        <path d="M30,60 Q20,80 30,90" stroke="#f0abfc" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M50,60 Q50,85 50,90" stroke="#f0abfc" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M70,60 Q80,80 70,90" stroke="#f0abfc" stroke-width="4" fill="none" stroke-linecap="round"/>
        
        <!-- Head -->
        <path d="M15,60 Q15,10 50,10 Q85,10 85,60 Z" fill="#e879f9" />
        
        <!-- Face -->
        <circle cx="35" cy="45" r="3" fill="black" />
        <circle cx="65" cy="45" r="3" fill="black" />
        <path d="M45,52 Q50,55 55,52" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"/>
        <circle cx="28" cy="50" r="4" fill="#f5d0fe" opacity="0.6"/>
        <circle cx="72" cy="50" r="4" fill="#f5d0fe" opacity="0.6"/>
      </g>
    </svg>
  \`,
  star_cute: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
         <!-- Rounded Star -->
         <path d="M50,5 Q60,35 90,35 Q65,55 75,85 Q50,70 25,85 Q35,55 10,35 Q40,35 50,5 Z" 
               fill="#fef08a" stroke="#fde047" stroke-width="2" stroke-linejoin="round"/>
         <!-- Face -->
         <circle cx="40" cy="45" r="3" fill="black"/>
         <circle cx="60" cy="45" r="3" fill="black"/>
         <path d="M45,55 Q50,60 55,55" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>
  \`,
  clam_cute: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
        <!-- Shell Bottom -->
        <path d="M20,60 Q50,95 80,60" fill="#bae6fd" stroke="#7dd3fc" stroke-width="2"/>
        <!-- Shell Top -->
        <path d="M20,60 Q10,20 50,20 Q90,20 80,60" fill="#bae6fd" stroke="#7dd3fc" stroke-width="2"/>
        <!-- Pearl -->
        <circle cx="50" cy="60" r="12" fill="#fdf2f8" stroke="#fce7f3" stroke-width="1"/>
        <!-- Face on Shell -->
        <circle cx="38" cy="45" r="3" fill="black"/>
        <circle cx="62" cy="45" r="3" fill="black"/>
        <path d="M45,50 Q50,53 55,50" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>
  \`,
  seahorse: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
         <!-- Body -->
         <path d="M40,20 Q30,10 50,10 Q65,10 65,25 Q65,40 55,45 Q45,50 45,60 Q45,75 55,80 Q65,85 60,95 Q50,100 40,90 Q30,80 35,60 Q40,50 50,45" 
           fill="#fdba74" stroke="#fb923c" stroke-width="2" stroke-linecap="round"/>
         <!-- Snout -->
         <path d="M40,20 L30,22" stroke="#fb923c" stroke-width="3" fill="none" stroke-linecap="round"/>
         <!-- Eye -->
         <circle cx="50" cy="20" r="3" fill="black"/>
         <!-- Fin -->
         <path d="M65,35 Q75,35 70,45" fill="#fed7aa" stroke="#fb923c" stroke-width="1"/>
      </g>
    </svg>
  \`,
  narwhal: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
         <!-- Horn -->
         <path d="M30,40 L10,25" stroke="#fcd34d" stroke-width="3" stroke-linecap="round"/>
         <!-- Body -->
         <path d="M30,40 Q25,70 50,70 Q80,70 90,50 Q80,30 50,30 Q35,30 30,40 Z" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>
         <!-- Tail -->
         <path d="M90,50 Q95,40 100,50 Q95,60 90,50" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>
         <!-- Eye -->
         <circle cx="45" cy="45" r="3" fill="black"/>
         <circle cx="40" cy="50" r="3" fill="#fecaca" opacity="0.6"/>
      </g>
    </svg>
  \`,
  shark: \`
    <svg viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sharkGrad" x1="0" y1="0" x2="1" y2="0">
           <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
           <stop offset="100%" style="stop-color:#334155;stop-opacity:1" />
        </linearGradient>
      </defs>
      <path d="M280,75 Q250,70 220,60 Q180,40 140,45 Q150,20 130,10 Q120,40 100,50 Q60,55 20,70 Q40,80 20,90 Q60,100 100,95 Q130,120 160,100 Q190,100 220,90 Q250,85 280,75 Z" 
        fill="url(#sharkGrad)" opacity="0.7" />
      <path d="M140,45 Q130,70 160,75" fill="none" stroke="#475569" stroke-width="2" opacity="0.5"/>
    </svg>
  \`,
  jellyfish: \`
    <svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="jellyHead" cx="50%" cy="40%" r="50%">
          <stop offset="0%" style="stop-color:#e879f9;stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:#a21caf;stop-opacity:0.1" />
        </radialGradient>
      </defs>
      <g opacity="0.8">
        <path d="M10,50 Q50,-20 90,50 Z" fill="url(#jellyHead)" filter="drop-shadow(0 0 5px #e879f9)"/>
        <path d="M20,50 Q10,100 25,140" stroke="#f5d0fe" stroke-width="2" fill="none" opacity="0.6"/>
        <path d="M40,50 Q30,110 45,150" stroke="#f5d0fe" stroke-width="2" fill="none" opacity="0.8"/>
        <path d="M60,50 Q70,110 55,150" stroke="#f5d0fe" stroke-width="2" fill="none" opacity="0.8"/>
        <path d="M80,50 Q90,100 75,140" stroke="#f5d0fe" stroke-width="2" fill="none" opacity="0.6"/>
      </g>
    </svg>
  \`,
  school: \`
    <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
       <g fill="#fde047" opacity="0.6">
         <path d="M10,20 Q20,15 30,20 Q20,25 10,20 Z" />
         <path d="M40,30 Q50,25 60,30 Q50,35 40,30 Z" />
         <path d="M25,50 Q35,45 45,50 Q35,55 25,50 Z" />
         <path d="M60,10 Q70,5 80,10 Q70,15 60,10 Z" />
       </g>
    </svg>
  \`,
  fish: \`
    <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fishGrad" x1="0" y1="0" x2="1" y2="0">
           <stop offset="0%" style="stop-color:#38bdf8;stop-opacity:1" />
           <stop offset="100%" style="stop-color:#0284c7;stop-opacity:1" />
        </linearGradient>
      </defs>
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.2))">
        <!-- Tail -->
        <path d="M10,40 Q20,20 30,30 Q20,40 30,50 Q20,60 10,40 Z" fill="url(#fishGrad)" />
        <!-- Body -->
        <ellipse cx="60" cy="40" rx="35" ry="25" fill="url(#fishGrad)" />
        <!-- Fins -->
        <path d="M40,55 Q35,70 50,65" fill="#7dd3fc" opacity="0.8"/>
        <path d="M40,25 Q35,10 50,15" fill="#7dd3fc" opacity="0.8"/>
        <!-- Eye -->
        <circle cx="75" cy="35" r="5" fill="white" />
        <circle cx="76" cy="35" r="2.5" fill="black" />
        <!-- Scale pattern -->
        <path d="M45,35 Q50,38 55,35" fill="none" stroke="#bae6fd" stroke-width="1" opacity="0.6"/>
        <path d="M50,42 Q55,45 60,42" fill="none" stroke="#bae6fd" stroke-width="1" opacity="0.6"/>
      </g>
    </svg>
  \`,
  sailboat: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.2))">
        <!-- Hull -->
        <path d="M20,70 L50,85 L80,70 L70,65 L30,65 Z" fill="#78716c" stroke="#57534e" stroke-width="2"/>
        <!-- Sail Main -->
        <path d="M50,20 L50,65 L75,65 Z" fill="#fef9c3" stroke="#fde047" stroke-width="1.5"/>
        <!-- Sail Small -->
        <path d="M50,30 L50,65 L30,65 Z" fill="#fef08a" stroke="#fde047" stroke-width="1.5"/>
        <!-- Mast -->
        <line x1="50" y1="20" x2="50" y2="70" stroke="#57534e" stroke-width="2"/>
        <!-- Flag -->
        <path d="M50,20 L60,22 L50,24 Z" fill="#fb7185"/>
        <!-- Waves -->
        <path d="M10,75 Q20,72 30,75 Q40,78 50,75 Q60,72 70,75 Q80,78 90,75" fill="none" stroke="#bae6fd" stroke-width="1.5" opacity="0.6"/>
      </g>
    </svg>
  \`,
  turtle: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
        <!-- Flippers -->
        <ellipse cx="20" cy="55" rx="8" ry="15" fill="#4ade80" opacity="0.8"/>
        <ellipse cx="80" cy="55" rx="8" ry="15" fill="#4ade80" opacity="0.8"/>
        <ellipse cx="30" cy="75" rx="8" ry="12" fill="#4ade80" opacity="0.8"/>
        <ellipse cx="70" cy="75" rx="8" ry="12" fill="#4ade80" opacity="0.8"/>
        <!-- Shell -->
        <ellipse cx="50" cy="60" rx="35" ry="25" fill="#22c55e" stroke="#16a34a" stroke-width="2"/>
        <!-- Shell Pattern -->
        <path d="M50,35 L50,85" stroke="#16a34a" stroke-width="1.5" opacity="0.6"/>
        <path d="M30,50 L70,50" stroke="#16a34a" stroke-width="1.5" opacity="0.6"/>
        <path d="M30,70 L70,70" stroke="#16a34a" stroke-width="1.5" opacity="0.6"/>
        <circle cx="40" cy="45" r="6" fill="#86efac" opacity="0.4"/>
        <circle cx="60" cy="45" r="6" fill="#86efac" opacity="0.4"/>
        <circle cx="50" cy="65" r="6" fill="#86efac" opacity="0.4"/>
        <!-- Head -->
        <circle cx="50" cy="30" r="12" fill="#4ade80" stroke="#22c55e" stroke-width="2"/>
        <!-- Eyes -->
        <circle cx="45" cy="28" r="2" fill="black"/>
        <circle cx="55" cy="28" r="2" fill="black"/>
        <!-- Smile -->
        <path d="M47,33 Q50,35 53,33" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
      </g>
    </svg>
  \`,
  dolphin: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
        <!-- Body -->
        <path d="M10,60 Q20,30 50,30 Q80,30 90,50 Q95,70 75,75 Q50,80 30,70 Q10,65 10,60 Z" fill="#60a5fa" stroke="#3b82f6" stroke-width="2"/>
        <!-- Tail -->
        <path d="M30,70 Q20,85 15,80 Q18,75 30,70 Q20,75 18,70" fill="#60a5fa" stroke="#3b82f6" stroke-width="2"/>
        <!-- Dorsal Fin -->
        <path d="M60,30 Q65,15 68,30" fill="#60a5fa" stroke="#3b82f6" stroke-width="2"/>
        <!-- Snout -->
        <path d="M90,50 L98,52" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/>
        <!-- Eye -->
        <circle cx="75" cy="45" r="3" fill="black"/>
        <!-- Smile -->
        <path d="M85,55 Q87,57 89,55" fill="none" stroke="#1e40af" stroke-width="1.5" stroke-linecap="round"/>
        <!-- Belly highlight -->
        <path d="M50,55 Q65,58 80,55" fill="none" stroke="#bfdbfe" stroke-width="2" opacity="0.5"/>
      </g>
    </svg>
  \`,
  whale: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
        <!-- Body -->
        <ellipse cx="50" cy="60" rx="40" ry="25" fill="#7dd3fc" stroke="#0ea5e9" stroke-width="2"/>
        <!-- Tail -->
        <path d="M90,60 Q95,50 98,55 M90,60 Q95,70 98,65" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round"/>
        <!-- Fins -->
        <path d="M25,75 Q20,85 30,82" fill="#7dd3fc" stroke="#0ea5e9" stroke-width="2"/>
        <path d="M75,75 Q80,85 70,82" fill="#7dd3fc" stroke="#0ea5e9" stroke-width="2"/>
        <!-- Eye -->
        <circle cx="30" cy="55" r="3" fill="black"/>
        <!-- Smile -->
        <path d="M20,65 Q25,68 30,65" fill="none" stroke="#0c4a6e" stroke-width="2" stroke-linecap="round"/>
        <!-- Blowhole spray -->
        <path d="M45,35 Q43,25 45,20 M50,35 Q50,22 50,18 M55,35 Q57,25 55,20" fill="none" stroke="#bae6fd" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
        <!-- Belly -->
        <path d="M30,70 Q50,75 70,70" fill="none" stroke="#e0f2fe" stroke-width="3" opacity="0.6"/>
      </g>
    </svg>
  \`,
  pufferfish: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
        <!-- Body -->
        <circle cx="50" cy="50" r="30" fill="#fde047" stroke="#facc15" stroke-width="2"/>
        <!-- Spikes -->
        <line x1="50" y1="20" x2="50" y2="10" stroke="#eab308" stroke-width="2" stroke-linecap="round"/>
        <line x1="70" y1="25" x2="78" y2="18" stroke="#eab308" stroke-width="2" stroke-linecap="round"/>
        <line x1="80" y1="50" x2="90" y2="50" stroke="#eab308" stroke-width="2" stroke-linecap="round"/>
        <line x1="70" y1="75" x2="78" y2="82" stroke="#eab308" stroke-width="2" stroke-linecap="round"/>
        <line x1="50" y1="80" x2="50" y2="90" stroke="#eab308" stroke-width="2" stroke-linecap="round"/>
        <line x1="30" y1="75" x2="22" y2="82" stroke="#eab308" stroke-width="2" stroke-linecap="round"/>
        <line x1="20" y1="50" x2="10" y2="50" stroke="#eab308" stroke-width="2" stroke-linecap="round"/>
        <line x1="30" y1="25" x2="22" y2="18" stroke="#eab308" stroke-width="2" stroke-linecap="round"/>
        <!-- Spots -->
        <circle cx="40" cy="45" r="3" fill="#ca8a04" opacity="0.6"/>
        <circle cx="60" cy="45" r="3" fill="#ca8a04" opacity="0.6"/>
        <circle cx="50" cy="60" r="3" fill="#ca8a04" opacity="0.6"/>
        <!-- Eyes -->
        <circle cx="42" cy="45" r="4" fill="white"/>
        <circle cx="42" cy="45" r="2" fill="black"/>
        <circle cx="58" cy="45" r="4" fill="white"/>
        <circle cx="58" cy="45" r="2" fill="black"/>
        <!-- Mouth -->
        <path d="M45,55 Q50,57 55,55" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>
  \`,
  pearl: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="pearlGrad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#fdf4ff;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#f5d0fe;stop-opacity:1" />
        </radialGradient>
      </defs>
      <g filter="drop-shadow(2px 3px 3px rgba(0,0,0,0.15))">
        <!-- Main pearl -->
        <circle cx="50" cy="50" r="35" fill="url(#pearlGrad)" stroke="#e9d5ff" stroke-width="2"/>
        <!-- Highlights -->
        <ellipse cx="38" cy="38" rx="12" ry="15" fill="white" opacity="0.6"/>
        <circle cx="60" cy="60" r="5" fill="white" opacity="0.4"/>
        <!-- Subtle shine -->
        <path d="M30,30 Q35,28 40,30" fill="none" stroke="white" stroke-width="3" opacity="0.7" stroke-linecap="round"/>
      </g>
    </svg>
  \`,
  anchor: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.2))">
        <!-- Shank -->
        <rect x="47" y="25" width="6" height="50" fill="#64748b" stroke="#475569" stroke-width="2"/>
        <!-- Ring -->
        <circle cx="50" cy="20" r="8" fill="none" stroke="#64748b" stroke-width="5"/>
        <!-- Crown -->
        <path d="M50,75 L30,85 Q25,88 25,80 L30,70" fill="#64748b" stroke="#475569" stroke-width="2"/>
        <path d="M50,75 L70,85 Q75,88 75,80 L70,70" fill="#64748b" stroke="#475569" stroke-width="2"/>
        <!-- Flukes -->
        <circle cx="25" cy="80" r="6" fill="#64748b" stroke="#475569" stroke-width="2"/>
        <circle cx="75" cy="80" r="6" fill="#64748b" stroke="#475569" stroke-width="2"/>
        <!-- Crossbar -->
        <rect x="25" y="42" width="50" height="6" fill="#64748b" stroke="#475569" stroke-width="2"/>
        <!-- Shine -->
        <path d="M50,30 L50,60" stroke="#94a3b8" stroke-width="2" opacity="0.4"/>
      </g>
    </svg>
  \`,
  treasure_chest: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.2))">
        <!-- Chest bottom -->
        <rect x="20" y="60" width="60" height="30" fill="#92400e" stroke="#78350f" stroke-width="2"/>
        <!-- Chest top (lid) -->
        <path d="M20,60 Q20,40 50,40 Q80,40 80,60 Z" fill="#b45309" stroke="#78350f" stroke-width="2"/>
        <!-- Lock plate -->
        <rect x="45" y="55" width="10" height="15" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/>
        <!-- Keyhole -->
        <circle cx="50" cy="60" r="2" fill="#92400e"/>
        <rect x="49" y="60" width="2" height="4" fill="#92400e"/>
        <!-- Metal bands -->
        <rect x="18" y="72" width="64" height="3" fill="#78350f"/>
        <rect x="18" y="82" width="64" height="3" fill="#78350f"/>
        <!-- Coins spilling out -->
        <circle cx="75" cy="88" r="4" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/>
        <circle cx="82" cy="85" r="4" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/>
        <circle cx="70" cy="92" r="3" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/>
        <!-- Highlight on lid -->
        <path d="M35,45 Q50,43 65,45" fill="none" stroke="#d97706" stroke-width="2" opacity="0.6"/>
      </g>
    </svg>
  \`,
  sea_otter: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
        <!-- Body -->
        <ellipse cx="50" cy="65" rx="22" ry="28" fill="#92400e" stroke="#78350f" stroke-width="2"/>
        <!-- Head -->
        <circle cx="50" cy="35" r="18" fill="#92400e" stroke="#78350f" stroke-width="2"/>
        <!-- Ears -->
        <circle cx="38" cy="25" r="5" fill="#78350f"/>
        <circle cx="62" cy="25" r="5" fill="#78350f"/>
        <!-- Cheeks -->
        <circle cx="35" cy="40" r="8" fill="#a16207" opacity="0.8"/>
        <circle cx="65" cy="40" r="8" fill="#a16207" opacity="0.8"/>
        <!-- Face patch -->
        <ellipse cx="50" cy="42" rx="12" ry="10" fill="#d97706"/>
        <!-- Nose -->
        <circle cx="50" cy="40" r="3" fill="#451a03"/>
        <!-- Eyes -->
        <circle cx="44" cy="33" r="2.5" fill="black"/>
        <circle cx="56" cy="33" r="2.5" fill="black"/>
        <!-- Paws -->
        <ellipse cx="35" cy="75" rx="8" ry="6" fill="#92400e" stroke="#78350f" stroke-width="1.5"/>
        <ellipse cx="65" cy="75" rx="8" ry="6" fill="#92400e" stroke="#78350f" stroke-width="1.5"/>
        <!-- Shell on belly -->
        <ellipse cx="50" cy="72" rx="8" ry="10" fill="#d6d3d1" stroke="#a8a29e" stroke-width="1.5"/>
        <path d="M45,68 Q50,70 55,68" fill="none" stroke="#78716c" stroke-width="1"/>
        <path d="M45,76 Q50,78 55,76" fill="none" stroke="#78716c" stroke-width="1"/>
      </g>
    </svg>
  \`,
  penguin: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
        <!-- Body -->
        <ellipse cx="50" cy="60" rx="25" ry="32" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
        <!-- Belly -->
        <ellipse cx="50" cy="62" rx="16" ry="24" fill="white"/>
        <!-- Head -->
        <circle cx="50" cy="30" r="16" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
        <!-- Face patch -->
        <ellipse cx="50" cy="32" rx="11" ry="10" fill="white"/>
        <!-- Eyes -->
        <circle cx="45" cy="28" r="3" fill="black"/>
        <circle cx="55" cy="28" r="3" fill="black"/>
        <circle cx="46" cy="27" r="1" fill="white"/>
        <circle cx="56" cy="27" r="1" fill="white"/>
        <!-- Beak -->
        <path d="M45,35 L50,38 L55,35 Q50,36 45,35" fill="#f97316" stroke="#ea580c" stroke-width="1"/>
        <!-- Wings -->
        <ellipse cx="27" cy="55" rx="8" ry="20" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
        <ellipse cx="73" cy="55" rx="8" ry="20" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
        <!-- Feet -->
        <ellipse cx="42" cy="90" rx="8" ry="5" fill="#f97316" stroke="#ea580c" stroke-width="1.5"/>
        <ellipse cx="58" cy="90" rx="8" ry="5" fill="#f97316" stroke="#ea580c" stroke-width="1.5"/>
        <!-- Blush -->
        <circle cx="38" cy="38" r="3" fill="#fca5a5" opacity="0.5"/>
        <circle cx="62" cy="38" r="3" fill="#fca5a5" opacity="0.5"/>
      </g>
    </svg>
  \`,
  mermaid_tail: \`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mermaidGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#06b6d4;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
        </linearGradient>
      </defs>
      <g filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.1))">
        <!-- Tail body -->
        <path d="M50,10 Q45,30 40,50 Q35,70 30,85 Q35,95 50,90 Q65,95 70,85 Q65,70 60,50 Q55,30 50,10 Z"
              fill="url(#mermaidGrad)" stroke="#0891b2" stroke-width="2"/>
        <!-- Scales pattern -->
        <path d="M48,25 Q50,27 52,25" fill="none" stroke="#67e8f9" stroke-width="1.5" opacity="0.6"/>
        <path d="M46,35 Q50,37 54,35" fill="none" stroke="#67e8f9" stroke-width="1.5" opacity="0.6"/>
        <path d="M44,45 Q50,47 56,45" fill="none" stroke="#67e8f9" stroke-width="1.5" opacity="0.6"/>
        <path d="M42,55 Q50,57 58,55" fill="none" stroke="#67e8f9" stroke-width="1.5" opacity="0.6"/>
        <path d="M40,65 Q50,67 60,65" fill="none" stroke="#67e8f9" stroke-width="1.5" opacity="0.6"/>
        <path d="M38,75 Q50,77 62,75" fill="none" stroke="#67e8f9" stroke-width="1.5" opacity="0.6"/>
        <!-- Fin left -->
        <path d="M30,85 Q15,88 20,95 Q25,92 30,85" fill="#c084fc" stroke="#a855f7" stroke-width="2"/>
        <!-- Fin right -->
        <path d="M70,85 Q85,88 80,95 Q75,92 70,85" fill="#c084fc" stroke="#a855f7" stroke-width="2"/>
        <!-- Sparkles -->
        <circle cx="45" cy="40" r="2" fill="#fef08a" opacity="0.8"/>
        <circle cx="58" cy="60" r="2" fill="#fef08a" opacity="0.8"/>
        <circle cx="52" cy="70" r="1.5" fill="#fef08a" opacity="0.8"/>
      </g>
    </svg>
  \`
};

export const getSvgUrl = (type: string) => {
  const svgString = SVG_STRINGS[type];
  if (!svgString) return '';
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  return URL.createObjectURL(blob);
};

export const StickerAsset: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
  if (!SVG_STRINGS[type]) return null;
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: SVG_STRINGS[type] }} />
  );
};`,
  "components/CameraCapture.tsx": `import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera } from 'lucide-react';
import { LAYOUT_CONFIG, LayoutType } from '../types';

interface Props {
  layout: LayoutType;
  onComplete: (photos: string[]) => void;
}

const CameraCapture: React.FC<Props> = ({ layout, onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [error, setError] = useState<string>('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCapturingRef = useRef(false);

  const targetCount = LAYOUT_CONFIG[layout].photoCount;
  const targetAspect = layout === 'postcard' ? 16 / 9 : 4 / 3;

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'user',
            focusMode: 'continuous',
            focusDistance: { ideal: 0 }
          } as MediaTrackConstraints,
          audio: false
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Camera error:", err);
        setError("Unable to access camera. Please check permissions.");
      }
    };
    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startCountdownRef = useRef<() => void>();

  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current && !isCapturingRef.current) {
      isCapturingRef.current = true;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        const videoAspect = video.videoWidth / video.videoHeight;
        let sWidth = video.videoWidth;
        let sHeight = video.videoHeight;
        let sx = 0;
        let sy = 0;

        if (videoAspect > targetAspect) {
          sWidth = video.videoHeight * targetAspect;
          sx = (video.videoWidth - sWidth) / 2;
        } else {
          sHeight = video.videoWidth / targetAspect;
          sy = (video.videoHeight - sHeight) / 2;
        }

        canvas.width = targetAspect > 1.5 ? 1280 : 960;
        canvas.height = canvas.width / targetAspect;

        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 200);

        setCapturedPhotos(prev => {
          const newPhotos = [...prev, dataUrl];

          setTimeout(() => {
            isCapturingRef.current = false;
            if (newPhotos.length >= targetCount) {
              setTimeout(() => onComplete(newPhotos), 1000);
            } else if (startCountdownRef.current) {
              setTimeout(() => startCountdownRef.current!(), 1500);
            }
          }, 0);

          return newPhotos;
        });
      } else {
        isCapturingRef.current = false;
      }
    }
  }, [targetAspect, targetCount, onComplete]);

  const startCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    let count = 3;
    setCountdown(count);

    intervalRef.current = setInterval(() => {
      count--;
      if (count === 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setCountdown(null);
        setTimeout(() => capturePhoto(), 100);
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, [capturePhoto]);

  startCountdownRef.current = startCountdown;

  const handleStartSession = () => {
    startCountdown();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen relative z-10 w-full classic-gradient p-4">
       {/* Ambient Overlay Assets */}
       <div className="absolute inset-0 gold-shimmer opacity-20 pointer-events-none"></div>

      {error ? (
        <div className="bg-red-900/50 border border-red-500 text-red-100 p-6 rounded-sm font-serif">
          {error}
        </div>
      ) : (
        <div 
          className="relative w-full max-w-3xl bg-black rounded-lg overflow-hidden shadow-2xl border-4 border-amber-200/20 transition-all duration-500"
          style={{ 
              aspectRatio: \`\${targetAspect}\`,
              maxHeight: '75vh' // Ensure it fits on mobile screens with UI below
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

          {/* UI Overlays */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 md:p-6">
            <div className="flex justify-between items-start">
               <div className="bg-slate-900/60 backdrop-blur px-4 py-1 md:px-6 md:py-2 rounded-full text-amber-100 font-serif border border-amber-200/20 text-xs md:text-base">
                 Exposure {capturedPhotos.length + 1} / {targetCount}
               </div>
               <div className="hidden md:block text-amber-200/80 text-sm font-serif italic tracking-wider">
                 Deep Blue Studio
               </div>
            </div>
            
            {/* Center Countdown */}
            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center z-50">
                <div className="text-[80px] md:text-[140px] font-serif font-bold text-amber-100 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
                  {countdown}
                </div>
              </div>
            )}

            <div className="flex justify-center pb-2 md:pb-4">
              {capturedPhotos.length === 0 && countdown === null && (
                 <button
                 onClick={handleStartSession}
                 className="pointer-events-auto bg-amber-200 hover:bg-white text-slate-900 rounded-full p-4 md:p-6 shadow-[0_0_30px_rgba(251,191,36,0.4)] transition-all transform hover:scale-105 active:scale-95 group"
               >
                 <Camera className="w-8 h-8 md:w-10 md:h-10 text-slate-900" />
               </button>
              )}
            </div>
          </div>
          
          {/* Progress indicators */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            {Array.from({ length: targetCount }).map((_, i) => (
              <div 
                key={i}
                className={\`w-2 h-2 rounded-full border border-amber-200 transition-colors duration-300 \${
                  i < capturedPhotos.length ? 'bg-amber-200' : 'bg-transparent'
                }\`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 md:mt-8 text-center text-amber-100/60 font-serif text-base md:text-lg tracking-wide px-4">
        {capturedPhotos.length === 0 && !countdown && "Tap the camera to begin your session."}
        {countdown && "Hold pose..."}
        {capturedPhotos.length > 0 && "Capture complete."}
      </div>
    </div>
  );
};

export default CameraCapture;`,
  "components/LayoutSelection.tsx": `import React from 'react';
import { LayoutType, LAYOUT_CONFIG } from '../types';
import { Camera, Columns2 as Columns, Lock } from 'lucide-react';

interface Props {
  onSelect: (layout: LayoutType) => void;
  onAdmin: () => void;
}

const LayoutSelection: React.FC<Props> = ({ onSelect, onAdmin }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] text-slate-200 p-4 md:p-6 relative z-10 classic-gradient overflow-y-auto">
      {/* Decorative Border Frame */}
      <div className="absolute inset-2 md:inset-4 border border-amber-200/20 pointer-events-none rounded-2xl md:rounded-3xl" />
      <div className="absolute inset-4 md:inset-6 border border-amber-200/10 pointer-events-none rounded-xl md:rounded-2xl" />

      <div className="text-center mt-8 mb-8 md:mb-16 animate-fade-in-up z-20 shrink-0">
        <h3 className="text-amber-200/60 uppercase tracking-[0.3em] text-xs md:text-sm mb-2 md:mb-4">Est. 2026</h3>
        <h1 className="text-4xl md:text-7xl font-serif font-medium mb-4 md:mb-6 text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-400 drop-shadow-sm leading-tight">
          Deep Blue
        </h1>
        <div className="h-px w-16 md:w-24 bg-gradient-to-r from-transparent via-amber-200/50 to-transparent mx-auto mb-4 md:mb-6"></div>
        <p className="text-base md:text-xl text-slate-400 font-light italic max-w-md mx-auto font-serif px-4">
          "A timeless underwater studio experience."
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 w-full max-w-5xl px-2 md:px-4 z-20 pb-10">
        {/* Postcard Option */}
        <button
          onClick={() => onSelect('postcard')}
          className="group relative bg-slate-900/50 backdrop-blur-sm border border-amber-200/10 rounded-xl p-1 transition-all duration-500 hover:-translate-y-2 hover:border-amber-200/40 hover:shadow-[0_0_40px_rgba(251,191,36,0.1)] text-left flex flex-col h-full active:scale-95"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl"></div>
          
          {/* Inner Content */}
          <div className="bg-slate-950 border border-white/5 rounded-lg p-6 md:p-8 h-full flex flex-col items-center text-center">
            <div className="mb-4 md:mb-6 text-amber-200/80 group-hover:text-amber-100 transition-colors transform group-hover:scale-110 duration-500">
              <Camera size={32} strokeWidth={1} className="md:w-12 md:h-12" />
            </div>
            <h2 className="text-2xl md:text-3xl font-serif text-amber-100 mb-2 md:mb-3">{LAYOUT_CONFIG.postcard.name}</h2>
            <p className="text-slate-400 mb-6 md:mb-8 font-light leading-relaxed text-sm md:text-base">{LAYOUT_CONFIG.postcard.description}</p>
            
            {/* Visual Preview Abstract */}
            <div className="w-24 md:w-32 aspect-[2/3] border border-amber-200/20 p-2 flex flex-col gap-2 opacity-60 group-hover:opacity-100 transition-all">
               <div className="flex-1 bg-amber-200/10"></div>
               <div className="flex-1 bg-amber-200/10"></div>
               <div className="flex-1 bg-amber-200/10"></div>
            </div>
          </div>
        </button>

        {/* Strips Option */}
        <button
          onClick={() => onSelect('strips')}
          className="group relative bg-slate-900/50 backdrop-blur-sm border border-amber-200/10 rounded-xl p-1 transition-all duration-500 hover:-translate-y-2 hover:border-amber-200/40 hover:shadow-[0_0_40px_rgba(251,191,36,0.1)] text-left flex flex-col h-full active:scale-95"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl"></div>
          
           {/* Inner Content */}
           <div className="bg-slate-950 border border-white/5 rounded-lg p-6 md:p-8 h-full flex flex-col items-center text-center">
            <div className="mb-4 md:mb-6 text-amber-200/80 group-hover:text-amber-100 transition-colors transform group-hover:scale-110 duration-500">
              <Columns size={32} strokeWidth={1} className="md:w-12 md:h-12" />
            </div>
            <h2 className="text-2xl md:text-3xl font-serif text-amber-100 mb-2 md:mb-3">{LAYOUT_CONFIG.strips.name}</h2>
            <p className="text-slate-400 mb-6 md:mb-8 font-light leading-relaxed text-sm md:text-base">{LAYOUT_CONFIG.strips.description}</p>

             {/* Visual Preview Abstract */}
             <div className="w-24 md:w-32 aspect-[2/3] flex gap-2 justify-center opacity-60 group-hover:opacity-100 transition-all">
                <div className="w-1/2 border-x border-amber-200/20 h-full p-1 flex flex-col gap-1">
                  <div className="flex-1 bg-amber-200/10"></div>
                  <div className="flex-1 bg-amber-200/10"></div>
                  <div className="flex-1 bg-amber-200/10"></div>
                  <div className="flex-1 bg-amber-200/10"></div>
                </div>
                <div className="w-1/2 border-x border-amber-200/20 h-full p-1 flex flex-col gap-1">
                  <div className="flex-1 bg-amber-200/10"></div>
                  <div className="flex-1 bg-amber-200/10"></div>
                  <div className="flex-1 bg-amber-200/10"></div>
                  <div className="flex-1 bg-amber-200/10"></div>
                </div>
             </div>
          </div>
        </button>
      </div>

      {/* Admin Button */}
      <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 opacity-30 hover:opacity-100 transition-opacity z-50">
        <button onClick={onAdmin} className="text-slate-500 hover:text-amber-200 p-2">
            <Lock size={16} />
        </button>
      </div>
    </div>
  );
};

export default LayoutSelection;`,
  "components/PhoneInputModal.tsx": `import React, { useState, useEffect, useRef } from 'react';
import { Phone, X, Delete } from 'lucide-react';

interface Props {
  onSubmit: (phoneNumber: string) => void;
  onSkip: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const PhoneInputModal: React.FC<Props> = ({ onSubmit, onSkip, onCancel, isSubmitting }) => {
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
    }
    setTimeLeft(60);

    timeoutRef.current = setTimeout(() => {
      onSkip();
    }, 60000);

    const startTime = Date.now();
    const updateCountdown = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((60000 - elapsed) / 1000));
      setTimeLeft(remaining);

      if (remaining > 0) {
        countdownRef.current = setTimeout(updateCountdown, 1000);
      }
    };
    updateCountdown();
  };

  useEffect(() => {
    resetTimeout();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (countdownRef.current) {
        clearTimeout(countdownRef.current);
      }
    };
  }, []);

  const handleNumberClick = (digit: string) => {
    if (phoneNumber.length < 15) {
      setPhoneNumber(phoneNumber + digit);
    }
    resetTimeout();
  };

  const handleBackspace = () => {
    setPhoneNumber(phoneNumber.slice(0, -1));
    resetTimeout();
  };

  const handleSubmit = () => {
    if (phoneNumber.length >= 10) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (countdownRef.current) {
        clearTimeout(countdownRef.current);
      }
      onSubmit(phoneNumber);
    }
  };

  const handleSkip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
    }
    onSkip();
  };

  const handleCancel = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
    }
    onCancel();
  };

  const formatPhoneNumber = (number: string) => {
    if (number.length === 0) return '';
    const cleaned = number.replace(/\\D/g, '');
    const match = cleaned.match(/^(\\d{0,3})(\\d{0,3})(\\d{0,4})$/);
    if (match) {
      return [match[1], match[2], match[3]].filter(Boolean).join('-');
    }
    return number;
  };

  const numberPad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['0']
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-200/20 rounded-lg shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-200/10 rounded-full flex items-center justify-center">
              <Phone size={24} className="text-amber-200" />
            </div>
            <div>
              <h2 className="text-xl font-serif text-white">Receive Soft Copy</h2>
              <p className="text-sm text-slate-400">Enter your phone number</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <div className="bg-slate-950 border border-white/10 rounded-lg p-4 text-center min-h-[60px] flex items-center justify-center">
              <span className="text-2xl font-mono text-white tracking-wider">
                {phoneNumber ? formatPhoneNumber(phoneNumber) : 'Enter number'}
              </span>
            </div>
          </div>

          <div className="grid gap-3 mb-6">
            {numberPad.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-3 gap-3">
                {row.map((digit) => (
                  <button
                    key={digit}
                    onClick={() => handleNumberClick(digit)}
                    className="bg-slate-800 hover:bg-slate-700 text-white text-2xl font-semibold py-4 rounded-lg transition-colors active:scale-95"
                  >
                    {digit}
                  </button>
                ))}
                {row.length === 1 && (
                  <>
                    <div></div>
                    <div></div>
                  </>
                )}
              </div>
            ))}
            <div className="grid grid-cols-3 gap-3">
              <div></div>
              <button
                onClick={handleBackspace}
                className="bg-slate-800 hover:bg-red-900/50 text-white py-4 rounded-lg transition-colors active:scale-95 flex items-center justify-center"
              >
                <Delete size={24} />
              </button>
              <div></div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleSubmit}
              disabled={phoneNumber.length < 10 || isSubmitting}
              className="w-full bg-amber-200 text-slate-900 py-4 rounded font-serif font-bold tracking-wide hover:bg-white hover:shadow-[0_0_20px_rgba(253,230,138,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {isSubmitting ? 'Saving...' : 'Save & Send'}
            </button>
            <button
              onClick={handleSkip}
              disabled={isSubmitting}
              className="w-full bg-transparent border border-amber-200/30 text-amber-100 py-3 rounded font-serif hover:bg-amber-200/5 transition-colors disabled:opacity-50"
            >
              Skip (Save Only)
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-center text-slate-500 text-xs">
              We'll send a digital copy to this number
            </p>
            <p className="text-center text-slate-600 text-xs flex items-center justify-center gap-2">
              <span>Auto-closing in</span>
              <span className="text-amber-200 font-mono font-semibold">{timeLeft}s</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhoneInputModal;
`,
  "components/PhotoEditor.tsx": `import React, { useState, useRef, useEffect } from 'react';
import { LayoutType, Sticker } from '../types';
import { generateComposite } from '../utils/canvasUtils';
import { savePhotoToGallery } from '../utils/storage';
import { Save, Palette, Image as ImageIcon, Sliders, X, RotateCw } from 'lucide-react';
import { getCustomStickers, CustomSticker } from '../utils/stickerStorage';
import PhoneInputModal from './PhoneInputModal';

interface Props {
  photos: string[];
  layout: LayoutType;
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

const PhotoEditor: React.FC<Props> = ({ photos, layout, onRestart }) => {
  const [frameColor, setFrameColor] = useState<string>('#ffffff');
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'paper' | 'stickers'>('stickers');
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [previewScale, setPreviewScale] = useState<number>(56);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [activeStickerId, setActiveStickerId] = useState<string | null>(null);
  const [customStickers, setCustomStickers] = useState<CustomSticker[]>([]);
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState<string | null>(null);
  const [confirmationTimeLeft, setConfirmationTimeLeft] = useState<number>(15);

  const containerRef = useRef<HTMLDivElement>(null);
  const confirmationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const confirmationCountdownRef = useRef<NodeJS.Timeout | null>(null);
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
    return () => {
      clearConfirmationTimers();
    };
  }, []);

  const loadCustomStickers = async () => {
    const stickers = await getCustomStickers();
    setCustomStickers(stickers);
  };

  const addSticker = (imageUrl: string) => {
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
    setStickers(stickers.filter(s => s.id !== id));
    if (activeStickerId === id) setActiveStickerId(null);
  };

  const updateStickerScale = (newScale: number) => {
    if (!activeStickerId) return;
    setStickers(prev => prev.map(s => s.id === activeStickerId ? { ...s, scale: newScale } : s));
  };

  const handlePointerDown = (e: React.PointerEvent, id: string, mode: 'move' | 'transform') => {
    e.stopPropagation();
    e.preventDefault();
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

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const dataUrl = await generateComposite(layout, photos, stickers, frameColor);
      setPendingPhotoDataUrl(dataUrl);
      setShowPhoneInput(true);
    } catch (err) {
      console.error(err);
      alert("Something went wrong while creating your masterpiece.");
    } finally {
      setIsExporting(false);
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

  const handlePhoneSubmit = async (phoneNumber: string) => {
    if (!pendingPhotoDataUrl) return;

    setIsExporting(true);
    try {
      await savePhotoToGallery(pendingPhotoDataUrl, phoneNumber);
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
             height: \`\${previewScale}vh\`,
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
              {layout === 'postcard' && (
                <div className="w-full h-full flex flex-col gap-2 items-center justify-start py-6 px-2">
                  {photos.map((src, i) => (
                    <div key={i} className="bg-transparent shadow-md w-full flex-1 relative overflow-hidden">
                        <img src={src} alt={\`Capture \${i}\`} className="w-full h-full object-cover block pointer-events-none" />
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
                          <div key={\`\${stripIdx}-\${i}\`} className="w-full relative overflow-hidden pointer-events-none" style={{ aspectRatio: '4/3' }}>
                            <img src={src} className="absolute inset-0 w-full h-full object-cover" alt="strip" />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
           </div>

           {/* ================= Stickers Layer ================= */}
           {stickers.map(sticker => (
             <div
               key={sticker.id}
               style={{
                 position: 'absolute',
                 left: \`\${sticker.x}%\`,
                 top: \`\${sticker.y}%\`,
                 width: \`\${12.5 * sticker.scale}%\`,
                 height: 'auto',
                 transform: \`translate(-50%, -50%) rotate(\${sticker.rotation}deg)\`,
                 cursor: activeStickerId === sticker.id ? 'move' : 'grab',
                 touchAction: 'none'
               }}
               className={\`group transition-all duration-75 \${activeStickerId === sticker.id ? 'z-50' : 'z-40'}\`}
             >
                <div
                    onPointerDown={(e) => handlePointerDown(e, sticker.id, 'move')}
                    className={\`relative transition-all duration-200 rounded-lg \${
                        activeStickerId === sticker.id
                        ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-transparent shadow-[0_0_15px_rgba(251,191,36,0.3)] bg-white/5'
                        : 'hover:ring-1 hover:ring-white/30'
                    }\`}>
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

            {/* Preview Scale Slider */}
            <div className="mb-4 p-3 bg-slate-900/50 rounded-lg border border-white/10">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs uppercase tracking-widest text-amber-100 flex items-center gap-2">
                  <Sliders size={12} /> Preview Size
                </label>
                <span className="text-xs text-amber-200 font-mono">{previewScale}%</span>
              </div>
              <input
                type="range"
                min="40"
                max="98"
                step="1"
                value={previewScale}
                onChange={(e) => setPreviewScale(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
            </div>

            <div className="flex border-b border-white/10">
                <button 
                  onClick={() => setActiveTab('stickers')}
                  className={\`flex-1 py-3 text-center text-xs md:text-sm uppercase tracking-widest font-serif transition-all flex items-center justify-center gap-2 \${activeTab === 'stickers' ? 'text-amber-200 border-b-2 border-amber-200 bg-white/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}\`}
                >
                  <ImageIcon size={14} /> Embellish
                </button>
                <button 
                  onClick={() => setActiveTab('paper')}
                  className={\`flex-1 py-3 text-center text-xs md:text-sm uppercase tracking-widest font-serif transition-all flex items-center justify-center gap-2 \${activeTab === 'paper' ? 'text-amber-200 border-b-2 border-amber-200 bg-white/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}\`}
                >
                  <Palette size={14} /> Paper
                </button>
            </div>
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
                          onClick={() => setFrameColor(color.hex)}
                          className={\`w-16 h-16 rounded-full border border-white/10 transition-all transform hover:scale-110 active:scale-95 shadow-lg \${frameColor === color.hex ? 'ring-4 ring-amber-200 ring-offset-4 ring-offset-slate-950 scale-110' : ''}\`}
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
           <button
             onClick={handleExport}
             disabled={isExporting}
             className="w-full bg-amber-200 text-slate-900 py-3 rounded font-serif font-bold tracking-wide flex items-center justify-center gap-2 hover:bg-white hover:shadow-[0_0_20px_rgba(253,230,138,0.3)] transition-all disabled:opacity-50 text-sm active:scale-[0.98] mb-2"
           >
             {isExporting ? '...' : <><Save size={16} /> Save</>}
           </button>

           <button 
             onClick={onRestart}
             className="w-full text-slate-500 py-2 text-xs uppercase tracking-widest hover:text-red-400 transition-colors"
           >
             Start Over
           </button>
        </div>
      </div>

      {/* Phone Input Modal */}
      {showPhoneInput && (
        <PhoneInputModal
          onSubmit={handlePhoneSubmit}
          onSkip={handleSkipPhone}
          onCancel={handleCancelPhoneInput}
          isSubmitting={isExporting}
        />
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

export default PhotoEditor;`,
  "components/StickerUpload.tsx": `import React, { useState, useRef } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { uploadStickers, deleteCustomSticker, CustomSticker } from '../utils/stickerStorage';

interface Props {
  onStickersUpdated: () => void;
  customStickers: CustomSticker[];
  onAddSticker: (imageUrl: string) => void;
}

interface UploadStatus {
  file: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export const StickerUpload: React.FC<Props> = ({ onStickersUpdated, customStickers, onAddSticker }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('image/')
    );
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadStatuses(selectedFiles.map(file => ({
      file: file.name,
      status: 'uploading'
    })));

    const result = await uploadStickers(selectedFiles);

    const newStatuses: UploadStatus[] = [];
    selectedFiles.forEach(file => {
      const success = result.success.find(s => s.name === file.name);
      const error = result.errors.find(e => e.file === file.name);

      if (success) {
        newStatuses.push({ file: file.name, status: 'success' });
      } else if (error) {
        newStatuses.push({ file: file.name, status: 'error', error: error.error });
      }
    });

    setUploadStatuses(newStatuses);
    setIsUploading(false);

    if (result.success.length > 0) {
      onStickersUpdated();
      setTimeout(() => {
        setSelectedFiles([]);
        setUploadStatuses([]);
      }, 2000);
    }
  };

  const handleDeleteSticker = async (sticker: CustomSticker) => {
    const success = await deleteCustomSticker(sticker);
    if (success) {
      onStickersUpdated();
    }
  };

  return (
    <div className="space-y-4">
      {customStickers.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-widest text-amber-100 mb-3">My Stickers</h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {customStickers.map(sticker => (
              <div key={sticker.id} className="relative group">
                <button
                  onClick={() => onAddSticker(sticker.image_url)}
                  className="aspect-square bg-slate-900 rounded border border-white/5 hover:border-amber-200/40 hover:bg-slate-800 transition-all p-1 flex items-center justify-center w-full active:scale-95"
                >
                  <img
                    src={sticker.image_url}
                    alt={sticker.name}
                    className="w-full h-full object-contain opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all"
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSticker(sticker);
                  }}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  title="Delete sticker"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xs uppercase tracking-widest text-amber-100 mb-3">Upload Stickers</h3>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={\`border-2 border-dashed rounded-lg p-6 text-center transition-all \${
            isDragging
              ? 'border-amber-200 bg-amber-200/5'
              : 'border-white/10 hover:border-white/20'
          }\`}
        >
          <Upload className="mx-auto mb-2 text-slate-400" size={32} />
          <p className="text-sm text-slate-300 mb-2">
            Drag & drop images here
          </p>
          <p className="text-xs text-slate-500 mb-3">
            PNG, JPG, WEBP, SVG (max 2MB each)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-slate-800 text-slate-200 px-4 py-2 rounded text-sm hover:bg-slate-700 transition-colors"
          >
            Browse Files
          </button>
        </div>

        {selectedFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            {selectedFiles.map((file, index) => {
              const status = uploadStatuses.find(s => s.file === file.name);
              return (
                <div
                  key={index}
                  className="flex items-center justify-between bg-slate-900 rounded p-2 text-sm"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {status?.status === 'success' && (
                      <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
                    )}
                    {status?.status === 'error' && (
                      <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                    )}
                    {(!status || status.status === 'uploading') && (
                      <div className="w-4 h-4 border-2 border-amber-200 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    )}
                    <span className="text-slate-300 truncate" title={file.name}>
                      {file.name}
                    </span>
                  </div>
                  {!status && (
                    <button
                      onClick={() => removeFile(index)}
                      className="text-slate-400 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <X size={16} />
                    </button>
                  )}
                  {status?.status === 'error' && (
                    <span className="text-xs text-red-400 ml-2">{status.error}</span>
                  )}
                </div>
              );
            })}

            {!isUploading && uploadStatuses.length === 0 && (
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full bg-amber-200 text-slate-900 py-2 rounded font-serif font-bold hover:bg-white transition-all disabled:opacity-50"
              >
                Upload {selectedFiles.length} {selectedFiles.length === 1 ? 'Sticker' : 'Stickers'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
`,
  "index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Deep Blue Photobooth</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Quicksand:wght@300;400;500&display=swap" rel="stylesheet">
    <script>
      tailwind.config = {
        theme: {
          extend: {
            fontFamily: {
              serif: ['"Playfair Display"', 'serif'],
              sans: ['"Quicksand"', 'sans-serif'],
            },
            colors: {
              gold: {
                100: '#fef3c7',
                200: '#fde68a',
                300: '#fcd34d',
                400: '#fbbf24',
                500: '#f59e0b',
                600: '#d97706',
              },
              navy: {
                800: '#1e1b4b',
                900: '#0f172a',
                950: '#020617',
              }
            }
          }
        }
      }
    </script>
    <style>
      body {
        font-family: 'Quicksand', sans-serif;
        background-color: #020617; /* Slate 950 */
        overflow: hidden; /* App handles scrolling */
      }
      
      h1, h2, h3, .font-serif {
        font-family: 'Playfair Display', serif;
      }

      /* Custom Scrollbar */
      ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      ::-webkit-scrollbar-track {
        background: #0f172a; 
      }
      ::-webkit-scrollbar-thumb {
        background: #475569; 
        border-radius: 3px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #94a3b8; 
      }
      
      .classic-gradient {
        background: radial-gradient(circle at center, #1e293b 0%, #020617 100%);
      }
      
      .gold-shimmer {
        background: linear-gradient(45deg, rgba(253, 230, 138, 0.1) 25%, transparent 25%, transparent 50%, rgba(253, 230, 138, 0.1) 50%, rgba(253, 230, 138, 0.1) 75%, transparent 75%, transparent);
        background-size: 20px 20px;
      }

      /* Flash Animation */
      @keyframes flash {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
      .flash-overlay {
        animation: flash 0.5s ease-out forwards;
      }
    </style>
<script type="importmap">
{
  "imports": {
    "@vitejs/plugin-react": "https://esm.sh/@vitejs/plugin-react@^5.1.2",
    "vite": "https://esm.sh/vite@^7.3.1",
    "react/": "https://esm.sh/react@^19.2.3/",
    "react": "https://esm.sh/react@^19.2.3",
    "lucide-react": "https://esm.sh/lucide-react@^0.562.0",
    "react-dom/": "https://esm.sh/react-dom@^19.2.3/"
  }
}
</script>
</head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"></script>
  </body>
</html>`,
  "index.tsx": `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
  "metadata.json": `{
  "name": "Deep Blue Photobooth",
  "description": "A premium, underwater-themed photobooth experience with custom sticker editing and high-quality layouts.",
  "requestFramePermissions": [
    "camera"
  ]
}`,
  "netlify.toml": `[build]
command = "npx vite build"
publish = "dist"

[[redirects]]
from = "/*"
to = "/index.html"
status = 200`,
  "package.json": `{
  "name": "deep-blue-photobooth",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.90.1",
    "lucide-react": "^0.344.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^7.12.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.64",
    "@types/react-dom": "^18.2.21",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.2.2",
    "vite": "^5.1.6"
  }
}
`,
  "supabase/functions/download-project/index.ts": ``,
  "supabase/functions/send-whatsapp-image/index.ts": `import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Pin",
};

interface SendImageRequest {
  recipientNumber: string;
  imageUrl?: string;
  imageBase64?: string;
  caption?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const adminPinHeader = req.headers.get("X-Admin-Pin");
    if (adminPinHeader !== "1234") {
      return new Response(
        JSON.stringify({ error: "Invalid admin PIN" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const adminConfig = {
      api_key: "GcCqTlEjxghF7MHtaxCwBeN1NX3ud7",
      sender_number: "601116366799"
    };

    const body: SendImageRequest = await req.json();
    const { recipientNumber, imageUrl, imageBase64, caption = "" } = body;

    if (!recipientNumber) {
      return new Response(
        JSON.stringify({ error: "Recipient number is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let uploadedImageUrl = imageUrl;

    if (!uploadedImageUrl && imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\\/\\w+;base64,/, "");
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: "image/jpeg" });
      formData.append("file", blob, "image.jpg");

      const uploadResponse = await fetch("https://tmpfiles.org/api/v1/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image to tmpfiles.org");
      }

      const uploadResult = await uploadResponse.json();

      if (uploadResult.status === "success" && uploadResult.data?.url) {
        uploadedImageUrl = uploadResult.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
      } else {
        throw new Error("Invalid response from tmpfiles.org");
      }
    }

    if (uploadedImageUrl && uploadedImageUrl.startsWith('http')) {
      if (!uploadedImageUrl.includes('tmpfiles.org/dl/') && uploadedImageUrl.includes('tmpfiles.org/')) {
        uploadedImageUrl = uploadedImageUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      }
    }

    if (!uploadedImageUrl) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const whatsappPayload = {
      api_key: adminConfig.api_key,
      sender: adminConfig.sender_number,
      number: recipientNumber,
      media_type: "image",
      caption: caption,
      url: uploadedImageUrl,
    };

    const whatsappResponse = await fetch("https://ustazai.my/send-media", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(whatsappPayload),
    });

    const whatsappResult = await whatsappResponse.json();

    const logEntry = {
      admin_id: "00000000-0000-0000-0000-000000000000",
      recipient_number: recipientNumber,
      image_url: uploadedImageUrl,
      caption: caption,
      status: whatsappResponse.ok ? "success" : "failed",
      error_message: whatsappResponse.ok ? null : JSON.stringify(whatsappResult),
    };

    await supabase.from("whatsapp_sent_messages").insert(logEntry);

    if (!whatsappResponse.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to send WhatsApp message",
          details: whatsappResult
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Image sent successfully",
        imageUrl: uploadedImageUrl,
        result: whatsappResult
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
`,
  "supabase/migrations/20260118064946_create_photos_table.sql": `/*
  # Create photos table for admin dashboard

  1. New Tables
    - \`photos\`
      - \`id\` (uuid, primary key) - Unique identifier for each photo
      - \`image_data\` (text) - Base64 encoded image data URL
      - \`created_at\` (timestamptz) - Timestamp when photo was created
  
  2. Security
    - Enable RLS on \`photos\` table
    - Add policy to allow anyone to insert photos (public photobooth)
    - Add policy to allow anyone to read photos (for admin dashboard)
    - Add policy to allow anyone to delete photos (for admin cleanup)
    
  Note: This is a public photobooth installation, so we allow unrestricted access.
  In production, you may want to add authentication for the admin dashboard.
*/

CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_data text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert photos (public photobooth)
CREATE POLICY "Anyone can insert photos"
  ON photos
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow anyone to read photos (for admin dashboard)
CREATE POLICY "Anyone can read photos"
  ON photos
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anyone to delete photos (for admin cleanup)
CREATE POLICY "Anyone can delete photos"
  ON photos
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create index for faster queries sorted by creation date
CREATE INDEX IF NOT EXISTS photos_created_at_idx ON photos(created_at DESC);`,
  "supabase/migrations/20260119090038_create_custom_stickers_table.sql": `/*
  # Create custom stickers table and storage

  1. New Tables
    - \`custom_stickers\`
      - \`id\` (uuid, primary key) - Unique identifier for each sticker
      - \`name\` (text) - Name of the sticker file
      - \`image_url\` (text) - URL path to the sticker in storage
      - \`file_type\` (text) - MIME type of the sticker (image/png, image/webp, etc)
      - \`created_at\` (timestamp) - When the sticker was uploaded
      
  2. Security
    - Enable RLS on \`custom_stickers\` table
    - Add policy for anyone to read stickers (public access)
    - Add policy for anyone to insert stickers (allow uploads)
    - Add policy for anyone to delete stickers
    
  3. Storage
    - Create public storage bucket for stickers
*/

-- Create the custom_stickers table
CREATE TABLE IF NOT EXISTS custom_stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text NOT NULL,
  file_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE custom_stickers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can view custom stickers" ON custom_stickers;
  DROP POLICY IF EXISTS "Anyone can upload custom stickers" ON custom_stickers;
  DROP POLICY IF EXISTS "Anyone can delete custom stickers" ON custom_stickers;
END $$;

-- Allow anyone to view all custom stickers
CREATE POLICY "Anyone can view custom stickers"
  ON custom_stickers
  FOR SELECT
  USING (true);

-- Allow anyone to upload custom stickers
CREATE POLICY "Anyone can upload custom stickers"
  ON custom_stickers
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to delete custom stickers
CREATE POLICY "Anyone can delete custom stickers"
  ON custom_stickers
  FOR DELETE
  USING (true);

-- Create storage bucket for stickers (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('stickers', 'stickers', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the stickers bucket
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can view stickers" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can upload stickers" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can delete stickers" ON storage.objects;
END $$;

CREATE POLICY "Anyone can view stickers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'stickers');

CREATE POLICY "Anyone can upload stickers"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'stickers');

CREATE POLICY "Anyone can delete stickers"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'stickers');`,
  "supabase/migrations/20260120163533_add_video_support.sql": `/*
  # Add video support to photos table

  1. Changes
    - Add \`is_video\` column to \`photos\` table to distinguish between images and videos
    - The column defaults to false for backward compatibility with existing photos

  2. Details
    - \`is_video\` (boolean, default false) - Flag to indicate if the entry is a video or still image
    - All existing photos will be marked as images (false)
    - New video entries will set this to true when saved
*/

-- Add is_video column with default false
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos' AND column_name = 'is_video'
  ) THEN
    ALTER TABLE photos ADD COLUMN is_video boolean DEFAULT false NOT NULL;
  END IF;
END $$;
`,
  "supabase/migrations/20260120165640_add_slot_tracking.sql": `/*
  # Add slot tracking for multi-video sessions

  1. Changes
    - Add \`slot_index\` column to track which slot a video belongs to
    - Add \`session_id\` column to group multiple videos from the same capture session
    - The columns allow null for backward compatibility with existing single-video entries

  2. Details
    - \`slot_index\` (integer, nullable) - The index of the slot (0, 1, 2, etc.) for multi-video layouts
    - \`session_id\` (text, nullable) - UUID to group related photos/videos from same session
    - Existing photos will have null values for these columns
*/

-- Add slot_index column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos' AND column_name = 'slot_index'
  ) THEN
    ALTER TABLE photos ADD COLUMN slot_index integer;
  END IF;
END $$;

-- Add session_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE photos ADD COLUMN session_id text;
  END IF;
END $$;
`,
  "supabase/migrations/20260126040936_migrate_photos_to_storage.sql": `/*
  # Migrate photos to use Supabase Storage

  1. Schema Changes
    - Add \`storage_path\` column to \`photos\` table to store the file path in Supabase Storage
    - Make \`image_data\` column nullable for backward compatibility
    - The storage path will be in format: \`photos/{uuid}.jpg\`

  2. Storage Setup
    - Create a public storage bucket named \`photos\` for storing photo booth images
    - Enable public access for reading photos
    - Allow anyone to upload photos (public photobooth)
    - Allow anyone to delete photos (for admin cleanup)

  3. Migration Strategy
    - New photos will use storage_path instead of image_data
    - Existing photos with image_data will continue to work
    - Over time, old photos can be migrated to storage if needed
*/

-- Add storage_path column to photos table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE photos ADD COLUMN storage_path text;
  END IF;
END $$;

-- Make image_data nullable for new storage-based photos
ALTER TABLE photos 
ALTER COLUMN image_data DROP NOT NULL;

-- Create storage bucket for photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload photos to the bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Anyone can upload photos'
  ) THEN
    CREATE POLICY "Anyone can upload photos"
      ON storage.objects
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (bucket_id = 'photos');
  END IF;
END $$;

-- Allow anyone to read photos from the bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Anyone can read photos'
  ) THEN
    CREATE POLICY "Anyone can read photos"
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'photos');
  END IF;
END $$;

-- Allow anyone to delete photos from the bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Anyone can delete photos'
  ) THEN
    CREATE POLICY "Anyone can delete photos"
      ON storage.objects
      FOR DELETE
      TO anon, authenticated
      USING (bucket_id = 'photos');
  END IF;
END $$;

-- Create index on storage_path for faster lookups
CREATE INDEX IF NOT EXISTS photos_storage_path_idx ON photos(storage_path);`,
  "supabase/migrations/20260126042214_add_preview_path_to_photos.sql": `/*
  # Add preview path column for compressed previews

  1. Changes
    - Add \`preview_path\` column to photos table to store compressed preview images
    - This allows showing lightweight previews in the admin slider
    - Full-size images remain in storage_path for downloads
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos' AND column_name = 'preview_path'
  ) THEN
    ALTER TABLE photos ADD COLUMN preview_path text;
  END IF;
END $$;
`,
  "supabase/migrations/20260131102509_add_phone_number_to_photos.sql": `/*
  # Add phone number field to photos table

  1. Changes
    - Add \`phone_number\` column to \`photos\` table
      - \`phone_number\` (text, nullable) - Customer's phone number for sending soft copy
  
  2. Notes
    - Phone number is optional to support existing photos without phone numbers
    - No security changes needed as existing RLS policies cover this field
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE photos ADD COLUMN phone_number text;
  END IF;
END $$;`,
  "supabase/migrations/20260201073008_add_is_admin_flag.sql": `/*
  # Add is_admin flag to admin users

  ## Overview
  Adds an is_admin boolean flag to properly track admin permissions for WhatsApp sender access

  ## Changes
  1. Add is_admin column to admin_users table with default value of false
  2. Update existing records to set is_admin = true for all existing admins
  3. Add check constraint to ensure only admins can be marked as active

  ## Security
  This flag is used server-side to verify admin permissions before allowing WhatsApp API access
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_users' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE admin_users ADD COLUMN is_admin boolean DEFAULT false;
  END IF;
END $$;

UPDATE admin_users SET is_admin = true WHERE is_active = true;
`,
  "supabase/migrations/20260201075218_fix_whatsapp_foreign_keys.sql": `/*
  # Fix WhatsApp Tables Foreign Key Constraints

  1. Changes
    - Drop foreign key constraints from whatsapp_api_config and whatsapp_sent_messages
    - These tables use auth.uid() in RLS policies but had constraints referencing admin_users
    - Remove admin_users dependencies to allow direct auth.users integration

  2. Security
    - RLS policies remain in place and properly validate ownership using auth.uid()
    - No security impact as RLS is the primary security mechanism
*/

-- Drop foreign key constraints that reference admin_users
ALTER TABLE IF EXISTS whatsapp_api_config 
  DROP CONSTRAINT IF EXISTS whatsapp_api_config_admin_id_fkey;

ALTER TABLE IF EXISTS whatsapp_sent_messages 
  DROP CONSTRAINT IF EXISTS whatsapp_sent_messages_admin_id_fkey;
`,
  "supabase/migrations/20260201080311_allow_anonymous_whatsapp_access.sql": `/*
  # Allow Anonymous Access to WhatsApp Messages

  1. Changes
    - Drop existing RLS policies on whatsapp_sent_messages table
    - Create new policy allowing anonymous SELECT access
    - Create new policy allowing anonymous INSERT access
    
  2. Security
    - No authentication required since admin access is controlled by PIN
    - Data is still protected by application-level security
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own sent messages" ON whatsapp_sent_messages;
DROP POLICY IF EXISTS "Users can insert own sent messages" ON whatsapp_sent_messages;

-- Allow anonymous SELECT access
CREATE POLICY "Allow anonymous to view sent messages"
  ON whatsapp_sent_messages
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous INSERT access
CREATE POLICY "Allow anonymous to insert sent messages"
  ON whatsapp_sent_messages
  FOR INSERT
  TO anon
  WITH CHECK (true);
`,
  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["./**/*.ts", "./**/*.tsx"],
  "exclude": ["node_modules", "supabase/functions"]
}`,
  "types.ts": `export type LayoutType = 'postcard' | 'strips';

export interface Sticker {
  id: string;
  type: StickerType | string; // StickerType for built-in, string URL for custom
  x: number; // Percentage 0-100 relative to canvas width
  y: number; // Percentage 0-100 relative to canvas height
  scale: number;
  rotation: number;
  isCustom?: boolean; // Flag to indicate if this is a custom uploaded sticker
}

export type StickerType =
  | 'betta'
  | 'starfish'
  | 'shell'
  | 'bubble'
  | 'seaweed'
  | 'coral'
  | 'crab'
  | 'octopus'
  | 'bow'
  | 'sparkles'
  | 'heart'
  | 'jellyfish_cute'
  | 'star_cute'
  | 'clam_cute'
  | 'seahorse'
  | 'narwhal'
  | 'fish'
  | 'shark'
  | 'sailboat'
  | 'turtle'
  | 'dolphin'
  | 'whale'
  | 'pufferfish'
  | 'pearl'
  | 'anchor'
  | 'treasure_chest'
  | 'sea_otter'
  | 'penguin'
  | 'mermaid_tail';

export interface AppState {
  step: 'home' | 'capture' | 'editor' | 'admin';
  layout: LayoutType;
  photos: string[]; // Base64 data URLs
  stickers: Sticker[];
}

export const LAYOUT_CONFIG = {
  postcard: {
    photoCount: 3,
    width: 1200,
    height: 1800,
    aspectRatio: 16/9,
    name: 'The Portrait',
    description: 'A classic 4x6 vertical layout showcasing 3 cinematic portraits.'
  },
  strips: {
    photoCount: 4,
    width: 1200, // Two 2x6 strips side by side = 4x6
    height: 1800,
    aspectRatio: 4/3,
    name: 'Twin Strips',
    description: 'Capture 4 moments, printed as two identical photo strips.'
  }
};`,
  "utils/canvasUtils.ts": `import { LayoutType, Sticker, LAYOUT_CONFIG } from '../types';
import { SVG_STRINGS } from '../components/AssetLibrary';

const loadImg = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

const loadSvgString = (svgString: string): Promise<HTMLImageElement> => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    return loadImg(url);
};

export const generateComposite = async (
  layout: LayoutType,
  photos: string[],
  stickers: Sticker[],
  frameColor: string = '#ffffff'
): Promise<string> => {
  const config = LAYOUT_CONFIG[layout];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');

  canvas.width = config.width;
  canvas.height = config.height;

  // 1. Draw Background (User Selected Frame Color)
  ctx.fillStyle = frameColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Draw Photos
  if (layout === 'postcard') {
    // Minimalist Postcard Layout: Maximized Photo Size
    const topMargin = 40;
    const bottomMargin = 40; 
    const sideMargin = 20;   
    const spacing = 20;      

    // Calculate dimensions
    const availableHeight = canvas.height - topMargin - bottomMargin - (spacing * 2);
    const photoH = availableHeight / 3;
    
    // Check if width constraint is hit (16:9 aspect)
    let photoW = photoH * (16/9);
    
    // If photos are too wide for canvas, constrain by width
    const maxW = canvas.width - (sideMargin * 2);
    if (photoW > maxW) {
        photoW = maxW;
    }
    
    // Center horizontally
    const centerX = canvas.width / 2;
    const startY = topMargin;

    for (let i = 0; i < photos.length; i++) {
        if (!photos[i]) continue;
        const img = await loadImg(photos[i]);
        
        const yPos = startY + (i * (photoH + spacing));
        const xPos = centerX - (photoW / 2);

        // Simple aesthetic drop shadow for depth
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 25;
        ctx.shadowOffsetY = 10;
        
        // Draw Image directly (clean edge)
        ctx.drawImage(img, xPos, yPos, photoW, photoH);
        ctx.restore();
    }

  } else if (layout === 'strips') {
    // Printer-safe margins (0.25 inch = 75px at 300 DPI)
    const marginX = 75;
    const marginY = 75;

    // Small gap between the two strips
    const gapBetweenStrips = 20;

    const totalW = canvas.width - (marginX * 2);
    const totalH = canvas.height - (marginY * 2);

    const stripWidth = (totalW - gapBetweenStrips) / 2;
    const stripHeight = totalH;

    const strip1X = marginX;
    const strip2X = marginX + stripWidth + gapBetweenStrips;

    // Draw Strip Backgrounds
    ctx.fillStyle = frameColor;
    ctx.fillRect(strip1X, marginY, stripWidth, stripHeight);
    ctx.fillRect(strip2X, marginY, stripWidth, stripHeight);

    // Inner padding within each strip
    const paddingX = 25;
    const photoW = stripWidth - (paddingX * 2);

    // Classic 4:3 Aspect Ratio for photos
    const photoH = photoW * (3/4);

    // Calculate vertical spacing for 4 photos (limit to 4 photos max)
    const maxPhotos = 4;
    const photosToDraw = photos.slice(0, maxPhotos);
    const gapY = 25;
    const totalPhotoH = photoH * photosToDraw.length;
    const totalGapH = gapY * (photosToDraw.length - 1);
    const contentH = totalPhotoH + totalGapH;

    // Center the content block vertically in the strip
    const startY = (stripHeight - contentH) / 2;

    // Draw the same 4 photos on both strips (left and right)
    for (let i = 0; i < photosToDraw.length; i++) {
         if (!photosToDraw[i]) continue;
         const img = await loadImg(photosToDraw[i]);
         const yPos = startY + (i * (photoH + gapY));

         // Draw on left strip
         ctx.drawImage(img, strip1X + paddingX, yPos, photoW, photoH);

         // Draw on right strip
         ctx.drawImage(img, strip2X + paddingX, yPos, photoW, photoH);
    }
  }

  // 3. Draw Stickers
  for (const sticker of stickers) {
      let img: HTMLImageElement;

      if (sticker.isCustom) {
        img = await loadImg(sticker.type);
      } else {
        const svgStr = SVG_STRINGS[sticker.type];
        if (!svgStr) continue;
        img = await loadSvgString(svgStr);
      }

      // Base Size 150
      const sWidth = 150 * sticker.scale;
      const sHeight = 150 * sticker.scale;

      const xPos = (sticker.x / 100) * canvas.width;
      const yPos = (sticker.y / 100) * canvas.height;

      ctx.save();
      ctx.translate(xPos, yPos);
      ctx.rotate((sticker.rotation * Math.PI) / 180);
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 5;
      ctx.drawImage(img, -sWidth / 2, -sHeight / 2, sWidth, sHeight);
      ctx.restore();
  }

  return canvas.toDataURL('image/png');
};`,
  "utils/imageCompression.ts": `export const compressImage = async (
  dataUrl: string,
  maxWidth: number = 800,
  quality: number = 0.7
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
};
`,
  "utils/stickerStorage.ts": `import { supabase } from './supabase';

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
    return \`Invalid file type. Allowed types: PNG, WEBP, JPG, SVG\`;
  }

  if (file.size > MAX_FILE_SIZE) {
    return \`File too large. Maximum size: 2MB\`;
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
      const fileName = \`\${Date.now()}-\${Math.random().toString(36).substring(7)}.\${fileExt}\`;
      const filePath = \`\${fileName}\`;

      const { error: uploadError } = await supabase.storage
        .from('stickers')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        errors.push({ file: file.name, error: uploadError.message });
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from('stickers')
        .getPublicUrl(filePath);

      const { data: dbData, error: dbError } = await supabase
        .from('custom_stickers')
        .insert({
          name: file.name,
          image_url: publicUrlData.publicUrl,
          file_type: file.type
        })
        .select()
        .single();

      if (dbError) {
        await supabase.storage.from('stickers').remove([filePath]);
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
    const urlParts = sticker.image_url.split('/');
    const fileName = urlParts[urlParts.length - 1];

    const { error: storageError } = await supabase.storage
      .from('stickers')
      .remove([fileName]);

    if (storageError) {
      console.error('Error deleting sticker from storage:', storageError);
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
`,
  "utils/storage.ts": `import { supabase } from './supabase';
import { compressImage } from './imageCompression';

export interface SavedPhoto {
  id: string;
  timestamp: number;
  dataUrl: string;
  fullSizeUrl?: string;
  phoneNumber?: string;
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

export const savePhotoToGallery = async (dataUrl: string, phoneNumber?: string): Promise<void> => {
  try {
    const photoId = crypto.randomUUID();
    const fullFileName = \`\${photoId}-full.jpg\`;
    const previewFileName = \`\${photoId}-preview.jpg\`;
    const fullStoragePath = \`photos/\${fullFileName}\`;
    const previewStoragePath = \`photos/\${previewFileName}\`;

    const compressedPreview = await compressImage(dataUrl, 800, 0.7);

    const fullBlob = dataUrlToBlob(dataUrl);
    const previewBlob = dataUrlToBlob(compressedPreview);

    const [fullUpload, previewUpload] = await Promise.all([
      supabase.storage.from('photos').upload(fullFileName, fullBlob, {
        contentType: 'image/jpeg',
        upsert: false
      }),
      supabase.storage.from('photos').upload(previewFileName, previewBlob, {
        contentType: 'image/jpeg',
        upsert: false
      })
    ]);

    if (fullUpload.error) {
      console.error("Error uploading full photo:", fullUpload.error);
      throw fullUpload.error;
    }

    if (previewUpload.error) {
      console.error("Error uploading preview:", previewUpload.error);
      await supabase.storage.from('photos').remove([fullFileName]);
      throw previewUpload.error;
    }

    const { error: dbError } = await supabase
      .from('photos')
      .insert({
        id: photoId,
        storage_path: fullStoragePath,
        preview_path: previewStoragePath,
        phone_number: phoneNumber || null
      });

    if (dbError) {
      console.error("Error saving photo metadata to database:", dbError);
      await supabase.storage.from('photos').remove([fullFileName, previewFileName]);
      throw dbError;
    }

    console.log('Photo and preview saved to Supabase Storage');
  } catch (e) {
    console.error("Error saving photo:", e);
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

    const [countResult, photosResult] = await Promise.all([
      getTotalPhotoCount(),
      supabase
        .from('photos')
        .select('id, storage_path, preview_path, created_at, phone_number')
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1)
    ]);

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
        const previewFileName = photo.preview_path.replace('photos/', '');
        const fullFileName = photo.storage_path.replace('photos/', '');

        const previewUrlData = supabase.storage
          .from('photos')
          .getPublicUrl(previewFileName);

        const fullUrlData = supabase.storage
          .from('photos')
          .getPublicUrl(fullFileName);

        dataUrl = previewUrlData.data.publicUrl;
        fullSizeUrl = fullUrlData.data.publicUrl;
      } else if (photo.storage_path) {
        const fileName = photo.storage_path.replace('photos/', '');
        const { data: urlData } = supabase.storage
          .from('photos')
          .getPublicUrl(fileName);
        dataUrl = urlData.publicUrl;
        fullSizeUrl = urlData.publicUrl;
      } else if (legacyPhotosData[photo.id]) {
        dataUrl = legacyPhotosData[photo.id];
        fullSizeUrl = legacyPhotosData[photo.id];
      }

      return {
        id: photo.id,
        timestamp: new Date(photo.created_at).getTime(),
        dataUrl,
        fullSizeUrl,
        phoneNumber: photo.phone_number || undefined
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
      const filesToDelete = [];
      if (photo.storage_path) {
        filesToDelete.push(photo.storage_path.replace('photos/', ''));
      }
      if (photo.preview_path) {
        filesToDelete.push(photo.preview_path.replace('photos/', ''));
      }

      if (filesToDelete.length > 0) {
        await supabase.storage.from('photos').remove(filesToDelete);
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
        if (p.storage_path) filesToDelete.push(p.storage_path.replace('photos/', ''));
        if (p.preview_path) filesToDelete.push(p.preview_path.replace('photos/', ''));
      });

      if (filesToDelete.length > 0) {
        await supabase.storage
          .from('photos')
          .remove(filesToDelete);
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
};`,
  "utils/supabase.ts": `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mngxpbwscmgmgzfctcwl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ3hwYndzY21nbWd6ZmN0Y3dsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MTU3MDEsImV4cCI6MjA4NDI5MTcwMX0.DoA-B3SsnxGBhlMtY5owJBU7-ZHXHmyFClgb7N4SvIc';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});
`,
  "vite-env.d.ts": `/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
`,
  "vite.config.ts": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  }
})`,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const entries: ZipEntry[] = [];

    for (const [name, content] of Object.entries(PROJECT_FILES)) {
      const data = new TextEncoder().encode(content);
      const crc = crc32(data);
      entries.push({ name, data, crc, offset: 0 });
    }

    const zip = createZip(entries);

    return new Response(zip, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="deep-blue-photobooth.zip"',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
