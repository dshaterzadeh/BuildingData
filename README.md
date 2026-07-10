# Building Data Explorer

A fully client-side web application for analyzing building data from OpenStreetMap. Draw polygons on a map to fetch building information — heights, floors, footprint and roof areas, population estimates — and explore the results in 2D or as an orbitable 3D city view.

**Live app:** https://dshaterzadeh.github.io/BuildingData/

There is no server: the browser queries the Overpass API directly, assembles geometries (including multipolygon relations with courtyards), filters buildings to your polygon, and computes all derived metrics locally.

## Features

### Interactive map
- **Polygon drawing** — outline one or more areas to analyze
- **Category-colored buildings** — a colorblind-safe palette across 8 building categories
- **Click to inspect** — full property panel for any building
- **Map layers** — street, satellite, and terrain base maps

### 3D views
- **3D city view** — every fetched building extruded from its real footprint (courtyard holes included), orbitable and clickable
- **Per-building 3D preview** — close-up massing view in the details panel

### Analysis
- **Derived metrics** — geodesic footprint area, roof area (pitch-adjustable 0–45°), height estimated from floors when untagged, population estimates for residential buildings
- **Filtering** — by category and by metric (population, year, height, floors, footprint) with >, <, =, between operators
- **Export** — CSV or JSON of the filtered buildings, including customizations

## Quick start

### Prerequisites
- Node.js 18+

### Run locally

```bash
git clone https://github.com/dshaterzadeh/BuildingData.git
cd BuildingData
npm install
npm run dev        # http://localhost:5173
```

### Other commands

```bash
npm test           # vitest unit tests
npm run lint       # eslint (react-hooks rules enforced)
npm run build      # production build in dist/
```

### Docker

```bash
docker compose up -d --build    # serves the built app at http://localhost:8081
```

## Architecture

Single-page React app, no backend:

- **React 18 + Vite** — UI and build tooling
- **React Leaflet + Leaflet Draw** — map, polygon drawing
- **@react-three/fiber + drei** — 3D building extrusions
- **osmtogeojson** — assembles OSM elements into GeoJSON (handles multipolygon relations with holes)
- **@turf/turf** — geodesic areas, centroid-in-polygon filtering

Data flow: drawn polygon → Overpass API query (with mirror fallback) → osmtogeojson → filter to polygon → enrich with derived properties → render on map / 3D.

## Project structure

```
BuildingData/
├── src/
│   ├── App.jsx                 # Application shell, state, filters, export
│   ├── PolygonSelector.jsx     # Leaflet map, drawing, building layer
│   ├── Buildings3DView.jsx     # 3D city view (all buildings)
│   ├── Building3DPreview.jsx   # Per-building 3D card
│   ├── BuildingDetails.jsx     # Property panel
│   ├── osmService.js           # Overpass fetch + enrichment (ex-backend logic)
│   ├── buildingUtils.js        # Categories, palette, filters, estimates
│   ├── buildingGeometry.js     # Ring extraction, projection, heights
│   ├── buildingShapes.js       # GeoJSON → THREE shapes with holes
│   └── *.test.js               # vitest suites
└── .github/workflows/
    ├── ci.yml                  # lint + test + build on push/PR
    └── deploy-pages.yml        # builds and deploys to GitHub Pages
```

## Deployment

Every push to `main` triggers the **Deploy to GitHub Pages** workflow, which builds the app with the `/BuildingData/` base path and publishes it to GitHub Pages. No configuration needed beyond pushing.

## Data notes

- Building data comes from **OpenStreetMap** via the Overpass API; completeness varies by region.
- Heights: real `height` tags are preferred; otherwise estimated as floors × 3 m and marked "estimated".
- Population: residential buildings only, `floors × footprint / occupancy factor` (default 41 m²/occupant, adjustable in Estimation Settings).
- Roof area: footprint × pitch factor, adjustable globally or per building.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

- **OpenStreetMap** contributors for the building data
- **Leaflet**, **React**, and **three.js** ecosystems
