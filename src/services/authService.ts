import { supabase } from './supabase';
import { AuthUser } from '../types';
import { activityService } from './activityService';
import { supabaseService } from './supabaseService';

/**
 * Development / testing demo personas.
 * These are strictly for local interface testing and are NOT real authenticated accounts.
 */
export const DEMO_USERS: AuthUser[] = [
  {
    id: 'u-me',
    name: 'Isha',
    handle: '@bhumika',
    email: 'isha@siimr.io',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    bio: 'Creating moments, one story at a time.',
    initials: 'I',
    color: '#5438FF',
    region: 'Bhubaneswar area',
    nearbyOptIn: true,
    followersCount: 1200,
    followingCount: 400,
    dreamsCount: 67,
    role: 'user',
    isDemo: true,
    bannerQuote: 'How to go for a little walk and never return',
    createdAt: '2026-01-15T08:00:00.000Z'
  },
  {
    id: 'u-siimr',
    name: 'Siimr Architect',
    handle: '@siimr',
    email: 'siimr.com@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    bio: 'Lead Architect of the collective dream archives.',
    initials: 'S',
    color: '#5438FF',
    region: 'Bhubaneswar area',
    nearbyOptIn: true,
    followersCount: 1420,
    followingCount: 380,
    dreamsCount: 88,
    role: 'moderator',
    isDemo: true,
    bannerQuote: 'Speak it before it fades.',
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'u-amara',
    name: 'Amara T.',
    handle: '@amara',
    email: 'amara@siimr.io',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    bio: 'Archiving sideways elevators, corridors, and liminal spaces.',
    initials: 'A',
    color: '#5438FF',
    region: 'Bhubaneswar area',
    nearbyOptIn: true,
    followersCount: 850,
    followingCount: 210,
    dreamsCount: 34,
    role: 'user',
    isDemo: true,
    bannerQuote: 'Every corridor remembers the one who walked through',
    createdAt: '2026-02-10T12:30:00.000Z'
  },
  {
    id: 'u-josh',
    name: 'Josh',
    handle: '@josh',
    email: 'josh@siimr.io',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    bio: 'Stairs in the sky and dreams of weightless ascent.',
    initials: 'J',
    color: '#5438FF',
    region: 'Bhubaneswar area',
    nearbyOptIn: true,
    followersCount: 640,
    followingCount: 190,
    dreamsCount: 22,
    role: 'user',
    isDemo: true,
    bannerQuote: 'Looking up until the ground dissolves',
    createdAt: '2026-02-18T16:45:00.000Z'
  },
  {
    id: 'u-maya',
    name: 'Maya Chen',
    handle: '@astral_drift',
    email: 'maya@siimr.io',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
    bio: 'Lucid portal explorer & deep sleep acoustic researcher.',
    initials: 'M',
    color: '#7064F6',
    region: 'Pacific Northwest',
    nearbyOptIn: false,
    followersCount: 2300,
    followingCount: 510,
    dreamsCount: 114,
    role: 'moderator',
    isDemo: true,
    bannerQuote: 'Some doors only open when you stop trying to wake up',
    createdAt: '2025-11-20T09:15:00.000Z'
  }
];

export const GUEST_USER: AuthUser = {
  id: 'u-guest',
  name: 'Guest Dreamer',
  handle: '@guest',
  email: 'guest@siimr.io',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
  bio: 'Wandering the collective unconscious in guest exploration mode.',
  initials: 'G',
  color: '#8E8E93',
  region: 'Anonymous Region',
  nearbyOptIn: false,
  followersCount: 0,
  followingCount: 0,
  dreamsCount: 0,
  isGuest: true,
  bannerQuote: 'Wandering unseen through the corridors of night'
};

class AuthService {
  private currentUser: AuthUser = GUEST_USER;
  private authListeners: ((user: AuthUser) => void)[] = [];
  private isResolvingSession = false;

  constructor() {
    this.initSupabaseListener();
  }

