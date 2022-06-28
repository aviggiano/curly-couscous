import "dotenv/config";
import { Provider } from "@project-serum/anchor";
import { u64 } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  getNearestValidTickIndex,
  OrcaNetwork,
  OrcaWhirlpoolClient,
  PoolData,
  tickIndexToPrice,
} from "@orca-so/whirlpool-sdk";
import { AddressUtil } from "@orca-so/common-sdk";
import { solToken, usdcToken } from "@orca-so/sdk/dist/constants/tokens";
import babar from "babar";
import config from "../config";

export const ORCA_WHIRLPOOL_PROGRAM_ID = new PublicKey(
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
);

function getPoolAddress(whirlpool: OrcaWhirlpoolClient): PublicKey {
  const poolAddress = whirlpool.pool.derivePDA(
    solToken.mint,
    usdcToken.mint,
    config.strategy.tickSpacing
  ).publicKey;
  return poolAddress;
}

async function getPoolData(
  whirlpool: OrcaWhirlpoolClient,
  poolAddress: PublicKey
): Promise<PoolData | undefined> {
  const poolData = await whirlpool.getPool(poolAddress);
  if (!poolData) {
    return;
  }
  return poolData;
}

function getPosition(positionMintKey: PublicKey): PublicKey {
  const PDA_POSITION_SEED = "position";
  const programId = ORCA_WHIRLPOOL_PROGRAM_ID;
  return AddressUtil.findProgramAddress(
    [Buffer.from(PDA_POSITION_SEED), positionMintKey.toBuffer()],
    programId
  ).publicKey;
}

function getTicks(poolData: PoolData): { tickStart: number; tickEnd: number } {
  const tickSpacing = config.strategy.tickSpacing;
  const tick = getNearestValidTickIndex(
    poolData.price,
    solToken.scale,
    usdcToken.scale,
    tickSpacing
  );
  const tickStart = tick - (tickSpacing * config.strategy.spaces) / 2;
  const tickEnd = tick + (tickSpacing * config.strategy.spaces) / 2;
  return { tickStart, tickEnd };
}

async function openPosition(
  whirlpool: OrcaWhirlpoolClient,
  amountSol: number
): Promise<void> {
  const tickSpacing = config.strategy.tickSpacing;
  const poolAddress = getPoolAddress(whirlpool);
  const poolData = await getPoolData(whirlpool, poolAddress);
  const tick = getNearestValidTickIndex(
    poolData!.price,
    solToken.scale,
    usdcToken.scale,
    tickSpacing
  );
  const tickStart = tick - (tickSpacing * config.strategy.spaces) / 2;
  const tickEnd = tick + (tickSpacing * config.strategy.spaces) / 2;
  console.log(tick, tickStart, tickEnd);

  const priceStart = tickIndexToPrice(
    tickStart,
    solToken.scale,
    usdcToken.scale
  );
  const priceEnd = tickIndexToPrice(tickEnd, solToken.scale, usdcToken.scale);
  console.log(priceStart, priceEnd);

  const provider = Provider.env();
  const openPositionQuote = await whirlpool.pool.getOpenPositionQuote({
    poolAddress,
    tokenMint: solToken.mint,
    tokenAmount: new u64(amountSol * 10 ** solToken.scale),
    refresh: true,
    tickLowerIndex: tickStart,
    tickUpperIndex: tickEnd,
  });
  const openPositionTx = await whirlpool.pool.getOpenPositionTx({
    provider,
    quote: openPositionQuote,
  });
  const openPositionTxId = await openPositionTx.tx.buildAndExecute();
  console.log(openPositionTxId);
}

export async function closePosition(
  whirlpool: OrcaWhirlpoolClient,
  position: PublicKey
): Promise<void> {
  const provider = Provider.env();
  const quote = await whirlpool.pool.getClosePositionQuote({
    positionAddress: position,
    refresh: true,
  });
  const closePositionTx = await whirlpool.pool.getClosePositionTx({
    provider,
    quote,
  });
  const closePositionTxIds = await closePositionTx.buildAndExecute();
  console.log(closePositionTxIds);
}

async function visualize(whirlpool: OrcaWhirlpoolClient): Promise<void> {
  const poolAddress = getPoolAddress(whirlpool);
  const poolData = await getPoolData(whirlpool, poolAddress);
  const { tickStart, tickEnd } = getTicks(poolData!);
  const liquidityDistribution = await whirlpool.pool.getLiquidityDistribution(
    poolAddress,
    tickStart,
    tickEnd
  );
  const datapoints: readonly [number, number][] =
    liquidityDistribution.datapoints.map((datapoint) => [
      datapoint.price.toNumber(),
      datapoint.liquidity.toNumber(),
    ]);
  console.log(babar(datapoints));
}

export function whirlpool(): OrcaWhirlpoolClient {
  return new OrcaWhirlpoolClient({ network: OrcaNetwork.MAINNET });
}
