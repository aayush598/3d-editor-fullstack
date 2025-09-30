/**
 * Enhanced Movement Test Script
 * Tests all gesture-based transformations with realistic movement patterns
 */

const axios = require('axios');

const BACKEND_URL = 'http://localhost:3001';
const DEVICE_ID = 'testHand_right';

class MovementTester {
  constructor() {
    this.testSequences = [
      {
        name: 'Object Selection Test',
        description: 'Point at different locations to test cursor movement and selection',
        gesture: 'pointing',
        duration: 8000,
        movement: this.generateCursorMovement.bind(this)
      },
      {
        name: 'Object Translation Test', 
        description: 'Move object in 3D space with open palm',
        gesture: 'open_palm',
        duration: 10000,
        movement: this.generateTranslationMovement.bind(this)
      },
      {
        name: 'Object Rotation Test',
        description: 'Rotate object with fist gesture',
        gesture: 'fist',
        duration: 10000,
        movement: this.generateRotationMovement.bind(this)
      },
      {
        name: 'Object Scaling Test',
        description: 'Scale object with pinch gesture',
        gesture: 'pinch',
        duration: 8000,
        movement: this.generateScalingMovement.bind(this)
      }
    ];
    
    this.currentTestIndex = 0;
    this.testStartTime = 0;
    this.isRunning = false;
    this.previousPosition = { x: 0, y: 0, z: 0 };
    this.previousOrientation = [0, 0, 0];
  }

  // Generate realistic cursor pointing movements
  generateCursorMovement(elapsedTime) {
    const t = elapsedTime / 1000;
    const orientation = [
      0.1 + Math.sin(t * 1.2) * 0.4,  // Roll: gentle sway
      0.2 + Math.sin(t * 0.8) * 0.6,  // Pitch: up/down pointing
      Math.sin(t * 0.5) * 1.2         // Yaw: left/right sweep
    ];
    
    const position = { x: 0, y: 0, z: 0 }; // Stationary for pointing
    
    return {
      orientation,
      position,
      description: `Pointing sweep: [${orientation.map(o => o.toFixed(2)).join(', ')}] rad`
    };
  }

  // Generate 3D translation movements with continuous motion
  generateTranslationMovement(elapsedTime) {
    const t = elapsedTime / 1000;
    const radius = 0.8;
    const height = 0.6;
    const speed = 0.7; // Slower for smoother movement
    
    const position = {
      x: Math.sin(t * speed) * radius,        // Circular X movement
      y: Math.sin(t * speed * 1.3) * height,  // Oscillating Y movement  
      z: Math.cos(t * speed) * radius         // Circular Z movement
    };
    
    return {
      orientation: [0.05, 0.05, 0.05], // Stable orientation
      position,
      description: `Translation: [${Object.values(position).map(v => v.toFixed(3)).join(', ')}]`
    };
  }

  // Generate rotation movements with continuous orientation changes
  generateRotationMovement(elapsedTime) {
    const t = elapsedTime / 1000;
    const rotationSpeed = 0.6; // Slower for smoother rotation
    
    const orientation = [
      Math.sin(t * rotationSpeed) * 0.8,           // Roll rotation
      Math.cos(t * rotationSpeed * 1.3) * 0.6,     // Pitch rotation
      (t * rotationSpeed * 0.4) % (Math.PI * 2)    // Continuous yaw rotation
    ];
    
    return {
      orientation,
      position: { x: 0, y: 0, z: 0 }, // Stable position
      description: `Rotation: [${orientation.map(o => o.toFixed(3)).join(', ')}] rad`
    };
  }

