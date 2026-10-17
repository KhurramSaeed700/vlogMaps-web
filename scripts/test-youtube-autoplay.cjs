const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const source = fs.readFileSync(require('node:path').join(__dirname, '../components/media/youtube-player.tsx'), 'utf8')
const handlers = source.slice(source.indexOf('          onAutoplayBlocked: (event)'), source.indexOf('          onStateChange: (event)'))
const compiled = ts.transpileModule(`const events = {${handlers}}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
const calls = []
const noop = () => {}
const ref = current => ({ current })
const player = { mute: () => calls.push('mute'), playVideo: () => calls.push('play'), setVolume: noop, getDuration: () => 60 }
const deps = {
  diagnosticEvent: noop, reportHandledError: noop, videoId: "test",
  isMounted: true, isPlayingRef: ref(true), autoplayMutedRef: ref(false),
  setAutoplayMuted: value => calls.push(['muted', value]),
  setAutoplayNeedsTap: value => calls.push(['tap', value]),
  clearPauseCommitTimeout: noop, onPlayingChangeRef: ref(value => calls.push(['playing', value])),
  playerRef: ref(null), volumeRef: ref(60), isMutedRef: ref(false), onReadyRef: ref(noop), emitCurrentTime: noop, autoPlay: false,
}
const events = new Function(...Object.keys(deps), compiled + ';return events')(...Object.values(deps))
events.onAutoplayBlocked({ target: player })
assert.deepEqual(calls, [['muted', true], 'mute', 'play'], 'blocked sound playback retries muted')
calls.length = 0
events.onAutoplayBlocked({ target: player })
assert.deepEqual(calls, [['tap', true], ['playing', false]], 'a second block offers manual play instead of retrying indefinitely')
calls.length = 0
deps.isPlayingRef.current = false
events.onAutoplayBlocked({ target: player })
assert.deepEqual(calls, [], 'paused playback must not restart')
events.onReady({ target: player })
assert.deepEqual(calls, [], 'ready player waits for countdown playback intent')
deps.isPlayingRef.current = true
events.onReady({ target: player })
assert.deepEqual(calls, ['play'], 'late readiness honors countdown playback intent')
const watch = fs.readFileSync(require('node:path').join(__dirname, '../components/viewer/watch-experience.tsx'), 'utf8')
const countdownBody = watch.slice(watch.indexOf('    if (autoplayCountdown === null || !isPlayerReady)'), watch.indexOf('  }, [autoplayCountdown, isPlayerReady])'))
const countdownCode = ts.transpileModule(`const effect = () => {${countdownBody}}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
for (const ready of [false, true]) {
  const countdownCalls = []
  let tick
  const countdownDeps = {
    autoplayCountdown: 1, isPlayerReady: ready,
    window: { setTimeout(fn) { tick = fn; return 1 }, clearTimeout: noop },
    setAutoplayCountdown: value => countdownCalls.push(['countdown', value]),
    setIsPlaying: value => countdownCalls.push(['playing', value]),
  }
  new Function(...Object.keys(countdownDeps), countdownCode + ';return effect')(...Object.values(countdownDeps))()
  assert.equal(Boolean(tick), ready, 'countdown waits for the ready player')
  if (tick) tick()
  assert.deepEqual(countdownCalls, ready ? [['countdown', null], ['playing', true]] : [], 'countdown completion starts playback')
}
console.log('YouTube autoplay passed: muted retry, bounded retries, paused intent, and late player readiness.')
