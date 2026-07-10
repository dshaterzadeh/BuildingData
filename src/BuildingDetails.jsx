import { useState, useEffect } from 'react';
import Building3DPreview from './Building3DPreview.jsx';
import { IconClose, IconTrash, IconExternal } from './Icons.jsx';
import {
  categorizeBuilding,
  getCategoryColor,
  formatBuildingType,
  calculateRoofArea,
  estimatePopulation
} from './buildingUtils.js';

// Generic key/value info section; rows with empty values are dropped and the
// whole section disappears when nothing is left.
function KvSection({ title, rows }) {
  const validRows = rows.filter(row => row.value !== null && row.value !== undefined && row.value !== '');
  if (validRows.length === 0) return null;

  return (
    <div className="kv-section">
      <div className="kv-section-title">{title}</div>
      <div className="kv-rows">
        {validRows.map(row => (
          <div key={row.key} className="kv-row">
            <span className="kv-key">{row.label}</span>
            <span className="kv-value">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const propRows = (properties, defs) =>
  defs.map(({ key, label, suffix = '' }) => ({
    key,
    label,
    value: properties[key] ? `${properties[key]}${suffix}` : null
  }));

function BuildingDetails({ building, onPitchAngleChange, onDeleteBuilding, onClose, customPitchAngle, globalPitchAngle, occupancyFactor }) {
  const [pitchAngle, setPitchAngle] = useState(customPitchAngle ?? globalPitchAngle ?? 12.5);

  // Keep the slider in sync when the per-building or global default changes
  useEffect(() => {
    if (customPitchAngle !== undefined) {
      setPitchAngle(customPitchAngle);
    } else if (globalPitchAngle !== undefined) {
      setPitchAngle(globalPitchAngle);
    }
  }, [customPitchAngle, globalPitchAngle]);

  if (!building) return null;

  const properties = building.properties;
  const category = categorizeBuilding(properties.building || 'yes');
  const population = estimatePopulation(building, occupancyFactor);
  const footprintArea = parseFloat(properties['footprint_area_m2']);
  const roofArea = Number.isFinite(footprintArea)
    ? Math.round(calculateRoofArea(footprintArea, pitchAngle) * 100) / 100
    : null;

  const addressParts = [
    properties['addr:housenumber'],
    properties['addr:street'],
    properties['addr:postcode'],
    properties['addr:city'],
    properties['addr:country']
  ].filter(part => part && part !== '');

  return (
    <section className="details-card">
      <div className="details-header">
        <h3 className="details-title">
          {properties.name || `Building ${properties.osm_id || 'Unknown'}`}
        </h3>
        <div className="details-actions">
          <button
            className="icon-button danger"
            onClick={() => onDeleteBuilding(properties.osm_id)}
            title="Remove this building from the selection"
          >
            <IconTrash size={15} />
          </button>
          <button className="icon-button" onClick={onClose} title="Close details">
            <IconClose size={15} />
          </button>
        </div>
      </div>

      <div className="details-body">
        <Building3DPreview
          building={building}
          accentColor={getCategoryColor(category)}
          pitchAngle={pitchAngle}
          globalPitchAngle={globalPitchAngle}
        />

        <div className="type-chip-row">
          <span className="type-chip" style={{ '--category-color': getCategoryColor(category) }}>
            <span className="category-filter-dot" />
            {formatBuildingType(properties.building) || 'Unknown'}
          </span>
          {formatBuildingType(properties.building) !== category && (
            <span className="type-chip-category">{category}</span>
          )}
        </div>

        {Number.isFinite(footprintArea) && (
          <div className="pitch-editor">
            <div className="pitch-editor-label">
              <span>Roof pitch angle</span>
              <span className="pitch-default">global default {globalPitchAngle}°</span>
            </div>
            <div className="pitch-editor-controls">
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
              />
              <span className="pitch-value">{pitchAngle}°</span>
            </div>
          </div>
        )}

        <KvSection
          title="Key metrics"
          rows={[
            { key: 'floors', label: 'Floors', value: properties['building:levels'] || null },
            {
              key: 'height',
              label: 'Height',
              value: properties.height
                ? <>{properties.height} m{properties.height_estimated && <span className="estimated-tag">estimated</span>}</>
                : null
            },
            { key: 'footprint', label: 'Footprint', value: Number.isFinite(footprintArea) ? `${properties['footprint_area_m2']} m²` : null },
            {
              key: 'roof',
              label: 'Roof area',
              value: roofArea !== null
                ? <>{roofArea} m²<span className="estimated-tag">estimated</span></>
                : null
            },
            { key: 'flats', label: 'Flats', value: properties['building:flats'] || null },
            { key: 'units', label: 'Units', value: properties['building:units'] || null },
            { key: 'apartments', label: 'Apartments', value: properties['building:apartments'] || null },
            { key: 'rooms', label: 'Rooms', value: properties['building:rooms'] || null },
            {
              key: 'population',
              label: 'Population',
              value: population
                ? <>{population} ({occupancyFactor} m²/occupant)<span className="estimated-tag">estimated</span></>
                : null
            }
          ]}
        />

        {addressParts.length > 0 && (
          <KvSection
            title="Address"
            rows={[{ key: 'address', label: 'Location', value: addressParts.join(', ') }]}
          />
        )}

        <KvSection
          title="Height details"
          rows={propRows(properties, [
            { key: 'roof:height', label: 'Roof height', suffix: ' m' },
            { key: 'roof:levels', label: 'Roof levels' },
            { key: 'min_height', label: 'Min height', suffix: ' m' },
            { key: 'max_height', label: 'Max height', suffix: ' m' }
          ])}
        />

        <KvSection
          title="Construction"
          rows={propRows(properties, [
            { key: 'year_built', label: 'Year built' },
            { key: 'year', label: 'Year' },
            { key: 'built_year', label: 'Built year' },
            { key: 'building:year', label: 'Building year' },
            { key: 'start_date', label: 'Start date' },
            { key: 'construction', label: 'Construction' }
          ])}
        />

        <KvSection
          title="Characteristics"
          rows={propRows(properties, [
            { key: 'building:material', label: 'Material' },
            { key: 'building:structure', label: 'Structure' },
            { key: 'building:use', label: 'Use' },
            { key: 'building:condition', label: 'Condition' },
            { key: 'building:state', label: 'State' },
            { key: 'building:architecture', label: 'Architecture' }
          ])}
        />

        <KvSection
          title="Energy"
          rows={[
            ...propRows(properties, [
              { key: 'energy_class', label: 'Energy class' },
              { key: 'energy_consumption', label: 'Consumption', suffix: ' kWh/m²' },
              { key: 'building:insulation', label: 'Insulation' },
              { key: 'building:heating', label: 'Heating' },
              { key: 'building:cooling', label: 'Cooling' },
              { key: 'building:ventilation', label: 'Ventilation' }
            ])
          ]}
        />

        <KvSection
          title="Additional tags"
          rows={propRows(properties, [
            { key: 'landuse', label: 'Land use' },
            { key: 'amenity', label: 'Amenity' },
            { key: 'shop', label: 'Shop' },
            { key: 'office', label: 'Office' },
            { key: 'leisure', label: 'Leisure' },
            { key: 'tourism', label: 'Tourism' },
            { key: 'historic', label: 'Historic' }
          ])}
        />

        <KvSection
          title="Technical details"
          rows={[
            {
              key: 'sources',
              label: 'Sources',
              value: properties.data_sources && properties.data_sources.length > 0
                ? properties.data_sources.join(', ')
                : null
            },
            {
              key: 'osm_id',
              label: 'OSM ID',
              value: properties.osm_id
                ? (
                  <a
                    href={`https://www.openstreetmap.org/${properties.osm_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View this building on OpenStreetMap"
                  >
                    {properties.osm_id}
                    <IconExternal size={11} />
                  </a>
                )
                : null
            },
            { key: 'tag', label: 'OSM tag', value: properties.building || null },
            { key: 'census', label: 'Census section', value: properties.census_section || null },
            { key: 'ape', label: 'APE date', value: properties.ape_certification_date || null }
          ]}
        />
      </div>
    </section>
  );
}

export default BuildingDetails;
