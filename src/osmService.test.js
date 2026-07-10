import { describe, it, expect } from 'vitest';
import {
  parseHeight,
  parseYear,
  inferBuildingType,
  roofAreaFactor,
  buildBuildingFeature,
  filterByPolygon,
  boundsOf
} from './osmService.js';

// A ~90m x ~110m footprint near Turin, in osmtogeojson output shape
const osmFeature = (tags = {}, overrides = {}) => ({
  type: 'Feature',
  id: 'way/123456',
  properties: {
    type: 'way',
    id: 123456,
    tags: { building: 'apartments', 'building:levels': '5', ...tags },
    relations: [],
    meta: {}
  },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [7.6860, 45.0700],
      [7.6872, 45.0700],
      [7.6872, 45.0710],
      [7.6860, 45.0710],
      [7.6860, 45.0700]
    ]]
  },
  ...overrides
});

describe('parseHeight', () => {
  it('parses plain numbers, meter and feet suffixes', () => {
    expect(parseHeight('15')).toBe(15);
    expect(parseHeight('15m')).toBe(15);
    expect(parseHeight('30ft')).toBeCloseTo(9.144);
    expect(parseHeight(12.5)).toBe(12.5);
  });

  it('returns null for junk', () => {
    expect(parseHeight('tall')).toBeNull();
    expect(parseHeight('')).toBeNull();
    expect(parseHeight(null)).toBeNull();
  });
});

describe('parseYear', () => {
  it('parses years and dates within a sane range', () => {
    expect(parseYear('1990')).toBe(1990);
    expect(parseYear('1990-01-01')).toBe(1990);
    expect(parseYear(2005)).toBe(2005);
  });

  it('rejects out-of-range and junk values', () => {
    expect(parseYear('1099')).toBeNull();
    expect(parseYear('2150')).toBeNull();
    expect(parseYear('unknown')).toBeNull();
    expect(parseYear(null)).toBeNull();
  });
});

describe('inferBuildingType', () => {
  it('keeps explicit building tags', () => {
    expect(inferBuildingType({ building: 'church' }, 500)).toBe('church');
  });

  it('classifies generic "yes" buildings by use tags', () => {
    expect(inferBuildingType({ building: 'yes', shop: 'bakery' }, 500)).toBe('commercial');
    expect(inferBuildingType({ building: 'yes', amenity: 'library' }, 500)).toBe('public');
  });

  it('classifies generic "yes" buildings by geometry heuristics', () => {
    expect(inferBuildingType({ building: 'yes' }, 50)).toBe('other');
    expect(inferBuildingType({ building: 'yes', 'building:levels': '3' }, 500)).toBe('residential');
    expect(inferBuildingType({ building: 'yes', 'building:levels': '4' }, 2000)).toBe('residential');
    expect(inferBuildingType({ building: 'yes', 'roof:shape': 'flat' }, 2000)).toBe('industrial');
    expect(inferBuildingType({ building: 'yes' }, 2000)).toBe('large_building');
  });
});

describe('roofAreaFactor', () => {
  it('is 1.0 for flat roofs and capped at 1.15', () => {
    expect(roofAreaFactor({ 'roof:angle': '0' })).toBe(1.0);
    expect(roofAreaFactor({ 'roof:angle': '60' })).toBe(1.15);
  });

  it('uses the 12.5° default when untagged', () => {
    const expected = 1 + 0.15 * Math.tan((12.5 * Math.PI) / 180);
    expect(roofAreaFactor({})).toBeCloseTo(expected);
  });
});

describe('buildBuildingFeature', () => {
  it('enriches an osmtogeojson feature with derived properties', () => {
    const feature = buildBuildingFeature(osmFeature({ height: '18m', name: 'Casa Test' }));

    expect(feature.properties.osm_id).toBe('way/123456');
    expect(feature.properties.name).toBe('Casa Test');
    expect(feature.properties.building).toBe('apartments');
    expect(feature.properties.height).toBe(18);
    expect(feature.properties.height_estimated).toBe(false);
    // ~94m x ~111m block ≈ 10,000 m²
    expect(feature.properties.footprint_area_m2).toBeGreaterThan(8000);
    expect(feature.properties.footprint_area_m2).toBeLessThan(13000);
    expect(feature.properties.roof_area_m2).toBeGreaterThan(feature.properties.footprint_area_m2);
    expect(feature.properties.total_floor_area).toBeCloseTo(feature.properties.footprint_area_m2 * 5, 0);
    expect(feature.properties.data_sources).toEqual(['osm']);
  });

  it('estimates height from levels when height is untagged', () => {
    const feature = buildBuildingFeature(osmFeature());
    expect(feature.properties.height).toBe(15); // 5 levels * 3 m
    expect(feature.properties.height_estimated).toBe(true);
  });

  it('marks relations as multipolygons', () => {
    const relation = osmFeature({}, { id: 'relation/2529224' });
    relation.properties.type = 'relation';
    relation.properties.id = 2529224;
    const feature = buildBuildingFeature(relation);
    expect(feature.properties.osm_id).toBe('relation/2529224');
    expect(feature.properties.is_multipolygon).toBe(true);
  });

  it('rejects non-buildings and non-areal geometries', () => {
    const noBuildingTag = osmFeature();
    delete noBuildingTag.properties.tags.building;
    expect(buildBuildingFeature(noBuildingTag)).toBeNull();

    expect(buildBuildingFeature(osmFeature({}, {
      geometry: { type: 'Point', coordinates: [7.68, 45.07] }
    }))).toBeNull();
    expect(buildBuildingFeature(null)).toBeNull();
  });
});

describe('filterByPolygon', () => {
  const features = [buildBuildingFeature(osmFeature())];

  it('keeps buildings whose centroid is inside the polygon', () => {
    const around = [[7.685, 45.069], [7.688, 45.069], [7.688, 45.072], [7.685, 45.072]];
    expect(filterByPolygon(features, around)).toHaveLength(1);
  });

  it('drops buildings outside the polygon', () => {
    const elsewhere = [[7.70, 45.08], [7.71, 45.08], [7.71, 45.09], [7.70, 45.09]];
    expect(filterByPolygon(features, elsewhere)).toHaveLength(0);
  });
});

describe('boundsOf', () => {
  it('computes the bounding box of polygon coordinates', () => {
    expect(boundsOf([[7.1, 45.2], [7.3, 45.0], [7.2, 45.5]])).toEqual({
      south: 45.0,
      west: 7.1,
      north: 45.5,
      east: 7.3
    });
  });
});
