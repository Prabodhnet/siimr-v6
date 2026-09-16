<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/88e60175-9d1b-4a1e-a903-209385adecb3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Voice capture setup

SIIMR voice capture records microphone audio with `MediaRecorder`. For the current MVP/demo, the recording is preserved as a real audio file in the private `voice-notes` bucket. **Transcription is intentionally not required yet**, so the demo does not depend on a paid transcription API or billing card.

### Supabase setup

1. Keep the existing private `voice-notes` bucket and its owner policies.
2. The browser does not upload directly to `voice-notes`; the `save-voice-note` Edge Function performs the storage upload server-side.
3. From the project root, deploy the function:

```powershell
supabase functions deploy save-voice-note --use-api
```

4. No `OPENAI_API_KEY` is needed.
5. For real Firebase-authenticated users, keep `FIREBASE_WEB_API_KEY` configured in Supabase Edge Function secrets. The built-in `u-me` demo profile does not require it.

After recording, SIIMR opens the normal Dream review form. The user types or edits the dream transcript there before publishing. The real voice recording path is saved with the canonical Dream.
