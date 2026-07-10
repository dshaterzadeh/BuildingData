import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { getBuildingHeight } from './buildingGeometry.js'
import { buildingShapes } from './buildingShapes.js'
import { categorizeBuilding, getCategoryMapColor, getFeatureCenter } from './buildingUtils.js'

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
    const entries = []

    for (const feature of features) {
      // All polygon parts including courtyard holes (multipolygon relations)
      const shapes = buildingShapes(feature.geometry, origin)
      if (!shapes) continue

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

    return entries.length > 0 ? { entries, bounds } : null
  }, [buildingsData])

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

        {/* gridHelper (not drei's overlay Grid) so lines stay behind buildings */}
        <gridHelper args={[2400, 120, '#9aa6b1', '#c6cfd7']} position={[0, -0.05, 0]} />

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
    </div>
  )
}
