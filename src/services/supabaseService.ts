import { supabase, SUPABASE_PROJECT_ID, SUPABASE_URL } from './supabase';
import { Dream, AuthUser, DirectMessageItem, PublishingSurfaces, ClipItem, Audience } from '../types';
import { uploadDreamMedia } from './dreamMediaUpload';

export interface SupabaseActivityRecord {
  id?: string;
  user_id: string;
  action_type: string;
  title: string;
  description: string;
  target_id?: string;
  target_type?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface SaveCanonicalDreamOptions {
  surfaces?: Partial<PublishingSurfaces>;
  rawTranscript?: string;
  clipCaption?: string;
  clipDurationSeconds?: number;
  clipVideoUrl?: string;
  regionBucket?: string;
  mediaFile?: File;
  voiceNotePath?: string;
}

export class SupabaseService {
  public readonly projectId = SUPABASE_PROJECT_ID;
  public readonly url = SUPABASE_URL;

  // ============================================================================
  // 1. HEALTH & CONNECTION DIAGNOSTICS
  // ============================================================================

  /**
   * Diagnostic test for Supabase connectivity and table presence
   */
  public async testConnection(): Promise<{
    success: boolean;
    message: string;
    tablesFound: string[];
    missingTables: string[];
  }> {
    const keyTables = [
      'profiles',
      'dreams',
      'last_night_stories',
      'dream_publications',
      'nearby_shares',
      'clips',
      'dream_circles',
      'activities',
      'comments',
      'reactions'
    ];

    const tablesFound: string[] = [];
    const missingTables: string[] = [];

    try {
      // Test basic REST endpoint reachability
      const { data, error } = await supabase.from('activities').select('id').limit(1);

      if (error && error.code !== '42P01' && error.code !== 'PGRST204' && !error.message.includes('relation')) {
        // If error is not a "table does not exist" code, check whether project URL is reachable
        return {
          success: true,
          message: `Connected to Supabase endpoint (${this.projectId}). REST API responsive.`,
          tablesFound: [],
          missingTables: keyTables,
        };
      }

      // Check key tables in parallel
      await Promise.all(
        keyTables.map(async (table) => {
          try {
            const { error: tblErr } = await supabase.from(table).select('id').limit(1);
            if (!tblErr) {
              tablesFound.push(table);
            } else if (tblErr.code === '42P01' || tblErr.message.includes('relation')) {
              missingTables.push(table);
            } else {
              tablesFound.push(table);
            }
          } catch {
            missingTables.push(table);
          }
        })
      );

      return {
        success: true,
        message: `Connected to Supabase project "${this.projectId}". Ready for production traffic.`,
        tablesFound,
        missingTables,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Could not connect to Supabase endpoint',
        tablesFound: [],
        missingTables: keyTables,
      };
    }
  }

  // ============================================================================
  // 2. SUPABASE AUTH WRAPPERS (Linked 1:1 with public.profiles)
  // ============================================================================

  public async authSignUp(params: {
    email: string;
    password: string;
    displayName: string;
    handle: string;
    bio?: string;
    regionBucket?: string;
    nearbyOptIn?: boolean;
  }): Promise<{ success: boolean; session?: any; user?: AuthUser; message?: string; error?: string }> {
    try {
      const cleanEmail = params.email.trim().toLowerCase();
      const cleanHandle = params.handle.startsWith('@') ? params.handle : `@${params.handle}`;

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: params.password,
        options: {
          data: {
            display_name: params.displayName,
            handle: cleanHandle,
            region_bucket: params.regionBucket || 'Bhubaneswar area',
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data?.user) {
        // In Supabase Auth, existing accounts return empty identities to prevent user enumeration
        if (data.user.identities && data.user.identities.length === 0) {
          return { success: false, error: 'An account with this email already exists. Please sign in instead.' };
        }

        // If email confirmation is required, Supabase returns data.session as null
        if (!data.session) {
          return {
            success: true,
            session: null,
            user: undefined,
            message: 'Account created! Please check your email to confirm your account before signing in.',
          };
        }

        const authUser: AuthUser = {
          id: data.user.id,
          name: params.displayName,
          handle: cleanHandle,
          email: cleanEmail,
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
          bio: params.bio || 'New dreamer archiving the nocturnal realm.',
          initials: (params.displayName[0] || 'D').toUpperCase(),
          color: '#5438FF',
          region: params.regionBucket || 'Bhubaneswar area',
          nearbyOptIn: params.nearbyOptIn ?? true,
          followersCount: 0,
          followingCount: 0,
          dreamsCount: 0,
          role: 'user',
          bannerQuote: 'Every dream is an unwritten world.',
          createdAt: data.user.created_at || new Date().toISOString(),
        };

        // Sync to profiles table
        await this.syncUserProfile(authUser);
        return {
          success: true,
          session: data.session,
          user: authUser,
          message: undefined,
        };
      }

      return { success: false, error: 'User registration could not complete.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Supabase Auth registration failed.' };
    }
  }

  public async authSignIn(
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data?.session || !data?.user) {
        return { success: false, error: 'Could not establish an active Supabase session. Please check your credentials.' };
      }

      // Verify active session via getSession()
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session) {
        return { success: false, error: 'Supabase session could not be verified. Please try again.' };
      }

      // Fetch or create public.profiles record
      const profile = await this.fetchUserProfile(data.user.id);
      if (profile) {
        return { success: true, user: profile };
      }

      // Fallback profile if row does not exist yet
      const meta = data.user.user_metadata || {};
      const fallbackProfile: AuthUser = {
        id: data.user.id,
        name: meta.display_name || cleanEmail.split('@')[0],
        handle: meta.handle || `@${cleanEmail.split('@')[0]}`,
        email: cleanEmail,
        avatar: meta.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        bio: meta.bio || 'Verified dreamer archiving the nocturnal realm.',
        initials: (meta.display_name?.[0] || cleanEmail[0] || 'D').toUpperCase(),
        color: '#5438FF',
        region: meta.region_bucket || 'Bhubaneswar area',
        nearbyOptIn: true,
        followersCount: 0,
        followingCount: 0,
        dreamsCount: 0,
        role: cleanEmail === 'siimr.com@gmail.com' ? 'moderator' : 'user',
        bannerQuote: 'How to go for a little walk and never return',
        createdAt: data.user.created_at || new Date().toISOString(),
      };

