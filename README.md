# Building Data Analysis Platform

A comprehensive web application for collecting building data from Open datasource, featuring huristic building type inference, population estimation, interactive mapping, and advanced data filtering capabilities.

## 🚀 Quick Start

### Using the Main Script (Recommended)

The `buildclip.sh` one-stop solution for running the application:

```bash
# Development mode (with hot reloading) - DEFAULT
./buildclip.sh

# Show help
./buildclip.sh help
```

## 📱 Access URLs

### Development Mode
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## 🏗️ Features

### Core Functionality
- **Interactive Map**: Draw polygons to select areas for analysis
- **Multiple Polygon Support**: Draw and manage multiple areas simultaneously
- **Building Data**: Fetch comprehensive building information from open data (OSM)
- **Intelligent Building Type Inference**: Advanced classification based on OSM tags and geometry
- **Advanced Filtering System**: Multi-category and metrics-based filtering
- **Data Export**: Export building data in CSV and JSON formats

### 🗺️ Multiple Polygon Management

Advanced polygon drawing and management capabilities:
- **Multiple Areas**: Draw multiple polygons on the map simultaneously
- **Individual Processing**: Each polygon is processed independently for optimal performance
- **Data Accumulation**: Building data from all polygons is merged and displayed together
- **Polygon Management**: Dropdown interface to view and manage drawn polygons
- **Hover Highlighting**: Hover over polygon names to highlight them on the map
- **Individual Removal**: Remove specific polygons
- **Map Focus**: Map automatically focuses on newly drawn/edited polygons

### 🎯 Advanced Filtering System

#### Category Filtering
- **Multiple Selection**: Select multiple categories simultaneously
- **Dynamic Summary**: Data summary updates to reflect filtered data
- **Export Filtered Data**: Export only selected categories
- **Visual Feedback**: Clear indication of selected categories

#### Metrics Filtering
Advanced filtering by building metrics with multiple operators:
- **Population**: Filter by estimated population
- **Year**: Filter by construction year
- **Height**: Filter by building height (actual or estimated)
- **Floor**: Filter by number of floors
- **Footprint**: Filter by building footprint area

**Operators Available:**
- **Greater than**: Values above specified threshold
- **Less than**: Values below specified threshold
- **Equal to**: Exact value matching
- **Between**: Range-based filtering with two values

**Enhanced Features:**
- **Input Validation**: Prevents negative values and invalid ranges
- **Button States**: Apply/Reset buttons only active when there are changes
- **Applied Filter Badges**: Green badges show active filters at bottom of menu
- **Individual Removal**: Remove specific filters with × button
- **Year Limits**: Maximum year input limited to current year

### Building Type Inference

The application uses heuristics to classify buildings more accurately:

#### Inference Rules
1. **Tag-Based Classification**: Uses `shop`, `amenity`, `tourism` tags for commercial/public classification
2. **Geometry-Based Classification**: Uses footprint area and building levels for residential classification
3. **Smart Heuristics**:
   - `<100 m² & ≤1 level` → `other`
   - `100–1000 m² & ≤5 levels` → `residential`
   - `>1000 m² & multiple floors` → `residential` (apartments)
   - `>1000 m² & flat roof` → `industrial`
   - `>1000 m² & no floor info` → `large_building`

### ⚙️ Estimation Settings

Global configuration for calculations:
- **👥 Occupancy Factor**: Configurable m² per occupant (default: 41)
- **🏠 Roof Pitch Angle**: Global default pitch angle (default: 12.5°)
- **Individual Override**: Each building can have custom pitch angle
- **Real-time Updates**: All calculations update instantly

### 🏢 Building Categories

#### Categories
- **Residential**: Houses, apartments, dormitories, detached, terrace, semidetached
- **Religious**: Churches, chapels, synagogues, cathedrals, basilicas, mosques
- **Education**: Schools, kindergartens, colleges
- **University**: Universities
- **Hotel**: Hotels
- **Commercial**: Retail, commercial, offices, supermarkets, kiosks
- **Healthcare**: Hospitals, clinics, medical, pharmacies, doctors, dentists
- **Industrial/Storage**: Industrial, warehouses, sheds
- **Transport**: Train stations, stations, parking, garages, carports, bridges
- **Cultural/Public**: Theaters, cinemas, sports halls, government, public, castles, museums
- **Tower**: Towers
- **Other**: Roofs, ruins, service buildings
- **Unknown**: Other buildings, large buildings without floor information

