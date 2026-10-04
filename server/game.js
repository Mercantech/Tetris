/**
 * Battle Tetris – multiplayer lobby game logic
 */

const COLS = 10;
const ROWS = 20;
const HIDDEN = 2;
const TOTAL_ROWS = ROWS + HIDDEN;

const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const COLORS = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#0000f0',
  L: '#f0a000',
  G: '#888888',
};

/** 4 rotation states as list of [row,col] offsets from pivot */
const SHAPES = {
  I: [
    [[0, -1], [0, 0], [0, 1], [0, 2]],
    [[-1, 0], [0, 0], [1, 0], [2, 0]],
    [[0, -1], [0, 0], [0, 1], [0, 2]],
    [[-1, 0], [0, 0], [1, 0], [2, 0]],
  ],
  O: [
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
  ],
  T: [
    [[0, -1], [0, 0], [0, 1], [1, 0]],
    [[-1, 0], [0, 0], [1, 0], [0, 1]],
    [[0, -1], [0, 0], [0, 1], [-1, 0]],
    [[-1, 0], [0, 0], [1, 0], [0, -1]],
  ],
  S: [
    [[0, 0], [0, 1], [1, -1], [1, 0]],
    [[-1, 0], [0, 0], [0, 1], [1, 1]],
    [[0, 0], [0, 1], [1, -1], [1, 0]],
    [[-1, 0], [0, 0], [0, 1], [1, 1]],
  ],
  Z: [
    [[0, -1], [0, 0], [1, 0], [1, 1]],
    [[-1, 1], [0, 0], [0, 1], [1, 0]],
    [[0, -1], [0, 0], [1, 0], [1, 1]],
    [[-1, 1], [0, 0], [0, 1], [1, 0]],
  ],
  J: [
    [[0, -1], [0, 0], [0, 1], [1, -1]],
    [[-1, 0], [0, 0], [1, 0], [-1, -1]],
    [[0, -1], [0, 0], [0, 1], [-1, 1]],
    [[-1, 0], [0, 0], [1, 0], [1, 1]],
  ],
  L: [
    [[0, -1], [0, 0], [0, 1], [1, 1]],
    [[-1, 0], [0, 0], [1, 0], [1, -1]],
    [[0, -1], [0, 0], [0, 1], [-1, -1]],
    [[-1, 0], [0, 0], [1, 0], [-1, 1]],
  ],
};

const GARBAGE_ROWS = { 1: 0, 2: 1, 3: 2, 4: 4 };

const LINE_SCORES = [0, 100, 300, 500, 800];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newBag() {
  return shuffle(PIECE_TYPES);
}

function gravityIntervalMs(level) {
  return Math.max(80, 1000 - (level - 1) * 70);
}

function createEmptyBoard() {
  return Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));
}

function createPlayer(id, name) {
  return {
    id,
    name,
    board: createEmptyBoard(),
    alive: true,
    piece: null,
    pieceRow: 0,
    pieceCol: 0,
    rotation: 0,
    hold: null,
    canHold: true,
    bag: newBag(),
    nextQueue: [],
    score: 0,
    lines: 0,
    level: 1,
    dropAccumulator: 0,
    lockTimer: 0,
    lockDelayMs: 500,
  };
}

class TetrisBattle {
  constructor() {
    this.players = new Map();
    this.gameState = 'waiting';
    this.winnerId = null;
    this.winnerName = null;
    this._lastTick = Date.now();
  }

