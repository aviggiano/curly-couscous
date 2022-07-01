import { PublicKey } from "@solana/web3.js";

import { solToken, usdcToken } from "@orca-so/sdk/dist/constants/tokens";
import {
  AccountFetcher,
  collectFeesQuote,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  Position,
  PositionData,
  TickArrayData,
  TickArrayUtil,
  TickUtil,
  WhirlpoolContext,
  WhirlpoolData,
} from "@orca-so/whirlpools-sdk";
import { getNFTs } from "./token";

export async function getFees(
  ctx: WhirlpoolContext,
  fetcher: AccountFetcher,
  pool: WhirlpoolData,
  poolAddress: PublicKey,
  position: PositionData
): Promise<{ feesSol: number; feesUsdc: number }> {
  const tickArrayPdaLower = PDAUtil.getTickArray(
    ctx.program.programId,
    poolAddress,
    TickUtil.getStartTickIndex(position.tickLowerIndex, pool.tickSpacing)
  );
  const tickArrayPdaUpper = PDAUtil.getTickArray(
    ctx.program.programId,
    poolAddress,
    TickUtil.getStartTickIndex(position.tickUpperIndex, pool.tickSpacing)
  );

  const [tickArrayLowerData, tickArrayUpperData] = await Promise.all([
    fetcher.getTickArray(tickArrayPdaLower.publicKey) as Promise<TickArrayData>,
    fetcher.getTickArray(tickArrayPdaUpper.publicKey) as Promise<TickArrayData>,
  ]);
  const tickLower = TickArrayUtil.getTickFromArray(
    tickArrayLowerData,
    position.tickLowerIndex,
    pool.tickSpacing
  );
  const tickUpper = TickArrayUtil.getTickFromArray(
    tickArrayUpperData,
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

export async function getPositions(
  fetcher: AccountFetcher
): Promise<PositionData[]> {
  const nfts = await getNFTs();

  const answer = await Promise.all(
    nfts.map((nft) => {
      const positionAddress = PDAUtil.getPosition(
        ORCA_WHIRLPOOL_PROGRAM_ID,
        new PublicKey(nft)
      );
      return fetcher.getPosition(positionAddress.publicKey);
    })
  );

  return answer.filter((position) => position) as PositionData[];
}
