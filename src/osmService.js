// Client-side replacement for the former FastAPI backend: queries the Overpass
// API directly from the browser, assembles geometries (osmtogeojson handles
// multipolygon relations with courtyard holes), filters buildings to the drawn
// polygon, and enriches each feature with the same derived properties the
// backend used to compute.

import osmtogeojson from 'osmtogeojson';
import { area as turfArea, centroid as turfCentroid, booleanPointInPolygon, polygon as turfPolygon } from '@turf/turf';

export const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter'
];

// --- Pure helpers (unit tested) ------------------------------------------

export function parseHeight(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).toLowerCase().trim();
  let meters;
  if (text.endsWith('m')) {
    meters = parseFloat(text.slice(0, -1));
  } else if (text.endsWith('ft')) {
    meters = parseFloat(text.slice(0, -2)) * 0.3048;
  } else {
    meters = parseFloat(text);
  }
  return Number.isFinite(meters) ? meters : null;
}

export function parseYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  return year >= 1800 && year <= 2030 ? year : null;
}

const parseNumeric = (value) => {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
};

// Same heuristics the backend used for buildings tagged only `building=yes`
export function inferBuildingType(tags, footprintAreaM2) {
  const original = tags.building || 'yes';
  if (original !== 'yes') return original;

  if (tags.shop) return 'commercial';
  if (tags.amenity || tags.tourism) return 'public';

  let levels = parseNumeric(tags['building:levels']);
  if (levels === null) {
    const height = parseHeight(tags.height);
    levels = height ? Math.max(1, Math.floor(height / 3)) : 1;
  }

  const roofAngle = parseNumeric(tags['roof:angle']);
  const roofSlope = parseNumeric(tags['roof:slope']);
  let isFlatRoof;
  if (roofAngle !== null) {
    isFlatRoof = roofAngle < 5;
  } else if (roofSlope !== null) {
    isFlatRoof = roofSlope < 0.1;
  } else {
    isFlatRoof = ['flat', 'shed', 'skillion'].includes((tags['roof:shape'] || '').toLowerCase());
  }

  if (footprintAreaM2 < 100 && levels <= 1) return 'other';
  if (footprintAreaM2 >= 100 && footprintAreaM2 <= 1000 && levels <= 5) return 'residential';
  if (footprintAreaM2 > 1000) {
    if (levels > 1) return 'residential';
    if (isFlatRoof) return 'industrial';
    return 'large_building';
  }
  return 'other';
}

// Roof factor from tagged roof angle/slope; 1.0 (flat) to 1.15 (steep),
// defaulting to 12.5° when untagged — matches the backend's model.
export function roofAreaFactor(tags) {
  let angle = parseNumeric(tags['roof:angle']);
  if (angle === null) {
    const slope = parseNumeric(tags['roof:slope']);
    if (slope !== null) angle = slope;
  }
  if (angle === null) angle = 12.5;

  if (angle <= 0) return 1.0;
  const factor = 1.0 + 0.15 * Math.tan((angle * Math.PI) / 180);
  return Math.min(factor, 1.15);
}

// Convert one osmtogeojson feature into the enriched building feature the UI
// expects. Returns null for features that aren't usable building footprints.
export function buildBuildingFeature(feature) {
  const geometry = feature?.geometry;
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return null;

  // osmtogeojson keeps the raw tags under properties.tags (with type/id
  // alongside); plain GeoJSON test fixtures may put tags directly in properties
  const props = feature.properties || {};
  const tags = props.tags || props;
  if (!tags.building) return null;

  const elementType = props.type || (String(feature.id || '').split('/')[0]) || 'way';
  const elementId = props.id ?? String(feature.id || '').split('/')[1];
  if (elementId === undefined || elementId === '') return null;
  const osmId = `${elementType}/${elementId}`;

  let areaM2 = 0;
  try {
    areaM2 = turfArea(feature);
  } catch {
    return null;
  }
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return null;

  const inferredType = inferBuildingType(tags, areaM2);

  const actualHeight = parseHeight(tags.height);
  const levels = tags['building:levels'];
  let height = null;
  let heightEstimated = false;
  if (actualHeight !== null) {
    height = actualHeight;
  } else if (levels) {
    const floors = parseFloat(levels);
    if (Number.isFinite(floors)) {
      height = floors * 3;
      heightEstimated = true;
    }
  }

  const properties = {
    osm_id: osmId,
    building: inferredType,
    'building:original': tags.building || 'yes',
    name: tags.name || '',
    height,
    height_estimated: heightEstimated,
    'building:levels': levels,
    'building:flats': tags['building:flats'],
    'building:units': tags['building:units'],
    'building:apartments': tags['building:apartments'],
    'building:rooms': tags['building:rooms'],
    'addr:housenumber': tags['addr:housenumber'],
    'addr:street': tags['addr:street'],
    'addr:postcode': tags['addr:postcode'],
    'addr:city': tags['addr:city'],
    'addr:country': tags['addr:country'],
    start_date: tags.start_date,
    construction: tags.construction,
    year_built: parseYear(tags.year_built),
    year: parseYear(tags.year),
    built_year: parseYear(tags.built_year),
    'building:year': parseYear(tags['building:year']),
    'building:material': tags['building:material'],
    'building:structure': tags['building:structure'],
    'building:use': tags['building:use'],
    'building:condition': tags['building:condition'],
    'building:state': tags['building:state'],
    'building:architecture': tags['building:architecture'],
    'building:insulation': tags['building:insulation'],
    'building:heating': tags['building:heating'],
    'building:cooling': tags['building:cooling'],
    'building:ventilation': tags['building:ventilation'],
    'roof:height': tags['roof:height'],
    'roof:levels': tags['roof:levels'],
    'roof:angle': tags['roof:angle'],
    'roof:slope': tags['roof:slope'],
    min_height: tags.min_height,
    max_height: tags.max_height,
    landuse: tags.landuse,
    amenity: tags.amenity,
    shop: tags.shop,
    office: tags.office,
    leisure: tags.leisure,
    tourism: tags.tourism,
    historic: tags.historic,
    is_multipolygon: elementType === 'relation',
    relation_id: elementType === 'relation' ? elementId : null,
    data_sources: ['osm'],
    footprint_area_m2: Math.round(areaM2 * 100) / 100,
    roof_area_m2: Math.round(areaM2 * roofAreaFactor(tags) * 100) / 100
  };

  // Extra derived metrics (formerly DataMerger._calculate_additional_metrics)
  const numericLevels = parseNumeric(levels);
  if (height !== null && numericLevels !== null && numericLevels > 0) {
    properties.estimated_floor_height = Math.round((height / numericLevels) * 10) / 10;
  }
  properties.total_floor_area = Math.round(areaM2 * (numericLevels && numericLevels > 0 ? numericLevels : 1) * 100) / 100;

  return {
    type: 'Feature',
    geometry,
    properties
  };
}

