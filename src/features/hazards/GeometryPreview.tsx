import type { AvoidGeometry } from '@/shared/contracts/geo'
import { geometryPreviewPath } from './geometry-preview'

export function GeometryPreview({ geometry }: { geometry: AvoidGeometry }) {
  const path = geometryPreviewPath(geometry)
  return <figure style={{ margin: '12px 0' }}>
    <svg viewBox="0 0 320 180" role="img" aria-label="Avoidance area schematic" style={{ display: 'block', width: '100%', maxHeight: 210, background: '#eff4f1', borderRadius: 8 }}>
      <path d={path} fill="#d17b3f" fillOpacity="0.4" stroke="#9b4f25" strokeWidth="2" fillRule="evenodd" />
    </svg>
    <figcaption style={{ fontSize: 12, color: '#52665b' }}>Area schematic. Geographic scale and surrounding paths are not shown.</figcaption>
  </figure>
}
