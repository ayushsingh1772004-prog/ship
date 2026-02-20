// --- 1. GAME CONSTANTS AND VARIABLES ---
const ROWS = 7;
const COLS = 9;
const SHIP_SIZES = [5, 4, 3, 3, 2];

// Multiplayer state
let ws = null;
let playerNumber = null;
let roomCode = null;
let isConnected = false;

// Game state
let gameState = {
    phase: 'lobby', // lobby, placement, battle
    currentPlayer: 1,
    currentShipIndex: 0,
    isHorizontal: true,
    myBoard: Array(ROWS).fill().map(() => Array(COLS).fill(0)),
    enemyBoard: Array(ROWS).fill().map(() => Array(COLS).fill(0)),
    myTurn: false
};

// --- 2. WEBSOCKET CONNECTION ---
function connectToServer() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to server');
        isConnected = true;
        hideOverlay();
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        isConnected = false;
        showOverlay('CONNECTION LOST', 'Trying to reconnect...');
        setTimeout(connectToServer, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showOverlay('CONNECTION ERROR', 'Failed to connect to server');
    };
}

// --- 3. SERVER MESSAGE HANDLING ---
function handleServerMessage(data) {
    switch (data.type) {
        case 'roomCreated':
            roomCode = data.roomCode;
            playerNumber = data.playerNumber;
            showRoomInfo();
            break;
            
        case 'roomJoined':
            roomCode = data.roomCode;
            playerNumber = data.playerNumber;
            showRoomInfo();
            break;
            
        case 'playerJoined':
            updatePlayerCount(data.totalPlayers);
            if (data.totalPlayers === 2) {
                document.getElementById('connection-status').textContent = 'Opponent connected! Starting game...';
            }
            break;
            
        case 'gameStart':
            gameState.phase = 'placement';
            gameState.myTurn = (data.playerNumber === playerNumber);
            setTimeout(() => {
                showGameScreen();
                initializeGame();
            }, 1000);
            break;
            
        case 'placementComplete':
            if (data.nextPlayer === playerNumber) {
                gameState.myTurn = true;
                gameState.currentShipIndex = 0;
                updateInstruction();
            }
            break;
            
        case 'shipPlaced':
            if (data.playerNumber === playerNumber) {
                gameState.myBoard = data.board;
                gameState.currentShipIndex++;
                updateInstruction();
            }
            refreshVisuals();
            break;
            
        case 'battleStart':
            gameState.phase = 'battle';
            gameState.myTurn = (data.playerNumber === playerNumber);
            showBattlePhase();
            break;
            
        case 'shotFired':
            const isMyBoard = (data.playerNumber !== playerNumber);
            const targetBoard = isMyBoard ? gameState.myBoard : gameState.enemyBoard;
            
            // Update the board with shot result
            if (data.hit) {
                targetBoard[data.row][data.col] = 3; // Hit
            } else {
                targetBoard[data.row][data.col] = 2; // Miss
            }
            
            if (isMyBoard) {
                gameState.myBoard = targetBoard;
            } else {
                gameState.enemyBoard = targetBoard;
            }
            
            refreshVisuals();
            
            if (data.gameOver) {
                showGameOver(data.playerNumber === playerNumber);
            } else {
                gameState.myTurn = (data.nextPlayer === playerNumber);
                updateInstruction();
            }
            break;
            
        case 'error':
            alert(data.message);
            break;
    }
}

// --- 4. UI MANAGEMENT ---
function showOverlay(title, message) {
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-message').textContent = message;
    document.getElementById('connection-overlay').classList.remove('hidden');
}

function hideOverlay() {
    document.getElementById('connection-overlay').classList.add('hidden');
}

function showRoomInfo() {
    document.getElementById('room-info').classList.remove('hidden');
    document.getElementById('current-room-code').textContent = roomCode;
    document.getElementById('player-count').textContent = '1';
}

function updatePlayerCount(count) {
    document.getElementById('player-count').textContent = count;
}

function showGameScreen() {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('game-room-code').textContent = roomCode;
}

function showBattlePhase() {
    document.getElementById('p1-area').querySelector('h3').textContent = 'Your Ocean';
    document.getElementById('p2-area').classList.remove('hidden');
    updateInstruction();
}

function showGameOver(won) {
    const message = won ? 'YOU WIN!' : 'YOU LOSE!';
    document.getElementById('instruction-text').textContent = message;
    gameState.phase = 'gameOver';
}

