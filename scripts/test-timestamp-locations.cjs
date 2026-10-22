const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(file){const mod={exports:{}};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,name=>load(name.replace('@/', '')+'.ts'));return mod.exports}
const api=load('lib/timestamp-locations.ts')
const hotel={id:'hotel',time:10,lat:61.1,lng:-149.1,pointType:'stop',location:'Stay at Coast International Inn',description:'Hotel stay'}
const airport={...hotel,id:'airport',pointType:'flight',location:'ANC',description:'Ted Stevens Anchorage International Airport'}
const anonymous={...hotel,location:'Hidden name',regionCircle:{radiusKm:5,anonymous:true}}
assert.equal(api.suggestedPlaceKind(hotel),'hotel')
assert.equal(api.suggestedPlaceKind(airport),'airport')
assert.equal(api.suggestedPlaceKind({...hotel,location:'Hilton Airport',description:''}),'hotel')
assert.equal(api.suggestedPlaceKind({...hotel,location:'Airport parking',description:''}),null)
assert.equal(api.suggestedPlaceKind({...hotel,location:'City park',description:''}),null)
assert.equal(api.suggestedPlaceKind(anonymous),null)
for(const location of ['','Map point','Stop point #3','Point at 1:05','Stop at 2:03'])assert.equal(api.timestampLocationLabel({...hotel,location}),'61.10000, -149.10000')
assert.equal(api.timestampLocationLabel(anonymous),'Anonymous Region')
assert.equal(api.reusedTimestampLocation(hotel,'stop').location,hotel.location)
assert.equal(api.reusedTimestampLocation(hotel,'point').location,'Coast International Inn')
assert.equal(api.reusedTimestampLocation(anonymous,'point'),null)
assert.deepEqual(api.reusedTimestampLocation(anonymous,'stop').regionCircle,anonymous.regionCircle)
assert.deepEqual(api.reusedTimestampLocation(hotel,'stop',{radiusKm:8,anonymous:true}).regionCircle,{radiusKm:8,anonymous:true})
const source=ts.createSourceFile('editor.tsx',fs.readFileSync('components/creator/creator-video-editor.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
function extract(name){let value;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)===name)value=n.initializer.getText(source);ts.forEachChild(n,visit)}visit(source);assert.ok(value,name);return value}
function evaluate(expression,deps){const code=ts.transpileModule('const fn='+expression,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function(...Object.keys(deps),code+';return fn')(...Object.values(deps))}
const noop=()=>{}
async function reuse(type,id){
 let draft={id,time:120,lat:null,lng:null,pointType:type,location:'Stop point',description:''},saved,autoplay=0,lookups=0
 const ref={current:draft},location={current:null}
 const common={draftPoint:draft,draftPointRef:ref,isAwaitingMapPlacement:true,isRecordingStop:type==='stop',setDraftPoint:value=>draft=typeof value==='function'?value(draft):value,setIsAwaitingMapPlacement:noop,setIsTimestampNameEditing:noop,recordMapEditSnapshot:noop,scheduleAutoplay:()=>autoplay++,beginNearbyPlaceLookup:()=>{lookups++;throw Error('Must not geocode a known location')},video:{id:'current'},points:[],upsertCreatorPoint:(_id,points,point)=>[...points,point],toPersistedDraftPoint:point=>point,persistPoints:points=>saved=points,setDraftFlightLandingPoint:noop,setAirportCodeMessage:noop,setIsPlaying:noop,setResumeCountdown:noop,resumeAutoplayDelaySeconds:5}
 const place=evaluate(extract('savePointFromMap'),common)
 await evaluate(extract('reuseTimestampLocation'),{...common,canReuseTimestampLocation:true,reusedTimestampLocation:api.reusedTimestampLocation,cancelNearbyPlaceLookup:noop,setStopRadiusError:noop,searchedLocationRef:location,savePointFromMap:place})(hotel)
 assert.equal(lookups,0)
 assert.deepEqual(location.current,{lat:hotel.lat,lng:hotel.lng})
 if(id){assert.equal(saved,undefined,'Editing existing point waits for Save');assert.equal(draft.id,id)}
 else if(type==='point'){assert.equal(saved[0].time,120);assert.equal(saved[0].location,'Coast International Inn')}
 else{
  assert.equal(draft.time,120);assert.equal(draft.location,hotel.location);assert.equal(autoplay,1)
  await evaluate(extract('setStopEndTime'),{...common,draftPoint:draft,currentTimeRef:{current:180},isCompletingStopRef:{current:false},pendingNearbyPlaceLookupRef:{current:null},setIsRecordingStop:noop,isPlaying:true})()
  assert.equal(saved[0].time,120);assert.equal(saved[0].stopEndTime,180);assert.equal(saved[0].lat,hotel.lat)
 }
}
async function main(){
 await reuse('stop');await reuse('point');await reuse('stop','existing')
 let places=[],writes=0
 const save=()=>evaluate(extract('saveTimestampPlace'),{savedPlaces:places,savedPlaceAtLocation:api.savedPlaceAtLocation,timestampPlaceName:api.timestampPlaceName,createSavedPlaceId:()=> 'saved',recordMapEditSnapshot:noop,persistSavedPlaces:value=>{places=value;writes++},setSavedPlaceMessage:noop})
 save()(hotel);save()(hotel);save()(anonymous)
 assert.equal(writes,1);assert.equal(places[0].name,'Coast International Inn')
 let reused,closed
 evaluate(extract('chooseSavedPlace'),{canReuseTimestampLocation:true,reuseTimestampLocation:place=>reused=place,setIsSavedPlacesOpen:value=>closed=value})(places[0])
 assert.equal(reused.lat,hotel.lat);assert.equal(reused.location,places[0].name);assert.equal(closed,false)
 // Actual end handler closes only an active stop at the known duration.
 let endArgs, committed, playing
 const endDeps={setResumeCountdown:noop,setIsPlaying:value=>playing=value,videoDurationRef:{current:1838},currentTimeRef:{current:1837.6},commitCurrentTime:value=>committed=value,isRecordingStop:true,draftPointRef:{current:hotel},setStopEndTime:(...args)=>endArgs=args}
 evaluate(extract('handleEditorVideoEnded'),endDeps)()
 assert.deepEqual(endArgs,[1838,false]);assert.equal(committed,1838);assert.equal(playing,false)
 endArgs=null;evaluate(extract('handleEditorVideoEnded'),{...endDeps,isRecordingStop:false})();assert.equal(endArgs,null)
 let savedEnd,autoplay=0,recording=true
 const endingDraft={...hotel,time:1837.8},endingRef={current:endingDraft}
 await evaluate(extract('setStopEndTime'),{draftPoint:endingDraft,draftPointRef:endingRef,isCompletingStopRef:{current:false},pendingNearbyPlaceLookupRef:{current:null},recordMapEditSnapshot:noop,toPersistedDraftPoint:p=>p,video:{id:'ending'},points:[],upsertCreatorPoint:(_id,_points,p)=>[p],persistPoints:p=>savedEnd=p[0],setDraftPoint:noop,setIsAwaitingMapPlacement:noop,setIsRecordingStop:value=>recording=value,setIsTimestampNameEditing:noop,isPlaying:false,scheduleAutoplay:()=>autoplay++})(1838,false)
 assert.equal(savedEnd.stopEndTime,1838,'Auto-close never extends past video duration')
 assert.equal(recording,false);assert.equal(endingRef.current,null);assert.equal(autoplay,0,'Auto-close must not restart the video')
 console.log('End-of-video stop passed: exact duration, active stop only, draft cleared, no autoplay restart.')
 console.log('Timestamp locations passed: hotel/airport suggestions, coordinate labels, saved-place deduplication, W/Q reuse without seeking or geocoding, original timing, existing edits, Places reuse, and anonymous privacy')
}
main().catch(error=>{console.error(error);process.exitCode=1})
