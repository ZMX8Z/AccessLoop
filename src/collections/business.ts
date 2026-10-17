import type { CollectionConfig, Field } from 'payload'
import { isEnabledAdmin } from './Admins'
import { readAdminAudit, readAdminRegionData } from '@/server/admin/collection-access'

const deny = () => false
const id = { name: 'id', type: 'text', required: true } satisfies Field
const text = (name: string, indexed = false): Field => ({ name, type: 'text', required: true, index: indexed })
const json = (name: string): Field => ({ name, type: 'json', required: true })
const date = (name: string): Field => ({ name, type: 'date', required: true, index: true })
const version = (name: string, initial = 1): Field => ({
  name, type: 'number', required: true, min: initial, defaultValue: initial,
  validate: (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= initial
    ? true : `A whole number greater than or equal to ${initial} is required.`,
})

function internal(slug: string, fields: Field[]): CollectionConfig {
  return {
    slug,
    admin: { hidden: true },
    endpoints: false,
    access: { create: deny, read: deny, update: deny, delete: deny, unlock: deny },
    fields: [{ ...id }, ...fields],
  }
}

function administrativeRead(slug: string, fields: Field[]): CollectionConfig {
  const collection = internal(slug, fields)
  for (const field of collection.fields) {
    if (field.type === 'ui') continue
    field.admin = { ...field.admin, readOnly: true }
  }
  if (slug === 'hazard-reports') collection.fields = [
    { ...id, admin: { readOnly: true } },
    { name: 'reviewActions', type: 'ui', admin: { components: { Field: '/components/admin/server#ReportReviewPanel' } } },
    { type: 'collapsible', label: 'Read-only stored record', admin: { initCollapsed: true }, fields: collection.fields.slice(1) },
  ]
  return {
    ...collection,
    endpoints: [],
    admin: {
      group: 'Reports and evidence',
      useAsTitle: 'id',
      defaultColumns: slug === 'hazard-reports' ? ['id', 'status', 'rowVersion', 'updatedAt']
        : slug === 'report-events' ? ['reportId', 'action', 'actorRole', 'reason', 'createdAt']
          : ['id', 'createdAt'],
      description: 'Read-only records. Changes use the protected AccessLoop commands.',
    },
    access: {
      ...collection.access,
      admin: ({ req }) => isEnabledAdmin(req.user),
      read: slug === 'report-events' ? readAdminAudit : readAdminRegionData,
    },
  }
}

export const BusinessCollections: CollectionConfig[] = [
  internal('regions', [
    text('name'), json('bbox'), text('timezone'),
    { name: 'isDemo', type: 'checkbox', required: true },
    version('hazardVersion', 0), version('configVersion'),
    { name: 'personalValiditySec', type: 'number', required: true, min: 1 },
    { name: 'publicValiditySec', type: 'number', required: true, min: 1 },
    { name: 'avoidanceBufferM', type: 'number', required: true, min: 0.5, max: 5 },
    json('routing'), json('seedSource'), text('seedFingerprint'),
  ]),
  internal('preset-passages', [
    text('regionId', true), version('passageVersion'), text('name'), json('geometry'),
  ]),
  internal('anonymous-sessions', [
    { name: 'ownerSessionHash', type: 'text', required: true, unique: true },
  ]),
  internal('session-contexts', [text('regionId', true), text('ownerSessionHash', true), version('personalVersion', 0)]),
  internal('route-snapshots', [text('ownerSessionHash', true), text('regionId', true), json('geometry'), date('expiresAt'), { name: 'context', type: 'json' }]),
  internal('service-cache', [json('result'), date('expiresAt')]),
  internal('route-cache', [
    text('regionId', true), text('scopeKey', true), text('requestHash', true),
    version('hazardVersion', 0), version('personalVersion', 0), text('activeDigest'),
    json('result'), date('expiresAt'),
  ]),
  internal('provider-usage', [
    text('keyFingerprint', true),
    { name: 'service', type: 'select', required: true, index: true, options: ['ors_directions', 'vision', 'geocoding', 'poi'] },
    date('reservedAt'),
    { name: 'reservationExpiresAt', type: 'date' },
    { name: 'startedAt', type: 'date' },
    { name: 'outcome', type: 'select', required: true, defaultValue: 'reserved', options: ['reserved', 'started', 'success', 'error'] },
    { name: 'finishedAt', type: 'date' },
    { name: 'errorCode', type: 'text' },
  ]),
  internal('provider-blocks', [
    text('keyFingerprint', true),
    { name: 'service', type: 'select', required: true, options: ['ors_directions', 'vision', 'geocoding', 'poi'] },
    date('blockedUntil'),
    { name: 'reason', type: 'select', options: ['rate', 'quota'] },
  ]),
  internal('provider-events', [
    { name: 'service', type: 'select', required: true, index: true, options: ['ors_directions', 'vision', 'geocoding', 'poi'] },
    { name: 'kind', type: 'select', required: true, options: ['wait', 'cache_hit', 'call', 'error'] },
    { name: 'category', type: 'text' },
    date('occurredAt'),
  ]),
  internal('idempotency-records', [text('requestFingerprint'), json('result'), date('expiresAt')]),
  internal('photo-upload-operations', [
    text('requestFingerprint'), text('photoId'), text('filename'),
    { name: 'state', type: 'select', required: true, options: ['pending', 'complete', 'failed'] },
    text('leaseToken'), date('leaseExpiresAt'),
    { name: 'result', type: 'json' },
  ]),
  internal('external-operations', [
    text('regionId', true), text('ownerSessionHash', true), text('requestFingerprint'),
    { name: 'status', type: 'select', required: true, options: ['pending', 'completed'] },
    { name: 'leaseToken', type: 'text' },
    { name: 'leaseExpiresAt', type: 'date' },
    date('expiresAt'), { name: 'result', type: 'json' },
  ]),
  administrativeRead('ai-analyses', [
    text('regionId', true), text('ownerSessionHash', true), text('photoId', true),
    text('imageHash'), text('cacheKey', true), json('analysis'),
  ]),
  administrativeRead('hazard-reports', [
    text('regionId', true), text('ownerSessionHash', true),
    { name: 'status', type: 'select', required: true, options: ['pending', 'ai_assessed', 'verified', 'resolved', 'rejected'] },
    version('rowVersion'),
    { name: 'facts', type: 'json' },
    { name: 'publicSnapshot', type: 'json' },
  ]),
  administrativeRead('personal-avoidances', [
    { name: 'reportId', type: 'text', required: true, unique: true },
    text('regionId', true), text('ownerSessionHash', true),
    { name: 'active', type: 'checkbox', required: true, defaultValue: false, index: true },
    json('confirmedPath'), json('avoidGeometry'),
    { name: 'decisionSource', type: 'select', required: true, options: ['ai_user_confirmed', 'user_manual'] },
    date('observedAt'), date('confirmedAt'), date('validUntil'), version('confirmationReportVersion'),
  ]),
  administrativeRead('report-events', [
    text('reportId', true), text('actorId'), text('actorRole'), text('action'),
    json('before'), json('after'), json('contextVersions'), text('reason'),
  ]),
]
