import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as client from '../src/shared/client/api'
import * as reportState from '../src/features/hazards/client/report-state'
import type { PrivateReportDTO } from '../src/shared/contracts/hazards'

type Node = { type: unknown; props: Record<string, unknown> & { children?: unknown } }
const original: PrivateReportDTO = {
  id: 'report-client', regionId: 'region-client', rowVersion: 1, status: 'pending', publicRevision: null,
  photoId: 'original-photo', analysis: null, location: [151.23, -33.917], category: 'obstruction',
  description: 'A trolley blocks this passage.', observedAt: '2030-01-01T00:00:00.000Z', passage: { presetPassageId: 'passage-client', passageVersion: 1 },
  personalAvoidance: null, publicAvoidGeometry: null, publicVerification: null, publicActivity: 'inactive',
  createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z', isDemo: true,
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (value && typeof value === 'object') return text((value as Node).props?.children)
  return typeof value === 'string' ? value : ''
}
function detailHost({ truncated = false, items = [original], report = original, copied = [] }: { truncated?: boolean; items?: PrivateReportDTO[]; report?:PrivateReportDTO; copied?:string[] } = {}) {
  const values: unknown[] = [], effects: (() => unknown)[] = []
  let cursor = 0
  const element = (type: unknown, props: Node['props']) => ({ type, props })
  const hooks = {
    useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (next: unknown) => { values[index] = typeof next === 'function' ? next(values[index]) : next }] },
    useRef(initial: unknown) { const index = cursor++; return values[index] ??= { current: initial } },
    useEffect(effect: () => unknown) { const index = cursor++; if (!(index in values)) { values[index] = true; effects.push(effect) } },
  }
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: element, jsxs: element }, react: hooks, 'next/link': { default: () => null },
    '@/shared/client/api': client,
    './report-state': reportState,
    './api': { fetchReport: async () => report, fetchReports: async () => ({ items, truncated }), loadReportConfig: async () => ({ region: { id: 'region-client' }, passages: [] }) },
    './ReportForm': { ReportForm: () => null }, './PhotoUpload': { PhotoUpload: () => null }, './AIAnalysisFeedback': { AIAnalysisFeedback: () => null },
    './AvoidanceDrawer': { AvoidanceDrawer: () => null }, './ReportsList': { ReportSummary: () => null }, './report.css': {},
  }
  const source = readFileSync(new URL('../src/features/hazards/client/ReportDetail.tsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} as { ReportDetail: (props: { id: string }) => Node } }
  vm.runInNewContext(code, { exports: loaded.exports, require: (name: string) => { assert.ok(name in imports, `Unexpected import ${name}`); return imports[name] }, navigator:{clipboard:{writeText:async(value:string)=>{copied.push(value)}}}, Date, AbortController, setInterval: () => 0, clearInterval: () => {} })
  const render = () => {
    cursor = 0
    const nodes: Node[] = []
    function visit(value: unknown) { if (Array.isArray(value)) { value.forEach(visit); return } if (!value || typeof value !== 'object') return; const node = value as Node; nodes.push(node); visit(node.props?.children) }
    visit(loaded.exports.ReportDetail({ id: original.id }))
    return nodes
  }
  return { render, effects }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
async function editingHost() {
  const app = detailHost(); app.render(); app.effects.forEach((effect) => effect()); await flush()
  const edit = app.render().find((node) => node.type === 'button' && text(node) === 'Edit report facts / replace photo')
  assert.ok(edit); (edit.props.onClick as () => void)()
  return app
}

test('a pending fact correction disables photo replacement until the write settles', async () => {
  const app = await editingHost()
  const form = app.render().find((node) => 'initialReport' in node.props)!
  assert.equal(typeof form.props.onSavingChange, 'function', 'The editor must share its in-flight write state with photo replacement.')
  ;(form.props.onSavingChange as (pending: boolean) => void)(true)
  let upload = app.render().find((node) => 'onPhotoSelected' in node.props)!
  assert.equal(upload.props.disabled, true)
  ;(form.props.onSavingChange as (pending: boolean) => void)(false)
  upload = app.render().find((node) => 'onPhotoSelected' in node.props)!
  assert.equal(upload.props.disabled, false)
})

test('an earlier saved correction cannot close or overwrite a replacement-photo draft', async () => {
  const app = await editingHost()
  const oldForm = app.render().find((node) => 'initialReport' in node.props)!
  const upload = app.render().find((node) => 'onPhotoSelected' in node.props)!
  ;(upload.props.onPhotoSelected as () => void)()
  ;(oldForm.props.onReportCreated as (report: PrivateReportDTO) => void)({ ...original, rowVersion: 2 })
  const nodes = app.render(), current = nodes.find((node) => 'initialReport' in node.props)
  assert.ok(current, 'A late response must leave the newer draft open.')
  assert.equal(current.props.photoId, '')
  assert.equal((current.props.initialReport as PrivateReportDTO).rowVersion, 2, 'The earlier completed server write is still acknowledged as the next version.')
  assert.match(text(nodes[0]), /earlier correction was saved/)
})


test('a truncated mine list cannot remove author actions for an older private report', async () => {
  const app = detailHost({ truncated: true, items: [] }); app.render(); app.effects.forEach((effect) => effect()); await flush()
  const nodes = app.render()
  assert.ok(nodes.find((node) => node.type === 'button' && text(node) === 'Edit report facts / replace photo'))
  assert.match(text(nodes[0]), /server checks ownership/)
})


test('copy text evaluates natural personal expiry and identifies the report authors session',async()=>{
 const copied:string[]=[];
 const report={...original,personalAvoidance:{effective:true,active:true,confirmationReportVersion:original.rowVersion,validUntil:'2000-01-01T00:00:00.000Z'}} as PrivateReportDTO;
 const app=detailHost({report,copied});app.render();app.effects.forEach(effect=>effect());await flush();
 const copy=app.render().find(node=>node.type==='button'&&text(node)==='Copy report text')!;
 await (copy.props.onClick as ()=>Promise<void>)();await flush();
 assert.equal(copied.length,1);assert.match(copied[0],/Personal avoidance: not effective/);
 assert.doesNotMatch(copied[0],/effective for this session/);
});


test('copy text evaluates public expiry at the time of copying and includes its validity', async () => {
  const copied: string[] = []
  const report = { ...original, status: 'verified', publicRevision: 1, publicActivity: 'active',
    publicVerification: { source: 'admin_field_check', verifiedAt: '2000-01-01T00:00:00.000Z', validUntil: '2000-01-02T00:00:00.000Z' } } as PrivateReportDTO
  const app = detailHost({ report, copied }); app.render(); app.effects.forEach(effect => effect()); await flush()
  const copy = app.render().find(node => node.type === 'button' && text(node) === 'Copy report text')!
  await (copy.props.onClick as () => Promise<void>)(); await flush()
  assert.equal(copied.length, 1)
  assert.match(copied[0], /Public activity: expired/)
  assert.match(copied[0], /2000-01-02T00:00:00.000Z/)
  assert.doesNotMatch(copied[0], /Public activity: active/)
})
