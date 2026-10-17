import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { z } from 'zod'

import { validateRegionConfigChange } from '@/features/routing/server/geometry'
import { AppError } from '@/server/http/errors'
import { withTransaction } from '@/server/storage/transaction'
import { fingerprint } from '@/server/storage/value'
import { IdSchema } from '@/shared/contracts/common'
import { RegionAdminDTOSchema, RegionPatchInputSchema } from '@/shared/contracts/admin-region'
import type { PresetPassageDTO } from '@/shared/contracts/region'

import {
  activeRegionBindings, readRegionConfiguration, requireRegionOperator, RegionActorSchema,
  runRegionCommand, type RegionActor,
} from './region-repository'

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', 'Check the region configuration fields and reason.')
  return parsed.data
}

export function createAdminRegionService(payload: Payload, options: { regionId: string; now?: () => number }) {
  const regionId = IdSchema.parse(options.regionId)
  const now = options.now ?? Date.now
  return {
    async get(input: { actor: RegionActor }) {
      const actor = parse(RegionActorSchema, input.actor)
      return withTransaction(payload, async (transaction) => {
        await requireRegionOperator(payload, transaction, actor)
        await transaction.execute(sql`SELECT id FROM regions WHERE id = ${regionId} FOR SHARE`)
        return readRegionConfiguration(payload, regionId, transaction.req)
      })
    },
    async patch(arguments_: { actor: RegionActor; idempotencyKey: string; input: unknown }) {
      const actor = parse(RegionActorSchema, arguments_.actor)
      const input = parse(RegionPatchInputSchema, arguments_.input)
      const key = parse(z.string().regex(/^[\x21-\x7e]{8,128}$/), arguments_.idempotencyKey)
      return runRegionCommand(payload, { actor, regionId, key, request: input, now: new Date(now()) }, async (transaction) => {
        await transaction.execute(sql`SELECT id FROM regions WHERE id = ${regionId} FOR UPDATE`)
        const before = await readRegionConfiguration(payload, regionId, transaction.req)
        if (before.region.configVersion !== input.expectedVersion) throw new AppError(409, 'VERSION_CONFLICT', 'This region configuration has changed. Reload it before continuing.', { currentVersion: before.region.configVersion })
        const oldPassages = new Map(before.presetPassages.map((passage) => [passage.id, passage]))
        const presetPassages: PresetPassageDTO[] = []
        const seen = new Set<string>()
        if (input.changes.presetPassages !== undefined) {
          for (const entry of input.changes.presetPassages) {
            if (entry.id && (seen.has(entry.id) || !oldPassages.has(entry.id))) throw new AppError(409, 'CONFIG_CONFLICT', 'Use each current passage identifier once; omit the identifier for a new passage.')
            const id = entry.id ?? randomUUID()
            seen.add(id)
            const previous = oldPassages.get(id)
            const changed = previous && (previous.name !== entry.name || fingerprint(previous.geometry) !== fingerprint(entry.geometry))
            presetPassages.push({
              id, name: entry.name, geometry: entry.geometry,
              passageVersion: previous ? previous.passageVersion + (changed ? 1 : 0) : 1,
              isDemo: input.changes.isDemo ?? before.region.isDemo,
            })
          }
        } else presetPassages.push(...before.presetPassages.map((passage) => ({ ...passage, isDemo: input.changes.isDemo ?? before.region.isDemo })))
        presetPassages.sort((a, b) => a.id.localeCompare(b.id))
        const changes = input.changes
        const regionChanges = {
          ...(changes.name !== undefined ? { name: changes.name } : {}),
          ...(changes.timezone !== undefined ? { timezone: changes.timezone } : {}),
          ...(changes.bbox !== undefined ? { bbox: changes.bbox } : {}),
          ...(changes.isDemo !== undefined ? { isDemo: changes.isDemo } : {}),
          ...(changes.avoidanceBufferM !== undefined ? { avoidanceBufferM: changes.avoidanceBufferM } : {}),
        }
        const next = RegionAdminDTOSchema.parse({ region: { ...before.region, ...regionChanges }, presetPassages })
        if (fingerprint(next) === fingerprint(before)) throw new AppError(400, 'INVALID_INPUT', 'Change at least one configuration value.')
        const currentGeometry = {
          bbox: before.region.bbox, avoidanceBufferM: before.region.avoidanceBufferM, presetPassages: before.presetPassages,
        }
        const nextGeometry = {
          bbox: next.region.bbox, avoidanceBufferM: next.region.avoidanceBufferM, presetPassages: next.presetPassages,
        }
        let impact: ReturnType<typeof validateRegionConfigChange>
        try {
          impact = validateRegionConfigChange(currentGeometry, nextGeometry, [])
          if (impact.routingChanged) {
            const activeData = await activeRegionBindings(payload, regionId, now(), transaction.req)
            validateRegionConfigChange(currentGeometry, nextGeometry, activeData)
          }
        } catch (error) {
          if (error instanceof AppError && error.code !== 'CONFIG_CONFLICT') throw new AppError(409, 'CONFIG_CONFLICT', 'The proposed region or passage geometry is not valid.')
          throw error
        }
        const after = RegionAdminDTOSchema.parse({
          ...next, region: {
            ...next.region, configVersion: before.region.configVersion + 1,
            hazardVersion: before.region.hazardVersion + (impact.routingChanged ? 1 : 0),
          },
        })
        await payload.update({ collection: 'regions', id: regionId, data: {
          name: after.region.name, timezone: after.region.timezone, bbox: after.region.bbox,
          isDemo: after.region.isDemo, avoidanceBufferM: after.region.avoidanceBufferM,
          configVersion: after.region.configVersion, hazardVersion: after.region.hazardVersion,
        }, overrideAccess: true, req: transaction.req })
        for (const passage of after.presetPassages) {
          const previous = oldPassages.get(passage.id)
          const data = { regionId, name: passage.name, geometry: passage.geometry, passageVersion: passage.passageVersion }
          if (!previous) await payload.create({ collection: 'preset-passages', data: { id: passage.id, ...data }, overrideAccess: true, req: transaction.req })
          else if (previous.passageVersion !== passage.passageVersion) await payload.update({ collection: 'preset-passages', id: passage.id, data, overrideAccess: true, req: transaction.req })
        }
        const retained = new Set(after.presetPassages.map((passage) => passage.id))
        for (const passage of before.presetPassages) if (!retained.has(passage.id)) await payload.delete({ collection: 'preset-passages', id: passage.id, overrideAccess: true, req: transaction.req })
        await payload.create({ collection: 'report-events', data: {
          id: randomUUID(), reportId: `region:${regionId}`, actorId: actor.id, actorRole: 'operator',
          action: 'update_region', reason: input.reason, before, after,
          contextVersions: {
            hazardVersionBefore: before.region.hazardVersion, hazardVersion: after.region.hazardVersion,
            configVersionBefore: before.region.configVersion, configVersion: after.region.configVersion,
          },
        }, overrideAccess: true, req: transaction.req })
        return after
      })
    },
  }
}
