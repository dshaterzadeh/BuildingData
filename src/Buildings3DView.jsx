import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { getBuildingHeight } from './buildingGeometry.js'
import { buildingShapes } from './buildingShapes.js'
import { categorizeBuilding, getCategoryMapColor, getFeatureCenter } from './buildingUtils.js'

// --- Minimal basemap under the buildings -----------------------------------
// Standard slippy-map tile math (Web Mercator). Each tile is placed as its own
// plane by projecting its corner coordinates with the same equirectangular
// projection used for the building footprints, so map and buildings line up.
const LAT_SCALE = 111132.92

function lngToTileX(lng, zoom) {
  return ((lng + 180) / 360) * 2 ** zoom
}

function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom
}

function tileXToLng(x, zoom) {
  return (x / 2 ** zoom) * 360 - 180
}

function tileYToLat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

function tileUrl(x, y, zoom) {
  const subdomain = 'abcd'[(x + y) % 4]
  return `https://${subdomain}.basemaps.cartocdn.com/light_all/${zoom}/${x}/${y}@2x.png`
}

function GroundTile({ tile }) {
  const [texture, setTexture] = useState(null)

  useEffect(() => {
    let cancelled = false
    new THREE.TextureLoader().load(tile.url, (loaded) => {
      if (cancelled) {
        loaded.dispose()
        return
      }
      loaded.colorSpace = THREE.SRGBColorSpace
      loaded.anisotropy = 8
      setTexture(loaded)
    })
    return () => { cancelled = true }
  }, [tile.url])

  useEffect(() => () => texture?.dispose(), [texture])

  if (!texture) return null

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[tile.x, -0.12, tile.z]}>
      {/* unlit material so tile colors match the 2D map instead of the scene lights */}
      <planeGeometry args={[tile.width, tile.depth]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

function AutoFrame({ bounds, controlsRef }) {
  const { camera } = useThree()

  useEffect(() => {
    if (!bounds || bounds.isEmpty() || !controlsRef.current) return

    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    bounds.getSize(size)
    bounds.getCenter(center)

    const largestDimension = Math.max(size.x, size.z, 60)
    const distance = largestDimension * 1.55

    camera.position.set(center.x + distance * 0.7, center.y + distance * 0.75, center.z + distance * 0.7)
    camera.near = Math.max(0.5, largestDimension / 500)
    camera.far = Math.max(2000, largestDimension * 12)
    camera.updateProjectionMatrix()

    controlsRef.current.target.copy(center)
    controlsRef.current.update()
  }, [bounds, camera, controlsRef])

  return null
}

function BuildingMesh({ entry, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : ''
    return () => { document.body.style.cursor = '' }
  }, [hovered])

  return (
    <mesh
      geometry={entry.geometry}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation()
        onSelect(entry.feature)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <meshStandardMaterial
        color={entry.color}
        roughness={0.78}
        metalness={0.02}
        emissive={isSelected || hovered ? entry.color : '#000000'}
        emissiveIntensity={isSelected ? 0.55 : hovered ? 0.3 : 0}
      />
    </mesh>
  )
}

