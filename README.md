# Ship Battle - Multiplayer

A two-player ship battle game that can be played over the internet using WebSockets.

## How to Run

### Prerequisites
- Node.js installed on your system

### Setup
1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## How to Play

### Creating a Game
1. Enter your name in the lobby
2. Click "Create Room" to generate a room code
3. Share the room code with your friend

### Joining a Game
1. Enter your name
2. Enter the room code provided by your friend
3. Click "Join Room"

### Game Rules
1. **Placement Phase**: Take turns placing your 5 ships (sizes: 5, 4, 3, 3, 2)
2. **Battle Phase**: Take turns firing at the enemy's ocean
3. First player to sink all enemy ships wins!

### Controls
- Click on your ocean to place ships during placement phase
- Use the "Orientation" button to toggle between horizontal/vertical placement
- Click on the enemy ocean to fire during battle phase

## Features
- Real-time multiplayer gameplay
- Room-based matchmaking system
- Automatic reconnection on connection loss
- Responsive design for mobile and desktop
- Turn-based gameplay with clear visual feedback

## Technical Details
- Built with vanilla JavaScript, HTML5, and CSS3
- Uses WebSockets for real-time communication
- Node.js server with WebSocket library
- No external frontend frameworks required
