import { getPayload } from 'payload'

import config, { assertPayloadEnvironment } from '@/payload.config'
import { AppError } from '@/server/http/errors'
import { createHazardService } from '@/features/hazards/server/service'
import { createPhotoService } from './service'
import { createAnalysisService } from './analysis'

export async function c1Services() {
  assertPayloadEnvironment()
  const regionId = process.env.REGION_ID?.trim()
  const sessionSecret = process.env.SESSION_SECRET ?? ''
  if (!regionId || Buffer.byteLength(sessionSecret) < 32) {
    throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The report service is not configured.')
  }
  const payload = await getPayload({ config })
  const visionConfig = {
    model: process.env.VISION_MODEL?.trim() || 'glm-4.6v-flash',
    promptVersion: process.env.VISION_PROMPT_VERSION?.trim() || '1',
    schemaVersion: process.env.VISION_SCHEMA_VERSION?.trim() || '1',
  }
  const photos = createPhotoService(payload, { regionId })
  return {
    photos,
    analyses: createAnalysisService(payload, { regionId, visionConfig, readOwnedReportBytes: photos.readOwnedReportBytes }),
    hazards: createHazardService(payload, { regionId, sessionSecret, visionConfig }),
  }
}
