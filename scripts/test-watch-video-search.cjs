const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file,mocks={}) {
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const mod={exports:{}}
  new Function('module','exports','require',code)(mod,mod.exports,name=>{assert.ok(name in mocks,name);return mocks[name]})
  return mod.exports
}
const {extractYouTubeId}=load('lib/youtube.ts')
const states=[];let cursor=0,pending=false
const navigation=[],submitted=[]
const jsx=(type,props)=>({type,props})
const walk=node=>!node?[]:Array.isArray(node)?node.flatMap(walk):typeof node==='object'?[node,...walk(node.props?.children)]:[]
const {WatchVideoSearch}=load('components/viewer/watch-video-search.tsx',{
  react:{memo:fn=>fn,useId:()=> 'search-error',useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=v}]},useTransition:()=>[pending,fn=>fn()]},
  'react/jsx-runtime':{jsx,jsxs:jsx},
  'next/navigation':{useRouter:()=>({push:href=>navigation.push(href)})},
  'lucide-react':{Search:'Search',ChevronRight:'ChevronRight',Loader2:'Loader2'},
  '@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},
  '@/lib/creator-videos':{createInstantWatchVideo:({youtubeUrl})=>{submitted.push(youtubeUrl);const id=extractYouTubeId(youtubeUrl);if(!id)throw Error('Paste a valid YouTube URL.');return{id:`instant-${id}`}}},
})
const render=()=>{cursor=0;return walk(WatchVideoSearch())}
let nodes=render()
const input=()=>nodes.find(node=>node.type==='input')
const submit=()=>nodes.find(node=>node.type==='form').props.onSubmit({preventDefault(){}})
input().props.onChange({target:{value:'not a video'}});nodes=render();submit();nodes=render()
assert.equal(navigation.length,0,'Invalid input must not interrupt the current video')
assert.equal(input().props['aria-invalid'],true)
assert.equal(input().props['aria-describedby'],'search-error')
assert.equal(nodes.find(n=>n.props?.role==='alert').props.children,'Paste a valid YouTube URL.')
input().props.onChange({target:{value:'  https://youtu.be/Mz4ENLvV1HE  '}});nodes=render()
assert.equal(nodes.some(n=>n.props?.role==='alert'),false,'Editing clears stale errors')
submit()
assert.equal(submitted.at(-1),'https://youtu.be/Mz4ENLvV1HE')
assert.deepEqual(navigation,['/watch/instant-Mz4ENLvV1HE'])
pending=true;nodes=render()
assert.equal(nodes.find(n=>n.type==='button').props.disabled,true,'Prevent duplicate launches during navigation')
console.log('Watch video search passed: invalid-link recovery, accessible errors, whitespace trimming, YouTube navigation, and pending state.')
