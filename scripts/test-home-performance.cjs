const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', code)(module, module.exports, name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`)
    return mocks[name]
  })
  return module.exports
}
const jsx = (type, props) => ({ type, props })
const runtime = { jsx, jsxs: jsx }
const walk = node => !node ? [] : Array.isArray(node) ? node.flatMap(walk) : typeof node === 'object' ? [node, ...walk(node.props?.children)] : []

async function main() {
  const videos = [{ id: 'a', youtubeId: 'abcdefghijk', title: 'Trip', views: 12, keyframes: [], routeShapes: { large: 'geometry' } }]
  const page = load('app/page.tsx', {
    'react/jsx-runtime': runtime,
    '@/components/home/home-page': { default: 'home' },
    '@/lib/creator-videos-db': { listPublishedCreatorVideosFromDb: async () => videos },
  })
  assert.equal(page.dynamic, 'force-dynamic', 'Visibility-sensitive catalog must not be cached')
  const result = await page.default()
  assert.equal(result.props.initialVideos[0].id, 'a')
  assert.equal('routeShapes' in result.props.initialVideos[0], false)
  assert.ok(videos[0].routeShapes, 'Do not mutate the database response')

  const states = []
  const home = load('components/home/home-page.tsx', {
    react: {
      useState: initial => { const value = typeof initial === 'function' ? initial() : initial; states.push(value); return [value, () => {}] },
      useEffect() {}, useMemo: fn => fn(), useTransition: () => [false, () => {}],
    },
    'react/jsx-runtime': runtime, 'next/navigation': { useRouter: () => ({ push() {} }) },
    'lucide-react': { Loader2: 'loader' },
    '@/components/home/home-header': { HomeHeader: 'header' },
    '@/components/home/video-grid': { HomeVideoGrid: 'grid' },
    '@/components/home/home-preferences': { getSavedPreference() {}, saveSelectedPreference() {} },
    '@/lib/creator-videos-cloud-client': { fetchPublishedCloudVideos() { throw new Error('No fetch during render') } },
    '@/lib/creator-videos': { createInstantWatchVideo() {} },
    '@/lib/youtube-client': { toHydratedTravelVideo: video => ({ ...video }), hydrateTravelVideos() {} },
  })
  const nodes = walk(home.default({ initialVideos: result.props.initialVideos }))
  const grid = nodes.find(node => node.type === 'grid')
  assert.equal(grid.props.isCatalogLoading, false)
  assert.equal(grid.props.videos[0].title, 'Trip', 'Cards must exist before effects/hydration')
  assert.equal(grid.props.videos[0].isMetadataLoading, false)

  const cards = load('components/home/video-grid.tsx', {
    'react/jsx-runtime': runtime,
    './home-preferences': { homeSkeletonCardCount: 4 },
    './video-card': { HomeVideoCard: 'card', HomeVideoSkeletonCard: 'skeleton' },
  })
  const renderedCards = walk(cards.HomeVideoGrid({ isCatalogLoading: false, videos: [videos[0], { ...videos[0], id: 'b' }] }))
    .filter(node => node.type === 'card')
  assert.equal(renderedCards[0].props.prioritizeThumbnail, true)
  assert.equal(renderedCards[1].props.prioritizeThumbnail, false, 'Do not prioritize the whole catalog')

  const card = load('components/home/video-card.tsx', {
    'react/jsx-runtime': runtime, 'next/link': { default: 'link' }, 'next/image': { default: 'image' },
    '@/components/ui/badge': { Badge: 'badge' }, '@/components/ui/skeleton': { Skeleton: 'skeleton' },
    '@/lib/demo-data': { formatCompactNumber: String, formatDuration: String },
    '@/lib/video-trip-summary': { formatTravelDistance: String, formatVideoReleaseDate: String, getVideoTravelDistanceKm: () => 0 },
  })
  for (const priority of [true, false]) {
    const image = walk(card.HomeVideoCard({ video: videos[0], prioritizeThumbnail: priority })).find(node => node.type === 'image')
    assert.equal(image.props.priority, priority)
    assert.ok(image.props.sizes.includes('calc(100vw - 32px)'))
  }
  console.log('Home performance checks passed: server-rendered cards, no route geometry, visibility-safe freshness, one priority thumbnail.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
