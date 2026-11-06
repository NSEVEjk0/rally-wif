# Launch Rally with real WIF

The public app is at [rally-wif.vercel.app](https://rally-wif.vercel.app). Examples are fictional. The committed mainnet manifest records [`0x71C615c6Fa167a0843DaD6Ed715B8736b7f507DA`](https://robinhoodchain.blockscout.com/address/0x71C615c6Fa167a0843DaD6Ed715B8736b7f507DA), deployed in [transaction `0xdeff5833…aa1ce9`](https://robinhoodchain.blockscout.com/tx/0xdeff5833c88d64708b9b2f24710b37076e0304c6276520750bb9a9b233aa1ce9), block 107437646. Exact creation/runtime code, canonical inclusion, constants and the 0.00007 ETH gas cap passed verification; actual gas cost was 0.00004619106112 ETH. No WIF was transferred by deployment. The controlled-wallet booking/refund/repeat demonstration has also completed. Use the recorded deployment; the deployment instructions below explain reproduction for an explicitly chosen new deployment.

## Completed mainnet demonstration

The chosen scenario is a small **builder feedback circle**. Its onchain descriptions disclose controlled demo wallets and no actual attendees. [Public evidence](docs/mainnet-demo.json) contains all 15 confirmed receipts:

- [Round 1](https://rally-wif.vercel.app/?mode=live&round=1): one 0.01 WIF reservation against a minimum of two. After the genuine cutoff, the participant called `refund()` directly and recovered the full price; the host claimed the restored 0.01 WIF bond.
- [Round 2](https://rally-wif.vercel.app/?mode=live&round=2): fresh terms linked to round 1, and a fresh 0.01 WIF reservation from the same controlled participant. The participant left before cutoff; the host cancelled and claimed the bond.
- Final contract WIF, total liability and host/participant credits were all zero. Actual demo gas was 0.00002846110128 ETH; cumulative WIF outflow was 0.06 WIF within the 0.10 WIF cap.

This is settled mainnet technical evidence. Independent customer demand and physical attendance remain untested. Completion and missed-check-in paths passed contract and real-WIF fork tests; they were not executed in this mainnet demonstration. No further transactions are needed to reproduce its recording.

The [recorded demonstration](https://rally-wif.vercel.app/demo/) is **52.13 seconds**, with a persistent controlled-wallet disclosure. `npm run test:browser-live` produced it from the public app and independently rechecked receipts/runtime with no mocked responses or new transactions. The public evidence, MP4 and recording fingerprint are in `public/demo/`.

## Review the build

The source is `contracts/src/Rally.sol`. Solidity 0.8.30, optimizer 200, via IR, Cancun. `src/launch-review.json` pins the exact creation and runtime bytecode, source, ABI and compiler metadata. The contract has no owner or upgrade functions and no constructor parameters.

```sh
npm ci
forge build --root contracts
node scripts/sync-abi.mjs --check
npm run prepare:launch -- --check
npm run test:launch
```

Expected runtime Keccak-256: `0xac83475b33f3cdf3f0981551f5741304b43f16d6d3eb997677025257f0175a18`.

Expected creation Keccak-256: `0x6d6206ee117bc200f5f52bbecb10238bc83071281ad7d9a24998babcd5a526ba`.

Expected source SHA-256: `01cd47ee4eb0371cb3c9a0bdcf87240f99c469c4ce3286d92cc498a9f51407f6`.

These checks support reproduction; they are not a security audit. The wallet and reviewed public application are part of the signing trust boundary. Verify the source and fingerprints before signing.

## Deploy from the operator wallet

Open `/launch.html` on the public app. Use an Ethereum-compatible wallet you control, connected to chain **4663**, with ETH for gas. Never put a key or recovery phrase in the page or chat.

1. Connect the operator wallet. Choose a maximum gas spend, at most 0.05 ETH.
2. Prepare the deployment. This reads the chain, official WIF code/decimals, account nonce, gas and fees. It sends no transaction. The page shows an exact gas limit and maximum fee bound, with zero ETH value and no WIF approval.
3. Review and sign only the pinned contract creation in your wallet. Account, nonce, budget and preparation expiry are checked again. A lost response is recorded as uncertain and blocks a second deployment. Browser recovery storage must work before any signing request.
4. Wait for two confirmations. Export the verified receipt. If the wallet response or wait fails, look up the hash in your wallet and use the read-only receipt inspector. There is no automatic retry or public-manifest mutation.

A verified receipt checks chain, creation bytes, canonical block, runtime at deployment/latest, exact constants and the recorded gas bound. Two confirmations are a launch check, not an absolute chain-finality guarantee. A reverted creation still costs gas; verify the actual receipt before deciding on another deployment.

## Independently verify and publish the deployment

```sh
npm run verify:deployment -- --hash 0xACTUAL_DEPLOYMENT_TRANSACTION
```

This is read-only and uses the official public RPC. It writes `.local/mainnet-deployment-receipt.json`; it never edits the app manifest. Confirm its address, source/code fingerprints and transaction against the wallet receipt and explorer. Then copy the verified `manifest` object into `src/deployment.json`, commit it and deploy the app. Never copy a manifest from isolated wallet tests.

The frontend checks the committed contract runtime hash before asking for any WIF allowance. Reservations and host bonds request only the required allowance; no arbitrary contract can be injected through the URL.

## Optional community pilot

Independent use would strengthen the evidence of demand. A suitable next pilot is a 30-minute builder feedback circle: brief project introductions, one usability observation per person, and a next-session decision. Two participants can join with their own wallets, WIF and ETH for gas on chain 4663. Keep private meeting links offchain. The protocol permits a 0.01 WIF reservation, minimum 2 and capacity 4; the corresponding creator bond is 0.01 WIF. A future pilot requires actual participants' agreement and new terms.

- **A group forms:** create a real community session; two participants reserve. Booking cutoff must be at least five minutes away, start at least 30 minutes after cutoff, and duration at least 15 minutes. Resolve after cutoff. The host checks in within ±15 minutes of start. After the end, complete and claim host credit.
- **A group does not form:** create a second session with minimum 2; one participant reserves. After cutoff that participant calls `refund()` directly. The host claims the restored bond. No host signature or keeper is needed for the participant refund.
- **People return:** the same host uses “Run it again” to create a fresh linked session; a returning participant reserves. The repeat is a new commitment with new terms.

Retain transaction hashes and the actual plan/output for a future pilot. Do not label controlled wallets as independent users. Check-in proves an onchain action; claim a workshop or feedback circle happened only when it did. No quality guarantee is implied by the check-in transaction.

The World Is Flat deadline is **12 November, 17:30 UTC**. Keep the submitted app working through **16 November, 17:30 UTC**. The real WIF transaction evidence, judge-accessible repository and recorded demonstration are complete. Registration, submission and posting are separate human steps.
