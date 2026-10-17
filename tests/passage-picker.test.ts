import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as contracts from '../src/shared/contracts';
import type { PassagePickerProps } from '../src/components/map/PassagePicker';
import { createFixtureService, fixtureRegion } from '../src/features/routing/client/fixtures';

type Node = { type: unknown; props: { children?: unknown; onChange?: (event: {target:{value:string}}) => void } };
// Preserve the component's real handlers; this tiny host replaces React rendering only.
function render(props: PassagePickerProps): Node[] {
  const source = readFileSync(new URL('../src/components/map/PassagePicker.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as { PassagePicker?: (props: PassagePickerProps) => Node } };
  const element = (type: unknown, attributes: Node['props']) => ({ type, props: attributes });
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    react: { useState: (initial: unknown) => [initial, () => {}] },
    '@/shared/contracts': contracts,
    './MapView': { MapView: () => null },
    '@/features/routing/client/state': { inside: () => true },
  };
  vm.runInNewContext(code, { exports: loaded.exports, require: (name: string) => {
    assert.ok(name in imports, `Unexpected component dependency: ${name}`);
    return imports[name];
  } });
  const nodes: Node[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Node;
    nodes.push(node); visit(node.props?.children);
  };
  visit(loaded.exports.PassagePicker!(props));
  return nodes;
}
async function route() {
  const result = await createFixtureService().route({ start:[.002,.002], end:[.008,.008], profile:'wheelchair', restrictions:fixtureRegion.routing.defaultRestrictions });
  return { ...result, routeRef:'new-route', route: { ...result.route, features: [{ ...result.route.features[0], geometry: { type:'LineString' as const, coordinates:[[.002,.002],[.003,.003],[.004,.004],[.008,.008]] as contracts.Position[] } }] as typeof result.route.features } };
}

test('switching from a long route resets old segment indices before emitting a new reference', async () => {
  const emitted: contracts.PassageRef[] = [];
  const current = await route();
  const nodes = render({ bbox:fixtureRegion.bbox,location:null,route:current,passages:[],value:{routeRef:'old-route',startIndex:0,endIndex:79},preview:null,now:Date.now(),onLocationChange:()=>{},onChange:value=>emitted.push(value) });
  nodes.find(node=>node.type==='select')!.props.onChange!({target:{value:'1'}});
  assert.equal(emitted.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(emitted[0])),{routeRef:'new-route',startIndex:1,endIndex:3});
});

test('a component handler refuses indices outside the current route even if the structural schema accepts them', async () => {
  const emitted: contracts.PassageRef[] = [];
  const nodes = render({bbox:fixtureRegion.bbox,location:null,route:await route(),passages:[],value:null,preview:null,now:Date.now(),onLocationChange:()=>{},onChange:value=>emitted.push(value)});
  const selects = nodes.filter(node=>node.type==='select');
  selects[1].props.onChange!({target:{value:'79'}});
  assert.equal(emitted.length,0);
});
