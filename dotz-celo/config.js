// ─── config.js ───────────────────────────────────────────────────────────────
// DOTZ · Celo Network Configuration
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ CHANGE THIS to switch networks
const NETWORK = 'celo-mainnet'; // Options: 'celo-mainnet' | 'celo-sepolia'

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────

const NETWORKS = {
  'celo-sepolia': {
    name:           'Celo Sepolia Testnet',
    shortName:      'SEPOLIA',
    // Celo Sepolia chainId — use whichever your MetaMask shows for this network.
    // If MetaMask shows 44787 use '0xaef3'; if it shows 11142220 use '0xaa044c'
    // Check: open MetaMask → Settings → Networks → find your Celo Sepolia entry
    chainId:        '0xaa044c',        // 44787  ← try this first
    chainIdInt:     11142220,
    rpcUrl:         'https://forno.celo-sepolia.celo-testnet.org',
    explorerUrl:    'https://sepolia.celoscan.io',
    nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
    registryContract: '0x84d8FF0b43b9Afc1989c41b5C56f30AA2A423F6d',
    matchContract:    '0x332b45F1B763fFcc4f65042c6AC7546e81C56145',
    isTestnet:      true,
  },
  'celo-mainnet': {
    name:           'Celo Mainnet',
    shortName:      'CELO',
    chainId:        '0xa4ec',        // 42220
    chainIdInt:     42220,
    rpcUrl:         'https://forno.celo.org',
    explorerUrl:    'https://celoscan.io',
    nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
    registryContract: '0x7C2C4963D4170F213BfAcd0e4d68E39C129C547a',
    matchContract:    '0x9818115B21634B73016D54364117302c08D7ad1E',
    isTestnet:      false,
  },
};

// Validate
const ACTIVE_NETWORK = NETWORKS[NETWORK];
if (!ACTIVE_NETWORK) {
  throw new Error(`Invalid NETWORK: "${NETWORK}". Options: celo-mainnet | celo-sepolia`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG OBJECT
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  network:          NETWORK,
  chainId:          ACTIVE_NETWORK.chainId,
  chainIdInt:       ACTIVE_NETWORK.chainIdInt,
  rpcUrl:           ACTIVE_NETWORK.rpcUrl,
  explorerUrl:      ACTIVE_NETWORK.explorerUrl,
  networkName:      ACTIVE_NETWORK.name,
  networkShort:     ACTIVE_NETWORK.shortName,
  nativeCurrency:   ACTIVE_NETWORK.nativeCurrency,
  isTestnet:        ACTIVE_NETWORK.isTestnet,

  registryContract: ACTIVE_NETWORK.registryContract,
  matchContract:    ACTIVE_NETWORK.matchContract,

  appName:    'DOTZ',
  appLogoUrl: 'https://dotz.repl.co/icon.png',

  // Ably key for real-time matchmaking
  ablyKey: 'vA41XA.4un8Nw:CzmRTxdqjwJMdBgw4a4yDauV9xignrdVFqE6201YIoc',

  features: {
    freePvP:       true,
    botMode:       true,
    stakedPvP:     false,
    inviteFriend:  false,
    joinByCode:    false,
  },

  debug: true,
};

CONFIG.getExplorerTxUrl   = (hash) => `${CONFIG.explorerUrl}/tx/${hash}`;
CONFIG.getExplorerAddrUrl = (addr) => `${CONFIG.explorerUrl}/address/${addr}`;

// Console badge
if (typeof window !== 'undefined') {
  const badge = CONFIG.isTestnet ? '🟡 TESTNET' : '🟢 MAINNET';
  console.log(
    `%c🌿 DOTZ — ${CONFIG.networkName} ${badge}`,
    'color:#FCFF52;font-weight:bold;background:#1a1a00;padding:3px 8px;border-radius:4px'
  );
  if (CONFIG.isTestnet) console.warn('⚠️ TESTNET MODE — Celo Sepolia — Use test CELO only!');

  // ── CHAIN ID MISMATCH GUARD ───────────────────────────────────────────────
  // If MetaMask is on a different chain ID for "Celo Sepolia" than what we set,
  // this will catch it early. Check console on load.
  if (window.ethereum) {
    window.ethereum.request({ method: 'eth_chainId' }).then(current => {
      if (current && current.toLowerCase() !== CONFIG.chainId.toLowerCase()) {
        console.warn(
          `[config] ⚠️ Wallet chain ${current} (${parseInt(current,16)}) ` +
          `≠ config chain ${CONFIG.chainId} (${CONFIG.chainIdInt}). ` +
          `If you see wrong chainId errors, update chainId in config.js to match your MetaMask.`
        );
      } else {
        console.log(`[config] ✅ Chain ID matches: ${current}`);
      }
    }).catch(() => {});
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;