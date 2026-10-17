import assert from 'node:assert/strict'
import test from 'node:test'
import { hasMatchingOrigin } from '../src/server/http/origin'

test('browser writes require the exact configured application origin', () => {
  const request = new Request('https://app.example.test/cms-api/admins/logout', {
    method: 'POST', headers: { Origin: 'https://app.example.test' },
  })
  assert.equal(hasMatchingOrigin(request, 'https://app.example.test'), true)
  assert.equal(hasMatchingOrigin(request, 'https://other.example.test'), false)
  assert.equal(hasMatchingOrigin(request, 'http://app.example.test'), false)
  assert.equal(hasMatchingOrigin(request, 'https://app.example.test:8443'), false)
})

test('same-site fetch metadata does not replace an Origin header', () => {
  const request = new Request('https://app.example.test/cms-api/admins/logout', {
    method: 'POST', headers: { 'Sec-Fetch-Site': 'same-site' },
  })
  assert.equal(hasMatchingOrigin(request, 'https://app.example.test'), false)
})

test('a null or malformed Origin is rejected', () => {
  for (const origin of ['null', 'https://app.example.test/', 'https://app.example.test.evil.test']) {
    const request = new Request('https://app.example.test', { headers: { Origin: origin } })
    assert.equal(hasMatchingOrigin(request, 'https://app.example.test'), false)
  }
})
