/**
 * Glove Data Simulator
 * Simulates sensor data from gesture gloves for testing the backend API
 * Run with: node glove-simulator.js
 */

const axios = require('axios');

const BACKEND_URL = 'http://localhost:3001';
const DEVICE_ID = 'rightHand1';
const UPDATE_INTERVAL = 100; // milliseconds

// Simulate different gesture patterns
const GESTURE_PATTERNS = {
  pointing: {
    fingers: { index: 0.1, middle: 0.8, ring: 0.9, little: 0.8 },
    thumb: { bend: 0.7 },
    palm: { pressure: 0.2 }
  },
  
  open_palm: {
    fingers: { index: 0.1, middle: 0.1, ring: 0.2, little: 0.2 },
    thumb: { bend: 0.1 },
    palm: { pressure: 0.1 }
  },
  
  fist: {
    fingers: { index: 0.9, middle: 0.9, ring: 0.9, little: 0.9 },
    thumb: { bend: 0.9 },
    palm: { pressure: 0.8 }
  },
  
  pinch: {
    fingers: { index: 0.3, middle: 0.8, ring: 0.8, little: 0.8 },
    thumb: { bend: 0.3 },
    palm: { pressure: 0.4 }
  },
  
  neutral: {
    fingers: { index: 0.4, middle: 0.4, ring: 0.4, little: 0.4 },
    thumb: { bend: 0.4 },
    palm: { pressure: 0.3 }
  }
};

class GloveSimulator {
  constructor() {
    this.currentGesture = 'neutral';
    this.gestureStartTime = Date.now();
    this.gestureDuration = 3000; // Hold gesture for 3 seconds
    this.handOrientation = { roll: 0, pitch: 0, yaw: 0 };
    this.isRunning = false;
    
    // Gesture sequence for demo
    this.gestureSequence = ['neutral', 'pointing', 'pinch', 'fist', 'open_palm'];
    this.sequenceIndex = 0;
  }

  // Generate realistic sensor noise
  addNoise(value, noiseAmount = 0.05) {
    return value + (Math.random() - 0.5) * 2 * noiseAmount;
  }

  // Simulate hand movement and orientation
  updateHandOrientation() {
    const time = Date.now() / 1000;
    
    // Simulate natural hand movement patterns
    this.handOrientation = {
      roll: this.addNoise(Math.sin(time * 0.5) * 0.3),
      pitch: this.addNoise(Math.sin(time * 0.3) * 0.4),
      yaw: this.addNoise(Math.sin(time * 0.2) * 0.6)
    };
  }

  // Cycle through different gestures
  updateGesture() {
    const currentTime = Date.now();
    
    if (currentTime - this.gestureStartTime > this.gestureDuration) {
      // Move to next gesture in sequence
      this.sequenceIndex = (this.sequenceIndex + 1) % this.gestureSequence.length;
      this.currentGesture = this.gestureSequence[this.sequenceIndex];
      this.gestureStartTime = currentTime;
      
      console.log(`🤲 Switching to gesture: ${this.currentGesture}`);
    }
  }

  // Generate current sensor data packet
  generateSensorData() {
    this.updateHandOrientation();
    this.updateGesture();
    
    const basePattern = GESTURE_PATTERNS[this.currentGesture];
    
    // Add some noise to make it more realistic
    const noisyFingers = {};
    Object.keys(basePattern.fingers).forEach(finger => {
      noisyFingers[finger] = Math.max(0, Math.min(1, 
        this.addNoise(basePattern.fingers[finger], 0.1)
      ));
    });

    return {
      deviceId: DEVICE_ID,
      timestamp: Date.now(),
      imu: {
        orientation: [
          this.handOrientation.roll,
          this.handOrientation.pitch,
          this.handOrientation.yaw
        ],
        acceleration: [
          this.addNoise(0, 0.1),
          this.addNoise(9.8, 0.2),  // Gravity
          this.addNoise(0, 0.1)
        ]
      },
      fingers: noisyFingers,
      thumb: {
        bend: Math.max(0, Math.min(1, this.addNoise(basePattern.thumb.bend, 0.1)))
      },
      palm: {
        pressure: Math.max(0, Math.min(1, this.addNoise(basePattern.palm.pressure, 0.05)))
      },
      switches: {
        selectButton: false,
        modeButton: false,
        confirmButton: this.currentGesture === 'pinch' // Simulate confirm when pinching
      }
    };
  }

  // Send data to backend
  async sendSensorData() {
    try {
      const sensorData = this.generateSensorData();
      
      const response = await axios.post(`${BACKEND_URL}/sensor-data`, sensorData, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.status === 'success') {
        const processed = response.data.processedData;
        console.log(`📡 Sent: ${this.currentGesture} → Detected: ${processed.gesture} (${(processed.confidence * 100).toFixed(0)}%) [${processed.transformMode}]`);
      }
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error('❌ Backend not running. Start with: npm run dev');
      } else {
        console.error('❌ Error sending data:', error.message);
      }
    }
  }

  // Start the simulation
  start() {
    console.log('🚀 Starting Glove Data Simulator...');
    console.log(`📡 Sending data to: ${BACKEND_URL}/sensor-data`);
    console.log(`🤲 Device ID: ${DEVICE_ID}`);
    console.log('👋 Gesture sequence:', this.gestureSequence.join(' → '));
    console.log('');

    this.isRunning = true;
    
    // Send data at regular intervals
    this.interval = setInterval(() => {
      this.sendSensorData();
    }, UPDATE_INTERVAL);
  }

  // Stop the simulation
  stop() {
    console.log('\n🛑 Stopping Glove Data Simulator...');
    this.isRunning = false;
    
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
}

// Interactive CLI
function startInteractiveMode() {
  const simulator = new GloveSimulator();
  
  console.log('\n🎮 Glove Data Simulator - Interactive Mode');
  console.log('Commands:');
  console.log('  start  - Begin sending sensor data');
  console.log('  stop   - Stop sending data');
  console.log('  status - Check backend connection');
  console.log('  exit   - Quit simulator');
  console.log('');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '🤲 gesture> '
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const command = line.trim().toLowerCase();

    switch (command) {
      case 'start':
        if (!simulator.isRunning) {
          simulator.start();
        } else {
          console.log('⚠️  Simulator already running');
        }
        break;

      case 'stop':
        if (simulator.isRunning) {
          simulator.stop();
        } else {
          console.log('⚠️  Simulator not running');
        }
        break;

      case 'status':
        try {
          const response = await axios.get(`${BACKEND_URL}/health`, { timeout: 2000 });
          console.log('✅ Backend Status:', response.data);
        } catch (error) {
          console.log('❌ Backend not responding');
        }
        break;

      case 'exit':
      case 'quit':
        simulator.stop();
        console.log('👋 Goodbye!');
        rl.close();
        return;

      default:
        console.log('❓ Unknown command. Try: start, stop, status, exit');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    simulator.stop();
    process.exit(0);
  });
}

// Handle command line arguments
if (process.argv.includes('--auto')) {
  // Auto mode - just start immediately
  const simulator = new GloveSimulator();
  simulator.start();
  
  // Stop after 30 seconds in auto mode
  setTimeout(() => {
    simulator.stop();
    process.exit(0);
  }, 30000);
  
} else {
  // Interactive mode
  startInteractiveMode();
}