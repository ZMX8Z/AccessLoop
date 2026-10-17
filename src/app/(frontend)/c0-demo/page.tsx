import { notFound } from 'next/navigation'

import { getBusinessRepository } from '@/server/storage/runtime'

import { SessionDemo } from './session-demo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function C0Demo() {
  if (process.env.NODE_ENV !== 'development' || process.env.APP_MODE !== 'demo') notFound()
  const repository = await getBusinessRepository()
  const regionId = process.env.REGION_ID?.trim() ?? ''
  const region = await repository.getRegion(regionId)
  const passages = region ? await repository.getPassages(regionId) : null

  return <main style={{ maxWidth: 860, margin: '32px auto', padding: 24, color: '#172a3a', fontFamily: 'system-ui, sans-serif' }}>
    <p style={{ color: '#006d77', fontWeight: 700 }}>ACCESSLOOP · C0 DEVELOPMENT CHECK</p>
    <h1 style={{ fontSize: 36, marginBottom: 12 }}>The data foundation is taking shape.</h1>
    <p>This page reads the real local PostgreSQL database and calls the real session endpoint.</p>
    <aside style={{ background: '#fff1cc', borderRadius: 12, padding: 16, margin: '24px 0' }}>
      <strong>Test data only.</strong> These coordinates are invented. This is not a campus map or a verified accessible route.
      This verification page is disabled in production.
    </aside>
    <section style={{ border: '1px solid #cad8de', borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>1. Persistent region and passages</h2>
      {region && passages ? <>
        <p><strong>{region.name}</strong></p>
        <p>Region ID: <code>{region.id}</code> · Configuration version: {region.configVersion}</p>
        <ul>{passages.items.map(passage => <li key={passage.id} style={{ marginBottom: 12 }}>
          {passage.name} · version {passage.passageVersion}<br /><code>{passage.id}</code>
        </li>)}</ul>
        <p>Refresh this page to read the same stored IDs and versions again.</p>
      </> : <p>No region has been initialized. Run the reviewed seed command first.</p>}
    </section>
    <SessionDemo />
    <p style={{ color: '#526873', fontSize: 14 }}>C0 includes storage and anonymous identity. Uploads, AI, report actions and route calculation are delivered in later stages.</p>
  </main>
}
