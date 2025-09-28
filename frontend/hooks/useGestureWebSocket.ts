import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface GestureData {
  deviceId: string
  timestamp: number
  cursorOrientation: [number, number, number]
  gesture: 'neutral' | 'pinch' | 'fist' | 'open_palm' | 'pointing'
  gestureConfidence: number
  transformMode: 'translate' | 'rotate' | 'scale' | 'cursor'
  actions: {
    selectAction: boolean
    modeSwitch: boolean
    confirmAction: boolean
  }
  movementData?: {
    orientationDelta: [number, number, number]
    positionDelta: { x: number, y: number, z: number }
    velocity: { x: number, y: number, z: number }
    scaleFactor: number
    orientation: [number, number, number]
    position: { x: number, y: number, z: number }
    movementMagnitude: number
    positionMagnitude: number
    deltaTime: number
    timestamp: number
  }
  rawSensorData: {
    imu: [number, number, number]
    position?: { x: number, y: number, z: number }
    fingerBends: Record<string, number>
    thumbBend: number
    palmPressure: number
  }
  metadata?: any
}

interface GestureState {
  leftHand: GestureData | null
  rightHand: GestureData | null
  selectedObject: string | null
  transformMode: string
}

export const useGestureWebSocket = (serverUrl: string = 'http://localhost:3001') => {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [gestureData, setGestureData] = useState<GestureData | null>(null)
  const [gestureState, setGestureState] = useState<GestureState>({
    leftHand: null,
    rightHand: null,
    selectedObject: null,
    transformMode: 'translate'
  })

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    })

    const socket = socketRef.current

    // Connection event handlers
    socket.on('connect', () => {
      console.log('✅ Connected to gesture control backend')
      setIsConnected(true)
    })

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from gesture control backend')
      setIsConnected(false)
    })

    socket.on('connect_error', (error) => {
      console.error('🚫 Connection error:', error.message)
      setIsConnected(false)
    })

    // Gesture data event handlers
    socket.on('gesture-update', (data: GestureData) => {
      setGestureData(data)
      
      // Update appropriate hand in state
      setGestureState(prev => ({
        ...prev,
        [data.deviceId.includes('left') ? 'leftHand' : 'rightHand']: data
      }))
    })

    socket.on('initial-state', (state: GestureState) => {
      console.log('📡 Received initial gesture state:', state)
      setGestureState(state)
    })

    socket.on('object-selected', (objectId: string) => {
      setGestureState(prev => ({ ...prev, selectedObject: objectId }))
    })

    socket.on('transform-mode-changed', (mode: string) => {
      setGestureState(prev => ({ ...prev, transformMode: mode }))
    })

    socket.on('calibration-complete', ({ deviceId }) => {
      console.log(`🎯 Calibration complete for ${deviceId}`)
    })

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [serverUrl])

  // Helper functions to send data to backend
  const selectObject = (objectId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('select-object', objectId)
    }
  }

  const changeTransformMode = (mode: 'translate' | 'rotate' | 'scale') => {
    if (socketRef.current) {
      socketRef.current.emit('transform-mode-change', mode)
    }
  }

  // Get cursor ray direction for 3D scene raycasting
  const getCursorRay = (hand: 'left' | 'right' = 'right') => {
    const handData = gestureState[`${hand}Hand`]
    if (!handData) return null

    return {
      origin: [0, 0, 0], // Camera position or hand position
      direction: handData.cursorOrientation
    }
  }

  // Check if a specific gesture is active
  const isGestureActive = (
    gesture: GestureData['gesture'], 
    hand: 'left' | 'right' = 'right',
    minConfidence: number = 0.7
  ) => {
    const handData = gestureState[`${hand}Hand`]
    return handData?.gesture === gesture && handData?.gestureConfidence >= minConfidence
  }

  return {
    isConnected,
    gestureData,
    gestureState,
    leftHand: gestureState.leftHand,
    rightHand: gestureState.rightHand,
    
    // Actions
    selectObject,
    changeTransformMode,
    
    // Helpers
    getCursorRay,
    isGestureActive,
    
    // Transform mode helpers
    isTranslateMode: () => gestureState.transformMode === 'translate',
    isRotateMode: () => gestureState.transformMode === 'rotate',
    isScaleMode: () => gestureState.transformMode === 'scale',
    
    // Gesture state helpers
    isPinching: (hand: 'left' | 'right' = 'right') => isGestureActive('pinch', hand),
    isFist: (hand: 'left' | 'right' = 'right') => isGestureActive('fist', hand),
    isOpenPalm: (hand: 'left' | 'right' = 'right') => isGestureActive('open_palm', hand),
    isPointing: (hand: 'left' | 'right' = 'right') => isGestureActive('pointing', hand),
  }
}