  // Update getGestureFingers to work with IMU-based pinch
getGestureFingers(gesture, movementData = null) {
  const patterns = {
    pointing: { index: 0.1, middle: 0.9, ring: 0.9, little: 0.9 },
    open_palm: { index: 0.1, middle: 0.1, ring: 0.1, little: 0.1 },
    fist: { index: 0.9, middle: 0.9, ring: 0.9, little: 0.9 },
    pinch: { index: 0.3, middle: 0.8, ring: 0.8, little: 0.8 } // Index slightly bent for pinch
  };
  
  let fingers = { ...patterns[gesture] } || { ...patterns.open_palm };
  
  // For pinch, we don't need to vary based on distance since IMU handles it
  // Just keep consistent pinch finger position
  
  // Add minimal realistic noise
  Object.keys(fingers).forEach(finger => {
    fingers[finger] += (Math.random() - 0.5) * 0.03;
    fingers[finger] = Math.max(0, Math.min(1, fingers[finger]));
  });

  return fingers;
}

// Update generateScalingMovement to work with IMU-based pinch detection
generateScalingMovement(elapsedTime) {
  const t = elapsedTime / 1000;
  const scaleOscillation = Math.sin(t * 1.0);
  
  // For IMU-based pinch, we use hand orientation (roll angle) to indicate pinching
  // More roll = closer pinch = smaller scale
  const baseRoll = 0.3; // Base roll angle
  const rollRange = 0.4; // Roll variation for scaling
  
  const rollAngle = baseRoll + (scaleOscillation * rollRange);
  
  const orientation = [
    rollAngle,  // Roll indicates pinch closeness
    0.05,       // Stable pitch
    0.05        // Stable yaw
  ];
  
  const position = {
    x: scaleOscillation * 0.15,  // Slight horizontal movement
    y: 0.2,                       // Elevated position
    z: scaleOscillation * 0.1    // Slight depth movement
  };
  
  return {
    orientation,
    position,
    description: `IMU Scaling: roll = ${rollAngle.toFixed(3)} rad (${scaleOscillation > 0 ? 'expanding' : 'contracting'})`
  };
}

// Update generateTestData for IMU-based system
generateTestData() {
  const currentTest = this.testSequences[this.currentTestIndex];
  const elapsedTime = Date.now() - this.testStartTime;
  const movement = currentTest.movement(elapsedTime);
  
  const fingers = this.getGestureFingers(currentTest.gesture, movement);
  
  // Add small random variations
  const noiseLevel = 0.001;
  Object.keys(movement.position).forEach(axis => {
    movement.position[axis] += (Math.random() - 0.5) * noiseLevel;
  });
  
  movement.orientation = movement.orientation.map(angle => 
    angle + (Math.random() - 0.5) * noiseLevel
  );

  // Generate realistic gyroscope data based on movement
  const gyroNoise = 0.05;
  const gyroscope = movement.orientation.map((angle, i) => {
    const prevAngle = this.previousOrientation[i] || 0;
    const angularVelocity = (angle - prevAngle) * 50; // Approximate at 50Hz
    return angularVelocity + (Math.random() - 0.5) * gyroNoise;
  });
  
  this.previousOrientation = [...movement.orientation];

  return {
    deviceId: DEVICE_ID,
    timestamp: Date.now(),
    imu: {
      orientation: movement.orientation,
      acceleration: [
        (Math.random() - 0.5) * 0.3,
        9.8 + (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.3
      ],
      gyroscope
    },
    position: movement.position,
    fingers, // Still used for other gestures
    thumb: { 
      bend: currentTest.gesture === 'pinch' ? 0.3 : // Slightly bent for pinch
           (currentTest.gesture === 'fist' ? 0.9 : 0.4)
    },
    palm: { 
      pressure: currentTest.gesture === 'fist' ? 0.8 : 
               currentTest.gesture === 'pinch' ? 0.5 : 0.3 
    },
    switches: {
      selectButton: currentTest.gesture === 'pinch' && elapsedTime > 1000,
      modeButton: false,
      confirmButton: false
    },
    gestureMetadata: {
      testName: currentTest.name,
      elapsedTime,
      description: movement.description,
      expectedGesture: currentTest.gesture
    }
  };
}

  // Send test data to backend with enhanced error handling
  async sendTestData() {
    try {
      const testData = this.generateTestData();
      const response = await axios.post(`${BACKEND_URL}/sensor-data`, testData, {
        timeout: 3000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.status === 'success') {
        const processed = response.data.processedData;
        const currentTest = this.testSequences[this.currentTestIndex];
        const progress = ((Date.now() - this.testStartTime) / currentTest.duration * 100).toFixed(0);
        
        // Enhanced logging with movement magnitude
        const movementInfo = processed.movementMagnitude ? 
          ` | Movement: ${processed.movementMagnitude.toFixed(4)}` : '';
        
        console.log(`🧪 ${currentTest.name} [${progress}%]: ${processed.gesture} (${(processed.confidence * 100).toFixed(0)}%)${movementInfo} | ${testData.gestureMetadata.description}`);
        
        // Warn if gesture doesn't match expected
        if (processed.gesture !== currentTest.gesture) {
          console.log(`⚠️  Expected: ${currentTest.gesture}, Detected: ${processed.gesture}`);
        }
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error(`❌ Backend not responding. Is it running on ${BACKEND_URL}?`);
      } else if (error.code === 'ETIMEDOUT') {
        console.error(`⏱️  Request timeout. Backend may be overloaded.`);
      } else {
        console.error(`❌ Test error: ${error.message}`);
      }
    }
  }

  // Run the comprehensive test suite
  async runTests() {
    console.log('🧪 Starting Enhanced Movement Test Suite');
    console.log('=' .repeat(60));
    console.log('📋 This test will simulate realistic hand movements for gesture control');
    console.log('🎯 Add objects to your scene and toggle gesture mode (G) in the frontend');
    console.log('');
    
    for (let i = 0; i < this.testSequences.length; i++) {
      this.currentTestIndex = i;
      const currentTest = this.testSequences[i];
      
      console.log(`\n🎯 Test ${i + 1}/${this.testSequences.length}: ${currentTest.name}`);
      console.log(`📝 ${currentTest.description}`);
      console.log(`⏱️  Duration: ${currentTest.duration / 1000}s | Update Rate: 50Hz`);
      console.log('-' .repeat(50));
      
      this.testStartTime = Date.now();
      this.isRunning = true;
      
      // Higher frequency for smoother movement data
      const testInterval = setInterval(() => {
        this.sendTestData();
      }, 20); // 50Hz update rate for smoother movement
      
      // Wait for test completion
      await new Promise(resolve => {
        setTimeout(() => {
          clearInterval(testInterval);
          resolve();
        }, currentTest.duration);
      });
      
      console.log(`✅ ${currentTest.name} completed`);
      
      // Brief pause between tests
      if (i < this.testSequences.length - 1) {
        console.log('⏸️  Pausing 3 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    this.isRunning = false;
    console.log('\n🎉 All movement tests completed successfully!');
    console.log('\n📊 Test Summary:');
    this.testSequences.forEach((test, i) => {
      console.log(`   ${i + 1}. ${test.name} - ${test.duration / 1000}s`);
    });
    console.log('\n💡 Tips for best results:');
    console.log('   • Make sure gesture mode is enabled (G key)');
    console.log('   • Add objects to the scene before running tests');
    console.log('   • Objects should be selected automatically during pointing test');
    console.log('   • Watch the movement data in the UI for real-time feedback');
  }

  // Run a single test by name with enhanced matching
  async runSingleTest(testName) {
    const testIndex = this.testSequences.findIndex(t => 
      t.name.toLowerCase().includes(testName.toLowerCase()) ||
      t.gesture.toLowerCase().includes(testName.toLowerCase())
    );
    
    if (testIndex === -1) {
      console.log(`❌ Test "${testName}" not found`);
      console.log('📋 Available tests:');
      this.testSequences.forEach((test, i) => {
        console.log(`   ${i + 1}. ${test.name} (${test.gesture})`);
      });
      return;
    }
    
    this.currentTestIndex = testIndex;
    const test = this.testSequences[testIndex];
    
    console.log(`🧪 Running single test: ${test.name}`);
    console.log(`📝 ${test.description}`);
    console.log(`🎯 Expected gesture: ${test.gesture}`);
    console.log(`⏱️  Duration: ${test.duration / 1000}s`);
    console.log('-'.repeat(40));
    
    this.testStartTime = Date.now();
    this.isRunning = true;
    
    const testInterval = setInterval(() => {
      this.sendTestData();
    }, 20); // 50Hz
    
    setTimeout(() => {
      clearInterval(testInterval);
      this.isRunning = false;
      console.log(`✅ Test "${test.name}" completed`);
    }, test.duration);
  }

  // Test backend connectivity and show system status
  async checkSystem() {
    try {
      console.log('🔍 Checking system status...');
      
      const healthResponse = await axios.get(`${BACKEND_URL}/health`, { timeout: 2000 });
      console.log('✅ Backend health:', healthResponse.data);
      
      const stateResponse = await axios.get(`${BACKEND_URL}/current-state`, { timeout: 2000 });
      console.log('📊 Current gesture state:', stateResponse.data.currentState);
      console.log(`👥 Connected clients: ${stateResponse.data.connectedClients}`);
      
      return true;
    } catch (error) {
      console.error('❌ System check failed:', error.message);
      return false;
    }
  }
}

// Enhanced command line interface
async function main() {
  const args = process.argv.slice(2);
  const tester = new MovementTester();
  
  if (args.length === 0) {
    console.log('🎮 Enhanced Movement Test Options:');
    console.log('  node movement-test.js all          - Run all tests sequentially');
    console.log('  node movement-test.js cursor       - Test cursor movement & selection');
    console.log('  node movement-test.js translate    - Test object translation');
    console.log('  node movement-test.js rotate       - Test object rotation');
    console.log('  node movement-test.js scale        - Test object scaling');
    console.log('  node movement-test.js check        - Check system status');
    console.log('');
    console.log('💡 Make sure to:');
    console.log('  1. Start the backend server (node server.js)');
    console.log('  2. Open the frontend and add some objects');
    console.log('  3. Enable gesture mode with "G" key');
    console.log('  4. Run the desired test');
    console.log('');
    return;
  }
  
  const command = args[0].toLowerCase();
  
  // Check system first for all commands except help
  if (command !== 'help') {
    const systemOk = await tester.checkSystem();
    if (!systemOk) {
      console.log('');
      console.log('🚨 Please ensure:');
      console.log('  1. Backend server is running: node server.js');
      console.log('  2. Backend is accessible at', BACKEND_URL);
      return;
    }
    console.log(''); // Add spacing after system check
  }
  
  switch (command) {
    case 'all':
      await tester.runTests();
      break;
    case 'cursor':
    case 'point':
    case 'pointing':
      await tester.runSingleTest('cursor');
      break;
    case 'translate':
    case 'move':
    case 'translation':
      await tester.runSingleTest('translation');
      break;
    case 'rotate':
    case 'rotation':
      await tester.runSingleTest('rotation');
      break;
    case 'scale':
    case 'scaling':
    case 'pinch':
      await tester.runSingleTest('scaling');
      break;
    case 'check':
    case 'status':
      // System check already done above
      console.log('✅ System check completed');
      break;
    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Use "node movement-test.js" to see available options');
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(0);
});

main().catch(error => {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
});