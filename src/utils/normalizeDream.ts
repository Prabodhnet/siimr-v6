import { Dream } from '../types';
import { INITIAL_DREAMS } from '../mockData';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';

/**
 * Normalizes any dream object from Firestore, Supabase, or localStorage
 * to ensure all critical fields (especially author and avatar) are safely populated.
 */
export function normalizeDream(raw: any, fallbackId?: string): Dream {
  if (!raw || typeof raw !== 'object') {
    return {
      id: fallbackId || `dream-${Date.now()}`,
      title: 'UNTITLED DREAM',
      hook: 'A memory from sleep...',
      content: 'A dream captured in the silence of dawn.',
      author: {
        id: 'u-unknown',
        name: 'Dreamer',
        handle: '@dreamer',
        avatar: DEFAULT_AVATAR,
        initials: 'D',
        color: '#5438FF',
      },
      timeAgo: 'Recently',
      capturedTime: 'captured at dawn',
      category: 'Surreal',
      tags: ['Surreal', 'DreamWorld'],
      audience: 'public',
      isNearbyEligible: true,
      region: 'Bhubaneswar area',
      likes: 1,
      commentsCount: 0,
      viewsCount: 1,
      isLiked: false,
      isSaved: false,
      hasClip: false,
      mediaType: 'illustration',
      comments: [],
      circleThreads: [],
    };
  }

  // If this matches an initial mock dream by ID and is missing key properties, merge with default
  const mockFallback = INITIAL_DREAMS.find((m) => m.id === raw.id);

  const authorObj = raw.author && typeof raw.author === 'object' ? raw.author : {};
  const fallbackAuthor = mockFallback?.author || {
    id: 'u-dreamer',
    name: 'Dreamer',
    handle: '@dreamer',
    avatar: DEFAULT_AVATAR,
    initials: 'D',
    color: '#5438FF',
  };

  const name = authorObj.name || raw.authorName || fallbackAuthor.name || 'Dreamer';
  const handle = authorObj.handle || (raw.authorHandle ? `@${raw.authorHandle.replace(/^@/, '')}` : fallbackAuthor.handle) || '@dreamer';
  const avatar = authorObj.avatar || raw.authorAvatar || fallbackAuthor.avatar || DEFAULT_AVATAR;
  const initials = authorObj.initials || (name ? name[0].toUpperCase() : 'D');
  const color = authorObj.color || fallbackAuthor.color || '#5438FF';
  const authorId = authorObj.id || raw.userId || raw.user_id || fallbackAuthor.id || 'u-me';

  const category = ['Surreal', 'Recurring', 'Lucid', 'Nightmares'].includes(raw.category)
    ? raw.category
    : (mockFallback?.category || 'Surreal');

  const tags = Array.isArray(raw.tags) && raw.tags.length > 0
    ? raw.tags
    : (mockFallback?.tags || [category, 'DreamWorld']);

  const title = raw.title?.trim() || mockFallback?.title || 'UNTITLED DREAM';
  const content = raw.content?.trim() || mockFallback?.content || 'A quiet dream recorded at dawn.';
  const hook = raw.hook?.trim() || mockFallback?.hook || `"${content.slice(0, 45)}..."`;

  return {
    id: raw.id || fallbackId || `dream-${Date.now()}`,
    title,
    hook,
    content,
    rawTranscript: raw.rawTranscript || raw.raw_transcript,
    author: {
      id: authorId,
      name,
      handle,
      avatar,
      initials,
      color,
    },
    timeAgo: raw.timeAgo || raw.time_ago || mockFallback?.timeAgo || 'Recently',
    capturedTime: raw.capturedTime || raw.captured_time || mockFallback?.capturedTime || 'captured at dawn',
    category,
    tags,
    audience: raw.audience === 'only_me' || raw.audience === 'followers' || raw.audience === 'public'
      ? raw.audience
      : (raw.visibility === 'private' ? 'only_me' : 'public'),
    isNearbyEligible: raw.isNearbyEligible ?? raw.nearby_eligible ?? (mockFallback?.isNearbyEligible ?? true),
    region: raw.region || raw.geo_bucket || mockFallback?.region || 'Bhubaneswar area',
    likes: typeof raw.likes === 'number' ? raw.likes : (mockFallback?.likes || 1),
    commentsCount: typeof raw.commentsCount === 'number' ? raw.commentsCount : (mockFallback?.commentsCount || 0),
    viewsCount: typeof raw.viewsCount === 'number' ? raw.viewsCount : (mockFallback?.viewsCount || 10),
    isLiked: Boolean(raw.isLiked),
    isSaved: Boolean(raw.isSaved),
    hasClip: Boolean(raw.hasClip || raw.surfaces?.hasClip || mockFallback?.hasClip),
    clipDuration: raw.clipDuration || mockFallback?.clipDuration,
    clipVideoUrl: raw.clipVideoUrl || raw.video_url || mockFallback?.clipVideoUrl,
    imageUrl: raw.imageUrl || raw.image_url || mockFallback?.imageUrl,
    mediaUrl: raw.mediaUrl || raw.media_url || raw.imageUrl || raw.clipVideoUrl || mockFallback?.mediaUrl,
    mediaKind: raw.mediaKind || (raw.clipVideoUrl || raw.video_url ? 'video' : (raw.imageUrl || raw.image_url ? 'image' : (mockFallback?.mediaKind || 'none'))),
    mediaCaption: raw.mediaCaption || mockFallback?.mediaCaption,
    mediaType: raw.mediaType || (raw.clipVideoUrl ? 'video' : (raw.imageUrl ? 'image' : (mockFallback?.mediaType || 'illustration'))),
    visualQuote: raw.visualQuote || mockFallback?.visualQuote,
    cardColor: raw.cardColor || raw.card_color || raw.raw_data?.cardColor || raw.raw_data?.card_color || mockFallback?.cardColor || '#D8D4FF',
    cardBorderColor: raw.cardBorderColor || raw.card_border_color || raw.raw_data?.cardBorderColor || raw.raw_data?.card_border_color || mockFallback?.cardBorderColor,
    cardTextColor: raw.cardTextColor || raw.card_text_color || raw.raw_data?.cardTextColor || raw.raw_data?.card_text_color || mockFallback?.cardTextColor,
    cardGradient: raw.cardGradient || raw.card_gradient || raw.raw_data?.cardGradient || raw.raw_data?.card_gradient || mockFallback?.cardGradient,
    similarDreamPrompt: raw.similarDreamPrompt || mockFallback?.similarDreamPrompt,
    similarDreamId: raw.similarDreamId || mockFallback?.similarDreamId,
    surfaces: {
      isNormalPost: raw.surfaces?.isNormalPost ?? true,
      isStory: raw.surfaces?.isStory ?? true,
      isNearby: raw.surfaces?.isNearby ?? true,
      hasClip: Boolean(raw.surfaces?.hasClip || raw.hasClip),
      storyExpiresAt: raw.surfaces?.storyExpiresAt,
    },
    comments: Array.isArray(raw.comments) ? raw.comments : (mockFallback?.comments || []),
    circleThreads: Array.isArray(raw.circleThreads) ? raw.circleThreads : (mockFallback?.circleThreads || []),
  };
}
