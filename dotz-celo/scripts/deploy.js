// ─── deploy.js ────────────────────────────────────────────────────────────────
// Deploys DotzRegistry + DotzMatch to Celo Mainnet or Alfajores
//
// Usage:
//   npx hardhat run scripts/deploy.js --network celo-mainnet
//   npx hardhat run scripts/deploy.js --network celo-alfajores
//
// After deploying, paste the addresses into config.js:
//   registryContract: '0x...',
//   matchContract:    '0x...',
// ─────────────────────────────────────────────────────────────────────────────

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "CELO");

  // ── Deploy DotzRegistry ──────────────────────────────────────────────────
  console.log("\n📋 Deploying DotzRegistry...");
  const Registry = await hre.ethers.getContractFactory("DotzRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("✅ DotzRegistry deployed to:", registryAddr);

  // ── Deploy DotzMatch ─────────────────────────────────────────────────────
  console.log("\n🎮 Deploying DotzMatch...");
  const Match = await hre.ethers.getContractFactory("DotzMatch");
  const match = await Match.deploy();
  await match.waitForDeployment();
  const matchAddr = await match.getAddress();
  console.log("✅ DotzMatch deployed to:", matchAddr);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ DEPLOYMENT COMPLETE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`DotzRegistry: ${registryAddr}`);
  console.log(`DotzMatch:    ${matchAddr}`);
  console.log("\n👉 Paste these into config.js:");
  console.log(`  registryContract: '${registryAddr}',`);
  console.log(`  matchContract:    '${matchAddr}',`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
