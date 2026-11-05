import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { keccak256 } from "viem";
import { validateReview } from "../src/launch-domain.ts";
const digest = value => createHash("sha256").update(value).digest("hex");
const root = new URL("../", import.meta.url);
const artifact = JSON.parse(await readFile(new URL("contracts/out/Rally.sol/Rally.json", root), "utf8"));
const raw = artifact.rawMetadata ?? JSON.stringify(artifact.metadata);
const metadata = JSON.parse(raw);
const source = await readFile(new URL("contracts/src/Rally.sol", root));
assert.equal(metadata.settings.compilationTarget["src/Rally.sol"], "Rally");
assert.equal(metadata.settings.optimizer.enabled, true); assert.equal(metadata.settings.optimizer.runs, 200);
assert.equal(metadata.settings.viaIR, true); assert.equal(metadata.settings.evmVersion, "cancun");
assert.equal(metadata.sources["src/Rally.sol"].keccak256, keccak256(source));
assert.deepEqual(artifact.bytecode.linkReferences ?? {}, {});
assert.deepEqual(artifact.deployedBytecode.linkReferences ?? {}, {});
assert.deepEqual(artifact.deployedBytecode.immutableReferences ?? {}, {});
const abi = JSON.stringify(artifact.abi, null, 2) + "\n";
assert.equal(await readFile(new URL("src/abi.json", root), "utf8"), abi);
const review = {
  schema: "rally-launch-review-v1", status: "compiled-pinned", chainId: 4663, token: "0x5173b8eA6923c2d40267890D45C46a3480954773",
  compiler: metadata.compiler.version, optimizerRuns: 200, viaIR: true, evmVersion: "cancun",
  sourceSHA256: digest(source), sourceKeccak256: keccak256(source), abiSHA256: digest(abi), metadataSHA256: digest(raw),
  creationBytecode: artifact.bytecode.object, creationCodeHash: keccak256(artifact.bytecode.object),
  runtimeBytecode: artifact.deployedBytecode.object, runtimeCodeHash: keccak256(artifact.deployedBytecode.object),
};
validateReview(review);
const bytes = JSON.stringify(review, null, 2) + "\n";
const target = new URL("src/launch-review.json", root);
if (process.argv.includes("--check")) {
  assert.equal(await readFile(target, "utf8"), bytes, "The committed launch build differs from the current compiler artifact.");
  console.log("Launch bytecode, source, ABI and compiler settings match the pinned build.");
} else {
  const outIndex = process.argv.indexOf("--out");
  const output = process.argv.includes("--write") ? target : new URL(outIndex >= 0 ? process.argv[outIndex + 1] : ".local/launch-review.json", root);
  await mkdir(new URL(".", output), { recursive: true }); await writeFile(output, bytes);
  console.log(JSON.stringify({ output: output.pathname, sourceSHA256: review.sourceSHA256, creationCodeHash: review.creationCodeHash, runtimeCodeHash: review.runtimeCodeHash, compiler: review.compiler }));
}
