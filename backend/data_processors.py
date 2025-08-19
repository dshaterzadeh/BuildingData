import asyncio
import aiohttp
import json
import logging
import math
import urllib.parse
from typing import List, Dict, Any, Optional, Tuple
from shapely.geometry import Polygon, Point, shape
from shapely.ops import unary_union
import geopandas as gpd
import pandas as pd
import numpy as np
from datetime import datetime
from osmtogeojson import osmtogeojson
from pyproj import Geod

logger = logging.getLogger(__name__)

def calculate_geodesic_area(building_geom: Polygon) -> float:
    """
    Calculate the geodesic area of a building polygon in square meters.
    
    This function uses the WGS84 ellipsoid and geodesic calculations for 
    production-grade accuracy, accounting for the Earth's curvature.
    
    Args:
        building_geom: Shapely Polygon geometry in WGS84 coordinates (lat/lon)
    
    Returns:
        float: Area in square meters
    """
    try:
        # Initialize geodesic calculator using WGS84 ellipsoid
        geod = Geod(ellps='WGS84')
        
        # Extract coordinates from the polygon
        coords = list(building_geom.exterior.coords)
        
        # Convert to separate lat/lon arrays for pyproj
        lons = [coord[0] for coord in coords]
        lats = [coord[1] for coord in coords]
        
        # Calculate geodesic area
        area_m2, _ = geod.polygon_area_perimeter(lons, lats)
        
        # pyproj returns negative area for clockwise coordinates, so take absolute value
        return abs(area_m2)
        
    except Exception as e:
        logger.error(f"Error calculating geodesic area: {e}")
        # Fallback to approximate calculation if geodesic fails
        return _fallback_area_calculation(building_geom)

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
        try:
            # Try using osmtogeojson library first
            geojson_data = osmtogeojson.process_osm_json(data)
            
            buildings = []
            for feature in geojson_data.get('features', []):
                if feature.get('properties', {}).get('building'):
                    # Create Shapely geometry for area calculation
                    coords = feature['geometry']['coordinates'][0]
                    building_geom = Polygon(coords)
                    
                    # Create enhanced building feature with roof area
                    building_feature = self._create_building_feature(feature, building_geom)
                    buildings.append(building_feature)
            
            return buildings
            
        except Exception as e:
            logging.warning(f"osmtogeojson failed, using manual processing: {e}")
            return self._manual_process_data(data)
    
    def _manual_process_data(self, data):
        """Manual processing fallback when osmtogeojson fails."""
        buildings = []
        
        try:
            # Create a mapping of node IDs to coordinates
            nodes = {}
            for element in data.get('elements', []):
                if element.get('type') == 'node':
                    nodes[element['id']] = [element['lon'], element['lat']]
            
            # Process ways (buildings)
            for element in data.get('elements', []):
                if element.get('type') == 'way' and element.get('tags', {}).get('building'):
                    # Build coordinates from nodes
                    coords = []
                    for node_id in element.get('nodes', []):
                        if node_id in nodes:
                            coords.append(nodes[node_id])
                    
                    # Ensure we have enough coordinates and the polygon is closed
                    if len(coords) >= 3:
                        # Close the polygon if needed
                        if coords[0] != coords[-1]:
                            coords.append(coords[0])
                        
                        try:
                            building_geom = Polygon(coords)
                            if building_geom.is_valid:
                                building_feature = self._create_building_feature(element, building_geom)
                                buildings.append(building_feature)
                        except Exception as e:
                            logging.warning(f"Error creating building geometry: {e}")
                            continue
            
            return buildings
            
        except Exception as e:
            logging.error(f"Error in manual data processing: {e}")
            return []
    
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
            'data_sources': ['osm']
        }
        
        # Calculate roof area factor and convert to square meters
        roof_factor = calculate_roof_area_factor(building_geom, properties)
        properties['roof_area_m2'] = round(area_meters * roof_factor, 2)
        properties['footprint_area_m2'] = round(area_meters, 2)
        
        return {
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [[[float(x), float(y)] for x, y in building_geom.exterior.coords]]
            },
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
