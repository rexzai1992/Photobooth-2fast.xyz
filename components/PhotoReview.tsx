import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Shuffle, ArrowRight, Camera } from 'lucide-react';

interface Props {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  onContinue: () => void;
  onRetake: () => void;
}

const PhotoReview: React.FC<Props> = ({
  photos,
  onPhotosChange,
  onContinue,
  onRetake
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchPhotoIndexRef = useRef<number | null>(null);

  const SWIPE_MIN_DISTANCE = 48;
  const SWIPE_MAX_VERTICAL_DRIFT = 72;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    setIsTouchDevice(coarsePointer || 'ontouchstart' in window);
  }, []);

  const reorderPhotos = useCallback((fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= photos.length ||
      toIndex >= photos.length
    ) {
      return;
    }

    const nextPhotos = [...photos];
    const [movedPhoto] = nextPhotos.splice(fromIndex, 1);
    nextPhotos.splice(toIndex, 0, movedPhoto);
    onPhotosChange(nextPhotos);
  }, [onPhotosChange, photos]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    reorderPhotos(draggedIndex, dropIndex);
    setDraggedIndex(null);
  };

  const handlePhotoTouchStart = (e: React.TouchEvent, index: number) => {
    const touch = e.changedTouches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchPhotoIndexRef.current = index;
  };

  const handlePhotoTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    const sourceIndex = touchPhotoIndexRef.current;
    const touch = e.changedTouches[0];

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchPhotoIndexRef.current = null;

    if (startX === null || startY === null || sourceIndex === null) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (Math.abs(deltaY) > SWIPE_MAX_VERTICAL_DRIFT) return;
    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE) return;

    if (deltaX < 0) {
      reorderPhotos(sourceIndex, sourceIndex - 1);
    } else {
      reorderPhotos(sourceIndex, sourceIndex + 1);
    }
  };

  const handleRetakePhoto = () => {
    // For now, we'll retake all photos. In a more advanced implementation,
    // you could retake individual photos, but that would require more complex state management
    onRetake();
  };

  const shufflePhotos = () => {
    const shuffled = [...photos].sort(() => Math.random() - 0.5);
    onPhotosChange(shuffled);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] text-slate-200 p-4 md:p-6 relative z-10 classic-gradient overflow-y-auto">
      {/* Decorative Border Frame */}
      <div className="absolute inset-2 md:inset-4 border border-amber-200/20 pointer-events-none rounded-2xl md:rounded-3xl" />
      <div className="absolute inset-4 md:inset-6 border border-amber-200/10 pointer-events-none rounded-xl md:rounded-2xl" />

      <div className="text-center mb-8 md:mb-12 animate-fade-in-up z-20">
        <h1 className="text-3xl md:text-5xl font-serif font-medium mb-4 text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-400 drop-shadow-sm">
          Review Your Photos
        </h1>
        <p className="text-slate-400 font-light text-sm md:text-base max-w-md mx-auto">
          Swipe left or right on mobile, or drag on desktop to rearrange.
        </p>
      </div>

      {/* Photo Grid */}
      <div className={`grid gap-4 md:gap-6 w-full max-w-4xl px-4 mb-8 z-20 ${
        photos.length === 3 
          ? 'grid-cols-1 md:grid-cols-3' 
          : 'grid-cols-2 md:grid-cols-4'
      }`}>
        {photos.map((photo, index) => (
          <div
            key={index}
            draggable={!isTouchDevice}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            onTouchStart={(e) => handlePhotoTouchStart(e, index)}
            onTouchEnd={handlePhotoTouchEnd}
            className="relative group cursor-move"
          >
            <div className="aspect-[3/4] bg-slate-800 rounded-lg overflow-hidden border-2 border-amber-200/20 group-hover:border-amber-200/50 transition-colors">
              <img
                src={photo}
                alt={`Photo ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <button
                  onClick={handleRetakePhoto}
                  className="bg-amber-200 text-slate-900 px-3 py-1 rounded text-sm font-medium hover:bg-amber-300 transition-colors flex items-center gap-1"
                >
                  <RotateCcw size={14} />
                  Retake
                </button>
              </div>
            </div>
            <div className="text-center mt-2 text-amber-200/60 text-sm">
              Photo {index + 1}
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-4xl px-4 z-20">
        <button
          onClick={shufflePhotos}
          className="flex-1 bg-slate-800/50 backdrop-blur-sm border border-amber-200/20 text-amber-200 py-3 rounded font-serif font-bold tracking-wide flex items-center justify-center gap-2 hover:bg-slate-700/50 hover:border-amber-200/40 transition-all active:scale-[0.98]"
        >
          <Shuffle size={16} />
          Shuffle
        </button>

        <button
          onClick={onRetake}
          className="flex-1 bg-slate-800/50 backdrop-blur-sm border border-amber-200/20 text-slate-400 py-3 rounded font-serif font-bold tracking-wide flex items-center justify-center gap-2 hover:bg-slate-700/50 hover:border-amber-200/40 hover:text-amber-200 transition-all active:scale-[0.98]"
        >
          <Camera size={16} />
          Retake All
        </button>

        <button
          onClick={onContinue}
          className="flex-1 bg-amber-200 text-slate-900 py-3 rounded font-serif font-bold tracking-wide flex items-center justify-center gap-2 hover:bg-white hover:shadow-[0_0_20px_rgba(253,230,138,0.3)] transition-all active:scale-[0.98]"
        >
          Continue
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default PhotoReview;
