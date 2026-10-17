import nextEnv from '@next/env'
import { readFile } from 'node:fs/promises'
import { getPayload } from 'payload'

import { createBusinessRepository } from '../src/server/storage/business-repository'
import { RegionSeedSchema } from '../src/shared/contracts/storage'

nextEnv.loadEnvConfig(process.cwd())
process.env.DISABLE_PAYLOAD_HMR = 'true'

async function seedRegion(): Promise<void> {
  const filename = process.argv[2]
  if (!filename || process.argv.length !== 3) throw new Error('Usage: pnpm exec tsx scripts/seed-region.ts <reviewed-region.json>')
  const seed = RegionSeedSchema.parse(JSON.parse(await readFile(filename, 'utf8')))
  const { default: config, assertPayloadEnvironment } = await import('../src/payload.config')
  assertPayloadEnvironment()
  const payload = await getPayload({ config })
  try {
    const result = await createBusinessRepository(payload).seedRegion(seed)
    console.info(`Region initialization: ${result}. Source: ${seed.source.kind}. Passages: ${seed.presetPassages.length}.`)
  } finally { await payload.destroy() }
}

seedRegion().then(() => process.exit(0)).catch(() => {
  console.error('Region initialization failed. Check the reviewed seed schema, database migrations and existing configuration. Existing regions are never overwritten by this command.')
  process.exit(1)
})
