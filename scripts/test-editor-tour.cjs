const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const sourceOf = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8')
function load(file, deps={}) {
  const code=ts.transpileModule(sourceOf(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const mod={exports:{}}
  new Function('module','exports','require',code)(mod,mod.exports,name=>{assert.ok(name in deps,name);return deps[name]})
  return mod.exports
}
const values=new Map()
const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}
const home=load('lib/home-tour.ts'), watch=load('lib/watch-tour.ts')
let editor=load('lib/editor-tour.ts')
home.markHomeTourSeen(storage);watch.markWatchTourSeen(storage)
assert.equal(editor.hasSeenEditorTour(storage),false,'Other tours must not hide editor onboarding')
editor.markEditorTourSeen(storage)
editor=load('lib/editor-tour.ts')
assert.equal(editor.hasSeenEditorTour(storage),true,'Dismissal survives a fresh session')
editor=load('lib/editor-tour.ts')
const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}
assert.equal(editor.hasSeenEditorTour(blocked),false)
editor.markEditorTourSeen(blocked)
assert.equal(editor.hasSeenEditorTour(blocked),true)
const steps=editor.editorTourSteps
assert.equal(steps.length,21)
assert.equal(new Set(steps.map(step=>step.section)).size,6)
const jsx=(type,props)=>({type,props})
const walk=node=>!node?[]:Array.isArray(node)?node.flatMap(walk):typeof node==='object'?[node,...walk(node.props?.children)]:[]
const states=[];let cursor=0
const noop=()=>{}
const mocks={
  react:{useMemo:fn=>fn(),useCallback:fn=>fn,useRef:current=>({current}),useEffect:noop,useLayoutEffect:noop,
    useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]},
  },
  'react/jsx-runtime':{jsx,jsxs:jsx},
  '@radix-ui/react-dialog':new Proxy({},{get:(_,key)=>`Dialog${key}`}),
  'lucide-react':new Proxy({},{get:(_,key)=>key}),
  '@/components/ui/button':{Button:'button'},
  '@/components/ui/tour-step-preview': { TourStepPreview: 'TourStepPreview' },
  '@/lib/guided-tour':{getGuidedTourPlacement:noop},
}
const {GuidedTour}=load('components/ui/guided-tour.tsx',mocks)
const changes=[]
const props={enabled:true,steps,startEvent:'editor-tour',hasSeen:()=>false,markSeen:noop,focusReturnSelector:'button',onOpenChange:value=>changes.push(value)}
const render=()=>{cursor=0;return walk(GuidedTour(props))}
let nodes=render()
const modalKeyDown=nodes.find(node=>node.type==='DialogContent').props.onKeyDown
let shortcutsBlocked=0
modalKeyDown({key:'q',stopPropagation:()=>shortcutsBlocked++})
modalKeyDown({key:'f',stopPropagation:()=>shortcutsBlocked++})
modalKeyDown({key:'Escape',stopPropagation:()=>shortcutsBlocked++})
assert.equal(shortcutsBlocked,2,'Modal blocks page shortcuts while keeping Escape available to dismiss')
const chapter=()=>nodes.find(n=>n.type==='select')
assert.equal(walk(chapter()).filter(n=>n.type==='option').length,6)
chapter().props.onChange({target:{value:'6'}})
nodes=render()
assert.equal(nodes.find(n=>n.type==='DialogTitle').props.children,'Record when a stop begins')
nodes.find(n=>n.props?.['aria-label']==='Previous tutorial step').props.onClick()
nodes=render()
assert.equal(nodes.find(n=>n.type==='DialogTitle').props.children,'Identify an unfamiliar landmark')
assert.equal(chapter().props.value,3,'Back also updates the selected chapter')
chapter().props.onChange({target:{value:'17'}})
nodes=render()
for(let i=17;i<21;i++){
  const next=nodes.find(n=>n.type==='button'&&['Next tip','Got it'].includes(n.props.children))
  assert.ok(next)
  next.props.onClick();nodes=render()
}
assert.deepEqual(changes,[false],'Last step completes the tutorial')
const editorSource=sourceOf('components/creator/creator-video-editor.tsx')
const ast=ts.createSourceFile('editor.tsx',editorSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
function initializer(name){let found;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)found=n.initializer.getText(ast);ts.forEachChild(n,visit)}visit(ast);assert.ok(found,name);return found}
function evaluate(expression,deps){const code=ts.transpileModule(`const value = ${expression}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function(...Object.keys(deps),code+';return value')(...Object.values(deps))}
for(const playing of [false,true]){
  const calls=[],scroll=[]
  const deps={useCallback:fn=>fn,editorTourOpenRef:{current:false},playbackIntentRef:{current:playing},playbackBeforeTourRef:{current:false},scrollBeforeTourRef:{current:null},editorScrollRef:{current:{scrollTop:73,scrollTo:value=>scroll.push(value.top)}},window:{scrollY:111,requestAnimationFrame:fn=>fn(),scrollTo:value=>scroll.push(value.top)},setIsEditorTourOpen:v=>calls.push(['tour',v]),setIsPlaying:v=>calls.push(['playing',v])}
  const change=evaluate(initializer('handleEditorTourOpenChange'),deps)
  change(true);change(true);change(false)
  assert.deepEqual(calls,[['tour',true],['playing',false],['tour',false],...(playing?[['playing',true]]:[])])
  assert.deepEqual(scroll,[73,111],'Closing restores the original panel and page scroll positions')
}
const keyboard=evaluate(initializer('handleKeyDown'),{editorTourOpenRef:{current:true},editorShortcutStateRef:{get current(){throw Error('Editing shortcut read during tour')}}})
keyboard({code:'KeyQ'});keyboard({code:'Escape'})
const effectBody=editorSource.slice(editorSource.indexOf('    if (resumeCountdown === null || isEditorTourOpen)'),editorSource.indexOf('  }, [resumeCountdown, isEditorTourOpen])'))
assert.ok(effectBody)
for(const touring of [false,true]){
  const changes=[];let tick
  const effect=evaluate(`() => {${effectBody}}`,{resumeCountdown:1,isEditorTourOpen:touring,resumeCountdownTickSeconds:1,window:{setTimeout:fn=>{tick=fn;return 1},clearTimeout:noop},setResumeCountdown:v=>changes.push(['countdown',v]),setIsPlaying:v=>changes.push(['playing',v])})
  effect();if(tick)tick()
  assert.deepEqual(changes,touring?[]:[['countdown',null],['playing',true]],'Autoplay must wait until the guide closes')
}
console.log('Editor tutorial passed: independent persistence, blocked storage, six chapters, chapter navigation, completion, playback restoration, scroll restoration, shortcut guard, and countdown suspension.')
