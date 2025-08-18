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
    'Healthcare': '#FF5722',
    'Industrial/Storage': '#A1887F',
    'Transport': '#FFC107',
    'Cultural/Public': '#8BC34A',
    'Tower': '#607D8B',
    'Other': '#f5f5f5',
    'Unknown': '#9E9E9E'
  };
  return colors[category] || '#f5f5f5';
};

// Function to format building type with proper capitalization
const formatBuildingType = (buildingType) => {
  if (!buildingType) return null;
  
  // Handle special cases
  const specialCases = {
    'large_building': 'Large building',
    'semidetached_house': 'Semi-detached house',
    'train_station': 'Train station',
    'sports_hall': 'Sports hall',
    'carport': 'Carport'
  };
  
  if (specialCases[buildingType]) {
    return specialCases[buildingType];
  }
  
  // For other cases, capitalize first letter and replace underscores with spaces
  return buildingType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

function App() {
  const [polygonCoords, setPolygonCoords] = useState(null)
  const [processingTask, setProcessingTask] = useState(null)
  const [progress, setProgress] = useState(null)
  const [buildingsData, setBuildingsData] = useState(null)
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [selectedCategories, setSelectedCategories] = useState([])
  const [error, setError] = useState(null)
  const [buildingPitchAngles, setBuildingPitchAngles] = useState({}) // Store custom pitch angles for each building
  const [occupancyFactor, setOccupancyFactor] = useState(41) // Default occupancy factor: 41 m² per occupant
  const [globalPitchAngle, setGlobalPitchAngle] = useState(12.5) // Default global pitch angle: 12.5°
  const [estimationSettingsOpen, setEstimationSettingsOpen] = useState(false) // Control estimation settings dropdown
  
  // Advanced filtering state
  const [activeFilterTab, setActiveFilterTab] = useState('category') // 'category' or 'metrics'
  const [metricsFilters, setMetricsFilters] = useState({
    population: { operator: 'greater_than', value1: '', value2: '' },
    year: { operator: 'greater_than', value1: '', value2: '' },
    height: { operator: 'greater_than', value1: '', value2: '' },
    floor: { operator: 'greater_than', value1: '', value2: '' },
    footprint: { operator: 'greater_than', value1: '', value2: '' }
  })
  const [appliedMetricsFilters, setAppliedMetricsFilters] = useState(null)

  // Helper: check if a building matches metrics filters (uses state above)
  const buildingMatchesMetricsFilters = (building) => {
    if (!appliedMetricsFilters) return true;
    const properties = building.properties;

    for (const [metric, filter] of Object.entries(appliedMetricsFilters)) {
      if (!filter.value1 && filter.operator !== 'equal') continue;

      let buildingValue;
      switch (metric) {
        case 'population': {
          const category = categorizeBuilding(properties.building || 'yes');
          if (category !== 'Residential' || !properties['building:levels'] || !properties['footprint_area_m2']) {
            buildingValue = null;
          } else {
            const floors = parseFloat(properties['building:levels']);
            const footprintArea = parseFloat(properties['footprint_area_m2']);
            if (floors > 0 && footprintArea > 0) {
              const totalArea = footprintArea * floors;
              buildingValue = Math.round(totalArea / occupancyFactor);
            }
          }
          break;
        }
        case 'year':
          buildingValue = properties.year_built || properties.year || properties.built_year || properties.building_year;
          break;
        case 'height':
          buildingValue = properties.height;
          break;
        case 'floor':
          buildingValue = properties['building:levels'];
          break;
        case 'footprint':
          buildingValue = properties['footprint_area_m2'];
          break;
        default:
          continue;
      }

      if (buildingValue === null || buildingValue === undefined || buildingValue === '') return false;
      const numValue = parseFloat(buildingValue);
      const v1 = parseFloat(filter.value1);
      const v2 = parseFloat(filter.value2);
      if (isNaN(numValue)) return false;

      switch (filter.operator) {
        case 'greater_than':
          if (isNaN(v1) || !(numValue > v1)) return false;
          break;
        case 'less_than':
          if (isNaN(v1) || !(numValue < v1)) return false;
          break;
        case 'equal':
          if (isNaN(v1) || numValue !== v1) return false;
          break;
        case 'between':
          if (isNaN(v1) || isNaN(v2) || numValue < v1 || numValue > v2) return false;
          break;
      }
    }

    return true;
  };

  const applyMetricsFilters = () => {
    setAppliedMetricsFilters({ ...metricsFilters });
  };

  const resetMetricsFilters = () => {
    const reset = {
      population: { operator: 'greater_than', value1: '', value2: '' },
      year: { operator: 'greater_than', value1: '', value2: '' },
      height: { operator: 'greater_than', value1: '', value2: '' },
      floor: { operator: 'greater_than', value1: '', value2: '' },
      footprint: { operator: 'greater_than', value1: '', value2: '' }
    };
    setMetricsFilters(reset);
    setAppliedMetricsFilters(null);
  };

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
                // Close estimation settings dropdown when data is loaded
                setEstimationSettingsOpen(false)
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
      setSelectedCategories([]);
      setProcessingTask(null);
      setProgress(null);
      setEstimationSettingsOpen(false); // Close dropdown when clearing data
      return;
    }

    setPolygonCoords(coords);
    setError(null);
    setBuildingsData(null);
    setSelectedBuilding(null);
          setSelectedCategories([]);
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

    // Get the filtered buildings based on current filters
    const buildingsToExport = buildingsData.features;

    if (buildingsToExport.length === 0) {
      alert('No buildings found for the current filters');
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
    
    // Generate filename with timestamp and categories
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const categorySuffix = selectedCategories.length > 0 ? 
      `-${selectedCategories.map(cat => cat.replace(/[^a-zA-Z0-9]/g, '')).join('-')}` : 
      '-All';
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

    // Get the filtered buildings based on current filters
    const buildingsToExport = buildingsData.features;

    if (buildingsToExport.length === 0) {
      alert('No buildings found for the current filters');
      return;
    }

    // Create JSON object with metadata and buildings
    const jsonData = {
      metadata: {
        export_date: new Date().toISOString(),
        total_buildings: buildingsToExport.length,
        selected_categories: selectedCategories.length > 0 ? selectedCategories : ['All'],
        data_sources: buildingsData.metadata?.data_sources || ['osm'],
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
    
    // Generate filename with timestamp and categories
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const categorySuffix = selectedCategories.length > 0 ? 
      `-${selectedCategories.map(cat => cat.replace(/[^a-zA-Z0-9]/g, '')).join('-')}` : 
      '-All';
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
    
    let filteredFeatures = buildingsData.features;
    
    console.log('getFilteredBuildings called');
    console.log('Selected categories:', selectedCategories);
    console.log('Applied metrics filters:', appliedMetricsFilters);
    
    // Apply category filters
    if (selectedCategories.length > 0) {
      filteredFeatures = filteredFeatures.filter(building => {
        const buildingType = building.properties.building || 'yes';
        const category = categorizeBuilding(buildingType);
        return selectedCategories.includes(category);
      });
      console.log('After category filtering:', filteredFeatures.length, 'buildings');
    }
    
    // Apply metrics filters
    if (appliedMetricsFilters) {
      const beforeMetrics = filteredFeatures.length;
      filteredFeatures = filteredFeatures.filter(building => 
        buildingMatchesMetricsFilters(building)
      );
      console.log('After metrics filtering:', filteredFeatures.length, 'buildings (was', beforeMetrics, ')');
    }
    
    return { ...buildingsData, features: filteredFeatures };
  };

  const BuildingDetails = ({ building, onPitchAngleChange, onDeleteBuilding, customPitchAngle, globalPitchAngle }) => {
    if (!building) return null;

    const [pitchAngle, setPitchAngle] = useState(customPitchAngle || globalPitchAngle || 12.5); // Use custom, then global, then default
    const [isEditingPitch, setIsEditingPitch] = useState(false);

    // Update pitch angle when customPitchAngle or globalPitchAngle prop changes
    useEffect(() => {
      if (customPitchAngle !== undefined) {
        setPitchAngle(customPitchAngle);
      } else if (globalPitchAngle !== undefined) {
        setPitchAngle(globalPitchAngle);
      }
    }, [customPitchAngle, globalPitchAngle]);

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
        <div style={{ padding: '20px', textAlign: 'center' }}>
          {/* Building Type */}
          <div style={{ 
            backgroundColor: getCategoryColor(category), 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '20px',
            fontSize: '14px',
            border: '1px solid rgba(0,0,0,0.1)'
          }}>
            <strong>Type:</strong> {formatBuildingType(properties.building) || 'Unknown'}
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
                gap: '8px',
                textAlign: 'center',
                justifyContent: 'center'
              }}>
                🏠 Roof Pitch Angle
              </div>
              <div style={{ 
                fontSize: '12px', 
                color: '#666',
                marginBottom: '8px',
                lineHeight: '1.4',
                textAlign: 'left'
              }}>
                Global default: {globalPitchAngle}°
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
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                  📏 Height
                  {properties.height_estimated && (
                    <span style={{ 
                      fontSize: '10px', 
                      color: '#ff9800', 
                      marginLeft: '4px',
                      backgroundColor: '#fff3e0',
                      padding: '2px 4px',
                      borderRadius: '3px',
                      fontWeight: 'normal'
                    }}>
                      estimated
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#388e3c' }}>{properties.height}m</div>
              </div>
            )}
            
            {properties['footprint_area_m2'] && (
              <div style={{ 
                backgroundColor: '#fff8e1', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #ffecb3'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>🏠 Roof Area</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f57f17' }}>
                  {(() => {
                    const footprintArea = properties['footprint_area_m2'];
                    const angleRad = (pitchAngle * Math.PI) / 180;
                    const roofFactor = 1.0 + (0.15 * Math.tan(angleRad));
                    return Math.round(footprintArea * roofFactor * 100) / 100;
                  })()} m²
                </div>
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
            

            
            {properties.osm_id && (
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <strong>🏷️ OSM ID:</strong>{' '}
                <a 
                  href={`https://www.openstreetmap.org/${properties.osm_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#007bff',
                    textDecoration: 'none',
                    fontWeight: '500',
                    borderBottom: '1px dotted #007bff',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.color = '#0056b3';
                    e.target.style.borderBottomColor = '#0056b3';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.color = '#007bff';
                    e.target.style.borderBottomColor = '#007bff';
                  }}
                  title="View this building on OpenStreetMap"
                >
                  {properties.osm_id}
                  <span style={{ marginLeft: '4px', fontSize: '11px' }}>🔗</span>
                </a>
              </div>
            )}
            
            {properties.building && (
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <strong>🏷️ Tag:</strong> {properties.building}
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
    <div className="app-container">
      {/* Map Section - 70% */}
      <div className="map-section">
        {/* Map Container */}
        <div className="map-container">
          <PolygonSelector 
            onPolygonDrawn={handlePolygonDrawn} 
            buildingsData={filteredBuildingsData}
            onBuildingClick={handleBuildingClick}
            selectedBuilding={selectedBuilding}
          />
          
          {/* Legend moved to bottom-left */}
          <div className="legend">
            <div className="legend-title">
              🏗️ Building Types
            </div>
            <div className="legend-items">
              {Object.entries(categorizedBuildings).map(([category, buildings]) => (
                <div key={category} className="legend-item">
                  <div className="legend-item-content">
                    <div 
                      className="legend-color"
                      style={{
                        backgroundColor: getCategoryColor(category.replace(/[0-9️⃣]/g, ''))
                      }}
                    />
                    <span className="legend-label">{category.replace(/[0-9️⃣]/g, '')}</span>
                  </div>
                  <span className="legend-count">
                    {buildings.length}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Advanced Filtering Section */}
        {buildingsData && Object.keys(categorizedBuildings).length > 0 && (
          <div className="categories-section">
            <div className="categories-title">
              🏷️ Filter by
            </div>
            
            {/* Tab Navigation */}
            <div style={{ 
              display: 'flex', 
              borderBottom: '1px solid #e0e0e0', 
              marginBottom: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px 8px 0 0'
            }}>
              <button
                onClick={() => setActiveFilterTab('category')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: 'none',
                  backgroundColor: activeFilterTab === 'category' ? '#007bff' : 'transparent',
                  color: activeFilterTab === 'category' ? 'white' : '#666',
                  fontWeight: activeFilterTab === 'category' ? '600' : '500',
                  cursor: 'pointer',
                  borderRadius: '8px 0 0 0',
                  transition: 'all 0.2s ease'
                }}
              >
                Category
              </button>
              <button
                onClick={() => setActiveFilterTab('metrics')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: 'none',
                  backgroundColor: activeFilterTab === 'metrics' ? '#007bff' : 'transparent',
                  color: activeFilterTab === 'metrics' ? 'white' : '#666',
                  fontWeight: activeFilterTab === 'metrics' ? '600' : '500',
                  cursor: 'pointer',
                  borderRadius: '0 8px 0 0',
                  transition: 'all 0.2s ease'
                }}
              >
                Metrics
              </button>
            </div>
            
            {/* Tab Content */}
            <div style={{ display: 'flex', gap: '20px' }}>
              {/* Left side - Filter content */}
              <div style={{ flex: 1 }}>
                {activeFilterTab === 'category' && (
                  <div className="categories-grid">
                    <button
                      onClick={() => setSelectedCategories([])}
                      className={`category-filter-button ${selectedCategories.length === 0 ? 'selected' : ''}`}
                    >
                      <span>📍 All Categories</span>
                      <span className="category-filter-count">
                        {buildingsData.features.length}
                      </span>
                    </button>
                    {Object.entries(categorizedBuildings).map(([category, buildings]) => (
                      <button
                        key={category}
                        onClick={() => {
                          if (selectedCategories.includes(category)) {
                            setSelectedCategories(selectedCategories.filter(cat => cat !== category));
                          } else {
                            setSelectedCategories([...selectedCategories, category]);
                          }
                        }}
                        className={`category-filter-button ${selectedCategories.includes(category) ? 'selected' : ''}`}
                        style={{
                          '--category-color': getCategoryColor(category)
                        }}
                      >
                        <div className="category-filter-button-content">
                          <div className="category-filter-dot" />
                          <span>{category.replace(/[0-9️⃣]/g, '')}</span>
                        </div>
                        <span className="category-filter-count">
                          {buildings.length}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                
                {activeFilterTab === 'metrics' && (
                  <div style={{ 
                    padding: '12px',
                    border: '1px solid #e0e0e0', 
                    borderRadius: '6px',
                    backgroundColor: '#fafafa',
                    minHeight: '200px'
                  }}>
                    {/* Filter Status Indicator */}
                    {appliedMetricsFilters && (
                      <div style={{ 
                        marginBottom: '15px',
                        padding: '8px 12px',
                        backgroundColor: '#e3f2fd',
                        border: '1px solid #2196f3',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#1976d2'
                      }}>
                        🔍 Filters Active: {Object.entries(appliedMetricsFilters)
                          .filter(([_, filter]) => filter.value1 || filter.value2)
                          .map(([metric, filter]) => `${metric} ${filter.operator} ${filter.value1}${filter.value2 ? `-${filter.value2}` : ''}`)
                          .join(', ')}
                      </div>
                    )}
                    
                    {/* Metrics Filters - 6-Section Layout */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                      {/* Population */}
                      <div style={{ 
                        border: '1px solid #e0e0e0', 
                        borderRadius: '6px', 
                        padding: '12px',
                        backgroundColor: '#fafafa'
                      }}>
                        <div style={{ 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          marginBottom: '8px',
                          color: '#333'
                        }}>
                          Population
                        </div>
                        
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={metricsFilters.population.operator}
                            onChange={(e) => {
                              setMetricsFilters(prev => ({
                                ...prev,
                                population: { ...prev.population, operator: e.target.value }
                              }));
                            }}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              fontSize: '12px',
                              width: metricsFilters.population.operator === 'between' ? '80px' : 
                                    metricsFilters.population.operator === 'greater_than' ? '110px' : '90px'
                            }}
                          >
                            <option value="greater_than">Greater than</option>
                            <option value="less_than">Less than</option>
                            <option value="equal">Equal to</option>
                            <option value="between">Between</option>
                          </select>
                          
                          <input
                            type="number"
                            placeholder="Value"
                            value={metricsFilters.population.value1}
                            onChange={(e) => {
                              setMetricsFilters(prev => ({
                                ...prev,
                                population: { ...prev.population, value1: e.target.value }
                              }));
                            }}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              fontSize: '12px',
                              width: '60px'
                            }}
                          />
                          
                          {metricsFilters.population.operator === 'between' && (
                            <>
                              <span style={{ fontSize: '11px', color: '#666' }}>and</span>
                              <input
                                type="number"
                                placeholder="Value"
                                value={metricsFilters.population.value2}
                                onChange={(e) => {
                                  setMetricsFilters(prev => ({
                                    ...prev,
                                    population: { ...prev.population, value2: e.target.value }
                                  }));
                                }}
                                style={{
                                  padding: '4px 6px',
                                  border: '1px solid #ddd',
                                  borderRadius: '3px',
                                  fontSize: '12px',
                                  width: '60px'
                                }}
                              />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Year */}
                      <div style={{ 
                        border: '1px solid #e0e0e0', 
                        borderRadius: '6px', 
                        padding: '12px',
                        backgroundColor: '#fafafa'
                      }}>
                        <div style={{ 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          marginBottom: '8px',
                          color: '#333'
                        }}>
                          Year
                        </div>
                        
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={metricsFilters.year.operator}
                            onChange={(e) => {
                              setMetricsFilters(prev => ({
                                ...prev,
                                year: { ...prev.year, operator: e.target.value }
                              }));
                            }}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              fontSize: '12px',
                              width: metricsFilters.year.operator === 'between' ? '80px' : 
                                    metricsFilters.year.operator === 'greater_than' ? '110px' : '90px'
                            }}
                          >
                            <option value="greater_than">Greater than</option>
                            <option value="less_than">Less than</option>
                            <option value="equal">Equal to</option>
                            <option value="between">Between</option>
                          </select>
                          
                          <input
                            type="number"
                            placeholder="Value"
                            value={metricsFilters.year.value1}
                            onChange={(e) => {
                              setMetricsFilters(prev => ({
                                ...prev,
                                year: { ...prev.year, value1: e.target.value }
                              }));
                            }}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              fontSize: '12px',
                              width: '60px'
                            }}
                          />
                          
                          {metricsFilters.year.operator === 'between' && (
                            <>
                              <span style={{ fontSize: '11px', color: '#666' }}>and</span>
                              <input
                                type="number"
                                placeholder="Value"
                                value={metricsFilters.year.value2}
                                onChange={(e) => {
                                  setMetricsFilters(prev => ({
                                    ...prev,
                                    year: { ...prev.year, value2: e.target.value }
                                  }));
                                }}
                                style={{
                                  padding: '4px 6px',
                                  border: '1px solid #ddd',
                                  borderRadius: '3px',
                                  fontSize: '12px',
                                  width: '60px'
                                }}
                              />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Height */}
                      <div style={{ 
                        border: '1px solid #e0e0e0', 
                        borderRadius: '6px', 
                        padding: '12px',
                        backgroundColor: '#fafafa'
                      }}>
                        <div style={{ 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          marginBottom: '8px',
                          color: '#333'
                        }}>
                          Height
                        </div>
                        
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={metricsFilters.height.operator}
                            onChange={(e) => {
                              setMetricsFilters(prev => ({
                                ...prev,
                                height: { ...prev.height, operator: e.target.value }
                              }));
                            }}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              fontSize: '12px',
                              width: metricsFilters.height.operator === 'between' ? '80px' : 
                                    metricsFilters.height.operator === 'greater_than' ? '110px' : '90px'
                            }}
                          >
                            <option value="greater_than">Greater than</option>
                            <option value="less_than">Less than</option>
                            <option value="equal">Equal to</option>
                            <option value="between">Between</option>
                          </select>
                          
                          <input
                            type="number"
                            placeholder="Value"
                            value={metricsFilters.height.value1}
                            onChange={(e) => {
                              setMetricsFilters(prev => ({
                                ...prev,
                                height: { ...prev.height, value1: e.target.value }
                              }));
                            }}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              fontSize: '12px',
                              width: '60px'
                            }}
                          />
                          
                          {metricsFilters.height.operator === 'between' && (
                            <>
                              <span style={{ fontSize: '11px', color: '#666' }}>and</span>
                              <input
                                type="number"
                                placeholder="Value"
                                value={metricsFilters.height.value2}
                                onChange={(e) => {
                                  setMetricsFilters(prev => ({
                                    ...prev,
                                    height: { ...prev.height, value2: e.target.value }
                                  }));
                                }}
                                style={{
                                  padding: '4px 6px',
                                  border: '1px solid #ddd',
                                  borderRadius: '3px',
                                  fontSize: '12px',
                                  width: '60px'
                                }}
                              />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Floor */}
                      <div style={{ 
                        border: '1px solid #e0e0e0', 
                        borderRadius: '6px', 
                        padding: '12px',
                        backgroundColor: '#fafafa'
                      }}>
                        <div style={{ 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          marginBottom: '8px',
                          color: '#333'
                        }}>
                          Floor
                        </div>
                        
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={metricsFilters.floor.operator}
                            onChange={(e) => {
                              setMetricsFilters(prev => ({
                                ...prev,
                                floor: { ...prev.floor, operator: e.target.value }
                              }));
                            }}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              fontSize: '12px',
                              width: metricsFilters.floor.operator === 'between' ? '80px' : 
                                    metricsFilters.floor.operator === 'greater_than' ? '110px' : '90px'
                            }}
                          >
                            <option value="greater_than">Greater than</option>
                            <option value="less_than">Less than</option>
                            <option value="equal">Equal to</option>
                            <option value="between">Between</option>
                          </select>
                          
                          <input
                            type="number"
                            placeholder="Value"
                            value={metricsFilters.floor.value1}
                            onChange={(e) => {
                              setMetricsFilters(prev => ({
                                ...prev,
                                floor: { ...prev.floor, value1: e.target.value }
                              }));
                            }}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              fontSize: '12px',
                              width: '60px'
                            }}
                          />
                          
                          {metricsFilters.floor.operator === 'between' && (
                            <>
                              <span style={{ fontSize: '11px', color: '#666' }}>and</span>
                              <input
                                type="number"
                                placeholder="Value"
                                value={metricsFilters.floor.value2}
                                onChange={(e) => {
                                  setMetricsFilters(prev => ({
                                    ...prev,
                                    floor: { ...prev.floor, value2: e.target.value }
                                  }));
                                }}
                                style={{
                                  padding: '4px 6px',
                                  border: '1px solid #ddd',
                                  borderRadius: '3px',
                                  fontSize: '12px',
                                  width: '60px'
                                }}
                              />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Footprint */}
                      <div style={{ 
                        border: '1px solid #e0e0e0', 
                        borderRadius: '6px', 
                        padding: '12px',
                        backgroundColor: '#fafafa'
                      }}>
                        <div style={{ 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          marginBottom: '8px',
                          color: '#333'
                        }}>
                          Footprint
                        </div>
                        
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={metricsFilters.footprint.operator}
                            onChange={(e) => {
                              setMetricsFilters(prev => ({
                                ...prev,
                                footprint: { ...prev.footprint, operator: e.target.value }
                              }));
                            }}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              fontSize: '12px',
                              width: metricsFilters.footprint.operator === 'between' ? '80px' : 
                                    metricsFilters.footprint.operator === 'greater_than' ? '110px' : '90px'
                            }}
                          >
                            <option value="greater_than">Greater than</option>
                            <option value="less_than">Less than</option>
                            <option value="equal">Equal to</option>
                            <option value="between">Between</option>
                          </select>
                          
                          <input
                            type="number"
                            placeholder="Value"
                            value={metricsFilters.footprint.value1}
                            onChange={(e) => {
                              setMetricsFilters(prev => ({
                                ...prev,
                                footprint: { ...prev.footprint, value1: e.target.value }
                              }));
                            }}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              fontSize: '12px',
                              width: '60px'
                            }}
                          />
                          
                          {metricsFilters.footprint.operator === 'between' && (
                            <>
                              <span style={{ fontSize: '11px', color: '#666' }}>and</span>
                              <input
                                type="number"
                                placeholder="Value"
                                value={metricsFilters.footprint.value2}
                                onChange={(e) => {
                                  setMetricsFilters(prev => ({
                                    ...prev,
                                    footprint: { ...prev.footprint, value2: e.target.value }
                                  }));
                                }}
                                style={{
                                  padding: '4px 6px',
                                  border: '1px solid #ddd',
                                  borderRadius: '3px',
                                  fontSize: '12px',
                                  width: '60px'
                                }}
                              />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <button
                          onClick={resetMetricsFilters}
                          style={{
                            padding: '4px 8px',
                            border: '1px solid #ddd',
                            borderRadius: '3px',
                            backgroundColor: '#f8f9fa',
                            color: '#666',
                            cursor: 'pointer',
                            fontSize: '11px',
                            flex: '1'
                          }}
                        >
                          Reset
                        </button>
                        <button
                          onClick={applyMetricsFilters}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: '3px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500',
                            flex: '1'
                          }}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              

            </div>
          </div>
        )}
      </div>

      {/* Information Panel - 30% */}
      <div className="info-panel">
        <div className="info-panel-header">
          <h2 className="info-panel-title">
            🏗️ Building Data
          </h2>
          <p className="info-panel-description">
            Draw a polygon on the map to fetch building data. Click on buildings to see detailed information.
          </p>
        </div>

        {/* Estimation Settings */}
        <div className="population-section">
          <div 
            className={`population-header ${estimationSettingsOpen ? 'open' : ''}`}
            onClick={() => setEstimationSettingsOpen(!estimationSettingsOpen)}
          >
            <div className="population-title">
              ⚙ Estimation Settings
            </div>
            <div className={`population-arrow ${estimationSettingsOpen ? 'open' : ''}`}>
              ▼
            </div>
          </div>
          
          {estimationSettingsOpen && (
            <div className="population-content">
              <div className="population-description">
                Configure global settings for population estimation and roof area calculations. Individual building settings can still be adjusted in the building details panel.
              </div>
              
              {/* Occupancy Factor Setting */}
              <div className="population-input-group" style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label className="population-label" style={{ minWidth: '140px', fontWeight: '500' }}>
                    👥 Occupancy Factor:
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
                    className="population-input"
                    style={{ width: '60px' }}
                  />
                  <span className="population-unit">
                    m² per occupant
                  </span>
                </div>
              </div>
              
              {/* Global Roof Pitch Angle Setting */}
              <div className="population-input-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label className="population-label" style={{ minWidth: '140px', fontWeight: '500' }}>
                    🏠 Roof Pitch Angle:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="45"
                    step="0.5"
                    value={globalPitchAngle}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value >= 0 && value <= 45) {
                        setGlobalPitchAngle(value);
                      }
                    }}
                    className="population-input"
                    style={{ width: '60px' }}
                  />
                  <span className="population-unit">
                    degrees
                  </span>
                </div>
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
        <div className="content-area">
          {/* Export Button */}
          {buildingsData && buildingsData.features && buildingsData.features.length > 0 && (
            <div className="export-section">
              <div className="export-title">
                📊 Export Data
              </div>
              <div className="export-description">
                Export {filteredBuildingsData.features.length} filtered buildings in your preferred format
              </div>
              <div className="export-buttons">
                <button
                  onClick={exportToCSV}
                  className="export-button"
                >
                  📥 CSV
                  <span className="export-count">
                    ({filteredBuildingsData.features.length})
                  </span>
                </button>
                <button
                  onClick={exportToJSON}
                  className="export-button json"
                >
                  📄 JSON
                  <span className="export-count">
                    ({filteredBuildingsData.features.length})
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
              globalPitchAngle={globalPitchAngle}
            />
          ) : buildingsData ? (
            <div className="data-summary">
              <div className="data-summary-title">
                📊 Data Summary
              </div>
              
              {/* Key Stats */}
              <div className="data-summary-grid">
                <div className="data-summary-card buildings">
                  <div className="data-summary-value buildings">
                    {filteredBuildingsData.features.length}
                  </div>
                  <div className="data-summary-label">Buildings</div>
                </div>
                
                {buildingsData.features.some(b => b.properties['roof_area_m2']) && (
                  <div className="data-summary-card roof">
                    <div className="data-summary-value roof">
                      {Math.round(filteredBuildingsData.features.reduce((sum, b) => {
                        const footprintArea = b.properties['footprint_area_m2'] || 0;
                        const pitchAngle = buildingPitchAngles[b.properties.osm_id] || globalPitchAngle;
                        const angleRad = (pitchAngle * Math.PI) / 180;
                        const roofFactor = 1.0 + (0.15 * Math.tan(angleRad));
                        return sum + (footprintArea * roofFactor);
                      }, 0))}
                    </div>
                    <div className="data-summary-label">Total Roof Area (m²)</div>
                  </div>
                )}
                
                {buildingsData.features.some(b => b.properties['footprint_area_m2']) && (
                  <div className="data-summary-card footprint">
                    <div className="data-summary-value footprint">
                      {Math.round(filteredBuildingsData.features.reduce((sum, b) => sum + (b.properties['footprint_area_m2'] || 0), 0))}
                    </div>
                    <div className="data-summary-label">Total Footprint (m²)</div>
                  </div>
                )}
                
                {buildingsData.features.some(b => calculatePopulation(b)) && (
                  <div className="data-summary-card population">
                    <div className="data-summary-value population">
                      {Math.round(filteredBuildingsData.features.reduce((sum, b) => sum + (calculatePopulation(b) || 0), 0))}
                    </div>
                    <div className="data-summary-label">Estimated Population</div>
                  </div>
                )}
              </div>


            </div>
          ) : (
            <div className="data-summary">
              <div style={{ 
                fontSize: '48px', 
                marginBottom: '15px',
                opacity: '0.6',
                textAlign: 'center'
              }}>
                🏗️
              </div>
              <div style={{ 
                fontSize: '16px', 
                color: '#6c757d',
                lineHeight: '1.4',
                textAlign: 'center'
              }}>
                Draw a polygon on the map to start fetching building data
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="error-section">
              <div className="error-title">
                ⚠️ Error
              </div>
              <div className="error-message">
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
