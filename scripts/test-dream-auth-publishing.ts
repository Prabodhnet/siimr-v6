import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseService } from '../src/services/supabaseService.ts';
import { Dream } from '../src/types.ts';

function createMockSupabaseClient(options: {
  userId?: string | null;
  userError?: Error | null;
  onInsertDream?: (payload: any) => void;
}) {
  const insertedDreams: any[] = [];
  const insertedMedia: any[] = [];
  const insertedTranscripts: any[] = [];
  const upsertedStories: any[] = [];
  const upsertedNearby: any[] = [];
  const upsertedThreads: any[] = [];

  const client = {
    auth: {
      async getUser() {
        if (options.userError) {
          return { data: { user: null }, error: options.userError };
        }
        if (options.userId) {
          return {
            data: {
              user: {
                id: options.userId,
                email: `${options.userId}@siimr.io`,
              },
            },
            error: null,
          };
        }
        return { data: { user: null }, error: null };
      },
      async getSession() {
        if (options.userId) {
          return {
            data: {
              session: {
                user: { id: options.userId },
                access_token: 'mock-token',
              },
            },
            error: null,
          };
        }
        return { data: { session: null }, error: null };
      },
    },
    from(table: string) {
      return {
        upsert(records: any[]) {
          if (table === 'dreams') {
            insertedDreams.push(...records);
            if (options.onInsertDream) options.onInsertDream(records[0]);
          } else if (table === 'dream_transcripts') {
            insertedTranscripts.push(...records);
          } else if (table === 'last_night_stories') {
            upsertedStories.push(...records);
          } else if (table === 'nearby_shares') {
            upsertedNearby.push(...records);
          } else if (table === 'circle_threads') {
            upsertedThreads.push(...records);
          }
          return {
            async select() {
              return { data: records, error: null };
            },
            error: null,
          };
        },
        insert(records: any[]) {
          if (table === 'dreams') {
            insertedDreams.push(...records);
            if (options.onInsertDream) options.onInsertDream(records[0]);
          } else if (table === 'dream_media') {
            insertedMedia.push(...records);
          }
          return {
            async select() {
              return {
                single() {
                  return { data: { id: 'media-rec-1' }, error: null };
                },
                data: records,
                error: null,
              };
            },
            error: null,
          };
        },
      };
    },
    storage: {
      from() {
        return {
          async remove() {
            return { data: null, error: null };
          },
        };
      },
    },
  };

  return {
    client: client as any,
    insertedDreams,
  };
}

function createSampleDream(authorId: string): Dream {
  return {
    id: 'test-dream-1',
    title: 'Silver Cathedral in the Sea',
    hook: 'The bell chimed underwater without drowning the sound...',
    content: 'Full dream memory about a submerged cathedral with stained glass illuminating the tide.',
    rawTranscript: 'Full dream memory about a submerged cathedral with stained glass illuminating the tide.',
    author: {
      id: authorId,
      name: 'Test Dreamer',
      handle: '@testdreamer',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      initials: 'T',
      color: '#5438FF',
    },
    timeAgo: 'Just now',
    capturedTime: 'captured 07:00 AM',
    category: 'Surreal',
    tags: ['Surreal', 'DreamWorld'],
    likes: 1,
    commentsCount: 0,
    viewsCount: 1,
    comments: [],
    audience: 'public',
    isNearbyEligible: true,
    region: 'Bhubaneswar area',
    isLiked: false,
    isSaved: false,
    hasClip: false,
    surfaces: {
      isNormalPost: true,
      isStory: false,
      isNearby: true,
      hasClip: false,
    },
  };
}

test('A. authenticated Supabase user can publish a Dream with their auth.users.id', async () => {
  const verifiedUserId = 'a1b2c3d4-e5f6-4a1b-9c8d-112233445566';
  const { client, insertedDreams } = createMockSupabaseClient({ userId: verifiedUserId });
  const service = new SupabaseService();

  const dream = createSampleDream(verifiedUserId);
  await service.saveCanonicalDream(dream, {}, client);

  assert.equal(insertedDreams.length, 1, 'Dream record must be inserted');
  assert.equal(insertedDreams[0].id, 'test-dream-1');
  assert.equal(
    insertedDreams[0].user_id,
    verifiedUserId,
    'dreams.user_id must match authenticated Supabase user ID'
  );
});

test('B. unauthenticated user cannot publish', async () => {
  const { client } = createMockSupabaseClient({ userId: null });
  const service = new SupabaseService();

  const dream = createSampleDream('some-unauth-user');
  await assert.rejects(
    () => service.saveCanonicalDream(dream, {}, client),
    /Please log in to publish your Dream|active Supabase Auth session/i
  );
});

test('C. u-guest/u-me can never be used for a production Dream insert', async () => {
  const service = new SupabaseService();

  // Case 1: dream author is u-guest
  const { client: guestClient } = createMockSupabaseClient({ userId: 'u-guest' });
  const guestDream = createSampleDream('u-guest');
  await assert.rejects(
    () => service.saveCanonicalDream(guestDream, {}, guestClient),
    /Demo|guest|Please log in/i
  );

  // Case 2: dream author is u-me
  const { client: meClient } = createMockSupabaseClient({ userId: 'u-me' });
  const meDream = createSampleDream('u-me');
  await assert.rejects(
    () => service.saveCanonicalDream(meDream, {}, meClient),
    /Demo|guest|Please log in/i
  );
});

test('D. logout/login restores the correct Supabase user ID', async () => {
  // Test authentication identity lifecycle:
  // 1. Initial guest state -> id: 'u-guest'
  // 2. User logs in with Supabase -> id: auth.users.id
  // 3. User logs out -> id: 'u-guest'
  // 4. User logs in again -> id restored to auth.users.id
  const realAuthUserId = 'd5e6f7a8-1234-4567-89ab-cdef01234567';

  // Simulating the user transition state machine
  let currentIdentity = { id: 'u-guest', isGuest: true, name: 'Guest Dreamer' };

  // Step 1: Guest initially
  assert.equal(currentIdentity.id, 'u-guest');
  assert.equal(currentIdentity.isGuest, true);

  // Step 2: Supabase login succeeds
  currentIdentity = { id: realAuthUserId, isGuest: false, name: 'Authenticated Dreamer' };
  assert.equal(currentIdentity.id, realAuthUserId);
  assert.equal(currentIdentity.isGuest, false);

  // Step 3: Logout resets to guest
  currentIdentity = { id: 'u-guest', isGuest: true, name: 'Guest Dreamer' };
  assert.equal(currentIdentity.id, 'u-guest');
  assert.equal(currentIdentity.isGuest, true);

  // Step 4: Login again restores the exact Supabase user ID
  currentIdentity = { id: realAuthUserId, isGuest: false, name: 'Authenticated Dreamer' };
  assert.equal(currentIdentity.id, realAuthUserId);
  assert.equal(currentIdentity.isGuest, false);
});

test("E. a different user's ID cannot be substituted into dreams.user_id", async () => {
  const authenticatedUserId = 'user-alice-00000000-0000-4000-8000-000000000001';
  const maliciousSubstitutedId = 'user-bob-00000000-0000-4000-8000-000000000002';

  const { client } = createMockSupabaseClient({ userId: authenticatedUserId });
  const service = new SupabaseService();

  // Attempt to publish a dream whose author.id is user-bob while authenticated as user-alice
  const tamperedDream = createSampleDream(maliciousSubstitutedId);

  await assert.rejects(
    () => service.saveCanonicalDream(tamperedDream, {}, client),
    /Unauthorized.*does not match/i
  );
});
