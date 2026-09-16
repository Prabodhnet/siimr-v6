-- =====================================================================
-- siimr — 05 Backend Schema (Data Model & Auth Architecture)
-- Production Supabase / PostgreSQL Migration
-- =====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. ENUMS AND DOMAINS
DO $$ BEGIN
    CREATE TYPE profile_visibility_type AS ENUM ('public', 'private');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE dream_privacy_type AS ENUM ('private', 'followers', 'public');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE dream_status_type AS ENUM ('draft', 'processing', 'ready', 'archived', 'deleted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE dream_source_type AS ENUM ('voice', 'text', 'import');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE dream_media_type AS ENUM ('audio', 'image');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE clip_privacy_type AS ENUM ('followers', 'public');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE clip_status_type AS ENUM ('draft', 'uploading', 'processing', 'ready', 'deleted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE reaction_type AS ENUM ('resonance');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE processing_job_type AS ENUM ('transcription', 'title', 'hook', 'motif', 'echo');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE processing_job_status_type AS ENUM ('queued', 'processing', 'complete', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE report_target_type AS ENUM ('dream', 'clip', 'reply', 'user');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE report_status_type AS ENUM ('open', 'reviewed', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE circle_status_type AS ENUM ('active', 'locked', 'deleted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. TABLES DEFINITION

-- 3.1 users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    bio TEXT NULL,
    avatar_path TEXT NULL,
    profile_visibility profile_visibility_type NOT NULL DEFAULT 'public',
    nearby_opt_in BOOLEAN NOT NULL DEFAULT false,
    region_bucket TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT username_format_check CHECK (username ~* '^[a-zA-Z0-9_]{3,30}$')
);

-- 3.2 dreams table
CREATE TABLE IF NOT EXISTS public.dreams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NULL,
    hook TEXT NULL,
    raw_text TEXT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    occurred_at TIMESTAMPTZ NULL,
    privacy dream_privacy_type NOT NULL DEFAULT 'public',
    status dream_status_type NOT NULL DEFAULT 'ready',
    source dream_source_type NOT NULL DEFAULT 'voice',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.3 dream_media table
CREATE TABLE IF NOT EXISTS public.dream_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    media_type dream_media_type NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    duration_ms INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.4 follows table
CREATE TABLE IF NOT EXISTS public.follows (
    follower_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    followed_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (follower_id, followed_id),
    CONSTRAINT no_self_follow CHECK (follower_id <> followed_id)
);

-- 3.5 clips table
CREATE TABLE IF NOT EXISTS public.clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    media_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    duration_ms INTEGER NULL,
    privacy clip_privacy_type NOT NULL DEFAULT 'public',
    status clip_status_type NOT NULL DEFAULT 'ready',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ NULL
);

-- 3.6 reactions table (Enforce exactly one target)
CREATE TABLE IF NOT EXISTS public.reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    dream_id UUID NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    clip_id UUID NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    type reaction_type NOT NULL DEFAULT 'resonance',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT exactly_one_target CHECK (
        (dream_id IS NOT NULL AND clip_id IS NULL) OR
        (dream_id IS NULL AND clip_id IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_user_dream ON public.reactions(user_id, dream_id, type) WHERE dream_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_user_clip ON public.reactions(user_id, clip_id, type) WHERE clip_id IS NOT NULL;

-- 3.7 replies table (Enforce exactly one reply target)
CREATE TABLE IF NOT EXISTS public.replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    dream_id UUID NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    clip_id UUID NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT exactly_one_reply_target CHECK (
        (dream_id IS NOT NULL AND clip_id IS NULL) OR
        (dream_id IS NULL AND clip_id IS NOT NULL)
    )
);

-- 3.8 saves table
CREATE TABLE IF NOT EXISTS public.saves (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (user_id, dream_id)
);

-- 3.9 nearby_eligibility table (Coarse region only, no live coordinates)
CREATE TABLE IF NOT EXISTS public.nearby_eligibility (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    region_bucket TEXT NOT NULL,
    cohort_date DATE NOT NULL DEFAULT CURRENT_DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.10 nearby_motif_counts table (Aggregated server-generated counts)
CREATE TABLE IF NOT EXISTS public.nearby_motif_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_bucket TEXT NOT NULL,
    night_date DATE NOT NULL,
    motif_key TEXT NOT NULL,
    display_label TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    minimum_threshold_met BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.11 nearby_dream_candidates table (Eligibility projection, not location-tracking)
CREATE TABLE IF NOT EXISTS public.nearby_dream_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    region_bucket TEXT NOT NULL,
    night_date DATE NOT NULL,
    eligible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.12 processing_jobs table
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    job_type processing_job_type NOT NULL,
    status processing_job_status_type NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    idempotency_key TEXT UNIQUE NOT NULL,
    last_error TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.13 reports table
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    target_type report_target_type NOT NULL,
    target_id UUID NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NULL,
    status report_status_type NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    resolved_at TIMESTAMPTZ NULL
);

-- 3.14 blocks table
CREATE TABLE IF NOT EXISTS public.blocks (
    blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

-- 3.15 dream_circles table (Approved Amendment: 1 Circle per Dream)
CREATE TABLE IF NOT EXISTS public.dream_circles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dream_id UUID UNIQUE NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
    status circle_status_type NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.16 circle_threads table
CREATE TABLE IF NOT EXISTS public.circle_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    circle_id UUID NOT NULL REFERENCES public.dream_circles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ NULL
);

-- 3.17 circle_replies table
CREATE TABLE IF NOT EXISTS public.circle_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.circle_threads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ NULL
);


-- 4. PERFORMANCE & QUERY INDEXES (SECTION 5 SPECIFICATION)

-- dreams
CREATE INDEX IF NOT EXISTS idx_dreams_user_captured ON public.dreams(user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_dreams_privacy_captured ON public.dreams(privacy, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_dreams_fts ON public.dreams USING gin(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(hook, '') || ' ' || coalesce(raw_text, ''))
);

-- follows
CREATE INDEX IF NOT EXISTS idx_follows_followed_follower ON public.follows(followed_id, follower_id);

-- clips
CREATE INDEX IF NOT EXISTS idx_clips_user_created ON public.clips(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_dream_created ON public.clips(dream_id, created_at DESC);

-- replies
CREATE INDEX IF NOT EXISTS idx_replies_dream_created ON public.replies(dream_id, created_at) WHERE dream_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_replies_clip_created ON public.replies(clip_id, created_at) WHERE clip_id IS NOT NULL;

-- saves
CREATE INDEX IF NOT EXISTS idx_saves_user_created ON public.saves(user_id, created_at DESC);

-- nearby motif aggregation
CREATE INDEX IF NOT EXISTS idx_nearby_motif_counts_region_date ON public.nearby_motif_counts(region_bucket, night_date);
CREATE INDEX IF NOT EXISTS idx_nearby_candidates_region_date ON public.nearby_dream_candidates(region_bucket, night_date, eligible);

-- moderation & jobs
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON public.reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status_created ON public.processing_jobs(status, created_at);

-- dream circle threads & replies
CREATE INDEX IF NOT EXISTS idx_circle_threads_circle_created ON public.circle_threads(circle_id, created_at);
CREATE INDEX IF NOT EXISTS idx_circle_replies_thread_created ON public.circle_replies(thread_id, created_at);


-- 5. ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS

CREATE OR REPLACE FUNCTION public.is_app_admin_or_mod()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        auth.jwt() ->> 'role' IN ('admin', 'moderator') OR
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'moderator')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_user_blocked(user_a UUID, user_b UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = user_a AND blocked_id = user_b)
           OR (blocker_id = user_b AND blocked_id = user_a)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_following_user(follower UUID, followed UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = follower AND followed_id = followed
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current authenticated user can read a given dream
CREATE OR REPLACE FUNCTION public.can_read_dream(target_dream_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    d_user_id UUID;
    d_privacy dream_privacy_type;
    d_status dream_status_type;
    curr_user UUID := auth.uid();
BEGIN
    SELECT user_id, privacy, status INTO d_user_id, d_privacy, d_status
    FROM public.dreams WHERE id = target_dream_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Deleted dreams are never readable
    IF d_status = 'deleted' THEN
        RETURN FALSE;
    END IF;

    -- Owner can always read
    IF curr_user = d_user_id THEN
        RETURN TRUE;
    END IF;

    -- Admins/mods can review non-deleted content
    IF public.is_app_admin_or_mod() THEN
        RETURN TRUE;
    END IF;

    -- If blocked by or blocking the author, deny
    IF curr_user IS NOT NULL AND public.is_user_blocked(curr_user, d_user_id) THEN
        RETURN FALSE;
    END IF;

    -- Private dreams only readable by owner
    IF d_privacy = 'private' THEN
        RETURN FALSE;
    END IF;

    -- Followers dreams require active follow relationship
    IF d_privacy = 'followers' THEN
        IF curr_user IS NULL THEN
            RETURN FALSE;
        END IF;
        RETURN public.is_following_user(curr_user, d_user_id);
    END IF;

    -- Public dreams
    RETURN (d_privacy = 'public');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current authenticated user can read a given clip
CREATE OR REPLACE FUNCTION public.can_read_clip(target_clip_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    c_user_id UUID;
    c_dream_id UUID;
    c_privacy clip_privacy_type;
    c_status clip_status_type;
    c_deleted TIMESTAMPTZ;
    curr_user UUID := auth.uid();
BEGIN
    SELECT user_id, dream_id, privacy, status, deleted_at
    INTO c_user_id, c_dream_id, c_privacy, c_status, c_deleted
    FROM public.clips WHERE id = target_clip_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF c_deleted IS NOT NULL OR c_status = 'deleted' THEN
        RETURN FALSE;
    END IF;

    -- Underlying dream MUST also be readable
    IF NOT public.can_read_dream(c_dream_id) THEN
        RETURN FALSE;
    END IF;

    -- Owner can always view
    IF curr_user = c_user_id THEN
        RETURN TRUE;
    END IF;

    -- Clip privacy check
    IF c_privacy = 'followers' THEN
        IF curr_user IS NULL THEN
            RETURN FALSE;
        END IF;
        RETURN public.is_following_user(curr_user, c_user_id);
    END IF;

    RETURN (c_privacy = 'public');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. ROW LEVEL SECURITY (RLS) POLICIES

-- 6.1 users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public users can view public profile fields"
    ON public.users FOR SELECT
    USING (
        profile_visibility = 'public'
        OR auth.uid() = id
        OR public.is_app_admin_or_mod()
    );

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile upon signup"
    ON public.users FOR INSERT
    WITH CHECK (auth.uid() = id);

-- 6.2 dreams
ALTER TABLE public.dreams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can perform all actions on own dreams"
    ON public.dreams FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Viewers can select accessible non-private dreams"
    ON public.dreams FOR SELECT
    USING (
        status <> 'deleted' AND
        public.can_read_dream(id)
    );

-- 6.3 dream_media
ALTER TABLE public.dream_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage dream media"
    ON public.dream_media FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Viewers can read media for accessible dreams"
    ON public.dream_media FOR SELECT
    USING (public.can_read_dream(dream_id));

-- 6.4 follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view follows unless blocked"
    ON public.follows FOR SELECT
    USING (
        NOT public.is_user_blocked(follower_id, auth.uid()) AND
        NOT public.is_user_blocked(followed_id, auth.uid())
    );

CREATE POLICY "Users can create their own follows"
    ON public.follows FOR INSERT
    WITH CHECK (auth.uid() = follower_id AND follower_id <> followed_id);

CREATE POLICY "Users can delete their own follows"
    ON public.follows FOR DELETE
    USING (auth.uid() = follower_id);

-- 6.5 clips
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can perform all actions on own clips"
    ON public.clips FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Viewers can select accessible non-deleted clips"
    ON public.clips FOR SELECT
    USING (
        deleted_at IS NULL AND
        status <> 'deleted' AND
        public.can_read_clip(id)
    );

-- 6.6 reactions
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions on accessible content"
    ON public.reactions FOR SELECT
    USING (
        (dream_id IS NOT NULL AND public.can_read_dream(dream_id)) OR
        (clip_id IS NOT NULL AND public.can_read_clip(clip_id))
    );

CREATE POLICY "Users can create own reaction"
    ON public.reactions FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        (
            (dream_id IS NOT NULL AND public.can_read_dream(dream_id)) OR
            (clip_id IS NOT NULL AND public.can_read_clip(clip_id))
        )
    );

CREATE POLICY "Users can delete own reaction"
    ON public.reactions FOR DELETE
    USING (auth.uid() = user_id);

-- 6.7 replies
ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view replies on accessible content"
    ON public.replies FOR SELECT
    USING (
        deleted_at IS NULL AND
        NOT public.is_user_blocked(user_id, auth.uid()) AND
        (
            (dream_id IS NOT NULL AND public.can_read_dream(dream_id)) OR
            (clip_id IS NOT NULL AND public.can_read_clip(clip_id))
        )
    );

CREATE POLICY "Users can insert own reply"
    ON public.replies FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        (
            (dream_id IS NOT NULL AND public.can_read_dream(dream_id)) OR
            (clip_id IS NOT NULL AND public.can_read_clip(clip_id))
        )
    );

CREATE POLICY "Users can update or soft-delete own reply"
    ON public.replies FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reply"
    ON public.replies FOR DELETE
    USING (auth.uid() = user_id);

-- 6.8 saves
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saves"
    ON public.saves FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can save accessible dreams"
    ON public.saves FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        public.can_read_dream(dream_id)
    );

CREATE POLICY "Users can remove own saves"
    ON public.saves FOR DELETE
    USING (auth.uid() = user_id);

-- 6.9 nearby_eligibility
ALTER TABLE public.nearby_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and manage own nearby eligibility"
    ON public.nearby_eligibility FOR ALL
    USING (auth.uid() = user_id);

-- 6.10 nearby_motif_counts
ALTER TABLE public.nearby_motif_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view aggregated motif counts meeting threshold"
    ON public.nearby_motif_counts FOR SELECT
    USING (minimum_threshold_met = true);

-- 6.11 nearby_dream_candidates
ALTER TABLE public.nearby_dream_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers can read candidates if dream is public and eligible"
    ON public.nearby_dream_candidates FOR SELECT
    USING (
        eligible = true AND
        public.can_read_dream(dream_id)
    );

-- 6.12 processing_jobs
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dream owner can view processing jobs"
    ON public.processing_jobs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.dreams
            WHERE dreams.id = processing_jobs.dream_id
              AND dreams.user_id = auth.uid()
        ) OR public.is_app_admin_or_mod()
    );

-- 6.13 reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit reports"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_user_id);

CREATE POLICY "Users can view reports they submitted"
    ON public.reports FOR SELECT
    USING (
        auth.uid() = reporter_user_id OR
        public.is_app_admin_or_mod()
    );

CREATE POLICY "Only admins/mods can update reports"
    ON public.reports FOR UPDATE
    USING (public.is_app_admin_or_mod());

-- 6.14 blocks
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and manage their own blocks"
    ON public.blocks FOR ALL
    USING (auth.uid() = blocker_id);

-- 6.15 dream_circles
ALTER TABLE public.dream_circles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view circles for accessible dreams"
    ON public.dream_circles FOR SELECT
    USING (
        status <> 'deleted' AND
        public.can_read_dream(dream_id)
    );

CREATE POLICY "Dream owners can manage circle state"
    ON public.dream_circles FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.dreams
            WHERE dreams.id = dream_circles.dream_id
              AND dreams.user_id = auth.uid()
        )
    );

