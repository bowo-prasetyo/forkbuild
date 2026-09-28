# 09 — Publications & External Evidence

> **Experimental in ForkBuild 1.0.** Everything in this guide and in guides
> [11](11-EvidenceAndStorage.md) and [12](12-ArchiveAndLeaderboards.md)
> works, but may change or be removed in a later version, and what it
> produces may not carry over. The app marks these screens with an
> **Experimental** banner. Building, saving, publishing to the Repository,
> forking, identities and peers are the stable core and don't depend on any
> of it.

None of this is needed to use ForkBuild. Skip it if you just want to build,
publish and explore.

The **Publications** page is a more technical layer than the Repository. The
Repository is about Documents and Worlds; the Publications page is about
**signed claims** such as "I designed this structure" or "I call this place
X", and about the optional depth you can add to a claim:

- **This guide** — where claims come from, the Publications page,
  [Commentary](#commentary), and [Local Snapshot](#local-snapshot) (what
  your device holds).
- **[Network Settings](10-NetworkSettings.md)** — gateways, relays,
  providers and peer-connection servers. Not experimental, and useful to
  everyone.
- **[Evidence & Storage](11-EvidenceAndStorage.md)** — external evidence
  (Bitcoin, Base, Arweave, Steem), the wallet pipelines, Snapshot
  Placements, IPFS publishing, and Steem.
- **[Archive & Leaderboards](12-ArchiveAndLeaderboards.md)** — the durable
  observation archive, references, achievements, publisher labels and the
  Leaderboard pages.

## Two meanings of "publish"

| | **Publish** (Repository) | **Publications page** |
|---|---|---|
| What it shares | A Document or World | A signed *claim* — authorship of a structure, or a place name |
| Where you see it | Repository, Author view, World View | The **Publications** page |
| Guide | [Publishing & Forking](04-PublishingAndForking.md) | This one |

A Document you publish with the ordinary **Publish** button doesn't appear
on the Publications page, and nothing on the Publications page is a Document
you can open or fork.

## Where a publication comes from

