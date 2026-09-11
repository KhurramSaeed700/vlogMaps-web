const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const loaded = { exports: {} }
  new Function('module', 'exports', 'require', code)(loaded, loaded.exports, (name) => {
    if (name === 'server-only') return {}
    assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`)
    return mocks[name]
  })
  return loaded.exports
}

function creatorModule(userId, user, configured = true) {
  return load('lib/server-creator-auth.ts', {
    '@clerk/nextjs/server': { auth: async () => ({ userId }) },
    '@/lib/prisma': { getPrisma: () => configured ? { user: {
      findUnique: async ({ where }) => {
        assert.deepEqual(where, { clerkUserId: userId })
        return user
      },
    } } : null },
  })
}

const member = { id: 'database-owner', userType: 'viewer', creatorProfiles: [], creatorApplications: [] }

test('anonymous, unlinked, and unapproved accounts fail closed', async () => {
  for (const [id, user, status] of [[null, member, 401], ['user-other', null, 403], ['user-viewer', member, 403]]) {
    await assert.rejects(creatorModule(id, user).requireApprovedCreator(), { status })
  }
})

test('missing database cannot grant demo access', async () => {
  await assert.rejects(creatorModule('user-demo', null, false).requireApprovedCreator(), { status: 503 })
})

test('linked approved identities retain their own owner IDs', async () => {
  for (const approval of [
    { userType: 'creator' },
    { userType: 'admin' },
    { creatorProfiles: [{ verificationStatus: 'verified' }] },
    { creatorApplications: [{ id: 'approved-application' }] },
  ]) {
    const result = await creatorModule('user-linked', { ...member, ...approval }).requireApprovedCreator()
    assert.deepEqual(result.ownerUserIds, ['user-linked', 'database-owner'])
    assert.equal(result.isDemoCreator, false)
    assert.equal(result.isAdmin, approval.userType === 'admin')
  }
})

test('public video query never grants catalog or empty-owner draft exceptions', async () => {
  for (const requester of [undefined, null, '', 'user-owner']) {
    let alternatives
    const db = load('lib/creator-videos-db.ts', {
      '@/lib/prisma': { getPrisma: () => ({ video: { findFirst: async ({ where }) => {
        alternatives = where.AND[1].OR
        return null
      } } }) },
      '@/lib/database': {},
      '@/lib/video-locations': {},
    })
    await db.getCreatorVideoFromDb('test-video', requester)
    const visible = (status, ownerUserId) => alternatives.some((condition) =>
      Object.entries(condition).every(([key, value]) => ({ status, ownerUserId })[key] === value))
    assert.equal(visible('published', 'catalog'), true)
    assert.equal(visible('published', 'someone-else'), true)
    assert.equal(visible('draft', 'catalog'), false)
    assert.equal(visible('draft', ''), false)
    assert.equal(visible('draft', 'someone-else'), false)
    assert.equal(visible('draft', 'user-owner'), requester === 'user-owner')
  }
})

test('access endpoint shares authorization and hides unexpected error details', async () => {
  const auth = creatorModule(null, null)
  for (const status of [200, 401, 403, 503, 500]) {
    const route = load('app/api/creator/access/route.ts', {
      'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
      '@/lib/server-creator-auth': {
        ...auth,
        requireApprovedCreator: async () => {
          if (status === 500) throw new Error('private database details')
          if (status !== 200) throw new auth.CreatorAuthorizationError(status, 'Denied')
        },
      },
    })
    const response = await route.GET()
    assert.equal(response.status, status === 500 ? 503 : status)
    assert.equal(response.body.approved, status === 200)
    assert.ok(!JSON.stringify(response).includes('private database details'))
  }
})
