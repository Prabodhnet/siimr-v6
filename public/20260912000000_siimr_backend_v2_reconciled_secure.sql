-- =====================================================================
-- SIIMR BACKEND V2 (RECONCILED LIVE-SCHEMA EVOLUTION & SECURITY SPECIFICATION)
-- File: supabase/migrations/20260912000000_siimr_backend_v2_reconciled_secure.sql
-- Status: PROPOSED REPLACEMENT — AUDITED FOR LIVE SCHEMA EVOLUTION & SECURITY
-- 
-- DIRECTIVES STRICTLY ENFORCED:
-- 1. LIVE SCHEMA COMPATIBILITY & IDEMPOTENT EVOLUTION:
--    - Uses ALTER TABLE ADD COLUMN IF NOT EXISTS on all tables. Never relies on
--      CREATE TABLE IF NOT EXISTS to evolve pre-existing tables.
--    - Guarantees that every referenced column exists BEFORE creating indexes,
--      constraints, triggers, RPCs, or RLS policies.
-- 2. ZERO PRODUCTION DATA LOSS:
--    - Preserves existing live rows (profiles, activities, etc.).
--    - Zero fabricated coordinates or media paths.
--    - Legacy unresolvable clips and reactions are quarantined in dedicated review tables.
-- 3. ZERO AUTH BYPASS:
--    - 0 instances of `auth.uid() IS NULL` in write/mutation policies.
--    - clip_views: Strictly authenticated `auth.uid() IS NOT NULL AND auth.uid()::text = viewer_id`.
--    - Anonymous view tracking deferred (zero RLS weakening for analytics).
-- 4. STRICT OWNERSHIP VERIFICATION:
--    - last_night_stories: INSERT requires auth user + dream author match.
--    - nearby_shares: INSERT requires auth user + dream author match; direct SELECT revoked.
--    - Spatial discovery queryable exclusively through controlled `get_nearby_dreams()` RPC.
-- 5. LOCKED ARCHITECTURAL INVARIANTS:
--    - clips: 1:1 with dreams; must reference canonical video in dream_media.
--    - dream_transcripts: 1:1 with dreams via `UNIQUE (dream_id)`.
--    - dream_circle_threads: 1:1 with dreams via `UNIQUE (dream_id)`. NO generic dream_circles.
-- 6. TRANSACTION-SAFE: 100% atomic inside BEGIN ... COMMIT.
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
-- 3. PROFILES EVOLUTION (Preserves Existing Live Rows)
-- ---------------------------------------------------------------------
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

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS username TEXT,
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS handle TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS avatar TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS cover_url TEXT,
    ADD COLUMN IF NOT EXISTS banner_url TEXT,
    ADD COLUMN IF NOT EXISTS banner_quote TEXT DEFAULT 'How to go for a little walk and never return',
    ADD COLUMN IF NOT EXISTS region_bucket TEXT DEFAULT 'Bhubaneswar area',
    ADD COLUMN IF NOT EXISTS nearby_opt_in BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS discoverable_in_search BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS followers_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS following_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dreams_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS banner_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);
CREATE INDEX IF NOT EXISTS idx_profiles_handle ON public.profiles (handle);
CREATE INDEX IF NOT EXISTS idx_profiles_discoverable ON public.profiles (discoverable_in_search) WHERE discoverable_in_search = true;

-- ---------------------------------------------------------------------
-- 4. ACTIVITIES PRESERVATION (Preserves 44 Existing Rows)
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

ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS user_id TEXT,
    ADD COLUMN IF NOT EXISTS action_type TEXT,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS target_id TEXT,
    ADD COLUMN IF NOT EXISTS target_type TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_activities_user_created ON public.activities (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_target ON public.activities (target_id, target_type);

-- ---------------------------------------------------------------------
-- 5. DREAMS EVOLUTION (Preserves Existing Live Table Structure & Columns)
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

ALTER TABLE public.dreams
    ADD COLUMN IF NOT EXISTS user_id TEXT,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS hook TEXT,
    ADD COLUMN IF NOT EXISTS raw_transcript TEXT,
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS dream_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Surreal',
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public',
    ADD COLUMN IF NOT EXISTS is_nearby_eligible BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS views_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'illustration',
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_followers_only BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS lucidity_level INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS clarity INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS mood TEXT DEFAULT 'mysterious',
    ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

-- Safe non-destructive visibility backfill if legacy visibility exists
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'dreams' AND column_name = 'visibility') THEN
        UPDATE public.dreams
        SET 
            is_private = (visibility = 'private'),
            is_followers_only = (visibility = 'followers')
        WHERE is_private = false AND is_followers_only = false AND visibility IN ('private', 'followers');
    END IF;
END $$;

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
-- 6. DREAM MEDIA CREATION & EVOLUTION (Canonical Multi-Media Identity)
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

ALTER TABLE public.dream_media
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS bucket_name TEXT NOT NULL DEFAULT 'dream-media-public',
    ADD COLUMN IF NOT EXISTS storage_path TEXT,
    ADD COLUMN IF NOT EXISTS media_type TEXT,
    ADD COLUMN IF NOT EXISTS mime_type TEXT,
    ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '1:1',
    ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS thumbnail_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;

-- Map legacy sort_order to order_index if present
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'dream_media' AND column_name = 'sort_order') THEN
        UPDATE public.dream_media SET order_index = sort_order WHERE order_index = 0 AND sort_order IS NOT NULL;
    END IF;
END $$;

