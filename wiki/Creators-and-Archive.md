# Creators & the frozen archive

[Wiki home](Home.md)

## Explore

Use the canopy switch to view the whole canopy, independent creators or the historical archive. Scroll to zoom, drag to pan, search by name, and click a blip for its card. Project/fund artwork links to its historical source page where available; those external pages and images may disappear. The data-notes tab explains the snapshot, and the Tour can be replayed from the toolbar.

The small radio under the header subtitle starts on WQXR classical at 8% volume. Browsers may block autoplay; use **Play** when the status says to tap it. Use the station button to hear **DecentBusking** live JukeLoop instead, or switch back to classical. The slider changes volume and Play/Pause stops or resumes audio. JukeLoop follows the same IPFS tracks and live position as the Rabbit Hole radio, polling every eight seconds. Station choice resets to classical on a new page load; audio stays local to your browser and requires the external radio services to be reachable.

The archived project and fund dataset is frozen by [the archive manifest](../data/artizen-archive.json). It retains Seasons 4-7; it is not a Season 6-only dataset. Submitted, curated and funded links mean different things. A submission does not establish fund membership. Neither a relationship nor an archived amount establishes that a payout was actually received. The refresh script refuses to overwrite the frozen snapshot.

## Add your Decent Creator

1. Connect an EVM wallet in the header and select **My creator**.
2. Add your name, bio, HTTPS website/avatar and optional city/country label. Add your projects and their planning/active/paused/completed status.
3. Add funding sources with exploring/applied/pledged/received/ended stages. Optional amounts require a currency; no receipt is inferred. If the source is a **Decent fund** on the canopy, choose it to draw a line to that fund's blip. Add the payment chain and transaction hash to let anyone check the payment on the public ledger.
4. Link **related Decent projects**, whether yours or another wallet's, to connect your project to theirs.
5. Add journey milestones. Artizen experiences are optional, separate self-reports. Payout experience defaults to **Not shared**; attach public evidence if you choose.
6. Consent to local storage and **Save draft & preview my blip**, or consent to public publication and **Sign & publish to the canopy**.

Drafts are browser-local, unsigned and wallet-specific. Public publication requires a readable signature, not gas or payment. It needs an operational relay and community pinning service. The editor reports pending, published or failed rather than treating submission as publication.

Publishing opens a glowing, rotating icon-ring modal adapted from DecentJukebox, with a connected forest, drifting critters, and shimmering letters that grow into a canopy arch. It shows the wallet-signature, relay submission, and verification/IPFS-pinning stages; editing and dismissal are paused until the operation finishes. Approve the signature in your wallet when prompted, then keep the tab open. The result stays visible until you choose **Back to editor**, and the same status appears beside **Sign & publish to the canopy**. Errors or a confirmation timeout unlock the editor without claiming publication succeeded; check the public profile before resubmitting a pending request. Decorative animations pause when the modal closes or publication finishes; reduced-motion settings disable them entirely.

Only your wallet can revise its signed record. Referencing an archived project does not transfer ownership or edit the historical graph. A new funding source is a reported connection, not automatic fund membership.

Creator cards show projects as compact artwork-and-name dropdown cards. Expand one to see the full artwork, description, website and project actions. **Open project blip** takes you to its map card; **View creator profile** on a project card returns to its creator. Project artwork fits inside its frame without cropping.

With the owning wallet connected, **Edit project** (or **Edit this project** on its blip) opens only that project's fields, publishing consent, and a single **Sign & publish** action. Draft/preview and signed-download tools remain in **My creator**, not the focused project editor. The project keeps its key and creator connection; your signature still authorizes a complete updated creator record, not an independent unsigned project. Other published profile fields, projects, funds, funding sources and journey entries are preserved. A saved draft for the selected project is restored, but unrelated browser-local draft edits are not published by this action and remain saved. Use **My creator** for whole-profile edits, adding/removing projects, funds and journey updates.

