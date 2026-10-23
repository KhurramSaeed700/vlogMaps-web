const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', code)(module, module.exports, name => { assert.ok(name in mocks, name); return mocks[name] })
  return module.exports
}
const visibility = load('lib/video-visibility.ts')
const filters = load('lib/creator-dashboard-content.ts', { '@/lib/video-visibility': visibility })
const defaults = { query: '', status: 'all', visibility: 'all', sort: 'date', ascending: false }
const videos = Array.from({ length: 13 }, (_, i) => ({
  id: `video-${i}`, title: i === 1 ? 'Café in Gdańsk' : `Journey ${i}`, description: 'Travel story', creator: 'Creator', youtubeId: 'abcdefghijk',
  thumbnail: '', locations: ['Poland'], tags: ['cities'], status: i === 0 ? 'draft' : 'published', visibility: i === 2 ? 'private' : i === 3 ? 'unlisted' : 'public',
  createdAt: new Date(2026, 0, i + 1).toISOString(), views: i * 100, mapViews: i * 100, durationSeconds: 60, keyframes: Array(i).fill({}),
}))
const ids = values => values.map(video => video.id)
assert.deepEqual(ids(filters.filterDashboardVideos(videos, { ...defaults, query: 'cafe gdansk' })), ['video-1'])
assert.equal(filters.filterDashboardVideos(videos, { ...defaults, query: 'Poland cities' }).length, 13)
assert.deepEqual(ids(filters.filterDashboardVideos(videos, { ...defaults, status: 'draft' })), ['video-0'])
assert.deepEqual(ids(filters.filterDashboardVideos(videos, { ...defaults, visibility: 'private' })), ['video-2'])
assert.deepEqual(ids(filters.filterDashboardVideos(videos, { ...defaults, visibility: 'unlisted' })), ['video-3'])
assert.equal(filters.filterDashboardVideos(videos, { ...defaults, status: 'draft', visibility: 'public' }).length, 0)
for (const sort of ['date', 'views', 'keyframes']) {
  assert.equal(filters.filterDashboardVideos(videos, { ...defaults, sort })[0].id, 'video-12')
  assert.equal(filters.filterDashboardVideos(videos, { ...defaults, sort, ascending: true })[0].id, 'video-0')
}
assert.equal(videos[0].id, 'video-0', 'sorting must not mutate input')

const jsx = (type, props) => ({ type, props })
const walk = node => !node ? [] : Array.isArray(node) ? node.flatMap(walk) : typeof node === 'object' ? [node, ...walk(node.props?.children)] : []
const states = []; let cursor = 0
const Menu = Object.fromEntries(['Root', 'Trigger', 'Portal', 'Content', 'RadioGroup', 'RadioItem', 'ItemIndicator', 'Label', 'Item'].map(name => [name, `menu-${name}`]))
const table = load('components/creator/creator-content-table.tsx', {
  react: { useEffect() {}, useState(value) { const i = cursor++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next }] }, useMemo: fn => fn() },
  'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/image': { default: 'image' }, 'next/link': { default: 'link' },
  '@radix-ui/react-dropdown-menu': Menu, 'lucide-react': new Proxy({}, { get: (_, name) => name }),
  '@/components/ui/checkbox': { Checkbox: 'checkbox' },
  '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' }, '@/components/ui/skeleton': { Skeleton: 'skeleton' },
  '@/lib/video-trip-summary': load('lib/video-trip-summary.ts'),
  '@/lib/video-mapping-status': load('lib/video-mapping-status.ts'),
  '@/lib/creator-video-details-client': { fetchCreatorVideoDetails: async () => [] },
  '@/lib/creator-playlists': { creatorPlaylistHref: id => `/creator/playlists/${id}` },
  '@/lib/playlist-mapping': { playlistEditorHref: (id,playlist) => `/creator/video/${id}/edit?playlist=${playlist}` },
  '@/lib/demo-data': { formatCompactNumber: String, formatDuration: String }, '@/lib/creator-dashboard-content': filters, '@/lib/video-visibility': visibility,
})
let edited = null, previewed = false
const props = { videos, loading: false, pendingId: null, onEdit: video => { edited = video.id }, onVisibility() {}, onUpload() {}, onUnpublish() {}, onDelete() {} }
const render = () => { cursor = 0; return walk(table.CreatorContentTable(props)) }
let nodes = render()
assert.equal(nodes.filter(node => node.type === 'tr' && node.props.onClick).length, 10)
nodes.find(node => node.props?.['aria-label'] === 'Next video page').props.onClick()
assert.equal(render().filter(node => node.type === 'tr' && node.props.onClick).length, 3)
nodes = render()
nodes.find(node => node.props?.['aria-label'] === 'Search your videos').props.onChange({ target: { value: 'cafe' } })
nodes = render()
assert.equal(nodes.filter(node => node.type === 'tr' && node.props.onClick).length, 1, 'search resets pagination')
const row = nodes.find(node => node.type === 'tr' && node.props.onClick)
row.props.onClick({ target: { closest: () => true } }); assert.equal(edited, null, 'row actions must not navigate to editor')
row.props.onClick({ target: { closest: () => null } }); assert.equal(edited, 'video-1')
assert.ok(nodes.find(node => node.props?.['aria-label'] === 'Preview Café in Gdańsk'))
states.length=0;props.playlistId='PL1234567890';nodes=render();
assert.equal(nodes.find(n=>n.type==='link'&&n.props['aria-label']==='Edit Journey 0').props.href,'/creator/video/video-0/edit?playlist=PL1234567890','Playlist thumbnail retains mapping queue');
assert.equal(filters.filterDashboardVideos(videos,{...defaults,sort:'playlist',ascending:true})[0].id,'video-0');
assert.ok(nodes.some(n=>n.props?.children==='Playlist order'));
console.log('Dashboard tests passed: search/accents, status and visibility filters, sorting, input immutability, pagination, page reset and independent row actions.')

