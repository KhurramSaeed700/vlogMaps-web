const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const module = {exports:{}}
  new Function('module','exports','require',code)(module,module.exports,id=>{assert.ok(id in mocks,id);return mocks[id]})
  return module.exports
}
const mapping=load('lib/playlist-mapping.ts')
const helpers=load('lib/creator-playlists.ts',{'@/lib/playlist-membership':load('lib/playlist-membership.ts')})
const playlistId='PL1234567890'
const videos=Array.from({length:99},(_,position)=>({id:`video-${position}`,youtubeId:`yt-${position}`,title:`Episode ${position+1}`,creator:'Creator',description:'Imported from Motorcycle Series.',thumbnail:'/placeholder.svg',createdAt:new Date(2026,0,1,0,0,position).toISOString(),tags:[`playlist:${playlistId}`],keyframes:position===0?[{time:0}]:[],status:position===0?'published':'draft'}))
const solo={...videos[0],id:'solo',tags:['creator']}
const input=[...videos].reverse().concat(solo)
const grouped=helpers.groupCreatorPlaylists(input)
assert.deepEqual(grouped.standalone.map(v=>v.id),['solo'],'Imported episodes do not flood standalone content')
assert.equal(grouped.playlists.length,1,'99 imported videos become one playlist item')
const playlist=grouped.playlists[0]
assert.equal(playlist.title,'Motorcycle Series')
assert.equal(playlist.videos.length,99)
assert.equal(playlist.mappedCount,1)
assert.equal(playlist.uploadedCount,1)
assert.equal(playlist.videos[0].id,'video-0','Legacy imports retain original import order')
assert.equal(input[0].id,'video-98','Grouping does not mutate owner library')
const shuffled=[{...videos[2],tags:[`playlist:${playlistId}`,'playlist-position:1']},{...videos[1],tags:[`playlist:${playlistId}`,'playlist-position:0']}]
assert.equal(helpers.groupCreatorPlaylists(shuffled).playlists[0].videos[0].id,'video-1','New imports preserve explicit episode order')
assert.equal(helpers.groupCreatorPlaylists([{...videos[0],description:'Edited description',tags:[`playlist:${playlistId}`,'playlist-title:Saved series name']}]).playlists[0].title,'Saved series name','Playlist name survives edited descriptions')
const extra={...solo,id:'other-playlist',tags:['playlist:PL9876543210']}
assert.equal(helpers.groupCreatorPlaylists([solo,...videos,extra]).playlists.length,2)
const preview={items:[{youtubeId:'yt-2',position:0},{youtubeId:'not-owned',position:1},{youtubeId:'yt-0',position:2}]}
const ordered=helpers.orderCreatorPlaylistVideos(videos,preview)
assert.equal(ordered[0].id,'video-2')
assert.equal(ordered[1].id,'video-0')
assert.equal(ordered.length,99,'Removed source entries remain editable')
assert.ok(!ordered.some(v=>v.youtubeId==='not-owned'),'Public preview cannot introduce another owner’s video')
assert.equal(helpers.creatorPlaylistHref(playlistId),`/creator/playlists/${playlistId}`)
const jsx=(type,props)=>({type,props})
const walk=n=>!n?[]:Array.isArray(n)?n.flatMap(walk):typeof n==='object'?[n,...walk(n.props?.children)]:[]
const gallery=load('components/creator/creator-playlists.tsx',{
 react:{useState:v=>[v,()=>{}],useMemo:f=>f(),useEffect(){}},'react/jsx-runtime':{jsx,jsxs:jsx},'next/image':{default:'image'},'next/link':{default:'link'},
 'lucide-react':new Proxy({},{get:(_,id)=>id}),'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/skeleton':{Skeleton:'skeleton'},
 '@/components/creator/creator-content-table':{CreatorContentTable:'table'},'@/lib/creator-playlists':helpers,'@/lib/playlist-mapping':mapping,
})
const cards=walk(gallery.CreatorPlaylistCards({playlists:grouped.playlists,loading:false}))
assert.equal(cards.filter(n=>n.type==='link'&&n.props['aria-label']?.startsWith('Open playlist')).length,1)
assert.equal(cards.find(n=>n.props['aria-label']==='Open playlist Motorcycle Series').props.href,`/creator/playlists/${playlistId}`)
const detail=walk(gallery.CreatorPlaylistDetail({playlist,tableProps:{loading:false}}))
assert.equal(detail.find(n=>n.type==='table').props.playlistId,playlistId,'Detail actions retain playlist context')
assert.equal(detail.find(n=>n.type==='link'&&n.props.href?.includes('/edit?')).props.href,mapping.playlistEditorHref('video-1',playlistId),'Continue mapping picks first episode without map points')
console.log('Creator playlists passed: grouping 99 episodes, standalone separation, legacy/new ordering, owner-only members, progress, gallery links and mapping context.')
