import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as client from '../src/shared/client/api'
import { PhotoUpload } from '../src/features/hazards/client/PhotoUpload'
import type { UploadDTO } from '../src/shared/contracts/photos'

type Node = { type: unknown; props: Record<string, unknown> & { children?: unknown } }
const photo: UploadDTO = { photoId: 'uploaded-first', purpose: 'report', mime: 'image/jpeg', bytes: 4, width: 2, height: 2 }
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (value && typeof value === 'object') return text((value as Node).props?.children)
  return typeof value === 'string' ? value : ''
}
function host(uploadPhoto: (...args: unknown[]) => Promise<UploadDTO>) {
  const values: unknown[] = [], uploaded: unknown[][] = [], continued: unknown[][] = []
  let cursor = 0
  const hooks = {
    useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (next: unknown) => { values[index] = typeof next === 'function' ? next(values[index]) : next }] },
    useRef(initial: unknown) { const index = cursor++; return values[index] ??= { current: initial } }, useEffect: () => {},
  }
  const element = (type: unknown, props: Node['props']) => ({ type, props })
  const imports: Record<string, unknown> = { 'react/jsx-runtime': { jsx: element, jsxs: element }, react: hooks, '@/shared/client/api': client, './api': { uploadPhoto } }
  const code = ts.transpileModule(readFileSync(new URL('../src/features/hazards/client/PhotoUpload.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} as { PhotoUpload: (props: object) => Node } }
  vm.runInNewContext(code, { exports: loaded.exports, require: (name: string) => { assert.ok(name in imports, name); return imports[name] }, URL: { createObjectURL: () => 'blob:photo', revokeObjectURL: () => {} } })
  function render() {
    cursor = 0
    const nodes: Node[] = []
    function visit(value: unknown) { if (Array.isArray(value)) { value.forEach(visit); return } if (!value || typeof value !== 'object') return; const node = value as Node; nodes.push(node); visit(node.props?.children) }
    visit(loaded.exports.PhotoUpload({ flowMode: 'steps', onPhotoUploaded: (...args: unknown[]) => uploaded.push(args), onContinue: (...args: unknown[]) => continued.push(args) }))
    return nodes
  }
  function select() {
    const field = render().find((node) => node.type === 'input' && node.props.type === 'file')!
    ;(field.props.onChange as (event: unknown) => void)({ target: { files: [new File(['jpeg'], 'test.jpg', { type: 'image/jpeg' })] } })
  }
  return { render, select, uploaded, continued }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
test('the photo step has a single upload-and-analyze primary action', () => {
  const html = renderToStaticMarkup(React.createElement(PhotoUpload, { flowMode: 'steps', onPhotoUploaded: () => undefined }))
  assert.match(html, /Confirm &amp; Analyze Photo/)
  assert.doesNotMatch(html, />Upload private photo</)
  const legacy = renderToStaticMarkup(React.createElement(PhotoUpload, { onPhotoUploaded: () => undefined }))
  assert.match(legacy, />Upload private photo</)
})
test('manual continue uploads once, passes that DTO, and retains retry idempotency', async () => {
  const keys: unknown[] = []
  let attempts = 0
  const app = host(async (_file, _purpose, key) => { keys.push(key); if (++attempts === 1) throw new Error('Try upload again.'); return photo })
  app.select()
  for (let index = 0; index < 2; index++) {
    const button = app.render().find((node) => node.type === 'button' && /Continue with manual report/.test(text(node)))!
    assert.equal(button.props.disabled, false)
    ;(button.props.onClick as () => void)(); await flush()
  }
  assert.equal(keys.length, 2)
  assert.equal(keys[0], keys[1])
  assert.equal(app.uploaded.length, 1)
  assert.equal(app.uploaded[0][2], false)
  assert.deepEqual(app.continued, [[false, photo, 'blob:photo']])
})
test('a late upload for a replaced photo cannot navigate or start analysis', async () => {
  let resolveUpload!: (value: UploadDTO) => void
  const app = host(() => new Promise((resolve) => { resolveUpload = resolve }))
  app.select()
  const button = app.render().find((node) => node.type === 'button' && /Continue with manual report/.test(text(node)))!
  ;(button.props.onClick as () => void)()
  app.select()
  resolveUpload(photo); await flush()
  assert.deepEqual(app.uploaded, [])
  assert.deepEqual(app.continued, [])
})


test('the combined analyze action still requires explicit consent and passes the uploaded photo', async () => {
  const app = host(async () => photo)
  app.select()
  let analyze = app.render().find((node) => node.type === 'button' && /Confirm & Analyze Photo/.test(text(node)))!
  assert.equal(analyze.props.disabled, true)
  ;(analyze.props.onClick as () => void)(); await flush()
  assert.deepEqual(app.continued, [])
  const consent = app.render().find((node) => node.type === 'input' && node.props.type === 'checkbox')!
  ;(consent.props.onChange as (event: unknown) => void)({ target: { checked: true } })
  analyze = app.render().find((node) => node.type === 'button' && /Confirm & Analyze Photo/.test(text(node)))!
  assert.equal(analyze.props.disabled, false)
  ;(analyze.props.onClick as () => void)(); await flush()
  assert.deepEqual(app.continued, [[true, photo, 'blob:photo']])
})
