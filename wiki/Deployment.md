# Deployment & troubleshooting

[Wiki home](Home.md) · [Full README setup](../README.md#setup-checklist-maintainer)

## Maintainer checklist

1. Configure **Settings -> Pages -> Source -> GitHub Actions**. [Publish Site](../.github/workflows/publish-site.yml) deploys main and successful publication/reward/backup workflow outcomes.
2. Set `PINATA_JWT` in **Settings -> Secrets and variables -> Actions** with public upload permissions. Creator publication and canopy backups use it.
3. Deploy [the Render blueprint](../render.yaml). Keep `GITHUB_TOKEN` only in Render: a fine-grained token limited to this repo, Contents read/write and Metadata read for dispatch.
4. Restrict `ALLOWED_ORIGINS` to the site origin (and explicit local origins during testing). The relay also accepts IPFS subdomain gateway origins (`*.ipfs.inbrowser.link`, `*.ipfs.dweb.link`, `*.ipfs.w3s.link`) so the IPFS copy can publish; set `ALLOW_IPFS_GATEWAYS=false` to turn that off. Set the correct relay URL in [community rewards](../community-rewards.json).
5. Create the GitHub fallback labels `contributor-request`, `pinner-request` and `pinning-check` as needed.
6. Verify the actual Base router roles, token approval, active allocation, balances and recipient approvals. The config file is not evidence of deployed permissions or funding.
7. Run **Pin Canopy Site to IPFS** and open the `inbrowser` link in `ipfs-site.json`. If Pinata returns 401/403, the `PINATA_JWT` key needs the legacy `pinFileToIPFS` permission for folder uploads.
8. Run a backup and verify the current CID before enabling practical pinner qualification. Test a signed creator publication end-to-end and verify its explicit receipt and index.

Never commit JWTs, GitHub tokens or private keys. A static site cannot hide a secret. Render's token can also write to the repo: restrict scope, consider branch protection and rotate compromised credentials.

## Diagnose the right layer

| Symptom | Check |
| --- | --- |
| Trees do not activate | Header wallet matches the owner registry; registry fetch succeeded |
| Allocation controls disabled | Wallet on Base, successful inspection, fund exists/active, token approved, router unpaused |
| Creation fails | Actual `DEFAULT_ADMIN_ROLE`, slug uniqueness and public metadata URI |
| Deposit failed after approval | BaseScan approval receipt, remaining allowance, wallet/network, balance, fund state; approval is not a deposit |
| Creator stays pending | Relay health, Render logs, publication Actions run, Pinata secret and explicit publication receipt |
| Creator conflict | Reload latest revision/CID and sign again; do not overwrite someone else's index entry |
| Data index unavailable | Check published JSON and signature verification; archive stays available independently |
| Weekly reward missing | Approved pinner, current/recent pinned CID, matching bytes, weekly cap/check report |
| Paid but still pending | Run owner-only Settle Payroll with the confirmed payout hash; never pay the work reference again |
| Site looks stale | Pages source and Publish Site workflow; a bot commit alone may not trigger push deployment |

The free Render service can sleep. Requests wait up to 75 seconds and publication confirmation polls for up to five minutes; unconfirmed is not success. Workflows and signatures revalidate requests independently of the browser.

## Validation

The site uses static HTML/CSS/JS without a bundler. Relay/test signature dependencies live under `relay/`; install them with `npm ci --prefix relay` if needed. Run `node --test` and `node scripts/validatePayrollQueue.js` before pushing. No validation requires real payments.

Archive hashes are tested. Do not run an Artizen refresh against the frozen archive. Backups, publishing, Pages, router permission checks and actual payments are separate operations; verify each rather than assuming configuration enabled all of them.
