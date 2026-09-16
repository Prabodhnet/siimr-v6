import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { UserActivity, UserActivityType, Dream, DirectMessageItem } from '../types';
import { supabaseService } from './supabaseService';
import { normalizeDream } from '../utils/normalizeDream';

class ActivityService {
  private localActivityCache: Record<string, UserActivity[]> = {};

  /**
   * Generates unique key for user cache
   */
  private getCacheKey(userId: string): string {
    return `siimr_activities_${userId}`;
  }

  /**
   * Record an activity permanently in Firestore under `users/{userId}/activities/{activityId}`
   */
  public async recordActivity(
    userId: string,
    params: {
      actionType: UserActivityType;
      title: string;
      description: string;
      targetId?: string;
      targetType?: 'dream' | 'clip' | 'user' | 'message' | 'account';
      metadata?: Record<string, any>;
    }
  ): Promise<UserActivity> {
    const activityId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const activity: UserActivity = {
      id: activityId,
      userId,
      actionType: params.actionType,
      title: params.title,
      description: params.description,
      targetId: params.targetId,
      targetType: params.targetType,
      timestamp,
      metadata: params.metadata || {}
    };

    // Update in-memory and local cache
    if (!this.localActivityCache[userId]) {
      this.localActivityCache[userId] = this.loadLocalActivities(userId);
    }
    this.localActivityCache[userId] = [activity, ...this.localActivityCache[userId]];
    this.saveLocalActivities(userId, this.localActivityCache[userId]);

    // Persist to Cloud Firestore if not a pure local guest
    if (userId && !userId.startsWith('u-guest')) {
      try {
        const actDocRef = doc(db, 'users', userId, 'activities', activityId);
        await setDoc(actDocRef, {
          ...activity,
          serverCreatedAt: serverTimestamp()
        });

        // Also update lastActiveAt on user doc
        const userRef = doc(db, 'users', userId);
        await setDoc(
          userRef,
          {
            lastActiveAt: timestamp,
            lastActivitySummary: `${params.title}: ${params.description}`
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore activity logging note (saved locally):', err);
      }
    }

    // Persist to Supabase backend `activities` table
    supabaseService.recordActivity({
      user_id: userId,
      action_type: params.actionType,
      title: params.title,
      description: params.description,
      target_id: params.targetId,
      target_type: params.targetType,
      metadata: params.metadata,
      created_at: timestamp,
    }).catch((err) => console.warn('Supabase activity logging note:', err));

    return activity;
  }

  /**
   * Fetch activities for a given user from Cloud Firestore, fallback to local storage
   */
  public async getUserActivities(userId: string): Promise<UserActivity[]> {
    if (!userId) return [];

    // First retrieve local cache
    const local = this.loadLocalActivities(userId);

    // If guest, local is primary
    if (userId.startsWith('u-guest')) {
      return local;
    }

    try {
      const activitiesCol = collection(db, 'users', userId, 'activities');
      const q = query(activitiesCol, orderBy('timestamp', 'desc'), limit(50));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const firestoreActivities: UserActivity[] = [];
        snap.forEach((d) => {
          firestoreActivities.push(d.data() as UserActivity);
        });

        // Merge and update cache
        this.saveLocalActivities(userId, firestoreActivities);
        this.localActivityCache[userId] = firestoreActivities;
        return firestoreActivities;
      }
    } catch (err) {
      console.warn('Could not read activities from Firestore, using local cache:', err);
    }

    return local;
  }

  /**
   * Retrieve permanent user state (liked dream IDs, saved dream IDs, following user IDs)
   */
  public async getUserSavedState(userId: string): Promise<{
    likedDreamIds: string[];
    savedDreamIds: string[];
    followingUserIds: string[];
  }> {
    const defaultState = {
      likedDreamIds: [] as string[],
      savedDreamIds: [] as string[],
      followingUserIds: [] as string[]
    };

    if (!userId) return defaultState;

    // Check localStorage cache first
    try {
      const stored = localStorage.getItem(`siimr_state_${userId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        defaultState.likedDreamIds = parsed.likedDreamIds || [];
        defaultState.savedDreamIds = parsed.savedDreamIds || [];
        defaultState.followingUserIds = parsed.followingUserIds || [];
      }
    } catch (e) {
      console.warn('Local state read note:', e);
    }

    // Fetch from Firestore `users/{userId}`
    if (!userId.startsWith('u-guest')) {
      try {
        const userDocRef = doc(db, 'users', userId);
        const snap = await getDoc(userDocRef);
        if (snap.exists()) {
          const data = snap.data();
          const cloudState = {
            likedDreamIds: Array.isArray(data.likedDreamIds) ? data.likedDreamIds : defaultState.likedDreamIds,
            savedDreamIds: Array.isArray(data.savedDreamIds) ? data.savedDreamIds : defaultState.savedDreamIds,
            followingUserIds: Array.isArray(data.followingUserIds) ? data.followingUserIds : defaultState.followingUserIds
          };

          // Cache locally
          localStorage.setItem(`siimr_state_${userId}`, JSON.stringify(cloudState));
          return cloudState;
        }
      } catch (err) {
        console.warn('Firestore user state read note:', err);
      }
    }

    return defaultState;
  }

  /**
   * Sync Dream Like state permanently to Firestore
   */
  public async syncDreamLike(userId: string, dreamId: string, isLiked: boolean, dreamTitle?: string): Promise<void> {
    // 1. Update local cached state
    try {
      const stored = localStorage.getItem(`siimr_state_${userId}`);
      const state = stored ? JSON.parse(stored) : { likedDreamIds: [], savedDreamIds: [], followingUserIds: [] };
      if (isLiked) {
        if (!state.likedDreamIds.includes(dreamId)) state.likedDreamIds.push(dreamId);
      } else {
        state.likedDreamIds = state.likedDreamIds.filter((id: string) => id !== dreamId);
      }
      localStorage.setItem(`siimr_state_${userId}`, JSON.stringify(state));
    } catch (e) {
      console.warn('Local like cache note:', e);
    }

    // 2. Record permanent activity
    await this.recordActivity(userId, {
      actionType: isLiked ? 'LIKE_DREAM' : 'UNLIKE_DREAM',
      title: isLiked ? 'Echoed a Dream' : 'Removed Echo',
      description: isLiked
        ? `Echoed "${dreamTitle || 'Dream memory'}"`
        : `Removed echo from "${dreamTitle || 'Dream memory'}"`,
      targetId: dreamId,
      targetType: 'dream'
    });

    // 3. Persist to Firestore
    if (userId && !userId.startsWith('u-guest')) {
      try {
        const userRef = doc(db, 'users', userId);
        await setDoc(
          userRef,
          {
            likedDreamIds: isLiked ? arrayUnion(dreamId) : arrayRemove(dreamId),
            serverUpdatedAt: serverTimestamp()
          },
          { merge: true }
        );

        // Update like counter on dream document if it exists in Firestore
        const dreamRef = doc(db, 'dreams', dreamId);
        await setDoc(
          dreamRef,
          {
            likes: increment(isLiked ? 1 : -1)
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore like sync note:', err);
      }
    }

    // Persist to Supabase `reactions` table
    supabaseService.syncReaction(userId, 'dream', dreamId, 'like', isLiked, dreamTitle).catch((err) => {
      console.warn('Supabase like sync note:', err);
    });
  }

  /**
   * Sync Dream Bookmark/Save state permanently to Firestore
   */
  public async syncDreamSave(userId: string, dreamId: string, isSaved: boolean, dreamTitle?: string): Promise<void> {
    // 1. Update local cached state
    try {
      const stored = localStorage.getItem(`siimr_state_${userId}`);
      const state = stored ? JSON.parse(stored) : { likedDreamIds: [], savedDreamIds: [], followingUserIds: [] };
      if (isSaved) {
        if (!state.savedDreamIds.includes(dreamId)) state.savedDreamIds.push(dreamId);
      } else {
        state.savedDreamIds = state.savedDreamIds.filter((id: string) => id !== dreamId);
      }
      localStorage.setItem(`siimr_state_${userId}`, JSON.stringify(state));
    } catch (e) {
      console.warn('Local save cache note:', e);
    }

    // 2. Record permanent activity
    await this.recordActivity(userId, {
      actionType: isSaved ? 'SAVE_DREAM' : 'UNSAVE_DREAM',
      title: isSaved ? 'Bookmarked to Archive' : 'Removed Bookmark',
      description: isSaved
        ? `Saved "${dreamTitle || 'Dream memory'}" to personal archive`
        : `Removed "${dreamTitle || 'Dream memory'}" from archive`,
      targetId: dreamId,
      targetType: 'dream'
    });

    // 3. Persist to Firestore
    if (userId && !userId.startsWith('u-guest')) {
      try {
        const userRef = doc(db, 'users', userId);
        await setDoc(
          userRef,
          {
            savedDreamIds: isSaved ? arrayUnion(dreamId) : arrayRemove(dreamId),
            serverUpdatedAt: serverTimestamp()
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore save sync note:', err);
      }
    }

    // Persist to Supabase `saves` table
    supabaseService.syncSave(userId, 'dream', dreamId, isSaved, dreamTitle).catch((err) => {
      console.warn('Supabase save sync note:', err);
    });
  }

  /**
   * Save a newly recorded or captured dream to Firestore permanently
   */
  public async saveDreamToFirestore(dream: Dream): Promise<void> {
    const dreamPayload = {
      ...dream,
      userId: dream.author.id, // Explicit top-level user ID association
      serverCreatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    };

    const dreamRef = doc(db, 'dreams', dream.id);
    await setDoc(dreamRef, dreamPayload);

    // Increment user's dream count
    if (dream.author.id && !dream.author.id.startsWith('u-guest')) {
      try {
        const userRef = doc(db, 'users', dream.author.id);
        await setDoc(
          userRef,
          {
            dreamsCount: increment(1),
            serverUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (userErr) {
        console.warn('User profile dreams count increment note:', userErr);
      }
    }

    // Record activity
    await this.recordActivity(dream.author.id, {
      actionType: 'CREATE_DREAM',
      title: 'Archived New Dream',
      description: `Recorded "${dream.title}" (${dream.category} • ${dream.audience})`,
      targetId: dream.id,
      targetType: 'dream',
      metadata: {
        category: dream.category,
        tags: dream.tags,
        audience: dream.audience
      }
    });
  }

  /**
   * Fetch all dreams from Firestore and merge with default dreams.
   * If userId is provided, ensures all dreams authored by this user are reliably fetched.
   */
  public async getAllDreamsFromFirestore(defaultDreams: Dream[], userId?: string): Promise<Dream[]> {
    const cloudDreamsMap = new Map<string, Dream>();

    const timeoutPromise = <T>(promise: Promise<T>, ms = 3500): Promise<T> => {
      let timer: any;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('firestore-timeout')), ms);
      });
      return Promise.race([
        promise.then((res) => {
          clearTimeout(timer);
          return res;
        }),
        timeout,
      ]);
    };

    // 1. Fetch from Firestore (all dreams collection)
    try {
      const dreamsCol = collection(db, 'dreams');
      const snap = await timeoutPromise(getDocs(dreamsCol));
      if (!snap.empty) {
        snap.forEach((d) => {
          const raw = d.data();
          if (raw) {
            cloudDreamsMap.set(d.id, normalizeDream({ ...raw, id: raw.id || d.id }, d.id));
          }
        });
      }
    } catch (err) {
      console.info('Firestore dreams fetch note (continuing with cache/Supabase):', err instanceof Error ? err.message : err);
    }

    // 1b. If specific userId provided, query explicitly by author.id and userId to guarantee recovery
    if (userId) {
      try {
        const userDreamsCol = collection(db, 'dreams');
        const [authorSnap, userSnap] = await timeoutPromise(
          Promise.all([
            getDocs(query(userDreamsCol, where('author.id', '==', userId))),
            getDocs(query(userDreamsCol, where('userId', '==', userId))),
          ])
        );

        const handleDoc = (d: any) => {
          const raw = d.data();
          if (raw && !cloudDreamsMap.has(d.id)) {
            cloudDreamsMap.set(d.id, normalizeDream({ ...raw, id: raw.id || d.id }, d.id));
          }
        };

        authorSnap.forEach(handleDoc);
        userSnap.forEach(handleDoc);
      } catch (err) {
        console.info('Firestore user dreams query note:', err instanceof Error ? err.message : err);
      }
    }

    let cloudDreams = Array.from(cloudDreamsMap.values());

    // 2. Fetch from Supabase
    try {
      const supabaseDreams = await supabaseService.fetchDreams({ userId });
      if (supabaseDreams && supabaseDreams.length > 0) {
        const existingIds = new Set(cloudDreams.map((d) => d.id));
        const newFromSupabase = supabaseDreams
          .filter((d) => !existingIds.has(d.id))
          .map((d) => normalizeDream(d, d.id));
        cloudDreams = [...newFromSupabase, ...cloudDreams];
      }
    } catch (err) {
      console.warn('Supabase dreams fetch note:', err);
    }

    if (cloudDreams.length > 0) {
      // Merge cloud dreams with default dreams (avoid duplicates by ID)
      const cloudIds = new Set(cloudDreams.map((d) => d.id));
      const filteredDefault = defaultDreams
        .filter((d) => !cloudIds.has(d.id))
        .map((d) => normalizeDream(d, d.id));
      return [...cloudDreams, ...filteredDefault];
    }

    return defaultDreams.map((d) => normalizeDream(d, d.id));
  }

  /**
   * Sync comment to Firestore and Supabase
   */
  public async syncComment(userId: string, dreamId: string, comment: any, dreamTitle?: string): Promise<void> {
    await this.recordActivity(userId, {
      actionType: 'ADD_COMMENT',
      title: 'Left Reflection',
      description: `Commented on "${dreamTitle || 'Dream memory'}": "${comment.text.slice(0, 40)}${comment.text.length > 40 ? '...' : ''}"`,
      targetId: dreamId,
      targetType: 'dream'
    });

    if (dreamId) {
      try {
        const dreamRef = doc(db, 'dreams', dreamId);
        await setDoc(
          dreamRef,
          {
            comments: arrayUnion(comment),
            commentsCount: increment(1)
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore comment sync note:', err);
      }

      // Persist to Supabase `comments` table
      supabaseService.syncComment(userId, 'dream', dreamId, comment, dreamTitle).catch((err) => {
        console.warn('Supabase comment sync note:', err);
      });
    }
  }

  /**
   * Helper to load local activities from storage
   */
  private loadLocalActivities(userId: string): UserActivity[] {
    try {
      const stored = localStorage.getItem(this.getCacheKey(userId));
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Error parsing local activities:', e);
    }
    return [];
  }

  /**
   * Helper to save local activities to storage
   */
  private saveLocalActivities(userId: string, activities: UserActivity[]) {
    try {
      localStorage.setItem(this.getCacheKey(userId), JSON.stringify(activities.slice(0, 50)));
    } catch (e) {
      console.warn('Error saving local activities:', e);
    }
  }
}

export const activityService = new ActivityService();
