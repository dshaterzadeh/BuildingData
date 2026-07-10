import { describe, it, expect } from 'vitest';
import {
  categorizeBuilding,
  getCategoryColor,
  getCategoryMapColor,
  formatBuildingType,
  cleanCategoryLabel,
  getFeatureCenter,
  calculateRoofArea,
  getYearBuilt,
  estimatePopulation,
  matchesMetricsFilters,
  mergeBuildingData,
  escapeCsvValue
} from './buildingUtils.js';

const residentialBuilding = (overrides = {}) => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
  properties: {
    building: 'apartments',
    'building:levels': '4',
    footprint_area_m2: '410',
    ...overrides
  }
});

describe('categorizeBuilding', () => {
  it('maps known OSM types to their category', () => {
    expect(categorizeBuilding('apartments')).toBe('Residential');
    expect(categorizeBuilding('church')).toBe('Religious');
    expect(categorizeBuilding('warehouse')).toBe('Industrial/Storage');
  });

  it('folds rarer types into the eight main buckets', () => {
    expect(categorizeBuilding('university')).toBe('Education');
    expect(categorizeBuilding('hotel')).toBe('Commercial');
    expect(categorizeBuilding('tower')).toBe('Other');
  });

  it('falls back to Other for unmapped types', () => {
    expect(categorizeBuilding('yes')).toBe('Other');
    expect(categorizeBuilding('spaceport')).toBe('Other');
    expect(categorizeBuilding(undefined)).toBe('Other');
  });
});

describe('category colors', () => {
  it('returns a color for every category and a gray fallback otherwise', () => {
    expect(getCategoryColor('Residential')).toBe('#2a78d6');
    expect(getCategoryColor('Healthcare')).toBe('#e34948');
    expect(getCategoryColor('nope')).toBe('#9a9992');
  });

  it('keeps the non-data buckets gray and the map palette in sync', () => {
    expect(getCategoryColor('Other')).toBe('#9a9992');
    expect(getCategoryColor('Unknown')).toBe('#b5b4ad');
    expect(getCategoryMapColor('Residential')).toBe(getCategoryColor('Residential'));
  });
});

describe('formatBuildingType', () => {
  it('handles special cases', () => {
    expect(formatBuildingType('semidetached_house')).toBe('Semi-detached house');
    expect(formatBuildingType('train_station')).toBe('Train station');
  });

  it('capitalizes and replaces underscores otherwise', () => {
    expect(formatBuildingType('apartments')).toBe('Apartments');
    expect(formatBuildingType('boat_house')).toBe('Boat House');
  });

  it('returns null for empty input', () => {
    expect(formatBuildingType('')).toBeNull();
    expect(formatBuildingType(undefined)).toBeNull();
  });
});

describe('cleanCategoryLabel', () => {
  it('strips digits and keycap modifiers left over from emoji labels', () => {
    expect(cleanCategoryLabel('1️⃣Residential')).toBe('Residential');
    expect(cleanCategoryLabel('Residential')).toBe('Residential');
  });
});

describe('getFeatureCenter', () => {
  it('averages the outer ring of a Polygon, ignoring the closing point', () => {
    const feature = {
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] }
    };
    expect(getFeatureCenter(feature)).toEqual([1, 1]);
  });

  it('uses the first polygon of a MultiPolygon', () => {
    const feature = {
      geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]]] }
    };
    expect(getFeatureCenter(feature)).toEqual([2, 2]);
  });

  it('returns null when geometry is missing', () => {
    expect(getFeatureCenter(null)).toBeNull();
    expect(getFeatureCenter({ geometry: {} })).toBeNull();
  });
});

describe('calculateRoofArea', () => {
  it('equals the footprint at 0° pitch', () => {
    expect(calculateRoofArea(100, 0)).toBeCloseTo(100);
  });

  it('scales by 1.15 at 45° pitch', () => {
    expect(calculateRoofArea(100, 45)).toBeCloseTo(115);
  });
});

describe('getYearBuilt', () => {
  it('checks all the year property variants in order', () => {
    expect(getYearBuilt({ year_built: 1990 })).toBe(1990);
    expect(getYearBuilt({ year: 1985 })).toBe(1985);
    expect(getYearBuilt({ built_year: 1970 })).toBe(1970);
    expect(getYearBuilt({ 'building:year': 2001 })).toBe(2001);
    expect(getYearBuilt({})).toBeNull();
  });
});

