import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, FeatureGroup, GeoJSON, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { categorizeBuilding, getCategoryMapColor } from './buildingUtils.js';
import { IconLayers, IconPolygon, IconChevronDown, IconClose } from './Icons.jsx';
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

// Map layer toggle pill with a popover menu
function MapLayerToggle({ currentLayer, onLayerChange }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="map-pill-anchor">
      <button className="map-pill" onClick={() => setIsOpen(!isOpen)} title="Switch map layer">
        <IconLayers size={14} />
        {MAP_LAYERS[currentLayer].name}
        <span className={`pill-caret ${isOpen ? 'open' : ''}`}>
          <IconChevronDown size={13} />
        </span>
      </button>

      {isOpen && (
        <div className="map-pill-menu">
          {Object.entries(MAP_LAYERS).map(([key, layer]) => (
            <button
              key={key}
              className={`map-pill-menu-item ${currentLayer === key ? 'selected' : ''}`}
              onClick={() => {
                onLayerChange(key);
                setIsOpen(false);
              }}
            >
              <span className="item-check">{currentLayer === key ? '✓' : ''}</span>
              {layer.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Component to fit bounds when buildings data changes
function FitBounds({ buildingsData, focusOnNewPolygon = false }) {
  const map = useMap();
  const prevBuildingsCountRef = useRef(0);

  useEffect(() => {
    // Don't fit bounds if we're focusing on a new polygon
    if (focusOnNewPolygon) {
      return;
    }

    // Only fit bounds when the number of buildings actually changed, so
    // clicking a building doesn't re-zoom the map
    const currentBuildingsCount = buildingsData?.features?.length || 0;
    if (currentBuildingsCount !== prevBuildingsCountRef.current && currentBuildingsCount > 0) {
      prevBuildingsCountRef.current = currentBuildingsCount;

      try {
        const group = L.featureGroup();

        buildingsData.features.forEach(feature => {
          if (feature.geometry) {
            group.addLayer(L.geoJSON(feature));
          }
        });

        map.fitBounds(group.getBounds(), { padding: [20, 20] });
      } catch (error) {
        console.error('Error fitting bounds:', error);
      }
    }
  }, [buildingsData, map, focusOnNewPolygon]);

  return null;
}

// Zoom to a freshly drawn or edited polygon
function PolygonFocus({ focusOnNewPolygon, newPolygonCoords }) {
  const map = useMap();

  useEffect(() => {
    if (focusOnNewPolygon && newPolygonCoords) {
      map.fitBounds(L.latLngBounds(newPolygonCoords), { padding: [50, 50] });
    }
  }, [focusOnNewPolygon, newPolygonCoords, map]);

  return null;
}

// Zoom to a polygon hovered in the polygon list
function PolygonHoverFocus({ highlightedPolygon }) {
  const map = useMap();

  useEffect(() => {
    if (highlightedPolygon && highlightedPolygon.coords) {
      map.fitBounds(L.latLngBounds(highlightedPolygon.coords), { padding: [50, 50] });
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

  // react-leaflet's GeoJSON layer doesn't restyle when props change, so remount
  // it via a fresh key — but only when the data or selection actually changes,
  // not on every render (the old Date.now() key rebuilt the layer constantly).
  const layerRevisionRef = useRef(0);
  const buildingsLayerKey = useMemo(() => {
    layerRevisionRef.current += 1;
    return `buildings-${layerRevisionRef.current}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps deliberately drive key regeneration
  }, [buildingsData, selectedBuilding]);

  // Reset focus state after data is loaded
  useEffect(() => {
    if (buildingsData && buildingsData.features && buildingsData.features.length > 0) {
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
      prev.eachLayer(l => newItems.addLayer(l));
      newItems.addLayer(layer);
      return newItems;
    });

    const coords = layer.getLatLngs()[0];

    if (!coords || coords.length < 3) {
      console.warn('Invalid polygon: need at least 3 points');
      return;
    }

    // Add the new polygon to our state. Side effects stay outside the state
    // updater: updaters can run twice under StrictMode, which previously
    // kicked off duplicate backend requests per drawn polygon.
    const newPolygon = { id: Date.now(), coords, layer };
    const updatedPolygons = [...polygons, newPolygon];
    setPolygons(updatedPolygons);

    setFocusOnNewPolygon(true);
    setNewPolygonCoords(coords);

    handleMultiplePolygons(updatedPolygons);
  };

  const sendPolygonToParent = (polygon) => {
    onPolygonDrawn([polygon.coords], polygon.id);
  };

  const handleMultiplePolygons = (polygonList) => {
    if (polygonList.length === 0) {
      onPolygonDrawn(null);
      return;
    }

    // Process the newest polygon (data for the others is already tracked)
    sendPolygonToParent(polygonList[polygonList.length - 1]);
  };

  const handleEdited = (e) => {
    const { layers } = e;
    const updatedPolygons = [...polygons];
    let editedPolygon = null;

    layers.eachLayer((layer) => {
      const coordinates = layer.getLatLngs()[0];

      if (!coordinates || coordinates.length < 3) {
        console.warn('Invalid polygon: need at least 3 points');
        return;
      }

      const polygonIndex = updatedPolygons.findIndex(p => p.layer === layer);
      if (polygonIndex !== -1) {
        const updatedPolygon = { ...updatedPolygons[polygonIndex], coords: coordinates };
        updatedPolygons[polygonIndex] = updatedPolygon;
        editedPolygon = updatedPolygon;
      }
    });

    if (editedPolygon) {
      setPolygons(updatedPolygons);

      setFocusOnNewPolygon(true);
      setNewPolygonCoords(editedPolygon.coords);

      sendPolygonToParent(editedPolygon);
    }
  };

  const handleDeleted = () => {
    setDrawnItems(new L.FeatureGroup());
    setPolygons([]);
    onPolygonDrawn(null);
  };

  const highlightPolygon = (polygon) => {
    setHighlightedPolygon(polygon);

    if (polygon.layer) {
      polygon.layer.setStyle({
        fillColor: '#eda100',
        fillOpacity: 0.5,
        weight: 3,
        color: '#c98500'
      });
    }
  };

  const unhighlightPolygon = (polygon) => {
    setHighlightedPolygon(null);

    if (polygon.layer) {
      polygon.layer.setStyle({
        fillColor: '#3388ff',
        fillOpacity: 0.2,
        weight: 2,
        color: '#3388ff'
      });
    }
  };

  const removePolygon = (polygonToRemove) => {
    if (polygonToRemove.layer) {
      polygonToRemove.layer.remove();
    }

    setDrawnItems(prev => {
      const newItems = new L.FeatureGroup();
      prev.eachLayer(layer => {
        if (layer !== polygonToRemove.layer) {
          newItems.addLayer(layer);
        }
      });
      return newItems;
    });

    setPolygons(prev => prev.filter(p => p.id !== polygonToRemove.id));

    // Tell the parent to drop this polygon's data
    onPolygonDrawn(null, polygonToRemove.id);

    if (polygons.length <= 1) {
      setDropdownOpen(false);
    }
  };

  // Category-colored fills; the selected building gets a dark outline
  const buildingStyle = (feature) => {
    const isSelected = selectedBuilding && selectedBuilding.properties?.osm_id === feature.properties?.osm_id;
    const buildingType = feature.properties.building || 'yes';
    const categoryColor = getCategoryMapColor(categorizeBuilding(buildingType));

    return {
      fillColor: categoryColor,
      weight: isSelected ? 3 : 1.5,
      opacity: 1,
      color: isSelected ? '#16181d' : '#5f6672',
      fillOpacity: isSelected ? 0.95 : 0.7,
      className: 'building-polygon'
    };
  };

  const onEachFeature = (feature, layer) => {
    layer.on({
      click: () => {
        onBuildingClick(feature);
      },
      mouseover: (e) => {
        const target = e.target;
        target.setStyle({
          fillOpacity: 0.95,
          weight: 3
        });
        target.bringToFront();
      },
      mouseout: (e) => {
        e.target.setStyle(buildingStyle(feature));
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
            key={buildingsLayerKey}
            data={buildingsData}
            style={buildingStyle}
            onEachFeature={onEachFeature}
            pointToLayer={(feature, latlng) => L.circleMarker(latlng, buildingStyle(feature))}
          />
        )}

        <FeatureGroup ref={(group) => { if (group) group.leafletElement = drawnItems; }}>
          <EditControl
            position="topright"
            onCreated={handleCreated}
            onEdited={handleEdited}
            onDeleted={handleDeleted}
            draw={{
              rectangle: false,
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

      <div className="map-bottom-controls">
        {polygons.length > 0 && (
          <div className="map-pill-anchor">
            <button className="map-pill" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <IconPolygon size={14} />
              {polygons.length} polygon{polygons.length > 1 ? 's' : ''}
              <span className={`pill-caret ${dropdownOpen ? 'open' : ''}`}>
                <IconChevronDown size={13} />
              </span>
            </button>

            {dropdownOpen && (
              <div className="map-pill-menu">
                {polygons.map((polygon, index) => (
                  <div
                    key={polygon.id}
                    className="map-pill-menu-item"
                    onMouseEnter={() => highlightPolygon(polygon)}
                    onMouseLeave={() => unhighlightPolygon(polygon)}
                  >
                    Polygon {index + 1}
                    <button
                      className="item-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePolygon(polygon);
                      }}
                      title="Remove this polygon"
                    >
                      <IconClose size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <MapLayerToggle
          currentLayer={currentLayer}
          onLayerChange={setCurrentLayer}
        />
      </div>
    </div>
  );
}

export default PolygonSelector;