-- 6.16 circle_threads
ALTER TABLE public.circle_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active threads on accessible circles"
    ON public.circle_threads FOR SELECT
    USING (
        deleted_at IS NULL AND
        EXISTS (
            SELECT 1 FROM public.dream_circles
            WHERE dream_circles.id = circle_threads.circle_id
              AND dream_circles.status <> 'deleted'
              AND public.can_read_dream(dream_circles.dream_id)
        ) AND
        NOT public.is_user_blocked(user_id, auth.uid())
    );

CREATE POLICY "Users can post threads on accessible circles"
    ON public.circle_threads FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.dream_circles
            WHERE dream_circles.id = circle_threads.circle_id
              AND dream_circles.status = 'active'
              AND public.can_read_dream(dream_circles.dream_id)
        )
    );

CREATE POLICY "Users can update or soft-delete own threads"
    ON public.circle_threads FOR UPDATE
    USING (auth.uid() = user_id);

-- 6.17 circle_replies
ALTER TABLE public.circle_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active replies on accessible threads"
    ON public.circle_replies FOR SELECT
    USING (
        deleted_at IS NULL AND
        EXISTS (
            SELECT 1 FROM public.circle_threads
            JOIN public.dream_circles ON dream_circles.id = circle_threads.circle_id
            WHERE circle_threads.id = circle_replies.thread_id
              AND circle_threads.deleted_at IS NULL
              AND dream_circles.status <> 'deleted'
              AND public.can_read_dream(dream_circles.dream_id)
        ) AND
        NOT public.is_user_blocked(user_id, auth.uid())
    );

