// ─── game.js ─────────────────────────────────────────────────────────────────
// DOTZ · Celo Edition
// Dots & Boxes game engine — canvas rendering + bot AI
// ─────────────────────────────────────────────────────────────────────────────

// Global game state
window.G = {
  size:   4,      // dots per side (e.g. 4 = 3×3 boxes)
  hL:     [],     // horizontal lines [row][col] = 0|1|2
  vL:     [],     // vertical lines   [row][col] = 0|1|2
  boxes:  [],     // boxes [row][col]  = 0|1|2
  scores: [0, 0], // [p1, p2]
  turn:   1,
  myPN:   1,      // this client's player number (1 or 2)
  vsBot:  false,
  isPvP:  false,
  isFree: false,
  over:   false,
  freeSz: 4,      // selected free pvp grid size
};

let _history = []; // for undo

const _cv = document.getElementById('C');
const _cx = _cv.getContext('2d');
let CELL, OX, OY;

const px = c => OX + c * CELL;
const py = r => OY + r * CELL;

// ─────────────────────────────────────────────────────────────────────────────
//  Init / Reset
// ─────────────────────────────────────────────────────────────────────────────

function initGame() {
  const n = window.G.size;
  window.G.hL    = Array.from({ length: n },     () => new Array(n - 1).fill(0));
  window.G.vL    = Array.from({ length: n - 1 }, () => new Array(n).fill(0));
  window.G.boxes = Array.from({ length: n - 1 }, () => new Array(n - 1).fill(0));
  window.G.scores = [0, 0];
  window.G.turn   = 1;
  window.G.over   = false;
  _history = [];
  updateScore();
  updateTurn();
  resizeCanvas();
  renderBoard();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Canvas resize
// ─────────────────────────────────────────────────────────────────────────────

function resizeCanvas() {
  const wrap = document.querySelector('.canvas-wrap');
  const mx   = Math.min(wrap.clientWidth - 14, wrap.clientHeight - 14, 390);
  const n    = window.G.size;
  CELL = Math.floor((mx - 30) / (n - 1));
  _cv.width = _cv.height = CELL * (n - 1) + 30;
  OX = OY = 15;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Render board — yellow/black Celo theme
// ─────────────────────────────────────────────────────────────────────────────

function renderBoard() {
  const n = window.G.size;
  _cx.clearRect(0, 0, _cv.width, _cv.height);

  // Box fills
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      if (!window.G.boxes[r][c]) continue;
      const owner = window.G.boxes[r][c];
      // P1 = yellow, P2 = dark/accent
      _cx.fillStyle = owner === 1
        ? 'rgba(252,255,82,.18)'
        : 'rgba(255,255,255,.08)';
      _cx.beginPath();
      _cx.roundRect(px(c) + 2, py(r) + 2, CELL - 4, CELL - 4, 3);
      _cx.fill();
      _cx.fillStyle = owner === 1 ? 'rgba(252,255,82,.7)' : 'rgba(200,200,200,.5)';
      _cx.font = `700 ${Math.max(8, CELL / 4)}px IBM Plex Mono`;
      _cx.textAlign = 'center'; _cx.textBaseline = 'middle';
      _cx.fillText('■', px(c) + CELL / 2, py(r) + CELL / 2);
    }
  }

  // Lines
  for (let r = 0; r < n; r++)     for (let c = 0; c < n - 1; c++) _drawLine(px(c), py(r), px(c+1), py(r),   window.G.hL[r][c]);
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n; c++)     _drawLine(px(c), py(r), px(c),   py(r+1), window.G.vL[r][c]);

  // Dots
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      _cx.fillStyle = '#2a2208';
      _cx.beginPath(); _cx.arc(px(c), py(r), 5.5, 0, Math.PI * 2); _cx.fill();
      _cx.fillStyle = '#FCFF52';
      _cx.beginPath(); _cx.arc(px(c), py(r), 3.5, 0, Math.PI * 2); _cx.fill();
    }
  }
}

