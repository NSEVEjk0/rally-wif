import { lstat, mkdir, open, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// This creates a local key only. It never connects to an RPC or signs a transaction.
const directory = new URL("../.local/", import.meta.url);
const keyFile = new URL("operator-wallet.json", directory);
const addressFile = new URL("operator-address.json", directory);

await mkdir(directory, { recursive: true, mode: 0o700 });
const folder = await lstat(directory);
if (!folder.isDirectory() || folder.isSymbolicLink() || (folder.mode & 0o077)) {
  throw new Error("Use a regular private .local directory; no wallet was replaced.");
}

let wallet, created = false;
try {
  const information = await lstat(keyFile);
  if (!information.isFile() || information.isSymbolicLink() || (information.mode & 0o077)) {
    throw new Error("The saved wallet must be a regular private file; it was not replaced.");
  }
  wallet = JSON.parse(await readFile(keyFile, "utf8"));
  if (wallet.chainId !== 4663 || privateKeyToAccount(wallet.privateKey).address !== wallet.address) {
    throw new Error("The saved wallet does not match its address; it was not replaced.");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const privateKey = generatePrivateKey();
  wallet = { schema: "rally-operator-wallet-v1", chainId: 4663,
    address: privateKeyToAccount(privateKey).address, privateKey,
    createdAt: new Date().toISOString() };
  const output = await open(keyFile, "wx", 0o600);
  try { await output.writeFile(JSON.stringify(wallet, null, 2) + "\n"); await output.sync(); }
  finally { await output.close(); }
  created = true;
}

const publicInformation = { chainId: 4663, network: "Robinhood Chain", address: wallet.address,
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  token: "0x5173b8eA6923c2d40267890D45C46a3480954773" };
try {
  const saved = JSON.parse(await readFile(addressFile, "utf8"));
  if (saved.address !== wallet.address || saved.chainId !== 4663) {
    throw new Error("The saved public address differs from the private wallet; neither was replaced.");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const output = await open(addressFile, "wx", 0o600);
  try { await output.writeFile(JSON.stringify(publicInformation, null, 2) + "\n"); await output.sync(); }
  finally { await output.close(); }
}
console.log(JSON.stringify({ ...publicInformation, created, privateKeyFile: fileURLToPath(keyFile) }, null, 2));
