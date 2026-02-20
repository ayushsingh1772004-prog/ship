// --- 1. GAME CONSTANTS AND VARIABLES ---
const ROWS = 7;
const COLS = 9;
const SHIP_SIZES = [5, 4, 3, 3, 2]; // The 5 ships we need to place

let currentPlayer = 1;      // Start with Player 1
let gameState = "placement"; // Can be "placement" or "battle"
let currentShipIndex = 0;   // Which ship from SHIP_SIZES is being placed
let isHorizontal = true;    // Placement direction

// Grids: 0=water, 1=ship, 2=miss, 3=hit
let p1Board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
let p2Board = Array(ROWS).fill().map(() => Array(COLS).fill(0));

// --- 2. INITIALIZATION ---
function createGrid(playerNum) {
    const gridElement = document.getElementById(`p${playerNum}-grid`);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");
            // Store coordinates in the HTML element so we know where the user clicked
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.addEventListener("click", () => handleInput(r, c));
            gridElement.appendChild(cell);
        }
    }
}

// --- 3. CORE LOGIC FUNCTIONS ---

// Decides whether to place a ship or fire a shot based on the Game State
function handleInput(r, c) {
    if (gameState === "placement") {
        placeShip(r, c);
    } else {
        fireShot(r, c);
    }
}

function placeShip(r, c) {
    const board = (currentPlayer === 1) ? p1Board : p2Board;
    const size = SHIP_SIZES[currentShipIndex];

    // Check if the ship fits and isn't overlapping
    if (canPlace(board, r, c, size)) {
        for (let i = 0; i < size; i++) {
            if (isHorizontal) board[r][c + i] = 1;
            else board[r + i][c] = 1;
        }
        
        refreshVisuals();
        currentShipIndex++;

        // If all 5 ships are placed, move to next player or start battle
        if (currentShipIndex >= SHIP_SIZES.length) {
            if (currentPlayer === 1) startTransition(2, "Player 2: Place Ships");
            else {
                gameState = "battle";
                startTransition(1, "BATTLE BEGINS!");
            }
        } else {
            updateInstruction();
        }
    }
}

function fireShot(r, c) {
    // Current player attacks the OTHER player's board
    const targetBoard = (currentPlayer === 1) ? p2Board : p1Board;

    if (targetBoard[r][c] > 1) return; // Prevent clicking same spot twice

    if (targetBoard[r][c] === 1) {
        targetBoard[r][c] = 3; // Hit
        alert("DIRECT HIT!");
    } else {
        targetBoard[r][c] = 2; // Miss
        alert("YOU MISSED!");
    }

    if (checkGameOver(targetBoard)) {
        document.getElementById("instruction-text").innerText = `PLAYER ${currentPlayer} WINS!`;
        alert(`Congratulations Player ${currentPlayer}!`);
    } else {
        let nextPlayer = (currentPlayer === 1) ? 2 : 1;
        startTransition(nextPlayer, `Player ${nextPlayer}'s Turn`);
    }
}

// Check if a board has any ship pieces (1s) left
function checkGameOver(board) {
    return !board.some(row => row.includes(1));
}

// --- 4. UTILITY FUNCTIONS ---

function canPlace(board, r, c, size) {
    if (isHorizontal) {
        if (c + size > COLS) return false; // Out of bounds
        for (let i = 0; i < size; i++) if (board[r][c + i] === 1) return false; // Overlap
    } else {
        if (r + size > ROWS) return false;
        for (let i = 0; i < size; i++) if (board[r + i][c] === 1) return false;
    }
    return true;
}

function startTransition(nextPlayer, message) {
    const overlay = document.getElementById("pass-device-screen");
    const timerText = document.getElementById("countdown-timer");
    overlay.classList.remove("hidden");
    
    let seconds = 5;
    timerText.innerText = seconds;

    const interval = setInterval(() => {
        seconds--;
        timerText.innerText = seconds;
        if (seconds === 0) {
            clearInterval(interval);
            overlay.classList.add("hidden");
            switchTurns(nextPlayer);
        }
    }, 1000);
}

function switchTurns(nextPlayer) {
    currentPlayer = nextPlayer;
    currentShipIndex = 0;

    // Toggle which board container is visible
    document.getElementById("p1-area").classList.toggle("hidden", currentPlayer !== 1);
    document.getElementById("p2-area").classList.toggle("hidden", currentPlayer !== 2);

    updateInstruction();
    refreshVisuals();
}

function refreshVisuals() {
    const board = (currentPlayer === 1) ? p1Board : p2Board;
    const gridId = `p${currentPlayer}-grid`;
    const cells = document.querySelectorAll(`#${gridId} .cell`);

    cells.forEach(cell => {
        const r = cell.dataset.row;
        const c = cell.dataset.col;
        const value = board[r][c];
        
        cell.className = "cell"; // Reset
        if (value === 1 && gameState === "placement") cell.classList.add("ship");
        if (value === 2) cell.classList.add("miss");
        if (value === 3) cell.classList.add("hit");
    });
}

function updateInstruction() {
    const text = document.getElementById("instruction-text");
    if (gameState === "placement") {
        text.innerText = `Player ${currentPlayer}: Place Ship (Size ${SHIP_SIZES[currentShipIndex]})`;
    } else {
        text.innerText = `Player ${currentPlayer}: Fire at the enemy!`;
    }
}

// Orientation toggle button
document.getElementById("rotate-btn").addEventListener("click", (e) => {
    isHorizontal = !isHorizontal;
    e.target.innerText = `Orientation: ${isHorizontal ? "Horizontal" : "Vertical"}`;
});

// Run start
createGrid(1);
createGrid(2);
