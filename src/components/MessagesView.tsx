import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  Send,
  Sparkles,
  Lock,
  Search,
  AlertCircle,
  ShieldAlert,
  UserCheck,
  RefreshCw,
  MessageSquare,
  Users,
} from 'lucide-react';
import { AuthUser, DirectMessageItem } from '../types';
import { supabaseService } from '../services/supabaseService';

interface TargetUser {
  id: string;
  name: string;
  avatar: string;
  handle: string;
}

interface MessagesViewProps {
  currentUser?: AuthUser;
  initialTargetUser?: TargetUser | null;
  onBack: () => void;
  onNavigateToSearch?: () => void;
  onOpenLogin?: () => void;
}

interface ThreadMessage {
  id: string;
  sender: 'me' | 'them';
  text: string;
  time: string;
  createdAt?: string;
  senderId?: string;
  senderName?: string;
  pending?: boolean;
  failed?: boolean;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  currentUser,
  initialTargetUser,
  onBack,
  onNavigateToSearch,
  onOpenLogin,
}) => {
  const [conversations, setConversations] = useState<DirectMessageItem[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);

  // Active conversation state
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeRecipient, setActiveRecipient] = useState<TargetUser | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Search within conversations
  const [searchQuery, setSearchQuery] = useState('');

  // Blocking state
  const [isRecipientBlocked, setIsRecipientBlocked] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const myId = currentUser?.id || 'u-me';
  const myName = currentUser?.name || 'Dreamer';
  const myHandle = currentUser?.handle || '@dreamer';

  // 1. Initial Target User handling (e.g. opened from Profile "Message" button)
  useEffect(() => {
    if (initialTargetUser && initialTargetUser.id) {
      const threadId = supabaseService.getCanonicalThreadId(myId, initialTargetUser.id);
      setActiveThreadId(threadId);
      setActiveRecipient(initialTargetUser);
    }
  }, [initialTargetUser, myId]);

  // 2. Fetch conversations list for currentUser
  const loadConversations = async () => {
    setIsLoadingConversations(true);
    setConversationsError(null);
    try {
      const list = await supabaseService.fetchConversations(myId);
      setConversations(list);
    } catch (err: any) {
      console.warn('Error loading conversations:', err);
      setConversationsError('Unable to load conversations at this moment.');
    } finally {
      setIsLoadingConversations(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [myId]);

  // 3. Check blocking status whenever active recipient changes
  useEffect(() => {
    let isCancelled = false;
    const checkBlocked = async () => {
      if (!activeRecipient?.id || !myId) {
        setIsRecipientBlocked(false);
        return;
      }
      try {
        const blockedSet = await supabaseService.getBlockedUserIds(myId);
        if (!isCancelled) {
          setIsRecipientBlocked(blockedSet.has(activeRecipient.id));
        }
      } catch {
        if (!isCancelled) setIsRecipientBlocked(false);
      }
    };
    checkBlocked();
    return () => {
      isCancelled = true;
    };
  }, [activeRecipient?.id, myId]);

  // 4. Fetch thread messages & subscribe to Supabase realtime
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    let isCancelled = false;
    setIsLoadingMessages(true);
    setMessagesError(null);

    const fetchMessages = async () => {
      try {
        const fetched = await supabaseService.fetchThreadMessages(activeThreadId, myId);
        if (!isCancelled) {
          setMessages(fetched);
          setIsLoadingMessages(false);
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('Error fetching thread messages:', err);
          setMessagesError('Could not load messages.');
          setIsLoadingMessages(false);
        }
      }
    };

    fetchMessages();

    // Subscribe to realtime messages for this canonical thread
    const unsubscribe = supabaseService.subscribeToThread(activeThreadId, (newRow) => {
      if (!newRow) return;
      setMessages((prev) => {
        // If already exists by ID, skip
        if (prev.some((m) => m.id === newRow.id)) return prev;

        // If replacing an optimistic message with same text & sender
        const optimisticIndex = prev.findIndex(
          (m) => m.pending && m.text === newRow.text && m.sender === 'me'
        );
        if (optimisticIndex >= 0) {
          const updated = [...prev];
          updated[optimisticIndex] = {
            id: newRow.id,
            sender: 'me',
            text: newRow.text,
            time: supabaseService.formatTimeAgo(newRow.created_at),
            createdAt: newRow.created_at,
            senderId: newRow.sender_id,
            senderName: newRow.sender_name,
            pending: false,
          };
          return updated;
        }

        const isMe = newRow.sender_id === myId;
        const newMsg: ThreadMessage = {
          id: newRow.id,
          sender: isMe ? 'me' : 'them',
          text: newRow.text,
          time: supabaseService.formatTimeAgo(newRow.created_at),
          createdAt: newRow.created_at,
          senderId: newRow.sender_id,
          senderName: newRow.sender_name,
        };
        return [...prev, newMsg];
      });

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [activeThreadId, myId]);

  // 5. Send message handler
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputText.trim();
    if (!clean || !activeThreadId || isSending) return;

    if (isRecipientBlocked) {
      alert('You cannot send messages to a blocked dreamer. Unblock them first.');
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ThreadMessage = {
      id: tempId,
      sender: 'me',
      text: clean,
      time: 'Just now',
      pending: true,
      senderId: myId,
      senderName: myName,
    };

    // Optimistic append
    setMessages((prev) => [...prev, optimisticMessage]);
    setInputText('');
    setIsSending(true);

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);

    try {
      const saved = await supabaseService.syncMessage(
        activeThreadId,
        { id: myId, name: myName, handle: myHandle },
        clean
      );

      // Update optimistic message with real ID from database
      if (saved && saved.id) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, id: saved.id, pending: false } : m))
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m))
        );
      }

      // Update conversations preview
      setConversations((prev) => {
        const found = prev.find((c) => c.id === activeThreadId);
        if (found) {
          return [
            {
              ...found,
              previewText: `You: ${clean}`,
              timestamp: 'Just now',
            },
            ...prev.filter((c) => c.id !== activeThreadId),
          ];
        }
        return prev;
      });
    } catch (err) {
      console.warn('Failed to send message:', err);
      // Mark optimistic message as failed
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
      );
    } finally {
      setIsSending(false);
    }
  };

  // 6. Unblock handler
  const handleUnblock = async () => {
    if (!activeRecipient?.id) return;
    try {
      await supabaseService.unblockUser(myId, activeRecipient.id);
      setIsRecipientBlocked(false);
    } catch (err) {
      console.warn('Failed to unblock user:', err);
    }
  };

  // Filter conversations by search query
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.senderName.toLowerCase().includes(q) || c.previewText.toLowerCase().includes(q);
  });

  return (
    <div className="w-full min-h-screen bg-[#F9F6F0] text-[#1A1C23] pb-28 select-none">
      {/* Header */}
      <header className="px-5 pt-4 pb-3 border-b border-[#1A1C23]/10 bg-[#F9F6F0] sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeThreadId ? (
            <button
              onClick={() => {
                setActiveThreadId(null);
                setActiveRecipient(null);
              }}
              className="w-8 h-8 rounded-full bg-white shadow-xs border border-zinc-200/70 flex items-center justify-center text-[#1A1C23] hover:bg-stone-50 transition"
              title="Back to Messages"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-full bg-white shadow-xs border border-zinc-200/70 flex items-center justify-center text-[#1A1C23] hover:bg-stone-50 transition"
              title="Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <div>
            <h1 className="font-serif-dream font-bold text-lg text-[#1A1C23] leading-tight">
              {activeRecipient ? activeRecipient.name : 'Dream Whispers'}
            </h1>
            <p className="text-[11px] text-[#5438FF] font-medium flex items-center gap-1">
              <Lock className="w-3 h-3 stroke-[2.5]" />
              <span>
                {activeRecipient
                  ? activeRecipient.handle || 'Private conversation'
                  : 'Real-time & private to dreamers'}
              </span>
            </p>
          </div>
        </div>

        {activeRecipient ? (
          <img
            src={
              activeRecipient.avatar ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
            }
            alt={activeRecipient.name}
            className="w-9 h-9 rounded-full object-cover ring-2 ring-[#5438FF]/30"
          />
        ) : (
          onNavigateToSearch && (
            <button
              onClick={onNavigateToSearch}
              className="px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-xs font-semibold text-[#5438FF] shadow-xs hover:bg-stone-50 transition flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Find Dreamer</span>
            </button>
          )
        )}
      </header>

      {/* Guest warning banner */}
      {currentUser?.isGuest && onOpenLogin && (
        <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Sign in to store conversations across devices.</span>
          </div>
          <button
            onClick={onOpenLogin}
            className="px-2.5 py-1 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition"
          >
            Sign In
          </button>
        </div>
      )}

      {/* VIEW A: CONVERSATION LIST */}
      {!activeThreadId ? (
        <div className="p-4 space-y-3">
          {/* Search within conversations */}
          <div className="relative flex items-center bg-white rounded-xl border border-zinc-200/80 px-3 py-2 text-xs shadow-xs">
            <Search className="w-3.5 h-3.5 text-zinc-400 mr-2 shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-transparent outline-none border-none p-0 text-xs text-[#1A1C23] placeholder:text-zinc-400 focus:ring-0"
            />
          </div>

          {/* Loading State */}
          {isLoadingConversations && (
            <div className="space-y-2 py-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="bg-white p-3.5 rounded-2xl border border-zinc-200/60 shadow-xs flex items-center gap-3 animate-pulse"
                >
                  <div className="w-11 h-11 rounded-full bg-zinc-200 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="w-1/3 h-3.5 bg-zinc-200 rounded" />
                    <div className="w-3/4 h-3 bg-zinc-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error State */}
          {!isLoadingConversations && conversationsError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{conversationsError}</span>
              </div>
              <button
                onClick={loadConversations}
                className="px-2.5 py-1 bg-white border border-rose-300 text-rose-700 rounded-lg font-bold flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingConversations && !conversationsError && filteredConversations.length === 0 && (
            <div className="bg-white rounded-3xl p-8 border border-zinc-200 text-center shadow-xs mt-2">
              <div className="w-14 h-14 rounded-full bg-[#5438FF]/10 text-[#5438FF] flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h3 className="font-serif-dream font-bold text-lg text-[#1A1C23]">
                {searchQuery ? 'No matching conversations' : 'No dream whispers yet'}
              </h3>
              <p className="font-editorial italic text-xs text-[#1A1C23]/60 max-w-xs mx-auto mt-1 leading-relaxed">
                {searchQuery
                  ? `Nothing found matching "${searchQuery}". Try a different name.`
                  : 'Search for real dreamers on SIIMR to exchange private thoughts and interpretations.'}
              </p>
              {onNavigateToSearch && !searchQuery && (
                <button
                  onClick={onNavigateToSearch}
                  className="mt-5 px-5 py-2.5 bg-[#1A1C23] text-white rounded-full text-xs font-bold hover:bg-black transition shadow-xs"
                >
                  Discover Real Dreamers
                </button>
              )}
            </div>
          )}

          {/* Conversations List */}
          {!isLoadingConversations && filteredConversations.length > 0 && (
            <div className="space-y-2">
              {filteredConversations.map((thread) => (
                <div
                  key={thread.id}
                  onClick={() => {
                    setActiveThreadId(thread.id);
                    setActiveRecipient({
                      id: thread.id.replace(/^dm_/, '').replace(myId, '').replace('_', ''),
                      name: thread.senderName,
                      avatar: thread.senderAvatar,
                      handle: `@${thread.senderName.toLowerCase().replace(/\s+/g, '')}`,
                    });
                  }}
                  className="bg-white p-3.5 rounded-2xl border border-zinc-200/70 shadow-xs flex items-center gap-3.5 cursor-pointer hover:border-[#5438FF]/40 hover:bg-stone-50/80 transition-all group"
                >
                  <img
                    src={thread.senderAvatar}
                    alt={thread.senderName}
                    className="w-11 h-11 rounded-full object-cover shrink-0 ring-1 ring-black/5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-[14px] text-[#1A1C23] group-hover:text-[#5438FF] transition-colors truncate">
                        {thread.senderName}
                      </h4>
                      <span className="text-[10.5px] text-[#1A1C23]/50 shrink-0 ml-2">
                        {thread.timestamp}
                      </span>
                    </div>
                    <p className="text-xs text-[#1A1C23]/70 truncate mt-0.5 font-editorial italic">
                      {thread.previewText}
                    </p>
                  </div>
                  {Boolean(thread.unreadCount && thread.unreadCount > 0) && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#5438FF] shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* VIEW B: ACTIVE CONVERSATION */
        <div className="flex flex-col h-[calc(100vh-175px)] justify-between">
          {/* Blocked Recipient Notice */}
          {isRecipientBlocked ? (
            <div className="m-4 p-4 bg-zinc-100 border border-zinc-300 rounded-2xl text-center space-y-2">
              <div className="flex items-center justify-center gap-1 text-zinc-700 font-bold text-xs">
                <ShieldAlert className="w-4 h-4 text-zinc-700" />
                <span>Dreamer Blocked</span>
              </div>
              <p className="text-[11px] text-zinc-600">
                You have blocked {activeRecipient?.name}. Unblock to exchange messages.
              </p>
              <button
                onClick={handleUnblock}
                className="px-4 py-1.5 bg-[#5438FF] text-white rounded-full text-xs font-bold hover:bg-[#452ee0] transition"
              >
                Unblock
              </button>
            </div>
          ) : (
            <>
              {/* Messages scroll area */}
              <div className="space-y-3 overflow-y-auto flex-1 px-4 py-3 no-scrollbar">
                {/* Security info banner */}
                <div className="py-2 text-center">
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-zinc-200/60 rounded-full text-[10px] text-zinc-600 font-medium">
                    <Lock className="w-2.5 h-2.5" />
                    <span>Real-time messages protected by SIIMR policies</span>
                  </span>
                </div>

                {isLoadingMessages ? (
                  <div className="py-12 text-center text-xs text-zinc-400 italic">
                    Loading dream whispers...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-[#5438FF]/10 text-[#5438FF] flex items-center justify-center mx-auto mb-2">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <p className="font-serif-dream font-semibold text-sm text-[#1A1C23]">
                      Whisper into the Dream World
                    </p>
                    <p className="font-editorial italic text-xs text-[#1A1C23]/60 max-w-xs mx-auto">
                      No messages exchanged with {activeRecipient?.name} yet. Send a whisper to start.
                    </p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.sender === 'me';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed break-words shadow-xs ${
                            isMe
                              ? 'bg-[#5438FF] text-white rounded-br-xs'
                              : 'bg-white text-[#1A1C23] border border-zinc-200/80 rounded-bl-xs'
                          } ${m.pending ? 'opacity-70' : ''}`}
                        >
                          {m.text}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-0.5 px-1 font-medium">
                          <span>{m.time}</span>
                          {m.pending && <span>• sending...</span>}
                          {m.failed && <span className="text-rose-600 font-bold">• failed</span>}
                        </div>
                      </div>
                    );
                  })
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Box */}
              <form
                onSubmit={handleSend}
                className="px-4 py-3 bg-[#F9F6F0] border-t border-[#1A1C23]/10 flex items-center gap-2"
              >
                <input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Whisper to ${activeRecipient?.name || 'Dreamer'}...`}
                  disabled={isSending}
                  className="flex-1 bg-white border border-zinc-200/90 rounded-full px-4 py-2.5 text-xs text-[#1A1C23] placeholder:text-zinc-400 focus:outline-none focus:border-[#5438FF] shadow-xs"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending}
                  className="w-10 h-10 rounded-full bg-[#5438FF] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#452ee0] transition-colors shrink-0 shadow-xs"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
};
