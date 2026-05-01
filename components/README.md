# Component Structure

Components are grouped by ownership instead of living in one flat folder.

- `app-shell/`: Shared layout and brand chrome used across route groups.
- `auth/`: Clerk/auth loading and guard wrappers.
- `creator/`: Creator dashboard/editor/workspace features.
- `home/`: Entry page experience and home catalog UI.
- `maps/`: Mapbox-based map surfaces and map previews.
- `media/`: Media player primitives shared across features.
- `viewer/`: Watch/viewer page experience.
- `ui/`: Reusable design-system primitives.

Prefer adding new feature-specific components to the closest feature folder. Keep `ui/` for small reusable primitives only.
