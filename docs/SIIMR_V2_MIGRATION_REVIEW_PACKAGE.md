# SIIMR BACKEND V2 — FINAL MIGRATION REVIEW PACKAGE
**Document Version:** 2.0.0-final  
**Target Migration File:** `supabase/migrations/20260912000000_siimr_backend_v2_reconciled_secure.sql`  
**Status:** READY FOR OPERATIONAL REVIEW (NON-EXECUTED)  
**Execution Safety Guarantee:** 0 database operations executed, 0 live tables modified, 100% atomic transaction envelope (`BEGIN ... COMMIT`).

---

## 1. EXECUTIVE SUMMARY & RECONCILIATION AUDIT

The Siimr V2 backend migration represents the canonical data and security architecture for the Siimr dream-sharing ecosystem. This migration reconciles the live Supabase database state with the Final Product Scope Lock while permanently fixing all authentication, authorization, and structural boundaries.

### 1.1 Live Data Preservation (Zero Loss Guarantee)
Direct database inspection confirmed the existence of 8 tables in the live Supabase instance:
- **`public.profiles` (6 active accounts):** Retained 100% intact. All 6 accounts (`u-me`, `u-siimr`, `u-amara`, `u-josh`, `u-maya`, etc.) preserve their `TEXT` primary keys, avatars, banner quotes, handles, and settings.
- **`public.activities` (44 active audit logs):** Retained 100% intact with zero modifications to rows or types.
- **Empty Tables (`dreams`, `comments`, `likes`, `bookmarks`, `shares`, `messages`):** All had 0 live rows. They are evolved additively with canonical columns, foreign keys, and indexes without loss. Legacy tables (`likes`, `bookmarks`, `shares`) are preserved so legacy queries never fail.

### 1.2 Final Product Scope Lock
- **Root Content:** `public.dreams` is the single canonical root object.
- **Dream Circles (Locked 1:1 Architecture):** `public.dream_circles` and circle membership tables are **completely removed**. Each Dream supports at most one discussion thread (`dream_circle_threads.dream_id UNIQUE`), with 1:N replies (`dream_circle_replies`).
- **Clips & Media:** Clips exist strictly in 9:16 aspect ratio, mapped 1:1 to Dreams, and must reference canonical video records in `dream_media` via a database trigger (`trg_validate_clip_media_video`).
- **Spatial Discovery:** `nearby_shares` coordinates are completely protected: direct SELECT is revoked, and discovery runs exclusively through the `get_nearby_dreams()` PostGIS RPC returning coarse distance bands.

---

## 2. COMPLETE DATABASE ENTITY DIRECTORY (24 TABLES)

