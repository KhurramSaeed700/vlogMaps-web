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
  createdAt: new Date(2026, 0, i + 1).toISOString(), views: i * 100, durationSeconds: 60, keyframes: Array(i).fill({}),
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
  react: { useState(value) { const i = cursor++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next }] }, useMemo: fn => fn() },
  'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/image': { default: 'image' }, 'next/link': { default: 'link' },
  '@radix-ui/react-dropdown-menu': Menu, 'lucide-react': new Proxy({}, { get: (_, name) => name }),
  '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' }, '@/components/ui/skeleton': { Skeleton: 'skeleton' },
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
console.log('Dashboard tests passed: search/accents, status and visibility filters, sorting, input immutability, pagination, page reset and independent row actions.')
