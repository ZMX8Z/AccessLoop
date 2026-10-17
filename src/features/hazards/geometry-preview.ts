import type { AvoidGeometry } from '@/shared/contracts/geo'

export function geometryPreviewPath(geometry: AvoidGeometry): string {
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
  const points = rings.flat()
  const west = Math.min(...points.map(([longitude]) => longitude))
  const east = Math.max(...points.map(([longitude]) => longitude))
  const south = Math.min(...points.map(([, latitude]) => latitude))
  const north = Math.max(...points.map(([, latitude]) => latitude))
  const width = Math.max(east - west, 1e-9)
  const height = Math.max(north - south, 1e-9)
  return rings.map((ring) => ring.map(([longitude, latitude], index) =>
    `${index ? 'L' : 'M'}${20 + (longitude - west) / width * 280},${160 - (latitude - south) / height * 140}`,
  ).join(' ') + ' Z').join(' ')
}
