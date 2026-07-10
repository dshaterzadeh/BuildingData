import * as THREE from 'three';
import { extractPolygonRings, projectRingToMeters, getBuildingCenter } from './buildingGeometry.js';

// Convert a GeoJSON Polygon/MultiPolygon into THREE.Shape objects with holes,
// projected to meters. Courtyards (inner rings) become shape holes so
// extrusions match the real footprint instead of filling the block in.
// Pass a shared `origin` to place several buildings in one scene; without it
// the first outer ring's centroid is used.
export function buildingShapes(geometry, origin = null) {
  const parts = extractPolygonRings(geometry);
  if (parts.length === 0) return null;

  const sharedOrigin = origin || getBuildingCenter(parts[0].outer);
  if (!sharedOrigin) return null;

  const shapes = [];

  for (const { outer, holes } of parts) {
    const projectedOuter = projectRingToMeters(outer, sharedOrigin);
    if (!projectedOuter) continue;

    const shape = new THREE.Shape();
    projectedOuter.points.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, point.y);
      else shape.lineTo(point.x, point.y);
    });

    for (const hole of holes) {
      const projectedHole = projectRingToMeters(hole, sharedOrigin);
      if (!projectedHole) continue;

      const path = new THREE.Path();
      projectedHole.points.forEach((point, index) => {
        if (index === 0) path.moveTo(point.x, point.y);
        else path.lineTo(point.x, point.y);
      });
      shape.holes.push(path);
    }

    shapes.push(shape);
  }

  return shapes.length > 0 ? shapes : null;
}
