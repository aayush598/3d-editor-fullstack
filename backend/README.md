# Gesture-Controlled 3D Editor - Backend Setup Guide

## 🚀 Quick Start

This guide will help you set up the backend API server that receives sensor data from your gesture gloves and communicates with your 3D editor frontend.

## 📁 Project Structure

```
your-project/
├── backend/                 # New backend server
│   ├── server.js           # Main API server
│   ├── package.json        # Backend dependencies
│   └── glove-simulator.js  # Testing tool
├── frontend/               # Your existing Next.js app
│   ├── hooks/
│   │   └── useGestureWebSocket.ts  # WebSocket hook
│   ├── components/
│   │   └── EditorCanvas.tsx        # Updated with gesture support
│   └── ...
```

## 🛠 Installation Steps

### 1. Backend Setup

Create a new directory for the backend:

```bash
mkdir backend
cd backend
```

Install dependencies:

```bash
npm init -y
npm install express socket.io cors dotenv
npm install --save-dev nodemon jest
```

Copy the provided `server.js` and update your `package.json` with the provided configuration.

### 2. Frontend Updates

In your existing Next.js project, install the Socket.IO client:

```bash
npm install socket.io-client
```

Add the provided files:
- `hooks/useGestureWebSocket.ts` - WebSocket connection management
- Updated `components/EditorCanvas.tsx` - Gesture integration

### 3. Start the Services

**Terminal 1 - Backend Server:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend (Next.js):**
```bash
npm run dev
```

**Terminal 3 - Glove Simulator (for testing):**
```bash
cd backend
node glove-simulator.js
```

## 🧤 Hardware Integration

### Expected Sensor Data Format

Your glove hardware should send HTTP POST requests to `http://localhost:3001/sensor-data` with this JSON structure:

```json
{
  "deviceId": "rightHand1",
  "timestamp": 1234567890,
  "imu": {
    "orientation": [roll, pitch, yaw],
    "acceleration": [x, y, z]
  },
  "fingers": {
    "index": 0.2,     // 0 = straight, 1 = fully bent
    "middle": 0.1,
    "ring": 0.9,
    "little": 0.8
  },
  "thumb": {
    "bend": 0.3
  },
  "palm": {
    "pressure": 0.4   // 0 = no pressure, 1 = max pressure
  },
  "switches": {
    "selectButton": false,
    "modeButton": true,
    "confirmButton": false
  }
}
```

### Gesture Mapping

The system recognizes these gestures:

| **Gesture** | **Description** | **Transform Mode** |
|-------------|-----------------|-------------------|
| `open_palm` | All fingers extended | **Translate** (move objects) |
| `fist` | All fingers closed | **Rotate** objects |
| `pinch` | Thumb + index touching | **Scale** objects |
| `pointing` | Index extended, others closed | **Cursor** control |

## 🎮 Usage Instructions

### Mouse Mode (Default)
- Use mouse and keyboard as normal
- Keyboard shortcuts: `T` (translate), `R` (rotate), `S` (scale)

### Gesture Mode
1. Press `G` to toggle gesture mode
2. Ensure backend connection is active (green indicator)
3. Use hand gestures to control the 3D scene:
   - **Point** at objects to highlight them
   - **Pinch** to select highlighted objects
   - **Open palm** + move hand = translate object
   - **Make fist** + rotate hand = rotate object
   - **Pinch** + move hands apart/together = scale object

## 🧪 Testing with Simulator

The included glove simulator helps test the system without hardware:

```bash
node glove-simulator.js
```

Interactive commands:
- `start` - Begin sending simulated sensor data
- `stop` - Stop simulation
- `status` - Check backend connection
- `exit` - Quit

Auto mode (runs for 30 seconds):
```bash
node glove-simulator.js --auto
```

## 📡 API Endpoints

### Backend Endpoints

| **Endpoint** | **Method** | **Description** |
|--------------|------------|-----------------|
| `/sensor-data` | POST | Receive sensor data from gloves |
| `/current-state` | GET | View current gesture state |
| `/calibrate` | POST | Sensor calibration |
| `/health` | GET | Health check |

### WebSocket Events

**From Backend to Frontend:**
- `gesture-update` - Real-time gesture data
- `initial-state` - Current state on connection
- `object-selected` - Object selection events
- `calibration-complete` - Calibration finished

**From Frontend to Backend:**
- `select-object` - Object selection
- `transform-mode-change` - Mode switching

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### Gesture Sensitivity

Modify thresholds in `server.js`:

```javascript
const GESTURE_THRESHOLDS = {
  FINGER_CLOSED: 0.7,    // Finger bend threshold
  FINGER_OPEN: 0.3,      // Finger open threshold
  PINCH_THRESHOLD: 0.6,  // Pinch detection
  FIST_THRESHOLD: 0.7,   // Fist detection
  PALM_PRESSURE: 0.5     // Palm pressure threshold
};
```

## 🚨 Troubleshooting

### Backend Not Starting
- Check if port 3001 is available: `lsof -i :3001`
- Install dependencies: `npm install`
- Check Node.js version: `node --version` (requires Node 14+)

### Frontend Connection Issues
- Verify backend is running on port 3001
- Check browser console for WebSocket errors
- Ensure CORS settings allow your frontend URL

### No Gesture Detection
- Use the simulator to test: `node glove-simulator.js`
- Check `/current-state` endpoint for received data
- Verify sensor data format matches expected structure

### Poor Gesture Recognition
- Calibrate sensors with `/calibrate` endpoint
- Adjust gesture thresholds in server configuration
- Check sensor data quality (noise, range)

## 🔍 Monitoring

### Real-time Monitoring
- Backend logs show gesture classifications in real-time
- Frontend status indicator shows connection state
- Use `/current-state` endpoint for debugging

### Performance
- WebSocket sends updates at ~100ms intervals
- Backend processes sensor data immediately
- Frontend renders gestures at 60fps

## 📈 Next Steps

### Production Deployment
- Use PM2 for backend process management
- Set up NGINX reverse proxy
- Configure SSL/HTTPS
- Add authentication for sensor endpoints

### Hardware Integration
- Implement calibration procedures
- Add sensor fusion algorithms
- Support multiple glove devices
- Add haptic feedback

### Advanced Features
- Machine learning gesture classification
- Custom gesture training
- Multi-user support
- Gesture recording/playback