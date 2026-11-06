# Rally entry preparation

## Problem, solution and useful distinction

Tentative replies make small community sessions hard to plan. Rally creates fixed-term WIF reservations, a minimum group threshold, a host bond and a direct refund path if the group does not form. A returning host can reuse the plan with fresh dates and fresh terms.

The useful distinction is recurring community coordination with specified onchain commitments. The contract has no owner or upgrade path. Refund eligibility needs no host signature, although transferring the refund still requires a wallet transaction. Check-in is not attendance or service-quality proof; wallet counts are not unique people.

## Required deliverables and current boundary

- [Public repository](https://github.com/NSEVEjk0/rally-wif) and [app](https://rally-wif.vercel.app).
- Reviewed, code-matched deployment on **Robinhood Chain, chain ID 4663**, using the official WIF token.
- Genuine settled WIF transactions and real agreed community activity. The current committed mainnet manifest is empty; examples and fork tests do not count as real activity.
- Required demo video showing the actual product and transactions.
- Human entry by **12 November 2026, 17:30 UTC**; keep the submitted app working through **16 November, 17:30 UTC**.

Read [MAINNET.md](MAINNET.md) for bounded deployment, receipt verification and a small genuine session/refund/repeat workflow. The dedicated operator key is stored privately on the VPS. Funding does not itself authorize arbitrary spending, and the host cannot reserve a seat in its own session.

Sources: [event](https://worldisflat.fun/build), [rules](https://worldisflat.fun/build/rules), [current schedule](https://worldisflat.fun/build/api/event). This is the World Is Flat event, not an official Robinhood-sponsored competition.

## Required recording: 55 seconds maximum

Prepare completed real transactions in advance; show their actual receipts and distinct participant roles. Do not present multiple controlled test wallets as independent customers. Record the real session outcome after the contract’s genuine time windows, then edit the relevant moments together.

| Time | Show | Explain |
| --- | --- | --- |
| 0–7 s | Real community session and fixed terms | Organizers need commitments, not just tentative replies. |
| 7–19 s | Actual WIF reservation and receipt | Participants reserve; the host backs specified commitments with a bond. |
| 19–33 s | Actual underfilled session’s direct refund and receipt | If the minimum is missed, the participant can recover the full reservation. |
| 33–44 s | Completed/check-in session and repeat draft | Successful sessions can become a new plan with fresh terms. |
| 44–55 s | Contract/source and limitations | Check-in is an onchain action, not proof of real-world service quality. |

Keep the final video under 60 seconds. Calendar export and the repeat draft may be shown briefly, but actual WIF use is the essential evidence. No optional slide deck or second video is needed.

## Announcement draft

Rally turns a community plan into a clear commitment: fixed WIF reservations, a minimum group, a host bond and a direct refund when the session does not fill. Reuse the plan to run it again with fresh terms. The public app currently labels its fictional examples and keeps live mode separate. Explore: https://rally-wif.vercel.app · Code: https://github.com/NSEVEjk0/rally-wif

Rewrite the announcement in your own voice and replace the preview-status sentence only after mainnet verification. This draft has not been posted.

## Submission outline

Describe the real community/use case, why WIF is central, fixed booking/refund/bond behavior, exact mainnet contract and receipt links, genuine participant and repeat activity, code reproduction, limitations and video URL. Keep fork test results distinct from real transactions.
