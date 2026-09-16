import { createClient } from '@supabase/supabase-js';

export const SUPABASE_PROJECT_ID = 'qodevcdrxxdvxckvqmot';
export const DEFAULT_SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;
export const DEFAULT_SUPABASE_ANON_KEY =
  'sb_publishable_8DHvOXKo_DgSooKfNrcqmw_oyVGfkre';

/**
 * Normalizes input so whether the environment passes:
 * - A project ID like 'qodevcdrxxdvxckvqmot'
 * - A bare hostname like 'qodevcdrxxdvxckvqmot.supabase.co'
 * - A full URL like 'https://qodevcdrxxdvxckvqmot.supabase.co'
 * it always resolves to a valid HTTP/HTTPS URL.
 */
function normalizeSupabaseUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return DEFAULT_SUPABASE_URL;
  }
  const trimmed = rawUrl.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) {
    return DEFAULT_SUPABASE_URL;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  // If only a project ID was provided (e.g. "qodevcdrxxdvxckvqmot")
  if (!trimmed.includes('.')) {
    return `https://${trimmed}.supabase.co`;
  }
  // If domain was provided without protocol (e.g. "qodevcdrxxdvxckvqmot.supabase.co")
  return `https://${trimmed}`;
}

export const SUPABASE_URL = normalizeSupabaseUrl(
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_SUPABASE_URL
    : process.env.VITE_SUPABASE_URL
);

export const SUPABASE_ANON_KEY = (
  (typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
    : process.env.VITE_SUPABASE_ANON_KEY) || DEFAULT_SUPABASE_ANON_KEY
)
  .trim()
  .replace(/^["']|["']$/g, '');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

