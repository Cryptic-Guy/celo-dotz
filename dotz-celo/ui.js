// ─── ui.js ───────────────────────────────────────────────────────────────────
// DOTZ · Celo Edition
// Screen navigation, game start flows, username modal, result screen, toasts
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  Screen switcher
// ─────────────────────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Home button handlers
// ─────────────────────────────────────────────────────────────────────────────

function handleFreePvP() {
  startFreeMM();
}

function handleComingSoon(feature) {
  _showComingSoonModal(feature);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Coming Soon modal
// ─────────────────────────────────────────────────────────────────────────────

function _showComingSoonModal(feature) {
  const modal  = document.getElementById('coming-soon-modal');
  const lbl    = document.getElementById('cs-feature-label');
  if (lbl)   lbl.textContent = feature || 'This feature';
  if (modal) modal.classList.add('open');
}

function closeComingSoonModal() {
  const modal = document.getElementById('coming-soon-modal');
  if (modal) modal.classList.remove('open');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Username registration modal
// ─────────────────────────────────────────────────────────────────────────────

function openUsernameModal() {
  const modal = document.getElementById('username-modal');
  if (modal) modal.classList.add('open');
  const input = document.getElementById('username-input');
  if (input) { input.value = ''; input.focus(); }
  _clearUsernameError();
}

function closeUsernameModal() {
  const modal = document.getElementById('username-modal');
  if (modal) modal.classList.remove('open');
}

function _setUsernameError(msg) {
  const el = document.getElementById('username-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function _clearUsernameError() {
  const el = document.getElementById('username-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

async function submitUsername() {
  const input  = document.getElementById('username-input');
  const btn    = document.getElementById('username-submit-btn');
  const uname  = (input?.value || '').trim();

  _clearUsernameError();

  // Validate locally first
  if (uname.length < 3 || uname.length > 16) {
    _setUsernameError('Username must be 3–16 characters.');
    return;
  }
  if (!/^[A-Za-z0-9_]+$/.test(uname)) {
    _setUsernameError('Only letters, numbers, and _ allowed.');
    return;
  }

  if (!window.Wallet?.addr) {
    _setUsernameError('Connect your wallet first.');
    return;
  }

  // Disable button, show loading
  if (btn) { btn.textContent = 'SUBMITTING…'; btn.disabled = true; }

  try {
    // Check if contract is deployed
    const registryOk = CONFIG.registryContract &&
      CONFIG.registryContract !== '0x0000000000000000000000000000000000000000';

    if (!registryOk) {
      // Contract not deployed yet — store locally and continue
      window.Wallet.username = uname;
      sessionStorage.setItem('_dotz_username', uname);
      closeUsernameModal();
      showToast(`Welcome, ${uname}! (off-chain until contract deployed)`, 4000);
      window.updateWalletUI?.();
      return;
    }

    // Send on-chain tx
    const txHash = await registryRegister(window.Wallet.addr, uname);

    if (btn) btn.textContent = 'CONFIRMING…';
    showToast('Registering username on Celo…', 3000);

    // Wait for receipt (with timeout)
    const receipt = await Promise.race([
      waitReceipt(txHash),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 60000)),
    ]);

    if (receipt.status === '0x1') {
      window.Wallet.username = uname;
      sessionStorage.setItem('_dotz_username', uname);
      closeUsernameModal();
      showToast(`Username "${uname}" registered on Celo! 🌿`, 5000);
      window.updateWalletUI?.();
    } else {
      throw new Error('Transaction failed on-chain');
    }

  } catch (e) {
    if (e.code === 4001 || e.message?.includes('rejected')) {
      _setUsernameError('Transaction cancelled.');
    } else if (e.message?.includes('AlreadyRegistered')) {
      // Already registered — just load
      const existing = await registryGetUsername(window.Wallet.addr).catch(() => '');
      if (existing) {
        window.Wallet.username = existing;
        closeUsernameModal();
        showToast(`Welcome back, ${existing}!`, 3000);
        window.updateWalletUI?.();
        return;
      }
      _setUsernameError('This wallet already has a username.');
    } else if (e.message?.includes('UsernameTaken')) {
      _setUsernameError('Username taken. Try another.');
    } else if (e.message?.includes('timeout')) {
      // Optimistic: assume it worked
      window.Wallet.username = uname;
      sessionStorage.setItem('_dotz_username', uname);
      closeUsernameModal();
      showToast(`Username set! Confirming on chain…`, 4000);
      window.updateWalletUI?.();
    } else {
      _setUsernameError('Error: ' + e.message.slice(0, 80));
    }
  } finally {
    if (btn) { btn.textContent = 'REGISTER'; btn.disabled = false; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Free PvP grid size picker
// ─────────────────────────────────────────────────────────────────────────────

function pickFreeSize(n) {
  window.G.freeSz = n;
  document.querySelectorAll('.sz-opt').forEach(el =>
    el.classList.toggle('sel', +el.dataset.fn === n)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Start flows
// ─────────────────────────────────────────────────────────────────────────────

function startFreeMM() {
  showScreen('free-mm-screen');
  window.G.size = window.G.freeSz || 4;

  document.getElementById('fmm-p1').textContent  = myDisplayName().slice(0, 6).toUpperCase();
  document.getElementById('fmm-p2').className    = 'pav wait';
  document.getElementById('fmm-p2').textContent  = '?';
  document.getElementById('fmm-opp').textContent = 'FINDING';

  enterLobby('free', 'fmm-p2', 'fmm-opp', 'fmm-status', (opp, role) => {
    startFreePvP(opp, role);
  });
}

function cancelFreeMM() {
  cleanupNet();
  showScreen('home-screen');
}

function startBot() {
  window.G.vsBot  = true;
  window.G.isPvP  = false;
  window.G.isFree = false;
  window.G.size   = 4;
  window.G.myPN   = 1;

  initGame();

  document.getElementById('sc-me-nm').textContent = window.Wallet.username || 'YOU';
  document.getElementById('sc-op-nm').textContent = 'BOT';
  document.getElementById('pot-tag').style.display = 'none';
  document.getElementById('undo-btn').style.display = 'block';

  showScreen('game-screen');
  showToast('Practice mode — vs AI Bot 🤖', 2500);
}

function startFreePvP(oppName, role) {
  window.G.vsBot  = false;
  window.G.isPvP  = true;
  window.G.isFree = true;
  window.G.size   = window.G.freeSz || 4;
  window.G.myPN   = role === 'p1' ? 1 : 2;
  window.G.turn   = 1;

  initGame();

  document.getElementById('sc-me-nm').textContent = window.Wallet.username || 'YOU';
  document.getElementById('sc-op-nm').textContent = (oppName || 'OPP').slice(0, 8).toUpperCase();
  document.getElementById('pot-tag').style.display = 'none';
  document.getElementById('undo-btn').style.display = 'none';

  showScreen('game-screen');
  showToast(window.G.myPN === 1 ? 'You go first! 🟡' : 'Opponent goes first…', 3000);
}

// ─────────────────────────────────────────────────────────────────────────────
//  In-game actions
// ─────────────────────────────────────────────────────────────────────────────

function quitGame() {
  cleanupNet();
  showScreen('home-screen');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Result screen
// ─────────────────────────────────────────────────────────────────────────────

function showResultScreen() {
  const my  = window.G.scores[window.G.myPN - 1];
  const opp = window.G.scores[2 - window.G.myPN];

  let outcome, icon;
  if (my > opp)       { outcome = 'win';  icon = '🏆'; }
  else if (my < opp)  { outcome = 'lose'; icon = '😤'; }
  else                { outcome = 'draw'; icon = '🤝'; }

  const card = document.getElementById('r-card');
  card.className = 'result-card ' + outcome;

  document.getElementById('r-icon').textContent  = icon;
  document.getElementById('r-title').textContent = outcome.toUpperCase();
  document.getElementById('r-sub').textContent   = `${my} — ${opp} boxes`;

  // On-chain badge if match was recorded
  const chainBadge = document.getElementById('r-chain-badge');
  if (chainBadge) {
    if (window.M.onChainMatchId) {
      chainBadge.style.display = '';
      chainBadge.textContent   = `⛓ Match #${window.M.onChainMatchId} on Celo`;
    } else {
      chainBadge.style.display = 'none';
    }
  }

  if (outcome === 'win') _launchConfetti();

  showScreen('result-screen');
}

function playAgain() {
  cleanupNet();
  if (window.G.vsBot) {
    startBot();
  } else {
    showScreen('home-screen');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Share result
// ─────────────────────────────────────────────────────────────────────────────

function doShare() {
  const my  = window.G.scores[window.G.myPN - 1];
  const opp = window.G.scores[2 - window.G.myPN];
  const res = my > opp ? 'WON' : my < opp ? 'LOST' : 'DREW';
  const txt = `I just ${res} ${my}–${opp} on DOTZ 🌿 On-chain Dots & Boxes on Celo! Play at ${window.location.href}`;
  navigator.share?.({ text: txt }).catch(() => {
    navigator.clipboard.writeText(txt).then(() => showToast('Result copied!', 2000));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Toast
// ─────────────────────────────────────────────────────────────────────────────

let _toastTimer;
function showToast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Confetti
// ─────────────────────────────────────────────────────────────────────────────

function _launchConfetti() {
  const container = document.getElementById('confetti');
  if (!container) return;
  const colors = ['#FCFF52', '#ffffff', '#35D07F', '#111111', '#FFD700'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'particle';
      el.style.cssText = `
        left:${Math.random()*100}%;
        width:${5+Math.random()*6}px;
        height:${5+Math.random()*6}px;
        background:${colors[~~(Math.random()*colors.length)]};
        animation-duration:${1.2+Math.random()*1.8}s;
        animation-delay:0s;
      `;
      container.appendChild(el);
      setTimeout(() => el.remove(), 3200);
    }, i * 30);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Loading screen
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  // Restore username from session if wallet not reconnected yet
  const cached = sessionStorage.getItem('_dotz_username');
  if (cached && !window.Wallet.username) window.Wallet.username = cached;

  setTimeout(() => {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.style.opacity = '0';
      setTimeout(() => { loading.style.display = 'none'; }, 300);
    }
    showScreen('home-screen');
  }, 1200);
});
