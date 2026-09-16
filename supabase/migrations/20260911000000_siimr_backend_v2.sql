-- =====================================================================
-- SIIMR BACKEND V2: MIGRATION SPECIFICATION (CORRECTED PHASE 3.2)
-- File: supabase/migrations/20260911000000_siimr_backend_v2.sql
-- 
-- Status: PREPARED FOR MIGRATION (NON-DESTRUCTIVE FORWARD EVOLUTION)
-- Runs AFTER:
--   1. 20260905000000_siimr_backend_schema.sql
--   2. 20260908_siimr_production_schema.sql
-- 
-- Directives Enforced:
--   - ZERO DROP TABLE / ZERO DROP COLUMN / ZERO TRUNCATE / ZERO DELETE
--   - Operates idempotently on top of legacy schema
--   - 18-table canonical runtime architecture
--   - Canonical media_type: exactly 'image', 'video', 'audio_narration' (no 'audio')
--   - clips: media_id NOT NULL, aspect_ratio '9:16', composite FK (media_id, dream_id)
--   - clips: database enforcement of video type via trigger validating dream_media
--   - nearby_shares: spatial PostGIS, 24h, input validation, k-anonymity, distance bands
--   - conversations: race-safe get_or_create_direct_conversation() with ON CONFLICT
--   - All SECURITY DEFINER functions have SET search_path = public, pg_temp
--   - Explicit EXECUTE permissions granted (least privilege)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EXTENSIONS
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ---------------------------------------------------------------------
-- 2. ENUM / TYPE SAFETY EXPANSIONS
-- ---------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE reaction_v2_type AS ENUM ('like', 'resonate', 'lucid', 'haunting', 'surreal');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------
-- 3. PROFILES EVOLUTION (Table 1/18)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS banner_storage_path TEXT;

-- ---------------------------------------------------------------------
-- 4. DREAMS EVOLUTION (Table 2/18 - CANONICAL CONTENT OBJECT)
-- ---------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_dreams_privacy_user 
    ON public.dreams (is_private, user_id);

CREATE INDEX IF NOT EXISTS idx_dreams_mood_tags 
    ON public.dreams USING GIN (tags);

-- ---------------------------------------------------------------------
-- 5. DREAM MEDIA EVOLUTION (Table 3/18 - CANONICAL STORAGE IDENTITY)
-- ---------------------------------------------------------------------
ALTER TABLE public.dream_media
    ADD COLUMN IF NOT EXISTS bucket_name TEXT NOT NULL DEFAULT 'dream-media-public',
    ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '1:1',
    ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS thumbnail_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;

