# Building Data Analysis Platform

A comprehensive web application for analyzing building data from OpenStreetMap, featuring population estimation, building categorization, and interactive mapping.

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
- **Building Data**: Fetch comprehensive building information from OpenStreetMap
- **Population Estimation**: Calculate estimated population for residential buildings
- **Building Categorization**: Automatic classification of buildings by type
- **Data Export**: Export building data in CSV and JSON formats

### Population Estimation
- **Configurable Occupancy Factor**: Default 41 m² per occupant (user-adjustable)
- **Residential Focus**: Only calculates for residential buildings with floor data
- **Real-time Updates**: Population estimates update immediately when changing factors
- **Export Integration**: Population data included in all exports

### Building Categories
- **Residential**: Houses, apartments, dormitories
- **Religious**: Churches, mosques, synagogues
- **Education**: Schools, colleges, universities
- **Commercial**: Offices, retail, supermarkets
- **Industrial**: Warehouses, factories
- **Transport**: Stations, parking, garages
- **Cultural/Public**: Theaters, government buildings
- **Other**: Miscellaneous building types

## 🛠️ Technical Stack

### Frontend
- **React 18**: Modern UI framework
- **Vite**: Fast build tool and dev server
- **Leaflet**: Interactive mapping
- **CSS-in-JS**: Styled components

### Backend
- **FastAPI**: Modern Python web framework
- **OpenStreetMap**: Building data source
- **Shapely**: Geometric calculations
- **GeoPandas**: Geospatial data processing

### Infrastructure
- **Docker**: Containerization
- **Docker Compose**: Multi-service orchestration
- **Nginx**: Production web server (production mode)

## 📊 Data Sources

- **OpenStreetMap**: Primary building data source
- **Overture Maps**: Height and floor data enrichment
- **ISTAT**: Italian census data (when available)
- **APE**: Energy performance certificates (when available)

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
├── src/                      # React frontend source
├── backend/                  # FastAPI backend source
└── README.md                 # This file
```

## 📈 Usage Examples

### Basic Workflow
1. Run `./buildclip.sh` (development mode)
2. Open http://localhost:5173
3. Draw a polygon on the map
4. View building data and population estimates
5. Export data as needed

### Population Estimation Example
- Building: 750 m² footprint × 6 floors = 4,500 m² total area
- Occupancy Factor: 41 m² per occupant
- Estimated Population: 4,500 ÷ 41 = 109 occupants

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `./buildclip.sh dev`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
