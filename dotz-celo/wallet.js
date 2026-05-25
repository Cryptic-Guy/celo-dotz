// ─── wallet.js ───────────────────────────────────────────────────────────────
// Dual wallet support:
//   1. MiniPay (detected via window.ethereum.isMiniPay)
//   2. WalletConnect / injected (MetaMask, Rainbow, etc.) via wagmi/web3modal
//
// Usage: connectWallet(), disconnectWallet(), Wallet.addr
// ─────────────────────────────────────────────────────────────────────────────

window.Wallet = {
  addr:          null,
  username:      null,   // loaded from chain after connect
  isMiniPay:     false,
  providerType:  null,   // 'minipay' | 'injected' | 'walletconnect'

  short: () => {
    const a = window.Wallet.addr;
    return a ? a.slice(0, 5) + '…' + a.slice(-4) : '';
  },

  displayName: () => {
    if (window.Wallet.username) return window.Wallet.username;
    return window.Wallet.short();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  Provider helpers
// ─────────────────────────────────────────────────────────────────────────────

function _provider() {
  if (!window.ethereum) throw new Error('No wallet found. Install MetaMask or use MiniPay.');
  return window.ethereum;
}

async function _ensureCeloChain() {
  const currentChain = await _provider().request({ method: 'eth_chainId' });
  if (currentChain.toLowerCase() !== CONFIG.chainId.toLowerCase()) {
    await _switchToCelo();
  }
}

async function _switchToCelo() {
  try {
    await _provider().request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CONFIG.chainId }],
    });
  } catch (e) {
    // Chain not in wallet yet — add it
    if (e.code === 4902 || e.code === -32603) {
      await _provider().request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId:         CONFIG.chainId,
          chainName:       CONFIG.networkName,
          nativeCurrency:  CONFIG.nativeCurrency,
          rpcUrls:         [CONFIG.rpcUrl],
          blockExplorerUrls: [CONFIG.explorerUrl],
        }],
      });
    } else {
      throw e;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Detect wallet type
// ─────────────────────────────────────────────────────────────────────────────

function _detectWalletType() {
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.isMiniPay)     return 'minipay';
  if (eth.isMetaMask)    return 'metamask';
  if (eth.isCoinbaseWallet) return 'coinbase';
  return 'injected';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Connect wallet (auto-detects MiniPay vs injected)
// ─────────────────────────────────────────────────────────────────────────────

async function connectWallet() {
  try {
    if (!window.ethereum) {
      // No injected wallet — show helpful message
      showToast('No wallet found! Use MiniPay or install MetaMask.', 5000);
      _showNoWalletHelp();
      return null;
    }

    const type = _detectWalletType();
    window.Wallet.isMiniPay    = type === 'minipay';
    window.Wallet.providerType = type;

    // MiniPay auto-injects account, just request
    await _ensureCeloChain();

    const accounts = await _provider().request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) throw new Error('No accounts returned');

    window.Wallet.addr = accounts[0];

    if (CONFIG.debug) console.log('[wallet] connected:', window.Wallet.addr, 'type:', type);

    // Listen for account/chain changes
    _provider().removeAllListeners?.('accountsChanged');
    _provider().removeAllListeners?.('chainChanged');
    _provider().on('accountsChanged', (accs) => {
      if (!accs || accs.length === 0) _onDisconnect();
      else { window.Wallet.addr = accs[0]; _onWalletUpdate(); }
    });
    _provider().on('chainChanged', () => window.location.reload());

    await _onWalletUpdate();
    closeWalletModal();

    const label = window.Wallet.isMiniPay ? '🟡 MiniPay' : '🦊 Wallet';
    showToast(`${label} connected to ${CONFIG.networkShort}`, 3000);

    return window.Wallet.addr;

  } catch (e) {
    if (e.code === 4001) {
      showToast('Connection cancelled.', 2500);
    } else {
      console.error('[wallet] connect error:', e);
      showToast('Connect failed: ' + e.message, 5000);
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Disconnect
// ─────────────────────────────────────────────────────────────────────────────

function disconnectWallet() {
  _onDisconnect();
  showToast('Wallet disconnected', 2000);
}

function _onDisconnect() {
  window.Wallet.addr         = null;
  window.Wallet.username     = null;
  window.Wallet.isMiniPay    = false;
  window.Wallet.providerType = null;
  _updateWalletUI();
}

// ─────────────────────────────────────────────────────────────────────────────
//  After connect: load username from chain, update UI
// ─────────────────────────────────────────────────────────────────────────────

async function _onWalletUpdate() {
  _updateWalletUI();

  // Try loading username from DotzRegistry
  try {
    const uname = await registryGetUsername(window.Wallet.addr);
    if (uname && uname !== '') {
      window.Wallet.username = uname;
      _updateWalletUI();
    } else {
      // First time — show username registration modal
      setTimeout(() => openUsernameModal(), 600);
    }
  } catch (e) {
    if (CONFIG.debug) console.warn('[wallet] username fetch failed:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Update all wallet UI elements
// ─────────────────────────────────────────────────────────────────────────────

function _updateWalletUI() {
  const connected  = !!window.Wallet.addr;
  const displayName = connected ? (window.Wallet.username || window.Wallet.short()) : 'CONNECT';

  // Top bar button
  const btn = document.getElementById('wb-btn');
  if (btn) {
    btn.textContent = displayName;
    btn.style.color = connected ? 'var(--yellow)' : '';
    btn.style.borderColor = connected ? 'var(--yellow)' : '';
    btn.style.fontSize = connected ? '0.62rem' : '';
  }

  // MiniPay badge in topbar
  const mpBadge = document.getElementById('minipay-badge');
  if (mpBadge) {
    mpBadge.style.display = (connected && window.Wallet.isMiniPay) ? '' : 'none';
  }

  // Testnet warning
  const tw = document.getElementById('testnet-warning');
  if (tw) tw.style.display = CONFIG.isTestnet ? '' : 'none';

  // Connected vs disconnected views inside modal
  const wmc = document.getElementById('wm-connected');
  const wmd = document.getElementById('wm-disconnected');
  if (wmc) wmc.style.display = connected ? '' : 'none';
  if (wmd) wmd.style.display = connected ? 'none' : '';

  // Modal fields
  const wmAddr   = document.getElementById('wm-addr-full');
  const wmNet    = document.getElementById('wm-network-label');
  const wmTitle  = document.getElementById('wm-title');
  const wmUser   = document.getElementById('wm-username-display');
  if (wmAddr)  wmAddr.textContent  = connected ? window.Wallet.short() : '—';
  if (wmNet)   wmNet.textContent   = CONFIG.networkName;
  if (wmTitle) wmTitle.textContent = connected ? 'WALLET' : 'CONNECT';
  if (wmUser)  wmUser.textContent  = connected ? (window.Wallet.username || '(not set)') : '—';

  // Balance
  const balEl = document.getElementById('wm-bal');
  if (balEl && connected) {
    balEl.textContent = '…';
    fetch(CONFIG.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
        params: [window.Wallet.addr, 'latest'],
      }),
    })
      .then(r => r.json())
      .then(j => {
        const eth = (parseInt(j.result, 16) / 1e18).toFixed(4);
        balEl.textContent = eth + ' CELO';
      })
      .catch(() => { balEl.textContent = '—'; });
  } else if (balEl) {
    balEl.textContent = '—';
  }

  // Wallet type pill
  const typePill = document.getElementById('wm-wallet-type');
  if (typePill) {
    const labels = { minipay: '🟡 MiniPay', metamask: '🦊 MetaMask', coinbase: '🔵 Coinbase', injected: '💼 Wallet' };
    typePill.textContent = labels[window.Wallet.providerType] || '—';
    typePill.style.display = connected ? '' : 'none';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Copy wallet address
// ─────────────────────────────────────────────────────────────────────────────

function copyWalletAddr() {
  const addr = window.Wallet.addr;
  if (!addr) return;
  navigator.clipboard.writeText(addr).then(() => {
    showToast('Address copied!', 2000);
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = addr;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('Address copied!', 2000);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  No wallet fallback UI
// ─────────────────────────────────────────────────────────────────────────────

function _showNoWalletHelp() {
  const modal = document.getElementById('wallet-modal');
  const helpEl = document.getElementById('wm-no-wallet-help');
  if (helpEl) helpEl.style.display = '';
  if (modal)  modal.classList.add('open');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Wallet modal open/close
// ─────────────────────────────────────────────────────────────────────────────

function openWalletModal() {
  _updateWalletUI();
  document.getElementById('wallet-modal').classList.add('open');
}

function closeWalletModal() {
  document.getElementById('wallet-modal').classList.remove('open');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Auto-reconnect on page load
// ─────────────────────────────────────────────────────────────────────────────

// Expose so ui.js can call after username registration
window.updateWalletUI = _updateWalletUI;

window.addEventListener('load', async () => {
  try {
    if (!window.ethereum) return;
    const accounts = await _provider().request({ method: 'eth_accounts' });
    if (accounts && accounts.length > 0) {
      window.Wallet.addr         = accounts[0];
      window.Wallet.isMiniPay    = !!window.ethereum.isMiniPay;
      window.Wallet.providerType = _detectWalletType();
      await _onWalletUpdate();
      if (CONFIG.debug) console.log('[wallet] auto-reconnected:', window.Wallet.addr);
    }
  } catch (e) {
    if (CONFIG.debug) console.log('[wallet] no prior session');
  }
});
