import axios from "axios";

export interface AnalyticsOpen extends Analytics {
  amount: number;
  from: number;
  to: number;
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
  total: number;
  operation: "open" | "close" | "swap";
}

export async function save(data: Analytics): Promise<void> {
  const url = process.env.API_URL!;
  console.log(`Saving analytics datapoint`, url, data);
  await axios.post(url, data);
}