// Grouped series share the content filters and page, without expanding episodes.
states.length = 0; delete props.playlistId
props.videos = [videos[1]]
props.playlists = [{ id: 'series', title: 'Alaska series', videos: [videos[0], videos[2]], mappedCount: 1, uploadedCount: 1 }]
nodes = render()
assert.equal(nodes.filter(n => n.type === 'tr').length - 1, 2)
assert.equal(nodes.find(n => n.props?.['aria-label'] === 'Open playlist Alaska series').props.href, '/creator/playlists/series')
nodes.find(n => n.type === 'input').props.onChange({ target: { value: 'Alaska' } })
nodes = render()
assert.ok(nodes.find(n => n.props?.['aria-label'] === 'Open playlist Alaska series'))
assert.ok(!nodes.find(n => n.props?.['aria-label'] === 'Edit Café in Gdańsk'))
for (const status of ['draft', 'published']) {
  states[0] = { ...defaults, status }
  assert.ok(render().find(n => n.props?.['aria-label'] === 'Open playlist Alaska series'), 'Mixed series appears in both status tabs')
}
states[0] = { ...defaults, visibility: 'private' }
assert.ok(render().find(n => n.props?.['aria-label'] === 'Open playlist Alaska series'))
states[0] = { ...defaults, visibility: 'unlisted' }
assert.ok(!render().find(n => n.props?.['aria-label'] === 'Open playlist Alaska series'))
console.log('Unified playlist rows passed: one row per series, navigation, shared search, mixed upload states and visibility filters.')

