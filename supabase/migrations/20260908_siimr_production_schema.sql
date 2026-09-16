-- ==============================================================================
-- SIIMR: Production Database Schema for Supabase
-- Core Principle: The DREAM is the canonical content object.
-- Publication surfaces (Last Night Story, Normal Post, Nearby Share, Clip)
-- all reference the canonical Dream record.
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. PROFILES (1:1 with auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  banner_quote TEXT DEFAULT 'How to go for a little walk and never return',
  region_bucket TEXT DEFAULT 'Bhubaneswar area',
  nearby_opt_in BOOLEAN DEFAULT true,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  followers_count INT DEFAULT 0,
  following_count INT DEFAULT 0,
  dreams_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 2. DREAMS (Canonical Content Object)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.dreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  hook TEXT,
  raw_transcript TEXT,
  content TEXT NOT NULL,
  dream_date DATE DEFAULT CURRENT_DATE NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  category TEXT DEFAULT 'Surreal' CHECK (category IN ('Surreal', 'Recurring', 'Lucid', 'Nightmares')),
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('private', 'followers', 'public')),
  is_nearby_eligible BOOLEAN DEFAULT true,
  location_context_id TEXT,
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  views_count INT DEFAULT 0,
  media_type TEXT DEFAULT 'illustration',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- 3. DREAM MEDIA (Assets attached to canonical dream)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.dream_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'audio', 'video')),
  mime_type TEXT,
  duration_ms INT,
  width INT,
  height INT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 4. DREAM TRANSCRIPTS (Voice dream capture preservation)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.dream_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transcript TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  audio_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 5. PUBLISHING SURFACE 1: LAST NIGHT STORIES (Temporary 24h social surface)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.last_night_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  audience TEXT DEFAULT 'public' CHECK (audience IN ('private', 'followers', 'public')),
  published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours') NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 6. PUBLISHING SURFACE 2: DREAM PUBLICATIONS (Feed discovery entries)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.dream_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  publication_type TEXT NOT NULL DEFAULT 'normal' CHECK (publication_type IN ('normal', 'nearby', 'story')),
  audience TEXT DEFAULT 'public' CHECK (audience IN ('private', 'followers', 'public')),
  published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 7. PUBLISHING SURFACE 3: NEARBY SHARES (Coarse geo-bucket opt-in)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.nearby_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  geo_bucket TEXT NOT NULL DEFAULT 'Bhubaneswar area',
  area_label TEXT NOT NULL DEFAULT 'Nearby',
  enabled BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 8. PUBLISHING SURFACE 4: CLIPS (Persistent short-video explanation)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_path TEXT NOT NULL,
  thumbnail_path TEXT,
  duration_seconds INT DEFAULT 30,
  caption TEXT,
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'processing', 'published', 'failed', 'deleted')),
  views_count INT DEFAULT 0,
  published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 9. CLIP VIEWS (Deduplicated view counter / analytics)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.clip_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  view_type TEXT DEFAULT 'view' CHECK (view_type IN ('view', 'completion', 'replay')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 10. DREAM CIRCLES (Deep discussion attached to ONE Dream)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.dream_circles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID UNIQUE NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.circle_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES public.dream_circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.circle_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.circle_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- 11. COMMENTS (Threaded discussions on dreams and clips)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('dream', 'clip')),
  target_id UUID NOT NULL,
  parent_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- 12. REACTIONS (Polymorphic unique likes / echoes)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('dream', 'clip')),
  target_id UUID NOT NULL,
  reaction_type TEXT DEFAULT 'like',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, target_type, target_id, reaction_type)
);

-- ==============================================================================
-- 13. SAVES (Bookmarks / Personal dream archive additions)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dream_id UUID REFERENCES public.dreams(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CHECK (dream_id IS NOT NULL OR clip_id IS NOT NULL)
);

-- ==============================================================================
-- 14. SHARE EVENTS (Tracking dream shares)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.share_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('dream', 'clip')),
  target_id UUID NOT NULL,
  platform TEXT DEFAULT 'web_share',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 15. SOCIAL GRAPH: FOLLOWS & BLOCKS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- ==============================================================================
-- 16. DIRECT MESSAGING (1:1 private conversations)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  media_path TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- 17. NOTIFICATIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('follow', 'like', 'comment', 'circle_reply', 'clip_reaction', 'message')),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 18. TAGS & DREAM TAGS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.dream_tags (
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (dream_id, tag_id)
);

