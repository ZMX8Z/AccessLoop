import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as client from '../src/shared/client/api'
import * as state from '../src/features/hazards/client/report-state'
import type { PrivateReportDTO } from '../src/shared/contracts/hazards'

type Node = { type: unknown; props: Record<string, unknown> & { children?: unknown } }
const report: PrivateReportDTO = {
  id: 'saved-report', regionId: 'region-1', rowVersion: 1, status: 'pending', publicRevision: null, photoId: 'photo-1', analysis: null,
  location: [151.23, -33.917], category: 'obstruction', description: 'An observed barrier.', observedAt: '2020-01-01T00:00:00.000Z',
  passage: { presetPassageId: 'passage-1', passageVersion: 1 }, personalAvoidance: null, publicAvoidGeometry: null,
  publicVerification: null, publicActivity: 'inactive', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', isDemo: true,
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (value && typeof value === 'object') return text((value as Node).props?.children)
  return typeof value === 'string' ? value : ''
}
function host({ regionAvailable = true, analysisFails = false }: { regionAvailable?: boolean; analysisFails?: boolean } = {}) {
  const values: unknown[] = [], paths: string[] = [], analysisCalls: string[] = [], effects: (() => unknown)[] = []
  let cursor = 0, pathname = '/report'
  const component = () => null
  const element = (type: unknown, props: Node['props']) => ({ type, props })
  const hooks = {
    useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (next: unknown) => { values[index] = typeof next === 'function' ? next(values[index]) : next }] },
    useReducer(reducer: (value: unknown, action: unknown) => unknown, initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (action: unknown) => { values[index] = reducer(values[index], action) }] },
    useRef(initial: unknown) { const index = cursor++; return values[index] ??= { current: initial } }, useEffect(effect: () => unknown) { effects.push(effect) },
  }
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: element, jsxs: element }, react: hooks, 'next/link': { default: component },
    '@/shared/client/api': client, './report-state': state, './report.css': {},
    './api': { fetchReport: async () => report, fetchReports: async () => ({items: [report], truncated: false}), loadReportConfig: async () => { throw new Error('Configuration load failed.') }, analyzePhoto: async (id: string) => { analysisCalls.push(id); if (analysisFails) throw new Error('Analysis provider failed.'); return { photoId: id, analysisId: 'analysis-1', aiStatus: 'unavailable' } } },
    './PhotoUpload': { PhotoUpload: component }, './AIAnalysisFeedback': { AIAnalysisFeedback: component },
    './ReportForm': { ReportForm: component }, './AvoidanceDrawer': { AvoidanceDrawer: component },
  }
  const code = ts.transpileModule(readFileSync(new URL('../src/features/hazards/client/ReportWizard.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} as { ReportWizard: (props: object) => Node } }
  vm.runInNewContext(code, { exports: loaded.exports, require: (name: string) => { assert.ok(name in imports, name); return imports[name] }, Date, AbortController, setInterval: () => 0, clearInterval: () => {}, setTimeout, clearTimeout })
  function render() {
    cursor = 0
    const nodes: Node[] = []
    function visit(value: unknown) { if (Array.isArray(value)) { value.forEach(visit); return } if (!value || typeof value !== 'object') return; const node = value as Node; nodes.push(node); visit(node.props?.children) }
    visit(loaded.exports.ReportWizard({ pathname, region: regionAvailable ? { id: 'region-1', isDemo: true } : undefined, passages: [], onNavigate: (path: string) => { paths.push(path); pathname = path } }))
    return nodes
  }
  return { render, paths, analysisCalls, effects, supplyRegion: () => { regionAvailable = true }, navigate: (path: string) => { pathname = path } }
}
test('step flow uploads without external analysis; only explicit continue invokes analysis', async () => {
  const app = host(), upload = app.render().find((node) => 'onPhotoUploaded' in node.props)!
  ;(upload.props.onPhotoUploaded as (...args: unknown[]) => void)({ photoId: 'photo-1' }, 'blob:test', false)
  assert.deepEqual(app.analysisCalls, [])
  const ready = app.render().find((node) => 'onContinue' in node.props)
  assert.ok(ready, 'Photo step needs an explicit analysis/manual continue action.')
  ;(ready.props.onContinue as (consent: boolean) => void)(true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(app.paths, ['/report/confirm'])
  assert.deepEqual(app.analysisCalls, ['photo-1'])
})
test('direct confirmation and success URLs cannot fabricate a draft or submission', () => {
  const app = host()
  for (const path of ['/report/confirm', '/report/success/guessed-id']) {
    app.navigate(path)
    const nodes = app.render()
    assert.match(text(nodes[0]), /Start with a photo|No completed submission/)
    assert.doesNotMatch(text(nodes[0]), /Successfully Reported!/)
  }
})
test('server save stays in confirmation until explicit save-only completion', () => {
  const app = host()
  const upload = app.render().find((node) => 'onPhotoUploaded' in node.props)!
  ;(upload.props.onPhotoUploaded as (...args: unknown[]) => void)({ photoId: 'photo-1' }, '', false)
  const next = app.render().find((node) => 'onContinue' in node.props)!
  assert.ok(next)
  ;(next.props.onContinue as (consent: boolean) => void)(false)
  const form = app.render().find((node) => 'onReportCreated' in node.props)!
  assert.ok(form)
  ;(form.props.onReportCreated as (value: PrivateReportDTO) => void)(report)
  assert.deepEqual(app.paths, ['/report/confirm'])
  const submit = app.render().find((node) => node.type === 'button' && /Submit without personal avoidance/.test(text(node)))
  assert.ok(submit)
  ;(submit.props.onClick as () => void)()
  assert.deepEqual(app.paths, ['/report/confirm', '/report/success/saved-report'])
  assert.match(text(app.render()[0]), /saved-report/)
})

test('my reports filters use current effective avoidance and never relabel expiry as resolved', () => {
  const filter = (state as typeof state & { filterMyReports: (items: PrivateReportDTO[], filter: string, now: number) => PrivateReportDTO[] }).filterMyReports
  assert.equal(typeof filter, 'function')
  const now = Date.parse('2030-01-01T00:00:00.000Z')
  const active = { ...report, id: 'active', personalAvoidance: { active: true, effective: true, confirmationReportVersion: 1, validUntil: '2030-01-01T00:10:00.000Z' } } as PrivateReportDTO
  const expired = { ...active, id: 'expired', personalAvoidance: { ...active.personalAvoidance!, validUntil: '2029-12-31T23:59:59.000Z' } }
  const resolved = { ...report, id: 'resolved', status: 'resolved' as const }
  assert.deepEqual(filter([active, expired, resolved], 'active', now).map((item) => item.id), ['active'])
  assert.deepEqual(filter([active, expired, resolved], 'resolved', now).map((item) => item.id), ['resolved'])
  assert.equal(filter([active, expired, resolved], 'all', now).length, 3)
})


test('starting Report after success creates a new photo draft; hidden route keeps unfinished drafts', async () => {
  const app = host()
  const upload = app.render().find((node) => 'onPhotoUploaded' in node.props)!
  ;(upload.props.onPhotoUploaded as (...args: unknown[]) => void)({ photoId: 'photo-1' }, '', false)
  app.navigate('/route'); app.render()
  app.navigate('/report/confirm')
  const form = app.render().find((node) => 'onReportCreated' in node.props)!
  assert.ok(form, 'A hidden Route tab must not clear the unfinished draft.')
  ;(form.props.onReportCreated as (value: PrivateReportDTO) => void)(report)
  const submit = app.render().find((node) => node.type === 'button' && /Submit without personal avoidance/.test(text(node)))!
  ;(submit.props.onClick as () => void)()
  app.navigate('/report'); app.render()
  app.effects.forEach((effect) => effect())
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.doesNotMatch(text(app.render()[0]), /Your report is already saved/)
})

test('the first upload can continue analysis with that photo before React commits the draft', async () => {
  const app = host(), upload = app.render().find((node) => 'onPhotoUploaded' in node.props)!
  const photo = { photoId: 'photo-first-call' }
  ;(upload.props.onPhotoUploaded as (...args: unknown[]) => void)(photo, 'blob:first', false)
  ;(upload.props.onContinue as (...args: unknown[]) => void)(true, photo, 'blob:first')
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(app.analysisCalls, ['photo-first-call'])
  assert.deepEqual(app.paths, ['/report/confirm'])
})


test('a supplied current region removes an earlier configuration warning while analysis errors remain visible', async () => {
  for (const analysisFails of [false, true]) {
    const app = host({ regionAvailable: false, analysisFails })
    app.render(); app.effects.forEach((effect) => effect())
    await new Promise((resolve) => setImmediate(resolve))
    assert.match(text(app.render()[0]), /Configuration load failed/)
    if (analysisFails) {
      const upload = app.render().find((node) => 'onPhotoUploaded' in node.props)!
      ;(upload.props.onPhotoUploaded as (...args: unknown[]) => void)({ photoId: 'photo-failed' }, '', false)
      ;(upload.props.onContinue as (...args: unknown[]) => void)(true, { photoId: 'photo-failed' })
      await new Promise((resolve) => setImmediate(resolve))
    }
    app.supplyRegion()
    const result = text(app.render()[0])
    assert.doesNotMatch(result, /Configuration load failed/)
    if (analysisFails) assert.match(result, /Analysis provider failed/)
  }
})


test('a late avoidance confirmation cannot replace a restarted photo draft', () => {
  const app = host()
  ;(app.render().find(node => 'onPhotoUploaded' in node.props)!.props.onPhotoUploaded as (...args: unknown[]) => void)({ photoId: report.photoId }, 'blob:test')
  ;(app.render().find(node => 'onContinue' in node.props)!.props.onContinue as (consent: boolean) => void)(false)
  ;(app.render().find(node => 'onReportCreated' in node.props)!.props.onReportCreated as (value: PrivateReportDTO) => void)(report)
  const oldDrawer = app.render().find(node => 'onUpdated' in node.props)!
  ;(app.render().find(node => node.type === 'button' && text(node) === 'Submit without personal avoidance')!.props.onClick as () => void)()
  ;(app.render().find(node => node.type === 'button' && text(node) === 'Report another barrier')!.props.onClick as () => void)()
  ;(oldDrawer.props.onUpdated as (value: PrivateReportDTO) => void)(report)
  assert.doesNotMatch(text(app.render()[0]), /Successfully Reported|Your report is already saved/)
  assert.ok(app.render().find(node => 'onPhotoUploaded' in node.props))
})


test('an in-flight avoidance change disables early completion and keeps the same report', () => {
  const app = host()
  ;(app.render().find(node => 'onPhotoUploaded' in node.props)!.props.onPhotoUploaded as (...args: unknown[]) => void)({ photoId: report.photoId }, 'blob:test')
  ;(app.render().find(node => 'onContinue' in node.props)!.props.onContinue as (consent: boolean) => void)(false)
  ;(app.render().find(node => 'onReportCreated' in node.props)!.props.onReportCreated as (value: PrivateReportDTO) => void)(report)
  const drawer = app.render().find(node => 'onUpdated' in node.props)!
  ;(drawer.props.onBusyChange as (busy: boolean) => void)(true)
  assert.equal(app.render().find(node => node.type === 'button' && text(node) === 'Submit without personal avoidance')!.props.disabled, true)
  ;(drawer.props.onBusyChange as (busy: boolean) => void)(false)
  assert.equal(app.render().find(node => node.type === 'button' && text(node) === 'Submit without personal avoidance')!.props.disabled, false)
})
