# Rally

**Make a plan. Make it happen.**

Rally helps the WIF community run workshops, feedback circles and meetups with clear commitments. A host publishes a session with fixed terms and a WIF bond. Participants reserve with WIF. If the group falls short, participants can claim their full reservation directly from the contract. If a confirmed session is cancelled or the host misses the onchain check-in window, the host bond is divided among reservations.

After the session’s end time and recorded host check-in, anyone can settle it; the host can claim revenue and their bond. A host can turn a previous session into a fresh draft for the next one.

## Problem and solution

Community organizers collect tentative replies, then find out too late that a session will not fill. Rally gives a small group fixed booking terms, a minimum threshold and refundable WIF reservations. The host backs specified cancellation and check-in commitments with a bond, and participants keep a direct contract refund route.

## Try the product

Open [Rally](https://rally-wif.vercel.app).

The public preview labels every example as fictional. Explore a reservation, release it before cutoff, or advance the example clock to see an underfilled or missed-check-in refund. The calendar export and repeat-session draft work in the browser. No example action transfers WIF or claims a blockchain receipt.

Live mode uses the official **WIF on Robinhood Chain, chain ID 4663**. The committed manifest points to the verified contract [`0x71C615c6Fa167a0843DaD6Ed715B8736b7f507DA`](https://robinhoodchain.blockscout.com/address/0x71C615c6Fa167a0843DaD6Ed715B8736b7f507DA). The [deployment transaction](https://robinhoodchain.blockscout.com/tx/0xdeff5833c88d64708b9b2f24710b37076e0304c6276520750bb9a9b233aa1ce9) was confirmed in block **107437646**, with matching creation/runtime bytecode, fixed token/contract constants and a gas cost of **0.00004619106112 ETH**. Genuine community booking/refund/repeat activity remains to be demonstrated; examples never substitute for live transactions.

WIF pays for reservations and backs the host's bond. For example, a 0.01 WIF price with a minimum of two participants requires a 0.01 WIF host bond. If only one participant joins, that participant can recover their 0.01 WIF and the host can recover the bond. If the session completes, the host can claim booking revenue less the 1% fee, plus the returned bond. Repeating a session creates fresh WIF commitments with new dates and terms. ETH pays transaction gas.

## Why a community would use it

- Organize around committed reservations instead of a list of uncertain replies.
- Start small with a minimum group and a clear booking cutoff.
- Give participants a full-refund route if the group does not form, without requiring host permission.
- Back the host’s cancellation and check-in commitments with WIF.
- Keep the next session easy: reuse the plan, choose new dates, publish fresh terms.

This first version is for existing WIF holders. A wallet, WIF and ETH for gas on chain 4663 are required for live use. Broad onboarding and sponsored gas remain future work.

## Contract rules

Official token: `0x5173b8eA6923c2d40267890D45C46a3480954773`. The constructor checks the chain, token code and 18 decimals. The contract has no owner or upgrade functions.

| Condition | Outcome |
| --- | --- |
| Before the booking cutoff | A participant can leave and recover the full price |
| Cutoff reached, fewer than the minimum | Full participant refunds; host bond credited back |
| Minimum reached at cutoff | Reservations become committed; host must check in within ±15 minutes of start |
| Confirmed cancellation / missed check-in | Participant price plus equal host-bond share; integer dust goes to the sink |
| End time reached and host checked in | Host revenue plus bond credited; 1% of booking revenue credited to the sink |

Refund eligibility follows contract time automatically; the wallet transfer requires a transaction. `refund()` resolves an expired threshold or missed check-in itself, so no keeper or host signature is required. Creator and sink credits use pull payments; a failed token transfer reverts without deleting the claim. Exact balance changes and a reentrancy guard are checked.

Check-in proves an onchain action, not real-world attendance or service quality. Wallet counts do not prove unique people. Terms, descriptions and wallet addresses are public. The sink is a dead address: transfers there do not claim to decrease the token’s `totalSupply`. These tests are not a security audit.

## Run and verify

Node 22.12+ and Foundry v1.9.0 are used. Solidity is pinned to 0.8.30, optimizer 200, via IR, Cancun.

```sh
npm ci --no-audit --no-fund
npm test
npm run typecheck
npm run build
forge test --root contracts --no-match-contract WIFForkTest -vv
RALLY_FORK=true forge test --root contracts --match-contract WIFForkTest -vv
node scripts/sync-abi.mjs --check
npm run test:browser
npm run dev
```

The workflow runs the contract tests, two 200-case fuzz campaigns, a real-WIF-bytecode fork lifecycle, domain checks, production build and desktop/mobile browser flows. Fork balances are changed only on an isolated local fork. They are not real mainnet activity.

The browser accepts the contract only from the committed `src/deployment.json`, checks its runtime hash before allowances, and requests an exact allowance for the price or bond. No arbitrary contract or token is accepted through the URL. Live transaction results link to actual receipts.

The mainnet address, runtime hash, deployment block and actual transaction hash are recorded in `src/deployment.json`. Deployment verification passed two confirmations, the canonical block, exact creation/runtime bytecode, fixed constants and the exact wallet gas bound. Execute real WIF booking/refund/completion transactions before treating this as a complete event entry.

The separate [operator launch guide](MAINNET.md) explains `/launch.html`, the exact pinned compiler build, a zero-value creation transaction with an explicit gas cap, uncertain-submission recovery, and independent receipt verification. The operator page never changes the public deployment manifest itself.

`node scripts/create-operator-wallet.mjs` creates a dedicated local operator key and prints its public address. Reruns reuse the saved key; it remains in the ignored, private `.local/operator-wallet.json`. This command sends no transaction. ETH pays gas; WIF pays reservations and bonds. Genuine participant activity still requires their own wallets and agreement.

MIT. Built for the World Is Flat community during the hackathon.

See [submission and demo preparation](SUBMISSION.md) for the required real transactions, recording and availability period.
