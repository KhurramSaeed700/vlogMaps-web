// Integration test: all temporary data is rolled back, even when assertions fail.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
require(require.resolve('@next/env', { paths: [require.resolve('next/package.json')] }))
  .loadEnvConfig(process.cwd(), true, { info() {}, error() {} })
const { PrismaClient } = require('@prisma/client')
const { PrismaNeon } = require('@prisma/adapter-neon')
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.NEON_DATABASE_URL
assert.ok(connectionString, 'Database environment is required')
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) })
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', code)(module, module.exports, name => {
    if (name === 'server-only') return {}
    assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`)
    return mocks[name]
  })
  return module.exports
}
const policy = load('lib/video-visibility.ts')
const rollback = new Error('Intentional visibility-test rollback')
let temporaryId
async function main() {
  try {
    await prisma.$transaction(async tx => {
      const video = await tx.video.create({ data: {
        title: 'Temporary visibility regression test', youtubeId: 'abcdefghijk', status: 'published',
        appId: `visibility-test-${crypto.randomUUID()}`, ownerUserId: 'visibility-test-owner',
      } })
      temporaryId = video.id
      assert.equal(video.visibility, 'public', 'migration default preserves public uploads')
      const db = load('lib/creator-videos-db.ts', {
        '@/lib/prisma': { getPrisma: () => ({ ...tx, video: tx.video, $transaction: fn => fn(tx) }) },
        '@/lib/database': {}, '@/lib/video-visibility': policy,
        '@/lib/video-locations': { summarizeVideoLocations: value => value, summarizeKeyframeLocations: () => [] },
      })
      assert.ok(await db.getCreatorVideoFromDb(video.id))
      assert.equal(await db.setCreatorVideoVisibilityFromDb(video.id, 'stranger', 'private'), null)
      await db.setCreatorVideoVisibilityFromDb(video.id, 'visibility-test-owner', 'private')
      assert.equal(await db.getCreatorVideoFromDb(video.id), null)
      assert.equal(await db.getCreatorVideoFromDb(video.id, 'stranger'), null)
      assert.equal((await db.getCreatorVideoFromDb(video.id, 'visibility-test-owner')).visibility, 'private')
      await db.setCreatorVideoVisibilityFromDb(video.id, 'visibility-test-owner', 'unlisted')
      assert.equal((await db.getCreatorVideoFromDb(video.id)).visibility, 'unlisted')
      assert.equal(await tx.video.count({ where: { id: video.id, ...policy.publicVideoWhere } }), 0)
      await db.setCreatorVideoVisibilityFromDb(video.id, 'visibility-test-owner', 'public')
      assert.equal(await tx.video.count({ where: { id: video.id, ...policy.publicVideoWhere } }), 1)
      throw rollback
    }, { timeout: 60000 })
  } catch (error) {
    if (error !== rollback) throw error
  }
  assert.ok(temporaryId)
  assert.equal(await prisma.video.findUnique({ where: { id: temporaryId } }), null)
  console.log('Live visibility persistence and access checks passed; temporary test video rolled back, existing videos unchanged.')
}
main().catch(() => { console.error('Live visibility check failed; transaction rolled back. Check database connectivity and migration/client setup.'); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
