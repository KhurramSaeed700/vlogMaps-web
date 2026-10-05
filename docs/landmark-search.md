# Video landmark search

The small scan button to the right of Flight pauses playback and starts video-frame capture directly. There is no keyboard shortcut or modal dialog.

1. Share **this editor tab** in the browser's required permission prompt. Capture Handle verifies the tab identity; other tabs, windows, and entire screens are rejected without uploading. Browsers without Capture Handle support can use the cropped screenshot upload fallback in the map overlay.
2. Only pixels inside the fully visible video preview are cropped and sent to Google Vision, not the surrounding map, timestamps, or browser chrome. Sharing stops immediately after capture. A partially offscreen video is rejected.
3. Google Cloud Vision returns up to five landmark candidates. These appear in a non-modal overlay over the map. Every result requires a user choice, even a single strong match. No fake alternatives are generated if Google only returns one result. Scores are model scores, not guaranteed probabilities.
4. Clicking a candidate puts its name in the map search bar and searches with proximity bias to Google's detected coordinates. A nearby matching place receives an orange marker; if no nearby match is found or search fails, Google's coordinates are shown with a verification warning. **Q** adds a point there, **W** starts a stop there. No timestamp or trip endpoint is changed by recognition itself. Existing Clear marker / Shift+Delete behavior applies.
5. If no match is found, download the screenshot and upload it manually to Google Lens. Return and search the identified name on the map with **/**. This is not a Google Lens API integration.

## Server setup

Enable Google Cloud Vision API on a billing-enabled Google Cloud project. Create an API key restricted to Cloud Vision API and store it as **GOOGLE_CLOUD_VISION_API_KEY** in the server environment (never NEXT_PUBLIC). Restart the dev server after setting it. No key has been provisioned by this feature.

Only approved creators can call `/api/creator/landmark-search`. The endpoint accepts a JPEG data URL, with a maximum request size of 3 MB, and uses only LANDMARK_DETECTION. Images are resized client-side to at most 1280 pixels. No screenshot is saved by the app server; only image hashes and results are cached for one hour (100 entries per process). Google receives the submitted frame.

An instance-local limit allows 20 uncached requests per creator per hour. This is not a global billing cap: multiple instances or restarts reset it. Configure project-wide Google Cloud quotas for a hard usage guardrail; billing budget alerts alone do not stop spending. Recognition requires a network connection and does not identify every landmark or shop.

## Verification

Test that R does not trigger capture, button capture, tab-sharing cancellation, window rejection, upload, close during recognition, missing API key, unclear/no-result images, candidate selection, and a real known-landmark image with an authorized account and configured key. Verify the orange marker can be cleared and Q/W use its exact coordinates. Capture requires HTTPS or localhost and a browser supporting tab capture.
