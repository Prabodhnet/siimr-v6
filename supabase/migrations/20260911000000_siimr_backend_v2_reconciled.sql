-- =====================================================================
-- SIIMR BACKEND V2 (RECONCILED LIVE SCHEMA REPLACEMENT MIGRATION)
-- File: supabase/migrations/20260911000000_siimr_backend_v2_reconciled.sql
-- Status: PROPOSED REPLACEMENT — AUDITED FOR LIVE SUPABASE STATE
-- 
-- RECONCILIATION SUMMARY:
-- 1. Preserves existing 6 rows in public.profiles and 44 rows in public.activities.
-- 2. Respects live TEXT ID schema (accommodates both 'u-me' demo IDs and auth UUIDs).
-- 3. Additively evolves empty tables (dreams, comments, messages, likes, bookmarks, shares).
-- 4. Creates missing canonical tables (dream_media, clips, conversations, follows, blocks, etc.).
-- 5. Implements dual compatibility on messages (thread_id for live UI + conversation_id for V2).
-- 6. Centralizes privacy enforcement via public.can_view_dream(p_dream_id, p_user_id).
-- 7. 100% transaction-safe: can be executed atomically inside BEGIN ... COMMIT.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. EXTENSIONS
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ---------------------------------------------------------------------
-- 2. ENUMS & DOMAINS
-- ---------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE reaction_v2_type AS ENUM ('like', 'resonate', 'lucid', 'haunting', 'surreal');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------
-- 3. PROFILES EVOLUTION (Preserve 6 Existing Rows)
-- ---------------------------------------------------------------------
-- Live state: id is TEXT (accommodates demo IDs like 'u-me' and auth.users UUIDs)
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    display_name TEXT,
    name TEXT,
    handle TEXT,
    email TEXT,
    bio TEXT,
    avatar TEXT,
    avatar_url TEXT,
    cover_url TEXT,
    banner_url TEXT,
    banner_quote TEXT DEFAULT 'How to go for a little walk and never return',
    region_bucket TEXT DEFAULT 'Bhubaneswar area',
    nearby_opt_in BOOLEAN DEFAULT true,
    discoverable_in_search BOOLEAN DEFAULT true,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
    followers_count INT DEFAULT 0,
    following_count INT DEFAULT 0,
    dreams_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Add V2 specific profile columns
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS banner_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);
CREATE INDEX IF NOT EXISTS idx_profiles_handle ON public.profiles (handle);