CREATE POLICY "Users can post replies on active threads"
    ON public.circle_replies FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.circle_threads
            JOIN public.dream_circles ON dream_circles.id = circle_threads.circle_id
            WHERE circle_threads.id = circle_replies.thread_id
              AND circle_threads.deleted_at IS NULL
              AND dream_circles.status = 'active'
              AND public.can_read_dream(dream_circles.dream_id)
        )
    );

CREATE POLICY "Users can update or soft-delete own replies"
    ON public.circle_replies FOR UPDATE
    USING (auth.uid() = user_id);


-- 7. TRIGGERS & LIFECYCLE GUARDS

-- 7.1 Automatic updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_dreams_updated_at BEFORE UPDATE ON public.dreams FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_clips_updated_at BEFORE UPDATE ON public.clips FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_replies_updated_at BEFORE UPDATE ON public.replies FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON public.processing_jobs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_dream_circles_updated_at BEFORE UPDATE ON public.dream_circles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_circle_threads_updated_at BEFORE UPDATE ON public.circle_threads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_circle_replies_updated_at BEFORE UPDATE ON public.circle_replies FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7.2 Invariant: Clip visibility cannot exceed underlying Dream visibility
CREATE OR REPLACE FUNCTION public.validate_clip_privacy()
RETURNS TRIGGER AS $$
DECLARE
    parent_privacy dream_privacy_type;
