import { installRoutingRepository } from '@/features/routing/server/runtime'
import config, { assertPayloadEnvironment } from '@/payload.config'
import { assertSessionSecret } from '@/server/auth/session-cookie'
import { AppError } from '@/server/http/errors'
import { getPayload } from 'payload'

import { createRoutingRepository } from './routing-repository'

const repositoryFactory = async () => {
  const regionId = process.env.REGION_ID?.trim() ?? ''
  const sessionSecret = process.env.SESSION_SECRET ?? ''
  try {
    assertPayloadEnvironment()
    assertSessionSecret(sessionSecret)
    if (!regionId) throw new Error('A region is required.')
  } catch {
    throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The application data service is not configured.')
  }
  return createRoutingRepository(await getPayload({ config }), {
    regionId,
    sessionSecret,
  })
}

export function installPersistentRouting(): void {
  installRoutingRepository(repositoryFactory)
}
