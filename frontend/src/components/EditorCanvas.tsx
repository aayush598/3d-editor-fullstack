'use client'

import { Canvas, ThreeEvent, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, TransformControls } from '@react-three/drei'
import { useSceneStore } from '@/stores/sceneStore'
import { memo, useRef, useState, useEffect } from 'react'
import { useGestureWebSocket } from '../../hooks/useGestureWebSocket'
import * as THREE from 'three'

function GestureRaycaster({
  meshRefs,
  cursorRay,
  onHoverChange,
}: {
  meshRefs: React.MutableRefObject<Record<string, THREE.Mesh>>
  cursorRay: { origin: number[], direction: number[] } | null
  onHoverChange: (id: string | null) => void
}) {
  const { scene } = useThree()

  useEffect(() => {
    if (!cursorRay) {
      onHoverChange(null)
      return
    }

    const raycaster = new THREE.Raycaster()
    const origin = new THREE.Vector3(...cursorRay.origin)
    const direction = new THREE.Vector3(...cursorRay.direction).normalize()
    raycaster.set(origin, direction)

    const meshObjects = Object.values(meshRefs.current).filter(Boolean)
    if (meshObjects.length === 0) {
      onHoverChange(null)
      return
    }

    const intersects = raycaster.intersectObjects(meshObjects)
    if (intersects.length > 0) {
      const closestMesh = intersects[0].object as THREE.Mesh
      const hoveredId = Object.entries(meshRefs.current).find(([_, mesh]) => mesh === closestMesh)?.[0]
      onHoverChange(hoveredId || null)
    } else {
      onHoverChange(null)
    }
  }, [cursorRay, meshRefs, scene, onHoverChange])

  return null
}

/** Cursor component for gesture-based selection */
function GestureCursor({ cursorRay }: { cursorRay: { origin: number[], direction: number[] } | null }) {
  const { scene, camera } = useThree()
  const cursorRef = useRef<THREE.Mesh>(null)
  
  useEffect(() => {
    if (!cursorRay || !cursorRef.current) return
    
    const raycaster = new THREE.Raycaster()
    const origin = new THREE.Vector3(...cursorRay.origin)
    const direction = new THREE.Vector3(...cursorRay.direction).normalize()
    
    raycaster.set(origin, direction)
    
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const intersectionPoint = new THREE.Vector3()
    raycaster.ray.intersectPlane(plane, intersectionPoint)
    
    if (intersectionPoint) {
      cursorRef.current.position.copy(intersectionPoint)
      cursorRef.current.visible = true
    }
  }, [cursorRay, scene, camera])
  
  if (!cursorRay) return null
  
  return (
    <mesh ref={cursorRef} position={[0, 0, 0]}>
      <sphereGeometry args={[0.1, 16, 16]} />
      <meshBasicMaterial color="red" transparent opacity={0.7} />
    </mesh>
  )
}

/** Primitive mesh component */
function PrimitiveMesh({
  id,
  type,
  position,
  isSelected,
  isHovered,
  onSelect,
  meshRef,
}: {
  id: string
  type: string
  position: [number, number, number]
  isSelected: boolean
  isHovered: boolean
  onSelect: (id: string) => void
  meshRef: React.Ref<THREE.Mesh>
}) {
  const commonProps = {
    position,
    castShadow: true,
    receiveShadow: true,
    ref: meshRef,
    onClick: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onSelect(id)
    },
  }

  let geometry
  switch (type) {
    case 'sphere':
      geometry = <sphereGeometry args={[0.5, 32, 32]} />
      break
    case 'plane':
      geometry = <planeGeometry args={[1, 1]} />
      break
    default:
      geometry = <boxGeometry args={[1, 1, 1]} />
      break
  }

  let color: string
  if (isSelected) color = 'yellow'
  else if (isHovered) color = 'lightblue'
  else {
    color = type === 'sphere' ? 'skyblue' : type === 'plane' ? 'lightgreen' : 'orange'
  }

  return (
    <mesh {...commonProps}>
      {geometry}
      <meshStandardMaterial
        color={color}
        wireframe={isSelected}
      />
    </mesh>
  )
}

const MemoPrimitiveMesh = memo(PrimitiveMesh)