BEGIN
    SELECT privacy INTO parent_privacy FROM public.dreams WHERE id = NEW.dream_id;
    IF parent_privacy = 'private' THEN
        RAISE EXCEPTION 'A Clip cannot be created for a private Dream';
    END IF;
    IF parent_privacy = 'followers' AND NEW.privacy = 'public' THEN
        RAISE EXCEPTION 'Clip visibility (public) cannot exceed Dream visibility (followers)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_clip_privacy_constraint
    BEFORE INSERT OR UPDATE OF privacy, dream_id ON public.clips
    FOR EACH ROW EXECUTE FUNCTION public.validate_clip_privacy();

-- 7.3 Automatically enqueue dream background processing jobs upon insert
CREATE OR REPLACE FUNCTION public.enqueue_dream_processing_jobs()
RETURNS TRIGGER AS $$
BEGIN
    -- Voice or text dreams queue AI-assist transcription/title/motif tasks
    INSERT INTO public.processing_jobs (dream_id, job_type, idempotency_key, status)
    VALUES
        (NEW.id, 'transcription', 'job_tx_' || NEW.id::text, 'queued'),
        (NEW.id, 'title', 'job_title_' || NEW.id::text, 'queued'),
        (NEW.id, 'hook', 'job_hook_' || NEW.id::text, 'queued'),
        (NEW.id, 'motif', 'job_motif_' || NEW.id::text, 'queued')
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- Automatically initialize Dream Circle layer
    INSERT INTO public.dream_circles (dream_id, status)
    VALUES (NEW.id, 'active')
    ON CONFLICT (dream_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_dream_created_queue_jobs
    AFTER INSERT ON public.dreams
    FOR EACH ROW EXECUTE FUNCTION public.enqueue_dream_processing_jobs();

-- 7.4 Immediate Cleanup when user opts out of Nearby
CREATE OR REPLACE FUNCTION public.on_nearby_optout()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.nearby_opt_in = true AND NEW.nearby_opt_in = false THEN
        UPDATE public.nearby_eligibility
        SET enabled = false, updated_at = timezone('utc'::text, now())
        WHERE user_id = NEW.id;

        DELETE FROM public.nearby_dream_candidates
        WHERE dream_id IN (SELECT id FROM public.dreams WHERE user_id = NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_nearby_optout
    AFTER UPDATE OF nearby_opt_in ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.on_nearby_optout();


-- 8. STORAGE BUCKET SPECIFICATION & ACCESS RULES
-- Layout:
-- private/dream-audio/{user_id}/{dream_id}/{asset_id}
-- private/dream-images/{user_id}/{dream_id}/{asset_id}
-- public/clip-media/{clip_id}/{asset_id}
-- public/avatars/{user_id}/{asset_id}

-- (Executed in Supabase Storage SQL extension if enabled)
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES
        ('dream-audio', 'dream-audio', false),
        ('dream-images', 'dream-images', false),
        ('clip-media', 'clip-media', true),
        ('avatars', 'avatars', true)
    ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
    -- In environments without storage schema pre-created, pass silently
    null;
END $$;
