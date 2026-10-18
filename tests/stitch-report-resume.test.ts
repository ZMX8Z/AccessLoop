import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as client from '../src/shared/client/api'
import * as state from '../src/features/hazards/client/report-state'
import type { PrivateReportDTO, PublicReportDTO } from '../src/shared/contracts/hazards'

type Node = { type: unknown; props: Record<string, unknown> & { children?: unknown } }
const active: PrivateReportDTO = {
  id: 'confirmed-report', regionId: 'region-1', rowVersion: 2, status: 'pending', publicRevision: null, photoId: 'private-photo', analysis: null,
  location: [151.23, -33.917], category: 'obstruction', description: 'An observed barrier.', observedAt: '2020-01-01T00:00:00.000Z',
  passage: { presetPassageId: 'passage-1', passageVersion: 1 },
  personalAvoidance: { active: true, effective: true, confirmationReportVersion: 2, validUntil: '2099-01-01T00:00:00.000Z',
    observedAt: '2020-01-01T00:00:00.000Z', confirmedAt: '2020-01-01T00:01:00.000Z', decisionSource: 'user_manual',
    passage: { presetPassageId: 'passage-1', passageVersion: 1 }, avoidGeometry: { type: 'Polygon', coordinates: [[[151, -34], [152, -34], [152, -33], [151, -34]]] } },
  publicAvoidGeometry: null, publicVerification: null, publicActivity: 'inactive', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', isDemo: true,
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (value && typeof value === 'object') return text((value as Node).props?.children)
  return typeof value === 'string' ? value : ''
}
function host({ record = active, mine = [active], truncated = false, delayed = false, fails = false }: {
  record?: PrivateReportDTO | PublicReportDTO; mine?: PrivateReportDTO[]; truncated?: boolean; delayed?: boolean; fails?: boolean
} = {}) {
  const values: unknown[] = [], pendingEffects: (() => unknown)[] = [], calls: string[] = []
  let cursor = 0, pathname = `/report/success/${active.id}`, changed = 0, reportUpdateKey = 'initial'
  let resolveRead!: (value: PrivateReportDTO | PublicReportDTO) => void
  const delayedRead = new Promise<PrivateReportDTO | PublicReportDTO>((resolve) => { resolveRead = resolve })
  const component = () => null
  const element = (type: unknown, props: Node['props']) => ({ type, props })
  const hooks = {
    useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (next: unknown) => { values[index] = typeof next === 'function' ? next(values[index]) : next }] },
    useReducer(reducer: (value: unknown, action: unknown) => unknown, initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (action: unknown) => { values[index] = reducer(values[index], action) }] },
    useRef(initial: unknown) { const index = cursor++; return values[index] ??= { current: initial } },
    useEffect(effect: () => unknown, deps: unknown[]) {
      const index = cursor++, previous = values[index] as { deps: unknown[]; cleanup?: () => void } | undefined
      if (!previous || deps.some((value, item) => value !== previous.deps[item])) {
        previous?.cleanup?.()
        const current = { deps, cleanup: undefined as (() => void) | undefined }; values[index] = current
        pendingEffects.push(() => { const cleanup = effect(); if (typeof cleanup === 'function') current.cleanup = cleanup as () => void })
      }
    },
  }
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: element, jsxs: element }, react: hooks, 'next/link': { default: component },
    '@/shared/client/api': client, './report-state': state, './report.css': {},
    './api': {
      fetchReport: async (id: string) => { calls.push(`report:${id}`); if (fails) throw new Error('Read failed'); return delayed ? delayedRead : record },
      fetchReports: async (scope: string) => { calls.push(`list:${scope}`); return { items: mine, truncated } },
    },
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
    visit(loaded.exports.ReportWizard({ pathname, region: { id: 'region-1', isDemo: true }, passages: [], onChanged: () => changed++, onNavigate: (path: string) => { pathname = path }, reportUpdateKey }))
    return nodes
  }
  return { render, calls, delay: () => { delayed = true }, effects: () => pendingEffects.splice(0).forEach((effect) => effect()), changes: () => changed, resolve: () => resolveRead(record), navigate: (path: string) => { pathname = path }, setMine: (next: PrivateReportDTO[]) => { mine = next }, update: (next: PrivateReportDTO, key = reportUpdateKey) => { record = next; reportUpdateKey = key } }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
