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
import { visualize, whirlpool } from "./services/orca-old";
import config from "./config";
import * as analytics from "./services/analytics";
import { getFees, getPositions } from "./services/orca";
import { open, close } from "./operations";

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

  await Promise.all(
    positions.map(async (position) => {
      const { feesSol, feesUsdc, feesTotal } = await getFees(
        ctx,
        fetcher,
        pool,
        poolAddress,
        position,
        price
      );

      const isEarningYield =
        position.tickLowerIndex < pool.tickCurrentIndex &&
        pool.tickCurrentIndex < position.tickUpperIndex;

      if (isEarningYield) return;

      await close(ctx, position, price, feesSol, feesUsdc, feesTotal);
    })
  );

  if (!positions.length) {
    const amountSol = 1;
    await open(amountSol, spaces, price);
  }
}

const PORT = process.env.PORT || 3000;
express()
  .get("/", (_req: any, res: any) => res.send({ success: true }))
  .listen(PORT, async () => {
    console.log(`Listening to port ${PORT}`);

    await analytics.init();

    (function loop(): unknown {
      return Promise.resolve()
        .then(async () => {
          await main();
        })
        .catch((e) => console.error(e))
        .then(async () => {
          const timeout = 10e3;
          console.log(`Waiting ${timeout / 1e3} seconds`);
          await new Promise((resolve) => setTimeout(resolve, timeout));
          loop();
        });
    })();
  });
