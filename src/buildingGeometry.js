// Pure geometry helpers for the 3D building preview.
// No three.js/React imports so these stay unit-testable.

import { calculateRoofArea } from './buildingUtils.js';

export const DEFAULT_BUILDING_HEIGHT = 18;
export const FLOOR_HEIGHT_METERS = 3.2;

export function extractOuterRing(geometry) {
  if (!geometry?.coordinates) return null;

  if (geometry.type === 'Polygon') {
    return geometry.coordinates?.[0] || null;
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates?.[0]?.[0] || null;
  }

  return null;
}

// Full ring structure: every polygon part with its outer ring AND inner rings
// (courtyards/holes, e.g. OSM multipolygon relations). Returns an array of
// { outer, holes } entries — one per polygon part.
export function extractPolygonRings(geometry) {
  if (!geometry?.coordinates) return [];

  const toEntry = (rings) => {
    if (!Array.isArray(rings) || !rings[0]?.length) return null;
    return { outer: rings[0], holes: rings.slice(1).filter(ring => ring?.length >= 3) };
  };

  if (geometry.type === 'Polygon') {
    const entry = toEntry(geometry.coordinates);
    return entry ? [entry] : [];
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map(toEntry).filter(Boolean);
  }

  return [];
}

export function getBuildingCenter(ring) {
  if (!ring?.length) return null;

  const usablePoints = ring.filter(point => Array.isArray(point) && point.length >= 2);
  if (!usablePoints.length) return null;

  const center = usablePoints.reduce((accumulator, point) => {
    accumulator.lng += point[0];
    accumulator.lat += point[1];
    return accumulator;
  }, { lng: 0, lat: 0 });

  return {
    lng: center.lng / usablePoints.length,
    lat: center.lat / usablePoints.length
  };
}

// Equirectangular projection: good enough at neighbourhood scale. Projects
// around the ring's own centroid by default; pass a shared `origin`
// ({ lng, lat }) to place several buildings in one scene.
export function projectRingToMeters(ring, origin = null) {
  const center = origin || getBuildingCenter(ring);
  if (!center) return null;

  const latScale = 111132.92;
  const lngScale = 111320 * Math.cos((center.lat * Math.PI) / 180);

  const points = ring
    .filter(point => Array.isArray(point) && point.length >= 2)
    .map(([lng, lat]) => ({
      x: (lng - center.lng) * lngScale,
      y: (lat - center.lat) * latScale
    }));

  if (points.length < 3) return null;

  const deduped = points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > 1e-6 || Math.abs(point.y - previous.y) > 1e-6;
  });

  if (deduped.length < 3) return null;

  const firstPoint = deduped[0];
  const lastPoint = deduped[deduped.length - 1];
  if (Math.abs(firstPoint.x - lastPoint.x) > 1e-6 || Math.abs(firstPoint.y - lastPoint.y) > 1e-6) {
    deduped.push({ ...firstPoint });
  }

  return { points: deduped, center };
}

export function getBuildingHeight(properties = {}) {
  const explicitHeight = parseFloat(properties.height);
  if (!Number.isNaN(explicitHeight) && explicitHeight > 0) return explicitHeight;

  const levels = parseFloat(properties['building:levels']);
  if (!Number.isNaN(levels) && levels > 0) {
    return levels * FLOOR_HEIGHT_METERS;
  }

  return DEFAULT_BUILDING_HEIGHT;
}

export function getStats(properties = {}, pitchAngle = 0) {
  const levels = parseFloat(properties['building:levels']);
  const footprintArea = parseFloat(properties['footprint_area_m2']);
  const height = getBuildingHeight(properties);
  const roofArea = Number.isFinite(footprintArea)
    ? Math.round(calculateRoofArea(footprintArea, pitchAngle))
    : null;

  return {
    height: Math.round(height * 10) / 10,
    floors: Number.isFinite(levels) ? levels : null,
    footprintArea: Number.isFinite(footprintArea) ? Math.round(footprintArea) : null,
    roofArea
  };
}