// Keep only buildings whose centroid falls inside the drawn polygon
// (coordinates as [[lng, lat], ...], open or closed ring).
export function filterByPolygon(features, coordinates) {
  if (!coordinates || coordinates.length < 3) return features;

  const ring = [...coordinates];
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    ring.push([firstLng, firstLat]);
  }
  const selection = turfPolygon([ring]);

  return features.filter(feature => {
    try {
      return booleanPointInPolygon(turfCentroid(feature), selection);
    } catch {
      return false;
    }
  });
}

export function boundsOf(coordinates) {
  const lngs = coordinates.map(c => c[0]);
  const lats = coordinates.map(c => c[1]);
  return {
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs)
  };
}

// --- Overpass fetch --------------------------------------------------------

const buildQuery = (bounds) => `
[out:json][timeout:60];
(
  way["building"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  relation["building"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out body;
>;
out skel qt;
`;

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function queryOverpass(bounds, report) {
  const query = buildQuery(bounds);

  for (let i = 0; i < OVERPASS_SERVERS.length; i++) {
    const server = OVERPASS_SERVERS[i];
    if (i > 0) {
      report(10 + i, 'Fetching OSM data', `Retrying with mirror ${i + 1}/${OVERPASS_SERVERS.length}…`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    try {
      const response = await fetchWithTimeout(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });
      if (response.ok) {
        return await response.json();
      }
      console.warn(`Overpass server ${server} responded ${response.status}`);
    } catch (err) {
      console.warn(`Overpass server ${server} failed:`, err.message);
    }
  }

  throw new Error('All Overpass API servers failed — try again in a moment');
}

// --- Main entry point --------------------------------------------------------

// Fetch, filter, and enrich buildings for a drawn polygon. `onProgress`
// receives { status, progress, current_step, message } exactly like the old
// backend's progress endpoint did.
export async function fetchBuildingsInPolygon(coordinates, onProgress = () => {}) {
  const report = (progress, step, message, status = 'processing') =>
    onProgress({ status, progress, current_step: step, message });

  report(5, 'Calculating bounds', 'Computing polygon bounds…');
  const bounds = boundsOf(coordinates);

  report(10, 'Fetching OSM data', 'Querying OpenStreetMap for buildings…');
  const osmData = await queryOverpass(bounds, report);

  report(55, 'Processing geometries', 'Assembling building footprints…');
  const geojson = osmtogeojson(osmData);

  report(70, 'Filtering buildings', 'Keeping buildings inside your polygon…');
  const buildingFeatures = (geojson.features || [])
    .map(buildBuildingFeature)
    .filter(Boolean);
  const insidePolygon = filterByPolygon(buildingFeatures, coordinates);

  report(90, 'Finalizing', `Processed ${insidePolygon.length} buildings`);

  const buildingTypes = {};
  for (const feature of insidePolygon) {
    const type = feature.properties.building || 'unknown';
    buildingTypes[type] = (buildingTypes[type] || 0) + 1;
  }

  const result = {
    type: 'FeatureCollection',
    features: insidePolygon,
    metadata: {
      total_buildings: insidePolygon.length,
      data_sources_used: ['osm'],
      building_type_distribution: buildingTypes,
      processing_timestamp: new Date().toISOString()
    }
  };

  report(100, 'Completed', 'Data processing completed successfully!', 'completed');
  return result;
}
