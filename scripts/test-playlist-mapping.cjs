const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')
const jsx=(type,props)=>({type,props})
const walk=n=>!n?[]:Array.isArray(n)?n.flatMap(walk):typeof n==='object'?[n,...walk(n.props?.children)]:[]
function load(file,mocks={}){
 const code=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,name=>{assert.ok(name in mocks,name);return mocks[name]});return mod.exports
}
const helpers=load('lib/playlist-mapping.ts')
const playlist={id:'PL1234567890',items:['a','b','c'].map(youtubeId=>({youtubeId,title:youtubeId}))}
const owned=[{youtubeId:'a',id:'db-a'},{youtubeId:'c',id:'db-c'}]
const step=helpers.getPlaylistMappingStep(playlist,owned,'a')
assert.equal(step.next.id,'db-c','Follow playlist order, skipping videos not in owner library')
assert.equal(step.position,1);assert.equal(step.total,3)
assert.equal(helpers.getPlaylistMappingStep(playlist,owned,'c').next,null)
assert.equal(helpers.getPlaylistMappingStep(playlist,owned,'unknown'),null)
assert.equal(helpers.getVideoPlaylistId({tags:['creator','playlist:PL1234567890']}),'PL1234567890')
assert.equal(helpers.getVideoPlaylistId({tags:['playlist:bad?']}),undefined)
let states,cursor,saves,navigations,saveResult,effects=[],completionRequest=0
function render(){
 cursor=0;effects=[]
 const {PlaylistMappingControls}=load('components/creator/playlist-mapping-controls.tsx',{
  react:{memo:fn=>fn,useEffect:fn=>effects.push(fn),useRef:v=>({current:v}),useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]}},
  'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>({push:href=>navigations.push(href)})},
  '@radix-ui/react-dialog':new Proxy({},{get:(_,key)=>`Dialog${key}`}),
  '@/components/ui/button':{Button:'button'},'@/lib/creator-videos-cloud-client':{},'@/lib/playlist-mapping':helpers,
 })
 return PlaylistMappingControls({playlistId:playlist.id,youtubeId:'a',videoId:'db-a',completionRequest,saveBeforeNext:async()=>{saves++;return saveResult}})
}
async function main(){
 states=[step,false,false,'',false,'',0];saves=0;navigations=[];saveResult=false
 let tree=render();await walk(tree).find(n=>n.type==='button'&&String(n.props.children).includes('Finish video')).props.onClick()
 assert.equal(saves,1);assert.equal(states[4],false);assert.equal(navigations.length,0,'Failed save never advances')
 saveResult=true;tree=render();await walk(tree).find(n=>n.type==='button'&&String(n.props.children).includes('Finish video')).props.onClick()
 assert.equal(states[4],true);assert.equal(navigations.length,0,'Saving alone must not navigate')
 tree=render();walk(tree).find(n=>n.type==='button'&&n.props.children==='Creator dashboard').props.onClick();assert.equal(navigations.pop(),'/creator/dashboard','Saved map can return to creator dashboard');assert.ok(!walk(tree).some(n=>n.props?.children==='Stay here'));
 tree=render();const next=walk(tree).find(n=>n.type==='button'&&n.props.children==='Yes, map next video');next.props.onClick()
 assert.deepEqual(navigations,[helpers.playlistEditorHref('db-c',playlist.id,'db-a')])
 completionRequest=1;states=[step,false,false,'',false,'',0];render();const before=saves;effects.at(-1)();await Promise.resolve();await Promise.resolve();assert.equal(saves,before+1,'Successful upload completion opens the save-and-confirm flow');assert.equal(states[1],true);assert.equal(navigations.length,1,'Automatic prompt still waits for approval');
 states=[{...step,next:null},true,false,'',true,'',0];tree=render()
 assert.ok(!walk(tree).some(n=>n.props?.children==='Yes, map next video'),'Last video has no next action')
 walk(tree).find(n=>n.props?.children==='Back to playlist').props.onClick();assert.equal(navigations.at(-1),`/creator/playlists/${playlist.id}`,'Finished series returns to its dedicated playlist workspace')
 console.log('Playlist mapping passed: source tags, ordered owner-only queue, missing entries, last video, failed-save guard, confirmation before navigation, and playlist context retained.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