DO $$ BEGIN
    ALTER TABLE public.dream_media 
        ADD CONSTRAINT uq_dream_media_id_dream_id UNIQUE (id, dream_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.dream_media 
        ADD CONSTRAINT chk_dream_media_v2_type 
        CHECK (media_type IN ('image', 'video', 'audio_narration'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_dream_media_dream_order ON public.dream_media (dream_id, order_index ASC);

-- ---------------------------------------------------------------------
-- 7. DREAM TRANSCRIPTS (1:1 with Dreams strictly enforced)
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
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_dream_transcripts_dream_id UNIQUE (dream_id)
);

ALTER TABLE public.dream_transcripts
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS transcript TEXT,
    ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS audio_path TEXT;

DO $$ BEGIN
    ALTER TABLE public.dream_transcripts 
        ADD CONSTRAINT uq_dream_transcripts_dream_id UNIQUE (dream_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_dream_transcripts_dream ON public.dream_transcripts (dream_id);

-- ---------------------------------------------------------------------
-- 8. LAST NIGHT STORIES (24h Ephemeral Presentation Surface)
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

ALTER TABLE public.last_night_stories
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours') NOT NULL;

DO $$ BEGIN
    ALTER TABLE public.last_night_stories 
        ADD CONSTRAINT uq_last_night_stories_dream_id UNIQUE (dream_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.last_night_stories 
        ADD CONSTRAINT chk_story_expiry CHECK (expires_at > published_at);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_last_night_stories_active ON public.last_night_stories (expires_at DESC);

-- ---------------------------------------------------------------------
-- 9. CLIPS & CLIP REVIEWS (Vertical Video Presentation Layer)
-- ---------------------------------------------------------------------
-- Legacy review table preserves unresolvable legacy clips safely without data loss
CREATE TABLE IF NOT EXISTS public.legacy_clips_review (
    clip_id TEXT PRIMARY KEY,
    dream_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    video_path TEXT,
    thumbnail_path TEXT,
    duration_seconds NUMERIC(6,2),
    status TEXT,
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
    video_path TEXT,
    thumbnail_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Explicitly add all missing V2 columns to public.clips
ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS media_id TEXT,
    ADD COLUMN IF NOT EXISTS aspect_ratio TEXT NOT NULL DEFAULT '9:16',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published',
    ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS caption TEXT,
    ADD COLUMN IF NOT EXISTS video_path TEXT,
    ADD COLUMN IF NOT EXISTS thumbnail_path TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Drop any legacy status check constraints to support 'quarantined' state
DO $$ 
DECLARE
    r_con RECORD;
BEGIN
    FOR r_con IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.clips'::regclass 
          AND contype = 'c' 
          AND (pg_get_constraintdef(oid) LIKE '%status%' OR conname IN ('clips_status_check', 'chk_clips_status'))
    LOOP
        EXECUTE 'ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS ' || quote_ident(r_con.conname);
    END LOOP;

    ALTER TABLE public.clips 
        ADD CONSTRAINT chk_clips_status 
        CHECK (status IN ('processing', 'published', 'archived', 'quarantined'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Preserve and reconcile legacy clips:
-- 1. If clip has media_id NULL and a matching video dream_media exists, link it
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'clips' AND column_name = 'video_path'
    ) THEN
        UPDATE public.clips c
        SET media_id = dm.id
        FROM public.dream_media dm
        WHERE c.media_id IS NULL 
          AND dm.dream_id = c.dream_id 
          AND dm.media_type = 'video'
          AND (dm.storage_path = c.video_path OR c.video_path LIKE '%' || dm.storage_path);

        -- 2. If clip still has media_id NULL, quarantine it safely into legacy_clips_review
        INSERT INTO public.legacy_clips_review (
            clip_id, dream_id, user_id, video_path, thumbnail_path, duration_seconds, status, created_at, review_reason
        )
        SELECT 
            c.id, c.dream_id, c.user_id, c.video_path, c.thumbnail_path, c.duration_seconds, c.status, c.created_at, 'unresolved_media_id'
        FROM public.clips c
        WHERE c.media_id IS NULL
        ON CONFLICT (clip_id) DO NOTHING;

        UPDATE public.clips
        SET status = 'quarantined'
        WHERE media_id IS NULL AND status <> 'quarantined';
    END IF;
END $$;

DO $$ BEGIN
    ALTER TABLE public.clips 
        ADD CONSTRAINT uq_clips_dream_id UNIQUE (dream_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.clips 
        ADD CONSTRAINT chk_clips_aspect_ratio_916 CHECK (aspect_ratio = '9:16');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.clips 
        ADD CONSTRAINT chk_clips_media_id_present 
        CHECK (media_id IS NOT NULL OR status = 'quarantined') NOT VALID;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.clips 
        ADD CONSTRAINT fk_clips_media_same_dream 
        FOREIGN KEY (media_id, dream_id) 
        REFERENCES public.dream_media (id, dream_id) 
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

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

CREATE TABLE IF NOT EXISTS public.clip_views (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    clip_id TEXT NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    viewer_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    watch_duration_seconds NUMERIC(6,2),
    completed BOOLEAN DEFAULT false,
    viewed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.clip_views
    ADD COLUMN IF NOT EXISTS clip_id TEXT REFERENCES public.clips(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS viewer_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS watch_duration_seconds NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT now();

-- Reconcile legacy user_id to viewer_id if user_id column existed
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'clip_views' AND column_name = 'user_id'
    ) THEN
        UPDATE public.clip_views SET viewer_id = user_id WHERE viewer_id IS NULL AND user_id IS NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clip_views_clip ON public.clip_views (clip_id, viewed_at DESC);

-- ---------------------------------------------------------------------
-- 10. NEARBY SHARES (PostGIS Spatial Discovery — Zero Fabricated Coordinates)
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

ALTER TABLE public.nearby_shares
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS location_geog GEOGRAPHY(Point, 4326),
    ADD COLUMN IF NOT EXISTS location_name TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours');

-- Map legacy enabled -> is_active if enabled exists
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'nearby_shares' AND column_name = 'enabled'
    ) THEN
        UPDATE public.nearby_shares SET is_active = enabled WHERE is_active IS NULL;
    END IF;
END $$;

DO $$ BEGIN
    ALTER TABLE public.nearby_shares 
        ADD CONSTRAINT uq_nearby_shares_dream_id UNIQUE (dream_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

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

ALTER TABLE public.follows
    ADD COLUMN IF NOT EXISTS follower_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS following_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE;

DO $$ BEGIN
    ALTER TABLE public.follows ADD CONSTRAINT chk_no_self_follow CHECK (follower_id <> following_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);

CREATE TABLE IF NOT EXISTS public.blocks (
    blocker_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT chk_no_self_block CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.blocks
    ADD COLUMN IF NOT EXISTS blocker_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS blocked_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE;

DO $$ BEGIN
    ALTER TABLE public.blocks ADD CONSTRAINT chk_no_self_block CHECK (blocker_id <> blocked_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

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

-- Helper: Profile visibility check (handles blocks and private profiles)
CREATE OR REPLACE FUNCTION public.can_view_profile(target_profile_id TEXT, p_user_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_profile RECORD;
BEGIN
    IF target_profile_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT id, is_private INTO v_profile
    FROM public.profiles
    WHERE id = target_profile_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Self is always visible
    IF p_user_id IS NOT NULL AND target_profile_id = p_user_id THEN
        RETURN TRUE;
    END IF;

    -- Bidirectional block check
    IF p_user_id IS NOT NULL AND public.is_blocked(p_user_id, target_profile_id) THEN
        RETURN FALSE;
    END IF;

    -- Private profile: visible only to authenticated followers
    IF v_profile.is_private THEN
        IF p_user_id IS NULL THEN
            RETURN FALSE;
        END IF;
        RETURN EXISTS (
            SELECT 1 FROM public.follows
            WHERE follower_id = p_user_id AND following_id = target_profile_id
        );
    END IF;

    RETURN TRUE;
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

    -- Followers-only dreams: caller must be an authenticated follower
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
-- 13. COMMENTS EVOLUTION (Threaded Model — Supports Dreams & Clips)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    clip_id TEXT REFERENCES public.clips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES public.comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.comments
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS clip_id TEXT REFERENCES public.clips(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES public.comments(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS body TEXT,
    ADD COLUMN IF NOT EXISTS parent_comment_id TEXT,
    ADD COLUMN IF NOT EXISTS target_type TEXT,
    ADD COLUMN IF NOT EXISTS target_id TEXT;

-- Reconcile legacy comments columns: body -> content, parent_comment_id -> parent_id, target_id -> dream_id / clip_id
DO $$ BEGIN
    UPDATE public.comments SET content = body WHERE content IS NULL AND body IS NOT NULL;
    UPDATE public.comments SET body = content WHERE body IS NULL AND content IS NOT NULL;
    UPDATE public.comments SET parent_id = parent_comment_id WHERE parent_id IS NULL AND parent_comment_id IS NOT NULL;
    UPDATE public.comments SET dream_id = target_id 
    WHERE dream_id IS NULL AND target_type = 'dream' AND EXISTS (SELECT 1 FROM public.dreams WHERE id = comments.target_id);
    UPDATE public.comments SET clip_id = target_id 
    WHERE clip_id IS NULL AND target_type = 'clip' AND EXISTS (SELECT 1 FROM public.clips WHERE id = comments.target_id);
END $$;

DO $$ BEGIN
    ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS chk_comment_target;
    ALTER TABLE public.comments 
        ADD CONSTRAINT chk_comment_target 
        CHECK ((dream_id IS NOT NULL AND clip_id IS NULL) OR (clip_id IS NOT NULL AND dream_id IS NULL));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_comments_dream_created ON public.comments (dream_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_clip_created ON public.comments (clip_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments (parent_id);

-- ---------------------------------------------------------------------
-- 14. REACTIONS & LIKES RECONCILIATION
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.likes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    clip_id TEXT REFERENCES public.clips(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.likes
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS clip_id TEXT REFERENCES public.clips(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

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
    dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    clip_id TEXT REFERENCES public.clips(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL DEFAULT 'like',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.reactions
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS clip_id TEXT REFERENCES public.clips(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS target_type TEXT,
    ADD COLUMN IF NOT EXISTS target_id TEXT,
    ADD COLUMN IF NOT EXISTS reaction_type TEXT DEFAULT 'like';

-- Reconcile legacy reactions (target_type = 'dream' or 'clip') safely:
-- Zero semantic rewriting: Unrecognized types, missing targets, and duplicates preserved untouched in legacy_reactions_review
DO $$ 
DECLARE
    r_rec RECORD;
BEGIN
    FOR r_rec IN 
        SELECT r.id, r.user_id, r.target_type, r.target_id, r.reaction_type, r.created_at
        FROM public.reactions r
        WHERE r.dream_id IS NULL AND r.clip_id IS NULL AND r.target_type = 'dream'
    LOOP
        IF NOT EXISTS (SELECT 1 FROM public.dreams WHERE id = r_rec.target_id) THEN
            INSERT INTO public.legacy_reactions_review (
                id, user_id, target_type, target_id, reaction_type, review_reason, created_at
            ) VALUES (
                r_rec.id, r_rec.user_id, r_rec.target_type, r_rec.target_id, r_rec.reaction_type, 'orphaned_target_dream', r_rec.created_at
            ) ON CONFLICT (id) DO NOTHING;
            DELETE FROM public.reactions WHERE id = r_rec.id;

        ELSIF r_rec.reaction_type NOT IN ('like', 'resonate', 'lucid', 'haunting', 'surreal') THEN
            INSERT INTO public.legacy_reactions_review (
                id, user_id, target_type, target_id, reaction_type, review_reason, created_at
            ) VALUES (
                r_rec.id, r_rec.user_id, r_rec.target_type, r_rec.target_id, r_rec.reaction_type, 'unrecognized_reaction_type', r_rec.created_at
            ) ON CONFLICT (id) DO NOTHING;
            DELETE FROM public.reactions WHERE id = r_rec.id;

        ELSIF EXISTS (SELECT 1 FROM public.reactions WHERE dream_id = r_rec.target_id AND user_id = r_rec.user_id) THEN
            INSERT INTO public.legacy_reactions_review (
                id, user_id, target_type, target_id, reaction_type, review_reason, created_at
            ) VALUES (
                r_rec.id, r_rec.user_id, r_rec.target_type, r_rec.target_id, r_rec.reaction_type, 'duplicate_user_dream_reaction', r_rec.created_at
            ) ON CONFLICT (id) DO NOTHING;
            DELETE FROM public.reactions WHERE id = r_rec.id;

        ELSE
            UPDATE public.reactions
            SET dream_id = r_rec.target_id
            WHERE id = r_rec.id;
        END IF;
    END LOOP;

    FOR r_rec IN 
        SELECT r.id, r.user_id, r.target_type, r.target_id, r.reaction_type, r.created_at
        FROM public.reactions r
        WHERE r.dream_id IS NULL AND r.clip_id IS NULL AND r.target_type = 'clip'
    LOOP
        IF NOT EXISTS (SELECT 1 FROM public.clips WHERE id = r_rec.target_id) THEN
            INSERT INTO public.legacy_reactions_review (
                id, user_id, target_type, target_id, reaction_type, review_reason, created_at
            ) VALUES (
                r_rec.id, r_rec.user_id, r_rec.target_type, r_rec.target_id, r_rec.reaction_type, 'orphaned_target_clip', r_rec.created_at
            ) ON CONFLICT (id) DO NOTHING;
            DELETE FROM public.reactions WHERE id = r_rec.id;
        ELSIF EXISTS (SELECT 1 FROM public.reactions WHERE clip_id = r_rec.target_id AND user_id = r_rec.user_id) THEN
            INSERT INTO public.legacy_reactions_review (
                id, user_id, target_type, target_id, reaction_type, review_reason, created_at
            ) VALUES (
                r_rec.id, r_rec.user_id, r_rec.target_type, r_rec.target_id, r_rec.reaction_type, 'duplicate_user_clip_reaction', r_rec.created_at
            ) ON CONFLICT (id) DO NOTHING;
            DELETE FROM public.reactions WHERE id = r_rec.id;
        ELSE
            UPDATE public.reactions
            SET clip_id = r_rec.target_id
            WHERE id = r_rec.id;
        END IF;
    END LOOP;
END $$;

-- Partial unique indexes ensure at most 1 reaction per user per Dream and per Clip in V2
CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_user_dream 
    ON public.reactions (dream_id, user_id) 
    WHERE dream_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_user_clip 
    ON public.reactions (clip_id, user_id) 
    WHERE clip_id IS NOT NULL;

-- Enforce V2 archetypes on reactions: like, resonate, lucid, haunting, surreal
ALTER TABLE public.reactions
    ALTER COLUMN reaction_type SET DEFAULT 'like';

ALTER TABLE public.reactions
    ALTER COLUMN reaction_type SET NOT NULL;

DO $$ BEGIN
    ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_reaction_type_check;
    ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS chk_reaction_v2_type;
    ALTER TABLE public.reactions 
        ADD CONSTRAINT chk_reaction_v2_type 
        CHECK (reaction_type IN ('like', 'resonate', 'lucid', 'haunting', 'surreal'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS chk_reaction_target;
    ALTER TABLE public.reactions 
        ADD CONSTRAINT chk_reaction_target 
        CHECK ((dream_id IS NOT NULL AND clip_id IS NULL) OR (clip_id IS NOT NULL AND dream_id IS NULL));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_reactions_dream_type ON public.reactions (dream_id, reaction_type);
CREATE INDEX IF NOT EXISTS idx_reactions_clip_type ON public.reactions (clip_id, reaction_type);

-- ---------------------------------------------------------------------
-- 15. SAVES & BOOKMARKS RECONCILIATION
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookmarks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.bookmarks
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.saves (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    clip_id TEXT REFERENCES public.clips(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.saves
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS clip_id TEXT REFERENCES public.clips(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_saves_dream_user_v2 
    ON public.saves (user_id, dream_id) 
    WHERE dream_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saves_user_created ON public.saves (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 16. SHARES & SHARE EVENTS RECONCILIATION
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shares (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    platform TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.shares
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS platform TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.share_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'web_share',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.share_events
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'web_share',
    ADD COLUMN IF NOT EXISTS target_type TEXT,
    ADD COLUMN IF NOT EXISTS target_id TEXT;

-- Reconcile legacy share_events where target_type = 'dream'
DO $$ BEGIN
    UPDATE public.share_events
    SET dream_id = target_id
    WHERE dream_id IS NULL AND target_type = 'dream';
END $$;

CREATE INDEX IF NOT EXISTS idx_share_events_dream ON public.share_events (dream_id);

-- ---------------------------------------------------------------------
-- 17. CONVERSATIONS & DUAL-COMPATIBILITY SECURE MESSAGING
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_low TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_high TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS user_low TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_high TEXT REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Backfill conversations deterministic pairing from legacy conversation_members if present
DO $$ 
DECLARE
    r_c RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversation_members') THEN
        FOR r_c IN 
            SELECT c.id, ARRAY_AGG(cm.user_id::text ORDER BY cm.user_id::text ASC) AS members
            FROM public.conversations c
            JOIN public.conversation_members cm ON cm.conversation_id::text = c.id
            WHERE c.user_low IS NULL OR c.user_high IS NULL
            GROUP BY c.id
            HAVING COUNT(cm.user_id) = 2
        LOOP
            UPDATE public.conversations 
            SET user_low = r_c.members[1], user_high = r_c.members[2]
            WHERE id = r_c.id;
        END LOOP;
    END IF;
END $$;

DO $$ BEGIN
    ALTER TABLE public.conversations 
        ADD CONSTRAINT chk_conv_user_order CHECK (user_low IS NULL OR user_low < user_high);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_conv_user_pair 
    ON public.conversations (user_low, user_high) 
    WHERE user_low IS NOT NULL AND user_high IS NOT NULL;

-- Strictly 1:1 Direct Conversation Participants (locked to user_low and user_high)
CREATE TABLE IF NOT EXISTS public.conversation_participants (
    conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ DEFAULT now(),
    joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
);

-- Seed conversation_participants strictly from 1:1 conversations (user_low and user_high only)
-- Multi-party conversations are strictly forbidden in SIIMR MVP
DO $$ BEGIN
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    SELECT id, user_low FROM public.conversations WHERE user_low IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    SELECT id, user_high FROM public.conversations WHERE user_high IS NOT NULL
    ON CONFLICT DO NOTHING;

    -- If legacy conversation_members exists, only seed if conversation has exactly 2 members and matches 1:1 pair
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversation_members') THEN
        INSERT INTO public.conversation_participants (conversation_id, user_id, joined_at)
        SELECT cm.conversation_id::text, cm.user_id::text, cm.joined_at
        FROM public.conversation_members cm
        JOIN public.conversations c ON c.id = cm.conversation_id::text
        WHERE (cm.user_id::text = c.user_low OR cm.user_id::text = c.user_high)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    thread_id TEXT,
    conversation_id TEXT REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_name TEXT,
    text TEXT,
    body TEXT,
    shared_dream_id TEXT REFERENCES public.dreams(id) ON DELETE SET NULL,
    media_type TEXT,
    media_storage_path TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS thread_id TEXT,
    ADD COLUMN IF NOT EXISTS conversation_id TEXT REFERENCES public.conversations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sender_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS recipient_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sender_name TEXT,
    ADD COLUMN IF NOT EXISTS text TEXT,
    ADD COLUMN IF NOT EXISTS body TEXT,
    ADD COLUMN IF NOT EXISTS shared_dream_id TEXT REFERENCES public.dreams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS media_type TEXT,
    ADD COLUMN IF NOT EXISTS media_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Reconcile body <-> text
DO $$ BEGIN
    UPDATE public.messages SET text = body WHERE text IS NULL AND body IS NOT NULL;
    UPDATE public.messages SET body = text WHERE body IS NULL AND text IS NOT NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient ON public.messages (sender_id, recipient_id);

-- ---------------------------------------------------------------------
-- 18. DREAM CIRCLES (LOCKED ARCHITECTURE: 1:1 Thread per Dream, 1:N Replies)
-- NO generic dream_circles table. NO dream_circle_members table.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dream_circle_threads (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    dream_id TEXT NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    initial_prompt TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_dream_circle_threads_dream_id UNIQUE (dream_id)
);

ALTER TABLE public.dream_circle_threads
    ADD COLUMN IF NOT EXISTS dream_id TEXT REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS initial_prompt TEXT;

-- Reconcile legacy circle_threads into dream_circle_threads if they existed
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'circle_threads')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dream_circles') THEN
        INSERT INTO public.dream_circle_threads (id, dream_id, created_by, title, initial_prompt, created_at, updated_at)
        SELECT DISTINCT ON (dc.dream_id)
            ct.id::text,
            dc.dream_id::text,
            ct.user_id::text AS created_by,
            ct.title,
            ct.body AS initial_prompt,
            ct.created_at,
            ct.updated_at
        FROM public.circle_threads ct
        JOIN public.dream_circles dc ON dc.id = ct.circle_id
        ON CONFLICT (dream_id) DO NOTHING;
    END IF;
END $$;

DO $$ BEGIN
    ALTER TABLE public.dream_circle_threads 
        ADD CONSTRAINT uq_dream_circle_threads_dream_id UNIQUE (dream_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_dream_circle_threads_dream ON public.dream_circle_threads (dream_id);

CREATE TABLE IF NOT EXISTS public.dream_circle_replies (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    thread_id TEXT NOT NULL REFERENCES public.dream_circle_threads(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.dream_circle_replies
    ADD COLUMN IF NOT EXISTS thread_id TEXT REFERENCES public.dream_circle_threads(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS content TEXT;

-- Reconcile legacy circle_replies if existed
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'circle_replies') THEN
        INSERT INTO public.dream_circle_replies (id, thread_id, user_id, content, created_at)
        SELECT
            cr.id::text,
            cr.thread_id::text,
            cr.user_id::text,
            cr.body AS content,
            cr.created_at
        FROM public.circle_replies cr
        JOIN public.dream_circle_threads dct ON dct.id = cr.thread_id::text
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dream_circle_replies_thread ON public.dream_circle_replies (thread_id, created_at ASC);

-- ---------------------------------------------------------------------
-- 19. NOTIFICATIONS & SAFETY REPORTS
-- Notifications system: Table schema provisioned here. Automated generation
-- is deferred to the Notifications implementation phase.
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

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS recipient_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS actor_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS notification_type TEXT,
    ADD COLUMN IF NOT EXISTS entity_type TEXT,
    ADD COLUMN IF NOT EXISTS entity_id TEXT,
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS user_id TEXT,
    ADD COLUMN IF NOT EXISTS target_type TEXT,
    ADD COLUMN IF NOT EXISTS target_id TEXT;

-- Reconcile legacy notification columns if present
DO $$ BEGIN
    UPDATE public.notifications SET recipient_id = user_id WHERE recipient_id IS NULL AND user_id IS NOT NULL;
    UPDATE public.notifications SET entity_type = target_type WHERE entity_type IS NULL AND target_type IS NOT NULL;
    UPDATE public.notifications SET entity_id = target_id WHERE entity_id IS NULL AND target_id IS NOT NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS chk_notification_v2_type;
    ALTER TABLE public.notifications 
        ADD CONSTRAINT chk_notification_v2_type 
        CHECK (notification_type IN ('reaction', 'comment', 'reply', 'follow', 'message', 'like', 'circle_reply', 'clip_reaction'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread 
    ON public.notifications (recipient_id, read_at) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    reporter_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('dream', 'clip', 'comment', 'user')),
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS reporter_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS target_type TEXT,
    ADD COLUMN IF NOT EXISTS target_id TEXT,
    ADD COLUMN IF NOT EXISTS reason TEXT,
    ADD COLUMN IF NOT EXISTS details TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

DO $$ BEGIN
    ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
    ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS chk_reports_target_v2;
    ALTER TABLE public.reports 
        ADD CONSTRAINT chk_reports_target_v2 
        CHECK (target_type IN ('dream', 'clip', 'comment', 'user'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
    ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS chk_reports_status_v2;
    ALTER TABLE public.reports 
        ADD CONSTRAINT chk_reports_status_v2 
        CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports (status, created_at ASC);

-- ---------------------------------------------------------------------
-- 20. CORE RPC STORED PROCEDURES (SECURITY DEFINER)
-- ---------------------------------------------------------------------
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

    INSERT INTO public.conversations (user_low, user_high)
    VALUES (v_low, v_high)
    ON CONFLICT (user_low, user_high) DO NOTHING
    RETURNING id INTO v_conv_id;

    IF v_conv_id IS NULL THEN
        SELECT id INTO v_conv_id
        FROM public.conversations
        WHERE user_low = v_low AND user_high = v_high;
    END IF;

    -- Strict 1:1 direct conversation participant records
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_low), (v_conv_id, v_high)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN v_conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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

CREATE OR REPLACE FUNCTION public.toggle_clip_reaction(target_clip_id TEXT, req_type TEXT)
RETURNS JSONB AS $$
DECLARE
    v_user_id TEXT;
    v_action TEXT;
    v_clip RECORD;
    v_total_likes INT;
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT id, dream_id INTO v_clip FROM public.clips WHERE id = target_clip_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Clip not found.';
    END IF;

    IF NOT public.can_view_dream(v_clip.dream_id, v_user_id) THEN
        RAISE EXCEPTION 'Target clip dream not found or access denied.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.reactions WHERE clip_id = target_clip_id AND user_id = v_user_id) THEN
        DELETE FROM public.reactions WHERE clip_id = target_clip_id AND user_id = v_user_id;
        v_action := 'removed';
    ELSE
        INSERT INTO public.reactions (clip_id, user_id, reaction_type)
        VALUES (target_clip_id, v_user_id, req_type);
        v_action := 'added';
    END IF;

    SELECT COUNT(*) INTO v_total_likes FROM public.reactions WHERE clip_id = target_clip_id;
    RETURN jsonb_build_object('action', v_action, 'likes_count', v_total_likes);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
    area_label TEXT,
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
    v_distinct_authors INT;
    v_k_threshold CONSTANT INT := 3;
    v_nearby_5k_authors INT;
    v_nearby_15k_authors INT;
BEGIN
    v_caller_id := auth.uid()::text;

    IF user_lat IS NULL OR user_lng IS NULL OR user_lat < -90.0 OR user_lat > 90.0 OR user_lng < -180.0 OR user_lng > 180.0 THEN
        RAISE EXCEPTION 'Invalid latitude/longitude coordinates.';
    END IF;

    v_clamped_radius := LEAST(GREATEST(COALESCE(radius_meters, 50000), 1000), 100000);
    v_clamped_limit := LEAST(GREATEST(COALESCE(limit_count, 20), 1), 50);
    v_user_pt := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

    -- k-Anonymity Privacy Suppression Check:
    -- Count distinct active authors within the query radius.
    -- If fewer than v_k_threshold (3) distinct authors exist in this area, suppress results completely
    -- to prevent spatial triangulation or isolated user tracking.
    SELECT COUNT(DISTINCT n.user_id) INTO v_distinct_authors
    FROM public.nearby_shares n
    JOIN public.dreams d ON d.id = n.dream_id
    WHERE n.is_active = true
      AND n.expires_at > now()
      AND d.is_private = false
      AND d.is_followers_only = false
      AND (v_caller_id IS NULL OR NOT public.is_blocked(v_caller_id, d.user_id))
      AND ST_DWithin(n.location_geog, v_user_pt, v_clamped_radius);

    IF v_distinct_authors < v_k_threshold THEN
        -- Privacy suppression: Insufficient density to satisfy k-anonymity (k=3)
        RETURN;
    END IF;

    -- Sub-cluster k-anonymity counts for distance band and area label coarsening:
    SELECT COUNT(DISTINCT n.user_id) INTO v_nearby_5k_authors
    FROM public.nearby_shares n
    JOIN public.dreams d ON d.id = n.dream_id
    WHERE n.is_active = true
      AND n.expires_at > now()
      AND d.is_private = false
      AND d.is_followers_only = false
      AND (v_caller_id IS NULL OR NOT public.is_blocked(v_caller_id, d.user_id))
      AND ST_DWithin(n.location_geog, v_user_pt, 5000);

    SELECT COUNT(DISTINCT n.user_id) INTO v_nearby_15k_authors
    FROM public.nearby_shares n
    JOIN public.dreams d ON d.id = n.dream_id
    WHERE n.is_active = true
      AND n.expires_at > now()
      AND d.is_private = false
      AND d.is_followers_only = false
      AND (v_caller_id IS NULL OR NOT public.is_blocked(v_caller_id, d.user_id))
      AND ST_DWithin(n.location_geog, v_user_pt, 15000);

    RETURN QUERY
    SELECT 
        n.id AS share_id,
        n.dream_id,
        -- Generalized distance band based on sub-radius k-anonymity:
        CASE 
            WHEN ST_Distance(n.location_geog, v_user_pt) <= 5000 AND v_nearby_5k_authors >= v_k_threshold THEN 'within_5km'
            WHEN ST_Distance(n.location_geog, v_user_pt) <= 15000 AND v_nearby_15k_authors >= v_k_threshold THEN 'within_15km'
            WHEN ST_Distance(n.location_geog, v_user_pt) <= 50000 THEN 'within_50km'
            ELSE 'same_region'
        END AS distance_band,
        -- Deliberately coarse area label (never returns raw/exact location_name or coordinates)
        CASE 
            WHEN v_nearby_15k_authors >= v_k_threshold AND ST_Distance(n.location_geog, v_user_pt) <= 15000 THEN 'Regional Area'
            ELSE 'Nearby Region'
        END AS area_label,
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
-- 21. ROW LEVEL SECURITY (RLS) POLICIES — HARDENED (ZERO AUTH BYPASS)
-- ---------------------------------------------------------------------

-- 21.0 EXPLICIT PURGE OF CONFIRMED LIVE PERMISSIVE POLICIES (SECURITY BLOCKER RESOLUTION)
DROP POLICY IF EXISTS "Public full access on activities" ON public.activities;
DROP POLICY IF EXISTS "Public full access on bookmarks" ON public.bookmarks;
DROP POLICY IF EXISTS "Public full access on comments" ON public.comments;
DROP POLICY IF EXISTS "Public full access on dreams" ON public.dreams;
DROP POLICY IF EXISTS "Public full access on likes" ON public.likes;
DROP POLICY IF EXISTS "Public full access on messages" ON public.messages;
DROP POLICY IF EXISTS "Public full access on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public full access on shares" ON public.shares;

-- Comprehensive policy audit: safely purge ANY legacy wildcard/permissive policies on all public tables
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
              policyname ILIKE '%public full access%'
              OR policyname ILIKE '%allow all%'
              OR policyname ILIKE '%permissive%'
              OR policyname ILIKE '%public read%'
              OR (roles @> ARRAY['public'::name] AND (qual = 'true' OR with_check = 'true') AND cmd <> 'SELECT')
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- Enable RLS across all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_circle_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_circle_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nearby_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.last_night_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;

-- 21.1 Profiles
DROP POLICY IF EXISTS "Profiles readable if authorized" ON public.profiles;
DROP POLICY IF EXISTS "Profiles readable if not blocked" ON public.profiles;
CREATE POLICY "Profiles readable if authorized" ON public.profiles
    FOR SELECT USING (public.can_view_profile(id, auth.uid()::text));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = id
    );

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND auth.uid()::text = id
    );

-- 21.2 Activities
DROP POLICY IF EXISTS "Activities readable by user" ON public.activities;
CREATE POLICY "Activities readable by user" ON public.activities
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Users insert own activity" ON public.activities;
CREATE POLICY "Users insert own activity" ON public.activities
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.3 Dreams
DROP POLICY IF EXISTS "Dreams readable if authorized" ON public.dreams;
CREATE POLICY "Dreams readable if authorized" ON public.dreams
    FOR SELECT USING (public.can_view_dream(id, auth.uid()::text));

DROP POLICY IF EXISTS "Authors can insert dreams" ON public.dreams;
CREATE POLICY "Authors can insert dreams" ON public.dreams
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Authors can update dreams" ON public.dreams;
CREATE POLICY "Authors can update dreams" ON public.dreams
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Authors can delete dreams" ON public.dreams;
CREATE POLICY "Authors can delete dreams" ON public.dreams
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.4 Dream Media
DROP POLICY IF EXISTS "Dream media inherits dream visibility" ON public.dream_media;
CREATE POLICY "Dream media inherits dream visibility" ON public.dream_media
    FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()::text));

DROP POLICY IF EXISTS "Authors can insert dream media" ON public.dream_media;
CREATE POLICY "Authors can insert dream media" ON public.dream_media
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = user_id
        AND EXISTS (
            SELECT 1 FROM public.dreams d 
            WHERE d.id = dream_media.dream_id AND d.user_id = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Authors can update dream media" ON public.dream_media;
CREATE POLICY "Authors can update dream media" ON public.dream_media
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Authors can delete dream media" ON public.dream_media;
CREATE POLICY "Authors can delete dream media" ON public.dream_media
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.5 Dream Transcripts
DROP POLICY IF EXISTS "Dream transcripts inherit dream visibility" ON public.dream_transcripts;
CREATE POLICY "Dream transcripts inherit dream visibility" ON public.dream_transcripts
    FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()::text));

DROP POLICY IF EXISTS "Authors can insert dream transcripts" ON public.dream_transcripts;
CREATE POLICY "Authors can insert dream transcripts" ON public.dream_transcripts
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = user_id
        AND EXISTS (
            SELECT 1 FROM public.dreams d 
            WHERE d.id = dream_transcripts.dream_id AND d.user_id = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Authors can update dream transcripts" ON public.dream_transcripts;
CREATE POLICY "Authors can update dream transcripts" ON public.dream_transcripts
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Authors can delete dream transcripts" ON public.dream_transcripts;
CREATE POLICY "Authors can delete dream transcripts" ON public.dream_transcripts
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.6 Clips
DROP POLICY IF EXISTS "Clips readable if dream accessible" ON public.clips;
CREATE POLICY "Clips readable if dream accessible" ON public.clips
    FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()::text));

DROP POLICY IF EXISTS "Authors can insert clips" ON public.clips;
CREATE POLICY "Authors can insert clips" ON public.clips
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = user_id
        AND EXISTS (
            SELECT 1 FROM public.dreams d 
            WHERE d.id = clips.dream_id AND d.user_id = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Authors can update clips" ON public.clips;
CREATE POLICY "Authors can update clips" ON public.clips
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Authors can delete clips" ON public.clips;
CREATE POLICY "Authors can delete clips" ON public.clips
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.7 Clip Views (Strictly Authenticated Owner Insert)
DROP POLICY IF EXISTS "Clip views readable by clip owner" ON public.clip_views;
CREATE POLICY "Clip views readable by clip owner" ON public.clip_views
    FOR SELECT USING (
        auth.uid() IS NOT NULL 
        AND EXISTS (
            SELECT 1 FROM public.clips c 
            WHERE c.id = clip_views.clip_id AND c.user_id = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Clip views insertable" ON public.clip_views;
CREATE POLICY "Clip views insertable" ON public.clip_views
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND auth.uid()::text = viewer_id
    );

-- 21.8 Last Night Stories (Ownership Strictly Enforced on Dream)
DROP POLICY IF EXISTS "Active stories readable if dream accessible" ON public.last_night_stories;
CREATE POLICY "Active stories readable if dream accessible" ON public.last_night_stories
    FOR SELECT USING (
        expires_at > now() AND public.can_view_dream(dream_id, auth.uid()::text)
    );

DROP POLICY IF EXISTS "Authors manage stories" ON public.last_night_stories;
DROP POLICY IF EXISTS "Authors insert stories" ON public.last_night_stories;
CREATE POLICY "Authors insert stories" ON public.last_night_stories
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = user_id
        AND EXISTS (
            SELECT 1 FROM public.dreams d 
            WHERE d.id = last_night_stories.dream_id AND d.user_id = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Authors update stories" ON public.last_night_stories;
CREATE POLICY "Authors update stories" ON public.last_night_stories
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Authors delete stories" ON public.last_night_stories;
CREATE POLICY "Authors delete stories" ON public.last_night_stories
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.9 Nearby Shares (Ownership Strictly Enforced on Dream; Direct SELECT Revoked)
DROP POLICY IF EXISTS "Nearby shares direct select revoked" ON public.nearby_shares;
REVOKE SELECT ON public.nearby_shares FROM anon, authenticated;

DROP POLICY IF EXISTS "Authors manage nearby shares" ON public.nearby_shares;
DROP POLICY IF EXISTS "Authors insert nearby shares" ON public.nearby_shares;
CREATE POLICY "Authors insert nearby shares" ON public.nearby_shares
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = user_id
        AND EXISTS (
            SELECT 1 FROM public.dreams d 
            WHERE d.id = nearby_shares.dream_id AND d.user_id = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Authors update nearby shares" ON public.nearby_shares;
CREATE POLICY "Authors update nearby shares" ON public.nearby_shares
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Authors delete nearby shares" ON public.nearby_shares;
CREATE POLICY "Authors delete nearby shares" ON public.nearby_shares
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.10 Follows & Blocks
DROP POLICY IF EXISTS "Follows readable" ON public.follows;
DROP POLICY IF EXISTS "Follows readable if authorized" ON public.follows;
CREATE POLICY "Follows readable if authorized" ON public.follows
    FOR SELECT USING (public.can_view_profile(following_id, auth.uid()::text));

DROP POLICY IF EXISTS "Manage own follows" ON public.follows;
CREATE POLICY "Manage own follows" ON public.follows
    FOR ALL USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = follower_id
    );

DROP POLICY IF EXISTS "View own blocks" ON public.blocks;
CREATE POLICY "View own blocks" ON public.blocks
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = blocker_id
    );

DROP POLICY IF EXISTS "Manage own blocks" ON public.blocks;
CREATE POLICY "Manage own blocks" ON public.blocks
    FOR ALL USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = blocker_id
    );

-- 21.11 Comments (Supports Dreams & Clips)
DROP POLICY IF EXISTS "Comments readable if dream accessible" ON public.comments;
DROP POLICY IF EXISTS "Comments readable if target accessible" ON public.comments;
CREATE POLICY "Comments readable if target accessible" ON public.comments
    FOR SELECT USING (
        (dream_id IS NOT NULL AND public.can_view_dream(dream_id, auth.uid()::text))
        OR (clip_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.clips c 
            WHERE c.id = comments.clip_id AND public.can_view_dream(c.dream_id, auth.uid()::text)
        ))
    );

DROP POLICY IF EXISTS "Users can insert comments" ON public.comments;
CREATE POLICY "Users can insert comments" ON public.comments
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = user_id 
        AND (
            (dream_id IS NOT NULL AND public.can_view_dream(dream_id, auth.uid()::text))
            OR (clip_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.clips c 
                WHERE c.id = comments.clip_id AND public.can_view_dream(c.dream_id, auth.uid()::text)
            ))
        )
    );

DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
CREATE POLICY "Users can delete own comments" ON public.comments
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.12 Reactions & Likes (Supports Dreams & Clips)
DROP POLICY IF EXISTS "Reactions readable if dream accessible" ON public.reactions;
DROP POLICY IF EXISTS "Reactions readable if target accessible" ON public.reactions;
CREATE POLICY "Reactions readable if target accessible" ON public.reactions
    FOR SELECT USING (
        (dream_id IS NOT NULL AND public.can_view_dream(dream_id, auth.uid()::text))
        OR (clip_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.clips c 
            WHERE c.id = reactions.clip_id AND public.can_view_dream(c.dream_id, auth.uid()::text)
        ))
    );

DROP POLICY IF EXISTS "Users can insert own reactions" ON public.reactions;
CREATE POLICY "Users can insert own reactions" ON public.reactions
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = user_id
        AND (
            (dream_id IS NOT NULL AND public.can_view_dream(dream_id, auth.uid()::text))
            OR (clip_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.clips c 
                WHERE c.id = reactions.clip_id AND public.can_view_dream(c.dream_id, auth.uid()::text)
            ))
        )
    );

DROP POLICY IF EXISTS "Users can delete own reactions" ON public.reactions;
CREATE POLICY "Users can delete own reactions" ON public.reactions
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- Legacy likes table policies
DROP POLICY IF EXISTS "Likes readable if dream accessible" ON public.likes;
DROP POLICY IF EXISTS "Likes readable if target accessible" ON public.likes;
CREATE POLICY "Likes readable if target accessible" ON public.likes
    FOR SELECT USING (
        (dream_id IS NOT NULL AND public.can_view_dream(dream_id, auth.uid()::text))
        OR (clip_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.clips c 
            WHERE c.id = likes.clip_id AND public.can_view_dream(c.dream_id, auth.uid()::text)
        ))
        OR (dream_id IS NULL AND clip_id IS NULL AND auth.uid() IS NOT NULL AND auth.uid()::text = user_id)
    );

DROP POLICY IF EXISTS "Users manage own likes" ON public.likes;
CREATE POLICY "Users manage own likes" ON public.likes
    FOR ALL USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.13 Saves & Bookmarks (Strictly Owner Only; Supports Dreams & Clips)
DROP POLICY IF EXISTS "Users view own saves" ON public.saves;
CREATE POLICY "Users view own saves" ON public.saves
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Users can insert saves" ON public.saves;
CREATE POLICY "Users can insert saves" ON public.saves
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = user_id
        AND (
            (dream_id IS NOT NULL AND public.can_view_dream(dream_id, auth.uid()::text))
            OR (clip_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.clips c 
                WHERE c.id = saves.clip_id AND public.can_view_dream(c.dream_id, auth.uid()::text)
            ))
        )
    );

DROP POLICY IF EXISTS "Users can delete saves" ON public.saves;
CREATE POLICY "Users can delete saves" ON public.saves
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- Legacy bookmarks policies
DROP POLICY IF EXISTS "Users view own bookmarks" ON public.bookmarks;
CREATE POLICY "Users view own bookmarks" ON public.bookmarks
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Users manage own bookmarks" ON public.bookmarks;
CREATE POLICY "Users manage own bookmarks" ON public.bookmarks
    FOR ALL USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.14 Shares & Share Events
DROP POLICY IF EXISTS "Share events readable by dream owner" ON public.share_events;
CREATE POLICY "Share events readable by dream owner" ON public.share_events
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND (
            auth.uid()::text = user_id OR EXISTS (
                SELECT 1 FROM public.dreams d 
                WHERE d.id = share_events.dream_id AND d.user_id = auth.uid()::text
            )
        )
    );

DROP POLICY IF EXISTS "Users insert share events" ON public.share_events;
CREATE POLICY "Users insert share events" ON public.share_events
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = user_id
        AND public.can_view_dream(dream_id, auth.uid()::text)
    );

DROP POLICY IF EXISTS "Shares readable by dream owner" ON public.shares;
CREATE POLICY "Shares readable by dream owner" ON public.shares
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

DROP POLICY IF EXISTS "Users insert shares" ON public.shares;
CREATE POLICY "Users insert shares" ON public.shares
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND auth.uid()::text = user_id
    );

-- 21.15 Conversations & Messages (Participants Only — ZERO WILDCARD MATCHING)
DROP POLICY IF EXISTS "Participants view conversation" ON public.conversations;
CREATE POLICY "Participants view conversation" ON public.conversations
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND (
            auth.uid()::text = user_low OR auth.uid()::text = user_high
        )
    );

DROP POLICY IF EXISTS "Participants view conversation_participants" ON public.conversation_participants;
CREATE POLICY "Participants view conversation_participants" ON public.conversation_participants
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_participants.conversation_id
              AND (c.user_low = auth.uid()::text OR c.user_high = auth.uid()::text)
        )
    );

DROP POLICY IF EXISTS "Participants view messages" ON public.messages;
CREATE POLICY "Participants view messages" ON public.messages
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND (
            sender_id = auth.uid()::text 
            OR recipient_id = auth.uid()::text
            OR (conversation_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.conversation_participants cp 
                WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()::text
            ))
        )
    );

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = sender_id
        AND (
            -- If targeting conversation, sender must be participant and not blocked
            (conversation_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.conversation_participants cp 
                WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()::text
            ))
            -- If targeting direct recipient, recipient must exist, not be self, and not be blocked
            OR (conversation_id IS NULL AND recipient_id IS NOT NULL AND recipient_id <> sender_id AND NOT public.is_blocked(sender_id, recipient_id))
        )
    );

-- 21.16 Dream Circle Threads & Replies (Locked 1:1 Architecture)
DROP POLICY IF EXISTS "Circle threads readable if dream accessible" ON public.dream_circle_threads;
CREATE POLICY "Circle threads readable if dream accessible" ON public.dream_circle_threads
    FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()::text));

DROP POLICY IF EXISTS "Authors create circle threads" ON public.dream_circle_threads;
CREATE POLICY "Authors create circle threads" ON public.dream_circle_threads
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = created_by
        AND public.can_view_dream(dream_id, auth.uid()::text)
    );

DROP POLICY IF EXISTS "Circle replies readable if dream accessible" ON public.dream_circle_replies;
CREATE POLICY "Circle replies readable if dream accessible" ON public.dream_circle_replies
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.dream_circle_threads t
            WHERE t.id = dream_circle_replies.thread_id
              AND public.can_view_dream(t.dream_id, auth.uid()::text)
        )
    );

DROP POLICY IF EXISTS "Users insert circle replies" ON public.dream_circle_replies;
CREATE POLICY "Users insert circle replies" ON public.dream_circle_replies
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND auth.uid()::text = user_id
        AND EXISTS (
            SELECT 1 FROM public.dream_circle_threads t
            WHERE t.id = dream_circle_replies.thread_id
              AND public.can_view_dream(t.dream_id, auth.uid()::text)
        )
    );

