import type { SupabaseClient } from '@supabase/supabase-js';

export const DREAM_MEDIA_BUCKET = 'dream-media';

function createUniqueToken(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeFilename(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() || 'dream-media';
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'dream-media';
}

export function buildDreamMediaStoragePath(
  userId: string,
  dreamId: string,
  fileName: string
): string {
  if (!userId || !dreamId) {
    throw new Error('Dream media requires a user ID and Dream ID');
  }

  if (/[\\/]/.test(userId) || /[\\/]/.test(dreamId)) {
    throw new Error('Invalid Dream media ownership path');
  }

  return `${userId}/${dreamId}/${createUniqueToken()}-${safeFilename(fileName)}`;
}

export async function uploadDreamMedia(
  client: SupabaseClient,
  userId: string,
  dreamId: string,
  file: File
): Promise<{ path: string; mimeType: string; mediaType: 'image' | 'video' }> {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  if (!isImage && !isVideo) {
    throw new Error('Only image and video files can be attached to Dreams');
  }

  const path = buildDreamMediaStoragePath(userId, dreamId, file.name);
  const mediaType = isVideo ? 'video' : 'image';

  const { error } = await client.storage
    .from(DREAM_MEDIA_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) {
    throw new Error(`Dream media upload failed: ${error.message}`);
  }

  return {
    path,
    mimeType: file.type,
    mediaType,
  };
}
