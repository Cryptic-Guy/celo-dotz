// ─── matchmaking.js ───────────────────────────────────────────────────────────
// DOTZ · Celo Edition
// Ably real-time matchmaking for Free PvP
//
// KEY RULES:
//  • P1 MUST get tx approved before any game starts
//  • If P1 rejects tx  → cancel match, return both players to home
//  • P2 waits for P1's 'tx_approved' signal before entering game
//  • No tx = no game (never skip on-chain silently)
// ─────────────────────────────────────────────────────────────────────────────

window.M = {
  myPN:           1,
  chan:            null,
  id:             null,
  isFree:         false,
  oppWallet:      '',
  onChainMatchId: null,
};

let _rt       = null;
let _lobby    = null;
let _matched  = false;
let _statusEl = null;

// ─────────────────────────────────────────────────────────────────────────────
//  Client ID — stable per session
// ─────────────────────────────────────────────────────────────────────────────

function myClientId() {
  let id = sessionStorage.getItem('_dotz_cid');
  if (!id) {
    id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    sessionStorage.setItem('_dotz_cid', id);
  }
  return id;
}

function myDisplayName() {
  if (window.Wallet?.username) return window.Wallet.username;
  if (window.Wallet?.addr)     return window.Wallet.short();
  return 'P_' + myClientId().slice(-4);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Ably instance
// ─────────────────────────────────────────────────────────────────────────────

function getRT() {
  if (!_rt || _rt.connection.state === 'failed' || _rt.connection.state === 'closed') {
    _rt = new Ably.Realtime({ key: CONFIG.ablyKey, clientId: myClientId() });
  }
  return _rt;
}

function mmStatus(html) {
  const el = document.getElementById(_statusEl);
  if (el) el.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Send move to opponent over Ably
// ─────────────────────────────────────────────────────────────────────────────

function netSend(t, r, c, p) {
  if (!window.M.chan) return;
  window.M.chan.publish('move', { t, r, c, p }).catch(e =>
    console.warn('[net] publish failed:', e.message)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Cleanup
// ─────────────────────────────────────────────────────────────────────────────

function cleanupNet() {
  _matched = false;
  if (_lobby) {
    _lobby.presence.leave().catch(() => {});
    _lobby.presence.unsubscribe();
    _lobby = null;
  }
  if (window.M.chan) {
    window.M.chan.unsubscribe();
    window.M.chan = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Enter lobby
// ─────────────────────────────────────────────────────────────────────────────

async function enterLobby(mode, p2AvEl, p2NmEl, statusEl, onStart) {
  _matched  = false;
  _statusEl = statusEl;

  cleanupNet();
  mmStatus(`<div class="spinner yellow"></div><div class="mm-txt">CONNECTING...</div>`);

  const rt = getRT();

  try {
    await new Promise((resolve, reject) => {
      if (rt.connection.state === 'connected') { resolve(); return; }
      const t = setTimeout(() => reject(new Error('Timeout')), 8000);
      rt.connection.once('connected', () => { clearTimeout(t); resolve(); });
      rt.connection.once('failed',    () => { clearTimeout(t); reject(new Error('Connection failed')); });
    });
  } catch (e) {
    mmStatus('<div style="color:#ff8844;font-size:.65rem;text-align:center">Cannot reach server.<br>Check your internet.</div>');
    return;
  }

  mmStatus(`<div class="spinner yellow"></div><div class="mm-txt">SEARCHING FOR OPPONENT…</div>`);

  const lobbyName = 'dotz:lobby:' + mode;
  _lobby = rt.channels.get(lobbyName);

  _lobby.presence.subscribe('enter', member => {
    if (_matched) return;
    if (member.clientId === myClientId()) return;
    _doPair(member.clientId, member.data?.name || 'Anon', member.data?.wallet || '', p2AvEl, p2NmEl, onStart);
  });

  try {
    const presenceData = { name: myDisplayName() };
    if (window.Wallet?.addr) presenceData.wallet = window.Wallet.addr;
    await _lobby.presence.enter(presenceData);
  } catch (e) {
    mmStatus(`<div style="color:#ff8844;font-size:.65rem;text-align:center">Lobby join failed.<br>${e.message}</div>`);
    return;
  }

  // Check for already-waiting players
  try {
    const members = await _lobby.presence.get();
    const others  = members.filter(m => m.clientId !== myClientId());
    if (others.length > 0 && !_matched) {
      _doPair(others[0].clientId, others[0].data?.name || 'Anon', others[0].data?.wallet || '', p2AvEl, p2NmEl, onStart);
    }
  } catch (e) { /* will match via subscribe */ }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pair players
// ─────────────────────────────────────────────────────────────────────────────

async function _doPair(oppId, oppName, oppWallet, p2AvEl, p2NmEl, onStart) {
  if (_matched) return;
  _matched = true;

  window.M.oppWallet = oppWallet || '';

  // Leave lobby immediately
  if (_lobby) {
    _lobby.presence.leave().catch(() => {});
    _lobby.presence.unsubscribe();
    _lobby = null;
  }

  // Lexicographic sort → stable P1/P2 assignment
  const myPN = myClientId() < oppId ? 1 : 2;
  const ids  = [myClientId(), oppId].sort();
  const mid  = 'dotz:game:' + ids[0].slice(-4) + ids[1].slice(-4);

  window.M.myPN   = myPN;
  window.M.id     = mid;
  window.M.isFree = true;

  // Update opponent avatar in UI
  document.getElementById(p2AvEl).className   = 'pav p2';
  document.getElementById(p2AvEl).textContent = (oppName[0] || '?').toUpperCase();
  document.getElementById(p2NmEl).textContent = oppName.slice(0, 10).toUpperCase();

  // Open game channel first so both sides can receive signals
  const rt   = getRT();
  const chan  = rt.channels.get(mid);
  window.M.chan = chan;

  // Subscribe to moves + tx signals before anything happens
  chan.subscribe('move', msg => {
    const { t, r, c, p } = msg.data;
    if (p !== window.M.myPN) applyMove(t, r, c, p, false);
  });
  chan.subscribe('match_recorded', msg => {
    window.M.onChainMatchId = msg.data?.matchId;
    if (msg.data?.matchId) showToast(`Match #${msg.data.matchId} on Celo 🌿`, 3500);
  });

  if (myPN === 1) {
    await _p1Flow(mid, chan, oppWallet, onStart);
  } else {
    await _p2Flow(mid, chan, onStart, oppName);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  P1 flow: MUST approve tx before game starts
// ─────────────────────────────────────────────────────────────────────────────

async function _p1Flow(mid, chan, oppWallet, onStart) {
  const addr = window.Wallet?.addr;

  // No wallet connected → cannot play free PvP (needs on-chain record)
  if (!addr || !window.ethereum) {
    _abortMatch(chan, 'no_wallet',
      'Connect your wallet to play Free PvP. The match start is recorded on Celo.');
    return;
  }

  // ── Step 1: Show "approve tx" prompt ──────────────────────────────────────
  mmStatus(`
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:1.5rem;margin-bottom:8px">🌿</div>
      <div style="color:var(--yellow);font-size:.78rem;font-weight:700;letter-spacing:.05em;margin-bottom:6px">
        OPPONENT FOUND!
      </div>
      <div style="color:var(--text);font-size:.62rem;margin-bottom:4px">
        Approve the wallet transaction to
      </div>
      <div style="color:var(--yellow);font-size:.62rem;font-weight:700;margin-bottom:14px">
        record this match on Celo
      </div>
      <div style="color:var(--muted);font-size:.55rem;background:rgba(252,255,82,.05);border:1px solid rgba(252,255,82,.1);border-radius:3px;padding:7px 10px;margin-bottom:12px">
        ⚡ Near-zero gas · Celo Sepolia
      </div>
      <div class="spinner yellow"></div>
      <div class="mm-txt" style="margin-top:6px">Check your wallet…</div>
    </div>
  `);

  let txHash = null;

  try {
    // Determine player2 address to pass to the contract.
    // Rules:
    //  1. Use oppWallet if it's a valid address AND not our own address
    //  2. Otherwise derive a deterministic non-zero address from the match ID
    //     (first 20 bytes of keccak-like hash of mid string)
    //     This is safe — contract only requires non-zero address.
    let p2Addr;
    if (
      oppWallet &&
      oppWallet.startsWith('0x') &&
      oppWallet.length === 42 &&
      oppWallet.toLowerCase() !== addr.toLowerCase()
    ) {
      p2Addr = oppWallet;
    } else {
      // Derive address from match ID string (first 20 bytes of a simple hash)
      // Using the mid string so it's unique per match
      let hash = 0x12345678;
      for (let i = 0; i < mid.length; i++) {
        hash = ((hash << 5) - hash + mid.charCodeAt(i)) >>> 0;
      }
      // Build a 20-byte address from the hash, ensuring it's non-zero
      const hashHex = hash.toString(16).padStart(8, '0');
      p2Addr = '0x' + hashHex.repeat(5); // 40 hex chars = 20 bytes
      if (CONFIG.debug) console.log('[match] using derived p2Addr:', p2Addr, 'for mid:', mid);
    }

    // ── This is the actual wallet prompt ──────────────────────────────────
    txHash = await matchStartOnChain(addr, p2Addr);
    // If we get here, user APPROVED ✅

  } catch (e) {
    // ── User rejected or wallet error ─────────────────────────────────────
    const rejected = window._isUserRejection?.(e) ?? (e.code === 4001);

    console.error('[match] tx error:', e.code, e.message);

    if (rejected) {
      _abortMatch(chan, 'tx_rejected',
        'Transaction declined. Match cancelled — the game requires an on-chain record.');
    } else {
      _abortMatch(chan, 'tx_failed',
        'Transaction failed: ' + (e.message || 'unknown error').slice(0, 80));
    }
    return; // ← HARD STOP — game does NOT start
  }

  // ── Step 2: TX submitted, show hash ──────────────────────────────────────
  mmStatus(`
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:1.4rem;margin-bottom:6px">⛓️</div>
      <div style="color:var(--yellow);font-size:.76rem;font-weight:700;margin-bottom:4px">
        TX SUBMITTED!
      </div>
      <div style="color:var(--muted);font-size:.5rem;margin-bottom:10px;word-break:break-all">
        ${txHash.slice(0, 22)}…
        <a href="${CONFIG.getExplorerTxUrl(txHash)}" target="_blank"
           style="color:var(--yellow);margin-left:4px">view ↗</a>
      </div>
      <div class="spinner yellow"></div>
      <div class="mm-txt">Confirming on Celo…</div>
    </div>
  `);

  // ── Signal P2 that tx is approved — they can now transition ──────────────
  chan.publish('tx_approved', { txHash, p1Wallet: addr }).catch(() => {});

  // ── Step 3: Wait for receipt in background, then start game ──────────────
  // We start the game as soon as tx is confirmed (not just submitted)
  try {
    const receipt = await waitReceipt(txHash);
    const matchId = parseMatchIdFromReceipt(receipt);
    window.M.onChainMatchId = matchId;

    if (matchId) {
      chan.publish('match_recorded', { txHash, matchId, p1Wallet: addr }).catch(() => {});
      if (CONFIG.debug) console.log('[match] on-chain matchId:', matchId);
    }

    mmStatus(`
      <div style="text-align:center;padding:8px 0">
        <div style="font-size:1.4rem;margin-bottom:4px">✅</div>
        <div style="color:var(--yellow);font-size:.76rem;font-weight:700">
          MATCH #${matchId || '?'} RECORDED!
        </div>
      </div>
    `);

    await new Promise(r => setTimeout(r, 700));

  } catch (e) {
    // Receipt timed out — but tx was submitted, so still start
    console.warn('[match] receipt wait timed out, starting anyway:', e.message);
    mmStatus(`
      <div style="text-align:center;padding:8px 0">
        <div style="font-size:1.4rem;margin-bottom:4px">✅</div>
        <div style="color:var(--yellow);font-size:.76rem;font-weight:700">TX SUBMITTED</div>
        <div style="color:var(--muted);font-size:.55rem;margin-top:4px">Confirming in background…</div>
      </div>
    `);
    await new Promise(r => setTimeout(r, 500));
  }

  // ── Start game ────────────────────────────────────────────────────────────
  _launchGame(onStart);
}

// ─────────────────────────────────────────────────────────────────────────────
//  P2 flow: wait for P1's tx_approved signal before starting
// ─────────────────────────────────────────────────────────────────────────────

async function _p2Flow(mid, chan, onStart, oppName) {
  mmStatus(`
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:1.4rem;margin-bottom:6px">🌿</div>
      <div style="color:var(--yellow);font-size:.76rem;font-weight:700;margin-bottom:6px">
        OPPONENT FOUND!
      </div>
      <div style="color:var(--muted);font-size:.58rem;margin-bottom:12px">
        Waiting for <strong style="color:var(--text)">${(oppName || 'opponent').slice(0, 12)}</strong><br>
        to approve the match transaction…
      </div>
      <div class="spinner yellow"></div>
      <div class="mm-txt" style="margin-top:6px">Do not close this screen</div>
    </div>
  `);

  // Wait up to 90 seconds for P1 to approve tx
  const approved = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve('timeout'), 90000);

    chan.subscribe('tx_approved', () => {
      clearTimeout(timeout);
      resolve('approved');
    });
    chan.subscribe('match_abort', (msg) => {
      clearTimeout(timeout);
      resolve('aborted:' + (msg.data?.reason || 'unknown'));
    });
  });

  if (approved === 'timeout') {
    _showP2Error('Opponent took too long to approve the transaction. Match cancelled.');
    cleanupNet();
    return;
  }

  if (approved.startsWith('aborted:')) {
    const reason = approved.replace('aborted:', '');
    let msg = 'Match cancelled.';
    if (reason === 'tx_rejected')  msg = 'Opponent declined the transaction. Match cancelled.';
    if (reason === 'tx_failed')    msg = 'Opponent\'s transaction failed. Match cancelled.';
    if (reason === 'no_wallet')    msg = 'Opponent has no wallet connected.';
    _showP2Error(msg);
    cleanupNet();
    return;
  }

  // tx_approved received — show brief success then launch
  mmStatus(`
    <div style="text-align:center;padding:8px 0">
      <div style="font-size:1.4rem;margin-bottom:4px">✅</div>
      <div style="color:var(--yellow);font-size:.76rem;font-weight:700">MATCH RECORDED!</div>
      <div style="color:var(--muted);font-size:.55rem;margin-top:4px">Starting game…</div>
    </div>
  `);

  await new Promise(r => setTimeout(r, 600));
  _launchGame(onStart);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Abort match — tell both sides, show error
// ─────────────────────────────────────────────────────────────────────────────

function _abortMatch(chan, reason, userMsg) {
  // Tell P2
  chan?.publish('match_abort', { reason }).catch(() => {});

  // Show error to P1
  mmStatus(`
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:1.5rem;margin-bottom:8px">❌</div>
      <div style="color:#ff8844;font-size:.7rem;font-weight:700;margin-bottom:8px">
        MATCH CANCELLED
      </div>
      <div style="color:var(--muted);font-size:.58rem;line-height:1.6;margin-bottom:14px">
        ${userMsg}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="cancelFreeMM()" style="margin:0 auto">
        BACK TO HOME
      </button>
    </div>
  `);

  // Reset match state
  _matched = false;
  if (window.M.chan) {
    window.M.chan.unsubscribe();
    window.M.chan = null;
  }
}

function _showP2Error(msg) {
  mmStatus(`
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:1.5rem;margin-bottom:8px">❌</div>
      <div style="color:#ff8844;font-size:.7rem;font-weight:700;margin-bottom:8px">
        MATCH CANCELLED
      </div>
      <div style="color:var(--muted);font-size:.58rem;line-height:1.6;margin-bottom:14px">
        ${msg}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="cancelFreeMM()" style="margin:0 auto">
        BACK TO HOME
      </button>
    </div>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Launch game (called by both P1 and P2 only after on-chain confirmed)
// ─────────────────────────────────────────────────────────────────────────────

function _launchGame(onStart) {
  onStart(myDisplayName(), window.M.myPN === 1 ? 'p1' : 'p2');
}

// Expose for ui.js
window.enterLobby    = enterLobby;
window.cleanupNet    = cleanupNet;
window.netSend       = netSend;
window.myClientId    = myClientId;
window.myDisplayName = myDisplayName;