-- SIIMR voice-note storage policies
-- Bucket `voice-notes` is private. Files are owner-scoped by their first path segment.

DROP POLICY IF EXISTS "Voice notes owner upload" ON storage.objects;
CREATE POLICY "Voice notes owner upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voice-notes'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Voice notes owner read" ON storage.objects;
CREATE POLICY "Voice notes owner read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Voice notes owner delete" ON storage.objects;
CREATE POLICY "Voice notes owner delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);
