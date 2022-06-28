import "dotenv/config";
import { Provider } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
import { PublicKey, clusterApiUrl } from "@solana/web3.js";

export async function getNFTs(): Promise<PublicKey[]> {
  const provider = Provider.env();

  const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

  const { value } = await connection.getParsedTokenAccountsByOwner(
    provider.wallet.publicKey,
    {
      programId: TOKEN_PROGRAM_ID,
    }
  );
  console.log(value.map((e) => e.account.data.parsed.info));
  const nfts = value
    .map((e) => e.account.data.parsed.info)
    .filter((token) => token.tokenAmount.uiAmount === 1)
    .map((token) => token.mint);

  return nfts;
}
