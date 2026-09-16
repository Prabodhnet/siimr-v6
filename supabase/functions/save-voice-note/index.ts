import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('mp4')) return 'm4a';
  if (normalized.includes('ogg')) return 'ogg';
  return 'webm';
}

function isSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase function configuration is incomplete.' }, 500);

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const userId = typeof form?.get('userId') === 'string' ? String(form?.get('userId')) : '';
  const firebaseIdToken = typeof form?.get('firebaseIdToken') === 'string' ? String(form?.get('firebaseIdToken')) : '';
  const captureId = typeof form?.get('captureId') === 'string' ? String(form?.get('captureId')) : '';

  if (!(file instanceof File) || !file.size) return json({ error: 'Audio recording is required.' }, 400);
  if (file.size > 15 * 1024 * 1024) return json({ error: 'Voice recording is too large. Please keep it under 15 MB.' }, 413);
  if (!isSafeSegment(userId) || !isSafeSegment(captureId)) return json({ error: 'Invalid voice recording identity.' }, 400);

  // SIIMR currently authenticates through Firebase while Supabase owns storage.
  // Verify Firebase users server-side when a Firebase ID token is available.
  // The built-in demo profile remains supported for local MVP/demo use.
  if (firebaseIdToken) {
    const firebaseApiKey = Deno.env.get('FIREBASE_WEB_API_KEY');
    if (!firebaseApiKey) return json({ error: 'Firebase voice authentication is not configured.' }, 500);
    const verifyResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: firebaseIdToken }),
    });
    const verification = await verifyResponse.json().catch(() => null);
    const verifiedUid = verification?.users?.[0]?.localId;
    if (!verifyResponse.ok || verifiedUid !== userId) {
      return json({ error: 'Voice recording authentication failed.' }, 401);
    }
  } else if (userId !== 'u-me') {
    return json({ error: 'Please sign in before preserving a voice Dream.' }, 401);
  }

  const mimeType = file.type || 'audio/webm';
  if (!mimeType.startsWith('audio/')) return json({ error: 'Only audio recordings are accepted.' }, 415);

  const extension = extensionForMimeType(mimeType);
  const path = `${userId}/${captureId}.${extension}`;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { error: uploadError } = await adminClient.storage
    .from('voice-notes')
    .upload(path, file, {
      cacheControl: '3600',
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error('[save-voice-note] Storage upload error:', uploadError.message);
    return json({ error: 'Could not preserve the voice recording.' }, 500);
  }

  return json({ path });
});
