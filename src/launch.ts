import { createPublicClient, createWalletClient, custom, http, getAddress, formatEther, type Address, type Hash, type EIP1193Provider } from "viem";
import reviewFile from "./launch-review.json";
import { network } from "./chain.ts";
import { WIF, CHAIN_ID } from "./domain.ts";
import { validateReview, gasBudget, prepareGasPlan, validatePrepared, type LaunchReview, type GasPlan } from "./launch-domain.ts";
import { verifyDeployment } from "./launch-verifier.ts";
import "./launch.css";

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const client = createPublicClient({ chain: network, transport: http(undefined, { timeout: 15_000, retryCount: 1 }) });
const pendingKey = "rally-launch-pending-v1";
let review: LaunchReview | undefined, owner: Address | undefined, plan: GasPlan | undefined;
let pending: { hash: Hash; plan: GasPlan } | undefined;
let uncertainPlan: GasPlan | undefined;
let result: Awaited<ReturnType<typeof verifyDeployment>> | undefined, busy = false, uncertainSubmission = false;
function provider() {
  const p = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!p) throw new Error("Use an Ethereum-compatible wallet extension or wallet browser.");
  return p;
}
function status(text: string, error = false) { element("status").textContent = text; element("status").classList.toggle("error", error); }
function controls() {
  element<HTMLButtonElement>("connect").disabled = busy;
  element<HTMLButtonElement>("prepare").disabled = busy || !review || !owner || Boolean(pending) || uncertainSubmission;
  element<HTMLButtonElement>("deploy").disabled = busy || !review || !plan || Boolean(pending) || uncertainSubmission;
  element<HTMLButtonElement>("verify").disabled = busy || !review;
  element<HTMLButtonElement>("download").disabled = busy || !result;
  element<HTMLInputElement>("budget").disabled = busy;
}
async function action(work: () => Promise<void>) {
  if (busy) return; busy = true; controls();
  try { await work(); } catch (error) { status((error as Error).message, true); } finally { busy = false; controls(); }
}
async function walletReady() {
  const wallet = createWalletClient({ chain: network, transport: custom(provider()) });
  const accounts = await wallet.getAddresses();
  if (!owner || !accounts[0] || getAddress(accounts[0]) !== getAddress(owner)) throw new Error("The wallet account changed. Connect it and prepare again.");
  if (await wallet.getChainId() !== CHAIN_ID || await client.getChainId() !== CHAIN_ID) throw new Error("Select chain 4663 before preparing or signing the deployment.");
  return createWalletClient({ account: owner, chain: network, transport: custom(provider()) });
}

element("connect").onclick = () => action(async () => {
  const wallet = createWalletClient({ chain: network, transport: custom(provider()) });
  const accounts = await wallet.requestAddresses();
  if (!accounts[0]) throw new Error("No operator wallet was selected.");
  if (await wallet.getChainId() !== CHAIN_ID) {
    try { await wallet.switchChain({ id: CHAIN_ID }); }
    catch (error) {
      const code = (error as { code?: number; cause?: { code?: number } }).code ?? (error as { cause?: { code?: number } }).cause?.code;
      if (code !== 4902) throw error;
      await wallet.addChain({ chain: network }); await wallet.switchChain({ id: CHAIN_ID });
    }
  }
  owner = getAddress(accounts[0]); plan = undefined; element("account").textContent = owner;
  status(pending || uncertainSubmission ? "A deployment submission is already recorded. Check the wallet transaction history and verify its receipt before any new launch." : "Wallet connected. Preparing is read-only; signing requires a separate click.");
});
element<HTMLInputElement>("budget").oninput = () => { plan = undefined; element("plan").hidden = true; controls(); };
element("prepare").onclick = () => action(async () => {
  if (!review || !owner || pending || uncertainSubmission) throw new Error("Connect the operator wallet and review any pending transaction first.");
  await walletReady();
  const decimals = await client.readContract({ address: WIF, abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }], functionName: "decimals" });
  if (decimals !== 18 || !(await client.getCode({ address: WIF }))) throw new Error("The official WIF contract is unavailable or has different decimals.");
  const budget = gasBudget(element<HTMLInputElement>("budget").value);
  const [estimate, fees, nonce, balance] = await Promise.all([
    client.estimateGas({ account: owner, data: review.creationBytecode, value: 0n }), client.estimateFeesPerGas({ type: "eip1559" }),
    client.getTransactionCount({ address: owner, blockTag: "pending" }), client.getBalance({ address: owner }),
  ]);
  plan = prepareGasPlan(review, owner, estimate, fees.maxFeePerGas, fees.maxPriorityFeePerGas, budget, nonce, Date.now());
  if (balance < BigInt(plan.worstCaseWei)) { plan = undefined; throw new Error("The operator wallet does not have enough ETH for this bounded gas estimate."); }
  element("plan").hidden = false;
  element("plan").textContent = `Zero ETH value · no WIF allowance\nGas limit: ${plan.gas}\nMaximum possible gas spend: ${formatEther(BigInt(plan.worstCaseWei))} ETH\nYour limit: ${formatEther(budget)} ETH\nNonce: ${nonce} · preparation expires in five minutes`;
  status("Deployment prepared. Review the exact gas bound, then choose whether to sign in your wallet.");
});

