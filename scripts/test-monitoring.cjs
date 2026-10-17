const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/monitoring', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const result = { exports: {} }
  new Function('module', 'exports', 'require', code)(result, result.exports, name => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`)
    return mocks[name]
  })
  return result.exports
}
const privacy = load('privacy.ts')
assert.equal(privacy.sanitizeDiagnosticText('postgresql://user:private-password@host/db?token=private'), 'postgresql://host/db')
const options = load('options.ts', { './privacy': privacy }).sharedMonitoringOptions
const span = options.beforeSendSpan({ span_id: 'span-reference', attributes: { 'url.query': 'token=private', 'db.query.text': 'private SQL', 'http.response.status_code': 503 } })
assert.equal(span.span_id, 'span-reference')
assert.equal(span.attributes['http.response.status_code'], 503)
assert.doesNotMatch(JSON.stringify(span), /private SQL|token=private/)
const original = {
  user: { id: 'private-user', email: 'person@example.com' },
  request: { url: 'https://example.com/watch/video?token=secret#private', headers: { authorization: 'secret' }, cookies: 'secret', data: { body: 'private' }, query_string: 'private' },
  contexts: { diagnostics: { videoId: 'public-video', latitude: 12.12345, routeShapes: [1,2], token: 'secret', message: 'person@example.com Bearer abcdef 12.12345, 32.23456' } },
  exception: { values: [{ type: 'Error', stacktrace: { frames: [{ filename: 'https://example.com/app.js?secret=foo', lineno: 42 }] } }] },
}
const clean = privacy.sanitizeMonitoringEvent(original)
assert.equal(clean.user, undefined)
assert.deepEqual(clean.request, { url: 'https://example.com/watch/video' })
assert.equal(clean.contexts.diagnostics.videoId, 'public-video')
assert.equal(clean.contexts.diagnostics.latitude, '[redacted]')
assert.equal(clean.contexts.diagnostics.routeShapes, '[redacted]')
assert.equal(clean.exception.values[0].stacktrace.frames[0].lineno, 42)
assert.doesNotMatch(JSON.stringify(clean), /person@example|private-user|abcdef|12\.12345|secret|foo/)
assert.ok(original.user, 'Sanitization must not mutate caller data')
assert.equal(privacy.sanitizeMonitoringEvent({ exception: { values: [{ type: 'AbortError' }] } }), null)
assert.equal(privacy.sanitizeMonitoringEvent({ exception: { values: [{ stacktrace: { frames: [{ filename: 'chrome-extension://test/index.js' }] } }] } }), null)
let feedbackProcessor
load('../../instrumentation-client.ts', {
  '@sentry/nextjs': {
    init() {}, addEventProcessor(processor) { feedbackProcessor = processor },
    captureRouterTransitionStart() {},
  },
  './lib/monitoring/options': { sharedMonitoringOptions: options },
  './lib/monitoring/privacy': privacy,
})
const feedback = feedbackProcessor({ type: 'feedback', user: { id: 'private-user' }, contexts: { feedback: { contact_email: undefined, name: undefined, message: 'Test report', url: 'https://example.com/watch?token=private' } } })
assert.equal(feedback.contexts.feedback.message, 'Test report')
assert.equal(feedback.contexts.feedback.url, 'https://example.com/watch')
assert.equal(feedback.user, undefined)
assert.equal(feedback.contexts.feedback.contact_email, undefined)
assert.equal(feedback.contexts.feedback.name, undefined)
let captured = [], breadcrumbs = [], context
const sentry = {
  getClient: () => ({ getDsn: () => ({}), getOptions: () => ({ enabled: true }) }),
  addBreadcrumb(value) { breadcrumbs.push(value) },
  withScope(fn) { return fn({ setTag() {}, setContext(_, value) { context = value } }) },
  captureException(error) { captured.push(error); return 'test-reference' },
}
const diagnostics = load('diagnostics.ts', { '@sentry/nextjs': sentry, './privacy': privacy })
diagnostics.diagnosticEvent('player.state', { videoId: 'video', token: 'secret' })
assert.equal(breadcrumbs[0].data.token, '[redacted]')
assert.equal(diagnostics.reportHandledError(new Error('Failure at https://example.com/path?token=secret'), 'test', { videoId: 'video', email: 'person@example.com' }), 'test-reference')
assert.equal(context.email, '[redacted]')
assert.doesNotMatch(captured[0].message, /secret/)
assert.equal(diagnostics.reportHandledError(new Error('Repeated failure'), 'test', { videoId: 'video' }), undefined)
assert.equal(captured.length, 1, 'Repeated map errors must be bounded')
const abort = new Error('Abort'); abort.name = 'AbortError'
diagnostics.reportHandledError(abort, 'abort')
assert.equal(captured.length, 1)
sentry.addBreadcrumb = sentry.withScope = () => { throw new Error('SDK failure') }
assert.doesNotThrow(() => diagnostics.diagnosticEvent('test'))
assert.doesNotThrow(() => diagnostics.reportHandledError(new Error('Failure'), 'new-operation'))
sentry.getClient = () => undefined
assert.equal(diagnostics.reportHandledError(new Error('No SDK configured'), 'disabled'), undefined)
console.log('Monitoring passed: privacy, request filtering, stack locations, deduplication, cancellation, and SDK failure isolation.')
