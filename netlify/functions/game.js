// In-memory storage for rooms (persists during warm starts, resets on cold starts)
// For production, you'd use a database like Redis, Firestore, or Supabase
let rooms = new Map();
let roomTimers = new Map();

// Generate random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Room class
class GameRoom {
    constructor(roomCode) {
        this.code = roomCode;
        this.players = [];
        this.gameState = {
            currentPlayer: 1,
            phase: 'waiting',
            p1Board: Array(7).fill().map(() => Array(9).fill(0)),
            p2Board: Array(7).fill().map(() => Array(9).fill(0)),
            currentShipIndex: 0,
            shipSizes: [5, 4, 3, 3, 2],
            p1ShipsPlaced: false,
            p2ShipsPlaced: false,
            lastUpdate: Date.now()
        };
    }

    addPlayer(playerId, playerName) {
        if (this.players.length >= 2) return false;
        
        const playerNum = this.players.length + 1;
        const player = {
            id: playerId,
            name: playerName,
            number: playerNum,
            lastSeen: Date.now()
        };
        
        this.players.push(player);
        this.gameState.lastUpdate = Date.now();
        
        if (this.players.length === 2) {
            this.gameState.phase = 'placement';
        }
        
        return true;
    }

    handleMove(playerId, data) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return { error: 'Player not found' };
        
        if (player.number !== this.gameState.currentPlayer) {
            return { error: 'Not your turn!' };
        }

