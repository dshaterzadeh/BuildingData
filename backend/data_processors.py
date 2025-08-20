import asyncio
import aiohttp
import json
import logging
import math
import urllib.parse
from typing import List, Dict, Any, Optional, Tuple
from shapely.geometry import Polygon, Point, shape, LineString, MultiPolygon
from shapely.ops import unary_union, polygonize
from shapely.geometry.polygon import orient
import geopandas as gpd
import pandas as pd
import numpy as np
from datetime import datetime
from osmtogeojson import osmtogeojson
from pyproj import Geod

logger = logging.getLogger(__name__)

def calculate_geodesic_area(building_geom) -> float:
    """
    Calculate the geodesic area of a building geometry in square meters.
    
    This function uses the WGS84 ellipsoid and geodesic calculations for 
    production-grade accuracy, accounting for the Earth's curvature.
    
    Args:
        building_geom: Shapely geometry (Polygon or MultiPolygon) in WGS84 coordinates (lat/lon)
    
    Returns:
        float: Area in square meters
    """
    geod = Geod(ellps='WGS84')

    def _one(poly: Polygon) -> float:
        # exterior
        ex = list(poly.exterior.coords)
        lons = [p[0] for p in ex]
        lats = [p[1] for p in ex]
        a_ext, _ = geod.polygon_area_perimeter(lons, lats)
        area = abs(a_ext)
        # subtract holes
        for ring in poly.interiors:
            ir = list(ring.coords)
            ilons = [p[0] for p in ir]
            ilats = [p[1] for p in ir]
            a_int, _ = geod.polygon_area_perimeter(ilons, ilats)
            area -= abs(a_int)
        return max(area, 0.0)

    if building_geom.geom_type == 'Polygon':
        return _one(building_geom)
    elif building_geom.geom_type == 'MultiPolygon':
        return sum(_one(p) for p in building_geom.geoms)
    return 0.0

def _fallback_area_calculation(building_geom: Polygon) -> float:
    """
    Fallback area calculation using centroid-based approximation.
    This is used only if geodesic calculation fails.
    
    Args:
        building_geom: Shapely Polygon geometry
    
    Returns:
        float: Approximate area in square meters
    """
    try:
        centroid = building_geom.centroid
        lat = centroid.y
        lon = centroid.x
        
        # Approximate meters per degree at this latitude
        meters_per_degree_lat = 111320
        meters_per_degree_lon = 111320 * math.cos(math.radians(lat))
        
        # Calculate area in square meters
        area_degrees = building_geom.area
        area_meters = area_degrees * meters_per_degree_lat * meters_per_degree_lon
        
        return area_meters
        
    except Exception as e:
        logger.error(f"Error in fallback area calculation: {e}")
        return 0.0

def calculate_roof_area_factor(building_geom, properties):
    """
    Calculate roof area factor based on building footprint and roof angle/slope.
    
    Args:
        building_geom: Shapely geometry object of the building
        properties: Building properties dict containing roof information
    
    Returns:
        float: Roof area factor (e.g., 1.05 means 5% larger than footprint)
    """
    try:
        # Get roof angle/slope from OSM properties
        roof_angle = None
        roof_slope = None
        
        # Try to get roof angle from various OSM tags
        if 'roof:angle' in properties and properties['roof:angle'] is not None:
            try:
                roof_angle = float(properties['roof:angle'])
            except (ValueError, TypeError):
                roof_angle = None
        
        if 'roof:slope' in properties and properties['roof:slope'] is not None:
            try:
                roof_slope = float(properties['roof:slope'])
            except (ValueError, TypeError):
                roof_slope = None
        
        if roof_angle is None and roof_slope is None:
            if ('roof:height' in properties and properties['roof:height'] is not None and 
                'building:levels' in properties and properties['building:levels'] is not None):
                try:
                    roof_height = float(properties['roof:height'])
                    building_levels = float(properties['building:levels'])
                    if building_levels > 0:
                        # Assume standard floor height of 3m
                        floor_height = 3.0
                        total_height = building_levels * floor_height
                        if total_height > 0:
                            # Calculate angle using roof height and building width
                            # Assume building is roughly square for estimation
                            footprint_area = building_geom.area
                            building_width = math.sqrt(footprint_area)
                            if building_width > 0:
                                roof_angle = math.degrees(math.atan(roof_height / (building_width / 2)))
                except (ValueError, TypeError):
                    roof_angle = None
        
        # Default roof angle if none found (10-15 degrees)
        if roof_angle is None and roof_slope is None:
            roof_angle = 12.5  # Default 12.5 degrees (middle of 10-15 range)
        
        # Convert slope to angle if needed
        if roof_slope is not None and roof_angle is None:
            roof_angle = roof_slope
        
        # Calculate roof area factor based on angle
        if roof_angle is not None:
            # Convert angle to radians
            angle_rad = math.radians(roof_angle)
            
            # Calculate roof area factor
            # For a simple gabled roof: roof_area = footprint_area / cos(angle)
            # But we need to account for the fact that not all buildings have gabled roofs
            # Use a more conservative estimate
            if angle_rad > 0:
                # Factor ranges from 1.0 (flat roof) to ~1.15 (steep roof)
                # Most residential roofs are between 1.02 and 1.08
                roof_factor = 1.0 + (0.15 * math.tan(angle_rad))
                roof_factor = min(roof_factor, 1.15)  # Cap at 15% increase
            else:
                roof_factor = 1.0
        else:
            roof_factor = 1.05  # Default 5% increase for unknown roof type
        
        return roof_factor
        
    except Exception as e:
        logging.warning(f"Error calculating roof area factor: {e}")
        # Return default factor as fallback
        return 1.05

