import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BUILDING_HEIGHT,
  FLOOR_HEIGHT_METERS,
  extractOuterRing,
  extractPolygonRings,
  getBuildingCenter,
  projectRingToMeters,
  getBuildingHeight,
  getStats
} from './buildingGeometry.js';

// A ~50m x ~50m square near Turin (the app's default map center)
const squareRing = [
  [7.6860, 45.0700],
  [7.6866, 45.0700],
  [7.6866, 45.0704],
  [7.6860, 45.0704],
  [7.6860, 45.0700]
];

describe('extractOuterRing', () => {
  it('returns the outer ring of a Polygon', () => {
    const geometry = { type: 'Polygon', coordinates: [squareRing] };
    expect(extractOuterRing(geometry)).toBe(squareRing);
  });

  it('returns the first outer ring of a MultiPolygon', () => {
    const geometry = { type: 'MultiPolygon', coordinates: [[squareRing]] };
    expect(extractOuterRing(geometry)).toBe(squareRing);
  });

  it('returns null for unsupported or missing geometry', () => {
    expect(extractOuterRing(null)).toBeNull();
    expect(extractOuterRing({ type: 'Point', coordinates: [0, 0] })).toBeNull();
    expect(extractOuterRing({ type: 'LineString' })).toBeNull();
  });
});

describe('extractPolygonRings', () => {
  const holeRing = [
    [7.6862, 45.0701],
    [7.6864, 45.0701],
    [7.6864, 45.0703],
    [7.6862, 45.0703],
    [7.6862, 45.0701]
  ];

  it('returns outer ring and courtyard holes for a Polygon', () => {
    const geometry = { type: 'Polygon', coordinates: [squareRing, holeRing] };
    const parts = extractPolygonRings(geometry);
    expect(parts).toHaveLength(1);
    expect(parts[0].outer).toBe(squareRing);
    expect(parts[0].holes).toEqual([holeRing]);
  });

  it('returns every part of a MultiPolygon with its own holes', () => {
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [[squareRing, holeRing], [squareRing]]
    };
    const parts = extractPolygonRings(geometry);
    expect(parts).toHaveLength(2);
    expect(parts[0].holes).toHaveLength(1);
    expect(parts[1].holes).toHaveLength(0);
  });

  it('drops degenerate holes and handles missing geometry', () => {
    const geometry = { type: 'Polygon', coordinates: [squareRing, [[0, 0], [1, 1]]] };
    expect(extractPolygonRings(geometry)[0].holes).toHaveLength(0);
    expect(extractPolygonRings(null)).toEqual([]);
    expect(extractPolygonRings({ type: 'Point', coordinates: [0, 0] })).toEqual([]);
  });
});

describe('getBuildingCenter', () => {
  it('averages the ring coordinates', () => {
    const center = getBuildingCenter([[0, 0], [2, 0], [2, 2], [0, 2]]);
    expect(center).toEqual({ lng: 1, lat: 1 });
  });

  it('ignores malformed points', () => {
    const center = getBuildingCenter([[0, 0], [2, 2], 'junk', [5]]);
    expect(center).toEqual({ lng: 1, lat: 1 });
  });

  it('returns null for empty input', () => {
    expect(getBuildingCenter(null)).toBeNull();
    expect(getBuildingCenter([])).toBeNull();
  });
});

describe('projectRingToMeters', () => {
  it('projects around the centroid and keeps the ring closed', () => {
    const projected = projectRingToMeters(squareRing);
    expect(projected).not.toBeNull();

    const { points } = projected;
    const first = points[0];
    const last = points[points.length - 1];
    expect(first.x).toBeCloseTo(last.x, 6);
    expect(first.y).toBeCloseTo(last.y, 6);

    // ~0.0006° lng at 45° latitude ≈ 47m, ~0.0004° lat ≈ 44m
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(60);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(40);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(50);
  });

  it('drops consecutive duplicate points', () => {
    const withDupes = [squareRing[0], squareRing[0], ...squareRing.slice(1)];
    const projected = projectRingToMeters(withDupes);
    expect(projected.points.length).toBe(squareRing.length);
  });

  it('returns null when fewer than 3 distinct points remain', () => {
    expect(projectRingToMeters([[0, 0], [0, 0], [1, 1]])).toBeNull();
    expect(projectRingToMeters(null)).toBeNull();
  });
});

describe('getBuildingHeight', () => {
  it('prefers an explicit height', () => {
    expect(getBuildingHeight({ height: '21.5', 'building:levels': '3' })).toBe(21.5);
  });

  it('derives height from floor count when height is missing', () => {
    expect(getBuildingHeight({ 'building:levels': '5' })).toBe(5 * FLOOR_HEIGHT_METERS);
  });

  it('ignores non-positive or invalid values', () => {
    expect(getBuildingHeight({ height: '-3', 'building:levels': '2' })).toBe(2 * FLOOR_HEIGHT_METERS);
    expect(getBuildingHeight({ height: 'tall' })).toBe(DEFAULT_BUILDING_HEIGHT);
  });

  it('falls back to the default height', () => {
    expect(getBuildingHeight({})).toBe(DEFAULT_BUILDING_HEIGHT);
    expect(getBuildingHeight()).toBe(DEFAULT_BUILDING_HEIGHT);
  });
});

describe('getStats', () => {
  it('summarizes height, floors, footprint and roof area', () => {
    const stats = getStats({ height: '12', 'building:levels': '4', footprint_area_m2: '100' }, 45);
    expect(stats.height).toBe(12);
    expect(stats.floors).toBe(4);
    expect(stats.footprintArea).toBe(100);
    expect(stats.roofArea).toBe(115); // 100 * 1.15 at 45°
  });

  it('uses nulls when data is missing', () => {
    const stats = getStats({}, 0);
    expect(stats.height).toBe(DEFAULT_BUILDING_HEIGHT);
    expect(stats.floors).toBeNull();
    expect(stats.footprintArea).toBeNull();
    expect(stats.roofArea).toBeNull();
  });
});