  /**
   * Supabase Auth listener as the single source of truth for user authentication.
   */
  private initSupabaseListener() {
    try {
      // 1. Listen for Supabase auth state transitions
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          await this.syncSessionUser(session.user);
        } else if (event === 'SIGNED_OUT' || !session) {
          if (!this.currentUser.isGuest) {
            this.currentUser = GUEST_USER;
            this.notifyListeners(GUEST_USER);
          }
        }
      });

      // 2. Immediate getSession check for existing persisted sessions (Requirement 8)
      supabase.auth.getSession().then(async ({ data: { session }, error }) => {
        if (error || !session?.user) {
          if (!this.currentUser.isGuest && !this.currentUser.isDemo) {
            this.currentUser = GUEST_USER;
            this.notifyListeners(GUEST_USER);
          }
        } else {
          await this.syncSessionUser(session.user);
        }
      });
    } catch (err) {
      console.warn('[AuthService] Supabase auth listener initialization note:', err);
    }
  }

  /**
   * Synchronizes an authenticated Supabase user into the SIIMR profile.
   * If a profile already exists for this Supabase user ID, it is fetched without duplicating.
   * If this is a new signup, creates the SIIMR profile record linked 1:1 to the Supabase Auth UUID.
   */
  public async syncSessionUser(sbUser: {
    id: string;
    email?: string;
    user_metadata?: Record<string, any>;
    created_at?: string;
  }): Promise<AuthUser> {
    if (this.isResolvingSession && this.currentUser.id === sbUser.id) {
      return this.currentUser;
    }
    this.isResolvingSession = true;

    try {
      // 1. Check if public.profiles already has a row for this Supabase user ID
      const existingProfile = await supabaseService.fetchUserProfile(sbUser.id);
      if (existingProfile) {
        this.currentUser = existingProfile;
        this.notifyListeners(existingProfile);
        return existingProfile;
      }

      // 2. New User Registration: create the corresponding SIIMR profile
      const meta = sbUser.user_metadata || {};
      const cleanEmail = (sbUser.email || '').trim().toLowerCase();
      const displayName =
        meta.display_name ||
        meta.full_name ||
        meta.name ||
        (cleanEmail ? cleanEmail.split('@')[0] : 'Dreamer');

      const rawHandle =
        meta.handle ||
        (cleanEmail ? cleanEmail.split('@')[0] : `dreamer_${sbUser.id.slice(0, 5)}`);
      const cleanHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;

      const newProfile: AuthUser = {
        id: sbUser.id,
        name: displayName,
        handle: cleanHandle,
        username: cleanHandle.replace(/^@/, ''),
        email: cleanEmail || 'dreamer@siimr.io',
        avatar:
          meta.avatar_url ||
          meta.picture ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        bio: meta.bio || 'New dreamer archiving the nocturnal realm.',
        initials: (displayName[0] || 'D').toUpperCase(),
        color: '#5438FF',
        region: meta.region_bucket || 'Bhubaneswar area',
        nearbyOptIn: meta.nearby_opt_in ?? true,
        followersCount: 0,
        followingCount: 0,
        dreamsCount: 0,
        role: cleanEmail === 'siimr.com@gmail.com' ? 'moderator' : 'user',
        bannerQuote: 'Every dream is an unwritten world.',
        createdAt: sbUser.created_at || new Date().toISOString(),
      };

      await supabaseService.syncUserProfile(newProfile);
      this.currentUser = newProfile;
      this.notifyListeners(newProfile);
      return newProfile;
    } finally {
      this.isResolvingSession = false;
    }
  }

  public subscribe(listener: (user: AuthUser) => void): () => void {
    this.authListeners.push(listener);
    // Notify listener immediately of current state
    try {
      listener(this.currentUser);
    } catch (e) {
      console.warn('[AuthService] Initial subscribe notice:', e);
    }
    return () => {
      this.authListeners = this.authListeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(user: AuthUser) {
    this.authListeners.forEach((fn) => {
      try {
        fn(user);
      } catch (err) {
        console.warn('[AuthService] Notice in auth listener:', err);
      }
    });
  }

  public getCurrentUser(): AuthUser {
    return this.currentUser;
  }

  /**
   * Real Email + Password Sign In via Supabase Auth.
   */
  public async loginWithEmail(
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }

    try {
      const res = await supabaseService.authSignIn(cleanEmail, password);
      if (res.success && res.user) {
        // Requirement 6: After successful email/password sign-in with a confirmed account,
        // wait for/verify the Supabase session before setting the app's authenticated currentUser.
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr || !sessionData?.session || !sessionData.session.user) {
          return {
            success: false,
            error: 'Active Supabase session not found. Please verify your account credentials.',
          };
        }

        this.currentUser = res.user;
        this.notifyListeners(res.user);

        activityService
          .recordActivity(res.user.id, {
            actionType: 'LOGIN',
            title: 'User Authenticated',
            description: `Signed in as ${res.user.name} (${res.user.handle})`,
            targetId: res.user.id,
            targetType: 'account',
          })
          .catch((e) => console.warn('[AuthService] Login activity note:', e));

        return { success: true, user: res.user };
      }

      return {
        success: false,
        error: res.error || 'Invalid credentials. Please verify your email and password.',
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Supabase authentication failed. Please try again.',
      };
    }
  }

  /**
   * Real User Registration via Supabase Auth + Profile creation.
   */
  public async signupWithEmail(params: {
    name: string;
    handle: string;
    email: string;
    password: string;
    bio?: string;
    region?: string;
    nearbyOptIn?: boolean;
  }): Promise<{ success: boolean; user?: AuthUser; message?: string; error?: string }> {
    const cleanName = params.name.trim();
    let cleanHandle = params.handle.trim();
    const cleanEmail = params.email.trim().toLowerCase();
    const password = params.password;

    if (!cleanName) return { success: false, error: 'Please enter your display name.' };
    if (!cleanHandle) return { success: false, error: 'Please choose a dream handle (e.g. @somnium).' };
    if (!cleanHandle.startsWith('@')) cleanHandle = `@${cleanHandle}`;

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    try {
      const res = await supabaseService.authSignUp({
        displayName: cleanName,
        handle: cleanHandle,
        email: cleanEmail,
        password,
        bio: params.bio,
        regionBucket: params.region,
        nearbyOptIn: params.nearbyOptIn,
      });

      if (res.success) {
        // Requirement 7: After signup, if data.session is null because email confirmation is required,
        // do NOT call onLoginSuccess as though the user is logged in. Show the appropriate confirmation message instead.
        if (!res.user || !res.session) {
          return {
            success: true,
            user: undefined,
            message:
              res.message ||
              'Account created! Please check your email to confirm your account before signing in.',
          };
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          return {
            success: true,
            user: undefined,
            message:
              res.message ||
              'Account created! Please check your email to confirm your account before signing in.',
          };
        }

        this.currentUser = res.user;
        this.notifyListeners(res.user);

        activityService
          .recordActivity(res.user.id, {
            actionType: 'SIGNUP',
            title: 'Account Created',
            description: `Registered new dreamer account ${res.user.name} (${res.user.handle})`,
            targetId: res.user.id,
            targetType: 'account',
          })
          .catch((e) => console.warn('[AuthService] Signup activity note:', e));

        return { success: true, user: res.user, message: res.message };
      }

      return {
        success: false,
        error: res.error || 'Registration could not be completed with Supabase Auth.',
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Registration failed. Please try again.',
      };
    }
  }

  /**
   * Real Google Single Sign-On via Supabase OAuth.
   */
  public async loginWithGoogle(): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const res = await supabaseService.authSignInWithGoogle();
      if (!res.success) {
        return {
          success: false,
          error: res.error || 'Google OAuth could not be initiated with Supabase.',
        };
      }
      return { success: true, url: res.url };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Google OAuth encountered an unexpected error.',
      };
    }
  }

  /**
   * Password Reset via Supabase Auth.
   */
  public async sendPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, message: 'Please enter a valid email address.' };
    }

    try {
      const supaRes = await supabaseService.authResetPassword(cleanEmail);
      if (supaRes.success) {
        return {
          success: true,
          message: `A password reset link has been dispatched to ${cleanEmail} via Supabase Auth.`,
        };
      }
      return {
        success: false,
        message: supaRes.error || 'Unable to dispatch password reset link.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Password reset request failed.',
      };
    }
  }

  /**
   * Sign out through Supabase Auth, clearing the session and resetting to Guest.
   * After logout, no previous user's private account data remains active.
   */
  public async logout(): Promise<AuthUser> {
    const activeUserId = this.currentUser.id;

    if (this.currentUser && !this.currentUser.isGuest && !this.currentUser.isDemo && !activeUserId.startsWith('u-guest')) {
      try {
        await supabaseService.recordActivity({
          user_id: activeUserId,
          action_type: 'LOGOUT',
          title: 'Session Ended',
          description: `Logged out from ${this.currentUser.name} (${this.currentUser.handle})`,
          target_id: activeUserId,
          target_type: 'account',
        });
      } catch (err) {
        console.warn('[AuthService] Logout activity note:', err);
      }
    }

    try {
      await supabaseService.authSignOut();
    } catch (err) {
      console.warn('[AuthService] Supabase sign out note:', err);
    }

    // Reset current user to Guest
    this.currentUser = GUEST_USER;
    this.notifyListeners(GUEST_USER);
    return GUEST_USER;
  }

  /**
   * Switch to a curated demo account strictly for UI/development preview testing.
   * Does NOT count as a real authenticated Supabase account.
   */
  public switchDemoAccount(userId: string): AuthUser | null {
    const found = DEMO_USERS.find((u) => u.id === userId);
    if (found) {
      const demoUser = { ...found, isDemo: true };
      this.currentUser = demoUser;
      this.notifyListeners(demoUser);
      return demoUser;
    }
    return null;
  }

  /**
   * Update the user's active profile in memory and in Supabase (if real authenticated account).
   */
  public updateCurrentUserProfile(updatedUser: AuthUser): void {
    this.currentUser = updatedUser;
    this.notifyListeners(updatedUser);

    if (!updatedUser.isGuest && !updatedUser.isDemo && !updatedUser.id.startsWith('u-guest')) {
      supabaseService.syncUserProfile(updatedUser).catch((e) => {
        console.warn('[AuthService] Profile sync note:', e);
      });
    }
  }
}

export const authService = new AuthService();
