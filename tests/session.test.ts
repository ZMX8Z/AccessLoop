import assert from 'node:assert/strict'
import test from 'node:test'

import { issueSessionCredential, readSessionCredential, sessionCookieHeader, sessionOwnerHash } from '../src/server/auth/session-cookie'
import { initializeAnonymousSession } from '../src/server/auth/session-http'
import type { RegionRecord } from '../src/shared/contracts/storage'

const secret = 'test-only-session-secret-with-at-least-32-bytes'
const origin = 'http://localhost:3100'
const region: RegionRecord = {
  id: 'synthetic-test-region', name: 'Synthetic test only', bbox: [0, 0, 1, 1], timezone: 'Australia/Sydney',
  isDemo: true, hazardVersion: 0, configVersion: 1, personalValiditySec: 3600, publicValiditySec: 86400,
  avoidanceBufferM: 2, routing: { profile: 'wheelchair',
    defaultRestrictions: { maximum_incline: 6, maximum_sloped_kerb: 0.06, minimum_width: 0.9 },
    supportedRestrictions: { maximum_incline: [6], maximum_sloped_kerb: [0.06], minimum_width: [0.9] } },
}
function harness() {
  const owners = new Set<string>()
  let touched = false
  return {
    owners,
    touched: () => touched,
    options: { applicationOrigin: origin, regionId: region.id, secret, secure: false,
      repository: async () => {
        touched = true
        return {
          requireRegion: async () => region,
          ensureSession: async (owner: string) => { owners.add(owner) },
          ensureSessionContext: async () => {},
        }
      },
    },
  }
}
function request(headers: Record<string, string> = {}, body = '{}') {
  return new Request(`${origin}/api/session`, { method: 'POST', body, headers: { Origin: origin, 'Content-Type': 'application/json', ...headers } })
}

test('session credentials resist forgery, duplicate cookies and key changes', () => {
  const credential = issueSessionCredential(secret)
  const header = sessionCookieHeader(credential, true)
  assert.equal(readSessionCredential(header, secret), credential)
  assert.match(header, /HttpOnly; SameSite=Lax; Secure$/)
  assert.doesNotMatch(header, /Expires|Max-Age|Domain/)
  assert.equal(readSessionCredential(`accessloop_session=${credential.slice(0, -1)}!`, secret), null)
  assert.equal(readSessionCredential(header, `${secret}-changed`), null)
  assert.equal(readSessionCredential(`${header}; accessloop_session=${credential}`, secret), null)
  assert.throws(() => issueSessionCredential('short'))
})

test('initialize, refresh and separate browsers retain the correct private owner without disclosing it', async () => {
  const h = harness()
  const first = await initializeAnonymousSession(request(), h.options)
  assert.equal(first.status, 200)
  const cookie = first.headers.get('set-cookie')
  assert.ok(cookie)
  const response = await first.json()
  assert.deepEqual(response.data, { ready: true, regionId: region.id, isDemo: true })
  assert.equal(response.requestId, first.headers.get('x-request-id'))
  assert.match(first.headers.get('cache-control') ?? '', /no-store/)
  const credential = readSessionCredential(cookie, secret)
  assert.ok(credential)
  assert.doesNotMatch(JSON.stringify(response), new RegExp(sessionOwnerHash(credential)))
  const refresh = await initializeAnonymousSession(request({ Cookie: cookie }), h.options)
  assert.equal(refresh.status, 200)
  assert.equal(refresh.headers.get('set-cookie'), null)
  assert.equal(h.owners.size, 1)
  await initializeAnonymousSession(request(), h.options)
  assert.equal(h.owners.size, 2)
})

test('untrusted origins and invalid bodies are rejected before touching storage', async () => {
  for (const req of [request({ Origin: 'https://evil.test' }), request({ Origin: '' }),
    request({}, '{"owner":"someone-else"}'), request({}, 'null'), request({}, '{'),
    request({ 'Content-Type': 'text/plain' }), request({}, ' '.repeat(1025))]) {
    const h = harness()
    const result = await initializeAnonymousSession(req, h.options)
    assert.ok([400, 403].includes(result.status))
    assert.equal(h.touched(), false)
    assert.equal(result.headers.get('set-cookie'), null)
  }
})

test('storage failures never issue a cookie or leak internal error details', async () => {
  const h = harness()
  const result = await initializeAnonymousSession(request(), {
    ...h.options, repository: async () => { throw new Error('postgres://secret-value') },
  })
  assert.equal(result.status, 503)
  assert.equal(result.headers.get('set-cookie'), null)
  assert.doesNotMatch(await result.text(), /postgres|secret-value/)
})
