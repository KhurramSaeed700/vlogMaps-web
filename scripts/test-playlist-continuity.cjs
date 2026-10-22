const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(file) {
 const mod={exports:{}}
 new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,name=>load(name.replace('@/', '')+'.ts'))
 return mod.exports
}
const {getPreviousPlaylistVideo,createPlaylistStartStop}=load('lib/playlist-continuity.ts')
const playlist='PL1234567890'
const videos=[3,1,2].map(n=>({id:'v'+n,tags:['playlist:'+playlist,'playlist-position:'+n],createdAt:'2026-01-01',description:'',keyframes:[]}))
assert.equal(getPreviousPlaylistVideo(videos,'v2',playlist).id,'v1')
assert.equal(getPreviousPlaylistVideo(videos,'v1',playlist),null)
assert.equal(getPreviousPlaylistVideo(videos,'v2','PL_other12345'),null)
const point={id:'old',time:100,stopEndTime:140,lat:31,lng:74,location:'Hotel',description:'Old stop',pointType:'stop'}
let seed=createPlaylistStartStop([{...point,time:20,lng:70},point])
assert.equal(seed.time,0); assert.equal(seed.lng,74);assert.equal(seed.location,'Stay at Hotel')
assert.equal(seed.id,undefined);assert.equal(seed.stopEndTime,undefined,'Inherited stop must wait for an end')
assert.equal(createPlaylistStartStop([{...point,pointType:'flight',flightPhase:'landing'}]).pointType,'stop')
assert.equal(createPlaylistStartStop([{...point,location:'Stay at Hotel'}]).location,'Stay at Hotel')
const anonymous=createPlaylistStartStop([{...point,location:'Private label',regionCircle:{radiusKm:5,anonymous:true}}])
assert.equal(anonymous.location,'Anonymous Region');assert.ok(!anonymous.description.includes('Private'))
assert.deepEqual(anonymous.regionCircle,{radiusKm:5,anonymous:true})
assert.equal(createPlaylistStartStop([]),null)
assert.equal(createPlaylistStartStop([{...point,lat:NaN}]),null)
const source=ts.createSourceFile('editor.tsx',fs.readFileSync('components/creator/creator-video-editor.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let effect,finish
function visit(node) {
 if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[1]?.getText(source).includes('isLoadingSavedState, playlistStartStop'))effect=node.arguments[0].getText(source)
 if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='setStopEndTime')finish=node.initializer.getText(source)
 ts.forEachChild(node,visit)
}
visit(source);assert.ok(effect);assert.ok(finish)
function evaluate(expression,deps) {const js=ts.transpileModule('const fn='+expression,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function(...Object.keys(deps),js+';return fn')(...Object.values(deps))}
let draft=null,recording=false,seek=null,countdown=null,current=20,saved
const draftRef={current:null},initialized={current:false}
const noop=()=>{}
const deps={isLoadingSavedState:true,playlistStartStop:anonymous,initializedPlaylistStopRef:initialized,points:[],draftPointRef:draftRef,flightAirportPrompt:null,isPlacingSavedPlace:false,searchedLocationRef:{current:null},setDraftPoint:value=>draft=value,setIsAwaitingMapPlacement:noop,setIsRecordingStop:value=>recording=value,setIsTimestampNameEditing:noop,commitCurrentTime:value=>current=value,setSeekRequest:value=>seek=value,setIsPlaying:noop,setResumeCountdown:value=>countdown=value,resumeAutoplayDelaySeconds:5}
evaluate(effect,deps)();assert.equal(draft,null,'Wait for restored state')
evaluate(effect,{...deps,isLoadingSavedState:false,points:[point]})();assert.equal(draft,null,'Never replace existing mapped points')
initialized.current=false
evaluate(effect,{...deps,isLoadingSavedState:false})();assert.equal(draft,draftRef.current);assert.equal(draft.time,0);assert.equal(recording,true);assert.equal(current,0);assert.equal(seek.time,0);assert.equal(countdown,5)
const original=draft
evaluate(effect,{...deps,isLoadingSavedState:false,playlistStartStop:seed})();assert.equal(draft,original,'Initialize once')
async function main(){
 await evaluate(finish,{
  currentTimeRef:{current:25},draftPointRef:draftRef,draftPoint:draft,isCompletingStopRef:{current:false},pendingNearbyPlaceLookupRef:{current:null},recordMapEditSnapshot:noop,
  video:{id:'v2'},points:[],toPersistedDraftPoint:point=>point,upsertCreatorPoint:(_id,points,point)=>[...points,point],persistPoints:points=>saved=points,
  setDraftPoint:noop,setIsAwaitingMapPlacement:noop,setIsRecordingStop:noop,setIsTimestampNameEditing:noop,isPlaying:true,
 })()
 assert.equal(saved[0].time,0);assert.equal(saved[0].stopEndTime,25);assert.deepEqual(saved[0].regionCircle,anonymous.regionCircle)
 console.log('Playlist continuity passed: episode order, final coordinates, airport/anonymous inheritance, saved-work guards, pending stop, autoplay countdown, and W completion')
}
main().catch(error=>{console.error(error);process.exitCode=1})
