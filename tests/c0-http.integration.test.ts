import assert from 'node:assert/strict'
import test from 'node:test'

import { SessionDataSchema } from '../src/shared/contracts/session'

test('C0 HTTP initializes and reuses private sessions while rejecting invalid origins and CMS bypasses', {
  skip: process.env.ACCESSLOOP_HTTP_TESTS !== '1', timeout: 90_000,
}, async () => {
  const origin = process.env.APP_BASE_URL ?? ''
  const url = new URL(origin)
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Only run this check against a local development instance.')
  const send = (headers: Record<string, string> = {}, body = '{}') => fetch(`${origin}/api/session`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body,
  })
  const health = await fetch(`${origin}/api/health`)
  assert.equal(health.status, 200)
  const wrongMethod = await fetch(`${origin}/api/session`)
  assert.equal(wrongMethod.status, 405)
  assert.equal((await wrongMethod.json()).error.code, 'INVALID_INPUT')
  for (const untrustedOrigin of ['', 'null', 'https://untrusted.example']) {
    const response = await send({ Origin: untrustedOrigin })
    assert.equal(response.status, 403)
    assert.equal((await response.json()).error.code, 'FORBIDDEN')
    assert.equal(response.headers.get('set-cookie'), null)
  }
  const invalid = await send({}, '{"ownerSessionHash":"not-allowed"}')
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'INVALID_INPUT')
  const first = await send()
  assert.equal(first.status, 200)
  const firstBody = await first.json()
  SessionDataSchema.parse(firstBody.data)
  assert.equal(firstBody.requestId, first.headers.get('x-request-id'))
  assert.match(first.headers.get('cache-control') ?? '', /no-store/)
  const cookie = first.headers.get('set-cookie')
  assert.ok(cookie)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.doesNotMatch(cookie, /Expires=|Max-Age=|Domain=/)
  assert.doesNotMatch(JSON.stringify(firstBody), /ownerSessionHash|sessionId|recoveryToken/)
  const reused = await send({ Cookie: cookie.split(';')[0] })
  assert.equal(reused.status, 200)
  assert.deepEqual((await reused.json()).data, firstBody.data)
  assert.equal(reused.headers.get('set-cookie'), null)
  assert.notEqual(reused.headers.get('x-request-id'), firstBody.requestId)
  const second = await send()
  assert.equal(second.status, 200)
  assert.notEqual(second.headers.get('set-cookie'), cookie)
  const tampered = await send({ Cookie: 'accessloop_session=v1.forged.invalid' })
  assert.equal(tampered.status, 200)
  assert.ok(tampered.headers.get('set-cookie'))
  for (const collection of ['regions', 'preset-passages', 'anonymous-sessions', 'session-contexts', 'route-snapshots', 'provider-usage', 'idempotency-records', 'hazard-reports', 'report-events']) {
    const response = await fetch(`${origin}/cms-api/${collection}`)
    assert.ok([403, 404, 501].includes(response.status), `${collection} must not expose a generic CMS endpoint in C0.`)
  }
  const registration = await fetch(`${origin}/cms-api/admins/first-register`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'attacker@example.invalid', password: 'not-an-admin-password' }),
  })
  assert.equal(registration.status, 403)
})
