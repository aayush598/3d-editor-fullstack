const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store connected clients and current state
const connectedClients = new Set();
let currentGestureState = {
  leftHand: null,
  rightHand: null,
  selectedObject: null,
  transformMode: 'translate'
};

// Store previous frame data for movement calculation
const previousFrameData = new Map();

// Gesture classification thresholds
const GESTURE_THRESHOLDS = {
  FINGER_CLOSED: 0.7,
  FINGER_OPEN: 0.3,
  PINCH_THRESHOLD: 0.6,
  FIST_THRESHOLD: 0.7,
  PALM_PRESSURE: 0.5
};

/**
 * Calculate movement data between frames
 */
function calculateMovementData(currentData, previousData) {
  if (!previousData) {
    return {
      orientationDelta: [0, 0, 0],
      positionDelta: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      scaleFactor: 1.0,
      orientation: currentData.imu.orientation,
      position: currentData.position || { x: 0, y: 0, z: 0 },
      movementMagnitude: 0,
      positionMagnitude: 0,
      deltaTime: 0,
      timestamp: currentData.timestamp
    };
  }

  const deltaTime = (currentData.timestamp - previousData.timestamp) / 1000; // Convert to seconds
  const currentPos = currentData.position || { x: 0, y: 0, z: 0 };
  const prevPos = previousData.position || { x: 0, y: 0, z: 0 };

  // Calculate position deltas
  const positionDelta = {
    x: currentPos.x - prevPos.x,
    y: currentPos.y - prevPos.y,
    z: currentPos.z - prevPos.z
  };

  // Calculate velocity
  const velocity = deltaTime > 0 ? {
    x: positionDelta.x / deltaTime,
    y: positionDelta.y / deltaTime,
    z: positionDelta.z / deltaTime
  } : { x: 0, y: 0, z: 0 };

  // Calculate orientation deltas
  const orientationDelta = [
    currentData.imu.orientation[0] - previousData.imu.orientation[0],
    currentData.imu.orientation[1] - previousData.imu.orientation[1],
    currentData.imu.orientation[2] - previousData.imu.orientation[2]
  ];

  // Calculate movement magnitudes
  const positionMagnitude = Math.sqrt(
    positionDelta.x * positionDelta.x + 
    positionDelta.y * positionDelta.y + 
    positionDelta.z * positionDelta.z
  );

  const orientationMagnitude = Math.sqrt(
    orientationDelta[0] * orientationDelta[0] +
    orientationDelta[1] * orientationDelta[1] +
    orientationDelta[2] * orientationDelta[2]
  );

  const movementMagnitude = Math.max(positionMagnitude, orientationMagnitude);

  // Calculate scale factor for pinch gestures
  let scaleFactor = 1.0;
  if (currentData.fingers && previousData.fingers) {
    const currentPinchDistance = Math.abs(currentData.fingers.index - (currentData.thumb?.bend || 0.5));
    const prevPinchDistance = Math.abs(previousData.fingers.index - (previousData.thumb?.bend || 0.5));
    
    if (prevPinchDistance > 0) {
      scaleFactor = currentPinchDistance / prevPinchDistance;
      // Clamp scale factor to reasonable range
      scaleFactor = Math.max(0.5, Math.min(2.0, scaleFactor));
    }
  }

  return {
    orientationDelta,
    positionDelta,
    velocity,
    scaleFactor,
    orientation: currentData.imu.orientation,
    position: currentPos,
    movementMagnitude,
    positionMagnitude,
    deltaTime,
    timestamp: currentData.timestamp
  };
}

/**
 * Gesture Classification Logic
 */
function classifyGesture(sensorData) {
  const { fingers, thumb, palm } = sensorData;
  
  const closedFingers = Object.values(fingers).filter(bend => bend > GESTURE_THRESHOLDS.FINGER_CLOSED).length;
  const openFingers = Object.values(fingers).filter(bend => bend < GESTURE_THRESHOLDS.FINGER_OPEN).length;
  
  const isPinch = (
    fingers.index < GESTURE_THRESHOLDS.PINCH_THRESHOLD && 
    thumb.bend < GESTURE_THRESHOLDS.PINCH_THRESHOLD &&
    Math.abs(fingers.index - thumb.bend) < 0.2
  );
  
  const isFist = closedFingers >= 4;
  const isOpenPalm = openFingers >= 4;
  const isPointing = (
    fingers.index < GESTURE_THRESHOLDS.FINGER_OPEN && 
    fingers.middle > GESTURE_THRESHOLDS.FINGER_CLOSED &&
    fingers.ring > GESTURE_THRESHOLDS.FINGER_CLOSED
  );
  
  let gesture = 'neutral';
  if (isPinch) gesture = 'pinch';
  else if (isFist) gesture = 'fist';
  else if (isOpenPalm) gesture = 'open_palm';
  else if (isPointing) gesture = 'pointing';
  
  return {
    gesture,
    confidence: calculateConfidence(gesture, { fingers, thumb, palm }),
    details: { isPinch, isFist, isOpenPalm, isPointing, closedFingers, openFingers }
  };
}

