const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
let state=null,effect,cleanup,timer,delay
const react={useState:()=>[state,value=>state=typeof value==='function'?value(state):value],useCallback:fn=>fn,useEffect:fn=>effect=fn}
global.window={setTimeout(fn,ms){timer=fn;delay=ms;return 1},clearTimeout(){timer=null}}
const moduleResult={exports:{}}
const source=ts.transpileModule(fs.readFileSync('components/maps/preview-replay.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
new Function('module','exports','require',source)(moduleResult,moduleResult.exports,name=>({react,'react/jsx-runtime':{jsx(){},jsxs(){}},'lucide-react':{},'@/components/ui/button':{}})[name])
const render=()=>moduleResult.exports.usePreviewReplayOffer()
assert.equal(render().visible,false,'Do not show before automatic tracking')
render().offer();assert.equal(render().visible,true);cleanup=effect();assert.equal(delay,10000)
timer();assert.equal(render().visible,false,'Offer disappears after ten seconds')
render().offer();render();cleanup=effect();render().dismiss();assert.equal(render().visible,false,'Replay consumes the offer');cleanup();assert.equal(timer,null,'Dismissal/unmount cleans the timeout')
render().offer();assert.equal(render().visible,true,'A completed replay can offer another replay')
const watch=fs.readFileSync('components/maps/mapbox-travel-map.tsx','utf8')
const editor=fs.readFileSync('components/maps/mapbox-location-picker.tsx','utf8')
assert.match(watch,/startTrackingFromRouteIntroRef.current\(\)\s*previewReplay.offer\(\)/)
assert.doesNotMatch(editor,/PreviewReplayButton|usePreviewReplayOffer|previewReplay/,'Replay offer belongs only on the watch page')
// Exercise the watch replay handoff without touching playback or its clock.
const replaySource=watch.slice(watch.indexOf('  const replayRouteIntro ='),watch.indexOf('  startTrackingFromRouteIntroRef.current ='))
const events=[];const ref=current=>({current})
const dependencies={mapInstanceRef:ref({}),markerRef:ref({}),hasUsableMapSize:()=>true,canUpdateCamera:()=>true,previewReplay:{dismiss:()=>events.push('dismiss')},routeIntroDismissedRef:ref(true),routeIntroAutoStartCancelledRef:ref(true),setIsRouteIntroAutoStartCancelled:v=>events.push(['cancelled',v]),isFollowingRef:ref(true),updateTrackingEnabled:v=>events.push(['tracking',v]),latestPlaybackTimeRef:ref(123),liveRouteCoordinateRef:ref([1,2]),beginRouteIntroPreview:(map,time,coord)=>{events.push(['preview',time,coord]);return true},startTrackingFromRouteIntro:()=>events.push('restore')}
const fn=new Function(...Object.keys(dependencies),ts.transpileModule(replaySource,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText+';return replayRouteIntro')(...Object.values(dependencies))
fn();assert.equal(dependencies.routeIntroDismissedRef.current,false);assert.equal(dependencies.isFollowingRef.current,false);assert.ok(events.some(e=>Array.isArray(e)&&e[0]==='preview'&&e[1]===123),'Preview hands back to current playback; video is not rewound')
assert.ok(!events.includes('restore'))
delete global.window
console.log('Preview replay passed: auto-tracking offer, ten-second expiry, dismissal, cleanup, Watch-only placement and current-playback handoff.')
