import React, { useState, useEffect } from 'react';
import {
  MoreHorizontal,
  Grid,
  Video,
  Heart,
  Bookmark,
  Share2,
  MessageSquare,
  UserPlus,
  Search,
  Settings,
  LogIn,
  UserCheck,
  Sparkles,
  ChevronLeft,
  ShieldAlert,
  UserX,
  Lock,
  Check,
  Edit3,
  Camera,
} from 'lucide-react';
import { Dream, AuthUser } from '../types';
import { supabaseService } from '../services/supabaseService';
import { GUEST_USER } from '../services/authService';
import { EditProfileModal } from './EditProfileModal';
import { getDreamCardStyle } from '../utils/cardColors';

interface ProfileViewProps {
  dreams: Dream[];
  currentUser?: AuthUser;
  viewingUserIdOrHandle?: string | null;
  onBack?: () => void;
  onSelectDream: (dream: Dream) => void;
  onOpenSettings: () => void;
  onOpenDirectMessage: (target: { id: string; name: string; avatar: string; handle: string }) => void;
  onOpenLogin: () => void;
  onProfileUpdated?: (updatedUser: AuthUser) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  dreams,
  currentUser,
  viewingUserIdOrHandle,
  onBack,
  onSelectDream,
  onOpenSettings,
  onOpenDirectMessage,
  onOpenLogin,
  onProfileUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'grid' | 'video' | 'likes' | 'saved'>('grid');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [followCounts, setFollowCounts] = useState<{ followers: number; following: number }>({
    followers: 0,
    following: 0,
  });

  // Safe number formatter ensuring no NaN is rendered to JSX children
  const formatStatCount = (val: unknown): string => {
    if (val === null || val === undefined) return '0';
    const num = typeof val === 'number' ? val : Number(val);
    if (isNaN(num) || !isFinite(num) || num <= 0) return '0';
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return String(Math.round(num));
  };

