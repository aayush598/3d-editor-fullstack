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

// Replace the gesture classification function with IMU-based pinch detection

function classifyGesture(sensorData) {
  const { imu, fingers, thumb, palm, switches } = sensorData;
  
  // Calculate hand orientation from IMU
  const [roll, pitch, yaw] = imu.orientation;
  
  // IMU-based pinch detection using thumb and index finger proximity
  // We'll use gyroscope magnitude to detect pinching motion
  const gyroMagnitude = Math.sqrt(
    imu.gyroscope[0] ** 2 + 
    imu.gyroscope[1] ** 2 + 
    imu.gyroscope[2] ** 2
  );
  
  // Calculate acceleration magnitude for motion detection
  const accelMagnitude = Math.sqrt(
    imu.acceleration[0] ** 2 + 
    imu.acceleration[1] ** 2 + 
    imu.acceleration[2] ** 2
  );
  
  // IMU-based pinch detection
  // Pinch is detected by specific orientation pattern and low gyro movement
  const thumbIndexDistance = calculateIMUBasedPinchDistance(imu, sensorData.position);
  const isPinching = thumbIndexDistance < 0.03 && gyroMagnitude < 0.5; // 3cm threshold
  
  // Pointing: index extended, stable orientation
  const indexExtended = fingers.index < 0.3;
  const othersRetracted = fingers.middle > 0.7 && fingers.ring > 0.7 && fingers.little > 0.7;
  const isPointing = indexExtended && othersRetracted && gyroMagnitude < 0.3;
  
  // Fist: high gyro activity or all fingers retracted
  const allRetracted = Object.values(fingers).every(bend => bend > 0.6);
  const isFist = (allRetracted || gyroMagnitude > 1.0) && !isPinching;
  
  // Open palm: all fingers extended, stable
  const allExtended = Object.values(fingers).every(bend => bend < 0.4);
  const isOpenPalm = allExtended && gyroMagnitude < 0.5 && !isPinching;
  
  // Determine gesture with confidence
  let gesture = 'neutral';
  let confidence = 0.5;
  
  if (isPinching) {
    gesture = 'pinch';
    confidence = Math.min(0.95, 0.7 + (0.03 - thumbIndexDistance) / 0.03 * 0.25);
  } else if (isPointing) {
    gesture = 'pointing';
    confidence = 0.85;
  } else if (isFist) {
    gesture = 'fist';
    confidence = Math.min(0.9, 0.6 + gyroMagnitude / 2.0 * 0.3);
  } else if (isOpenPalm) {
    gesture = 'open_palm';
    confidence = 0.8;
  }
  
  return { gesture, confidence };
}

// New function: Calculate pinch distance using IMU orientation and position
function calculateIMUBasedPinchDistance(imu, position) {
  // Use IMU orientation to estimate thumb-index distance
  // Pinching typically shows specific roll angle and reduced pitch variation
  const [roll, pitch, yaw] = imu.orientation;
  
  // When pinching, roll angle increases (thumb rotating toward index)
  // and gyroscope shows minimal movement
  const gyroMagnitude = Math.sqrt(
    imu.gyroscope[0] ** 2 + 
    imu.gyroscope[1] ** 2 + 
    imu.gyroscope[2] ** 2
  );
  
  // Estimate distance based on roll angle deviation from neutral
  // Neutral hand position: roll ≈ 0, pinched: roll increases
  const rollDeviation = Math.abs(roll);
  const pitchStability = 1.0 - Math.min(1.0, Math.abs(pitch) / (Math.PI / 4));
  
  // Distance decreases as roll increases and motion stabilizes
  const baseDistance = 0.05; // 5cm base distance
  const pinchFactor = Math.max(0, 1.0 - (rollDeviation / (Math.PI / 6))); // Roll up to 30° indicates pinch
  const stabilityFactor = Math.max(0, 1.0 - gyroMagnitude);
  
  return baseDistance * pinchFactor * (0.5 + 0.5 * stabilityFactor);
}

// Update movement calculation to use IMU-based pinch for scaling
function calculateMovementData(deviceId, currentData, previousData) {
  if (!previousData) return null;
  
  const deltaTime = (currentData.timestamp - previousData.timestamp) / 1000;
  if (deltaTime <= 0 || deltaTime > 1) return null;
  
  // Position delta
  const positionDelta = {
    x: currentData.position.x - previousData.position.x,
    y: currentData.position.y - previousData.position.y,
    z: currentData.position.z - previousData.position.z
  };
  
  const positionMagnitude = Math.sqrt(
    positionDelta.x ** 2 + positionDelta.y ** 2 + positionDelta.z ** 2
  );
  
  // Velocity
  const velocity = {
    x: positionDelta.x / deltaTime,
    y: positionDelta.y / deltaTime,
    z: positionDelta.z / deltaTime
  };
  
  // Orientation delta
  const orientationDelta = currentData.imu.orientation.map((angle, i) => {
    let delta = angle - previousData.imu.orientation[i];
    // Normalize to [-π, π]
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    return delta;
  });
  
  // IMU-based scale factor for pinch gesture
  const currentPinchDist = calculateIMUBasedPinchDistance(currentData.imu, currentData.position);
  const previousPinchDist = calculateIMUBasedPinchDistance(previousData.imu, previousData.position);
  
  // Scale factor based on IMU pinch distance change
  const scaleFactor = previousPinchDist > 0.001 ? currentPinchDist / previousPinchDist : 1.0;
  
  // Overall movement magnitude
  const orientationMagnitude = Math.sqrt(
    orientationDelta[0] ** 2 + orientationDelta[1] ** 2 + orientationDelta[2] ** 2
  );
  
  const movementMagnitude = Math.sqrt(
    positionMagnitude ** 2 + orientationMagnitude ** 2
  );
  
  return {
    orientationDelta,
    positionDelta,
    velocity,
    scaleFactor,
    orientation: currentData.imu.orientation,
    position: currentData.position,
    movementMagnitude,
    positionMagnitude,
    deltaTime,
    timestamp: currentData.timestamp
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
  
  // Calculate movement data - FIX: Pass correct parameters
  const movementData = calculateMovementData(deviceId, rawData, previousData);
  
  // Store current data for next frame
  previousFrameData.set(deviceId, {
    ...rawData,
    timestamp: rawData.timestamp
  });
  
  const gestureResult = classifyGesture(rawData); // FIX: Pass full rawData
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
    movementData: movementData || { // FIX: Provide default if null
      orientationDelta: [0, 0, 0],
      positionDelta: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      scaleFactor: 1.0,
      orientation: imu.orientation,
      position: rawData.position,
      movementMagnitude: 0,
      positionMagnitude: 0,
      deltaTime: 0,
      timestamp: rawData.timestamp
    },
    rawSensorData: {
      imu: imu.orientation,
      position: rawData.position,
      fingerBends: fingers,
      thumbBend: thumb.bend,
      palmPressure: palm.pressure || 0
    }
  };
}

// Update the POST endpoint logging to handle null movementData
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
    
    // Enhanced logging with null check
    const movementMag = processedData.movementData?.movementMagnitude?.toFixed(3) || '0.000';
    console.log(`[${processedData.deviceId}] ${processedData.gesture} (${(processedData.gestureConfidence * 100).toFixed(0)}%) | Movement: ${movementMag}`);
    
    res.json({ 
      status: 'success', 
      processedData: {
        gesture: processedData.gesture,
        transformMode: processedData.transformMode,
        confidence: processedData.gestureConfidence,
        movementMagnitude: processedData.movementData?.movementMagnitude || 0
      }
    });
    
  } catch (error) {
    console.error('Error processing sensor data:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

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