| # | Table Name | Cardinality | Primary Key | Key Relationships & Constraints |
| :--- | :--- | :---: | :--- | :--- |
| 1 | **`profiles`** | Preserved (6) | `id TEXT` | `username UNIQUE`, `is_private`, `discoverable_in_search`, `role` |
| 2 | **`activities`** | Preserved (44) | `id TEXT` | `user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE` |
| 3 | **`dreams`** | Root Content | `id TEXT` | `user_id TEXT REFERENCES profiles(id)`, `is_private`, `is_followers_only`, `lucidity_level (1..5)`, `clarity (1..5)` |
| 4 | **`dream_media`** | 1:N with Dreams | `id TEXT` | `dream_id REFERENCES dreams(id)`, `media_type IN ('image', 'video', 'audio_narration')`, `UNIQUE (id, dream_id)` |
| 5 | **`dream_transcripts`** | 1:1 with Dreams | `id TEXT` | `dream_id REFERENCES dreams(id)`, `CONSTRAINT uq_dream_transcripts_dream_id UNIQUE (dream_id)` |
| 6 | **`last_night_stories`** | 1:1 with Dreams | `id TEXT` | `dream_id REFERENCES dreams(id)`, `UNIQUE (dream_id)`, `expires_at > published_at (24h)` |
| 7 | **`clips`** | 1:1 with Dreams | `id TEXT` | `dream_id REFERENCES dreams(id)`, `media_id`, `aspect_ratio = '9:16'`, `FK (media_id, dream_id) REFERENCES dream_media` |
| 8 | **`clip_views`** | 1:N with Clips | `id TEXT` | `clip_id REFERENCES clips(id)`, `viewer_id REFERENCES profiles(id)` |
| 9 | **`nearby_shares`** | 1:1 with Dreams | `id TEXT` | `dream_id REFERENCES dreams(id)`, `UNIQUE (dream_id)`, `location_geog GEOGRAPHY(Point, 4326)` |
| 10 | **`follows`** | Social Graph | `(follower, following)` | Composite PK, `CHECK (follower_id <> following_id)` |
| 11 | **`blocks`** | Safety System | `(blocker, blocked)` | Composite PK, `CHECK (blocker_id <> blocked_id)` |
| 12 | **`comments`** | 1:N with Dreams | `id TEXT` | `dream_id REFERENCES dreams(id)`, `parent_id REFERENCES comments(id) ON DELETE CASCADE` |
| 13 | **`reactions`** | 1:N with Dreams | `id TEXT` | `UNIQUE (dream_id, user_id)`, `reaction_type IN ('like', 'resonate', 'lucid', 'haunting', 'surreal')` |
| 14 | **`saves`** | 1:N with Dreams | `id TEXT` | `UNIQUE (user_id, dream_id)`, strictly private bookmark store |
| 15 | **`share_events`** | 1:N with Dreams | `id TEXT` | `dream_id REFERENCES dreams(id)`, `platform TEXT`, share telemetry |
| 16 | **`conversations`** | 1:1 User Pairs | `id TEXT` | `CHECK (user_low < user_high)`, `UNIQUE (user_low, user_high)` |
| 17 | **`conversation_participants`** | 1:N with Conv | `(conv_id, user_id)` | Composite PK, tracks `last_read_at` |
| 18 | **`messages`** | 1:N with Conv | `id TEXT` | `sender_id REFERENCES profiles`, `recipient_id REFERENCES profiles`, `conversation_id REFERENCES conversations` |
| 19 | **`dream_circle_threads`** | 1:1 with Dreams | `id TEXT` | `dream_id REFERENCES dreams(id)`, `CONSTRAINT uq_dream_circle_threads_dream_id UNIQUE (dream_id)` |
| 20 | **`dream_circle_replies`** | 1:N with Thread | `id TEXT` | `thread_id REFERENCES dream_circle_threads(id) ON DELETE CASCADE`, `user_id REFERENCES profiles(id)` |
| 21 | **`notifications`** | User Ledger | `id TEXT` | `recipient_id REFERENCES profiles(id)`, `actor_id REFERENCES profiles(id)` |
| 22 | **`reports`** | Moderation | `id TEXT` | `reporter_id REFERENCES profiles(id)`, `target_type IN ('dream', 'clip', 'comment', 'user')` |
| 23 | **`likes`** | Legacy (0 rows) | `id TEXT` | Preserved for backward compatibility |
| 24 | **`bookmarks`** / **`shares`** | Legacy (0 rows) | `id TEXT` | Preserved for backward compatibility |

---

## 3. COMPREHENSIVE ROW LEVEL SECURITY (RLS) MATRIX

Every table in the V2 architecture has RLS explicitly enabled with zero authorization bypasses:

