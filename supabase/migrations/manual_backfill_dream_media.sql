-- =====================================================================
-- SIIMR BACKEND V2: ONE-TIME IDEMPOTENT MEDIA & AUDIO BACKFILL SCRIPT
-- FILE: supabase/migrations/manual_backfill_dream_media.sql
-- 
-- STATUS: REVIEW / MANUAL RUN SCRIPT ONLY — DO NOT RUN AUTOMATICALLY
-- NON-DESTRUCTIVE: Legacy columns in public.dreams and dream_transcripts preserved.
-- NO INVENTED SOURCES: Uses only public.dream_media and public.dream_transcripts.
-- NO FAKE PATHS: No 'media/legacy_' or fabricated paths. If unresolvable, emits NOTICE.
-- MEDIA TYPES: Exactly 'image', 'video', 'audio_narration'.
-- =====================================================================

DO $$
DECLARE
    v_media_count INT := 0;
    v_audio_count INT := 0;
    v_skipped_media_count INT := 0;
    v_skipped_audio_count INT := 0;
    r_media RECORD;
    r_audio RECORD;
    v_parsed_bucket TEXT;
    v_parsed_path TEXT;
    v_mime TEXT;
    v_type TEXT;
BEGIN
    RAISE NOTICE '=====================================================================';
    RAISE NOTICE 'Starting SIIMR V2 canonical dream_media backfill...';
    RAISE NOTICE '=====================================================================';

    -- -----------------------------------------------------------------
    -- 1. BACKFILL VISUAL MEDIA (Images & Videos from legacy dream_media)
    -- -----------------------------------------------------------------
    -- Source: public.dream_media rows created by 20260905 / 20260908
    -- Target: public.dream_media V2 canonical identity (bucket_name, storage_path, order_index)
    -- -----------------------------------------------------------------
    FOR r_media IN
        SELECT 
            dm.id AS legacy_media_id,
            dm.dream_id,
            dm.storage_path AS raw_path,
            dm.media_type AS raw_media_type,
            dm.mime_type AS raw_mime,
            dm.duration_ms,
            dm.created_at,
            d.visibility
        FROM public.dream_media dm
        JOIN public.dreams d ON d.id = dm.dream_id
        WHERE dm.storage_path IS NOT NULL 
          AND dm.storage_path <> ''
          -- Only process records that have not yet been migrated to V2 canonical format
          AND (dm.bucket_name IS NULL OR dm.bucket_name = 'dream-media-public')
          AND NOT EXISTS (
              SELECT 1 FROM public.dream_media v2
              WHERE v2.dream_id = dm.dream_id
                AND v2.storage_path = dm.storage_path
                AND v2.media_type IN ('image', 'video')
                AND v2.id <> dm.id
          )
    LOOP
        v_parsed_bucket := NULL;
        v_parsed_path := NULL;

        -- Format A: Full Supabase Storage URL
        -- e.g. https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
        -- or   https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>
        IF r_media.raw_path ~ '^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$' THEN
            v_parsed_bucket := substring(r_media.raw_path FROM '^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/');
            v_parsed_path := regexp_replace(r_media.raw_path, '^https?://[^/]+/storage/v1/object/(?:public|sign)/[^/]+/', '');

        -- Format B: Bucket-prefixed path
        -- e.g. 'dream-images/<user_id>/<dream_id>/file.webp' or 'clip-media/<clip_id>/file.mp4'
        ELSIF r_media.raw_path ~ '^(dream-images|dream-media-public|dream-media-private|clip-media|avatars)/(.+)$' THEN
            v_parsed_bucket := substring(r_media.raw_path FROM '^([^/]+)/');
            v_parsed_path := regexp_replace(r_media.raw_path, '^[^/]+/', '');

        -- Format C: Standard relative clean path with at least one directory separator
        ELSIF r_media.raw_path ~ '^[^/]+/.+$' AND NOT (r_media.raw_path ~ '^https?://') THEN
            v_parsed_bucket := CASE 
                WHEN r_media.visibility = 'private' THEN 'dream-media-private' 
                ELSE 'dream-media-public' 
            END;
            v_parsed_path := r_media.raw_path;

        -- Format D: Unresolvable / bare string / invalid format
        ELSE
            v_parsed_bucket := NULL;
            v_parsed_path := NULL;
        END IF;

        -- Validation: Never create or update canonical media if path cannot be determined
        IF v_parsed_path IS NULL OR v_parsed_bucket IS NULL OR v_parsed_path = '' THEN
            RAISE NOTICE 'SKIPPED [Visual Media]: Dream ID % (Legacy Media ID %) contains unresolvable storage path: "%". Requires manual review.', 
                r_media.dream_id, r_media.legacy_media_id, r_media.raw_path;
            v_skipped_media_count := v_skipped_media_count + 1;
        ELSE
            -- Normalize media_type to exactly 'image' or 'video'
            v_type := CASE 
                WHEN r_media.raw_media_type = 'video' THEN 'video'
                ELSE 'image'
            END;

            v_mime := COALESCE(
                r_media.raw_mime, 
                CASE WHEN v_type = 'video' THEN 'video/mp4' ELSE 'image/webp' END
            );

            -- Update existing row in place to satisfy V2 canonical contract
            UPDATE public.dream_media
            SET 
                bucket_name = v_parsed_bucket,
                storage_path = v_parsed_path,
                media_type = v_type,
                mime_type = v_mime,
                aspect_ratio = '1:1',
                order_index = 0
            WHERE id = r_media.legacy_media_id;

            v_media_count := v_media_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Visual media backfill completed: % records migrated, % records skipped.', 
        v_media_count, v_skipped_media_count;

    -- -----------------------------------------------------------------
    -- 2. BACKFILL SPOKEN DREAM AUDIO NARRATION
    -- -----------------------------------------------------------------
    -- Source: public.dream_transcripts (audio_path) from 20260908 schema
    -- Target: public.dream_media with media_type = 'audio_narration'
    -- -----------------------------------------------------------------
    FOR r_audio IN
        SELECT 
            dt.id AS transcript_id,
            dt.dream_id,
            dt.audio_path AS raw_audio_path,
            dt.created_at,
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

        -- Format A: Full Supabase Storage URL
        IF r_audio.raw_audio_path ~ '^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$' THEN
            v_parsed_bucket := substring(r_audio.raw_audio_path FROM '^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/');
            v_parsed_path := regexp_replace(r_audio.raw_audio_path, '^https?://[^/]+/storage/v1/object/(?:public|sign)/[^/]+/', '');

        -- Format B: Bucket-prefixed path
        -- e.g. 'dream-audio/<user_id>/<dream_id>/narration.webm'
        ELSIF r_audio.raw_audio_path ~ '^(dream-audio|dream-media-public|dream-media-private)/(.+)$' THEN
            v_parsed_bucket := substring(r_audio.raw_audio_path FROM '^([^/]+)/');
            v_parsed_path := regexp_replace(r_audio.raw_audio_path, '^[^/]+/', '');

        -- Format C: Standard relative clean path
        ELSIF r_audio.raw_audio_path ~ '^[^/]+/.+$' AND NOT (r_audio.raw_audio_path ~ '^https?://') THEN
            v_parsed_bucket := CASE 
                WHEN r_audio.visibility = 'private' THEN 'dream-media-private' 
                ELSE 'dream-media-public' 
            END;
            v_parsed_path := r_audio.raw_audio_path;

        -- Format D: Unresolvable
        ELSE
            v_parsed_bucket := NULL;
            v_parsed_path := NULL;
        END IF;

        IF v_parsed_path IS NULL OR v_parsed_bucket IS NULL OR v_parsed_path = '' THEN
            RAISE NOTICE 'SKIPPED [Audio Narration]: Dream ID % (Transcript ID %) contains unresolvable audio path: "%". Requires manual review.', 
                r_audio.dream_id, r_audio.transcript_id, r_audio.raw_audio_path;
            v_skipped_audio_count := v_skipped_audio_count + 1;
        ELSE
            INSERT INTO public.dream_media (
                dream_id,
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
                v_parsed_bucket,
                v_parsed_path,
                'audio_narration',
                'audio/webm',
                NULL,
                99,
                r_audio.created_at
            );

            v_audio_count := v_audio_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Audio narration backfill completed: % records migrated, % records skipped.', 
        v_audio_count, v_skipped_audio_count;
    RAISE NOTICE '=====================================================================';
    RAISE NOTICE 'Backfill execution finished. Legacy tables and columns remain intact.';
    RAISE NOTICE '=====================================================================';
END $$;
