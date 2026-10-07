const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', code)(module, module.exports, name => {
    if (name === 'server-only') return {}
    if (name === '@/lib/video-visibility') return visibility
    assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`)
    return mocks[name]
  })
  return module.exports
}
const visibility = load('lib/video-visibility.ts')
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(condition => matches(row, condition))
    if (key === 'OR') return value.some(condition => matches(row, condition))
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key])
      if ('not' in value) return row[key] !== value.not
    }
    return row[key] === value
  })
}
const rows = ['public', 'unlisted', 'private'].flatMap(visibility => ['published', 'draft'].map(status => ({
  id: `${status}-${visibility}`, appId: `${status}-${visibility}`, status, visibility, ownerUserId: 'owner',
  title: 'Test', youtubeId: 'abcdefghijk', editorState: null, keyframes: [], locations: [], tags: [],
  _count: { keyframes: 0 },
})))
const findFirst = async ({ where }) => rows.find(row => matches(row, where)) || null
const prisma = { video: { findFirst, findMany: async ({ where }) => rows.filter(row => matches(row, where)),
  updateMany: async ({ where, data }) => {
    const found = rows.filter(row => matches(row, where))
    found.forEach(row => Object.assign(row, data))
    return { count: found.length }
  },
}, $transaction: async fn => fn(prisma) }
const db = load('lib/creator-videos-db.ts', {
  '@/lib/prisma': { getPrisma: () => prisma }, '@/lib/database': {},
  '@/lib/video-locations': { summarizeVideoLocations: value => value, summarizeKeyframeLocations: () => [] },
})
const mobile = load('lib/mobile-viewer.ts', { '@/lib/prisma': { getPrisma: () => prisma } })

async function main() {
  assert.equal(visibility.normalizeVideoVisibility(undefined), 'public')
  assert.equal(visibility.normalizeVideoVisibility('unknown'), 'private')
  assert.deepEqual((await db.listPublishedCreatorVideosFromDb()).map(video => video.id), ['published-public'])
  assert.deepEqual((await mobile.listPublishedMobileVideos()).map(video => video.id), ['published-public'])
  for (const row of rows) {
    const accessible = row.status === 'published' && row.visibility !== 'private'
    for (const requester of [undefined, '', 'stranger', 'owner', ['clerk-id', 'owner']]) {
      const owns = requester === 'owner' || Array.isArray(requester)
      assert.equal(Boolean(await db.getCreatorVideoFromDb(row.id, requester)), accessible || owns, row.id)
    }
    assert.equal(Boolean(await mobile.getPublishedMobileVideo(row.id)), accessible)
    assert.equal(Boolean(await mobile.getPublishedMobileRoute(row.id)), accessible)
  }
  assert.equal(await db.setCreatorVideoVisibilityFromDb('published-public', 'stranger', 'private'), null)
  assert.equal(await db.setCreatorVideoVisibilityFromDb('draft-public', 'owner', 'private'), null)
  assert.equal((await db.setCreatorVideoVisibilityFromDb('published-public', ['clerk-id', 'owner'], 'private')).visibility, 'private')
  assert.equal(await db.getCreatorVideoFromDb('published-public'), null)
  await db.setCreatorVideoVisibilityFromDb('published-public', 'owner', 'unlisted')
  assert.ok(await db.getCreatorVideoFromDb('published-public'))
  assert.equal((await db.listPublishedCreatorVideosFromDb()).length, 0)
  await db.setCreatorVideoVisibilityFromDb('published-public', 'owner', 'public')
  assert.equal((await db.listPublishedCreatorVideosFromDb()).length, 1)

  const parser = load('lib/creator-video-payload.ts', {
    zod: require('zod'), '@/lib/video-locations': { maxVideoLocationSummaries: 40, summarizeVideoLocations: value => value },
  })
  const payload = { id: 'test', title: 'Test', youtubeId: 'abcdefghijk' }
  for (const value of visibility.videoVisibilities) assert.equal(parser.parseTravelVideoPayload({ ...payload, visibility: value }).data.visibility, value)
  assert.equal(parser.parseTravelVideoPayload({ ...payload, visibility: 'unknown' }).success, false)
  assert.equal(parser.parseTravelVideoPayload(payload).data.visibility, undefined)

  let watchUser = null
  const watch = load('app/api/videos/[id]/route.ts', {
    '@clerk/nextjs/server': { auth: async () => ({ userId: watchUser }) },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200, headers: options?.headers }) } },
    '@/lib/prisma': { getPrisma: () => ({ user: { findUnique: async ({ where }) => where.clerkUserId === 'clerk-owner' ? { id: 'owner' } : null } }) },
    '@/lib/creator-videos-db': { ...db, isCreatorVideosDbConfigured: () => true, isCreatorVideoOwnedByUser: async (_id, owners) => owners.includes('owner') },
  })
  const getWatch = id => watch.GET(new Request('http://localhost/test'), { params: Promise.resolve({ id }) })
  for (const user of [null, 'stranger', 'clerk-owner']) {
    watchUser = user
    const response = await getWatch('published-private')
    assert.equal(response.status, user === 'clerk-owner' ? 200 : 404)
    if (response.status === 200) { assert.equal(response.body.viewerCanEdit, true); assert.equal(response.headers['Cache-Control'], 'private, no-store') }
  }
  watchUser = null
  assert.equal((await getWatch('published-unlisted')).status, 200)

  class CreatorAuthorizationError extends Error { constructor(status) { super('Denied'); this.status = status } }
  let authStatus = 200, updated = 0, unpublished = 0
  const route = load('app/api/creator/videos/[videoId]/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/server-creator-auth': { CreatorAuthorizationError, requireApprovedCreator: async () => {
      if (authStatus !== 200) throw new CreatorAuthorizationError(authStatus)
      return { ownerUserIds: ['owner'] }
    } },
    '@/lib/creator-videos-db': { isCreatorVideosDbConfigured: () => true,
      setCreatorVideoVisibilityFromDb: async (id, owners, value) => { updated++; assert.deepEqual(owners, ['owner']); return { id, visibility: value } },
      unpublishCreatorVideoFromDb: async () => { unpublished++; return { status: 'draft' } },
    },
  })
  const patch = text => route.PATCH(new Request('http://localhost/test', { method: 'PATCH', body: text || undefined }), { params: Promise.resolve({ videoId: 'test' }) })
  for (const status of [401, 403]) { authStatus = status; assert.equal((await patch('{"visibility":"public"}')).status, status) }
  assert.equal(updated, 0)
  authStatus = 200
  for (const body of ['null', '{}', '[]', 'invalid', '{"visibility":"unknown"}']) assert.equal((await patch(body)).status, 400)
  assert.equal(unpublished, 0, 'invalid visibility requests must never unpublish')
  for (const value of visibility.videoVisibilities) assert.equal((await patch(JSON.stringify({ visibility: value }))).body.video.visibility, value)
  assert.equal(updated, 3)
  assert.equal((await patch('')).body.unpublished, true)
  assert.equal(unpublished, 1)
  const schema = fs.readFileSync(path.join(__dirname, '../lib/creator-videos-db.ts'), 'utf8')
  const updateBlock = schema.slice(schema.indexOf('? await tx.video.update('), schema.indexOf(': await tx.video.create('))
  assert.equal(updateBlock.includes('visibility:'), false, 'stale editor saves must not overwrite visibility')
  const mobileHeaders = fs.readFileSync(path.join(__dirname, '../lib/mobile-api-response.ts'), 'utf8')
  assert.match(mobileHeaders, /"Cache-Control": "no-store"/)
  console.log('Visibility tests passed: public-only discovery, unlisted links, owner-only private/drafts, mobile route protection, ownership updates, validation, legacy unpublish, stale editor saves and no stale cache.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
