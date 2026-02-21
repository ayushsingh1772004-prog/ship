const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create HTTP server to serve static files and handle API requests
const server = http.createServer((req, res) => {
    const url = req.url;
    const method = req.method;
    
    // Handle API endpoints
    if (url.startsWith('/api/')) {
        handleApiRequest(req, res);
        return;
    }
    
    // Serve static files
    let filePath = path.join(__dirname, url === '/' ? 'index.html' : url);
    const extname = path.extname(filePath);
    let contentType = 'text/html';

    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Handle API requests for polling fallback
function handleApiRequest(req, res) {
    const url = req.url;
    const method = req.method;
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (url.startsWith('/api/game/') && method === 'GET') {
        // Polling endpoint
        const parts = url.split('/');
        const roomCode = parts[3];
        const playerNum = new URL(url, `http://${req.headers.host}`).searchParams.get('player');
        
        const room = rooms.get(roomCode);
        if (room) {
            // Get pending messages for this player
            const player = room.players.find(p => p.number === parseInt(playerNum));
            if (player) {
                const messages = player.pendingMessages || [];
                player.pendingMessages = []; // Clear messages after sending
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ messages }));
            } else {
                res.writeHead(404);
                res.end('Player not found');
            }
        } else {
            res.writeHead(404);
            res.end('Room not found');
        }
    } else if (url === '/api/game' && method === 'POST') {
        // Handle game moves via HTTP
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                handleHttpGameMove(data, res);
            } catch (error) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
    } else {
        res.writeHead(404);
        res.end('API endpoint not found');
    }
}

// Handle HTTP game moves (for polling fallback)
function handleHttpGameMove(data, res) {
    const { type, roomCode, playerName } = data;
    
    if (type === 'createRoom') {
        const newRoomCode = generateRoomCode();
        const room = new GameRoom(newRoomCode);
        rooms.set(newRoomCode, room);
        
        if (room.addPlayer(null, playerName, true)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                type: 'roomCreated',
                roomCode: newRoomCode,
                playerNumber: 1
            }));
        } else {
            res.writeHead(500);
            res.end('Failed to create room');
        }
    } else if (type === 'joinRoom') {
        const targetRoom = rooms.get(roomCode);
        if (targetRoom && targetRoom.players.length < 2) {
            if (targetRoom.addPlayer(null, playerName, true)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    type: 'roomJoined',
                    roomCode: roomCode,
                    playerNumber: targetRoom.players.length
                }));
            } else {
                res.writeHead(500);
                res.end('Failed to join room');
            }
        } else {
            res.writeHead(404);
            res.end('Room not found or full');
        }
    } else if (type === 'gameMove') {
        // Find the room and handle the move
        for (const [code, room] of rooms) {
            const player = room.players.find(p => p.isHttp);
            if (player) {
                room.handleMove(null, data, true);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
                return;
            }
        }
        res.writeHead(404);
        res.end('Room not found');
    } else {
        res.writeHead(400);
        res.end('Invalid request type');
    }
}

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Game rooms management
const rooms = new Map();

// Generate random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Room class to manage game state
class GameRoom {
    constructor(roomCode) {
        this.code = roomCode;
        this.players = [];
        this.gameState = {
            currentPlayer: 1,
            phase: 'waiting', // waiting, placement, battle
            p1Board: Array(7).fill().map(() => Array(9).fill(0)),
            p2Board: Array(7).fill().map(() => Array(9).fill(0)),
            currentShipIndex: 0,
            shipSizes: [5, 4, 3, 3, 2],
            p1ShipsPlaced: false,
            p2ShipsPlaced: false
        };
    }

    addPlayer(ws, playerName, isHttp = false) {
        if (this.players.length >= 2) return false;
        
        const playerNum = this.players.length + 1;
        const player = {
            ws,
            name: playerName,
            number: playerNum,
            isHttp,
            pendingMessages: []
        };
        
        this.players.push(player);
        if (!isHttp) {
            ws.room = this;
            ws.playerNumber = playerNum;
        }
        
        // Notify all players in room
        this.broadcast({
            type: 'playerJoined',
            playerNum,
            playerName,
            totalPlayers: this.players.length
        });

        // Start game if room is full
        if (this.players.length === 2) {
            this.gameState.phase = 'placement';
            this.broadcast({
                type: 'gameStart',
                playerNumber: 1
            });
        }

        return true;
    }

    removePlayer(ws) {
        const index = this.players.findIndex(p => p.ws === ws);
        if (index !== -1) {
            this.players.splice(index, 1);
            this.broadcast({
                type: 'playerLeft',
                message: `Player ${ws.playerNumber} disconnected`
            });
        }
    }

