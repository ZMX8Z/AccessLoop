import type { RegionDTO, PresetPassageDTO } from '../contracts';
/** Synthetic contract fixture only. Never seed this as a surveyed campus or provider result. */
export const dRoutingFixture = {
  provenance: {
    kind: 'synthetic' as const,
    fieldValidated: false,
    orsValidated: false,
    source: 'API contract structure example',
    warning: 'Not an accessible campus route.',
  },
  region: {
    id: 'synthetic-region',
    name: 'Synthetic test region',
    bbox: [151.22, -33.93, 151.24, -33.91],
    timezone: 'Australia/Sydney',
    isDemo: true,
    hazardVersion: 0,
    configVersion: 1,
    personalValiditySec: 3600,
    publicValiditySec: 86400,
    avoidanceBufferM: 2,
    routing: {
      profile: 'wheelchair',
      defaultRestrictions: {
        maximum_incline: 6,
        maximum_sloped_kerb: 0.06,
        minimum_width: 0.9,
      },
      supportedRestrictions: {
        maximum_incline: [6],
        maximum_sloped_kerb: [0.06],
        minimum_width: [0.9],
      },
    },
  } satisfies RegionDTO,
  passages: [
    {
      id: 'synthetic-passage',
      passageVersion: 1,
      name: 'Synthetic passage',
      isDemo: true,
      geometry: {
        type: 'LineString',
        coordinates: [
          [151.229, -33.917],
          [151.23, -33.917],
        ],
      },
    },
  ] satisfies PresetPassageDTO[],
};
