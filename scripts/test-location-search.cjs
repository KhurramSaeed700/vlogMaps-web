const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const modules = new Map()
function load(name) {
  const file = name.replace('@/', '')
  if (modules.has(file)) return modules.get(file)
  const result = { exports: {} }
  modules.set(file, result.exports)
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'require', code)(result.exports, load)
  return result.exports
}
const q = load('@/lib/location-search/query-utils')
const r = load('@/lib/location-search/ranking')
const result = (text, label = text, extra = {}) => ({ id: text, text, place_name: label, center: [13.431, 52.502], source: 'photon', ...extra })
let checks = 0
function check(name, fn) { fn(); checks++; console.log('PASS ' + name) }
function first(query, results, proximity = [13.431, 52.502]) { return r.sortResults(results, query, proximity, null, q.parseCopiedAddress(Array.isArray(query) ? query[0] : query).countryCode)[0] }
check('Berlin pasted address outranks unrelated 42/43 addresses', () => {
  const market = result('Markthalle Neun', 'Markthalle Neun, 42–43 Eisenbahnstraße, Kreuzberg, Berlin, 10997, Germany', { address: { street: 'Eisenbahnstraße', houseNumber: '42-43', postcode: '10997', place: 'Berlin', countryCode: 'de' } })
  const wrong = result('Limsdorfer Dorfstraße 43', 'Limsdorfer Dorfstraße 43, 15859 Storkow, Germany', { source: 'mapbox-structured', relevance: 1, address: { street: 'Limsdorfer Dorfstraße', houseNumber: '43', postcode: '15859', place: 'Storkow', countryCode: 'de' } })
  const query = 'Eisenbahnstraße 42/43, 10997 Berlin, Germany'
  assert.equal(first(query, [wrong, result('42'), market]).text, 'Markthalle Neun')
  assert.equal(first(q.getQueryVariants(q.createSearchContext(query, null, null)), [wrong, market]).text, 'Markthalle Neun')
  assert.equal(r.hasStrongTextMatch(query, [wrong]), false)
})
check('Unicode letters and essential vowel marks survive normalization', () => {
  for (const name of ['東京', '北京', 'لاہور', 'Москва', 'मुंबई', 'ঢাকা', 'กรุงเทพมหานคร', 'Αθήνα', '서울', 'ירושלים']) {
    assert.ok(q.normalizeSearchText(name).length > 0)
    assert.equal(first(name, [result('Unrelated'), result(name)]).text, name)
  }
  assert.equal(q.normalizeSearchText('मुंबई'), 'मुंबई')
  assert.equal(q.normalizeSearchText('Eisenbahnstraße'), q.normalizeSearchText('Eisenbahnstrasse'))
  assert.equal(q.normalizeSearchText('Łódź'), 'lodz')
  assert.equal(q.normalizeSearchText('São Paulo'), 'sao paulo')
  assert.equal(q.normalizeSearchText('١٢۳۴'), '1234')
})
check('CJK landmarks embedded in labels match', () => assert.equal(first('東京タワー', [result('東京駅'), result('東京タワー展望台')]).text, '東京タワー展望台'))
check('Exact distant names beat nearby provider-biased partial matches', () => {
  assert.equal(first('Paris', [result('Paris Cafe', 'Paris Cafe, Berlin', { source: 'mapbox-structured', relevance: 1 }), result('Paris', 'Paris, France', { center: [2.35, 48.86], feature_type: 'city' })]).text, 'Paris')
})
check('Explicit city and postcode disambiguate identical streets', () => {
  const correct = result('10 High Street', '10 High Street, Edinburgh, EH1 1QS, UK', { address: { street: 'High Street', houseNumber: '10', place: 'Edinburgh', postcode: 'EH1 1QS', countryCode: 'gb' } })
  const wrong = result('10 High Street', '10 High Street, London, SW1A 1AA, UK', { address: { street: 'High Street', houseNumber: '10', place: 'London', postcode: 'SW1A 1AA', countryCode: 'gb' } })
  assert.equal(first('10 High Street, Edinburgh EH1 1QS, UK', [wrong, correct]).place_name, correct.place_name)
})
check('Whole country names in multiple languages create explicit filters', () => {
  for (const [query, code] of [['Berlin, Deutschland', 'de'], ['Paris, France', 'fr'], ['東京, 日本', 'jp'], ['دبي, الإمارات العربية المتحدة', 'ae'], ['Gdańsk, Polska', 'pl']]) assert.equal(q.createSearchContext(query, null, null).countryCode, code)
  assert.equal(q.createSearchContext('Paris', [73.1, 33.6], null).countryCode, null)
  assert.equal(q.createSearchContext('Los Angeles, CA', null, null).countryCode, null)
  assert.equal(q.createSearchContext('Atlanta, Georgia', null, null).countryCode, null)
})
check('Postcodes are not building numbers, ranges or comma-separated countries', () => {
  const berlin = q.parseCopiedAddress('Eisenbahnstraße 42/43, 10997 Berlin, Germany')
  assert.equal(berlin.street, 'Eisenbahnstraße'); assert.equal(berlin.houseNumber, '42/43'); assert.equal(berlin.place, 'Berlin'); assert.equal(berlin.postcode, '10997')
  assert.equal(q.parseCopiedAddress('1600 Pennsylvania Avenue, Washington, USA').postcode, null)
  assert.equal(q.parseCopiedAddress('10 High Street, Edinburgh EH1 1QS, UK').postcode, 'EH1 1QS')
})
check('Misspellings and accents remain searchable without invented provider requests', () => {
  assert.equal(first('Gdansk', [result('Tugdan Airport'), result('Gdańsk', 'Gdańsk, Poland')]).text, 'Gdańsk')
  assert.equal(first('Eifel Tower', [result('Unrelated'), result('Eiffel Tower')]).text, 'Eiffel Tower')
  assert.ok(q.getQueryVariants(q.createSearchContext('Markthalle Neun, Berlin', null, null)).length <= 3)
})
check('Provider duplicates collapse but distant names stay distinct', () => {
  assert.equal(r.dedupeResults([result('Paris'), result('Paris', 'Paris, France', { center: [13.4311, 52.5021] }), result('Paris', 'Paris, Texas', { center: [-95.55, 33.66] })]).length, 2)
})
check('Coordinates still resolve without geocoding', () => {
  assert.deepEqual(q.getCoordinateSearchResult('52.502, 13.431').center, [13.431, 52.502])
  assert.equal(q.isValidCoordinate([190, 90]), false)
})
check('Named landmarks containing numbers are not mistaken for streets', () => {
  assert.equal(q.parseCopiedAddress('Taipei 101, Taipei, Taiwan').street, null)
  const address = q.parseCopiedAddress('Markthalle Neun, Eisenbahnstraße 42/43, 10997 Berlin, Germany')
  assert.equal(address.street, 'Eisenbahnstraße'); assert.equal(address.place, 'Berlin')
})
check('Street abbreviations and the screenshot typo rank the market first', () => {
  assert.equal(first('10 Main St, London', [result('43 Other Street', '43 Other Street, London'), result('10 Main Street', '10 Main Street, London')]).text, '10 Main Street')
  const market = result('Markthalle Neun', '42-43 Eisenbahnstraße, Berlin, 10997, Deutschland', { address: { street: 'Eisenbahnstraße', postcode: '10997', place: 'Berlin', houseNumber: '42-43', countryCode: 'DE' } })
  assert.equal(first('EisenbahnstraRe 42/43, 10997 Berlin, Germany.', [result('10997', '10997, Berlin, Germany'), market]).text, 'Markthalle Neun')
})
console.log(checks + ' location-search regression groups passed.')
