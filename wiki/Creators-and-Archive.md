# Creators & the frozen archive

[Wiki home](Home.md)

## Explore

Use the canopy switch to view the whole canopy, independent creators or the historical archive. Scroll to zoom, drag to pan, search by name, and click a blip for its card. Project/fund artwork links to its historical source page where available; those external pages and images may disappear. The data-notes tab explains the snapshot, and the Tour can be replayed from the toolbar.

The archived project and fund dataset is frozen by [the archive manifest](../data/artizen-archive.json). It retains Seasons 4-7; it is not a Season 6-only dataset. Submitted, curated and funded links mean different things. A submission does not establish fund membership. Neither a relationship nor an archived amount establishes that a payout was actually received. The refresh script refuses to overwrite the frozen snapshot.

## Add your Decent Creator

1. Connect an EVM wallet in the header and select **My creator**.
2. Add your name, bio, HTTPS website/avatar and optional city/country label. Add your projects and their planning/active/paused/completed status.
3. Add funding sources with exploring/applied/pledged/received/ended stages. Optional amounts require a currency; no receipt is inferred. If the source is a **Decent fund** on the canopy, choose it to draw a line to that fund's blip. Add the payment chain and transaction hash to let anyone check the payment on the public ledger.
4. Link **related Decent projects**, whether yours or another wallet's, to connect your project to theirs.
5. Add journey milestones. Artizen experiences are optional, separate self-reports. Payout experience defaults to **Not shared**; attach public evidence if you choose.
6. Consent to local storage and **Save draft & preview my blip**, or consent to public publication and **Sign & publish to the canopy**.

Drafts are browser-local, unsigned and wallet-specific. Public publication requires a readable signature, not gas or payment. It needs an operational relay and community pinning service. The editor reports pending, published or failed rather than treating submission as publication.

Only your wallet can revise its signed record. Referencing an archived project does not transfer ownership or edit the historical graph. A new funding source is a reported connection, not automatic fund membership.

## Publish a Decent fund

Anyone who runs or organizes a fund can publish it as its own blip. Open **My creator** and choose **Add a Decent fund**. Enter the fund's name, purpose, website, status (open, invite only, paused, closed), an optional treasury (chain + address), and the Decent projects it supports. The fund is signed by your wallet, which becomes its steward (shown by a steward line from your creator blip).

Supported chains: Base, Ethereum and Optimism. Use your signing wallet as the treasury if you want payments to be ledger-verifiable. Any other address is shown as **declared, not the signing wallet**.

## How lines earn trust

| Line | Meaning |
| --- | --- |
| Dashed amber | **Claimed by one side.** One wallet says the relationship exists; the other hasn't confirmed. |
| Solid blue | **Confirmed by both sides.** The fund lists the project *and* the project lists the fund, or two projects list each other. Same-wallet links count as confirmed. |
| Glowing green | **Ledger-verified.** A project's funding entry names a transaction, and the public chain shows it succeeded and moved native coin or ERC-20 tokens from the fund's treasury to the recipient. The treasury must be the steward's signing wallet, and the recipient must be the creator's signing wallet. |

Recipient wallet = the project's receiving wallet, or your signing wallet if left blank. The browser checks transactions directly against public RPCs (Base `mainnet.base.org`, Ethereum `ethereum-rpc.publicnode.com`, Optimism `mainnet.optimism.io`). Verified proofs are cached in your browser, and each card links to the explorer, so anyone can check them again. If a transfer matches but either address is only declared, the card says so, and the line is not upgraded. This matters because a declared address could belong to someone else. Multisig treasuries are therefore shown as "transfer found" but not glowing, for now.

Unresolved references (to a fund or project not on the canopy) are kept in your record, but no line is drawn. Unlinked funding sources still appear as private funding-source blips.

## Rabbit Hole meeting rooms

Every creator wallet has its own small video, voice and chat room.

1. **Open it:** connect your wallet, open your creator blip and choose **🕳️ Open my Rabbit Hole**. Enter a name and sign one message. Signing is free and needs no gas. The room stays open while that tab is open.
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

Local card edits and participation imports are a separate prototype: browser-only, explicitly unverified and not publication. Location consent does not cause the app to invent coordinates from city names.
