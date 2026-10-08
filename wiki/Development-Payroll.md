# Development payroll

[Wiki home](Home.md) · [Admin settlement](Admin-Playbook.md)

## Join and contribute

1. Open **About -> File an Issue** and submit the [contributor request](../.github/ISSUE_TEMPLATE/contributor-request.yml) with your GitHub username and EVM wallet.
2. The maintainer reviews it and registers the approved username/wallet in [contributor accounts](../contributor-accounts.json). Submitting a request is not automatic approval.
3. Pick or propose an issue with `bounty: <amount> USDC`, and merge a pull request referencing that issue (for example `Closes #123`).
4. [Bounty Bot](../.github/workflows/bounty-bot.yml) queues eligible whitelisted contributions and accrues account totals. The owner later authorizes the on-chain payment.

An unwhitelisted bot PR author can resolve to a whitelisted issue assignee. Match the intended implementer before merging; the workflow is not proof of who performed the work.

Optional `idea-credit: @username` gives a registered idea author 20%, with 80% to the implementer. Both must be registered. Duplicate labels for the same currency and amounts beyond the ledger's precision are rejected, not rounded.

## Testing

Use `test-bounty: <amount> USDC`; a tester comments `/test-complete`, then the owner reviews and comments `/test-approved`. [Testing Bounty](../.github/workflows/testing-bounty.yml) processes eligible reports. These are GitHub development workflows, not Discord activities.

## What is automatic?

Queueing and accounting are automated. Sending money is **not**: the owner wallet pays through the Base router, then the owner runs Settle Payroll with the confirmed payout hash.

- [Payroll queue](../payroll-queue.json): pending and settled entries.
- [Asset settings](../payroll-assets.json): Base router, tokens, decimals and current allocation.
- New development and pinner rewards are USDC-only. Old ART entries/configuration remain for historical compatibility, not new rewards.
- GitHub whitelist approval and on-chain contributor approval are separate. Payouts need both a valid registered recipient and router permissions/funding.

A bounty label is not a funded guarantee. Agree on work, approval and available funds with the maintainer before starting.
