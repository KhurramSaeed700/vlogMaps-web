const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const read=file=>fs.readFileSync(file,'utf8')
function load(file,mocks={}){const code=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,name=>{assert.ok(name in mocks,name);return mocks[name]});return mod.exports}
const playlist=load('lib/youtube-playlist.ts'),youtube=load('lib/youtube.ts')
const sample='https://www.youtube.com/watch?v=2tQZ47H3TwY&list=PLSjc2o-bXB-rhxKZ1zPQUTmwfhozJDGR8'
let session=null,dbEnabled=true,queries=[]
const rows=[{id:'private-other',ownerUserId:'other',status:'draft',visibility:'private',youtubeId:'2tQZ47H3TwY',tags:['playlist:PLSjc2o-bXB-rhxKZ1zPQUTmwfhozJDGR8']}]
function matches(row,where){return where.OR.some(w=>w.ownerUserId?w.ownerUserId.in.includes(row.ownerUserId):row.status===w.status&&row.visibility===w.visibility)&&(!where.youtubeId||row.youtubeId===where.youtubeId)&&(!where.tags||where.tags.array_contains.every(t=>row.tags.includes(t)))}
const db={user:{findUnique:async()=>({id:'db-owner'})},video:{findMany:async({where})=>{queries.push(where);return rows.filter(row=>matches(row,where))},count:async({where})=>{queries.push(where);return rows.filter(row=>matches(row,where)).length}}}
class PlaylistLoadError extends Error{}
const route=load('app/api/youtube/link-preview/route.ts',{
 '@clerk/nextjs/server':{auth:async()=>({userId:session})},'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
 '@/lib/prisma':{getPrisma:()=>dbEnabled?db:null},'@/lib/rate-limit':{checkRateLimit:()=>null},
 '@/lib/youtube':{...youtube,fetchResolvedYouTubeMetadata:async()=>({title:'Video title',creator:'Creator',thumbnail:'https://img.youtube.com/vi/2tQZ47H3TwY/hqdefault.jpg'})},
 '@/lib/youtube-playlist':playlist,'@/lib/youtube-playlist-server':{PlaylistLoadError,loadYouTubePlaylistSummary:async()=>({title:'Trip playlist',creator:'Creator',thumbnail:null,totalVideos:99})},
 '@/lib/monitoring/server':{reportServerFailure:()=>({requestId:'test'})},
})
const request=url=>({nextUrl:new URL('http://localhost/api/youtube/link-preview?'+new URLSearchParams({url}))})
const jsx=(type,props)=>({type,props}),walk=n=>!n?[]:Array.isArray(n)?n.flatMap(walk):typeof n==='object'?[n,...walk(n.props?.children)]:[]
const text=n=>!n?'':Array.isArray(n)?n.map(text).join(' '):typeof n==='object'?text(n.props?.children):String(n)
let state=null
const preview=load('components/home/youtube-link-preview.tsx',{
 react:{useEffect(){},useState:()=>[state,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx},'next/image':{default:'image'},'next/link':{default:'link'},'lucide-react':{ListVideo:'list',Loader2:'loader',Play:'play'},
 '@/lib/youtube':youtube,'@/lib/youtube-playlist':playlist,'@/lib/demo-data':{formatCompactNumber:String,formatDuration:String},
})
async function main(){
 let result=await route.GET(request(sample));assert.equal(result.body.kind,'playlist');assert.equal(result.body.totalVideos,99);assert.equal(result.body.added,false,'Other users private playlist videos are not discoverable');assert.equal(result.headers['Cache-Control'],'private, no-store');assert.equal(result.headers.Vary,'Cookie')
 result=await route.GET(request('https://www.youtube.com/watch?v=2tQZ47H3TwY'));assert.equal(result.body.editVideoId,null);assert.equal(result.body.added,false)
 session='clerk-owner';rows.push({...rows[0],id:'owned',ownerUserId:'db-owner'})
 result=await route.GET(request('https://www.youtube.com/watch?v=2tQZ47H3TwY'));assert.equal(result.body.editVideoId,'owned');assert.equal(result.body.added,true)
 dbEnabled=false;result=await route.GET(request(sample));assert.equal(result.body.added,null,'No database must not imply absent content');dbEnabled=true
 let tree=preview.YouTubeLinkPreview({url:sample,isCreator:true,userId:'clerk-owner'});assert.ok(text(tree).includes('Loading playlist'));assert.ok(!walk(tree).some(n=>n.type==='link'),'Do not offer duplicate add while membership is loading')
 state={key:'clerk-owner:'+sample,data:{kind:'playlist',title:'Trip playlist',totalVideos:99,creator:'Creator',thumbnail:null,added:false,editVideoId:null}}
 tree=preview.YouTubeLinkPreview({url:sample,isCreator:true,userId:'clerk-owner'});assert.ok(text(tree).includes('99 videos'));assert.ok(text(tree).includes('Import playlist in Creator Studio'));assert.ok(walk(tree).find(n=>n.type==='link').props.href.includes(encodeURIComponent('list=')))
 tree=preview.YouTubeLinkPreview({url:sample,isCreator:false,userId:'clerk-owner'});assert.ok(!walk(tree).some(n=>n.type==='link'))
 tree=preview.YouTubeLinkPreview({url:sample,isCreator:true,userId:'new-account'});assert.ok(!text(tree).includes('99 videos'),'Account switches hide previous user results')
 const page=load('app/creator/video/new/page.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/youtube-playlist':playlist,'@/lib/youtube':youtube,'@/components/app-shell/content-page-shell':{ContentPageShell:'shell'},'@/components/creator/creator-access-guard':{CreatorAccessGuard:'guard'},'@/components/creator/creator-video-workspace':{CreatorVideoWorkspace:'workspace'}})
 const handoff=await page.default({searchParams:Promise.resolve({url:sample})});assert.equal(walk(handoff).find(n=>n.type==='workspace').props.initialUrl,sample,'Creator Studio receives the original playlist URL')
 console.log('YouTube link preview passed: playlist priority/count, private ownership, no shared cache, unavailable DB, creator-only actions, loading state, URL handoff and account-switch isolation.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