/** Editor Canvas with gesture control integration */
export default function EditorCanvas() {
  const objects = useSceneStore((s) => s.objects)
  const selectedId = useSceneStore((s) => s.selectedId)
  const selectObject = useSceneStore((s) => s.selectObject)
  const updateObjectPosition = useSceneStore((s) => s.updateObjectPosition)
  const undo = useSceneStore((s) => s.undo)
  const redo = useSceneStore((s) => s.redo)

  const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate')
  const [isGestureMode, setIsGestureMode] = useState(false)
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)

  // Initialize gesture WebSocket connection
  const {
    isConnected,
    gestureState,
    rightHand,
    getCursorRay,
    isPinching,
    isFist,
    isOpenPalm,
    isPointing,
    selectObject: gestureSelectObject
  } = useGestureWebSocket()

  // Auto-select hovered object when pointing with high confidence
  useEffect(() => {
    if (isGestureMode && rightHand && hoveredObjectId && isPointing('right')) {
      if (rightHand.gestureConfidence > 0.8 && hoveredObjectId !== selectedId) {
        selectObject(hoveredObjectId);
        console.log(`Auto-selected object: ${hoveredObjectId} via pointing gesture`);
      }
    }
  }, [hoveredObjectId, isPointing, rightHand, isGestureMode, selectedId, selectObject]);

  /** Keyboard shortcuts */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') undo()
      else if (e.ctrlKey && e.key.toLowerCase() === 'y') redo()
      if (e.key === 't') setMode('translate')
      if (e.key === 'r') setMode('rotate')
      if (e.key === 's') setMode('scale')
      if (e.key === 'g') setIsGestureMode(!isGestureMode)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [undo, redo, isGestureMode])

  /** Refs for meshes and groups */
  const meshRefs = useRef<Record<string, THREE.Mesh>>({})
  const groupRefs = useRef<Record<string, THREE.Group>>({})

  const cursorRay = getCursorRay('right')

  /** Enhanced gesture-based transformation logic */
  useEffect(() => {
    if (!isGestureMode || !rightHand || !selectedId) return;

    const selectedMesh = meshRefs.current[selectedId];
    if (!selectedMesh) return;

    const { movementData, gesture, gestureConfidence } = rightHand;
    
    if (!movementData || gestureConfidence < 0.6) return;

    // Apply transformations based on gesture and movement data
    switch (gesture) {
      case 'open_palm': // Translation
        if (movementData.positionMagnitude > 0.002) { // Lower threshold for better sensitivity
          const sensitivity = 5.0; // Increased sensitivity
          const deltaX = movementData.positionDelta.x * sensitivity;
          const deltaY = movementData.positionDelta.y * sensitivity;
          const deltaZ = movementData.positionDelta.z * sensitivity;
          
          selectedMesh.position.x += deltaX;
          selectedMesh.position.y += deltaY;
          selectedMesh.position.z += deltaZ;
          
          // Update store with new position
          const pos = selectedMesh.position;
          updateObjectPosition(selectedId, [pos.x, pos.y, pos.z]);
          
          console.log(`Translation applied: [${deltaX.toFixed(3)}, ${deltaY.toFixed(3)}, ${deltaZ.toFixed(3)}]`);
        }
        break;
        
      case 'fist': // Rotation
        if (movementData.movementMagnitude > 0.005) { // Lower threshold
          const rotationSensitivity = 3.0; // Increased sensitivity
          const deltaRoll = movementData.orientationDelta[0] * rotationSensitivity;
          const deltaPitch = movementData.orientationDelta[1] * rotationSensitivity;
          const deltaYaw = movementData.orientationDelta[2] * rotationSensitivity;
          
          selectedMesh.rotation.x += deltaPitch;
          selectedMesh.rotation.y += deltaYaw;
          selectedMesh.rotation.z += deltaRoll;
          
          console.log(`Rotation applied: [${deltaRoll.toFixed(3)}, ${deltaPitch.toFixed(3)}, ${deltaYaw.toFixed(3)}]`);
        }
        break;
        
      case 'pinch': // Scaling
        if (Math.abs(movementData.scaleFactor - 1.0) > 0.02) { // Lower threshold
          const currentScale = selectedMesh.scale.x;
          const scaleMultiplier = 1.0 + (movementData.scaleFactor - 1.0) * 2.0; // Amplify scale changes
          const newScale = Math.max(0.1, Math.min(5.0, currentScale * scaleMultiplier));
          selectedMesh.scale.setScalar(newScale);
          
          console.log(`Scale applied: ${scaleMultiplier.toFixed(3)} (new scale: ${newScale.toFixed(3)})`);
        }
        break;
    }

  }, [rightHand, isGestureMode, selectedId, updateObjectPosition]);

  /** Deselect when clicking empty space (only in mouse mode) */
  const handleBackgroundClick = () => {
    if (!isGestureMode) {
      selectObject(null)
    }
  }

  /** Recursive render for hierarchy */
  const renderObjects = (parentId: string | null) =>
    objects
      .filter((o) => (o.parentId ?? null) === parentId)
      .map((obj) => (
        <group
          key={obj.id}
          ref={(el) => {
            if (el) groupRefs.current[obj.id] = el
          }}
        >
          <MemoPrimitiveMesh
            id={obj.id}
            type={obj.type}
            position={obj.position}
            isSelected={obj.id === selectedId}
            isHovered={isGestureMode && obj.id === hoveredObjectId}
            onSelect={selectObject}
            meshRef={(el) => {
              if (el) meshRefs.current[obj.id] = el
            }}
          />
          {renderObjects(obj.id)}
        </group>
      ))

  return (
    <>
      {/* Enhanced Gesture Mode Status */}
      <div className="absolute top-4 right-4 z-10 bg-gray-800 text-white p-3 rounded">
        <div className="text-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>{isConnected ? 'Gesture Connected' : 'Gesture Disconnected'}</span>
          </div>
          
          <div className="mb-1">
            Mode: <strong>{isGestureMode ? 'Gesture' : 'Mouse'}</strong> (Press 'G' to toggle)
          </div>
          
          {isGestureMode && rightHand && (
            <div className="text-xs space-y-1">
              <div>Gesture: <strong>{rightHand.gesture}</strong></div>
              <div>Confidence: <strong>{(rightHand.gestureConfidence * 100).toFixed(0)}%</strong></div>
              <div>Transform: <strong>{mode}</strong></div>
              {hoveredObjectId && <div>Hovered: <strong>{hoveredObjectId.slice(0, 8)}</strong></div>}
              {selectedId && <div>Selected: <strong>{selectedId.slice(0, 8)}</strong></div>}
              
              {/* Enhanced Movement data visualization */}
              {rightHand.movementData && (
                <div className="mt-2 p-2 bg-gray-700 rounded text-xs space-y-1">
                  <div className="font-semibold text-green-400">Movement Data:</div>
                  <div>Overall Magnitude: <strong>{rightHand.movementData.movementMagnitude.toFixed(4)}</strong></div>
                  
                  {rightHand.gesture === 'open_palm' && (
                    <div className="space-y-1">
                      <div className="text-blue-300">Translation Mode:</div>
                      <div>Position Δ: [{rightHand.movementData.positionDelta.x.toFixed(3)}, {rightHand.movementData.positionDelta.y.toFixed(3)}, {rightHand.movementData.positionDelta.z.toFixed(3)}]</div>
                      <div>Magnitude: {rightHand.movementData.positionMagnitude.toFixed(4)}</div>
                    </div>
                  )}
                  
                  {rightHand.gesture === 'fist' && (
                    <div className="space-y-1">
                      <div className="text-orange-300">Rotation Mode:</div>
                      <div>Orient. Δ: [{rightHand.movementData.orientationDelta.map(v => v.toFixed(3)).join(', ')}]</div>
                    </div>
                  )}
                  
                  {rightHand.gesture === 'pinch' && (
                    <div className="space-y-1">
                      <div className="text-purple-300">Scale Mode:</div>
                      <div>Scale Factor: <strong>{rightHand.movementData.scaleFactor.toFixed(3)}x</strong></div>
                    </div>
                  )}
                  
                  <div>Δt: {rightHand.movementData.deltaTime.toFixed(3)}s</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Canvas
        shadows
        camera={{ position: [5, 5, 5], fov: 50 }}
        style={{ width: '100%', height: '100%' }}
        onPointerMissed={handleBackgroundClick}
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[5, 10, 5]}
          castShadow
          intensity={1}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <Grid args={[50, 50]} cellColor="gray" sectionColor="lightgray" infiniteGrid />

        {/* Gesture cursor visualization */}
        {isGestureMode && cursorRay && (
          <>
            <GestureRaycaster
              meshRefs={meshRefs}
              cursorRay={cursorRay}
              onHoverChange={setHoveredObjectId}
            />
            <GestureCursor cursorRay={cursorRay} />
          </>
        )}

        {/* Render hierarchical objects */}
        {renderObjects(null)}

        {/* TransformControls for selected object (disabled in gesture mode) */}
        {selectedId && meshRefs.current[selectedId] && !isGestureMode && (
          <TransformControls
            object={meshRefs.current[selectedId]}
            mode={mode}
            onObjectChange={() => {
              const mesh = meshRefs.current[selectedId]
              if (mesh) {
                const pos = mesh.position
                updateObjectPosition(selectedId, [pos.x, pos.y, pos.z])
              }
            }}
          />
        )}

        <OrbitControls makeDefault enabled={!isGestureMode} />
      </Canvas>
    </>
  )
}