def infer_building_type(tags: Dict[str, Any], footprint_area_m2: float, building_geom) -> str:
    """
    Infer building type using improved logic based on OSM tags and geometry heuristics.
    
    Rules:
    1. If not 'yes', keep the original tag
    2. If shop, amenity, or tourism present → classify accordingly
    3. Otherwise use geometry heuristics:
       - <100 m² & ≤1 level → other
       - 100–1000 m² & ≤5 levels → residential
       - >1000 m² & multiple floors → residential (apartments)
       - >1000 m² & flat roof & single floor → industrial
       - >1000 m² & non-flat roof & no floor info → large_building
       - Else → other
    """
    original_building_type = tags.get('building', 'yes')
    
    # Rule 1: If not 'yes', keep the original tag
    if original_building_type != 'yes':
        return original_building_type
    
    # Rule 2: Check for specific use tags
    if tags.get('shop'):
        return 'commercial'
    elif tags.get('amenity'):
        return 'public'
    elif tags.get('tourism'):
        return 'public'
    
    # Rule 3: Use geometry heuristics
    # Get building levels
    building_levels = OSMProcessor._parse_numeric(tags.get('building:levels'))
    if building_levels is None:
        # Try to estimate from height if available
        height = OSMProcessor._parse_height(tags.get('height'))
        if height:
            building_levels = max(1, int(height / 3))  # Assume 3m per floor
        else:
            building_levels = 1  # Default to 1 level
    
    # Check roof type for flat roof detection
    roof_angle = OSMProcessor._parse_numeric(tags.get('roof:angle'))
    roof_slope = OSMProcessor._parse_numeric(tags.get('roof:slope'))
    is_flat_roof = False
    
    if roof_angle is not None:
        is_flat_roof = roof_angle < 5  # Less than 5 degrees is considered flat
    elif roof_slope is not None:
        is_flat_roof = roof_slope < 0.1  # Less than 10% slope is considered flat
    else:
        # Try to infer from roof type tags
        roof_type = tags.get('roof:shape', '').lower()
        is_flat_roof = roof_type in ['flat', 'shed', 'skillion']
    
    # Apply geometry heuristics
    if footprint_area_m2 < 100 and building_levels <= 1:
        return 'other'
    elif 100 <= footprint_area_m2 <= 1000 and building_levels <= 5:
        return 'residential'
    elif footprint_area_m2 > 1000:
        # For large buildings, check if we have floor information
        if building_levels > 1:
            # If it has multiple floors, it's likely residential (apartments)
            return 'residential'
        elif is_flat_roof:
            return 'industrial'
        else:
            # Only classify as large_building if no floor info and non-flat roof
            return 'large_building'
    else:
        return 'other'

