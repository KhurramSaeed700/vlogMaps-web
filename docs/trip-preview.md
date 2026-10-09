# Complete-trip preview

Watch and editor maps estimate overview time using `lib/trip-preview.ts`: route distance and the number of timestamp destinations increase the preview duration. Small trips take about 10 seconds; complex routes can take longer than 20 seconds. The estimate is bounded at 49.2 seconds, while a slow watch animation can take longer because completion—not that estimate—controls the handoff.

The watch map fits the entire route and all marker locations, keeps timestamp markers visible, animates the journey, then shows its completed route for three seconds. Automatic tracking is scheduled only after the final animation frame. Hidden tabs and temporarily unavailable camera viewports pause animation progress. The button's countdown is a visual estimate, not a trigger.

During the intro, playback synchronization and queued follow frames cannot take camera ownership. The preview waits for route resolution before starting. If the detailed style arrives after the fallback style, it refits/restarts the full overview instead of restoring the old traveler close-up. A canceled preview preserves manual camera control.

The editor shows the complete saved route in a zoomed-out overview for the adaptive duration. Updated route data refreshes the overview, and newly loaded timestamps restart/extend the wait. Its CSS countdown cannot start tracking prematurely.

On either page, Start Tracking can skip the preview. Manual map interaction cancels automatic tracking. Normal playback camera loops and post-landing following remain unchanged.

Run `node scripts/test-map-intro.cjs` for timing policy and fake-clock checks of completion, hidden-tab pausing, final-route holding and cancellation.