-- Composite uniqueness required for Clip integrity:
DO $$ BEGIN
    ALTER TABLE public.dream_media 
        ADD CONSTRAINT uq_dream_media_id_dream_id UNIQUE (id, dream_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

-- Section 1 Correction: Canonical media types MUST be exactly 'image', 'video', 'audio_narration'.
-- Safely drop legacy constraint dream_media_media_type_check from 20260908 schema which only allowed ('image', 'audio', 'video')
DO $$ BEGIN
    ALTER TABLE public.dream_media DROP CONSTRAINT IF EXISTS dream_media_media_type_check;
    ALTER TABLE public.dream_media DROP CONSTRAINT IF EXISTS chk_dream_media_v2_type;
    ALTER TABLE public.dream_media 
        ADD CONSTRAINT chk_dream_media_v2_type 
        CHECK (media_type IN ('image', 'video', 'audio_narration')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_dream_media_dream_order 
    ON public.dream_media (dream_id, order_index ASC);

-- ---------------------------------------------------------------------
-- 6. LAST NIGHT STORIES EVOLUTION (Table 4/18 - EPHEMERAL ASPECT)
-- ---------------------------------------------------------------------
-- Ownership derived authoritatively from dreams.user_id.
DO $$ BEGIN
    ALTER TABLE public.last_night_stories 
        ADD CONSTRAINT uq_last_night_stories_dream_id UNIQUE (dream_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.last_night_stories 
        ADD CONSTRAINT chk_story_expiry CHECK (expires_at > published_at);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_last_night_stories_active_v2 
    ON public.last_night_stories (expires_at DESC);

-- ---------------------------------------------------------------------
-- 7. CLIPS EVOLUTION (Table 5/18 - VERTICAL VIDEO PRESENTATION)
-- ---------------------------------------------------------------------
ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS media_id UUID,
    ADD COLUMN IF NOT EXISTS aspect_ratio TEXT NOT NULL DEFAULT '9:16';

-- Create explicit legacy review table for unresolvable clips
CREATE TABLE IF NOT EXISTS public.legacy_clips_review (
    clip_id UUID PRIMARY KEY,
    dream_id UUID NOT NULL,
    user_id UUID NOT NULL,
    video_path TEXT NOT NULL,
    thumbnail_path TEXT,
    duration_seconds INT,
    status TEXT,
    review_reason TEXT NOT NULL,
    quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Section 2 Correction: Explicitly replace legacy clips.status check constraint
-- to support 'quarantined' state while strictly preserving processing, published, archived semantics.
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

-- Section 2 Correction: Enforce canonical-media invariant on public.clips.
-- All active clips require media_id IS NOT NULL. Quarantined clips undergoing review retain NULL.
-- (NOT VALID permits existing legacy rows until backfill completes validation).
DO $$ BEGIN
    ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS chk_clips_media_id_present;
    ALTER TABLE public.clips 
        ADD CONSTRAINT chk_clips_media_id_present 
        CHECK (media_id IS NOT NULL OR status = 'quarantined') NOT VALID;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enforce aspect_ratio = '9:16'
DO $$ BEGIN
    ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS chk_clips_aspect_ratio_916;
    ALTER TABLE public.clips 
        ADD CONSTRAINT chk_clips_aspect_ratio_916 CHECK (aspect_ratio = '9:16');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enforce exactly one clip presentation per Dream:
DO $$ BEGIN
    ALTER TABLE public.clips 
        ADD CONSTRAINT uq_clips_dream_id UNIQUE (dream_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

-- Enforce each dream_media can be used in at most one clip:
DO $$ BEGIN
    ALTER TABLE public.clips 
        ADD CONSTRAINT uq_clips_media_id UNIQUE (media_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

-- COMPOSITE FOREIGN KEY: Guarantees clip media belongs to the exact same parent Dream:
DO $$ BEGIN
    ALTER TABLE public.clips 
        ADD CONSTRAINT fk_clips_media_same_dream 
        FOREIGN KEY (media_id, dream_id) 
        REFERENCES public.dream_media (id, dream_id) 
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Validation Trigger: Enforces Clip media must be video in dream_media
CREATE OR REPLACE FUNCTION public.validate_clip_media_is_video()
RETURNS TRIGGER AS $$
DECLARE
    v_media_type TEXT;
BEGIN
    -- Quarantined legacy clips undergoing review are exempt from active video validation
    IF NEW.status = 'quarantined' AND NEW.media_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.media_id IS NULL THEN
        RAISE EXCEPTION 'Clip must reference a media_id';
    END IF;

    SELECT media_type INTO v_media_type 
    FROM public.dream_media 
    WHERE id = NEW.media_id AND dream_id = NEW.dream_id;

    IF v_media_type IS NULL THEN
        RAISE EXCEPTION 'Referenced dream_media % not found for dream %', NEW.media_id, NEW.dream_id;
    END IF;

    IF v_media_type <> 'video' THEN
        RAISE EXCEPTION 'Clip media must be of type "video", found "%"', v_media_type;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_clip_media_video ON public.clips;
CREATE TRIGGER trg_validate_clip_media_video
BEFORE INSERT OR UPDATE ON public.clips
FOR EACH ROW EXECUTE FUNCTION public.validate_clip_media_is_video();

-- Also guard against updating dream_media.media_type away from 'video' if referenced by a clip:
CREATE OR REPLACE FUNCTION public.validate_dream_media_clip_reference()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.media_type <> 'video' AND OLD.media_type = 'video' THEN
        IF EXISTS (SELECT 1 FROM public.clips WHERE media_id = OLD.id) THEN
            RAISE EXCEPTION 'Cannot change media_type of % from video because it is referenced by a clip', OLD.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_dream_media_clip_reference ON public.dream_media;
CREATE TRIGGER trg_validate_dream_media_clip_reference
BEFORE UPDATE OF media_type ON public.dream_media
FOR EACH ROW EXECUTE FUNCTION public.validate_dream_media_clip_reference();

-- ---------------------------------------------------------------------
-- 8. NEARBY SHARES EVOLUTION (Table 6/18 - 24H SPATIAL DISCOVERY)
-- ---------------------------------------------------------------------
-- Coordinates remain 100% server-side. No fuzzed coordinates exposed.
ALTER TABLE public.nearby_shares
    ADD COLUMN IF NOT EXISTS location_geog GEOGRAPHY(Point, 4326),
    ADD COLUMN IF NOT EXISTS location_name TEXT,
    ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.nearby_shares 
    ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '24 hours');

DO $$ BEGIN
    ALTER TABLE public.nearby_shares 
        ADD CONSTRAINT uq_nearby_shares_dream_id UNIQUE (dream_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.nearby_shares 
        ADD CONSTRAINT chk_nearby_expiry CHECK (expires_at > shared_at);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_nearby_shares_spatial 
    ON public.nearby_shares USING GIST (location_geog);

CREATE INDEX IF NOT EXISTS idx_nearby_shares_active_expiry 
    ON public.nearby_shares (is_active, expires_at DESC);

-- ---------------------------------------------------------------------
-- 9. DREAM CIRCLE DISCUSSION LAYER (Tables 7/18 & 8/18)
-- ---------------------------------------------------------------------
-- Single-thread discussion per Dream. No generic circles/communities.
CREATE TABLE IF NOT EXISTS public.dream_circle_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    initial_prompt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dream_circle_threads_dream_id UNIQUE (dream_id)
);

CREATE TABLE IF NOT EXISTS public.dream_circle_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.dream_circle_threads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dream_circle_replies_thread 
    ON public.dream_circle_replies (thread_id, created_at ASC);

-- ---------------------------------------------------------------------
-- 10. COMMENTS EVOLUTION (Table 9/18 - SELF-REFERENTIAL REPLIES)
-- ---------------------------------------------------------------------
-- Comments support parent_id -> comments.id. There is NO separate replies table in V2.
ALTER TABLE public.comments
    ADD COLUMN IF NOT EXISTS dream_id UUID REFERENCES public.dreams(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_dream_id ON public.comments (dream_id);

-- ---------------------------------------------------------------------
-- 11. REACTIONS EVOLUTION (Table 10/18 - 5 APPROVED ARCHETYPES)
-- ---------------------------------------------------------------------
ALTER TABLE public.reactions
    ADD COLUMN IF NOT EXISTS dream_id UUID REFERENCES public.dreams(id) ON DELETE CASCADE;

-- Create explicit legacy review table for legacy/unrecognized/duplicate reactions
-- Preserves all original metadata: original reaction id, user_id, target_type, target_id, reaction_type, and original created_at
CREATE TABLE IF NOT EXISTS public.legacy_reactions_review (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID NOT NULL,
    reaction_type TEXT NOT NULL,
    review_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index: enforces at most 1 reaction per user per Dream in V2
CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_user_dream_partial 
    ON public.reactions (dream_id, user_id) 
    WHERE dream_id IS NOT NULL;

-- Enforce V2 archetype check ONLY on V2 dream reactions (dream_id IS NOT NULL),
-- leaving legacy reactions (dream_id IS NULL) fully intact with their original types.
DO $$ BEGIN
    ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_reaction_type_check;
    ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS chk_reaction_v2_type;
    ALTER TABLE public.reactions 
        ADD CONSTRAINT chk_reaction_v2_type 
        CHECK (dream_id IS NULL OR reaction_type IN ('like', 'resonate', 'lucid', 'haunting', 'surreal'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------
-- 12. SAVES EVOLUTION (Table 11/18 - PRIVATE BOOKMARKS)
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_saves_dream_user_v2 
    ON public.saves (dream_id, user_id) 
    WHERE dream_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 13. SOCIAL GRAPH: FOLLOWS & BLOCKS (Tables 12/18 & 13/18)
-- ---------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE public.follows ADD CONSTRAINT chk_no_self_follow CHECK (follower_id <> following_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.blocks ADD CONSTRAINT chk_no_self_block CHECK (blocker_id <> blocked_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------
-- 14. DIRECT MESSAGING SUBSYSTEM (Tables 14/18, 15/18, 16/18)
-- ---------------------------------------------------------------------
-- Enforce 1:1 conversation deterministic pairing: user_low < user_high
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS user_low UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_high UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

DO $$ BEGIN
    ALTER TABLE public.conversations 
        ADD CONSTRAINT chk_conv_user_order CHECK (user_low < user_high);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.conversations 
        ADD CONSTRAINT uq_conv_user_pair UNIQUE (user_low, user_high);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

-- Table 15/18: conversation_participants
CREATE TABLE IF NOT EXISTS public.conversation_participants (
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ DEFAULT now(),
    joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
);

-- Table 16/18: messages
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS shared_dream_id UUID REFERENCES public.dreams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS media_type TEXT,
    ADD COLUMN IF NOT EXISTS media_storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
    ON public.messages (conversation_id, created_at ASC);

-- ---------------------------------------------------------------------
-- 15. NOTIFICATIONS & REPORTS (Tables 17/18 & 18/18)
-- ---------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE public.notifications 
        DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
    ALTER TABLE public.notifications 
        ADD CONSTRAINT chk_notification_v2_type 
        CHECK (notification_type IN ('reaction', 'comment', 'reply', 'follow', 'message', 'like', 'circle_reply', 'clip_reaction'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.reports 
        DROP CONSTRAINT IF EXISTS reports_target_type_check;
    ALTER TABLE public.reports 
        ADD CONSTRAINT chk_reports_target_v2 
        CHECK (target_type IN ('dream', 'clip', 'comment', 'user'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------
-- 16. CORE BLOCK & ACCESS CHECK HELPERS (SECURITY DEFINER)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_blocked(user_a UUID, user_b UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF user_a IS NULL OR user_b IS NULL THEN
        RETURN false;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = user_a AND blocked_id = user_b)
           OR (blocker_id = user_b AND blocked_id = user_a)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Dream access validation helper (enforces is_private, is_followers_only, and blocks)
CREATE OR REPLACE FUNCTION public.can_view_dream(p_dream_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.dreams d
        WHERE d.id = p_dream_id
          AND (
              (d.is_private = false AND d.is_followers_only = false)
              OR (d.is_followers_only = true AND (
                  p_user_id = d.user_id 
                  OR EXISTS (
                      SELECT 1 FROM public.follows 
                      WHERE follower_id = p_user_id AND following_id = d.user_id
                  )
              ))
              OR d.user_id = p_user_id
          )
          AND NOT public.is_blocked(p_user_id, d.user_id)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 17. HARDENED SECURITY DEFINER RPCS
-- ---------------------------------------------------------------------

-- RPC 1: increment_dream_view
CREATE OR REPLACE FUNCTION public.increment_dream_view(target_dream_id UUID)
RETURNS VOID AS $$
BEGIN
    IF target_dream_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.dreams
    SET view_count = view_count + 1
    WHERE id = target_dream_id
      AND public.can_view_dream(id, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- RPC 2: toggle_reaction
CREATE OR REPLACE FUNCTION public.toggle_reaction(target_dream_id UUID, reaction_type TEXT)
RETURNS JSONB AS $$
DECLARE
    v_existing_type TEXT;
    v_counts JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF target_dream_id IS NULL THEN
        RAISE EXCEPTION 'Target dream ID cannot be null';
    END IF;

    IF reaction_type NOT IN ('like', 'resonate', 'lucid', 'haunting', 'surreal') THEN
        RAISE EXCEPTION 'Invalid reaction type: %', reaction_type;
    END IF;

    -- Verify Dream exists and verify visibility (strictly enforces public, followers-only, private, and blocking)
    IF NOT public.can_view_dream(target_dream_id, auth.uid()) THEN
        RAISE EXCEPTION 'Cannot react to this dream';
    END IF;

    -- Atomic Toggle / Switch / Delete
    SELECT r.reaction_type INTO v_existing_type
    FROM public.reactions r
    WHERE r.dream_id = target_dream_id AND r.user_id = auth.uid();

    IF v_existing_type IS NULL THEN
        INSERT INTO public.reactions (dream_id, user_id, reaction_type)
        VALUES (target_dream_id, auth.uid(), reaction_type);
    ELSIF v_existing_type = reaction_type THEN
        DELETE FROM public.reactions
        WHERE dream_id = target_dream_id AND user_id = auth.uid();
    ELSE
        UPDATE public.reactions
        SET reaction_type = toggle_reaction.reaction_type, created_at = now()
        WHERE dream_id = target_dream_id AND user_id = auth.uid();
    END IF;

    -- Return updated reaction counts
    SELECT COALESCE(jsonb_object_agg(r_type, cnt), '{}'::jsonb) INTO v_counts
    FROM (
        SELECT r.reaction_type AS r_type, COUNT(*) AS cnt
        FROM public.reactions r
        WHERE r.dream_id = target_dream_id
        GROUP BY r.reaction_type
    ) sub;

    RETURN jsonb_build_object(
        'user_reaction', (
            SELECT r.reaction_type 
            FROM public.reactions r 
            WHERE r.dream_id = target_dream_id AND r.user_id = auth.uid()
        ),
        'counts', v_counts
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- RPC 3: find_similar_dreams
CREATE OR REPLACE FUNCTION public.find_similar_dreams(target_dream_id UUID, limit_count INTEGER DEFAULT 6)
RETURNS TABLE (
    dream_id UUID,
    title TEXT,
    mood TEXT,
    lucidity_level INTEGER,
    shared_tags TEXT[],
    match_score FLOAT
) AS $$
DECLARE
    v_target_tags TEXT[];
    v_target_mood TEXT;
    v_is_private BOOLEAN;
    v_is_followers_only BOOLEAN;
    v_author_id UUID;
BEGIN
    IF target_dream_id IS NULL THEN
        RETURN;
    END IF;

    SELECT tags, mood, is_private, is_followers_only, user_id 
    INTO v_target_tags, v_target_mood, v_is_private, v_is_followers_only, v_author_id
    FROM public.dreams
    WHERE id = target_dream_id;

    -- Private and followers-only target dreams return empty set unless authorized
    IF v_author_id IS NULL 
       OR (v_is_private AND v_author_id <> auth.uid())
       OR (v_is_followers_only AND v_author_id <> auth.uid() AND NOT EXISTS (
           SELECT 1 FROM public.follows WHERE follower_id = auth.uid() AND following_id = v_author_id
       ))
       OR public.is_blocked(auth.uid(), v_author_id) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        d.id AS dream_id,
        d.title,
        d.mood,
        d.lucidity_level,
        ARRAY(SELECT unnest(d.tags) INTERSECT SELECT unnest(v_target_tags)) AS shared_tags,
        (
            (CASE WHEN d.mood = v_target_mood THEN 0.4 ELSE 0.0 END) +
            (COALESCE(cardinality(ARRAY(SELECT unnest(d.tags) INTERSECT SELECT unnest(v_target_tags))), 0) * 0.2)
        )::FLOAT AS match_score
    FROM public.dreams d
    WHERE d.id <> target_dream_id
      AND d.is_private = false
      AND d.is_followers_only = false
      AND (d.mood = v_target_mood OR d.tags && v_target_tags)
      AND NOT public.is_blocked(auth.uid(), d.user_id)
    ORDER BY match_score DESC, d.created_at DESC
    LIMIT LEAST(GREATEST(limit_count, 1), 20);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- RPC 4: get_or_create_direct_conversation
-- Section 7 Correction: Concurrent request race safety via atomic INSERT ... ON CONFLICT
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(other_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_low UUID;
    v_high UUID;
    v_conv_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF other_user_id IS NULL OR other_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Invalid conversation peer';
    END IF;

    IF public.is_blocked(auth.uid(), other_user_id) THEN
        RAISE EXCEPTION 'Direct conversation blocked';
    END IF;

    -- Deterministic order: user_low < user_high
    IF auth.uid() < other_user_id THEN
        v_low := auth.uid();
        v_high := other_user_id;
    ELSE
        v_low := other_user_id;
        v_high := auth.uid();
    END IF;

    -- Atomic find-or-create using INSERT ... ON CONFLICT (user_low, user_high) DO NOTHING
    INSERT INTO public.conversations (user_low, user_high)
    VALUES (v_low, v_high)
    ON CONFLICT (user_low, user_high) DO NOTHING
    RETURNING id INTO v_conv_id;

    -- If another transaction inserted concurrently, fetch the existing ID
    IF v_conv_id IS NULL THEN
        SELECT id INTO v_conv_id
        FROM public.conversations
        WHERE user_low = v_low AND user_high = v_high;
    END IF;

    -- Ensure participants are recorded idempotently
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES 
        (v_conv_id, v_low),
        (v_conv_id, v_high)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN v_conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- RPC 5: get_nearby_dreams
-- Section 8 Correction: Full input validation (reject NULL, NaN, Infinity, out-of-range lat/lng)
CREATE OR REPLACE FUNCTION public.get_nearby_dreams(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 15000,
    limit_count INTEGER DEFAULT 30
)
RETURNS TABLE (
    dream_id UUID,
    title TEXT,
    mood TEXT,
    lucidity_level INTEGER,
    coarse_area_name TEXT,
    distance_band TEXT
) AS $$
DECLARE
    v_user_pt GEOGRAPHY(Point, 4326);
    v_clamped_radius DOUBLE PRECISION;
    v_clamped_limit INTEGER;
    v_total_candidates INT;
BEGIN
    -- Strict geographic input validation
    IF user_lat IS NULL OR user_lng IS NULL THEN
        RAISE EXCEPTION 'Latitude and Longitude cannot be NULL';
    END IF;

    -- NaN and Infinity rejection
    IF user_lat = 'NaN'::DOUBLE PRECISION OR user_lng = 'NaN'::DOUBLE PRECISION THEN
        RAISE EXCEPTION 'Latitude and Longitude cannot be NaN';
    END IF;

    IF user_lat = 'Infinity'::DOUBLE PRECISION OR user_lat = '-Infinity'::DOUBLE PRECISION 
       OR user_lng = 'Infinity'::DOUBLE PRECISION OR user_lng = '-Infinity'::DOUBLE PRECISION THEN
        RAISE EXCEPTION 'Latitude and Longitude cannot be Infinity';
    END IF;

    IF user_lat < -90.0 OR user_lat > 90.0 THEN
        RAISE EXCEPTION 'Latitude must be between -90 and 90 degrees, received: %', user_lat;
    END IF;

    IF user_lng < -180.0 OR user_lng > 180.0 THEN
        RAISE EXCEPTION 'Longitude must be between -180 and 180 degrees, received: %', user_lng;
    END IF;

    -- Clamping radius: minimum 1,000 meters (1km), maximum 100,000 meters (100km)
    v_clamped_radius := LEAST(GREATEST(COALESCE(radius_meters, 15000), 1000), 100000);
    -- Clamping limit: minimum 1, maximum 50 (strict upper bound)
    v_clamped_limit := LEAST(GREATEST(COALESCE(limit_count, 30), 1), 50);

    v_user_pt := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

    -- Calculate total matching candidates for k-anonymity check
    SELECT COUNT(*) INTO v_total_candidates
    FROM public.nearby_shares n
    JOIN public.dreams d ON d.id = n.dream_id
    WHERE n.is_active = true
      AND n.expires_at > now()
      AND d.is_private = false
      AND d.is_followers_only = false
      AND ST_DWithin(n.location_geog, v_user_pt, v_clamped_radius)
      AND NOT public.is_blocked(auth.uid(), d.user_id);

    -- Return coarse distance bands; if density < 3, generalize band to preserve anonymity
    RETURN QUERY
    SELECT 
        d.id AS dream_id,
        d.title,
        d.mood,
        d.lucidity_level,
        COALESCE(n.location_name, 'Nearby Region') AS coarse_area_name,
        CASE 
            WHEN v_total_candidates < 3 THEN 'same_region'
            WHEN ST_Distance(n.location_geog, v_user_pt) <= 5000 THEN 'within_5km'
            WHEN ST_Distance(n.location_geog, v_user_pt) <= 15000 THEN 'within_15km'
            ELSE 'within_50km'
        END AS distance_band
    FROM public.nearby_shares n
    JOIN public.dreams d ON d.id = n.dream_id
    WHERE n.is_active = true
      AND n.expires_at > now()
      AND d.is_private = false
      AND d.is_followers_only = false
      AND ST_DWithin(n.location_geog, v_user_pt, v_clamped_radius)
      AND NOT public.is_blocked(auth.uid(), d.user_id)
    ORDER BY ST_Distance(n.location_geog, v_user_pt) ASC
    LIMIT v_clamped_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 18. RPC EXECUTE PERMISSION HARDENING (Section 9)
-- ---------------------------------------------------------------------
-- Revoke default public execution from all RPCs:
REVOKE EXECUTE ON FUNCTION public.increment_dream_view(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_reaction(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_similar_dreams(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_conversation(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_nearby_dreams(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_blocked(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_dream(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Grant to authenticated callers (all RPCs require/support authenticated user):
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_reaction(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_dream_view(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_similar_dreams(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_dreams(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_dream(UUID, UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 19. RLS HARDENING & VISIBILITY POLICIES (Audited in Section 11)
-- ---------------------------------------------------------------------

-- Enable RLS across all 18 tables:
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.last_night_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nearby_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_circle_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_circle_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 1. Profiles
DROP POLICY IF EXISTS "Profiles readable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Profiles readable if not blocked" ON public.profiles;
CREATE POLICY "Profiles readable if not blocked" ON public.profiles 
FOR SELECT USING (NOT public.is_blocked(auth.uid(), id));

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles 
FOR UPDATE USING (auth.uid() = id);

-- 2. Dreams
DROP POLICY IF EXISTS "Public dreams readable" ON public.dreams;
DROP POLICY IF EXISTS "Dreams readable if authorized" ON public.dreams;
CREATE POLICY "Dreams readable if authorized" ON public.dreams 
FOR SELECT USING (public.can_view_dream(id, auth.uid()));

-- 3. Dream Media (Inherits parent dream visibility)
DROP POLICY IF EXISTS "Dream media readable" ON public.dream_media;
DROP POLICY IF EXISTS "Dream media inherits dream visibility" ON public.dream_media;
CREATE POLICY "Dream media inherits dream visibility" ON public.dream_media
FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()));

DROP POLICY IF EXISTS "Authors insert dream media" ON public.dream_media;
CREATE POLICY "Authors insert dream media" ON public.dream_media
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.dreams d
        WHERE d.id = dream_media.dream_id AND d.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Authors modify dream media" ON public.dream_media;
CREATE POLICY "Authors modify dream media" ON public.dream_media
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.dreams d
        WHERE d.id = dream_media.dream_id AND d.user_id = auth.uid()
    )
);

-- 4. Last Night Stories (Active & unexpired, inherits dream visibility)
DROP POLICY IF EXISTS "Active stories readable" ON public.last_night_stories;
DROP POLICY IF EXISTS "Active stories readable if dream accessible" ON public.last_night_stories;
CREATE POLICY "Active stories readable if dream accessible" ON public.last_night_stories
FOR SELECT USING (
    expires_at > now() AND public.can_view_dream(dream_id, auth.uid())
);

DROP POLICY IF EXISTS "Users create own stories" ON public.last_night_stories;
DROP POLICY IF EXISTS "Authors manage stories" ON public.last_night_stories;
CREATE POLICY "Authors manage stories" ON public.last_night_stories
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.dreams d
        WHERE d.id = last_night_stories.dream_id AND d.user_id = auth.uid()
    )
);

-- 5. Clips (Inherits dream visibility)
DROP POLICY IF EXISTS "Published clips readable" ON public.clips;
DROP POLICY IF EXISTS "Clips readable if dream accessible" ON public.clips;
CREATE POLICY "Clips readable if dream accessible" ON public.clips
FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()));

DROP POLICY IF EXISTS "Users manage own clips" ON public.clips;
DROP POLICY IF EXISTS "Authors manage clips" ON public.clips;
CREATE POLICY "Authors manage clips" ON public.clips
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.dreams d
        WHERE d.id = clips.dream_id AND d.user_id = auth.uid()
    )
);

-- 6. Nearby Shares (Direct SELECT blocked; query via get_nearby_dreams RPC)
DROP POLICY IF EXISTS "Nearby shares readable" ON public.nearby_shares;
REVOKE SELECT ON public.nearby_shares FROM anon, authenticated;

DROP POLICY IF EXISTS "Authors manage nearby shares" ON public.nearby_shares;
CREATE POLICY "Authors manage nearby shares" ON public.nearby_shares
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.dreams d
        WHERE d.id = nearby_shares.dream_id AND d.user_id = auth.uid()
    )
);

-- 7. Dream Circle Threads & Replies
DROP POLICY IF EXISTS "Circle threads readable if dream accessible" ON public.dream_circle_threads;
CREATE POLICY "Circle threads readable if dream accessible" ON public.dream_circle_threads
FOR SELECT USING (public.can_view_dream(dream_id, auth.uid()));

DROP POLICY IF EXISTS "Users create circle threads" ON public.dream_circle_threads;
CREATE POLICY "Users create circle threads" ON public.dream_circle_threads
FOR INSERT WITH CHECK (
    auth.uid() = created_by AND public.can_view_dream(dream_id, auth.uid())
);

DROP POLICY IF EXISTS "Circle replies readable if thread accessible" ON public.dream_circle_replies;
CREATE POLICY "Circle replies readable if thread accessible" ON public.dream_circle_replies
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.dream_circle_threads t
        WHERE t.id = dream_circle_replies.thread_id
          AND public.can_view_dream(t.dream_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users insert circle replies" ON public.dream_circle_replies;
CREATE POLICY "Users insert circle replies" ON public.dream_circle_replies
FOR INSERT WITH CHECK (
    auth.uid() = user_id AND EXISTS (
        SELECT 1 FROM public.dream_circle_threads t
        WHERE t.id = dream_circle_replies.thread_id
          AND public.can_view_dream(t.dream_id, auth.uid())
    )
);

-- 8. Comments & Reactions
DROP POLICY IF EXISTS "Comments readable" ON public.comments;
DROP POLICY IF EXISTS "Comments readable if dream accessible" ON public.comments;
CREATE POLICY "Comments readable if dream accessible" ON public.comments
FOR SELECT USING (
    (dream_id IS NOT NULL AND public.can_view_dream(dream_id, auth.uid()))
    OR (dream_id IS NULL AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Reactions readable" ON public.reactions;
DROP POLICY IF EXISTS "Reactions readable if dream accessible" ON public.reactions;
CREATE POLICY "Reactions readable if dream accessible" ON public.reactions
FOR SELECT USING (
    (dream_id IS NOT NULL AND public.can_view_dream(dream_id, auth.uid()))
    OR (dream_id IS NULL AND user_id = auth.uid())
);

-- 9. Saves (Bookmarks - Strictly owner only)
DROP POLICY IF EXISTS "Users see own saves" ON public.saves;
DROP POLICY IF EXISTS "Owner only saves read" ON public.saves;
CREATE POLICY "Owner only saves read" ON public.saves
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own saves" ON public.saves;
DROP POLICY IF EXISTS "Owner only saves write" ON public.saves;
CREATE POLICY "Owner only saves write" ON public.saves
FOR ALL USING (auth.uid() = user_id);

-- 10. Conversations & Messages (Participants only)
DROP POLICY IF EXISTS "Conversation participants access" ON public.conversations;
CREATE POLICY "Conversation participants access" ON public.conversations
FOR SELECT USING (auth.uid() = user_low OR auth.uid() = user_high);

DROP POLICY IF EXISTS "Messages participant access" ON public.messages;
CREATE POLICY "Messages participant access" ON public.messages
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND (c.user_low = auth.uid() OR c.user_high = auth.uid())
    )
);

DROP POLICY IF EXISTS "Messages participant insert" ON public.messages;
CREATE POLICY "Messages participant insert" ON public.messages
FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND (c.user_low = auth.uid() OR c.user_high = auth.uid())
    )
);

-- 11. Reports (Reporter access only; review restricted to moderators/admins)
DROP POLICY IF EXISTS "Reports reporter access" ON public.reports;
CREATE POLICY "Reports reporter access" ON public.reports
FOR SELECT USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Reports insert" ON public.reports;
CREATE POLICY "Reports insert" ON public.reports
FOR INSERT WITH CHECK (auth.uid() = reporter_id);
