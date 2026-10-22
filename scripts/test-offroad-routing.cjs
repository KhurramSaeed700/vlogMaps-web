const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const code = ts.transpileModule(read('lib/mapbox-directions.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', 'require', code)(mod, mod.exports, () => ({ reportHandledError() {} }))
const { fetchRoutedLegsForKeyframes, createInitialRoutedLegs, splitRoutedLegSections } = mod.exports
const oldFetch = global.fetch
let response
let requests = 0
global.fetch = async () => { requests++; return { ok: true, status: 200, json: async () => response } }
const point = (time, lng, lat, extra = {}) => ({ time, lng, lat, ...extra })
async function resolve(points, coordinates) {
  response = coordinates ? { routes: [{ geometry: { coordinates } }] } : { code: 'NoRoute', routes: [] }
  return (await fetchRoutedLegsForKeyframes(points))[0]
}
function loadMapFunctions(file, names) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
  assert.equal(functions.length, names.length)
  const js = ts.transpileModule(functions.map(node => node.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  return new Function('splitRoutedLegSections', 'createGreatCircleFlightCoordinates', js + '\nreturn {' + names.join(',') + '}')(splitRoutedLegSections, mod.exports.createGreatCircleFlightCoordinates)
}
async function main() {
  const water = [point(0, 18.1, 59.4), point(30, 18.12, 59.41)]
  let leg = await resolve(water, [[18.09, 59.39], [18.11, 59.40]])
  assert.equal(leg.routeKind, 'offroad', 'Do not use a road snapped far from water points')
  assert.deepEqual(leg.coordinates, water.map(p => [p.lng, p.lat]))
  leg = await resolve([point(0, 10, 40), point(2, 10.02, 40.03)], null)
  assert.equal(leg.routeKind, 'offroad')
  assert.equal(leg.coordinates.length, 2, 'Missing roads still connect recorded positions')
  const trail = [point(10, 20, 50, { via: [[20.01, 50.01]] }), point(60, 20.02, 50.02)]
  leg = await resolve(trail, null)
  assert.deepEqual(leg.coordinates, [[20, 50], [20.01, 50.01], [20.02, 50.02]], 'Preserve creator waypoint shape')
  const road = [point(0, 1, 1), point(100, 1.001, 1.001)]
  leg = await resolve(road, [[1.00001, 1.00001], [1.0005, 1.0005], [1.001, 1.001]])
  assert.equal(leg.routeKind, 'road', 'Nearby roads keep normal road tracking')
  assert.equal(leg.isFallback, false)
  const airport = [point(0, 54.65, 24.43, { pointType: 'flight', flightPhase: 'landing' }), point(100, 55.22, 25.1)]
  const airportRoad = [[54.66, 24.435], [54.7, 24.5], [54.9, 24.7], [55.1, 25], [55.22, 25.1]]
  leg = await resolve(airport, airportRoad)
  assert.equal(leg.routeKind, 'road', 'Airport snap gap must not discard the onward road')
  assert.deepEqual(leg.coordinates[0], [54.65, 24.43], 'Keep exact landing coordinate')
  assert.deepEqual(leg.coordinates.at(-1), [55.22, 25.1])
  const mixed = splitRoutedLegSections({...leg, isStationary: false})
  assert.deepEqual(mixed.map(part => part.routeKind), ['offroad', 'road'])
  assert.deepEqual(mixed[1].coordinates, airportRoad, 'Keep full mapped road geometry')
  assert.equal(mixed[0].fromTime, 0)
  assert.equal(mixed.at(-1).toTime, 100)
  assert.equal(mixed[0].toTime, mixed[1].fromTime, 'No time gap at road transition')
  assert.deepEqual(mixed[0].coordinates.at(-1), mixed[1].coordinates[0], 'No traveler jump')
  assert.ok(mixed[0].toTime < 5, 'Only the short connector uses dotted movement')
  const lateMovement = splitRoutedLegSections({...leg, fromTime: 80, isStationary: false})
  assert.equal(lateMovement[0].fromTime, 80, 'Split after the stop duration, not before')
  assert.equal(lateMovement.at(-1).toTime, 100)
  const stationary = {...leg, isStationary: true}
  assert.deepEqual(splitRoutedLegSections(stationary), [stationary], 'Do not split stationary stops')
  const reverse = (await fetchRoutedLegsForKeyframes([point(0,55.22,25.1),point(100,54.65,24.43)]))[0]
  assert.deepEqual(splitRoutedLegSections(reverse).map(part => part.routeKind), ['road','offroad'], 'Arrival connector also works')
  // A nearby stop after landing still needs a real road request.
  const airportWithRemoteRestaurant = [point(0,54,24,{pointType:'flight',flightPhase:'landing'}),point(60,55,25)]
  leg = await resolve(airportWithRemoteRestaurant, [[54.01,24.01],[54.5,24.5],[54.99,24.99]])
  assert.deepEqual(leg.sections.map(section => section.routeKind), ['offroad','road','offroad'], 'Airport and building pins can both need short connectors')
  const nearbyAirport = [point(0,30,30,{pointType:'flight',flightPhase:'landing'}),point(60,30.02,30.02)]
  const beforeNearby = requests
  leg = await resolve(nearbyAirport, [[30,30],[30.005,30.015],[30.02,30.02]])
  assert.equal(requests, beforeNearby + 1)
  assert.equal(leg.routeKind, 'road')
  const disconnected = [point(0,40,40),point(60,40.03,40.03)]
  leg = await resolve(disconnected, [[40.02,40.02],[40.03,40.03]])
  assert.equal(leg.routeKind,'offroad','Mostly off-network journeys remain dotted')
  const bothRemote = [point(0,50,40),point(60,51,41)]
  leg = await resolve(bothRemote, [[50.01,40.01],[50.5,40.5],[50.99,40.99]])
  assert.equal(leg.routeKind,'offroad','Do not attach two water/trail points to unrelated roads')
  const region = [point(0,60,40,{pointType:'stop',regionCircle:{radiusKm:5,anonymous:true}}),point(60,60.1,40.1,{pointType:'stop'})]
  const regionRoad = [[60.002,40.002],[60.02,40.04],[60.07,40.06],[60.099,40.099]]
  leg = await resolve(region, regionRoad)
  assert.equal(leg.routeKind,'road','Region centers retain a mostly connected ground route even when both pins need connectors')
  assert.deepEqual(leg.coordinates[0],[60,40],'Travel starts at the center, not the circle boundary')
  assert.deepEqual(leg.coordinates.at(-1),[60.1,40.1])
  assert.deepEqual(leg.sections.map(section=>section.routeKind),['offroad','road','offroad'])
  assert.deepEqual(leg.sections[1].coordinates,regionRoad)
  const regionLeg = leg
  const zeroTime = splitRoutedLegSections({...leg,fromTime:60,toTime:60,isStationary:false})
  assert.ok(zeroTime.every(part=>part.fromTime===60&&part.toTime===60),'Touching stops keep an instantaneous path without changing timestamps')
  const incoming = (await fetchRoutedLegsForKeyframes([point(0,60.1,40.1),point(60,60,40,{pointType:'stop',regionCircle:{radiusKm:5}})]))[0]
  assert.equal(incoming.routeKind,'road','Incoming travel to a normal region center also follows roads')
  const shortSnap = [point(0,70,40),point(60,70.01,40.01)]
  leg = await resolve(shortSnap,[[70.00001,40.00001],[70.005,40.006],[70.00999,40.00999]])
  assert.deepEqual(leg.coordinates[0],[70,40],'Even nearby road snaps preserve the exact recorded center')
  assert.deepEqual(leg.coordinates.at(-1),[70.01,40.01])
  const watch = loadMapFunctions('components/maps/mapbox-travel-map.tsx', ['getStopEndTime','expandLegsForStopDurations'])
  for (const stopEndTime of [60, 61]) {
    const watchLegs = watch.expandLegsForStopDurations([regionLeg],[{...region[0],stopEndTime},region[1]])
    assert.equal(watchLegs[0].isStationary,true)
    assert.equal(watchLegs[0].toTime,60,'Overlapping stop times remain clamped to next timestamp')
    assert.equal(watchLegs[1].fromTime,60)
    assert.equal(watchLegs[1].toTime,60)
    assert.equal(watchLegs[1].isStationary,false)
    assert.deepEqual(watchLegs[1].coordinates,regionLeg.coordinates,'Watch retains the road even without a travel gap')
  }
  const editor = loadMapFunctions('components/maps/mapbox-location-picker.tsx', ['haversineDistance','getRouteDistanceIndex','createTimestampRouteSegment','buildTimestampRouteSegments'])
  const editorLegs = editor.buildTimestampRouteSegments([{...regionLeg,legKey:'region:airport',fromTime:60,toTime:60,isStationary:false,startCoordinate:[60,40],endCoordinate:[60.1,40.1]}])
  assert.deepEqual(editorLegs.find(part=>part.routeKind==='road').coordinates,regionRoad,'Edit retains the same road and exact center connectors')
  assert.match(read('components/maps/mapbox-location-picker.tsx'), /movementStartTime <= nextPoint.time/)
  assert.match(read('components/maps/mapbox-location-picker.tsx'), /regionCircle: point.regionCircle/)
  const flight = [point(0, 1, 1, { pointType: 'flight' }), point(2, 30, 40, { pointType: 'flight' })]
  const before = requests
  assert.equal((await fetchRoutedLegsForKeyframes(flight))[0].routeKind, 'flight')
  assert.equal(requests, before, 'Flights never request roads')
  assert.equal(createInitialRoutedLegs(water)[0].routeKind, 'offroad', 'Pending routes do not imply road certainty')
  for (const file of ['components/maps/mapbox-travel-map.tsx', 'components/maps/mapbox-location-picker.tsx']) {
    const source = read(file)
    assert.match(source, /"routeKind"\], "offroad"/)
    assert.match(source, /"line-width": 1\.8, "line-dasharray": \[0\.2, 2\.5\]/)
  }
  for (const file of ['components/maps/mapbox-travel-map.tsx', 'components/maps/mapbox-location-picker.tsx']) assert.match(read(file), /splitRoutedLegSections/);
  console.log('Off-road routing passed: mixed airport roads, continuous connector timing, stop durations, reverse trips, nearby landing routes, remote snaps, no route, creator waypoints, normal roads, flights, pending paths, and matching thin dotted layers on watch/edit.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => { global.fetch = oldFetch })