async function inspect(hash: Hash) {
  if (!review) throw new Error("The reviewed build is not available.");
  const expected = pending?.hash.toLowerCase() === hash.toLowerCase() ? pending.plan : uncertainSubmission ? uncertainPlan : undefined;
  result = await verifyDeployment(client, review, hash, expected);
  element("receipt").hidden = false;
  element("receipt").textContent = `Verified deployment receipt\nContract: ${result.contract}\nTransaction: ${result.transactionHash}\nGas paid: ${formatEther(BigInt(result.actualGasSpendWei))} ETH\nChecks: ${result.checks.join(" · ")}\nExport this candidate, independently verify it, then commit its manifest.`;
  status("Receipt verified against the pinned build. The public app manifest has not been changed.");
}
element("deploy").onclick = () => action(async () => {
  if (!review || !owner || !plan || pending || uncertainSubmission) throw new Error("Prepare a fresh deployment before signing.");
  const wallet = await walletReady();
  const nonce = await client.getTransactionCount({ address: owner, blockTag: "pending" });
  validatePrepared(plan, review, owner, nonce, gasBudget(element<HTMLInputElement>("budget").value), Date.now());
  status("Review the zero-value creation transaction and bounded gas in the wallet.");
  // Persist an uncertain state before invoking the wallet. A lost response or
  // closed tab must not enable a second deployment with another account nonce.
  uncertainSubmission = true;
  uncertainPlan = plan;
  try {
    const saved = JSON.stringify({ uncertain: true, plan });
    localStorage.setItem(pendingKey, saved);
    if (localStorage.getItem(pendingKey) !== saved) throw new Error("Recovery record was not saved.");
  } catch {
    uncertainSubmission = false; uncertainPlan = undefined;
    throw new Error("Browser recovery storage is unavailable. No wallet transaction was requested. Enable persistent local storage before deploying.");
  }
  let hash: Hash;
  try {
    hash = await wallet.sendTransaction({ account: owner, chain: network, data: review.creationBytecode, value: 0n, nonce: plan.nonce, gas: BigInt(plan.gas), maxFeePerGas: BigInt(plan.maxFeePerGas), maxPriorityFeePerGas: BigInt(plan.maxPriorityFeePerGas) });
  } catch (error) {
    const rejected = (error as { code?: number }).code === 4001 || (error as { cause?: { code?: number } }).cause?.code === 4001 || (error as { name?: string }).name === "UserRejectedRequestError";
    if (rejected) { uncertainSubmission = false; uncertainPlan = undefined; try { localStorage.removeItem(pendingKey); } catch { /* User rejection is explicit in this tab. */ } throw new Error("The wallet signature was rejected. No retry was sent."); }
    throw new Error("The wallet submission response was lost or unsuccessful. Check the wallet's transaction history and paste any deployment hash below. Another deployment is blocked; no retry was sent.");
  }
  pending = { hash, plan };
  uncertainSubmission = false;
  uncertainPlan = undefined;
  try { localStorage.setItem(pendingKey, JSON.stringify(pending)); } catch { /* The visible hash still supports read-only recovery. */ }
  element<HTMLInputElement>("transaction").value = hash;
  status(`Transaction sent: ${hash}. Waiting for two confirmations. Keep this hash for recovery; do not repeat the deployment.`);
  await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
  await inspect(hash);
});
element("verify").onclick = () => action(async () => {
  const hash = element<HTMLInputElement>("transaction").value.trim();
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Enter the complete deployment transaction hash.");
  result = undefined; await inspect(hash as Hash);
});
element("download").onclick = () => {
  if (!result) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + "\n"], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = "rally-mainnet-deployment-receipt.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
};
try {
  review = validateReview(reviewFile);
  element("build-status").textContent = "Compiler artifact pinned";
  element("compiler").textContent = `${review.compiler} · optimizer 200 · via IR · Cancun`;
  element("creation").textContent = review.creationCodeHash; element("runtime").textContent = review.runtimeCodeHash; element("source").textContent = review.sourceSHA256;
} catch (error) { element("build-status").textContent = "Artifact review pending"; status((error as Error).message, true); }
try {
  const saved = JSON.parse(localStorage.getItem(pendingKey) ?? "null");
  if (saved?.uncertain) { uncertainSubmission = true; uncertainPlan = saved.plan; status("A previous wallet submission has an uncertain outcome. Look up its hash in the wallet and verify the receipt. Another deployment is blocked."); }
  else if (saved && /^0x[0-9a-f]{64}$/i.test(saved.hash) && saved.plan) { pending = saved; element<HTMLInputElement>("transaction").value = saved.hash; status("A deployment hash was saved. Verify its receipt instead of sending another transaction."); }
} catch { /* Invalid browser data is not authority to send a transaction. */ }
const p = (window as Window & { ethereum?: EIP1193Provider & { on?: (event: string, listener: () => void) => void } }).ethereum;
for (const event of ["accountsChanged", "chainChanged"]) p?.on?.(event, () => { owner = undefined; plan = undefined; element("account").textContent = "Reconnect the wallet"; controls(); });
controls();
