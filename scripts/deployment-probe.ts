#!/usr/bin/env -S pnpm exec tsx
import nextEnv from '@next/env'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { connect } from 'node:tls'
import { fileURLToPath } from 'node:url'

type Environment = Readonly<Record<string, string | undefined>>
export type ProbeResult = { check: string; status: 'passed' | 'failed' | 'blocked'; code: string }
const configurationNames = [
  'APP_BASE_URL', 'DATABASE_URL', 'PAYLOAD_SECRET', 'SESSION_SECRET',
  'OSS_ENDPOINT', 'OSS_BUCKET', 'OSS_REGION', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET',
  'ORS_API_KEY', 'ORS_BASE_URL', 'VISION_API_KEY', 'VISION_PROVIDER', 'VISION_MODEL',
] as const

export function inspectConfiguration(environment: Environment) {
  return configurationNames.map((name) => ({ name, present: Boolean(environment[name]?.trim()) }))
}

function httpOrigin(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null
    return url
  } catch { return null }
}

export async function probeHealth(baseUrl: string, timeoutMs = 5000): Promise<ProbeResult> {
  const check = 'application-health'
  const url = httpOrigin(baseUrl)
  if (!url) return { check, status: 'blocked', code: 'APP_BASE_URL_INVALID' }
  try {
    const response = await fetch(new URL('/api/health', url), { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } })
    if (response.status !== 200) {
      await response.body?.cancel()
      return { check, status: 'failed', code: 'HEALTH_HTTP_STATUS' }
    }
    const contentType = response.headers.get('content-type') ?? ''
    const noStore = /(?:^|,\s*)no-store(?:,|$)/i.test(response.headers.get('cache-control') ?? '')
    // Never include response bodies, headers, upstream errors or URLs in evidence.
    const body: unknown = await response.json()
    const valid = typeof body === 'object' && body !== null && 'data' in body && 'requestId' in body
      && typeof body.requestId === 'string' && body.requestId.length > 0
      && response.headers.get('x-request-id') === body.requestId
      && typeof body.data === 'object' && body.data !== null && 'status' in body.data && body.data.status === 'ok'
    return { check, status: valid && noStore && /^application\/json\b/i.test(contentType) ? 'passed' : 'failed', code: valid && noStore && /^application\/json\b/i.test(contentType) ? 'LIVENESS_ONLY' : 'HEALTH_CONTRACT_INVALID' }
  } catch { return { check, status: 'failed', code: 'HEALTH_UNAVAILABLE_OR_INVALID_JSON' } }
}

export async function probeDatabase(environment: Environment): Promise<ProbeResult> {
  const check = 'postgres-connection'
  const databaseUrl = environment.DATABASE_URL?.trim()
  if (!databaseUrl) return { check, status: 'blocked', code: 'DATABASE_URL_MISSING' }
  let connectionEnvironment: NodeJS.ProcessEnv
  try {
    const url = new URL(databaseUrl)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.hash) throw new Error('invalid')
    connectionEnvironment = {
      NODE_ENV: 'production', PATH: environment.PATH, PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGCONNECT_TIMEOUT: '5', PGPASSFILE: '/dev/null',
    }
    const options: Record<string, string> = { sslmode: 'PGSSLMODE', sslrootcert: 'PGSSLROOTCERT', sslcert: 'PGSSLCERT', sslkey: 'PGSSLKEY', sslpassword: 'PGSSLPASSWORD', channel_binding: 'PGCHANNELBINDING', ssl_min_protocol_version: 'PGSSLMINPROTOCOLVERSION', application_name: 'PGAPPNAME', options: 'PGOPTIONS', target_session_attrs: 'PGTARGETSESSIONATTRS', gssencmode: 'PGGSSENCMODE' }
    for (const [key, value] of url.searchParams) {
      if (key === 'connect_timeout') continue // The probe always uses a bounded five-second connect timeout.
      if (!options[key]) throw new Error('invalid')
      connectionEnvironment[options[key]] = value
    }
    if (Object.values(connectionEnvironment).some((value) => value !== undefined && /[\x00-\x1f]/.test(value))) throw new Error('invalid')
  } catch { return { check, status: 'blocked', code: 'DATABASE_URL_INVALID' } }
  return new Promise((done) => {
    // Translate the URI: libpq does not expand a URI stored in PGDATABASE. Never place it in argv or emit stderr.
    execFile('psql', ['--no-psqlrc', '--no-password', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--command=SELECT 1'], {
      env: connectionEnvironment, timeout: 7000, maxBuffer: 4096,
    }, (error, stdout) => done({ check, status: !error && stdout.trim() === '1' ? 'passed' : 'failed', code: !error && stdout.trim() === '1' ? 'POSTGRES_SELECT_1' : 'POSTGRES_CONNECTION_FAILED' }))
  })
}

async function probeTls(label: string, value: string | undefined): Promise<ProbeResult> {
  const check = `${label}-tls-egress`
  if (!value) return { check, status: 'blocked', code: 'ENDPOINT_MISSING' }
  let url: URL
  try {
    url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('invalid')
  } catch { return { check, status: 'blocked', code: 'ENDPOINT_INVALID' } }
  return new Promise((done) => {
    const socket = connect({ host: url.hostname, port: Number(url.port || '443'), servername: url.hostname, rejectUnauthorized: true })
    let finished = false
    const finish = (status: ProbeResult['status'], code: string) => {
      if (finished) return
      finished = true
      socket.destroy()
      done({ check, status, code })
    }
    socket.setTimeout(5000, () => finish('failed', 'TLS_TIMEOUT'))
    socket.once('secureConnect', () => finish('passed', 'TLS_ONLY_NO_AUTH_OR_API_CALL'))
    socket.once('error', () => finish('failed', 'TLS_CONNECTION_FAILED'))
  })
}

async function main() {
  const arguments_ = process.argv.slice(2)
  if (arguments_.some((argument) => !['--http', '--database', '--egress'].includes(argument))) {
    console.error('Usage: pnpm exec tsx scripts/deployment-probe.ts [--http] [--database] [--egress]')
    process.exitCode = 2
    return
  }
  nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', { info() {}, error() {} })
  const checks: ProbeResult[] = []
  if (arguments_.includes('--http')) checks.push(process.env.APP_BASE_URL
    ? await probeHealth(process.env.APP_BASE_URL)
    : { check: 'application-health', status: 'blocked', code: 'APP_BASE_URL_MISSING' })
  if (arguments_.includes('--database')) checks.push(await probeDatabase(process.env))
  if (arguments_.includes('--egress')) checks.push(...await Promise.all([
    probeTls('ors', process.env.ORS_BASE_URL), probeTls('oss', process.env.OSS_ENDPOINT),
    probeTls('glm', process.env.VISION_PROVIDER === 'glm' ? 'https://open.bigmodel.cn' : undefined),
  ]))
  console.log(JSON.stringify({ evaluatedAt: new Date().toISOString(), configuration: inspectConfiguration(process.env), checks, externalFunctionalVerification: 'not-performed' }, null, 2))
  if (checks.some((check) => check.status !== 'passed')) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => { console.error('DEPLOYMENT_PROBE_FAILED'); process.exitCode = 1 })
}
