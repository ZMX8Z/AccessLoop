import assert from 'node:assert/strict'
import test from 'node:test'

import { Admins as AdminCollectionConfig } from '../src/collections/Admins'

type AdminCollection = {
  access: Record<string, (args: { req: { user: unknown } }) => unknown>
  endpoints: Array<{ path: string; method: string; handler: (req: Record<string, unknown>) => Promise<Response> }>
  hooks: { beforeChange: Array<(args: unknown) => unknown>; beforeLogin: Array<(args: unknown) => unknown> }
}

const Admins = AdminCollectionConfig as unknown as AdminCollection
const operator = { id: 1, collection: 'admins', role: 'operator', enabled: true }
const reviewer = { id: 2, collection: 'admins', role: 'report_admin', enabled: true }

function collection(): AdminCollection {
  return Admins
}

function changeArgs(user: unknown, operation = 'create', data: Record<string, unknown> = {}) {
  return { context: {}, data, operation, req: { user }, originalDoc: reviewer }
}

test('anonymous callers cannot create an administrator even when Payload bypasses access control', async () => {
  const admins = collection()
  assert.equal(admins.access.create({ req: { user: null } }), false)
  await assert.rejects(async () => admins.hooks.beforeChange[0](changeArgs(null)))
})

test('report administrators cannot grant administrator privileges', async () => {
  const admins = collection()
  assert.equal(admins.access.create({ req: { user: reviewer } }), false)
  await assert.rejects(async () => admins.hooks.beforeChange[0](changeArgs(reviewer)))
  await assert.rejects(async () => admins.hooks.beforeChange[0](changeArgs(reviewer, 'update', { role: 'operator' })))
})

test('an enabled operator can manage administrator accounts', async () => {
  const admins = collection()
  assert.equal(admins.access.create({ req: { user: operator } }), true)
  assert.deepEqual(await admins.hooks.beforeChange[0](changeArgs(operator, 'create', { role: 'report_admin' })), { role: 'report_admin' })
})

test('disabled administrators cannot enter the admin panel or sign in', async () => {
  const admins = collection()
  const user = { ...operator, enabled: false }
  assert.equal(admins.access.admin({ req: { user } }), false)
  await assert.rejects(async () => admins.hooks.beforeLogin[0]({ user, req: {} }))
})

test('first-register stays closed independently of whether the database has a first user', async () => {
  const admins = collection()
  const endpoint = admins.endpoints.find(({ path, method }) => path === '/first-register' && method === 'post')
  assert.ok(endpoint, 'The public first-register endpoint must be explicitly disabled')
  const response = await endpoint.handler({})
  assert.equal(response.status, 403)
})

test('the controlled bootstrap context creates the first operator and rejects an existing administrator', async () => {
  const admins = collection()
  let totalDocs = 0
  const data = { role: 'operator', enabled: true }
  const args = {
    context: { bootstrapAdmin: true },
    data,
    operation: 'create',
    req: { user: null, payload: { count: async () => ({ totalDocs }) } },
  }
  assert.deepEqual(await admins.hooks.beforeChange[0](args), data)
  totalDocs = 1
  await assert.rejects(async () => admins.hooks.beforeChange[0](args))
})
