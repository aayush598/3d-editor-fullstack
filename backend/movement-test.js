/**
 * Comprehensive Movement Test Script
 * Tests all gesture-based transformations with realistic movement patterns
 */

const axios = require('axios');

const BACKEND_URL = 'http://localhost:3001';
const DEVICE_ID = 'testHand';

class MovementTester {
  constructor() {
    this.testSequences = [
      {
        name: 'Object Selection Test',
        description: 'Point at different locations to test cursor movement',
        gesture: 'pointing',
        duration: 5000,
        movement: this.generateCursorMovement.bind(this)
      },
      {
        name: 'Object Translation Test', 
        description: 'Move object in 3D space with open palm',
        gesture: 'open_palm',
        duration: 6000,
        movement: this.generateTranslationMovement.bind(this)
      },
      {
        name: 'Object Rotation Test',
        description: 'Rotate object with fist gesture',
        gesture: 'fist',
        duration: 6000,
        movement: this.generateRotationMovement.bind(this)
      },
      {
        name: 'Object Scaling Test',
        description: 'Scale object with pinch gesture',
        gesture: 'pinch',
        duration: 5000,
        movement: this.generateScalingMovement.bind(this)
      }
    ];
    
    this.currentTestIndex = 0;
    this.testStartTime = 0;
    this.isRunning = false;
  }

  // Generate realistic cursor pointing movements
  generateCursorMovement(elapsedTime) {
    const t = elapsedTime / 1000;
    return {
      orientation: [
        0.1 + Math.sin(t * 1.2) * 0.4,  // Roll: gentle sway
        0.2 + Math.sin(t * 0.8) * 0.6,  // Pitch: up/down pointing
        Math.sin(t * 0.5) * 1.2         // Yaw: left/right sweep
      ],
      position: { x: 0, y: 0, z: 0 },
      description: `Pointing sweep: [${(Math.sin(t * 0.5) * 1.2).toFixed(2)} rad yaw]`
    };
  }

  // Generate 3D translation movements
  generateTranslationMovement(elapsedTime) {
    const t = elapsedTime / 1000;
    const radius = 0.8;
    const height = 0.6;
    
    return {
      orientation: [0.05, 0.05, 0.05], // Stable orientation
      position: {
        x: Math.sin(t * 0.7) * radius,      // Circular X movement
        y: Math.sin(t * 1.1) * height,      // Oscillating Y movement  
        z: Math.cos(t * 0.7) * radius       // Circular Z movement
      },
      description: `Translation: [${(Math.sin(t * 0.7) * radius).toFixed(2)}, ${(Math.sin(t * 1.1) * height).toFixed(2)}, ${(Math.cos(t * 0.7) * radius).toFixed(2)}]`
    };
  }

  // Generate rotation movements
  generateRotationMovement(elapsedTime) {
    const t = elapsedTime / 1000;
    const rotationSpeed = 0.8;
    
    return {
      orientation: [
        Math.sin(t * rotationSpeed) * 0.8,     // Roll rotation
        Math.cos(t * rotationSpeed * 1.3) * 0.6, // Pitch rotation
        t * rotationSpeed * 0.4                 // Continuous yaw rotation
      ],
      position: { x: 0, y: 0, z: 0 }, // Stable position
      description: `Rotation: [${(Math.sin(t * rotationSpeed) * 0.8).toFixed(2)}, ${(Math.cos(t * rotationSpeed * 1.3) * 0.6).toFixed(2)}, ${(t * rotationSpeed * 0.4).toFixed(2)}] rad`
    };
  }

  // Generate scaling movements (pinch distance changes)
  generateScalingMovement(elapsedTime) {
    const t = elapsedTime / 1000;
    const scaleOscillation = Math.sin(t * 1.5);
    const baseDistance = 0.3;
    const scaleRange = 0.5;
    
    return {
      orientation: [0.02, 0.02, 0.02], // Very stable for precise scaling
      position: {
        x: scaleOscillation * scaleRange,  // Hands moving apart/together
        y: 0.1,                           // Slightly elevated
        z: scaleOscillation * scaleRange * 0.3  // Some depth movement
      },
      description: `Scaling: distance = ${(baseDistance + Math.abs(scaleOscillation * scaleRange)).toFixed(2)}m`
    };
  }

  // Generate gesture-specific finger positions
  getGestureFingers(gesture) {
    const patterns = {
      pointing: { index: 0.1, middle: 0.9, ring: 0.9, little: 0.9 },
      open_palm: { index: 0.1, middle: 0.1, ring: 0.1, little: 0.1 },
      fist: { index: 0.9, middle: 0.9, ring: 0.9, little: 0.9 },
      pinch: { index: 0.2, middle: 0.8, ring: 0.8, little: 0.8 }
    };
    
    return patterns[gesture] || patterns.open_palm;
  }