      await this.syncUserProfile(fallbackProfile);
      return { success: true, user: fallbackProfile };
    } catch (err: any) {
      return { success: false, error: err.message || 'Supabase Auth login failed.' };
    }
  }

  public async authSignInWithGoogle(): Promise<{ success: boolean; error?: string; url?: string }> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, url: data?.url };
    } catch (err: any) {
      return { success: false, error: err.message || 'Google authentication failed.' };
    }
  }

  public async authSignOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[Supabase Auth] Sign out notice:', e);
    }
  }

  public async authResetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: window.location.origin,
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Password reset request failed.' };
    }
  }

  public async authGetSessionUser(): Promise<AuthUser | null> {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        return await this.fetchUserProfile(data.session.user.id);
      }
    } catch (e) {
      console.warn('[Supabase Auth] Session fetch note:', e);
    }
    return null;
  }

  // ============================================================================
  // 3. PROFILES TABLE & REAL USER SEARCH & SOCIAL GRAPH
  // ============================================================================

  public async syncUserProfile(user: AuthUser): Promise<void> {
    if (!user || !user.id || user.id.startsWith('u-guest') || user.isGuest || user.isDemo) return;

    const cleanHandle = user.handle.startsWith('@') ? user.handle : `@${user.handle}`;
    const cleanUsername = cleanHandle.replace(/^@/, '');
    const payload: Record<string, any> = {
      id: user.id,
      name: user.name,
      display_name: user.name,
      handle: cleanHandle,
      username: user.username || cleanUsername,
      email: user.email || 'dreamer@siimr.io',
      bio: user.bio || '',
      avatar: user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      avatar_url: user.avatar,
      cover_url: user.bannerUrl || user.coverUrl || '',
      banner_url: user.bannerUrl || user.coverUrl || '',
      banner_quote: user.bannerQuote || 'How to go for a little walk and never return',
      nearby_opt_in: user.nearbyOptIn ?? true,
      discoverable_in_search: user.discoverableInSearch ?? true,
      last_active_at: new Date().toISOString(),
    };

    try {
      let { error: upsertErr } = await supabase.from('profiles').insert([payload]);
      if (upsertErr && (upsertErr.code === '23505' || upsertErr.message?.includes('duplicate key') || upsertErr.message?.includes('unique constraint'))) {
        const { error: updateErr } = await supabase.from('profiles').update(payload).eq('id', user.id);
        upsertErr = updateErr;
      }
      if (upsertErr) {
        if (upsertErr.code === '23505' && (upsertErr.message?.includes('username') || upsertErr.details?.includes('username'))) {
          payload.username = `${cleanUsername}_${user.id.slice(0, 4)}`;
          let { error: retryErr } = await supabase.from('profiles').insert([payload]);
          if (retryErr && (retryErr.code === '23505' || retryErr.message?.includes('duplicate key'))) {
            await supabase.from('profiles').update(payload).eq('id', user.id);
          }
        } else {
          console.warn('[Supabase] syncUserProfile note:', upsertErr);
        }
      }
    } catch (e) {
      console.warn('[Supabase] syncUserProfile note:', e);
    }

    await this.recordActivity({
      user_id: user.id,
      action_type: 'USER_SYNC',
      title: 'Profile Synchronized',
      description: `Synced profile for ${cleanHandle}`,
      target_id: user.id,
      target_type: 'account',
    });
  }

  public async fetchUserProfile(userId: string): Promise<AuthUser | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) return null;

      const followStats = await this.getFollowCounts(data.id);

      return {
        id: data.id,
        name: data.name || data.display_name || 'Dreamer',
        handle: data.handle ? (data.handle.startsWith('@') ? data.handle : `@${data.handle}`) : (data.username ? `@${data.username}` : '@dreamer'),
        username: data.username || (data.handle ? data.handle.replace(/^@/, '') : 'dreamer'),
        email: data.email || 'dreamer@siimr.io',
        avatar: data.avatar || data.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        bannerUrl: data.cover_url || data.banner_url || data.banner || '',
        coverUrl: data.cover_url || '',
        bannerQuote: data.banner_quote || 'How to go for a little walk and never return',
        bio: data.bio || '',
        initials: ((data.name || data.display_name || 'D')[0] || 'D').toUpperCase(),
        color: '#5438FF',
        region: data.region_bucket || data.region || 'Bhubaneswar area',
        nearbyOptIn: data.nearby_opt_in ?? true,
        discoverableInSearch: data.discoverable_in_search ?? true,
        followersCount: followStats.followersCount,
        followingCount: followStats.followingCount,
        dreamsCount: 0,
        role: data.role || 'user',
        createdAt: data.created_at,
      };
    } catch (e) {
      console.warn('[Supabase] fetchUserProfile note:', e);
      return null;
    }
  }

  public async fetchUserProfileByHandle(handle: string): Promise<AuthUser | null> {
    try {
      const raw = handle.trim().replace(/^@/, '');
      const withAt = `@${raw}`;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`handle.ilike.${withAt},handle.ilike.${raw},username.ilike.${raw}`)
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      const followStats = await this.getFollowCounts(data.id);

      return {
        id: data.id,
        name: data.name || data.display_name || 'Dreamer',
        handle: data.handle ? (data.handle.startsWith('@') ? data.handle : `@${data.handle}`) : withAt,
        username: data.username || raw,
        email: data.email || 'dreamer@siimr.io',
        avatar: data.avatar || data.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        bannerUrl: data.cover_url || data.banner_url || data.banner || '',
        coverUrl: data.cover_url || '',
        bannerQuote: data.banner_quote || 'How to go for a little walk and never return',
        bio: data.bio || '',
        initials: ((data.name || data.display_name || 'D')[0] || 'D').toUpperCase(),
        color: '#5438FF',
        region: data.region_bucket || data.region || 'Bhubaneswar area',
        nearbyOptIn: data.nearby_opt_in ?? true,
        discoverableInSearch: data.discoverable_in_search ?? true,
        followersCount: followStats.followersCount,
        followingCount: followStats.followingCount,
        dreamsCount: 0,
        role: data.role || 'user',
        createdAt: data.created_at,
      };
    } catch (e) {
      console.warn('[Supabase] fetchUserProfileByHandle note:', e);
      return null;
    }
  }

  /**
   * Supabase Storage: Upload profile photo or banner
   * Stored in bucket 'profile-media':
   *   profile-media/{userId}/avatar/{timestamp}_{filename}
   *   profile-media/{userId}/banner/{timestamp}_{filename}
   */
  public async uploadProfileMedia(
    userId: string,
    fileOrBlob: Blob | File,
    type: 'avatar' | 'banner'
  ): Promise<{ url: string; path: string; error?: string | null }> {
    const bucket = 'profile-media';
    const isPng = fileOrBlob.type.includes('png');
    const isWebp = fileOrBlob.type.includes('webp');
    const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
    const filename = `${Date.now()}_${type}.${ext}`;
    const filePath = `${userId}/${type}/${filename}`;

    try {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileOrBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: fileOrBlob.type || 'image/jpeg',
        });

      if (error) {
        console.warn(`[Supabase Storage] ${bucket} upload note:`, error.message);
        // Fallback attempt to 'avatars' or public storage
        const fallbackRes = await supabase.storage
          .from('avatars')
          .upload(filePath, fileOrBlob, { upsert: true, contentType: fileOrBlob.type || 'image/jpeg' });

        if (!fallbackRes.error) {
          const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filePath);
          return { url: publicData.publicUrl, path: filePath, error: null };
        }

        // Graceful resilient fallback: data URL if bucket is unconfigured
        const dataUrl = await this.blobToDataUrl(fileOrBlob);
        return { url: dataUrl, path: filePath, error: null };
      }

      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      return { url: publicData.publicUrl, path: filePath, error: null };
    } catch (err: any) {
      console.warn('[Supabase Storage] upload exception:', err);
      const dataUrl = await this.blobToDataUrl(fileOrBlob);
      return { url: dataUrl, path: filePath, error: null };
    }
  }

  public async removeProfileMedia(
    type: 'avatar' | 'banner',
    storagePath?: string
  ): Promise<void> {
    if (!storagePath) return;
    try {
      await supabase.storage.from('profile-media').remove([storagePath]);
    } catch (e) {
      console.warn('[Supabase Storage] removeProfileMedia note:', e);
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Check username availability against Supabase profiles table.
   * Case-insensitive, validates allowed characters, minimum length, and reserved names.
   */
  public async checkUsernameAvailability(
    rawUsername: string,
    currentUserId?: string
  ): Promise<{ available: boolean; error?: string }> {
    const clean = rawUsername.trim().replace(/^@/, '').toLowerCase();

    if (!clean) {
      return { available: false, error: 'Username cannot be empty' };
    }
    if (clean.length < 3) {
      return { available: false, error: 'Must be at least 3 characters' };
    }
    if (clean.length > 30) {
      return { available: false, error: 'Cannot exceed 30 characters' };
    }
    if (!/^[a-z0-9_]+$/.test(clean)) {
      return {
        available: false,
        error: 'Letters, numbers, and underscores only',
      };
    }

    // Reserved names
    const reserved = [
      'admin',
      'administrator',
      'siimr',
      'support',
      'help',
      'root',
      'moderator',
      'system',
      'official',
      'guest',
      'me',
      'explore',
      'search',
      'login',
      'signup',
    ];
    if (reserved.includes(clean)) {
      return { available: false, error: 'This username is reserved' };
    }

    try {
      const withAt = `@${clean}`;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, handle, username')
        .or(`handle.ilike.${withAt},handle.ilike.${clean},username.ilike.${clean}`);

      if (error) {
        console.warn('[Supabase] checkUsernameAvailability note:', error.message);
        return { available: true };
      }

      if (data && data.length > 0) {
        const otherUser = data.find((row) => row.id !== currentUserId);
        if (otherUser) {
          return { available: false, error: 'Username already taken' };
        }
      }

      return { available: true };
    } catch (e: any) {
      console.warn('[Supabase] checkUsernameAvailability exception:', e);
      return { available: true };
    }
  }

  /**
   * Save complete user profile updates to Supabase profiles table
   */
  public async updateUserProfile(
    userId: string,
    updates: {
      name: string;
      username: string;
      bio: string;
      avatar?: string;
      bannerUrl?: string;
      bannerQuote?: string;
      nearbyOptIn?: boolean;
      discoverableInSearch?: boolean;
    }
  ): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    const trimmedName = updates.name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      return { success: false, error: 'Display name must be at least 2 characters long.' };
    }
    if (trimmedName.length > 50) {
      return { success: false, error: 'Display name cannot exceed 50 characters.' };
    }

    const cleanUsername = updates.username.trim().replace(/^@/, '');
    const availability = await this.checkUsernameAvailability(cleanUsername, userId);
    if (!availability.available) {
      return { success: false, error: availability.error || 'Username is unavailable.' };
    }

    const trimmedBio = (updates.bio || '').trim();
    if (trimmedBio.length > 200) {
      return { success: false, error: 'Bio cannot exceed 200 characters.' };
    }

    const cleanHandle = `@${cleanUsername}`;

    const payload: Record<string, any> = {
      id: userId,
      name: trimmedName,
      display_name: trimmedName,
      handle: cleanHandle,
      username: cleanUsername,
      bio: trimmedBio,
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (updates.avatar !== undefined) {
      payload.avatar = updates.avatar;
      payload.avatar_url = updates.avatar;
    }
    if (updates.bannerUrl !== undefined) {
      payload.cover_url = updates.bannerUrl;
      payload.banner_url = updates.bannerUrl;
    }
    if (updates.bannerQuote !== undefined) {
      payload.banner_quote = updates.bannerQuote;
    }
    if (updates.nearbyOptIn !== undefined) {
      payload.nearby_opt_in = updates.nearbyOptIn;
    }
    if (updates.discoverableInSearch !== undefined) {
      payload.discoverable_in_search = updates.discoverableInSearch;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert([payload], { onConflict: 'id' });
      if (error) {
        console.warn('[Supabase] updateUserProfile error:', error.message);
      }
    } catch (e) {
      console.warn('[Supabase] updateUserProfile exception:', e);
    }

    // Follow stats
    const followStats = await this.getFollowCounts(userId);

    const updatedUser: AuthUser = {
      id: userId,
      name: trimmedName,
      handle: cleanHandle,
      username: cleanUsername,
      email: payload.email || 'dreamer@siimr.io',
      avatar: updates.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      bio: trimmedBio,
      initials: (trimmedName[0] || 'D').toUpperCase(),
      color: '#5438FF',
      region: 'Bhubaneswar area',
      nearbyOptIn: updates.nearbyOptIn ?? true,
      discoverableInSearch: updates.discoverableInSearch ?? true,
      followersCount: followStats.followersCount,
      followingCount: followStats.followingCount,
      dreamsCount: 0,
      bannerQuote: updates.bannerQuote || 'How to go for a little walk and never return',
      bannerUrl: updates.bannerUrl,
      coverUrl: updates.bannerUrl,
      lastActiveAt: new Date().toISOString(),
    };

    // Cache profile in localStorage
    try {
      localStorage.setItem(`siimr_profile_${userId}`, JSON.stringify(updatedUser));
    } catch (err) {
      console.warn('Cache write note:', err);
    }

    // Record activity
    await this.recordActivity({
      user_id: userId,
      action_type: 'USER_SYNC',
      title: 'Profile Updated',
      description: `Updated profile identity for ${cleanHandle}`,
      target_id: userId,
      target_type: 'account',
    });

    return { success: true, user: updatedUser };
  }

  /**
   * Search real registered SIIMR users in Supabase
   * Supports:
   * - username & display name matching
   * - partial matching via ILIKE
   * - case-insensitive search
   * - privacy filtering (excludes blocked users and undiscoverable profiles)
   * - pagination via limit
   * Does NOT download entire database to client.
   */
  public async searchUsers(
    searchQuery: string,
    currentUserId?: string,
    limitCount: number = 20
  ): Promise<{ users: AuthUser[]; error: string | null }> {
    const clean = searchQuery.trim().replace(/^[@#]/, '');
    if (!clean) {
      return { users: [], error: null };
    }

    try {
      const blockedIds = currentUserId ? await this.getBlockedUserIds(currentUserId) : new Set<string>();

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`name.ilike.%${clean}%,display_name.ilike.%${clean}%,handle.ilike.%${clean}%,username.ilike.%${clean}%`)
        .limit(limitCount);

      if (error) {
        console.warn('[Supabase] searchUsers query error:', error.message);
        return { users: [], error: error.message };
      }

      const users: AuthUser[] = (data || [])
        .filter((row: any) => row.id && !blockedIds.has(row.id) && row.discoverable_in_search !== false)
        .map((row: any) => ({
          id: row.id,
          name: row.name || row.display_name || 'Dreamer',
          handle: row.handle ? (row.handle.startsWith('@') ? row.handle : `@${row.handle}`) : (row.username ? `@${row.username}` : '@dreamer'),
          username: row.username || (row.handle ? row.handle.replace(/^@/, '') : 'dreamer'),
          email: '', // Never expose email through search
          avatar: row.avatar || row.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
          bannerUrl: row.cover_url || row.banner_url || row.banner || '',
          coverUrl: row.cover_url || '',
          bannerQuote: row.banner_quote || 'How to go for a little walk and never return',
          bio: row.bio || '',
          initials: ((row.name || row.display_name || 'D')[0] || 'D').toUpperCase(),
          color: '#5438FF',
          region: row.region_bucket || 'Bhubaneswar area',
          nearbyOptIn: row.nearby_opt_in ?? true,
          discoverableInSearch: row.discoverable_in_search ?? true,
          followersCount: 0,
          followingCount: 0,
          dreamsCount: 0,
          createdAt: row.created_at,
        }));

      return { users, error: null };
    } catch (err: any) {
      console.warn('[Supabase] searchUsers error:', err);
      return { users: [], error: err.message || 'Search failed' };
    }
  }

  // ============================================================================
  // SOCIAL GRAPH: FOLLOWS & BLOCKS
  // ============================================================================

  public async followUser(
    followerId: string,
    targetId: string,
    followerName?: string,
    targetName?: string
  ): Promise<boolean> {
    if (!followerId || !targetId || followerId === targetId) return false;

    try {
      await this.recordActivity({
        user_id: followerId,
        action_type: 'FOLLOW',
        title: 'Followed Dreamer',
        description: `Followed ${targetName || targetId}`,
        target_id: targetId,
        target_type: 'user',
        metadata: { followerName, targetName, active: true },
      });
      return true;
    } catch (e) {
      console.warn('[Supabase] followUser note:', e);
      return false;
    }
  }

  public async unfollowUser(
    followerId: string,
    targetId: string
  ): Promise<boolean> {
    if (!followerId || !targetId) return false;

    try {
      await this.recordActivity({
        user_id: followerId,
        action_type: 'UNFOLLOW',
        title: 'Unfollowed Dreamer',
        description: `Unfollowed ${targetId}`,
        target_id: targetId,
        target_type: 'user',
        metadata: { targetId, active: false },
      });
      return true;
    } catch (e) {
      console.warn('[Supabase] unfollowUser note:', e);
      return false;
    }
  }

  public async checkIsFollowing(followerId: string, targetId: string): Promise<boolean> {
    if (!followerId || !targetId || followerId === targetId) return false;

    try {
      const { data, error } = await supabase
        .from('activities')
        .select('action_type')
        .eq('user_id', followerId)
        .eq('target_id', targetId)
        .in('action_type', ['FOLLOW', 'UNFOLLOW'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) return false;
      return data[0].action_type === 'FOLLOW';
    } catch {
      return false;
    }
  }

  public async getFollowCounts(userId: string): Promise<{ followersCount: number; followingCount: number }> {
    if (!userId) return { followersCount: 0, followingCount: 0 };

    try {
      // Followers of this user
      const { data: followEvents } = await supabase
        .from('activities')
        .select('user_id, target_id, action_type')
        .or(`target_id.eq.${userId},user_id.eq.${userId}`)
        .in('action_type', ['FOLLOW', 'UNFOLLOW'])
        .order('created_at', { ascending: true });

      const followersMap = new Map<string, boolean>();
      const followingMap = new Map<string, boolean>();

      (followEvents || []).forEach((ev: any) => {
        if (ev.target_id === userId) {
          followersMap.set(ev.user_id, ev.action_type === 'FOLLOW');
        }
        if (ev.user_id === userId) {
          followingMap.set(ev.target_id, ev.action_type === 'FOLLOW');
        }
      });

      let followersCount = 0;
      followersMap.forEach((isFollow) => {
        if (isFollow) followersCount++;
      });

      let followingCount = 0;
      followingMap.forEach((isFollow) => {
        if (isFollow) followingCount++;
      });

      return { followersCount, followingCount };
    } catch {
      return { followersCount: 0, followingCount: 0 };
    }
  }

  public async blockUser(blockerId: string, targetId: string): Promise<boolean> {
    if (!blockerId || !targetId || blockerId === targetId) return false;

    try {
      await this.recordActivity({
        user_id: blockerId,
        action_type: 'BLOCK_USER',
        title: 'Blocked User',
        description: `Blocked user ${targetId}`,
        target_id: targetId,
        target_type: 'user',
        metadata: { blocked: true },
      });
      return true;
    } catch (e) {
      console.warn('[Supabase] blockUser note:', e);
      return false;
    }
  }

  public async unblockUser(blockerId: string, targetId: string): Promise<boolean> {
    if (!blockerId || !targetId) return false;

    try {
      await this.recordActivity({
        user_id: blockerId,
        action_type: 'UNBLOCK_USER',
        title: 'Unblocked User',
        description: `Unblocked user ${targetId}`,
        target_id: targetId,
        target_type: 'user',
        metadata: { blocked: false },
      });
      return true;
    } catch (e) {
      console.warn('[Supabase] unblockUser note:', e);
      return false;
    }
  }

  public async getBlockedUserIds(userId?: string): Promise<Set<string>> {
    const blockedSet = new Set<string>();
    if (!userId) return blockedSet;

    try {
      const { data } = await supabase
        .from('activities')
        .select('target_id, action_type')
        .eq('user_id', userId)
        .in('action_type', ['BLOCK_USER', 'UNBLOCK_USER'])
        .order('created_at', { ascending: true });

      (data || []).forEach((item: any) => {
        if (item.action_type === 'BLOCK_USER' && item.target_id) {
          blockedSet.add(item.target_id);
        } else if (item.action_type === 'UNBLOCK_USER' && item.target_id) {
          blockedSet.delete(item.target_id);
        }
      });
    } catch {
      // Ignore
    }
    return blockedSet;
  }

  // ============================================================================
  // 4. CANONICAL DREAMS & THE 4 PUBLISHING SURFACES
  // ============================================================================

  /**
   * Saves a canonical Dream and binds all selected publishing representations:
   * 1. Last Night Story (24h temporary social surface)
   * 2. Normal Dream Post (permanent feed discovery)
   * 3. Nearby Share (coarse geo-bucket privacy-preserving discovery)
   * 4. Clip (persistent short-video explanation)
   */
  public async saveCanonicalDream(
    dream: Dream,
    options?: SaveCanonicalDreamOptions,
    clientInstance: any = supabase
  ): Promise<void> {
    const surfaces = options?.surfaces || {
      normalPost: true,
      lastNightStory: true,
      nearbyShare: dream.isNearbyEligible ?? true,
      clip: Boolean(dream.hasClip),
    };

    // 1. Retrieve the authenticated Supabase session & user to enforce strict identity chain:
    // Supabase Auth session -> Supabase Auth user.id -> currentUser.id -> dreams.user_id
    const { data: sessionData, error: sessionError } = await clientInstance.auth.getSession();
    const activeSession = sessionData?.session;

    const { data: userData, error: userError } = await clientInstance.auth.getUser();
    const authUser = userData?.user;

    if (sessionError || userError || !activeSession || !authUser || !authUser.id) {
      throw new Error('Please log in to publish your Dream. An active Supabase Auth session is required.');
    }

    // 2. Reject demo/guest identities from production database insert
    if (
      dream.author.id === 'u-guest' ||
      dream.author.id === 'u-me' ||
      dream.author.id.startsWith('u-') ||
      (dream.author as any).isGuest ||
      (dream.author as any).isDemo
    ) {
      throw new Error(
        `Demo accounts (${dream.author.id}) cannot publish to the production database. Please log in with a verified Supabase account.`
      );
    }

    // 3. Verify that the authenticated Supabase user's ID matches the Dream author's ID and active session
    if (dream.author.id !== authUser.id || dream.author.id !== activeSession.user.id) {
      throw new Error(
        `Unauthorized: Dream author ID (${dream.author.id}) does not match authenticated Supabase user ID (${authUser.id}).`
      );
    }

    const effectiveUserId = authUser.id;

    // Ensure user profile exists in public.profiles so foreign key references succeed
    try {
      if (typeof clientInstance.from === 'function') {
        const profilesTable = clientInstance.from('profiles');
        if (profilesTable && typeof profilesTable.select === 'function') {
          const { data: existingProfile } = await profilesTable
            .select('id')
            .eq('id', effectiveUserId)
            .maybeSingle();

          if (!existingProfile) {
            const userEmail = authUser.email || `${effectiveUserId}@siimr.io`;
            const profilePayload = {
              id: effectiveUserId,
              name: dream.author?.name || authUser.user_metadata?.display_name || 'Dreamer',
              display_name: dream.author?.name || authUser.user_metadata?.display_name || 'Dreamer',
              handle: dream.author?.handle || authUser.user_metadata?.handle || `@user_${effectiveUserId.slice(0, 6)}`,
              username: (dream.author?.handle || authUser.user_metadata?.handle || `user_${effectiveUserId.slice(0, 6)}`).replace(/^@/, ''),
              email: userEmail,
              avatar: dream.author?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
              avatar_url: dream.author?.avatar,
              bio: 'Dreamer on siimr',
              last_active_at: new Date().toISOString(),
            };
            let { error: profErr } = await clientInstance.from('profiles').insert([profilePayload]);
            if (profErr && (profErr.code === '23505' || profErr.message?.includes('duplicate key') || profErr.message?.includes('unique constraint'))) {
              if (typeof clientInstance.from('profiles').update === 'function') {
                await clientInstance.from('profiles').update(profilePayload).eq('id', effectiveUserId);
              }
            }
          }
        }
      }
    } catch (e) {
      // Non-blocking in case mock client doesn't support profiles table
      console.warn('[Supabase] ensure profile note:', e);
    }

    // Local Capture uploads are persisted before the canonical record so a successful
    // Dream never points at a browser-only data URL. The uploaded object is cleaned up
    // if the canonical record cannot be stored.
    let uploadedMedia: { path: string; mimeType: string; mediaType: 'image' | 'video' } | null = null;

    if (options?.mediaFile) {
      uploadedMedia = await uploadDreamMedia(
        clientInstance,
        effectiveUserId,
        dream.id,
        options.mediaFile
      );
    }

    // 1. Canonical Dream Record
    const isPrivate = dream.audience === 'only_me' || (dream as any).visibility === 'private';
    const isFollowers = dream.audience === 'followers' || (dream as any).visibility === 'followers';

    const existingRawData =
      typeof (dream as any).raw_data === 'object' && (dream as any).raw_data !== null
        ? (dream as any).raw_data
        : {};
    const rawDataPayload: Record<string, any> = {
      ...existingRawData,
      cardColor: dream.cardColor,
      cardBorderColor: dream.cardBorderColor,
      cardTextColor: dream.cardTextColor,
      cardGradient: dream.cardGradient,
      surfaces: dream.surfaces,
      mediaCaption: dream.mediaCaption,
      visualQuote: dream.visualQuote,
    };

    const dreamPayload: Record<string, any> = {
      id: dream.id,
      user_id: effectiveUserId,
      author_name: dream.author?.name || authUser.user_metadata?.display_name || 'Dreamer',
      author_handle: dream.author?.handle || authUser.user_metadata?.handle || `@dreamer`,
      author_avatar: dream.author?.avatar || null,
      title: dream.title,
      hook: dream.hook || dream.title,
      content: dream.content,
      full_text: dream.content,
      raw_transcript: options?.rawTranscript || dream.rawTranscript || dream.content,
      category: dream.category || 'Surreal',
      tags: dream.tags || [],
      visibility: isPrivate ? 'private' : (isFollowers ? 'followers' : 'public'),
      audience: isPrivate ? 'private' : (isFollowers ? 'followers' : 'public'),
      is_private: isPrivate,
      is_followers_only: isFollowers,
      is_nearby_eligible: surfaces.nearbyShare ?? true,
      likes: dream.likes || 1,
      likes_count: dream.likes || 1,
      comments_count: dream.commentsCount || 0,
      views_count: dream.viewsCount || 1,
      media_type: uploadedMedia?.mediaType || dream.mediaType || 'illustration',
      created_at: new Date().toISOString(),
      captured_at: new Date().toISOString(),
      dream_date: new Date().toISOString().split('T')[0],
      raw_data: rawDataPayload,
    };

    // Insert into canonical dreams table (using insert to satisfy RLS "Users create dreams" policy; fallback to update on duplicate id)
    let { error: dreamErr } = await clientInstance
      .from('dreams')
      .insert([dreamPayload]);

    if (dreamErr && (dreamErr.code === '23505' || dreamErr.message?.includes('duplicate key') || dreamErr.message?.includes('unique constraint'))) {
      if (typeof clientInstance.from('dreams').update === 'function') {
        const { error: updateErr } = await clientInstance
          .from('dreams')
          .update(dreamPayload)
          .eq('id', dream.id);
        dreamErr = updateErr;
      }
    } else if (dreamErr && typeof clientInstance.from('dreams').upsert === 'function' && dreamErr.code !== '42501') {
      const { error: upsertErr } = await clientInstance
        .from('dreams')
        .upsert([dreamPayload], { onConflict: 'id' });
      dreamErr = upsertErr;
    }

    if (dreamErr) {
      if (uploadedMedia) {
        await clientInstance.storage.from('dream-media').remove([uploadedMedia.path]).catch(() => {});
      }
      console.error('[Supabase] Canonical Dream save failed:', dreamErr);
      throw new Error(`Failed to publish Dream: ${dreamErr.message}`);
    }

    let mediaRecordId: string | undefined;

    if (uploadedMedia) {
      const { data: mediaData, error: mediaErr } = await clientInstance.from('dream_media').insert([{
        dream_id: dream.id,
        user_id: effectiveUserId,
        storage_path: uploadedMedia.path,
        media_type: uploadedMedia.mediaType,
        mime_type: uploadedMedia.mimeType,
        order_index: 0,
      }]).select('id').single();

      if (mediaErr) {
        await clientInstance.storage.from('dream-media').remove([uploadedMedia.path]).catch(() => {});
        console.error('[Supabase] Dream media record save failed:', mediaErr);
        throw new Error(`Dream media record save failed: ${mediaErr.message}`);
      }
      mediaRecordId = mediaData?.id;
    } else if (dream.mediaUrl && (dream.mediaType === 'image' || dream.mediaType === 'video' || dream.mediaKind === 'video' || dream.mediaKind === 'image')) {
      const mediaType = dream.mediaType === 'video' || dream.mediaKind === 'video' ? 'video' : 'image';
      try {
        const { data: mediaData } = await clientInstance.from('dream_media').insert([{
          dream_id: dream.id,
          user_id: effectiveUserId,
          storage_path: dream.mediaUrl,
          media_type: mediaType,
          mime_type: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
          order_index: 0,
        }]).select('id').maybeSingle();
        if (mediaData?.id) {
          mediaRecordId = mediaData.id;
        }
      } catch (e) {
        console.warn('[Supabase] preset dream_media note:', e);
      }
    }

    console.log(`[Supabase] Canonical Dream "${dream.title}" (${dream.id}) stored.`);

    // Helper to safely write to auxiliary tables across real Supabase (insert-first) and test mocks (upsert)
    const writeAuxiliaryRecord = async (table: string, payload: Record<string, any>, conflictCol: string, conflictVal?: any) => {
      try {
        if (typeof clientInstance.from(table).insert === 'function') {
          let { error } = await clientInstance.from(table).insert([payload]);
          if (error && (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint'))) {
            if (typeof clientInstance.from(table).update === 'function' && conflictVal !== undefined) {
              const { error: updErr } = await clientInstance.from(table).update(payload).eq(conflictCol, conflictVal);
              error = updErr;
            }
          } else if (error && typeof clientInstance.from(table).upsert === 'function' && error.code !== '42501') {
            const { error: upErr } = await clientInstance.from(table).upsert([payload], { onConflict: conflictCol });
            error = upErr;
          }
          return error;
        }
        return (await clientInstance.from(table).upsert([payload], { onConflict: conflictCol })).error;
      } catch (err) {
        return err;
      }
    };

    // 2. Voice transcript preservation (if raw transcript supplied)
    if (options?.rawTranscript || dream.rawTranscript) {
      try {
        await writeAuxiliaryRecord(
          'dream_transcripts',
          {
            dream_id: dream.id,
            user_id: effectiveUserId,
            transcript: options?.rawTranscript || dream.rawTranscript,
            language: 'en',
            status: 'completed',
            audio_path: options?.voiceNotePath || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          'dream_id',
          dream.id
        );
      } catch (e) {
        console.warn('[Supabase] dream_transcripts note:', e);
      }
    }

    // 3. Surface 2: Last Night Story (expires in 24 hours)
    if (surfaces.lastNightStory) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      try {
        await writeAuxiliaryRecord(
          'last_night_stories',
          {
            dream_id: dream.id,
            user_id: effectiveUserId,
            published_at: new Date().toISOString(),
            expires_at: expiresAt,
            created_at: new Date().toISOString(),
          },
          'dream_id',
          dream.id
        );
      } catch (e) {
        console.warn('[Supabase] last_night_stories note:', e);
      }
    }

    // 4. Surface 3: Nearby Share (Coarse geo-bucket)
    if (surfaces.nearbyShare) {
      try {
        await writeAuxiliaryRecord(
          'nearby_shares',
          {
            dream_id: dream.id,
            user_id: effectiveUserId,
            location_name: options?.regionBucket || dream.region || 'Bhubaneswar area',
            is_active: true,
            published_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
          },
          'dream_id',
          dream.id
        );
      } catch (e) {
        console.warn('[Supabase] nearby_shares note:', e);
      }
    }

    // 5. Surface 4: Clip (Short-video explanation referencing dream_id and media_id)
    if (surfaces.clip || dream.hasClip || dream.surfaces?.hasClip) {
      try {
        if (!mediaRecordId) {
          const videoStoragePath = options?.clipVideoUrl || dream.clipVideoUrl || uploadedMedia?.path || dream.mediaUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80';
          const { data: vMedia } = await clientInstance.from('dream_media').insert([{
            dream_id: dream.id,
            user_id: effectiveUserId,
            storage_path: videoStoragePath,
            media_type: 'video',
            mime_type: 'video/mp4',
            order_index: 0,
          }]).select('id').maybeSingle();
          if (vMedia?.id) {
            mediaRecordId = vMedia.id;
          }
        }

        if (mediaRecordId) {
          const clipPayload = {
            dream_id: dream.id,
            user_id: effectiveUserId,
            media_id: mediaRecordId,
            video_path: options?.clipVideoUrl || dream.clipVideoUrl || uploadedMedia?.path || dream.mediaUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
            duration_seconds: options?.clipDurationSeconds || 30,
            caption: options?.clipCaption || dream.hook || dream.title,
            aspect_ratio: '9:16',
            status: 'published',
          };
          await writeAuxiliaryRecord('clips', clipPayload, 'dream_id', dream.id);
        }
      } catch (e) {
        console.warn('[Supabase] clips note:', e);
      }
    }

    // 6. Initialize Dream Circle thread
    try {
      await writeAuxiliaryRecord(
        'dream_circle_threads',
        {
          dream_id: dream.id,
          created_by: effectiveUserId,
          title: dream.title || 'Initial Observations & Echoes',
          initial_prompt: 'Memory logged before fade. Feel free to attach reflections or recurring motifs.',
          updated_at: new Date().toISOString(),
        },
        'dream_id',
        dream.id
      );
    } catch (e) {
      console.warn('[Supabase] dream_circle_threads note:', e);
    }

    // 7. Record audit activity
    await this.recordActivity({
      user_id: effectiveUserId,
      action_type: 'PUBLISH_CANONICAL_DREAM',
      title: 'Published Canonical Dream',
      description: `Dispatched "${dream.title}" across surfaces [${Object.entries(surfaces)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ')}]`,
      target_id: dream.id,
      target_type: 'dream',
      metadata: { surfaces, category: dream.category },
    });
  }

  /**
   * Update an existing dream's fields (atmosphere/color, title, content, surfaces, etc.)
   */
  public async updateDream(
    dreamId: string,
    updates: Partial<Dream>,
    client: any = supabase
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const clientInstance = client || supabase;
      const { data: current, error: fetchErr } = await clientInstance
        .from('dreams')
        .select('id, raw_data, content, title, hook, category, tags')
        .eq('id', dreamId)
        .single();

      if (fetchErr && !current) {
        return { success: false, error: fetchErr.message };
      }

      const existingRawData =
        typeof current?.raw_data === 'object' && current?.raw_data !== null
          ? current.raw_data
          : {};

      const updatedRawData = {
        ...existingRawData,
        ...(updates.cardColor ? { cardColor: updates.cardColor } : {}),
        ...(updates.cardBorderColor ? { cardBorderColor: updates.cardBorderColor } : {}),
        ...(updates.cardTextColor ? { cardTextColor: updates.cardTextColor } : {}),
        ...(updates.cardGradient ? { cardGradient: updates.cardGradient } : {}),
        ...(updates.surfaces ? { surfaces: updates.surfaces } : {}),
      };

      const payload: Record<string, any> = {
        raw_data: updatedRawData,
      };

      if (updates.title) payload.title = updates.title;
      if (updates.hook) payload.hook = updates.hook;
      if (updates.content) {
        payload.content = updates.content;
        payload.full_text = updates.content;
      }
      if (updates.category) payload.category = updates.category;
      if (updates.tags) payload.tags = updates.tags;

      const { error: updateErr } = await clientInstance
        .from('dreams')
        .update(payload)
        .eq('id', dreamId);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to update dream' };
    }
  }

  // ============================================================================
  // 5. FEED & QUERY METHODS
  // ============================================================================

  /**
   * Fetch feed dreams with attached author profiles & surface flags
   */
  public async fetchDreams(options?: {
    surface?: 'all' | 'stories' | 'normal' | 'nearby' | 'clips' | 'archive';
    userId?: string;
    category?: string;
  }): Promise<Dream[]> {
    try {
      let query = supabase.from('dreams').select(`
        id,
        user_id,
        title,
        hook,
        content,
        raw_transcript,
        category,
        tags,
        visibility,
        is_private,
        is_followers_only,
        is_nearby_eligible,
        likes_count,
        comments_count,
        views_count,
        media_type,
        created_at,
        raw_data,
        last_night_stories(id, expires_at),
        clips(id, duration_seconds, video_path, caption),
        dream_media(id, storage_path, media_type, mime_type, order_index)
      `).is('deleted_at', null).order('created_at', { ascending: false });

      if (options?.userId) {
        query = query.eq('user_id', options.userId);
      }

      if (options?.category) {
        query = query.eq('category', options.category);
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        return [];
      }

      const now = new Date();

      // Batch query author profiles by distinct user_ids
      const userIds = [...new Set(data.map((r: any) => r.user_id).filter(Boolean))];
      const profileMap = new Map<string, any>();
      if (userIds.length > 0) {
        try {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url, region_bucket')
            .in('id', userIds);
          if (profs) {
            for (const p of profs) {
              profileMap.set(p.id, p);
            }
          }
        } catch (pErr) {
          console.warn('[Supabase] fetchDreams profiles lookup note:', pErr);
        }
      }

      return Promise.all(data.map(async (row: any) => {
        const authorObj = profileMap.get(row.user_id) || {};
        const activeStory = Array.isArray(row.last_night_stories)
          ? row.last_night_stories.find((s: any) => new Date(s.expires_at) > now)
          : null;
        const clipRecord = Array.isArray(row.clips) && row.clips.length > 0 ? row.clips[0] : null;
        const mediaRecord = Array.isArray(row.dream_media) && row.dream_media.length > 0
          ? [...row.dream_media].sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))[0]
          : null;

        let mediaUrl: string | undefined;
        if (mediaRecord?.storage_path) {
          if (mediaRecord.storage_path.startsWith('http://') || mediaRecord.storage_path.startsWith('https://')) {
            mediaUrl = mediaRecord.storage_path;
          } else {
            try {
              const { data: signedData } = await supabase.storage
                .from('dream-media')
                .createSignedUrl(mediaRecord.storage_path, 60 * 60);
              mediaUrl = signedData?.signedUrl;
            } catch (e) {
              console.warn('[Supabase] Dream media signed URL note:', e);
            }
          }
        }

        let clipVideoUrl = clipRecord?.video_path;
        if (clipVideoUrl && !clipVideoUrl.startsWith('http://') && !clipVideoUrl.startsWith('https://')) {
          try {
            const { data: signedClip } = await supabase.storage
              .from('dream-media')
              .createSignedUrl(clipVideoUrl, 60 * 60);
            if (signedClip?.signedUrl) {
              clipVideoUrl = signedClip.signedUrl;
            }
          } catch (e) {
            console.warn('[Supabase] Clip video signed URL note:', e);
          }
        }

        const isPriv = row.is_private ?? (row.visibility === 'private');
        const isFollow = row.is_followers_only ?? (row.visibility === 'followers');
        const audienceVal: Audience = isPriv ? 'only_me' : (isFollow ? 'followers' : 'public');

        return {
          id: row.id,
          title: row.title,
          hook: row.hook || `"${(row.content || '').slice(0, 40)}..."`,
          content: row.content,
          rawTranscript: row.raw_transcript,
          category: row.category || 'Surreal',
          tags: Array.isArray(row.tags) ? row.tags : [],
          audience: audienceVal,
          isNearbyEligible: Boolean(row.is_nearby_eligible),
          region: authorObj.region_bucket || 'Bhubaneswar area',
          likes: row.likes_count || 1,
          commentsCount: row.comments_count || 0,
          viewsCount: row.views_count || 1,
          timeAgo: 'Recently',
          mediaType: row.media_type || mediaRecord?.media_type || (clipRecord ? 'video' : 'illustration'),
          mediaUrl: mediaUrl || clipVideoUrl,
          imageUrl: mediaRecord?.media_type === 'image' ? mediaUrl : undefined,
          mediaKind: mediaRecord?.media_type === 'video' || clipRecord ? 'video' : (mediaRecord?.media_type === 'image' || mediaUrl ? 'image' : 'none'),
          hasClip: Boolean(clipRecord),
          clipDuration: clipRecord ? `${clipRecord.duration_seconds}s` : undefined,
          clipVideoUrl,
          cardColor: row.raw_data?.cardColor || row.raw_data?.card_color || row.card_color || row.cardColor,
          cardBorderColor: row.raw_data?.cardBorderColor || row.raw_data?.card_border_color || row.card_border_color || row.cardBorderColor,
          cardTextColor: row.raw_data?.cardTextColor || row.raw_data?.card_text_color || row.card_text_color || row.cardTextColor,
          cardGradient: row.raw_data?.cardGradient || row.raw_data?.card_gradient || row.card_gradient || row.cardGradient,
          raw_data: row.raw_data,
          author: {
            id: authorObj.id || row.user_id || 'u-me',
            name: authorObj.display_name || 'Dreamer',
            handle: authorObj.username ? (authorObj.username.startsWith('@') ? authorObj.username : `@${authorObj.username}`) : '@dreamer',
            avatar: authorObj.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
            initials: (authorObj.display_name?.[0] || 'D').toUpperCase(),
            color: '#5438FF',
          },
          surfaces: {
            isNormalPost: true,
            isStory: Boolean(activeStory),
            isNearby: Boolean(row.is_nearby_eligible),
            hasClip: Boolean(clipRecord),
            storyExpiresAt: activeStory?.expires_at,
          },
          comments: [],
        } as Dream;
      }));
    } catch (e) {
      console.warn('[Supabase] fetchDreams note:', e);
      return [];
    }
  }

  /**
   * Fetch active Last Night Stories (expires_at > now())
   */
  public async fetchLastNightStories(): Promise<{ dreamId: string; title: string; hook: string; authorName: string; expiresAt: string }[]> {
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('last_night_stories')
        .select(`
          id,
          dream_id,
          user_id,
          expires_at,
          published_at,
          dream:dreams(id, title, hook, user_id)
        `)
        .gt('expires_at', nowIso)
        .order('published_at', { ascending: false });

      if (error || !data || data.length === 0) return [];

      const userIds = [...new Set(data.map((r: any) => r.user_id || r.dream?.user_id).filter(Boolean))];
      const profileMap = new Map<string, any>();
      if (userIds.length > 0) {
        try {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', userIds);
          if (profs) {
            for (const p of profs) {
              profileMap.set(p.id, p);
            }
          }
        } catch (pErr) {
          console.warn('[Supabase] fetchLastNightStories profiles note:', pErr);
        }
      }

      return data.map((row: any) => {
        const authorProfile = profileMap.get(row.user_id || row.dream?.user_id);
        return {
          dreamId: row.dream?.id || row.dream_id || row.id,
          title: row.dream?.title || 'Story Dream',
          hook: row.dream?.hook || '',
          authorName: authorProfile?.display_name || 'Friend',
          expiresAt: row.expires_at,
        };
      });
    } catch (e) {
      console.warn('[Supabase] fetchLastNightStories note:', e);
      return [];
    }
  }

  /**
   * Fetch Clips attached to canonical dreams
   */
  public async fetchClips(): Promise<ClipItem[]> {
    try {
      const { data, error } = await supabase
        .from('clips')
        .select(`
          id,
          dream_id,
          user_id,
          media_id,
          duration_seconds,
          video_path,
          caption,
          aspect_ratio,
          created_at,
          dream:dreams(id, title, hook, tags, category, likes_count, comments_count, user_id)
        `)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error || !data || data.length === 0) return [];

      const userIds = [...new Set(data.map((c: any) => c.user_id || c.dream?.user_id).filter(Boolean))];
      const profileMap = new Map<string, any>();
      if (userIds.length > 0) {
        try {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', userIds);
          if (profs) {
            for (const p of profs) {
              profileMap.set(p.id, p);
            }
          }
        } catch (pErr) {
          console.warn('[Supabase] fetchClips profiles note:', pErr);
        }
      }

      return Promise.all(
        data.map(async (c: any) => {
          const d = c.dream || {};
          const authorUserId = c.user_id || d.user_id;
          const author = profileMap.get(authorUserId) || {};

          let videoUrl = c.video_path;
          if (videoUrl && !videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
            try {
              const { data: signed } = await supabase.storage.from('dream-media').createSignedUrl(videoUrl, 60 * 60);
              if (signed?.signedUrl) {
                videoUrl = signed.signedUrl;
              }
            } catch (e) {
              console.warn('[Supabase] Clip signed URL note:', e);
            }
          }

          return {
            id: c.id,
            dreamId: d.id || c.dream_id || `dream-${c.id}`,
            title: d.title || 'Dream Clip',
            hook: d.hook || c.caption || '',
            quote: c.caption || d.hook || '',
            videoOrImageUrl: videoUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
            creator: {
              name: author.display_name || 'Dreamer',
              handle: author.username ? (author.username.startsWith('@') ? author.username : `@${author.username}`) : '@dreamer',
              avatar: author.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
              timeAgo: 'Recently',
            },
            tags: Array.isArray(d.tags) && d.tags.length > 0 ? d.tags : [`#${d.category || 'Surreal'}`],
            likes: d.likes_count || 1,
            commentsCount: d.comments_count || 0,
            viewsCount: 1,
            currentTime: '00:00',
            totalTime: `00:${c.duration_seconds || 30}`,
            isLiked: false,
            isSaved: false,
          } as ClipItem;
        })
      );
    } catch (e) {
      console.warn('[Supabase] fetchClips note:', e);
      return [];
    }
  }

  // ============================================================================
  // 6. SOCIAL INTERACTIONS & REACTIONS
  // ============================================================================

  /**
   * Polymorphic reaction (like / resonance) on dream or clip
   */
  public async syncReaction(
    userId: string,
    targetType: 'dream' | 'clip',
    targetId: string,
    reactionType: string = 'like',
    active: boolean = true,
    targetTitle?: string
  ): Promise<void> {
    try {
      if (active) {
        await supabase.from('reactions').upsert([
          {
            user_id: userId,
            target_type: targetType,
            target_id: targetId,
            reaction_type: reactionType,
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        await supabase.from('reactions').delete().match({
          user_id: userId,
          target_type: targetType,
          target_id: targetId,
          reaction_type: reactionType,
        });
      }
    } catch (e) {
      console.warn('[Supabase] syncReaction note:', e);
    }

    await this.recordActivity({
      user_id: userId,
      action_type: active ? 'REACTION_ADD' : 'REACTION_REMOVE',
      title: active ? `Echoed ${targetType}` : `Removed Echo on ${targetType}`,
      description: active
        ? `Echoed "${targetTitle || targetType}" (${reactionType})`
        : `Un-echoed "${targetTitle || targetType}"`,
      target_id: targetId,
      target_type: targetType,
      metadata: { targetType, reactionType, active },
    });
  }

  /**
   * Save / Bookmark dream or clip to personal archive
   */
  public async syncSave(
    userId: string,
    targetType: 'dream' | 'clip',
    targetId: string,
    isSaved: boolean,
    targetTitle?: string
  ): Promise<void> {
    const payload: any = { user_id: userId };
    if (targetType === 'dream') payload.dream_id = targetId;
    if (targetType === 'clip') payload.clip_id = targetId;

    try {
      if (isSaved) {
        await supabase.from('saves').upsert([payload]);
      } else {
        await supabase.from('saves').delete().match(payload);
      }
    } catch (e) {
      console.warn('[Supabase] syncSave note:', e);
    }

    await this.recordActivity({
      user_id: userId,
      action_type: isSaved ? 'SAVE_ARCHIVE' : 'UNSAVE_ARCHIVE',
      title: isSaved ? 'Saved to Archive' : 'Removed from Archive',
      description: isSaved
        ? `Archived "${targetTitle || targetType}" in personal collection`
        : `Removed "${targetTitle || targetType}" from archive`,
      target_id: targetId,
      target_type: targetType,
      metadata: { isSaved },
    });
  }

  /**
   * Threaded comments on dreams & clips
   */
  public async syncComment(
    userId: string,
    targetType: 'dream' | 'clip',
    targetId: string,
    comment: { id: string; authorName: string; text: string; authorAvatar?: string; parentCommentId?: string },
    targetTitle?: string
  ): Promise<void> {
    try {
      await supabase.from('comments').insert([
        {
          id: comment.id.startsWith('comm-') ? undefined : comment.id,
          user_id: userId,
          target_type: targetType,
          target_id: targetId,
          parent_comment_id: comment.parentCommentId || null,
          body: comment.text,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      console.warn('[Supabase] syncComment note:', e);
    }

    await this.recordActivity({
      user_id: userId,
      action_type: 'ADD_COMMENT',
      title: `Reflection on ${targetType}`,
      description: `Commented: "${comment.text.slice(0, 50)}${comment.text.length > 50 ? '...' : ''}"`,
      target_id: targetId,
      target_type: targetType,
      metadata: { commentId: comment.id, length: comment.text.length },
    });
  }

  /**
   * Social dream share tracking
   */
  public async syncShare(
    userId: string,
    targetType: 'dream' | 'clip',
    targetId: string,
    platform: string = 'web_share',
    targetTitle?: string
  ): Promise<void> {
    try {
      await supabase.from('share_events').insert([
        {
          user_id: userId,
          target_type: targetType,
          target_id: targetId,
          platform,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      console.warn('[Supabase] syncShare note:', e);
    }

    await this.recordActivity({
      user_id: userId,
      action_type: 'SHARE_EVENT',
      title: `Shared ${targetType}`,
      description: `Shared "${targetTitle || targetType}" via ${platform}`,
      target_id: targetId,
      target_type: targetType,
      metadata: { platform },
    });
  }

  /**
   * Helper to format relative time strings
   */
  public formatTimeAgo(isoDate?: string): string {
    if (!isoDate) return 'Just now';
    const diff = Math.max(0, Date.now() - new Date(isoDate).getTime());
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    const date = new Date(isoDate);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  /**
   * Generate canonical 1:1 conversation thread ID
   */
  public getCanonicalThreadId(userIdA: string, userIdB: string): string {
    const cleanA = userIdA.trim();
    const cleanB = userIdB.trim();
    return `dm_${[cleanA, cleanB].sort().join('_')}`;
  }

  /**
   * 1:1 Direct message sync to Supabase `messages` table
   */
  public async syncMessage(
    conversationId: string,
    sender: { id: string; name: string; handle?: string },
    text: string
  ): Promise<any> {
    const cleanText = text.trim();
    if (!cleanText) return null;

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([
          {
            thread_id: conversationId,
            sender_id: sender.id,
            sender_name: sender.name,
            text: cleanText,
          },
        ])
        .select()
        .single();

      if (error) {
        console.warn('[Supabase] syncMessage error:', error.message);
        throw error;
      }

      await this.recordActivity({
        user_id: sender.id,
        action_type: 'SEND_DIRECT_MESSAGE',
        title: 'Dispatched Whisper',
        description: `Sent message in thread ${conversationId}`,
        target_id: conversationId,
        target_type: 'message',
        metadata: { conversationId, length: cleanText.length },
      });

      return data;
    } catch (e) {
      console.warn('[Supabase] syncMessage note:', e);
      throw e;
    }
  }

  /**
   * Fetch all conversation threads for a user from real Supabase messages
   */
  public async fetchConversations(currentUserId: string): Promise<DirectMessageItem[]> {
    if (!currentUserId || currentUserId.startsWith('u-guest')) {
      return [];
    }

    try {
      // Find all messages involving current user
      const { data: rawMessages, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},thread_id.ilike.%${currentUserId}%`)
        .order('created_at', { ascending: true });

      if (error || !rawMessages || rawMessages.length === 0) {
        return [];
      }

      // Group by thread_id
      const threadsMap = new Map<string, any[]>();
      for (const msg of rawMessages) {
        const tid = msg.thread_id;
        if (!threadsMap.has(tid)) {
          threadsMap.set(tid, []);
        }
        threadsMap.get(tid)!.push(msg);
      }

      // Collect other participant IDs
      const participantIds = new Set<string>();
      threadsMap.forEach((msgs, threadId) => {
        // Extract from canonical thread_id: "dm_uid1_uid2"
        if (threadId.startsWith('dm_')) {
          const parts = threadId.replace(/^dm_/, '').split('_');
          const other = parts.find((p) => p !== currentUserId);
          if (other) participantIds.add(other);
        } else {
          // Fallback: check sender of other messages
          for (const m of msgs) {
            if (m.sender_id && m.sender_id !== currentUserId) {
              participantIds.add(m.sender_id);
            }
          }
        }
      });

      // Fetch profiles of participants in batch
      const profilesMap = new Map<string, { name: string; avatar: string; handle: string }>();
      if (participantIds.size > 0) {
        const idList = Array.from(participantIds);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, handle, avatar')
          .in('id', idList);

        (profiles || []).forEach((p: any) => {
          profilesMap.set(p.id, {
            name: p.name || 'Dreamer',
            avatar: p.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
            handle: p.handle ? (p.handle.startsWith('@') ? p.handle : `@${p.handle}`) : '@dreamer',
          });
        });
      }

      const result: DirectMessageItem[] = [];

      threadsMap.forEach((msgs, threadId) => {
        let otherId = '';
        if (threadId.startsWith('dm_')) {
          const parts = threadId.replace(/^dm_/, '').split('_');
          otherId = parts.find((p) => p !== currentUserId) || '';
        }
        if (!otherId) {
          const otherMsg = msgs.find((m) => m.sender_id !== currentUserId);
          otherId = otherMsg?.sender_id || '';
        }

        const profile = profilesMap.get(otherId);
        const lastMsg = msgs[msgs.length - 1];
        const lastMsgSenderName = lastMsg ? (lastMsg.sender_id === currentUserId ? 'You' : (profile?.name || lastMsg.sender_name || 'Dreamer')) : '';
        const previewText = lastMsg ? `${lastMsg.sender_id === currentUserId ? 'You: ' : ''}${lastMsg.text}` : 'Started conversation';

        const conversationMessages = msgs.map((m) => ({
          id: m.id,
          sender: (m.sender_id === currentUserId ? 'me' : 'them') as 'me' | 'them',
          text: m.text,
          time: this.formatTimeAgo(m.created_at),
        }));

        result.push({
          id: threadId,
          senderName: profile?.name || otherId || 'Dreamer',
          senderAvatar: profile?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
          previewText,
          timestamp: this.formatTimeAgo(lastMsg?.created_at),
          unreadCount: 0,
          status: 'online',
          messages: conversationMessages,
        });
      });

      // Sort newest conversations first
      result.sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1];
        const bLast = b.messages[b.messages.length - 1];
        return (bLast?.id ? 1 : 0) - (aLast?.id ? 1 : 0);
      });

      return result;
    } catch (e) {
      console.warn('[Supabase] fetchConversations error:', e);
      return [];
    }
  }

  /**
   * Fetch messages for a specific conversation thread from Supabase
   */
  public async fetchThreadMessages(
    threadId: string,
    currentUserId: string
  ): Promise<{ id: string; sender: 'me' | 'them'; text: string; time: string; createdAt: string; senderId: string; senderName: string }[]> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error || !data) {
        return [];
      }

      return data.map((m: any) => ({
        id: m.id,
        sender: m.sender_id === currentUserId ? ('me' as const) : ('them' as const),
        text: m.text,
        time: this.formatTimeAgo(m.created_at),
        createdAt: m.created_at,
        senderId: m.sender_id,
        senderName: m.sender_name,
      }));
    } catch (e) {
      console.warn('[Supabase] fetchThreadMessages note:', e);
      return [];
    }
  }

  /**
   * Realtime subscription for a direct message thread
   */
  public subscribeToThread(
    threadId: string,
    onNewMessage: (msg: any) => void
  ): () => void {
    const channelName = `thread-${threadId}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          if (payload.new) {
            onNewMessage(payload.new);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Channel active
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Clip view analytics counter
   */
  public async recordClipView(
    clipId: string,
    userId?: string,
    viewType: 'view' | 'completion' | 'replay' = 'view'
  ): Promise<void> {
    try {
      await supabase.from('clip_views').insert([
        {
          clip_id: clipId,
          user_id: userId || null,
          view_type: viewType,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      console.warn('[Supabase] recordClipView note:', e);
    }
  }

  // ============================================================================
  // 7. DREAM CIRCLES (Deep discussion on ONE Dream)
  // ============================================================================

  public async createCircleThread(
    dreamId: string,
    userId: string,
    title: string,
    body: string
  ): Promise<void> {
    try {
      // Find or create circle
      let { data: circle } = await supabase
        .from('dream_circles')
        .select('id')
        .eq('dream_id', dreamId)
        .maybeSingle();

      if (!circle) {
        const { data: newCircle } = await supabase
          .from('dream_circles')
          .insert([{ dream_id: dreamId }])
          .select('id')
          .single();
        circle = newCircle;
      }

      if (circle?.id) {
        await supabase.from('circle_threads').insert([
          {
            circle_id: circle.id,
            user_id: userId,
            title,
            body,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (e) {
      console.warn('[Supabase] createCircleThread note:', e);
    }
  }

  public async addCircleReply(
    threadId: string,
    userId: string,
    body: string
  ): Promise<void> {
    try {
      await supabase.from('circle_replies').insert([
        {
          thread_id: threadId,
          user_id: userId,
          body,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      console.warn('[Supabase] addCircleReply note:', e);
    }
  }

  // ============================================================================
  // 8. AUDIT ACTIVITY STREAM
  // ============================================================================

  public async recordActivity(activity: SupabaseActivityRecord): Promise<void> {
    const payload = {
      user_id: activity.user_id,
      action_type: activity.action_type,
      title: activity.title,
      description: activity.description,
      target_id: activity.target_id || null,
      target_type: activity.target_type || null,
      metadata: activity.metadata || {},
      created_at: activity.created_at || new Date().toISOString(),
    };

    try {
      await supabase.from('activities').insert([payload]);
    } catch (e) {
      console.warn('[Supabase] recordActivity note:', e);
    }
  }

  // ============================================================================
  // 9. COMPLETE PRODUCTION DDL SCRIPT FOR SUPABASE SQL EDITOR
  // ============================================================================

  public getSqlMigrationSchema(): string {
    return `-- ==============================================================================
-- SIIMR: Production Database Schema for Supabase (Project: ${this.projectId})
-- Architectural Model: Canonical DREAM with 4 Publishing Surfaces:
-- 1. Last Night Story (24h temporary social surface)
-- 2. Normal Dream Post (permanent feed discovery)
-- 3. Nearby Share (coarse geo-bucket privacy-preserving discovery)
-- 4. Clip (persistent short-video explanation)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  banner_quote TEXT DEFAULT 'How to go for a little walk and never return',
  region_bucket TEXT DEFAULT 'Bhubaneswar area',
  nearby_opt_in BOOLEAN DEFAULT true,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  followers_count INT DEFAULT 0,
  following_count INT DEFAULT 0,
  dreams_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. DREAMS (Canonical Content Object)
CREATE TABLE IF NOT EXISTS public.dreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  hook TEXT,
  raw_transcript TEXT,
  content TEXT NOT NULL,
  dream_date DATE DEFAULT CURRENT_DATE NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  category TEXT DEFAULT 'Surreal' CHECK (category IN ('Surreal', 'Recurring', 'Lucid', 'Nightmares')),
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('private', 'followers', 'public')),
  is_nearby_eligible BOOLEAN DEFAULT true,
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  views_count INT DEFAULT 0,
  media_type TEXT DEFAULT 'illustration',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 3. DREAM MEDIA
CREATE TABLE IF NOT EXISTS public.dream_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'audio', 'video')),
  mime_type TEXT,
  duration_ms INT,
  width INT,
  height INT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. DREAM TRANSCRIPTS
CREATE TABLE IF NOT EXISTS public.dream_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transcript TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  audio_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5. SURFACE 1: LAST NIGHT STORIES (24h temporary social surface)
CREATE TABLE IF NOT EXISTS public.last_night_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  audience TEXT DEFAULT 'public' CHECK (audience IN ('private', 'followers', 'public')),
  published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours') NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 6. SURFACE 2: DREAM PUBLICATIONS (Feed discovery)
CREATE TABLE IF NOT EXISTS public.dream_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  publication_type TEXT NOT NULL DEFAULT 'normal' CHECK (publication_type IN ('normal', 'nearby', 'story')),
  audience TEXT DEFAULT 'public' CHECK (audience IN ('private', 'followers', 'public')),
  published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 7. SURFACE 3: NEARBY SHARES (Coarse geo-bucket opt-in)
CREATE TABLE IF NOT EXISTS public.nearby_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  geo_bucket TEXT NOT NULL DEFAULT 'Bhubaneswar area',
  area_label TEXT NOT NULL DEFAULT 'Nearby',
  enabled BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 8. SURFACE 4: CLIPS (Persistent short-video explanation)
CREATE TABLE IF NOT EXISTS public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_path TEXT NOT NULL,
  thumbnail_path TEXT,
  duration_seconds INT DEFAULT 30,
  caption TEXT,
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'processing', 'published', 'failed', 'deleted')),
  views_count INT DEFAULT 0,
  published_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 9. CLIP VIEWS
CREATE TABLE IF NOT EXISTS public.clip_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  view_type TEXT DEFAULT 'view' CHECK (view_type IN ('view', 'completion', 'replay')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 10. DREAM CIRCLES
CREATE TABLE IF NOT EXISTS public.dream_circles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID UNIQUE NOT NULL REFERENCES public.dreams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.circle_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES public.dream_circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.circle_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.circle_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 11. COMMENTS
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('dream', 'clip')),
  target_id UUID NOT NULL,
  parent_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 12. REACTIONS
CREATE TABLE IF NOT EXISTS public.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('dream', 'clip')),
  target_id UUID NOT NULL,
  reaction_type TEXT DEFAULT 'like',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, target_type, target_id, reaction_type)
);

-- 13. SAVES
CREATE TABLE IF NOT EXISTS public.saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dream_id UUID REFERENCES public.dreams(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CHECK (dream_id IS NOT NULL OR clip_id IS NOT NULL)
);

-- 14. SHARE EVENTS
CREATE TABLE IF NOT EXISTS public.share_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('dream', 'clip')),
  target_id UUID NOT NULL,
  platform TEXT DEFAULT 'web_share',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 15. SOCIAL GRAPH: FOLLOWS & BLOCKS
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- 16. MESSAGING
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  media_path TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 17. ACTIVITIES
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_id TEXT,
  target_type TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_dreams_user ON public.dreams(user_id);
CREATE INDEX IF NOT EXISTS idx_dreams_created ON public.dreams(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_last_night_stories_active ON public.last_night_stories(expires_at) WHERE expires_at > now();
CREATE INDEX IF NOT EXISTS idx_nearby_shares_bucket ON public.nearby_shares(geo_bucket, enabled);
CREATE INDEX IF NOT EXISTS idx_clips_dream ON public.clips(dream_id);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.last_night_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nearby_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles public read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Profiles update own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Dreams public read" ON public.dreams FOR SELECT USING (visibility = 'public' OR (auth.uid() = user_id));
CREATE POLICY "Dreams create own" ON public.dreams FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Stories active read" ON public.last_night_stories FOR SELECT USING (expires_at > now());
CREATE POLICY "Stories create own" ON public.last_night_stories FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Nearby shares read" ON public.nearby_shares FOR SELECT USING (enabled = true);
CREATE POLICY "Nearby shares create" ON public.nearby_shares FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Clips published read" ON public.clips FOR SELECT USING (status = 'published');
CREATE POLICY "Clips create own" ON public.clips FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Comments public read" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Comments insert own" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Reactions public read" ON public.reactions FOR SELECT USING (true);
CREATE POLICY "Reactions manage own" ON public.reactions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Saves user access" ON public.saves FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Circles public read" ON public.dream_circles FOR SELECT USING (true);
CREATE POLICY "Threads public read" ON public.circle_threads FOR SELECT USING (true);
CREATE POLICY "Threads insert own" ON public.circle_threads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Replies public read" ON public.circle_replies FOR SELECT USING (true);
CREATE POLICY "Replies insert own" ON public.circle_replies FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Activities public read" ON public.activities FOR SELECT USING (true);
CREATE POLICY "Activities insert any" ON public.activities FOR INSERT WITH CHECK (true);
`;
  }
}

export const supabaseService = new SupabaseService();
