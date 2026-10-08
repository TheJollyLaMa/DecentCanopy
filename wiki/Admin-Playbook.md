# Admin playbook

[Wiki home](Home.md) · [Deployment](Deployment.md)

## Open your workspace

The three trees always remain in the title. They do nothing for visitors; only the wallet registered with `role: "owner"` in [contributor accounts](../contributor-accounts.json) activates their spin/sparkle and admin opener. The text still opens About. The owner-only Payroll toolbar button is another shortcut.

The current owner wallet is `0x807061DF657A7697c04045dA7d16D941861cAABc`. Connect it on **Base (8453)** to use the allocation controls. Expand only the section you need. Switching accounts or disconnecting closes the workspace. Reduced-motion users see a static active icon.

UI gating is not contract authorization. The shared router enforces its roles:

| Operation | Requirement |
| --- | --- |
| Create named allocation | Owner-wallet app gate + router `DEFAULT_ADMIN_ROLE` |
| Deposit USDC | Owner-wallet app gate; active fund, approved token, unpaused router, wallet USDC + Base ETH |
| Pay queued entry | Owner-wallet gate + router `PAYROLL_ROLE`, matching registered recipient and sufficient allocation balance |
| Approve recipient if needed | Router `CONTRIBUTOR_ADMIN_ROLE` |

The workspace intentionally does not offer global role grants, token allowlist changes or router pause controls. Those affect other repositories sharing the router.

## Allocations and deposits

Configured shared [router on BaseScan](https://basescan.org/address/0x8ecca903e2a6Daa8CCbB933700e4F2C58C44A4B5):
`0x8ecca903e2a6Daa8CCbB933700e4F2C58C44A4B5`.
Base USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (six decimals).

1. Expand **Fund allocations & USDC deposits**.
2. Enter a lowercase slug (letters/numbers, single hyphens) and **Inspect allocation**. The ID is `keccak256(UTF-8 slug)`, equivalent to `ethers.id(slug)`. IDs are global on this shared router: inspect before using a name.
3. If missing, provide a public `https://` or `ipfs://` metadata URI and **Create inspected allocation**. Keep sensitive material out of metadata. Creation makes an active named balance; it does not deploy a contract.
4. Inspect again, enter a positive USDC amount with at most six decimals, and **Approve & deposit**.
5. Review the app confirmation and wallet requests. If allowance is insufficient, the app requests exactly the deposit amount, waits for approval, rechecks the wallet/network and fund, then simulates and sends `fundToken`.
6. Wait for confirmation and retain the BaseScan links. Inspect again to refresh the balance. Approval alone is not a deposit; if a later step fails, approval may remain. Review its transaction and allowance before retrying.

No direct token-transfer fallback or unlimited approval is used. An existing sufficient allowance is reused, not increased. Funds enter the named allocation, not the router's unallocated balance. This panel does not offer withdrawal or allocation transfers.

**Routing is separate from creation.** Current dev and pinner queues both use `decentcanopy-repo-dev`. You may later create purpose-specific allocations for pinning, onboarding or tasks, but they do not automatically receive queued payouts. Changing routing requires coordinated queue generation, validation, browser payout and settlement configuration/code. Do not change only a fund slug and assume old entries moved. Onboarding airdrops are retired; future incentives need an explicit new policy and implementation.

## Pay, then settle

1. Expand **Payroll & pinner approvals**, refresh, and inspect the pending entry and configured allocation balance.
2. **Pay from fund** checks the owner, Base, router role, fund, asset, recipient and global work-reference replay guard.
3. Approve a recipient only when appropriate, then confirm the payout. The panel will not overwrite a different existing identity.
4. After Base confirmation, run [Settle Payroll](https://github.com/TheJollyLaMa/DecentCanopy/actions/workflows/settle-payroll.yml) with the exact contributor, issue reference, role, currency and **payout** transaction hash.
5. Verify the workflow succeeds and the entry moves from pending to settled. It records a verified payment; it does not send another one.

Never supply an approval or deposit hash to settlement. If payment confirmed but ledger update failed, recover with the same payout hash, not another payment. Historical `airdrop`/ART entries remain settleable; new joining rewards are disabled.

## Keep things running

- Approve/reject in-app pinner requests by signing owner decisions in the workspace; they are public. Fallback: `/pinner-approved` or `/pinner-recheck` on the relevant GitHub request.
- Run weekly pinner checks and inspect the public result issue. Current maximum is 20 qualifying pinners at $0.10 USDC each per week.
- Run IPFS backups, check the manifest's current CID, and maintain your independent copy.
- Review creator publication failures and Pages deployment status via **Operations & playbooks**.
- Keep the Artizen archive frozen. Do not infer or rewrite creators' payout experiences.
- Before pushing: `node --test` and `node scripts/validatePayrollQueue.js`.

See [pinning](IPFS-and-Pinning.md) for qualification limits and [deployment](Deployment.md) for secrets. No allocations or deposits are made by opening this panel.
