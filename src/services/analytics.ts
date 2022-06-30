import * as sheets from "./sheets";
import config from "../config";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { Data } from "./sheets";

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

const state: {
  doc?: GoogleSpreadsheet;
} = {
  doc: undefined,
};

export async function init(): Promise<void> {
  state.doc = await sheets.init(config.sheets.spreadsheetId);
}

export async function save(data: Analytics): Promise<void> {
  console.log(
    `Saving analytics datapoint`,
    config.sheets.sheetTitle,
    JSON.stringify(data)
  );

  await sheets.append(state.doc!, config.sheets.sheetTitle, [
    data as unknown as Data,
  ]);
}
