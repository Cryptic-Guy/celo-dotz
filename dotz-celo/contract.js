// ─── contract.js ─────────────────────────────────────────────────────────────
// DOTZ · Celo — On-chain contract interactions
// DotzRegistry + DotzMatch — raw eth_call / eth_sendTransaction, no ethers dep
//
// ⚠️  Function selectors are keccak256(signature).slice(0,4) — computed correctly.
// ─────────────────────────────────────────────────────────────────────────────

// ── Verified function selectors (keccak256) ───────────────────────────────────
// Computed via: ethers.id(sig).slice(0,10)
const SELECTORS = {
  // DotzRegistry
  register:     '0xe1fa8e84',  // register(bytes32)
  getUsername:  '0xce43c032',  // getUsername(address)
  hasUsername:  '0xa5c2fb82',  // hasUsername(address)
  // DotzMatch
  startMatch:   '0xf439c8e6',  // startMatch(address)
  totalMatches: '0x2a5b1451',  // totalMatches()
  matchCount:   '0x79c4264b',  // matchCount()
};

// ── ABI encode helpers ────────────────────────────────────────────────────────

function _pad32(hex) {
  return hex.replace('0x', '').padStart(64, '0');
}

function _encodeAddress(addr) {
  return _pad32(addr.toLowerCase().replace('0x', ''));
}

// Encode a JS string as right-padded bytes32 (max 32 bytes)
function _encodeBytes32(str) {
  let hex = '';
  for (let i = 0; i < Math.min(str.length, 32); i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex.padEnd(64, '0');
}

// Decode bytes32 hex back to JS string (stops at null byte)
function _decodeBytes32(hex) {
  const raw = hex.replace('0x', '');
  let str = '';
  for (let i = 0; i < raw.length; i += 2) {
    const code = parseInt(raw.slice(i, i + 2), 16);
    if (code === 0) break;
    str += String.fromCharCode(code);
  }
  return str;
}

function _decodeBool(hex) {
  return parseInt(hex.replace('0x', ''), 16) !== 0;
}

// ── Provider ─────────────────────────────────────────────────────────────────

function _provider() {
  if (!window.ethereum) throw new Error('Wallet not connected');
  return window.ethereum;
}

// ── eth_call (read-only) ──────────────────────────────────────────────────────

async function _call(to, data) {
  const res = await fetch(CONFIG.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  }).then(r => r.json());

  if (res.error) throw new Error('eth_call failed: ' + (res.error.message || JSON.stringify(res.error)));
  return res.result;
}

// ── eth_estimateGas ───────────────────────────────────────────────────────────
// Runs a simulation. If it reverts, throws with decoded reason BEFORE MetaMask opens.

async function _estimateGas(from, to, data) {
  const res = await fetch(CONFIG.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_estimateGas',
      params: [{ from, to, data, value: '0x0' }],
    }),
  }).then(r => r.json());

  if (res.error) {
    const reason = _decodeRevertReason(res.error?.data) || res.error?.message || 'execution reverted';
    console.error('[contract] estimateGas revert:', reason, res.error);
    throw Object.assign(new Error('Contract call would revert: ' + reason), { isRevert: true });
  }

  const estimated = parseInt(res.result, 16);
  const withBuffer = Math.ceil(estimated * 1.30); // 30% buffer
  if (CONFIG.debug) console.log('[contract] gas:', estimated, '→', withBuffer);
  return '0x' + withBuffer.toString(16);
}

// ── eth_sendTransaction ───────────────────────────────────────────────────────

async function _send(to, data, from, value = '0x0') {
  const gas = await _estimateGas(from, to, data); // throws on revert
  return _provider().request({
    method: 'eth_sendTransaction',
    params: [{ from, to, data, value, gas }],
  });
}

// ── Decode revert reason ──────────────────────────────────────────────────────

function _decodeRevertReason(data) {
  if (!data || data === '0x') return null;
  const hex = data.replace('0x', '');

  // Standard Error(string): selector 08c379a0
  if (hex.startsWith('08c379a0')) {
    try {
      const lenHex = hex.slice(8 + 64, 8 + 128);
      const len    = parseInt(lenHex, 16);
      const strHex = hex.slice(8 + 128, 8 + 128 + len * 2);
      let str = '';
      for (let i = 0; i < strHex.length; i += 2)
        str += String.fromCharCode(parseInt(strHex.slice(i, i + 2), 16));
      return '"' + str + '"';
    } catch { return null; }
  }

  // Known custom error selectors
  const known = {
    '2d2b0e2e': 'AlreadyRegistered()',
    'a0a100a4': 'UsernameTaken()',
    '77a2b8e6': 'InvalidUsername()',
    'b1efa9d4': 'ZeroAddress()',
  };
  const sel = hex.slice(0, 8).toLowerCase();
  return known[sel] || ('custom error 0x' + sel);
}

