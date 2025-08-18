# Building Data Analysis Platform

A comprehensive web application for analyzing building data from OpenStreetMap, featuring intelligent building type inference, population estimation, interactive mapping, and advanced data filtering capabilities.

## 🚀 Quick Start

### Using the Main Script (Recommended)

The `buildclip.sh` script is your one-stop solution for running the application:

```bash
# Development mode (with hot reloading) - DEFAULT
./buildclip.sh

# Or explicitly specify development mode
./buildclip.sh dev

# Production mode
./buildclip.sh prod

# Show help
./buildclip.sh help
```

### Development Mode Features
- ✅ **Hot Reloading**: Changes to your code automatically appear in the browser
- ✅ **Volume Mounting**: Real-time file synchronization between host and containers
- ✅ **Live Backend Reloading**: Python changes automatically restart the server
- ✅ **Development Server**: Vite dev server on port 5173

### Production Mode Features
- ✅ **Optimized Builds**: Production-ready static files
- ✅ **Nginx Serving**: High-performance web server
- ✅ **Health Checks**: Automatic service monitoring
- ✅ **Port 80**: Standard web port

## 📱 Access URLs

### Development Mode
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### Production Mode
- **Frontend**: http://localhost
- **Backend API**: http://localhost:8000
- **Health Check**: http://localhost:8000/health

## 🏗️ Features

### Core Functionality
- **Interactive Map**: Draw polygons to select areas for analysis
- **Multiple Polygon Support**: Draw and manage multiple areas simultaneously
- **Building Data**: Fetch comprehensive building information from OpenStreetMap
- **Intelligent Building Type Inference**: Advanced classification based on OSM tags and geometry
- **Population Estimation**: Calculate estimated population for residential buildings
- **Advanced Filtering System**: Multi-category and metrics-based filtering with drawer interface
- **Data Export**: Export building data in CSV and JSON formats
- **Real-time Roof Area Calculation**: Dynamic roof area based on pitch angle
- **Height Estimation**: Automatic height calculation from floor information

### 🗺️ Multiple Polygon Management

Advanced polygon drawing and management capabilities:
- **Multiple Areas**: Draw multiple polygons on the map simultaneously
- **Individual Processing**: Each polygon is processed independently for optimal performance
- **Data Accumulation**: Building data from all polygons is merged and displayed together
- **Polygon Management**: Dropdown interface to view and manage drawn polygons
- **Hover Highlighting**: Hover over polygon names to highlight them on the map
- **Individual Removal**: Remove specific polygons while keeping others
- **Map Focus**: Map automatically focuses on newly drawn/edited polygons
- **Progress Tracking**: Progress bar shows for each polygon being processed

### 🎯 Advanced Filtering System

#### Filter Drawer Interface
- **Collapsible Design**: Filter menu can be closed to a compact badge
- **Auto-Open**: Drawer automatically opens after first data fetch
- **Badge Indicator**: Shows "Filter by" badge when drawer is closed
- **Positioned Controls**: Filter badge aligned with map controls

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
- **Real-time Validation**: "Between" operator validates range (first ≤ second)
- **Year Limits**: Maximum year input limited to current year

### 🧠 Intelligent Building Type Inference

The application uses advanced heuristics to classify buildings more accurately:

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

#### Primary Categories
- **Residential**: Houses, apartments, dormitories, detached, terrace, semidetached
- **Religious**: Churches, chapels, synagogues, cathedrals, basilicas, mosques
- **Education**: Schools, kindergartens, colleges
- **University**: Universities
- **Hotel**: Hotels
- **Commercial**: Retail, commercial, offices, supermarkets, kiosks
- **Healthcare**: Hospitals, clinics, medical, pharmacies, doctors, dentists
- **Industrial/Storage**: Industrial, warehouses, sheds
- **Transport**: Train stations, stations, parking, garages, carports, bridges
- **Cultural/Public**: Theaters, cinemas, sports halls, government, public, castles, grandstands, museums

#### Special Categories
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

Comprehensive export options:
- **CSV Export**: Structured data with metadata
- **JSON Export**: Complete GeoJSON with properties
- **Filtered Export**: Export only selected categories and filtered data
- **Metadata Included**: Export settings, timestamps, and processing info

### 🏗️ Height Estimation