test('success refresh restores only a server-confirmed effective report explicitly owned by this session', async () => {
  const app = host()
  assert.match(text(app.render()[0]), /No completed submission/)
  app.effects(); await flush()
  const html = text(app.render()[0])
  assert.match(html, /Successfully Reported!/)
  assert.match(html, /confirmed-report/)
  assert.deepEqual(app.calls.sort(), ['list:mine', 'report:confirmed-report'])
  assert.equal(app.changes(), 0, 'Read-only recovery must not invalidate routes or submit a mutation.')
})
test('public, admin-readable, unconfirmed, expired, stopped and unknown-owner records keep the success guard', async () => {
  const { rowVersion: _rowVersion, photoId: _photoId, analysis: _analysis, passage: _passage, personalAvoidance: _avoidance, createdAt: _created, updatedAt: _updated, ...publicFields } = active
  void [_rowVersion, _photoId, _analysis, _passage, _avoidance, _created, _updated]
  for (const options of [
    { record: publicFields as PublicReportDTO },
    { mine: [] },
    { mine: [], truncated: true },
    { record: { ...active, personalAvoidance: null } },
    { record: { ...active, personalAvoidance: { ...active.personalAvoidance!, validUntil: '2020-01-01T00:00:00.000Z' } } },
    { record: { ...active, personalAvoidance: { ...active.personalAvoidance!, active: false } } },
    { fails: true },
  ]) {
    const app = host(options); app.render(); app.effects(); await flush()
    assert.match(text(app.render()[0]), /No completed submission/)
    assert.doesNotMatch(text(app.render()[0]), /Successfully Reported!/)
  }
})
test('late recovery cannot replace a changed success URL or a new photo selection', async () => {
  for (const mode of ['url', 'photo', 'photo-url'] as const) {
    const app = host({ delayed: true }); app.render(); app.effects()
    if (mode === 'url') { app.navigate('/report/success/another-report'); app.render(); app.effects() }
    else {
      const upload = app.render().find((node) => 'onPhotoSelected' in node.props)!
      ;(upload.props.onPhotoSelected as () => void)()
      if (mode === 'photo-url') {
        app.navigate('/route'); app.render(); app.effects()
        app.navigate(`/report/success/${active.id}`); app.render(); app.effects()
        assert.equal(app.calls.length, 2, 'A locally selected photo is a draft even before upload.')
      }
    }
    app.resolve(); await flush()
    assert.doesNotMatch(text(app.render()[0]), /Successfully Reported!/)
    assert.equal(app.changes(), 0)
  }
})


test('returning from report details refreshes stopped avoidance and corrected report versions', async () => {
  const app = host(); app.render(); app.effects(); await flush()
  assert.match(text(app.render()[0]), /Personal detour for this browser session/)
  app.navigate(`/my-reports/${active.id}`); app.render(); app.effects()
  app.update({ ...active, rowVersion: 3, description: 'Corrected observation', personalAvoidance: { ...active.personalAvoidance!, active: false, effective: false } })
  app.navigate(`/report/success/${active.id}`);
  assert.doesNotMatch(text(app.render()[0]), /Personal detour for this browser session/, 'Re-entry must invalidate the previous successful status before a read finishes.')
  app.effects(); await flush()
  assert.doesNotMatch(text(app.render()[0]), /Personal detour for this browser session/)
  assert.match(text(app.render()[0]), /Personal avoidance is not enabled/)
  assert.ok(app.calls.filter(call => call === `report:${active.id}`).length >= 2)
})