// Whole-area 3D view: every fetched building extruded from its real footprint,
// colored by category, clickable to open the details panel.
export default function Buildings3DView({ buildingsData, selectedBuilding, onBuildingClick }) {
  const controlsRef = useRef()

  const scene = useMemo(() => {
    const features = buildingsData?.features || []
    if (features.length === 0) return null

    // Shared origin so all footprints land in one local coordinate frame
    const centers = features.map(getFeatureCenter).filter(Boolean)
    if (centers.length === 0) return null
    const origin = {
      lng: centers.reduce((sum, c) => sum + c[0], 0) / centers.length,
      lat: centers.reduce((sum, c) => sum + c[1], 0) / centers.length
    }

    const bounds = new THREE.Box3()
    const geo = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity }
    const extendGeo = (coords) => {
      if (typeof coords[0] === 'number') {
        if (coords[0] < geo.minLng) geo.minLng = coords[0]
        if (coords[0] > geo.maxLng) geo.maxLng = coords[0]
        if (coords[1] < geo.minLat) geo.minLat = coords[1]
        if (coords[1] > geo.maxLat) geo.maxLat = coords[1]
      } else {
        coords.forEach(extendGeo)
      }
    }
    const entries = []

    for (const feature of features) {
      // All polygon parts including courtyard holes (multipolygon relations)
      const shapes = buildingShapes(feature.geometry, origin)
      if (!shapes) continue
      if (feature.geometry?.coordinates) extendGeo(feature.geometry.coordinates)

      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: getBuildingHeight(feature.properties),
        bevelEnabled: false,
        curveSegments: 1,
        steps: 1
      })
      geometry.rotateX(-Math.PI / 2)
      geometry.computeBoundingBox()
      bounds.union(geometry.boundingBox)

      entries.push({
        feature,
        geometry,
        color: getCategoryMapColor(categorizeBuilding(feature.properties?.building || 'yes')),
        id: feature.properties?.osm_id
      })
    }

    return entries.length > 0 ? { entries, bounds, origin, geo } : null
  }, [buildingsData])

  // Map tiles covering the fetched area plus a margin, at the highest zoom
  // that keeps the tile count reasonable
  const tiles = useMemo(() => {
    if (!scene || !Number.isFinite(scene.geo.minLng)) return []

    const { origin, geo } = scene
    const lngPad = Math.max((geo.maxLng - geo.minLng) * 0.4, 0.0015)
    const latPad = Math.max((geo.maxLat - geo.minLat) * 0.4, 0.0015)
    const west = geo.minLng - lngPad
    const east = geo.maxLng + lngPad
    const south = geo.minLat - latPad
    const north = geo.maxLat + latPad

    let zoom = 19
    let xMin, xMax, yMin, yMax
    for (; zoom >= 3; zoom--) {
      xMin = Math.floor(lngToTileX(west, zoom))
      xMax = Math.floor(lngToTileX(east, zoom))
      yMin = Math.floor(latToTileY(north, zoom))
      yMax = Math.floor(latToTileY(south, zoom))
      if ((xMax - xMin + 1) * (yMax - yMin + 1) <= 30) break
    }

    const lngScale = 111320 * Math.cos((origin.lat * Math.PI) / 180)
    const result = []
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const tileWest = tileXToLng(x, zoom)
        const tileEast = tileXToLng(x + 1, zoom)
        const tileNorth = tileYToLat(y, zoom)
        const tileSouth = tileYToLat(y + 1, zoom)
        result.push({
          url: tileUrl(x, y, zoom),
          width: (tileEast - tileWest) * lngScale,
          depth: (tileNorth - tileSouth) * LAT_SCALE,
          x: ((tileWest + tileEast) / 2 - origin.lng) * lngScale,
          z: -(((tileNorth + tileSouth) / 2 - origin.lat) * LAT_SCALE)
        })
      }
    }
    return result
  }, [scene])

  // Free GPU buffers when the scene is rebuilt or unmounted
  useEffect(() => {
    const entries = scene?.entries
    return () => entries?.forEach(entry => entry.geometry.dispose())
  }, [scene])

  if (!scene) {
    return (
      <div className="view-3d-empty">
        <div className="view-3d-empty-title">Nothing to show in 3D yet</div>
        <div className="view-3d-empty-text">
          Switch to Map view and draw a polygon to fetch buildings — they will appear here
          as extruded footprints you can orbit and click.
        </div>
      </div>
    )
  }

  const selectedId = selectedBuilding?.properties?.osm_id

  return (
    <div className="view-3d-canvas">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [220, 180, 220], fov: 40, near: 1, far: 5000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#eef1f4']} />
        <ambientLight intensity={1.15} />
        <directionalLight position={[180, 260, 140]} intensity={2.1} castShadow />
        <directionalLight position={[-120, 90, -100]} intensity={0.6} />

        {scene.entries.map((entry, index) => (
          <BuildingMesh
            key={entry.id ?? index}
            entry={entry}
            isSelected={selectedId != null && entry.id === selectedId}
            onSelect={onBuildingClick}
          />
        ))}

        {tiles.map((tile) => (
          <GroundTile key={tile.url} tile={tile} />
        ))}

        {/* transparent plane above the unlit map tiles so buildings still cast shadows */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
          <planeGeometry args={[2400, 2400]} />
          <shadowMaterial transparent opacity={0.22} />
        </mesh>

        {/* gridHelper (not drei's overlay Grid) so lines stay behind buildings */}
        <gridHelper args={[2400, 120, '#9aa6b1', '#c6cfd7']} position={[0, -0.2, 0]} />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={0.15}
          maxPolarAngle={1.45}
        />

        <AutoFrame bounds={scene.bounds} controlsRef={controlsRef} />
      </Canvas>

      {tiles.length > 0 && (
        <div className="view-3d-attribution">© OpenStreetMap contributors © CARTO</div>
      )}
    </div>
  )
}
