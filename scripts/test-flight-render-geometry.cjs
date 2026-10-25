const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(file,mocks={}){const m={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports,name=>mocks[name]??{});return m.exports}
const {getFlightRenderSegments,flightRenderLatitudeLimit:limit}=load('lib/flight-render-geometry.ts')
const {createGreatCircleFlightCoordinates}=load('lib/mapbox-directions.ts')
const polar=createGreatCircleFlightCoordinates([54.65,24.43],[-122.31,47.45])
const original=JSON.stringify(polar)
assert.ok(Math.max(...polar.map(p=>p[1]))>88,'Reproduce the actual Abu Dhabi–Seattle polar arc')
const parts=getFlightRenderSegments(polar)
assert.equal(parts.length,2,'Clip the unsupported polar cap instead of flattening it into a blob')
const close=(a,b)=>a.every((value,index)=>Math.abs(value-b[index])<1e-9)
assert.ok(close(parts[0][0],polar[0]));assert.ok(close(parts.at(-1).at(-1),polar.at(-1)))
assert.equal(JSON.stringify(polar),original,'Real flight geometry, marker and timing data remain unchanged')
assert.equal(getFlightRenderSegments(polar),parts,'Full-flight geometry is cached by identity')
const south=createGreatCircleFlightCoordinates([20,-65],[-150,-65])
for(const coords of [polar,south,createGreatCircleFlightCoordinates([139.78,35.55],[-122.31,47.45]),[[175,50],[180,52],[185,54]],[[-175,50],[-180,52],[-185,54]],[[0,89],[20,89]],[[0,40],[NaN,45],[20,50]]]){
 for(const segment of getFlightRenderSegments(coords)){
  assert.ok(segment.length>=2)
  segment.forEach(([lng,lat],i)=>{assert.ok(Number.isFinite(lng)&&Number.isFinite(lat));assert.ok(lng>=-180&&lng<=180);assert.ok(Math.abs(lat)<=limit+1e-10);if(i)assert.ok(Math.abs(lng-segment[i-1][0])<=180,'No line spans the wrong side of the globe')})
 }
}
const pacific=getFlightRenderSegments(createGreatCircleFlightCoordinates([139.78,35.55],[-122.31,47.45]))
assert.equal(pacific.length,2,'Pacific date-line crossings are cut into canonical-world segments')
assert.equal(pacific[0].at(-1)[0],180);assert.equal(pacific[1][0][0],-180)
const ordinary=[[1,30],[2,31],[3,32]];assert.deepEqual(getFlightRenderSegments(ordinary),[ordinary],'Ordinary flights keep their line')
for(const file of ['components/maps/mapbox-travel-map.tsx','components/maps/mapbox-location-picker.tsx']) assert.match(fs.readFileSync(file,'utf8'),/getFlightRenderSegments\(segment.coordinates\)/,'Both maps use the same render guard')
console.log('Flight render geometry passed: real polar flight, both poles, Pacific seam, exact date-line vertices, invalid points, immutable timing data and cache reuse.')
