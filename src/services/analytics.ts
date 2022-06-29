import axios from "axios";

export interface AnalyticsOpen extends Analytics {
  amount: number;
  operation: "open";
}

export interface AnalyticsClose extends Analytics {
  feesSol: number;
  feesUsdc: number;
  feesTotal: number;
  operation: "close";
}

export interface AnalyticsSwap extends Analytics {
  from: "USDC" | "SOL";
  to: "USDC" | "SOL";
  amount: number;
  operation: "swap";
}

export interface Analytics {
  timestamp: Date;
  price: number;
  sol: number;
  usdc: number;
  operation: "open" | "close" | "swap";
}

export async function save(data: Analytics): Promise<void> {
  console.log(`Saving analytics datapoint`);
  await axios.post(process.env.API_URL!, data);
}
