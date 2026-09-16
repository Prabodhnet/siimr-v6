export type Audience = 'only_me' | 'followers' | 'public';

export interface DreamComment {
  id: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  timestamp: string;
  authorColor?: string;
}

export interface DreamCircleThread {
  id: string;
  dreamId: string;
  title: string;
  authorName: string;
  authorAvatar?: string;
  timestamp: string;
  repliesCount: number;
  initialPost: string;
  replies: {
    id: string;
    authorName: string;
    authorAvatar?: string;
    text: string;
    timestamp: string;
  }[];
}

export interface PublishingSurfaces {
  normalPost: boolean;
  lastNightStory: boolean;
  nearbyShare: boolean;
  clip: boolean;
}

export interface Dream {
  id: string;
  title: string;
  hook: string;
  content: string;
  rawTranscript?: string;
  author: {
    id: string;
    name: string;
    handle: string;
    avatar: string;
    initials: string;
    color: string;
  };
  timeAgo: string;
  capturedTime?: string;
  category: 'Surreal' | 'Recurring' | 'Lucid' | 'Nightmares';
  tags: string[];
  audience: Audience;
  isNearbyEligible: boolean;
  region?: string;
  likes: number;
  commentsCount: number;
  viewsCount?: number;
  isLiked?: boolean;
  isSaved?: boolean;
  hasClip?: boolean;
  clipDuration?: string;
  clipVideoUrl?: string;
  imageUrl?: string;
  mediaUrl?: string;
  mediaKind?: 'none' | 'image' | 'video' | 'preset';
  mediaCaption?: string;
  mediaType?: 'illustration' | 'landscape' | 'minimal' | 'image' | 'video';
  visualQuote?: string;
  cardColor?: string;
  cardBorderColor?: string;
  cardTextColor?: string;
  cardGradient?: string;
  surfaces?: {
    isNormalPost?: boolean;
    isStory?: boolean;
    isNearby?: boolean;
    hasClip?: boolean;
    storyExpiresAt?: string;
  };
  comments: DreamComment[];
  circleThreads?: DreamCircleThread[];
  similarDreamPrompt?: string;
  similarDreamId?: string;
}

export interface ClipItem {
  id: string;
  dreamId: string;
  title: string;
  hook: string;
  quote: string;
  creator: {
    name: string;
    handle: string;
    avatar: string;
    timeAgo: string;
  };
  tags: string[];
  videoOrImageUrl: string;
  currentTime: string;
  totalTime: string;
  likes: number | string;
  commentsCount: number | string;
  viewsCount: number | string;
  isLiked?: boolean;
  isSaved?: boolean;
}

export interface NearbySticker {
  id: string;
  quote: string;
  author: string;
  motif: string;
  bgType: 'cream' | 'blush' | 'lavender' | 'cyan';
  rotation: number; // degrees
  position: { top: number; left?: number; right?: number };
  dreamId: string;
}

export interface DirectMessageItem {
  id: string;
  senderName: string;
  senderAvatar: string;
  previewText: string;
  timestamp: string;
  unreadCount?: number;
  isPinned?: boolean;
  status: 'online' | 'sleeping' | 'offline';
  messages: {
    id: string;
    sender: 'them' | 'me';
    text: string;
    time: string;
  }[];
}

export interface AuthUser {
  id: string;
  name: string;
  handle: string;
  username?: string;
  email: string;
  avatar: string;
  bio: string;
  initials: string;
  color: string;
  region?: string;
  nearbyOptIn?: boolean;
  discoverableInSearch?: boolean;
  followersCount: number;
  followingCount: number;
  dreamsCount: number;
  role?: 'user' | 'moderator' | 'admin';
  isGuest?: boolean;
  isDemo?: boolean;
  bannerQuote?: string;
  bannerUrl?: string;
  coverUrl?: string;
  createdAt?: string;
  likedDreamIds?: string[];
  savedDreamIds?: string[];
  followingUserIds?: string[];
  lastActiveAt?: string;
}

export type UserActivityType =
  | 'CREATE_DREAM'
  | 'LIKE_DREAM'
  | 'UNLIKE_DREAM'
  | 'SAVE_DREAM'
  | 'UNSAVE_DREAM'
  | 'ADD_COMMENT'
  | 'THREAD_REPLY'
  | 'FOLLOW_USER'
  | 'UNFOLLOW_USER'
  | 'SIGNUP'
  | 'LOGIN'
  | 'LOGOUT'
  | 'UPDATE_PROFILE'
  | 'SEND_MESSAGE';

export interface UserActivity {
  id: string;
  userId: string;
  actionType: UserActivityType;
  title: string;
  description: string;
  targetId?: string;
  targetType?: 'dream' | 'clip' | 'user' | 'message' | 'account';
  timestamp: string;
  metadata?: Record<string, any>;
}

