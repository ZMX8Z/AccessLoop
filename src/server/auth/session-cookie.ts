import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'accessloop_session'
const credentialPattern = /^v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/

export function assertSessionSecret(secret: string): void {
  if (Buffer.byteLength(secret) < 32) throw new Error('SESSION_SECRET must contain at least 32 bytes.')
}

function signature(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url')
}

export function issueSessionCredential(secret: string): string {
  assertSessionSecret(secret)
  const message = `v1.${randomBytes(32).toString('base64url')}`
  return `${message}.${signature(message, secret)}`
}

export function sessionOwnerHash(credential: string): string {
  return createHash('sha256').update(credential).digest('hex')
}

export function readSessionCredential(cookieHeader: string | null, secret: string): string | null {
  assertSessionSecret(secret)
  const values = (cookieHeader ?? '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
  if (values.length !== 1) return null
  const credential = values[0].slice(SESSION_COOKIE_NAME.length + 1)
  if (!credentialPattern.test(credential)) return null
  const separator = credential.lastIndexOf('.')
  const message = credential.slice(0, separator)
  const actual = Buffer.from(credential.slice(separator + 1), 'ascii')
  const expected = Buffer.from(signature(message, secret), 'ascii')
  return timingSafeEqual(actual, expected) ? credential : null
}

export function sessionCookieHeader(credential: string, secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=${credential}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}
