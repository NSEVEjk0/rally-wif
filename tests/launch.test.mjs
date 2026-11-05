import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEther } from "viem";
import { validateReview, gasBudget, prepareGasPlan, validatePrepared } from "../src/launch-domain.ts";
const review = validateReview(JSON.parse(await readFile(new URL("../src/launch-review.json", import.meta.url), "utf8")));
const account = "0x1111111111111111111111111111111111111111";

test("the launch fails closed for swapped bytecode, token and compiler settings", () => {
  assert.throws(() => validateReview({ ...review, creationBytecode: review.creationBytecode.slice(0, -2) + "ff" }), /fingerprint/);
  assert.throws(() => validateReview({ ...review, runtimeCodeHash: "0x" + "0".repeat(64) }), /fingerprint/);
  assert.throws(() => validateReview({ ...review, token: account }), /token/);
  assert.throws(() => validateReview({ ...review, evmVersion: "prague" }), /compiler/);
  assert.throws(() => validateReview({ ...review, status: "pending-artifact-review" }), /review/);
});
test("an explicit decimal gas bound rejects excessive, unbounded or unsupported fees", () => {
  assert.equal(gasBudget("0.000000000000000001"), 1n);
  for (const value of ["1e-3", "Infinity", "-0.1", "0", "0.050000000000000001", "1.2.3"]) assert.throws(() => gasBudget(value));
  assert.throws(() => prepareGasPlan(review, account, 1_000_000n, 2_000_000_000n, 1_000_000_000n, parseEther("0.001"), 2, 1000), /exceeds/);
  assert.throws(() => prepareGasPlan(review, account, 6_000_000n, 1n, 1n, parseEther("0.01"), 2, 1000), /unsupported/);
});
test("a prepared signature cannot survive a new account, nonce, budget, expired clock or altered gas fields", () => {
  const budget = parseEther("0.01");
  const plan = prepareGasPlan(review, account, 1_000_000n, 2_000_000_000n, 1_000_000_000n, budget, 2, 1000);
  validatePrepared(plan, review, account, 2, budget, 1001);
  assert.throws(() => validatePrepared(plan, review, "0x2222222222222222222222222222222222222222", 2, budget, 1001), /account/);
  assert.throws(() => validatePrepared(plan, review, account, 3, budget, 1001), /nonce/);
  assert.throws(() => validatePrepared(plan, review, account, 2, budget - 1n, 1001), /budget/);
  assert.throws(() => validatePrepared(plan, review, account, 2, budget, 301001), /expired/);
  assert.throws(() => validatePrepared({ ...plan, gas: "1200001" }, review, account, 2, budget, 1001), /bound/);
});
