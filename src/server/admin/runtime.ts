import { getPayload } from 'payload'

import config, { assertPayloadEnvironment } from '@/payload.config'
import { createReviewService } from '@/features/hazards/server/review'
import { AppError } from '@/server/http/errors'
import { createRoutingRepository } from '@/server/storage/routing-repository'
import { readUsageSummary } from '@/server/providers/usage'
import { createAdminRegionService } from './region-service'
import { trustedMaintainerReferences } from './config'

export async function adminServices() {
  assertPayloadEnvironment()
  const regionId = process.env.REGION_ID?.trim()
  const sessionSecret = process.env.SESSION_SECRET ?? ''
  if (!regionId || Buffer.byteLength(sessionSecret) < 32) {
    throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The administration service is not configured.')
  }
  const payload = await getPayload({ config })
  return {
    payload, regionId,
    reviews: createReviewService(payload, {
      regionId, sessionSecret,
      visionConfig: {
        model: process.env.VISION_MODEL?.trim() || 'glm-4.6v-flash',
        promptVersion: process.env.VISION_PROMPT_VERSION?.trim() || '1',
        schemaVersion: process.env.VISION_SCHEMA_VERSION?.trim() || '1',
      },
      trustedMaintainerReferences: trustedMaintainerReferences(process.env.TRUSTED_MAINTAINER_REFERENCES),
    }),
    region: createAdminRegionService(payload, { regionId }),
    usage: () => readUsageSummary(createRoutingRepository(payload, { regionId, sessionSecret })),
  }
}