-- ---------------------------------------------------------------------
-- 4. ACTIVITIES PRESERVATION (Preserve 44 Existing Rows)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activities (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    target_id TEXT,
    target_type TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_user_created ON public.activities (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_target ON public.activities (target_id, target_type);

-- ---------------------------------------------------------------------
-- 5. DREAMS EVOLUTION (0 Existing Rows -> Canonical V2 Content Model)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dreams (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    hook TEXT,
    raw_transcript TEXT,
    content TEXT NOT NULL,
    dream_date DATE DEFAULT CURRENT_DATE NOT NULL,
    captured_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    category TEXT DEFAULT 'Surreal',
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    visibility TEXT DEFAULT 'public',
    is_nearby_eligible BOOLEAN DEFAULT true,
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    views_count INT DEFAULT 0,
    media_type TEXT DEFAULT 'illustration',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Add V2 canonical privacy, lucidity, clarity, and metric columns
ALTER TABLE public.dreams
    ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_followers_only BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS lucidity_level INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS clarity INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS mood TEXT DEFAULT 'mysterious',
    ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
    ALTER TABLE public.dreams 
        ADD CONSTRAINT chk_dreams_lucidity CHECK (lucidity_level BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.dreams 
        ADD CONSTRAINT chk_dreams_clarity CHECK (clarity BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_dreams_privacy_user ON public.dreams (is_private, user_id);
CREATE INDEX IF NOT EXISTS idx_dreams_followers_user ON public.dreams (is_followers_only, user_id);
CREATE INDEX IF NOT EXISTS idx_dreams_mood_tags ON public.dreams USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_dreams_created_desc ON public.dreams (created_at DESC);

-- ---------------------------------------------------------------------
-- 6. DREAM MEDIA CREATION (V2 Canonical Media Identity)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dream_media (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    bucket_name TEXT NOT NULL DEFAULT 'dream-media-public',
    storage_path TEXT NOT NULL,
    media_type TEXT NOT NULL,
    mime_type TEXT,
    aspect_ratio TEXT DEFAULT '1:1',
    duration_seconds NUMERIC(6,2),
    file_size_bytes BIGINT,
    thumbnail_storage_path TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_dream_media_id_dream_id UNIQUE (id, dream_id)
);

DO $$ BEGIN
    ALTER TABLE public.dream_media 
        ADD CONSTRAINT chk_dream_media_v2_type 
        CHECK (media_type IN ('image', 'video', 'audio_narration'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_dream_media_dream_order ON public.dream_media (dream_id, order_index ASC);

-- ---------------------------------------------------------------------
-- 7. DREAM TRANSCRIPTS (Spoken Audio Recording Metadata)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dream_transcripts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    transcript TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    audio_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dream_transcripts_dream ON public.dream_transcripts (dream_id);

-- ---------------------------------------------------------------------
-- 8. LAST NIGHT STORIES (24h Ephemeral Social Surface)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.last_night_stories (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours') NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_last_night_stories_dream_id UNIQUE (dream_id),
    CONSTRAINT chk_story_expiry CHECK (expires_at > published_at)
);

CREATE INDEX IF NOT EXISTS idx_last_night_stories_active ON public.last_night_stories (expires_at DESC);

-- ---------------------------------------------------------------------
-- 9. CLIPS & CLIP REVIEWS (Vertical Video Presentation Layer)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legacy_clips_review (
    clip_id TEXT PRIMARY KEY,
    dream_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    video_path TEXT,
    duration_seconds NUMERIC(6,2),
    created_at TIMESTAMPTZ,
    review_reason TEXT NOT NULL,
    quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clips (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    media_id TEXT,
    aspect_ratio TEXT NOT NULL DEFAULT '9:16',
    status TEXT NOT NULL DEFAULT 'published',
    duration_seconds NUMERIC(6,2),
    caption TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_clips_dream_id UNIQUE (dream_id),
    CONSTRAINT chk_clips_status CHECK (status IN ('processing', 'published', 'archived', 'quarantined')),
    CONSTRAINT chk_clips_aspect_ratio_916 CHECK (aspect_ratio = '9:16'),
    CONSTRAINT chk_clips_media_id_present CHECK (media_id IS NOT NULL OR status = 'quarantined') NOT VALID,
    CONSTRAINT fk_clips_media_same_dream FOREIGN KEY (media_id, dream_id) 
        REFERENCES public.dream_media (id, dream_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clips_media_lookup ON public.clips (media_id);
CREATE INDEX IF NOT EXISTS idx_clips_status_created ON public.clips (status, created_at DESC);

-- Trigger: Ensure Clip references canonical video in dream_media
CREATE OR REPLACE FUNCTION public.validate_clip_media_is_video()
RETURNS TRIGGER AS $$
DECLARE
    v_media_type TEXT;
BEGIN
    IF NEW.status = 'quarantined' AND NEW.media_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.media_id IS NULL THEN
        RAISE EXCEPTION 'Active clip must reference a canonical dream_media record.';
    END IF;

    SELECT media_type INTO v_media_type
    FROM public.dream_media
    WHERE id = NEW.media_id AND dream_id = NEW.dream_id;

    IF v_media_type IS NULL THEN
        RAISE EXCEPTION 'Referenced dream_media % does not belong to dream %', NEW.media_id, NEW.dream_id;
    END IF;

    IF v_media_type <> 'video' THEN
        RAISE EXCEPTION 'Clips may only reference dream_media of type "video". Found: %', v_media_type;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_clip_media_video ON public.clips;
CREATE TRIGGER trg_validate_clip_media_video
    BEFORE INSERT OR UPDATE OF media_id, dream_id, status ON public.clips
    FOR EACH ROW EXECUTE FUNCTION public.validate_clip_media_is_video();

-- Table: clip_views
CREATE TABLE IF NOT EXISTS public.clip_views (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    clip_id TEXT NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    viewer_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    watch_duration_seconds NUMERIC(6,2),
    completed BOOLEAN DEFAULT false,
    viewed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clip_views_clip ON public.clip_views (clip_id, viewed_at DESC);

-- ---------------------------------------------------------------------
-- 10. NEARBY SHARES (PostGIS Spatial Discovery)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nearby_shares (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    location_geog GEOGRAPHY(Point, 4326),
    location_name TEXT,
    published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours') NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_nearby_shares_dream_id UNIQUE (dream_id)
);

CREATE INDEX IF NOT EXISTS idx_nearby_shares_geog ON public.nearby_shares USING GIST (location_geog);
CREATE INDEX IF NOT EXISTS idx_nearby_shares_active ON public.nearby_shares (is_active, expires_at DESC);

-- ---------------------------------------------------------------------
-- 11. SOCIAL FOUNDATIONS: FOLLOWS & BLOCKS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follows (
    follower_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT chk_no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);

CREATE TABLE IF NOT EXISTS public.blocks (
    blocker_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT chk_no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks (blocked_id);

-- Helper: Bidirectional block check
CREATE OR REPLACE FUNCTION public.is_blocked(p_user_a TEXT, p_user_b TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_user_a IS NULL OR p_user_b IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
           OR (blocker_id = p_user_b AND blocked_id = p_user_a)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 12. CENTRALIZED PRIVACY ACCESS HELPER
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_dream(p_dream_id TEXT, p_user_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_dream RECORD;
BEGIN
    IF p_dream_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT id, user_id, is_private, is_followers_only
    INTO v_dream
    FROM public.dreams
    WHERE id = p_dream_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Author can always view their own dream
    IF p_user_id IS NOT NULL AND v_dream.user_id = p_user_id THEN
        RETURN TRUE;
    END IF;

    -- Bidirectional block check: if blocked, deny immediately
    IF p_user_id IS NOT NULL AND public.is_blocked(p_user_id, v_dream.user_id) THEN
        RETURN FALSE;
    END IF;

    -- Private dreams: owner only
    IF v_dream.is_private THEN
        RETURN FALSE;
    END IF;

    -- Followers-only dreams: caller must be a verified follower
    IF v_dream.is_followers_only THEN
        IF p_user_id IS NULL THEN
            RETURN FALSE;
        END IF;
        RETURN EXISTS (
            SELECT 1 FROM public.follows
            WHERE follower_id = p_user_id AND following_id = v_dream.user_id
        );
    END IF;

    -- Public dream and not blocked
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 13. COMMENTS EVOLUTION (0 Existing Rows -> Threaded Model)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES public.comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Ensure parent_id and dream_id columns exist if table was pre-created
ALTER TABLE public.comments
    ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_dream_created ON public.comments (dream_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments (parent_id);

-- ---------------------------------------------------------------------
-- 14. REACTIONS & LIKES RECONCILIATION
-- ---------------------------------------------------------------------
-- Retain legacy likes table for backward compatibility (0 rows)
CREATE TABLE IF NOT EXISTS public.likes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    clip_id TEXT REFERENCES public.clips(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Canonical V2 reactions table
CREATE TABLE IF NOT EXISTS public.legacy_reactions_review (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reaction_type TEXT NOT NULL,
    review_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_reactions_user_dream UNIQUE (dream_id, user_id),
    CONSTRAINT chk_reaction_v2_type 
        CHECK (reaction_type IN ('like', 'resonate', 'lucid', 'haunting', 'surreal'))
);

CREATE INDEX IF NOT EXISTS idx_reactions_dream_type ON public.reactions (dream_id, reaction_type);

-- ---------------------------------------------------------------------
-- 15. SAVES & BOOKMARKS RECONCILIATION
-- ---------------------------------------------------------------------
-- Retain legacy bookmarks table for backward compatibility (0 rows)
CREATE TABLE IF NOT EXISTS public.bookmarks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Canonical V2 saves table
CREATE TABLE IF NOT EXISTS public.saves (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_saves_user_dream UNIQUE (user_id, dream_id)
);

CREATE INDEX IF NOT EXISTS idx_saves_user_created ON public.saves (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 16. SHARES & SHARE EVENTS RECONCILIATION
-- ---------------------------------------------------------------------
-- Retain legacy shares table for backward compatibility (0 rows)
CREATE TABLE IF NOT EXISTS public.shares (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    platform TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Canonical V2 share_events table
CREATE TABLE IF NOT EXISTS public.share_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_events_dream ON public.share_events (dream_id);

-- ---------------------------------------------------------------------
-- 17. CONVERSATIONS & DUAL-COMPATIBILITY MESSAGING
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_low TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_high TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_conv_user_order CHECK (user_low < user_high),
    CONSTRAINT uq_conv_user_pair UNIQUE (user_low, user_high)
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
    conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ DEFAULT now(),
    joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
);

-- Messages table: DUAL COMPATIBILITY (supports thread_id AND conversation_id)
CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    thread_id TEXT, -- Preserves frontend canonical thread_id: "dm_uid1_uid2"
    conversation_id TEXT REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_name TEXT,
    text TEXT NOT NULL,
    shared_dream_id TEXT REFERENCES public.dreams(id) ON DELETE SET NULL,
    media_type TEXT,
    media_storage_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Evolve messages columns if table was pre-created
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS thread_id TEXT,
    ADD COLUMN IF NOT EXISTS conversation_id TEXT REFERENCES public.conversations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sender_name TEXT,
    ADD COLUMN IF NOT EXISTS shared_dream_id TEXT REFERENCES public.dreams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS media_type TEXT,
    ADD COLUMN IF NOT EXISTS media_storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages (conversation_id, created_at ASC);

-- ---------------------------------------------------------------------
-- 18. DREAM CIRCLES (Contextual Reflection Threads)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dream_circles (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    theme TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_dream_circles_dream_id UNIQUE (dream_id)
);

CREATE TABLE IF NOT EXISTS public.dream_circle_threads (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    circle_id TEXT NOT NULL REFERENCES public.dream_circles(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    initial_post TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_circle_threads_circle ON public.dream_circle_threads (circle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.dream_circle_replies (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    thread_id TEXT NOT NULL REFERENCES public.dream_circle_threads(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_circle_replies_thread ON public.dream_circle_replies (thread_id, created_at ASC);

-- ---------------------------------------------------------------------
-- 19. NOTIFICATIONS & SAFETY REPORTS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    recipient_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_notification_v2_type CHECK (
        notification_type IN ('reaction', 'comment', 'reply', 'follow', 'message', 'like', 'circle_reply', 'clip_reaction')
    )
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread 
    ON public.notifications (recipient_id, read_at) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    reporter_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('dream', 'clip', 'comment', 'user')),
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports (status, created_at ASC);

-- ---------------------------------------------------------------------
-- 20. CORE RPC STORED PROCEDURES (SECURITY DEFINER)
-- ---------------------------------------------------------------------

-- RPC 1: Direct Conversation Resolver
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(other_user_id TEXT)
RETURNS TEXT AS $$
DECLARE
    v_current_user_id TEXT;
    v_low TEXT;
    v_high TEXT;
    v_conv_id TEXT;
BEGIN
    v_current_user_id := auth.uid()::text;
    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF other_user_id IS NULL OR other_user_id = v_current_user_id THEN
        RAISE EXCEPTION 'Invalid conversation target.';
    END IF;

    IF public.is_blocked(v_current_user_id, other_user_id) THEN
        RAISE EXCEPTION 'Conversation disallowed due to block settings.';
    END IF;

    IF v_current_user_id < other_user_id THEN
        v_low := v_current_user_id;
        v_high := other_user_id;
    ELSE
        v_low := other_user_id;
        v_high := v_current_user_id;
    END IF;

    -- Atomic Insert or Query
    INSERT INTO public.conversations (user_low, user_high)
    VALUES (v_low, v_high)
    ON CONFLICT (user_low, user_high) DO NOTHING
    RETURNING id INTO v_conv_id;

    IF v_conv_id IS NULL THEN
        SELECT id INTO v_conv_id
        FROM public.conversations
        WHERE user_low = v_low AND user_high = v_high;
    END IF;

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_current_user_id), (v_conv_id, other_user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN v_conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- RPC 2: Toggle Reaction
CREATE OR REPLACE FUNCTION public.toggle_reaction(target_dream_id TEXT, req_type TEXT)
RETURNS JSONB AS $$
DECLARE
    v_user_id TEXT;
    v_action TEXT;
    v_total_likes INT;
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.can_view_dream(target_dream_id, v_user_id) THEN
        RAISE EXCEPTION 'Target dream not found or access denied.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.reactions WHERE dream_id = target_dream_id AND user_id = v_user_id) THEN
        DELETE FROM public.reactions WHERE dream_id = target_dream_id AND user_id = v_user_id;
        v_action := 'removed';
    ELSE
        INSERT INTO public.reactions (dream_id, user_id, reaction_type)
        VALUES (target_dream_id, v_user_id, req_type);
        v_action := 'added';
    END IF;

    SELECT COUNT(*) INTO v_total_likes FROM public.reactions WHERE dream_id = target_dream_id;
    UPDATE public.dreams SET likes_count = v_total_likes WHERE id = target_dream_id;

    RETURN jsonb_build_object('action', v_action, 'likes_count', v_total_likes);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- RPC 3: Increment Dream View
CREATE OR REPLACE FUNCTION public.increment_dream_view(p_dream_id TEXT)
RETURNS VOID AS $$
BEGIN
    IF public.can_view_dream(p_dream_id, auth.uid()::text) THEN
        UPDATE public.dreams
        SET view_count = view_count + 1, views_count = views_count + 1
        WHERE id = p_dream_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- RPC 4: Semantic / Tag Discovery
CREATE OR REPLACE FUNCTION public.find_similar_dreams(target_dream_id TEXT, match_limit INT DEFAULT 6)
RETURNS SETOF public.dreams AS $$
DECLARE
    v_caller_id TEXT;
    v_tags TEXT[];
BEGIN
    v_caller_id := auth.uid()::text;
    IF NOT public.can_view_dream(target_dream_id, v_caller_id) THEN
        RETURN;
    END IF;

    SELECT tags INTO v_tags FROM public.dreams WHERE id = target_dream_id;
    IF v_tags IS NULL OR array_length(v_tags, 1) IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT d.*
    FROM public.dreams d
    WHERE d.id <> target_dream_id
      AND d.is_private = false
      AND d.is_followers_only = false
      AND (v_caller_id IS NULL OR NOT public.is_blocked(v_caller_id, d.user_id))
      AND d.tags && v_tags
    ORDER BY cardinality(ARRAY(SELECT unnest(d.tags) INTERSECT SELECT unnest(v_tags))) DESC, d.created_at DESC
    LIMIT LEAST(GREATEST(match_limit, 1), 20);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- RPC 5: PostGIS Coarse Geographic Radar
CREATE OR REPLACE FUNCTION public.get_nearby_dreams(
    user_lat NUMERIC,
    user_lng NUMERIC,
    radius_meters NUMERIC DEFAULT 50000,
    limit_count INT DEFAULT 20
)
RETURNS TABLE (
    share_id TEXT,
    dream_id TEXT,
    distance_band TEXT,
    location_name TEXT,
    published_at TIMESTAMPTZ,
    author_id TEXT,
    author_name TEXT,
    author_avatar TEXT
) AS $$
DECLARE
    v_caller_id TEXT;
    v_user_pt GEOGRAPHY;
    v_clamped_radius NUMERIC;
    v_clamped_limit INT;
BEGIN
    v_caller_id := auth.uid()::text;

    IF user_lat IS NULL OR user_lng IS NULL OR user_lat < -90.0 OR user_lat > 90.0 OR user_lng < -180.0 OR user_lng > 180.0 THEN
        RAISE EXCEPTION 'Invalid latitude/longitude coordinates.';
    END IF;

    v_clamped_radius := LEAST(GREATEST(COALESCE(radius_meters, 50000), 1000), 100000);
    v_clamped_limit := LEAST(GREATEST(COALESCE(limit_count, 20), 1), 50);
    v_user_pt := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

    RETURN QUERY
    SELECT 
        n.id AS share_id,
        n.dream_id,
        CASE 
            WHEN ST_Distance(n.location_geog, v_user_pt) <= 5000 THEN 'within_5km'
            WHEN ST_Distance(n.location_geog, v_user_pt) <= 15000 THEN 'within_15km'
            WHEN ST_Distance(n.location_geog, v_user_pt) <= 50000 THEN 'within_50km'
            ELSE 'same_region'
        END AS distance_band,
        n.location_name,
        n.published_at,
        p.id AS author_id,
        COALESCE(p.display_name, p.name, 'Dreamer') AS author_name,
        COALESCE(p.avatar_url, p.avatar) AS author_avatar
    FROM public.nearby_shares n
    JOIN public.dreams d ON d.id = n.dream_id
    JOIN public.profiles p ON p.id = n.user_id
    WHERE n.is_active = true
      AND n.expires_at > now()
      AND d.is_private = false
      AND d.is_followers_only = false
      AND (v_caller_id IS NULL OR NOT public.is_blocked(v_caller_id, d.user_id))
      AND ST_DWithin(n.location_geog, v_user_pt, v_clamped_radius)
    ORDER BY ST_Distance(n.location_geog, v_user_pt) ASC
    LIMIT v_clamped_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 21. ROW LEVEL SECURITY (RLS) POLICIES
-- ---------------------------------------------------------------------

-- Enable RLS across all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nearby_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.last_night_stories ENABLE ROW LEVEL SECURITY;

-- 21.1 Profiles
DROP POLICY IF EXISTS "Profiles readable if not blocked" ON public.profiles;
CREATE POLICY "Profiles readable if not blocked" ON public.profiles
    FOR SELECT USING (
        auth.uid() IS NULL OR NOT public.is_blocked(auth.uid()::text, id)
    );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid()::text = id OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid()::text = id OR auth.uid() IS NULL);

-- 21.2 Activities
DROP POLICY IF EXISTS "Activities readable by user" ON public.activities;
CREATE POLICY "Activities readable by user" ON public.activities
    FOR SELECT USING (auth.uid() IS NULL OR auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Activities insertable" ON public.activities;
CREATE POLICY "Activities insertable" ON public.activities
    FOR INSERT WITH CHECK (true);

-- 21.3 Dreams
DROP POLICY IF EXISTS "Dreams readable if authorized" ON public.dreams;
CREATE POLICY "Dreams readable if authorized" ON public.dreams
    FOR SELECT USING (public.can_view_dream(id, auth.uid()::text));

DROP POLICY IF EXISTS "Authors can insert dreams" ON public.dreams;
CREATE POLICY "Authors can insert dreams" ON public.dreams
    FOR INSERT WITH CHECK (auth.uid()::text = user_id OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Authors can update dreams" ON public.dreams;
CREATE POLICY "Authors can update dreams" ON public.dreams
    FOR UPDATE USING (auth.uid()::text = user_id OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Authors can delete dreams" ON public.dreams;
CREATE POLICY "Authors can delete dreams" ON public.dreams
    FOR DELETE USING (auth.uid()::text = user_id OR auth.uid() IS NULL);

-- 21.4 Dream Media
DROP POLICY IF EXISTS "Dream media inherits dream visibility" ON public.dream_media;
CREATE POLICY "Dream media inherits dream visibility" ON public.dream_media
    FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()::text));

DROP POLICY IF EXISTS "Authors can insert dream media" ON public.dream_media;
CREATE POLICY "Authors can insert dream media" ON public.dream_media
    FOR INSERT WITH CHECK (auth.uid()::text = user_id OR auth.uid() IS NULL);

-- 21.5 Clips
DROP POLICY IF EXISTS "Clips readable if dream accessible" ON public.clips;
CREATE POLICY "Clips readable if dream accessible" ON public.clips
    FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()::text));

DROP POLICY IF EXISTS "Authors can insert clips" ON public.clips;
CREATE POLICY "Authors can insert clips" ON public.clips
    FOR INSERT WITH CHECK (auth.uid()::text = user_id OR auth.uid() IS NULL);

-- 21.6 Comments
DROP POLICY IF EXISTS "Comments readable if dream accessible" ON public.comments;
CREATE POLICY "Comments readable if dream accessible" ON public.comments
    FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()::text));

DROP POLICY IF EXISTS "Users can insert comments" ON public.comments;
CREATE POLICY "Users can insert comments" ON public.comments
    FOR INSERT WITH CHECK (public.can_view_dream(dream_id, auth.uid()::text));

-- 21.7 Reactions
DROP POLICY IF EXISTS "Reactions readable if dream accessible" ON public.reactions;
CREATE POLICY "Reactions readable if dream accessible" ON public.reactions
    FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()::text));

DROP POLICY IF EXISTS "Users can insert own reactions" ON public.reactions;
CREATE POLICY "Users can insert own reactions" ON public.reactions
    FOR INSERT WITH CHECK (auth.uid()::text = user_id OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Users can delete own reactions" ON public.reactions;
CREATE POLICY "Users can delete own reactions" ON public.reactions
    FOR DELETE USING (auth.uid()::text = user_id OR auth.uid() IS NULL);

-- 21.8 Saves
DROP POLICY IF EXISTS "Users view own saves" ON public.saves;
CREATE POLICY "Users view own saves" ON public.saves
    FOR SELECT USING (auth.uid()::text = user_id OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Users can insert saves" ON public.saves;
CREATE POLICY "Users can insert saves" ON public.saves
    FOR INSERT WITH CHECK (auth.uid()::text = user_id OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Users can delete saves" ON public.saves;
CREATE POLICY "Users can delete saves" ON public.saves
    FOR DELETE USING (auth.uid()::text = user_id OR auth.uid() IS NULL);

-- 21.9 Conversations & Messages
DROP POLICY IF EXISTS "Participants view conversation" ON public.conversations;
CREATE POLICY "Participants view conversation" ON public.conversations
    FOR SELECT USING (
        auth.uid() IS NULL OR auth.uid()::text = user_low OR auth.uid()::text = user_high
    );

DROP POLICY IF EXISTS "Participants view messages" ON public.messages;
CREATE POLICY "Participants view messages" ON public.messages
    FOR SELECT USING (
        auth.uid() IS NULL 
        OR sender_id = auth.uid()::text 
        OR (thread_id IS NOT NULL AND thread_id ILIKE '%' || auth.uid()::text || '%')
        OR (conversation_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.conversation_participants cp 
            WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()::text
        ))
    );

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages
    FOR INSERT WITH CHECK (auth.uid()::text = sender_id OR auth.uid() IS NULL);

-- 21.10 Follows & Blocks
DROP POLICY IF EXISTS "Follows readable" ON public.follows;
CREATE POLICY "Follows readable" ON public.follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage own follows" ON public.follows;
CREATE POLICY "Manage own follows" ON public.follows
    FOR ALL USING (auth.uid()::text = follower_id OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "View own blocks" ON public.blocks;
CREATE POLICY "View own blocks" ON public.blocks
    FOR SELECT USING (auth.uid()::text = blocker_id OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Manage own blocks" ON public.blocks;
CREATE POLICY "Manage own blocks" ON public.blocks
    FOR ALL USING (auth.uid()::text = blocker_id OR auth.uid() IS NULL);

-- ---------------------------------------------------------------------
-- 22. SECURITY DEFINER PERMISSIONS & GRANTS
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_conversation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.toggle_reaction(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_reaction(TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_dream_view(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_dream_view(TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.find_similar_dreams(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_similar_dreams(TEXT, INT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_nearby_dreams(NUMERIC, NUMERIC, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nearby_dreams(NUMERIC, NUMERIC, NUMERIC, INT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_blocked(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked(TEXT, TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.can_view_dream(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_dream(TEXT, TEXT) TO anon, authenticated;

COMMIT;
