import { notFound } from 'next/navigation'

import { getBusinessRepository } from '@/server/storage/runtime'
import { C1Demo } from './workflow'

export const dynamic = 'force-dynamic'

export default async function C1DemoPage() {
  if (process.env.NODE_ENV !== 'development' || process.env.APP_MODE !== 'demo') notFound()
  const repository = await getBusinessRepository()
  const regionId = process.env.REGION_ID ?? ''
  const region = await repository.requireRegion(regionId)
  const { items } = await repository.getPassages(regionId)
  return <C1Demo region={region} passages={items} initialObservation={new Date().toISOString()} />
}
