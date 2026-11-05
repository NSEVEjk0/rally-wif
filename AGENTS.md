# Rally

Build fixed-term recurring community reservations using the official WIF token on chain 4663. The contract has no owner/upgrade path. Do not accept configurable lookalike tokens, unlimited approvals or arbitrary contracts supplied through query parameters.

Keep input amounts as decimal strings and onchain values as bigint. Booking terms, deadlines, creator bond, fee and check-in window are immutable. Expiry/refund resolution must not depend on a server or host signature. Bond penalties only cover specified, objectively checkable cancellations and missed onchain check-in; they do not prove service quality or physical attendance. Wallets are not unique people.

Tests must cover underfilled, cancellation, completion and missed-check-in paths, failed token transfers, reentrancy, rounding/dust, repeated claims and concurrent/capacity boundaries. Compare held liabilities with token balances. Use a fork test with real WIF bytecode in addition to mocks, and distinguish fork execution from real mainnet transactions.

Make preview examples conspicuously fictional. Show real receipts only when transactions actually settle. Never fabricate activity, attendees, creator reputation or earnings. Required checks: contract tests, frontend typecheck/build/domain tests, and browser verification of the primary booking/refund/repeat flow. Deploy only reviewed artifacts with the configured official token and chain.
