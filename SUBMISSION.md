# Rally entry preparation

## Problem, solution and useful distinction

Tentative replies make small community sessions hard to plan. Rally creates fixed-term WIF reservations, a minimum group threshold, a host bond and a direct refund path if the group does not form. A returning host can reuse the plan with fresh dates and fresh terms.

The useful distinction is recurring community coordination with specified onchain commitments. The contract has no owner or upgrade path. Refund eligibility needs no host signature, although transferring the refund still requires a wallet transaction. Check-in is not attendance or service-quality proof; wallet counts are not unique people.

## Required deliverables and current boundary

- [Public repository](https://github.com/NSEVEjk0/rally-wif) and [app](https://rally-wif.vercel.app).
- Reviewed, code-matched deployment on **Robinhood Chain, chain ID 4663**, using the official WIF token.
- Settled WIF transactions: **complete**, with the [public evidence](docs/mainnet-demo.json) recording a 0.01 WIF reservation/full underfilled refund, fresh linked repeat reservation, early exit/cancellation and both returned host bonds. All 15 transactions use the official token on mainnet. The host and participant were controlled demo wallets; customer adoption and workshop attendance are not claimed. Examples and fork tests do not substitute for these transactions.
- Required demo video: [52.13-second narrated public recording](https://rally-wif.vercel.app/demo/) showing the actual app and independently rechecked mainnet receipts. [Download MP4](https://rally-wif.vercel.app/demo/rally-mainnet.mp4); [recording fingerprint](https://rally-wif.vercel.app/demo/recording.json).
- Human entry by **12 November 2026, 17:30 UTC**; keep the submitted app working through **16 November, 17:30 UTC**.

Read [MAINNET.md](MAINNET.md) for the completed demonstration, bounded deployment and an optional independent community pilot. The dedicated operator key is stored privately on the VPS. Funding does not itself authorize arbitrary spending, and the host cannot reserve a seat in its own session. The mainnet demonstration verifies underfilled refunds, repeat reservations and early exit/cancellation; completion and missed-check-in paths were verified in contract/fork tests.

Sources: [event](https://worldisflat.fun/build), [rules](https://worldisflat.fun/build/rules), [current schedule](https://worldisflat.fun/build/api/event). This is the World Is Flat event, not an official Robinhood-sponsored competition.

## Completed recording: 52.13 seconds

The public recording was produced by `npm run test:browser-live`. It passed the live desktop/mobile browser checks and rechecked the pinned runtime and three receipt/event/canonical-block pairs. No transaction was sent and no RPC response was mocked. Exported frames and measured duration were inspected before publication.

Reuse the completed mainnet transactions; no new gas or wallet signatures are needed. Show the public app and recorded receipts after the genuine cutoff. Keep the controlled-wallet disclosure visible throughout, and describe recorded transactions in the past tense. Do not present the wallets as independent customers or the scenario as an attended workshop.

| Time | Show | Explain |
| --- | --- | --- |
| 0–13 s | Public app, feedback-circle scenario and fixed terms | Small groups need a threshold and clear commitments. Controlled-wallet technical demo. |
| 13–21 s | Actual 0.01 WIF reservation receipt | WIF backed the participant's reservation and the host's bond. |
| 21–30 s | Actual underfilled refund receipt | After the real cutoff, the participant recovered the full 0.01 WIF directly. |
| 30–45 s | Linked round 2 and actual fresh reservation receipt | Repeating creates a new commitment with fresh terms. |
| 45–52 s | Zero remaining liabilities, contract/source and limitations | No customer/attendance claim; completion and missed-check-in were fork-tested. |

Keep the final video under 60 seconds. Calendar export and the repeat draft may be shown briefly, but actual WIF use is the essential evidence. No optional slide deck or second video is needed.

## Announcement draft

Rally turns a community plan into a clear commitment: fixed WIF reservations, a minimum group, a host bond and a direct refund when the session does not fill. Reuse the plan to run it again with fresh terms. Its controlled-wallet mainnet demo verified a reservation, full refund and fresh repeat reservation using real WIF; it does not claim customers or attendance. Explore: https://rally-wif.vercel.app · Code: https://github.com/NSEVEjk0/rally-wif

Rewrite the announcement in your own voice. This draft has not been posted.

## Submission outline

Describe the intended community use case, why WIF is central, fixed booking/refund/bond behavior, exact mainnet contract and receipt links, controlled participant/repeat evidence, code reproduction, limitations and video URL. Keep fork test results distinct from real transactions, and distinguish the technical demonstration from customer adoption.
