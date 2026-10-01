# Distributing Your Work

Everything ForkBuild makes starts on your own device. **Distributing** is
the separate, optional step that puts your work on decentralized networks,
so people who aren't connected to you can find it, fetch it and check it.
This page gathers in one place what you can distribute, where it can go,
and what you need. Each section links to the guide that explains the
details.

## Publish, share, distribute: three different things

| Action | Where it goes | Who gets it | Guide |
|---|---|---|---|
| **Publish** | This device only | Nobody else, yet | [Publishing your creation](04-PublishingAndForking.md#publishing-your-creation) |
| **Share with Peers** | Straight to the people you're connected to | Your connected peers, while you're online | [Sharing with connected peers](04-PublishingAndForking.md#sharing-with-connected-peers) |
| **Distribute** | Decentralized networks (IPFS, Arweave, Nostr, Steem) | Anyone, with no connection to you needed | This page |

Publishing never sends anything anywhere by itself, and sharing with peers
isn't distribution: peers keep a copy only as long as they choose to, and
nobody else can find it. Every distribution is its own explicit click.

## The three roles a network can play

Distributing uses up to three kinds of network, each chosen separately:

| Role | Like… | What it does | Choices |
|---|---|---|---|
| **Content** (Storage) | Where printed copies are kept | Holds the bytes, such as your World's bricks, so others can fetch them | **Arweave**, **IPFS (Local Kubo)**, **IPFS (Remote Pinning)**, **Steem** *(experimental)* |
| **Announcement / Discovery** | A library catalogue entry | Publishes a small signed notice saying your work exists and where its copy is, so others can find it | **Nostr**, **Arweave**, **Steem** *(experimental)* |
| **Proof / Anchoring** *(experimental, optional)* | A notary's stamp | Writes your content's hash into a blockchain, as evidence it existed by that time. It stores and announces nothing. | **Bitcoin**, **Arweave**, **Base**, **Steem** |

Storage without an announcement means nobody knows where to look; an
announcement without storage points at nothing. **Distribute** does both in
one click. Anchoring is extra, and done separately on the **Publications**
page.

Set your usual choice for each role under
[Network Settings](10-NetworkSettings.md):
[Content Provider](10-NetworkSettings.md#content-provider),
[Announcement / Discovery Provider](10-NetworkSettings.md#announcement--discovery-provider)
and [Proof / Anchoring Provider](10-NetworkSettings.md#proof--anchoring-provider).
These only fill in the first choice of every picker; saving them never
sends anything.

## What you can distribute

| What | Content | Announcement / Discovery | Proof / Anchoring | Where you do it |
|---|---|---|---|---|
| **Your World's Signed Claim** (the signed record of a published World, called a Shared World) | Arweave, IPFS or Steem | Nostr, Arweave or Steem | — | **Distribute** after publishing in the Editor; **My Shared World** in World View; the **Publications** page |
| **Your World's Snapshot** (its bricks), with where you placed it | Arweave, IPFS or Steem | Nostr, Arweave or Steem | — | The same **Distribute** dialogs (**Distribute Snapshot only** for just this half) |
| **Any publication's content hash** (a World, an authorship claim or a place name) | — | — | Bitcoin, Arweave, Base or Steem | The publication's card on the **Publications** page |
| **Authorship of a structure** (Blueprint Attribution) | Arweave, IPFS or Steem | Nostr, Arweave or Steem | — | Claim it in the Editor's **My Structures**, then distribute it from the **Publications** page |
| **A place name** (Place Naming Claim) | — | Nostr | — | **Publish to Nostr** in World View's naming panel |
| **A comment** on a publication | — | Nostr, Arweave or Steem | — | **Post Comment** in the Repository (comments posted from World View stay on this device for now) |

A World's Snapshot carries your signed placement with it, so people who
fetch it see the build exactly where you put it.

Details:

- Signed Claim and Snapshot:
  [Distributing straight from the Editor](04-PublishingAndForking.md#distributing-straight-from-the-editor),
  [My Shared World](03-WorldView.md#my-shared-world--distributing-your-own-snapshot-no-peers-required),
  and the [Distribute dialog](03-WorldView.md#world-encounters--publications-and-avatars-your-peers-are-sharing)
  itself.
- The Publications page:
  [Distributing from the Publications page](09-PublicationsAndEvidence.md#distributing-from-the-publications-page),
  [Snapshot Placements](11-EvidenceAndStorage.md#snapshot-placements) and
  [IPFS Publishing](11-EvidenceAndStorage.md#ipfs-publishing).
- Anchoring: [External Evidence](11-EvidenceAndStorage.md#external-evidence),
  [The Bitcoin Anchor Pipeline](11-EvidenceAndStorage.md#the-bitcoin-anchor-pipeline)
  and [The Base Anchor Pipeline](11-EvidenceAndStorage.md#the-base-anchor-pipeline).
- Authorship: [Claiming authorship of a structure](09-PublicationsAndEvidence.md#claiming-authorship-of-a-structure).
- Place names: [Naming a place](09-PublicationsAndEvidence.md#naming-a-place).
- Comments: [How comments travel](09-PublicationsAndEvidence.md#how-comments-travel).

## What each network needs

Distributing is signed by a browser extension or wallet you install
yourself; ForkBuild never sees your keys. Without the matching extension,
the attempt ends with a notice saying it couldn't be completed.

| Network | Roles | You need | Limits and notes |
|---|---|---|---|
| **Nostr** | Announcement / Discovery | A Nostr signing extension, such as nos2x | Announces to every relay in [Nostr Relays](10-NetworkSettings.md#nostr-relays) at once; more relays, more people can find you |
| **Arweave** | Content, Announcement / Discovery, Proof / Anchoring | An Arweave wallet extension, such as Wander | Stores up to 256 KB per Snapshot, about eight thousand bricks; anything larger is refused before signing. Permanent: it stays available when your computer is off. A new upload can take a few minutes to reach the gateways. |
| **IPFS (Local Kubo)** | Content | Your own IPFS node, by default at `http://127.0.0.1:5001` | No size limit. Available only while your node is online, unless someone else pins it. |
| **IPFS (Remote Pinning)** *(experimental)* | Content | An account with a Pinata-compatible pinning service | No size limit. Type the endpoint and credential each time; they're never saved. |
| **Steem** *(experimental)* | Content, Announcement / Discovery, Proof / Anchoring | The Steem Keychain extension with your posting key, and your account under [Network Settings → Steem](10-NetworkSettings.md#steem) | Posts are replies to ForkBuild's monthly threads; one approval per post. Stores about 2,500 bricks per post, up to about 30,000 bricks in 20 posts. Uses Resource Credits, which refill. |
| **Bitcoin** *(experimental)* | Proof / Anchoring | The UniSat extension, with bitcoin at a native SegWit (`bc1q…`) address for the fee | Made through the wallet steps on the Publications page |
| **Base** *(experimental)* | Proof / Anchoring | A browser wallet such as MetaMask or Coinbase Wallet, on Base | Every anchor is a transaction you review and sign |

A Steem anchor is quick and free but attested by Steem's witnesses rather
than proof of work: use it alongside a Bitcoin anchor, not instead of it.
See [Steem](11-EvidenceAndStorage.md#steem).

## A typical route

1. **Publish** your World in the Editor (see
   [Publishing your creation](04-PublishingAndForking.md#publishing-your-creation)).
2. Click **Distribute** in the notice that appears, or later under **My
   Shared World** in World View.
3. Pick a **Storage** and an **Announcement / Discovery substrate**, for
   example IPFS and Nostr, or Arweave for both, and click **Distribute**.
   It distributes the Snapshot, then the Signed Claim, and reports each
   one separately. If one half fails, retry just that half with its own
   **… only** button.
4. Optionally, on the **Publications** page, anchor the publication (for
   example **Anchor on Arweave**) to record when it existed.
5. Click **Share…** or **Copy link** under the result to give people a
   link that opens your build in World View on any device.

For a build larger than Arweave's 256 KB, choose IPFS. Peers you're
connected to can still fetch builds of up to 64 MB straight from you.

## Checking it worked

- Your build's Repository card says where this device recorded
  distributing it, for example **Stored on IPFS · Announced on Nostr**,
  or **No distribution recorded on this device**. See
  [Your publications](13-YourData.md#your-publications).
- **Discover Shared World** in World View looks your Shared World up on
  Arweave and Nostr directly and checks it, answering "is my publication
  really out there, intact?" See
  [Discover Shared World](03-WorldView.md#discover-shared-world--searching-decentralized-networks-directly).
- On the Publications page, **Verify IPFS Content** fetches an IPFS upload
  back and compares it with its hash, and **Verify Evidence** checks an
  anchor.

Distribution can't be taken back: once something is announced or stored,
other people may already hold a copy. **Unpublish** removes a World from
your own catalog only.
