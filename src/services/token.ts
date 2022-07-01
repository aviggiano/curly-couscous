import "dotenv/config";
import Decimal from "decimal.js";
import { Provider } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PublicKey, clusterApiUrl } from "@solana/web3.js";
import { usdcToken } from "@orca-so/sdk/dist/constants/tokens";

export async function getNFTs(): Promise<PublicKey[]> {
  const provider = Provider.env();

  const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

  const { value } = await connection.getParsedTokenAccountsByOwner(
    provider.wallet.publicKey,
    {
      programId: TOKEN_PROGRAM_ID,
    }
  );
  const nfts = value
    .map((e) => e.account.data.parsed.info)
    .filter((token) => token.tokenAmount.uiAmount === 1)
    .map((token) => token.mint);

  return nfts;
}

export async function getUsdc(): Promise<number> {
  const provider = Provider.env();

  const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

  const { value } = await connection.getParsedTokenAccountsByOwner(
    provider.wallet.publicKey,
    {
      programId: TOKEN_PROGRAM_ID,
    }
  );
  const usdc = value
    .map((e) => e.account.data.parsed.info)
    .find((token) => token.mint === usdcToken.mint.toBase58());
  return usdc.tokenAmount.uiAmount;
}

export async function getSol(): Promise<number> {
  const provider = Provider.env();

  const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

  const balance = await connection.getBalance(provider.wallet.publicKey);

  return balance / LAMPORTS_PER_SOL;
}

export async function getBalance(
  price: Decimal
): Promise<{ usdc: number; sol: number; total: number }> {
  let [usdc, sol] = await Promise.all([getUsdc(), getSol()]);
  let total = price.mul(sol).add(usdc).toNumber();
  console.log(`Balance on wallet: ${sol} SOL + ${usdc} USDC (${total} USD)`);
  return { usdc, sol, total };
}
