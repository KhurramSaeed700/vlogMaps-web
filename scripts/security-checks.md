# Security Checks

Run these against a local or deployed environment with real Clerk sessions.

## Creator API authorization

- Signed-out requests to `/api/creator/videos`, `/api/creator/videos/{videoId}`, and `/api/creator/video-state/{videoId}` must return `401`.
- Signed-in users without an approved creator database record must receive `403` from creator APIs.
- Approved creators must be able to list, create, update, and delete only their own creator videos.

## Ownership isolation

- Create or identify a video owned by Creator A.
- As Creator B, POST `/api/creator/videos` with `video.id` set to Creator A's video id.
- Expected result: `409`, and Creator A's video record remains unchanged.

## Catalog/shared state

- Identify a database video whose `owner_user_id` is `catalog`.
- As a normal creator, PUT `/api/creator/video-state/{catalogVideoId}`.
- Expected result: `403`; the catalog `video_editor_states` row is not created or modified.

## Payload validation

- POST `/api/creator/videos` with an invalid `youtubeId`, for example `not-a-video`.
- Expected result: `400`.
- PUT `/api/creator/video-state/{videoId}` with more than 300 points or more than 2500 route-shape points.
- Expected result: `400`.
- Send creator video or state JSON with `Content-Length` greater than the route limit.
- Expected result: `413`.

## Public proxy APIs

- `/api/youtube/video/not-a-video` must return `400`.
- `/api/location-search?q=` plus a query longer than 120 characters must return `400`.
- `/api/location-search?proximity=999,999&q=test` must return `400`.
- `/api/mapbox/directions` with invalid coordinates must return `400`.
- Repeated calls beyond each route's per-minute IP limit must return `429` with `Retry-After`.
