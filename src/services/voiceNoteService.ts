import { supabase } from './supabase';
import { auth } from './firebase';
import { buildVoiceNoteStoragePath, buildVoiceNoteUploadFormData } from '../utils/voiceCapture';

export const VOICE_NOTES_BUCKET = 'voice-notes';

/**
 * Preserves the real microphone recording for the MVP/demo.
 * Transcription is intentionally not required yet, so SIIMR does not depend
 * on a paid transcription provider or an API key.
 */
export async function saveVoiceNote(
  audioBlob: Blob,
  userId: string,
  captureId: string,
): Promise<{ path: string }> {
  if (!audioBlob.size) {
    throw new Error('No audio was captured. Please try again.');
  }
  if (!userId || userId.startsWith('u-guest')) {
    throw new Error('Sign in to preserve a voice Dream.');
  }

  const form = buildVoiceNoteUploadFormData(audioBlob, captureId, userId);
  const firebaseUser = auth.currentUser;
  if (firebaseUser) {
    const firebaseIdToken = await firebaseUser.getIdToken();
    form.append('firebaseIdToken', firebaseIdToken);
  }

  const { data, error } = await supabase.functions.invoke('save-voice-note', {
    body: form,
  });

  if (error) {
    throw new Error(`Voice recording could not be saved: ${error.message}`);
  }

  const path = typeof data?.path === 'string' ? data.path.trim() : '';
  if (!path) {
    throw new Error('Voice recording was captured but could not be preserved.');
  }

  return { path };
}

export function getVoiceNotePath(userId: string, captureId: string, mimeType: string): string {
  return buildVoiceNoteStoragePath(userId, captureId, mimeType);
}