// ── Is user rejection ─────────────────────────────────────────────────────────

function _isUserRejection(e) {
  if (!e) return false;
  const code = e.code;
  const msg  = (e.message || '').toLowerCase();
  if (code === 4001 || code === 4100) return true;
  if (msg.includes('user denied') || msg.includes('user rejected') ||
      msg.includes('rejected')    || msg.includes('cancelled') ||
      msg.includes('canceled'))    return true;
  return false;
}

// ── Wait for receipt ──────────────────────────────────────────────────────────

async function waitReceipt(hash, maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2500));
    const res = await fetch(CONFIG.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_getTransactionReceipt',
        params: [hash],
      }),
    }).then(r => r.json());
    if (res.result) return res.result;
  }
  throw new Error('Transaction timeout');
}

// ── Parse matchId from MatchStarted event ─────────────────────────────────────

function parseMatchIdFromReceipt(receipt) {
  const log = receipt.logs?.find(l =>
    l.address?.toLowerCase() === CONFIG.matchContract.toLowerCase()
  );
  if (!log || !log.topics[1]) return null;
  return parseInt(log.topics[1], 16);
}

// ─────────────────────────────────────────────────────────────────────────────
//  DotzRegistry
// ─────────────────────────────────────────────────────────────────────────────

async function registryRegister(from, uname) {
  if (!CONFIG.registryContract || CONFIG.registryContract === '0x0000000000000000000000000000000000000000') {
    throw new Error('DotzRegistry not deployed — set registryContract in config.js');
  }
  const data = SELECTORS.register + _encodeBytes32(uname);
  if (CONFIG.debug) console.log('[registry] register data:', data, 'uname:', uname);
  return _send(CONFIG.registryContract, data, from);
}

async function registryGetUsername(addr) {
  if (!CONFIG.registryContract || CONFIG.registryContract === '0x0000000000000000000000000000000000000000') return '';
  try {
    const data   = SELECTORS.getUsername + _encodeAddress(addr);
    const result = await _call(CONFIG.registryContract, data);
    if (!result || result === '0x') return '';
    return _decodeBytes32(result);
  } catch (e) {
    console.warn('[registry] getUsername failed:', e.message);
    return '';
  }
}

async function registryHasUsername(addr) {
  if (!CONFIG.registryContract || CONFIG.registryContract === '0x0000000000000000000000000000000000000000') return false;
  try {
    const data   = SELECTORS.hasUsername + _encodeAddress(addr);
    const result = await _call(CONFIG.registryContract, data);
    return _decodeBool(result);
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  DotzMatch
// ─────────────────────────────────────────────────────────────────────────────

async function matchStartOnChain(from, player2) {
  if (!CONFIG.matchContract || CONFIG.matchContract === '0x0000000000000000000000000000000000000000') {
    throw new Error('DotzMatch not deployed — set matchContract in config.js');
  }
  const data = SELECTORS.startMatch + _encodeAddress(player2);
  if (CONFIG.debug) console.log('[match] startMatch data:', data, 'p2:', player2);
  return _send(CONFIG.matchContract, data, from);
}

async function matchGetTotal() {
  if (!CONFIG.matchContract || CONFIG.matchContract === '0x0000000000000000000000000000000000000000') return 0;
  try {
    const result = await _call(CONFIG.matchContract, SELECTORS.totalMatches);
    return parseInt(result, 16) || 0;
  } catch { return 0; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────────────────────

window.registryRegister        = registryRegister;
window.registryGetUsername     = registryGetUsername;
window.registryHasUsername     = registryHasUsername;
window.matchStartOnChain       = matchStartOnChain;
window.matchGetTotal           = matchGetTotal;
window.waitReceipt             = waitReceipt;
window.parseMatchIdFromReceipt = parseMatchIdFromReceipt;
window._isUserRejection        = _isUserRejection;