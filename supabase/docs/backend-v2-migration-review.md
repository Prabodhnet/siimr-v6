# SIIMR BACKEND V2: DATABASE MIGRATION REVIEW & VERIFICATION REPORT (PHASE 3.2 AUDIT)
**Migration File:** `supabase/migrations/20260911000000_siimr_backend_v2.sql`  
**Backfill File:** `supabase/migrations/manual_backfill_dream_media.sql`  
**Status:** GENERATED & AUDITED — NOT EXECUTED (Non-Destructive Static Validation)  
**Target Runtime:** Supabase / PostgreSQL 15+ with PostGIS  

---

## 1. LEGACY SCHEMA DISCOVERED & SOURCES USED
Inspection of the existing migration files (`20260905000000_siimr_backend_schema.sql` and `20260908_siimr_production_schema.sql`) identified the active legacy database state:
- **`profiles`:** 1:1 with `auth.users`, includes `username`, `display_name`, `bio`, `avatar_url`, `cover_url`, `banner_quote`, `region_bucket`, `nearby_opt_in`, `role`.
- **`dreams`:** Canonical content table with legacy columns `media_type`, `visibility`, `tags`, `hook`, `raw_transcript`, `content`, `category`, `likes_count`, `views_count`.
- **`dream_media`:** Created in production schema with `dream_id`, `user_id`, `storage_path`, `media_type`, `mime_type`, `duration_ms`.
- **`dream_transcripts`:** Created in production schema (`20260908_siimr_production_schema.sql` lines 79-90) with `dream_id`, `user_id`, `transcript`, `language`, `status`, `audio_path`.
- **`last_night_stories`:** Created with `dream_id`, `user_id`, `audience`, `published_at`, `expires_at`.
- **`nearby_shares`:** Created with `dream_id`, `user_id`, `geo_bucket`, `area_label`, `enabled`, `published_at`, `expires_at`.
- **`clips`:** Created with `dream_id`, `user_id`, `video_path`, `thumbnail_path`, `duration_seconds`.
- **`comments`:** Created with polymorphic target columns `target_type`, `target_id`, and self-referencing `parent_comment_id`.
- **`reactions`:** Created with polymorphic target columns `target_type`, `target_id`, `reaction_type`.
- **`saves`:** Created with composite/nullable pointers `(user_id, dream_id, clip_id)`.
- **`follows` & `blocks`:** Created with standard directional pair keys and self-exclusion constraints.
- **`conversations`, `conversation_members`, `messages`:** Basic chat tables.
- **`notifications` & `reports`:** Basic social dispatch and user safety reporting.

---

## 2. CANONICAL MEDIA TYPES & CONSTRAINT REPLACEMENT
- `dream_media.media_type` allowed values: exactly `'image'`, `'video'`, `'audio_narration'`.
- The legacy `'audio'` type from the 20260908 schema constraint `dream_media_media_type_check` (`CHECK (media_type IN ('image', 'audio', 'video'))`) has been safely replaced by `chk_dream_media_v2_type`.
- Voice dream audio recordings from `dream_transcripts.audio_path` are mapped to canonical type `'audio_narration'`.

---

## 3. CLIP INTEGRITY ENFORCEMENT
Clips represent the vertical video presentation layer of a Dream and strictly satisfy:
1. `clips.media_id` is `NOT NULL` in the V2 model.
2. `clips.aspect_ratio` is constrained to `'9:16'` via `chk_clips_aspect_ratio_916`.
3. Same-Dream Composite Foreign Key:
   ```sql
   FOREIGN KEY (media_id, dream_id) REFERENCES dream_media(id, dream_id) ON DELETE CASCADE
   ```
4. Video Verification via Database Triggers:
   - `trg_validate_clip_media_video` on `clips` executes `validate_clip_media_is_video()`, verifying that the referenced `dream_media` has `media_type = 'video'`.
   - `trg_validate_dream_media_clip_reference` on `dream_media` blocks updating `media_type` away from `'video'` if referenced by an existing Clip.

---

## 4. DETERMINISTIC BACKFILL & STORAGE PATH MAPPING
- **No invented sources:** Visual media is sourced from `public.dream_media(storage_path)` and spoken dream narration is sourced from `public.dream_transcripts(audio_path)`.
- **No fake paths:** Paths like `'media/legacy_'` were completely eliminated.
- **Deterministic URL Parsing:**
  - Standard Supabase Storage URLs (`^https?://[^/]+/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$`) extract bucket and relative storage path.
  - Bucket-prefixed paths (`^(bucket)/(.+)$`) cleanly partition bucket and path.
  - Relative paths inherit bucket based on Dream privacy (`dream-media-private` vs `dream-media-public`).
  - Unresolvable paths are skipped without mutating the database and emit a `RAISE NOTICE` identifying the Dream ID.

---