test('a routing context update rechecks the visible completion status without another supplier call', async () => {
  const app = host(); app.render(); app.effects(); await flush(); app.render(); app.effects(); await flush()
  app.update({ ...active, rowVersion: 3, status: 'resolved', personalAvoidance: { ...active.personalAvoidance!, active: false, effective: false } }, 'new-public-context')
  app.render(); app.effects(); await flush()
  assert.doesNotMatch(text(app.render()[0]), /Personal detour for this browser session/)
  assert.match(text(app.render()[0]), /Personal avoidance is not enabled/)
  assert.ok(app.calls.every(call => call.startsWith('report:') || call === 'list:mine'))
})


test('returning to a saved confirmation uses the corrected row version for avoidance preview', async () => {
  const app = host(); app.navigate('/report')
  const upload = app.render().find(node => 'onPhotoUploaded' in node.props)!
  ;(upload.props.onPhotoUploaded as (...args: unknown[]) => void)({ photoId: active.photoId }, 'blob:test')
  ;(app.render().find(node => 'onContinue' in node.props)!.props.onContinue as (consent: boolean) => void)(false)
  ;(app.render().find(node => 'onReportCreated' in node.props)!.props.onReportCreated as (report: PrivateReportDTO) => void)(active)
  app.render(); app.effects(); await flush()
  app.navigate(`/my-reports/${active.id}`); app.render(); app.effects()
  app.update({ ...active, rowVersion: 3, description: 'Corrected report facts', personalAvoidance: null })
  app.navigate('/report/confirm'); app.render(); app.effects(); await flush()
  const drawer = app.render().find(node => 'onUpdated' in node.props)!
  assert.ok(drawer, 'The updated saved report must remain reviewable.')
  assert.equal((drawer.props.report as PrivateReportDTO).rowVersion, 3)
  assert.equal((drawer.props.report as PrivateReportDTO).description, 'Corrected report facts')
})


test('a later admin-readable report cannot be claimed as effective for a replaced anonymous session', async () => {
  const app = host(); app.render(); app.effects(); await flush()
  app.navigate('/my-reports'); app.render(); app.effects()
  app.setMine([]); app.navigate(`/report/success/${active.id}`); app.render(); app.effects(); await flush()
  const html = text(app.render()[0])
  assert.doesNotMatch(html, /Personal detour for this browser session/)
  assert.match(html, /Current report status could not be verified/)
})


test('a late saved-report refresh cannot refill a new photo draft after restart', async () => {
  const app = host(); app.render(); app.effects(); await flush()
  app.render(); app.delay(); app.effects()
  const another = app.render().find(node => node.type === 'button' && text(node) === 'Report another barrier')!
  ;(another.props.onClick as () => void)()
  app.resolve(); await flush()
  const html = text(app.render()[0])
  assert.doesNotMatch(html, /Your report is already saved/)
  assert.doesNotMatch(html, /Successfully Reported/)
  assert.ok(app.render().find(node => 'onPhotoUploaded' in node.props))
})

test('refresh gates a saved avoidance editor without unmounting its draft', async () => {
  const app = host(); app.navigate('/report')
  ;(app.render().find(node => 'onPhotoUploaded' in node.props)!.props.onPhotoUploaded as (...args: unknown[]) => void)({ photoId: active.photoId }, 'blob:test')
  ;(app.render().find(node => 'onContinue' in node.props)!.props.onContinue as (consent: boolean) => void)(false)
  ;(app.render().find(node => 'onReportCreated' in node.props)!.props.onReportCreated as (report: PrivateReportDTO) => void)(active)
  const before = app.render().find(node => 'onUpdated' in node.props)!
  assert.ok(before)
  app.update(active, 'changed-context')
  const checking = app.render().find(node => 'onUpdated' in node.props)!
  assert.ok(checking, 'Keep the same editor mounted so observation and passage inputs survive a refresh.')
  assert.equal(checking.type, before.type)
  assert.equal(checking.props.disabled, true)
  app.effects(); await flush()
  assert.equal(app.render().find(node => 'onUpdated' in node.props)!.props.disabled, false)
})
