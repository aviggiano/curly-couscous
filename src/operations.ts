import Decimal from "decimal.js";

import {
  PDAUtil,
  PositionData,
  WhirlpoolContext,
} from "@orca-so/whirlpools-sdk";
import { getBalance, getNFTs } from "./services/token";
import {
  closePosition,
  openPosition,
  swapTokens,
  whirlpool,
} from "./services/orca-old";
import * as analytics from "./services/analytics";
import {
  AnalyticsClose,
  AnalyticsOpen,
  AnalyticsSwap,
} from "./services/analytics";
import config from "./config";

export async function close(
  ctx: WhirlpoolContext,
  position: PositionData,
  price: Decimal,
  feesSol: number,
  feesUsdc: number,
  feesTotal: number
): Promise<void> {
  console.log(
    `Position ${position.positionMint.toBase58()} is not earning yield. Closing...`
  );

  await closePosition(
    whirlpool(),
    PDAUtil.getPosition(ctx.program.programId, position.positionMint).publicKey
  );

  console.log(`Position ${position.positionMint.toBase58()} closed`);

  const { usdc, sol, total } = await getBalance(price);

  const datapoint: AnalyticsClose = {
    timestamp: new Date(),
    price: price.toNumber(),
    sol,
    usdc,
    total,
    feesSol,
    feesUsdc,
    feesTotal,
    operation: "close",
  };
  await analytics.save(datapoint);
}

export async function open(
  amountSol: number,
  spaces: number,
  price: Decimal
): Promise<void> {
  const { usdc, sol, total } = await getBalance(price);

  if (sol < amountSol + config.strategy.minSolOnWallet) {
    const from = "USDC";
    const to = "SOL";
    const amount =
      price.toNumber() * (amountSol - sol + config.strategy.minSolOnWallet);
    await swapTokens(from, to, amount);

    const datapoint: AnalyticsSwap = {
      timestamp: new Date(),
      price: price.toNumber(),
      sol,
      usdc,
      total,
      amount,
      from,
      to,
      operation: "swap",
    };
    await analytics.save(datapoint);
  } else if (sol > amountSol + config.strategy.minSolOnWallet) {
    console.log("Swapping exceeding SOL for USDC");
    const from = "SOL";
    const to = "USDC";
    const amount = sol - (amountSol + config.strategy.minSolOnWallet);

    await swapTokens(from, to, amount);

    const datapoint: AnalyticsSwap = {
      timestamp: new Date(),
      price: price.toNumber(),
      sol,
      usdc,
      total,
      amount,
      from,
      to,
      operation: "swap",
    };
    await analytics.save(datapoint);
  }

  const { from, to } = await openPosition(whirlpool(), amountSol, spaces);

  const datapoint: AnalyticsOpen = {
    timestamp: new Date(),
    price: price.toNumber(),
    amount: amountSol,
    sol,
    usdc,
    total,
    from,
    to,
    operation: "open",
  };
  await analytics.save(datapoint);
}
