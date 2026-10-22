const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(file,mocks={}){const module={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('module','exports','require',js)(module,module.exports,name=>{if(name==='server-only')return {};if(name==='zod')return require('zod');assert.ok(name in mocks,name);return mocks[name]});return module.exports}
const oldFetch=global.fetch,oldWindow=global.window,oldKey=process.env.YOUTUBE_DATA_API_KEY
const storage=new Map()
global.window={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:fn=>{queueMicrotask(fn);return 1}}
async function main(){
 let calls=0
 const ids=Array.from({length:50},(_,i)=>`video${String(i).padStart(6,'0')}`)
 global.fetch=async(_url,init)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.ids.length,50);return {ok:true,status:200,json:async()=>({items:body.ids.map(youtubeId=>({youtubeId,durationSeconds:1200,views:0}))})}}
 let client=load('lib/creator-video-details-client.ts')
 const results=await client.fetchCreatorVideoDetails(ids)
 assert.equal(calls,1,'50 videos use one request');assert.equal(results[0].durationSeconds,1200);assert.equal(results[0].views,0)
 client=load('lib/creator-video-details-client.ts')
 await client.fetchCreatorVideoDetails(ids);assert.equal(calls,1,'Persisted cache survives module reload')
 let retries=0
 global.fetch=async()=>{retries++;if(retries===1)throw Error('temporary timeout');return {ok:true,status:200,json:async()=>({items:[{youtubeId:'retry123456',durationSeconds:1500,views:900}]})}}
 assert.equal((await client.fetchCreatorVideoDetails(['retry123456']))[0].durationSeconds,1500);assert.equal(retries,2)
 let failures=0
 global.fetch=async()=>{failures++;return {ok:false,status:429}}
 await client.fetchCreatorVideoDetails(['later123456']);assert.equal(failures,3)
 global.fetch=async()=>({ok:true,status:200,json:async()=>({items:[{youtubeId:'later123456',durationSeconds:2000,views:25}]})})
 assert.equal((await client.fetchCreatorVideoDetails(['later123456']))[0].durationSeconds,2000,'Failed lookups never poison the cache')
 client.rememberPlayerDuration('player12345',1800)
 assert.equal((await client.fetchCreatorVideoDetails(['player12345']))[0].durationSeconds,1800)
 process.env.YOUTUBE_DATA_API_KEY='test-only'
 global.fetch=async url=>({ok:true,json:async()=>({items:[{id:'video000000',contentDetails:{duration:'PT18M41S'},statistics:{viewCount:'1234567'}}]})})
 const server=load('lib/youtube-playlist-server.ts')
 assert.deepEqual(await server.loadYouTubeVideoDetails(['video000000']),[{youtubeId:'video000000',durationSeconds:1121,views:1234567}])
 let authorized=true,updated=[],remoteFails=false
 class AuthError extends Error{constructor(){super('Unauthorized');this.status=401}}
 const route=load('app/api/creator/video-details/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/server-creator-auth':{CreatorAuthorizationError:AuthError,requireApprovedCreator:async()=>{if(!authorized)throw new AuthError();return {ownerUserIds:['owner']}}},
  '@/lib/prisma':{getPrisma:()=>({video:{findMany:async()=>[{youtubeId:'video000000',duration:1000,viewCount:50}],updateMany:args=>{updated.push(args);return Promise.resolve({count:1})}},$transaction:async values=>Promise.all(values)})},
  '@/lib/youtube-playlist-server':{loadYouTubeVideoDetails:async()=>{if(remoteFails)throw Error('API quota');return [{youtubeId:'video000000',durationSeconds:1121,views:1234567}]}},
  '@/lib/rate-limit':{checkRateLimit:()=>null},
 })
 const request=body=>({json:async()=>body})
 const response=await route.POST(request({ids:['video000000']}))
 assert.equal(response.body.items[0].durationSeconds,1121)
 assert.deepEqual(updated[0].where.ownerUserId,{in:['owner']},'Metadata writes are owner-scoped')
 assert.deepEqual(updated[0].data,{duration:1121,viewCount:1234567})
 updated=[]
 await route.POST(request({ids:['video000000'],observedDurations:{video000000:1300}}))
 assert.deepEqual(updated[0].data,{duration:1300},'Player duration does not overwrite views or timestamps')
 remoteFails=true;updated=[]
 const fallback=await route.POST(request({ids:['video000000']}))
 assert.equal(fallback.body.items[0].durationSeconds,1000,'Provider outages return saved database duration')
 assert.equal(fallback.body.retryable,true);assert.equal(updated.length,0)
 await route.POST(request({ids:['notowned123'],observedDurations:{notowned123:1500}}))
 assert.equal(updated.length,0,'Observed duration cannot write another owner’s video')
 assert.equal((await route.POST(request({ids:Array(51).fill('video000000')}))).status,400)
 assert.equal((await route.POST(request({ids:['bad']}))).status,400)
 authorized=false;assert.equal((await route.POST(request({ids:['video000000']}))).status,401)
 const dbAst=ts.createSourceFile('db.ts',fs.readFileSync('lib/creator-videos-db.ts','utf8'),ts.ScriptTarget.Latest,true)
 let durationExpression
 function visit(node){if(ts.isPropertyAssignment(node)&&node.name.getText(dbAst)==='duration'&&node.initializer.getText(dbAst).includes('existingVideo.duration'))durationExpression=node.initializer.getText(dbAst);ts.forEachChild(node,visit)}
 visit(dbAst);assert.ok(durationExpression)
 const persistDuration=new Function('video','existingVideo',`return ${durationExpression}`)
 assert.equal(persistDuration({durationSeconds:0},{duration:1500}),1500,'Stale zero-duration uploads preserve the saved duration')
 assert.equal(persistDuration({durationSeconds:1600},{duration:1500}),1600)
 console.log('Video details passed: 50-video batches, duration parsing, zero views, persistent cache, timeout/rate-limit recovery, failed-cache retry, player duration, owner-scoped metadata persistence, and validation.')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{global.fetch=oldFetch;global.window=oldWindow;if(oldKey===undefined)delete process.env.YOUTUBE_DATA_API_KEY;else process.env.YOUTUBE_DATA_API_KEY=oldKey})
