import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DREAM_MEDIA_BUCKET, uploadDreamMedia } from '../src/services/dreamMediaUpload.ts';

test('uploads Dream media to an owner-scoped path in the private dream-media bucket', async () => {
  const calls: Array<{ bucket: string; path: string; file: File; options: Record<string, unknown> }> = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, file: File, options: Record<string, unknown>) {
            calls.push({ bucket, path, file, options });
            return { data: { path }, error: null };
          },
        };
      },
    },
  } as any;

  const file = new File(['dream'], 'floating-city.png', { type: 'image/png' });
  const result = await uploadDreamMedia(client, 'user-123', 'dream-456', file);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].bucket, DREAM_MEDIA_BUCKET);
  assert.match(calls[0].path, /^user-123\/dream-456\/[a-z0-9-]+-floating-city\.png$/);
  assert.equal(calls[0].options.upsert, false);
  assert.equal(calls[0].options.contentType, 'image/png');
  assert.equal(result.path, calls[0].path);
});

test('rejects unsupported Dream media types before uploading', async () => {
  let uploadCalled = false;
  const client = {
    storage: {
      from() {
        return {
          async upload() {
            uploadCalled = true;
            return { data: null, error: null };
          },
        };
      },
    },
  } as any;

  const file = new File(['text'], 'notes.txt', { type: 'text/plain' });

  await assert.rejects(
    () => uploadDreamMedia(client, 'user-123', 'dream-456', file),
    /Only image and video files can be attached to Dreams/
  );
  assert.equal(uploadCalled, false);
});
