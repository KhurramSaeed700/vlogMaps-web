const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const oldWindow=global.window,oldNavigator=Object.getOwnPropertyDescriptor(global,'navigator'),oldNow=Date.now
let pending=null,revision=0,saved=[],effects=[],cleanups=[],offline=false,fail=false,clock=0,release
const wait=ms=>new Promise(r=>setTimeout(r,ms))
global.window={setTimeout,clearTimeout,addEventListener(){},removeEventListener(){}}
Object.defineProperty(global,'navigator',{configurable:true,value:{get onLine(){return !offline}}})
global.document={addEventListener(){},removeEventListener(){}}
Date.now=()=>clock
const mocks={
 react:{useRef:v=>({current:v}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)},
 '@/lib/monitoring/diagnostics':{diagnosticEvent(){},reportHandledError(){}},
 '@/lib/creator-video-state-local':{clearCreatorVideoStateLocalCache(){},saveCreatorVideoStateLocalCache:()=>true},
 '@/lib/creator-video-state-outbox':{
  savePendingCreatorVideoState:(_,state)=>(pending={revision:++revision,state}),
  loadPendingCreatorVideoState:()=>pending,
  clearPendingCreatorVideoState:(_,r)=>{if(pending?.revision!==r)return false;pending=null;return true},
 },
 '@/lib/creator-video-state-client':{saveCreatorVideoState:async(_,state)=>{saved.push(state);if(release!==null)await new Promise(r=>release=r);if(fail){clock+=16000;return null}return{configured:true,saved:true}}},
}
const source=fs.readFileSync('lib/use-creator-video-state-autosave.ts','utf8')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,name=>{assert.ok(name in mocks,name);return mocks[name]})
const hook=mod.exports.useCreatorVideoStateAutosave({videoId:'video-a',onStatusChange(){}})
effects.forEach(fn=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup)})
async function main(){
 release=undefined
 const done=hook.saveAndWait({points:['first']})
 await wait(20);assert.equal(typeof release,'function')
 hook.saveState({points:['latest']})
 const resume=release;release=null;resume()
 assert.equal(await done,true)
 assert.deepEqual(saved.map(s=>s.points),[['first'],['latest']],'Wait for superseding edits through the same serialized writer')
 assert.equal(pending,null)
 offline=true;assert.equal(await hook.saveAndWait({points:['offline']}),false);offline=false
 fail=true;assert.equal(await hook.saveAndWait({points:['retry']}),false,'Do not advance after an unconfirmed save')
 assert.deepEqual(pending.state.points,['retry'],'Keep failed saves in the outbox')
 console.log('Playlist save-before-next passed: serialized saves, newer revisions, offline guard, timeout/failure guard and preserved pending edits.')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{cleanups.forEach(fn=>fn());global.window=oldWindow;if(oldNavigator)Object.defineProperty(global,'navigator',oldNavigator);else delete global.navigator;Date.now=oldNow})
