const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const cache = new Map()
const mocks = { 'server-only': {}, '@/lib/mapbox-server': { getServerMapboxAccessToken: () => 'test-token' } }
function load(name) {
  if (name in mocks) return mocks[name]
  if (cache.has(name)) return cache.get(name)
  const exports = {}
  cache.set(name, exports)
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', name.replace('@/', '') + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'require', code)(exports, load)
  return exports
}
const requests = []
mocks['@/lib/location-search/providers/fetch-json'] = { fetchLocationSearchJson: async (url) => {
  requests.push(url)
  if (url.hostname.includes('mapbox')) return { features: [{ geometry: { coordinates: [13.43149, 52.50216] }, properties: {
    name: 'Eisenbahnstraße 42/43', full_address: 'Eisenbahnstraße 42/43, 10997 Berlin, Germany', feature_type: 'address',
    context: { street: { name: 'Eisenbahnstraße' }, address: { address_number: '42/43' }, postcode: { name: '10997' }, place: { name: 'Berlin' }, country: { country_code: 'DE' } },
  } }] }
  return { features: [] }
} }
async function run() {
  const q = load('@/lib/location-search/query-utils')
  const mapbox = load('@/lib/location-search/providers/mapbox')
  const osm = load('@/lib/location-search/providers/openstreetmap')
  const context = q.createSearchContext('Eisenbahnstraße 42/43, 10997 Berlin, Germany', [74, 31], null)
  const results = await mapbox.fetchPrimaryMapboxResults(context)
  assert.equal(results.length, 3)
  assert.equal(results[0].address.postcode, '10997')
  for (const url of requests) {
    assert.equal(url.searchParams.get('country'), 'DE')
    assert.equal(url.searchParams.has('proximity'), false, 'explicit city must not be biased to current viewport')
    if (url.pathname.includes('/geocode/')) assert.equal(url.searchParams.get('types').split(',').includes('poi'), false)
  }
  const structured = requests.find(url => url.searchParams.has('street'))
  assert.equal(structured.searchParams.get('street'), 'Eisenbahnstraße')
  assert.equal(structured.searchParams.get('place'), 'Berlin')
  assert.equal(structured.searchParams.get('address_number'), '42/43')
  assert.equal(structured.searchParams.get('autocomplete'), 'false')
  requests.length = 0
  const previous = process.env.LOCATION_SEARCH_NOMINATIM_URL
  delete process.env.LOCATION_SEARCH_NOMINATIM_URL
  try {
    await osm.fetchPrimaryOpenStreetMapResults(context)
    await osm.fetchFallbackOpenStreetMapResults(context)
    assert.ok(requests.every(url => url.hostname === 'photon.komoot.io'))
    assert.ok(requests.every(url => !url.searchParams.has('lang')), 'must not force all names into English')
    requests.length = 0
    await mapbox.fetchFallbackMapboxResults(context)
    assert.ok(requests.length <= 4, 'fallback query fan-out must stay bounded')
  } finally {
    if (previous === undefined) delete process.env.LOCATION_SEARCH_NOMINATIM_URL
    else process.env.LOCATION_SEARCH_NOMINATIM_URL = previous
  }
  // A missing Mapbox token must not take the other providers down.
  mocks['@/lib/location-search/providers/mapbox'] = { fetchPrimaryMapboxResults: async () => { throw new Error('missing token') }, fetchFallbackMapboxResults: async () => [] }
  mocks['@/lib/location-search/providers/openstreetmap'] = { fetchPrimaryOpenStreetMapResults: async () => [{ id: 'tokyo', text: '東京', place_name: '東京, 日本', source: 'photon', center: [139.7, 35.7], feature_type: 'city' }], fetchFallbackOpenStreetMapResults: async () => [] }
  const search = load('@/lib/location-search/search')
  assert.equal((await search.searchLocations('東京', null, null))[0].text, '東京')
  console.log('Provider contracts passed: valid API parameters, structured addresses, metadata, global search, native labels, bounded fallback, public Nominatim disabled, provider failure isolation.')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
