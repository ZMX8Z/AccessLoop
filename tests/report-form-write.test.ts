import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as client from '../src/shared/client/api'
import * as contracts from '../src/shared/contracts/hazards'
import { inside } from '../src/features/routing/client/state'

const original: contracts.PrivateReportDTO = {
  id: 'report-time', regionId: 'region-time', rowVersion: 4, status: 'pending', publicRevision: null,
  photoId: 'photo-time', analysis: null, location: [151.23, -33.917], category: 'obstruction',
  description: 'Original observation.', observedAt: '2020-01-01T00:00:45.123Z', passage: { presetPassageId: 'passage-time', passageVersion: 1 },
  personalAvoidance: null, publicAvoidGeometry: null, publicVerification: null, publicActivity: 'inactive',
  createdAt: '2020-01-01T00:00:45.123Z', updatedAt: '2020-01-01T00:00:45.123Z', isDemo: true,
}
type Node = { type: unknown; props: Record<string, unknown> & { children?: unknown } }
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (value && typeof value === 'object') return text((value as Node).props?.children)
  return typeof value === 'string' ? value : ''
}

test('a description-only correction preserves the original precise observation instant', async () => {
  const values: unknown[] = [], writes: contracts.UpdateReportInput[] = [], busy: boolean[] = [], saved: contracts.PrivateReportDTO[] = []
  let cursor = 0
  const element = (type: unknown, props: Node['props']) => ({ type, props })
  const hooks = {
    useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (next: unknown) => { values[index] = typeof next === 'function' ? next(values[index]) : next }] },
    useRef(initial: unknown) { const index = cursor++; return values[index] ??= { current: initial } }, useEffect: () => {},
  }
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: element, jsxs: element }, react: hooks,
    '@/shared/client/api': client, '@/shared/contracts/hazards': contracts,
    '@/features/routing/client/state': { inside },
    '@/components/map/PassagePicker': { PassagePicker: () => null },
    './api': { patchReport: async (_id: string, input: contracts.UpdateReportInput) => { writes.push(input); return { ...original, rowVersion: 5, description: input.description ?? original.description } } },
  }
  const source = readFileSync(new URL('../src/features/hazards/client/ReportForm.tsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} as { ReportForm: (props: object) => Node } }
  vm.runInNewContext(code, { exports: loaded.exports, require: (name: string) => { assert.ok(name in imports, `Unexpected import ${name}`); return imports[name] }, Date })
  const root = loaded.exports.ReportForm({
    photoId: original.photoId, initialReport: original, region: { id: 'region-time', bbox: [151, -34, 152, -33] },
    category: 'obstruction', description: 'Description corrected without changing the observation.',
    onSavingChange: (value: boolean) => busy.push(value), onReportCreated: (report: contracts.PrivateReportDTO) => saved.push(report),
  })
  const nodes: Node[] = []
  function visit(value: unknown) { if (Array.isArray(value)) { value.forEach(visit); return } if (!value || typeof value !== 'object') return; const node = value as Node; nodes.push(node); visit(node.props?.children) }
  visit(root)
  const save = nodes.find((node) => node.type === 'button' && text(node) === 'Save corrections')
  assert.ok(save); (save.props.onClick as () => void)(); await new Promise((resolve) => setImmediate(resolve))
  assert.equal(writes.length, 1)
  assert.equal(writes[0].description, 'Description corrected without changing the observation.')
  assert.equal(writes[0].observedAt, undefined, 'Unedited time must be omitted, not truncated to the displayed minute.')
  assert.equal(saved[0].observedAt, '2020-01-01T00:00:45.123Z')
  assert.deepEqual(busy, [true, false])
})
