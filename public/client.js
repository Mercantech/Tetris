(function () {
  const pathMatch = location.pathname.match(/^(\/Tetris)(?=\/|$)/i);
  const BASE = pathMatch ? pathMatch[1] : '';

  function apiUrl(path) {
    return `${BASE}${path}`;
  }

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}${BASE}`;
  }

  const joinScreen = document.getElementById('join-screen');
  const gameScreen = document.getElementById('game-screen');
  const pinInput = document.getElementById('pin-input');
  const nameInput = document.getElementById('name-input');
  const btnJoin = document.getElementById('btn-join');
  const btnCreateLobby = document.getElementById('btn-create-lobby');
  const joinError = document.getElementById('join-error');
  const statusEl = document.getElementById('status');
  const btnStart = document.getElementById('btn-start');
  const btnReset = document.getElementById('btn-reset');
  const lobbyPinEl = document.getElementById('lobby-pin');
  const opponentsPanel = document.getElementById('opponents-panel');
  const mainCanvas = document.getElementById('main-canvas');
  const holdCanvas = document.getElementById('hold-canvas');
  const nextCanvas = document.getElementById('next-canvas');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const statLines = document.getElementById('stat-lines');
  const statLevel = document.getElementById('stat-level');
  const statScore = document.getElementById('stat-score');
  const playerInfo = document.getElementById('player-info');
  const btnArduino = document.getElementById('btn-arduino');
  const arduinoStatus = document.getElementById('arduino-status');

  const mainCtx = mainCanvas.getContext('2d');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCtx = nextCanvas.getContext('2d');

  let ws = null;
  let playerId = null;
  let pin = null;
  let state = null;
  const oppCanvases = new Map();

  const SHAPES = {
    I: [[0, -1], [0, 0], [0, 1], [0, 2]],
    O: [[0, 0], [0, 1], [1, 0], [1, 1]],
    T: [[0, -1], [0, 0], [0, 1], [1, 0]],
    S: [[0, 0], [0, 1], [1, -1], [1, 0]],
    Z: [[0, -1], [0, 0], [1, 0], [1, 1]],
    J: [[0, -1], [0, 0], [0, 1], [1, -1]],
    L: [[0, -1], [0, 0], [0, 1], [1, 1]],
  };

  function showError(msg) {
    joinError.textContent = msg;
    joinError.classList.remove('hidden');
  }

  function clearError() {
    joinError.textContent = '';
    joinError.classList.add('hidden');
  }

  function connectWs() {
    ws = new WebSocket(wsUrl());

    ws.onopen = () => {
      statusEl.textContent = 'Forbundet';
    };

    ws.onclose = () => {
      statusEl.textContent = 'Forbindelse lukket';
      btnStart.disabled = true;
      btnReset.disabled = true;
    };

    ws.onerror = () => {
      statusEl.textContent = 'WebSocket-fejl';
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (msg.type === 'error') {
        showError(msg.data?.message || 'Fejl');
        return;
      }

      if (msg.type === 'joined') {
        playerId = msg.data.playerId;
        pin = msg.data.pin;
        state = msg.data.state;
        joinScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        lobbyPinEl.textContent = `PIN: ${pin}`;
        playerInfo.textContent = `Du er: ${state.players[playerId]?.name || playerId}`;
        updateUi();
        return;
      }

      if (msg.type === 'state') {
        state = msg.data;
        updateUi();
      }
    };
  }

  function joinLobby(lobbyPin, name) {
    clearError();
    pin = String(lobbyPin).trim();
    if (!pin) {
      showError('Indtast en PIN');
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWs();
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'join', pin, name: name || undefined }));
      }, { once: true });
    } else {
      ws.send(JSON.stringify({ type: 'join', pin, name: name || undefined }));
    }
  }

  async function createLobby() {
    clearError();
    try {
      const res = await fetch(apiUrl('/api/admin/lobbies'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Kunne ikke oprette lobby');
        return;
      }
      pinInput.value = data.pin;
      joinLobby(data.pin, nameInput.value.trim());
    } catch {
      showError('Netværksfejl ved oprettelse');
    }
  }

  function sendInput(data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'input', data }));
  }

  function cellSize(cols, rows, width, height) {
    return Math.min(width / cols, height / rows);
  }

  function drawBoard(ctx, board, piece, cols, rows, width, height, colors) {
    const cs = cellSize(cols, rows, width, height);
    const ox = (width - cols * cs) / 2;
    const oy = (height - rows * cs) / 2;

    ctx.fillStyle = '#050308';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(178, 75, 243, 0.15)';
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + r * cs);
      ctx.lineTo(ox + cols * cs, oy + r * cs);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(ox + c * cs, oy);
      ctx.lineTo(ox + c * cs, oy + rows * cs);
      ctx.stroke();
    }

    if (board) {
      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
          const cell = board[r][c];
          if (cell) drawCell(ctx, ox, oy, c, r, cs, cell.color || colors[cell.type]);
        }
      }
    }

    if (piece && piece.cells) {
      const col = piece.color || colors[piece.type];
      for (const cell of piece.cells) {
        drawCell(ctx, ox, oy, cell.col, cell.row, cs, col);
      }
    }
  }

  function drawCell(ctx, ox, oy, col, row, cs, color) {
    const pad = 1;
    ctx.fillStyle = color;
    ctx.fillRect(ox + col * cs + pad, oy + row * cs + pad, cs - pad * 2, cs - pad * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(ox + col * cs + pad, oy + row * cs + pad, cs - pad * 2, 2);
  }

  function drawMiniPiece(ctx, type, colors, width, height) {
    ctx.fillStyle = '#050308';
    ctx.fillRect(0, 0, width, height);
    if (!type) return;
    const cells = SHAPES[type];
    if (!cells) return;
    const cs = 20;
    const minC = Math.min(...cells.map(([, dc]) => dc));
    const maxC = Math.max(...cells.map(([, dc]) => dc));
    const minR = Math.min(...cells.map(([dr]) => dr));
    const maxR = Math.max(...cells.map(([dr]) => dr));
    const pw = (maxC - minC + 1) * cs;
    const ph = (maxR - minR + 1) * cs;
    const ox = (width - pw) / 2 - minC * cs;
    const oy = (height - ph) / 2 - minR * cs;
    const color = colors[type] || '#fff';
    for (const [dr, dc] of cells) {
      drawCell(ctx, ox, oy, dc, dr, cs, color);
    }
  }

  function ensureOpponentCanvas(id, name, alive) {
    let entry = oppCanvases.get(id);
    if (!entry) {
      const card = document.createElement('div');
      card.className = 'opp-card' + (alive ? '' : ' dead');
      card.dataset.playerId = id;
      const h4 = document.createElement('h4');
      h4.textContent = name;
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 200;
      card.appendChild(h4);
      card.appendChild(canvas);
      opponentsPanel.appendChild(card);
      entry = { card, canvas, ctx: canvas.getContext('2d'), h4 };
      oppCanvases.set(id, entry);
    }
    entry.card.classList.toggle('dead', !alive);
    entry.h4.textContent = name;
    return entry;
  }

  function updateUi() {
    if (!state || !playerId) return;

    const me = state.players[playerId];
    const colors = state.colors || {};

    btnStart.disabled = state.gameState !== 'waiting';
    btnReset.disabled = state.gameState !== 'finished';

    if (me) {
      statLines.textContent = me.lines;
      statLevel.textContent = me.level;
      statScore.textContent = me.score;
      drawBoard(mainCtx, me.board, me.piece, state.cols, state.rows, mainCanvas.width, mainCanvas.height, colors);
      drawMiniPiece(holdCtx, me.hold, colors, holdCanvas.width, holdCanvas.height);

      nextCtx.fillStyle = '#050308';
      nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
      const queue = me.next || [];
      queue.slice(0, 3).forEach((type, i) => {
        nextCtx.save();
        nextCtx.translate(0, i * 72);
        drawMiniPiece(nextCtx, type, colors, nextCanvas.width, 72);
        nextCtx.restore();
      });
    }

    opponentsPanel.innerHTML = '';
    oppCanvases.clear();
    for (const id of state.playerOrder || Object.keys(state.players)) {
      if (id === playerId) continue;
      const p = state.players[id];
      if (!p) continue;
      const entry = ensureOpponentCanvas(id, p.name, p.alive);
      drawBoard(entry.ctx, p.board, p.piece, state.cols, state.rows, entry.canvas.width, entry.canvas.height, colors);
    }

    overlay.classList.add('hidden');
    if (state.gameState === 'waiting') {
      overlay.classList.remove('hidden');
      overlayTitle.textContent = 'Venter på start';
      overlayText.textContent = 'Tryk «Start spil» når alle er klar';
    } else if (state.gameState === 'finished') {
      overlay.classList.remove('hidden');
      if (state.winnerId === playerId) {
        overlayTitle.textContent = 'Du vandt!';
      } else if (state.winnerName) {
        overlayTitle.textContent = `${state.winnerName} vandt`;
      } else {
        overlayTitle.textContent = 'Spillet er slut';
      }
      overlayText.textContent = 'Tryk «Nyt spil» for at spille igen';
    } else if (me && !me.alive) {
      overlay.classList.remove('hidden');
      overlayTitle.textContent = 'Game Over';
      overlayText.textContent = 'Du er ude – vent på vinder';
    }

    statusEl.textContent =
      state.gameState === 'playing' ? 'Spiller' : state.gameState === 'finished' ? 'Afsluttet' : 'Lobby';
  }

  btnJoin.addEventListener('click', () => {
    joinLobby(pinInput.value, nameInput.value.trim());
  });

  btnCreateLobby.addEventListener('click', createLobby);

  btnStart.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'start' }));
  });

  btnReset.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'reset' }));
  });

  document.addEventListener('keydown', (e) => {
    if (!state || state.gameState !== 'playing') return;
    const me = state.players[playerId];
    if (!me || !me.alive) return;

    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        sendInput({ action: 'move', direction: 'LEFT' });
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        sendInput({ action: 'move', direction: 'RIGHT' });
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        sendInput({ action: 'move', direction: 'DOWN' });
        break;
      case 'ArrowUp':
      case 'x':
      case 'X':
        sendInput({ action: 'rotate' });
        break;
      case ' ':
        e.preventDefault();
        sendInput({ action: 'hardDrop' });
        break;
      case 'c':
      case 'C':
        sendInput({ action: 'hold' });
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  });

  btnArduino.addEventListener('click', () => {
    arduinoStatus.textContent =
      'Sæt GAME_MODE_TETRIS på Oplà og brug /api/controller/* med PIN + playerId';
  });

  connectWs();
})();