class OSMProcessor:
    """Handles OpenStreetMap data fetching and processing"""
    
    @staticmethod
    async def fetch_buildings(bounds: Dict[str, float]) -> List[Dict[str, Any]]:
        """Fetch building data from OpenStreetMap using Overpass API"""
        try:
            # Calculate area for logging
            area = (bounds['north'] - bounds['south']) * (bounds['east'] - bounds['west'])
            logger.info(f"Fetching OSM data for area {area:.6f} with bounds {bounds}")
            
            # Build comprehensive Overpass query to get detailed building data
            query = f"""
            [out:json][timeout:60];
            (
              way["building"]({bounds['south']},{bounds['west']},{bounds['north']},{bounds['east']});
              relation["building"]({bounds['south']},{bounds['west']},{bounds['north']},{bounds['east']});
              relation["type"="multipolygon"]["building"]({bounds['south']},{bounds['west']},{bounds['north']},{bounds['east']});
            );
            out body;
            >;
            out skel qt;
            """
            
            encoded_query = urllib.parse.quote(query)
            
            # Try multiple Overpass servers
            servers = [
                "https://overpass-api.de/api/interpreter",
                "https://overpass.openstreetmap.fr/api/interpreter",
                "https://overpass.kumi.systems/api/interpreter",
                "https://lz4.overpass-api.de/api/interpreter",
                "https://z.overpass-api.de/api/interpreter"
            ]
            
            for i, server in enumerate(servers):
                try:
                    url = f"{server}?data={encoded_query}"
                    logger.info(f"Trying OSM API server {i+1}/{len(servers)}: {server}")
                    
                    # Add delay between requests to avoid rate limiting
                    if i > 0:
                        await asyncio.sleep(2)
                    
                    async with aiohttp.ClientSession() as session:
                        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                            if response.status == 200:
                                data = await response.json()
                                processor = OSMProcessor()
                                buildings = processor.process_data(data)
                                logger.info(f"Successfully fetched {len(buildings)} buildings from {server}")
                                return buildings
                            elif response.status == 429:
                                logger.warning(f"Rate limited by {server}, trying next server...")
                                continue
                            else:
                                logger.warning(f"OSM API error for {server}: {response.status}")
                                continue
                except asyncio.TimeoutError:
                    logger.warning(f"Timeout for {server}")
                    continue
                except Exception as e:
                    logger.warning(f"Error with {server}: {e}")
                    continue
            
            # If all servers failed, return empty list (no mock data)
            logger.error("All OSM API servers failed")
            return []
            
        except asyncio.TimeoutError:
            logger.error("OSM API request timed out")
            return []
        except Exception as e:
            logger.error(f"Error fetching OSM data: {e}")
            return []
    
    def process_data(self, data):
        """Process OSM data and convert to GeoJSON with enhanced properties."""
        # Always use manual processing to ensure proper multipolygon handling
        return self._manual_process_data(data)
    
    def _manual_process_data(self, data):
        """Manual processing fallback when osmtogeojson fails."""
        buildings = []
        
        try:
            # Debug: Log what elements we received
            element_types = {}
            for element in data.get('elements', []):
                element_type = element.get('type', 'unknown')
                element_types[element_type] = element_types.get(element_type, 0) + 1
            
            logger.info(f"Received OSM elements: {element_types}")
            
            # Create a mapping of node IDs to coordinates
            nodes = {}
            for element in data.get('elements', []):
                if element.get('type') == 'node':
                    nodes[element['id']] = [element['lon'], element['lat']]
            
            # Create a mapping of way IDs to raw coordinates (do NOT force-close)
            ways = {}
            for element in data.get('elements', []):
                if element.get('type') == 'way':
                    coords = []
                    for node_id in element.get('nodes', []):
                        if node_id in nodes:
                            coords.append(tuple(nodes[node_id]))  # (lon, lat)
                    if len(coords) >= 2:
                        ways[element['id']] = coords
            
            # Process multipolygon relations first
            processed_relations = set()
            relation_count = 0
            for element in data.get('elements', []):
                if element.get('type') == 'relation':
                    logger.info(f"Found relation {element['id']} with tags: {element.get('tags', {})}")
                    if (element.get('tags', {}).get('building') and
                        (element.get('tags', {}).get('type') == 'multipolygon' or 
                         len(element.get('members', [])) > 1)):  # Treat relations with multiple members as multipolygons
                        
                        relation_count += 1
                        logger.info(f"Processing multipolygon relation {element['id']} with {len(element.get('members', []))} members")
                        relation_buildings = self._process_multipolygon_relation(element, ways, nodes)
                        buildings.extend(relation_buildings)
                        processed_relations.add(element['id'])
                        logger.info(f"Created {len(relation_buildings)} buildings from relation {element['id']}")
                    elif element.get('tags', {}).get('building'):
                        logger.info(f"Found building relation {element['id']} but not multipolygon type")
            
            if relation_count > 0:
                logger.info(f"Processed {relation_count} multipolygon relations")
            
            # Process individual ways (buildings that are not part of multipolygon relations)
            for element in data.get('elements', []):
                if element.get('type') == 'way' and element.get('tags', {}).get('building'):
                    # Skip ways that are part of processed relations
                    if not self._is_way_in_processed_relations(element['id'], data.get('elements', []), processed_relations):
                        coords = ways.get(element['id'], [])
                        if len(coords) >= 4 and coords[0] == coords[-1]:  # closed ring only
                            try:
                                building_geom = Polygon(coords).buffer(0)
                                if building_geom.is_valid and not building_geom.is_empty:
                                    building_feature = self._create_building_feature(element, building_geom)
                                    buildings.append(building_feature)
                            except Exception as e:
                                logging.warning(f"Error creating building geometry for way %s: %s", element['id'], e)
                                continue
            
            return buildings
            
        except Exception as e:
            logging.error(f"Error in manual data processing: {e}")
            return []
    
    def _process_multipolygon_relation(self, relation, ways, nodes):
        """
        Build proper polygons (with holes) from a multipolygon relation whose
        'outer'/'inner' rings may be split across many ways.
        """
        try:
            # Split members by role
            outer_ids, inner_ids = [], []
            for m in relation.get('members', []):
                if m.get('type') != 'way':
                    continue
                role = (m.get('role') or '').strip().lower()
                (inner_ids if role == 'inner' else outer_ids).append(m['ref'])

            def _polygonize_from_way_ids(ids):
                lines = []
                for wid in ids:
                    coords = ways.get(wid)
                    if not coords or len(coords) < 2:
                        continue
                    try:
                        lines.append(LineString(coords))
                    except Exception:
                        pass
                if not lines:
                    return []
                merged = unary_union(lines)
                polys = list(polygonize(merged))
                clean = []
                for p in polys:
                    g = p.buffer(0)  # heal tiny defects
                    if g.is_empty:
                        continue
                    if isinstance(g, MultiPolygon):
                        clean.extend([pp for pp in g.geoms if pp.is_valid and not pp.is_empty])
                    elif g.is_valid:
                        clean.append(g)
                # Standardize orientation (outer CCW in lon/lat is not guaranteed, but consistent orientation helps)
                return [orient(pp, sign=1.0) for pp in clean]

            # Build outer and inner polygons from segments
            outer_polys = _polygonize_from_way_ids(outer_ids)
            inner_polys = _polygonize_from_way_ids(inner_ids)

            # Fallback: if polygonize couldn't build outers, accept any member way that is a closed ring
            if not outer_polys:
                for wid in outer_ids:
                    coords = ways.get(wid)
                    if coords and len(coords) >= 4 and coords[0] == coords[-1]:
                        try:
                            p = Polygon(coords).buffer(0)
                            if p.is_valid and not p.is_empty:
                                outer_polys.append(orient(p, sign=1.0))
                        except Exception:
                            pass
            if not outer_polys:
                logger.warning("Relation %s has no buildable outer polygon.", relation.get('id'))
                return []

            # Assign inner rings (holes) to the outer that contains them
            holes_for_outer = {i: [] for i in range(len(outer_polys))}
            for ip in inner_polys:
                pt = ip.representative_point()
                # choose the first outer that covers the point
                idx = next((i for i, op in enumerate(outer_polys) if op.contains(pt) or op.covers(pt)), None)
                if idx is not None:
                    holes_for_outer[idx].append(ip)

            # Build final geometries with holes, prefer direct construction over difference()
            final_geoms = []
            for i, op in enumerate(outer_polys):
                holes = [list(h.exterior.coords) for h in holes_for_outer[i]]
                try:
                    poly = Polygon(list(op.exterior.coords), holes).buffer(0)
                except Exception:
                    # last resort: keep outer alone
                    poly = op
                if poly.is_empty:
                    continue
                if isinstance(poly, MultiPolygon):
                    for g in poly.geoms:
                        if g.is_valid and not g.is_empty:
                            final_geoms.append(orient(g, sign=1.0))
                elif poly.is_valid:
                    final_geoms.append(orient(poly, sign=1.0))

            # Convert to features
            out = []
            for g in final_geoms:
                out.append(self._create_building_feature(relation, g))
            return out

        except Exception as e:
            logging.error("Error processing multipolygon relation %s: %s", relation.get('id'), e)
            return []
    
    def _is_way_in_processed_relations(self, way_id, elements, processed_relations):
        """Check if a way is part of any processed multipolygon relation."""
        for element in elements:
            if (element.get('type') == 'relation' and 
                element.get('id') in processed_relations):
                for member in element.get('members', []):
                    if (member.get('type') == 'way' and 
                        member.get('ref') == way_id):
                        return True
        return False
    
    def _create_building_feature(self, element, building_geom):
        """Create a GeoJSON feature for a building with enhanced properties."""
        # Handle both raw OSM elements and GeoJSON features
        if 'properties' in element:
            # This is a GeoJSON feature
            tags = element.get('properties', {})
            osm_id = element.get('properties', {}).get('osm_id') or element.get('id')
        else:
            # This is a raw OSM element
            tags = element.get('tags', {})
            element_id = element.get('id')
            element_type = element.get('type', 'way')  # Default to 'way' for buildings
            osm_id = f"{element_type}/{element_id}"
        
        # Ensure OSM ID has the correct format (element_type/id)
        if osm_id and '/' not in str(osm_id):
            # If it's just a numeric ID, assume it's a way (most buildings are ways)
            osm_id = f"way/{osm_id}"
        
        # Check if this is part of a multipolygon relation
        is_multipolygon = element.get('type') == 'relation' and tags.get('type') == 'multipolygon'
        relation_id = element.get('id') if is_multipolygon else None
        
        # For relations, ensure we have the correct OSM ID format
        if element.get('type') == 'relation':
            osm_id = f"relation/{element.get('id')}"
        
        # Calculate geodesic area in square meters first (needed for inference)
        area_meters = calculate_geodesic_area(building_geom)
        
        # Infer building type using improved logic
        inferred_building_type = infer_building_type(tags, area_meters, building_geom)
        
        # Calculate height - use actual height if available, otherwise estimate from floors
        actual_height = self._parse_height(tags.get('height'))
        building_levels = tags.get('building:levels')
        
        if actual_height:
            height = actual_height
            height_estimated = False
        elif building_levels:
            # Estimate height from floors: floor * 3 = height [m]
            try:
                floors = float(building_levels)
                height = floors * 3
                height_estimated = True
            except (ValueError, TypeError):
                height = None
                height_estimated = False
        else:
            height = None
            height_estimated = False
        
        properties = {
            'osm_id': osm_id,
            'building': inferred_building_type,  # Use inferred type instead of original
            'building:original': tags.get('building', 'yes'),  # Keep original for reference
            'name': tags.get('name', ''),
            'height': height,
            'height_estimated': height_estimated,
            'building:levels': building_levels,
            'building:flats': tags.get('building:flats'),
            'building:units': tags.get('building:units'),
            'building:apartments': tags.get('building:apartments'),
            'building:rooms': tags.get('building:rooms'),
            'addr:housenumber': tags.get('addr:housenumber'),
            'addr:street': tags.get('addr:street'),
            'addr:postcode': tags.get('addr:postcode'),
            'addr:city': tags.get('addr:city'),
            'addr:country': tags.get('addr:country'),
            'start_date': tags.get('start_date'),
            'construction': tags.get('construction'),
            'year_built': self._parse_year(tags.get('year_built')),
            'year': self._parse_year(tags.get('year')),
            'built_year': self._parse_year(tags.get('built_year')),
            'building:year': self._parse_year(tags.get('building:year')),
            'building:material': tags.get('building:material'),
            'building:structure': tags.get('building:structure'),
            'building:use': tags.get('building:use'),
            'building:condition': tags.get('building:condition'),
            'building:state': tags.get('building:state'),
            'building:architecture': tags.get('building:architecture'),
            'building:insulation': tags.get('building:insulation'),
            'building:heating': tags.get('building:heating'),
            'building:cooling': tags.get('building:cooling'),
            'building:ventilation': tags.get('building:ventilation'),
            'roof:height': tags.get('roof:height'),
            'roof:levels': tags.get('roof:levels'),
            'roof:angle': tags.get('roof:angle'),
            'roof:slope': tags.get('roof:slope'),
            'min_height': tags.get('min_height'),
            'max_height': tags.get('max_height'),
            'landuse': tags.get('landuse'),
            'amenity': tags.get('amenity'),
            'shop': tags.get('shop'),
            'office': tags.get('office'),
            'leisure': tags.get('leisure'),
            'tourism': tags.get('tourism'),
            'historic': tags.get('historic'),
            'is_multipolygon': is_multipolygon,
            'relation_id': relation_id,
            'data_sources': ['osm']
        }
        
        # Calculate roof area factor and convert to square meters
        roof_factor = calculate_roof_area_factor(building_geom, properties)
        properties['roof_area_m2'] = round(area_meters * roof_factor, 2)
        properties['footprint_area_m2'] = round(area_meters, 2)
        
        # Handle different geometry types
        if building_geom.geom_type == 'Polygon':
            # Handle polygon with holes
            coords = [[[float(x), float(y)] for x, y in building_geom.exterior.coords]]
            # Add interior rings (holes) if they exist
            for interior in building_geom.interiors:
                coords.append([[float(x), float(y)] for x, y in interior.coords])
            
            geometry = {
                'type': 'Polygon',
                'coordinates': coords
            }
        elif building_geom.geom_type == 'MultiPolygon':
            geometry = {
                'type': 'MultiPolygon',
                'coordinates': []
            }
            for poly in building_geom.geoms:
                poly_coords = [[[float(x), float(y)] for x, y in poly.exterior.coords]]
                # Add interior rings (holes) if they exist
                for interior in poly.interiors:
                    poly_coords.append([[float(x), float(y)] for x, y in interior.coords])
                geometry['coordinates'].append(poly_coords)
        else:
            # Fallback to Polygon for other geometry types
            geometry = {
                'type': 'Polygon',
                'coordinates': [[[float(x), float(y)] for x, y in building_geom.exterior.coords]]
            }
        
        return {
            'type': 'Feature',
            'geometry': geometry,
            'properties': properties
        }
    
    @staticmethod
    def _parse_numeric(value: Any) -> Optional[float]:
        """Parse numeric values from OSM tags"""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
    


    @staticmethod
    def _parse_height(height_str) -> Optional[float]:
        """Parse height values from OSM (handles units like '15m', '50ft')"""
        if not height_str:
            return None
        
        try:
            # Convert to string if it's not already
            height_str = str(height_str).lower().strip()
            if height_str.endswith('m'):
                return float(height_str[:-1])
            elif height_str.endswith('ft'):
                return float(height_str[:-2]) * 0.3048  # Convert to meters
            else:
                return float(height_str)
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def _parse_year(year_str: str) -> Optional[int]:
        """Parse year values from OSM (handles various year formats)"""
        if not year_str:
            return None
        
        try:
            # Handle various year formats
            year_str = str(year_str).strip()
            
            # If it's already a number
            if year_str.isdigit():
                year = int(year_str)
                if 1800 <= year <= 2030:  # Reasonable year range
                    return year
            
            # Handle date formats like "1990-01-01" or "1990"
            if '-' in year_str:
                year_part = year_str.split('-')[0]
                if year_part.isdigit():
                    year = int(year_part)
                    if 1800 <= year <= 2030:
                        return year
            
            # Handle other formats
            return None
        except (ValueError, TypeError):
            return None