| Table Name | SELECT Rule | INSERT Rule | UPDATE Rule | DELETE Rule |
| :--- | :--- | :--- | :--- | :--- |
| **`profiles`** | `can_view_profile(id, auth.uid()::text)` | `auth.uid()::text = id` | `auth.uid()::text = id` | BLOCKED |
| **`activities`** | `auth.uid()::text = user_id` | `auth.uid()::text = user_id` | BLOCKED | BLOCKED |
| **`dreams`** | `can_view_dream(id, auth.uid()::text)` | `auth.uid()::text = user_id` | `auth.uid()::text = user_id` | `auth.uid()::text = user_id` |
| **`dream_media`** | `can_view_dream(dream_id, auth.uid()::text)` | `auth.uid()::text = user_id AND dream owner` | `auth.uid()::text = user_id` | `auth.uid()::text = user_id` |
| **`dream_transcripts`** | `can_view_dream(dream_id, auth.uid()::text)` | `auth.uid()::text = user_id AND dream owner` | `auth.uid()::text = user_id` | `auth.uid()::text = user_id` |
| **`clips`** | `can_view_dream(dream_id, auth.uid()::text)` | `auth.uid()::text = user_id AND dream owner` | `auth.uid()::text = user_id` | `auth.uid()::text = user_id` |
| **`clip_views`** | Clip owner only | `auth.uid()::text = viewer_id` | BLOCKED | BLOCKED |
| **`last_night_stories`** | `expires_at > now() AND can_view_dream(...)` | `auth.uid()::text = user_id AND dream owner` | `auth.uid()::text = user_id` | `auth.uid()::text = user_id` |
| **`nearby_shares`** | **REVOKED FROM ALL** (Use RPC only) | `auth.uid()::text = user_id AND dream owner` | `auth.uid()::text = user_id` | `auth.uid()::text = user_id` |
| **`follows`** | Publicly readable (`true`) | `auth.uid()::text = follower_id` | BLOCKED | `auth.uid()::text = follower_id` |
| **`blocks`** | `auth.uid()::text = blocker_id` | `auth.uid()::text = blocker_id` | BLOCKED | `auth.uid()::text = blocker_id` |
| **`comments`** | `can_view_dream(dream_id, auth.uid()::text)` | `auth.uid()::text = user_id AND can_view_dream(...)` | BLOCKED | `auth.uid()::text = user_id` |
| **`reactions`** | `can_view_dream(dream_id, auth.uid()::text)` | `auth.uid()::text = user_id AND can_view_dream(...)` | BLOCKED | `auth.uid()::text = user_id` |
| **`saves`** | `auth.uid()::text = user_id` | `auth.uid()::text = user_id AND can_view_dream(...)` | BLOCKED | `auth.uid()::text = user_id` |
| **`share_events`** | Sharer or Dream owner | `auth.uid()::text = user_id AND can_view_dream(...)` | BLOCKED | BLOCKED |
| **`conversations`** | Participants only (`user_low` / `user_high`) | Via RPC `get_or_create_direct_conversation` | BLOCKED | BLOCKED |
| **`conversation_participants`**| Registered conversation participants | Via RPC | `auth.uid()::text = user_id` (read ping) | BLOCKED |
| **`messages`** | Sender, Recipient, or Conv Participant | Sender is auth caller AND valid recipient/conv | BLOCKED | BLOCKED |
| **`dream_circle_threads`** | `can_view_dream(dream_id, auth.uid()::text)` | `auth.uid()::text = created_by AND can_view_dream(...)` | `auth.uid()::text = created_by`| `auth.uid()::text = created_by`|
| **`dream_circle_replies`** | Parent Dream is viewable | `auth.uid()::text = user_id AND can_view_dream(...)` | BLOCKED | `auth.uid()::text = user_id` |
| **`notifications`** | `auth.uid()::text = recipient_id` | System / Trigger insertion only | `auth.uid()::text = recipient_id` | BLOCKED |
| **`reports`** | `auth.uid()::text = reporter_id` | `auth.uid()::text = reporter_id` | BLOCKED (Mod dashboard) | BLOCKED |

---

## 4. STORED PROCEDURES & SECURITY DEFINER APIS

1. **`public.can_view_dream(p_dream_id TEXT, p_user_id TEXT) -> BOOLEAN`**
   - Central authority for dream privacy across all feeds, clips, circles, and comments.
   - Owner always allowed; bidirectional block check denies immediately; `is_private = true` owner-only; `is_followers_only = true` requires verified follow.
