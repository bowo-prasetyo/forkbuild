# Distributing Your Work

<!-- languages -->
**English** · [Deutsch](de/Distribution.md) · [Español](es/Distribution.md) · [Français](fr/Distribution.md) · [Bahasa Indonesia](id/Distribution.md) · [日本語](ja/Distribution.md) · [한국어](ko/Distribution.md) · [Português (Brasil)](pt-BR/Distribution.md)
<!-- /languages -->

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
| **Distribute** | Decentralized networks (IPFS, Arweave, Nostr, Steem, Blurt) | Anyone, with no connection to you needed | This page |

Publishing never sends anything anywhere by itself, and sharing with peers
isn't distribution: peers keep a copy only as long as they choose to, and
nobody else can find it. Every distribution is its own explicit click.

## The three roles a network can play

Distributing uses up to three kinds of network, each chosen separately:

| Role | Like… | What it does | Choices |
|---|---|---|---|
| **Content** (Storage) | Where printed copies are kept | Holds the bytes, such as your World's bricks, so others can fetch them | **Arweave**, **Blurt** *(experimental)*, **IPFS (Local Kubo)**, **IPFS (Remote Pinning)**, **Steem** *(experimental)* |
| **Announcement / Discovery** | A library catalogue entry | Publishes a small signed notice saying your work exists and where its copy is, so others can find it | **Nostr**, **Arweave**, **Steem** *(experimental)*, **Blurt** *(experimental)* |
| **Proof / Anchoring** *(experimental, optional)* | A notary's stamp | Writes your content's hash into a blockchain, as evidence it existed by that time. It stores and announces nothing. | **Bitcoin**, **Arweave**, **Base**, **Steem**, **Blurt** |

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
| **Your World's Signed Claim** (the signed record of a published World, called a Shared World) | Arweave, IPFS, Steem or Blurt | Nostr, Arweave, Steem or Blurt | — | **Distribute** after publishing in the Editor; **My Shared World** in World View; the **Publications** page |
| **Your World's Snapshot** (its bricks), with where you placed it | Arweave, IPFS, Steem or Blurt | Nostr, Arweave, Steem or Blurt | — | The same **Distribute** dialogs (**Distribute Snapshot only** for just this half) |
| **Any publication's content hash** (a World, an authorship claim or a place name) | — | — | Bitcoin, Arweave, Base, Steem or Blurt | The publication's card on the **Publications** page |
| **Authorship of a structure** (Blueprint Attribution) | Arweave, IPFS, Steem or Blurt | Nostr, Arweave, Steem or Blurt | — | **Distribute** in the structure's **Info** panel, offered once you **Publish to Network**; the **Publications** page |
| **A place name** (Place Naming Claim) | Arweave, IPFS, Steem or Blurt | Nostr, Arweave, Steem or Blurt | — | **Distribute** in World View's naming panel, offered once you **Publish A Name** (it announces the name on the network you pick); the **Publications** page for any of these |
| **A comment** on a publication | — | Nostr, Arweave, Steem or Blurt, or none (**Local & peers only**) | — | **Post Comment**, in the Repository or World View, on the network chosen beside it; later, **Distribute** under your own comment |

A World's Snapshot carries your signed placement with it, so people who
fetch it see the build exactly where you put it.

### Signed Claim and Snapshot: two halves of one World

A published World is distributed in two separate pieces:

| | Signed Claim | Snapshot |
|---|---|---|
| **Like…** | A notarised catalogue card | The printed copy on the shelf, labelled with where it stands |
| **What it holds** | The World's title, you as its author, its license, the World it was forked from (if any) and its **content hash**, a fingerprint of the bricks, all signed with your identity | Every brick of the World, plus your signed placement: where you put it in World View |
| **Size** | A few kilobytes | As large as the build: up to 256 KB on Arweave, no limit on IPFS |
| **What it proves** | That you published this World, with exactly this fingerprint | Nothing by itself; anyone who fetches it checks the bricks against the content hash |
| **What it's used for** | Share links, and **Discover Shared World** looking your World up and checking it | Showing your build in World View, where you placed it, to people walking nearby |

The content hash ties the two together: anyone holding the bricks can
check that they match the fingerprint on your signed record.

Both halves use both roles: each one is stored on the Content network
you choose and announced on the Announcement / Discovery network you
choose. With IPFS and Nostr, for example, **Distribute** stores the
Snapshot on IPFS and announces it on Nostr, then stores the Signed Claim
on IPFS and announces that on Nostr too.

Each half is useful on its own, which is why the **Distribute** dialogs
report them separately and let you retry one with **Distribute Snapshot
only** or **Distribute Signed Claim only**:

- **Snapshot only:** your build appears in World View for people nearby,
  but no signed record of the publication stands behind it.
- **Signed Claim only:** people can find your World and confirm it's
  yours, but can't fetch its bricks from the networks. Peers you're
  connected to can still get them straight from you while you're online.

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

## What stays with you or your peers

Not everything you make is distributed. These never go to the networks
above:

