import { getAddress, getContractAddress, keccak256, type Hash, type PublicClient } from "viem";
import { CHAIN_ID, WIF } from "./domain.ts";
import { validateReview, validatePrepared, type LaunchReview, type GasPlan } from "./launch-domain.ts";

const constants = [
  { type: "function", name: "WIF", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "CHAIN_ID", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "FEE_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "CHECKIN_GRACE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

/** Read-only receipt verification. It never signs, sends or modifies a manifest. */
export async function verifyDeployment(client: PublicClient, review: LaunchReview, hash: Hash, plan?: GasPlan) {
  validateReview(review);
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Use a complete deployment transaction hash.");
  if (await client.getChainId() !== CHAIN_ID) throw new Error("The receipt connection is on a different chain.");
  const [receipt, transaction, latest] = await Promise.all([client.getTransactionReceipt({ hash }), client.getTransaction({ hash }), client.getBlockNumber()]);
  if (receipt.status !== "success" || !receipt.contractAddress || transaction.to !== null || transaction.value !== 0n) throw new Error("The transaction is not a successful zero-value contract creation.");
  if (transaction.input.toLowerCase() !== review.creationBytecode.toLowerCase()) throw new Error("The creation transaction used different bytecode.");
  if (latest < receipt.blockNumber + 1n) throw new Error("Wait for two confirmations before verifying the deployment.");
  const address = getAddress(receipt.contractAddress);
  if (address !== getAddress(getContractAddress({ from: transaction.from, nonce: BigInt(transaction.nonce) }))) throw new Error("The receipt contract address differs from the creating account and nonce.");
  const [atDeployment, current, token, chain, fee, grace, canonicalBlock] = await Promise.all([
    client.getCode({ address, blockNumber: receipt.blockNumber }), client.getCode({ address }),
    client.readContract({ address, abi: constants, functionName: "WIF" }), client.readContract({ address, abi: constants, functionName: "CHAIN_ID" }),
    client.readContract({ address, abi: constants, functionName: "FEE_BPS" }), client.readContract({ address, abi: constants, functionName: "CHECKIN_GRACE" }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
  ]);
  if (canonicalBlock.hash !== receipt.blockHash) throw new Error("The deployment receipt is no longer in the canonical block. Check it again after confirmation.");
  if (!atDeployment || !current || keccak256(atDeployment) !== review.runtimeCodeHash || keccak256(current) !== review.runtimeCodeHash) throw new Error("The deployed runtime differs from the pinned compiler artifact.");
  if (getAddress(token) !== getAddress(WIF) || chain !== BigInt(CHAIN_ID) || fee !== 100n || grace !== 900n) throw new Error("The deployed contract constants do not match Rally's fixed terms.");
  const spent = receipt.gasUsed * receipt.effectiveGasPrice;
  if (plan) {
    // Preparation expiry protects signing, not later receipt recovery.
    validatePrepared(plan, review, transaction.from, transaction.nonce, BigInt(plan.budgetWei), plan.expiresAt);
    if (transaction.gas !== BigInt(plan.gas) || transaction.maxFeePerGas !== BigInt(plan.maxFeePerGas) || transaction.maxPriorityFeePerGas !== BigInt(plan.maxPriorityFeePerGas) || spent > BigInt(plan.budgetWei)) throw new Error("The wallet transaction differs from the prepared gas bound.");
  }
  const block = Number(receipt.blockNumber);
  if (!Number.isSafeInteger(block)) throw new Error("The deployment block cannot be represented safely in the app manifest.");
  return {
    schema: "rally-deployment-receipt-v1", chainId: CHAIN_ID, transactionHash: hash, contract: address, deployer: transaction.from,
    deploymentBlockHash: receipt.blockHash, gasUsed: String(receipt.gasUsed), effectiveGasPrice: String(receipt.effectiveGasPrice), actualGasSpendWei: String(spent),
    sourceSHA256: review.sourceSHA256, creationCodeHash: review.creationCodeHash, runtimeCodeHash: review.runtimeCodeHash, compiler: review.compiler,
    checks: ["chain 4663", "successful zero-value creation", "exact creation bytecode", "two confirmations", "canonical deployment block", "runtime at deployment and latest", "fixed token and contract constants", ...(plan ? ["exact wallet gas bound"] : [])],
    manifest: { chainId: CHAIN_ID, token: WIF, contract: address, runtimeCodeHash: review.runtimeCodeHash, deployBlock: block, transactionHash: hash, compiler: "0.8.30", optimizerRuns: 200, feeBps: 100, checkInGraceSeconds: 900 },
  };
}
