const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const jsx = (type,props) => typeof type==='function' ? type(props) : ({type,props})
const walk = node => !node ? [] : Array.isArray(node) ? node.flatMap(walk) : typeof node==='object' ? [node,...walk(node.props?.children)] : []
function load(file) {
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const mod={exports:{}}
  new Function('module','exports','require',code)(mod,mod.exports,name=>{
    if(name==='react/jsx-runtime') return {jsx,jsxs:jsx}
    if(name==='lucide-react') return new Proxy({},{get:(_,key)=>`Icon${key}`})
    throw Error(name)
  })
  return mod.exports
}
const {TourStepPreview}=load('components/ui/tour-step-preview.tsx')
const {homeTourSteps}=load('lib/home-tour.ts')
const {watchTourSteps,watchEditTourStep}=load('lib/watch-tour.ts')
const {editorTourSteps}=load('lib/editor-tour.ts')
const variants=new Set([...homeTourSteps,...watchTourSteps,watchEditTourStep,...editorTourSteps].map(step=>step.preview))
assert.equal(variants.has(undefined),false,'Every tip needs its matching visual or interactive practice')
for(const kind of variants){
  const node=TourStepPreview({kind})
  assert.equal(node.props['aria-hidden'],'true')
  assert.equal(node.props['data-tour-preview'],kind)
  const nodes=walk(node)
  assert.ok(nodes.length>5,kind)
  assert.equal(nodes.some(node=>['button','input','iframe','video','canvas'].includes(node.type)),false,'Miniatures must not capture input or create another player/map')
}
const css=fs.readFileSync(path.join(__dirname,'../app/globals.css'),'utf8')
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'))
assert.ok(css.includes('.tour-demo * { animation: none !important; }'))
console.log('Tutorial previews passed: every topic has a visual, miniatures stay non-interactive, no extra player/map, and reduced-motion support.')
