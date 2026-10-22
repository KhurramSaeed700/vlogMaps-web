const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const code=ts.transpileModule(fs.readFileSync('lib/hold-to-speed.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const mod={exports:{}};new Function('exports',code)(mod.exports)
function setup(playing=true,rate=1.5,rates=[1,1.5,2]){
 let tick,cleared=0,taps=0,active=false
 const calls=[]
 const player={getPlaybackRate:()=>rate,getAvailablePlaybackRates:()=>rates,setPlaybackRate:r=>{rate=r;calls.push(['rate',r])},playVideo:()=>calls.push(['play']),pauseVideo:()=>calls.push(['pause'])}
 const controller=mod.exports.createHoldToSpeed({getPlayer:()=>player,isPlaying:()=>playing,onPlayingChange:v=>{playing=v;calls.push(['playing',v])},onActiveChange:v=>active=v,onTap:()=>taps++,schedule:(fn,delay)=>{assert.equal(delay,250);tick=fn;return 1},clear:()=>cleared++})
 return {controller,calls,tick:()=>tick(),get state(){return{playing,rate,taps,active,cleared}}}
}
for(const playing of [true,false]){
 const x=setup(playing);x.controller.press();x.controller.press();assert.equal(x.calls.length,0,'Wait for hold threshold')
 x.tick();assert.equal(x.state.rate,2);assert.equal(x.state.playing,true);assert.equal(x.state.active,true)
 x.controller.release();assert.equal(x.state.rate,1.5);assert.equal(x.state.playing,playing);assert.equal(x.state.active,false);assert.equal(x.state.taps,0)
}
let x=setup();x.controller.press();x.controller.release();assert.equal(x.state.taps,1);assert.equal(x.state.cleared,1);assert.equal(x.calls.length,0,'Tap is not a speed change')
x=setup(false,0.75);x.controller.press();x.tick();x.controller.cancel();assert.equal(x.state.rate,0.75);assert.equal(x.state.playing,false);assert.equal(x.state.taps,0)
x=setup();x.controller.press();x.controller.cancel();assert.equal(x.state.taps,0,'Blur before threshold does not toggle playback')
x=setup(true,1,[1]);x.controller.press();x.tick();x.controller.release();assert.equal(x.calls.length,0,'Do not claim 2x when unsupported')
console.log('Hold Space passed: tap/hold distinction, 2x playback, original rate/play state restoration, repeats, blur/unmount cancellation and unsupported speeds.')
