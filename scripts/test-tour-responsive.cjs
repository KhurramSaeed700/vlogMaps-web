const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const mod={exports:{}}
new Function('exports',ts.transpileModule(fs.readFileSync('lib/guided-tour.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports)
const place=mod.exports.getGuidedTourPlacement
const screens=[[320,568],[375,667],[390,844],[430,932],[667,375],[768,1024],[820,1180],[1024,768],[1280,720],[1440,900],[1920,1080]]
for(const [width,height] of screens){
 for(const target of [
  {left:16,top:80,width:80,bottom:112},
  {left:16,top:80,width:width-32,bottom:80+(width-32)*9/16},
  {left:width-60,top:height-70,width:44,bottom:height-26},
  {left:0,top:60,width,bottom:height},
 ])for(const panelHeight of [260,440,650])for(const preview of [false,true]){
  const box=place(target,{width,height},panelHeight,preview)
  assert.ok(box.left>=16&&box.top>=16,JSON.stringify({width,height,box}))
  assert.ok(box.left+box.width<=width-16+0.01)
  assert.ok(box.top+box.maxHeight<=height-16+0.01)
  assert.ok(box.maxHeight>0)
  if(box.side==='below')assert.ok(box.top>=target.bottom+16)
  if(box.side==='above')assert.ok(box.top+box.maxHeight<=target.top-16+0.01)
 }
}
const phone=place({left:16,top:80,width:343,bottom:273},{width:375,height:667},550,true)
assert.equal(phone.side,'below','Tall phone previews scroll below the highlighted player')
assert.ok(phone.maxHeight<550)
const fullMap=place({left:0,top:56,width:390,bottom:844},{width:390,height:844},650,true)
assert.ok(fullMap.maxHeight<=844*.45,'Large highlights retain visible space above compact card')
console.log('Responsive tours passed: 11 desktop/tablet/phone/landscape sizes, varied targets, tall previews, viewport bounds and unobstructed placements.')
