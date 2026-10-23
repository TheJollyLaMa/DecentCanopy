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

### Deploying public repository linking

Deploy the updated [creator record validator](../scripts/creator-records.js) to both
the relay and the publication workflow checkout before publishing repository-bearing
profiles from the updated site. An older validator cannot parse those new canonical
messages; deploying only the frontend is insufficient. Existing signed profiles
remain valid without rewrites.

The public GitHub preview needs no GitHub secret or additional relay endpoint. The
browser performs an explicit anonymous read against `api.github.com`. Verify a public
repository preview, signed publication receipt/index, project-to-repository navigation,
and a signed unlink revision after deployment. Do not treat passing local tests or
mocked pinning as proof of successful production publication.

### GitHub sign-in setup

This is self-service GitHub OAuth app registration; it does not require a special
GitHub partnership or private-repository permissions.

1. Open [GitHub Settings -> Developer settings -> OAuth Apps -> New OAuth App](https://github.com/settings/applications/new).
2. Name it **DecentCanopy**, set Homepage URL to `https://thejollylama.github.io/DecentCanopy/`,
   and Authorization callback URL to `https://decentcanopy-relay.onrender.com/github/callback`.
3. Generate a client secret. In the relay's **Render environment settings**, set
   `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, and
   `GITHUB_OAUTH_CALLBACK_URL` (the exact callback above). Never put the secret in
   GitHub Pages, browser code, Actions logs, a creator record, or a chat message.
   This app is separate from the relay's existing fine-grained dispatch token.
4. Deploy the updated relay and site. `GET /github/status` reports `configured: true`
   only when all three values are supplied. Without them, sign-in returns a clear
   setup error and manual public URL linking remains available.
5. In the creator editor, sign in, load another repository page, choose more than
   five repos, add selected links and review the URLs. Check cancellation, disconnect,
   reconnect, expired sessions and GitHub-side revocation. Then test an actual
   wallet-signed publication and unlink revision separately.

No OAuth scopes are requested. The relay rejects tokens carrying extra scopes,
excludes private repositories and only returns allowlisted public metadata.
Sign-in state is one-use and bound to an HttpOnly SameSite=Lax callback cookie.
The browser keeps only a random relay capability in memory; GitHub tokens never
leave the relay, and relay sessions expire after ten minutes. Tokens are revoked
on explicit disconnect/expiry where GitHub is reachable; after a process restart,
use GitHub Settings -> Applications for durable revocation. Sessions are intentionally
in-memory and require a single relay instance; restarting interrupts sign-ins.

For local testing, register a separate app with an HTTP localhost callback, explicitly
allow the local site origin, and keep all credentials in the local process environment.
Mock tests prove protocol behavior, not actual production GitHub authorization.

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