To remove a published project or fund, open **My creator**, choose **Remove entry** on that row, and sign/publish the updated profile. Before removing a project, retarget or clear any journey, funding, related-project, or fund-support links that refer to it; before removing a fund, clear or retarget funding-source links to it. The updated profile removes those items from current discovery, but earlier signed exports and IPFS revisions remain public. This is not deletion of the frozen Artizen archive or a way to erase prior public copies.

## Publish a Decent fund

Anyone who runs or organizes a fund can publish it as its own blip. Open **My creator** and choose **Add a Decent fund**. Enter the fund's name, purpose, website, status (open, invite only, paused, closed), an optional treasury (chain + address), and the Decent projects it supports. The fund is signed by your wallet, which becomes its steward (shown by a steward line from your creator blip).

Supported chains: Base, Ethereum and Optimism. Use your signing wallet as the treasury if you want payments to be ledger-verifiable. Any other address is shown as **declared, not the signing wallet**.

## Public GitHub repository links

This is the first, public-linking slice of [connector #11](https://github.com/TheJollyLaMa/DecentCanopy/issues/11),
not GitHub account authentication. Public repository activity is refreshed separately as described below.

1. Open **My creator**, add/edit a project, or use **Edit this project / link repositories** on your own project blip.
2. Enter up to five public `https://github.com/owner/repository` URLs, one per line.
   Do not enter tokens, private repository names, source contents, or personal health data.
   Repository subpages, credentials, queries, fragments, and duplicate links are rejected.
3. Optionally choose **Preview public GitHub metadata**. This explicitly contacts
   `api.github.com` from your browser without authentication, cookies, or a referrer.
   GitHub can observe that request's network information. The preview shows the public
   owner, repository name, URL, visibility, and check time. It requests neither
   repository contents nor issue data. Metadata is transient, not added to the signed record.
4. Review the selected URLs, consent to publication, and sign the existing creator update.
   URLs become public in the creator index and portable signed IPFS record. Local preview
   still requires separate browser-local storage consent.
5. The creator/whole canopy shows distinct repository blips with dashed, self-declared
   project connections. Cards link to GitHub and back to the linked projects. Multiple
   projects can share a repository node, without upgrading its ownership or verification.

**Least-privilege choice:** this slice has no OAuth, GitHub account verification, tokens,
write/admin permissions, or private-repository access. An anonymous public metadata response
only establishes what GitHub returned at that time, not that the signing wallet controls
the GitHub account or owns the project. Private access is unsupported; a future feature
would require a separate explicit opt-in and credential/revocation design.

Unavailable GitHub, rate limits, timeouts, private/inaccessible repositories, and renamed or
inconsistent identities produce an explicit preview error. No unavailable metadata is
presented as success. You can still choose a self-declared public URL without a successful
preview; Canopy does not certify its current visibility. Check it yourself before publishing.
Repository metadata/visibility can change after checking. The editor preview is not live polling; the separately published activity snapshot does not verify account ownership.

### Public build activity and release freshness

**Data / build activity** opens the accessible heat legend, snapshot status, refresh button,
heat overlay toggle and animation toggle. The collector reads public repositories already
listed in the curated Agency map, public project catalog or published creator records.
Unpublished browser drafts do not enroll repositories. An unresolved repository identity
stays unresolved; the collector does not guess a replacement. The frozen Artizen archive
does not acquire a live heat overlay.

The [activity workflow](../.github/workflows/repository-activity.yml) is scheduled every
15 minutes and after successful creator publication. GitHub scheduling and Pages deployment
may delay updates; this is **near-live polling, not a real-time webhook service**.
Visible browser tabs check the published snapshot every minute without GitHub credentials.
**Check latest snapshot** fetches the deployed snapshot; it does not start a server collector.
Reload the map to discover graph nodes added by other creators since the page was opened;
activity polling updates observations, not the separately loaded signed profile graph.

Each public repository reports its latest sampled default-branch commit, latest published
GitHub release, and combined open issue/pull-request count. Heat counts commits whose
committer timestamps fall in the last seven days from a sample of at most 100 commits.
A full 100-entry sample is labeled capped, not an exhaustive total. Merge commits are
included; timestamps can be authored or rewritten. This is not effort, impact or readiness.
Zero sampled commits differs from unknown, partial, unavailable or stale. Failed checks
and observations older than one hour get gray/unknown heat, never zero-activity success.

Project heat aggregates its explicitly linked repositories, deduplicated; any missing or
unknown repository makes aggregate heat unknown. Paired connection accents indicate
activity at both endpoints only. They do not establish shared commits, integration,
collaboration, funding or ownership, and do not upgrade the line's evidence color/dashes.
Animation is optional, pauses in hidden tabs and is disabled for reduced motion.

Capabilities, offers/needs and proposed crossovers remain a separate human-reviewed layer:
a commit or a release title cannot automatically establish what the community can safely
reuse. Latest release and commit links expose new work without fabricating capability claims.
The collector uses GitHub Actions' repository token for public reads only; the browser
receives no token, private metadata or source contents. This does not install a GitHub App,
authenticate a GitHub account, or request access to private repositories.

### Supporter editions

Supporter discovery refreshes separately, approximately every six hours, using public
registry/escrow reads on Base and Optimism. Snapshot prices and stock are dated observations,
not live offers. Purchase links open the exact chain/escrow/listing buyer page, which checks
current conditions before a wallet transaction. Canopy sends no purchase transaction.

When an official latest release includes consistent Supporter manifest, metadata and mint
evidence, the activity collector records its front/back artwork asset links and caches
bounded PNG previews (up to 5 MiB and 4096 pixels per dimension) in the public site. This
avoids depending on GitHub's attachment responses as hotlinked images. Original release
asset links and provenance remain visible. Cards use this
explicitly labeled **GitHub release artwork mirror** only when chain, NFT contract, token ID
and declared on-chain metadata URI match the ledger snapshot. This is not a successful IPFS
retrieval or a new stock check. Failed artwork remains labeled unavailable, with source links.
Older editions remain discoverable; no existing token is reminted. Head v2.0.0 is Base token
70/listing 0, Market v0.3.1 is token 71/listing 1; Canopy minting remains deferred.

Edit/remove individual lines or choose **Unlink all repositories**, then sign and publish a
new revision. A remaining link from another project keeps its shared repo node visible.
Closing the editor without saving/publishing does not publish an edit. There is no GitHub
authorization to revoke in this slice. Unlinking updates the current profile; it cannot
delete old public IPFS records or copies others retain.

### Signed record compatibility

Version 2 project records optionally contain `repositories`, an array of at most five
canonical lowercase HTTPS GitHub repository URLs. Empty arrays are omitted so existing
version 1/2 canonical messages and signatures remain byte-identical. Version 1 records
cannot carry repository links; editing upgrades through the existing version 2 flow.
No GitHub metadata or verification claims are added to signed records.
Repository node IDs are `github-repo:owner/repository`; project-to-repository edges
remain `claimed` regardless of how many creators link the same repo.
The curated DecentAgency inventory is separate and is not rewritten by creator edits.

## How lines earn trust

| Line | Meaning |
| --- | --- |
| Dashed amber | **Claimed by one side.** One wallet says the relationship exists; the other hasn't confirmed. |
| Solid blue | **Confirmed by both sides.** The fund lists the project *and* the project lists the fund, or two projects list each other. Same-wallet links count as confirmed. |
| Glowing green | **Ledger-verified.** A project's funding entry names a transaction, and the public chain shows it succeeded and moved native coin or ERC-20 tokens from the fund's treasury to the recipient. The treasury must be the steward's signing wallet, and the recipient must be the creator's signing wallet. |

Recipient wallet = the project's receiving wallet, or your signing wallet if left blank. The browser checks transactions directly against public RPCs (Base `mainnet.base.org`, Ethereum `ethereum-rpc.publicnode.com`, Optimism `mainnet.optimism.io`). Verified proofs are cached in your browser, and each card links to the explorer, so anyone can check them again. If a transfer matches but either address is only declared, the card says so, and the line is not upgraded. This matters because a declared address could belong to someone else. Multisig treasuries are therefore shown as "transfer found" but not glowing, for now.

Unresolved references (to a fund or project not on the canopy) are kept in your record, but no line is drawn. Unlinked funding sources still appear as private funding-source blips.

## ENS project profiles and website updates

Project editors accept an optional ASCII `.eth` name, including subnames. It is included in the wallet-signed record only when filled in; existing signed records remain unchanged. ENS names can also be inferred from a project's `.eth.limo` website. DecentCanopy, The Green Tea Party, and DecentBusking's existing projects have explicitly scoped public ENS associations (not rewrites of their signed records): `decentcanopy.eth`, `thegreenteaparty.thejollylama.eth`, and `decentbusking.thejollylama.eth`. An explicit signed ENS field overrides these defaults.

The Green Tea Party's ENS family lists `green-tea-party-kiln-001.thegreenteaparty.thejollylama.eth` (Mama's project) and `green-tea-hut-001.thegreenteaparty.thejollylama.eth`. Until a corresponding signed project exists, its link opens ENS Manager rather than inventing a creator blip. When signed project blips declare direct parent/child ENS names, the graph adds labeled namespace `parent-child` links and the family buttons open those blips. Duplicate ENS associations are ambiguous and do not produce graph links. These relationships describe associated names, not verified ownership or a transfer of the Kiln to TheJollyLaMa; different creators remain separate.

