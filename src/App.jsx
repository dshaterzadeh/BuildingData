import { useState, useEffect, useMemo } from 'react'
import PolygonSelector from './PolygonSelector.jsx'
import Buildings3DView from './Buildings3DView.jsx'
import BuildingDetails from './BuildingDetails.jsx'
import {
  categorizeBuilding,
  getCategoryColor,
  cleanCategoryLabel,
  getFeatureCenter,
  getYearBuilt,
  calculateRoofArea,
  estimatePopulation,
  matchesMetricsFilters,
  mergeBuildingData,
  escapeCsvValue
} from './buildingUtils.js'
import {
  IconMap,
  IconCube,
  IconFilter,
  IconDownload,
  IconClose,
  IconChevronDown,
  IconPolygon
} from './Icons.jsx'
import './App.css'

const EMPTY_METRICS_FILTERS = {
  population: { operator: 'greater_than', value1: '', value2: '' },
  year: { operator: 'greater_than', value1: '', value2: '' },
  height: { operator: 'greater_than', value1: '', value2: '' },
  floor: { operator: 'greater_than', value1: '', value2: '' },
  footprint: { operator: 'greater_than', value1: '', value2: '' }
}

const METRIC_FIELDS = [
  { key: 'population', label: 'Population' },
  { key: 'year', label: 'Year built' },
  { key: 'height', label: 'Height (m)' },
  { key: 'floor', label: 'Floors' },
  { key: 'footprint', label: 'Footprint (m²)' }
]

const OPERATOR_SYMBOLS = {
  greater_than: '>',
  less_than: '<',
  equal: '=',
  between: 'between'
}

