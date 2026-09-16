import React, { useState } from 'react';
import { ChevronLeft, Clock, Settings, Search, ArrowUp, Bookmark, ChevronRight } from 'lucide-react';
import { Dream } from '../types';

interface NearbyViewProps {
  onBack: () => void;
  dreams: Dream[];
  onSelectDream: (dream: Dream) => void;
}

export const NearbyView: React.FC<NearbyViewProps> = ({
  onBack,
  dreams,
  onSelectDream,
}) => {
  const [publicOnly, setPublicOnly] = useState(true);
  const [region, setRegion] = useState('Bhubaneswar area');
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);
  const [nearbyQuery, setNearbyQuery] = useState('');

  const regions = [
    'Bhubaneswar area',
    'Bengaluru area',
    'Mumbai area',
    'Delhi NCR area',
    'San Francisco Bay area',
    'London metro',
  ];

  const stickers = [
    {
      id: 'st-1',
      quote: '"the sky had stairs"',
      sub: 'Josh · Falling',
      bg: 'bg-[#FFFDF8] text-[#1A1C23]',
      style: { top: '75px', right: '10px', transform: 'rotate(8deg)' },
      dreamId: 'dream-3',
    },
    {
      id: 'st-2',
      quote: '"a very calm flood, ankle-deep everywhere"',
      sub: '6 nearby · Water',
      bg: 'bg-[#FFF1EC] text-[#1A1C23]',
      style: { top: '160px', right: '35px', transform: 'rotate(-6deg)' },
      dreamId: 'dream-2',
    },
    {
      id: 'st-3',
      quote: '"chased, but only walking speed"',
      sub: 'Priya · Chased',
      bg: 'bg-[#F2EDFF] text-[#1A1C23]',
      style: { top: '280px', left: '20px', transform: 'rotate(-4deg)' },
      dreamId: 'dream-1',
    },
    {
      id: 'st-4',
      quote: '"my old school, rearranged"',
      sub: 'Maya · School',
      bg: 'bg-[#EAFAFC] text-[#1A1C23]',
      style: { top: '370px', right: '22px', transform: 'rotate(5deg)' },
      dreamId: 'dream-1',
    },
    {
      id: 'st-5',
      quote: '"could breathe underwater, forgot how on land"',
      sub: 'Devan · Water',
      bg: 'bg-[#FFFDF8] text-[#1A1C23]',
      style: { top: '440px', left: '40px', transform: 'rotate(-8deg)' },
      dreamId: 'dream-2',
    },
  ];

  return (
    <div className="w-full min-h-screen bg-[#1A1424] text-[#FBF3E7] flex flex-col relative overflow-hidden pb-24">
      {/* Deep Lavender Header Card */}
      <header
        className="bg-[#6F5EFF] text-[#FBF3E7] px-6 pt-4 pb-6 relative z-10 shrink-0 shadow-[0_24px_48px_-12px_rgba(111,94,255,0.45)]"
        style={{ borderRadius: '0 0 48px 48px' }}
      >
        {/* Status Bar */}
        <div className="flex justify-between items-center text-[13px] font-bold mb-2">
          <span>9:41</span>
          <div className="flex gap-1 items-center">
            <span className="w-1 h-1 rounded-full bg-[#FBF3E7]" />
            <span className="w-1 h-1 rounded-full bg-[#FBF3E7]" />
            <span className="w-1 h-1 rounded-full bg-[#FBF3E7]" />
          </div>
        </div>

        {/* Top Nav */}
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={onBack}
            className="w-[34px] h-[34px] rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <h2 className="font-serif-dream font-semibold text-[19px]">Nearby</h2>
          <div className="flex gap-2">
            <div className="w-[34px] h-[34px] rounded-full bg-white/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <div className="w-[34px] h-[34px] rounded-full bg-white/20 flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
          </div>
        </div>

        {/* Headline / Window pill */}
        <div className="flex flex-col items-center mt-3">
          <div className="inline-flex items-center justify-center gap-3 px-4 py-1.5 rounded-full bg-white/15 border border-white/20 backdrop-blur-md text-[#FBF3E7] text-[12px] font-medium shadow-sm mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-semibold">2h window</span>
            </div>
            <div className="w-[1px] h-3 bg-white/25" />
            <span className="text-[#FBF3E7]/90 font-medium">6 spots public</span>
          </div>

          {/* Radar ripple orbit illustration */}
          <div className="relative w-[240px] h-[190px] flex items-center justify-center my-1 select-none">
            {/* Concentric rings */}
            <div className="absolute w-44 h-44 rounded-full bg-white/[0.08] border border-white/20 animate-pulse -translate-x-2 -translate-y-1" />
            <div className="absolute w-48 h-48 rounded-full bg-white/[0.07] border border-white/20 translate-x-2 -translate-y-1" />
            <div className="absolute w-36 h-36 rounded-full border border-white/30 bg-gradient-to-tr from-white/10 to-white/25 backdrop-blur-[2px]" />

            {/* Orbiting dreamer avatars */}
            <div className="absolute top-[15px] left-[65px] z-20 w-7 h-7 rounded-full p-[1.5px] bg-white/40 shadow-sm">
              <img
                className="w-full h-full rounded-full object-cover"
                src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
                alt="Dreamer Josh"
              />
            </div>
            <div className="absolute top-[25px] right-[25px] z-20 w-8 h-8 rounded-full p-[1.5px] bg-white/40 shadow-sm">
              <img
                className="w-full h-full rounded-full object-cover"
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80"
                alt="Dreamer Bhumika"
              />
            </div>
            <div className="absolute top-[75px] left-[10px] z-20 w-8 h-8 rounded-full p-[1.5px] bg-white/40 shadow-sm">
              <img
                className="w-full h-full rounded-full object-cover"
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80"
                alt="Dreamer Amara"
              />
            </div>
            <div className="absolute top-[80px] right-[18px] z-20 w-6 h-6 rounded-full p-[1px] bg-white/50 shadow-sm">
              <img
                className="w-full h-full rounded-full object-cover"
                src="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&q=80"
                alt="Dreamer Tatiana"
              />
            </div>
            <div className="absolute bottom-[20px] right-[40px] z-20 w-6 h-6 rounded-full p-[1px] bg-white/40 shadow-sm">
              <img
                className="w-full h-full rounded-full object-cover"
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80"
                alt="Dreamer Phillip"
              />
            </div>

            {/* Central aperture badge */}
            <div className="relative z-10 w-[96px] h-[96px] rounded-full bg-gradient-to-b from-[#FAF7FF] via-[#EFE8FF] to-[#DFD4FF] shadow-[0_8px_24px_rgba(33,12,68,0.3),inset_0_2px_4px_rgba(255,255,255,0.9)] flex flex-col items-center justify-center">
              <span className="font-serif-dream font-bold text-[#1E1236] text-[32px] leading-none tracking-tight">
                312
              </span>
              <span className="text-[8px] font-extrabold tracking-[0.12em] text-[#6E5F6C] uppercase mt-1">
                DREAMS NEARBY
              </span>
            </div>
          </div>

          {/* Sheet Handle */}
          <div className="w-[38px] h-1 rounded-[3px] bg-white/25 mx-auto mt-2" />
        </div>
      </header>

      {/* Floating Sticker Field Area */}
      <div className="flex-1 relative min-h-[520px]">
        {/* Top Toolbars */}
        <div className="absolute top-4 left-5 z-20">
          <div className="relative">
            <button
              onClick={() => setShowRegionDropdown(!showRegionDropdown)}
              className="bg-[#140E1A]/80 border border-white/10 text-[#FBF3E7] text-[12px] font-bold py-[8px] px-[14px] rounded-full flex items-center gap-2 backdrop-blur-md hover:bg-black/80 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-[#FF6F5C]" />
              <span>{region} ⌄</span>
            </button>

            {showRegionDropdown && (
              <div className="absolute top-11 left-0 w-48 bg-[#241A33] border border-white/20 rounded-2xl p-2 shadow-2xl z-30">
                {regions.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRegion(r);
                      setShowRegionDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      region === r ? 'bg-[#5438FF] text-white font-bold' : 'text-white/80 hover:bg-white/10'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="absolute top-4 right-5 z-20">
          <div className="bg-[#140E1A]/80 border border-white/10 text-[#FBF3E7] text-[12px] font-bold py-[8px] px-[14px] rounded-full flex items-center gap-2 backdrop-blur-md">
            <span>Public only</span>
            <button
              onClick={() => setPublicOnly(!publicOnly)}
              className={`w-[32px] h-[18px] rounded-full relative transition-colors ${
                publicOnly ? 'bg-[#4FCDE0]' : 'bg-white/30'
              }`}
            >
              <div
                className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${
                  publicOnly ? 'right-[2px]' : 'left-[2px]'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Side Actions */}
        <div className="absolute flex flex-col gap-2 z-20 top-[180px] left-[14px]">
          <div className="w-8 h-8 rounded-full bg-[#140E1A]/75 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20">
            <Bookmark className="w-3.5 h-3.5 text-[#FBF3E7]" />
          </div>
          <div className="w-8 h-8 rounded-full bg-[#140E1A]/75 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20">
            <ChevronRight className="w-3.5 h-3.5 text-[#FBF3E7]" />
          </div>
        </div>

        {/* Floating Stickers */}
        {stickers.map((st) => (
          <div
            key={st.id}
            onClick={() => {
              const d = dreams.find((item) => item.id === st.dreamId);
              if (d) onSelectDream(d);
            }}
            style={st.style as any}
            className={`absolute rounded-[18px] p-3 shadow-[0_14px_26px_-10px_rgba(0,0,0,0.6)] w-[110px] cursor-pointer hover:scale-105 transition-transform ${st.bg}`}
          >
            <p className="font-editorial italic text-[11.5px] leading-[1.25]">
              {st.quote}
            </p>
            <span className="text-[8.5px] font-extrabold tracking-[0.07em] uppercase text-[#6E5F6C] block mt-1.5">
              {st.sub}
            </span>
          </div>
        ))}

        {/* Bottom Composer */}
        <div className="absolute left-5 right-5 bottom-[24px] bg-[#140E1A]/85 border border-white/15 rounded-full p-2 pl-4 flex items-center gap-2.5 backdrop-blur-md z-30">
          <span className="text-[#5438FF]">✦</span>
          <input
            value={nearbyQuery}
            onChange={(e) => setNearbyQuery(e.target.value)}
            className="flex-1 bg-transparent border-none text-[#FBF3E7] text-[13px] outline-none placeholder:text-white/40 focus:ring-0 p-0"
            placeholder="Explore nearby dreams..."
            type="text"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nearbyQuery.trim()) {
                const found = dreams.find((d) =>
                  d.title.toLowerCase().includes(nearbyQuery.toLowerCase()) ||
                  d.content.toLowerCase().includes(nearbyQuery.toLowerCase())
                );
                if (found) {
                  onSelectDream(found);
                } else if (dreams[0]) {
                  onSelectDream(dreams[0]);
                }
              }
            }}
          />
          <button
            onClick={() => {
              if (dreams[0]) onSelectDream(dreams[0]);
            }}
            className="w-[34px] h-[34px] rounded-full bg-white/10 flex items-center justify-center shrink-0 hover:bg-white/20"
          >
            <Search className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => {
              if (dreams[1]) onSelectDream(dreams[1]);
            }}
            className="w-[34px] h-[34px] rounded-full bg-[#FF6F5C] flex items-center justify-center shrink-0 hover:brightness-110 active:scale-95 transition-all"
          >
            <ArrowUp className="w-4 h-4 text-white stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
