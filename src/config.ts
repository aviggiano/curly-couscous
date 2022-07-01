import "dotenv/config";

export default {
  rpc: {
    endpoint: "https://api.mainnet-beta.solana.com",
  },
  strategy: {
    spaces: 4,
    tickSpacing: 64,
    minSolOnWallet: 0.1,
  },
  sheets: {
    spreadsheetId: process.env.SPREADSHEET_ID!,
    sheetTitle: "Orca",
  },
};
