import React from 'react';
import { motion } from 'motion/react';
import { Plus, Clock, ArrowRight, Bookmark, Heart, MessageCircle, Sparkles, UserCheck, LogIn, Download } from 'lucide-react';
import { Dream, AuthUser } from '../types';
import { getDreamCardStyle, adjustColor } from '../utils/cardColors';
import { getTimeGreeting } from '../utils/timeGreeting';

interface HomeViewProps {
  dreams: Dream[];
  currentUser?: AuthUser;
  onSelectDream: (dream: Dream) => void;
  onOpenCapture: () => void;
  onOpenNearby: () => void;
  onOpenClips: () => void;
  onToggleLike: (dreamId: string) => void;
  onToggleSave: (dreamId: string) => void;
  onOpenLogin?: () => void;
  onOpenInstall?: () => void;
}

const renderDreamIllustration = (dream: Dream) => {
  const attachedMedia = dream.mediaUrl || dream.imageUrl || dream.clipVideoUrl;
  if (attachedMedia) {
    const isVideo = dream.mediaKind === 'video' || Boolean(dream.clipVideoUrl) || attachedMedia.endsWith('.mp4') || attachedMedia.includes('video');
    return (
      <div className="w-full h-full rounded-[1.8rem] overflow-hidden relative bg-black/40 group">
        {isVideo ? (
          <video
            src={attachedMedia}
            muted
            loop
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={attachedMedia}
            alt={dream.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A1C23]/60 via-transparent to-black/20 pointer-events-none" />
        {dream.surfaces?.hasClip && (
          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-white/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5438FF] animate-pulse" />
            <span>Clip Active</span>
          </div>
        )}
      </div>
    );
  }

  if (dream.id === 'dream-1') {
    return (
      <div className="w-full h-full rounded-[1.8rem] overflow-hidden relative bg-gradient-to-b from-[#8B7BFF] to-[#A093FF]">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 300 200">
          <circle cx="220" cy="40" fill="#5438FF" opacity="0.9" r="30" />
          <circle cx="230" cy="35" fill="#8B7BFF" r="25" />
          <circle cx="150" cy="20" fill="#F9F6F0" r="2" />
          <circle cx="260" cy="60" fill="#F9F6F0" r="3" />
          <circle cx="40" cy="80" fill="#F9F6F0" r="2" />
          <circle cx="90" cy="120" fill="#F9F6F0" r="2.5" />
          <path d="M40 50 Q50 40 70 40 Q90 40 100 50 Q110 55 90 60 L40 60 Q20 55 40 50 Z" fill="#F9F6F0" />
          <path d="M180 140 Q190 130 220 130 Q250 130 260 140 Q270 150 240 150 L180 150 Q160 150 180 140 Z" fill="#F9F6F0" />
          <path d="M100 100 L250 100" stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" strokeWidth="2" />
          <rect fill="#1A1C23" height="60" rx="6" width="40" x="130" y="70" />
          <circle cx="150" cy="100" fill="#5438FF" r="8" />
          <path d="M180 100 L195 100 M190 95 L195 100 L190 105" fill="none" stroke="#1A1C23" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
        </svg>
      </div>
    );
  }

  if (dream.id === 'dream-2') {
    return (
      <div className="w-full h-full rounded-[1.8rem] overflow-hidden relative bg-gradient-to-b from-[#4A7BB0] to-[#71AFD1]">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 300 200">
          <circle cx="60" cy="40" fill="#5438FF" opacity="0.6" r="26" />
          <circle cx="70" cy="35" fill="#71AFD1" r="22" />
          <circle cx="240" cy="30" fill="#F9F6F0" r="2.5" />
          <circle cx="270" cy="70" fill="#F9F6F0" r="2" />
          <circle cx="30" cy="120" fill="#F9F6F0" r="2" />
          <path d="M0 160 Q75 145 150 160 T300 160 L300 200 L0 200 Z" fill="rgba(249, 246, 240, 0.25)" />
          <path d="M0 175 Q75 165 150 175 T300 175 L300 200 L0 200 Z" fill="rgba(26, 28, 35, 0.2)" />
          <rect x="110" y="45" width="80" height="130" rx="40" fill="none" stroke="rgba(249, 246, 240, 0.7)" strokeWidth="3" />
          <rect x="118" y="53" width="64" height="114" rx="32" fill="rgba(84, 56, 255, 0.35)" />
          <ellipse cx="150" cy="110" rx="20" ry="8" fill="none" stroke="#F9F6F0" strokeWidth="1.5" opacity="0.8" />
          <ellipse cx="150" cy="125" rx="14" ry="5" fill="none" stroke="#F9F6F0" strokeWidth="1.5" opacity="0.6" />
          <circle cx="150" cy="95" r="3.5" fill="#F9F6F0" />
        </svg>
      </div>
    );
  }

  if (dream.id === 'dream-3') {
    return (
      <div className="w-full h-full rounded-[1.8rem] overflow-hidden relative bg-gradient-to-b from-[#6D78DC] to-[#97A5F4]">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 300 200">
          <circle cx="230" cy="45" fill="#FFF9DF" r="22" opacity="0.9" />
          <circle cx="238" cy="40" fill="#6D78DC" r="18" />
          <circle cx="50" cy="30" fill="#F9F6F0" r="2" />
          <circle cx="90" cy="60" fill="#F9F6F0" r="2.5" />
          <circle cx="270" cy="90" fill="#F9F6F0" r="2" />
          <path d="M160 150 Q170 140 190 140 Q210 140 220 150 Q230 155 210 160 L160 160 Z" fill="rgba(249,246,240,0.6)" />
          <path d="M60 170 L100 170 L100 145 L135 145 L135 120 L170 120 L170 95 L205 95 L205 70 L235 70" fill="none" stroke="#1A1C23" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M60 170 L100 170 L100 145 L135 145 L135 120 L170 120 L170 95 L205 95 L205 70 L235 70 L235 190 L60 190 Z" fill="rgba(255, 255, 255, 0.25)" />
        </svg>
      </div>
    );
  }

  if (dream.id === 'dream-4') {
    return (
      <div className="w-full h-full rounded-[1.8rem] overflow-hidden relative bg-gradient-to-b from-[#A56C58] to-[#C9917B]">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 300 200">
          <circle cx="240" cy="45" fill="#FFECC8" r="20" opacity="0.8" />
          <circle cx="60" cy="30" fill="#F9F6F0" r="2" />
          <circle cx="120" cy="50" fill="#F9F6F0" r="2.5" />
          <circle cx="80" cy="110" r="18" fill="#F6D58E" stroke="#1A1C23" strokeWidth="2.5" />
          <circle cx="80" cy="110" r="11" fill="none" stroke="#A56C58" strokeWidth="1.5" strokeDasharray="3 2" />
          <ellipse cx="145" cy="95" rx="14" ry="17" fill="#E8B96E" stroke="#1A1C23" strokeWidth="2.5" transform="rotate(20 145 95)" />
          <path d="M195 100 Q220 80 235 105 Q220 125 195 100 Z" fill="#FBE6B5" stroke="#1A1C23" strokeWidth="2" />
          <line x1="200" y1="102" x2="225" y2="104" stroke="#A56C58" strokeWidth="1.5" />
          <path d="M150 145 Q170 130 185 150 Q170 165 150 145 Z" fill="#FBE6B5" stroke="#1A1C23" strokeWidth="2" />
          <line x1="154" y1="146" x2="175" y2="148" stroke="#A56C58" strokeWidth="1.5" />
        </svg>
      </div>
    );
  }

  // Default ethereal surreal dreamscape for other dreams
  const theme = getDreamCardStyle(dream);
  const gradTop = theme.isDark ? adjustColor(theme.cardColor, 24) : adjustColor(theme.cardColor, -16);
  const gradBottom = theme.cardColor;

  return (
    <div
      className="w-full h-full rounded-[1.8rem] overflow-hidden relative"
      style={{
        background: `linear-gradient(180deg, ${gradTop} 0%, ${gradBottom} 100%)`,
      }}
    >
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 300 200">
        <circle cx="215" cy="45" fill={theme.isDark ? '#8A7BFF' : '#5438FF'} opacity="0.7" r="28" />
        <circle cx="225" cy="40" fill={theme.cardBorderColor} r="24" />
        <circle cx="45" cy="40" fill="#F9F6F0" r="2" />
        <circle cx="110" cy="30" fill="#F9F6F0" r="2.5" />
        <circle cx="265" cy="70" fill="#F9F6F0" r="2" />
        <circle cx="70" cy="130" fill="#F9F6F0" r="2.5" />
        <path d="M30 150 Q50 135 80 135 Q110 135 130 150 Q140 155 120 165 L30 165 Z" fill="rgba(249, 246, 240, 0.4)" />
        <path d="M170 140 Q190 125 230 125 Q270 125 285 140 Q295 150 270 155 L170 155 Z" fill="rgba(249, 246, 240, 0.4)" />
        <polygon points="150,65 175,105 150,145 125,105" fill="rgba(255,255,255,0.25)" stroke={theme.isDark ? '#FFFFFF' : '#1A1C23'} strokeWidth="2.5" />
        <circle cx="150" cy="105" r="7" fill={theme.isDark ? '#8A7BFF' : '#5438FF'} />
      </svg>
    </div>
  );
};

export const HomeView: React.FC<HomeViewProps> = ({
  dreams,
  currentUser,
  onSelectDream,
  onOpenCapture,
  onOpenNearby,
  onOpenClips,
  onToggleLike,
  onToggleSave,
  onOpenLogin,
  onOpenInstall,
}) => {

  return (
    <div className="w-full pb-28">
      {/* Personalized Header */}
      <header className="px-6 pt-7 pb-2">
        <h1 className="font-serif-dream font-semibold text-[40px] leading-[1.05] tracking-tight text-[#1A1C23]">
          {getTimeGreeting(new Date().getHours())},
        </h1>
        <p className="font-sans text-[19px] leading-tight font-semibold text-[#1A1C23]/70 mt-2">
          {currentUser?.name || 'Dreamer'}
        </p>
      </header>

      {/* Top Quick-Action Rail */}
      <div className="flex gap-2.5 px-6 pt-4 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={onOpenCapture}
          className="px-4 py-2.5 rounded-full text-[13px] font-bold bg-[#1A1C23] text-[#F9F6F0] flex items-center gap-1.5 whitespace-nowrap shadow-sm hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Dream</span>
        </button>
        <button
          onClick={onOpenNearby}
          className="px-4 py-2.5 rounded-full text-[13px] font-bold bg-white border border-[#1A1C23]/10 text-[#1A1C23] flex items-center gap-1.5 whitespace-nowrap shadow-sm hover:bg-stone-50 active:scale-95 transition-all"
        >
          <Clock className="w-3.5 h-3.5 stroke-[2.2] text-[#5438FF]" />
          <span>Nearby</span>
        </button>
        <button
          onClick={onOpenClips}
          className="px-4 py-2.5 rounded-full text-[13px] font-bold bg-white border border-[#1A1C23]/10 text-[#1A1C23] flex items-center gap-1.5 whitespace-nowrap shadow-sm hover:bg-stone-50 active:scale-95 transition-all"
        >
          <ArrowRight className="w-3.5 h-3.5 stroke-[2.2] text-[#5438FF]" />
          <span>Clips</span>
        </button>
      </div>

      {/* Stories Rail: Friend Dream Fragments with washi tape */}
      <div className="flex gap-3.5 pl-6 pt-5 pb-3 overflow-x-auto no-scrollbar pr-6">
        {dreams
          .filter((d) => d.surfaces?.isStory !== false)
          .slice(0, 6)
          .map((storyDream, idx) => {
            const media = storyDream.imageUrl || storyDream.mediaUrl;
            const rotations = ['-rotate-[2.5deg]', 'rotate-[1.5deg] mt-1', '-rotate-1', 'rotate-[2deg]'];
            const rot = rotations[idx % rotations.length];
            const tapeColors = [
              undefined,
              'rgba(139, 123, 255, 0.5)',
              'rgba(84, 56, 255, 0.55)',
              'rgba(255, 111, 92, 0.5)',
            ];
            const tapeStyle = tapeColors[idx % tapeColors.length]
              ? { background: tapeColors[idx % tapeColors.length] }
              : undefined;

            const hasCustomColor = !media && Boolean(storyDream.cardColor);
            const storyCardStyle = hasCustomColor
              ? { backgroundColor: storyDream.cardColor, color: storyDream.cardTextColor || '#1A1C23' }
              : undefined;

            return (
              <article
                key={storyDream.id}
                onClick={() => onSelectDream(storyDream)}
                style={storyCardStyle}
                className={`relative min-w-[140px] max-w-[150px] h-[172px] rounded-t-md rounded-b-[22px] px-3.5 pt-5 pb-3.5 shrink-0 shadow-[0_10px_22px_-10px_rgba(26,28,35,0.25)] ${
                  media ? 'bg-black text-white' : (!hasCustomColor && (idx % 2 === 0 ? 'bg-white text-[#1A1C23]' : 'bg-[#FFF1EC] text-[#1A1C23]'))
                } ${rot} border border-[#1A1C23]/5 cursor-pointer hover:rotate-0 transition-transform overflow-hidden`}
              >
                {media && (
                  <div className="absolute inset-0 z-0">
                    <img
                      src={media}
                      alt={storyDream.title}
                      className="w-full h-full object-cover opacity-65"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/30" />
                  </div>
                )}
                <div className="tape relative z-10" style={tapeStyle} />
                <p className={`relative z-10 font-editorial italic font-medium text-[14px] leading-[1.3] line-clamp-4 ${
                  media ? 'text-white' : 'text-[#1A1C23]'
                }`}>
                  {storyDream.hook || `"${storyDream.title}"`}
                </p>
                <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between z-10">
                  <span className={`text-[10px] tracking-[0.14em] font-extrabold uppercase truncate ${
                    media ? 'text-white/80' : 'text-[#4A4D59]'
                  }`}>
                    {storyDream.author?.name?.split(' ')[0] || 'Dreamer'}
                  </span>
                  {media && (
                    <span className="text-[8px] bg-white/25 backdrop-blur-xs text-white px-1.5 py-0.5 rounded-full font-bold">
                      Media
                    </span>
                  )}
                </div>
              </article>
            );
          })}
      </div>

      {/* Subheader: Nearby summary trigger */}
      <div className="flex items-baseline justify-between px-6 pt-6 pb-3">
        <button
          onClick={onOpenNearby}
          className="text-xs font-extrabold text-[#5438FF] tracking-[0.05em] hover:underline flex items-center gap-1"
        >
          <span className="w-2 h-2 rounded-full bg-[#5438FF] animate-pulse" />
          <span>318 nearby</span>
        </button>
        <span className="text-[11px] font-semibold text-[#1A1C23]/50 uppercase tracking-wider">
          Last night
        </span>
      </div>

      {/* Dreams Feed - All Cards Styled Uniformly in the Signature Card Format */}
      <div className="space-y-6">
        {dreams.map((dream, index) => {
          const cardStyle = getDreamCardStyle(dream);

          return (
          <React.Fragment key={dream.id}>
            <motion.article
              initial={{ opacity: 0, y: 16, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.65, delay: Math.min(index * 0.08, 0.4), ease: [0.22, 1, 0.36, 1] }}
              onClick={() => onSelectDream(dream)}
              style={cardStyle.containerStyle}
              className="mx-6 rounded-[2.5rem] overflow-hidden shadow-xl border-b-[6px] cursor-pointer hover:shadow-2xl transition-all"
            >
              {/* Visual Stage illustration */}
              <div className="relative h-[200px] p-3.5 pb-0">
                {renderDreamIllustration(dream)}
                <div className="absolute top-5 right-5 bg-[#1A1C23] text-[#F9F6F0] text-[10px] font-extrabold tracking-widest py-1.5 px-3.5 rounded-full flex items-center gap-1 shadow-lg">
                  <span className="text-[12px] font-bold leading-none">+</span> {dream.timeAgo ? dream.timeAgo.toUpperCase() : 'JUST NOW'}
                </div>
              </div>

              <div className="px-6 pt-5 pb-6">
                <span
                  className="inline-block text-[10px] font-extrabold tracking-widest py-1 px-3 rounded-full mb-2.5 uppercase transition-colors"
                  style={{ backgroundColor: cardStyle.badgeBg, color: cardStyle.textColor }}
                >
                  {dream.timeAgo ? dream.timeAgo.toUpperCase() : '2H AGO'}
                </span>
                <h3
                  className="font-sans-ui font-extrabold text-[25px] leading-[1.1] tracking-tight uppercase mb-2"
                  style={{ color: cardStyle.textColor }}
                >
                  {dream.title}
                </h3>
                <p
                  className="font-editorial italic text-[17px] leading-[1.4] mb-5"
                  style={{ color: cardStyle.isDark ? 'rgba(255,255,255,0.92)' : 'rgba(26,28,35,0.90)' }}
                >
                  {dream.hook}
                </p>

                <div className="flex items-center gap-2 mb-5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden"
                    style={{ backgroundColor: cardStyle.badgeBg }}
                  >
                    {dream.author?.avatar ? (
                      <img src={dream.author.avatar} alt={dream.author.name || 'Dreamer'} className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-[18px]" style={{ color: cardStyle.textColor }}>person</span>
                    )}
                  </div>
                  <p className="text-[13px] font-bold" style={{ color: cardStyle.textColor }}>
                    {dream.author?.name || 'Dreamer'}
                    <span className="font-medium ml-1" style={{ color: cardStyle.subtextColor }}>
                      · {dream.capturedTime || dream.timeAgo || 'Recently'}
                    </span>
                  </p>
                </div>

                <div
                  onClick={(e) => e.stopPropagation()}
                  className="border-t border-dashed pt-4 flex items-center justify-between"
                  style={{ borderColor: cardStyle.dashedBorder }}
                >
                  <div className="flex gap-5">
                    <button
                      onClick={() => onToggleLike(dream.id)}
                      className="flex items-center gap-1.5 text-[13px] font-bold hover:opacity-80 transition-colors"
                      style={{ color: cardStyle.textColor }}
                    >
                      <Heart
                        className={`w-4 h-4 ${dream.isLiked ? 'fill-[#5438FF] text-[#5438FF]' : ''}`}
                      />
                      <span>{dream.likes}</span>
                    </button>
                    <button
                      onClick={() => onSelectDream(dream)}
                      className="flex items-center gap-1.5 text-[13px] font-bold hover:opacity-80 transition-colors"
                      style={{ color: cardStyle.textColor }}
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>{dream.commentsCount}</span>
                    </button>
                  </div>

                  <button
                    onClick={() => onToggleSave(dream.id)}
                    className="hover:opacity-80 transition-colors"
                    style={{ color: dream.isSaved ? cardStyle.textColor : cardStyle.subtextColor }}
                  >
                    <Bookmark
                      className={`w-4 h-4 ${dream.isSaved ? 'fill-current' : ''}`}
                    />
                  </button>
                </div>
              </div>
            </motion.article>

            {/* Contextual Curiosity / Echo Card placed right after the first card */}
            {index === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12, filter: 'blur(2px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="mx-6"
              >
                <div
                  onClick={() => {
                    const target = dreams.find((d) => d.id === 'dream-2') || dreams[0];
                    if (target) onSelectDream(target);
                  }}
                  className="bg-[#5438FF]/10 border border-[#5438FF]/20 rounded-[22px] p-4 text-[#1A1C23] hover:bg-[#5438FF]/15 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#5438FF] mb-1">
                        <Sparkles className="w-3 h-3" />
                        <span>Dream Echo</span>
                      </span>
                      <p className="text-[15px] font-editorial italic text-[#1A1C23] leading-snug">
                        Someone else dreamed about water doorways too →
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-[#5438FF] group-hover:translate-x-1 transition-transform shrink-0" />
                  </div>
                </div>
              </motion.div>
            )}
          </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