function calculateConfidence(gesture, sensors) {
  let confidence = 0.5;
  
  switch(gesture) {
    case 'pinch':
      confidence = Math.max(0, 1 - Math.abs(sensors.fingers.index - sensors.thumb.bend) * 2);
      break;
    case 'fist':
      const avgBend = Object.values(sensors.fingers).reduce((a, b) => a + b, 0) / 5;
      confidence = Math.min(1, avgBend);
      break;
    case 'open_palm':
      const avgOpen = 1 - (Object.values(sensors.fingers).reduce((a, b) => a + b, 0) / 5);
      confidence = Math.min(1, avgOpen);
      break;
    case 'pointing':
      confidence = 1 - sensors.fingers.index + sensors.fingers.middle * 0.5;
      break;
  }
  
  return Math.max(0.1, Math.min(1, confidence));
}

function gestureToTransformMode(gesture) {
  const mapping = {
    'open_palm': 'translate',
    'fist': 'rotate',
    'pinch': 'scale',
    'pointing': 'cursor'
  };
  
  return mapping[gesture] || 'translate';
}

function normalizeCursorOrientation(imuData) {
  const { orientation } = imuData;
  const [roll, pitch, yaw] = orientation;
  
  const x = Math.sin(yaw) * Math.cos(pitch);
  const y = Math.sin(pitch);
  const z = Math.cos(yaw) * Math.cos(pitch);
  
  return [x, y, z];
}

/**
 * Process raw sensor data into actionable commands
 */
function processSensorData(rawData) {
  const { deviceId, imu, fingers, thumb, palm, switches } = rawData;
  
  // Get previous frame data for movement calculation
  const previousData = previousFrameData.get(deviceId);
  
  // Calculate movement data
  const movementData = calculateMovementData(rawData, previousData);
  
  // Store current data for next frame
  previousFrameData.set(deviceId, {
    ...rawData,
    timestamp: rawData.timestamp
  });
  
  const gestureResult = classifyGesture({ fingers, thumb, palm });
  const cursorOrientation = normalizeCursorOrientation(imu);
  const transformMode = gestureToTransformMode(gestureResult.gesture);
  
  const actions = {
    selectAction: switches.selectButton || false,
    modeSwitch: switches.modeButton || false,
    confirmAction: switches.confirmButton || false
  };
  
  return {
    deviceId,
    timestamp: Date.now(),
    cursorOrientation,
    gesture: gestureResult.gesture,
    gestureConfidence: gestureResult.confidence,
    transformMode,
    actions,
    movementData, // Now includes calculated movement data
    rawSensorData: {
      imu: imu.orientation,
      position: rawData.position,
      fingerBends: fingers,
      thumbBend: thumb.bend,
      palmPressure: palm.pressure || 0
    }
  };
}

// API Endpoints
app.post('/sensor-data', (req, res) => {
  try {
    const rawSensorData = req.body;
    
    if (!rawSensorData.deviceId || !rawSensorData.imu || !rawSensorData.fingers) {
      return res.status(400).json({ 
        error: 'Missing required sensor data fields',
        required: ['deviceId', 'imu', 'fingers', 'thumb', 'switches']
      });
    }
    
    const processedData = processSensorData(rawSensorData);
    
    // Update current state
    if (rawSensorData.deviceId.includes('left')) {
      currentGestureState.leftHand = processedData;
    } else {
      currentGestureState.rightHand = processedData;
    }
    
    // Broadcast to all connected frontend clients
    io.emit('gesture-update', processedData);
    
    // Enhanced logging
    console.log(`[${processedData.deviceId}] ${processedData.gesture} (${(processedData.gestureConfidence * 100).toFixed(0)}%) | Movement: ${processedData.movementData.movementMagnitude.toFixed(3)}`);
    
    res.json({ 
      status: 'success', 
      processedData: {
        gesture: processedData.gesture,
        transformMode: processedData.transformMode,
        confidence: processedData.gestureConfidence,
        movementMagnitude: processedData.movementData.movementMagnitude
      }
    });
    
  } catch (error) {
    console.error('Error processing sensor data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/current-state', (req, res) => {
  res.json({
    currentState: currentGestureState,
    connectedClients: connectedClients.size,
    timestamp: Date.now()
  });
});

app.post('/calibrate', (req, res) => {
  const { deviceId, calibrationData } = req.body;
  
  console.log(`Calibration received for ${deviceId}:`, calibrationData);
  io.emit('calibration-complete', { deviceId });
  
  res.json({ status: 'calibration-saved', deviceId });
});

// WebSocket Connection Handling
io.on('connection', (socket) => {
  console.log(`Frontend client connected: ${socket.id}`);
  connectedClients.add(socket.id);
  
  socket.emit('initial-state', currentGestureState);
  
  socket.on('select-object', (objectId) => {
    currentGestureState.selectedObject = objectId;
    console.log(`Object selected: ${objectId}`);
    socket.broadcast.emit('object-selected', objectId);
  });
  
  socket.on('transform-mode-change', (mode) => {
    currentGestureState.transformMode = mode;
    console.log(`Transform mode changed to: ${mode}`);
    socket.broadcast.emit('transform-mode-changed', mode);
  });
  
  socket.on('disconnect', () => {
    console.log(`Frontend client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    connectedClients: connectedClients.size
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Gesture Control Backend Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for frontend connections`);
  console.log(`🧤 Ready to receive sensor data from glove hardware`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  POST /sensor-data - Receive glove sensor data`);
  console.log(`  GET  /current-state - View current gesture state`);
  console.log(`  POST /calibrate - Sensor calibration`);
  console.log(`  GET  /health - Health check`);
});