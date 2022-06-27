import "dotenv/config";
import { Provider } from "@project-serum/anchor";
import { u64 } from "@solana/spl-token";
import Decimal from "decimal.js";
import { PublicKey } from "@solana/web3.js";
import {
  getNearestValidTickIndex,
  getPrevValidTickIndex,
  OrcaNetwork,
  OrcaWhirlpoolClient,
  PoolData,
  priceToTickIndex,
  tickIndexToPrice,
} from "@orca-so/whirlpool-sdk";
import { solToken, usdcToken } from "@orca-so/sdk/dist/constants/tokens";
import config from "./config";

function tickSpacing(): number {
  return 64;
}

function getPoolAddress(whirlpool: OrcaWhirlpoolClient): PublicKey {
  const poolAddress = whirlpool.pool.derivePDA(
    solToken.mint,
    usdcToken.mint,
    tickSpacing()
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

function getTicks(poolData: PoolData): { tickStart: number; tickEnd: number } {
  const tick = getNearestValidTickIndex(
    poolData.price,
    solToken.scale,
    usdcToken.scale,
    tickSpacing()
  );
  const tickStart = tick - (tickSpacing() * config.strategy.spaces) / 2;
  const tickEnd = tick + (tickSpacing() * config.strategy.spaces) / 2;
  return { tickStart, tickEnd };
}

async function openPosition(
  whirlpool: OrcaWhirlpoolClient,
  amount: number
): Promise<void> {
  const poolAddress = getPoolAddress(whirlpool);
  const poolData = await getPoolData(whirlpool, poolAddress);
  const tick = getNearestValidTickIndex(
    poolData!.price,
    solToken.scale,
    usdcToken.scale,
    tickSpacing()
  );
  const tickStart = tick - (tickSpacing() * config.strategy.spaces) / 2;
  const tickEnd = tick + (tickSpacing() * config.strategy.spaces) / 2;
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
    tokenAmount: new u64(amount * 10 ** solToken.scale),
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

async function closePosition(
  whirlpool: OrcaWhirlpoolClient,
  positionAddress: PublicKey
): Promise<void> {
  const provider = Provider.env();
  const closePositionQuote = await whirlpool.pool.getClosePositionQuote({
    positionAddress,
    refresh: true,
  });
  const closePositionTx = await whirlpool.pool.getClosePositionTx({
    provider,
    quote: closePositionQuote,
  });
  const closePositionTxId = await closePositionTx.buildAndExecute();
  console.log(closePositionTxId);
}

async function listPositions(whirlpool: OrcaWhirlpoolClient): Promise<void> {
  const poolData = await getPoolData(whirlpool, getPoolAddress(whirlpool));
  const provider = Provider.env();
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
  console.log(liquidityDistribution);
}

async function main() {
  const whirlpool = new OrcaWhirlpoolClient({ network: OrcaNetwork.MAINNET });

  const poolAddress = getPoolAddress(whirlpool);
  const poolData = await getPoolData(whirlpool, poolAddress);
  if (!poolData) {
    throw new Error(`Invalid pool address ${poolAddress}`);
  }

  console.log(poolData.liquidity.toString());
  console.log(`Pool price ${poolData.price.toFixed(4)}`);

  const amount = 0.1;

  console.log();

  // openPosition(whirlpool, poolAddress, poolData, amount);
  visualize(whirlpool);
}

main();
