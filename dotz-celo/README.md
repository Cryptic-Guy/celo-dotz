# ⚡ DOTZ — On-Chain Dots & Boxes on Celo

**Proof of Ship · May 2025**

Competitive Dots & Boxes game on the **Celo blockchain**. Free PvP match starts are recorded on-chain. Near-zero gas fees thanks to Celo.

---

## 🗂 File Structure

```
dotz-celo/
├── index.html          — Main app UI (all screens)
├── style.css           — Yellow/black Celo theme
├── config.js           — Network config (switch Mainnet ↔ Alfajores here)
├── contract.js         — On-chain calls (DotzRegistry + DotzMatch)
├── wallet.js           — MiniPay + any injected wallet
├── game.js             — Dots & Boxes engine + bot AI
├── matchmaking.js      — Ably real-time matchmaking + on-chain match recording
├── ui.js               — Screen logic, modals, results, toasts
├── vite.config.js      — Vite config for Replit
├── package.json
├── hardhat.config.js   — For contract deployment
├── scripts/
│   └── deploy.js       — Deploy both contracts
└── contracts/
    ├── DotzRegistry.sol — Username registration (on-chain, permanent)
    └── DotzMatch.sol    — Records free PvP match starts on-chain
```

---

## 🚀 Quick Start (Replit)

### 1. Install & run

```bash
npm install
npm run dev
```

App runs at your Replit URL on port 8080.

---

## 📜 Smart Contracts

### DotzRegistry.sol
- One username per wallet — permanent, on-chain
- 3–16 chars: A-Z, a-z, 0-9, underscore
- `register(bytes32)` — one-time call
- `getUsername(address)` — read username
- `hasUsername(address)` — check if registered

### DotzMatch.sol  
- Records free PvP match starts on-chain
- P1 calls `startMatch(address player2)` — emits `MatchStarted` event
- Stores match count, both player addresses, timestamp
- Ultra-lean — no staking, no loops, one storage write + event

---

## 🌐 Deploy Contracts

### 1. Install Hardhat deps

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox dotenv
```

### 2. Create `.env`

```bash
echo "PRIVATE_KEY=0xYOUR_PRIVATE_KEY" > .env
```

⚠️ Never commit `.env` — add to `.gitignore`!

### 3. Deploy to Alfajores (testnet first)

```bash
npx hardhat run scripts/deploy.js --network celo-alfajores
```

Get test CELO: https://faucet.celo.org/alfajores

### 4. Deploy to Mainnet

```bash
npx hardhat run scripts/deploy.js --network celo-mainnet
```

### 5. Update config.js

After deploying, paste addresses in `config.js`:

```js
'celo-alfajores': {
  registryContract: '0xYOUR_REGISTRY_ADDR',
  matchContract:    '0xYOUR_MATCH_ADDR',
},
'celo-mainnet': {
  registryContract: '0xYOUR_REGISTRY_ADDR',
  matchContract:    '0xYOUR_MATCH_ADDR',
},
```

### 6. Verify on Celoscan (optional)

```bash
npx hardhat verify --network celo-mainnet YOUR_CONTRACT_ADDRESS
```

---

## 🔀 Switch Networks

In `config.js`, line 7:

```js
const NETWORK = 'celo-mainnet';   // production
// or
const NETWORK = 'celo-alfajores'; // testnet
```

That's it. Everything auto-switches.

---

## 👛 Wallet Support

| Wallet | How |
|--------|-----|
| **MiniPay** | Auto-detected via `window.ethereum.isMiniPay` (Opera Mini) |
| **MetaMask** | Injected `window.ethereum` |
| **Rainbow** | Injected |
| **Any EIP-1193 wallet** | Works — no WalletConnect lib needed (saves bundle size) |

No wallet? Bot practice mode works without any wallet.

---

## 🎮 Game Modes

| Mode | Status | On-chain? |
|------|--------|-----------|
| 🎮 Free PvP | ✅ Live | Match start recorded |
| 🤖 vs Bot | ✅ Live | No |
| ⚔ Staked PvP | 🚧 Coming soon | — |
| 🔗 Invite Friend | 🚧 Coming soon | — |
| 🎯 Join by Code | 🚧 Coming soon | — |

---

## 🌿 Why Celo?

- **Near-zero gas** — DotzMatch.startMatch() costs ~0.0001 CELO ($0.00006)
- **MiniPay** — 3M+ users in Africa, built into Opera Mini
- **EVM-compatible** — same Solidity, same tools
- **Mobile-first** — perfect for on-the-go casual gaming

---

## 🔑 Key Config Values

| Key | Where | Description |
|-----|-------|-------------|
| `NETWORK` | config.js line 7 | Switch mainnet/testnet |
| `ablyKey` | config.js | Your Ably API key for matchmaking |
| `registryContract` | config.js | DotzRegistry deployed address |
| `matchContract` | config.js | DotzMatch deployed address |
| `PRIVATE_KEY` | .env | Deployer wallet (never commit!) |
