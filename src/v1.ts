import { Provider } from "@project-serum/anchor";
import { u64 } from "@solana/spl-token";
import Decimal from "decimal.js";
import * as bs58 from "bs58";

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  OrcaNetwork,
  OrcaWhirlpoolClient,
  PoolData,
  priceToTickIndex,
} from "@orca-so/whirlpool-sdk";
import { getOrca, Orca, OrcaPoolConfig } from "@orca-so/sdk";
import { solToken, usdcToken } from "@orca-so/sdk/dist/constants/tokens";
import config from "./config";

function owner(): Keypair {
  return Keypair.fromSecretKey(bs58.decode(config.account.privateKey));
}

async function connect(): Promise<Orca> {
  console.log("Connecting to RPC endpoint...");
  const connection = new Connection(config.rpc.endpoint, "singleGossip");
  const orca = getOrca(connection);
  return orca;
}

async function swap(
  orca: Orca,
  from: "USDC" | "SOL",
  to: "USDC" | "SOL",
  amount: number,
  slippage?: number
) {
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
  const swapPayload = await pool.swap(
    owner(),
    inputToken,
    inputAmount,
    outputAmount
  );
  const swapTxId = await swapPayload.execute();
  console.log("Swapped:", swapTxId, "\n");
}

function getPoolAddress(whirlpool: OrcaWhirlpoolClient): PublicKey {
  const tickSpacing = 64;
  const poolAddress = whirlpool.pool.derivePDA(
    solToken.mint,
    usdcToken.mint,
    tickSpacing
  ).publicKey;
  console.log(poolAddress);
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

async function main() {
  // const orca = await connect();
  // await swap(orca, "SOL", "USDC", 0.25);
  // await swap(orca, "USDC", "SOL", 10, 0.5 / 100);

  const whirlpool = new OrcaWhirlpoolClient({ network: OrcaNetwork.MAINNET });

  const poolAddress = getPoolAddress(whirlpool);
  const poolData = await getPoolData(whirlpool, poolAddress);
  console.log(poolData?.liquidity.toString());
  console.log(poolData?.price.toString());
  console.log(poolData?.tokenVaultAmountA.toString());
  console.log(poolData?.tokenVaultAmountB.toString());

  const amount = 1;

  const provider = Provider.env();

  // Open a position
  const openPositionQuote = await whirlpool.pool.getOpenPositionQuote({
    poolAddress,
    tokenMint: solToken.mint,
    tokenAmount: new u64(amount ** solToken.scale),
    refresh: true,
    tickLowerIndex: priceToTickIndex(
      new Decimal(0),
      solToken.scale,
      usdcToken.scale
    ),
    tickUpperIndex: priceToTickIndex(
      new Decimal(100),
      solToken.scale,
      usdcToken.scale
    ),
  });
  const openPositionTx = await whirlpool.pool.getOpenPositionTx({
    provider,
    quote: openPositionQuote,
  });
  const openPositionTxId = await openPositionTx.tx.buildAndExecute();
  console.log(openPositionTxId);
}

main();
