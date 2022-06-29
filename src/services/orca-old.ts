import "dotenv/config";
import { Provider } from "@project-serum/anchor";
import * as fs from "fs";
import Decimal from "decimal.js";
import { u64 } from "@solana/spl-token";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
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
import { Orca, getOrca, OrcaPoolConfig } from "@orca-so/sdk";

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

function getTicks(
  poolData: PoolData,
  spaces: number
): { tickStart: number; tickEnd: number } {
  const tickSpacing = config.strategy.tickSpacing;
  const tick = getNearestValidTickIndex(
    poolData.price,
    solToken.scale,
    usdcToken.scale,
    tickSpacing
  );
  const tickStart = tick - (tickSpacing * spaces) / 2;
  const tickEnd = tick + (tickSpacing * spaces) / 2;
  return { tickStart, tickEnd };
}

export async function openPosition(
  whirlpool: OrcaWhirlpoolClient,
  amountSol: number,
  spaces: number
): Promise<{ from: number; to: number }> {
  const tickSpacing = config.strategy.tickSpacing;
  const poolAddress = getPoolAddress(whirlpool);
  const poolData = await getPoolData(whirlpool, poolAddress);
  const tick = getNearestValidTickIndex(
    poolData!.price,
    solToken.scale,
    usdcToken.scale,
    tickSpacing
  );
  const tickStart = tick - (tickSpacing * spaces) / 2;
  const tickEnd = tick + (tickSpacing * spaces) / 2;

  const priceStart = tickIndexToPrice(
    tickStart,
    solToken.scale,
    usdcToken.scale
  );
  const priceEnd = tickIndexToPrice(tickEnd, solToken.scale, usdcToken.scale);
  console.log(
    `Opening position between prices ${priceStart.toFixed(
      4
    )} and ${priceEnd.toFixed(4)} with ${amountSol} SOL`
  );

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
  const [openPositionTxId] = await openPositionTx.tx.buildAndExecute();
  console.log(`Tx: ${openPositionTxId}`);
  return { from: priceStart.toNumber(), to: priceEnd.toNumber() };
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
  console.log(`Tx: ${closePositionTxIds}`);
}

export async function visualize(
  whirlpool: OrcaWhirlpoolClient,
  spaces: number
): Promise<void> {
  const poolAddress = getPoolAddress(whirlpool);
  const poolData = await getPoolData(whirlpool, poolAddress);
  const { tickStart, tickEnd } = getTicks(poolData!, spaces);
  const liquidityDistribution = await whirlpool.pool.getLiquidityDistribution(
    poolAddress,
    tickStart,
    tickEnd
  );
  const datapoints: readonly [number, number][] =
    liquidityDistribution.datapoints
      .filter((datapoint) => datapoint.liquidity.greaterThan(0))
      .map((datapoint) => [
        datapoint.price.toNumber(),
        datapoint.liquidity.toNumber(),
      ]);
}

export function whirlpool(): OrcaWhirlpoolClient {
  return new OrcaWhirlpoolClient({ network: OrcaNetwork.MAINNET });
}

export async function swap(
  from: "USDC" | "SOL",
  to: "USDC" | "SOL",
  amount: number,
  slippage?: number
) {
  const connection = new Connection(config.rpc.endpoint, "singleGossip");
  const orca = getOrca(connection);

  console.log("Swapping");
  const poolConfig = OrcaPoolConfig.SOL_USDC;
  const pool = orca.getPool(poolConfig);
  const inputToken = from === "USDC" ? pool.getTokenB() : pool.getTokenA();
  const inputAmount = new Decimal(amount);
  const quote = await pool.getQuote(
    inputToken,
    inputAmount,
    slippage ? new Decimal(slippage) : undefined
  );
  const outputAmount = quote.getMinOutputAmount();

  console.log(
    `Swap ${inputAmount.toString()} ${from} for ${outputAmount.toNumber()} ${to} (slippage ${
      slippage ? `${slippage * 100}%` : "default"
    })`
  );
  const privateKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(process.env.ANCHOR_WALLET!, "utf-8"))
  );
  const swapPayload = await pool.swap(
    Keypair.fromSecretKey(privateKey),
    inputToken,
    inputAmount,
    outputAmount
  );
  const swapTxId = await swapPayload.execute();
  console.log(`Tx: ${swapTxId}`);
}
