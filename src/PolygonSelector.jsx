import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, FeatureGroup, GeoJSON, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// Map layer options
const MAP_LAYERS = {
  osm: {
    name: 'Street Map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap contributors'
  }
};

// Building type categorization (same as in App.jsx)
const BUILDING_CATEGORIES = {
  'Residential': ['residential', 'apartments', 'house', 'detached', 'dormitory', 'terrace', 'semidetached_house'],
  'Religious': ['church', 'chapel', 'synagogue', 'cathedral', 'basilica', 'mosque'],
  'Education': ['school', 'kindergarten', 'college'],
  'University': ['university'],
  'Hotel': ['hotel'],
  'Commercial': ['retail', 'commercial', 'office', 'supermarket', 'kiosk'],
  'Industrial/Storage': ['industrial', 'warehouse', 'shed'],
  'Transport': ['train_station', 'station', 'parking', 'garage', 'garages', 'carport', 'bridge'],
  'Cultural/Public': ['theatre', 'cinema', 'sports_hall', 'government', 'public', 'castle', 'grandstand'],
  'Other': ['yes', 'tower', 'roof', 'ruins', 'service']
};

// Function to categorize a building
const categorizeBuilding = (buildingType) => {
  for (const [category, types] of Object.entries(BUILDING_CATEGORIES)) {
    if (types.includes(buildingType)) {
      return category;
    }
  }
  return 'Other';
};

// Function to get category color for map
const getCategoryMapColor = (category) => {
  const colors = {
    'Residential': '#2196F3', // Blue
    'Religious': '#9C27B0', // Purple
    'Education': '#4CAF50', // Green
    'University': '#FF9800', // Orange
    'Hotel': '#E91E63', // Pink
    'Commercial': '#00BCD4', // Cyan
    'Industrial/Storage': '#A1887F', // Light Brown
    'Transport': '#FFC107', // Amber
    'Cultural/Public': '#8BC34A', // Light Green
    'Other': '#9E9E9E' // Grey
  };
  return colors[category] || '#9E9E9E';
};

// Safely closes ring for Turf, strips accidental duplicates
function ensureClosedLngLat(coords) {
  if (!coords?.length) return coords;
  let ring = coords.map(p => [p.lng, p.lat]);
  
  // Ensure we have at least 3 points for a valid polygon
  if (ring.length < 3) return null;
  
  // Remove duplicate trailing points (Leaflet-draw may close for us)
  while (
    ring.length > 3 &&
    Math.abs(ring[0][0] - ring[ring.length - 1][0]) < 1e-8 &&
    Math.abs(ring[0][1] - ring[ring.length - 1][1]) < 1e-8
  ) {
    ring.pop();
  }
  
  // Add close if not already closed
  if (
    ring.length >= 3 &&
    (Math.abs(ring[0][0] - ring[ring.length - 1][0]) > 1e-8 ||
     Math.abs(ring[0][1] - ring[ring.length - 1][1]) > 1e-8)
  ) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  
  return ring;
}

