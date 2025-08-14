from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import asyncio
import aiohttp
import json
import uuid
import math
from datetime import datetime
import logging
from data_processors import OSMProcessor, OvertureProcessor, ISTATProcessor, APEProcessor, DataMerger
from shapely.geometry import Polygon, shape

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Building Data API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# In-memory storage for progress tracking (use Redis in production)
progress_store = {}

class PolygonRequest(BaseModel):
    coordinates: List[List[float]]  # [[lng, lat], [lng, lat], ...]

class ProgressResponse(BaseModel):
    task_id: str
    status: str
    progress: int
    current_step: str
    message: str
    data: Optional[Dict[str, Any]] = None

class BuildingData(BaseModel):
    id: str
    geometry: Dict[str, Any]
    properties: Dict[str, Any]
    data_sources: List[str]

@app.post("/api/process-polygon", response_model=ProgressResponse)
async def process_polygon(request: PolygonRequest, background_tasks: BackgroundTasks):
    """Start polygon processing and return task ID for progress tracking"""
    
    # Validate polygon
    if len(request.coordinates) < 3:
        raise HTTPException(status_code=400, detail="Polygon must have at least 3 points")
    
    # Generate task ID
    task_id = str(uuid.uuid4())
    
    # Initialize progress
    progress_store[task_id] = {
        "status": "processing",
        "progress": 0,
        "current_step": "Initializing...",
        "message": "Starting data collection...",
        "data": None,
        "start_time": datetime.now()
    }
    
    # Start background processing
    background_tasks.add_task(process_polygon_data, task_id, request.coordinates)
    
    return ProgressResponse(
        task_id=task_id,
        status="processing",
        progress=0,
        current_step="Initializing...",
        message="Starting data collection..."
    )

@app.get("/api/progress/{task_id}", response_model=ProgressResponse)
async def get_progress(task_id: str):
    """Get current progress of polygon processing"""
    if task_id not in progress_store:
        raise HTTPException(status_code=404, detail="Task not found")
    
    progress = progress_store[task_id].copy()
    progress["task_id"] = task_id  # Add task_id to the response
    return ProgressResponse(**progress)

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

async def process_polygon_data(task_id: str, coordinates: List[List[float]]):
    """Background task to process polygon data from multiple sources"""
    try:
        # Step 1: Calculate bounding box
        update_progress(task_id, 5, "Calculating bounds", "Computing polygon bounds...")
        bounds = calculate_bounds(coordinates)
        
        # Create polygon for filtering
        polygon = Polygon(coordinates)
        
        # Step 2: Fetch OSM data (primary source) - with progress updates
        update_progress(task_id, 10, "Fetching OSM data", "Querying OpenStreetMap for buildings...")
        osm_buildings = await OSMProcessor.fetch_buildings(bounds)
        
        # Filter buildings to only those inside the drawn polygon
        filtered_buildings = []
        total_buildings = len(osm_buildings)
        outside_buildings = 0
        
        logger.info(f"Filtering {total_buildings} buildings with polygon: {coordinates}")
        
        for building in osm_buildings:
            try:
                # Get the building geometry
                building_geom = shape(building['geometry'])
                
                # Get the centroid of the building for simpler containment check
                building_centroid = building_geom.centroid
                
                # Check if the building centroid is inside the polygon
                if polygon.contains(building_centroid):
                    filtered_buildings.append(building)
                else:
                    # Log buildings that are outside for debugging
                    outside_buildings += 1
                    coords = [building_centroid.x, building_centroid.y]
                    logger.info(f"Building {building.get('id', 'unknown')} outside polygon - centroid: {coords}")
                    
            except Exception as e:
                logger.warning(f"Error filtering building {building.get('id', 'unknown')}: {e}")
                # If we can't determine containment, exclude the building for safety
                logger.debug(f"Excluding building {building.get('id', 'unknown')} due to geometry error")
        
        osm_buildings = filtered_buildings
        logger.info(f"Filtered {len(filtered_buildings)} buildings inside polygon from {total_buildings} total (excluded {outside_buildings} outside)")
        
        # Check if we got real OSM data
        if len(osm_buildings) > 0:
            update_progress(task_id, 25, "OSM data received", f"Found {len(osm_buildings)} buildings from OSM")
        else:
            update_progress(task_id, 25, "No OSM data", "No buildings found in OSM for this area")
        
        # Step 3: Fetch Overture data (height/floors fill-in)
        update_progress(task_id, 35, "Fetching Overture data", "Getting building heights from Overture...")
        overture_data = await OvertureProcessor.fetch_building_data(bounds)
        update_progress(task_id, 45, "Overture data received", f"Retrieved {len(overture_data)} height records")
        
        # Step 4: Fetch ISTAT data (units estimation)
        update_progress(task_id, 55, "Fetching ISTAT data", "Getting census data for unit estimation...")
        istat_data = await ISTATProcessor.fetch_census_data(bounds)
        update_progress(task_id, 65, "ISTAT data received", "Census data processed for unit estimation")
        
        # Step 5: Fetch APE data (energy class - optional)
        update_progress(task_id, 75, "Fetching APE data", "Getting energy classification data...")
        ape_data = await APEProcessor.fetch_energy_data(bounds)
        update_progress(task_id, 80, "APE data received", f"Retrieved {len(ape_data)} energy records")
        
        # Step 6: Merge and enrich data
        update_progress(task_id, 85, "Merging data", "Combining data from all sources...")
        enriched_buildings = DataMerger.merge_all_data(osm_buildings, overture_data, istat_data, ape_data)
        update_progress(task_id, 95, "Data merged", f"Successfully processed {len(enriched_buildings)} buildings")
        
        # Step 7: Finalize
        update_progress(task_id, 100, "Completed", "Data processing completed successfully!", enriched_buildings)
        
    except Exception as e:
        logger.error(f"Error processing polygon data: {str(e)}")
        update_progress(task_id, 0, "Error", f"Processing failed: {str(e)}")

def update_progress(task_id: str, progress: int, step: str, message: str, data: Dict[str, Any] = None):
    """Update progress for a task"""
    if task_id in progress_store:
        # Clean data to prevent JSON serialization issues
        if data:
            data = clean_data_for_json(data)
        
        progress_store[task_id].update({
            "progress": progress,
            "current_step": step,
            "message": message,
            "data": data
        })
        if progress == 100:
            progress_store[task_id]["status"] = "completed"
        elif progress == 0 and "Error" in step:
            progress_store[task_id]["status"] = "error"

def clean_data_for_json(data: Any) -> Any:
    """Clean data to ensure it's JSON serializable"""
    if isinstance(data, dict):
        return {k: clean_data_for_json(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [clean_data_for_json(item) for item in data]
    elif isinstance(data, float):
        if math.isnan(data) or math.isinf(data):
            return None
        return data
    elif isinstance(data, (int, str, bool, type(None))):
        return data
    else:
        return str(data)

def calculate_bounds(coordinates: List[List[float]]) -> Dict[str, float]:
    """Calculate bounding box from polygon coordinates"""
    lngs = [coord[0] for coord in coordinates]
    lats = [coord[1] for coord in coordinates]
    
    return {
        "west": min(lngs),
        "east": max(lngs),
        "south": min(lats),
        "north": max(lats)
    }



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
