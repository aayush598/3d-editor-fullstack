const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // Your Next.js frontend
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

// Gesture classification thresholds
const GESTURE_THRESHOLDS = {
  FINGER_CLOSED: 0.7,    // Above this = finger is bent/closed
  FINGER_OPEN: 0.3,      // Below this = finger is extended/open
  PINCH_THRESHOLD: 0.6,  // Thumb + index proximity for pinch
  FIST_THRESHOLD: 0.7,   // All fingers bent for fist
  PALM_PRESSURE: 0.5     // Palm pressure for grip detection
};

/**
 * Gesture Classification Logic
 * Maps raw sensor data to meaningful gestures
 */
function classifyGesture(sensorData) {
  const { fingers, thumb, palm } = sensorData;
  
  // Count closed fingers
  const closedFingers = Object.values(fingers).filter(bend => bend > GESTURE_THRESHOLDS.FINGER_CLOSED).length;
  const openFingers = Object.values(fingers).filter(bend => bend < GESTURE_THRESHOLDS.FINGER_OPEN).length;
  
  // Detect specific gestures
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
  
  // Classify primary gesture
  let gesture = 'neutral';
  if (isPinch) gesture = 'pinch';
  else if (isFist) gesture = 'fist';
  else if (isOpenPalm) gesture = 'open_palm';
  else if (isPointing) gesture = 'pointing';
  
  return {
    gesture,
    confidence: calculateConfidence(gesture, { fingers, thumb, palm }),
    details: {
      isPinch,
      isFist,
      isOpenPalm,
      isPointing,
      closedFingers,
      openFingers
    }
  };
}

/**
 * Calculate gesture confidence based on sensor clarity
 */
function calculateConfidence(gesture, sensors) {
  // Simple confidence calculation - could be enhanced with ML
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
  }
  
  return Math.max(0.1, Math.min(1, confidence));
}

/**
 * Map gesture to transform mode
 */
function gestureToTransformMode(gesture) {
  const mapping = {
    'open_palm': 'translate',  // Move mode
    'fist': 'rotate',          // Rotate mode  
    'pinch': 'scale',          // Scale mode
    'pointing': 'cursor'       // Cursor/selection mode
  };
  
  return mapping[gesture] || 'translate';
}

/**
 * Normalize IMU orientation to cursor direction
 */
function normalizeCursorOrientation(imuData) {
  const { orientation } = imuData;
  const [roll, pitch, yaw] = orientation;
  
  // Convert IMU Euler angles to normalized direction vector
  // This creates a ray direction from the hand orientation
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
  
  // Classify the current gesture
  const gestureResult = classifyGesture({ fingers, thumb, palm });
  
  // Get cursor orientation from IMU
  const cursorOrientation = normalizeCursorOrientation(imu);
  
  // Determine transform mode from gesture
  const transformMode = gestureToTransformMode(gestureResult.gesture);
  
  // Process switch states for discrete actions
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
    rawSensorData: {
      imu: imu.orientation,
      fingerBends: fingers,
      thumbBend: thumb.bend,
      palmPressure: palm.pressure || 0
    }
  };
}

// API Endpoints

/**
 * POST /sensor-data
 * Receives raw sensor data from the glove hardware
 */
app.post('/sensor-data', (req, res) => {
  try {
    const rawSensorData = req.body;
    
    // Validate required fields
    if (!rawSensorData.deviceId || !rawSensorData.imu || !rawSensorData.fingers) {
      return res.status(400).json({ 
        error: 'Missing required sensor data fields',
        required: ['deviceId', 'imu', 'fingers', 'thumb', 'switches']
      });
    }
    
    // Process the raw data into actionable commands
    const processedData = processSensorData(rawSensorData);
    
    // Update current state
    if (rawSensorData.deviceId.includes('left')) {
      currentGestureState.leftHand = processedData;
    } else {
      currentGestureState.rightHand = processedData;
    }
    
    // Broadcast to all connected frontend clients
    io.emit('gesture-update', processedData);
    
    // Log for debugging
    console.log(`[${processedData.deviceId}] Gesture: ${processedData.gesture} (${(processedData.gestureConfidence * 100).toFixed(0)}%) - Mode: ${processedData.transformMode}`);
    
    res.json({ 
      status: 'success', 
      processedData: {
        gesture: processedData.gesture,
        transformMode: processedData.transformMode,
        confidence: processedData.gestureConfidence
      }
    });
    
  } catch (error) {
    console.error('Error processing sensor data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /current-state
 * Returns the current gesture state for debugging
 */
app.get('/current-state', (req, res) => {
  res.json({
    currentState: currentGestureState,
    connectedClients: connectedClients.size,
    timestamp: Date.now()
  });
});

/**
 * POST /calibrate
 * Endpoint for sensor calibration
 */
app.post('/calibrate', (req, res) => {
  const { deviceId, calibrationData } = req.body;
  
  // Store calibration data (in production, save to database)
  console.log(`Calibration received for ${deviceId}:`, calibrationData);
  
  // Broadcast calibration complete
  io.emit('calibration-complete', { deviceId });
  
  res.json({ status: 'calibration-saved', deviceId });
});

// WebSocket Connection Handling
io.on('connection', (socket) => {
  console.log(`Frontend client connected: ${socket.id}`);
  connectedClients.add(socket.id);
  
  // Send current state to newly connected client
  socket.emit('initial-state', currentGestureState);
  
  // Handle frontend commands
  socket.on('select-object', (objectId) => {
    currentGestureState.selectedObject = objectId;
    console.log(`Object selected: ${objectId}`);
    // Broadcast to other clients
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

// Health check endpoint
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