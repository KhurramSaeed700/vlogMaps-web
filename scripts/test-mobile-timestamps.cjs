const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const jsx = (type, props) => ({ type, props })
const walk = node => !node ? [] : Array.isArray(node) ? node.flatMap(walk) : typeof node === 'object' ? [node, ...walk(node.props?.children)] : []
const states = []; let cursor = 0
const noop = () => {}
const points = [{ id: 'point', time: 12, lat: 0, lng: 0, location: 'Test stop', description: '', pointType: 'stop' }]
const mocks = {
  react: {
    memo: fn => fn, useCallback: fn => fn, useEffect: noop, useLayoutEffect: noop,
    useMemo: fn => fn(), useRef: current => ({ current }),
    useState(initial) {
      const i = cursor++
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }]
    },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@radix-ui/react-dropdown-menu': new Proxy({}, { get: (_, key) => `Menu${key}` }),
  '@radix-ui/react-dialog': new Proxy({}, { get: (_, key) => `Dialog${key}` }),
  'next/image': { default: 'Image' }, 'next/link': { default: 'Link' },
  'lucide-react': new Proxy({}, { get: (_, key) => `Icon${key}` }),
  '@/components/monitoring/report-problem-button': { ReportProblemButton: 'ReportProblemButton' },
  '@/components/viewer/watch-video-search': { WatchVideoSearch: 'WatchVideoSearch' },
  '@/components/viewer/watch-guided-tour': { WatchGuidedTour: 'WatchTour' },
  '@/lib/watch-tour': { watchTourStartEvent: 'watch-tour:start' },
  '@/components/ui/button': { Button: 'Button' },
  '@/components/ui/split-view-resizer': { SplitViewResizer: 'Resizer' },
  '@/components/maps/mapbox-travel-map': { MapboxTravelMap: 'Map' },
  '@/components/media/autoplay-countdown': { AutoplayCountdown: 'Countdown', autoplayCountdownSeconds: 3 },
  '@/components/media/youtube-player': { YouTubePlayer: 'Player' },
  '@/components/settings/playback-settings-section': { PlaybackSettingsSection: 'Playback' },
  '@/lib/demo-data': { formatDuration: String },
  '@/lib/flight-path': { getFlightRouteKeyframes: points => points },
  '@/lib/creator-points': { loadCreatorPoints: () => points, getInterpolatedPointAtTime: points => points[0] },
  '@/lib/creator-route-shapes': { loadCreatorRouteShapes: () => ({}) },
  '@/lib/use-playback-preferences': { usePlaybackPreferences: () => ({ preferences: {}, updatePreferences: noop }) },
}
const source = fs.readFileSync(path.join(__dirname, '../components/viewer/watch-experience.tsx'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
const moduleUnderTest = { exports: {} }
new Function('module', 'exports', 'require', code + ';exports.TimestampList = WatchTimestampList;exports.getActiveTimestampIndex = getActiveTimestampIndex;')(
  moduleUnderTest, moduleUnderTest.exports, name => { assert.ok(name in mocks, name); return mocks[name] },
)
const { WatchExperience, TimestampList } = moduleUnderTest.exports
const props = { video: { id: 'video', keyframes: points, youtubeId: 'abcdefghijk' } }
const render = () => { cursor = 0; return walk(WatchExperience(props)) }
let nodes = render()
const trigger = nodes.find(node => node.props?.['aria-label'] === 'Open timestamps')
assert.ok(trigger.props.className.includes('lg:hidden'), 'Icon button must be mobile only')
assert.equal(trigger.props.children.type, 'IconListVideo', 'Trigger must have no visible text')
assert.equal(nodes.find(node => node.type === 'DialogRoot').props.open, false, 'List starts closed')
nodes.find(node => node.type === 'DialogRoot').props.onOpenChange(true)
nodes = render()
assert.equal(nodes.find(node => node.type === 'DialogRoot').props.open, true)
const content = nodes.find(node => node.type === 'DialogContent')
assert.ok(content.props.className.includes('fixed inset-0'))
assert.ok(content.props.className.includes('h-[100dvh]'))
const list = walk(content).find(node => node.type === TimestampList)
list.props.onSelect(12)
nodes = render()
assert.equal(nodes.find(node => node.type === 'DialogRoot').props.open, false, 'Selecting a timestamp closes the dialog')
assert.equal(nodes.find(node => node.type === 'Player').props.seekToTime, 12)
assert.equal(nodes.find(node => node.type === 'Player').props.isPlaying, true)
assert.equal(nodes.filter(node => node.type === 'Map').length, 1, 'Map remains mounted once outside the dialog')
cursor = 0
const desktop = TimestampList({ points, activeIndex: 0, onSelect: noop, onHide: noop })
assert.ok(desktop.props.className.includes('hidden') && desktop.props.className.includes('lg:flex'))
cursor = 0
const mobile = TimestampList({ points, activeIndex: 0, onSelect: noop, onHide: noop, fullScreen: true })
assert.ok(!mobile.props.className.includes('hidden'))
assert.ok(walk(mobile).some(node => node.props?.['aria-label'] === 'Close timestamps'))
// Run the real layout effect against a tall viewport to prevent half-screen spacer regressions.
const layoutEffects = []
let resizeCallback
global.ResizeObserver = class {
  constructor(callback) { resizeCallback = callback }
  observe() {}
  disconnect() {}
}
mocks.react.useLayoutEffect = callback => layoutEffects.push(callback)
function checkPadding(fullScreen, expectedPadding) {
  layoutEffects.length = 0
  const container = { clientHeight: 800, clientTop: 0, scrollHeight: 1600, style: {}, scrollTop: 0, getBoundingClientRect: () => ({ top: 500 }) }
  const row = { offsetHeight: 36, offsetTop: 506, getBoundingClientRect: () => ({ top: 506 }) }
  const refs = [container, [row], 0]
  mocks.react.useRef = () => ({ current: refs.shift() })
  TimestampList({ points, activeIndex: 0, onSelect: noop, onHide: noop, fullScreen })
  const cleanup = layoutEffects[1]()
  assert.equal(container.style.paddingBlock, expectedPadding)
  assert.equal(container.scrollTop, 0, 'First timestamp stays at the top without negative scrolling')
  container.clientHeight = 1000
  resizeCallback()
  assert.equal(container.style.paddingBlock, '6px', 'Padding stays compact after resizing on both layouts')
  cleanup()
}
checkPadding(true, '6px')
checkPadding(false, '6px')
// Follow playback/seek transitions using real effects. The video above the list
// must not contribute to scroll targets, including when the list is already scrolled.
const effects = []
mocks.react.useEffect = callback => effects.push(callback)
global.window = { matchMedia: () => ({ matches: false }) }
const route = Array.from({ length: 20 }, (_, index) => ({ ...points[0], id: String(index), time: index * 10 }))
let reducedMotion = false
window.matchMedia = () => ({ matches: reducedMotion })
let lastScroll
const container = {
  clientHeight: 200, clientTop: 0, scrollHeight: 812, style: {}, scrollTop: 0,
  getBoundingClientRect: () => ({ top: 500 }),
  scrollTo(options) { lastScroll = options; this.scrollTop = options.top },
}
const rows = route.map((_, index) => ({ offsetHeight: 36, offsetTop: 506 + index * 40,
  getBoundingClientRect: () => ({ top: 506 + index * 40 - container.scrollTop }) }))
function follow(time, expectedTop) {
  effects.length = 0
  const activeIndex = moduleUnderTest.exports.getActiveTimestampIndex(route, time)
  const refs = [container, rows, activeIndex]
  mocks.react.useRef = () => ({ current: refs.shift() })
  const tree = TimestampList({ points: route, activeIndex, onSelect: noop, onHide: noop })
  effects[0]()
  assert.equal(lastScroll.top, expectedTop)
  assert.equal(lastScroll.behavior, reducedMotion ? 'auto' : 'smooth')
  assert.equal(walk(tree).find(node => node.props?.['aria-current'] === 'true').props['aria-label'], `Play timestamp ${activeIndex + 1}, Test stop, at ${route[activeIndex].time}`)
}
follow(0, 0)
follow(50, 124)
follow(130, 444)
follow(190, 612) // Last row clamps to the end without adding blank space.
follow(20, 4) // Seeking backward follows the earlier timestamp.
reducedMotion = true
follow(100, 324)
container.clientHeight = 0
lastScroll = null
const followHidden = () => {
  effects.length = 0
  const refs = [container, rows, 0]
  mocks.react.useRef = () => ({ current: refs.shift() })
  TimestampList({ points: route, activeIndex: 0, onSelect: noop, onHide: noop })
  effects[0]()
}
followHidden()
assert.equal(lastScroll, null, 'Hidden mobile inline list must not scroll')
delete global.window
delete global.ResizeObserver
console.log('Timestamp tests passed: playback auto-scroll, forward/backward seeks, list-relative geometry, compact edges, reduced motion and mobile dialog.')