// Map layer toggle component
function MapLayerToggle({ currentLayer, onLayerChange }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      zIndex: 1000,
      backgroundColor: 'white',
      borderRadius: '4px',
      boxShadow: '0 1px 5px rgba(0,0,0,0.4)',
      border: '2px solid rgba(0,0,0,0.2)'
    }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '6px 8px',
          border: 'none',
          backgroundColor: 'white',
          cursor: 'pointer',
          borderRadius: '4px',
          fontSize: '14px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          minWidth: '100px',
          justifyContent: 'space-between'
        }}
        title="Change map layer"
      >
        🗺️ {MAP_LAYERS[currentLayer].name}
        <span style={{ fontSize: '10px' }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: '0',
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          minWidth: '120px',
          marginTop: '2px'
        }}>
          {Object.entries(MAP_LAYERS).map(([key, layer]) => (
            <button
              key={key}
              onClick={() => {
                onLayerChange(key);
                setIsOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                backgroundColor: currentLayer === key ? '#f0f0f0' : 'white',
                cursor: 'pointer',
                fontSize: '14px',
                textAlign: 'left',
                borderBottom: '1px solid #eee'
              }}
              onMouseEnter={(e) => {
                if (currentLayer !== key) {
                  e.target.style.backgroundColor = '#f8f8f8';
                }
              }}
              onMouseLeave={(e) => {
                if (currentLayer !== key) {
                  e.target.style.backgroundColor = 'white';
                }
              }}
            >
              {layer.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Component to fit bounds when buildings data changes
function FitBounds({ buildingsData }) {
  const map = useMap();
  
  useEffect(() => {
    if (buildingsData && buildingsData.features && buildingsData.features.length > 0) {
      try {
        // Create a layer group to calculate bounds
        const layerGroup = L.layerGroup();
        
        // Add each building to the layer group
        buildingsData.features.forEach(feature => {
          if (feature.geometry) {
            const layer = L.geoJSON(feature);
            layerGroup.addLayer(layer);
          }
        });
        
        // Get bounds from the layer group
        const bounds = layerGroup.getBounds();
        
        // Fit the map to the bounds with padding
        map.fitBounds(bounds, { padding: [20, 20] });
        
        // Clean up
        layerGroup.clearLayers();
        
      } catch (error) {
        console.error('Error fitting bounds:', error);
      }
    }
  }, [buildingsData, map]);
  
  return null;
}

function PolygonSelector({ onPolygonDrawn, buildingsData, onBuildingClick, selectedBuilding }) {
  const [drawnItems, setDrawnItems] = useState(new L.FeatureGroup());
  const [currentLayer, setCurrentLayer] = useState('osm');
  
  // Debug logging
  useEffect(() => {
    if (buildingsData) {
      console.log('Buildings data received:', buildingsData);
      console.log('Number of features:', buildingsData.features?.length || 0);
      if (buildingsData.features && buildingsData.features.length > 0) {
        console.log('First building:', buildingsData.features[0]);
        console.log('Building types found:', [...new Set(buildingsData.features.map(f => f.properties?.building || 'unknown'))]);
      }
    } else {
      console.log('No buildings data available');
    }
  }, [buildingsData]);

  const handleCreated = (e) => {
    const { layer } = e;
    setDrawnItems(prev => {
      const newItems = new L.FeatureGroup();
      newItems.addLayer(layer);
      return newItems;
    });
    
    const coords = layer.getLatLngs()[0];
    
    // Validate that we have enough points for a polygon
    if (!coords || coords.length < 3) {
      console.warn('Invalid polygon: need at least 3 points');
      return;
    }
    
    console.log("Polygon coordinates:", coords);
    onPolygonDrawn(coords);
  };

  const handleEdited = (e) => {
    const { layers } = e;
    layers.eachLayer((layer) => {
      // Get updated polygon coordinates
      const coordinates = layer.getLatLngs()[0];
      
      // Validate that we have enough points for a polygon
      if (!coordinates || coordinates.length < 3) {
        console.warn('Invalid polygon: need at least 3 points');
        return;
      }
      
      console.log("Updated polygon coordinates:", coordinates);
      onPolygonDrawn(coordinates);
    });
  };

  const handleDeleted = (e) => {
    console.log("Delete event triggered");
    // Clear the drawn items
    setDrawnItems(new L.FeatureGroup());
    
    // Call the callback with null to clear the highlighted buildings
    onPolygonDrawn(null);
  };

  // Style function for buildings with category-based colors
  const buildingStyle = (feature) => {
    const isSelected = selectedBuilding && selectedBuilding.properties?.osm_id === feature.properties?.osm_id;
    const buildingType = feature.properties.building || 'yes';
    const category = categorizeBuilding(buildingType);
    const categoryColor = getCategoryMapColor(category);
    
    return {
      fillColor: isSelected ? '#ffeb3b' : categoryColor, // Yellow for selected, category color for others
      weight: isSelected ? 3 : 2,
      opacity: 1,
      color: '#666666', // Gray border
      fillOpacity: isSelected ? 0.9 : 0.7,
      className: 'building-polygon'
    };
  };

  // Handle building click
  const onEachFeature = (feature, layer) => {
    layer.on({
      click: () => {
        console.log('Building clicked:', feature);
        console.log('Building properties:', feature.properties);
        onBuildingClick(feature);
      },
      mouseover: (e) => {
        const layer = e.target;
        layer.setStyle({
          fillOpacity: 0.9,
          weight: 3
        });
        layer.bringToFront();
      },
      mouseout: (e) => {
        const layer = e.target;
        const isSelected = selectedBuilding && selectedBuilding.properties?.osm_id === feature.properties?.osm_id;
        const buildingType = feature.properties.building || 'yes';
        const category = categorizeBuilding(buildingType);
        const categoryColor = getCategoryMapColor(category);
        
        layer.setStyle({
          fillColor: isSelected ? '#ffeb3b' : categoryColor,
          fillOpacity: isSelected ? 0.9 : 0.7,
          weight: isSelected ? 3 : 2
        });
      }
    });
  };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        center={[45.0703, 7.6869]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer
          key={currentLayer}
          url={MAP_LAYERS[currentLayer].url}
          attribution={MAP_LAYERS[currentLayer].attribution}
        />
      
      {/* Display buildings if available */}
      {buildingsData && buildingsData.features && buildingsData.features.length > 0 && (
        <GeoJSON
          key={`buildings-${buildingsData.features.length}-${Date.now()}`}
          data={buildingsData}
          style={buildingStyle}
          onEachFeature={onEachFeature}
          pointToLayer={(feature, latlng) => {
            // Handle point features if any
            return L.circleMarker(latlng, buildingStyle(feature));
          }}
        />
      )}
      
      <FeatureGroup ref={(group) => { if (group) group.leafletElement = drawnItems; }}>
        <EditControl
          position="topright"
          onCreated={handleCreated}
          onEdited={handleEdited}
          onDeleted={handleDeleted}
          draw={{
            rectangle: true,
            polygon: true,
            circle: false,
            polyline: false,
            marker: false,
            circlemarker: false,
          }}
        />
      </FeatureGroup>
      
        <FitBounds buildingsData={buildingsData} />
      </MapContainer>
      
      <MapLayerToggle 
        currentLayer={currentLayer} 
        onLayerChange={setCurrentLayer} 
      />
    </div>
  );
}

export default PolygonSelector;
