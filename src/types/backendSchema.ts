/**
 * siimr — 05 Backend Schema (Data Model & Auth Architecture)
 * TypeScript Database Types, Entities, DTOs and Projection Mappers
 */

// ============================================================================
// 1. ENUMS & LITERALS
// ============================================================================

export type ProfileVisibility = 'public' | 'private';
export type DreamPrivacy = 'private' | 'followers' | 'public';
export type DreamStatus = 'draft' | 'processing' | 'ready' | 'archived' | 'deleted';
export type DreamSource = 'voice' | 'text' | 'import';
export type DreamMediaType = 'audio' | 'image';
export type ClipPrivacy = 'followers' | 'public';
export type ClipStatus = 'draft' | 'uploading' | 'processing' | 'ready' | 'deleted';
export type ReactionType = 'resonance';
export type ProcessingJobType = 'transcription' | 'title' | 'hook' | 'motif' | 'echo';
export type ProcessingJobStatus = 'queued' | 'processing' | 'complete' | 'failed';
export type ReportTargetType = 'dream' | 'clip' | 'reply' | 'user';
export type ReportStatus = 'open' | 'reviewed' | 'resolved' | 'dismissed';
export type CircleStatus = 'active' | 'locked' | 'deleted';
export type UserRole = 'user' | 'moderator' | 'admin';

// ============================================================================
// 2. DATABASE TABLE ROW DEFINITIONS (Exact mirror of PostgreSQL schema)
// ============================================================================

export interface UserRow {
  id: string; // uuid PK references auth.users.id
  username: string; // text UNIQUE
  display_name: string;
  bio: string | null;
  avatar_path: string | null;
  profile_visibility: ProfileVisibility;
  nearby_opt_in: boolean; // default false
  region_bucket: string | null; // coarse server-derived region, never raw coordinates
  created_at: string;
  updated_at: string;
}

export interface DreamRow {
  id: string; // uuid PK
  user_id: string; // uuid FK -> users.id
  title: string | null;
  hook: string | null;
  raw_text: string | null;
  captured_at: string;
  occurred_at: string | null;
  privacy: DreamPrivacy;
  status: DreamStatus;
  source: DreamSource;
  created_at: string;
  updated_at: string;
}

export interface DreamMediaRow {
  id: string; // uuid PK
  dream_id: string; // uuid FK -> dreams.id
  user_id: string; // uuid FK -> users.id
  media_type: DreamMediaType;
  storage_path: string;
  mime_type: string;
  duration_ms: number | null;
  created_at: string;
}

export interface FollowRow {
  follower_id: string; // uuid FK -> users.id
  followed_id: string; // uuid FK -> users.id
  created_at: string;
}