describe('estimatePopulation', () => {
  it('estimates floors * footprint / occupancy for residential buildings', () => {
    // 4 floors * 410 m² / 41 m² per occupant = 40
    expect(estimatePopulation(residentialBuilding(), 41)).toBe(40);
  });

  it('returns null for non-residential buildings', () => {
    expect(estimatePopulation(residentialBuilding({ building: 'office' }), 41)).toBeNull();
  });

  it('returns null when floors or footprint are missing or invalid', () => {
    expect(estimatePopulation(residentialBuilding({ 'building:levels': undefined }), 41)).toBeNull();
    expect(estimatePopulation(residentialBuilding({ footprint_area_m2: '0' }), 41)).toBeNull();
    expect(estimatePopulation(null, 41)).toBeNull();
  });

  it('returns null for a non-positive occupancy factor', () => {
    expect(estimatePopulation(residentialBuilding(), 0)).toBeNull();
  });
});

describe('matchesMetricsFilters', () => {
  const filters = (overrides) => ({
    population: { operator: 'greater_than', value1: '', value2: '' },
    year: { operator: 'greater_than', value1: '', value2: '' },
    height: { operator: 'greater_than', value1: '', value2: '' },
    floor: { operator: 'greater_than', value1: '', value2: '' },
    footprint: { operator: 'greater_than', value1: '', value2: '' },
    ...overrides
  });

  const building = residentialBuilding({ height: '15', year_built: '1995' });

  it('passes everything when no filters are set', () => {
    expect(matchesMetricsFilters(building, null, 41)).toBe(true);
    expect(matchesMetricsFilters(building, filters(), 41)).toBe(true);
  });

  it('applies greater_than / less_than / equal', () => {
    expect(matchesMetricsFilters(building, filters({ height: { operator: 'greater_than', value1: '10', value2: '' } }), 41)).toBe(true);
    expect(matchesMetricsFilters(building, filters({ height: { operator: 'greater_than', value1: '20', value2: '' } }), 41)).toBe(false);
    expect(matchesMetricsFilters(building, filters({ height: { operator: 'less_than', value1: '20', value2: '' } }), 41)).toBe(true);
    expect(matchesMetricsFilters(building, filters({ height: { operator: 'equal', value1: '15', value2: '' } }), 41)).toBe(true);
    expect(matchesMetricsFilters(building, filters({ height: { operator: 'equal', value1: '16', value2: '' } }), 41)).toBe(false);
  });

  it('applies between with inclusive bounds', () => {
    expect(matchesMetricsFilters(building, filters({ year: { operator: 'between', value1: '1990', value2: '2000' } }), 41)).toBe(true);
    expect(matchesMetricsFilters(building, filters({ year: { operator: 'between', value1: '2000', value2: '2010' } }), 41)).toBe(false);
  });

  it('filters on the derived population estimate', () => {
    // building population = 40
    expect(matchesMetricsFilters(building, filters({ population: { operator: 'greater_than', value1: '30', value2: '' } }), 41)).toBe(true);
    expect(matchesMetricsFilters(building, filters({ population: { operator: 'greater_than', value1: '50', value2: '' } }), 41)).toBe(false);
  });

  it('rejects buildings missing the filtered metric', () => {
    const noHeight = residentialBuilding();
    expect(matchesMetricsFilters(noHeight, filters({ height: { operator: 'greater_than', value1: '5', value2: '' } }), 41)).toBe(false);
  });

  it('ignores an "equal" filter with an empty value (regression: used to hide every building)', () => {
    expect(matchesMetricsFilters(building, filters({ floor: { operator: 'equal', value1: '', value2: '' } }), 41)).toBe(true);
  });

  it('ignores an incomplete "between" filter (regression: used to hide every building)', () => {
    expect(matchesMetricsFilters(building, filters({ year: { operator: 'between', value1: '1990', value2: '' } }), 41)).toBe(true);
  });
});

describe('mergeBuildingData', () => {
  const collection = (ids) => ({
    type: 'FeatureCollection',
    features: ids.map(id => ({ type: 'Feature', properties: { osm_id: id } }))
  });

  it('returns the single dataset untouched', () => {
    const only = collection(['a']);
    expect(mergeBuildingData([only])).toBe(only);
  });

  it('concatenates features across datasets', () => {
    const merged = mergeBuildingData([collection(['a', 'b']), collection(['c'])]);
    expect(merged.type).toBe('FeatureCollection');
    expect(merged.features.map(f => f.properties.osm_id)).toEqual(['a', 'b', 'c']);
  });

  it('skips malformed datasets', () => {
    const merged = mergeBuildingData([collection(['a']), null, { features: 'nope' }]);
    expect(merged.features).toHaveLength(1);
  });
});

describe('escapeCsvValue', () => {
  it('quotes plain values', () => {
    expect(escapeCsvValue('hello')).toBe('"hello"');
    expect(escapeCsvValue(42)).toBe('"42"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCsvValue('The "Blue" House')).toBe('"The ""Blue"" House"');
  });

  it('handles null and undefined', () => {
    expect(escapeCsvValue(null)).toBe('""');
    expect(escapeCsvValue(undefined)).toBe('""');
  });
});
