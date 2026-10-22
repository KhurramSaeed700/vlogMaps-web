const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, mocks = {}) {
 const source = fs.readFileSync(path.join(__dirname,'..',file),'utf8')
 const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 const mod={exports:{}}
 new Function('module','exports','require',code)(mod,mod.exports,name=>{
  if(name==='server-only') return {}
  assert.ok(name in mocks, `Unexpected import ${name}`);return mocks[name]
 })
 return mod.exports
}
const parser=load('lib/youtube-playlist.ts')
const sample='https://www.youtube.com/watch?v=2tQZ47H3TwY&list=PLSjc2o-bXB-rhxKZ1zPQUTmwfhozJDGR8'
assert.equal(parser.extractYouTubePlaylistId(sample),'PLSjc2o-bXB-rhxKZ1zPQUTmwfhozJDGR8')
for(const url of ['https://evil.youtube.com/playlist?list=PL1234567890','https://youtube.com.evil.test/?list=PL1234567890','https://example.com/?list=PL1234567890','javascript:alert(1)','https://youtube.com/watch?v=abcdefghijk']) assert.equal(parser.extractYouTubePlaylistId(url),null)
const server=load('lib/youtube-playlist-server.ts')
const oldFetch=global.fetch,oldKey=process.env.YOUTUBE_DATA_API_KEY,oldAlias=process.env.YOUTUBE_API_KEY
let calls=[]
const item=(id,position,extra={})=>({snippet:{title:'Video '+position,position,videoOwnerChannelTitle:'Creator',resourceId:{videoId:id}},...extra})
async function main(){
 process.env.YOUTUBE_DATA_API_KEY='test-only'
 global.fetch=async url=>{
  assert.equal(url.hostname,'www.googleapis.com');calls.push(url)
  return {ok:true,json:async()=>url.pathname.endsWith('/videos')?{items:[{id:'aaaaaaaaaaa',contentDetails:{duration:'PT18M41S'}},{id:'bbbbbbbbbbb',contentDetails:{duration:'PT1H2M3S'}}]}:url.pathname.endsWith('/playlists')?{items:[{snippet:{title:'Trip series'}}]}:url.searchParams.has('pageToken')?{items:[item('bbbbbbbbbbb',1),item('aaaaaaaaaaa',2),item('ccccccccccc',3,{status:{privacyStatus:'private'}})]}:{nextPageToken:'page-two',items:[item('aaaaaaaaaaa',0)]}}
 }
 const preview=await server.loadYouTubePlaylist('PL1234567890')
 assert.equal(calls.length,4)
 assert.deepEqual(preview.items.map(v=>v.youtubeId),['aaaaaaaaaaa','bbbbbbbbbbb'])
 assert.equal(preview.items[0].durationSeconds,1121);assert.equal(preview.items[1].durationSeconds,3723);
 assert.equal(preview.unavailableCount,1);assert.equal(preview.truncated,false)
 assert.equal(calls[2].searchParams.get('pageToken'),'page-two')
 delete process.env.YOUTUBE_DATA_API_KEY;delete process.env.YOUTUBE_API_KEY
 await assert.rejects(()=>server.loadYouTubePlaylist('PL1234567890'),error=>error.status===503)
 class CreatorAuthorizationError extends Error {constructor(){super('Unauthorized');this.status=401}}
 let signedIn=false,loads=0
 const route=load('app/api/creator/playlists/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/server-creator-auth':{CreatorAuthorizationError,requireApprovedCreator:async()=>{if(!signedIn)throw new CreatorAuthorizationError()}},
  '@/lib/youtube-playlist':parser,
  '@/lib/youtube-playlist-server':{...server,loadYouTubePlaylist:async()=>{loads++;return preview}},
  '@/lib/rate-limit':{checkRateLimit:()=>null},
  '@/lib/monitoring/server':{reportServerFailure:()=>({requestId:'test'})},
 })
 const request=url=>({nextUrl:new URL(`http://localhost/api/creator/playlists?${new URLSearchParams({url})}`)})
 assert.equal((await route.GET(request(sample))).status,401);assert.equal(loads,0)
 signedIn=true
 assert.equal((await route.GET(request('https://evil.test'))).status,400);assert.equal(loads,0)
 assert.equal((await route.GET(request(sample))).headers['Cache-Control'],'private, no-store');assert.equal(loads,1)
 console.log('Playlist import passed: sample URL, hostile hosts, pagination, ordering, deduplication, private videos, missing configuration, creator authorization and private responses.')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.YOUTUBE_DATA_API_KEY;else process.env.YOUTUBE_DATA_API_KEY=oldKey;if(oldAlias===undefined)delete process.env.YOUTUBE_API_KEY;else process.env.YOUTUBE_API_KEY=oldAlias})
