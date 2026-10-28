# Illustrative flight routing

Reviewed 2026-10-28. With airport endpoints but no flight number, airline or departure date, use the shortest great-circle arc. Do not force ocean corridors or claim this is a recorded flight track. Watch, Edit, previews and live tracking use the same shared generator. Existing cached flight legs are regenerated from their endpoints by the map normalizers.

Research examples:

- [Flightradar24's own flight-path analysis](https://www.flightradar24.com/blog/aviation-explainer-series/flight-paths-and-great-circles-why-are-great-circles-the-shortest-flight-path/) compares Chicago–Dubai with its great circle, New York–Los Angeles airway routing, and North Atlantic ocean tracks. Great circles are the shortest spherical baseline; airways can introduce deviations.
- [FAA polar operations guidance](https://www.faa.gov/sites/faa.gov/files/2022-11/Polar_Route_Operations.pdf) documents routine North America–Asia polar operations and their operational requirements. Polar travel is not categorically avoided.
- [Finnair's Helsinki–Tokyo planning account](https://www.finnair.com/de-en/bluewings/world-of-finnair/flying-over-the-north-pole--well-planned-is-half-done--2557944) describes a northern route via Svalbard, the North Pole and Alaska, planned around unavailable airspace. A geometrically shortest route is not necessarily an airline's usable route.
- [Airservices Australia's Perth–London account](https://www.airservicesaustralia.com/airservices-helps-history-making-perth-to-london-flight-take-to-the-skies/) describes user-preferred routing based on winds, turbulence, temperature and aircraft performance.
- [Flightradar24's observed QF28 Santiago–Sydney flight](https://www.flightradar24.com/blog/flight-tracking-news/qantas-qf28-antarctica/) went farther south than usual to avoid headwinds. A longer ground track can be faster or more fuel-efficient.

These examples support a shortest-distance illustration rather than a static database pretending to predict actual flight tracks. Actual routing requires flight-specific observations or plans. Airport connections remain separate flight legs; this policy does not invent nonstop service or change ground-road routing.

`node scripts/test-ocean-flight-routes.cjs` now checks shortest routing rather than the former ocean preference. Its 19 cases cover Asia–North America, Atlantic, Southern Hemisphere, Europe–Asia, regional, coincident and antipodal endpoints. The rendering tests retain polar clipping and date-line splitting, without altering the real route coordinates used for timing and traveler motion. Geometry remains bounded to 129 vertices per flight and does not add per-frame work or network requests.
