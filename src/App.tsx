import React, { useState, useEffect } from 'react';
import { mockDreams, mockClips, mockMessages } from './mockData';
import { Dream, ClipItem, DirectMessageItem, AuthUser, PublishingSurfaces } from './types';
import { Navigation } from './components/Navigation';
import { HomeView } from './components/HomeView';
import { SearchView } from './components/SearchView';
import { NearbyView } from './components/NearbyView';
import { ClipPlayerView } from './components/ClipPlayerView';
import { DreamDetailView } from './components/DreamDetailView';
import { ProfileView } from './components/ProfileView';
import { MessagesView } from './components/MessagesView';
import { CaptureModal } from './components/CaptureModal';
import { DreamCircleModal } from './components/DreamCircleModal';
import { SettingsModal } from './components/SettingsModal';
import { LoginPage } from './components/LoginPage';
import { InstallModal } from './components/InstallModal';
import { authService } from './services/authService';
import { activityService } from './services/activityService';
import { supabaseService } from './services/supabaseService';
import { supabase } from './services/supabase';
import { normalizeDream } from './utils/normalizeDream';
import { mergePersistedDreams } from './utils/dreamPersistence';

type ActiveTab = 'home' | 'search' | 'nearby' | 'clips' | 'messages' | 'me';

const getDreamsCacheKey = (user?: AuthUser | null) =>
  user?.id && !user.isGuest ? `siimr_dreams_${user.id}` : 'siimr_dreams_guest';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [currentUser, setCurrentUser] = useState<AuthUser>(() => authService.getCurrentUser());
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
  const [isInstallOpen, setIsInstallOpen] = useState<boolean>(false);
  const [dreams, setDreams] = useState<Dream[]>(() => {
    const user = authService.getCurrentUser();
    const cacheKey = getDreamsCacheKey(user);
    const saved = localStorage.getItem(cacheKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed
            .map((d) => normalizeDream(d, d?.id))
            .filter((d) => d.audience !== 'only_me' || (user && d.author?.id === user.id));
        }
      } catch (e) {
        console.warn('Error reading stored dreams:', e);
      }
    }
    return mockDreams.map((d) => normalizeDream(d, d?.id));
  });

  const [clips, setClips] = useState<ClipItem[]>(mockClips);
  const [messages, setMessages] = useState<DirectMessageItem[]>(mockMessages);

  // Contextual screens
  const [selectedDream, setSelectedDream] = useState<Dream | null>(null);
  const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);
  const [viewingProfileUserOrHandle, setViewingProfileUserOrHandle] = useState<string | null>(null);
  const [activeDirectMessageTarget, setActiveDirectMessageTarget] = useState<{ id: string; name: string; avatar: string; handle: string } | null>(null);

  // Modals
  const [isCaptureOpen, setIsCaptureOpen] = useState<boolean>(false);
  const [editingDream, setEditingDream] = useState<Dream | null>(null);
  const [activeDreamCircleId, setActiveDreamCircleId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Save dreams to user-scoped localStorage when updated
  useEffect(() => {
    try {
      const cacheKey = getDreamsCacheKey(currentUser);
      localStorage.setItem(cacheKey, JSON.stringify(dreams));
    } catch (e) {
      console.warn('Failed to save dreams to localStorage:', e);
    }
  }, [dreams, currentUser?.id]);

  // Subscribe to real-time auth state changes
  useEffect(() => {
    const unsubscribe = authService.subscribe((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Restore currentUser from authoritative Supabase session on startup (Requirement 8)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (session?.user) {
        authService.syncSessionUser(session.user);
      } else {
        const user = authService.getCurrentUser();
        if (!user.isGuest && !user.isDemo) {
          authService.logout();
        }
      }
    });
  }, []);

  // Rehydrate dreams & personal saved states from Supabase + Firestore when user changes
  useEffect(() => {
    let isMounted = true;
    const syncDreamsData = async () => {
      try {
        // 1. Fetch dreams & clips from Supabase
        const [supabaseAllDreams, supabaseUserDreams, supabaseClips] = await Promise.all([
          supabaseService.fetchDreams(),
          currentUser?.id && !currentUser.isGuest
            ? supabaseService.fetchDreams({ userId: currentUser.id })
            : Promise.resolve([]),
          supabaseService.fetchClips(),
        ]);

        // 2. Fetch from Firestore / local mock
        const firestoreDreams = await activityService.getAllDreamsFromFirestore(mockDreams, currentUser.id);
        const userState = await activityService.getUserSavedState(currentUser.id);

        if (!isMounted) return;

        // Keep locally persisted Dreams scoped to this user
        const cacheKey = getDreamsCacheKey(currentUser);
        const saved = localStorage.getItem(cacheKey);
        let localDreams: Dream[] = [];
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              localDreams = parsed.map((d) => normalizeDream(d, d?.id));
            }
          } catch (e) {
            console.warn('Error reading persisted dreams during sync:', e);
          }
        }

        // Combine Supabase dreams (accessible + user's own)
        const combinedSupabase = [...supabaseUserDreams, ...supabaseAllDreams];
        const mergedSources = mergePersistedDreams(
          localDreams,
          combinedSupabase.map((d) => normalizeDream(d, d.id)),
          firestoreDreams.map((d) => normalizeDream(d, d.id)),
        );

        const mergedList = mergedSources
          .filter((dream) => dream.audience !== 'only_me' || (currentUser && dream.author?.id === currentUser.id))
          .map((dream) => ({
            ...dream,
            isLiked: dream.isLiked || userState.likedDreamIds.includes(dream.id),
            isSaved: dream.isSaved || userState.savedDreamIds.includes(dream.id),
          }));

        setDreams(mergedList);

        // Update clips from Supabase if available
        if (supabaseClips && supabaseClips.length > 0) {
          const clipMap = new Map<string, ClipItem>();
          for (const c of mockClips) clipMap.set(c.id, c);
          for (const c of supabaseClips) clipMap.set(c.id, c);
          setClips([...clipMap.values()]);
        }
      } catch (err) {
        console.warn('Dream sync warning:', err);
      }
    };

    syncDreamsData();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  // Auth handlers
  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    setIsLoginOpen(false);
    setActiveTab('home');
    if (user && !user.id.startsWith('u-guest') && !user.isDemo) {
      supabaseService.syncUserProfile(user).catch((err) => {
        console.warn('Supabase profile sync error:', err);
      });
    }
  };

  const handleLogout = async () => {
    const guest = await authService.logout();
    setCurrentUser(guest);
    setActiveTab('home');
    setViewingProfileUserOrHandle(null);
    setActiveDirectMessageTarget(null);
    setSelectedDream(null);
    setIsSettingsOpen(false);
    // Immediately remove previous user's private dreams from feed
    setDreams((prev) => prev.filter((d) => d.audience !== 'only_me'));
  };

  // Handle Like
  const handleToggleLike = async (dreamId: string) => {
    let nextIsLiked = false;
    let targetTitle: string | undefined;

    setDreams((prev) =>
      prev.map((d) => {
        if (d.id === dreamId) {
          nextIsLiked = !d.isLiked;
          targetTitle = d.title;
          const currentLikes = Number(d.likes) || 0;
          return {
            ...d,
            isLiked: nextIsLiked,
            likes: nextIsLiked ? currentLikes + 1 : Math.max(0, currentLikes - 1),
          };
        }
        return d;
      })
    );
    if (selectedDream && selectedDream.id === dreamId) {
      setSelectedDream((prev) => {
        if (!prev) return null;
        const currentLikes = Number(prev.likes) || 0;
        return {
          ...prev,
          isLiked: !prev.isLiked,
          likes: !prev.isLiked ? currentLikes + 1 : Math.max(0, currentLikes - 1),
        };
      });
    }

    // Persist reaction to Supabase and Firestore
    supabaseService.syncReaction(currentUser.id, 'dream', dreamId, 'like', nextIsLiked, targetTitle).catch(console.warn);
    await activityService.syncDreamLike(currentUser.id, dreamId, nextIsLiked, targetTitle);
  };

  // Handle Save / Bookmark
  const handleToggleSave = async (dreamId: string) => {
    let nextIsSaved = false;
    let targetTitle: string | undefined;

    setDreams((prev) =>
      prev.map((d) => {
        if (d.id === dreamId) {
          nextIsSaved = !d.isSaved;
          targetTitle = d.title;
          return { ...d, isSaved: nextIsSaved };
        }
        return d;
      })
    );
    if (selectedDream && selectedDream.id === dreamId) {
      setSelectedDream((prev) => (prev ? { ...prev, isSaved: !prev.isSaved } : null));
    }

    // Persist bookmark to Supabase and Firestore
    supabaseService.syncSave(currentUser.id, 'dream', dreamId, nextIsSaved, targetTitle).catch(console.warn);
    await activityService.syncDreamSave(currentUser.id, dreamId, nextIsSaved, targetTitle);
  };

  // Handle Profile Updated by User
  const handleProfileUpdated = (updatedUser: AuthUser) => {
    setCurrentUser(updatedUser);
    authService.updateCurrentUserProfile(updatedUser);

    // Propagate updated identity to dreams created by the current user
    setDreams((prev) =>
      prev.map((d) => {
        if (d.author.id === updatedUser.id) {
          return {
            ...d,
            author: {
              ...d.author,
              name: updatedUser.name,
              handle: updatedUser.handle,
              avatar: updatedUser.avatar,
              initials: updatedUser.initials,
            },
          };
        }
        return d;
      })
    );

    // Propagate updated identity to clips created by the current user
    setClips((prev) =>
      prev.map((c) => {
        if (c.creator.name === currentUser.name || c.creator.handle === currentUser.handle) {
          return {
            ...c,
            creator: {
              ...c.creator,
              name: updatedUser.name,
              handle: updatedUser.handle,
              avatar: updatedUser.avatar,
            },
          };
        }
        return c;
      })
    );
  };

  // Handle Comments / Reflections
  const handleAddComment = async (dreamId: string, text: string) => {
    const newComment = {
      id: `comm-${Date.now()}`,
      authorName: currentUser.name,
      authorColor: currentUser.color || '#5438FF',
      authorAvatar: currentUser.avatar,
      text,
      timestamp: 'Just now',
    };

    let targetTitle: string | undefined;

    setDreams((prev) =>
      prev.map((d) => {
        if (d.id === dreamId) {
          targetTitle = d.title;
          const updatedComments = [...d.comments, newComment];
          return {
            ...d,
            comments: updatedComments,
            commentsCount: updatedComments.length,
          };
        }
        return d;
      })
    );

    // Keep clips comments count in sync
    setClips((prev) =>
      prev.map((c) => {
        if (c.dreamId === dreamId) {
          const currentCount = Number(c.commentsCount) || 0;
          return {
            ...c,
            commentsCount: currentCount + 1,
          };
        }
        return c;
      })
    );

    if (selectedDream && selectedDream.id === dreamId) {
      setSelectedDream((prev) =>
        prev
          ? {
              ...prev,
              comments: [...prev.comments, newComment],
              commentsCount: (Number(prev.commentsCount) || 0) + 1,
            }
          : null
      );
    }

    // Persist comment in Supabase and Firestore
    supabaseService.syncComment(currentUser.id, 'dream', dreamId, newComment, targetTitle).catch(console.warn);
    await activityService.syncComment(currentUser.id, dreamId, newComment, targetTitle);
  };

  // Handle Dream Circle reply
  const handleAddThreadReply = (dreamId: string, threadId: string, replyText: string) => {
    const newReply = {
      id: `rep-${Date.now()}`,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      text: replyText,
      timestamp: 'Just now',
    };

    setDreams((prev) =>
      prev.map((d) => {
        if (d.id === dreamId && d.circleThreads) {
          return {
            ...d,
            circleThreads: d.circleThreads.map((t) => {
              if (t.id === threadId) {
                return {
                  ...t,
                  replies: [...t.replies, newReply],
                };
              }
              return t;
            }),
          };
        }
        return d;
      })
    );

    // Persist reply to Supabase Dream Circles
    supabaseService.addCircleReply(threadId, currentUser.id, replyText).catch(console.warn);
  };

  // Handle creating new Dream Circle thread
  const handleCreateCircleThread = (dreamId: string, title: string, initialPost: string) => {
    const newThread = {
      id: `thread-${Date.now()}`,
      dreamId,
      title,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      timestamp: 'Just now',
      initialPost,
      repliesCount: 0,
      replies: [],
    };

    setDreams((prev) =>
      prev.map((d) => {
        if (d.id === dreamId) {
          return {
            ...d,
            circleThreads: [newThread, ...(d.circleThreads || [])],
          };
        }
        return d;
      })
    );

    // Persist thread to Supabase Dream Circles
    supabaseService.createCircleThread(dreamId, currentUser.id, title, initialPost).catch(console.warn);
  };

  // Handle updating atmosphere/card color for an existing Dream
  const handleUpdateDreamAtmosphere = async (
    dreamId: string,
    atmosphere: { cardColor: string; cardBorderColor?: string; cardTextColor?: string }
  ) => {
    // 1. Update React state immediately
    setDreams((prev) =>
      prev.map((d) => (d.id === dreamId ? { ...d, ...atmosphere } : d))
    );

    if (selectedDream?.id === dreamId) {
      setSelectedDream((prev) => (prev ? { ...prev, ...atmosphere } : null));
    }

    // 2. Persist to Supabase raw_data & columns
    try {
      await supabaseService.updateDream(dreamId, atmosphere);
    } catch (e) {
      console.warn('Failed to persist dream atmosphere to Supabase:', e);
    }
  };

  // Handle saving new captured dream with multi-surface publishing
  const handleSaveDream = async (
    newDreamData: Omit<Dream, 'likes' | 'commentsCount' | 'viewsCount' | 'comments' | 'circleThreads'> & { id?: string },
    createClipPrompt?: boolean,
    surfaces?: PublishingSurfaces,
    mediaFile?: File | null,
    voiceNotePath?: string | null
  ) => {
    if (!currentUser || currentUser.isGuest || currentUser.isDemo || currentUser.id.startsWith('u-')) {
      throw new Error('Please log in to publish your Dream. An active Supabase Auth session is required.');
    }

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData?.session?.user || sessionData.session.user.id !== currentUser.id) {
      throw new Error('Please log in to publish your Dream. An active Supabase Auth session is required.');
    }

    const isExisting = Boolean(newDreamData.id);
    const targetId = newDreamData.id || `dream-${Date.now()}`;
    const existingDream = dreams.find((d) => d.id === targetId);

    const completeDream: Dream = {
      ...(existingDream || {}),
      ...newDreamData,
      id: targetId,
      author: existingDream?.author || {
        id: currentUser.id,
        name: currentUser.name,
        handle: currentUser.handle,
        avatar: currentUser.avatar,
        initials: currentUser.initials || 'D',
        color: currentUser.color || '#5438FF',
      },
      likes: existingDream?.likes ?? 1,
      commentsCount: existingDream?.commentsCount ?? 0,
      viewsCount: existingDream?.viewsCount ?? 1,
      comments: existingDream?.comments || [],
      isLiked: existingDream?.isLiked || false,
      isSaved: existingDream?.isSaved || false,
      surfaces: {
        isNormalPost: surfaces?.normalPost ?? existingDream?.surfaces?.isNormalPost ?? true,
        isStory: surfaces?.lastNightStory ?? existingDream?.surfaces?.isStory ?? true,
        isNearby: surfaces?.nearbyShare ?? existingDream?.surfaces?.isNearby ?? true,
        hasClip: Boolean(createClipPrompt || surfaces?.clip || newDreamData.hasClip || existingDream?.hasClip),
      },
      circleThreads: existingDream?.circleThreads || [
        {
          id: `thread-${targetId}-1`,
          dreamId: targetId,
          title: 'Initial Observations & Echoes',
          authorName: 'siimr Bot',
          timestamp: 'Just now',
          initialPost: `Memory saved before fade. Feel free to attach reflections or note if this motifs recurs.`,
          repliesCount: 0,
          replies: [],
        },
      ],
    };

    if (isExisting) {
      // If updating an existing dream, update canonical dream and raw_data styling
      await supabaseService.updateDream(targetId, {
        title: completeDream.title,
        hook: completeDream.hook,
        content: completeDream.content,
        rawTranscript: completeDream.rawTranscript,
        category: completeDream.category,
        audience: completeDream.audience,
        cardColor: completeDream.cardColor,
        cardBorderColor: completeDream.cardBorderColor,
        cardTextColor: completeDream.cardTextColor,
        mediaUrl: completeDream.mediaUrl,
        mediaKind: completeDream.mediaKind,
      });

      setDreams((prev) => prev.map((d) => (d.id === targetId ? completeDream : d)));
    } else {
      // 1. Primary permanent persistence to Supabase with bound Publishing Surfaces (Stories, Nearby, Clips).
      await supabaseService.saveCanonicalDream(completeDream, {
        surfaces,
        rawTranscript: completeDream.rawTranscript || completeDream.content,
        clipCaption: completeDream.hook,
        mediaFile: mediaFile || undefined,
        voiceNotePath: voiceNotePath || undefined,
      });

      // 2. Auxiliary sync to Firestore by userId
      try {
        await activityService.saveDreamToFirestore(completeDream);
      } catch (err) {
        console.warn('Firestore dream save warning:', err);
      }

      setDreams((prev) => [completeDream, ...prev]);

      if (createClipPrompt || surfaces?.clip || completeDream.hasClip || completeDream.surfaces?.hasClip) {
        // Also add a corresponding clip
        const newClip: ClipItem = {
          id: `clip-${Date.now()}`,
          dreamId: targetId,
          title: completeDream.title,
          quote: completeDream.hook,
          hook: completeDream.hook,
          videoOrImageUrl:
            completeDream.clipVideoUrl ||
            completeDream.mediaUrl ||
            completeDream.imageUrl ||
            'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
          creator: {
            name: currentUser.name,
            handle: currentUser.handle,
            avatar: currentUser.avatar,
            timeAgo: 'Just now',
          },
          likes: '1',
          commentsCount: '0',
          viewsCount: '1',
          currentTime: '00:00',
          totalTime: '00:30',
          tags: [`#${completeDream.category}`, '#DreamWorld'],
          isLiked: false,
          isSaved: false,
        };
        setClips((prev) => [newClip, ...prev]);
      }
    }

    // Auto-open created or updated dream
    setSelectedDream(completeDream);
    setEditingDream(null);
  };

  // Handle Sending Direct Message
  const handleSendMessage = (threadId: string, text: string) => {
    setMessages((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          const newMsg = {
            id: `msg-${Date.now()}`,
            sender: 'me' as const,
            text,
            time: 'Just now',
          };
          return {
            ...t,
            previewText: text,
            timestamp: 'Just now',
            unreadCount: 0,
            messages: [...t.messages, newMsg],
          };
        }
        return t;
      })
    );

    // Record activity in Firestore and Supabase
    activityService.recordActivity(currentUser.id, {
      actionType: 'SEND_MESSAGE',
      title: 'Sent message in dream chat',
      description: 'Dispatched reflection or whisper in direct conversation',
      targetId: threadId,
      targetType: 'message',
    }).catch((err) => console.warn('Activity record error:', err));

    // Persist message to Supabase backend `messages` table
    supabaseService.syncMessage(
      threadId,
      { id: currentUser.id, name: currentUser.name, handle: currentUser.handle },
      text
    ).catch((err) => console.warn('Supabase message sync error:', err));
  };

  // Handle Sharing Dream
  const handleShareDream = (dreamId: string, platform: string = 'web_share') => {
    const target = dreams.find((d) => d.id === dreamId);
    supabaseService.syncShare(currentUser.id, 'dream', dreamId, platform, target?.title).catch((err) => {
      console.warn('Supabase share sync error:', err);
    });
  };

  // Handle Export Archive
  const handleExportArchive = () => {
    const exportData = {
      app: 'siimr',
      exportedAt: new Date().toISOString(),
      user: {
        id: currentUser.id,
        name: currentUser.name,
        handle: currentUser.handle,
        email: currentUser.email,
      },
      dreams: dreams.filter(
        (d) =>
          d.author?.id === currentUser?.id ||
          d.author?.handle?.toLowerCase() === currentUser?.handle?.toLowerCase() ||
          d.author?.name?.toLowerCase() === currentUser?.name?.toLowerCase()
      ),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `siimr-dream-journal-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Current dream for Dream Circle modal
  const circleDream = dreams.find((d) => d.id === activeDreamCircleId) || selectedDream;

  return (
    <div className="min-h-screen bg-[#E5DFD5] flex items-center justify-center p-0 sm:p-4">
      {/* Mobile viewport simulator container */}
      <div className="w-full sm:max-w-[420px] min-h-screen sm:min-h-[844px] bg-[#F9F6F0] sm:rounded-[44px] shadow-2xl overflow-hidden relative border sm:border-[#1A1C23]/10 flex flex-col font-sans-ui">
        {/* Main Content Router */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {/* If a dream detail view is open */}
          {selectedDream ? (
            <DreamDetailView
              dream={selectedDream}
              currentUser={currentUser}
              onBack={() => setSelectedDream(null)}
              onToggleLike={handleToggleLike}
              onToggleSave={handleToggleSave}
              onAddComment={handleAddComment}
              onOpenDreamCircle={(dreamId) => setActiveDreamCircleId(dreamId)}
              onShareDream={handleShareDream}
              onEditDream={(d) => {
                setEditingDream(d);
                setIsCaptureOpen(true);
              }}
              onUpdateAtmosphere={handleUpdateDreamAtmosphere}
              onOpenClip={() => {
                const clipIdx = clips.findIndex((c) => c.dreamId === selectedDream.id);
                if (clipIdx >= 0) {
                  setCurrentClipIndex(clipIdx);
                  setActiveTab('clips');
                  setSelectedDream(null);
                } else {
                  setActiveTab('clips');
                  setSelectedDream(null);
                }
              }}
            />
          ) : activeTab === 'home' ? (
            <HomeView
              dreams={dreams}
              currentUser={currentUser}
              onSelectDream={(d) => setSelectedDream(d)}
              onOpenCapture={() => setIsCaptureOpen(true)}
              onOpenNearby={() => setActiveTab('nearby')}
              onOpenClips={() => setActiveTab('clips')}
              onToggleLike={handleToggleLike}
              onToggleSave={handleToggleSave}
              onOpenLogin={() => setIsLoginOpen(true)}
              onOpenInstall={() => setIsInstallOpen(true)}
            />
          ) : activeTab === 'search' ? (
            <SearchView
              dreams={dreams}
              currentUser={currentUser}
              onSelectDream={(d) => setSelectedDream(d)}
              onSelectProfile={(userHandleOrId) => {
                setViewingProfileUserOrHandle(userHandleOrId);
                setActiveTab('me');
              }}
            />
          ) : activeTab === 'nearby' ? (
            <NearbyView
              dreams={dreams}
              onBack={() => setActiveTab('home')}
              onSelectDream={(d) => setSelectedDream(d)}
            />
          ) : activeTab === 'clips' ? (
            <ClipPlayerView
              clip={clips[currentClipIndex] || clips[0]}
              dream={dreams.find((d) => d.id === clips[currentClipIndex]?.dreamId)}
              currentUser={currentUser}
              onAddComment={handleAddComment}
              onBack={() => setActiveTab('home')}
              onOpenDreamCircle={(dreamId) => setActiveDreamCircleId(dreamId)}
              onToggleLike={() => {
                const cur = clips[currentClipIndex];
                if (cur) handleToggleLike(cur.dreamId);
              }}
              onToggleSave={() => {
                const cur = clips[currentClipIndex];
                if (cur) handleToggleSave(cur.dreamId);
              }}
              onNextClip={() => {
                setCurrentClipIndex((prev) => (prev + 1) % clips.length);
              }}
              onPrevClip={() => {
                setCurrentClipIndex((prev) => (prev - 1 + clips.length) % clips.length);
              }}
            />
          ) : activeTab === 'messages' ? (
            <MessagesView
              currentUser={currentUser}
              initialTargetUser={activeDirectMessageTarget}
              onBack={() => {
                setActiveDirectMessageTarget(null);
                setActiveTab('home');
              }}
              onNavigateToSearch={() => {
                setActiveDirectMessageTarget(null);
                setActiveTab('search');
              }}
              onOpenLogin={() => setIsLoginOpen(true)}
            />
          ) : activeTab === 'me' ? (
            <ProfileView
              dreams={dreams}
              currentUser={currentUser}
              viewingUserIdOrHandle={viewingProfileUserOrHandle}
              onBack={() => {
                setViewingProfileUserOrHandle(null);
                setActiveTab('search');
              }}
              onSelectDream={(d) => setSelectedDream(d)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenDirectMessage={(target) => {
                setActiveDirectMessageTarget(target);
                setActiveTab('messages');
              }}
              onOpenLogin={() => setIsLoginOpen(true)}
              onProfileUpdated={handleProfileUpdated}
            />
          ) : null}
        </div>

        {/* Global Bottom Navigation Dock (Visible on main tabs when not in full-screen Clip or Detail mode) */}
        {!selectedDream && activeTab !== 'nearby' && activeTab !== 'clips' && (
          <Navigation
            activeTab={activeTab}
            onTabChange={(tab) => {
              setSelectedDream(null);
              if (tab === 'me') {
                setViewingProfileUserOrHandle(null); // Reset to own profile when tapping Me tab
              }
              if (tab !== 'messages') {
                setActiveDirectMessageTarget(null);
              }
              setActiveTab(tab);
            }}
            onOpenCapture={() => setIsCaptureOpen(true)}
            unreadCount={messages.filter((m) => (m.unreadCount || 0) > 0).length}
          />
        )}

        {/* Capture Voice/Text Modal */}
        <CaptureModal
          isOpen={isCaptureOpen}
          initialDream={editingDream}
          currentUser={currentUser}
          onClose={() => {
            setIsCaptureOpen(false);
            setEditingDream(null);
          }}
          onSaveDream={handleSaveDream}
          onOpenLogin={() => setIsLoginOpen(true)}
        />

        {/* Dream Circle Focused Investigation Modal */}
        {activeDreamCircleId && circleDream && (
          <DreamCircleModal
            dream={circleDream}
            onClose={() => setActiveDreamCircleId(null)}
            onAddThreadReply={handleAddThreadReply}
            onCreateThread={handleCreateCircleThread}
          />
        )}

        {/* Privacy & Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onExportArchive={handleExportArchive}
          currentUser={currentUser}
          onOpenLogin={() => setIsLoginOpen(true)}
          onLogout={handleLogout}
          onOpenInstall={() => setIsInstallOpen(true)}
        />

        {/* Authentication & Login Page */}
        <LoginPage
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          onLoginSuccess={handleLoginSuccess}
        />

        {/* Android / PWA App Install Modal */}
        <InstallModal
          isOpen={isInstallOpen}
          onClose={() => setIsInstallOpen(false)}
        />
      </div>
    </div>
  );
}
