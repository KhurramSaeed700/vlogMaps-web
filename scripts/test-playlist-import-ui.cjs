const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const source=fs.readFileSync('components/creator/playlist-importer.tsx','utf8')
const jsx=(type,props)=>({type,props})
const walk=n=>!n?[]:Array.isArray(n)?n.flatMap(walk):typeof n==='object'?[n,...walk(n.props?.children)]:[]
const ids=['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc']
const preview={id:'PL1234567890',title:'Trip',items:ids.map((youtubeId,position)=>({youtubeId,position,title:'Video '+position,creator:'Creator',channelId:''})),unavailableCount:0,truncated:false}
let states,cursor,uploads,known,failId,busyChanges,importedCallback
function render(){
 cursor=0
 const mod={exports:{}}
 const mocks={react:{useEffect(){},useRef:v=>({current:v}),useState:initial=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],next=>states[i]=typeof next==='function'?next(states[i]):next]}},
 'react/jsx-runtime':{jsx,jsxs:jsx},'next/image':{default:'image'},'next/link':{default:'link'},'lucide-react':{Loader2:'loader',ListVideo:'list'},'@/components/ui/button':{Button:'button'},
 '@/lib/playlist-mapping':{playlistEditorHref:(id,playlist)=>`/creator/video/${id}/edit?playlist=${playlist}`},
 '@/lib/youtube':{getYouTubeThumbnailUrl:id=>'https://img.youtube.com/vi/'+id+'/hqdefault.jpg'},
 '@/lib/creator-videos':{buildCreatorVideoStateSnapshot:()=>({points:[],tripRoute:[],routeShapes:{trip:[],timestampLegs:{}},savedPlaces:[]})},
 '@/lib/creator-videos-cloud-client':{
 fetchCreatorCloudVideos:async()=>({configured:true,videos:[...known].map(([youtubeId,id])=>({youtubeId,id}))}),
 uploadCreatorVideoToCloud:async(video,state)=>{uploads.push(video);assert.equal(video.status,'published');assert.equal(video.visibility,'private');assert.deepEqual(video.keyframes,[]);if(video.youtubeId===failId)throw Error('save failed');known.set(video.youtubeId,video.id);return {saved:true,video}}
 }}
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('module','exports','require',code)(mod,mod.exports,name=>{assert.ok(name in mocks,name);return mocks[name]})
 return mod.exports.PlaylistImporter({url:'test',onImported:v=>{importedCallback=v},onBusyChange:v=>busyChanges.push(v)})
}
async function main(){
 known=new Map([[ids[0],'existing-id']]);failId=ids[2];uploads=[];busyChanges=[]
 states=[preview,new Set(ids),new Map(),false,false,'',{done:0,total:0},0]
 let tree=render();let button=walk(tree).find(n=>n.type==='button'&&n.props.onClick?.name==='importVideos')
 await button.props.onClick()
 assert.deepEqual(uploads.map(v=>v.youtubeId),ids.slice(1),'Skip already saved videos at import time')
 assert.deepEqual([...states[1]],[ids[2]],'Keep only failed items selected for retry')
 assert.ok(states[5].includes('1 imported'));assert.ok(states[5].includes('1 failed'));assert.deepEqual(busyChanges,[true,false])
 assert.equal(importedCallback.length,2)
 failId=null;uploads=[]
 tree=render();button=walk(tree).find(n=>n.type==='button'&&n.props.onClick?.name==='importVideos');await button.props.onClick()
 assert.deepEqual(uploads.map(v=>v.youtubeId),[ids[2]])
 assert.equal(states[1].size,0);assert.equal(known.size,3)
 console.log('Playlist UI passed: private imports, library duplicate skipping, partial failures, retained selection, safe retry, busy cleanup, and refreshed creator library.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
