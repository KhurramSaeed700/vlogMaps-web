// Regression: ocean-only corridors must not override the shortest global arc.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const m={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync('lib/mapbox-directions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports,()=>({}))
const {createIllustrativeFlightCoordinates:route,createGreatCircleFlightCoordinates:greatCircle,createInitialRoutedLegs}=m.exports
const radians=value=>value*Math.PI/180
const distance=(a,b)=>{
 const h=Math.min(1,Math.max(0,Math.sin(radians(b[1]-a[1])/2)**2+Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(radians(b[0]-a[0])/2)**2))
 return 12742*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))
}
const cases=[
 ['AUH–SEA',[54.65,24.43],[-122.31,47.45]],['ORD–DXB',[-87.91,41.97],[55.36,25.25]],
 ['HND–JFK',[139.78,35.55],[-73.78,40.64]],['HND–SFO',[139.78,35.55],[-122.38,37.62]],
 ['SYD–LAX',[151.18,-33.95],[-118.41,33.94]],['SYD–SCL',[151.18,-33.95],[-70.79,-33.39]],
 ['LHR–JFK',[-0.45,51.47],[-73.78,40.64]],['CDG–GRU',[2.55,49.01],[-46.47,-23.44]],
 ['CPT–GRU',[18.6,-33.97],[-46.47,-23.44]],['SIN–EWR',[103.99,1.36],[-74.17,40.69]],
 ['PER–LHR',[115.97,-31.94],[-0.45,51.47]],['DEL–SFO',[77.1,28.56],[-122.38,37.62]],
 ['HEL–NRT',[24.96,60.32],[140.39,35.77]],['DXB–NBO',[55.36,25.25],[36.93,-1.32]],
 ['Regional',[54,24],[55,25]],['Date line',[179,35],[-179,36]],['Same airport',[54,24],[54,24]],
 ['Antipodal',[10,30],[-170,-30]],['Nearly antipodal',[10,30],[-169.999999,-30.000001]],
]
for(const [name,start,end] of cases){
 const original=JSON.stringify([start,end]),points=route(start,end),reverse=route(end,start)
 assert.deepEqual(points,greatCircle(start,end),name+' has no ocean detour')
 assert.equal(JSON.stringify([start,end]),original,'Endpoints are immutable')
 assert.ok(distance(points[0],start)<1e-6);assert.ok(distance(points.at(-1),end)<1e-6,name+' exact arrival')
 const length=points.slice(1).reduce((km,p,i)=>km+distance(points[i],p),0)
 assert.ok(Math.abs(length-distance(start,end))<0.05,name+' follows the shortest spherical arc')
 assert.ok(points.every(p=>p.every(Number.isFinite)&&Math.abs(p[1])<=90),name+' finite spherical geometry')
 for(let i=1;i<points.length;i++)assert.ok(Math.abs(points[i][0]-points[i-1][0])<=180+1e-8,name+' continuous date line')
 assert.ok(points.length<=129,name+' bounded geometry')
 assert.equal(reverse.length,points.length)
 const legs=createInitialRoutedLegs([{time:0,lng:start[0],lat:start[1],pointType:'flight'},{time:60,lng:end[0],lat:end[1],pointType:'flight'}])
 assert.deepEqual(legs[0].coordinates,points,name+' initial routing uses the same path')
}
assert.ok(Math.max(...route([54.65,24.43],[-122.31,47.45]).map(p=>p[1]))>88,'Northern paths are permitted again')
assert.ok(Math.min(...route([151.18,-33.95],[-70.79,-33.39]).map(p=>p[1]))<-60,'Southern routes can naturally curve toward Antarctica')
for(const file of ['components/maps/mapbox-travel-map.tsx','components/maps/mapbox-location-picker.tsx'])assert.ok(fs.readFileSync(file,'utf8').includes('createIllustrativeFlightCoordinates'),'Watch and Edit share shortest-path illustrations')
console.log('Shortest flight routes passed: 19 global/edge cases, minimum distance, polar/Atlantic/Pacific/Southern paths, exact endpoints, antipodal stability, immutability, date-line continuity and bounded geometry.')