## 5. DIRECT CONVERSATION RACE SAFETY
- `get_or_create_direct_conversation(other_user_id)` uses atomic `INSERT INTO public.conversations (user_low, user_high) VALUES (v_low, v_high) ON CONFLICT (user_low, user_high) DO NOTHING RETURNING id`.
- If a concurrent transaction commits simultaneously, it seamlessly queries the existing ID via `SELECT id ... WHERE user_low = v_low AND user_high = v_high`.
- Participants are inserted with `ON CONFLICT (conversation_id, user_id) DO NOTHING`.

---

## 6. NEARBY DREAMS INPUT VALIDATION & DISCOVERY MODEL
- `get_nearby_dreams(user_lat, user_lng, radius_meters, limit_count)` validates:
  - Rejection of `NULL`, `'NaN'`, `'Infinity'`, and `'-Infinity'`.
  - Latitudes strictly bounded between `-90.0` and `90.0`.
  - Longitudes strictly bounded between `-180.0` and `180.0`.
  - Radius clamped between `1,000` and `100,000` meters.
  - Result limit clamped between `1` and `50` (strict cap).
- Distance bands returned: `'within_5km'`, `'within_15km'`, `'within_50km'`, and `'same_region'`.
- Enforces k-anonymity ($\ge 3$ candidates required for granular bands). Coordinates remain strictly server-side.

---

## 7. RPC PERMISSION & PRIVILEGE MATRIX
All functions enforce `SECURITY DEFINER` and `SET search_path = public, pg_temp`. Default `PUBLIC` execute access is revoked.

| RPC Function | Anon Allowed? | Authenticated Allowed? | Public Revoked? | Auth Enforced Inside Function? |
|---|:---:|:---:|:---:|:---:|
| `get_or_create_direct_conversation(UUID)` | **No** | **Yes** | **Yes** | **Yes** (`auth.uid() IS NULL` throws) |
| `toggle_reaction(UUID, TEXT)` | **No** | **Yes** | **Yes** | **Yes** (`auth.uid() IS NULL` throws) |
| `increment_dream_view(UUID)` | **Yes** | **Yes** | **Yes** | No (allows anonymous view logging, respects blocks/privacy) |
| `find_similar_dreams(UUID, INT)` | **Yes** | **Yes** | **Yes** | No (returns only public dreams unless owned by caller) |
| `get_nearby_dreams(lat, lng, r, l)` | **Yes** | **Yes** | **Yes** | No (returns coarse regions only for public unblocked dreams) |
| `is_blocked(UUID, UUID)` | **Yes** | **Yes** | **Yes** | No (read helper) |

---

## 8. RLS POLICY AUDIT & REPLACEMENT MATRIX

| Table | Old Policy Name | Old Behavior | New Policy Name | New Behavior | Reason for Replacement |
|---|---|---|---|---|---|
| `profiles` | `Profiles readable by everyone` | Permitted reading all profiles regardless of blocks | `Profiles readable if not blocked` | Permitted only if `NOT is_blocked(auth.uid(), id)` | Enforces bilateral blocking perimeter |
| `dreams` | `Public dreams readable` | Handled followers & public with subqueries | `Dreams readable if authorized` | Visible if public or own dream, and author not blocked | Aligns with V2 privacy model and block perimeter |
| `dream_media` | `Dream media readable` / `Owners manage dream media` | Broad or unverified media access | `Dream media inherits dream visibility` | Inherits parent dream visibility via subquery | Guarantees media privacy matches parent Dream |
| `last_night_stories` | `Active stories readable` | Permitted public reading | `Active stories readable if dream accessible` | Verifies parent dream visibility and block status | Ephemeral story access derives from parent Dream |
| `clips` | `Published clips readable` | Read all `status = 'published'` clips | `Clips readable if dream accessible` | Verifies parent dream visibility and block status | Clip access derives from parent Dream |
| `nearby_shares` | `Nearby shares readable` | Direct `SELECT` permitted for all enabled rows | Revoked `SELECT` from anon/authenticated | Direct SELECT blocked; queries route through `get_nearby_dreams()` | Prevents scraping geographical coordinates |
| `comments` | `Comments readable` | Unconditional read | `Comments readable if dream accessible` | Verified parent dream visibility | Prevents comment leakage on private/blocked dreams |
| `reactions` | `Reactions readable` | Unconditional read | `Reactions readable if dream accessible` | Verified parent dream visibility | Prevents reaction leakage on private/blocked dreams |
| `saves` | `Users see own saves` | Owner read | `Owner only saves read` | Owner read (idempotent policy) | Maintained strict bookmark privacy |
| `conversations` | `Conversation members access` (messages) | Based on `conversation_members` | `Conversation participants access` | Based on deterministic `(user_low, user_high)` pair | Secures 1:1 conversation channels |
| `messages` | `Conversation members access` | Checked membership table | `Messages participant access` | Direct check on `conversations(user_low, user_high)` | Participant-only chat message security |