export interface ClipRow {
  id: string; // uuid PK
  user_id: string; // uuid FK -> users.id
  dream_id: string; // uuid FK -> dreams.id
  media_path: string;
  mime_type: string;
  duration_ms: number | null;
  privacy: ClipPrivacy;
  status: ClipStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ReactionRow {
  id: string; // uuid PK
  user_id: string; // uuid FK -> users.id
  dream_id: string | null; // uuid FK -> dreams.id
  clip_id: string | null; // uuid FK -> clips.id
  type: ReactionType;
  created_at: string;
}

export interface ReplyRow {
  id: string; // uuid PK
  user_id: string; // uuid FK -> users.id
  dream_id: string | null; // uuid FK -> dreams.id
  clip_id: string | null; // uuid FK -> clips.id
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SaveRow {
  user_id: string; // uuid FK -> users.id
  dream_id: string; // uuid FK -> dreams.id
  created_at: string;
}

export interface NearbyEligibilityRow {
  user_id: string; // uuid PK FK -> users.id
  enabled: boolean;
  region_bucket: string;
  cohort_date: string;
  updated_at: string;
}

export interface NearbyMotifCountRow {
  id: string; // uuid PK
  region_bucket: string;
  night_date: string;
  motif_key: string;
  display_label: string;
  count: number;
  minimum_threshold_met: boolean;
  created_at: string;
}

export interface NearbyDreamCandidateRow {
  id: string; // uuid PK
  dream_id: string; // uuid FK -> dreams.id
  region_bucket: string;
  night_date: string;
  eligible: boolean;
  created_at: string;
}

export interface ProcessingJobRow {
  id: string; // uuid PK
  dream_id: string; // uuid FK -> dreams.id
  job_type: ProcessingJobType;
  status: ProcessingJobStatus;
  attempts: number;
  idempotency_key: string; // text UNIQUE
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportRow {
  id: string; // uuid PK
  reporter_user_id: string; // uuid FK -> users.id
  target_type: ReportTargetType;
  target_id: string; // uuid
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface BlockRow {
  blocker_id: string; // uuid FK -> users.id
  blocked_id: string; // uuid FK -> users.id
  created_at: string;
}

export interface DreamCircleRow {
  id: string; // uuid PK
  dream_id: string; // uuid UNIQUE FK -> dreams.id
  status: CircleStatus;
  created_at: string;
  updated_at: string;
}

export interface CircleThreadRow {
  id: string; // uuid PK
  circle_id: string; // uuid FK -> dream_circles.id
  user_id: string; // uuid FK -> users.id
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CircleReplyRow {
  id: string; // uuid PK
  thread_id: string; // uuid FK -> circle_threads.id
  user_id: string; // uuid FK -> users.id
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ============================================================================
// 3. PERMISSION-SAFE DTOs & PROJECTION MODELS (SECTION 11)
// ============================================================================

/**
 * 3.1 Owner Dream DTO
 * Authorized only for the author / owner.
 * Contains raw dream transcripts, private media metadata, processing state.
 */
export interface OwnerDreamDTO {
  id: string;
  title: string | null;
  hook: string | null;
  rawText: string | null;
  capturedAt: string;
  occurredAt: string | null;
  privacy: DreamPrivacy;
  status: DreamStatus;
  source: DreamSource;
  media: {
    id: string;
    mediaType: DreamMediaType;
    storagePath: string;
    mimeType: string;
    durationMs: number | null;
  }[];
  processingJobs: {
    jobType: ProcessingJobType;
    status: ProcessingJobStatus;
    attempts: number;
    lastError: string | null;
  }[];
  isOwner: true;
  createdAt: string;
  updatedAt: string;
}

/**
 * 3.2 Social Dream DTO
 * Public or follower projection.
 * Never leaks raw unprocessed inputs, private media, or non-public fields.
 */
export interface SocialDreamDTO {
  id: string;
  title: string;
  hook: string;
  summary: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  timeAgo: string;
  capturedAt: string;
  privacy: 'public' | 'followers';
  metrics: {
    resonanceCount: number;
    repliesCount: number;
    savesCount: number;
    hasResonated: boolean;
    hasSaved: boolean;
  };
  hasClip: boolean;
  clipId?: string;
  hasCircle: boolean;
  circleId?: string;
}

/**
 * 3.3 Nearby DTO
 * Coarse regional projection only. Zero exact coordinates.
 * Protected by minimum cohort thresholds.
 */
export interface NearbyDTO {
  regionBucket: string;
  cohortDate: string;
  totalNearbyDreams: number;
  motifAggregations: {
    motifKey: string;
    displayLabel: string;
    count: number;
    thresholdMet: boolean;
  }[];
  eligibleDreamPreviews: {
    id: string;
    quoteHook: string;
    authorName: string;
    motif: string;
    timeAgo: string;
  }[];
}

/**
 * 3.4 Moderation Report DTO
 */
export interface ModerationReportDTO {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * 3.5 Dream Circle Thread & Reply DTOs
 */
export interface DreamCircleReplyDTO {
  id: string;
  threadId: string;
  author: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
  };
  body: string;
  createdAt: string;
  timeAgo: string;
  isOwner: boolean;
}

export interface DreamCircleThreadDTO {
  id: string;
  circleId: string;
  title: string;
  body: string;
  author: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
  };
  createdAt: string;
  timeAgo: string;
  repliesCount: number;
  replies: DreamCircleReplyDTO[];
  isOwner: boolean;
}

// ============================================================================
// 4. PROJECTION MAPPERS & SECURITY INVARIANT VALIDATORS
// ============================================================================

/**
 * Maps raw database rows into an OwnerDreamDTO
 */
export function toOwnerDreamDTO(
  dream: DreamRow,
  mediaList: DreamMediaRow[],
  jobsList: ProcessingJobRow[]
): OwnerDreamDTO {
  return {
    id: dream.id,
    title: dream.title,
    hook: dream.hook,
    rawText: dream.raw_text,
    capturedAt: dream.captured_at,
    occurredAt: dream.occurred_at,
    privacy: dream.privacy,
    status: dream.status,
    source: dream.source,
    media: mediaList.map((m) => ({
      id: m.id,
      mediaType: m.media_type,
      storagePath: m.storage_path,
      mimeType: m.mime_type,
      durationMs: m.duration_ms,
    })),
    processingJobs: jobsList.map((j) => ({
      jobType: j.job_type,
      status: j.status,
      attempts: j.attempts,
      lastError: j.last_error,
    })),
    isOwner: true,
    createdAt: dream.created_at,
    updatedAt: dream.updated_at,
  };
}

/**
 * Maps raw database rows into a safe SocialDreamDTO
 * Enforces removal of raw_text and private fields
 */
export function toSocialDreamDTO(
  dream: DreamRow,
  author: UserRow,
  metrics: {
    resonanceCount: number;
    repliesCount: number;
    savesCount: number;
    hasResonated: boolean;
    hasSaved: boolean;
  },
  clip?: ClipRow,
  circle?: DreamCircleRow
): SocialDreamDTO {
  return {
    id: dream.id,
    title: dream.title || 'UNTITLED DREAM',
    hook: dream.hook || 'Captured before it faded...',
    summary: dream.hook || dream.title || '',
    author: {
      id: author.id,
      username: author.username,
      displayName: author.display_name,
      avatarUrl: author.avatar_path,
    },
    timeAgo: formatTimeAgo(new Date(dream.captured_at)),
    capturedAt: dream.captured_at,
    privacy: dream.privacy === 'private' ? 'followers' : (dream.privacy as 'public' | 'followers'),
    metrics,
    hasClip: !!clip && clip.status === 'ready' && !clip.deleted_at,
    clipId: clip?.id,
    hasCircle: !!circle && circle.status === 'active',
    circleId: circle?.id,
  };
}

/**
 * Enforces the rule: Clip visibility cannot exceed underlying Dream visibility.
 * Returns true if valid, throws error or returns false if invalid.
 */
export function validateClipPrivacyAgainstDream(
  dreamPrivacy: DreamPrivacy,
  clipPrivacy: ClipPrivacy
): boolean {
  if (dreamPrivacy === 'private') {
    return false; // private dreams can never have public or follower clips
  }
  if (dreamPrivacy === 'followers' && clipPrivacy === 'public') {
    return false; // clip cannot be public if dream is followers-only
  }
  return true;
}

/**
 * Access Control Check for viewing a Dream
 */
export function canAccessDreamCheck(params: {
  dream: DreamRow;
  currentUserId?: string | null;
  isFollower?: boolean;
  isBlocked?: boolean;
  isAdminOrMod?: boolean;
}): boolean {
  const { dream, currentUserId, isFollower, isBlocked, isAdminOrMod } = params;

  if (dream.status === 'deleted') return false;
  if (isAdminOrMod) return true;
  if (currentUserId && currentUserId === dream.user_id) return true;
  if (isBlocked) return false;

  if (dream.privacy === 'private') return false;
  if (dream.privacy === 'followers') return Boolean(isFollower);
  return dream.privacy === 'public';
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
