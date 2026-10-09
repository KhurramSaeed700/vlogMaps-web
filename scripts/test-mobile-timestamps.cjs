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
  '@/components/ui/button': { Button: 'Button' },
  '@/components/ui/split-view-resizer': { SplitViewResizer: 'Resizer' },
  '@/components/maps/mapbox-travel-map': { MapboxTravelMap: 'Map' },
  '@/components/media/autoplay-countdown': { AutoplayCountdown: 'Countdown', autoplayCountdownSeconds: 3 },
  '@/components/media/youtube-player': { YouTubePlayer: 'Player' },
  '@/components/settings/navigation-settings-section': { NavigationSettingsSection: 'Navigation' },
  '@/components/settings/playback-settings-section': { PlaybackSettingsSection: 'Playback' },
  '@/lib/demo-data': { formatDuration: String },
  '@/lib/flight-path': { getFlightRouteKeyframes: points => points },
  '@/lib/creator-points': { loadCreatorPoints: () => points, getInterpolatedPointAtTime: points => points[0] },
  '@/lib/creator-route-shapes': { loadCreatorRouteShapes: () => ({}) },
  '@/lib/use-navigation-preferences': { useNavigationPreferences: () => ({ preferences: {}, updatePreferences: noop }) },
  '@/lib/use-playback-preferences': { usePlaybackPreferences: () => ({ preferences: {}, updatePreferences: noop }) },
}
const source = fs.readFileSync(path.join(__dirname, '../components/viewer/watch-experience.tsx'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
const moduleUnderTest = { exports: {} }
new Function('module', 'exports', 'require', code + ';exports.TimestampList = WatchTimestampList;')(
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
console.log('Mobile timestamps passed: hidden inline list, icon-only trigger, fullscreen dialog, seek-and-close and one persistent map.')
