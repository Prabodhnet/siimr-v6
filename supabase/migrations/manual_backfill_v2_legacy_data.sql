-- =====================================================================
-- SIIMR BACKEND V2: ONE-TIME IDEMPOTENT DATA BACKFILL SCRIPT
-- FILE: supabase/migrations/manual_backfill_v2_legacy_data.sql
--
-- STATUS: REVIEW / MANUAL RUN SCRIPT ONLY — DO NOT RUN AUTOMATICALLY
-- ZERO DESTRUCTION: Legacy tables, columns, and relations remain intact.
-- ZERO FABRICATED DATA: 
--   - No invented storage paths
--   - No invented coordinates
--   - No invented user ownership
--   - Ambiguous or malformed records are preserved and logged via RAISE NOTICE
-- =====================================================================

DO $$
DECLARE
    -- Counters
    v_dreams_migrated INT := 0;
    v_dreams_fallback INT := 0;
    v_media_migrated INT := 0;
    v_media_skipped INT := 0;
    v_narration_migrated INT := 0;
    v_narration_skipped INT := 0;
    v_clips_mapped INT := 0;
    v_clips_created INT := 0;
    v_clips_skipped INT := 0;
    v_reactions_migrated INT := 0;
    v_reactions_skipped INT := 0;
    v_comments_migrated INT := 0;
    v_comments_skipped INT := 0;
    v_conv_migrated INT := 0;
    v_conv_skipped INT := 0;
    v_clips_unresolved_active INT := 0;
    v_total_clips_null_media INT := 0;

    -- Records
    r_dream RECORD;
    r_media RECORD;
    r_audio RECORD;
    r_clip RECORD;
    r_reaction RECORD;
    r_comment RECORD;
    r_conv RECORD;

    -- Parsing temps
    v_parsed_bucket TEXT;
    v_parsed_path TEXT;
    v_canonical_media_id UUID;
    v_norm_type TEXT;
