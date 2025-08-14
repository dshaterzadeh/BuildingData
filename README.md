# 🏗️ Building Data Analysis Platform

A powerful web application for analyzing building data from OpenStreetMap and other sources. Draw polygons on a map to fetch comprehensive building information including heights, areas, and energy classifications.

## ✨ Features

### 🗺️ Interactive Map Interface
- **Polygon Drawing**: Draw custom areas to analyze buildings
- **Real-time Visualization**: Buildings highlighted with category-based colors
- **Interactive Selection**: Click buildings to view detailed information
- **Responsive Design**: Works on desktop and mobile devices

### 📊 Building Data Analysis
- **Multi-Source Integration**: OpenStreetMap, Overture Maps, ISTAT, APE data
- **Comprehensive Properties**: Height, floors, area, construction year, materials
- **Roof Area Calculation**: Automatic calculation with customizable pitch angles
- **Building Categorization**: 10 predefined categories (Residential, Commercial, etc.)

### 🎛️ Advanced Controls
- **Editable Pitch Angles**: Adjust roof pitch (0°-45°) with instant area recalculation
- **Building Management**: Delete unwanted buildings from selection
- **Category Filtering**: Filter buildings by type
- **Data Export**: Download as CSV or JSON with all customizations

### 📈 Real-time Processing
- **Progress Tracking**: Live updates during data fetching
- **Background Processing**: Non-blocking data collection
- **Error Handling**: Robust error recovery and user feedback

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/building-data-analysis.git
   cd building-data-analysis
   ```

2. **Set up the backend**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Set up the frontend**
   ```bash
   cd ..
   npm install
   ```

4. **Start the application**
   ```bash
   # Terminal 1: Start backend
   cd backend
   source venv/bin/activate
   uvicorn main:app --host 127.0.0.1 --port 8000 --reload

   # Terminal 2: Start frontend
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173`

## 🏗️ Architecture

### Frontend (React + Vite)
- **React 18**: Modern React with hooks
- **Vite**: Fast build tool and dev server
- **React Leaflet**: Interactive maps
- **Leaflet Draw**: Polygon drawing tools
- **Axios**: HTTP client for API communication

### Backend (FastAPI + Python)
- **FastAPI**: Modern Python web framework
- **Uvicorn**: ASGI server
- **Shapely**: Geometric operations
- **GeoPandas**: Geospatial data processing
- **aiohttp**: Async HTTP client

### Data Sources
- **OpenStreetMap**: Primary building data source
- **Overture Maps**: Height and floor data
- **ISTAT**: Italian census data
- **APE**: Energy performance certificates

## 📁 Project Structure

```
building-data-analysis/
├── src/
│   ├── App.jsx              # Main React application
│   ├── PolygonSelector.jsx  # Map and polygon drawing
│   └── main.jsx            # Application entry point
├── backend/
│   ├── main.py             # FastAPI application
│   ├── data_processors.py  # Data fetching and processing
│   └── requirements.txt    # Python dependencies
├── public/                 # Static assets
├── package.json           # Node.js dependencies
└── README.md             # This file
```

## 🎯 Usage Guide

### 1. Drawing a Polygon
- Use the drawing tools on the left side of the map
- Click "Draw a polygon" and click points on the map
- Double-click to finish drawing

### 2. Viewing Building Data
- Buildings in the selected area will be highlighted
- Click on any building to view detailed information
- Use category filters to focus on specific building types

### 3. Customizing Roof Calculations
- In the building details panel, adjust the roof pitch angle
- Roof area updates instantly as you move the slider
- Custom angles are saved and included in exports

### 4. Managing Buildings
- Delete unwanted buildings using the red delete button
- Buildings are removed from the selection immediately
- All data is updated accordingly

### 5. Exporting Data
- Use the export buttons to download CSV or JSON
- Exports include all customizations and modifications
- Data is filtered by selected category if applicable

## 🔧 Configuration

### Backend Configuration
The backend can be configured through environment variables:

```bash
# API endpoints (optional, defaults provided)
OVERPASS_API_ENDPOINTS=https://overpass-api.de/api/interpreter,https://overpass.openstreetmap.fr/api/interpreter

# Timeout settings (optional)
REQUEST_TIMEOUT=60
```

### Frontend Configuration
Frontend settings can be modified in `src/App.jsx`:

```javascript
// Default pitch angle for roof calculations
const DEFAULT_PITCH_ANGLE = 12.5;

// Building categories and colors
const BUILDING_CATEGORIES = { ... };
```

## 📊 Data Schema

### Building Properties
Each building includes the following properties:

```json
{
  "osm_id": "123456",
  "name": "Building Name",
  "building": "residential",
  "height": 15.5,
  "building:levels": 5,
  "footprint_area_m2": 250.0,
  "roof_area_m2": 262.5,
  "custom_pitch_angle": 12.5,
  "construction_year": 1990,
  "building:material": "brick",
  "energy_class": "B"
}
```

### Export Formats

**CSV Export:**
- Includes all building properties
- Custom pitch angles in separate column
- Filtered by selected category

**JSON Export:**
- Complete GeoJSON structure
- Metadata with export information
- Custom pitch angles in metadata

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code style and conventions
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting

## 🐛 Troubleshooting

### Common Issues

**Backend won't start:**
```bash
# Check Python version
python --version  # Should be 3.8+

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

**Frontend build errors:**
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**No buildings found:**
- Check internet connection
- Verify OpenStreetMap API availability
- Try a smaller polygon area

**Map not loading:**
- Check browser console for errors
- Verify Leaflet CSS is loaded
- Clear browser cache

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenStreetMap** for providing building data
- **Leaflet** for the mapping library
- **FastAPI** for the backend framework
- **React** for the frontend framework

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/yourusername/building-data-analysis/issues) page
2. Create a new issue with detailed information
3. Include error messages and steps to reproduce

## 🔄 Changelog

### Version 1.0.0
- Initial release
- Basic polygon drawing and building analysis
- Multi-source data integration
- Export functionality

### Version 1.1.0
- Added editable pitch angles
- Building deletion functionality
- Enhanced export options
- Improved UI/UX

---

**Made with ❤️ for building data analysis**
