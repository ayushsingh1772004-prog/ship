# Ship Battle - Netlify Deployment

This version is specifically configured for Netlify deployment using serverless functions.

## Deployment Instructions

### 1. Install Netlify CLI
```bash
npm install -g netlify-cli
```

### 2. Deploy to Netlify
```bash
netlify deploy --prod
```

Or connect your GitHub repository to Netlify for automatic deployments.

## How It Works

### Netlify-Specific Features
- **Serverless Functions**: Uses Netlify Functions for game logic
- **No WebSocket Required**: Works entirely with HTTP requests
- **Polling System**: Checks for game updates every 2 seconds
- **In-Memory Storage**: Game state stored in function memory (resets on cold start)

### Limitations
- **State Persistence**: Game state resets when functions go cold (≈15 minutes of inactivity)
- **Concurrent Games**: Limited by function memory (suitable for casual play)
- **Real-time Updates**: Uses polling instead of real-time WebSocket

### File Structure
```
├── netlify/
│   └── functions/
│       └── game.js          # Serverless function
├── public/
│   ├── index.html           # Game interface
│   ├── style.css           # Styles
│   ├── script.js           # Netlify-specific client
│   └── _redirects         # Netlify redirects
├── netlify.toml           # Netlify configuration
└── package.json           # Dependencies
```

## Game Flow

1. **Create Room**: Generates room code and player ID
2. **Join Room**: Second player joins with room code
3. **Game Start**: Both players place ships
4. **Battle Phase**: Take turns firing at enemy
5. **Win Condition**: First to sink all ships wins

## API Endpoints

### POST `/.netlify/functions/game`
- `createRoom`: Create new game room
- `joinRoom`: Join existing room
- `gameMove`: Make game move (place ship or fire)

### GET `/.netlify/functions/game/{roomCode}`
- Get current game state and player info

## Environment Variables (Optional)

Set these in Netlify dashboard for production:
- `NODE_ENV`: "production"

## Testing Locally

```bash
# Install dependencies
npm install

# Start local development server
netlify dev

# Open http://localhost:8888
```

## Production Considerations

For a production-ready version with persistent state:
1. Add a database (Redis, Firestore, etc.)
2. Implement proper session management
3. Add authentication
4. Scale with multiple function instances