### 📊 Data Summary

Dynamic summary that updates based on selected categories and filters:
- **Total Buildings**: Count of buildings in selected categories
- **Total Roof Area**: Sum of roof areas (calculated with pitch angle)
- **Total Footprint**: Sum of building footprints
- **Estimated Population**: Population estimate for residential buildings

### 📤 Data Export

Export options:
- **CSV Export**: Structured data with metadata
- **JSON Export**: Complete GeoJSON with properties
- **Filtered Export**: Export only selected categories and filtered data
- **Metadata Included**: Export settings, timestamps, and processing info

## 🛠️ Technical Stack

### Frontend
- **React 18**: Modern UI framework with hooks
- **Vite**: Fast build tool and dev server
- **Leaflet**: Interactive mapping with polygon drawing
- **CSS-in-JS**: Styled components and responsive design

### Backend
- **FastAPI**: Web framework
- **OpenStreetMap**: Building data source via Overpass API
- **Shapely**: Geometric calculations and area computations
- **GeoPandas**: Geospatial data processing and analysis

### Infrastructure
- **Docker**: Containerization for consistent environments
- **Docker Compose**: Multi-service orchestration
- **Nginx**: Web server (only production mode)

## 🔧 Development

### Local Development (Alternative)
If you prefer to run without Docker:

```bash
# Backend
cd backend
source venv/bin/activate
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend (in another terminal)
npm run dev
```

### File Structure
```
├── buildclip.sh              # Main deployment script
├── docker-compose.yml        # Production configuration
├── docker-compose.dev.yml    # Development configuration
├── Dockerfile.frontend       # Production frontend
├── Dockerfile.frontend.dev   # Development frontend
├── Dockerfile.backend        # Backend container
├── src/                      # React frontend source
│   ├── App.jsx              # Main application component
│   ├── PolygonSelector.jsx  # Map and polygon handling
│   └── main.jsx             # Application entry point
├── backend/                  # FastAPI backend source
│   ├── main.py              # FastAPI application
│   ├── data_processors.py   # Building data processing logic
│   └── requirements.txt     # Python dependencies
└── README.md                 # This file
```

## 📈 Usage Examples

### Basic Workflow
1. Run `./buildclip.sh` (development mode)
2. Open http://localhost:5173
3. Draw one or multiple polygons on the map
4. Configure estimation settings (optional)
5. View building data and population estimates
6. Use filter drawer to filter by categories and/or metrics
7. Export data in desired format

### Multiple Polygon Workflow
1. Draw first polygon and wait for data processing
2. Draw additional polygons - each processes independently
3. Use polygon dropdown to manage drawn areas
4. Remove individual polygons as needed
6. All building data accumulates and merges automatically

### Population Estimation: Example
- Building: 750 m² footprint × 6 floors = 4,500 m² total area
- Occupancy Factor: 41 m² per occupant
- Estimated Population: 4,500 ÷ 41 = 109 occupants

### Roof Area Calculation: Example
- Building: 500 m² footprint
- Pitch Angle: 15°
- Roof Factor: 1.0 + (0.15 × tan(15°)) = 1.04
- Roof Area: 500 × 1.04 = 520 m²

### Building Type Inference: Example
- Building with `shop=supermarket` → Commercial
- Building with `amenity=hospital` → Healthcare
- Building 800 m², 3 floors → Residential
- Building 2000 m², no floors, flat roof → Industrial

### Advanced Filtering: Example
- **Category Filter**: Select "Residential" and "Commercial"
- **Metrics Filter**: Footprint > 300 AND Height between 10-20m
- **Result**: Only residential and commercial buildings with foorprint > 300 and height between 10-20m are displayed

## 🎨 User Interface Features

### Interactive Map
- **Multiple Polygon Drawing**: Draw and manage multiple areas simultaneously
- **Building Display**: Color-coded by category (highlighted building inside the polygon)
- **Building Selection**: Click buildings for detailed information
- **Zoom and Pan**: Standard map navigation
- **Map Layer Toggle**: Switch between different map layers

### Building Information Panel
- **Basic Details**: Type, category, address
- **Metrics**: Floors, height (actual or estimated), footprint, roof area
- **Population**: Estimated population (residential only)
- **Technical Details**: OSM ID, original tags, data sources
- **Pitch Angle Control**: Adjust roof pitch for individual buildings
- **Delete**: Exclude specific building from polygon and export data