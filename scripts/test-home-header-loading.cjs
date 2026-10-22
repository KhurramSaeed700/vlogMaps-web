const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const noop = () => {}
const jsx = (type, props) => ({ type, props })
const walk = node => !node ? [] : Array.isArray(node) ? node.flatMap(walk) : typeof node === 'object' ? [node, ...walk(node.props?.children)] : []
function hooks() {
  const states = [], effects = [], scheduled = []
  let stateCursor = 0, effectCursor = 0
  return {
    reset() { stateCursor = 0; effectCursor = 0 },
    commit() { scheduled.splice(0).forEach(({ index, fn }) => { effects[index].cleanup?.(); effects[index].cleanup = fn() }) },
    react: {
      useState(initial) {
        const index = stateCursor++
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
      },
      useEffect(fn, deps) {
        const index = effectCursor++
        if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i])) {
          effects[index] = { ...effects[index], deps }
          scheduled.push({ index, fn })
        }
      },
      useMemo: fn => fn(),
    },
  }
}
function load(file, mocks, fetch) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const result = { exports: {} }
  new Function('module', 'exports', 'require', 'fetch', code)(result, result.exports, name => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`)
    return mocks[name]
  }, fetch)
  return result.exports
}
async function checkAccess() {
  for (const outcome of ['approved', 'viewer', 'failure']) {
    const h = hooks()
    let complete
    const request = new Promise(resolve => { complete = resolve })
    const { useCreatorAccess } = load('lib/use-creator-access.ts', { react: h.react }, async () => {
      await request
      if (outcome === 'failure') throw new Error('Network unavailable')
      return { ok: true, json: async () => ({ approved: outcome === 'approved' }) }
    })
    const render = user => { h.reset(); return useCreatorAccess({ isLoaded: true, isSignedIn: Boolean(user), user }) }
    const user = { id: 'user-a' }
    assert.equal(render(user).isCheckingCreatorAccess, true, 'First signed-in render must wait before the fetch effect starts')
    h.commit()
    assert.equal(render(user).isCheckingCreatorAccess, true, 'Pending access must not reveal the navbar')
    complete()
    await new Promise(resolve => setImmediate(resolve))
    const settled = render(user)
    assert.equal(settled.isCheckingCreatorAccess, false, 'Every settled request, including failures, releases the skeleton')
    assert.equal(settled.isApprovedCreator, outcome === 'approved')
    assert.equal(render({ id: 'user-b' }).isCheckingCreatorAccess, true, 'An account switch must wait for the new account')
    assert.equal(render(null).isCheckingCreatorAccess, false, 'Signed-out users do not wait for creator access')
  }
}
function checkHeader() {
  const h = hooks()
  let auth = { isLoaded: false, isSignedIn: undefined, user: null }
  let access = { isCheckingCreatorAccess: false, isApprovedCreator: false }
  let widgetMounted = false, observerCallback
  const image = { complete: false }
  const container = {
    querySelector: () => widgetMounted ? { querySelector: () => image } : null,
    addEventListener: noop, removeEventListener: noop,
  }
  const originalObserver = global.MutationObserver
  global.MutationObserver = class { constructor(fn) { observerCallback = fn } observe() {} disconnect() {} }
  const { HomeHeader } = load('components/home/home-header.tsx', {
    react: { ...h.react, useRef: () => ({ current: container }) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@radix-ui/react-dropdown-menu': new Proxy({}, { get: (_, key) => key }),
    '@clerk/nextjs': { useUser: () => auth, UserButton: 'UserButton' },
    'next/navigation': { useRouter: () => ({ push: noop }) },
    '@/lib/youtube-playlist': { extractYouTubePlaylistId: () => null },
    '@/components/home/youtube-link-preview': { YouTubeLinkPreview: 'LinkPreview' },
    'next/image': { default: 'Image' }, 'next/link': { default: 'Link' },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    'next-themes': { useTheme: () => ({ resolvedTheme: 'dark', setTheme: noop }) },
    '@/components/monitoring/report-problem-button': { ReportProblemButton: 'ReportProblemButton' },
    '@/components/app-shell/travelmap-logo': { TravelMapLogo: 'Logo' },
    '@/components/ui/button': { Button: 'Button' }, '@/components/ui/input': { Input: 'Input' },
    '@/components/home/home-preferences': { preferenceOptions: [] },
    '@/components/settings/playback-settings-section': { PlaybackSettingsSection: 'Playback' },
    '@/lib/demo-data': {}, '@/lib/use-creator-access': { useCreatorAccess: () => access },
    '@/lib/use-playback-preferences': { usePlaybackPreferences: () => ({ preferences: {}, updatePreferences: noop }) },
    '@/lib/home-tour': { homeTourStartEvent: 'tour' },
    '@/lib/youtube': { extractYouTubeId: () => null },
  })
  const readiness = []
  const onReadyChange = ready => readiness.push(ready)
  const render = () => { h.reset(); return HomeHeader({ youtubeUrl: '', onReadyChange }) }
  try {
    let header = render()
    assert.equal(header.props['aria-busy'], true)
    assert.ok(walk(header).some(node => node.props?.inert === true), 'All real navbar controls must be inert while loading')
    h.commit()
    auth = { isLoaded: true, isSignedIn: true, user: { id: 'user-a', hasImage: true } }
    access.isCheckingCreatorAccess = true
    header = render(); h.commit()
    assert.equal(header.props['data-home-header-ready'], false)
    widgetMounted = true
    observerCallback()
    assert.equal(render().props['data-home-header-ready'], false, 'A mounted avatar must also finish loading its image')
    image.complete = true
    observerCallback()
    assert.equal(render().props['data-home-header-ready'], false, 'A ready avatar still waits for creator access')
    access.isCheckingCreatorAccess = false
    header = render(); h.commit()
    assert.equal(header.props['data-home-header-ready'], true, 'The complete navbar reveals in one render')
    assert.equal(walk(header).some(node => node.props?.inert === true), false)
    assert.equal(readiness.at(-1), true, 'The guided tour is notified when navigation is ready')
    auth = { isLoaded: true, isSignedIn: false, user: null }
    assert.equal(render().props['data-home-header-ready'], true, 'Signed-out navigation does not wait for an avatar')
  } finally { global.MutationObserver = originalObserver }
}
checkAccess().then(() => {
  checkHeader()
  console.log('Home header passed: initial auth/access race, account switch, failed access, avatar mount/image loading, atomic reveal, and signed-out navigation.')
}).catch(error => { console.error(error); process.exitCode = 1 })
