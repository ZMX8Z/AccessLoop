import type { CollectionConfig, Field } from 'payload'

const deny = () => false
const id: Field = { name: 'id', type: 'text', required: true }
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
  internal('hazard-reports', [
    text('regionId', true), text('ownerSessionHash', true),
    { name: 'status', type: 'select', required: true, options: ['pending', 'ai_assessed', 'verified', 'resolved', 'rejected'] },
    version('rowVersion'),
    { name: 'publicSnapshot', type: 'json' },
  ]),
  internal('personal-avoidances', [
    { name: 'reportId', type: 'text', required: true, unique: true },
    text('regionId', true), text('ownerSessionHash', true),
    { name: 'active', type: 'checkbox', required: true, defaultValue: false, index: true },
    json('confirmedPath'), json('avoidGeometry'),
    { name: 'decisionSource', type: 'select', required: true, options: ['ai_user_confirmed', 'user_manual'] },
    date('observedAt'), date('confirmedAt'), date('validUntil'), version('confirmationReportVersion'),
  ]),
  internal('report-events', [
    text('reportId', true), text('actorId'), text('actorRole'), text('action'),
    json('before'), json('after'), json('contextVersions'), text('reason'),
  ]),
]