| What | Where it goes | Guide |
|---|---|---|
| A World you **Share with Peers** | Your connected peers only | [Sharing with connected peers](04-PublishingAndForking.md#sharing-with-connected-peers) |
| Your avatar's live position and appearance | Connected peers, as your visibility settings allow | [Who can see you](06-AvatarsAndPresence.md#who-can-see-you-two-independent-settings) |
| Chat messages and voice calls | The friend you're talking to, directly | [Chat & Conversations](08-ChatAndConversations.md) |
| Anchors and placements you exchange with **Synchronize with Peers** | Your connected peers only | [Decentralization at a glance](09-PublicationsAndEvidence.md#decentralization-at-a-glance) |
| Your identity, saved structures, vehicles and animals you carry, friends, settings | This device, unless you export or back them up | [Your Data](13-YourData.md) |

To move these to another device, or hand them to someone, use the exports
and full backup on [Your Data](13-YourData.md).

## What each network needs

Distributing is signed by a browser extension or wallet you install
yourself; ForkBuild never sees your keys. Without the matching extension,
the attempt ends with a notice saying it couldn't be completed.

| Network | Roles | You need | Limits and notes |
|---|---|---|---|
| **Nostr** | Announcement / Discovery | A Nostr signing extension, such as nos2x | Announces to every relay in [Nostr Relays](10-NetworkSettings.md#nostr-relays) at once; more relays, more people can find you |
| **Arweave** | Content, Announcement / Discovery, Proof / Anchoring | An Arweave wallet extension, such as Wander | Stores up to 256 KB per Snapshot, about eight thousand bricks; anything larger is refused before signing. Permanent: it stays available when your computer is off. A new upload can take a few minutes to reach the gateways. |
| **IPFS (Local Kubo)** | Content | Your own IPFS node, by default at `http://127.0.0.1:5001` | No size limit. Available only while your node is online, unless someone else pins it. |
| **IPFS (Remote Pinning)** *(experimental)* | Content | An account with a Pinata-compatible pinning service | No size limit. Set the service up once under [Content Provider](10-NetworkSettings.md#content-provider); the token is asked for once per visit and never saved. |
| **Steem** *(experimental)* | Content, Announcement / Discovery, Proof / Anchoring | The Steem Keychain extension with your posting key, and your account under [Network Settings → Steem](10-NetworkSettings.md#steem) | Posts are replies to ForkBuild's monthly threads; one approval per post. Stores about 2,500 bricks per post, up to about 30,000 bricks in 20 posts. Uses Resource Credits, which refill. |
| **Blurt** *(experimental)* | Content, Announcement / Discovery, Proof / Anchoring | The Blurt Keychain extension (or WhaleVault) with your posting key, and your account under [Network Settings → Blurt](10-NetworkSettings.md#blurt) | One top-level post from your own account per build, which keeps its payout; stored data goes in replies under it. Stores about 2,500 bricks per reply, up to about 30,000 bricks. Each transaction costs a small fee in BLURT. |
| **Bitcoin** *(experimental)* | Proof / Anchoring | The UniSat extension, with bitcoin at a native SegWit (`bc1q…`) address for the fee | Made through the wallet steps on the Publications page |
| **Base** *(experimental)* | Proof / Anchoring | A browser wallet such as MetaMask or Coinbase Wallet, on Base | Every anchor is a transaction you review and sign |

A Steem anchor is quick and free but attested by Steem's witnesses rather
than proof of work: use it alongside a Bitcoin anchor, not instead of it.
See [Steem](11-EvidenceAndStorage.md#steem). The same holds for a Blurt
anchor, which costs nothing when your build's Blurt post already carries its
content hash; see [Blurt](11-EvidenceAndStorage.md#blurt).

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
   link that opens your build on any device, ready to remix or walk
   around in World View.

For a build larger than Arweave's 256 KB, choose IPFS. Peers you're
connected to can still fetch builds of up to 64 MB straight from you.

## Checking it worked

- Your build's Repository card says where this device recorded
  distributing it, for example **Stored on IPFS · Announced on Nostr**,
  or **No distribution recorded on this device**. See
  [Your publications](13-YourData.md#your-publications).
- Other people's Repository finds your Publication on Nostr, Arweave,
  Steem or Blurt the next time they open it, as long as it was announced under the
  usual discovery tag, `forkbuild-publication`. See
  [Creations others distributed](04-PublishingAndForking.md#creations-others-distributed).
- **Discover Shared World** in World View looks your Shared World up on
  Arweave and Nostr directly and checks it, answering "is my publication
  really out there, intact?" See
  [Discover Shared World](03-WorldView.md#discover-shared-world--searching-decentralized-networks-directly).
- On the Publications page, **Verify IPFS Content** fetches an IPFS upload
  back and compares it with its hash, and **Verify Evidence** checks an
  anchor.

Distribution can't be taken back: once something is announced or stored,
other people may already hold a copy. **Unpublish** removes a World from
your own catalog only, and this device then remembers not to list the
distributed copies again when the Repository searches the networks.
