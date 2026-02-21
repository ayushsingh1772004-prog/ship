// --- 1. GAME CONSTANTS AND VARIABLES ---
const ROWS = 7;
const COLS = 9;
const SHIP_SIZES = [5, 4, 3, 3, 2];

// Netlify-specific state
let playerNumber = null;
let roomCode = null;
let playerId = null;
let isConnected = false;
let pollInterval = null;

// Game state
let gameState = {
    phase: 'lobby',
    currentPlayer: 1,
    currentShipIndex: 0,
    isHorizontal: true,
    myBoard: Array(ROWS).fill().map(() => Array(COLS).fill(0)),
    enemyBoard: Array(ROWS).fill().map(() => Array(COLS).fill(0)),
    myTurn: false
};

// --- 2. NETLIFY API COMMUNICATION ---
async function apiCall(endpoint, data = {}) {
    try {
        const response = await fetch(`/.netlify/functions/game${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API call failed');
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

async function getGameState() {
    try {
        const response = await fetch(`/.netlify/functions/game/${roomCode}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('Get game state error:', error);
    }
    return null;
}

// --- 3. CONNECTION MANAGEMENT ---
async function connectToServer() {
    console.log('Connecting to Netlify functions...');
    isConnected = true;
    hideOverlay();
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    
    pollInterval = setInterval(async () => {
        if (!roomCode || gameState.phase === 'lobby') return;
        
        const state = await getGameState();
        if (state && state.gameState) {
            updateGameState(state.gameState);
        }
    }, 2000);
}

function updateGameState(serverState) {
    // Update local game state based on server state
    if (serverState.phase === 'placement' && gameState.phase === 'placement') {
        if (serverState.currentPlayer === playerNumber && !gameState.myTurn) {
            gameState.myTurn = true;
            gameState.currentShipIndex = serverState.currentShipIndex;
            updateInstruction();
        }
    } else if (serverState.phase === 'battle' && gameState.phase !== 'battle') {
        gameState.phase = 'battle';
        showBattlePhase();
    } else if (serverState.phase === 'battle') {
        if (serverState.currentPlayer === playerNumber && !gameState.myTurn) {
            gameState.myTurn = true;
            updateInstruction();
        }
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
    startPolling();
}

function createGrid(playerId) {
    const gridElement = document.getElementById(`${playerId}-grid`);
    gridElement.innerHTML = '';
    
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
async function handleCellClick(r, c) {
    if (!isConnected) return;
    
    if (gameState.phase === 'placement' && gameState.myTurn) {
        await sendPlacementMove(r, c);
    } else if (gameState.phase === 'battle' && gameState.myTurn) {
        if (event.target.closest('#p2-grid')) {
            await sendBattleMove(r, c);
        }
    }
}

async function sendPlacementMove(r, c) {
    try {
        const result = await apiCall('', {
            type: 'gameMove',
            roomCode,
            playerId,
            row: r,
            col: c,
            isHorizontal: gameState.isHorizontal
        });
        
        if (result.success) {
            // Update local board
            const size = SHIP_SIZES[gameState.currentShipIndex];
            for (let i = 0; i < size; i++) {
                if (gameState.isHorizontal) {
                    gameState.myBoard[r][c + i] = 1;
                } else {
                    gameState.myBoard[r + i][c] = 1;
                }
            }
            
            gameState.currentShipIndex++;
            gameState.myTurn = false;
            refreshVisuals();
            updateInstruction();
        } else if (result.error) {
            alert(result.error);
        }
    } catch (error) {
        alert('Failed to place ship: ' + error.message);
    }
}

async function sendBattleMove(r, c) {
    try {
        const result = await apiCall('', {
            type: 'gameMove',
            roomCode,
            playerId,
            row: r,
            col: c
        });
        
        if (result.success) {
            // Update enemy board with shot result
            if (result.hit) {
                gameState.enemyBoard[r][c] = 3;
            } else {
                gameState.enemyBoard[r][c] = 2;
            }
            
            gameState.myTurn = false;
            refreshVisuals();
            updateInstruction();
            
            if (result.gameOver) {
                showGameOver(result.nextPlayer === playerNumber);
            }
        } else if (result.error) {
            alert(result.error);
        }
    } catch (error) {
        alert('Failed to fire shot: ' + error.message);
    }
}

function refreshVisuals() {
    // Update my board
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
    
    // Update enemy board
    const enemyCells = document.querySelectorAll('#p2-grid .cell');
    enemyCells.forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        const value = gameState.enemyBoard[r][c];
        
        cell.className = "cell";
        if (value === 2) cell.classList.add("miss");
        if (value === 3) cell.classList.add("hit");
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
async function createRoom() {
    const playerName = document.getElementById('player-name').value.trim();
    if (!playerName) {
        alert('Please enter your name');
        return;
    }
    
    try {
        const result = await apiCall('', {
            type: 'createRoom',
            playerName: playerName
        });
        
        roomCode = result.roomCode;
        playerNumber = result.playerNumber;
        playerId = result.playerId;
        
        showRoomInfo();
        
        // Wait for second player
        setTimeout(() => {
            checkGameStart();
        }, 2000);
        
    } catch (error) {
        alert('Failed to create room: ' + error.message);
    }
}

async function joinRoom() {
    const playerName = document.getElementById('player-name').value.trim();
    const roomCodeInput = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!playerName || !roomCodeInput) {
        alert('Please enter your name and room code');
        return;
    }
    
    try {
        const result = await apiCall('', {
            type: 'joinRoom',
            playerName: playerName,
            roomCode: roomCodeInput
        });
        
        roomCode = result.roomCode;
        playerNumber = result.playerNumber;
        playerId = result.playerId;
        
        showRoomInfo();
        showGameScreen();
        initializeGame();
        
    } catch (error) {
        alert('Failed to join room: ' + error.message);
    }
}

async function checkGameStart() {
    const state = await getGameState();
    if (state && state.gameState.phase === 'placement') {
        showGameScreen();
        initializeGame();
        gameState.myTurn = (state.gameState.currentPlayer === playerNumber);
        updateInstruction();
    } else {
        setTimeout(checkGameStart, 2000);
    }
}

function leaveRoom() {
    if (pollInterval) clearInterval(pollInterval);
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
