import React from 'react';
import { Home, Search, Plus, MessageSquare, User } from 'lucide-react';

interface NavigationProps {
  activeTab: 'home' | 'search' | 'nearby' | 'clips' | 'messages' | 'me';
  onTabChange: (tab: 'home' | 'search' | 'nearby' | 'clips' | 'messages' | 'me') => void;
  onOpenCapture: () => void;
  unreadCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  onOpenCapture,
  unreadCount = 1,
}) => {
  return (
    <nav
      aria-label="Bottom Navigation Dock"
      className="fixed bottom-4 inset-x-0 max-w-[390px] mx-auto px-5 z-40 pointer-events-auto"
    >
      <div
        className="h-[68px] bg-[#1A1C23] rounded-[34px] flex items-center justify-between px-3.5 shadow-[0_16px_36px_-6px_rgba(26,28,35,0.65)] border border-white/10"
      >
        {/* Home */}
        <button
          onClick={() => onTabChange('home')}
          aria-label="Home Feed"
          className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
            activeTab === 'home' ? 'text-[#F9F6F0]' : 'text-white/40 hover:text-white/80'
          }`}
        >
          <Home className="w-5 h-5 stroke-[2.2]" />
        </button>

        {/* Search & Explore */}
        <button
          onClick={() => onTabChange('search')}
          aria-label="Search and Explore"
          className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
            activeTab === 'search' ? 'text-[#F9F6F0]' : 'text-white/40 hover:text-white/80'
          }`}
        >
          <Search className="w-5 h-5 stroke-[2.2]" />
        </button>

        {/* Center Raised + Dream FAB */}
        <button
          onClick={onOpenCapture}
          aria-label="Speak or Capture Dream"
          className="w-[52px] h-[52px] rounded-full bg-[#5438FF] flex items-center justify-center text-[#F9F6F0] shadow-[0_10px_24px_-4px_rgba(84,56,255,0.85)] -mt-3.5 ring-4 ring-[#1A1C23] active:scale-95 transition-transform hover:brightness-110"
        >
          <Plus className="w-6 h-6 stroke-[2.8]" />
        </button>

        {/* Messages / Dream Circles */}
        <button
          onClick={() => onTabChange('messages')}
          aria-label="Messages and Dream Circles"
          className={`relative w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
            activeTab === 'messages' ? 'text-[#F9F6F0]' : 'text-white/40 hover:text-white/80'
          }`}
        >
          <MessageSquare className="w-5 h-5 stroke-[2.2]" />
          {unreadCount > 0 && (
            <span className="absolute top-2.5 right-2 w-2 h-2 rounded-full bg-[#5438FF] ring-2 ring-[#1A1C23]" />
          )}
        </button>

        {/* Me / Profile */}
        <button
          onClick={() => onTabChange('me')}
          aria-label="My Profile and Archive"
          className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
            activeTab === 'me' ? 'text-[#F9F6F0]' : 'text-white/40 hover:text-white/80'
          }`}
        >
          <User className="w-5 h-5 stroke-[2.2]" />
        </button>
      </div>
    </nav>
  );
};
