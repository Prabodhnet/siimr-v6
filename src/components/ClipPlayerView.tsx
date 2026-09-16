import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  MoreHorizontal,
  Star,
  Share2,
  MessageCircle,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Send,
  Mic,
  MicOff,
  X,
  Heart,
  Sparkles,
  Check,
} from 'lucide-react';
import { ClipItem, Dream, AuthUser, DreamComment } from '../types';

interface ClipPlayerViewProps {
  clip: ClipItem;
  dream?: Dream;
  currentUser?: AuthUser;
  onAddComment?: (dreamId: string, text: string) => void;
  onBack: () => void;
  onOpenDreamCircle: (dreamId: string) => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onNextClip?: () => void;
  onPrevClip?: () => void;
}

const QUICK_REFLECTION_CHIPS = [
  '🌌 Felt surreal',
  '💭 Had a dream like this',
  '🔮 Deep symbol',
  '✨ Vivid atmosphere',
  '🌙 Lucid sensation',
  '🕊️ Peaceful vibe',
];

export const ClipPlayerView: React.FC<ClipPlayerViewProps> = ({
  clip,
  dream,
  currentUser,
  onAddComment,
  onBack,
  onOpenDreamCircle,
  onToggleLike,
  onToggleSave,
  onNextClip,
  onPrevClip,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(42); // 42%

  // Comments & Reflections State
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [localComments, setLocalComments] = useState<DreamComment[]>(dream?.comments || []);
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [commentLikes, setCommentLikes] = useState<Record<string, number>>({});
  const [isListening, setIsListening] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [showCopiedToast, setShowCopiedToast] = useState(false);

  const recognitionRef = useRef<any>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync comments whenever the selected clip / dream changes
  useEffect(() => {
    if (dream?.comments) {
      setLocalComments(dream.comments);
    } else {
      setLocalComments([]);
    }
  }, [dream?.id, dream?.comments]);

  // Clean up speech recognition when unmounting or switching clip
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [clip.id]);

  // Toggle voice dictation
  const handleToggleListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechStatus('Voice dictation is not supported in this browser.');
      setTimeout(() => setSpeechStatus(null), 3000);
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      setSpeechStatus(null);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechStatus('Listening... speak your reflection now');
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          interimTranscript += event.results[i][0].transcript;
        }
        if (interimTranscript) {
          setCommentText((prev) => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${interimTranscript}` : interimTranscript;
          });
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error in clip comment:', e);
        setIsListening(false);
        setSpeechStatus('Could not capture audio. Please try typing.');
        setTimeout(() => setSpeechStatus(null), 3000);
      };

      recognition.onend = () => {
        setIsListening(false);
        setSpeechStatus(null);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      setIsListening(false);
      setSpeechStatus('Voice input unavailable. Please type your reflection.');
      setTimeout(() => setSpeechStatus(null), 3000);
    }
  };

  // Submit reflection / comment
  const handleSubmitComment = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed) return;

    const newCommentObj: DreamComment = {
      id: `comm-clip-${Date.now()}`,
      authorName: currentUser?.name || 'You',
      authorAvatar: currentUser?.avatar,
      authorColor: currentUser?.color || '#5438FF',
      text: trimmed,
      timestamp: 'Just now',
    };

    // Prepend to local list so newest reflection shows immediately
    setLocalComments((prev) => [newCommentObj, ...prev]);
    setCommentText('');
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 2500);

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      setSpeechStatus(null);
    }

    if (onAddComment) {
      onAddComment(clip.dreamId, trimmed);
    }

    // Scroll to top of reflections
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Toggle like on an individual comment
  const handleToggleCommentLike = (commentId: string) => {
    setLikedCommentIds((prev) => {
      const next = new Set(prev);
      const currentlyLiked = next.has(commentId);
      if (currentlyLiked) {
        next.delete(commentId);
        setCommentLikes((cl) => ({ ...cl, [commentId]: Math.max(0, (cl[commentId] || 1) - 1) }));
      } else {
        next.add(commentId);
        setCommentLikes((cl) => ({ ...cl, [commentId]: (cl[commentId] || 0) + 1 }));
      }
      return next;
    });
  };

  // Quick prompt chip click
  const handleChipClick = (chipText: string) => {
    setCommentText((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${chipText}` : chipText;
    });
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const isVideo =
    clip.videoOrImageUrl.endsWith('.mp4') ||
    clip.videoOrImageUrl.includes('video') ||
    clip.videoOrImageUrl.startsWith('data:video');

  const displayCommentsCount = Math.max(
    localComments.length,
    typeof clip.commentsCount === 'number' ? clip.commentsCount : parseInt(String(clip.commentsCount || 0), 10) || 0
  );

  return (
    <div className="w-full min-h-screen px-4 pt-3 pb-24 flex flex-col justify-between bg-[#F9F6F0] text-[#1A1C23] relative overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between pt-1 pb-2">
        <button
          onClick={onBack}
          aria-label="Go back"
          className="w-10 h-10 rounded-full bg-[#ECEAF6]/80 flex items-center justify-center text-[#1A1C23] active:scale-95 transition-transform shadow-xs cursor-pointer hover:bg-[#E0DCF0]"
        >
          <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
        </button>
        <span className="text-xs font-extrabold uppercase tracking-widest text-[#5438FF]">
          Dream Clip
        </span>
        <div className="w-10" />
      </header>

      {/* Creator Profile Card */}
      <section className="mt-1 mb-3 bg-[#ECE7DF] rounded-[24px] px-3.5 py-2.5 flex items-center justify-between border border-[#1A1C23]/10 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="relative w-11 h-11">
            <img
              alt={clip?.creator?.name || 'Creator'}
              className="w-11 h-11 rounded-full object-cover shadow-inner"
              src={clip?.creator?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
            />
            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#EDECF9] rounded-full flex items-center justify-center p-[2px]">
              <div className="w-full h-full rounded-full border border-gray-900 bg-white flex items-center justify-center text-[#1A1C23] font-bold text-xs leading-none">
                +
              </div>
            </span>
          </div>
          <div className="flex flex-col">
            <h2 className="text-[16px] font-bold text-[#1A1C23] tracking-tight leading-tight">
              {clip?.creator?.name || 'Dreamer'}
            </h2>
            <span className="text-[12px] text-[#1A1C23]/60 font-medium">
              {clip?.creator?.timeAgo || 'Recently'}
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: clip.title, text: clip.hook, url: window.location.href });
            } else {
              navigator.clipboard?.writeText(window.location.href);
              setShowCopiedToast(true);
              setTimeout(() => setShowCopiedToast(false), 2000);
            }
          }}
          aria-label="More options"
          className="p-2 text-[#1A1C23]/70 hover:text-black cursor-pointer active:scale-95 transition"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </section>

      {/* Visual Stage (Video / Dream Artwork Card) */}
      <section className="relative w-full aspect-[4/5] rounded-[32px] overflow-hidden shadow-lg select-none bg-black">
        {isVideo ? (
          <video
            src={clip.videoOrImageUrl}
            autoPlay
            loop
            muted
            playsInline
            className={`absolute inset-0 w-full h-full object-cover object-center transition-transform duration-1000 ${
              isPlaying ? 'scale-105' : 'scale-100'
            }`}
          />
        ) : (
          <img
            alt={clip.title}
            className={`absolute inset-0 w-full h-full object-cover object-center transition-transform duration-1000 ${
              isPlaying ? 'scale-105' : 'scale-100'
            }`}
            src={clip.videoOrImageUrl}
          />
        )}
        {/* Dark Vignette Overlay for Bottom Controls */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent via-50% to-[#15254A]/90 pointer-events-none" />

        {/* Tape Sticker Quote (Top Right) */}
        <div className="absolute top-5 right-5 max-w-[210px] flex flex-col items-end pointer-events-none">
          <div
            className="w-12 h-3.5 rounded-sm mb-1.5 rotate-[-4deg] shadow-xs"
            style={{ backgroundColor: 'rgba(84, 56, 255, 0.85)' }}
          />
          <p className="font-editorial italic text-[16px] text-white/95 leading-snug text-right drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] tracking-wide pr-1">
            {clip.quote}
          </p>
        </div>

        {/* Video Card Bottom Info & Player Controls */}
        <div className="absolute bottom-0 inset-x-0 p-4 pt-0 flex flex-col gap-2.5">
          {/* Hashtag Chips */}
          <div className="flex items-center space-x-2">
            {clip.tags.map((t) => (
              <span
                key={t}
                className="px-3 py-0.5 bg-[rgba(29,44,88,0.65)] backdrop-blur-md border border-white/10 rounded-full text-white/95 text-[11px] font-medium tracking-wide"
              >
                {t}
              </span>
            ))}
          </div>

          {/* Scrubber & Timers */}
          <div className="flex items-center justify-between text-white text-[12px] font-medium tracking-wider pt-1">
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                setProgress(Math.round(pos * 100));
              }}
              className="relative flex-1 mr-3.5 flex items-center h-4 cursor-pointer"
            >
              <div className="w-full h-[3px] bg-white/35 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div
                className="absolute -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-md"
                style={{ left: `${progress}%` }}
              />
            </div>

            <div className="flex items-center space-x-2 text-white/90 font-mono text-[11px]">
              <span>{clip.currentTime}</span>
              <span className="opacity-60">/</span>
              <span>{clip.totalTime}</span>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="ml-1 text-white hover:text-white/80 active:scale-95 cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Story Meta & Action Group */}
      <section className="mt-3.5 flex items-stretch gap-2.5">
        <article className="flex-1 bg-[#ECE7DF] rounded-[24px] p-3.5 flex flex-col justify-between shadow-xs border border-[#1A1C23]/10">
          <div>
            <h1 className="text-[17px] font-extrabold tracking-tight text-[#1A1C23] leading-tight">
              {clip.title}
            </h1>
            <p className="mt-1 font-editorial italic text-[13.5px] text-[#1A1C23]/80 leading-snug line-clamp-2">
              {clip.hook}
            </p>
          </div>
          <div className="w-full h-[1px] bg-[#1A1C23]/10 my-2" />
          <div className="flex items-center space-x-4 text-[#1A1C23]/70 text-[11.5px] font-semibold tracking-wide">
            <button
              onClick={onToggleLike}
              className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
              title="Like clip"
            >
              <span className={clip.isLiked ? 'text-amber-500 font-bold' : ''}>★</span> {clip.likes}
            </button>
            <button
              onClick={() => setIsCommentsOpen(true)}
              className="flex items-center gap-1 hover:text-[#5438FF] transition-colors cursor-pointer"
              title="Open comments & reflections"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#5438FF]" />
              <span className="font-bold text-[#1A1C23]">{displayCommentsCount}</span>
            </button>
            <span className="flex items-center gap-1">⊙ {clip.viewsCount}</span>
          </div>
        </article>

        <div className="flex flex-col justify-between gap-2 w-[60px]">
          <button
            onClick={onToggleSave}
            aria-label="Favorite dream"
            className="h-1/2 w-full rounded-[20px] bg-[#ECE7DF] border border-[#1A1C23]/10 flex items-center justify-center active:scale-95 transition shadow-xs text-[#1A1C23] cursor-pointer hover:bg-[#E2DDD5]"
          >
            <Star className={`w-5 h-5 ${clip.isSaved ? 'fill-amber-400 text-amber-500' : ''}`} />
          </button>
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: clip.title, text: clip.hook, url: window.location.href });
              } else {
                navigator.clipboard?.writeText(window.location.href);
                setShowCopiedToast(true);
                setTimeout(() => setShowCopiedToast(false), 2000);
              }
            }}
            aria-label="Share dream"
            className="h-1/2 w-full rounded-[20px] bg-[#ECE7DF] border border-[#1A1C23]/10 flex items-center justify-center active:scale-95 transition shadow-xs text-[#1A1C23] cursor-pointer hover:bg-[#E2DDD5]"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Bottom Audio / Dream Circle & Comment Bar */}
      <footer className="mt-3.5 bg-[#E6E1D7] rounded-full px-3 py-2 flex items-center justify-between shadow-inner border border-[#1A1C23]/10">
        {/* 1. Dream Circle circular trigger */}
        <button
          onClick={() => onOpenDreamCircle(clip.dreamId)}
          aria-label="Open Dream Circle"
          className="w-11 h-11 rounded-2xl bg-[#5438FF] text-white flex items-center justify-center shadow-md active:scale-95 transition hover:brightness-110 relative group shrink-0 cursor-pointer"
          title="Dream Circle discussion"
        >
          <div className="w-6 h-6 rounded-full border border-white/40 flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping group-hover:scale-125" />
          </div>
          <span className="sr-only">Dream Circle</span>
        </button>

        {/* 2. COMMENT & REFLECTION BUTTON (Close right to Dream Circle) */}
        <button
          onClick={() => setIsCommentsOpen((prev) => !prev)}
          aria-label={`Open reflections and comments (${displayCommentsCount})`}
          className={`w-11 h-11 rounded-full flex items-center justify-center shadow-xs active:scale-95 transition relative shrink-0 cursor-pointer ${
            isCommentsOpen
              ? 'bg-[#5438FF] text-white ring-2 ring-[#5438FF]/40 shadow-sm'
              : 'bg-white text-[#1A1C23] hover:bg-[#F2EFE9]'
          }`}
          title="Reflections & Comments"
        >
          <MessageCircle className={`w-5 h-5 ${isCommentsOpen ? 'fill-white stroke-white' : 'stroke-[2.2]'}`} />
          {displayCommentsCount > 0 && (
            <span
              className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-extrabold flex items-center justify-center shadow-xs transition-transform ${
                isCommentsOpen
                  ? 'bg-amber-400 text-[#1A1C23] scale-105'
                  : 'bg-[#5438FF] text-white'
              }`}
            >
              {displayCommentsCount > 99 ? '99+' : displayCommentsCount}
            </span>
          )}
        </button>

        {/* 3. Dotted Waveform Play / Pause Button */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          aria-label={isPlaying ? 'Pause clip audio' : 'Play clip audio'}
          className="relative px-2 py-1 flex items-center justify-center group active:scale-95 transition cursor-pointer"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-18 h-8 text-[#1A1C23]" fill="currentColor" viewBox="0 0 80 40">
              <circle cx="10" cy="20" r="1.5" />
              <circle cx="16" cy="14" r="1.5" />
              <circle cx="16" cy="20" r="1.5" />
              <circle cx="16" cy="26" r="1.5" />
              <circle cx="22" cy="10" r="1.5" />
              <circle cx="22" cy="16" r="1.5" />
              <circle cx="22" cy="20" r="1.5" />
              <circle cx="22" cy="24" r="1.5" />
              <circle cx="28" cy="8" r="1.5" />
              <circle cx="28" cy="14" r="1.5" />
              <circle cx="28" cy="26" r="1.5" />
              <rect x="36" y="12" width="3.5" height="16" rx="1.5" />
              <rect x="44" y="12" width="3.5" height="16" rx="1.5" />
              <circle cx="52" cy="8" r="1.5" />
              <circle cx="52" cy="14" r="1.5" />
              <circle cx="52" cy="26" r="1.5" />
              <circle cx="58" cy="10" r="1.5" />
              <circle cx="58" cy="16" r="1.5" />
              <circle cx="58" cy="20" r="1.5" />
              <circle cx="64" cy="14" r="1.5" />
              <circle cx="64" cy="20" r="1.5" />
              <circle cx="70" cy="20" r="1.5" />
            </svg>
          ) : (
            <svg className="w-18 h-8 text-[#1A1C23]" fill="currentColor" viewBox="0 0 80 40">
              <circle cx="10" cy="20" r="1.5" />
              <circle cx="16" cy="14" r="1.5" />
              <circle cx="16" cy="20" r="1.5" />
              <circle cx="16" cy="26" r="1.5" />
              <circle cx="22" cy="10" r="1.5" />
              <circle cx="22" cy="16" r="1.5" />
              <circle cx="22" cy="20" r="1.5" />
              <circle cx="22" cy="24" r="1.5" />
              <circle cx="28" cy="8" r="1.5" />
              <circle cx="28" cy="14" r="1.5" />
              <circle cx="28" cy="26" r="1.5" />
              <polygon points="37,13 47,20 37,27" />
              <circle cx="52" cy="8" r="1.5" />
              <circle cx="52" cy="14" r="1.5" />
              <circle cx="52" cy="26" r="1.5" />
              <circle cx="58" cy="10" r="1.5" />
              <circle cx="58" cy="16" r="1.5" />
              <circle cx="58" cy="20" r="1.5" />
              <circle cx="64" cy="14" r="1.5" />
              <circle cx="64" cy="20" r="1.5" />
              <circle cx="70" cy="20" r="1.5" />
            </svg>
          )}
        </button>

        {/* 4. Skip Previous Track */}
        <button
          onClick={onPrevClip}
          aria-label="Previous track"
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#1A1C23] shadow-xs active:scale-95 transition cursor-pointer hover:bg-[#F2EFE9]"
          title="Previous clip"
        >
          <SkipBack className="w-4 h-4 fill-current" />
        </button>

        {/* 5. Skip Next Track */}
        <button
          onClick={onNextClip}
          aria-label="Next track"
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#1A1C23] shadow-xs active:scale-95 transition cursor-pointer hover:bg-[#F2EFE9]"
          title="Next clip"
        >
          <SkipForward className="w-4 h-4 fill-current" />
        </button>
      </footer>

      {/* Floating Link Copied Notification */}
      {showCopiedToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1A1C23] text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-bounce flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>Clip link copied to clipboard!</span>
        </div>
      )}

      {/* FUNCTIONAL COMMENTS & REFLECTIONS DRAWER */}
      <AnimatePresence>
        {isCommentsOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCommentsOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 cursor-pointer"
            />

            {/* Sliding Drawer Card */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 max-w-lg mx-auto bg-[#FDFCF7] rounded-t-[32px] border-t border-[#1A1C23]/12 shadow-[0_-12px_45px_rgba(0,0,0,0.22)] z-50 flex flex-col max-h-[82vh] overflow-hidden"
            >
              {/* Drawer Pull Handle */}
              <div className="pt-2.5 pb-1 flex justify-center">
                <div className="w-12 h-1.5 rounded-full bg-[#1A1C23]/20" />
              </div>

              {/* Drawer Header */}
              <div className="px-5 py-3 border-b border-[#1A1C23]/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#5438FF]/10 flex items-center justify-center text-[#5438FF]">
                    <MessageCircle className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-extrabold uppercase tracking-tight text-[#1A1C23] leading-none">
                      Reflections & Comments
                    </h3>
                    <span className="text-[11px] text-[#1A1C23]/60 font-medium">
                      {displayCommentsCount} {displayCommentsCount === 1 ? 'reflection' : 'reflections'} on &ldquo;{clip.title}&rdquo;
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsCommentsOpen(false)}
                  aria-label="Close reflections"
                  className="w-8 h-8 rounded-full bg-[#ECE7DF] hover:bg-[#E2DDD5] flex items-center justify-center text-[#1A1C23]/70 hover:text-[#1A1C23] transition-colors cursor-pointer active:scale-95"
                >
                  <X className="w-4 h-4 stroke-[2.2]" />
                </button>
              </div>

              {/* Toast Feedback */}
              {justSubmitted && (
                <div className="mx-4 mt-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] font-bold flex items-center gap-1.5 shadow-xs">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Your reflection was published to this dream clip!</span>
                </div>
              )}

              {/* Speech Listening Banner */}
              {speechStatus && (
                <div className="mx-4 mt-2 px-3 py-2 bg-[#5438FF]/10 border border-[#5438FF]/30 rounded-xl text-[#5438FF] text-[11px] font-bold flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                    <span>{speechStatus}</span>
                  </div>
                  <button
                    onClick={handleToggleListening}
                    className="text-[10px] uppercase font-extrabold px-2 py-0.5 bg-[#5438FF] text-white rounded-md cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Scrollable Reflections List */}
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 min-h-[160px] max-h-[380px]">
                {localComments.length === 0 ? (
                  <div className="py-10 text-center flex flex-col items-center justify-center text-[#1A1C23]/60">
                    <div className="w-12 h-12 rounded-full bg-[#ECE7DF] flex items-center justify-center mb-2 text-[#5438FF]">
                      <MessageCircle className="w-6 h-6 stroke-[1.8]" />
                    </div>
                    <p className="font-editorial italic text-[15px] font-bold text-[#1A1C23]">
                      No reflections yet
                    </p>
                    <p className="text-[12px] max-w-[240px] text-[#1A1C23]/60 mt-1">
                      Be the first to speak or write what you felt witnessing this dream.
                    </p>
                  </div>
                ) : (
                  localComments.map((c) => {
                    const isLiked = likedCommentIds.has(c.id);
                    const likesCount = commentLikes[c.id] || 0;
                    const isCreator = c.authorName === clip.creator.name;

                    return (
                      <div
                        key={c.id}
                        className="bg-white rounded-2xl p-3 border border-[#1A1C23]/8 shadow-xs flex items-start space-x-3 transition-all hover:border-[#1A1C23]/20"
                      >
                        {/* Author Avatar / Initial */}
                        <div
                          className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-[13px] overflow-hidden shadow-xs"
                          style={{ backgroundColor: c.authorColor || '#5438FF' }}
                        >
                          {c.authorAvatar ? (
                            <img src={c.authorAvatar} alt={c.authorName} className="w-full h-full object-cover" />
                          ) : (
                            c.authorName?.charAt(0) || 'D'
                          )}
                        </div>

                        {/* Comment Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[12px] font-extrabold text-[#1A1C23] tracking-tight">
                                {c.authorName}
                              </span>
                              {isCreator && (
                                <span className="bg-[#5438FF]/10 text-[#5438FF] text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md">
                                  Dreamer
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#1A1C23]/50 font-medium shrink-0">
                              {c.timestamp || 'Just now'}
                            </span>
                          </div>

                          <p className="font-editorial italic text-[13.5px] text-[#1A1C23]/90 mt-1 leading-snug break-words">
                            {c.text}
                          </p>

                          {/* Action Row */}
                          <div className="flex items-center justify-end space-x-3 mt-2 pt-1 border-t border-[#1A1C23]/5">
                            <button
                              onClick={() => handleToggleCommentLike(c.id)}
                              className={`flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer ${
                                isLiked ? 'text-rose-600' : 'text-[#1A1C23]/50 hover:text-rose-600'
                              }`}
                            >
                              <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-500 stroke-rose-500' : 'stroke-current'}`} />
                              <span>{likesCount > 0 ? likesCount : 'Like'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={commentsEndRef} />
              </div>

              {/* Quick Reaction Prompts */}
              <div className="px-5 pt-2 pb-1 border-t border-[#1A1C23]/8">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-[11px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#1A1C23]/50 shrink-0 mr-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#5438FF]" /> Quick:
                  </span>
                  {QUICK_REFLECTION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className="shrink-0 px-2.5 py-1 rounded-full bg-[#ECE7DF] hover:bg-[#E0DBD2] active:scale-95 text-[#1A1C23] font-medium transition cursor-pointer border border-[#1A1C23]/10 text-[11px]"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reflection Input Form */}
              <form
                onSubmit={handleSubmitComment}
                className="px-4 py-3 bg-[#ECE7DF]/80 border-t border-[#1A1C23]/10 flex items-center gap-2"
              >
                {/* User Avatar */}
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-[12px] shadow-xs overflow-hidden"
                  style={{ backgroundColor: currentUser?.color || '#5438FF' }}
                >
                  {currentUser?.avatar ? (
                    <img src={currentUser.avatar} alt="You" className="w-full h-full object-cover" />
                  ) : (
                    currentUser?.name?.charAt(0) || 'Y'
                  )}
                </div>

                {/* Text Field */}
                <input
                  ref={inputRef}
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Share your reflection or motif interpretation..."
                  className="flex-1 bg-white border border-[#1A1C23]/15 rounded-full px-3.5 py-2 text-[12.5px] text-[#1A1C23] placeholder:text-[#1A1C23]/45 focus:outline-none focus:border-[#5438FF] focus:ring-1 focus:ring-[#5438FF]"
                />

                {/* Voice Reflection Dictation Button */}
                <button
                  type="button"
                  onClick={handleToggleListening}
                  aria-label={isListening ? 'Stop voice recording' : 'Voice reflection dictation'}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer active:scale-95 shadow-xs ${
                    isListening
                      ? 'bg-red-500 text-white animate-pulse ring-2 ring-red-400'
                      : 'bg-white text-[#1A1C23]/70 hover:text-[#5438FF] hover:bg-white/90 border border-[#1A1C23]/15'
                  }`}
                  title={isListening ? 'Stop recording' : 'Speak your reflection'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!commentText.trim()}
                  aria-label="Post reflection"
                  className="w-9 h-9 rounded-full bg-[#5438FF] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#4528ea] active:scale-95 transition shadow-xs cursor-pointer shrink-0"
                  title="Submit reflection"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
