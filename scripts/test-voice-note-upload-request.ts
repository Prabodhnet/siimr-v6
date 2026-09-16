import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVoiceNoteUploadFormData } from '../src/utils/voiceCapture.ts';

test('builds a multipart voice-note upload request without requiring Supabase auth', async () => {
  const audio = new Blob(['audio-bytes'], { type: 'audio/webm' });
  const form = buildVoiceNoteUploadFormData(audio, 'capture-123', 'u-me');

  assert.equal(form.get('captureId'), 'capture-123');
  assert.equal(form.get('userId'), 'u-me');
  const file = form.get('file');
  assert.ok(file instanceof Blob);
  assert.equal((file as Blob).type, 'audio/webm');
});
