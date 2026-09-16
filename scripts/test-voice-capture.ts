import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVoiceNoteStoragePath,
  getSupportedAudioMimeType,
  getVoiceNoteExtension,
} from '../src/utils/voiceCapture.ts';

test('builds an owner-scoped voice-note storage path', () => {
  const path = buildVoiceNoteStoragePath('user-123', 'capture-456', 'audio/webm');
  assert.equal(path, 'user-123/capture-456.webm');
});

test('maps supported audio MIME types to stable extensions', () => {
  assert.equal(getVoiceNoteExtension('audio/webm;codecs=opus'), 'webm');
  assert.equal(getVoiceNoteExtension('audio/mp4'), 'm4a');
  assert.equal(getVoiceNoteExtension('audio/ogg;codecs=opus'), 'ogg');
});

test('selects the first browser-supported recording format', () => {
  const mime = getSupportedAudioMimeType((value) => value === 'audio/webm;codecs=opus');
  assert.equal(mime, 'audio/webm;codecs=opus');
});

test('returns null when no preferred recording format is supported', () => {
  const mime = getSupportedAudioMimeType(() => false);
  assert.equal(mime, null);
});
