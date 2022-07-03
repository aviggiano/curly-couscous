import "dotenv/config";

export default {
  rpc: {
    endpoint: "https://api.mainnet-beta.solana.com",
  },
  strategy: {
    spaces: 2,
    tickSpacing: 64,
    minSolOnWallet: 0.2,
    amountSol: 2,
  },
  sheets: {
    spreadsheetId: process.env.SPREADSHEET_ID!,
    sheetTitle: "Orca",
  },
};