class OvertureProcessor:
    """Handles Overture Maps data for building height/floor information"""
    
    @staticmethod
    async def fetch_building_data(bounds: Dict[str, float]) -> List[Dict[str, Any]]:
        """Fetch building height/floor data from Overture Maps"""
        return []
    
    @staticmethod
    def enrich_buildings_with_overture(buildings: List[Dict], overture_data: List[Dict]) -> List[Dict]:
        """Enrich OSM buildings with Overture height/floor data"""
        return buildings

class ISTATProcessor:
    """Handles ISTAT census data for unit estimation"""
    
    @staticmethod
    async def fetch_census_data(bounds: Dict[str, float]) -> List[Dict[str, Any]]:
        """Fetch ISTAT census section data"""
        return []
    
    @staticmethod
    def estimate_units_from_istat(buildings: List[Dict], istat_data: List[Dict]) -> List[Dict]:
        """Estimate building units using ISTAT census data"""
        return buildings

class APEProcessor:
    """Handles APE (Attestato di Prestazione Energetica) data"""
    
    @staticmethod
    async def fetch_energy_data(bounds: Dict[str, float]) -> List[Dict[str, Any]]:
        """Fetch APE energy classification data"""
        return []
    
    @staticmethod
    def enrich_buildings_with_ape(buildings: List[Dict], ape_data: List[Dict]) -> List[Dict]:
        """Enrich buildings with APE energy classification data"""
        return buildings

