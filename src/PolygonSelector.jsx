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
  'Healthcare': ['hospital', 'clinic', 'medical', 'pharmacy', 'doctors', 'dentist'],
  'Industrial/Storage': ['industrial', 'warehouse', 'shed'],
  'Transport': ['train_station', 'station', 'parking', 'garage', 'garages', 'carport', 'bridge'],
  'Cultural/Public': ['theatre', 'cinema', 'sports_hall', 'government', 'public', 'castle', 'grandstand'],
  'Tower': ['tower'],
  'Other': ['roof', 'ruins', 'service'],
  'Unknown': ['other', 'large_building']
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
    'Healthcare': '#FF5722', // Deep Orange
    'Industrial/Storage': '#A1887F', // Light Brown
    'Transport': '#FFC107', // Amber
    'Cultural/Public': '#8BC34A', // Light Green
    'Tower': '#607D8B', // Blue Grey
    'Other': '#9E9E9E', // Grey
    'Unknown': '#9E9E9E' // Grey
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
  const [isHovered, setIsHovered] = useState(false);

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      pointerEvents: 'auto',
      userSelect: 'none',
      isolation: 'isolate'
    }}>
      <button
        onClick={toggleOpen}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: '12px 20px',
          border: '1px solid #e0e0e0',
          backgroundColor: 'white',
          cursor: 'pointer',
          borderRadius: '50px',
          fontSize: '14px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minWidth: '140px',
          justifyContent: 'space-between',
          boxShadow: isHovered 
            ? '0 6px 16px rgba(0,0,0,0.2)' 
            : '0 4px 12px rgba(0,0,0,0.15)',
          transform: isHovered ? 'scale(1.05)' : 'scale(1)',
          transition: 'all 0.3s ease',
          color: '#333',
          background: isHovered ? '#f8f9fa' : 'white',
          position: 'relative',
          zIndex: 1001
        }}
        title="Switch map view"
      >
        <span style={{ 
          fontSize: '16px',
          transition: 'transform 0.2s ease'
        }}>
          🗺️
        </span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          {MAP_LAYERS[currentLayer].name}
        </span>
        <span style={{ 
          fontSize: '12px',
          color: '#64748b',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          ▼
        </span>
      </button>
      
      <div style={{
        position: 'absolute',
        bottom: '100%',
        right: '0',
        marginBottom: '4px',
        opacity: isOpen ? 1 : 0,
        visibility: isOpen ? 'visible' : 'hidden',
        transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.95)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        transformOrigin: 'bottom right'
      }}>
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
          minWidth: '160px',
          overflow: 'hidden',
          backdropFilter: 'blur(8px)'
        }}>
          {Object.entries(MAP_LAYERS).map(([key, layer], index) => {
            const isSelected = currentLayer === key;
            return (
              <button
                key={key}
                onClick={() => {
                  onLayerChange(key);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  backgroundColor: isSelected ? '#f1f5f9' : 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: isSelected ? '600' : '500',
                  textAlign: 'left',
                  color: isSelected ? '#1e40af' : '#374151',
                  borderBottom: index < Object.entries(MAP_LAYERS).length - 1 ? '1px solid #f1f5f9' : 'none',
                  transition: 'all 0.15s ease',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.target.style.backgroundColor = '#f8fafc';
                    e.target.style.color = '#1e40af';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.target.style.backgroundColor = 'white';
                    e.target.style.color = '#374151';
                  }
                }}
              >
                <span style={{ 
                  fontSize: '12px',
                  opacity: isSelected ? 1 : 0.6,
                  transition: 'opacity 0.15s ease'
                }}>
                  {isSelected ? '✓' : ''}
                </span>
                <span>{layer.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Component to fit bounds when buildings data changes
function FitBounds({ buildingsData, focusOnNewPolygon = false }) {
  const map = useMap();
  
  useEffect(() => {
    // Don't fit bounds if we're focusing on a new polygon
    if (focusOnNewPolygon) {
      return;
    }
    
    if (buildingsData && buildingsData.features && buildingsData.features.length > 0) {
      try {
        const group = L.featureGroup();
        
        // Add each building to the group
        buildingsData.features.forEach(feature => {
          if (feature.geometry) {
            const layer = L.geoJSON(feature);
            group.addLayer(layer);
          }
        });
        
        // Get bounds from the group
        const bounds = group.getBounds();
        
        // Fit the map to the bounds with padding
        map.fitBounds(bounds, { padding: [20, 20] });
        
      } catch (error) {
        console.error('Error fitting bounds:', error);
      }
    }
  }, [buildingsData, map, focusOnNewPolygon]);
  
  return null;
}

// Separate component to handle polygon focus
function PolygonFocus({ focusOnNewPolygon, newPolygonCoords }) {
  const map = useMap();
  
  useEffect(() => {
    if (focusOnNewPolygon && newPolygonCoords) {
      const polygonBounds = L.latLngBounds(newPolygonCoords);
      map.fitBounds(polygonBounds, { padding: [50, 50] });
    }
  }, [focusOnNewPolygon, newPolygonCoords, map]);
  
  return null;
}

// Component to handle polygon hover focus
function PolygonHoverFocus({ highlightedPolygon }) {
  const map = useMap();
  
  useEffect(() => {
    if (highlightedPolygon && highlightedPolygon.coords) {
      const polygonBounds = L.latLngBounds(highlightedPolygon.coords);
      map.fitBounds(polygonBounds, { padding: [50, 50] });
    }
  }, [highlightedPolygon, map]);
  
  return null;
}

function PolygonSelector({ onPolygonDrawn, buildingsData, onBuildingClick, selectedBuilding }) {
  const [drawnItems, setDrawnItems] = useState(new L.FeatureGroup());
  const [currentLayer, setCurrentLayer] = useState('osm');
  const [polygons, setPolygons] = useState([]); // Store multiple polygons
  const [focusOnNewPolygon, setFocusOnNewPolygon] = useState(false);
  const [newPolygonCoords, setNewPolygonCoords] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedPolygon, setHighlightedPolygon] = useState(null);
  
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



  // Reset focus state after data is loaded
  useEffect(() => {
    if (buildingsData && buildingsData.features && buildingsData.features.length > 0) {
      // Reset focus after a longer delay to ensure the map has settled
      const timer = setTimeout(() => {
        setFocusOnNewPolygon(false);
        setNewPolygonCoords(null);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [buildingsData]);

  const handleCreated = (e) => {
    const { layer } = e;
    
    // Add the new layer to the existing feature group
    setDrawnItems(prev => {
      const newItems = new L.FeatureGroup();
      // Add all existing layers
      prev.eachLayer(l => newItems.addLayer(l));
      // Add the new layer
      newItems.addLayer(layer);
      return newItems;
    });
    
    const coords = layer.getLatLngs()[0];
    
    // Validate that we have enough points for a polygon
    if (!coords || coords.length < 3) {
      console.warn('Invalid polygon: need at least 3 points');
      return;
    }
    
    // Add the new polygon to our state and get the updated list
    const newPolygon = { id: Date.now(), coords, layer };
    setPolygons(prev => {
      const updatedPolygons = [...prev, newPolygon];
      
      console.log("New polygon added:", coords);
      console.log("Total polygons:", updatedPolygons.length);
      
      // Set focus on the new polygon
      setFocusOnNewPolygon(true);
      setNewPolygonCoords(coords);
      
      // Handle multiple polygons and send to parent
      handleMultiplePolygons(updatedPolygons);
      
      return updatedPolygons;
    });
  };

  // Function to send polygon to parent
  const sendPolygonToParent = (polygon) => {
    console.log("Sending polygon to parent:", polygon.coords, "with ID:", polygon.id);
    onPolygonDrawn([polygon.coords], polygon.id);
  };

  // Function to handle multiple polygons
  const handleMultiplePolygons = (polygonList) => {
    if (polygonList.length === 0) {
      onPolygonDrawn(null);
      return;
    }
    
    if (polygonList.length === 1) {
      // Single polygon - send directly
      sendPolygonToParent(polygonList[0]);
      return;
    }
    
    // Multiple polygons - process the newest one
    try {
      console.log("Multiple polygons detected:", polygonList.length);
      
      // Process the newest polygon (last in the array)
      const newestPolygon = polygonList[polygonList.length - 1];
      sendPolygonToParent(newestPolygon);
      
    } catch (error) {
      console.error("Error processing multiple polygons:", error);
      // Fallback to first polygon
      sendPolygonToParent(polygonList[0]);
    }
  };

  const handleEdited = (e) => {
    const { layers } = e;
    const updatedPolygons = [...polygons]; // Start with all existing polygons
    let editedPolygon = null;
    
    layers.eachLayer((layer) => {
      // Get updated polygon coordinates
      const coordinates = layer.getLatLngs()[0];
      
      // Validate that we have enough points for a polygon
      if (!coordinates || coordinates.length < 3) {
        console.warn('Invalid polygon: need at least 3 points');
        return;
      }
      
      // Find and update the corresponding polygon in our state
      const polygonIndex = updatedPolygons.findIndex(p => p.layer === layer);
      if (polygonIndex !== -1) {
        const updatedPolygon = { ...updatedPolygons[polygonIndex], coords: coordinates };
        updatedPolygons[polygonIndex] = updatedPolygon; // Update the existing polygon
        editedPolygon = updatedPolygon; // Track the edited polygon
      }
    });
    
    if (editedPolygon) {
      setPolygons(updatedPolygons);
      console.log("Processing edited polygon:", editedPolygon.id);
      console.log("Total polygons after edit:", updatedPolygons.length);
      
      // Set focus on the edited polygon
      setFocusOnNewPolygon(true);
      setNewPolygonCoords(editedPolygon.coords);
      
      sendPolygonToParent(editedPolygon);
    }
  };

  const handleDeleted = (e) => {
    console.log("Delete event triggered");
    
    // Clear the drawn items
    setDrawnItems(new L.FeatureGroup());
    
    // Clear our polygon state
    setPolygons([]);
    
    // Call the callback with null to clear the highlighted buildings
    onPolygonDrawn(null);
  };

  // Function to highlight a polygon on hover
  const highlightPolygon = (polygon) => {
    setHighlightedPolygon(polygon);
    
    // Change polygon style to light orange
    if (polygon.layer) {
      polygon.layer.setStyle({
        fillColor: '#ffa726',
        fillOpacity: 0.7,
        weight: 3,
        color: '#ff9800'
      });
    }
    
    // Focus will be handled by PolygonHoverFocus component
  };

  // Function to unhighlight a polygon
  const unhighlightPolygon = (polygon) => {
    setHighlightedPolygon(null);
    
    // Reset polygon style to default
    if (polygon.layer) {
      polygon.layer.setStyle({
        fillColor: '#3388ff',
        fillOpacity: 0.2,
        weight: 2,
        color: '#3388ff'
      });
    }
  };

  // Function to remove a specific polygon
  const removePolygon = (polygonToRemove) => {
    console.log("Removing polygon:", polygonToRemove.id);
    
    // Remove the layer from the map
    if (polygonToRemove.layer) {
      polygonToRemove.layer.remove();
    }
    
    // Remove from drawn items
    setDrawnItems(prev => {
      const newItems = new L.FeatureGroup();
      prev.eachLayer(layer => {
        if (layer !== polygonToRemove.layer) {
          newItems.addLayer(layer);
        }
      });
      return newItems;
    });
    
    // Remove from polygons state
    setPolygons(prev => {
      const updatedPolygons = prev.filter(p => p.id !== polygonToRemove.id);
      console.log("Polygons after removal:", updatedPolygons.length);
      return updatedPolygons;
    });
    
    // Call parent to remove polygon data
    onPolygonDrawn(null, polygonToRemove.id);
    
    // Close dropdown if no polygons left
    if (polygons.length <= 1) {
      setDropdownOpen(false);
    }
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
            rectangle: false, // Disable rectangle, focus on polygons
            polygon: true,
            circle: false,
            polyline: false,
            marker: false,
            circlemarker: false,
          }}
        />
      </FeatureGroup>
      
        <FitBounds buildingsData={buildingsData} focusOnNewPolygon={focusOnNewPolygon} />
        <PolygonFocus 
          focusOnNewPolygon={focusOnNewPolygon}
          newPolygonCoords={newPolygonCoords}
        />
        <PolygonHoverFocus highlightedPolygon={highlightedPolygon} />
      </MapContainer>
      
      <MapLayerToggle 
        currentLayer={currentLayer} 
        onLayerChange={setCurrentLayer} 
      />
      
      {/* Polygon Management Dropdown */}
      {polygons.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '182px', // Moved very tiny 2px to the left
          zIndex: 9999,
          backgroundColor: 'white',
          borderRadius: '50px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          border: '1px solid #e0e0e0',
          padding: '12px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: '#333',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minWidth: '140px',
          justifyContent: 'space-between'
        }}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        onMouseEnter={(e) => {
          if (e.target === e.currentTarget) {
            e.target.style.backgroundColor = '#f8f9fa';
            e.target.style.transform = 'scale(1.05)';
            e.target.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
          }
        }}
        onMouseLeave={(e) => {
          if (e.target === e.currentTarget) {
            e.target.style.backgroundColor = 'white';
            e.target.style.transform = 'scale(1)';
            e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }
        }}
        >
          🗺️ {polygons.length} polygon{polygons.length > 1 ? 's' : ''} drawn
          <span style={{ fontSize: '12px', marginLeft: 'auto' }}>
            {dropdownOpen ? '▼' : '▶'}
          </span>
          
          {/* Dropdown Content */}
          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: '0',
              right: '0',
              marginBottom: '4px',
              maxHeight: '300px',
              overflowY: 'auto',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
              border: '1px solid #e2e8f0',
              zIndex: 10000,
              minWidth: '160px',
              overflow: 'hidden',
              backdropFilter: 'blur(8px)'
            }}>
              {polygons.map((polygon, index) => (
                <div
                  key={polygon.id}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={() => highlightPolygon(polygon)}
                  onMouseLeave={() => unhighlightPolygon(polygon)}
                >
                  <span style={{ fontSize: '10px', color: '#666' }}>
                    #{index + 1}
                  </span>
                  <span style={{ flex: 1 }}>
                    Polygon {index + 1}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removePolygon(polygon);
                    }}
                    style={{
                      background: 'none',
                      border: '1px solid #ff6b6b',
                      color: '#ff6b6b',
                      borderRadius: '3px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#ff6b6b';
                      e.target.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = 'transparent';
                      e.target.style.color = '#ff6b6b';
                    }}
                    title="Remove this polygon"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PolygonSelector;
