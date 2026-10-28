const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')
const jsx=(type,props)=>({type,props})
const walk=n=>!n?[]:Array.isArray(n)?n.flatMap(walk):typeof n==='object'?[n,...walk(n.props?.children)]:[]
const text=n=>!n?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n)
function load(file,mocks={}){
 const code=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,name=>{assert.ok(name in mocks,name);return mocks[name]});return mod.exports
}
const helpers=load('lib/playlist-mapping.ts')
const mapping=load('lib/video-mapping-status.ts')
const preview={id:'PL1234567890',items:['a','b','c'].map(youtubeId=>({youtubeId,title:youtubeId}))}
const step=helpers.getPlaylistMappingStep(preview,[{youtubeId:'a',id:'db-a'},{youtubeId:'c',id:'db-c'}],'a')
assert.equal(step.next.id,'db-c');assert.equal(step.position,1);assert.equal(step.total,3)
assert.equal(helpers.getVideoPlaylistId({tags:['playlist:PL1234567890']}),'PL1234567890')
assert.equal(helpers.getVideoPlaylistId({tags:['playlist:bad?']}),undefined)
const playlist={id:preview.id,title:'Travel series',videos:[
 {id:'db-a',youtubeId:'a',title:'First episode',keyframes:[],durationSeconds:600},
 {id:'db-b',youtubeId:'b',title:'Second episode',keyframes:[{time:50}],durationSeconds:600},
 {id:'db-c',youtubeId:'c',title:'Third episode',keyframes:[{time:590}],durationSeconds:600},
 {id:'readonly',youtubeId:'d',title:'Read only episode',keyframes:[],durationSeconds:600,viewerCanEdit:false},
]}
let states,refs,cursor,refCursor,saves,navigations,saveResult,effects,fetchResponse
function reset(){states=[playlist,false,null,'','',0,'',''];refs=[];saves=0;navigations=[];saveResult=true;fetchResponse={configured:true,videos:playlist.videos}}
function render(extra={}){
 cursor=0;refCursor=0;effects=[]
 const {PlaylistMappingControls}=load('components/creator/playlist-mapping-controls.tsx',{
  react:{memo:fn=>fn,useMemo:fn=>fn(),useEffect:fn=>effects.push(fn),useRef:v=>{const i=refCursor++;return refs[i]??(refs[i]={current:v})},useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]}},
  'react-dom':{createPortal:node=>node},'lucide-react':new Proxy({},{get:(_,key)=>key}),'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>({push:href=>navigations.push(href)})},
  '@radix-ui/react-dialog':new Proxy({},{get:(_,key)=>`Dialog${key}`}),
  '@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},
  '@/lib/creator-videos-cloud-client':{fetchCreatorCloudVideos:async()=>fetchResponse},'@/lib/creator-playlists':{groupCreatorPlaylists:()=>({playlists:[playlist]})},'@/lib/playlist-mapping':helpers,'@/lib/video-mapping-status':mapping,'@/lib/demo-data':{formatDuration:seconds=>String(seconds)},
 })
 return PlaylistMappingControls({playlistId:playlist.id,youtubeId:'b',videoId:'db-b',...extra,saveBeforeNext:async()=>{saves++;return typeof saveResult==='function'?saveResult():saveResult}})
}
const button=(tree,label)=>walk(tree).find(n=>n.type==='button'&&n.props['aria-label']===label)
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
async function main(){
 reset();let tree=render()
 assert.ok(button(tree,'Choose playlist video to edit'))
 assert.ok(!text(tree).includes('Finish video'),'Navbar replaces finish action')
 assert.ok(text(tree).includes('2/4'),'Manually opened middle episode has correct position')
 assert.equal(button(tree,'Edit Second episode').props['aria-current'],'true')
 assert.ok(text(tree).includes('Mapped')&&text(tree).includes('Mapping')&&text(tree).includes('Not mapped'))
 assert.equal(button(tree,'Edit Read only episode').props.disabled,true)
 await button(tree,'Edit Second episode').props.onClick();assert.equal(saves,0,'Selecting current episode does not save/navigate')
 saveResult=false;tree=render();await button(tree,'Edit Third episode').props.onClick();await flush()
 assert.equal(navigations.length,0,'Failed save never changes episode');assert.ok(states[3].includes('Finish placing'));assert.equal(states[1],true)
 saveResult=true;tree=render();await button(tree,'Edit Third episode').props.onClick();await flush()
 assert.deepEqual(navigations,[helpers.playlistEditorHref('db-c',playlist.id,'db-b')],'Next episode saves and retains continuity context')
 tree=render();await button(tree,'Edit First episode').props.onClick();await flush()
 assert.equal(navigations.at(-1),helpers.playlistEditorHref('db-a',playlist.id),'Jumping backwards does not seed the wrong episode endpoint')
 tree=render();const input=walk(tree).find(n=>n.type==='input');input.props.onChange({target:{value:'Third'}})
 tree=render();assert.ok(button(tree,'Edit Third episode'));assert.ok(!button(tree,'Edit First episode'),'Search filters full playlist')
 reset();tree=render({currentMappingStatus:'mapped'});assert.ok(text(tree).includes('2 mapped'),'Current map changes update summary without library reload')
 reset();saveResult=()=>{throw Error('offline')};tree=render();await button(tree,'Edit next playlist video').props.onClick();await flush();assert.equal(navigations.length,0);assert.equal(states[3],'offline')
 reset();let finishSave;saveResult=()=>new Promise(resolve=>finishSave=resolve);tree=render();button(tree,'Edit Third episode').props.onClick();button(tree,'Edit First episode').props.onClick();assert.equal(saves,1,'Repeated clicks cannot start concurrent navigation');finishSave(true);await flush()
 reset();const overlay={videoEnded:true,overlayTarget:{}}
 const endButton=tree=>walk(tree).find(n=>n.type==='button'&&text(n)==='Map next video')
 assert.ok(!endButton(render()));tree=render(overlay);assert.ok(endButton(tree))
 saveResult=false;await endButton(tree).props.onClick();await flush();assert.equal(navigations.length,0);assert.ok(states[7])
 saveResult=true;tree=render(overlay);await endButton(tree).props.onClick();await flush();assert.equal(navigations[0],helpers.playlistEditorHref('db-c',playlist.id,'db-b'))
 assert.ok(!endButton(render({...overlay,videoId:'readonly',youtubeId:'d'})),'Last episode has no next overlay')
 assert.equal(button(render({videoId:'db-a',youtubeId:'a'}),'Edit previous playlist video').props.disabled,true)
 reset();states[0]=null;render();const cleanup=effects[0]();await flush();assert.equal(states[0].title,playlist.title,'All imported playlist types load from creator library without YouTube');cleanup()
 reset();fetchResponse={configured:true,videos:[],error:'offline'};render();effects[0]();await flush();assert.ok(states[4]);assert.ok(button(render(),'Choose playlist video to edit'),'Retry remains accessible after load error')
 reset();states[0]=null;render();const abort=effects[0]();abort();await flush();assert.equal(states[0],null,'Unmount cancels stale library response')
 const realSetTimeout=global.setTimeout,realClearTimeout=global.clearTimeout
 let scheduled=null,delay,cancelled=0
 global.setTimeout=(fn,ms)=>{scheduled=fn;delay=ms;return 123}
 global.clearTimeout=id=>{assert.equal(id,123);scheduled=null;cancelled++}
 try {
  reset();tree=render(overlay)
  const fill=walk(tree).find(n=>n.props?.className?.includes('route-intro-countdown-fill'))
  assert.equal(fill.props.style.animationDuration,'5000ms','Fill animation lasts five seconds')
  const cancelTimer=effects.at(-1)();assert.equal(delay,5000);assert.equal(saves,0)
  scheduled();await flush();assert.equal(saves,1);assert.equal(navigations[0],helpers.playlistEditorHref('db-c',playlist.id,'db-b'),'Countdown saves and opens next episode')
  cancelTimer();assert.equal(scheduled,null)
  reset();render(overlay);const cancelReplay=effects.at(-1)();cancelReplay();assert.equal(scheduled,null,'Replay/unmount clears countdown')
  reset();states[1]=true;render(overlay);assert.equal(effects.at(-1)(),undefined,'Choosing another episode pauses automatic advance')
  reset();tree=render(overlay);effects.at(-1)();const staleTimer=scheduled
  await endButton(tree).props.onClick();await flush();staleTimer();await flush();assert.equal(saves,1,'Early click cannot race countdown')
  reset();saveResult=false;render(overlay);effects.at(-1)();scheduled();await flush()
  assert.equal(navigations.length,0);assert.ok(states[7],'Failed automatic save stays in editor with an error')
  render(overlay);assert.equal(effects.at(-1)(),undefined,'Failed save is not automatically retried')
 } finally {global.setTimeout=realSetTimeout;global.clearTimeout=realClearTimeout}
 console.log('Editor playlist passed: library loading, manual middle entry, full chooser, mapping statuses, search, save-before-switch, failure guards, concurrency, read-only episodes, next/previous bounds, end overlay, five-second auto advance, cancellation, retry and abort.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