The favicon and Apple touch icon use a bundled 180px PNG derived from the `decentcanopy.eth` avatar record (`https://euc.li/decentcanopy.eth`), captured on October 9, 2026. The original JPEG is bundled alongside it. This keeps the icon available in Pages and immutable IPFS snapshots without an ENS/RPC request on every load; later ENS avatar changes require refreshing the bundled icon. Existing signed artwork and the Rabbit Hole favicon remain unchanged.

Project cards read the ENS resolver on Ethereum for the address, avatar, `header` banner, and website contenthash. Artwork appears alongside the saved project artwork and is labeled as a live ENS profile. Matching address records are not proof of name ownership. HTTPS-hosted artwork remains dependent on its host; using IPFS artwork in ENS is more portable. RPC or image failures are shown explicitly.

When viewing your own project, enter a pinned root CID and choose **Copy CID & open ENS**. This copies an `ipfs://CID` value and opens ENS Manager; paste it into Website / Contenthash and approve with the ENS owner wallet. **This button does not submit an ENS transaction.** DecentCanopy pre-fills its latest Pinata site manifest, not the signed creator-profile CID. Other projects require their own website CID. **Remind me next week** snoozes the on-card weekly review prompt in this browser; reminders appear when you revisit the card, not as background notifications. Opening the manager or snoozing does not claim that ENS was updated.

