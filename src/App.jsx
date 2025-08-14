import { useState, useEffect } from 'react'
import PolygonSelector from './PolygonSelector.jsx'
import './App.css'

// Building type categorization
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
  return 'Other'; // Default category
};

// Function to get category color
const getCategoryColor = (category) => {
  const colors = {
    'Residential': '#2196F3',
    'Religious': '#9C27B0', 
    'Education': '#4CAF50',
    'University': '#FF9800',
    'Hotel': '#E91E63',
    'Commercial': '#00BCD4',
    'Industrial/Storage': '#A1887F',
    'Transport': '#FFC107',
    'Cultural/Public': '#8BC34A',
    'Other': '#f5f5f5'
  };
  return colors[category] || '#f5f5f5';
};

function App() {
  const [polygonCoords, setPolygonCoords] = useState(null)
  const [processingTask, setProcessingTask] = useState(null)
  const [progress, setProgress] = useState(null)
  const [buildingsData, setBuildingsData] = useState(null)
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [error, setError] = useState(null)
  const [buildingPitchAngles, setBuildingPitchAngles] = useState({}) // Store custom pitch angles for each building
  const [occupancyFactor, setOccupancyFactor] = useState(41) // Default occupancy factor: 41 m² per occupant
  const [populationDropdownOpen, setPopulationDropdownOpen] = useState(false) // Control population estimation dropdown

  // Poll for progress updates
  useEffect(() => {
    if (!processingTask) return

    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/progress/${processingTask}`)
        if (response.ok) {
          const progressData = await response.json()
          setProgress(progressData)
          
          if (progressData.status === 'completed' && progressData.data) {
            console.log('Received completed data:', progressData.data)
            try {
              // Validate data structure
              if (progressData.data && typeof progressData.data === 'object') {
                setBuildingsData(progressData.data)
                setProcessingTask(null)
                // Close population dropdown when data is loaded
                setPopulationDropdownOpen(false)
              } else {
                console.error('Invalid data structure received:', progressData.data)
                setError('Invalid data structure received from backend')
                setProcessingTask(null)
              }
            } catch (err) {
              console.error('Error processing completed data:', err)
              setError('Error processing data from backend')
              setProcessingTask(null)
            }
          } else if (progressData.status === 'error') {
            console.error('Backend error:', progressData.message)
            setError(progressData.message)
            setProcessingTask(null)
          }
        }
      } catch (err) {
        console.error('Error polling progress:', err)
        setError('Failed to get progress updates')
        setProcessingTask(null)
      }
    }

    const interval = setInterval(pollProgress, 1000)
    return () => clearInterval(interval)
  }, [processingTask])

  const handlePolygonDrawn = async (coords) => {
    // Clear all data when polygon is deleted (coords is null)
    if (!coords) {
      setPolygonCoords(null);
      setError(null);
      setBuildingsData(null);
      setSelectedBuilding(null);
      setSelectedCategory(null);
      setProcessingTask(null);
      setProgress(null);
      setPopulationDropdownOpen(false); // Close dropdown when clearing data
      return;
    }

    setPolygonCoords(coords);
    setError(null);
    setBuildingsData(null);
    setSelectedBuilding(null);
    setSelectedCategory(null);
    setProgress(null);

    try {
      // Convert Leaflet coordinates to backend format
      const coordinates = coords.map(coord => [coord.lng, coord.lat]);
      
              const response = await fetch('/api/process-polygon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ coordinates })
      });

      if (response.ok) {
        const result = await response.json();
        setProcessingTask(result.task_id);
        setProgress(result);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to start processing');
      }
    } catch (err) {
      console.error('Error starting processing:', err);
      setError('Failed to connect to backend');
    }
  };

  const handleBuildingClick = (building) => {
    setSelectedBuilding(building);
  };

  // Function to calculate population for a residential building
  const calculatePopulation = (building) => {
    try {
      if (!building || !building.properties) {
        return null;
      }
      
      const properties = building.properties;
      const category = categorizeBuilding(properties.building || 'yes');
      
      // Only calculate for residential buildings with floor data
      if (category !== 'Residential' || !properties['building:levels'] || !properties['footprint_area_m2']) {
        return null;
      }
      
      const floors = parseFloat(properties['building:levels']);
      const footprintArea = parseFloat(properties['footprint_area_m2']);
      
      if (floors > 0 && footprintArea > 0) {
        const totalArea = footprintArea * floors;
        const population = Math.round(totalArea / occupancyFactor);
        return population;
      }
    } catch (error) {
      console.error('Error calculating population:', error);
    }
    
    return null;
  };

  // Function to update pitch angle for a building
  const updateBuildingPitchAngle = (buildingId, newPitchAngle) => {
    setBuildingPitchAngles(prev => ({
      ...prev,
      [buildingId]: newPitchAngle
    }));

    // Update the building's roof area in the buildingsData
    if (buildingsData && buildingsData.features) {
      const updatedFeatures = buildingsData.features.map(feature => {
        if (feature.properties.osm_id === buildingId) {
          const footprintArea = feature.properties.footprint_area_m2 || 0;
          const pitchAngle = newPitchAngle;
          
          // Calculate new roof area based on pitch angle
          const angleRad = (pitchAngle * Math.PI) / 180;
          const roofFactor = 1.0 + (0.15 * Math.tan(angleRad));
          const newRoofArea = Math.round(footprintArea * roofFactor * 100) / 100;
          
          return {
            ...feature,
            properties: {
              ...feature.properties,
              roof_area_m2: newRoofArea,
              custom_pitch_angle: pitchAngle
            }
          };
        }
        return feature;
      });

      setBuildingsData({
        ...buildingsData,
        features: updatedFeatures
      });

      // Update selected building if it's the one being modified
      if (selectedBuilding && selectedBuilding.properties.osm_id === buildingId) {
        const updatedBuilding = updatedFeatures.find(f => f.properties.osm_id === buildingId);
        if (updatedBuilding) {
          setSelectedBuilding(updatedBuilding);
        }
      }
    }
  };

  // Function to delete a building
  const deleteBuilding = (buildingId) => {
    if (!buildingsData || !buildingsData.features) return;

    const updatedFeatures = buildingsData.features.filter(
      feature => feature.properties.osm_id !== buildingId
    );

    setBuildingsData({
      ...buildingsData,
      features: updatedFeatures
    });

    // Clear selected building if it was the deleted one
    if (selectedBuilding && selectedBuilding.properties.osm_id === buildingId) {
      setSelectedBuilding(null);
    }

    // Remove pitch angle data for deleted building
    setBuildingPitchAngles(prev => {
      const newPitchAngles = { ...prev };
      delete newPitchAngles[buildingId];
      return newPitchAngles;
    });
  };

  // Function to export data as CSV
  const exportToCSV = () => {
    if (!buildingsData || !buildingsData.features || buildingsData.features.length === 0) {
      alert('No data to export');
      return;
    }

    // Get the filtered buildings based on selected category
    const buildingsToExport = selectedCategory ? 
      categorizedBuildings[selectedCategory] || [] : 
      buildingsData.features;

    if (buildingsToExport.length === 0) {
      alert('No buildings found for the selected category');
      return;
    }

    // Define CSV headers based on available properties
    const headers = [
      'OSM ID',
      'Name',
      'Building Type',
      'Category',
      'Height (m)',
      'Floors',
      'Footprint Area (m²)',
      'Roof Area (m²)',
      'Custom Pitch Angle (°)',
      'Estimated Population',
      'Occupancy Factor (m²/occupant)',
      'Flats',
      'Units',
      'Apartments',
      'Rooms',
      'Address',
      'Construction Year',
      'Material',
      'Energy Class',
      'Data Completeness (%)',
      'Data Sources',
      'Latitude',
      'Longitude'
    ];

    // Convert buildings to CSV rows
    const csvRows = buildingsToExport.map(building => {
      const props = building.properties;
      const coords = building.geometry?.coordinates?.[0]?.[0] || [0, 0]; // Get first coordinate for center
      
      return [
        props.osm_id || '',
        props.name || '',
        props.building || '',
        categorizeBuilding(props.building || 'yes'),
        props.height || '',
        props['building:levels'] || '',
        props['footprint_area_m2'] || '',
        props['roof_area_m2'] || '',
        props.custom_pitch_angle || buildingPitchAngles[props.osm_id] || '',
        calculatePopulation(building) || '',
        occupancyFactor,
        props['building:flats'] || '',
        props['building:units'] || '',
        props['building:apartments'] || '',
        props['building:rooms'] || '',
        [props['addr:housenumber'], props['addr:street'], props['addr:city']].filter(Boolean).join(', ') || '',
        props.year_built || props.year || props.built_year || props['building:year'] || '',
        props['building:material'] || '',
        props.energy_class || '',
        props.data_completeness || '',
        props.data_sources?.join(', ') || 'osm',
        coords[1] || '', // Latitude
        coords[0] || ''  // Longitude
      ];
    });

    // Combine headers and rows
    const csvContent = [headers, ...csvRows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // Generate filename with timestamp and category
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const categorySuffix = selectedCategory ? `-${selectedCategory.replace(/[^a-zA-Z0-9]/g, '')}` : '-All';
    const filename = `building-data${categorySuffix}-${timestamp}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to export data as JSON
  const exportToJSON = () => {
    if (!buildingsData || !buildingsData.features || buildingsData.features.length === 0) {
      alert('No data to export');
      return;
    }

    // Get the filtered buildings based on selected category
    const buildingsToExport = selectedCategory ? 
      categorizedBuildings[selectedCategory] || [] : 
      buildingsData.features;

    if (buildingsToExport.length === 0) {
      alert('No buildings found for the selected category');
      return;
    }

    // Create JSON object with metadata and buildings
    const jsonData = {
      metadata: {
        export_date: new Date().toISOString(),
        total_buildings: buildingsToExport.length,
        selected_category: selectedCategory || 'All',
        data_sources: buildingsData.metadata?.data_sources || ['osm'],
        avg_completeness: buildingsData.metadata?.avg_data_completeness || 0,
        custom_pitch_angles: buildingPitchAngles,
        occupancy_factor: occupancyFactor,
        population_estimation_enabled: true
      },
      buildings: buildingsToExport.map(building => ({
        ...building,
        properties: {
          ...building.properties,
          estimated_population: calculatePopulation(building),
          occupancy_factor_used: occupancyFactor
        }
      }))
    };

    // Convert to JSON string with pretty formatting
    const jsonContent = JSON.stringify(jsonData, null, 2);

    // Create and download the file
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // Generate filename with timestamp and category
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const categorySuffix = selectedCategory ? `-${selectedCategory.replace(/[^a-zA-Z0-9]/g, '')}` : '-All';
    const filename = `building-data${categorySuffix}-${timestamp}.json`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to get categorized buildings
  const getCategorizedBuildings = () => {
    if (!buildingsData || !buildingsData.features) return {};
    
    const categorized = {};
    
    buildingsData.features.forEach(building => {
      const buildingType = building.properties.building || 'yes';
      const category = categorizeBuilding(buildingType);
      
      if (!categorized[category]) {
        categorized[category] = [];
      }
      categorized[category].push(building);
    });
    
    return categorized;
  };

  // Function to get filtered buildings for display
  const getFilteredBuildings = () => {
    if (!buildingsData || !buildingsData.features) return { features: [] };
    
    if (!selectedCategory) {
      return buildingsData;
    }
    
    const filteredFeatures = buildingsData.features.filter(building => {
      const buildingType = building.properties.building || 'yes';
      const category = categorizeBuilding(buildingType);
      return category === selectedCategory;
    });
    
    return { ...buildingsData, features: filteredFeatures };
  };

  const BuildingDetails = ({ building, onPitchAngleChange, onDeleteBuilding, customPitchAngle }) => {
    if (!building) return null;

    const [pitchAngle, setPitchAngle] = useState(customPitchAngle || 12.5); // Default pitch angle
    const [isEditingPitch, setIsEditingPitch] = useState(false);

    // Update pitch angle when customPitchAngle prop changes
    useEffect(() => {
      if (customPitchAngle !== undefined) {
        setPitchAngle(customPitchAngle);
      }
    }, [customPitchAngle]);

    const properties = building.properties;
    const category = categorizeBuilding(properties.building || 'yes');
    
    // Helper function to render address section
    const renderAddressSection = () => {
      const addressParts = [
        properties['addr:housenumber'],
        properties['addr:street'],
        properties['addr:postcode'],
        properties['addr:city'],
        properties['addr:country']
      ].filter(part => part && part !== '');
      
      if (addressParts.length === 0) return null;
      
      return (
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '10px', 
          borderRadius: '4px', 
          marginBottom: '15px',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px', fontWeight: 'bold' }}>
            📍 Address
          </div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {addressParts.join(', ')}
          </div>
        </div>
      );
    };

    // Helper function to render construction info
    const renderConstructionSection = () => {
      const constructionData = [
        { key: 'year_built', label: 'Year Built' },
        { key: 'year', label: 'Year' },
        { key: 'built_year', label: 'Built Year' },
        { key: 'building:year', label: 'Building Year' },
        { key: 'start_date', label: 'Start Date' },
        { key: 'construction', label: 'Construction' }
      ];

      const validData = constructionData.filter(item => properties[item.key]);
      
      if (validData.length === 0) return null;
      
      return (
        <div style={{ 
          backgroundColor: '#fff3cd', 
          padding: '10px', 
          borderRadius: '4px', 
          marginBottom: '15px',
          border: '1px solid #ffeaa7'
        }}>
          <div style={{ fontSize: '12px', color: '#856404', marginBottom: '5px', fontWeight: 'bold' }}>
            🏗️ Construction
          </div>
          {validData.map(item => (
            <div key={item.key} style={{ fontSize: '13px', marginBottom: '3px' }}>
              <strong>{item.label}:</strong> {properties[item.key]}
            </div>
          ))}
        </div>
      );
    };

    // Helper function to render building characteristics
    const renderBuildingCharacteristics = () => {
      const characteristics = [
        { key: 'building:material', label: 'Material' },
        { key: 'building:structure', label: 'Structure' },
        { key: 'building:use', label: 'Use' },
        { key: 'building:condition', label: 'Condition' },
        { key: 'building:state', label: 'State' },
        { key: 'building:architecture', label: 'Architecture' }
      ];

      const validData = characteristics.filter(item => properties[item.key]);
      
      if (validData.length === 0) return null;
      
      return (
        <div style={{ 
          backgroundColor: '#d1ecf1', 
          padding: '10px', 
          borderRadius: '4px', 
          marginBottom: '15px',
          border: '1px solid #bee5eb'
        }}>
          <div style={{ fontSize: '12px', color: '#0c5460', marginBottom: '5px', fontWeight: 'bold' }}>
            🏛️ Characteristics
          </div>
          {validData.map(item => (
            <div key={item.key} style={{ fontSize: '13px', marginBottom: '3px' }}>
              <strong>{item.label}:</strong> {properties[item.key]}
            </div>
          ))}
        </div>
      );
    };

    // Helper function to render energy properties
    const renderEnergyProperties = () => {
      const energyData = [
        { key: 'building:insulation', label: 'Insulation' },
        { key: 'building:heating', label: 'Heating' },
        { key: 'building:cooling', label: 'Cooling' },
        { key: 'building:ventilation', label: 'Ventilation' }
      ];

      const validData = energyData.filter(item => properties[item.key]);
      
      if (validData.length === 0) return null;
      
      return (
        <div style={{ 
          backgroundColor: '#d4edda', 
          padding: '10px', 
          borderRadius: '4px', 
          marginBottom: '15px',
          border: '1px solid #c3e6cb'
        }}>
          <div style={{ fontSize: '12px', color: '#155724', marginBottom: '5px', fontWeight: 'bold' }}>
            ⚡ Energy Properties
          </div>
          {validData.map(item => (
            <div key={item.key} style={{ fontSize: '13px', marginBottom: '3px' }}>
              <strong>{item.label}:</strong> {properties[item.key]}
            </div>
          ))}
        </div>
      );
    };

    // Helper function to render additional tags
    const renderAdditionalTags = () => {
      const tags = [
        { key: 'landuse', label: 'Land Use' },
        { key: 'amenity', label: 'Amenity' },
        { key: 'shop', label: 'Shop' },
        { key: 'office', label: 'Office' },
        { key: 'leisure', label: 'Leisure' },
        { key: 'tourism', label: 'Tourism' },
        { key: 'historic', label: 'Historic' }
      ];

      const validTags = tags.filter(item => properties[item.key]);
      
      if (validTags.length === 0) return null;
      
      return (
        <div style={{ 
          backgroundColor: '#e2e3e5', 
          padding: '10px', 
          borderRadius: '4px', 
          marginBottom: '15px',
          border: '1px solid #d6d8db'
        }}>
          <div style={{ fontSize: '12px', color: '#383d41', marginBottom: '5px', fontWeight: 'bold' }}>
            🏷️ Additional Tags
          </div>
          {validTags.map(item => (
            <div key={item.key} style={{ fontSize: '13px', marginBottom: '3px' }}>
              <strong>{item.label}:</strong> {properties[item.key]}
            </div>
          ))}
        </div>
      );
    };

    // Helper function to render additional height info
    const renderHeightDetails = () => {
      const heightData = [
        { key: 'roof:height', label: 'Roof Height' },
        { key: 'roof:levels', label: 'Roof Levels' },
        { key: 'min_height', label: 'Min Height' },
        { key: 'max_height', label: 'Max Height' }
      ];

      const validData = heightData.filter(item => properties[item.key]);
      
      if (validData.length === 0) return null;

  return (
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '10px', 
          borderRadius: '4px', 
          marginBottom: '15px',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px', fontWeight: 'bold' }}>
            📐 Height Details
          </div>
          {validData.map(item => (
            <div key={item.key} style={{ fontSize: '13px', marginBottom: '3px' }}>
              <strong>{item.label}:</strong> {properties[item.key]}{item.key.includes('height') ? 'm' : ''}
            </div>
          ))}
        </div>
      );
    };

    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '20px 20px 15px 20px',
          borderBottom: '1px solid #e9ecef'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ 
              margin: 0, 
              color: '#2c3e50',
              fontSize: '18px',
              fontWeight: '600'
            }}>
              {properties.name || `Building ${properties.osm_id || 'Unknown'}`}
            </h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                onClick={() => onDeleteBuilding(properties.osm_id)}
                style={{
                  background: '#dc3545',
                  border: 'none',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s ease',
                  fontWeight: '500'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#c82333'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#dc3545'}
                title="Delete this building from the selection"
              >
                🗑️ Delete
              </button>
              <button 
                onClick={() => setSelectedBuilding(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#6c757d',
                  padding: '0',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                ×
              </button>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div style={{ padding: '20px' }}>
          {/* Building Type */}
          <div style={{ 
            backgroundColor: getCategoryColor(category), 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '20px',
            fontSize: '14px',
            border: '1px solid rgba(0,0,0,0.1)'
          }}>
            <strong>Type:</strong> {properties.building || 'Unknown'}
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {category}
            </div>
          </div>

          {/* Pitch Angle Editor */}
          {properties['footprint_area_m2'] && (
            <div style={{ 
              backgroundColor: '#e8f4fd', 
              padding: '15px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              border: '1px solid #bee5eb'
            }}>
              <div style={{ 
                fontSize: '14px', 
                fontWeight: '600',
                color: '#0c5460',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                🏠 Roof Pitch Angle
              </div>
              <div style={{ 
                fontSize: '12px', 
                color: '#666',
                marginBottom: '12px',
                lineHeight: '1.4'
              }}>
                Adjust the roof pitch angle to recalculate roof area. Default: 12.5°
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="range"
                  min="0"
                  max="45"
                  step="0.5"
                  value={pitchAngle}
                  onChange={(e) => {
                    const newAngle = parseFloat(e.target.value);
                    setPitchAngle(newAngle);
                    onPitchAngleChange(properties.osm_id, newAngle);
                  }}
                  style={{
                    flex: '1',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#d1ecf1',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                />
                <div style={{ 
                  minWidth: '60px',
                  textAlign: 'center',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#0c5460'
                }}>
                  {pitchAngle}°
                </div>
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: '#666',
                marginTop: '8px',
                fontStyle: 'italic'
              }}>
                Roof area updates instantly as you adjust the angle
              </div>
            </div>
          )}
          
          {/* Address Section */}
          {renderAddressSection()}
          
          {/* Key Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            {properties['building:levels'] && (
              <div style={{ 
                backgroundColor: '#e3f2fd', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #bbdefb'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>🏢 Floors</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1976d2' }}>{properties['building:levels']}</div>
              </div>
            )}
            
            {properties.height && (
              <div style={{ 
                backgroundColor: '#e8f5e8', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #c8e6c9'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>📏 Height</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#388e3c' }}>{properties.height}m</div>
              </div>
            )}
            
            {properties['roof_area_m2'] && (
              <div style={{ 
                backgroundColor: '#fff8e1', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #ffecb3'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>🏠 Roof Area</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f57f17' }}>{properties['roof_area_m2']} m²</div>
              </div>
            )}
            
            {properties['footprint_area_m2'] && (
              <div style={{ 
                backgroundColor: '#f3e5f5', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #e1bee7'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>📐 Footprint</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#7b1fa2' }}>{properties['footprint_area_m2']} m²</div>
              </div>
            )}
            
            {properties['building:flats'] && (
              <div style={{ 
                backgroundColor: '#fff3e0', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #ffe0b2'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>🏠 Flats</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f57c00' }}>{properties['building:flats']}</div>
              </div>
            )}
            
            {properties['building:units'] && (
              <div style={{ 
                backgroundColor: '#fce4ec', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #f8bbd9'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>🏘️ Units</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#c2185b' }}>{properties['building:units']}</div>
              </div>
            )}
            
            {properties['building:apartments'] && (
              <div style={{ 
                backgroundColor: '#e3f2fd', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #bbdefb'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>🏢 Apartments</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1976d2' }}>{properties['building:apartments']}</div>
              </div>
            )}
            
            {properties['building:rooms'] && (
              <div style={{ 
                backgroundColor: '#e8f5e8', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #c8e6c9'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>🚪 Rooms</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#388e3c' }}>{properties['building:rooms']}</div>
              </div>
            )}
            
            {calculatePopulation(building) && (
              <div style={{ 
                backgroundColor: '#e1f5fe', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #b3e5fc'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>👥 Estimated Population</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0277bd' }}>{calculatePopulation(building)}</div>
                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                  ({occupancyFactor} m²/occupant)
                </div>
              </div>
            )}
          </div>
          
          {/* Additional Height Info */}
          {renderHeightDetails()}
          
          {/* Construction Information */}
          {renderConstructionSection()}
          
          {/* Building Characteristics */}
          {renderBuildingCharacteristics()}
          
          {/* Energy Properties */}
          {renderEnergyProperties()}
          
          {/* Additional Tags */}
          {renderAdditionalTags()}
          
          {/* Energy Class and Consumption */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            {properties.energy_class && (
              <div style={{ 
                backgroundColor: '#d4edda', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #c3e6cb'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>⚡ Energy Class</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#155724' }}>{properties.energy_class}</div>
              </div>
            )}
            
            {properties.energy_consumption && (
              <div style={{ 
                backgroundColor: '#d4edda', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #c3e6cb'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>🔋 Consumption</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#155724' }}>{properties.energy_consumption} kWh/m²</div>
              </div>
            )}
          </div>
          
          {/* Technical Information */}
          <div style={{ 
            borderTop: '1px solid #e9ecef', 
            paddingTop: '15px', 
            marginTop: '15px',
            backgroundColor: '#f8f9fa',
            padding: '15px',
            borderRadius: '8px'
          }}>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: '600',
              color: '#2c3e50',
              marginBottom: '10px'
            }}>
              🔧 Technical Details
            </div>
            {properties.data_sources && properties.data_sources.length > 0 && (
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <strong>📊 Sources:</strong> {properties.data_sources.join(', ')}
              </div>
            )}
            
            {properties.data_completeness && (
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <strong>📈 Completeness:</strong> {properties.data_completeness}%
              </div>
            )}
            
            {properties.osm_id && (
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <strong>🏷️ OSM ID:</strong> {properties.osm_id}
              </div>
            )}
            
            {properties.census_section && (
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <strong>🏘️ Census:</strong> {properties.census_section}
              </div>
            )}
            
            {properties.ape_certification_date && (
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <strong>📋 APE Date:</strong> {properties.ape_certification_date}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const categorizedBuildings = getCategorizedBuildings();
  const filteredBuildingsData = getFilteredBuildings();

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }}>
      {/* Map Section - 70% */}
      <div style={{ 
        flex: '0 0 70%', 
        height: '100vh', 
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Map Container */}
        <div style={{ 
          flex: '1', 
          position: 'relative',
          minHeight: 0
        }}>
          <PolygonSelector 
            onPolygonDrawn={handlePolygonDrawn} 
            buildingsData={filteredBuildingsData}
            onBuildingClick={handleBuildingClick}
            selectedBuilding={selectedBuilding}
          />
          
          {/* Legend moved to bottom-left */}
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            zIndex: 1000,
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
            maxWidth: '280px'
          }}>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: '600',
              color: '#2c3e50',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              🏗️ Building Types
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Object.entries(categorizedBuildings).map(([category, buildings]) => (
                <div key={category} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      backgroundColor: getCategoryColor(category.replace(/[0-9️⃣]/g, '')),
                      borderRadius: '2px',
                      border: '1px solid rgba(0,0,0,0.1)'
                    }} />
                    <span style={{ color: '#495057' }}>{category.replace(/[0-9️⃣]/g, '')}</span>
                  </div>
                  <span style={{ 
                    color: '#6c757d',
                    fontWeight: '500',
                    fontSize: '11px'
                  }}>
                    {buildings.length}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Categories Section below map */}
        {buildingsData && Object.keys(categorizedBuildings).length > 0 && (
          <div style={{
            minHeight: '120px',
            backgroundColor: '#f8f9fa',
            borderTop: '2px solid #e9ecef',
            padding: '15px',
            flexShrink: 0
          }}>
            <div style={{ 
              fontSize: '16px', 
              fontWeight: '600',
              color: '#2c3e50',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              🏷️ Filter by Category
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '8px',
              width: '100%'
            }}>
              <button
                onClick={() => setSelectedCategory(null)}
                style={{
                  background: selectedCategory === null ? '#007bff' : '#ffffff',
                  color: selectedCategory === null ? 'white' : '#495057',
                  border: selectedCategory === null ? 'none' : '1px solid #dee2e6',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  boxShadow: selectedCategory === null ? '0 2px 4px rgba(0,123,255,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: '36px',
                  width: '100%'
                }}
              >
                <span>📍 All Categories</span>
                <span style={{ 
                  backgroundColor: selectedCategory === null ? 'rgba(255,255,255,0.2)' : '#e9ecef',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  minWidth: '20px',
                  textAlign: 'center'
                }}>
                  {buildingsData.features.length}
                </span>
              </button>
              {Object.entries(categorizedBuildings).map(([category, buildings]) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
                  style={{
                    background: selectedCategory === category ? '#007bff' : '#ffffff',
                    color: selectedCategory === category ? 'white' : '#495057',
                    border: selectedCategory === category ? 'none' : '1px solid #dee2e6',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    boxShadow: selectedCategory === category ? '0 2px 4px rgba(0,123,255,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '36px',
                    width: '100%'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{
                      width: '6px',
                      height: '6px',
                      backgroundColor: selectedCategory === category ? 'white' : getCategoryColor(category),
                      borderRadius: '50%'
                    }} />
                    <span>{category.replace(/[0-9️⃣]/g, '')}</span>
                  </div>
                  <span style={{ 
                    backgroundColor: selectedCategory === category ? 'rgba(255,255,255,0.2)' : '#e9ecef',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    minWidth: '20px',
                    textAlign: 'center'
                  }}>
                    {buildings.length}
                  </span>
        </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Information Panel - 30% */}
      <div style={{ 
        flex: '0 0 30%', 
        height: '100vh', 
        backgroundColor: '#f8f9fa',
        borderLeft: '2px solid #e9ecef',
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        minWidth: '350px',
        marginRight: '20px',
        boxSizing: 'border-box'
      }}>
        <div style={{ marginBottom: '20px', flexShrink: 0 }}>
          <h2 style={{ 
            margin: '0 0 10px 0', 
            color: '#2c3e50',
            fontSize: '24px',
            fontWeight: '600'
          }}>
            🏗️ Building Data
          </h2>
          <p style={{ 
            color: '#6c757d', 
            margin: '0',
            fontSize: '14px',
            lineHeight: '1.4'
          }}>
            Draw a polygon on the map to fetch building data. Click on buildings to see detailed information.
          </p>
        </div>

        {/* Occupancy Factor Input */}
        <div style={{
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '12px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          marginBottom: '15px',
          flexShrink: 0,
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div 
            style={{ 
              fontSize: '16px', 
              fontWeight: '600',
              color: '#2c3e50',
              marginBottom: populationDropdownOpen ? '10px' : '0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={() => setPopulationDropdownOpen(!populationDropdownOpen)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              👥 Population Estimation
            </div>
            <div style={{ 
              fontSize: '14px',
              color: '#6c757d',
              fontWeight: '500'
            }}>
              {occupancyFactor} m²/occupant
            </div>
            <div style={{
              fontSize: '18px',
              color: '#6c757d',
              transition: 'transform 0.2s ease',
              transform: populationDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'
            }}>
              ▼
            </div>
          </div>
          
          {populationDropdownOpen && (
            <div style={{ 
              borderTop: '1px solid #e9ecef',
              paddingTop: '15px',
              marginTop: '10px'
            }}>
              <div style={{ 
                fontSize: '13px', 
                color: '#6c757d',
                marginBottom: '15px',
                lineHeight: '1.4'
              }}>
                The building data generator has no access to census data. Please provide occupancy factor values so the application can provide an estimation of the population for each building.
              </div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: '10px',
                width: '100%'
              }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#495057',
                  whiteSpace: 'nowrap'
                }}>
                  Occupancy Factor:
                </label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  step="0.5"
                  value={occupancyFactor}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value > 0) {
                      setOccupancyFactor(value);
                    }
                  }}
                  style={{
                    flex: '1',
                    padding: '8px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#ced4da'}
                />
                <span style={{
                  fontSize: '14px',
                  color: '#6c757d',
                  whiteSpace: 'nowrap'
                }}>
                  m² per occupant
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Loading indicator when processing */}
        {processingTask && !buildingsData && (
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            textAlign: 'center',
            marginBottom: '20px',
            flexShrink: 0,
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <div style={{ 
              fontSize: '24px', 
              marginBottom: '10px',
              animation: 'spin 1s linear infinite'
            }}>
              🔄
            </div>
            <div style={{ 
              fontSize: '16px', 
              fontWeight: '600',
              color: '#2c3e50',
              marginBottom: '5px'
            }}>
              Processing buildings...
            </div>
            <div style={{ 
              fontSize: '14px', 
              color: '#6c757d'
            }}>
              {progress?.current_step || 'Initializing...'}
            </div>
            <div style={{ 
              marginTop: '15px',
              width: '100%', 
              height: '8px', 
              backgroundColor: '#e9ecef', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${progress?.progress || 0}%`,
                height: '100%',
                backgroundColor: '#007bff',
                transition: 'width 0.3s ease',
                borderRadius: '4px'
              }} />
            </div>
          </div>
        )}

        {/* Content Area */}
        <div style={{ flex: '1', overflowY: 'auto', minHeight: 0, width: '100%', boxSizing: 'border-box' }}>
          {/* Export Button */}
          {buildingsData && buildingsData.features && buildingsData.features.length > 0 && (
            <div style={{
              backgroundColor: 'white',
              padding: '15px',
              borderRadius: '12px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              marginBottom: '15px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <div style={{ 
                fontSize: '16px', 
                fontWeight: '600',
                color: '#2c3e50',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                📊 Export Data
              </div>
              <div style={{ 
                fontSize: '13px', 
                color: '#6c757d',
                marginBottom: '15px',
                lineHeight: '1.4'
              }}>
                Export {selectedCategory ? `${selectedCategory} buildings` : 'all buildings'} in your preferred format
              </div>
              <div style={{ 
                display: 'flex', 
                gap: '10px',
                width: '100%'
              }}>
                <button
                  onClick={exportToCSV}
                  style={{
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'background-color 0.2s ease',
                    flex: '1',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#218838'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#28a745'}
                >
                  📥 CSV
                  <span style={{ fontSize: '12px', opacity: '0.9' }}>
                    ({selectedCategory ? categorizedBuildings[selectedCategory]?.length || 0 : buildingsData.features.length})
                  </span>
                </button>
                <button
                  onClick={exportToJSON}
                  style={{
                    backgroundColor: '#17a2b8',
                    color: 'white',
                    border: 'none',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'background-color 0.2s ease',
                    flex: '1',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#138496'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#17a2b8'}
                >
                  📄 JSON
                  <span style={{ fontSize: '12px', opacity: '0.9' }}>
                    ({selectedCategory ? categorizedBuildings[selectedCategory]?.length || 0 : buildingsData.features.length})
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Building Details Panel */}
          {selectedBuilding ? (
            <BuildingDetails 
              building={selectedBuilding} 
              onPitchAngleChange={updateBuildingPitchAngle}
              onDeleteBuilding={deleteBuilding}
              customPitchAngle={buildingPitchAngles[selectedBuilding.properties.osm_id]}
            />
          ) : buildingsData ? (
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '12px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: '600',
                color: '#2c3e50',
                marginBottom: '15px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                📊 Data Summary
              </div>
              
              {/* Key Stats */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '12px',
                marginBottom: '20px'
              }}>
                <div style={{
                  backgroundColor: '#e3f2fd',
                  padding: '12px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  border: '1px solid #bbdefb'
                }}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1976d2' }}>
                    {buildingsData.features.length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Buildings</div>
                </div>
                
                <div style={{
                  backgroundColor: '#e8f5e8',
                  padding: '12px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  border: '1px solid #c8e6c9'
                }}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#388e3c' }}>
                    {buildingsData.metadata?.avg_data_completeness || 0}%
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Completeness</div>
                </div>
                
                {buildingsData.features.some(b => b.properties['roof_area_m2']) && (
                  <div style={{
                    backgroundColor: '#fff8e1',
                    padding: '12px',
                    borderRadius: '8px',
                    textAlign: 'center',
                    border: '1px solid #ffecb3'
                  }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f57f17' }}>
                      {Math.round(buildingsData.features.reduce((sum, b) => sum + (b.properties['roof_area_m2'] || 0), 0))}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Total Roof Area (m²)</div>
                  </div>
                )}
                
                {buildingsData.features.some(b => b.properties['footprint_area_m2']) && (
                  <div style={{
                    backgroundColor: '#f3e5f5',
                    padding: '12px',
                    borderRadius: '8px',
                    textAlign: 'center',
                    border: '1px solid #e1bee7'
                  }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#7b1fa2' }}>
                      {Math.round(buildingsData.features.reduce((sum, b) => sum + (b.properties['footprint_area_m2'] || 0), 0))}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Total Footprint (m²)</div>
                  </div>
                )}
                
                {buildingsData.features.some(b => calculatePopulation(b)) && (
                  <div style={{
                    backgroundColor: '#e1f5fe',
                    padding: '12px',
                    borderRadius: '8px',
                    textAlign: 'center',
                    border: '1px solid #b3e5fc'
                  }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0277bd' }}>
                      {buildingsData.features.reduce((sum, b) => sum + (calculatePopulation(b) || 0), 0)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Total Population</div>
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                      ({occupancyFactor} m²/occupant)
                    </div>
                  </div>
                )}
              </div>


            </div>
          ) : (
            <div style={{
              backgroundColor: 'white',
              padding: '40px 20px',
              borderRadius: '12px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              textAlign: 'center',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <div style={{ 
                fontSize: '48px', 
                marginBottom: '15px',
                opacity: '0.6'
              }}>
                🏗️
              </div>
              <div style={{ 
                fontSize: '16px', 
                color: '#6c757d',
                lineHeight: '1.4'
              }}>
                Draw a polygon on the map to start fetching building data
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div style={{ 
              backgroundColor: '#fff5f5',
              border: '1px solid #fed7d7',
              borderRadius: '8px',
              padding: '15px',
              marginTop: '20px',
              color: '#c53030',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <div style={{ 
                fontSize: '14px', 
                fontWeight: '600',
                marginBottom: '5px'
              }}>
                ⚠️ Error
              </div>
              <div style={{ fontSize: '13px' }}>
                {error}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App