    broadcast(message) {
        this.players.forEach(player => {
            if (player.isHttp) {
                // Store message for HTTP polling
                if (!player.pendingMessages) player.pendingMessages = [];
                player.pendingMessages.push(message);
            } else if (player.ws && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }

    handleMove(ws, data, isHttp = false) {
        const player = this.players.find(p => 
            isHttp ? p.isHttp : p.ws === ws
        );
        
        if (!player) return;
        
        if (player.number !== this.gameState.currentPlayer) {
            if (!isHttp) {
                ws.send(JSON.stringify({ type: 'error', message: 'Not your turn!' }));
            }
            return;
        }

        if (this.gameState.phase === 'placement') {
            this.handlePlacement(player, data);
        } else if (this.gameState.phase === 'battle') {
            this.handleBattle(player, data);
        }
    }

    handlePlacement(player, data) {
        const { row, col, isHorizontal } = data;
        const board = player.number === 1 ? this.gameState.p1Board : this.gameState.p2Board;
        const size = this.gameState.shipSizes[this.gameState.currentShipIndex];

        if (this.canPlaceShip(board, row, col, size, isHorizontal)) {
            // Place the ship
            for (let i = 0; i < size; i++) {
                if (isHorizontal) {
                    board[row][col + i] = 1;
                } else {
                    board[row + i][col] = 1;
                }
            }

            // Update game state
            this.gameState.currentShipIndex++;

            // Check if current player finished placing ships
            if (this.gameState.currentShipIndex >= this.gameState.shipSizes.length) {
                if (player.number === 1) {
                    this.gameState.p1ShipsPlaced = true;
                    this.gameState.currentShipIndex = 0;
                    this.gameState.currentPlayer = 2;
                    
                    this.broadcast({
                        type: 'placementComplete',
                        playerNumber: 1,
                        nextPlayer: 2
                    });
                } else {
                    this.gameState.p2ShipsPlaced = true;
                    
                    if (this.gameState.p1ShipsPlaced && this.gameState.p2ShipsPlaced) {
                        this.gameState.phase = 'battle';
                        this.gameState.currentPlayer = 1;
                        this.gameState.currentShipIndex = 0;
                        
                        this.broadcast({
                            type: 'battleStart',
                            playerNumber: 1
                        });
                    }
                }
            } else {
                this.broadcast({
                    type: 'shipPlaced',
                    playerNumber: player.number,
                    board: player.number === 1 ? this.gameState.p1Board : this.gameState.p2Board,
                    nextShipSize: this.gameState.shipSizes[this.gameState.currentShipIndex]
                });
            }
        } else {
            if (!player.isHttp) {
                player.ws.send(JSON.stringify({ type: 'error', message: 'Cannot place ship there!' }));
            }
        }
    }

    handleBattle(player, data) {
        const { row, col } = data;
        const targetBoard = player.number === 1 ? this.gameState.p2Board : this.gameState.p1Board;

        if (targetBoard[row][col] > 1) {
            if (!player.isHttp) {
                player.ws.send(JSON.stringify({ type: 'error', message: 'Already fired at this location!' }));
            }
            return;
        }

        let hit = false;
        if (targetBoard[row][col] === 1) {
            targetBoard[row][col] = 3; // Hit
            hit = true;
        } else {
            targetBoard[row][col] = 2; // Miss
        }

        // Check for game over
        const gameOver = !targetBoard.some(row => row.includes(1));

        this.broadcast({
            type: 'shotFired',
            playerNumber: player.number,
            row,
            col,
            hit,
            gameOver,
            targetBoard: targetBoard,
            nextPlayer: gameOver ? player.number : (player.number === 1 ? 2 : 1)
        });

        if (!gameOver) {
            this.gameState.currentPlayer = player.number === 1 ? 2 : 1;
        }
    }

    canPlaceShip(board, row, col, size, isHorizontal) {
        if (isHorizontal) {
            if (col + size > 9) return false;
            for (let i = 0; i < size; i++) {
                if (board[row][col + i] === 1) return false;
            }
        } else {
            if (row + size > 7) return false;
            for (let i = 0; i < size; i++) {
                if (board[row + i][col] === 1) return false;
            }
        }
        return true;
    }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'createRoom':
                    const roomCode = generateRoomCode();
                    const room = new GameRoom(roomCode);
                    rooms.set(roomCode, room);
                    room.addPlayer(ws, data.playerName);
                    
                    ws.send(JSON.stringify({
                        type: 'roomCreated',
                        roomCode,
                        playerNumber: 1
                    }));
                    break;

                case 'joinRoom':
                    const targetRoom = rooms.get(data.roomCode);
                    if (targetRoom && targetRoom.players.length < 2) {
                        if (targetRoom.addPlayer(ws, data.playerName)) {
                            ws.send(JSON.stringify({
                                type: 'roomJoined',
                                roomCode: data.roomCode,
                                playerNumber: ws.playerNumber
                            }));
                        } else {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Room is full!'
                            }));
                        }
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room not found or full!'
                        }));
                    }
                    break;

                case 'gameMove':
                    if (ws.room) {
                        ws.room.handleMove(ws, data);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (ws.room) {
            ws.room.removePlayer(ws);
            // Clean up empty rooms
            if (ws.room.players.length === 0) {
                rooms.delete(ws.room.code);
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to play`);
});