  // State for loading an external profile
  const [fetchedUser, setFetchedUser] = useState<AuthUser | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(false);
  const [profileNotFound, setProfileNotFound] = useState<boolean>(false);
  const [isUserBlocked, setIsUserBlocked] = useState<boolean>(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState<boolean>(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // Determine if viewing an external user
  const isExternalView = Boolean(
    viewingUserIdOrHandle &&
    viewingUserIdOrHandle !== currentUser?.id &&
    viewingUserIdOrHandle !== currentUser?.handle
  );

  // Load external profile when viewingUserIdOrHandle changes
  useEffect(() => {
    let isCancelled = false;

    if (!isExternalView || !viewingUserIdOrHandle) {
      setFetchedUser(null);
      setIsLoadingProfile(false);
      setProfileNotFound(false);
      setIsUserBlocked(false);
      return;
    }

    const loadProfile = async () => {
      setIsLoadingProfile(true);
      setProfileNotFound(false);
      setIsUserBlocked(false);

      try {
        // Check if this user is in the current user's blocked list
        if (currentUser?.id) {
          const blockedIds = await supabaseService.getBlockedUserIds(currentUser.id);
          if (blockedIds.has(viewingUserIdOrHandle)) {
            if (!isCancelled) {
              setIsUserBlocked(true);
              setIsLoadingProfile(false);
              return;
            }
          }
        }

        let userProfile: AuthUser | null = null;
        if (viewingUserIdOrHandle.startsWith('@')) {
          userProfile = await supabaseService.fetchUserProfileByHandle(viewingUserIdOrHandle);
        } else {
          userProfile = await supabaseService.fetchUserProfile(viewingUserIdOrHandle);
          if (!userProfile) {
            userProfile = await supabaseService.fetchUserProfileByHandle(viewingUserIdOrHandle);
          }
        }

        if (isCancelled) return;

        if (!userProfile) {
          setProfileNotFound(true);
          setIsLoadingProfile(false);
          return;
        }

        if (currentUser?.id) {
          const blockedIds = await supabaseService.getBlockedUserIds(currentUser.id);
          if (blockedIds.has(userProfile.id)) {
            setIsUserBlocked(true);
            setIsLoadingProfile(false);
            return;
          }
        }

        setFetchedUser(userProfile);
        setFollowCounts({
          followers: Number(userProfile.followersCount) || 0,
          following: Number(userProfile.followingCount) || 0,
        });

        // Fetch real follow status and counts from Supabase
        if (currentUser?.id && userProfile.id) {
          const [followingStatus, counts] = await Promise.all([
            supabaseService.checkIsFollowing(currentUser.id, userProfile.id),
            supabaseService.getFollowCounts(userProfile.id),
          ]);
          if (!isCancelled) {
            setIsFollowing(followingStatus);
            setFollowCounts({
              followers: Number(counts?.followersCount) || 0,
              following: Number(counts?.followingCount) || 0,
            });
          }
        }
      } catch (err) {
        console.warn('Error loading real profile:', err);
        if (!isCancelled) {
          setProfileNotFound(true);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingProfile(false);
        }
      }
    };

    loadProfile();

    return () => {
      isCancelled = true;
    };
  }, [viewingUserIdOrHandle, currentUser?.id, isExternalView]);

  const user: AuthUser = isExternalView ? (fetchedUser || GUEST_USER) : (currentUser || GUEST_USER);

  // Follow / Unfollow handler
  const handleToggleFollow = async () => {
    if (!currentUser || currentUser.isGuest) {
      onOpenLogin();
      return;
    }
    if (!user.id) return;

    const nextState = !isFollowing;
    setIsFollowing(nextState);
    setFollowCounts((prev) => {
      const currentFollowers = Number(prev.followers) || 0;
      return {
        ...prev,
        followers: nextState ? currentFollowers + 1 : Math.max(0, currentFollowers - 1),
      };
    });

    try {
      if (nextState) {
        await supabaseService.followUser(currentUser.id, user.id);
      } else {
        await supabaseService.unfollowUser(currentUser.id, user.id);
      }
    } catch (err) {
      console.warn('Follow toggle error:', err);
      // Revert on failure
      setIsFollowing(!nextState);
      setFollowCounts((prev) => {
        const currentFollowers = Number(prev.followers) || 0;
        return {
          ...prev,
          followers: nextState ? Math.max(0, currentFollowers - 1) : currentFollowers + 1,
        };
      });
    }
  };

  // Block / Unblock handler
  const handleToggleBlock = async () => {
    if (!currentUser?.id || !user?.id) return;
    try {
      if (isUserBlocked) {
        await supabaseService.unblockUser(currentUser.id, user.id);
        setIsUserBlocked(false);
        setShowOptionsMenu(false);
      } else {
        await supabaseService.blockUser(currentUser.id, user.id);
        setIsUserBlocked(true);
        setShowOptionsMenu(false);
      }
    } catch (err) {
      console.warn('Block toggle error:', err);
    }
  };

  // Share profile handler
  const handleShareProfile = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: `${user.name} (@${user.handle}) on SIIMR`,
        text: `Explore ${user.name}'s dream world and nocturnal reflections on SIIMR.`,
        url,
      }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopyToast('Profile link copied to clipboard');
      setTimeout(() => setCopyToast(null), 2500);
    }
  };

  // Direct Message handler
  const handleMessageUser = () => {
    onOpenDirectMessage({
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      handle: user.handle,
    });
  };

  // Filter public dreams matching this user
  const userDreams = dreams.filter((d) => {
    if (isExternalView) {
      if (d.audience === 'only_me') return false;
      return (
        d.author.id === user.id ||
        (user.handle && d.author.handle?.toLowerCase() === user.handle.toLowerCase()) ||
        d.author.name?.toLowerCase() === user.name?.toLowerCase()
      );
    }
    if (user.id === 'u-me') {
      return d.author.id === 'u-me' || d.author.name === 'Isha';
    }
    return (
      d.author.id === user.id ||
      d.author.handle.toLowerCase() === user.handle.toLowerCase() ||
      d.author.name.toLowerCase() === user.name.toLowerCase()
    );
  });

  const savedDreams = dreams.filter((d) => d.isSaved);
  const likedDreams = dreams.filter((d) => d.isLiked);
  const clipDreams = userDreams.filter((d) => d.hasClip || d.surfaces?.hasClip);

  const displayedDreams = (() => {
    let list = userDreams;
    if (activeTab === 'saved') list = isExternalView ? [] : savedDreams;
    if (activeTab === 'likes') list = isExternalView ? [] : likedDreams;
    if (activeTab === 'video') list = clipDreams;

    if (!archiveSearch.trim()) return list;
    const q = archiveSearch.toLowerCase();
    return list.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.hook.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q)
    );
  })();

  // 1. Loading Profile View State
  if (isLoadingProfile) {
    return (
      <div className="w-full min-h-screen bg-[#F9F6F0] p-6 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-3 border-[#5438FF] border-t-transparent rounded-full animate-spin" />
        <p className="font-serif-dream text-base text-[#1A1C23]">
          Summoning dreamer archive...
        </p>
      </div>
    );
  }

  // 2. Profile Not Found State
  if (profileNotFound) {
    return (
      <div className="w-full min-h-screen bg-[#F9F6F0] p-6 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3">
          <UserX className="w-7 h-7" />
        </div>
        <h2 className="font-serif-dream text-2xl font-bold text-[#1A1C23]">
          Dreamer Not Found
        </h2>
        <p className="text-xs text-[#1A1C23]/60 max-w-xs mt-1">
          This dreamer profile does not exist or may have returned to waking life.
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-5 px-5 py-2.5 bg-[#1A1C23] text-white rounded-full text-xs font-bold hover:bg-black transition"
          >
            Back to Search
          </button>
        )}
      </div>
    );
  }

  // 3. User Blocked State
  if (isUserBlocked) {
    return (
      <div className="w-full min-h-screen bg-[#F9F6F0] p-6 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-full bg-zinc-100 border border-zinc-300 flex items-center justify-center text-zinc-700 mb-3">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="font-serif-dream text-2xl font-bold text-[#1A1C23]">
          Dreamer Blocked
        </h2>
        <p className="text-xs text-[#1A1C23]/60 max-w-xs mt-1">
          You have blocked @{user.handle || viewingUserIdOrHandle}. Their dreams, profile, and messages are shielded from your dreamscape.
        </p>
        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleToggleBlock}
            className="px-5 py-2.5 bg-[#5438FF] text-white rounded-full text-xs font-bold hover:bg-[#452ee0] transition"
          >
            Unblock Dreamer
          </button>
          {onBack && (
            <button
              onClick={onBack}
              className="px-5 py-2.5 bg-white border border-zinc-300 text-[#1A1C23] rounded-full text-xs font-bold hover:bg-stone-50 transition"
            >
              Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-32 select-none bg-[#F9F6F0] relative">
      {/* Toast notification */}
      {copyToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[#1A1C23] text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{copyToast}</span>
        </div>
      )}

      {/* Top Navigation */}
      <div className="px-5 pt-3.5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          {isExternalView && onBack ? (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-full bg-white shadow-xs border border-zinc-200 flex items-center justify-center text-[#1A1C23] hover:bg-zinc-50"
              title="Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <span className="text-xs font-extrabold uppercase tracking-widest text-[#5438FF]">
              Dream Archive
            </span>
          )}
          {!isExternalView && user.isGuest && (
            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-full">
              Guest
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 relative">
          {!isExternalView && (
            <button
              onClick={onOpenLogin}
              title="Switch Account or Login"
              className="h-8 px-2.5 rounded-full bg-white shadow-xs border border-zinc-200/70 flex items-center gap-1.5 text-xs font-bold text-[#5438FF] hover:bg-zinc-50 transition"
            >
              {user.isGuest ? (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Account</span>
                </>
              )}
            </button>
          )}

          {!isExternalView ? (
            <button
              onClick={onOpenSettings}
              className="w-9 h-9 rounded-full bg-white shadow-xs border border-zinc-200/50 flex items-center justify-center text-[#1A1C23] hover:bg-zinc-50"
            >
              <Settings className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="w-9 h-9 rounded-full bg-white shadow-xs border border-zinc-200/50 flex items-center justify-center text-[#1A1C23] hover:bg-zinc-50"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          )}

          {/* Options Dropdown Menu for external user */}
          {showOptionsMenu && isExternalView && (
            <div className="absolute right-0 top-11 z-50 bg-white rounded-2xl shadow-xl border border-zinc-200 p-1.5 w-44 animate-in fade-in zoom-in-95">
              <button
                onClick={handleShareProfile}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-[#1A1C23] hover:bg-stone-50 rounded-xl flex items-center gap-2"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Profile</span>
              </button>
              <button
                onClick={handleToggleBlock}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-2"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Block Dreamer</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Profile Header Section with Lavender Banner or Custom Banner */}
      <section className="px-4 pt-2">
        <div className="relative">
          {/* Lavender/Violet Banner Card */}
          <div
            className="h-36 rounded-[28px] relative overflow-hidden px-6 pt-5 shadow-sm group transition-all"
            style={{
              backgroundImage: user.bannerUrl ? `url(${user.bannerUrl})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              background: !user.bannerUrl
                ? 'linear-gradient(135deg, #C2B8FF 0%, #DCD6FE 45%, #B4A4FF 100%)'
                : undefined,
            }}
          >
            {user.bannerUrl ? (
              <div className="absolute inset-0 bg-black/25 backdrop-blur-[0.5px]" />
            ) : (
              <>
                {/* Decorative shapes */}
                <div className="absolute right-4 -top-2 w-28 h-28 rounded-full bg-[#5438FF]/20 filter blur-xs" />
                <div className="absolute right-7 top-1 w-20 h-20 rounded-full bg-[#5438FF]/30" />
                <div className="absolute bottom-2 right-12 w-24 h-6 bg-white/70 rounded-full blur-[1px]" />
                <div className="absolute top-4 right-28 w-1.5 h-1.5 rounded-full bg-white/80" />
                <div className="absolute bottom-9 right-8 w-1 h-1 rounded-full bg-white/90" />
              </>
            )}

            {/* Quick Edit Banner button on own profile */}
            {!isExternalView && (
              <button
                id="banner-edit-overlay-btn"
                onClick={() => setIsEditProfileOpen(true)}
                className="absolute top-3 left-4 z-20 px-3 py-1.5 rounded-full bg-white/90 hover:bg-white text-[#1A1C23] text-xs font-semibold shadow-md flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-all active:scale-95"
                title="Edit Banner"
              >
                <Camera className="w-3.5 h-3.5 text-[#5438FF]" />
                <span className="hidden sm:inline">Edit Banner</span>
              </button>
            )}

            {/* Serif Quote on Banner */}
            <div className="relative z-10 max-w-[220px] ml-auto text-right pr-1">
              <h2
                className={`font-serif-dream italic font-bold text-[17px] leading-[1.22] tracking-tight ${
                  user.bannerUrl ? 'text-white drop-shadow-sm' : 'text-[#1A1C23]'
                }`}
              >
                {user.bannerQuote || 'How to go for a little walk and never return'}
              </h2>
              <svg
                className={`w-20 ml-auto mt-1 fill-none ${
                  user.bannerUrl ? 'stroke-white/90' : 'stroke-[#5438FF] opacity-80'
                }`}
                height="6"
                viewBox="0 0 80 6"
              >
                <path d="M2 3.5 C 20 1, 50 6, 78 2" strokeLinecap="round" strokeWidth="2" />
              </svg>
            </div>
          </div>

          {/* Avatar with violet dot */}
          <div className="absolute -bottom-10 left-5">
            <div
              className={`relative w-[88px] h-[88px] rounded-full p-[3.5px] bg-[#F9F6F0] shadow-md border border-black/5 ${
                !isExternalView ? 'cursor-pointer group' : ''
              }`}
              onClick={() => {
                if (!isExternalView) setIsEditProfileOpen(true);
              }}
              title={!isExternalView ? 'Click to edit profile photo' : undefined}
            >
              <img
                alt={`${user.name}'s avatar`}
                className="w-full h-full rounded-full object-cover object-[center_top]"
                src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
              />
              <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-[#5438FF] border-2 border-white shadow-xs" />
              {!isExternalView && (
                <div className="absolute inset-0 rounded-full bg-black/35 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Public Details: Name, Handle & Bio */}
        <div className="pt-12 px-2">
          <div className="flex items-center gap-2">
            <h1 className="font-serif-dream text-[28px] font-bold text-[#1A1C23] tracking-tight leading-none">
              {user.name}
            </h1>
            {user.role === 'admin' && (
              <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">
                Admin
              </span>
            )}
          </div>
          <p className="text-[#5438FF] font-medium text-[13.5px] mt-1 tracking-tight">
            {user.handle}
          </p>
          {user.bio && (
            <p className="font-editorial italic text-[#1A1C23]/80 text-[15px] mt-1 font-medium tracking-tight">
              {user.bio}
            </p>
          )}
        </div>
      </section>

      {/* Stats Section (Public counts) */}
      <section className="px-4 mt-5">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl py-3 px-2 text-center border border-zinc-200/60 shadow-xs">
            <div className="text-[19px] font-bold text-[#1A1C23] leading-tight">
              {formatStatCount(isExternalView ? followCounts.followers : user.followersCount)}
            </div>
            <div className="text-[12px] font-medium text-[#1A1C23]/60 mt-0.5">Followers</div>
          </div>
          <div className="bg-white rounded-2xl py-3 px-2 text-center border border-zinc-200/60 shadow-xs">
            <div className="text-[19px] font-bold text-[#1A1C23] leading-tight">
              {formatStatCount(isExternalView ? followCounts.following : user.followingCount)}
            </div>
            <div className="text-[12px] font-medium text-[#1A1C23]/60 mt-0.5">Following</div>
          </div>
          <div className="bg-white rounded-2xl py-3 px-2 text-center border border-zinc-200/60 shadow-xs">
            <div className="text-[19px] font-bold text-[#1A1C23] leading-tight">
              {formatStatCount(userDreams.length || user.dreamsCount || 0)}
            </div>
            <div className="text-[12px] font-medium text-[#1A1C23]/60 mt-0.5">Dreams</div>
          </div>
        </div>
      </section>

      {/* Action Buttons */}
      <section className="px-4 mt-4 flex items-center space-x-2">
        {isExternalView ? (
          <>
            {/* Follow / Following button */}
            <button
              onClick={handleToggleFollow}
              className={`flex-1 h-11 rounded-full flex items-center justify-center space-x-1.5 font-semibold text-[13.5px] transition shadow-xs ${
                isFollowing
                  ? 'bg-white border border-zinc-300 text-[#1A1C23] hover:bg-stone-50'
                  : 'bg-[#1A1C23] hover:bg-black text-white'
              }`}
            >
              {isFollowing ? (
                <>
                  <UserCheck className="w-4 h-4 text-[#5438FF] stroke-[2.5]" />
                  <span>Following</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 stroke-[2]" />
                  <span>Follow</span>
                </>
              )}
            </button>

            {/* Message button: Opens real direct messaging conversation */}
            <button
              onClick={handleMessageUser}
              className="flex-1 bg-white border border-zinc-200/90 text-[#1A1C23] h-11 rounded-full flex items-center justify-center space-x-2 font-semibold text-[13.5px] shadow-xs hover:bg-zinc-50 transition"
            >
              <MessageSquare className="w-4 h-4 stroke-[2] text-[#5438FF]" />
              <span>Message</span>
            </button>

            {/* Share profile button */}
            <button
              onClick={handleShareProfile}
              className="w-11 h-11 bg-white border border-zinc-200/90 text-[#1A1C23] rounded-full flex items-center justify-center shadow-xs hover:bg-zinc-50 transition shrink-0"
              title="Share profile"
            >
              <Share2 className="w-4 h-4 stroke-[2]" />
            </button>
          </>
        ) : (
          <>
            {/* Dedicated Primary Edit Profile Button */}
            <button
              id="btn-edit-profile-open"
              onClick={() => setIsEditProfileOpen(true)}
              className="flex-1 h-11 rounded-full flex items-center justify-center space-x-1.5 font-semibold text-[13.5px] bg-[#5438FF] hover:bg-[#4326ea] text-white shadow-xs transition active:scale-98"
            >
              <Edit3 className="w-4 h-4 stroke-[2]" />
              <span>Edit Profile</span>
            </button>

            <button
              id="btn-switch-dreamer"
              onClick={onOpenLogin}
              className="flex-1 h-11 rounded-full flex items-center justify-center space-x-1.5 font-semibold text-[13px] bg-[#1A1C23] hover:bg-black text-white shadow-xs transition"
            >
              <UserCheck className="w-4 h-4 stroke-[2]" />
              <span>Switch Dreamer</span>
            </button>

            <button
              onClick={() => onOpenDirectMessage({ id: 'u-me', name: user.name, avatar: user.avatar, handle: user.handle })}
              className="w-11 h-11 bg-white border border-zinc-200/90 text-[#1A1C23] rounded-full flex items-center justify-center shadow-xs hover:bg-zinc-50 transition shrink-0"
              title="Open messages"
            >
              <MessageSquare className="w-4 h-4 stroke-[2]" />
            </button>

            <button
              onClick={handleShareProfile}
              className="w-11 h-11 bg-white border border-zinc-200/90 text-[#1A1C23] rounded-full flex items-center justify-center shadow-xs hover:bg-zinc-50 transition shrink-0"
              title="Share profile"
            >
              <Share2 className="w-4 h-4 stroke-[2]" />
            </button>
          </>
        )}
      </section>

      {/* Content Tabs */}
      <section className="mt-4 px-4 border-b border-zinc-200/70">
        <div className="grid grid-cols-4 items-center">
          {/* Grid Tab */}
          <button
            onClick={() => setActiveTab('grid')}
            title="Dreams"
            className="flex flex-col items-center py-2"
          >
            <div
              className={`px-5 py-2 rounded-2xl flex items-center justify-center mb-1 transition-colors ${
                activeTab === 'grid' ? 'bg-[#5438FF]/10 text-[#5438FF]' : 'text-zinc-400'
              }`}
            >
              <Grid className="w-5 h-5 stroke-[2]" />
            </div>
            {activeTab === 'grid' && (
              <div className="w-14 h-[2.5px] bg-[#5438FF] rounded-full" />
            )}
          </button>

          {/* Video / Clips Tab */}
          <button
            onClick={() => setActiveTab('video')}
            title="Clips"
            className="flex flex-col items-center py-2"
          >
            <div
              className={`px-5 py-2 rounded-2xl flex items-center justify-center mb-1 transition-colors ${
                activeTab === 'video' ? 'bg-[#5438FF]/10 text-[#5438FF]' : 'text-zinc-400'
              }`}
            >
              <Video className="w-5 h-5 stroke-[2]" />
            </div>
            {activeTab === 'video' && (
              <div className="w-14 h-[2.5px] bg-[#5438FF] rounded-full" />
            )}
          </button>

          {/* Likes Tab */}
          <button
            onClick={() => setActiveTab('likes')}
            title="Likes"
            className="flex flex-col items-center py-2"
          >
            <div
              className={`px-5 py-2 rounded-2xl flex items-center justify-center mb-1 transition-colors ${
                activeTab === 'likes' ? 'bg-[#5438FF]/10 text-[#5438FF]' : 'text-zinc-400'
              }`}
            >
              <Heart className="w-5 h-5 stroke-[2]" />
            </div>
            {activeTab === 'likes' && (
              <div className="w-14 h-[2.5px] bg-[#5438FF] rounded-full" />
            )}
          </button>

          {/* Saved Tab */}
          <button
            onClick={() => setActiveTab('saved')}
            title="Saved"
            className="flex flex-col items-center py-2"
          >
            <div
              className={`px-5 py-2 rounded-2xl flex items-center justify-center mb-1 transition-colors ${
                activeTab === 'saved' ? 'bg-[#5438FF]/10 text-[#5438FF]' : 'text-zinc-400'
              }`}
            >
              <Bookmark className="w-5 h-5 stroke-[2]" />
            </div>
            {activeTab === 'saved' && (
              <div className="w-14 h-[2.5px] bg-[#5438FF] rounded-full" />
            )}
          </button>
        </div>
      </section>

      {/* Privacy Notice for Likes/Saved when viewing another user */}
      {isExternalView && (activeTab === 'likes' || activeTab === 'saved') ? (
        <div className="p-8 mx-4 mt-6 bg-white rounded-2xl border border-zinc-200 text-center">
          <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 mx-auto mb-2">
            <Lock className="w-5 h-5" />
          </div>
          <h4 className="font-serif-dream font-semibold text-base text-[#1A1C23]">
            Private Archive
          </h4>
          <p className="font-editorial italic text-xs text-[#1A1C23]/60 mt-1 max-w-xs mx-auto">
            {user.name}'s {activeTab === 'saved' ? 'saved bookmarks' : 'liked dreams'} are private and only viewable by this dreamer.
          </p>
        </div>
      ) : (
        <>
          {/* Archive search within dreams */}
          <div className="px-4 mt-3">
            <div className="relative flex items-center bg-white rounded-xl border border-zinc-200 px-3 py-2 text-xs">
              <Search className="w-3.5 h-3.5 text-zinc-400 mr-2" />
              <input
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                placeholder={isExternalView ? `Search ${user.name}'s public dreams...` : 'Search within my dreams...'}
                className="w-full bg-transparent outline-none border-none p-0 text-xs text-[#1A1C23] placeholder:text-zinc-400 focus:ring-0"
              />
            </div>
          </div>

          {/* Feed Grid with taped memory cards */}
          <section className="px-4 mt-4">
            {displayedDreams.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs italic bg-white rounded-2xl border border-dashed border-zinc-200 p-6">
                {isExternalView
                  ? `${user.name} hasn't shared public dreams in this category yet.`
                  : 'Nothing found in this section of the archive.'}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 items-start">
                {/* Left Column Featured Card */}
                {displayedDreams[0] && (() => {
                  const firstTheme = getDreamCardStyle(displayedDreams[0]);
                  return (
                  <div className="relative pt-3">
                    <div
                      className="absolute top-0 left-8 w-10 h-3 rounded-t-sm z-0 opacity-40"
                      style={{ backgroundColor: firstTheme.cardBorderColor }}
                    />
                    <article
                      onClick={() => onSelectDream(displayedDreams[0])}
                      style={{
                        backgroundColor: firstTheme.cardColor,
                        borderBottomColor: firstTheme.cardBorderColor,
                        color: firstTheme.textColor,
                      }}
                      className="relative z-10 rounded-2xl p-3.5 shadow-sm border-b-4 flex flex-col justify-between min-h-[260px] cursor-pointer hover:shadow-md transition-all"
                    >
                      <div>
                        <span
                          className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full inline-block mb-1"
                          style={{
                            backgroundColor: firstTheme.badgeBg,
                            color: firstTheme.textColor,
                          }}
                        >
                          {displayedDreams[0].timeAgo}
                        </span>
                        <h3
                          className="font-editorial italic font-bold text-[16px] leading-snug mt-1"
                          style={{ color: firstTheme.textColor }}
                        >
                          {displayedDreams[0].title}
                        </h3>
                        <p
                          className="text-[12px] leading-relaxed mt-2 line-clamp-3 opacity-90"
                          style={{ color: firstTheme.textColor }}
                        >
                          {displayedDreams[0].hook}
                        </p>
                      </div>

                      <div
                        className="flex items-center space-x-3 pt-3 mt-auto border-t border-dashed"
                        style={{ borderColor: firstTheme.dashedBorder }}
                      >
                        <div className="flex items-center space-x-1 text-xs font-bold" style={{ color: firstTheme.textColor }}>
                          <div className="w-3 h-3 rounded-full border border-current flex overflow-hidden">
                            <div className="w-1/2 bg-current h-full opacity-60" />
                          </div>
                          <span>{formatStatCount(displayedDreams[0].viewsCount || 31)}</span>
                        </div>
                        <div className="flex items-center space-x-1 text-xs font-bold" style={{ color: firstTheme.textColor }}>
                          <Heart className="w-3 h-3 fill-current stroke-none" />
                          <span>{formatStatCount(displayedDreams[0].likes || 1)}</span>
                        </div>
                      </div>
                    </article>
                  </div>
                  );
                })()}

                {/* Right Column Cards */}
                <div className="space-y-3 pt-1">
                  {displayedDreams.slice(1).map((dream) => {
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
                      className="p-3.5 rounded-2xl border-b-3 shadow-xs cursor-pointer hover:shadow-md transition-all"
                    >
                      <span
                        className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full inline-block mb-1"
                        style={{
                          backgroundColor: dTheme.badgeBg,
                          color: dTheme.textColor,
                        }}
                      >
                        {dream.timeAgo}
                      </span>
                      <h3
                        className="font-editorial italic font-bold text-[15px] leading-snug mt-0.5"
                        style={{ color: dTheme.textColor }}
                      >
                        {dream.title}
                      </h3>
                      {dream.hook && (
                        <p
                          className="text-[11px] leading-relaxed mt-1 line-clamp-2 opacity-90"
                          style={{ color: dTheme.textColor }}
                        >
                          {dream.hook}
                        </p>
                      )}
                      <div
                        className="flex items-center space-x-3 mt-2 text-xs font-bold pt-2 border-t border-dashed"
                        style={{ borderColor: dTheme.dashedBorder, color: dTheme.textColor }}
                      >
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-3 rounded-full border border-current flex overflow-hidden">
                            <div className="w-1/2 bg-current h-full opacity-60" />
                          </div>
                          <span>{formatStatCount(dream.viewsCount || 49)}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Heart className="w-3 h-3 fill-current stroke-none" />
                          <span>{formatStatCount(dream.likes || 1)}</span>
                        </div>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* Dedicated Edit Profile Modal */}
      {currentUser && (
        <EditProfileModal
          isOpen={isEditProfileOpen}
          currentUser={currentUser}
          onClose={() => setIsEditProfileOpen(false)}
          onSaveSuccess={(updatedUser) => {
            if (onProfileUpdated) {
              onProfileUpdated(updatedUser);
            }
          }}
        />
      )}
    </div>
  );
};

