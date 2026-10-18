import { getPayload } from 'payload'

import config, { assertPayloadEnvironment } from '@/payload.config'

import { createBusinessRepository } from './business-repository'

export async function getBusinessRepository() {
  assertPayloadEnvironment()
  return createBusinessRepository(await getPayload({ config }))
}