states.length = 0; props.videos = [videos[0], videos[2]]; props.playlists = []
nodes = render()
const text = n => !n ? '' : Array.isArray(n) ? n.map(text).join(' ') : typeof n === 'object' ? text(n.props?.children) : String(n)
assert.ok(!nodes.some(n => n.type === 'th' && text(n) === 'Date'))
assert.ok(nodes.some(n => n.type === 'span' && text(n).trim() === 'Mapped'))
assert.ok(nodes.some(n => n.type === 'span' && text(n).trim() === 'Not mapped'))
assert.ok(!nodes.some(n => n.type === 'td' && text(n).includes('Created')))
console.log('Content presentation passed: no date column and distinct mapped/unmapped states.')
states.length = 0
props.videos = [{ ...videos[2], durationSeconds: 1800, keyframes: [{ time: 100 }] }]
nodes = render()
const inProgress = nodes.find(n => n.type === 'span' && text(n).trim() === 'Mapping')
assert.ok(inProgress, 'Partially mapped video shows Mapping')
assert.ok(inProgress.props.className.includes('yellow'), 'Mapping is yellow')
assert.ok(nodes.some(n => n.type === 'div' && n.props.className === 'mt-1 flex h-4 items-center gap-2'), 'Mapping stays on the existing fixed-height line')
console.log('Mapping badge passed: yellow in-progress state with unchanged row layout.')
states.length = 0
props.videos = [{ ...videos[2], durationSeconds: 0, keyframes: [{ time: 1000 }] }]
nodes = render()
assert.ok(nodes.some(n => n.type === 'span' && text(n).trim() === 'Checking…'), 'Unknown duration is not falsely classified as Mapping')
states[6] = { [videos[2].youtubeId]: 1200 }
nodes = render()
assert.ok(nodes.some(n => n.type === 'span' && text(n).trim() === 'Mapped'), 'Loaded duration reclassifies a timestamp within the final five minutes')
assert.ok(!nodes.some(n => n.type === 'span' && text(n).trim() === 'Mapping'))
console.log('Duration completion regression passed: checking → mapped after duration loads.')

states.length = 0
props.videos = [{...videos[2],mapViews:42,views:9000}]
nodes = render()
assert.ok(nodes.some(n => n.type === 'th' && text(n) === 'YT views'))
assert.ok(nodes.some(n => n.type === 'td' && text(n) === '42'))
assert.ok(nodes.some(n => n.type === 'td' && text(n) === '9000'))
console.log('Separate views passed: VlogMaps views and YouTube views occupy separate columns.')

states.length = 0; props.playlists = []
props.videos = Array.from({length:65}, (_, index) => ({...videos[2], id:`page-${index}`}))
nodes = render()
const rowCount = () => render().filter(n => n.type === 'tr' && n.props.onClick).length
assert.equal(rowCount(),10)
nodes.find(n => n.props?.['aria-label'] === 'Next video page').props.onClick()
for (const size of [30,50,10]) {
  render().find(n => n.props?.['aria-label'] === 'Rows per page').props.onChange({target:{value:String(size)}})
  assert.equal(rowCount(),size)
  assert.equal(states[1],0,'Changing page size returns to the first page')
}
render().find(n => n.props?.['aria-label'] === 'Rows per page').props.onChange({target:{value:'50'}})
render().find(n => n.props?.['aria-label'] === 'Next video page').props.onClick()
assert.equal(rowCount(),15,'Last page keeps remaining rows')
console.log('Page size selector passed: 10, 30, 50, first-page reset and final-page bounds.')

states.length = 0
props.videos = []
props.playlists = [{id:'summary',title:'Status summary',mappedCount:2,uploadedCount:0,videos:[
  {...videos[2],id:'complete',youtubeId:'complete123',durationSeconds:1200,keyframes:[{time:1000}]},
  {...videos[2],id:'partial',youtubeId:'partial1234',durationSeconds:1200,keyframes:[{time:100}]},
  {...videos[2],id:'empty',youtubeId:'empty123456',durationSeconds:1200,keyframes:[]},
  {...videos[2],id:'checking',youtubeId:'checking123',durationSeconds:0,keyframes:[{time:1100}]},
]}]
nodes=render()
assert.ok(nodes.some(n=>n.type==='span'&&text(n).replace(/\s+/g,' ').trim()==='1 mapped'))
assert.ok(nodes.some(n=>n.type==='span'&&text(n).replace(/\s+/g,' ').trim()==='1 mapping'))
assert.ok(nodes.some(n=>n.type==='span'&&text(n).replace(/\s+/g,' ').includes('1 not mapped')&&text(n).includes('1 checking')))
states[6]={checking123:1200}
nodes=render()
assert.ok(nodes.some(n=>n.type==='span'&&text(n).replace(/\s+/g,' ').trim()==='2 mapped'),'Playlist total updates when missing episode duration resolves')
console.log('Playlist totals passed: mapped, mapping, not mapped and pending-duration completion.')

