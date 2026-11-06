# Rally

**Book small events with WIF and clear refund rules.**

Rally lets you book a place in a workshop, meetup or feedback session using WIF, a cryptocurrency token. The host sets the price, dates and number of bookings needed. If there are too few bookings by the deadline, you can claim your full payment back without the host's approval.

The host pays a WIF deposit before bookings open. If the host cancels a confirmed event or does not check in on time, booked participants get their payment back plus a share of that deposit. After the host checks in and the event's end time passes, the host can withdraw booking payments and the deposit. To run another event, the host can copy the previous one and choose new dates.

## Problem and solution

Organisers often collect "maybe" replies and only find out later that too few places are booked. Rally helps small groups fix booking terms before anyone pays: the price, dates, minimum number of bookings and refund rules. The host puts down a WIF deposit, and each participant pays for a place. If there are too few bookings by the deadline, participants can claim a full refund.

## Try the product

Open [Rally](https://rally-wif.vercel.app).

Watch the [52-second narrated booking and refund demo](https://rally-wif.vercel.app/demo/).

Choose **Sample events** to practice booking and claiming a refund. Book a sample place, cancel before the booking deadline, or move the sample clock forward to see what happens when there are too few bookings or the host does not check in. You can add an event to your calendar and copy it for next time. These are fictional events; no wallet or real payment is needed.

## Live demo receipts

Live mode uses the official **WIF on Robinhood Chain, chain ID 4663**. The committed manifest points to the verified contract [`0x71C615c6Fa167a0843DaD6Ed715B8736b7f507DA`](https://robinhoodchain.blockscout.com/address/0x71C615c6Fa167a0843DaD6Ed715B8736b7f507DA). The [deployment transaction](https://robinhoodchain.blockscout.com/tx/0xdeff5833c88d64708b9b2f24710b37076e0304c6276520750bb9a9b233aa1ce9) was confirmed in block **107437646**, with matching creation/runtime bytecode, fixed token/contract constants and a gas cost of **0.00004619106112 ETH**.

The demo used team wallets. For the [first event](https://rally-wif.vercel.app/?mode=live&round=1), a participant [booked a place for 0.01 WIF](https://robinhoodchain.blockscout.com/tx/0x750c6babd52ac3431cae4d8228a383ca66a586f5d22b273e4e8a0ca746c4aa2c). There were too few bookings by the deadline, so the participant [claimed the full payment back](https://robinhoodchain.blockscout.com/tx/0x164344eac52c3579f3957906254aa60e753b19fdc3c51e900fa2480ed6605ed4). The host copied the event with new dates, and the participant [booked again](https://robinhoodchain.blockscout.com/tx/0xc7b8811580d36085eb4d3cd4f673048218232b3d215e4a9a026c7c1a53bb006a). The participant cancelled before the deadline and got a full refund; the host cancelled the event and withdrew the deposit. Both host deposits were returned. The [transaction records](docs/mainnet-demo.json) contain all 15 receipts. All payments and deposits were refunded or withdrawn, leaving a zero contract balance and no amounts owed. Network fees for the demo totalled **0.00002846110128 ETH**.

WIF pays for bookings and the host's deposit. For example, an event charging 0.01 WIF per place and needing two bookings requires a 0.01 WIF host deposit. If only one place is booked, that participant can get their 0.01 WIF back and the host can withdraw the deposit. After the host checks in and the event's end time passes, the host can withdraw booking payments, less a 1% fee, and the deposit. Copying an event creates new bookings with new dates and rules. ETH pays network fees.

## Why a community would use it

- Set the price, dates and minimum bookings before people pay.
- Let people see the refund rules before booking.
- Give participants a full refund if there are too few bookings, without asking the host.
- Share the host's deposit among booked participants if a confirmed event is cancelled or the host does not check in.
- Copy an event and choose new dates when you want to run it again.

Real bookings need a wallet, WIF for payment and ETH for network fees on Robinhood Chain. Sample events need no wallet or money.

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
npm run test:browser-live
npm run dev
```

The workflow runs the contract tests, two 200-case fuzz campaigns, a real-WIF-bytecode fork lifecycle, domain checks, production build and desktop/mobile browser flows. Fork balances are changed only on an isolated local fork. They are not real mainnet activity.

`test:browser-live` separately checks the public mainnet app, pinned runtime, recorded reservation/refund/repeat receipts and desktop/mobile layout. It records a captioned MP4 privately under `reports/submission/`, sends no transactions and mocks no responses. Publishing is a separate step so a check cannot overwrite the narrated public video. `npm run test:browser-live -- --playback-only --require-audio` verifies public video playback. Public recording verification is at [/demo/recording.json](https://rally-wif.vercel.app/demo/recording.json).

The browser accepts the contract only from the committed `src/deployment.json`, checks its runtime hash before allowances, and requests an exact allowance for the price or bond. No arbitrary contract or token is accepted through the URL. Live transaction results link to actual receipts.

The mainnet address, runtime hash, deployment block and actual transaction hash are recorded in `src/deployment.json`. Deployment and demo verification passed two confirmations, canonical blocks, exact calldata/code, fixed constants and the recorded wallet gas bounds. The settled WIF demonstration is recorded in `docs/mainnet-demo.json`; customer use would add evidence of demand.

The separate [operator launch guide](MAINNET.md) explains `/launch.html`, the exact pinned compiler build, a zero-value creation transaction with an explicit gas cap, uncertain-submission recovery, and independent receipt verification. The operator page never changes the public deployment manifest itself.

`node scripts/create-operator-wallet.mjs` creates a dedicated local operator key and prints its public address. Reruns reuse the saved key; it remains in the ignored, private `.local/operator-wallet.json`. This command sends no transaction. ETH pays gas; WIF pays reservations and bonds. Two participants can reserve from their own wallets in a future session; the host cannot reserve in its own session.

MIT. Built for the World Is Flat community during the hackathon.

See [submission and demo preparation](SUBMISSION.md) for the required real transactions, recording and availability period.