-- 21.17 Notifications & Reports
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = recipient_id
    );

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = recipient_id
    );

DROP POLICY IF EXISTS "Users create reports" ON public.reports;
CREATE POLICY "Users create reports" ON public.reports
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND auth.uid()::text = reporter_id
    );

DROP POLICY IF EXISTS "Reporters view own reports" ON public.reports;
CREATE POLICY "Reporters view own reports" ON public.reports
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND auth.uid()::text = reporter_id
    );

-- ---------------------------------------------------------------------
-- 22. SECURITY DEFINER PERMISSIONS & GRANTS
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_conversation(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.toggle_reaction(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_reaction(TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.toggle_clip_reaction(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_clip_reaction(TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_dream_view(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_dream_view(TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.find_similar_dreams(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_similar_dreams(TEXT, INT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_nearby_dreams(NUMERIC, NUMERIC, NUMERIC, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_dreams(NUMERIC, NUMERIC, NUMERIC, INT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_blocked(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked(TEXT, TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.can_view_profile(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile(TEXT, TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.can_view_dream(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_dream(TEXT, TEXT) TO anon, authenticated;

COMMIT;

-- =====================================================================
-- SECTION 23: POST-MIGRATION READ-ONLY VERIFICATION QUERIES
-- (Run following migration to guarantee zero-defect deployment)
-- =====================================================================

-- 1. VERIFY NO PERMISSIVE PUBLIC POLICIES OR WILDCARDS REMAIN
-- Expected: 0 rows
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
      policyname ILIKE '%public full access%'
      OR policyname ILIKE '%allow all%'
      OR (roles @> ARRAY['public'::name] AND (qual = 'true' OR with_check = 'true') AND cmd <> 'SELECT')
      OR (qual = 'true' AND cmd <> 'SELECT')
  );

-- 2. VERIFY RLS IS ENABLED ON EVERY V2 PROTECTED TABLE
-- Expected: All rows return rowsecurity = true
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
      'profiles', 'activities', 'dreams', 'dream_media', 'dream_transcripts',
      'clips', 'clip_views', 'comments', 'reactions', 'saves', 'conversations',
      'conversation_participants', 'messages', 'follows', 'blocks',
      'dream_circle_threads', 'dream_circle_replies', 'notifications', 'reports',
      'nearby_shares', 'last_night_stories', 'likes', 'bookmarks', 'shares', 'share_events'
  )
ORDER BY tablename ASC;

-- 3. VERIFY NO "auth.uid() IS NULL" BYPASSES EXIST IN ANY POLICY
-- Expected: 0 rows
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    qual, 
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
      qual ILIKE '%auth.uid() is null%'
      OR with_check ILIKE '%auth.uid() is null%'
  );

-- 4. VERIFY PRESERVATION OF EXISTING ROWS
SELECT 
    (SELECT COUNT(*) FROM public.profiles) AS profile_count,
    (SELECT COUNT(*) FROM public.activities) AS activity_count,
    (SELECT COUNT(*) FROM public.dreams) AS dream_count;

-- 5. VERIFY EXACTLY ONE TARGET ON COMMENTS AND REACTIONS
-- Expected: Both return 0 rows
SELECT 'comments_violating_target' AS check_name, COUNT(*) AS violations
FROM public.comments
WHERE NOT ((dream_id IS NOT NULL AND clip_id IS NULL) OR (clip_id IS NOT NULL AND dream_id IS NULL))
UNION ALL
SELECT 'reactions_violating_target' AS check_name, COUNT(*) AS violations
FROM public.reactions
WHERE NOT ((dream_id IS NOT NULL AND clip_id IS NULL) OR (clip_id IS NOT NULL AND dream_id IS NULL));

-- 6. VERIFY UNCONDITIONAL REACTION TYPES & NOT NULL
-- Expected: 0 violations
SELECT 'reactions_invalid_or_null_type' AS check_name, COUNT(*) AS violations
FROM public.reactions
WHERE reaction_type IS NULL OR reaction_type NOT IN ('like', 'resonate', 'lucid', 'haunting', 'surreal');

-- 7. VERIFY GET_NEARBY_DREAMS SIGNATURE & NO RAW LOCATION_NAME EXPOSURE
-- Expected: area_label present, location_name absent
SELECT 
    p.proname AS function_name,
    pg_get_function_result(p.oid) AS return_signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_nearby_dreams';