// Selection persists across pages and never selects a grouped playlist or read-only video.
states.length = 0; props.playlists = []; props.videos = videos
nodes = render()
nodes.find(n => n.props?.['aria-label'] === 'Select all videos on this page').props.onCheckedChange(true)
nodes = render()
assert.equal(nodes.find(n => n.props?.['aria-label'] === 'Select all videos on this page').props.checked, true)
assert.ok(nodes.some(n => text(n).replace(/\s+/g, ' ').trim() === '10 selected'))
nodes.find(n => n.props?.['aria-label'] === 'Next video page').props.onClick()
nodes = render()
assert.equal(nodes.find(n => n.props?.['aria-label'] === 'Select all videos on this page').props.checked, false)
nodes.find(n => n.props?.['aria-label'] === 'Select Journey 0').props.onCheckedChange(true)
nodes = render()
assert.ok(nodes.some(n => text(n).replace(/\s+/g, ' ').trim() === '11 selected'))
nodes.find(n => n.type === 'button' && text(n) === 'Clear selection').props.onClick()
assert.ok(!render().some(n => n.props?.['aria-label'] === 'Bulk video editing'))
states.length = 0; props.videos = [{...videos[1],viewerCanEdit:false}]; props.playlists = [{id:'series',title:'Series',videos:[videos[2]],uploadedCount:1}]
nodes = render()
assert.equal(nodes.filter(n=>n.type==='checkbox').length,2, 'Playlist rows have no video checkbox')
assert.equal(nodes.find(n=>n.props?.['aria-label']==='Select Café in Gdańsk').props.disabled,true)
console.log('Bulk selection passed: page selection, cross-page persistence, clear, playlists and read-only protection.')

async function testBulkSave() {
  states.length = 0; props.playlists = []; props.videos = videos
  const calls = []
  props.onBulkEdit = async (selected, action) => { calls.push({ ids: selected.map(v=>v.id), action }); return [selected[0].id] }
  nodes = render()
  nodes.find(n=>n.props?.['aria-label']==='Select all videos on this page').props.onCheckedChange(true)
  nodes = render()
  const action = nodes.find(n=>n.type==='menu-RadioItem'&&n.props.value==='private'&&n.props.onSelect)
  action.props.onSelect()
  assert.equal(render().find(n=>n.props?.['aria-label']==='Bulk edit action').props.disabled,true)
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(calls.length,1)
  assert.equal(calls[0].ids.length,10)
  assert.equal(calls[0].action,'private')
  assert.equal(render().filter(n=>n.type==='tr'&&n.props['aria-selected']).length,9,'Only successful saves are deselected')

  const source = fs.readFileSync(path.join(__dirname,'../components/creator/creator-studio.tsx'),'utf8')
  const ast = ts.createSourceFile('studio.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let declaration
  const visit = node => { if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='handleBulkEdit') declaration=node; ts.forEachChild(node,visit) }; visit(ast)
  const updates=[], messages=[], requested=[]
  const body = ts.transpileModule('const '+declaration.getText(ast)+'; return handleBulkEdit', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
  const run = new Function('unpublishCreatorVideoFromCloud','setCreatorVideoVisibilityInCloud','setAllCreatorVideos','mergeTravelVideos','setSyncMessage',body)(
    async id=>{requested.push(['draft',id]);return {unpublished:true,video:{id}}},
    async (id,action)=>{requested.push([action,id]);if(id==='bad')throw Error('offline');return {updated:true,video:{id}}},
    update=>updates.push(update([])), (old,next)=>next, message=>messages.push(message))
  const sample=[{id:'good',status:'published'},{id:'bad',status:'published'},{id:'draft',status:'draft'},{id:'readonly',status:'published',viewerCanEdit:false}]
  assert.deepEqual(await run(sample,'unlisted'),['good'])
  assert.deepEqual(requested,[['unlisted','good'],['unlisted','bad']])
  assert.ok(messages[0].includes('1 failed'))
  requested.length=0
  assert.deepEqual(await run([sample[0]],'draft'),['good'])
  assert.deepEqual(requested,[['draft','good']])
  console.log('Bulk saves passed: busy controls, partial failures, retry selection, owner/editable filtering, visibility and move-to-draft requests.')
}
testBulkSave().catch(error=>{console.error(error);process.exitCode=1})
