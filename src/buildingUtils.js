// Shared, framework-free helpers for building data.
// Kept free of React/Leaflet imports so they can be unit tested in isolation.

// Eight data categories plus two gray buckets. Categorical palettes stop
// being tellable-apart (and colorblind-safe) past 8 hues, so rarer OSM types
// fold into their nearest bucket instead of getting their own color.
export const BUILDING_CATEGORIES = {
  'Residential': ['residential', 'apartments', 'house', 'detached', 'dormitory', 'terrace', 'semidetached_house'],
  'Commercial': ['retail', 'commercial', 'office', 'supermarket', 'kiosk', 'hotel'],
  'Transport': ['train_station', 'station', 'parking', 'garage', 'garages', 'carport', 'bridge'],
  'Education': ['school', 'kindergarten', 'college', 'university'],
  'Religious': ['church', 'chapel', 'synagogue', 'cathedral', 'basilica', 'mosque'],
  'Healthcare': ['hospital', 'clinic', 'medical', 'pharmacy', 'doctors', 'dentist'],
  'Cultural/Public': ['theatre', 'cinema', 'sports_hall', 'government', 'public', 'castle', 'grandstand', 'museum'],
  'Industrial/Storage': ['industrial', 'warehouse', 'shed'],
  'Other': ['roof', 'ruins', 'service', 'tower'],
  'Unknown': ['other', 'large_building']
};

// CVD-validated categorical palette; slot order follows expected frequency so
// the most common categories get the most separated hues. Other/Unknown are
// deliberately gray (non-data).
const CATEGORY_COLORS = {
  'Residential': '#2a78d6',
  'Commercial': '#1baf7a',
  'Transport': '#eda100',
  'Education': '#008300',
  'Religious': '#4a3aa7',
  'Healthcare': '#e34948',
  'Cultural/Public': '#e87ba4',
  'Industrial/Storage': '#eb6834',
  'Other': '#9a9992',
  'Unknown': '#b5b4ad'
};

export const categorizeBuilding = (buildingType) => {
  for (const [category, types] of Object.entries(BUILDING_CATEGORIES)) {
    if (types.includes(buildingType)) {
      return category;
    }
  }
  return 'Other';
};

export const getCategoryColor = (category) => CATEGORY_COLORS[category] || '#9a9992';

// Map and panel share the same palette now; kept as a named export because the
// map may diverge again (e.g. muted fills on satellite imagery).
export const getCategoryMapColor = getCategoryColor;

export const formatBuildingType = (buildingType) => {
  if (!buildingType) return null;

  const specialCases = {
    'large_building': 'Large building',
    'semidetached_house': 'Semi-detached house',
    'train_station': 'Train station',
    'sports_hall': 'Sports hall',
    'carport': 'Carport'
  };

  if (specialCases[buildingType]) {
    return specialCases[buildingType];
  }

  return buildingType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const cleanCategoryLabel = (label) => label.replace(/\d/g, '').replace(/️⃣/g, '');

export const getFeatureCenter = (feature) => {
  if (!feature?.geometry?.coordinates) return null;

  const geometry = feature.geometry;
  const ring = geometry.type === 'MultiPolygon'
    ? geometry.coordinates?.[0]?.[0]
    : geometry.coordinates?.[0];

  if (!ring?.length) return null;

  const uniquePoints = ring.filter((point, index) => {
    if (index === 0) return true;
    const firstPoint = ring[0];
    const isSameAsStart = Math.abs(point[0] - firstPoint[0]) < 1e-10 && Math.abs(point[1] - firstPoint[1]) < 1e-10;
    return !isSameAsStart || index < ring.length - 1;
  });

  if (!uniquePoints.length) return null;

  const sum = uniquePoints.reduce((accumulator, point) => {
    accumulator.lng += point[0];
    accumulator.lat += point[1];
    return accumulator;
  }, { lng: 0, lat: 0 });

  return [sum.lng / uniquePoints.length, sum.lat / uniquePoints.length];
};

// Roof area model: flat footprint scaled up by pitch. 0° -> factor 1, 45° -> 1.15.
export const calculateRoofArea = (footprintArea, pitchAngleDeg) => {
  const angleRad = (pitchAngleDeg * Math.PI) / 180;
  return footprintArea * (1.0 + 0.15 * Math.tan(angleRad));
};

export const getYearBuilt = (properties = {}) =>
  properties.year_built || properties.year || properties.built_year || properties['building:year'] || null;

// Population estimate: only meaningful for residential buildings with known
// floors and footprint. Returns null when it can't be estimated.
export const estimatePopulation = (building, occupancyFactor) => {
  const properties = building?.properties;
  if (!properties) return null;

  if (categorizeBuilding(properties.building || 'yes') !== 'Residential') return null;

  const floors = parseFloat(properties['building:levels']);
  const footprintArea = parseFloat(properties['footprint_area_m2']);
  if (!(floors > 0) || !(footprintArea > 0) || !(occupancyFactor > 0)) return null;

  return Math.round((footprintArea * floors) / occupancyFactor);
};

// Returns true when the building passes every *complete* metrics filter.
// Incomplete filters (no value, or 'between' missing its second value) are
// ignored rather than hiding every building.
export const matchesMetricsFilters = (building, filters, occupancyFactor) => {
  if (!filters) return true;
  const properties = building?.properties;
  if (!properties) return false;

  for (const [metric, filter] of Object.entries(filters)) {
    const v1 = parseFloat(filter.value1);
    if (Number.isNaN(v1)) continue;
    const v2 = parseFloat(filter.value2);
    if (filter.operator === 'between' && Number.isNaN(v2)) continue;

    let buildingValue;
    switch (metric) {
      case 'population':
        buildingValue = estimatePopulation(building, occupancyFactor);
        break;
      case 'year':
        buildingValue = getYearBuilt(properties);
        break;
      case 'height':
        buildingValue = properties.height;
        break;
      case 'floor':
        buildingValue = properties['building:levels'];
        break;
      case 'footprint':
        buildingValue = properties['footprint_area_m2'];
        break;
      default:
        continue;
    }

    const numValue = parseFloat(buildingValue);
    if (Number.isNaN(numValue)) return false;

    switch (filter.operator) {
      case 'greater_than':
        if (!(numValue > v1)) return false;
        break;
      case 'less_than':
        if (!(numValue < v1)) return false;
        break;
      case 'equal':
        if (numValue !== v1) return false;
        break;
      case 'between':
        if (numValue < v1 || numValue > v2) return false;
        break;
      default:
        break;
    }
  }

  return true;
};

// Merge GeoJSON FeatureCollections from multiple polygons into one.
export const mergeBuildingData = (dataArray) => {
  if (dataArray.length === 1) {
    return dataArray[0];
  }

  const allFeatures = [];
  dataArray.forEach(data => {
    if (data && Array.isArray(data.features)) {
      allFeatures.push(...data.features);
    }
  });

  return {
    type: 'FeatureCollection',
    features: allFeatures
  };
};

// RFC 4180 quoting: wrap in quotes, double any embedded quotes.
export const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
