# Location Search Providers

The editor calls `app/api/location-search/route.ts`, and that route delegates to `search.ts`.

Provider-specific code is isolated here so the map UI does not care whether results come from Mapbox, OpenStreetMap, or a future Google provider.

- `providers/mapbox.ts`: Mapbox Geocoding v6, structured-address search, and Search Box forward fallback.
- `providers/openstreetmap.ts`: Photon autocomplete plus selective Nominatim fallback for complete/pasted addresses.
- `query-utils.ts`: copied-address parsing, Pakistan spelling variants, coordinate parsing, and search context creation.
- `ranking.ts`: result scoring, distance/country/local ranking, and dedupe.

If we migrate to Google later, add `providers/google.ts`, normalize its response into `LocationSearchResult`, and update `search.ts` to include or replace providers.
