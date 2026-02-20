const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create HTTP server to serve static files
const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
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

    addPlayer(ws, playerName) {
        if (this.players.length >= 2) return false;
        
        const playerNum = this.players.length + 1;
        const player = {
            ws,
            name: playerName,
            number: playerNum
        };
        
        this.players.push(player);
        ws.room = this;
        ws.playerNumber = playerNum;
        
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
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }

    handleMove(ws, data) {
        if (ws.playerNumber !== this.gameState.currentPlayer) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not your turn!' }));
            return;
        }

        if (this.gameState.phase === 'placement') {
            this.handlePlacement(ws, data);
        } else if (this.gameState.phase === 'battle') {
            this.handleBattle(ws, data);
        }
    }

    handlePlacement(ws, data) {
        const { row, col, isHorizontal } = data;
        const board = ws.playerNumber === 1 ? this.gameState.p1Board : this.gameState.p2Board;
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
                if (ws.playerNumber === 1) {
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
                    playerNumber: ws.playerNumber,
                    board: ws.playerNumber === 1 ? this.gameState.p1Board : this.gameState.p2Board,
                    nextShipSize: this.gameState.shipSizes[this.gameState.currentShipIndex]
                });
            }
        } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Cannot place ship there!' }));
        }
    }

    handleBattle(ws, data) {
        const { row, col } = data;
        const targetBoard = ws.playerNumber === 1 ? this.gameState.p2Board : this.gameState.p1Board;

        if (targetBoard[row][col] > 1) {
            ws.send(JSON.stringify({ type: 'error', message: 'Already fired at this location!' }));
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
            playerNumber: ws.playerNumber,
            row,
            col,
            hit,
            gameOver,
            targetBoard: targetBoard,
            nextPlayer: gameOver ? ws.playerNumber : (ws.playerNumber === 1 ? 2 : 1)
        });

        if (!gameOver) {
            this.gameState.currentPlayer = ws.playerNumber === 1 ? 2 : 1;
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
