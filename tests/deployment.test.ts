import assert from 'node:assert/strict'
import { createServer, type ServerResponse } from 'node:http'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { inspectConfiguration, probeDatabase, probeHealth } from '../scripts/deployment-probe'

async function withServer(handler: (response: ServerResponse) => void, run: (url: string) => Promise<void>) {
  const server = createServer((_request, response) => handler(response))
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  try { await run(`http://127.0.0.1:${address.port}`) } finally {
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
  }
}

test('configuration evidence exposes presence only, including when values resemble secrets or URIs', () => {
  const result = inspectConfiguration({ DATABASE_URL: 'postgres://user:do-not-print@private/database', ORS_API_KEY: 'secret-sentinel' })
  assert.equal(result.find((item) => item.name === 'DATABASE_URL')?.present, true)
  assert.equal(result.find((item) => item.name === 'SESSION_SECRET')?.present, false)
  assert.doesNotMatch(JSON.stringify(result), /do-not-print|private|secret-sentinel/)
})

test('health proves the envelope, matching request id and no-store contract', async () => {
  await withServer((response) => {
    response.writeHead(200, { 'Content-Type': 'application/json', 'X-Request-Id': 'probe-request', 'Cache-Control': 'private, no-store' })
    response.end(JSON.stringify({ data: { status: 'ok' }, requestId: 'probe-request' }))
  }, async (url) => assert.equal((await probeHealth(url)).status, 'passed'))
})

test('health rejects misleading success bodies, redirect and mismatched request identifiers without leaking bodies', async () => {
  for (const fixture of [
    { status: 200, id: 'other', body: { data: { status: 'ok' }, requestId: 'probe-request' } },
    { status: 200, id: 'probe-request', body: { data: { status: 'failed' }, requestId: 'probe-request' } },
    { status: 302, id: 'probe-request', body: { secret: 'body-secret-sentinel' } },
  ]) {
    await withServer((response) => {
      response.writeHead(fixture.status, { 'Content-Type': 'application/json', 'X-Request-Id': fixture.id, 'Cache-Control': 'no-store', Location: '/private' })
      response.end(JSON.stringify(fixture.body))
    }, async (url) => {
      const result = await probeHealth(url)
      assert.equal(result.status, 'failed')
      assert.doesNotMatch(JSON.stringify(result), /body-secret-sentinel/)
    })
  }
})

test('health refuses credentials and query strings instead of requesting secret-bearing URLs', async () => {
  for (const url of ['https://user:password@example.com', 'https://example.com?token=secret', 'file:///tmp/private']) {
    const result = await probeHealth(url)
    assert.equal(result.status, 'blocked')
    assert.doesNotMatch(JSON.stringify(result), /password|token=|private/)
  }
})

test('database probe blocks missing or malformed connection strings without exposing input', async () => {
  assert.equal((await probeDatabase({})).code, 'DATABASE_URL_MISSING')
  const result = await probeDatabase({ DATABASE_URL: 'https://user:secret-sentinel@example.com/database' })
  assert.equal(result.status, 'blocked')
  assert.doesNotMatch(JSON.stringify(result), /secret-sentinel|example/)
})

const backupScript = resolve('scripts/backup-restore.sh')
function backupCommand(args: string[], env: Readonly<Record<string, string | undefined>> = {}) {
  return spawnSync('bash', [backupScript, ...args], { encoding: 'utf8', env: { NODE_ENV: 'test', PATH: process.env.PATH, ...env } })
}

test('backup refuses missing source configuration without exposing environment values', () => {
  const result = backupCommand(['backup', '/tmp/accessloop-never-written.dump'])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /DATABASE_URL_MISSING/)
})

test('restore requires an explicit separate empty target before opening a connection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'accessloop-backup-test-'))
  try {
    const archive = join(directory, 'database.dump')
    writeFileSync(archive, 'synthetic archive')
    const result = backupCommand(['restore', archive], { DATABASE_URL: 'postgres://user:source-secret@localhost/source' })
    assert.equal(result.status, 2)
    assert.match(result.stderr, /RESTORE_DATABASE_URL_MISSING/)
    assert.doesNotMatch(result.stderr + result.stdout, /source-secret/)
    assert.equal(readFileSync(archive, 'utf8'), 'synthetic archive')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('restore rejects mismatched archive checksums before touching a database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'accessloop-backup-test-'))
  try {
    const archive = join(directory, 'database.dump')
    writeFileSync(archive, 'corrupted archive')
    writeFileSync(`${archive}.sha256`, '0'.repeat(64) + '\n')
    const result = backupCommand(['restore', archive], {
      DATABASE_URL: 'postgres://localhost/source', RESTORE_DATABASE_URL: 'postgres://localhost/target', RESTORE_CONFIRM: 'isolated-empty-database',
    })
    assert.equal(result.status, 2)
    assert.match(result.stderr, /CHECKSUM_MISMATCH/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('the operator CLI runs in inspection mode without leaking environment values', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/deployment-probe.ts')], {
    encoding: 'utf8', env: { NODE_ENV: 'test', PATH: process.env.PATH, ORS_API_KEY: 'cli-secret-sentinel' },
  })
  assert.equal(result.status, 0)
  const evidence = JSON.parse(result.stdout)
  assert.equal(evidence.externalFunctionalVerification, 'not-performed')
  assert.doesNotMatch(result.stdout + result.stderr, /cli-secret-sentinel/)
})

// A real child process checks our libpq boundary; no URI or password enters argv.
test('database connection options are translated to libpq variables rather than a URI database name', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'accessloop-psql-test-'))
  try {
    const executable = join(directory, 'psql')
    writeFileSync(executable, `#!/bin/sh
[ "$PGHOST" = 'db.example.com' ] && [ "$PGPORT" = '6432' ] && [ "$PGUSER" = 'dbuser' ] && [ "$PGPASSWORD" = 'encoded:secret' ] && [ "$PGDATABASE" = 'application' ] && [ "$PGSSLMODE" = 'require' ] || exit 1
case "$*" in *secret*|*postgresql://*) exit 1 ;; esac
printf '1\\n'
`)
    chmodSync(executable, 0o700)
    const result = await probeDatabase({ PATH: directory, DATABASE_URL: 'postgresql://dbuser:encoded%3Asecret@db.example.com:6432/application?sslmode=require' })
    assert.equal(result.status, 'passed')
    assert.doesNotMatch(JSON.stringify(result), /encoded|dbuser|example/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
