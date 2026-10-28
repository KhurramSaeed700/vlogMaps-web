const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(file,mocks={}){
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,key=>{assert.ok(key in mocks,key);return mocks[key]});return m.exports
}
const api=load('lib/map-style-preferences.ts')
assert.equal(api.readDefaultMapStyle(),'streets','SSR uses safe default')
const values=new Map(),listeners=new Map()
const dispatch=event=>{for(const fn of [...(listeners.get(event.type)||[])])fn(event)}
global.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},addEventListener:(type,fn)=>{const group=listeners.get(type)||new Set();group.add(fn);listeners.set(type,group)},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),dispatchEvent:dispatch}
for(const style of api.mapStyles){api.writeDefaultMapStyle(style);assert.equal(api.readDefaultMapStyle(),style)}
values.set(api.mapStyleStorageKey,'invalid');assert.equal(api.readDefaultMapStyle(),'streets')
api.writeDefaultMapStyle('satellite')
function createHook(){
 let state,effect
 const react={useState:initial=>{if(state===undefined)state=typeof initial==='function'?initial():initial;return[state,value=>state=value]},useEffect:fn=>effect=fn}
 const hook=load('lib/use-map-style-preference.ts',{react,'@/lib/map-style-preferences':api})
 return {render:()=>hook.useMapStylePreference(),subscribe:()=>effect()}
}
const watch=createHook(),edit=createHook(),settings=createHook()
assert.equal(watch.render().style,'streets');assert.equal(watch.render().ready,false,'SSR and hydration match before preferences load');edit.render();settings.render()
const cleanups=[watch.subscribe(),edit.subscribe(),settings.subscribe()]
assert.equal(watch.render().style,'satellite');assert.equal(edit.render().style,'satellite');assert.equal(edit.render().ready,true)
watch.render().setStyle('terrain');assert.equal(watch.render().style,'terrain');assert.equal(api.readDefaultMapStyle(),'satellite','Quick picker does not overwrite default');assert.equal(edit.render().style,'satellite')
settings.render().saveDefaultStyle('streets');assert.equal(watch.render().style,'streets');assert.equal(edit.render().style,'streets','Settings updates both open maps')
values.set(api.mapStyleStorageKey,'terrain');dispatch({type:'storage',key:api.mapStyleStorageKey});assert.equal(watch.render().style,'terrain');assert.equal(edit.render().style,'terrain','Other-tab changes apply')
values.clear();dispatch({type:'storage',key:null});assert.equal(watch.render().style,'streets','Clearing storage resets defaults')
window.localStorage.setItem=()=>{throw Error('blocked')};settings.render().saveDefaultStyle('satellite');assert.equal(edit.render().style,'satellite','Storage failure still applies in current tab')
window.localStorage.getItem=()=>{throw Error('blocked')};assert.equal(api.readDefaultMapStyle(),'streets','Unavailable storage fails safely')
const jsx=(type,props)=>({type,props}),walk=n=>!n?[]:Array.isArray(n)?n.flatMap(walk):typeof n==='object'?[n,...walk(n.props?.children)]:[]
const control=load('components/settings/default-map-style-setting.tsx',{react:{useId:()=>':test:'},'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{Map:'svg',Mountain:'svg',Satellite:'svg'},'@/lib/use-map-style-preference':{useMapStylePreference:()=>settings.render()}})
let inputs=walk(control.DefaultMapStyleSetting({})).filter(n=>n.type==='input');assert.equal(inputs.length,3);assert.equal(inputs.filter(n=>n.props.checked).length,1)
inputs.find(n=>n.props.value==='terrain').props.onChange();assert.equal(edit.render().style,'terrain','Settings radio writes actual preference')
for(const cleanup of cleanups)cleanup();assert.ok([...listeners.values()].every(group=>group.size===0),'Subscriptions clean up')
for(const file of ['mapbox-travel-map','mapbox-location-picker'])assert.match(fs.readFileSync(`components/maps/${file}.tsx`,'utf8'),/style: mapStyle, ready: isMapStylePreferenceReady, setStyle: setMapStyle } = useMapStylePreference\(\)/)
assert.match(fs.readFileSync('components/settings/playback-settings-section.tsx','utf8'),/<DefaultMapStyleSetting tone=\{tone\}/)
delete global.window
console.log('Default map style passed: all choices, persistence, SSR, invalid/unavailable storage, Watch/Edit synchronization, local overrides, cross-tab changes, radio selection and cleanup.')
