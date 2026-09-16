import React, { useState } from 'react';
import { ChevronLeft, MoreHorizontal, Heart, MessageCircle, Bookmark, Share2, Send, Users, Palette, Check, X, Sparkles } from 'lucide-react';
import { Dream, AuthUser } from '../types';
import { getDreamCardStyle, adjustColor, CARD_COLOR_PRESETS, CardColorPreset, deriveCardTheme } from '../utils/cardColors';

interface DreamDetailViewProps {
  dream: Dream;
  currentUser?: AuthUser | null;
  onBack: () => void;
  onToggleLike: (dreamId: string) => void;
  onToggleSave: (dreamId: string) => void;
  onAddComment: (dreamId: string, text: string) => void;
  onOpenDreamCircle: (dreamId: string) => void;
  onOpenClip?: () => void;
  onShareDream?: (dreamId: string, platform?: string) => void;
  onEditDream?: (dream: Dream) => void;
  onUpdateAtmosphere?: (dreamId: string, atmosphere: { cardColor: string; cardBorderColor?: string; cardTextColor?: string }) => void | Promise<void>;
}

export const DreamDetailView: React.FC<DreamDetailViewProps> = ({
  dream,
  currentUser,
  onBack,
  onToggleLike,
  onToggleSave,
  onAddComment,
  onOpenDreamCircle,
  onOpenClip,
  onShareDream,
  onEditDream,
  onUpdateAtmosphere,
}) => {
  const [replyText, setReplyText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  const isAuthor = Boolean(
    currentUser &&
    !currentUser.isGuest &&
    !currentUser.isDemo &&
    (currentUser.id === dream.author?.id ||
     (dream.author?.handle && currentUser.handle && dream.author.handle.toLowerCase() === currentUser.handle.toLowerCase()))
  );

  const [showAtmosphereModal, setShowAtmosphereModal] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    const matched = CARD_COLOR_PRESETS.find(
      (p) => p.cardColor.toLowerCase() === (dream.cardColor || '').toLowerCase()
    );
    return matched ? matched.id : (dream.cardColor ? 'custom' : 'lavender');
  });
  const [customColor, setCustomColor] = useState<string>(dream.cardColor || '#D8D4FF');
  const [customHexInput, setCustomHexInput] = useState<string>(dream.cardColor || '#D8D4FF');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(() => {
    const matched = CARD_COLOR_PRESETS.find(
      (p) => p.cardColor.toLowerCase() === (dream.cardColor || '').toLowerCase()
    );
    return !matched && Boolean(dream.cardColor);
  });
  const [isSavingAtmosphere, setIsSavingAtmosphere] = useState(false);

  const activeAtmosphereColor = isCustomMode
    ? customColor
    : (CARD_COLOR_PRESETS.find((p) => p.id === selectedPresetId)?.cardColor || dream.cardColor || '#D8D4FF');
  const previewTheme = deriveCardTheme(activeAtmosphereColor);

  const handleSelectPreset = (preset: CardColorPreset) => {
    setSelectedPresetId(preset.id);
    setIsCustomMode(false);
    setCustomColor(preset.cardColor);
    setCustomHexInput(preset.cardColor);
  };

  const handleCustomColorChange = (hexVal: string) => {
    setCustomHexInput(hexVal);
    setCustomColor(hexVal);
    setSelectedPresetId('custom');
    setIsCustomMode(true);
  };

  const handleSaveAtmosphere = async () => {
    if (!onUpdateAtmosphere) return;
    setIsSavingAtmosphere(true);
    try {
      await onUpdateAtmosphere(dream.id, {
        cardColor: previewTheme.cardColor,
        cardBorderColor: previewTheme.cardBorderColor,
        cardTextColor: previewTheme.cardTextColor,
      });
      setShowAtmosphereModal(false);
    } catch (e) {
      console.warn('Failed to update atmosphere:', e);
    } finally {
      setIsSavingAtmosphere(false);
    }
  };

  const cardTheme = getDreamCardStyle(dream);

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    onAddComment(dream.id, replyText.trim());
    setReplyText('');
  };

  const handleShare = () => {
    onShareDream?.(dream.id, navigator.share ? 'web_share_api' : 'clipboard_copy');
    if (navigator.share) {
      navigator.share({
        title: dream.title,
        text: dream.hook,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#F9F6F0] text-[#1A1C23] flex flex-col pb-28">
      {/* Status Bar */}
      <header className="w-full pt-3 px-7 flex justify-between items-center text-[14px] font-semibold select-none">
        <span>9:41</span>
        <div className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1A1C23]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#1A1C23]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#1A1C23]" />
        </div>
      </header>

      {/* Top Navigation */}
      <nav aria-label="Main Navigation" className="w-full px-5 pt-3 pb-2 flex items-center justify-between z-10">
        <button
          onClick={onBack}
          aria-label="Go back"
          className="w-10 h-10 rounded-full bg-[#F9F6F0] border border-[#1A1C23]/15 shadow-xs flex items-center justify-center text-[#1A1C23] hover:bg-white active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5 -ml-0.5 stroke-[2.5]" />
        </button>

        <h1 className="text-[26px] font-bold font-serif-dream tracking-tight text-[#1A1C23]">
          Dream
        </h1>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            aria-label="More options"
            className="p-2 text-[#1A1C23] hover:opacity-75 transition-opacity"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-10 w-44 bg-white rounded-2xl shadow-xl border border-[#1A1C23]/10 p-2 z-30">
              {isAuthor && onUpdateAtmosphere && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowAtmosphereModal(true);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-semibold rounded-lg hover:bg-stone-50 text-[#5438FF] flex items-center gap-1.5"
                >
                  <Palette className="w-3.5 h-3.5" />
                  Change Atmosphere
                </button>
              )}
              {isAuthor && onEditDream && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onEditDream(dream);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-semibold rounded-lg hover:bg-stone-50 text-[#1A1C23] flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#5438FF]" />
                  Edit Dream Details
                </button>
              )}
              <button
                onClick={() => {
                  handleShare();
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold rounded-lg hover:bg-stone-50"
              >
                Share Dream
              </button>
              <button
                onClick={() => {
                  onOpenDreamCircle(dream.id);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold rounded-lg hover:bg-stone-50 text-[#5438FF]"
              >
                Enter Dream Circle
              </button>
              <button
                onClick={() => {
                  alert('Thank you for reporting. Our moderation team has been notified.');
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-rose-600 rounded-lg hover:bg-rose-50"
              >
                Report Dream
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 px-5 pt-3 flex flex-col gap-4">
        {/* Hero Card Visual */}
        <div
          className="w-full min-h-[160px] max-h-[260px] rounded-[26px] relative overflow-hidden shadow-lg border-b-4 flex-shrink-0"
          style={{
            background: (dream.mediaUrl || dream.imageUrl || dream.clipVideoUrl)
              ? undefined
              : (dream.cardColor
                  ? `linear-gradient(180deg, ${adjustColor(cardTheme.cardColor, cardTheme.isDark ? 25 : -15)} 0%, ${cardTheme.cardColor} 100%)`
                  : 'linear-gradient(180deg, #5438FF 0%, #654DF8 50%, #826BF9 100%)'),
            borderBottomColor: cardTheme.cardBorderColor,
          }}
        >
          {(dream.mediaUrl || dream.imageUrl || dream.clipVideoUrl) ? (
            <div className="w-full h-[200px] relative bg-black/60">
              {dream.mediaKind === 'video' || Boolean(dream.clipVideoUrl) ? (
                <video
                  src={dream.mediaUrl || dream.clipVideoUrl}
                  controls
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <img
                  src={dream.mediaUrl || dream.imageUrl}
                  alt={dream.title}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />
              {dream.mediaCaption && (
                <div className="absolute bottom-2.5 left-4 right-4 z-10 text-[11.5px] text-white/95 italic font-editorial bg-black/60 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-white/15">
                  "{dream.mediaCaption}"
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Floating Stars */}
              <div className="absolute top-4 left-[205px] w-1 h-1 bg-white rounded-full opacity-80" />
              <div className="absolute top-9 left-[140px] w-1 h-1 bg-white rounded-full opacity-60" />
              <div className="absolute top-10 left-[225px] w-1.5 h-1.5 bg-white rounded-full opacity-90" />
              <div className="absolute top-12 left-[138px] w-0.5 h-0.5 bg-white rounded-full opacity-50" />
              <div className="absolute top-22 left-[255px] w-1 h-1 bg-white rounded-full opacity-70" />

              {/* Glowing Crescent Moon */}
              <div className="absolute top-3.5 right-6 w-11 h-11 pointer-events-none">
                <svg className="w-full h-full drop-shadow-[0_0_12px_rgba(255,255,255,0.85)]" viewBox="0 0 48 48">
                  <path
                    d="M37.5 35.8c-1.2.2-2.4.3-3.6.3-10.5 0-19-8.5-19-19 0-4.6 1.6-8.8 4.3-12.1-8.5 2.1-14.8 9.8-14.8 19 0 11 9 20 20 20 5.2 0 9.9-2 13.5-5.2-.1-1-.2-2-.4-3z"
                    fill="#FFFFFF"
                  />
                </svg>
              </div>

              {/* Landscape Silhouette Contours & Clouds */}
              <svg className="absolute inset-0 w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 350 154">
                <path
                  d="M-20 160 C 90 140, 160 110, 260 145 C 310 160, 360 150, 380 160 L380 170 L-20 170 Z"
                  fill={cardTheme.isDark ? '#FFFFFF' : '#1A1C23'}
                  opacity="0.12"
                />
                <path
                  d="M-10 160 C 70 145, 140 120, 220 155 C 290 175, 340 140, 370 155 L370 170 L-10 170 Z"
                  fill={cardTheme.isDark ? '#FFFFFF' : '#1A1C23'}
                  opacity="0.18"
                />
                <g opacity="0.85">
                  <path
                    d="M12 112 C 12 106, 17 101, 23 101 C 25 101, 27 102, 28 103 C 31 98, 38 97, 43 101 C 46 96, 54 96, 58 100 C 62 97, 69 98, 72 102 C 77 101, 83 104, 84 109 C 85 111, 85 112, 85 112 Z"
                    fill={cardTheme.isDark ? '#FFFFFF' : '#1A1C23'}
                    opacity="0.25"
                  />
                  <rect fill={cardTheme.isDark ? '#FFFFFF' : '#1A1C23'} opacity="0.25" height="4" rx="2" width="76" x="12" y="108" />
                </g>
                <g opacity="0.85">
                  <path
                    d="M242 125 C 242 120, 246 116, 252 116 C 254 116, 256 117, 257 118 C 260 113, 266 112, 271 115 C 275 110, 283 110, 287 114 C 291 112, 298 113, 301 117 C 306 116, 311 119, 312 124 C 312 125, 312 125, 312 125 Z"
                    fill={cardTheme.isDark ? '#FFFFFF' : '#1A1C23'}
                    opacity="0.25"
                  />
                  <rect fill={cardTheme.isDark ? '#FFFFFF' : '#1A1C23'} opacity="0.25" height="4" rx="2" width="70" x="242" y="122" />
                </g>
              </svg>
            </>
          )}

          {/* Public Pill Badge */}
          <div className="absolute top-3.5 left-4 bg-[#1A1C23]/85 backdrop-blur-md border border-white/20 text-white text-[11px] font-bold px-3 py-1 rounded-full tracking-wider shadow-xs flex items-center gap-1 z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5438FF]" />
            <span>{dream.audience.toUpperCase()}</span>
          </div>

          {dream.hasClip && onOpenClip && (
            <button
              onClick={onOpenClip}
              className="absolute top-3.5 right-4 bg-white/25 backdrop-blur-md border border-white/30 text-white text-[11px] font-bold px-3 py-1 rounded-full hover:bg-white/35 transition-all flex items-center gap-1 z-10"
            >
              <span>Watch Clip ▶</span>
            </button>
          )}
        </div>

        {/* Publishing Surfaces & Atmosphere Indicator */}
        <div className="bg-white/70 rounded-2xl p-2.5 border border-[#1A1C23]/10 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-[#5438FF] uppercase text-[10px] tracking-wider mr-1">
              Surfaces:
            </span>
            <span className="bg-white px-2 py-0.5 rounded-lg border border-[#1A1C23]/10 text-[#1A1C23] font-medium">
              📖 Normal Feed
            </span>
            {dream.surfaces?.isStory !== false && (
              <span className="bg-white px-2 py-0.5 rounded-lg border border-[#1A1C23]/10 text-amber-700 font-medium">
                ⏱️ Last Night Story
              </span>
            )}
            {dream.surfaces?.isNearby !== false && (
              <span className="bg-white px-2 py-0.5 rounded-lg border border-[#1A1C23]/10 text-emerald-700 font-medium">
                📍 Nearby Radar
              </span>
            )}
            {dream.hasClip && (
              <span className="bg-white px-2 py-0.5 rounded-lg border border-[#1A1C23]/10 text-indigo-700 font-medium">
                🎬 Clip Player
              </span>
            )}
          </div>

          {isAuthor ? (
            <button
              type="button"
              onClick={() => setShowAtmosphereModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[10px] shadow-xs cursor-pointer hover:opacity-90 active:scale-95 transition-all"
              style={{
                backgroundColor: cardTheme.cardColor,
                color: cardTheme.textColor,
                borderBottom: `2px solid ${cardTheme.cardBorderColor}`,
              }}
              title="Click to change atmosphere"
            >
              <Palette className="w-3 h-3" />
              <span>{dream.cardColor ? 'Atmosphere' : 'Set Atmosphere'}</span>
            </button>
          ) : dream.cardColor ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[10px] shadow-xs"
              style={{
                backgroundColor: cardTheme.cardColor,
                color: cardTheme.textColor,
                borderBottom: `2px solid ${cardTheme.cardBorderColor}`,
              }}
            >
              <Palette className="w-3 h-3" />
              <span>Custom Atmosphere</span>
            </div>
          ) : null}
        </div>

        {/* Author Metadata */}
        <section className="flex items-center space-x-3 pt-0.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-[13px] shadow-xs overflow-hidden"
            style={{ backgroundColor: dream.author?.color || '#5438FF' }}
          >
            {dream.author?.avatar ? (
              <img src={dream.author.avatar} alt={dream.author?.name || 'Dreamer'} className="w-full h-full object-cover" />
            ) : (
              dream.author?.initials || 'D'
            )}
          </div>
          <div className="flex flex-col text-[13px] leading-tight">
            <div className="flex items-center space-x-1 text-[#1A1C23]">
              <span className="font-semibold">{dream.author?.name || 'Dreamer'}</span>
              <span className="opacity-50">·</span>
              <span className="opacity-65 text-[12.5px]">{dream.timeAgo || 'Recently'}</span>
              <span className="opacity-50">·</span>
            </div>
            <span className="text-[#1A1C23]/65 text-[12px] mt-0.5 font-medium">
              {(dream.tags || []).join(', ')}
            </span>
          </div>
        </section>

        {/* Story Text Content */}
        <article className="space-y-2">
          <h2 className="text-[28px] font-bold font-serif-dream leading-[1.12] text-[#1A1C23]">
            {dream.title}
          </h2>
          <p className="font-editorial text-[17px] italic text-[#1A1C23] leading-[1.48] tracking-[0.01em]">
            {dream.content}
          </p>
        </article>

        {/* Engagement Interaction Bar */}
        <section className="bg-white/80 backdrop-blur-xs rounded-[24px] py-3 px-4 flex items-center justify-around text-[#1A1C23] mt-1 shadow-xs border border-[#1A1C23]/10">
          {/* Like */}
          <button
            onClick={() => onToggleLike(dream.id)}
            className="flex flex-col items-center group w-14 hover:text-[#5438FF] transition-colors"
          >
            <Heart
              className={`w-5 h-5 stroke-[1.8] ${dream.isLiked ? 'fill-[#5438FF] text-[#5438FF]' : ''}`}
            />
            <span className="text-[12px] font-medium text-[#1A1C23] mt-1 group-hover:text-[#5438FF]">
              {dream.likes}
            </span>
          </button>

          {/* Reply */}
          <button
            onClick={() => {
              const el = document.getElementById('reply-input');
              if (el) el.focus();
            }}
            className="flex flex-col items-center group w-14 hover:text-[#5438FF] transition-colors"
          >
            <MessageCircle className="w-5 h-5 stroke-[1.8]" />
            <span className="text-[12px] font-medium text-[#1A1C23] mt-1 group-hover:text-[#5438FF]">
              Reply
            </span>
          </button>

          {/* Save */}
          <button
            onClick={() => onToggleSave(dream.id)}
            className="flex flex-col items-center group w-14 hover:text-[#5438FF] transition-colors"
          >
            <Bookmark
              className={`w-5 h-5 stroke-[1.8] ${dream.isSaved ? 'fill-[#1A1C23] text-[#1A1C23]' : ''}`}
            />
            <span className="text-[12px] font-medium text-[#1A1C23] mt-1 group-hover:text-[#5438FF]">
              Save
            </span>
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="flex flex-col items-center group w-14 hover:text-[#5438FF] transition-colors"
          >
            <Share2 className="w-5 h-5 stroke-[1.8]" />
            <span className="text-[12px] font-medium text-[#1A1C23] mt-1 group-hover:text-[#5438FF]">
              Share
            </span>
          </button>
        </section>

        {copiedNotification && (
          <div className="text-center text-xs font-bold text-[#5438FF] bg-[#EEEAFE] py-1 rounded-full animate-fade">
            Link copied to clipboard!
          </div>
        )}

        {/* Responses & Comments List */}
        <section className="space-y-2.5 pt-1">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1A1C23]/60 px-1">
            Dream Reflections ({dream.comments.length})
          </h3>

          {dream.comments.map((c) => (
            <div key={c.id} className="flex items-center space-x-2.5">
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white font-semibold text-[13px] shadow-xs"
                style={{ backgroundColor: c.authorColor || '#5438FF' }}
              >
                {c.authorName.charAt(0)}
              </div>
              <div className="bg-white border border-[#1A1C23]/10 rounded-[18px] px-3.5 py-2.5 flex-1 shadow-xs">
                <span className="block text-[11px] font-extrabold tracking-wider text-[#5438FF] uppercase">
                  {c.authorName}
                </span>
                <p className="text-[13.5px] text-[#1A1C23] mt-0.5 leading-snug">
                  {c.text}
                </p>
              </div>
            </div>
          ))}

          {/* Quick Comment Input */}
          <form onSubmit={handleSubmitReply} className="flex items-center gap-2 pt-2">
            <input
              id="reply-input"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Leave a reflection on this dream..."
              className="flex-1 bg-white border border-[#1A1C23]/15 rounded-full px-4 py-2.5 text-xs text-[#1A1C23] focus:outline-none focus:border-[#5438FF]"
            />
            <button
              type="submit"
              disabled={!replyText.trim()}
              className="w-9 h-9 rounded-full bg-[#5438FF] text-white flex items-center justify-center disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </section>

        {/* Bottom Recommendation Card -> Opens Dream Circle / Similar Dreams */}
        <section className="pt-2">
          <button
            onClick={() => onOpenDreamCircle(dream.id)}
            className="w-full text-left bg-[#5438FF]/10 border border-[#5438FF]/25 rounded-[22px] p-4 text-[#1A1C23] transition-all hover:bg-[#5438FF]/15 group"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#5438FF] uppercase tracking-wider mb-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>Dream Circle</span>
                </div>
                <div className="text-[15px] font-editorial italic text-[#1A1C23] leading-snug">
                  <p>Someone else dreamed</p>
                  <p className="group-hover:text-[#5438FF] transition-colors">
                    {dream.similarDreamPrompt || 'about elevators too →'}
                  </p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-[#5438FF] stroke-[2.2] transition-transform group-hover:translate-x-1 rotate-180" />
            </div>
          </button>
        </section>
      </main>

      {/* Quick Atmosphere & Card Color Selector Modal */}
      {showAtmosphereModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#F9F6F0] w-full max-w-[420px] rounded-[32px] p-5 shadow-2xl border border-white/20 flex flex-col relative space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5438FF] block">
                  Atmosphere & Color
                </span>
                <h3 className="font-serif-dream text-[20px] font-bold text-[#1A1C23]">
                  Card Atmosphere
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAtmosphereModal(false)}
                className="w-8 h-8 rounded-full bg-[#1A1C23]/5 hover:bg-[#1A1C23]/10 flex items-center justify-center text-[#1A1C23]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-[#1A1C23]/60">
              Select a color tint for this Dream card. Changes are saved permanently to your Dream.
            </p>

            {/* Presets Grid */}
            <div className="grid grid-cols-3 gap-2">
              {CARD_COLOR_PRESETS.map((preset) => {
                const isSelected = !isCustomMode && selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`flex flex-col items-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#5438FF] bg-[#5438FF]/10 ring-2 ring-[#5438FF]/30'
                        : 'border-[#1A1C23]/10 hover:border-[#1A1C23]/30 bg-white'
                    }`}
                  >
                    <div
                      className="w-7 h-7 rounded-full shadow-inner border border-black/10 flex items-center justify-center mb-1 shrink-0"
                      style={{ backgroundColor: preset.cardColor }}
                    >
                      {isSelected && (
                        <Check className="w-3.5 h-3.5" style={{ color: preset.cardTextColor }} />
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-[#1A1C23] truncate w-full">
                      {preset.name}
                    </span>
                    <span className="text-[9px] text-[#1A1C23]/50 truncate w-full">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Color Picker */}
            <div className="pt-2 border-t border-[#1A1C23]/10 flex items-center justify-between gap-2">
              <label
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border cursor-pointer transition-all ${
                  isCustomMode
                    ? 'border-[#5438FF] bg-[#5438FF]/10 ring-1 ring-[#5438FF]'
                    : 'border-[#1A1C23]/15 bg-white hover:border-[#1A1C23]/30'
                }`}
              >
                <input
                  type="color"
                  value={customColor.startsWith('#') && customColor.length === 7 ? customColor : '#D8D4FF'}
                  onChange={(e) => handleCustomColorChange(e.target.value)}
                  className="w-4 h-4 rounded-full border border-black/15 cursor-pointer p-0 bg-transparent"
                />
                <span className="text-[11px] font-bold text-[#1A1C23]">
                  Custom
                </span>
              </label>

              <div className="flex items-center gap-1 bg-white border border-[#1A1C23]/15 rounded-xl px-2 py-1">
                <span className="text-[10px] font-mono text-[#1A1C23]/50">HEX</span>
                <input
                  type="text"
                  value={customHexInput}
                  onChange={(e) => handleCustomColorChange(e.target.value)}
                  maxLength={7}
                  className="w-18 text-[11px] font-mono font-bold text-[#1A1C23] bg-transparent outline-none uppercase"
                />
              </div>
            </div>

            {/* Mini Live Preview */}
            <div
              className="rounded-2xl p-3 border-b-4 shadow-sm transition-all"
              style={{
                backgroundColor: previewTheme.cardColor,
                borderBottomColor: previewTheme.cardBorderColor,
                color: previewTheme.cardTextColor,
              }}
            >
              <div className="text-[10px] font-extrabold uppercase tracking-wider mb-0.5 opacity-80">
                Live Preview
              </div>
              <div className="font-bold text-xs truncate">
                {dream.title}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAtmosphereModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#1A1C23]/15 text-xs font-bold text-[#1A1C23]/70 hover:bg-[#1A1C23]/5 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAtmosphere}
                disabled={isSavingAtmosphere}
                className="flex-1 py-2.5 rounded-xl bg-[#5438FF] hover:bg-[#4326EB] text-white text-xs font-bold shadow-md shadow-[#5438FF]/25 flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                {isSavingAtmosphere ? 'Saving...' : 'Save Atmosphere'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
