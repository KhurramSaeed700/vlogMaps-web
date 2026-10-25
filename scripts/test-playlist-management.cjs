const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, mocks = {}) {
 const module = {exports:{}}
 const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('module','exports','require',code)(module,module.exports,id=>{assert.ok(id in mocks,id);return mocks[id]});return module.exports
}
const membership=load('lib/playlist-membership.ts')
const groups=load('lib/creator-playlists.ts',{'@/lib/playlist-membership':membership})
class AuthError extends Error {constructor(status,message){super(message);this.status=status}}
let auth=true,failUpdate=false,rows=[]
const db={$transaction:async(callback)=>{
 const draft=structuredClone(rows)
 const result=await callback({video:{findMany:async({where})=>draft.filter(v=>where.ownerUserId.in.includes(v.ownerUserId)),update:async({where,data})=>{if(failUpdate)throw Error('database failure');Object.assign(draft.find(v=>v.id===where.id),data)}}})
 rows=draft;return result
}}
const api=load('app/api/creator/playlist-library/route.ts',{
 'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},
 '@/lib/prisma':{getPrisma:()=>db},
 '@/lib/server-creator-auth':{CreatorAuthorizationError:AuthError,requireApprovedCreator:async()=>{if(!auth)throw new AuthError(401,'Sign in');return {ownerUserIds:['owner']}}},
 '@/lib/playlist-membership':membership,
})
const call=body=>api.POST({json:async()=>body})
const a='vmaps_playlist_A',b='PLexisting12345'
async function main(){
 rows=[{id:'db1',appId:'v1',ownerUserId:'owner',tags:['creator',`playlist:${b}`,'playlist-title:Original'],keyframes:[{time:22}],title:'One',description:'Imported from Original.',createdAt:'2026-01-01'}, {id:'db2',appId:'v2',ownerUserId:'owner',tags:['creator'],keyframes:[],title:'Two',createdAt:'2026-01-02'}, {id:'db3',appId:'secret',ownerUserId:'other',tags:[]}]
 let result=await call({id:a,title:'New adventure',videoIds:['v2','v1']});assert.equal(result.status,200)
 assert.deepEqual(membership.playlistIds(rows[0].tags),[b,a],'Adding preserves other playlists')
 let grouped=groups.groupCreatorPlaylists(rows.slice(0,2).map(v=>({...v,id:v.appId})))
 assert.equal(grouped.playlists.length,2);assert.equal(grouped.playlists.find(p=>p.id===a).videos[0].id,'v2','Member order persists')
 const maps=structuredClone(rows.map(v=>v.keyframes))
 result=await call({id:a,title:'Renamed',videoIds:['v1']});assert.equal(result.status,200)
 grouped=groups.groupCreatorPlaylists(rows.slice(0,2).map(v=>({...v,id:v.appId})))
 assert.equal(grouped.playlists.find(p=>p.id===a).title,'Renamed','Names override legacy descriptions per playlist')
 assert.equal(grouped.playlists.find(p=>p.id===b).title,'Original','Other playlist names remain intact')
 assert.deepEqual(rows.map(v=>v.keyframes),maps,'Membership changes preserve maps')
 assert.ok(rows[1].tags.includes('creator'));assert.ok(!rows[1].tags.includes(`playlist:${a}`))
 const before=structuredClone(rows)
 result=await call({id:a,title:'Attempt',videoIds:['secret']});assert.equal(result.status,404);assert.deepEqual(rows,before,'Foreign video cannot be added or modified')
 result=await call({id:a,title:'Attempt',videoIds:['v1','v1']});assert.equal(result.status,400)
 result=await call({id:a,title:' ',videoIds:['v1']});assert.equal(result.status,400)
 auth=false;result=await call({id:a,title:'Attempt',videoIds:[]});assert.equal(result.status,401);auth=true
 failUpdate=true;result=await call({id:a,title:'Failure',videoIds:['v2']});assert.equal(result.status,503);assert.deepEqual(rows,before,'Failure rolls back the full playlist');failUpdate=false
 result=await call({id:a,title:'Renamed',videoIds:[]});assert.equal(result.status,200);assert.equal(rows.length,3,'Removing final member never deletes a video');assert.ok(rows[0].tags.includes(`playlist:${b}`))
 result=await call({id:'vmaps_new_empty',title:'Empty',videoIds:[]});assert.equal(result.status,400)
 const mappedVideos=[{id:'first',youtubeId:'yt-first',title:'First',keyframes:[],createdAt:'2026-01-01',tags:membership.updatePlaylistTags([],a,'Local',0)}, {id:'second',youtubeId:'yt-second',title:'Second',keyframes:[],createdAt:'2026-01-02',tags:membership.updatePlaylistTags([],a,'Local',1)}]
 const state=[],effects=[];let cursor=0
 const jsx=(type,props)=>({type,props})
 const controls=load('components/creator/playlist-mapping-controls.tsx',{
  react:{memo:f=>f,useState:initial=>{const slot=cursor++;state[slot]=initial;return[initial,v=>state[slot]=v]},useEffect:f=>effects.push(f),useRef:current=>({current})},
  'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>({})},'@radix-ui/react-dialog':{},'@/components/ui/button':{Button:'button'},
  '@/lib/creator-videos-cloud-client':{fetchCreatorCloudVideos:async()=>({configured:true,videos:mappedVideos})},
  '@/lib/creator-playlists':groups,'@/lib/playlist-mapping':load('lib/playlist-mapping.ts'),
 })
 const originalFetch=global.fetch;global.fetch=()=>{throw Error('Managed playlists must not query YouTube')}
 controls.PlaylistMappingControls({playlistId:a,youtubeId:'yt-first',videoId:'first',saveBeforeNext:async()=>true})
 const cleanup=effects[0]();for(let count=0;count<8;count++)await Promise.resolve();cleanup();global.fetch=originalFetch
 assert.equal(state[0]?.next?.id,'second','Manual playlists continue mapping in their saved order without YouTube')
 console.log('Playlist management passed: create, rename, add, remove, multiple memberships, ordering, foreign ownership, invalid input, auth and atomic rollback.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