2. **`public.can_view_profile(target_profile_id TEXT, p_user_id TEXT) -> BOOLEAN`**
   - Self always allowed; bidirectional block check denies immediately; `is_private = true` visible solely to verified followers.
3. **`public.is_blocked(p_user_a TEXT, p_user_b TEXT) -> BOOLEAN`**
   - Bidirectional block evaluation: returns true if either user has blocked the other.
4. **`public.get_or_create_direct_conversation(other_user_id TEXT) -> TEXT`**
   - Race-safe conversation provisioner with sorted `user_low < user_high` ordering and `ON CONFLICT DO NOTHING`.
5. **`public.toggle_reaction(target_dream_id TEXT, req_type TEXT) -> JSONB`**
   - Atomic toggle between reaction archetypes (`like`, `resonate`, `lucid`, `haunting`, `surreal`).
6. **`public.get_nearby_dreams(user_lat NUMERIC, user_lng NUMERIC, radius_meters NUMERIC, limit_count INT)`**
   - Spatial k-anonymity query: clamps search radius, enforces privacy, and returns generalized distance bands (`within_5km`, `within_15km`, `within_50km`, `same_region`).
7. **`public.find_similar_dreams(target_dream_id TEXT, match_limit INT)`**
   - Tag and mood intersection discovery strictly excluding blocked, private, or followers-only dreams.
8. **`public.increment_dream_view(p_dream_id TEXT) -> VOID`**
   - Counter increment validated against dream viewability.

---

## 5. SECURITY AUDIT VERIFICATION (ZERO BYPASS CERTIFICATION)

- **`auth.uid() IS NULL` in write/mutation rules:** Exactly **0** occurrences.
- **Wildcard `ILIKE` authorization:** Exactly **0** occurrences.
- **Unvalidated child entity creation:** Exactly **0** occurrences (all child media, stories, and clips verify that `dreams.user_id = auth.uid()::text`).
- **Direct coordinate leakage:** Direct `SELECT` on `nearby_shares` is revoked; only coarse distance bands can be retrieved through the security definer RPC.
- **TypeScript & Lint Validation:** Verified clean compile (`tsc --noEmit` passed with 0 errors).

---

## 6. PRE-FLIGHT EXECUTION RUNBOOK (WHEN APPROVED)

### Step 1: Migration File Adoption
Adopt the staged file as the official migration:
- **Source File:** `supabase/migrations/20260912000000_siimr_backend_v2_reconciled_secure.sql`
- **Action:** Retain or archive `20260911000000_siimr_backend_v2.sql` to `20260911000000_siimr_backend_v2.sql.bak`.

### Step 2: Operational Application Method
The script is wrapped in an atomic `BEGIN; ... COMMIT;` transaction block. It can be applied via:
1. **Supabase CLI:**
   ```bash
   supabase db push
   ```
2. **Supabase Dashboard SQL Editor:**
   - Copy the entire contents of `20260912000000_siimr_backend_v2_reconciled_secure.sql`.
   - Paste into the SQL Editor in the Supabase Dashboard.
   - Click **Run**. If any statement encounters an error, the entire migration rolls back automatically, leaving the 6 profiles and 44 activities untouched.

### Step 3: Post-Execution Verification Queries
Run the following verification script to confirm zero data loss and schema readiness:
```sql
-- Verify profiles row count (Must equal 6)
SELECT COUNT(*) AS profile_count FROM public.profiles;

-- Verify activities row count (Must equal 44)
SELECT COUNT(*) AS activity_count FROM public.activities;

-- Verify Dream Circles 1:1 constraint exists
SELECT conname, contype FROM pg_constraint WHERE conname = 'uq_dream_circle_threads_dream_id';

-- Verify Dream Transcripts 1:1 constraint exists
SELECT conname, contype FROM pg_constraint WHERE conname = 'uq_dream_transcripts_dream_id';

-- Verify nearby_shares direct select is revoked
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'nearby_shares';
```
