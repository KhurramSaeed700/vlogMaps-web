const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file,mocks={}) {
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const mod={exports:{}}
  new Function('module','exports','require',code)(mod,mod.exports,name=>{assert.ok(name in mocks,name);return mocks[name]})
  return mod.exports
}
const helpers=load('lib/editor-tool-practice.ts')
const {createEditorPracticeState,editorPracticeReducer,matchesEditorPracticeKey}=helpers
const homePlacement=load('lib/home-tour.ts')
const {getGuidedTourPlacement}=load('lib/guided-tour.ts',{'@/lib/home-tour':homePlacement})
const practicePanel=getGuidedTourPlacement({top:400,bottom:432,left:16,width:100},{width:390,height:844},600,true)
assert.equal(practicePanel.maxHeight,600,'Keep the keyboard prompt and practice map visible together on a phone')
assert.ok(practicePanel.top>=16 && practicePanel.top+practicePanel.maxHeight<=828)
const keyEvent=(key,extra={})=>({key:key.toLowerCase(),code:`Key${key}`,repeat:false,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,...extra})
for(const [kind,key] of [['point','Q'],['stop','W'],['stop-end','W']]){
  assert.equal(matchesEditorPracticeKey(kind,keyEvent(key)),true)
  assert.equal(matchesEditorPracticeKey(kind,keyEvent('F')),false)
  for(const flag of ['repeat','ctrlKey','metaKey','altKey','shiftKey','isComposing']) assert.equal(matchesEditorPracticeKey(kind,keyEvent(key,{[flag]:true})),false,flag)
  let state=createEditorPracticeState(kind)
  assert.equal(editorPracticeReducer(state,{type:'place',x:10,y:20}),state,'Map placement must wait for the shortcut')
  state=editorPracticeReducer(state,{type:'key'})
  if(kind==='stop-end'){
    assert.equal(state.phase,'done');assert.deepEqual(state.marker,{x:50,y:50})
  }else{
    assert.equal(state.phase,'place')
    assert.equal(editorPracticeReducer(state,{type:'key'}),state,'A repeated key cannot bypass map placement')
    state=editorPracticeReducer(state,{type:'place',x:-20,y:120})
    assert.equal(state.phase,'done');assert.deepEqual(state.marker,{x:8,y:82},'Keep the practice marker in bounds')
  }
  assert.deepEqual(editorPracticeReducer(state,{type:'reset'}),createEditorPracticeState(kind))
}
const jsx=(type,props)=>({type,props})
const walk=node=>!node?[]:Array.isArray(node)?node.flatMap(walk):typeof node==='object'?[node,...walk(node.props?.children)]:[]
const effects=[];let state,cursor=0
const listeners=[]
global.HTMLElement=class {constructor(typing=false){this.typing=typing}closest(){return this.typing}}
global.window={addEventListener:(...args)=>listeners.push(args),removeEventListener:(...args)=>listeners.push(['removed',...args])}
const {EditorToolPractice}=load('components/creator/editor-tool-practice.tsx',{
  react:{useReducer:(reducer,kind,init)=>{if(!state)state=init(kind);return[state,action=>{state=reducer(state,action)}]},useRef:()=>({current:null}),useEffect:fn=>{if(cursor++<2)effects.push(fn)}},
  'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{Check:'Check',MapPin:'MapPin'},
  '@/components/ui/button':{Button:'Button'},'@/lib/editor-tool-practice':helpers,
})
const render=()=>walk(EditorToolPractice({kind:'point'}))
let nodes=render()
const cleanups=effects.map(effect=>effect())
const keyboard=listeners.find(([name])=>name==='keydown')
assert.equal(keyboard[2],true,'Practice intercepts its shortcut before the real editor')
let prevented=0,stopped=0
const press=(key,extra={})=>keyboard[1]({...keyEvent(key),target:new HTMLElement(),preventDefault(){prevented++},stopPropagation(){stopped++},...extra})
press('W');press('Q',{target:new HTMLElement(true)});press('Q',{ctrlKey:true})
assert.equal(state.phase,'key','Other shortcuts and typing must be left alone')
press('Q')
assert.equal(state.phase,'place');assert.equal(prevented,1);assert.equal(stopped,1)
nodes=render()
const map=nodes.find(node=>node.type==='button')
map.props.onClick({detail:0,currentTarget:{getBoundingClientRect:()=>({left:0,top:0,width:280,height:96})}})
assert.equal(state.phase,'done');assert.deepEqual(state.marker,{x:50,y:50},'Keyboard activation can place the sample at the map center')
nodes=render()
assert.ok(nodes.find(node=>node.props?.role==='status').props.children.includes('Point added'))
nodes.find(node=>node.props?.children==='Try again').props.onClick()
assert.equal(state.phase,'key')
for(const cleanup of cleanups)cleanup?.()
assert.ok(listeners.some(([event,name])=>event==='removed'&&name==='keydown'),'Remove the practice listener on unmount')
delete global.window;delete global.HTMLElement
console.log('Editor practice passed: Q/W workflows, ordered placement, stop completion, modifiers/typing ignored, shortcut isolation, accessible map activation, reset, and listener cleanup.')
