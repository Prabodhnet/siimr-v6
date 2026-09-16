import React, { useState, useEffect } from 'react';
import { Search, Shuffle, SlidersHorizontal, ArrowRight, User, Users, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { Dream, AuthUser } from '../types';
import { supabaseService } from '../services/supabaseService';
import { getDreamCardStyle } from '../utils/cardColors';

interface SearchViewProps {
  dreams: Dream[];
  currentUser?: AuthUser;
  onSelectDream: (dream: Dream) => void;
  onSelectProfile: (userHandle: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  dreams,
  currentUser,
  onSelectDream,
  onSelectProfile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSameDreamModal, setShowSameDreamModal] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'dreamers' | 'dreams'>('all');

  // Real Supabase User Search state
  const [searchedDreamers, setSearchedDreamers] = useState<AuthUser[]>([]);
  const [isLoadingDreamers, setIsLoadingDreamers] = useState(false);
  const [dreamerSearchError, setDreamerSearchError] = useState<string | null>(null);

  // Debounced search for real SIIMR users on Supabase
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchedDreamers([]);
      setIsLoadingDreamers(false);
      setDreamerSearchError(null);
      return;
    }

    setIsLoadingDreamers(true);
    setDreamerSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const { users, error } = await supabaseService.searchUsers(
          query,
          currentUser?.id,
          25
        );
        if (error) {
          setDreamerSearchError(error);
        } else {
          setSearchedDreamers(users);
        }
      } catch (err: any) {
        setDreamerSearchError(err.message || 'Failed to search dreamers');
      } finally {
        setIsLoadingDreamers(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUser?.id]);

  const handleRetrySearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setIsLoadingDreamers(true);
    setDreamerSearchError(null);
    try {
      const { users, error } = await supabaseService.searchUsers(
        query,
        currentUser?.id,
        25
      );
      if (error) {
        setDreamerSearchError(error);
      } else {
        setSearchedDreamers(users);
      }
    } catch (err: any) {
      setDreamerSearchError(err.message || 'Failed to search dreamers');
    } finally {
      setIsLoadingDreamers(false);
    }
  };

  const topics = [
    { label: 'Water', icon: 'water_drop', color: 'bg-white text-[#1A1C23]', iconColor: 'text-amber-600', rot: -1.5 },
    { label: 'Falling', icon: 'south_east', color: 'bg-[#FFF1EC] text-[#9C3826]', rot: 2 },
    { label: 'Nightmares', icon: 'bolt', color: 'bg-[#5438FF] text-white shadow-md', rot: -1, isAccent: true },
    { label: 'Classrooms', icon: 'school', color: 'bg-[#FFF5E0] text-[#8C6010]', rot: 1.8 },
    { label: 'About Flying', icon: 'flight', color: 'bg-[#EAF4EC] text-[#246337]', rot: -2.5 },
    { label: 'Losing Teeth', icon: 'sentiment_neutral', color: 'bg-[#EBF3FE] text-[#1C59A4]', rot: 1 },
    { label: 'Chased', icon: 'directions_run', color: 'bg-[#EEEAFE] text-[#452EE0]', rot: -1.2 },
  ];

  // Filtering dreams
  const filteredDreams = dreams.filter((dream) => {
    if (selectedCategory && dream.category !== selectedCategory) return false;
    if (selectedTopic) {
      const matchTopic =
        dream.tags.some((t) => t.toLowerCase().includes(selectedTopic.toLowerCase())) ||
        dream.title.toLowerCase().includes(selectedTopic.toLowerCase()) ||
        dream.content.toLowerCase().includes(selectedTopic.toLowerCase());
      if (!matchTopic) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (dream.title || '').toLowerCase().includes(q) ||
        (dream.hook || '').toLowerCase().includes(q) ||
        (dream.content || '').toLowerCase().includes(q) ||
        (dream.author?.name || '').toLowerCase().includes(q) ||
        (dream.author?.handle || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleTopicClick = (topicLabel: string) => {
    if (selectedTopic === topicLabel) {
      setSelectedTopic(null);
    } else {
      setSelectedTopic(topicLabel);
    }
  };

  const handleCategoryClick = (cat: 'Surreal' | 'Recurring' | 'Lucid' | 'Nightmares') => {
    if (selectedCategory === cat) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(cat);
    }
  };

  return (
    <div className="w-full pb-32">
      {/* Header */}
      <header className="px-6 pt-5 pb-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] tracking-[0.2em] uppercase text-[#5438FF] font-extrabold">
            Explore
          </span>
          <span className="text-[12px] font-semibold text-[#1A1C23]/60">SIIMR Search</span>
        </div>
        <h1 className="font-serif-dream text-[36px] leading-[1.08] tracking-[-0.03em] font-medium text-[#1A1C23] mt-2">
          Find Dreamers <br />
          <span className="font-editorial italic font-normal text-[#5438FF]">& Archives</span>
        </h1>
        <p className="text-[#1A1C23]/70 text-[14px] mt-1 font-normal">
          Search real registered dreamers by name or @handle, or explore themes.
        </p>

        {/* Search Input Bar */}
        <div className="mt-4 relative flex items-center bg-white rounded-2xl border border-[#E8E2D8] shadow-sm px-4 py-3 focus-within:border-[#5438FF] focus-within:ring-2 focus-within:ring-[#5438FF]/20 transition-all">
          <Search className="text-[#5438FF] mr-3 w-5 h-5 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-[#1A1C23] text-[15px] w-full placeholder:text-[#1A1C23]/40 focus:outline-none focus:ring-0 p-0 font-medium"
            placeholder="Search dreamers (@handle, name) or topics..."
            type="text"
            autoComplete="off"
            autoCapitalize="none"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-[#1A1C23]/50 hover:text-[#1A1C23] font-bold px-1.5 py-0.5 rounded-md hover:bg-black/5 transition"
            >
              Clear
            </button>
          ) : (
            <SlidersHorizontal className="text-[#1A1C23]/40 w-4 h-4 shrink-0" />
          )}
        </div>

        {/* Search Mode Filter Tabs (All / Dreamers / Dreams) */}
        {searchQuery && (
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => setActiveFilterTab('all')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                activeFilterTab === 'all'
                  ? 'bg-[#1A1C23] text-white shadow-xs'
                  : 'bg-white text-[#1A1C23]/70 border border-zinc-200 hover:bg-stone-50'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveFilterTab('dreamers')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition ${
                activeFilterTab === 'dreamers'
                  ? 'bg-[#5438FF] text-white shadow-xs'
                  : 'bg-white text-[#1A1C23]/70 border border-zinc-200 hover:bg-stone-50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Dreamers ({searchedDreamers.length})</span>
            </button>
            <button
              onClick={() => setActiveFilterTab('dreams')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                activeFilterTab === 'dreams'
                  ? 'bg-[#1A1C23] text-white shadow-xs'
                  : 'bg-white text-[#1A1C23]/70 border border-zinc-200 hover:bg-stone-50'
              }`}
            >
              Dreams ({filteredDreams.length})
            </button>
          </div>
        )}
      </header>

      {/* Real SIIMR Dreamers Search Section */}
      {searchQuery && activeFilterTab !== 'dreams' && (
        <section className="px-6 mt-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#5438FF]" />
              <h2 className="text-[11px] font-extrabold tracking-[0.14em] text-[#1A1C23]/70 uppercase">
                Registered Dreamers
              </h2>
            </div>
            {searchedDreamers.length > 0 && (
              <span className="text-[11px] font-semibold text-[#5438FF]">
                {searchedDreamers.length} {searchedDreamers.length === 1 ? 'result' : 'results'}
              </span>
            )}
          </div>

          {/* Loading State */}
          {isLoadingDreamers && (
            <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-[#5438FF] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold text-[#1A1C23]/70">
                Searching dreamers across SIIMR...
              </span>
            </div>
          )}

          {/* Error State */}
          {!isLoadingDreamers && dreamerSearchError && (
            <div className="bg-[#FFF5F5] rounded-2xl p-4 border border-rose-200 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{dreamerSearchError}</span>
              </div>
              <button
                onClick={handleRetrySearch}
                className="flex items-center gap-1 px-2.5 py-1 bg-white text-rose-700 border border-rose-300 rounded-lg text-xs font-bold hover:bg-rose-50 transition"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingDreamers && !dreamerSearchError && searchedDreamers.length === 0 && (
            <div className="bg-white rounded-2xl p-5 border border-dashed border-[#1A1C23]/15 text-center">
              <p className="font-editorial italic text-sm text-[#1A1C23]/80">
                No dreamers found matching "{searchQuery}".
              </p>
              <p className="text-[11px] text-[#1A1C23]/50 mt-1">
                Check the handle spelling or try searching by display name.
              </p>
            </div>
          )}

          {/* Dreamers Results List */}
          {!isLoadingDreamers && searchedDreamers.length > 0 && (
            <div className="space-y-2">
              {searchedDreamers.map((person) => (
                <div
                  key={person.id}
                  onClick={() => onSelectProfile(person.handle || person.id)}
                  className="bg-white rounded-2xl p-3.5 flex items-center justify-between shadow-xs border border-zinc-200/70 cursor-pointer hover:border-[#5438FF]/40 hover:bg-stone-50/80 transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <img
                      src={person.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                      alt={person.name}
                      className="w-11 h-11 rounded-full object-cover shrink-0 ring-1 ring-black/5"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-[14px] text-[#1A1C23] truncate group-hover:text-[#5438FF] transition-colors">
                          {person.name}
                        </h4>
                      </div>
                      <p className="text-[12px] font-semibold text-[#5438FF] truncate">
                        {person.handle}
                      </p>
                      {person.bio && (
                        <p className="text-[11px] text-[#1A1C23]/60 truncate mt-0.5 font-editorial italic">
                          "{person.bio}"
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProfile(person.handle || person.id);
                    }}
                    className="px-3.5 py-1.5 bg-[#1A1C23] group-hover:bg-[#5438FF] text-white rounded-full text-xs font-bold shrink-0 transition-colors shadow-2xs"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Floating Tag Cloud (Shown when not in dreamers-only search mode) */}
      {(!searchQuery || activeFilterTab !== 'dreamers') && (
        <section className="px-5 py-4">
          <div className="flex flex-wrap gap-2.5 justify-center items-center">
            {topics.map((item) => {
              const isSelected = selectedTopic === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => handleTopicClick(item.label)}
                  style={{ transform: `rotate(${item.rot}deg)` }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full font-semibold text-[13px] tracking-tight transition-all active:scale-95 cursor-pointer shadow-sm ${
                    isSelected
                      ? 'bg-[#1A1C23] text-[#F9F6F0] ring-2 ring-[#5438FF]'
                      : item.color
                  }`}
                >
                  <span className={`material-symbols-outlined text-[17px] ${item.iconColor || ''}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Categories Grid (Shown when no search query and no topic filter) */}
      {!searchQuery && !selectedTopic && (
        <section className="px-6 mt-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-bold tracking-[0.14em] text-[#1A1C23]/60 uppercase">
              Or pick a category
            </h2>
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory(null)}
                className="text-[11px] text-[#5438FF] font-bold uppercase"
              >
                Reset
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            {/* Surreal */}
            <div
              onClick={() => handleCategoryClick('Surreal')}
              className={`relative rounded-2xl p-4 min-h-[96px] bg-[#FFF8F6] border border-[#F5DDD7] shadow-sm flex flex-col justify-between hover:scale-[1.02] transition-transform cursor-pointer group ${
                selectedCategory === 'Surreal' ? 'ring-2 ring-[#5438FF]' : ''
              }`}
            >
              <div className="corner-pin pin-tl" />
              <div className="corner-pin pin-br" />
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-full bg-[#FFE5DF] flex items-center justify-center text-[#B03A2E]">
                  <span className="material-symbols-outlined text-[18px]">cyclone</span>
                </div>
                <span className="text-[10px] font-mono text-[#B03A2E]/70">01</span>
              </div>
              <div className="mt-2">
                <h3 className="font-serif-dream font-semibold text-[18px] text-[#1A1C23]">Surreal</h3>
                <p className="text-[11px] text-[#1A1C23]/60 mt-0.5">Impossible places</p>
              </div>
            </div>

            {/* Recurring */}
            <div
              onClick={() => handleCategoryClick('Recurring')}
              className={`relative rounded-2xl p-4 min-h-[96px] bg-[#F3F7FE] border border-[#D5E4FD] shadow-sm flex flex-col justify-between hover:scale-[1.02] transition-transform cursor-pointer group ${
                selectedCategory === 'Recurring' ? 'ring-2 ring-[#5438FF]' : ''
              }`}
            >
              <div className="corner-pin pin-tr" />
              <div className="corner-pin pin-bl" />
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-full bg-[#E0EDFE] flex items-center justify-center text-[#1E56A0]">
                  <span className="material-symbols-outlined text-[18px]">repeat</span>
                </div>
                <span className="text-[10px] font-mono text-[#1E56A0]/70">02</span>
              </div>
              <div className="mt-2">
                <h3 className="font-serif-dream font-semibold text-[18px] text-[#1A1C23]">Recurring</h3>
                <p className="text-[11px] text-[#1A1C23]/60 mt-0.5">Familiar symbols</p>
              </div>
            </div>

            {/* Lucid */}
            <div
              onClick={() => handleCategoryClick('Lucid')}
              className={`relative rounded-2xl p-4 min-h-[96px] bg-[#F7F4FE] border border-[#E3D9FC] shadow-sm flex flex-col justify-between hover:scale-[1.02] transition-transform cursor-pointer group ${
                selectedCategory === 'Lucid' ? 'ring-2 ring-[#5438FF]' : ''
              }`}
            >
              <div className="corner-pin pin-tl" />
              <div className="corner-pin pin-br" />
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-full bg-[#EEEAFE] flex items-center justify-center text-[#5438FF]">
                  <span className="material-symbols-outlined text-[18px]">visibility</span>
                </div>
                <span className="text-[10px] font-mono text-[#5438FF]/70">03</span>
              </div>
              <div className="mt-2">
                <h3 className="font-serif-dream font-semibold text-[18px] text-[#1A1C23]">Lucid</h3>
                <p className="text-[11px] text-[#1A1C23]/60 mt-0.5">Awareness & control</p>
              </div>
            </div>

            {/* Nightmares */}
            <div
              onClick={() => handleCategoryClick('Nightmares')}
              className={`relative rounded-2xl p-4 min-h-[96px] bg-[#F2F8F4] border border-[#D5EADA] shadow-sm flex flex-col justify-between hover:scale-[1.02] transition-transform cursor-pointer group ${
                selectedCategory === 'Nightmares' ? 'ring-2 ring-[#5438FF]' : ''
              }`}
            >
              <div className="corner-pin pin-tr" />
              <div className="corner-pin pin-bl" />
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-full bg-[#DCF0E2] flex items-center justify-center text-[#2A7545]">
                  <span className="material-symbols-outlined text-[18px]">bedtime</span>
                </div>
                <span className="text-[10px] font-mono text-[#2A7545]/70">04</span>
              </div>
              <div className="mt-2">
                <h3 className="font-serif-dream font-semibold text-[18px] text-[#1A1C23]">Nightmares</h3>
                <p className="text-[11px] text-[#1A1C23]/60 mt-0.5">Fear & intensity</p>
              </div>
            </div>
          </div>

          {/* Main Discovery CTA: Same dream as you */}
          <button
            onClick={() => setShowSameDreamModal(true)}
            className="w-full mt-5 py-4 rounded-2xl bg-[#1A1C23] text-[#F9F6F0] font-semibold text-[16px] flex items-center justify-center gap-2.5 shadow-lg hover:bg-black active:scale-[0.98] transition-all cursor-pointer"
          >
            <Shuffle className="w-5 h-5 text-[#8B7BFF]" />
            <span className="tracking-tight">Same dream as you</span>
          </button>
        </section>
      )}

      {/* Filtered Dreams Results (Shown when not restricted to Dreamers tab) */}
      {(searchQuery || selectedTopic || selectedCategory) && activeFilterTab !== 'dreamers' && (
        <section className="px-6 mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-bold tracking-[0.1em] text-[#1A1C23]/70 uppercase">
              {filteredDreams.length} {filteredDreams.length === 1 ? 'Dream' : 'Dreams'} Found
            </h3>
            {(selectedTopic || selectedCategory) && (
              <button
                onClick={() => {
                  setSelectedTopic(null);
                  setSelectedCategory(null);
                }}
                className="text-xs text-[#5438FF] font-bold"
              >
                Clear Filters
              </button>
            )}
          </div>

          {filteredDreams.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-[#1A1C23]/20">
              <p className="font-editorial italic text-base text-[#1A1C23]/70">
                No matching dreams found in the Dream World yet.
              </p>
              <p className="text-xs text-[#1A1C23]/50 mt-1">
                Try searching for motifs like "water", "stairs", or "elevator".
              </p>
            </div>
          ) : (
            filteredDreams.map((dream) => {
              const dTheme = getDreamCardStyle(dream);
              return (
                <article
                  key={dream.id}
                  onClick={() => onSelectDream(dream)}
                  style={{
                    backgroundColor: dTheme.cardColor,
                    borderBottomColor: dTheme.cardBorderColor,
                    color: dTheme.textColor,
                  }}
                  className="rounded-2xl p-4 shadow-sm border-b-4 cursor-pointer hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-[10px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: dTheme.badgeBg, color: dTheme.textColor }}
                    >
                      {dream.category}
                    </span>
                    <span className="text-[11px] opacity-75">{dream.timeAgo}</span>
                  </div>
                  <h4
                    className="font-serif-dream font-semibold text-[17px] leading-tight mb-1"
                    style={{ color: dTheme.textColor }}
                  >
                    {dream.title}
                  </h4>
                  <p
                    className="font-editorial italic text-[13.5px] line-clamp-2 opacity-90"
                    style={{ color: dTheme.textColor }}
                  >
                    {dream.hook}
                  </p>
                  <div
                    className="mt-2.5 pt-2 border-t border-dashed flex items-center justify-between text-xs"
                    style={{ borderColor: dTheme.dashedBorder, color: dTheme.textColor }}
                  >
                    <span className="font-semibold">{dream.author.name}</span>
                    <div className="flex items-center gap-1 font-bold">
                      <span>Read dream</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      )}

      {/* "Same dream as you" Discovery Modal / Sheet */}
      {showSameDreamModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#F9F6F0] w-full max-w-md rounded-3xl p-6 shadow-2xl border border-white/20 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#5438FF]/10 text-[#5438FF] text-[11px] font-bold uppercase tracking-wider">
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Same dream as you</span>
                </span>
                <h3 className="font-serif-dream text-[22px] font-bold text-[#1A1C23] mt-2">
                  Uncanny Similarities
                </h3>
                <p className="text-xs text-[#1A1C23]/70 mt-0.5">
                  Dreams from other people that share your motifs from last night.
                </p>
              </div>
              <button
                onClick={() => setShowSameDreamModal(false)}
                className="text-[#1A1C23]/50 hover:text-[#1A1C23] font-bold text-xl p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 my-4">
              <div
                onClick={() => {
                  setShowSameDreamModal(false);
                  const d = dreams.find((item) => item.id === 'dream-2');
                  if (d) onSelectDream(d);
                }}
                className="bg-white p-3.5 rounded-2xl border border-[#5438FF]/20 shadow-sm cursor-pointer hover:bg-[#EEEAFE] transition-colors"
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-[#5438FF]">
                  <span>94% MOTIF MATCH · WATER PORTALS</span>
                  <span>Amara & Bhumika</span>
                </div>
                <h4 className="font-serif-dream font-semibold text-[15px] mt-1 text-[#1A1C23]">
                  A door made of water
                </h4>
                <p className="font-editorial italic text-xs text-[#1A1C23]/80 mt-0.5">
                  "Some doors only appear in dreams. It was standing at the edge of the hallway..."
                </p>
              </div>

              <div
                onClick={() => {
                  setShowSameDreamModal(false);
                  const d = dreams.find((item) => item.id === 'dream-3');
                  if (d) onSelectDream(d);
                }}
                className="bg-white p-3.5 rounded-2xl border border-[#1A1C23]/10 shadow-sm cursor-pointer hover:bg-stone-50 transition-colors"
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-[#1A1C23]/60">
                  <span>88% MOTIF MATCH · IMPOSSIBLE TRANSIT</span>
                  <span>Josh</span>
                </div>
                <h4 className="font-serif-dream font-semibold text-[15px] mt-1 text-[#1A1C23]">
                  The sky had stairs
                </h4>
                <p className="font-editorial italic text-xs text-[#1A1C23]/80 mt-0.5">
                  "The stairs went straight up toward a pale blue ceiling..."
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowSameDreamModal(false)}
              className="w-full py-3 bg-[#1A1C23] text-white rounded-xl text-sm font-semibold hover:bg-black transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
