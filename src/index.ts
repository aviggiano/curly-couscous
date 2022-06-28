import "dotenv/config";
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
import { closePosition, whirlpool } from "./services/orca-old";
import babar from "babar";
import config from "./config";
import { getNFTs } from "./services/token";

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
  console.log(tickArrayPda);

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

  const pool = await fetcher.getPool(poolAddress);
  if (!pool) return;

  const price = PriceMath.sqrtPriceX64ToPrice(
    pool.sqrtPrice,
    solToken.scale,
    usdcToken.scale
  );
  console.log(`Pool price ${price.toFixed(4)}`);

  const nfts = await getNFTs();
  console.log(nfts);

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

        await closePosition(whirlpool(), position.positionMint);
      })
  );

  // // const amountSol = 0.1;
  // // openPosition(whirlpool, amountSol);
  // // visualize(whirlpool);
  // const positions = await listPositions();
  // console.log(positions);
  // // await closePositions(whirlpool, [positions[0]]);
}

main();