  // Generate complete sensor data for current test
  generateTestData() {
    const currentTest = this.testSequences[this.currentTestIndex];
    const elapsedTime = Date.now() - this.testStartTime;
    const movement = currentTest.movement(elapsedTime);
    
    const fingers = this.getGestureFingers(currentTest.gesture);
    
    // Add realistic noise
    Object.keys(fingers).forEach(finger => {
      fingers[finger] += (Math.random() - 0.5) * 0.1;
      fingers[finger] = Math.max(0, Math.min(1, fingers[finger]));
    });

    return {
      deviceId: DEVICE_ID,
      timestamp: Date.now(),
      imu: {
        orientation: movement.orientation,
        acceleration: [
          (Math.random() - 0.5) * 0.5,
          9.8 + (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.5
        ],
        gyroscope: movement.orientation.map(o => o * 0.3 + (Math.random() - 0.5) * 0.1)
      },
      position: movement.position,
      fingers,
      thumb: { bend: currentTest.gesture === 'pinch' ? 0.2 : 0.5 },
      palm: { pressure: currentTest.gesture === 'fist' ? 0.8 : 0.3 },
      switches: {
        selectButton: currentTest.gesture === 'pinch',
        modeButton: false,
        confirmButton: false
      },
      gestureMetadata: {
        testName: currentTest.name,
        elapsedTime,
        description: movement.description
      }
    };
  }

  // Send test data to backend
  async sendTestData() {
    try {
      const testData = this.generateTestData();
      const response = await axios.post(`${BACKEND_URL}/sensor-data`, testData, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.status === 'success') {
        const processed = response.data.processedData;
        const currentTest = this.testSequences[this.currentTestIndex];
        const progress = ((Date.now() - this.testStartTime) / currentTest.duration * 100).toFixed(0);
        
        console.log(`🧪 ${currentTest.name} [${progress}%]: ${processed.gesture} (${(processed.confidence * 100).toFixed(0)}%) | ${testData.gestureMetadata.description}`);
      }
    } catch (error) {
      console.error(`❌ Test error: ${error.message}`);
    }
  }

  // Run the comprehensive test suite
  async runTests() {
    console.log('🧪 Starting Comprehensive Movement Test Suite');
    console.log('='.repeat(60));
    
    for (let i = 0; i < this.testSequences.length; i++) {
      this.currentTestIndex = i;
      const currentTest = this.testSequences[i];
      
      console.log(`\n🎯 Test ${i + 1}/${this.testSequences.length}: ${currentTest.name}`);
      console.log(`📝 ${currentTest.description}`);
      console.log(`⏱️  Duration: ${currentTest.duration / 1000}s`);
      console.log('-'.repeat(40));
      
      this.testStartTime = Date.now();
      this.isRunning = true;
      
      // Run test for specified duration
      const testInterval = setInterval(() => {
        this.sendTestData();
      }, 100); // 10Hz update rate
      
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
        console.log('⏸️  Pausing 2 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    this.isRunning = false;
    console.log('\n🎉 All movement tests completed successfully!');
    console.log('\n📊 Test Summary:');
    this.testSequences.forEach((test, i) => {
      console.log(`   ${i + 1}. ${test.name} - ${test.duration / 1000}s`);
    });
  }

  // Run a single test by name
  async runSingleTest(testName) {
    const testIndex = this.testSequences.findIndex(t => 
      t.name.toLowerCase().includes(testName.toLowerCase())
    );
    
    if (testIndex === -1) {
      console.log(`❌ Test "${testName}" not found`);
      console.log('Available tests:');
      this.testSequences.forEach((test, i) => {
        console.log(`   ${i + 1}. ${test.name}`);
      });
      return;
    }
    
    this.currentTestIndex = testIndex;
    const test = this.testSequences[testIndex];
    
    console.log(`🧪 Running single test: ${test.name}`);
    console.log(`📝 ${test.description}`);
    
    this.testStartTime = Date.now();
    this.isRunning = true;
    
    const testInterval = setInterval(() => {
      this.sendTestData();
    }, 100);
    
    setTimeout(() => {
      clearInterval(testInterval);
      this.isRunning = false;
      console.log(`✅ Test "${test.name}" completed`);
    }, test.duration);
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const tester = new MovementTester();
  
  if (args.length === 0) {
    console.log('🎮 Movement Test Options:');
    console.log('  node movement-test.js all          - Run all tests');
    console.log('  node movement-test.js cursor       - Test cursor movement');
    console.log('  node movement-test.js translate    - Test translation');
    console.log('  node movement-test.js rotate       - Test rotation');
    console.log('  node movement-test.js scale        - Test scaling');
    console.log('');
    return;
  }
  
  const command = args[0].toLowerCase();
  
  // Check backend connectivity first
  try {
    await axios.get(`${BACKEND_URL}/health`, { timeout: 2000 });
    console.log('✅ Backend connection verified');
  } catch (error) {
    console.error('❌ Backend not responding. Start backend server first.');
    return;
  }
  
  switch (command) {
    case 'all':
      await tester.runTests();
      break;
    case 'cursor':
    case 'point':
      await tester.runSingleTest('cursor');
      break;
    case 'translate':
    case 'move':
      await tester.runSingleTest('translation');
      break;
    case 'rotate':
    case 'rotation':
      await tester.runSingleTest('rotation');
      break;
    case 'scale':
    case 'scaling':
      await tester.runSingleTest('scaling');
      break;
    default:
      console.log(`❌ Unknown command: ${command}`);
  }
}

main().catch(console.error);