        if (this.gameState.phase === 'placement') {
            return this.handlePlacement(player, data);
        } else if (this.gameState.phase === 'battle') {
            return this.handleBattle(player, data);
        }
    }

    handlePlacement(player, data) {
        const { row, col, isHorizontal } = data;
        const board = player.number === 1 ? this.gameState.p1Board : this.gameState.p2Board;
        const size = this.gameState.shipSizes[this.gameState.currentShipIndex];

        if (this.canPlaceShip(board, row, col, size, isHorizontal)) {
            for (let i = 0; i < size; i++) {
                if (isHorizontal) {
                    board[row][col + i] = 1;
                } else {
                    board[row + i][col] = 1;
                }
            }

            this.gameState.currentShipIndex++;
            this.gameState.lastUpdate = Date.now();

            if (this.gameState.currentShipIndex >= this.gameState.shipSizes.length) {
                if (player.number === 1) {
                    this.gameState.p1ShipsPlaced = true;
                    this.gameState.currentShipIndex = 0;
                    this.gameState.currentPlayer = 2;
                } else {
                    this.gameState.p2ShipsPlaced = true;
                    if (this.gameState.p1ShipsPlaced && this.gameState.p2ShipsPlaced) {
                        this.gameState.phase = 'battle';
                        this.gameState.currentPlayer = 1;
                    }
                }
            }

            return { success: true, gameState: this.gameState };
        }
        
        return { error: 'Cannot place ship there!' };
    }

    handleBattle(player, data) {
        const { row, col } = data;
        const targetBoard = player.number === 1 ? this.gameState.p2Board : this.gameState.p1Board;

        if (targetBoard[row][col] > 1) {
            return { error: 'Already fired at this location!' };
        }

        let hit = false;
        if (targetBoard[row][col] === 1) {
            targetBoard[row][col] = 3; // Hit
            hit = true;
        } else {
            targetBoard[row][col] = 2; // Miss
        }

        const gameOver = !targetBoard.some(row => row.includes(1));
        this.gameState.lastUpdate = Date.now();

        if (!gameOver) {
            this.gameState.currentPlayer = player.number === 1 ? 2 : 1;
        }

        return { 
            success: true, 
            hit, 
            gameOver, 
            targetBoard, 
            nextPlayer: gameOver ? player.number : this.gameState.currentPlayer,
            gameState: this.gameState 
        };
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

exports.handler = async (event, context) => {
    const { httpMethod, body, rawPath, path, resource, requestContext } = event;
    
    // Get the actual path - netlify uses 'rawPath' in newer versions
    const actualPath = rawPath || path || '';
    const pathname = new URL(`http://example.com${actualPath}`).pathname;
    
    // Parse body - it might be a string or already parsed
    let data = {};
    if (body) {
        if (typeof body === 'string') {
            try {
                data = JSON.parse(body);
            } catch (e) {
                console.error('Failed to parse body:', body);
            }
        } else {
            data = body;
        }
    }
    
    console.log(`${httpMethod} ${pathname}`, { body, data });
    
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        // Handle POST requests (create room, join room, make moves)
        // Match patterns: /.netlify/functions/game, /game, /api/game
        if (httpMethod === 'POST' && (pathname.includes('game'))) {
            const { type, roomCode, playerName, playerId } = data;
            
            if (type === 'createRoom') {
                const newRoomCode = generateRoomCode();
                const room = new GameRoom(newRoomCode);
                rooms.set(newRoomCode, room);
                
                const newPlayerId = `p1_${Date.now()}`;
                room.addPlayer(newPlayerId, playerName);
                
                console.log(`Room created: ${newRoomCode}`);
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        type: 'roomCreated',
                        roomCode: newRoomCode,
                        playerNumber: 1,
                        playerId: newPlayerId
                    })
                };
            }
            
            else if (type === 'joinRoom') {
                const room = rooms.get(roomCode);
                if (!room || room.players.length >= 2) {
                    console.log(`Could not join room ${roomCode}, exists:${!!room}, players:${room?.players.length}`);
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ error: 'Room not found or full' })
                    };
                }
                
                const newPlayerId = `p2_${Date.now()}`;
                room.addPlayer(newPlayerId, playerName);
                
                console.log(`Player joined room: ${roomCode}`);
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        type: 'roomJoined',
                        roomCode,
                        playerNumber: room.players.length,
                        playerId: newPlayerId,
                        gameState: room.gameState
                    })
                };
            }
            
            else if (type === 'gameMove') {
                const room = rooms.get(roomCode);
                if (!room) {
                    console.log(`Room not found for move: ${roomCode}`);
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ error: 'Room not found' })
                    };
                }
                
                const result = room.handleMove(playerId, data);
                
                if (result.error) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ type: 'error', message: result.error })
                    };
                }
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        type: 'moveResult',
                        ...result
                    })
                };
            }
            
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid request type' })
            };
        }
        
        // Handle GET requests (poll for game state)
        // Match patterns for GET requests with room code
        else if (httpMethod === 'GET' && pathname.includes('game')) {
            const pathParts = pathname.split('/').filter(p => p && p !== 'netlify' && p !== 'functions');
            const roomCode = pathParts[pathParts.length - 1];
            
            console.log(`Polling for room: ${roomCode}`);
            
            const room = rooms.get(roomCode);
            
            if (!room) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Room not found' })
                };
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    gameState: room.gameState,
                    players: room.players.map(p => ({ id: p.id, name: p.name, number: p.number }))
                })
            };
        }
        
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
        
    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error', message: error.message })
        };
    }
};
            
            if (type === 'createRoom') {
                const newRoomCode = generateRoomCode();
                const room = new GameRoom(newRoomCode);
                rooms.set(newRoomCode, room);
                
                const newPlayerId = `p1_${Date.now()}`;
                room.addPlayer(newPlayerId, playerName);
                
                console.log(`Room created: ${newRoomCode}`);
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        type: 'roomCreated',
                        roomCode: newRoomCode,
                        playerNumber: 1,
                        playerId: newPlayerId
                    })
                };
            }
            
            else if (type === 'joinRoom') {
                const room = rooms.get(roomCode);
                if (!room || room.players.length >= 2) {
                    console.log(`Could not join room ${roomCode}, exists:${!!room}, players:${room?.players.length}`);
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ error: 'Room not found or full' })
                    };
                }
                
                const newPlayerId = `p2_${Date.now()}`;
                room.addPlayer(newPlayerId, playerName);
                
                console.log(`Player joined room: ${roomCode}`);
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        type: 'roomJoined',
                        roomCode,
                        playerNumber: room.players.length,
                        playerId: newPlayerId,
                        gameState: room.gameState
                    })
                };
            }
            
            else if (type === 'gameMove') {
                const room = rooms.get(roomCode);
                if (!room) {
                    console.log(`Room not found for move: ${roomCode}`);
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ error: 'Room not found' })
                    };
                }
                
                const result = room.handleMove(playerId, data);
                
                if (result.error) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ type: 'error', message: result.error })
                    };
                }
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        type: 'moveResult',
                        ...result
                    })
                };
            }
            
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid request type' })
            };
        }
        
        // Handle GET requests (poll for game state)
        else if (httpMethod === 'GET' && (actualPath.startsWith('/.netlify/functions/game/') || actualPath.startsWith('/game/'))) {
            const pathParts = actualPath.split('/').filter(p => p);
            const roomCode = pathParts[pathParts.length - 1];
            
            console.log(`Polling for room: ${roomCode}`);
            
            const room = rooms.get(roomCode);
            
            if (!room) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Room not found' })
                };
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    gameState: room.gameState,
                    players: room.players.map(p => ({ id: p.id, name: p.name, number: p.number }))
                })
            };
        }
        
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
        
    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error', message: error.message })
        };
    }
};
