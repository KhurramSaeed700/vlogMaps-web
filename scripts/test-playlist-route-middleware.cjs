const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
global.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage
const { unstable_doesMiddlewareMatch } = require('next/experimental/testing/server')
const file = fs.existsSync('proxy.ts') ? 'proxy.ts' : 'middleware.ts'
const moduleResult = { exports: {} }
const source = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
let protectedRoutes
new Function('module','exports','require',source)(moduleResult,moduleResult.exports,()=>({
 clerkMiddleware:callback=>callback,
 createRouteMatcher:routes=>{protectedRoutes=routes;return ()=>false},
}))
const config = moduleResult.exports.config
for(const url of ['/','/playlists/PLSjc2o-bXB-rhxKZ1zPQUTmwfhozJDGR8','/creator/dashboard','/api/videos']) {
 assert.equal(unstable_doesMiddlewareMatch({config,nextConfig:{},url}),true,`${url} needs Clerk session middleware`)
}
assert.deepEqual(protectedRoutes,['/creator(.*)'],'Playlist watch stays public; creator pages retain protection')
console.log('Playlist session middleware passed: public playlist route initializes auth without requiring sign-in; creator protection retained.')
