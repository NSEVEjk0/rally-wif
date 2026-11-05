import { test, expect, type Browser } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
test.skip(process.env.RALLY_LOCAL_CHAIN !== "true", "Requires the isolated mock-token chain.");
const rpc = "http://127.0.0.1:8545";
async function launchPage(browser: Browser, address: string, failSubmission = false) {
  const context = await browser.newContext();
  await context.addInitScript(({ address, rpc, failSubmission }) => {
    (window as unknown as { ethereum: unknown }).ethereum = { request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
      if (failSubmission && method === "eth_sendTransaction") throw new Error("Test-only lost wallet transport response");
      const response = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const data = await response.json(); if (data.error) throw new Error(data.error.message); return data.result;
    } };
  }, { address, rpc, failSubmission });
  const page = await context.newPage();
  await page.route("https://rpc.mainnet.chain.robinhood.com", async route => { const response = await route.fetch({ url: rpc }); await route.fulfill({ response }); });
  await page.goto("/launch.html");
  await page.getByRole("button", { name: "Connect operator wallet", exact: true }).click();
  await page.getByLabel("Maximum ETH gas spend", { exact: true }).fill("0.05");
  await page.getByRole("button", { name: "Prepare deployment", exact: true }).click();
  await expect(page.locator("#plan")).toContainText("Zero ETH value", { timeout: 30_000 });
  return page;
}

test("operator wallet signs the bounded creation, verifies bytecode and exports a real isolated-chain receipt", async ({ browser }) => {
  test.setTimeout(180_000);
  const accounts = JSON.parse(await readFile(".local/test-accounts.json", "utf8"));
  const page = await launchPage(browser, accounts[0]);
  await page.getByRole("button", { name: "Deploy reviewed build", exact: true }).click();
  await expect(page.locator("#receipt")).toContainText("Verified deployment receipt", { timeout: 120_000 });
  const event = page.waitForEvent("download"); await page.getByRole("button", { name: "Export verified receipt", exact: false }).click();
  const download = await event; const path = await download.path(); expect(path).toBeTruthy();
  const receipt = JSON.parse(await readFile(path!, "utf8"));
  expect(receipt.checks).toContain("exact wallet gas bound"); expect(receipt.chainId).toBe(4663);
  expect(BigInt(receipt.actualGasSpendWei)).toBeLessThanOrEqual(50_000_000_000_000_000n);
  const review = JSON.parse(await readFile("src/launch-review.json", "utf8"));
  expect(receipt.runtimeCodeHash).toBe(review.runtimeCodeHash);
  await mkdir("reports", { recursive: true });
  await writeFile("reports/launch-wallet-test.json", JSON.stringify({ environment: "Isolated chain with mock WIF; no mainnet transaction", checks: receipt.checks, receipt }));
  await page.screenshot({ path: "reports/rally-launch-desktop.png", fullPage: true });
  await page.reload();
  await expect(page.locator("#transaction")).toHaveValue(receipt.transactionHash);
  await page.getByRole("button", { name: "Connect operator wallet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Prepare deployment", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Verify deployment receipt", exact: true }).click();
  await expect(page.locator("#receipt")).toContainText(receipt.contract);
  await page.context().close();
});

test("an uncertain wallet submission remains blocked after reload", async ({ browser }) => {
  const accounts = JSON.parse(await readFile(".local/test-accounts.json", "utf8"));
  const page = await launchPage(browser, accounts[0], true);
  await page.getByRole("button", { name: "Deploy reviewed build", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Another deployment is blocked");
  await page.reload(); await page.getByRole("button", { name: "Connect operator wallet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Prepare deployment", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Deploy reviewed build", exact: true })).toBeDisabled();
  await page.context().close();
});
