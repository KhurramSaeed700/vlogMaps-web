const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')
const root = path.resolve(__dirname, '..')

function load(file, dependencies, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: (id) => dependencies[id] ?? require(id),
    Buffer, Request, Response, AbortSignal, ...globals })
  return exports
}
const { parseLandmarkResults } = load('lib/landmark-search.ts', {})
const { getVideoFrameCrop } = load('lib/video-frame-crop.ts', {})
assert.deepEqual(JSON.parse(JSON.stringify(getVideoFrameCrop({ left: 10, top: 80, width: 800, height: 450 }, 1600, 900, 3200, 1800))),
  { x: 20, y: 160, sourceWidth: 1600, sourceHeight: 900, width: 800, height: 450 })
assert.equal(getVideoFrameCrop({ left: 0, top: -10, width: 800, height: 450 }, 1600, 900, 1600, 900), null)
assert.equal(getVideoFrameCrop({ left: 1000, top: 0, width: 800, height: 450 }, 1600, 900, 1600, 900), null)
assert.equal(getVideoFrameCrop({ left: 0, top: 0, width: 2000, height: 1125 }, 2400, 1400, 2400, 1400).width, 1280)
const annotation = (name, score, lat = 48.8584, lng = 2.2945) => ({
  description: name, score, locations: [{ latLng: { latitude: lat, longitude: lng } }],
})
assert.equal(parseLandmarkResults(null).length, 0)
assert.equal(parseLandmarkResults([annotation('Weak', 0.1), annotation('Bad', 0.9, 100), {}]).length, 0)
assert.equal(parseLandmarkResults([annotation('Second', 0.7), annotation('First', 0.95)])[0].name, 'First')
assert.equal(parseLandmarkResults([annotation('Zero', 0.9, 0, 0)])[0].lat, 0)

class CreatorAuthorizationError extends Error { constructor(status, message) { super(message); this.status = status } }
const environment = { GOOGLE_CLOUD_VISION_API_KEY: 'test-key-not-real' }
let authorized = true
let fetchCount = 0
let upstream = { responses: [{ landmarkAnnotations: [annotation('Eiffel Tower', 0.95)] }] }
let upstreamStatus = 200
const { POST } = load('app/api/creator/landmark-search/route.ts', {
  '@/lib/server-creator-auth': { CreatorAuthorizationError, requireApprovedCreator: async () => {
    if (!authorized) throw new CreatorAuthorizationError(401, 'Unauthorized')
    return { userId: 'test-user' }
  } },
  '@/lib/landmark-search': { parseLandmarkResults },
}, { process: { env: environment }, fetch: async (url, options) => {
  fetchCount++
  assert.equal(url, 'https://vision.googleapis.com/v1/images:annotate')
  assert.equal(options.headers['X-Goog-Api-Key'], 'test-key-not-real')
  assert.equal(JSON.parse(options.body).requests[0].features[0].type, 'LANDMARK_DETECTION')
  return Response.json(upstream, { status: upstreamStatus })
} })
const request = (body, headers = {}) => new Request('http://localhost/api/creator/landmark-search', { method: 'POST', headers, body })
const jpeg = (id) => `data:image/jpeg;base64,${Buffer.from([255, 216, 255, id]).toString('base64')}`
const imageRequest = (id) => request(JSON.stringify({ image: jpeg(id) }))

async function run() {
  authorized = false
  assert.equal((await POST(imageRequest(0))).status, 401)
  authorized = true
  delete environment.GOOGLE_CLOUD_VISION_API_KEY
  assert.equal((await POST(imageRequest(0))).status, 503)
  environment.GOOGLE_CLOUD_VISION_API_KEY = 'test-key-not-real'
  assert.equal((await POST(request('bad JSON'))).status, 400)
  assert.equal((await POST(request(JSON.stringify({ image: 'https://external.example/image.jpg' })))).status, 400)
  assert.equal((await POST(request('x', { 'content-length': '3000001' }))).status, 413)
  assert.equal((await POST(request('x'.repeat(3000001)))).status, 413)
  const result = await POST(imageRequest(0))
  assert.equal(result.status, 200)
  assert.equal((await result.json()).results[0].name, 'Eiffel Tower')
  await POST(imageRequest(0))
  assert.equal(fetchCount, 1, 'identical frame should be cached')
  upstream = { responses: [{}] }
  assert.equal((await (await POST(imageRequest(1))).json()).results.length, 0)
  upstream = { responses: [{ error: { message: 'invalid' } }] }
  assert.equal((await POST(imageRequest(2))).status, 502)
  upstreamStatus = 403
  assert.equal((await POST(imageRequest(3))).status, 502)
  upstreamStatus = 200
  upstream = { responses: [{}] }
  for (let i = 4; i < 20; i++) assert.equal((await POST(imageRequest(i))).status, 200)
  assert.equal((await POST(imageRequest(20))).status, 429)
  assert.equal(fetchCount, 20, 'rate limit must prevent additional upstream calls')
  console.log('Landmark search tests passed: validation, auth, missing key, candidates, caching, upstream errors, rate limit.')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