Automatic height calculation when floor information is available:
- **Formula**: `height = floors × 3 meters`
- **Visual Indicator**: "estimated" tag shown next to calculated heights
- **Fallback**: Uses actual height when available
- **Integration**: Works with all filtering and display features

## 🛠️ Technical Stack

### Frontend
- **React 18**: Modern UI framework with hooks
- **Vite**: Fast build tool and dev server
- **Leaflet**: Interactive mapping with polygon drawing
- **CSS-in-JS**: Styled components and responsive design

### Backend
- **FastAPI**: Modern Python web framework with async support
- **OpenStreetMap**: Building data source via Overpass API
- **Shapely**: Geometric calculations and area computations
- **GeoPandas**: Geospatial data processing and analysis

### Infrastructure
- **Docker**: Containerization for consistent environments
- **Docker Compose**: Multi-service orchestration
- **Nginx**: Production web server (production mode)

## 📊 Data Sources

- **OpenStreetMap**: Primary building data source with comprehensive tags
- **Building Geometry**: Footprint areas, heights, and floor information
- **Roof Data**: Pitch angles, roof shapes, and slope information
- **Building Tags**: Original OSM tags preserved for reference

## 🔧 Development

### Prerequisites
- Docker and Docker Compose
- Git

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
3. Draw one or more polygons on the map
4. Configure estimation settings (optional)
5. View building data and population estimates
6. Use filter drawer to filter by categories and/or metrics
7. Export data in desired format

### Multiple Polygon Workflow
1. Draw first polygon and wait for data processing
2. Draw additional polygons - each processes independently
3. Use polygon dropdown to manage drawn areas
4. Hover over polygon names to highlight them on map
5. Remove individual polygons as needed
6. All building data accumulates and merges automatically

### Population Estimation Example
- Building: 750 m² footprint × 6 floors = 4,500 m² total area
- Occupancy Factor: 41 m² per occupant
- Estimated Population: 4,500 ÷ 41 = 109 occupants

### Roof Area Calculation Example
- Building: 500 m² footprint
- Pitch Angle: 15°
- Roof Factor: 1.0 + (0.15 × tan(15°)) = 1.04
- Roof Area: 500 × 1.04 = 520 m²

### Height Estimation Example
- Building: 5 floors
- Estimated Height: 5 × 3 = 15 meters
- Display: "15m estimated"

### Building Type Inference Example
- Building with `shop=supermarket` → Commercial
- Building with `amenity=hospital` → Healthcare
- Building 800 m², 3 floors → Residential
- Building 2000 m², no floors, flat roof → Industrial

### Advanced Filtering Example
- **Category Filter**: Select "Residential" and "Commercial"
- **Metrics Filter**: Population > 100 AND Height between 10-20m
- **Result**: Only residential and commercial buildings with population > 100 and height between 10-20m are displayed

## 🎨 User Interface Features

### Interactive Map
- **Multiple Polygon Drawing**: Draw and manage multiple areas simultaneously
- **Building Display**: Color-coded by category
- **Building Selection**: Click buildings for detailed information
- **Zoom and Pan**: Standard map navigation
- **Map Layer Toggle**: Switch between different map layers

### Polygon Management Interface
- **Dropdown Menu**: Lists all drawn polygons with individual controls
- **Hover Highlighting**: Hover to highlight polygon on map
- **Individual Removal**: Remove specific polygons with × button
- **Progress Tracking**: Shows processing status for each polygon
- **Map Focus**: Automatically focuses on newly drawn areas

### Filter Interface
- **Collapsible Drawer**: Filter menu can be minimized to badge
- **Tabbed Interface**: Category and Metrics tabs
- **Applied Filter Badges**: Green badges show active filters
- **Real-time Updates**: Filters apply instantly
- **Input Validation**: Prevents invalid values and ranges

### Building Information Panel
- **Basic Details**: Type, category, address
- **Metrics**: Floors, height (actual or estimated), footprint, roof area
- **Population**: Estimated population (residential only)
- **Technical Details**: OSM ID, original tags, data sources
- **Pitch Angle Control**: Adjust roof pitch for individual buildings

### Estimation Settings Panel
- **Compact Design**: Minimal interface with essential controls
- **Global Settings**: Apply to all buildings
- **Individual Override**: Custom settings per building
- **Real-time Calculation**: Instant updates across the application

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `./buildclip.sh dev`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