// --- 5. GAME INITIALIZATION ---
function initializeGame() {
    createGrid('p1');
    createGrid('p2');
    updateInstruction();
    refreshVisuals();
}

function createGrid(playerId) {
    const gridElement = document.getElementById(`${playerId}-grid`);
    gridElement.innerHTML = ''; // Clear existing grid
    
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.addEventListener("click", () => handleCellClick(r, c));
            gridElement.appendChild(cell);
        }
    }
}

// --- 6. GAME LOGIC ---
function handleCellClick(r, c) {
    if (!isConnected) return;
    
    if (gameState.phase === 'placement' && gameState.myTurn) {
        sendPlacementMove(r, c);
    } else if (gameState.phase === 'battle' && gameState.myTurn) {
        // Only allow clicking on enemy board during battle
        if (event.target.closest('#p2-grid')) {
            sendBattleMove(r, c);
        }
    }
}

function sendPlacementMove(r, c) {
    ws.send(JSON.stringify({
        type: 'gameMove',
        row: r,
        col: c,
        isHorizontal: gameState.isHorizontal
    }));
}

function sendBattleMove(r, c) {
    ws.send(JSON.stringify({
        type: 'gameMove',
        row: r,
        col: c
    }));
}

function refreshVisuals() {
    // Update my board (p1-grid)
    const myCells = document.querySelectorAll('#p1-grid .cell');
    myCells.forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        const value = gameState.myBoard[r][c];
        
        cell.className = "cell";
        if (value === 1 && gameState.phase === 'placement') cell.classList.add("ship");
        if (value === 2) cell.classList.add("miss");
        if (value === 3) cell.classList.add("hit");
    });
    
    // Update enemy board (p2-grid) - only show hits and misses
    const enemyCells = document.querySelectorAll('#p2-grid .cell');
    enemyCells.forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        const value = gameState.enemyBoard[r][c];
        
        cell.className = "cell";
        if (value === 2) cell.classList.add("miss");
        if (value === 3) cell.classList.add("hit");
        // Never show enemy ships
    });
}

function updateInstruction() {
    const text = document.getElementById("instruction-text");
    const status = document.getElementById("game-status");
    
    if (gameState.phase === 'placement') {
        if (gameState.myTurn) {
            text.innerText = `Place Ship (Size ${SHIP_SIZES[gameState.currentShipIndex]})`;
            status.innerText = "Mode: Placement - Your turn";
        } else {
            text.innerText = "Waiting for opponent...";
            status.innerText = "Mode: Placement - Opponent's turn";
        }
    } else if (gameState.phase === 'battle') {
        if (gameState.myTurn) {
            text.innerText = "Fire at the enemy!";
            status.innerText = "Mode: Battle - Your turn";
        } else {
            text.innerText = "Waiting for opponent's move...";
            status.innerText = "Mode: Battle - Opponent's turn";
        }
    }
}

// --- 7. LOBBY MANAGEMENT ---
function createRoom() {
    const playerName = document.getElementById('player-name').value.trim();
    if (!playerName) {
        alert('Please enter your name');
        return;
    }
    
    if (!isConnected) {
        alert('Not connected to server');
        return;
    }
    
    ws.send(JSON.stringify({
        type: 'createRoom',
        playerName: playerName
    }));
}

function joinRoom() {
    const playerName = document.getElementById('player-name').value.trim();
    const roomCodeInput = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!playerName || !roomCodeInput) {
        alert('Please enter your name and room code');
        return;
    }
    
    if (!isConnected) {
        alert('Not connected to server');
        return;
    }
    
    ws.send(JSON.stringify({
        type: 'joinRoom',
        playerName: playerName,
        roomCode: roomCodeInput
    }));
}

function leaveRoom() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    location.reload();
}

// --- 8. EVENT LISTENERS ---
document.getElementById('create-room-btn').addEventListener('click', createRoom);
document.getElementById('join-room-btn').addEventListener('click', joinRoom);
document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);

document.getElementById('rotate-btn').addEventListener('click', () => {
    gameState.isHorizontal = !gameState.isHorizontal;
    document.getElementById('rotate-btn').innerText = 
        `Orientation: ${gameState.isHorizontal ? 'Horizontal' : 'Vertical'}`;
});

// Allow Enter key to create/join room
document.getElementById('player-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const roomCodeInput = document.getElementById('room-code').value.trim();
        if (roomCodeInput) {
            joinRoom();
        } else {
            createRoom();
        }
    }
});

document.getElementById('room-code').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoom();
    }
});

// --- 9. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    connectToServer();
});
