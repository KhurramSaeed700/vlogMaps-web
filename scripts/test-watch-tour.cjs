const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, deps = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText
  const mod = {exports:{}}
  new Function('module', 'exports', 'require', code)(mod, mod.exports, name => {assert.ok(name in deps, name); return deps[name]})
  return mod.exports
}
const home = load('lib/home-tour.ts')
let watch = load('lib/watch-tour.ts')
const values = new Map()
const storage = {getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value)}
assert.equal(watch.hasSeenWatchTour(storage), false)
home.markHomeTourSeen(storage)
assert.equal(watch.hasSeenWatchTour(storage), false, 'Home completion must not suppress the watch guide')
watch.markWatchTourSeen(storage)
watch = load('lib/watch-tour.ts')
assert.equal(watch.hasSeenWatchTour(storage), true, 'Watch dismissal persists across sessions and videos')
watch = load('lib/watch-tour.ts')
const blocked = {getItem() {throw Error('blocked')}, setItem() {throw Error('blocked')}}
assert.equal(watch.hasSeenWatchTour(blocked), false)
watch.markWatchTourSeen(blocked)
assert.equal(watch.hasSeenWatchTour(blocked), true, 'Blocked writes still remember dismissal in this session')
const {getGuidedTourPlacement} = load('lib/guided-tour.ts', {'@/lib/home-tour':home})
for (const [viewport,target,side] of [
  [{width:1920,height:1080},{top:56,bottom:1080,left:960,width:960},'left'],
  [{width:1920,height:1080},{top:56,bottom:1080,left:0,width:960},'right'],
  [{width:390,height:844},{top:275,bottom:844,left:0,width:390},'floating'],
  [{width:320,height:568},{top:230,bottom:568,left:0,width:320},'floating'],
]) {
  const p = getGuidedTourPlacement(target,viewport,340)
  assert.equal(p.side,side)
  assert.ok(p.left >= 16 && p.left+p.width <= viewport.width-16)
  assert.ok(p.top >=16 && p.top+p.maxHeight <= viewport.height-16)
  assert.ok(p.maxHeight >= Math.min(340, viewport.height-32), 'Large targets must not collapse the callout')
}
console.log('Watch tour passed: independent persistent dismissal, blocked storage, and readable desktop/mobile map callouts.')
const experience = fs.readFileSync(path.join(__dirname, '../components/viewer/watch-experience.tsx'), 'utf8')
const start = experience.indexOf('  const handleWatchTourOpenChange = useCallback(')
const end = experience.indexOf('\n  const [hasEnded', start)
assert.ok(start > 0 && end > start)
const callbackCode = ts.transpileModule(experience.slice(start,end), {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
for (const originallyPlaying of [false,true]) {
  const changes = []
  const deps = {
    useCallback: fn => fn,
    watchTourOpenRef:{current:false}, playbackBeforeTourRef:{current:false}, playbackIntentRef:{current:originallyPlaying},
    setIsWatchTourOpen: value => changes.push(['tour',value]), setIsPlaying: value => changes.push(['playing',value]),
  }
  const change = new Function(...Object.keys(deps), callbackCode+';return handleWatchTourOpenChange')(...Object.values(deps))
  change(true)
  change(true)
  change(false)
  assert.deepEqual(changes, [['tour',true],['playing',false],['tour',false],...(originallyPlaying ? [['playing',true]] : [])], 'Tour pauses playback, ignores duplicate opening, and restores only an originally playing video')
}
console.log('Watch tour playback passed: pause, duplicate callbacks, and prior playing/paused intent.')