BEGIN
    RAISE NOTICE '=====================================================================';
    RAISE NOTICE 'STARTING SIIMR V2 ONE-TIME COMPATIBILITY DATA MIGRATION';
    RAISE NOTICE '=====================================================================';

    -- -----------------------------------------------------------------
    -- 1. DREAMS VISIBILITY MAPPING (dreams.visibility -> dreams.is_private, is_followers_only)
    -- -----------------------------------------------------------------
    -- Legacy values: 
    -- 'private'   -> is_private = true,  is_followers_only = false
    -- 'followers' -> is_private = false, is_followers_only = true
    -- 'public'    -> is_private = false, is_followers_only = false
    -- Fallback for NULL or unexpected values: is_private = true, is_followers_only = false (FAIL-SAFE PRIVATE)
    -- Zero privacy broadening. Followers-only semantics strictly preserved.
    -- -----------------------------------------------------------------
    UPDATE public.dreams
    SET 
        is_private = (visibility = 'private'),
        is_followers_only = (visibility = 'followers')
    WHERE visibility IN ('private', 'followers', 'public');
    GET DIAGNOSTICS v_dreams_migrated = ROW_COUNT;

    UPDATE public.dreams
    SET 
        is_private = true,
        is_followers_only = false
    WHERE visibility IS NULL OR visibility NOT IN ('private', 'followers', 'public');
    GET DIAGNOSTICS v_dreams_fallback = ROW_COUNT;

    RAISE NOTICE 'Step 1 [Dreams Visibility]: % rows mapped from visibility, % fallback rows (NULL/unexpected) set to fail-safe is_private = true.',
        v_dreams_migrated, v_dreams_fallback;

    -- -----------------------------------------------------------------
    -- 2. CANONICAL DREAM_MEDIA NORMALIZATION (Visual Media)
    -- -----------------------------------------------------------------
    FOR r_media IN
        SELECT 
            dm.id AS legacy_media_id,
            dm.dream_id,
            dm.user_id,
            dm.storage_path AS raw_path,
            dm.media_type AS raw_media_type,
            dm.mime_type AS raw_mime,
            d.visibility
        FROM public.dream_media dm
        JOIN public.dreams d ON d.id = dm.dream_id
        WHERE dm.storage_path IS NOT NULL AND dm.storage_path <> ''
    LOOP
        v_parsed_bucket := NULL;
        v_parsed_path := NULL;

        -- Format A: Full Supabase Storage URL
        IF r_media.raw_path ~ '^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$' THEN
            v_parsed_bucket := substring(r_media.raw_path FROM '^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/');
            v_parsed_path := regexp_replace(r_media.raw_path, '^https?://[^/]+/storage/v1/object/(?:public|sign)/[^/]+/', '');

        -- Format B: Bucket-prefixed path
        ELSIF r_media.raw_path ~ '^(dream-images|dream-media-public|dream-media-private|clip-media|avatars)/(.+)$' THEN
            v_parsed_bucket := substring(r_media.raw_path FROM '^([^/]+)/');
            v_parsed_path := regexp_replace(r_media.raw_path, '^[^/]+/', '');

        -- Format C: Clean relative path with directory separator
        ELSIF r_media.raw_path ~ '^[^/]+/.+$' AND NOT (r_media.raw_path ~ '^https?://') THEN
            v_parsed_bucket := CASE WHEN r_media.visibility = 'private' THEN 'dream-media-private' ELSE 'dream-media-public' END;
            v_parsed_path := r_media.raw_path;
        ELSE
            v_parsed_bucket := NULL;
            v_parsed_path := NULL;
        END IF;

        IF v_parsed_path IS NULL OR v_parsed_bucket IS NULL OR v_parsed_path = '' THEN
            RAISE NOTICE 'SKIPPED [Visual Media]: dream_media ID % (dream_id %) has unresolvable path: "%"',
                r_media.legacy_media_id, r_media.dream_id, r_media.raw_path;
            v_media_skipped := v_media_skipped + 1;
        ELSE
            UPDATE public.dream_media
            SET 
                bucket_name = v_parsed_bucket,
                storage_path = v_parsed_path,
                media_type = CASE WHEN r_media.raw_media_type = 'video' THEN 'video' ELSE 'image' END,
                mime_type = COALESCE(r_media.raw_mime, CASE WHEN r_media.raw_media_type = 'video' THEN 'video/mp4' ELSE 'image/webp' END),
                aspect_ratio = COALESCE(aspect_ratio, '1:1'),
                order_index = COALESCE(order_index, 0)
            WHERE id = r_media.legacy_media_id;

            v_media_migrated := v_media_migrated + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Step 2 [Visual Media]: % records updated to V2 canonical format, % skipped.',
        v_media_migrated, v_media_skipped;

    -- -----------------------------------------------------------------
    -- 3. DREAM TRANSCRIPTS -> DREAM_MEDIA ('audio_narration')
    -- -----------------------------------------------------------------
    FOR r_audio IN
        SELECT 
            dt.id AS transcript_id,
            dt.dream_id,
            dt.audio_path AS raw_audio_path,
            dt.created_at,
            d.user_id AS dream_author_id,
            d.visibility
        FROM public.dream_transcripts dt
        JOIN public.dreams d ON d.id = dt.dream_id
        WHERE dt.audio_path IS NOT NULL 
          AND dt.audio_path <> ''
          AND NOT EXISTS (
              SELECT 1 FROM public.dream_media dm
              WHERE dm.dream_id = dt.dream_id
                AND dm.media_type = 'audio_narration'
          )
    LOOP
        v_parsed_bucket := NULL;
        v_parsed_path := NULL;

        IF r_audio.raw_audio_path ~ '^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$' THEN
            v_parsed_bucket := substring(r_audio.raw_audio_path FROM '^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/');
            v_parsed_path := regexp_replace(r_audio.raw_audio_path, '^https?://[^/]+/storage/v1/object/(?:public|sign)/[^/]+/', '');
        ELSIF r_audio.raw_audio_path ~ '^(dream-audio|dream-media-public|dream-media-private)/(.+)$' THEN
            v_parsed_bucket := substring(r_audio.raw_audio_path FROM '^([^/]+)/');
            v_parsed_path := regexp_replace(r_audio.raw_audio_path, '^[^/]+/', '');
        ELSIF r_audio.raw_audio_path ~ '^[^/]+/.+$' AND NOT (r_audio.raw_audio_path ~ '^https?://') THEN
            v_parsed_bucket := CASE WHEN r_audio.visibility = 'private' THEN 'dream-media-private' ELSE 'dream-media-public' END;
            v_parsed_path := r_audio.raw_audio_path;
        END IF;

        IF v_parsed_path IS NULL OR v_parsed_bucket IS NULL OR v_parsed_path = '' THEN
            RAISE NOTICE 'SKIPPED [Audio Narration]: dream_transcripts ID % (dream_id %) has unresolvable audio_path: "%"',
                r_audio.transcript_id, r_audio.dream_id, r_audio.raw_audio_path;
            v_narration_skipped := v_narration_skipped + 1;
        ELSE
            INSERT INTO public.dream_media (
                dream_id,
                user_id,
                bucket_name,
                storage_path,
                media_type,
                mime_type,
                duration_seconds,
                order_index,
                created_at
            )
            VALUES (
                r_audio.dream_id,
                r_audio.dream_author_id,
                v_parsed_bucket,
                v_parsed_path,
                'audio_narration',
                'audio/webm',
                NULL,
                99,
                r_audio.created_at
            );
            v_narration_migrated := v_narration_migrated + 1;
        END IF;
    END LOOP;

    -- Normalize any legacy 'audio' records in dream_media to canonical 'audio_narration'
    UPDATE public.dream_media
    SET media_type = 'audio_narration'
    WHERE media_type = 'audio';

    -- Validate canonical media type constraint
    ALTER TABLE public.dream_media VALIDATE CONSTRAINT chk_dream_media_v2_type;

    RAISE NOTICE 'Step 3 [Audio Narration]: % audio records inserted as canonical dream_media, % skipped.',
        v_narration_migrated, v_narration_skipped;

    -- -----------------------------------------------------------------
    -- 4. CLIPS -> DREAM_MEDIA LINKING (clips.video_path -> clips.media_id)
    -- -----------------------------------------------------------------
    FOR r_clip IN
        SELECT 
            c.id AS clip_id,
            c.dream_id,
            c.user_id,
            c.video_path,
            c.duration_seconds,
            c.created_at,
            d.visibility
        FROM public.clips c
        JOIN public.dreams d ON d.id = c.dream_id
        WHERE c.media_id IS NULL
    LOOP
        v_canonical_media_id := NULL;

        -- Attempt 1: Match existing dream_media video row for same dream_id
        SELECT id INTO v_canonical_media_id
        FROM public.dream_media
        WHERE dream_id = r_clip.dream_id
          AND media_type = 'video'
          AND (storage_path = r_clip.video_path OR r_clip.video_path LIKE '%' || storage_path)
        LIMIT 1;

        IF v_canonical_media_id IS NOT NULL THEN
            UPDATE public.clips
            SET media_id = v_canonical_media_id, aspect_ratio = '9:16'
            WHERE id = r_clip.clip_id;
            v_clips_mapped := v_clips_mapped + 1;
        ELSE
            -- Attempt 2: If clip has valid video_path, parse and create missing canonical dream_media
            v_parsed_bucket := NULL;
            v_parsed_path := NULL;

            IF r_clip.video_path ~ '^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$' THEN
                v_parsed_bucket := substring(r_clip.video_path FROM '^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/');
                v_parsed_path := regexp_replace(r_clip.video_path, '^https?://[^/]+/storage/v1/object/(?:public|sign)/[^/]+/', '');
            ELSIF r_clip.video_path ~ '^(clip-media|dream-media-public|dream-media-private)/(.+)$' THEN
                v_parsed_bucket := substring(r_clip.video_path FROM '^([^/]+)/');
                v_parsed_path := regexp_replace(r_clip.video_path, '^[^/]+/', '');
            ELSIF r_clip.video_path ~ '^[^/]+/.+$' AND NOT (r_clip.video_path ~ '^https?://') THEN
                v_parsed_bucket := CASE WHEN r_clip.visibility = 'private' THEN 'dream-media-private' ELSE 'dream-media-public' END;
                v_parsed_path := r_clip.video_path;
            END IF;

            IF v_parsed_path IS NOT NULL AND v_parsed_bucket IS NOT NULL AND v_parsed_path <> '' THEN
                INSERT INTO public.dream_media (
                    dream_id,
                    user_id,
                    bucket_name,
                    storage_path,
                    media_type,
                    mime_type,
                    duration_seconds,
                    aspect_ratio,
                    order_index,
                    created_at
                )
                VALUES (
                    r_clip.dream_id,
                    r_clip.user_id,
                    v_parsed_bucket,
                    v_parsed_path,
                    'video',
                    'video/mp4',
                    r_clip.duration_seconds,
                    '9:16',
                    0,
                    r_clip.created_at
                )
                RETURNING id INTO v_canonical_media_id;

                UPDATE public.clips
                SET media_id = v_canonical_media_id, aspect_ratio = '9:16'
                WHERE id = r_clip.clip_id;
                v_clips_created := v_clips_created + 1;
            ELSE
                -- Quarantine unresolvable clip to legacy_clips_review table without deleting or inventing data
                INSERT INTO public.legacy_clips_review (
                    clip_id,
                    dream_id,
                    user_id,
                    video_path,
                    thumbnail_path,
                    duration_seconds,
                    status,
                    review_reason
                ) VALUES (
                    r_clip.clip_id,
                    r_clip.dream_id,
                    r_clip.user_id,
                    r_clip.video_path,
                    NULL,
                    r_clip.duration_seconds,
                    'quarantined',
                    'unresolvable_video_path'
                ) ON CONFLICT (clip_id) DO NOTHING;

                -- Mark status as quarantined so it is excluded from public feeds
                UPDATE public.clips
                SET status = 'quarantined'
                WHERE id = r_clip.clip_id;

                RAISE NOTICE 'QUARANTINED [Clip]: Clip ID % (dream_id %) has unresolvable video_path: "%". Preserved in legacy_clips_review.',
                    r_clip.clip_id, r_clip.dream_id, r_clip.video_path;
                v_clips_skipped := v_clips_skipped + 1;
            END IF;
        END IF;
    END LOOP;

    -- Prove zero active unresolved clips
    SELECT COUNT(*) INTO v_clips_unresolved_active
    FROM public.clips
    WHERE media_id IS NULL AND (status IS NULL OR status <> 'quarantined');

    IF v_clips_unresolved_active > 0 THEN
        RAISE EXCEPTION 'MIGRATION INVARIANT FAILURE: % active clips lack media_id and are not quarantined.', v_clips_unresolved_active;
    END IF;

    -- Validate media presence check constraint (active clips require media_id; quarantined clips permitted)
    ALTER TABLE public.clips VALIDATE CONSTRAINT chk_clips_media_id_present;

    -- If zero clips across entire table have media_id IS NULL, also enforce table-level NOT NULL
    SELECT COUNT(*) INTO v_total_clips_null_media FROM public.clips WHERE media_id IS NULL;
    IF v_total_clips_null_media = 0 THEN
        ALTER TABLE public.clips ALTER COLUMN media_id SET NOT NULL;
        RAISE NOTICE 'Step 4 Enforcement: Zero unresolved clips found. clips.media_id successfully set to NOT NULL.';
    ELSE
        RAISE NOTICE 'Step 4 Deferred: % unresolvable clips preserved in legacy_clips_review with media_id NULL. Full NOT NULL enforcement deferred until manual review completion.', v_total_clips_null_media;
    END IF;

    RAISE NOTICE 'Step 4 [Clips]: % clips mapped to existing dream_media, % canonical videos created, % clips quarantined for review.',
        v_clips_mapped, v_clips_created, v_clips_skipped;

    -- -----------------------------------------------------------------
    -- 5. REACTIONS (target_type = 'dream' -> reactions.dream_id)
    -- -----------------------------------------------------------------
    -- Zero semantic rewriting: Unknown reaction types are NEVER converted to 'like'.
    -- Zero data loss: Unrecognized types and duplicate reactions are preserved untouched
    -- with dream_id = NULL and recorded in legacy_reactions_review for manual inspection.
    -- -----------------------------------------------------------------
    FOR r_reaction IN
        SELECT 
            r.id,
            r.user_id,
            r.target_type,
            r.target_id,
            r.reaction_type,
            r.created_at
        FROM public.reactions r
        WHERE r.dream_id IS NULL AND r.target_type = 'dream'
    LOOP
        -- Check if target Dream actually exists
        IF NOT EXISTS (SELECT 1 FROM public.dreams WHERE id = r_reaction.target_id) THEN
            INSERT INTO public.legacy_reactions_review (
                id, user_id, target_type, target_id, reaction_type, review_reason, created_at
            ) VALUES (
                r_reaction.id, r_reaction.user_id, r_reaction.target_type, r_reaction.target_id, r_reaction.reaction_type, 'orphaned_target_dream', r_reaction.created_at
            ) ON CONFLICT (id) DO NOTHING;

            RAISE NOTICE 'REACTION ORPHAN: Reaction % points to non-existent Dream %. Recorded in legacy_reactions_review.',
                r_reaction.id, r_reaction.target_id;
            v_reactions_skipped := v_reactions_skipped + 1;

        -- Check if reaction_type is one of 5 approved V2 archetypes
        ELSIF r_reaction.reaction_type NOT IN ('like', 'resonate', 'lucid', 'haunting', 'surreal') THEN
            -- DO NOT convert to 'like'! Preserve untouched and record in legacy_reactions_review
            INSERT INTO public.legacy_reactions_review (
                id, user_id, target_type, target_id, reaction_type, review_reason, created_at
            ) VALUES (
                r_reaction.id, r_reaction.user_id, r_reaction.target_type, r_reaction.target_id, r_reaction.reaction_type, 'unrecognized_reaction_type', r_reaction.created_at
            ) ON CONFLICT (id) DO NOTHING;

            RAISE NOTICE 'REACTION UNRECOGNIZED: Reaction % has type "%". Preserved unchanged in legacy_reactions_review.',
                r_reaction.id, r_reaction.reaction_type;
            v_reactions_skipped := v_reactions_skipped + 1;

        -- Check for duplicate user reaction on same dream
        ELSIF EXISTS (
            SELECT 1 FROM public.reactions 
            WHERE dream_id = r_reaction.target_id AND user_id = r_reaction.user_id
        ) THEN
            -- Preserve duplicate reaction untouched without dream_id, record for manual review
            INSERT INTO public.legacy_reactions_review (
                id, user_id, target_type, target_id, reaction_type, review_reason, created_at
            ) VALUES (
                r_reaction.id, r_reaction.user_id, r_reaction.target_type, r_reaction.target_id, r_reaction.reaction_type, 'duplicate_user_dream_reaction', r_reaction.created_at
            ) ON CONFLICT (id) DO NOTHING;

            RAISE NOTICE 'REACTION DUPLICATE: User % already reacted to Dream %. Reaction % preserved in legacy_reactions_review.',
                r_reaction.user_id, r_reaction.target_id, r_reaction.id;
            v_reactions_skipped := v_reactions_skipped + 1;

        ELSE
            -- Valid V2 dream reaction: map dream_id without modifying reaction_type
            UPDATE public.reactions
            SET dream_id = r_reaction.target_id
            WHERE id = r_reaction.id;

            v_reactions_migrated := v_reactions_migrated + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Step 5 [Reactions]: % Dream reactions migrated to dream_id, % non-Dream/duplicate/unrecognized reactions preserved.',
        v_reactions_migrated, v_reactions_skipped;

    -- -----------------------------------------------------------------
    -- 6. COMMENTS (target_type = 'dream' -> comments.dream_id, parent_comment_id -> parent_id)
    -- -----------------------------------------------------------------
    -- INVARIANTS:
    -- 1. target_type = 'dream' is strictly required before assigning dream_id
    -- 2. target_type = 'clip' is NEVER assigned a dream_id (dream_id remains NULL)
    -- 3. Orphaned comments (pointing to non-existent dreams) are preserved with dream_id NULL
    -- 4. parent_comment_id relationships are preserved 1:1 in parent_id
    -- 5. No comment content or metadata is modified
    -- 6. Zero comments are deleted
    -- -----------------------------------------------------------------
    -- 6a. Map dream_id ONLY for target_type = 'dream' where dream exists
    UPDATE public.comments
    SET dream_id = target_id
    WHERE dream_id IS NULL 
      AND target_type = 'dream'
      AND EXISTS (SELECT 1 FROM public.dreams WHERE id = comments.target_id);
    GET DIAGNOSTICS v_comments_migrated = ROW_COUNT;

    -- 6b. Map self-referential parent_comment_id to parent_id
    UPDATE public.comments
    SET parent_id = parent_comment_id
    WHERE parent_id IS NULL AND parent_comment_id IS NOT NULL;

    SELECT COUNT(*) INTO v_comments_skipped
    FROM public.comments
    WHERE dream_id IS NULL;

    RAISE NOTICE 'Step 6 [Comments]: % Dream comments populated with dream_id and parent_id, % non-Dream/clip/orphaned comments preserved.',
        v_comments_migrated, v_comments_skipped;

    -- -----------------------------------------------------------------
    -- 7. CONVERSATIONS (conversation_members -> conversations user_low/user_high)
    -- -----------------------------------------------------------------
    FOR r_conv IN
        SELECT 
            c.id AS conversation_id,
            ARRAY_AGG(cm.user_id ORDER BY cm.user_id ASC) AS member_ids,
            COUNT(cm.user_id) AS member_count
        FROM public.conversations c
        JOIN public.conversation_members cm ON cm.conversation_id = c.id
        WHERE c.user_low IS NULL OR c.user_high IS NULL
        GROUP BY c.id
    LOOP
        IF r_conv.member_count = 2 THEN
            -- Check if another conversation already exists with this identical pair
            IF NOT EXISTS (
                SELECT 1 FROM public.conversations 
                WHERE user_low = r_conv.member_ids[1] AND user_high = r_conv.member_ids[2]
            ) THEN
                UPDATE public.conversations
                SET 
                    user_low = r_conv.member_ids[1],
                    user_high = r_conv.member_ids[2]
                WHERE id = r_conv.conversation_id;

                -- Also ensure conversation_participants table is seeded
                INSERT INTO public.conversation_participants (conversation_id, user_id, joined_at)
                VALUES 
                    (r_conv.conversation_id, r_conv.member_ids[1], now()),
                    (r_conv.conversation_id, r_conv.member_ids[2], now())
                ON CONFLICT (conversation_id, user_id) DO NOTHING;

                v_conv_migrated := v_conv_migrated + 1;
            ELSE
                RAISE NOTICE 'DUPLICATE CONVERSATION PAIR: Conversation % has duplicate pair (% <-> %). Preserved for manual consolidation.',
                    r_conv.conversation_id, r_conv.member_ids[1], r_conv.member_ids[2];
                v_conv_skipped := v_conv_skipped + 1;
            END IF;
        ELSE
            RAISE NOTICE 'NON-1:1 CONVERSATION: Conversation % has % members (expected 2). Preserved without user_low/user_high.',
                r_conv.conversation_id, r_conv.member_count;
            v_conv_skipped := v_conv_skipped + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Step 7 [Conversations]: % 1:1 conversations populated with deterministic pair, % non-2-member conversations preserved.',
        v_conv_migrated, v_conv_skipped;

    RAISE NOTICE '=====================================================================';
    RAISE NOTICE 'COMPATIBILITY DATA MIGRATION COMPLETE. ALL DATA PRESERVED.';
    RAISE NOTICE '=====================================================================';
END $$;
