# Location Search Providers

The editor calls `app/api/location-search/route.ts`, and that route delegates to `search.ts`.

Provider-specific code is isolated here so the map UI does not care whether results come from Mapbox, OpenStreetMap, or a future Google provider.

- `providers/mapbox.ts`: Mapbox Geocoding v6, structured-address search, and Search Box forward fallback.
- `providers/openstreetmap.ts`: Photon autocomplete plus selective Nominatim fallback for complete/pasted addresses.
- `query-utils.ts`: Unicode-preserving normalization, copied-address parsing, coordinates, bounded query variants, and search context. Accents/ß/Ł and Arabic/Persian digits are normalized without deleting other writing systems.
- `countries.ts`: ICU-localized country names and conservative explicit country detection. Viewport proximity never forces a country restriction.
- `ranking.ts`: original-query matching plus street/building/postcode/city/country checks; provider and proximity only break close relevance matches. Numeric tokens never fuzzy-match other numbers. Fallback variants retrieve candidates but never replace the original ranking query.

Provider address metadata is kept alongside labels so a conflicting postcode/city is penalized rather than overridden by a provider bonus. If a strong match exists, unrelated low-text-match suggestions are omitted. Multi-provider duplicates are removed without merging distant same-name places.

Mapbox Geocoding requests exclude unsupported `poi` types; Search Box supplies POIs. Providers run concurrently, and a Mapbox configuration failure does not prevent OpenStreetMap results. Fallback is limited to two variants per provider; invented typo spellings are not sent to multiple APIs.

The public `nominatim.openstreetmap.org` service is **not used** for this autocomplete workflow ([usage policy](https://operations.osmfoundation.org/policies/nominatim/)). Optional `LOCATION_SEARCH_NOMINATIM_URL` can point to a self-hosted/contracted `/search` endpoint whose usage terms permit autocomplete. No new credentials are needed for the existing Mapbox/Photon path. Photon public service capacity and provider coverage still limit production scale; use a contracted/self-hosted service for sustained volume.

Tests: `node scripts/test-location-search.cjs` and `node scripts/test-location-search-providers.cjs`. These cover ranking, provider request contracts, accents, several non-Latin scripts, address ranges, the Berlin screenshot typo, country/city disambiguation, number-bearing POI names, duplicates, and provider failure isolation.

This is not a universal geocoder: transliterations/translated names and places absent from provider indexes cannot always be resolved. Preserve the Google Maps search link as a manual fallback. No ranking algorithm can guarantee Google Maps' coverage.

If we migrate to Google later, add `providers/google.ts`, normalize its response into `LocationSearchResult`, and update `search.ts` to include or replace providers.