class DataMerger:
    """Handles merging and final processing of all data sources"""
    
    @staticmethod
    def merge_all_data(osm_buildings: List[Dict], overture_data: List[Dict], 
                      istat_data: List[Dict], ape_data: List[Dict]) -> Dict[str, Any]:
        """Merge data from all sources with priority handling"""
        
        # Step 1: Enrich with Overture data
        enriched_buildings = OvertureProcessor.enrich_buildings_with_overture(
            osm_buildings, overture_data
        )
        
        # Step 2: Enrich with ISTAT data
        enriched_buildings = ISTATProcessor.estimate_units_from_istat(
            enriched_buildings, istat_data
        )
        
        # Step 3: Enrich with APE data
        enriched_buildings = APEProcessor.enrich_buildings_with_ape(
            enriched_buildings, ape_data
        )
        
        # Step 4: Calculate additional metrics
        enriched_buildings = DataMerger._calculate_additional_metrics(enriched_buildings)
        
        # Step 5: Create final result
        result = {
            'type': 'FeatureCollection',
            'features': enriched_buildings,
            'metadata': DataMerger._create_metadata(enriched_buildings, osm_buildings, 
                                                  overture_data, istat_data, ape_data)
        }
        
        return result
    
    @staticmethod
    def _calculate_additional_metrics(buildings: List[Dict]) -> List[Dict]:
        """Calculate additional building metrics"""
        for building in buildings:
            properties = building['properties']
            
            # Calculate floor area if we have height and levels
            height = properties.get('height')
            levels = properties.get('building:levels')
            
            if height is not None and levels is not None:
                try:
                    # Convert to float and handle string values
                    height = float(height) if height is not None else None
                    levels = float(levels) if levels is not None else None
                    
                    if height is not None and levels is not None and levels > 0:
                        floor_height = height / levels
                        properties['estimated_floor_height'] = round(floor_height, 1)
                except (ValueError, TypeError):
                    # Skip if conversion fails
                    pass
            
            # Calculate total area if we have geometry using geodesic calculations
            try:
                building_geom = shape(building['geometry'])
                # Use geodesic area calculation for production-grade accuracy
                footprint_area_m2 = calculate_geodesic_area(building_geom)
                properties['footprint_area'] = round(footprint_area_m2, 2)
                
                # Calculate total floor area
                floors = properties.get('building:levels', 1)
                # Convert floors to float, handle None and string values
                if floors is not None:
                    try:
                        floors = float(floors)
                        if floors > 0:
                            properties['total_floor_area'] = round(footprint_area_m2 * floors, 2)
                        else:
                            properties['total_floor_area'] = round(footprint_area_m2, 2)
                    except (ValueError, TypeError):
                        properties['total_floor_area'] = round(footprint_area_m2, 2)
                else:
                    properties['total_floor_area'] = round(footprint_area_m2, 2)
            except Exception as e:
                logger.error(f"Error calculating building metrics: {e}")
            
        return buildings
    
    @staticmethod
    def _create_metadata(buildings: List[Dict], osm_buildings: List[Dict], 
                        overture_data: List[Dict], istat_data: List[Dict], 
                        ape_data: List[Dict]) -> Dict[str, Any]:
        """Create metadata about the processing"""
        
        # Count data sources used
        data_sources = set()
        for building in buildings:
            sources = building['properties'].get('data_sources', [])
            data_sources.update(sources)
        
        # Calculate statistics
        total_buildings = len(buildings)
        
        # Building type distribution
        building_types = {}
        for building in buildings:
            btype = building['properties'].get('building', 'unknown')
            building_types[btype] = building_types.get(btype, 0) + 1
        
        return {
            'total_buildings': total_buildings,
            'data_sources_used': list(data_sources),
            'building_type_distribution': building_types,
            'processing_timestamp': datetime.now().isoformat(),
            'source_counts': {
                'osm': len(osm_buildings),
                'overture': len(overture_data),
                'istat': len(istat_data),
                'ape': len(ape_data)
            }
        }
