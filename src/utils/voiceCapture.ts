const PREFERRED_AUDIO_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

export function getSupportedAudioMimeType(
  isTypeSupported: (mimeType: string) => boolean
): string | null {
  return PREFERRED_AUDIO_MIME_TYPES.find((mimeType) => {
    try {
      return isTypeSupported(mimeType);
    } catch {
      return false;
    }
  }) || null;
}

export function getVoiceNoteExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('mp4')) return 'm4a';
  if (normalized.includes('ogg')) return 'ogg';
  return 'webm';
}

export function buildVoiceNoteStoragePath(
  userId: string,
  captureId: string,
  mimeType: string
): string {
  return `${userId}/${captureId}.${getVoiceNoteExtension(mimeType)}`;
}

export function buildVoiceNoteUploadFormData(
  audioBlob: Blob,
  captureId: string,
  userId: string,
): FormData {
  const mimeType = audioBlob.type || 'audio/webm';
  const extension = getVoiceNoteExtension(mimeType);
  const file = new File([audioBlob], `voice-note-${captureId}.${extension}`, { type: mimeType });
  const form = new FormData();
  form.append('file', file);
  form.append('captureId', captureId);
  form.append('userId', userId);
  return form;
}

