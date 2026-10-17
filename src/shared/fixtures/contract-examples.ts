import type { BBox, PassageRef, RouteInput } from '../contracts';

// Synthetic input examples only. Never serve these as routes or measured campus data.
export const fixtureMetadata = {
  isFixture: true,
  measured: false,
  description: 'Synthetic contract examples; not surveyed or validated routes.',
} as const;

export const fixtureBBox: BBox = [0, 0, 0.01, 0.01];

export const fixtureRouteInput: RouteInput = {
  start: [0, 0],
  end: [0.001, 0.001],
  profile: 'wheelchair',
  restrictions: {
    maximum_incline: 6,
    maximum_sloped_kerb: 0.06,
    minimum_width: 0.9,
  },
};

export const fixtureRoutePassageRef: PassageRef = {
  routeRef: 'fixture-only-route',
  startIndex: 0,
  endIndex: 1,
};

export const fixturePresetPassageRef: PassageRef = {
  presetPassageId: 'fixture-only-preset',
  passageVersion: 1,
};
