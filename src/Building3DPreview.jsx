import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Edges, Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { getBuildingHeight, getStats } from './buildingGeometry.js'
import { buildingShapes } from './buildingShapes.js'

function AutoFrame({ bounds, controlsRef }) {
  const { camera } = useThree()

  useEffect(() => {
    if (!bounds || !controlsRef.current) return

    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    bounds.getSize(size)
    bounds.getCenter(center)

    const largestDimension = Math.max(size.x, size.y, size.z, 12)
    const distance = largestDimension * 2.1

    camera.position.set(center.x + distance, center.y + distance * 0.8, center.z + distance)
    camera.near = Math.max(0.1, largestDimension / 100)
    camera.far = Math.max(500, largestDimension * 20)
    camera.updateProjectionMatrix()

    controlsRef.current.target.copy(center)
    controlsRef.current.update()
  }, [bounds, camera, controlsRef])

  return null
}

export default function Building3DPreview({ building, accentColor = '#1f7acb', pitchAngle = 12.5, globalPitchAngle = 12.5 }) {
  const controlsRef = useRef()
  const buildingName = building?.properties?.name || `Building ${building?.properties?.osm_id || 'Unknown'}`
  const effectivePitchAngle = typeof pitchAngle === 'number' ? pitchAngle : globalPitchAngle
  const stats = getStats(building?.properties, effectivePitchAngle)

  const geometryData = useMemo(() => {
    // All polygon parts including courtyard holes (multipolygon relations)
    const shapes = buildingShapes(building?.geometry)
    if (!shapes) return null

    const height = getBuildingHeight(building?.properties)
    const extrudeGeometry = new THREE.ExtrudeGeometry(shapes, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 2,
      steps: 1
    })

    extrudeGeometry.rotateX(-Math.PI / 2)
    extrudeGeometry.computeBoundingBox()

    return {
      geometry: extrudeGeometry,
      bounds: extrudeGeometry.boundingBox
    }
  }, [building])

  // Free GPU buffers when the geometry is replaced or the card unmounts
  useEffect(() => {
    const geometry = geometryData?.geometry
    return () => geometry?.dispose()
  }, [geometryData])

  return (
    <section className="building-3d-card">
      <div className="building-3d-header">
        <div>
          <div className="building-3d-title">3D building view</div>
          <div className="building-3d-subtitle">Real footprint extrusion for {buildingName}</div>
        </div>
        <div className="building-3d-subtitle">Orbit to inspect the massing</div>
      </div>

      <div className="building-3d-canvas">
        {geometryData?.geometry ? (
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [60, 48, 60], fov: 38, near: 0.1, far: 2000 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          >
            <color attach="background" args={['#eef4f8']} />
            <fog attach="fog" args={['#eef4f8', 90, 300]} />
            <ambientLight intensity={1.35} />
            <directionalLight position={[35, 65, 40]} intensity={2.3} castShadow />
            <directionalLight position={[-25, 18, -18]} intensity={0.8} />

            <Suspense fallback={null}>
              <mesh geometry={geometryData.geometry} castShadow receiveShadow>
                <meshStandardMaterial
                  color={accentColor}
                  roughness={0.72}
                  metalness={0.04}
                  emissive={accentColor}
                  emissiveIntensity={0.03}
                />
                <Edges color="#d8e2ee" scale={1.001} />
              </mesh>
            </Suspense>

            <Grid
              position={[0, 0, 0]}
              args={[240, 240]}
              cellSize={6}
              cellThickness={0.7}
              sectionSize={24}
              sectionThickness={1.1}
              fadeDistance={120}
              fadeStrength={1}
              infiniteGrid
              followCamera={false}
              sectionColor="#9fb3c8"
              cellColor="#d8e2ee"
            />

            <OrbitControls
              ref={controlsRef}
              makeDefault
              enableDamping
              dampingFactor={0.08}
              minPolarAngle={0.45}
              maxPolarAngle={1.35}
              minDistance={15}
              maxDistance={360}
            />

            <AutoFrame bounds={geometryData.bounds} controlsRef={controlsRef} />
          </Canvas>
        ) : (
          <div className="building-3d-empty">
            <strong>No footprint geometry returned for this building.</strong>
            <span>The 3D preview needs a polygon or multipolygon footprint from the backend.</span>
          </div>
        )}
      </div>

      <div className="building-3d-metrics">
        <div className="building-3d-metric">
          <div className="building-3d-metric-label">Height</div>
          <div className="building-3d-metric-value">{stats.height} m</div>
        </div>
        <div className="building-3d-metric">
          <div className="building-3d-metric-label">Floors</div>
          <div className="building-3d-metric-value">{stats.floors ?? '—'}</div>
        </div>
        <div className="building-3d-metric">
          <div className="building-3d-metric-label">Footprint</div>
          <div className="building-3d-metric-value">{stats.footprintArea ?? '—'} m²</div>
        </div>
        <div className="building-3d-metric">
          <div className="building-3d-metric-label">Roof pitch</div>
          <div className="building-3d-metric-value">{Math.round(effectivePitchAngle * 10) / 10}°</div>
        </div>
      </div>
    </section>
  )
}
