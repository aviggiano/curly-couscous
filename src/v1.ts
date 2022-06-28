import "dotenv/config";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
import { Provider } from "@project-serum/anchor";
import { u64 } from "@solana/spl-token";
import { PublicKey, clusterApiUrl } from "@solana/web3.js";
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
import config from "./config";

export const ORCA_WHIRLPOOL_PROGRAM_ID = new PublicKey(
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
);

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

function getPosition(positionMintKey: PublicKey): PublicKey {
  const PDA_POSITION_SEED = "position";
  const programId = ORCA_WHIRLPOOL_PROGRAM_ID;
  return AddressUtil.findProgramAddress(
    [Buffer.from(PDA_POSITION_SEED), positionMintKey.toBuffer()],
    programId
  ).publicKey;
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
  amountSol: number
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

async function closePositions(
  whirlpool: OrcaWhirlpoolClient,
  positions: PublicKey[]
): Promise<void> {
  const provider = Provider.env();
  const closePositionQuotes = await Promise.all(
    positions.map((position) =>
      whirlpool.pool.getClosePositionQuote({
        positionAddress: position,
        refresh: true,
      })
    )
  );
  const closePositionTxs = await Promise.all(
    closePositionQuotes.map((quote) =>
      whirlpool.pool.getClosePositionTx({
        provider,
        quote,
      })
    )
  );
  const closePositionTxIds = await Promise.all(
    closePositionTxs.map((tx) => tx.buildAndExecute())
  );
  console.log(closePositionTxIds);
}

async function listPositions(): Promise<PublicKey[]> {
  const provider = Provider.env();

  const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

  const { value } = await connection.getParsedTokenAccountsByOwner(
    provider.wallet.publicKey,
    {
      programId: TOKEN_PROGRAM_ID,
    }
  );
  const positionNFTs = value
    .map((e) => e.account.data.parsed.info)
    .filter((token) => token.tokenAmount.uiAmount === 1)
    .map((token) => token.mint)
    .map((token) => getPosition(new PublicKey(token)));

  return positionNFTs;
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

async function main() {
  const whirlpool = new OrcaWhirlpoolClient({ network: OrcaNetwork.MAINNET });

  const poolAddress = getPoolAddress(whirlpool);
  const poolData = await getPoolData(whirlpool, poolAddress);
  if (!poolData) {
    throw new Error(`Invalid pool address ${poolAddress}`);
  }

  console.log(`Pool price ${poolData.price.toFixed(4)}`);

  // const amountSol = 0.1;
  // openPosition(whirlpool, amountSol);
  // visualize(whirlpool);
  const positions = await listPositions();
  console.log(positions);
  await closePositions(whirlpool, [positions[0]]);
}

main();
