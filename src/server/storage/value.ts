import { createHash } from 'node:crypto'
import { z } from 'zod'

import type { JsonValue } from '@/shared/contracts/storage'

export function canonicalJSON(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`
}

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJSON(z.json().parse(value))).digest('hex')
}

export class StorageError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'REGION_NOT_CONFIGURED' | 'SEED_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'VERSION_CONFLICT' | 'INVALID_TRANSITION' | 'RESERVATION_EXPIRED' | 'PROVIDER_BLOCKED',
    message: string,
  ) { super(message); this.name = 'StorageError' }
}