function App() {
  const [polygonData, setPolygonData] = useState({}) // Store data for each polygon
  const [progress, setProgress] = useState(null)
  const [buildingsData, setBuildingsData] = useState(null)
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [selectedCategories, setSelectedCategories] = useState([])
  const [error, setError] = useState(null)
  const [buildingPitchAngles, setBuildingPitchAngles] = useState({}) // Custom pitch angles per building
  const [occupancyFactor, setOccupancyFactor] = useState(41) // m² per occupant
  const [globalPitchAngle, setGlobalPitchAngle] = useState(12.5) // degrees
  const [estimationSettingsOpen, setEstimationSettingsOpen] = useState(false)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [viewMode, setViewMode] = useState('map') // 'map' | '3d'

  // Advanced filtering state
  const [activeFilterTab, setActiveFilterTab] = useState('category') // 'category' | 'metrics'
  const [metricsFilters, setMetricsFilters] = useState(EMPTY_METRICS_FILTERS)
  const [appliedMetricsFilters, setAppliedMetricsFilters] = useState(null)

  const currentYear = new Date().getFullYear()

  // Check if there are any changes to apply
  const hasChanges = () => {
    if (!appliedMetricsFilters) {
      return Object.values(metricsFilters).some(filter => {
        if (filter.operator === 'between') {
          if (!filter.value1 || !filter.value2) return false
          const v1 = parseFloat(filter.value1)
          const v2 = parseFloat(filter.value2)
          return !isNaN(v1) && !isNaN(v2) && v1 <= v2
        }
        return filter.value1
      })
    }

    return Object.keys(metricsFilters).some(key => {
      const current = metricsFilters[key]
      const applied = appliedMetricsFilters[key]

      const valuesChanged = current.value1 !== applied.value1 ||
                           current.value2 !== applied.value2 ||
                           current.operator !== applied.operator

      if (!valuesChanged) return false

      if (current.operator === 'between') {
        if (!current.value1 || !current.value2) return false
        const v1 = parseFloat(current.value1)
        const v2 = parseFloat(current.value2)
        return !isNaN(v1) && !isNaN(v2) && v1 <= v2
      }

      return current.value1
    })
  }

  const hasAppliedFilters = () => {
    return appliedMetricsFilters && Object.values(appliedMetricsFilters).some(filter => filter.value1 || filter.value2)
  }

  const isBetweenValid = (filter) => {
    if (filter.operator !== 'between') return true
    if (!filter.value1 || !filter.value2) return false
    const v1 = parseFloat(filter.value1)
    const v2 = parseFloat(filter.value2)
    return !isNaN(v1) && !isNaN(v2) && v1 <= v2
  }

  const applyMetricsFilters = () => {
    setAppliedMetricsFilters({ ...metricsFilters })
  }

  const resetMetricsFilters = () => {
    setMetricsFilters(EMPTY_METRICS_FILTERS)
    setAppliedMetricsFilters(null)
  }

  const setMetricFilterValue = (metric, patch) => {
    setMetricsFilters(prev => ({
      ...prev,
      [metric]: { ...prev[metric], ...patch }
    }))
  }

  // Clamp typed values: non-negative, and years can't be in the future
  const coerceMetricValue = (metric, raw) => {
    let value = Math.max(0, parseFloat(raw) || 0)
    if (metric === 'year') value = Math.min(currentYear, value)
    return value.toString()
  }

  // Poll progress for every polygon that is still processing (several can be
  // in flight at once when the user draws multiple areas quickly)
  useEffect(() => {
    const processingEntries = Object.entries(polygonData)
      .filter(([, polygon]) => polygon.status === 'processing' && polygon.taskId)
    if (processingEntries.length === 0) return

    const pollProgress = async () => {
      const updates = {}
      let errorMessage = null

      for (const [polygonId, polygon] of processingEntries) {
        try {
          const response = await fetch(`/api/progress/${polygon.taskId}`)
          if (!response.ok) continue
          const progressData = await response.json()
          setProgress(progressData)

          if (progressData.status === 'completed') {
            if (progressData.data && typeof progressData.data === 'object') {
              updates[polygonId] = { ...polygon, status: 'completed', data: progressData.data }
            } else {
              console.error('Invalid data structure received:', progressData.data)
              errorMessage = 'Invalid data structure received from backend'
              updates[polygonId] = { ...polygon, status: 'error' }
            }
          } else if (progressData.status === 'error') {
            console.error('Backend error:', progressData.message)
            errorMessage = progressData.message || 'Processing failed'
            updates[polygonId] = { ...polygon, status: 'error' }
          }
        } catch (err) {
          console.error('Error polling progress:', err)
          errorMessage = 'Failed to get progress updates'
          updates[polygonId] = { ...polygon, status: 'error' }
        }
      }

      if (Object.keys(updates).length === 0) return

      const updatedPolygonData = { ...polygonData, ...updates }
      setPolygonData(updatedPolygonData)
      if (errorMessage) setError(errorMessage)

      const allCompletedData = Object.values(updatedPolygonData)
        .filter(polygon => polygon.status === 'completed' && polygon.data)
        .map(polygon => polygon.data)

      if (allCompletedData.length > 0) {
        setBuildingsData(mergeBuildingData(allCompletedData))
        setEstimationSettingsOpen(false)
      }
    }

    const interval = setInterval(pollProgress, 1000)
    return () => clearInterval(interval)
  }, [polygonData])

  // Auto-open filter drawer the first time building data arrives
  useEffect(() => {
    if (buildingsData && buildingsData.features && buildingsData.features.length > 0) {
      const hasDataBefore = localStorage.getItem('hasFilterData')
      if (!hasDataBefore) {
        setFilterDrawerOpen(true)
        localStorage.setItem('hasFilterData', 'true')
      }
    } else {
      localStorage.removeItem('hasFilterData')
    }
  }, [buildingsData])

  const handlePolygonDrawn = async (polygonsArray, polygonId = null) => {
    // Clear all data when polygons are deleted (polygonsArray is null)
    if (!polygonsArray) {
      if (polygonId) {
        const newData = { ...polygonData }
        delete newData[polygonId]
        setPolygonData(newData)

        const remainingPolygons = Object.values(newData).filter(p => p.status === 'completed' && p.data)
        if (remainingPolygons.length > 0) {
          setBuildingsData(mergeBuildingData(remainingPolygons.map(p => p.data)))
        } else {
          setBuildingsData(null)
          setSelectedBuilding(null)
          setSelectedCategories([])
        }
        return
      }

      setPolygonData({})
      setError(null)
      setBuildingsData(null)
      setSelectedBuilding(null)
      setSelectedCategories([])
      setProgress(null)
      setEstimationSettingsOpen(false)
      return
    }

    // Handle both single polygon (backward compatibility) and multiple polygons
    const polygons = Array.isArray(polygonsArray[0]) ? polygonsArray : [polygonsArray]

    if (!polygons || polygons.length === 0 || !polygons[0] || !Array.isArray(polygons[0])) {
      console.error('Invalid polygon data received:', polygonsArray)
      setError('Invalid polygon data')
      return
    }

    const currentPolygon = polygons[0]
    const currentPolygonId = polygonId || Date.now()

    setError(null)
    setSelectedBuilding(null)
    setSelectedCategories([])
    setProgress(null)

    try {
      const coordinates = currentPolygon.map(coord => {
        if (!coord || typeof coord.lng !== 'number' || typeof coord.lat !== 'number') {
          throw new Error('Invalid coordinate format')
        }
        return [coord.lng, coord.lat]
      })

      const response = await fetch('/api/process-polygon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ coordinates })
      })

      if (response.ok) {
        const result = await response.json()

        // Store (or replace) the tracking entry for this polygon; the polling
        // effect picks it up from its 'processing' status
        setPolygonData(prev => ({
          ...prev,
          [currentPolygonId]: {
            taskId: result.task_id,
            coords: currentPolygon,
            status: 'processing'
          }
        }))

        setProgress(result)
      } else {
        try {
          const errorData = await response.json()
          console.error('Backend error response:', errorData)

          let errorMessage = 'Failed to start processing'
          if (errorData.detail) {
            if (typeof errorData.detail === 'string') {
              errorMessage = errorData.detail
            } else if (Array.isArray(errorData.detail)) {
              errorMessage = errorData.detail.map(err => err.msg || 'Validation error').join(', ')
            } else if (typeof errorData.detail === 'object') {
              errorMessage = errorData.detail.msg || 'Validation error'
            }
          } else if (errorData.message) {
            errorMessage = errorData.message
          }

          setError(errorMessage)
        } catch (parseError) {
          console.error('Error parsing error response:', parseError)
          setError(`HTTP ${response.status}: Failed to start processing`)
        }
      }
    } catch (err) {
      console.error('Error starting processing:', err)
      setError('Failed to connect to backend')
    }
  }

  const handleBuildingClick = (building) => {
    setSelectedBuilding(building)
  }

  const calculatePopulation = (building) => estimatePopulation(building, occupancyFactor)

  const updateBuildingPitchAngle = (buildingId, newPitchAngle) => {
    setBuildingPitchAngles(prev => ({
      ...prev,
      [buildingId]: newPitchAngle
    }))

    if (buildingsData && buildingsData.features) {
      const updatedFeatures = buildingsData.features.map(feature => {
        if (feature.properties.osm_id === buildingId) {
          const footprintArea = feature.properties.footprint_area_m2 || 0
          const newRoofArea = Math.round(calculateRoofArea(footprintArea, newPitchAngle) * 100) / 100

          return {
            ...feature,
            properties: {
              ...feature.properties,
              roof_area_m2: newRoofArea,
              custom_pitch_angle: newPitchAngle
            }
          }
        }
        return feature
      })

      setBuildingsData({
        ...buildingsData,
        features: updatedFeatures
      })

      if (selectedBuilding && selectedBuilding.properties.osm_id === buildingId) {
        const updatedBuilding = updatedFeatures.find(f => f.properties.osm_id === buildingId)
        if (updatedBuilding) {
          setSelectedBuilding(updatedBuilding)
        }
      }
    }
  }

  const deleteBuilding = (buildingId) => {
    if (!buildingsData || !buildingsData.features) return

    const updatedFeatures = buildingsData.features.filter(
      feature => feature.properties.osm_id !== buildingId
    )

    setBuildingsData({
      ...buildingsData,
      features: updatedFeatures
    })

    if (selectedBuilding && selectedBuilding.properties.osm_id === buildingId) {
      setSelectedBuilding(null)
    }

    setBuildingPitchAngles(prev => {
      const newPitchAngles = { ...prev }
      delete newPitchAngles[buildingId]
      return newPitchAngles
    })
  }

  const buildExportFilename = (extension) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const categorySuffix = selectedCategories.length > 0
      ? `-${selectedCategories.map(cat => cat.replace(/[^a-zA-Z0-9]/g, '')).join('-')}`
      : '-All'
    return `building-data${categorySuffix}-${timestamp}.${extension}`
  }

  const downloadBlob = (content, mimeType, filename) => {
    const blob = new Blob([content], { type: mimeType })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const exportToCSV = () => {
    if (!buildingsData || !buildingsData.features || buildingsData.features.length === 0) {
      alert('No data to export')
      return
    }

    const buildingsToExport = filteredBuildingsData.features

    if (buildingsToExport.length === 0) {
      alert('No buildings found for the current filters')
      return
    }

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
    ]

    const csvRows = buildingsToExport.map(building => {
      const props = building.properties
      const center = getFeatureCenter(building) || [0, 0]

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
        getYearBuilt(props) || '',
        props['building:material'] || '',
        props.energy_class || '',
        props.data_sources?.join(', ') || 'osm',
        center[1] || '',
        center[0] || ''
      ]
    })

    const csvContent = [headers, ...csvRows]
      .map(row => row.map(escapeCsvValue).join(','))
      .join('\n')

    downloadBlob(csvContent, 'text/csv;charset=utf-8;', buildExportFilename('csv'))
  }

  const exportToJSON = () => {
    if (!buildingsData || !buildingsData.features || buildingsData.features.length === 0) {
      alert('No data to export')
      return
    }

    const buildingsToExport = filteredBuildingsData.features

    if (buildingsToExport.length === 0) {
      alert('No buildings found for the current filters')
      return
    }

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
    }

    downloadBlob(JSON.stringify(jsonData, null, 2), 'application/json;charset=utf-8;', buildExportFilename('json'))
  }

  // Buildings grouped by category (for the legend and filter buttons)
  const categorizedBuildings = useMemo(() => {
    if (!buildingsData || !buildingsData.features) return {}

    const categorized = {}

    buildingsData.features.forEach(building => {
      const buildingType = building.properties.building || 'yes'
      const category = categorizeBuilding(buildingType)

      if (!categorized[category]) {
        categorized[category] = []
      }
      categorized[category].push(building)
    })

    return categorized
  }, [buildingsData])

  // Buildings that pass the active category and metrics filters. Memoized so
  // the map layer only rebuilds when the data or filters actually change.
  const filteredBuildingsData = useMemo(() => {
    if (!buildingsData || !buildingsData.features) return { features: [] }

    let filteredFeatures = buildingsData.features

    if (selectedCategories.length > 0) {
      filteredFeatures = filteredFeatures.filter(building => {
        const buildingType = building.properties.building || 'yes'
        return selectedCategories.includes(categorizeBuilding(buildingType))
      })
    }

    if (appliedMetricsFilters) {
      filteredFeatures = filteredFeatures.filter(building =>
        matchesMetricsFilters(building, appliedMetricsFilters, occupancyFactor)
      )
    }

    return { ...buildingsData, features: filteredFeatures }
  }, [buildingsData, selectedCategories, appliedMetricsFilters, occupancyFactor])

  const processingPolygonCount = Object.values(polygonData).filter(p => p.status === 'processing').length
  const hasBuildings = Boolean(buildingsData && buildingsData.features && buildingsData.features.length > 0)

  const appliedMetricBadges = appliedMetricsFilters
    ? Object.entries(appliedMetricsFilters).filter(([, filter]) => filter.value1 || filter.value2)
    : []
  const activeFilterCount = selectedCategories.length + appliedMetricBadges.length

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-mark"><IconCube size={18} /></span>
          <div>
            <div className="app-title">Building Data Explorer</div>
            <div className="app-subtitle">OpenStreetMap building analytics</div>
          </div>
        </div>
        <div className="app-header-actions">
          {processingPolygonCount > 0 && (
            <span className="chip chip-accent">
              <span className="spinner" />
              Processing {Object.keys(polygonData).length > 1 ? `${Object.keys(polygonData).length} areas` : 'area'}
            </span>
          )}
          {hasBuildings && (
            <span className="chip">
              {filteredBuildingsData.features.length} of {buildingsData.features.length} buildings
            </span>
          )}
        </div>
      </header>

      <div className="app-main">
        <div className="map-section">
          <div className="map-container">
            <PolygonSelector
              onPolygonDrawn={handlePolygonDrawn}
              buildingsData={filteredBuildingsData}
              onBuildingClick={handleBuildingClick}
              selectedBuilding={selectedBuilding}
            />

            {viewMode === '3d' && (
              <div className="map-3d-overlay">
                <Buildings3DView
                  buildingsData={filteredBuildingsData}
                  selectedBuilding={selectedBuilding}
                  onBuildingClick={handleBuildingClick}
                />
              </div>
            )}

            {/* Map / 3D toggle */}
            <div className="map-view-toggle segmented">
              <button
                className={viewMode === 'map' ? 'active' : ''}
                onClick={() => setViewMode('map')}
              >
                <IconMap size={14} /> Map
              </button>
              <button
                className={viewMode === '3d' ? 'active' : ''}
                onClick={() => setViewMode('3d')}
              >
                <IconCube size={14} /> 3D
              </button>
            </div>

            {/* Legend (hidden while the filter drawer is open — the drawer
                shows the same categories with counts) */}
            {hasBuildings && !filterDrawerOpen && (
              <div className="legend">
                <div className="legend-title">Building types</div>
                <div className="legend-items">
                  {Object.entries(categorizedBuildings).map(([category, buildings]) => (
                    <div key={category} className="legend-item">
                      <div className="legend-item-content">
                        <div
                          className="legend-color"
                          style={{ backgroundColor: getCategoryColor(cleanCategoryLabel(category)) }}
                        />
                        <span className="legend-label">{cleanCategoryLabel(category)}</span>
                      </div>
                      <span className="legend-count">{buildings.length}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filter pill / drawer */}
            {hasBuildings && !filterDrawerOpen && (
              <div className="filter-pill-wrap">
                <button className="map-pill" onClick={() => setFilterDrawerOpen(true)}>
                  <IconFilter size={14} />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="filter-count-badge">{activeFilterCount}</span>
                  )}
                </button>
              </div>
            )}

            {hasBuildings && filterDrawerOpen && (
              <div className="filter-drawer">
                <div className="filter-drawer-header">
                  <div className="filter-drawer-title">
                    <IconFilter size={14} />
                    Filters
                  </div>
                  <div className="filter-tabs">
                    <button
                      className={activeFilterTab === 'category' ? 'active' : ''}
                      onClick={() => setActiveFilterTab('category')}
                    >
                      Category
                    </button>
                    <button
                      className={activeFilterTab === 'metrics' ? 'active' : ''}
                      onClick={() => setActiveFilterTab('metrics')}
                    >
                      Metrics
                    </button>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => setFilterDrawerOpen(false)}
                    title="Close filters"
                  >
                    <IconClose size={14} />
                  </button>
                </div>

                {activeFilterTab === 'category' && (
                  <div className="categories-grid">
                    <button
                      onClick={() => setSelectedCategories([])}
                      className={`category-filter-button ${selectedCategories.length === 0 ? 'selected' : ''}`}
                    >
                      <span>All categories</span>
                      <span className="category-filter-count">{buildingsData.features.length}</span>
                    </button>
                    {Object.entries(categorizedBuildings).map(([category, buildings]) => (
                      <button
                        key={category}
                        onClick={() => {
                          if (selectedCategories.includes(category)) {
                            setSelectedCategories(selectedCategories.filter(cat => cat !== category))
                          } else {
                            setSelectedCategories([...selectedCategories, category])
                          }
                        }}
                        className={`category-filter-button ${selectedCategories.includes(category) ? 'selected' : ''}`}
                        style={{ '--category-color': getCategoryColor(category) }}
                      >
                        <span className="category-filter-dot" />
                        <span>{cleanCategoryLabel(category)}</span>
                        <span className="category-filter-count">{buildings.length}</span>
                      </button>
                    ))}
                  </div>
                )}

                {activeFilterTab === 'metrics' && (
                  <div>
                    <div className="metrics-grid">
                      {METRIC_FIELDS.map(({ key, label }) => {
                        const filter = metricsFilters[key]
                        const invalid = !isBetweenValid(filter)
                        return (
                          <div key={key} className="metric-filter">
                            <div className="metric-filter-label">{label}</div>
                            <div className="metric-filter-controls">
                              <select
                                className="select-input"
                                value={filter.operator}
                                onChange={(e) => setMetricFilterValue(key, { operator: e.target.value })}
                              >
                                <option value="greater_than">Greater than</option>
                                <option value="less_than">Less than</option>
                                <option value="equal">Equal to</option>
                                <option value="between">Between</option>
                              </select>
                              <input
                                type="number"
                                min="0"
                                max={key === 'year' ? currentYear : undefined}
                                placeholder="Value"
                                className={`number-input ${invalid ? 'invalid' : ''}`}
                                value={filter.value1}
                                onChange={(e) => setMetricFilterValue(key, { value1: coerceMetricValue(key, e.target.value) })}
                              />
                              {filter.operator === 'between' && (
                                <>
                                  <span className="and">and</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max={key === 'year' ? currentYear : undefined}
                                    placeholder="Value"
                                    className={`number-input ${invalid ? 'invalid' : ''}`}
                                    value={filter.value2}
                                    onChange={(e) => setMetricFilterValue(key, { value2: coerceMetricValue(key, e.target.value) })}
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="metrics-actions">
                      <button
                        className="btn btn-sm"
                        onClick={resetMetricsFilters}
                        disabled={!hasAppliedFilters()}
                      >
                        Reset
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={applyMetricsFilters}
                        disabled={!hasChanges()}
                      >
                        Apply
                      </button>
                    </div>

                    {appliedMetricBadges.length > 0 && (
                      <div className="applied-filter-badges">
                        {appliedMetricBadges.map(([metric, filter]) => (
                          <span key={metric} className="applied-filter-badge">
                            <span className="badge-metric">{metric}</span>
                            <span>{OPERATOR_SYMBOLS[filter.operator] || filter.operator}</span>
                            <span>{filter.value1}{filter.value2 ? `–${filter.value2}` : ''}</span>
                            <button
                              onClick={() => {
                                const cleared = { operator: 'greater_than', value1: '', value2: '' }
                                setAppliedMetricsFilters(prev => ({ ...prev, [metric]: cleared }))
                                setMetricsFilters(prev => ({ ...prev, [metric]: cleared }))
                              }}
                              title="Remove filter"
                            >
                              <IconClose size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="info-panel">
          {/* Estimation settings */}
          <section className="panel-card">
            <button
              className="panel-card-toggle"
              onClick={() => setEstimationSettingsOpen(!estimationSettingsOpen)}
            >
              <span>Estimation settings</span>
              <span className={`toggle-caret ${estimationSettingsOpen ? 'open' : ''}`}>
                <IconChevronDown size={15} />
              </span>
            </button>

            {estimationSettingsOpen && (
              <div className="panel-card-body">
                <p className="panel-card-description">
                  Global defaults for population and roof-area estimates. Each building can
                  still be adjusted individually in its details panel.
                </p>
                <div className="setting-row">
                  <label htmlFor="occupancy-factor">Occupancy factor</label>
                  <input
                    id="occupancy-factor"
                    type="number"
                    min="1"
                    max="200"
                    step="0.5"
                    className="number-input"
                    value={occupancyFactor}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value)
                      if (!isNaN(value) && value > 0) {
                        setOccupancyFactor(value)
                      }
                    }}
                  />
                  <span className="setting-unit">m² / occupant</span>
                </div>
                <div className="setting-row">
                  <label htmlFor="global-pitch">Roof pitch angle</label>
                  <input
                    id="global-pitch"
                    type="number"
                    min="0"
                    max="45"
                    step="0.5"
                    className="number-input"
                    value={globalPitchAngle}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value)
                      if (!isNaN(value) && value >= 0 && value <= 45) {
                        setGlobalPitchAngle(value)
                      }
                    }}
                  />
                  <span className="setting-unit">degrees</span>
                </div>
              </div>
            )}
          </section>

          {/* Processing */}
          {processingPolygonCount > 0 && (
            <section className="panel-card">
              <div className="processing-title">
                <span className="spinner" />
                {Object.keys(polygonData).length > 1 ? 'Processing new area' : 'Processing buildings'}
              </div>
              <div className="processing-step">
                {progress?.current_step || 'Initializing…'}
                {Object.keys(polygonData).length > 1 && (
                  <span className="chip chip-accent">{Object.keys(polygonData).length} areas</span>
                )}
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress?.progress || 0}%` }} />
              </div>
            </section>
          )}

          {/* Export */}
          {hasBuildings && (
            <section className="panel-card">
              <h3 className="card-title">Export data</h3>
              <p className="card-subtext">
                Download the {filteredBuildingsData.features.length} buildings matching the current filters.
              </p>
              <div className="export-buttons">
                <button className="btn btn-primary" onClick={exportToCSV}>
                  <IconDownload size={14} />
                  CSV
                  <span className="btn-count">({filteredBuildingsData.features.length})</span>
                </button>
                <button className="btn" onClick={exportToJSON}>
                  <IconDownload size={14} />
                  JSON
                  <span className="btn-count">({filteredBuildingsData.features.length})</span>
                </button>
              </div>
            </section>
          )}

          {/* Details / summary / empty state */}
          {selectedBuilding ? (
            <BuildingDetails
              building={selectedBuilding}
              onPitchAngleChange={updateBuildingPitchAngle}
              onDeleteBuilding={deleteBuilding}
              onClose={() => setSelectedBuilding(null)}
              customPitchAngle={buildingPitchAngles[selectedBuilding.properties.osm_id]}
              globalPitchAngle={globalPitchAngle}
              occupancyFactor={occupancyFactor}
            />
          ) : hasBuildings ? (
            <section className="panel-card">
              <h3 className="card-title">Data summary</h3>
              <p className="card-subtext">
                Click a building on the map or in the 3D view to inspect it.
              </p>
              <div className="stat-grid">
                <div className="stat-tile">
                  <div className="stat-tile-value">{filteredBuildingsData.features.length}</div>
                  <div className="stat-tile-label">Buildings</div>
                </div>

                {buildingsData.features.some(b => b.properties['footprint_area_m2']) && (
                  <div className="stat-tile">
                    <div className="stat-tile-value">
                      {Math.round(filteredBuildingsData.features.reduce((sum, b) => sum + (b.properties['footprint_area_m2'] || 0), 0)).toLocaleString()}
                    </div>
                    <div className="stat-tile-label">Footprint (m²)</div>
                  </div>
                )}

                {buildingsData.features.some(b => b.properties['roof_area_m2']) && (
                  <div className="stat-tile">
                    <div className="stat-tile-value">
                      {Math.round(filteredBuildingsData.features.reduce((sum, b) => {
                        const footprintArea = b.properties['footprint_area_m2'] || 0
                        const pitchAngle = buildingPitchAngles[b.properties.osm_id] || globalPitchAngle
                        return sum + calculateRoofArea(footprintArea, pitchAngle)
                      }, 0)).toLocaleString()}
                    </div>
                    <div className="stat-tile-label">Roof area (m²)</div>
                    <div className="stat-tile-note">estimated</div>
                  </div>
                )}

                {buildingsData.features.some(b => calculatePopulation(b)) && (
                  <div className="stat-tile">
                    <div className="stat-tile-value">
                      {Math.round(filteredBuildingsData.features.reduce((sum, b) => sum + (calculatePopulation(b) || 0), 0)).toLocaleString()}
                    </div>
                    <div className="stat-tile-label">Population</div>
                    <div className="stat-tile-note">estimated, {occupancyFactor} m²/occupant</div>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="panel-card">
              <div className="empty-state">
                <span className="empty-state-icon"><IconPolygon size={20} /></span>
                <div className="empty-state-title">No area selected</div>
                <div className="empty-state-text">
                  Use the polygon tool in the top-right corner of the map to outline an area.
                  Building data is fetched automatically, and the 3D view lets you explore
                  the results as extruded footprints.
                </div>
              </div>
            </section>
          )}

          {/* Error */}
          {error && (
            <section className="panel-card error-card">
              <h3 className="card-title">Something went wrong</h3>
              <div className="error-message">{error}</div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

export default App
