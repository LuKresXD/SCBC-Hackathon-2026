/**
 * Anchor + web3.js wiring for Traxis.
 *
 * Loads program IDLs, builds the Program<T> handle, and exposes deterministic
 * PDA derivations. Everything in ./anchor.ts is pure construction — no RPC —
 * so it's cheap to re-instantiate per-request.
 *
 * IDL files are synced from /target/idl after `anchor build`. The sync script
 * is scripts/sync-idl.sh at the repo root.
 */
import {
  AnchorProvider,
  Idl,
  Program,
  Wallet,
  setProvider,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Commitment,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// IDL JSON loaded from disk. These files are written by `anchor build` and
// must be present in backend/src/idl/ at runtime. The Dockerfile copies them
// at image build time.
const IDL_DIR = path.join(__dirname, "..", "idl");

function loadIdl(name: string): Idl {
  const p = path.join(IDL_DIR, `${name}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(
      `IDL not found at ${p}. Run \`bash scripts/sync-idl.sh\` after \`anchor build\`.`,
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf-8")) as Idl;
}

// ---------- Env-driven config ----------

export interface SolanaConfig {
  rpcUrl: string;
  vaultProgramId: PublicKey;
  ppnProgramId: PublicKey;
  usdcMint: PublicKey;
  feeRecipient: PublicKey;
  authorityKeypair: Keypair;
  commitment: Commitment;
}

function mustEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export function loadSolanaConfig(): SolanaConfig {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const vaultProgramId = new PublicKey(mustEnv("TRAXIS_VAULT_PROGRAM_ID"));
  // PPN program id is optional: if unset, fall back to the vault's program id
  // (so getPpnProgram() can still construct something; calls will fail loudly
  //  at runtime if PPN features are used without a real deployment).
  const ppnProgramId = process.env.TRAXIS_PPN_PROGRAM_ID
    ? new PublicKey(process.env.TRAXIS_PPN_PROGRAM_ID)
    : vaultProgramId;
  // Circle devnet USDC: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
  const usdcMint = new PublicKey(
    process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  );
  const feeRecipient = new PublicKey(mustEnv("FEE_RECIPIENT"));

  // Authority keypair: accept either a path or a base58-ish JSON array.
  const raw = mustEnv("AUTHORITY_KEYPAIR");
  let secret: Uint8Array;
  if (raw.trim().startsWith("[")) {
    secret = Uint8Array.from(JSON.parse(raw));
  } else {
    const file = fs.readFileSync(raw.replace(/^~/, process.env.HOME ?? ""), "utf-8");
    secret = Uint8Array.from(JSON.parse(file));
  }
  const authorityKeypair = Keypair.fromSecretKey(secret);

  return {
    rpcUrl,
    vaultProgramId,
    ppnProgramId,
    usdcMint,
    feeRecipient,
    authorityKeypair,
    commitment: "confirmed",
  };
}

// ---------- Program handles ----------

let _connection: Connection | null = null;
let _provider: AnchorProvider | null = null;
let _vaultProgram: Program | null = null;
let _ppnProgram: Program | null = null;
let _config: SolanaConfig | null = null;

export function getConfig(): SolanaConfig {
  if (!_config) _config = loadSolanaConfig();
  return _config;
}

export function getConnection(): Connection {
  if (!_connection) {
    const cfg = getConfig();
    _connection = new Connection(cfg.rpcUrl, cfg.commitment);
  }
  return _connection;
}

export function getProvider(): AnchorProvider {
  if (!_provider) {
    const cfg = getConfig();
    const wallet = new Wallet(cfg.authorityKeypair);
    _provider = new AnchorProvider(getConnection(), wallet, {
      commitment: cfg.commitment,
    });
    setProvider(_provider);
  }
  return _provider;
}

/**
 * Build a Program<> handle. Anchor 0.30.x deprecated the 3-arg constructor
 * in favour of deriving the program ID from the IDL's `address` field. We
 * patch the IDL in-memory so either constructor shape works.
 */
function buildProgram(idlName: string, programId: PublicKey): Program {
  const idl = loadIdl(idlName) as any;
  idl.address = programId.toBase58();
  if (idl.metadata) idl.metadata.address = programId.toBase58();
  // @ts-ignore — try both constructor shapes across Anchor versions
  try {
    return new (Program as any)(idl, programId, getProvider());
  } catch {
    return new (Program as any)(idl, getProvider());
  }
}

export function getVaultProgram(): Program {
  if (!_vaultProgram) {
    _vaultProgram = buildProgram("traxis_vault", getConfig().vaultProgramId);
  }
  return _vaultProgram;
}

export function getPpnProgram(): Program {
  if (!_ppnProgram) {
    _ppnProgram = buildProgram("traxis_ppn", getConfig().ppnProgramId);
  }
  return _ppnProgram;
}

// ---------- PDA derivation ----------

/** Convert a Supabase UUID (with dashes) to the 16-byte seed used in vault PDAs. */
export function bundleIdToSeed(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function deriveVaultPda(bundleId: string): [PublicKey, number] {
  const seed = bundleIdToSeed(bundleId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(seed)],
    getConfig().vaultProgramId,
  );
}

export function deriveTraxMint(bundleId: string): [PublicKey, number] {
  const seed = bundleIdToSeed(bundleId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint"), Buffer.from(seed)],
    getConfig().vaultProgramId,
  );
}

export function deriveUsdcVault(bundleId: string): [PublicKey, number] {
  const seed = bundleIdToSeed(bundleId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("usdc_vault"), Buffer.from(seed)],
    getConfig().vaultProgramId,
  );
}

export function deriveMeteoraAdapter(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("meteora_mock")],
    getConfig().ppnProgramId,
  );
}

export function deriveMeteoraPool(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("meteora_mock_pool")],
    getConfig().ppnProgramId,
  );
}

export function derivePpnNote(
  owner: PublicKey,
  noteSeed: Uint8Array,
): [PublicKey, number] {
  if (noteSeed.length !== 8) throw new Error("noteSeed must be 8 bytes");
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ppn"), owner.toBuffer(), Buffer.from(noteSeed)],
    getConfig().ppnProgramId,
  );
}

// ---------- Misc ----------

export { SystemProgram };