Canopy already pins successful Pages deployments and performs a scheduled daily check. Immutable IPFS snapshots do not automatically move an ENS pointer. Fully automatic alternatives include:

- Set ENS contenthash once to an **IPNS** name, then automate publishing that signed IPNS pointer. Keep both site pins and the IPNS key/record available and regularly republish the record. Test gateway support and caching before switching.
- Authorize a dedicated publisher through a compatible resolver's per-name approval. It still signs transactions and pays Ethereum gas. Standard per-name resolver delegation can change other records on that name, not just contenthash; use a carefully designed restricted controller for contenthash-only authority.
- A keeper/relayer can execute updates, but it needs permission, gas funding, and an authenticated source of new CIDs. ENS renewal automation is separate from website publishing; neither Alchemix nor Gelato removes those requirements.

No resolver delegation, contract deployment, private-key storage, IPNS pointer change, or ENS transaction is performed by these controls.

References: [ENS decentralized websites](https://docs.ens.domains/dweb/intro), [resolver writes](https://docs.ens.domains/resolvers/writing), [Public Resolver](https://docs.ens.domains/resolvers/public), and [community Alchemix/Gelato renewal example](https://github.com/The-Wary-One/self-repaying-ens).

## Rabbit Hole meeting rooms

Every creator wallet has its own small video, voice and chat room.

1. **Open it:** connect your wallet, open your creator blip and choose **🕳️🐇** (hover for the room description). Enter a name and sign one message. Signing is free and needs no gas. The room stays open while that tab is open.
2. **Share it:** use **📋 Copy invite link** on your blip or the **Copy** button inside the room. The link looks like `…/rabbit-hole/?host=<your wallet>&room=lounge`. **🔐 New private room** opens a second room with a random name that only people holding that link can find.
3. **List it (optional):** in **My creator**, tick **Show a "Knock on my Rabbit Hole" button** and publish. Visitors then see **Knock on <name>'s Rabbit Hole** on your blip. This is the signed `rabbitHole: true` field. It is omitted when off, so older signed records don't change.
4. **Knock:** guests connect their wallet and sign too. Before knocking, the guest's browser checks that the room is really held by the host wallet in the link. The host sees each knocker's verified wallet, then chooses **Buzz In** or **Decline**.

How it works and what to expect:
- Video, audio, chat, reactions and files (up to 5 MB) go directly between browsers over encrypted WebRTC. Every guest connects to every other guest. Nothing is recorded or stored; chat disappears when you leave.
- Wallet proofs last 12 hours per tab. Each guest's proof is tied to their own connection, so a copied proof can't be reused by someone else. A signature proves wallet control, not real-world identity.
- Anyone who knows a room link can try to take that room's address before you open it. Guests will refuse to join, because the wallet check fails, but the room is blocked until it's free again. If that happens, open a **New private room**.
- Practical limit: about 6 people with video; the hard cap is 12 guests.
- Introductions between browsers use the free public PeerJS service, and there is no TURN relay server. Some strict corporate or mobile-carrier networks can block direct connections.
- [`rabbit-hole/index.html`](../rabbit-hole/index.html) is one standalone file, so it can be pinned to IPFS and opened from any gateway.
- **Radio:** 🎵 plays and pauses; the station button switches between **🎼 WQXR** classical and **🎸 DecentBusking**. DecentBusking plays its live [JukeLoop radio](https://thejollylama.github.io/DecentBusking/) track by track from IPFS, kept in step with the broadcast and showing the current song. Each person's radio is local to their own browser and isn't sent to other people in the room.

## Keep your record

**Sign & download portable record** exports signed JSON. Import it again using the same wallet, or pin it independently. Every update has a revision and previous CID; stale/conflicting edits must reload the latest version before signing again.

Limits: 20 projects, 10 Decent funds (30 supported projects each), 10 related projects per project, 30 funding sources, 40 journey updates and 16 KB per canonical profile. New records use format version 2. Version 1 records remain valid and verifiable. Public discovery currently uses a GitHub index and relay; it is not fully decentralized or guaranteed permanent.

Publish only information you mean to make public. Wallets, links, signatures and public history can be copied permanently. Clearing a local draft cannot remove IPFS copies. There is no signing-key recovery or public removal flow yet.

Signed image URLs stay unchanged. The canopy can serve a bundled copy of a known IPFS image when its bytes have been verified against its CID; this avoids public-gateway rate limits and includes the image in the whole-site IPFS pin. Currently TheJollyLaMa's avatar is bundled this way. Other images still load from their declared URLs; a failed image shows **Artwork unavailable** rather than a broken-image icon.

Local card edits and participation imports are a separate prototype: browser-only, explicitly unverified and not publication. Location consent does not cause the app to invent coordinates from city names.