function _drawLine(x1, y1, x2, y2, v, hover, hoverColor) {
  if (hover) {
    _cx.strokeStyle = hoverColor; _cx.lineWidth = 3.5; _cx.lineCap = 'square';
    _cx.shadowColor = hoverColor; _cx.shadowBlur = 14; _cx.setLineDash([]);
    _cx.beginPath(); _cx.moveTo(x1, y1); _cx.lineTo(x2, y2); _cx.stroke();
    _cx.shadowBlur = 0;
    return;
  }
  if (!v) {
    _cx.strokeStyle = 'rgba(252,255,82,.08)'; _cx.lineWidth = 1.5; _cx.setLineDash([3, 4]);
    _cx.beginPath(); _cx.moveTo(x1, y1); _cx.lineTo(x2, y2); _cx.stroke();
    _cx.setLineDash([]);
    return;
  }
  // P1 = yellow, P2 = white/silver
  const col = v === 1 ? '#FCFF52' : '#aaaaaa';
  _cx.strokeStyle = col; _cx.lineWidth = 3.5; _cx.lineCap = 'square';
  _cx.shadowColor = col; _cx.shadowBlur = 10; _cx.setLineDash([]);
  _cx.beginPath(); _cx.moveTo(x1, y1); _cx.lineTo(x2, y2); _cx.stroke();
  _cx.shadowBlur = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Input handling
// ─────────────────────────────────────────────────────────────────────────────

function _getPointer(e) {
  const rect = _cv.getBoundingClientRect();
  const t    = e.touches ? e.touches[0] || e.changedTouches[0] : e;
  return {
    x: (t.clientX - rect.left) * (_cv.width  / rect.width),
    y: (t.clientY - rect.top)  * (_cv.height / rect.height),
  };
}

function _nearestLine(mx, my) {
  const n = window.G.size;
  let best = null, bestDist = 18;

  function check(t, r, c, x1, y1, x2, y2) {
    const d = _ptSegDist(mx, my, x1, y1, x2, y2);
    if (d < bestDist) { bestDist = d; best = { t, r, c }; }
  }

  for (let r = 0; r < n; r++)     for (let c = 0; c < n-1; c++) if (!window.G.hL[r][c]) check('h', r, c, px(c), py(r), px(c+1), py(r));
  for (let r = 0; r < n-1; r++) for (let c = 0; c < n; c++)     if (!window.G.vL[r][c]) check('v', r, c, px(c), py(r), px(c),   py(r+1));

  return best;
}

function _ptSegDist(mx, my, x1, y1, x2, y2) {
  const dx = x2-x1, dy = y2-y1;
  const t  = Math.max(0, Math.min(1, ((mx-x1)*dx + (my-y1)*dy) / (dx*dx+dy*dy)));
  return Math.sqrt((mx-x1-t*dx)**2 + (my-y1-t*dy)**2);
}

_cv.addEventListener('click',    _handleTap);
_cv.addEventListener('touchend', e => { e.preventDefault(); _handleTap(e); }, { passive: false });

function _handleTap(e) {
  if (window.G.over) return;
  if (window.G.vsBot  && window.G.turn === 2)           return;
  if (!window.G.vsBot && window.G.turn !== window.G.myPN) return;
  const p = _getPointer(e), l = _nearestLine(p.x, p.y);
  if (l) applyMove(l.t, l.r, l.c, window.G.myPN, true);
}

_cv.addEventListener('mousemove', e => {
  if (window.G.over) return;
  if (window.G.vsBot  && window.G.turn === 2)           return;
  if (!window.G.vsBot && window.G.turn !== window.G.myPN) return;
  const p = _getPointer(e), l = _nearestLine(p.x, p.y);
  renderBoard();
  if (l) {
    const hc = window.G.myPN === 1 ? 'rgba(252,255,82,.8)' : 'rgba(200,200,200,.7)';
    if (l.t === 'h') _drawLine(px(l.c), py(l.r), px(l.c+1), py(l.r),   0, true, hc);
    else             _drawLine(px(l.c), py(l.r), px(l.c),   py(l.r+1), 0, true, hc);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Apply move (local or remote)
// ─────────────────────────────────────────────────────────────────────────────

function applyMove(t, r, c, playerNum, local) {
  if (t === 'h') window.G.hL[r][c] = playerNum;
  else           window.G.vL[r][c] = playerNum;

  _history.push({ t, r, c, p: playerNum });

  const closed = _closeBoxes(playerNum);
  window.G.scores[playerNum - 1] += closed;
  updateScore();

  const total = (window.G.size - 1) * (window.G.size - 1);
  if (window.G.scores[0] + window.G.scores[1] === total) {
    if (local && !window.G.vsBot) netSend(t, r, c, playerNum);
    endGame();
    return;
  }

  if (!closed) window.G.turn = window.G.turn === 1 ? 2 : 1;
  updateTurn();
  renderBoard();

  if (local && !window.G.vsBot) netSend(t, r, c, playerNum);
  if (window.G.vsBot && window.G.turn === 2 && !window.G.over) setTimeout(_botMove, 520);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Close boxes
// ─────────────────────────────────────────────────────────────────────────────

function _closeBoxes(p) {
  const n = window.G.size;
  let closed = 0;
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      if (!window.G.boxes[r][c] &&
          window.G.hL[r][c] && window.G.hL[r+1][c] &&
          window.G.vL[r][c] && window.G.vL[r][c+1]) {
        window.G.boxes[r][c] = p;
        closed++;
      }
    }
  }
  return closed;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Undo (bot mode only)
// ─────────────────────────────────────────────────────────────────────────────

function doUndo() {
  if (!_history.length) return;
  if (_history[_history.length - 1]?.p === 2) _history.pop();
  if (_history.length) _history.pop();
  const n = window.G.size, saved = [..._history];
  window.G.hL    = Array.from({ length: n },     () => new Array(n-1).fill(0));
  window.G.vL    = Array.from({ length: n-1 }, () => new Array(n).fill(0));
  window.G.boxes = Array.from({ length: n-1 }, () => new Array(n-1).fill(0));
  window.G.scores = [0, 0]; _history = [];
  saved.forEach(mv => {
    if (mv.t === 'h') window.G.hL[mv.r][mv.c] = mv.p;
    else              window.G.vL[mv.r][mv.c] = mv.p;
    window.G.scores[mv.p - 1] += _closeBoxes(mv.p);
    _history.push(mv);
  });
  window.G.turn = 1; window.G.over = false;
  updateScore(); updateTurn(); renderBoard();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Bot AI — 3 tiers
// ─────────────────────────────────────────────────────────────────────────────

function _sideCount(br, bc) {
  return (window.G.hL[br][bc]?1:0) + (window.G.hL[br+1][bc]?1:0) +
         (window.G.vL[br][bc]?1:0) + (window.G.vL[br][bc+1]?1:0);
}

function _adjacentBoxes(t, r, c) {
  const n = window.G.size, adj = [];
  if (t === 'h') {
    if (r > 0)     adj.push([r-1, c]);
    if (r < n-1)   adj.push([r, c]);
  } else {
    if (c > 0)     adj.push([r, c-1]);
    if (c < n-1)   adj.push([r, c]);
  }
  return adj.filter(([br, bc]) => br >= 0 && br < n-1 && bc >= 0 && bc < n-1);
}

function _wouldClose(t, r, c) { return _adjacentBoxes(t,r,c).some(([br,bc]) => _sideCount(br,bc) === 3); }
function _wouldGive(t, r, c)  { return _adjacentBoxes(t,r,c).some(([br,bc]) => _sideCount(br,bc) === 2); }

function _botMove() {
  if (window.G.over) return;
  const n = window.G.size;

  // Tier 1: claim a box
  for (let r = 0; r < n; r++)     for (let c = 0; c < n-1; c++) if (!window.G.hL[r][c] && _wouldClose('h',r,c)) return applyMove('h',r,c,2,false);
  for (let r = 0; r < n-1; r++) for (let c = 0; c < n; c++)     if (!window.G.vL[r][c] && _wouldClose('v',r,c)) return applyMove('v',r,c,2,false);

  // Tier 2: safe move
  const safe = [];
  for (let r = 0; r < n; r++)     for (let c = 0; c < n-1; c++) if (!window.G.hL[r][c] && !_wouldGive('h',r,c)) safe.push({t:'h',r,c});
  for (let r = 0; r < n-1; r++) for (let c = 0; c < n; c++)     if (!window.G.vL[r][c] && !_wouldGive('v',r,c)) safe.push({t:'v',r,c});
  if (safe.length) { const m = safe[~~(Math.random()*safe.length)]; return applyMove(m.t,m.r,m.c,2,false); }

  // Tier 3: any move
  const all = [];
  for (let r = 0; r < n; r++)     for (let c = 0; c < n-1; c++) if (!window.G.hL[r][c]) all.push({t:'h',r,c});
  for (let r = 0; r < n-1; r++) for (let c = 0; c < n; c++)     if (!window.G.vL[r][c]) all.push({t:'v',r,c});
  if (all.length) { const m = all[~~(Math.random()*all.length)]; applyMove(m.t,m.r,m.c,2,false); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  End game
// ─────────────────────────────────────────────────────────────────────────────

function endGame() {
  window.G.over = true;
  renderBoard();
  setTimeout(() => showResultScreen(), 650);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Score + turn UI
// ─────────────────────────────────────────────────────────────────────────────

function updateScore() {
  document.getElementById('sc-me-v').textContent = window.G.scores[window.G.myPN - 1];
  document.getElementById('sc-op-v').textContent = window.G.scores[2 - window.G.myPN];
}

function updateTurn() {
  const mine = window.G.turn === window.G.myPN;
  document.getElementById('sc-me').classList.toggle('active', mine);
  document.getElementById('sc-op').classList.toggle('active', !mine);
  document.getElementById('t-lbl').textContent = window.G.vsBot
    ? (window.G.turn === 1 ? 'YOUR TURN' : 'BOT…')
    : (mine ? 'YOUR TURN' : 'THEIR TURN');
  document.getElementById('t-pip').style.background = mine ? 'var(--yellow)' : 'var(--muted)';
}

// Expose for matchmaking.js / ui.js
window.applyMove  = applyMove;
window.endGame    = endGame;
window.initGame   = initGame;

window.addEventListener('resize', () => {
  if (document.getElementById('game-screen').classList.contains('active')) {
    resizeCanvas(); renderBoard();
  }
});
