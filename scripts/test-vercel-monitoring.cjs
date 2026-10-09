const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const jsx = (type, props) => ({ type, props })
const walk = node => !node ? [] : Array.isArray(node) ? node.flatMap(walk) : typeof node === 'object' ? [node, ...walk(node.props?.children)] : []
const source = fs.readFileSync(path.join(__dirname, '../app/layout.tsx'), 'utf8')
assert.ok(!source.startsWith('"use client"'), 'Keep the root layout server-rendered')
const mocks = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'next/font/google': { Inter: () => ({ className: 'font' }) },
  '@vercel/speed-insights/next': { SpeedInsights: 'SpeedInsights' },
  '@vercel/analytics/next': { Analytics: 'Analytics' },
  '@/components/app-shell/theme-provider': { ThemeProvider: 'ThemeProvider' },
  '@/components/auth/clerk-provider-wrapper': { ClerkProviderWrapper: 'ClerkProviderWrapper' },
  '@/components/ui/sonner': { Toaster: 'Toaster' },
  './globals.css': {},
}
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
const moduleUnderTest = { exports: {} }
new Function('module', 'exports', 'require', code)(moduleUnderTest, moduleUnderTest.exports, name => {
  assert.ok(name in mocks, name)
  return mocks[name]
})
const nodes = walk(moduleUnderTest.exports.default({ children: 'Page content' }))
for (const type of ['SpeedInsights', 'Analytics']) {
  assert.equal(nodes.filter(node => node.type === type).length, 1, `${type} must mount once`)
  assert.ok(nodes.find(node => node.type === 'body').props.children.some(node => node.type === type))
}
assert.equal(nodes.find(node => node.type === 'ClerkProviderWrapper').props.children, 'Page content')
console.log('Vercel monitoring passed: both Next.js integrations mount once, server layout and auth wrapper preserved.')
