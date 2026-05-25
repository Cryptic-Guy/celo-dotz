require("@nomicfoundation/hardhat-toolbox");

// Set your deployer private key in .env — NEVER commit it
// Create a .env file: PRIVATE_KEY=0xabc123...
require("dotenv").config();

const PK = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 1000 }, // optimize for gas at deploy cost
      viaIR: true,
    },
  },

  networks: {
    // Celo Mainnet
    "celo-mainnet": {
      url: "https://forno.celo.org",
      chainId: 42220,
      accounts: [PK],
      gasPrice: "auto",
    },

    // Celo Alfajores (Testnet)
    "celo-alfajores": {
      url: "https://alfajores-forno.celo-testnet.org",
      chainId: 44787,
      accounts: [PK],
      gasPrice: "auto",
    },
  },

  etherscan: {
    apiKey: {
      "celo-mainnet":  process.env.CELOSCAN_API_KEY || "",
      "celo-alfajores": process.env.CELOSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "celo-mainnet",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io",
        },
      },
      {
        network: "celo-alfajores",
        chainId: 44787,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io",
        },
      },
    ],
  },
};
