import { getAddress, keccak256, parseEther, type Address, type Hex } from "viem";
import { CHAIN_ID, WIF } from "./domain.ts";

export type LaunchReview = {
  schema: "rally-launch-review-v1"; status: "compiled-pinned"; chainId: number; token: Address;
  compiler: string; optimizerRuns: number; viaIR: boolean; evmVersion: string;
  sourceSHA256: string; sourceKeccak256: Hex; abiSHA256: string; metadataSHA256: string;
  creationBytecode: Hex; creationCodeHash: Hex; runtimeBytecode: Hex; runtimeCodeHash: Hex;
};
export type GasPlan = {
  account: Address; nonce: number; chainId: number; creationCodeHash: Hex;
  gas: string; maxFeePerGas: string; maxPriorityFeePerGas: string;
  budgetWei: string; worstCaseWei: string; expiresAt: number;
};
const hex = (value: unknown): value is Hex => typeof value === "string" && /^0x(?:[0-9a-f]{2})+$/i.test(value);
const sha = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

export function validateReview(value: unknown): LaunchReview {
  if (!value || typeof value !== "object") throw new Error("The reviewed contract build is unavailable.");
  const r = value as LaunchReview;
  if (r.schema !== "rally-launch-review-v1" || r.status !== "compiled-pinned") throw new Error("The compiler artifact has not completed review yet.");
  if (r.chainId !== CHAIN_ID || getAddress(r.token) !== getAddress(WIF)) throw new Error("The build targets a different chain or token.");
  if (!/^0\.8\.30\+commit\.[0-9a-f]{8}$/.test(r.compiler) || r.optimizerRuns !== 200 || r.viaIR !== true || r.evmVersion !== "cancun") throw new Error("The compiler settings differ from the reviewed Rally build.");
  if (![r.sourceSHA256, r.abiSHA256, r.metadataSHA256].every(sha) || !/^0x[0-9a-f]{64}$/i.test(r.sourceKeccak256)) throw new Error("The source fingerprints are incomplete.");
  if (!hex(r.creationBytecode) || !hex(r.runtimeBytecode) || r.creationBytecode.length < 100 || r.runtimeBytecode.length < 100) throw new Error("The build contains invalid or incomplete bytecode.");
  if (keccak256(r.creationBytecode) !== r.creationCodeHash || keccak256(r.runtimeBytecode) !== r.runtimeCodeHash) throw new Error("The bytecode does not match its pinned fingerprint.");
  return r;
}

export function gasBudget(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) throw new Error("Enter a decimal ETH gas budget, up to 18 decimal places.");
  const amount = parseEther(value);
  if (amount <= 0n || amount > parseEther("0.05")) throw new Error("The deployment gas budget must be greater than zero and at most 0.05 ETH.");
  return amount;
}

export function prepareGasPlan(review: LaunchReview, account: Address, estimate: bigint, maxFee: bigint, priorityFee: bigint, budget: bigint, nonce: number, now: number): GasPlan {
  validateReview(review);
  const gas = (estimate * 120n + 99n) / 100n;
  if (estimate <= 0n || gas > 6_000_000n || maxFee <= 0n || priorityFee < 0n || priorityFee > maxFee) throw new Error("The network returned an unsupported deployment gas estimate.");
  if (budget <= 0n || budget > parseEther("0.05") || gas * maxFee > budget) throw new Error("The prepared deployment exceeds the gas budget. No transaction was sent.");
  if (!Number.isSafeInteger(nonce) || nonce < 0 || !Number.isSafeInteger(now) || now < 0) throw new Error("The account nonce or preparation time is invalid.");
  return { account: getAddress(account), nonce, chainId: CHAIN_ID, creationCodeHash: review.creationCodeHash, gas: String(gas), maxFeePerGas: String(maxFee), maxPriorityFeePerGas: String(priorityFee), budgetWei: String(budget), worstCaseWei: String(gas * maxFee), expiresAt: now + 300_000 };
}

export function validatePrepared(plan: GasPlan, review: LaunchReview, account: Address, nonce: number, budget: bigint, now: number) {
  validateReview(review);
  if (plan.chainId !== CHAIN_ID || plan.creationCodeHash !== review.creationCodeHash || getAddress(plan.account) !== getAddress(account)) throw new Error("The connected account or reviewed build changed. Prepare the deployment again.");
  if (!Number.isSafeInteger(plan.expiresAt) || !Number.isSafeInteger(now) || now < plan.expiresAt - 300_000 || nonce !== plan.nonce || now > plan.expiresAt || BigInt(plan.budgetWei) !== budget) throw new Error("The prepared deployment expired, the nonce changed or the budget changed. Prepare it again.");
  const gas = BigInt(plan.gas), fee = BigInt(plan.maxFeePerGas), priority = BigInt(plan.maxPriorityFeePerGas);
  if (gas <= 0n || gas > 6_000_000n || fee <= 0n || priority < 0n || priority > fee || gas * fee !== BigInt(plan.worstCaseWei) || gas * fee > budget || budget > parseEther("0.05")) throw new Error("The prepared transaction does not respect its exact gas bound.");
}
