const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const m={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync('lib/mapbox-directions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports,()=>({}))
const route=m.exports.createIllustrativeFlightCoordinates
const cases=[[[54.65,24.43],[-122.31,47.45],true],[[139.78,35.55],[-74,40],true],[[151,-33],[-118,34],true],[[2,49],[-74,40],false],[[18,-34],[-46,-23],false]]
for(const [start,end,pacific] of cases){
 const points=route(start,end), reverse=route(end,start)
 assert.ok(points.some(p=>Math.abs(p[0]-(pacific?200:-35))<1e-8||pacific&&Math.abs(p[0]+160)<1e-8),'Ocean corridor must be visited')
 assert.ok(Math.max(...points.map(p=>Math.abs(p[1])))<70,'No polar shortcut')
 assert.ok(Math.abs(points.at(-1)[1]-end[1])<1e-8)
 assert.ok(Math.abs(((points.at(-1)[0]-end[0])%360+360)%360)<1e-8)
 assert.equal(reverse.length,points.length,'Reverse direction keeps the same corridor')
 for(let i=1;i<points.length;i++)assert.ok(Math.abs(points[i][0]-points[i-1][0])<180,'Date line stays continuous')
 assert.ok(points.length<=385,'Flight route stays bounded')
}
assert.deepEqual(route([54,24],[55,25]),m.exports.createGreatCircleFlightCoordinates([54,24],[55,25]),'Regional flights retain direct arcs')
for(const file of ['components/maps/mapbox-travel-map.tsx','components/maps/mapbox-location-picker.tsx'])assert.ok(fs.readFileSync(file,'utf8').includes('createIllustrativeFlightCoordinates'),'Watch and Edit share ocean routing')
console.log('Ocean flight routes passed: Pacific/Atlantic preference, reverse routes, no polar shortcut, continuous date line, exact arrivals and bounded geometry.')
