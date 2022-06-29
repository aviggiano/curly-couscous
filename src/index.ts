import "dotenv/config";
import express from "express";
import { Provider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  WhirlpoolContext,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  AccountFetcher,
  TickUtil,
  TickArrayData,
  TickArrayUtil,
  WhirlpoolData,
  PositionData,
  ORCA_WHIRLPOOLS_CONFIG,
  collectFeesQuote,
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
import { getNFTs, getUsdc, getSol } from "./services/token";

async function getFees(
  ctx: WhirlpoolContext,
  fetcher: AccountFetcher,
  pool: WhirlpoolData,
  poolAddress: PublicKey,
  position: PositionData
): Promise<{ feesSol: number; feesUsdc: number }> {
  const tickArrayPda = PDAUtil.getTickArray(
    ctx.program.programId,
    poolAddress,
    TickUtil.getStartTickIndex(position.tickLowerIndex, pool.tickSpacing)
  );

  const tickArrayData = (await fetcher.getTickArray(
    tickArrayPda.publicKey
  )) as TickArrayData;
  const tickLower = TickArrayUtil.getTickFromArray(
    tickArrayData,
    position.tickLowerIndex,
    pool.tickSpacing
  );
  const tickUpper = TickArrayUtil.getTickFromArray(
    tickArrayData,
    position.tickUpperIndex,
    pool.tickSpacing
  );

  const feeQuote = collectFeesQuote({
    whirlpool: pool,
    position: position,
    tickLower,
    tickUpper,
  });

  const feesInTokenA = feeQuote.feeOwedA;
  const feesInTokenB = feeQuote.feeOwedB;

  const feesSol = feesInTokenA.toNumber() / 10 ** solToken.scale;
  const feesUsdc = feesInTokenB.toNumber() / 10 ** usdcToken.scale;
  return { feesSol, feesUsdc };
}

async function main() {
  const PORT = process.env.PORT || 3000;
  express()
    .get("/", (_req: any, res: any) => res.send({ success: true }))
    .listen(PORT, () => console.log(`Listening to port ${PORT}`));

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

  const nfts = await getNFTs();

  const positions = await Promise.all(
    nfts.map((nft) => {
      const positionAddress = PDAUtil.getPosition(
        ORCA_WHIRLPOOL_PROGRAM_ID,
        new PublicKey(nft)
      );
      return fetcher.getPosition(positionAddress.publicKey);
    })
  );

  await Promise.all(
    (positions.filter((position) => position) as PositionData[])
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
      })
  );

  const [usdc, sol] = await Promise.all([getUsdc(), getSol()]);
  console.log(`Balance on wallet: ${sol} SOL + ${usdc} USDC`);
  const ratio = (sol * price.toNumber()) / (sol * price.toNumber() + usdc);
  console.log(`Balance ratio: ${(ratio * 100).toFixed(0)}%`);

  if (ratio > 0.75) {
    const amount = (ratio - 0.5) * sol;
    await swap("SOL", "USDC", amount);
  } else if (ratio < 0.25) {
    const amount = (0.5 - ratio) * usdc;
    await swap("USDC", "SOL", amount);
  }

  const amountSol = 0.5;
  const minOnWallet = 0.2;
  if (sol - amountSol > minOnWallet) {
    await openPosition(whirlpool(), amountSol, spaces);
  } else {
    console.log("Not opening new positions due to low SOL wallet balance");
  }
}

(function loop(): unknown {
  return Promise.resolve()
    .then(async () => {
      await main();
    })
    .catch((e) => console.error(e))
    .then(async () => {
      const timeout = 60e3;
      console.log(`Waiting ${timeout / 1e3} seconds`);
      await new Promise((resolve) => setTimeout(resolve, timeout));
      loop();
    });
})();
