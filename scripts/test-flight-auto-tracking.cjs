const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function ast(file) { return ts.createSourceFile(file, fs.readFileSync(file,'utf8'), ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX) }
function extract(source,name) {
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source)===name) expression=node.initializer.getText(source)
    ts.forEachChild(node,visit)
  }
  visit(source); assert.ok(expression,name); return expression
}
function evaluate(expression,deps) {
  const code=ts.transpileModule('const fn = '+expression,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  return new Function(...Object.keys(deps),code+'; return fn')(...Object.values(deps))
}
const source=ast('components/creator/creator-video-editor.tsx')
async function capture(mode,role,{missingTakeoff=false,missingAirport=false}={}) {
  let requests=0,saves=0,autoplay=0,message=''
  const deps={
    flightAirportPrompt:{mode,role,timestamp:40}, flightAirportCode:'ANC',
    normalizeAirportCode:code=>code, setAirportCodeMessage:value=>{message=value},
    setIsResolvingAirportCode(){}, resolveAirportCodeLocation:async()=>missingAirport?null:{code:'ANC',name:'Airport',lat:61,lng:-150},
    pendingFlightTakeoff:missingTakeoff?null:{id:'takeoff',flightId:'flight',flightPhase:'takeoff',time:10},
    createFlightId:()=> 'flight',video:{id:'video'},points:[],currentTimeRef:{current:40},
    upsertCreatorPoint:(_id,points,point)=>[...points,point],recordMapEditSnapshot(){},
    persistPoints(points){saves++;assert.equal(points.at(-1).flightPhase,role)},
    setFlightTrackingRequestId:update=>{requests=update(requests)},
    setFlightAirportPrompt(){},setFlightAirportCode(){},setFlightAirportPreview(){},
    scheduleAutoplay(){autoplay++},isPlaying:false,
  }
  const handler=evaluate(extract(source,mode==='map'?'saveFlightPointFromMap':'saveFlightAirport'),deps)
  await handler({lat:61,lng:-150})
  return {requests,saves,autoplay,message}
}
async function main() {
  for (const mode of ['airport','map']) {
    let result=await capture(mode,'landing')
    assert.equal(result.requests,1,mode+': landing resumes tracking')
    assert.equal(result.saves,1)
    assert.equal(result.autoplay,1)
    result=await capture(mode,'takeoff')
    assert.equal(result.requests,0,mode+': incomplete flight must not follow an unknown destination')
    result=await capture(mode,'landing',{missingTakeoff:true})
    assert.equal(result.requests,0)
    assert.equal(result.saves,0)
  }
  assert.equal((await capture('airport','landing',{missingAirport:true})).requests,0)
  const picker=ast('components/maps/mapbox-location-picker.tsx')
  let effect
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(picker)==='useEffect' && node.arguments[1]?.getText(picker)==='[isLoaded, trackingRequestId]') effect=node.arguments[0].getText(picker)
    ts.forEachChild(node,visit)
  }
  visit(picker);assert.ok(effect)
  const handled={current:0}; let enabled=0,cancelled=0
  const run=(request,loaded=true)=>evaluate(effect,{
    isLoaded:loaded,mapInstanceRef:{current:{}},trackingRequestId:request,handledTrackingRequestRef:handled,
    cancelTrackingAutoStart(){cancelled++},enableTravelerTracking(){enabled++},
  })()
  run(0);run(1,false);assert.equal(enabled,0,'Wait for map readiness')
  run(1);run(1);assert.equal(enabled,1,'Consume once; do not undo later manual exploration')
  run(2);assert.equal(enabled,2,'A subsequent completed flight follows again')
  assert.equal(cancelled,2)
  console.log('Flight auto tracking passed: airport/map landings, autoplay, incomplete/invalid entries, map readiness and one-shot requests')
}
main().catch(error=>{console.error(error);process.exitCode=1})
