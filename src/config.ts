import "dotenv/config";

export default {
  rpc: {
    endpoint: "https://api.mainnet-beta.solana.com",
  },
  strategy: {
    spaces: 4,
    tickSpacing: 64,
    minSolOnWallet: 0.2,
    amountSol: 4,
    swapMin: 0.01,
  },
  sheets: {
    spreadsheetId: process.env.SPREADSHEET_ID!,
    sheetTitle: "Orca",
  },
};