-- ==============================================================================
-- 19. REPORTS (Safety & moderation)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('dream', 'clip', 'comment', 'user')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  reviewed_at TIMESTAMPTZ
);

-- ==============================================================================
-- 20. ACTIVITIES (Audit stream)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_id TEXT,
  target_type TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_dreams_user_id ON public.dreams(user_id);
CREATE INDEX IF NOT EXISTS idx_dreams_created_at ON public.dreams(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dreams_visibility ON public.dreams(visibility);

CREATE INDEX IF NOT EXISTS idx_last_night_stories_active ON public.last_night_stories(expires_at) WHERE expires_at > now();
CREATE INDEX IF NOT EXISTS idx_last_night_stories_dream ON public.last_night_stories(dream_id);

CREATE INDEX IF NOT EXISTS idx_nearby_shares_bucket ON public.nearby_shares(geo_bucket, enabled);
CREATE INDEX IF NOT EXISTS idx_clips_dream_id ON public.clips(dream_id);
CREATE INDEX IF NOT EXISTS idx_comments_target ON public.comments(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON public.reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_circle_threads_circle ON public.circle_threads(circle_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.last_night_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nearby_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 1. Profiles: Public read, self write
CREATE POLICY "Profiles readable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Dreams: Public or followers read, owner all
CREATE POLICY "Public dreams readable" ON public.dreams FOR SELECT USING (
  visibility = 'public' OR 
  (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
  (visibility = 'followers' AND EXISTS (
    SELECT 1 FROM public.follows WHERE follower_id = auth.uid() AND following_id = dreams.user_id
  ))
);
CREATE POLICY "Users create dreams" ON public.dreams FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own dreams" ON public.dreams FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own dreams" ON public.dreams FOR DELETE USING (auth.uid() = user_id);

-- 3. Last Night Stories: Active unexpired stories
CREATE POLICY "Active stories readable" ON public.last_night_stories FOR SELECT USING (
  expires_at > now() AND (
    audience = 'public' OR 
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
  )
);
CREATE POLICY "Users create own stories" ON public.last_night_stories FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Nearby Shares: Enabled shares readable
CREATE POLICY "Nearby shares readable" ON public.nearby_shares FOR SELECT USING (enabled = true);
CREATE POLICY "Users create nearby shares" ON public.nearby_shares FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Clips: Public clips readable
CREATE POLICY "Published clips readable" ON public.clips FOR SELECT USING (status = 'published');
CREATE POLICY "Users manage own clips" ON public.clips FOR ALL USING (auth.uid() = user_id);

-- 6. Comments, Reactions & Saves
CREATE POLICY "Comments readable" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Users insert comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own comments" ON public.comments FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Reactions readable" ON public.reactions FOR SELECT USING (true);
CREATE POLICY "Users manage reactions" ON public.reactions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own saves" ON public.saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own saves" ON public.saves FOR ALL USING (auth.uid() = user_id);

-- 7. Dream Circles: Threads and replies
CREATE POLICY "Circles readable" ON public.dream_circles FOR SELECT USING (true);
CREATE POLICY "Threads readable" ON public.circle_threads FOR SELECT USING (true);
CREATE POLICY "Users insert threads" ON public.circle_threads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Replies readable" ON public.circle_replies FOR SELECT USING (true);
CREATE POLICY "Users insert replies" ON public.circle_replies FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 8. Follows & Blocks
CREATE POLICY "Follows readable" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Users follow others" ON public.follows FOR ALL USING (auth.uid() = follower_id);

CREATE POLICY "Users manage blocks" ON public.blocks FOR ALL USING (auth.uid() = blocker_id);

-- 9. Direct Messages
CREATE POLICY "Conversation members access" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversation_members 
    WHERE conversation_members.conversation_id = messages.conversation_id 
      AND conversation_members.user_id = auth.uid()
  )
);
CREATE POLICY "Send message if member" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.conversation_members 
    WHERE conversation_members.conversation_id = messages.conversation_id 
      AND conversation_members.user_id = auth.uid()
  )
);

-- 10. Activities
CREATE POLICY "Activities readable" ON public.activities FOR SELECT USING (true);
CREATE POLICY "Activities insertable" ON public.activities FOR INSERT WITH CHECK (true);
