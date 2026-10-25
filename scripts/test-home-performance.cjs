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
    '@/lib/home-feed': { listHomeFeedVideos: async () => videos },
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
    '@/components/home/home-guided-tour': { HomeGuidedTour: 'tour' },
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
  assert.equal(nodes.find(node => node.type === 'tour').props.enabled, false, 'Tutorial also waits for the complete navbar')

  const playlistApi = load('lib/creator-playlists.ts', {
    '@/lib/playlist-membership': load('lib/playlist-membership.ts', {}),
  })
  const cards = load('components/home/video-grid.tsx', {
    '@/lib/creator-playlists': playlistApi,
    'react/jsx-runtime': runtime,
    './home-preferences': { homeSkeletonCardCount: 4 },
    './video-card': { HomePlaylistCard: 'playlist-card', HomeVideoCard: 'card', HomeVideoSkeletonCard: 'skeleton' },
  })
  const renderedCards = walk(cards.HomeVideoGrid({ isCatalogLoading: false, videos: [videos[0], { ...videos[0], id: 'b' }] }))
    .filter(node => node.type === 'card')
  assert.equal(renderedCards[0].props.prioritizeThumbnail, true)
  assert.equal(renderedCards[1].props.prioritizeThumbnail, false, 'Do not prioritize the whole catalog')

  const card = load('components/home/video-card.tsx', {
    'lucide-react': { ListVideo: 'list-icon' },
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
  const episodes = [
    {...videos[0],id:'ep2',createdAt:'2026-01-02',tags:['playlist:PL1234567890','playlist-position:1'],description:'Imported from Alaska series.'},
    {...videos[0],id:'ep1',createdAt:'2026-01-01',tags:['playlist:PL1234567890','playlist-position:0'],description:'Imported from Alaska series.'},
  ]
  const homeAst=ts.createSourceFile('home.tsx',fs.readFileSync(path.join(__dirname,'../components/home/home-page.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  let baseExpression
  function findBase(node){if(ts.isVariableDeclaration(node)&&node.name.getText(homeAst)==='baseVideos')baseExpression=node.initializer.getText(homeAst);ts.forEachChild(node,findBase)}
  findBase(homeAst)
  const legacyBase=new Function('response',ts.transpileModule('const result='+baseExpression,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText+';return result')({videos:episodes})
  assert.ok(legacyBase[0].tags.includes('playlist-title:Alaska series'))
  assert.ok(!episodes[0].tags.some(tag=>tag.startsWith('playlist-title:')),'Legacy metadata preservation does not mutate server data')
  assert.equal(playlistApi.groupCreatorPlaylists(legacyBase.map(video=>({...video,description:'YouTube description'}))).playlists[0].title,'Alaska series')
  const feed=walk(cards.HomeVideoGrid({isCatalogLoading:false,videos:episodes}))
  assert.equal(feed.filter(n=>n.type==='card').length,2,'Both individual episodes remain visible')
  const series=feed.find(n=>n.type==='playlist-card').props.playlist
  assert.equal(series.title,'Alaska series');assert.equal(series.videos[0].id,'ep1')
  const playlistLink=walk(card.HomePlaylistCard({playlist:series})).find(n=>n.type==='link')
  assert.equal(playlistLink.props.href,'/playlists/PL1234567890')
  const detail=load('app/playlists/[playlistId]/page.tsx',{
    'react/jsx-runtime':runtime,'next/navigation':{notFound(){throw Error('404')}},
    '@/components/viewer/playlist-watch-client':{PlaylistWatchClient:'playlist-watch'},
    '@/components/home/video-grid':{HomeVideoGrid:'grid'},
    '@/lib/creator-playlists':playlistApi,'@/lib/home-feed':{listHomeFeedVideos:async()=>episodes},
    '@/lib/youtube-client':{toHydratedTravelVideo:video=>video},
  })
  const detailNodes=walk(await detail.default({params:Promise.resolve({playlistId:'PL1234567890'})}))
  const detailWatch=detailNodes.find(n=>n.type==='playlist-watch')
  assert.deepEqual(detailWatch.props.playlist.videos.map(v=>v.id),['ep1','ep2'])
  assert.equal(detailWatch.props.playlist.id,'PL1234567890')
  await assert.rejects(()=>detail.default({params:Promise.resolve({playlistId:'PLunknown123'})}),/404/)
  let state=[], cursor=0, effects=[]
  const history=[]
  global.window={location:{href:'http://localhost/playlists/PL1234567890',search:''},history:{pushState(_,__,url){history.push(String(url));window.location.href=String(url);window.location.search=url.search}},addEventListener(){},removeEventListener(){}}
  const playlistWatch=load('components/viewer/playlist-watch-client.tsx',{
    'react/jsx-runtime':runtime,
    react:{useState(initial){const slot=cursor++;if(!(slot in state))state[slot]=initial;return [state[slot],value=>{state[slot]=value}]},useEffect(effect){effects.push(effect)}},
    '@radix-ui/react-dialog':{Root:'dialog',Trigger:'trigger',Portal:'portal',Overlay:'overlay',Content:'content',Title:'title',Description:'description',Close:'close'},
    'lucide-react':{ChevronLeft:'left',ChevronRight:'right',ListVideo:'list',Play:'play',X:'x'},
    '@/components/viewer/watch-experience':{WatchExperience:'watch'},
    '@/lib/demo-data':{formatDuration:String},
  })
  const render=()=>{cursor=0;return playlistWatch.PlaylistWatchClient({playlist:series})}
  let experience=render()
  assert.equal(experience.props.video.id,'ep1')
  let controls=walk(experience.props.playlistControls)
  assert.equal(controls.find(n=>n.props?.['aria-label']==='Previous video').props.disabled,true)
  controls.find(n=>n.props?.['aria-label']==='Next video').props.onClick()
  experience=render()
  assert.equal(experience.props.video.id,'ep2','Next changes both the shared player and map video')
  assert.ok(history.at(-1).includes('video=ep2'),'Episode selection is shareable')
  controls=walk(experience.props.playlistControls)
  assert.equal(controls.find(n=>n.props?.['aria-label']==='Next video').props.disabled,true)
  controls.find(n=>n.props?.['aria-label']==='Previous video').props.onClick()
  assert.equal(render().props.video.id,'ep1')
  render().props.onPlaylistVideoEnded()
  assert.equal(render().props.video.id,'ep2','Ending an episode automatically advances to the next video')
  assert.equal(render().props.onPlaylistVideoEnded,undefined,'The last episode stops instead of advancing past the playlist')
  window.location.search='?video=ep2';effects[0]()
  assert.equal(render().props.video.id,'ep2','Direct episode links restore the selected episode')
  window.location.search='?video=unavailable';effects[0]()
  assert.equal(render().props.video.id,'ep1','Unavailable episode links fall back safely')
  delete global.window
  console.log('Home playlists passed: individual episodes plus one playlist card, ordered playlist watch page and unavailable playlist 404.')
  console.log('Home performance checks passed: server-rendered cards, no route geometry, visibility-safe freshness, one priority thumbnail.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