You never create a claim on the Publications page itself. It lists claims
you made elsewhere, ones peers sent you, and Repository creations that
arrived in decentralized form. Place-name claims can also be found straight
from Nostr, with no peer involved; see
[Nearby Place Names](03-WorldView.md#nearby-place-names--discovering-claims-from-anyone).

### Claiming authorship of a structure

Open a structure's **Info** panel from **My Structures** in the Editor's
Build Library. If it has a Blueprint identity (most saved structures do),
its **Community Attribution** section offers:

- **Claim authorship** — signs a claim, with your current identity, that
  you designed it. Shown until you've claimed it.
- **Export Attribution** — saves your claim as a file you can hand to
  someone.
- **Publish to Network** — announces your claim to every peer you're
  connected to, which puts it on their Publications page, and on yours.

### Naming a place

In World View, open the naming panel for a Region or Landmark and use
**Publish A Name** (see [Geographic places](03-WorldView.md#geographic-places)).
This announces a signed claim to your connected peers.

To make a name findable through
[Nearby Place Names](03-WorldView.md#nearby-place-names--discovering-claims-from-anyone)
too, open the naming panel's **More**, find the claim under **All Claims**,
and click **Publish to Nostr**. This is a separate step: neither action does
the other. A success names the relay it reached; a failure, most often
because no Nostr browser extension is installed, shows the error.

### Receiving one from a peer

When you connect to a peer (see
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)), your device
receives everything they've published, not only what they publish while
you're connected. A received claim is only a validly signed record: its
content isn't on your device until you fetch it with **Retrieve from Peers**
(below).

### A Repository creation, decentralized

A card can also hold a signed **Publication** — the same kind of object as a
Repository listing, wrapped for decentralized travel. **Share with Peers** in
the Repository creates one for your own Worlds (see
[Sharing with connected peers](04-PublishingAndForking.md#sharing-with-connected-peers)).
Once you resolve one here with **Re-check** or **Retrieve from Peers**, it
joins the Repository's search, its author's page and World View, and stays
after a reload.

## The Publications page

Open **Publications** in the top bar. It lists every signed publication this
device has cataloged, yours or a peer's. At the top, the folded **Wallet,
Archive & Publisher Tools** panel holds page-wide tools in three tabs:
**Blockchain Anchoring**, **Archive Tools** and **References &
Achievements** (see guides [11](11-EvidenceAndStorage.md) and
[12](12-ArchiveAndLeaderboards.md)).

Each publication card shows:

- Its name, once its content has been checked: a Publication's title or a
  place name. Otherwise, or for an authorship claim, the kind of
  publication.
- The kind of publication (under the name, when there is one) and who
  published it, shortened to the last few
  characters of their ID.
- A **status badge** (see [Status meanings](#status-meanings)), worked out
  again each time the page loads or you click **Re-check**.
- A one-line summary of the claim: an attribution's fingerprint and
  claimant, or a place name and claimant.
- **Retrieve from Peers**, while the content is unavailable (disabled with
  no peer connected). It asks each connected peer in turn for the bytes, and
  accepts them only after your device checks them against the content hash.
- **Re-check** — works the status out again now.

Below that, two folded sections:

- **Distribution** — the buttons that announce the publication, store its
  content (**Create … Placement**) and anchor it (**Create … Anchor**), each
  with a **Configure** link and **Use Preferred Provider**. See
  [Evidence & Storage](11-EvidenceAndStorage.md).
- **Details**, in four tabs:

| Tab | What's there |
|---|---|
| **Snapshot** | [Local Snapshot](#local-snapshot): what this device holds, and how to get it. |
| **Decentralization & Evidence** | [Decentralization](#decentralization-at-a-glance), the [evidence list](11-EvidenceAndStorage.md#the-evidence-list), and the Bitcoin and Base transaction steps. |
| **Placements & IPFS** | The [Snapshot Placements](11-EvidenceAndStorage.md#snapshot-placements) list and [IPFS Publishing](11-EvidenceAndStorage.md#ipfs-publishing). |
| **History** | **Show Cross-Domain Timeline**: every IPFS and Bitcoin observation for this publication, in time order. |

### Status meanings

| Badge | Meaning |
|---|---|
| **Available** | The content is on this device now. |
| **Content unavailable** | The claim is genuine, but the content isn't here yet. Try **Retrieve from Peers**. |
| **Invalid publication envelope** / **Invalid publication signature** | The record is malformed, or wasn't genuinely signed. |
| **Content does not match its own reference** / **Invalid content** / **Invalid content signature** | The content doesn't match what the publication claims. |
| **Failed a domain-specific check** | Well-formed and signed, but fails a check specific to its kind. |
| **Unsupported publication kind** | This version can't display this kind of publication. |

These describe whether the record checks out, not whether the design or name
is any good.

A publication whose status is anything but **Available** or **Content
unavailable** can't be opened, distributed or anchored, so it isn't given a
full card. These are gathered at the bottom of the page in a folded group,
"*N* publications that can't be used", each with its status, the reason,
**Re-check** and **Remove from This Device**. They're left out of **Anchor
Several Publications** too. The most common reason is a publication made
before content hashes became SHA-256: only its author can fix that, by
publishing it again.

**Remove from This Device** (or **Remove All *N* from This Device** at the
top of the group) asks you to confirm, then forgets the publication here.
It doesn't un-publish anything or reach anyone else, and a connected peer
that still has the publication may announce it again. Only publications in
this group can be removed.

## Commentary

Any signed-in identity can comment on any publication that resolves: a
Repository creation, an authorship claim or a place name. There's no
ownership check, friendship requirement or moderation.

You'll find comments:

- in the **Repository** and on author pages: the **Comment** button on
  every card and list row;
- in World View's
  [My Publication](03-WorldView.md#my-publication--distributing-your-own-snapshot-no-peers-required)
  panel, in its **Commentary** section;
- on a selected **World Encounter**: its **Comment** button.

Each shows the comments, oldest first, with each author's identity. Signed
in, you get a text box and **Post Comment**; otherwise, a note to sign in.

Comments are permanent: no editing, deleting or replies.

### How comments travel

A comment posted from the **Repository** is saved on your device, sent to
peers you're connected to, and published to the network chosen next to
**Post Comment** (Nostr, Arweave or Steem; it starts on your
[Announcement / Discovery Provider](10-NetworkSettings.md#announcement--discovery-provider)),
so people who weren't connected can find it. Closing the section (**Hide
Comments**) discards anything you'd typed but not posted. Comments posted
from World View's **My Publication** or **World Encounters** are, for now,
only saved on your device.

Other people's comments reach you:

- from connected peers, as they're posted;
- from the networks, when you open a publication's comments and whenever
  you click **Check for new comments**. This is how you see comments posted
  while you were offline.

The line beside the button reports the last check, such as *Found 2 new
comments* or *No new comments found* (which only covers the networks that
answered). An unreachable network is named (*Arweave unavailable*); if none
answers, you see *Couldn't reach Nostr or Arweave — showing comments stored
on this device*. Only publications whose comments you open are checked.
Every fetched comment's signature is checked, and none is counted twice.

When someone comments on a publication you published, a **Publication
commented** entry appears in your
[Notification History](03-WorldView.md#orientation-and-locations) (the 🔔
button in the header). It's the only kind of notification ForkBuild has
today.

## Local Snapshot

On a card's **Snapshot** tab, **Local Snapshot** answers one question: does
this device hold the bytes for this publication's content right now? It
doesn't check signatures or placements, and it contacts the network only
when you click one of the retrieval actions.

### Checking what you have

**Check Local Snapshot** (then **Check Again**):

| Badge | Meaning |
|---|---|
| **Available** | The bytes are here and match the content hash. |
| **Not available** | Nothing has ever been stored under this hash. |
| **Hash mismatch** | Something is stored under this hash, but it no longer matches. |

Two people with the same publication can get different answers, because
their storage differs. After a check, a line reads *Publication: known
locally / not known locally · Snapshot: available / not available*: whether
this device has cataloged the signed publication, and whether it holds valid
bytes.

### Bringing the bytes in

Three actions, each its own click:

**Import Snapshot** — shows a file picker and paste box for a **Publication
Snapshot Transfer Package** (a JSON bundle of one publication's content).
Choose or paste one, then click **Import Snapshot** again.

| Badge | Meaning |
|---|---|
| **Imported** | Stored and checked against its hash. |
| **Already available** | Matching bytes were already here. |
| **Import rejected** | The package's bytes don't match its own hash. |
| **Snapshot was not imported** | Not a valid package. |

**Get Snapshot from Peer** — choose one connected peer and click **Get
Snapshot from Peer** (then **…Again**). It asks only that peer.

| Badge | Meaning |
|---|---|
| **Obtained** | The peer's bytes match the content hash. |
| **Already available** | Matching bytes were already here. |
| **Not available right now** | The peer didn't answer, or doesn't have them. |
| **Rejected** | The peer's bytes didn't match. |

**Materialize Snapshot**, from a placement (see
[Snapshot Placements](11-EvidenceAndStorage.md#snapshot-placements)), is the
third way. Once one of the three succeeds, a **Source:** line names the most
recent successful one: "Transfer package", "Placement" or "Peer".

### Asking peers what they have

**Peer Snapshot Possession** asks one peer whether they hold the bytes,
without fetching them: choose a peer and click **Check with Peer** (then
**…Again**). The answer, with an **Observed:** time, is **Peer reports
snapshot available**, **Peer reports snapshot not available**, or **No
answer from peer**. A new check replaces the last.

**Peer Snapshot Possession Comparison** asks several: tick the peers and
click **Check Selected Peers** (then **…Again**). A table shows each peer's
report (**Available**, **Not available** or **Could not determine**) and
when, plus totals. **Show Observation History** lists every check this
visit, one row each (such as `20:21:04 — Alice → Available`); click a row
for the full report, publication and content hash. A row records what a
peer said at that moment and is never rewritten.

### Summaries

- **Snapshot Acquisition**, at the top of the section once you've checked or
  tried something: **Current possession** (the check above) and
  **Acquisition history**, a count of this visit's attempts by outcome and
  source. They're independent: a stored attempt doesn't mean the bytes are
  still here. When they aren't, a hint points to the three ways to bring
  them in; nothing retries by itself. **Show Acquisition History** lists each attempt (such as
  `20:16 — Peer → Hash mismatch`); click one for its outcome, publication
  and content hash.
- **Snapshot State**, below, puts the facts you've gathered this visit side
  by side: **Content**, **Local possession**, **Acquisition**,
  **Placements** and **Peer observations**. Each part appears only once
  you've observed it, and they're never combined into one verdict.

## Decentralization at a glance

On the **Decentralization & Evidence** tab, once a publication has an anchor
or a placement, **Decentralization** compares
[External Evidence](11-EvidenceAndStorage.md#external-evidence) and
[Snapshot Placements](11-EvidenceAndStorage.md#snapshot-placements):

- **Publication: known locally / not known locally** — whether this device
  has cataloged the signed publication.
- Two cards with how many claims of each kind are known, and whether they
  agree on the content hash (**Agreement**) or not (**Conflict**). If one
  agrees and the other conflicts, a sentence says so; agreement in one
  doesn't vouch for the other.
- **Synchronize with Peers** (then **Synchronize Again**) asks each
  connected peer for anchors and placements you don't have, and reports
  **New claims** and **Already known** for each kind.
- **Show Replica Knowledge** lists, for each anchor and placement, how this
  device learned it (**Acquisition**: *Learned locally*, *via package
  import* or *via peer exchange*), **First seen**, and its current
  **Verification** / **Resolution** state. It contacts no network.

## What survives a reload

Signed claims and recorded facts are kept; checks, attempts and screens in
progress are not.

| Kept on this device | Reset on reload |
|---|---|
| Cataloged evidence and placements, and each one's **Local Knowledge** | **Verify Evidence** and **Resolve Snapshot** results |
| Snapshot bytes you imported, retrieved or materialized | Everything else in **Local Snapshot**: checks, attempt history, the **Source:** line, peer checks and comparisons |
| **Decentralization** counts (worked out on every load) | **Synchronize with Peers** results |
| — | **IPFS Publishing**: the provider configuration, results, on-screen history and verification history |
| **Bitcoin/Base Anchor Publications** records, made at finalization | The wallet pipelines' connection, funding or account observation, plan, review, signature, finalized transaction, broadcast result and on-screen confirmation or inclusion history |
| The **Publication Observation Archive** (every IPFS publish and verification, Bitcoin broadcast, confirmation and content proof, and Base inclusion), until **Clear Archive** | — |
| Publication References and Publisher Associations | Which cards and rows you had open |
| Reconciliation decisions and observations (kept in the archive) | Pasted peer archives, imported evidence exports, filters, Evidence Export Comparison, and Publisher Snapshot Claim |

After a reload, a pipeline's or IPFS publish's results are still visible in
the [Observation Archive](12-ArchiveAndLeaderboards.md#the-publication-observation-archive),
a record's lifecycle, or (for Bitcoin) Historical Bitcoin Anchor Evidence.
Reconnect the wallet, or reconfigure the pinning provider, to continue.

## What's next?

Sharing your builds still happens in
[Publishing & Forking](04-PublishingAndForking.md). To go further here,
continue with [Evidence & Storage](11-EvidenceAndStorage.md).
