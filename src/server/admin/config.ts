import { z } from 'zod'

import { AppError } from '@/server/http/errors'
import { MaintainerReferenceSchema } from '@/shared/contracts/review'

const TrustedReferencesSchema = z.array(MaintainerReferenceSchema).max(100)

/** Deployment operators approve exact references; references are never fetched as URLs. */
export function trustedMaintainerReferences(value: string | undefined): string[] {
  if (!value?.trim()) return []
  try { return TrustedReferencesSchema.parse(JSON.parse(value)) }
  catch { throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Trusted maintainer references are not configured correctly.') }
}
