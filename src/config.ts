import "dotenv/config";

export default {
  account: {
    privateKey: process.env.PRIVATE_KEY!,
  },
  rpc: {
    endpoint: "https://api.mainnet-beta.solana.com",
  },
};
