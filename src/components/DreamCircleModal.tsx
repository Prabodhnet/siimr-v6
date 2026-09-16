import React, { useState } from 'react';
import { Users, X, MessageSquare, Send, Sparkles } from 'lucide-react';
import { Dream, DreamCircleThread } from '../types';

interface DreamCircleModalProps {
  dream: Dream;
  onClose: () => void;
  onAddThreadReply: (dreamId: string, threadId: string, replyText: string) => void;
  onCreateThread: (dreamId: string, title: string, initialPost: string) => void;
}

export const DreamCircleModal: React.FC<DreamCircleModalProps> = ({
  dream,
  onClose,
  onAddThreadReply,
  onCreateThread,
}) => {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    dream.circleThreads && dream.circleThreads.length > 0 ? dream.circleThreads[0].id : null
  );
  const [replyText, setReplyText] = useState('');
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPost, setNewPost] = useState('');

  const activeThread = dream.circleThreads?.find((t) => t.id === activeThreadId);

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeThreadId) return;
    onAddThreadReply(dream.id, activeThreadId, replyText.trim());
    setReplyText('');
  };

  const handleCreateNewThread = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPost.trim()) return;
    onCreateThread(dream.id, newTitle.trim(), newPost.trim());
    setNewTitle('');
    setNewPost('');
    setIsCreatingThread(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3">
      <div className="bg-[#F9F6F0] w-full max-w-[420px] max-h-[90vh] rounded-[32px] flex flex-col shadow-2xl border border-white/20 overflow-hidden animate-in fade-in slide-in-from-bottom-6">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-[#1A1C23]/10 bg-white/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#5438FF] flex items-center justify-center text-white">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5438FF]">
                  Dream Circle
                </span>
                <span className="text-xs text-[#1A1C23]/40">•</span>
                <span className="text-xs text-[#1A1C23]/60 font-medium">Investigation</span>
              </div>
              <h2 className="font-serif-dream text-[16px] font-bold text-[#1A1C23] truncate max-w-[240px]">
                {dream.title}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1A1C23]/5 hover:bg-[#1A1C23]/10 flex items-center justify-center text-[#1A1C23]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Introductory notice */}
          <div className="p-3 bg-[#EEEAFE] rounded-2xl text-xs text-[#452EE0] flex items-start gap-2">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Compare similar experiences, develop theories, and investigate questions raised by this dream.
            </p>
          </div>

          {/* Creation Form */}
          {isCreatingThread ? (
            <form onSubmit={handleCreateNewThread} className="bg-white p-4 rounded-2xl border border-[#5438FF]/20 space-y-3">
              <h3 className="text-xs font-extrabold text-[#5438FF] uppercase">Start New Discussion</h3>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Topic / Theory title (e.g., Sideways gravity)..."
                className="w-full text-xs font-semibold p-2.5 bg-[#F9F6F0] rounded-xl border border-[#1A1C23]/10"
              />
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder="Share your theory or similar observation..."
                rows={3}
                className="w-full text-xs p-2.5 bg-[#F9F6F0] rounded-xl border border-[#1A1C23]/10"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingThread(false)}
                  className="px-3 py-1.5 text-xs text-[#1A1C23]/60 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || !newPost.trim()}
                  className="px-4 py-1.5 bg-[#5438FF] text-white rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  Post Topic
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsCreatingThread(true)}
              className="w-full py-2.5 px-4 bg-white border border-dashed border-[#5438FF]/30 text-[#5438FF] rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#EEEAFE] transition-colors"
            >
              <span>+ Propose a Theory or Similarity</span>
            </button>
          )}

          {/* Threads List */}
          {dream.circleThreads && dream.circleThreads.length > 0 ? (
            <div className="space-y-3">
              {dream.circleThreads.map((thread: DreamCircleThread) => {
                const isSelected = thread.id === activeThreadId;
                return (
                  <div
                    key={thread.id}
                    className={`rounded-2xl p-4 transition-all border ${
                      isSelected
                        ? 'bg-white border-[#5438FF] shadow-sm'
                        : 'bg-white/70 border-[#1A1C23]/5 hover:bg-white'
                    }`}
                  >
                    <div
                      onClick={() => setActiveThreadId(isSelected ? null : thread.id)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-[#5438FF]">{thread.authorName}</span>
                        <span className="text-[#1A1C23]/50">{thread.timestamp}</span>
                      </div>
                      <h4 className="font-serif-dream font-semibold text-[15px] text-[#1A1C23] mb-1">
                        {thread.title}
                      </h4>
                      <p className="font-editorial italic text-xs text-[#1A1C23]/80 leading-relaxed">
                        "{thread.initialPost}"
                      </p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1A1C23]/5 text-[11px] font-bold text-[#1A1C23]/60">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {thread.replies.length} replies
                        </span>
                        <span className="text-[#5438FF]">
                          {isSelected ? 'Collapse' : 'Join Discussion →'}
                        </span>
                      </div>
                    </div>

                    {/* Replies list when expanded */}
                    {isSelected && (
                      <div className="mt-3 pt-3 border-t border-dashed border-[#1A1C23]/10 space-y-2.5">
                        {thread.replies.map((r) => (
                          <div key={r.id} className="bg-[#F9F6F0] p-2.5 rounded-xl text-xs">
                            <div className="flex items-center justify-between font-bold text-[#1A1C23]/80 mb-0.5">
                              <span>{r.authorName}</span>
                              <span className="text-[10px] text-[#1A1C23]/40 font-normal">
                                {r.timestamp}
                              </span>
                            </div>
                            <p className="text-[#1A1C23]/90">{r.text}</p>
                          </div>
                        ))}

                        {/* Reply input */}
                        <form onSubmit={handleSendReply} className="flex gap-2 pt-1">
                          <input
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Add your experience or hypothesis..."
                            className="flex-1 bg-white border border-[#1A1C23]/15 rounded-xl px-3 py-1.5 text-xs text-[#1A1C23] focus:outline-none focus:border-[#5438FF]"
                          />
                          <button
                            type="submit"
                            disabled={!replyText.trim()}
                            className="px-3 bg-[#5438FF] text-white rounded-xl text-xs font-bold disabled:opacity-40"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-[#1A1C23]/50">
              No threads yet in this Dream Circle. Be the first to start an investigation!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
