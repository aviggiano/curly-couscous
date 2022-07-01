import "dotenv/config";
import express from "express";
import { Provider } from "@project-serum/anchor";
import {
  WhirlpoolContext,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  AccountFetcher,
  ORCA_WHIRLPOOLS_CONFIG,
  PriceMath,
  PDAUtil,
} from "@orca-so/whirlpools-sdk";
import { solToken, usdcToken } from "@orca-so/sdk/dist/constants/tokens";
import {
  openPosition,
  closePosition,
  visualize,
  whirlpool,
  swap,
} from "./services/orca-old";
import config from "./config";
import { getUsdc, getSol } from "./services/token";
import * as analytics from "./services/analytics";
import {
  AnalyticsClose,
  AnalyticsOpen,
  AnalyticsSwap,
} from "./services/analytics";
import { getFees, getPositions } from "./services/orca";

async function main() {
  const provider = Provider.env();
  const ctx = WhirlpoolContext.withProvider(
    provider,
    ORCA_WHIRLPOOL_PROGRAM_ID
  );

  const fetcher = new AccountFetcher(ctx.provider.connection);

  const poolAddress = PDAUtil.getWhirlpool(
    ORCA_WHIRLPOOL_PROGRAM_ID,
    ORCA_WHIRLPOOLS_CONFIG,
    solToken.mint,
    usdcToken.mint,
    config.strategy.tickSpacing
  ).publicKey;

  const spaces = config.strategy.spaces;
  await visualize(whirlpool(), spaces * 3);

  const pool = await fetcher.getPool(poolAddress);
  if (!pool) return;

  const price = PriceMath.sqrtPriceX64ToPrice(
    pool.sqrtPrice,
    solToken.scale,
    usdcToken.scale
  );
  console.log(`Pool price ${price.toFixed(4)}`);

  const positions = await getPositions(fetcher);
  const [usdc, sol] = await Promise.all([getUsdc(), getSol()]);
  const total = price.mul(sol).add(usdc).toNumber();
  console.log(`Balance on wallet: ${sol} SOL + ${usdc} USDC (${total} USD)`);

  await Promise.all(
    positions
      .filter((position) => {
        const isEarningYield =
          position.tickLowerIndex < pool.tickCurrentIndex &&
          pool.tickCurrentIndex < position.tickUpperIndex;
        if (!isEarningYield) {
          console.log(
            `Position ${position.positionMint.toBase58()} is not earning yield`
          );
        }
        return !isEarningYield;
      })
      .map(async (position) => {
        console.log(`Closing position ${position.positionMint.toBase58()}`);
        const { feesSol, feesUsdc } = await getFees(
          ctx,
          fetcher,
          pool,
          poolAddress,
          position
        );
        console.log(
          `Fees: ${feesSol.toFixed(4)} SOL + ${feesUsdc.toFixed(4)} USDC`
        );

        const feesTotal = price.toNumber() * feesSol + feesUsdc;

        console.log(`Fees: ${feesTotal.toFixed(4)} USD`);

        await closePosition(
          whirlpool(),
          PDAUtil.getPosition(ctx.program.programId, position.positionMint)
            .publicKey
        );
        console.log(`Position ${position.positionMint.toBase58()} closed`);

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
      })
  );

  const ratio = (sol * price.toNumber()) / (sol * price.toNumber() + usdc);
  console.log(`Balance ratio: ${(ratio * 100).toFixed(0)}%`);

  let shouldSwap = false,
    from = "" as "USDC" | "SOL",
    to = "" as "USDC" | "SOL",
    amount = NaN;

  const balancedRatio = 0.5;
  if (ratio > 2 / 3) {
    amount = (ratio - balancedRatio) * sol;
    from = "SOL";
    to = "USDC";
    shouldSwap = true;
  } else if (ratio < 1 / 3) {
    amount = (balancedRatio - ratio) * usdc;
    from = "USDC";
    to = "SOL";
    shouldSwap = true;
  }
  if (shouldSwap) {
    await swap(from, to, amount);

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

  const amountSol = 0.5;
  const minOnWallet = 0.2;
  if (sol - amountSol > minOnWallet) {
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
  } else {
    console.log("Not opening new positions due to low SOL wallet balance");
  }
}

const PORT = process.env.PORT || 3000;
express()
  .get("/", (_req: any, res: any) => res.send({ success: true }))
  .listen(PORT, async () => {
    console.log(`Listening to port ${PORT}`);

    // await analytics.init();

    // (function loop(): unknown {
    //   return Promise.resolve()
    //     .then(async () => {
    //       await main();
    //     })
    //     .catch((e) => console.error(e))
    //     .then(async () => {
    //       const timeout = 10e3;
    //       console.log(`Waiting ${timeout / 1e3} seconds`);
    //       await new Promise((resolve) => setTimeout(resolve, timeout));
    //       loop();
    //     });
    // })();
  });
