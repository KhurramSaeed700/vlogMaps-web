const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const mod = { exports: {} }
  new Function('exports', 'require', code)(mod.exports, name => name.startsWith('@/') ? load(name.replace('@/', '') + '.ts') : require(name))
  return mod.exports
}
const { buildStopRegionCameraPlan: build, getStopRegionCameraAtTime: at } = load('lib/stop-region-camera.ts')
const { stopRegionFeatures } = load('lib/stop-regions.ts')
const point = { time:36, stopEndTime:167, lat:31.484733, lng:74.325983, pointType:'stop', regionCircle:{radiusKm:5,anonymous:true} }
const next = { time:166, lat:31.52236, lng:74.40761, pointType:'point' }
function y(lat) { return (1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2 }
for (const viewport of [{width:1000,height:830},{width:390,height:480},{width:280,height:180}]) {
  for (const lat of [point.lat,61.2,80,-60]) {
    for (const radiusKm of [0.05,5,100,500]) {
      const stop = {...point,lat,regionCircle:{radiusKm}}
      const plan = build([next,stop],viewport)
      const camera = at(plan,50)
      assert.ok(camera && Number.isFinite(camera.maxZoom))
      assert.deepEqual(camera.center,[stop.lng,lat])
      const padding = Math.min(80,Math.min(viewport.width,viewport.height)*.22)
      const scale = 512*2**camera.maxZoom
      for (const [lng,latitude] of stopRegionFeatures([stop]).features[0].geometry.coordinates[0]) {
        const distance = Math.hypot((lng-stop.lng)/360,y(latitude)-y(lat))*scale
        assert.ok(distance <= Math.min(viewport.width,viewport.height)/2-padding+1e-6,'Whole circle fits with padding at every map bearing')
      }
      assert.equal(at(plan,-1),null)
      assert.ok(at(plan,0),'Initial region also fits before its first timestamp')
      assert.ok(at(plan,36))
      assert.ok(at(plan,165.99))
      assert.equal(at(plan,166),null,'Overlapping stop ends at next timestamp')
    }
  }
}
assert.equal(build([{...point,regionCircle:undefined}],{width:800,height:800}).length,0)
assert.equal(build([{...point,stopEndTime:point.time}],{width:800,height:800}).length,0)
const desktop = at(build([point],{width:1000,height:830}),40).maxZoom
const mobile = at(build([point],{width:390,height:480}),40).maxZoom
assert.ok(mobile < desktop,'Smaller viewport zooms out farther')
const many = Array.from({length:10000},(_,i)=>({...point,time:i*10,stopEndTime:i*10+5}))
const plan = build(many,{width:800,height:800})
assert.equal(at(plan,99992).fromTime,99990)
assert.equal(at(plan,99996),null)
console.log('Stop region camera: padded circle fit, mobile, latitude, radii, active intervals and indexed lookup passed')