  addPlayer(id, name) {
    const displayName = name ? String(name).trim().slice(0, 20) : `Spiller ${this.players.size + 1}`;
    const p = createPlayer(id, displayName);
    this._fillNextQueue(p);
    this.players.set(id, p);
    if (this.gameState === 'playing') {
      this._trySpawn(p);
    }
    return p;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.gameState === 'playing') {
      this._checkWinCondition();
    }
  }

  start() {
    if (this.players.size === 0) return false;
    this.reset(false);
    this.gameState = 'playing';
    this._lastTick = Date.now();
    for (const p of this.players.values()) {
      this._trySpawn(p);
    }
    return true;
  }

  reset(full = true) {
    this.gameState = 'waiting';
    this.winnerId = null;
    this.winnerName = null;
    for (const p of this.players.values()) {
      p.board = createEmptyBoard();
      p.alive = true;
      p.piece = null;
      p.hold = null;
      p.canHold = true;
      p.bag = newBag();
      p.nextQueue = [];
      p.score = 0;
      p.lines = 0;
      p.level = 1;
      p.dropAccumulator = 0;
      p.lockTimer = 0;
      this._fillNextQueue(p);
      if (!full) {
        this._trySpawn(p);
      }
    }
    if (full) {
      this.gameState = 'waiting';
    }
  }

  tick(now = Date.now()) {
    if (this.gameState !== 'playing') return;

    const dt = Math.min(now - this._lastTick, 100);
    this._lastTick = now;

    for (const p of this.players.values()) {
      if (!p.alive || !p.piece) continue;

      const interval = gravityIntervalMs(p.level);
      p.dropAccumulator += dt;

      if (p.lockTimer > 0) {
        p.lockTimer += dt;
        if (p.lockTimer >= p.lockDelayMs) {
          this._lockPiece(p);
          continue;
        }
      }

      while (p.dropAccumulator >= interval) {
        p.dropAccumulator -= interval;
        if (!this._movePiece(p, 1, 0)) {
          if (p.lockTimer === 0) {
            p.lockTimer = 1;
          }
          break;
        } else {
          p.lockTimer = 0;
        }
      }
    }

    this._checkWinCondition();
  }

  handleAction(playerId, action, params = {}) {
    if (this.gameState !== 'playing') return false;
    const p = this.players.get(playerId);
    if (!p || !p.alive || !p.piece) return false;

    let handled = false;
    switch (action) {
      case 'move': {
        const dir = params.direction || params.dir;
        if (dir === 'LEFT') handled = this._movePiece(p, 0, -1);
        else if (dir === 'RIGHT') handled = this._movePiece(p, 0, 1);
        else if (dir === 'DOWN') handled = this._movePiece(p, 1, 0);
        break;
      }
      case 'rotate':
        handled = this._rotatePiece(p);
        break;
      case 'hardDrop':
        handled = this._hardDrop(p);
        break;
      case 'hold':
        handled = this._holdPiece(p);
        break;
      default:
        break;
    }

    if (handled && p.lockTimer > 0 && this._movePiece(p, 1, 0, true)) {
      // piece moved off ground — reset lock
      p.lockTimer = 0;
    } else if (handled && p.piece && !this._movePiece(p, 1, 0, true)) {
      if (p.lockTimer === 0) p.lockTimer = 1;
    }

    return handled;
  }

  getState() {
    const players = {};
    for (const [id, p] of this.players) {
      players[id] = {
        id: p.id,
        name: p.name,
        alive: p.alive,
        score: p.score,
        lines: p.lines,
        level: p.level,
        hold: p.hold,
        next: p.nextQueue.slice(0, 5),
        board: this._visibleBoard(p),
        piece: p.piece
          ? {
              type: p.piece,
              cells: this._pieceCells(p),
              color: COLORS[p.piece],
            }
          : null,
      };
    }

    return {
      gameState: this.gameState,
      winnerId: this.winnerId,
      winnerName: this.winnerName,
      cols: COLS,
      rows: ROWS,
      colors: COLORS,
      players,
      playerOrder: [...this.players.keys()],
    };
  }

  _visibleBoard(p) {
    const out = [];
    for (let r = HIDDEN; r < TOTAL_ROWS; r++) {
      out.push(p.board[r].map((cell) => (cell ? { type: cell, color: COLORS[cell] || COLORS.G } : null)));
    }
    return out;
  }

  _pieceCells(p) {
    const shape = SHAPES[p.piece][p.rotation];
    return shape.map(([dr, dc]) => ({
      row: p.pieceRow + dr - HIDDEN,
      col: p.pieceCol + dc,
    })).filter((c) => c.row >= 0);
  }

  _fillNextQueue(p) {
    while (p.nextQueue.length < 5) {
      if (p.bag.length === 0) p.bag = newBag();
      p.nextQueue.push(p.bag.shift());
    }
  }

  _pullNext(p) {
    this._fillNextQueue(p);
    return p.nextQueue.shift();
  }

  _trySpawn(p) {
    const type = this._pullNext(p);
    p.piece = type;
    p.rotation = 0;
    p.pieceCol = Math.floor(COLS / 2) - 1;
    p.pieceRow = HIDDEN;
    p.canHold = true;
    p.dropAccumulator = 0;
    p.lockTimer = 0;

    if (this._collides(p, p.pieceRow, p.pieceCol, p.rotation)) {
      p.alive = false;
      p.piece = null;
      this._checkWinCondition();
      return false;
    }
    return true;
  }

  _collides(p, row, col, rot) {
    const shape = SHAPES[p.piece][rot];
    for (const [dr, dc] of shape) {
      const r = row + dr;
      const c = col + dc;
      if (c < 0 || c >= COLS || r >= TOTAL_ROWS) return true;
      if (r >= 0 && p.board[r][c]) return true;
    }
    return false;
  }

  _movePiece(p, dRow, dCol, testOnly = false) {
    if (!p.piece) return false;
    const nr = p.pieceRow + dRow;
    const nc = p.pieceCol + dCol;
    if (this._collides(p, nr, nc, p.rotation)) return false;
    if (!testOnly) {
      p.pieceRow = nr;
      p.pieceCol = nc;
      if (dRow > 0) p.score += 1;
    }
    return true;
  }

  _rotatePiece(p) {
    if (!p.piece || p.piece === 'O') return false;
    const newRot = (p.rotation + 1) % 4;
    const kicks = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [0, -2], [0, 2]];
    for (const [kr, kc] of kicks) {
      const nr = p.pieceRow + kr;
      const nc = p.pieceCol + kc;
      if (!this._collides(p, nr, nc, newRot)) {
        p.pieceRow = nr;
        p.pieceCol = nc;
        p.rotation = newRot;
        return true;
      }
    }
    return false;
  }

  _hardDrop(p) {
    if (!p.piece) return false;
    let dropped = 0;
    while (this._movePiece(p, 1, 0)) {
      dropped++;
    }
    p.score += dropped * 2;
    this._lockPiece(p);
    return true;
  }

  _holdPiece(p) {
    if (!p.canHold || !p.piece) return false;
    const current = p.piece;
    if (p.hold) {
      p.piece = p.hold;
      p.hold = current;
      p.rotation = 0;
      p.pieceRow = HIDDEN;
      p.pieceCol = Math.floor(COLS / 2) - 1;
      if (this._collides(p, p.pieceRow, p.pieceCol, p.rotation)) {
        p.alive = false;
        p.piece = null;
        this._checkWinCondition();
      }
    } else {
      p.hold = current;
      p.piece = null;
      this._trySpawn(p);
    }
    p.canHold = false;
    p.lockTimer = 0;
    return true;
  }

  _lockPiece(p) {
    if (!p.piece) return;
    const shape = SHAPES[p.piece][p.rotation];
    for (const [dr, dc] of shape) {
      const r = p.pieceRow + dr;
      const c = p.pieceCol + dc;
      if (r >= 0 && r < TOTAL_ROWS && c >= 0 && c < COLS) {
        p.board[r][c] = p.piece;
      }
    }

    const cleared = this._clearLines(p);
    if (cleared > 0) {
      p.lines += cleared;
      p.level = Math.floor(p.lines / 10) + 1;
      p.score += LINE_SCORES[cleared] * p.level;
      this._sendGarbage(p.id, cleared);
    }

    p.piece = null;
    p.lockTimer = 0;
    this._trySpawn(p);
    this._checkWinCondition();
  }

  _clearLines(p) {
    let cleared = 0;
    for (let r = TOTAL_ROWS - 1; r >= 0; ) {
      if (p.board[r].every((cell) => cell !== null)) {
        p.board.splice(r, 1);
        p.board.unshift(Array(COLS).fill(null));
        cleared++;
      } else {
        r--;
      }
    }
    return cleared;
  }

  _sendGarbage(fromId, linesCleared) {
    const rows = GARBAGE_ROWS[linesCleared] ?? 0;
    if (rows <= 0) return;

    const targets = [...this.players.values()].filter((t) => t.alive && t.id !== fromId);
    if (targets.length === 0) return;

    for (let i = 0; i < rows; i++) {
      const target = targets[Math.floor(Math.random() * targets.length)];
      const hole = Math.floor(Math.random() * COLS);
      target.board.shift();
      const row = Array(COLS).fill('G');
      row[hole] = null;
      target.board.push(row);

      if (target.piece && this._collides(target, target.pieceRow, target.pieceCol, target.rotation)) {
        target.alive = false;
        target.piece = null;
      }
    }
  }

  _checkWinCondition() {
    if (this.gameState !== 'playing') return;

    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length === 1 && this.players.size > 1) {
      this._setWinner(alive[0]);
      return;
    }
    if (alive.length === 0 && this.players.size > 0) {
      let best = null;
      for (const p of this.players.values()) {
        if (!best || p.score > best.score) best = p;
      }
      if (best) this._setWinner(best);
      return;
    }
    if (alive.length === 0 && this.players.size === 1) {
      this.gameState = 'finished';
    }
  }

  _setWinner(p) {
    this.gameState = 'finished';
    this.winnerId = p.id;
    this.winnerName = p.name;
  }
}

module.exports = { TetrisBattle, COLS, ROWS, COLORS };
