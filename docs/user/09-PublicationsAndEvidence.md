# 09 — Publications & External Evidence

<!-- languages -->
**English** · [Bahasa Indonesia](id/09-PublicationsAndEvidence.md) · [日本語](ja/09-PublicationsAndEvidence.md)
<!-- /languages -->

> **Partly experimental.** The Publications page is a regular feature: its
> list and statuses, removing publications that can't be used, announcing on
> Nostr or Arweave, storing on IPFS or Arweave, and checking, importing or
> getting a card's snapshot. The rest is **Experimental**: it works, but may
> change or be removed in a later version, and what it produces may not
> carry over. The page marks each such part with an **Experimental** badge
> (**Exp.** on a tab): every kind of anchoring, the wallets, Steem, remote
> IPFS pinning, the **Decentralization & Evidence**, **Placements & IPFS**
> and **History** tabs, the peer possession and summary sections of the
> **Snapshot** tab, and the whole **Wallet, Archive & Publisher Tools**
> panel. Guides [11](11-EvidenceAndStorage.md) and
> [12](12-ArchiveAndLeaderboards.md) say which of their sections are
> Experimental. Building, saving, publishing to the Repository, forking,
> identities and peers don't depend on any of it.

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
| What it shares | A Document or World | A signed record: a Shared World, authorship of a structure, or a place name |
| Where you see it | Repository, Author view, World View | The **Publications** page |
| What you do with it | Open, explore, fork | Check it, fetch its content, distribute and anchor it |
| Guide | [Publishing & Forking](04-PublishingAndForking.md) | This one |

**Publish** alone doesn't put a World on the Publications page. **Share
with Peers** does: it signs the World as a **Shared World** that can travel
to peers (see [A Repository creation, decentralized](#a-repository-creation-decentralized)).

The Publications page has no **Open**, **Explore** or **Fork**, not even for
a Shared World. It shows the signed record, not the World. To open, explore
or fork a Shared World, find it in the Repository, on its author's page or
in World View. One you received from a peer appears there once its content
is on this device. (The one exception is **Open in Editor** on your own
Shared World that needs publishing again; see
[Status meanings](#status-meanings).)

Every entry on the Publications page is a *publication*, and each is one of
three kinds:

| Kind | What it is |
|---|---|
| **Shared World** | A published World, as a signed record that can travel between peers and networks |
| **Blueprint Attribution** | A claim that you designed a structure |
| **Place Naming Claim** | A name for a Region or Landmark |

World View, the Editor and the Repository call a World's signed record a
**Shared World** too, as in **My Shared World**, **Discover Shared World**
and **Back to Shared World**.

## What surrounds a publication

A publication is only the signed record. Everything else you'll see on its
card, and around it in World View, is something done with it or attached
to it. None of these is a kind of publication, and only the publication
itself is required:

| Term | Like… | What it is |
|---|---|---|
| **Publication** | The book itself | A signed record: a Shared World, a Blueprint Attribution or a Place Naming Claim. It carries the hash of its content and its publisher's signature. |
| **Content** | Where printed copies are kept | The bytes the publication is about, such as a World's bricks. They're always kept on this device first; **Store on …** puts a copy on IPFS, Arweave or Steem so others can fetch it. See [Content Provider](10-NetworkSettings.md#content-provider). |
| **Snapshot** | A printed copy | One stored copy of a publication's content, such as a World's bricks, which others can fetch and check against its hash. See [Local Snapshot](#local-snapshot). |
| **Placement** | Where the copy is shelved | A signed record of where a build stands in the World. One Shared World can have several. See [Placing vs forking](03-WorldView.md#placing-vs-forking). |
| **Announcement / Discovery** | A library catalogue entry | A small signed notice on Nostr, Arweave or Steem saying the publication or Snapshot exists and where its copy is, so people who aren't connected to you can find it. See [Announcement / Discovery Provider](10-NetworkSettings.md#announcement--discovery-provider). |
| **Proof / Anchoring** *(Experimental)* | A notary's stamp | The content's hash written into a blockchain transaction (Bitcoin, Base, Arweave or Steem), as evidence it existed by that time. It stores and announces nothing. See [Evidence & Storage](11-EvidenceAndStorage.md). |
| **Commentary** | Readers' reviews | Comments anyone signed in can attach to a publication, each signed by its commenter, not the publisher. See [Commentary](#commentary). |

So you make a publication; then, if you like, store its content, announce
it, anchor it, and place it (for a Shared World); and anyone can comment on
it.

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

A card can also hold a **Shared World** — the same kind of object as a
Repository listing, wrapped for decentralized travel. **Share with Peers** in
the Repository creates one for your own Worlds (see
[Sharing with connected peers](04-PublishingAndForking.md#sharing-with-connected-peers)).
Once you resolve one here with **Re-check** or **Retrieve from Peers**, it
joins the Repository's search, its author's page and World View, and stays
after a reload.

## The Publications page

Open **Publications** in the top bar. It lists every signed publication this
device has cataloged, yours or a peer's. At the bottom, the folded **Wallet,
Archive & Publisher Tools** panel holds page-wide tools in three tabs:
**Blockchain Anchoring**, **Archive Tools** and **References &
Achievements** (see guides [11](11-EvidenceAndStorage.md) and
[12](12-ArchiveAndLeaderboards.md)). The link to it in the page's intro, and
in any step that needs a wallet observed first, opens it for you.

Each publication card shows:

- Its name, once its content has been checked: a Shared World's title or a
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

- **Distribution** — announce the publication, store its content and anchor
  it. Storing and anchoring each lead with one button for the provider you
  saved under **Configure** (**Store on IPFS**, **Anchor on Steem**), with
  every other provider folded under **Other … options**. Without a saved
  provider it can use, all the options show instead. Steem and remote IPFS
  pinning are marked **Experimental** wherever they're offered, and so is
  the whole **Proof / Anchoring** block. See
  [Distributing from the Publications page](#distributing-from-the-publications-page)
  and [Evidence & Storage](11-EvidenceAndStorage.md).
- **Details**, in four tabs:

| Tab | What's there |
|---|---|
| **Snapshot** | [Local Snapshot](#local-snapshot): what this device holds, and how to get it. |
| **Decentralization & Evidence** *(Exp.)* | [Decentralization](#decentralization-at-a-glance), the [evidence list](11-EvidenceAndStorage.md#the-evidence-list), and the Bitcoin and Base transaction steps. |
| **Placements & IPFS** *(Exp.)* | The [Snapshot Placements](11-EvidenceAndStorage.md#snapshot-placements) list and [IPFS Publishing](11-EvidenceAndStorage.md#ipfs-publishing). |
| **History** *(Exp.)* | **Show Cross-Domain Timeline**: every IPFS and Bitcoin observation for this publication, in time order. |

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

If one of these is **yours** (signed by an identity on this device) and
failed only because of its old hash, it's listed first with a **Yours**
badge. Instead of "its author needs to publish it again", it tells you how:

| Kind | How to publish it again |
|---|---|
| **Shared World** | Publish the World again from the Editor, then **Share with Peers** under it in the Repository (**Open Repository**). |
| **Blueprint Attribution** | In the Editor, open the structure's **Info** panel, **Re-sign for this design**, then **Publish to Network** (**Open Editor**). |
| **Place Naming Claim** | In World View, open the place's naming panel and **Publish A Name** again. |

For a World, the card goes one step further when this device still has its
own record of what you published: it's named for the World (**My Castle**
instead of **Shared World**) and **Open in Editor** opens that World, ready to
publish again. The name and the link come from your own record, never from
the old entry's content, which nobody can check. If the record is gone (you
unpublished that World since), the card shows **Open Repository** as above.

The new copy gets its own card; then remove the old one. The old one is
never accepted, even though it's yours: this device also stores content
it received from peers, so the old hash can't prove which bytes you
published.

**Remove from This Device** (or **Remove All *N* from This Device** at the
top of the group) asks you to confirm, then forgets the publication here.
It doesn't un-publish anything or reach anyone else, and a connected peer
that still has the publication may announce it again. Only publications in
this group can be removed.

### Distributing from the Publications page

**Distribution → Announcement / Discovery** has two cards:

- **Publication** announces the signed publication itself on the
  **Substrate** you choose (Arweave, Nostr, or Steem, which is
  Experimental). It starts on your
  [Announcement / Discovery Provider](10-NetworkSettings.md#announcement--discovery-provider).
- **Snapshot** stores content under **Content** and announces it on its
  own **Substrate**, which also starts on that provider. For a World, it's
  the World's own snapshot, announced with where its publisher placed it
  when this device holds that signed placement, as **Distribute** in World
  View does. For any other kind, it's the publication's content, announced
  by its hash alone. This device needs the bytes: for a World you haven't
  opened, open it in World View or get it from a peer first.

The result names the substrate it used, such as **Steem: Announced**, and
for a World says whether its publisher's placement went with it. **Not
announced** means only the announcement failed; the content was stored.

## Commentary

Any signed-in identity can comment on any publication that resolves: a
Repository creation, an authorship claim or a place name. There's no
ownership check, friendship requirement or moderation.

You'll find comments:

- in the **Repository** and on author pages: the **Comment** button on
  every card and list row;
- in World View's
  [My Shared World](03-WorldView.md#my-shared-world--distributing-your-own-snapshot-no-peers-required)
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
from World View's **My Shared World** or **World Encounters** are, for now,
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

*Experimental*, as are the **Summaries** below.

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

*Experimental.* On the **Decentralization & Evidence** tab, once a publication has an anchor
or a placement, **Decentralization** compares
[External Evidence](11-EvidenceAndStorage.md#external-evidence) and
[Snapshot Placements](11-EvidenceAndStorage.md#snapshot-placements):

- **Publication: known locally / not known locally** — whether this device
  has cataloged the signed publication.
- Two cards with how many claims of each kind are known, and whether they
  agree on the content hash (**Agreement**) or not (**Conflict**). If one
  agrees and the other conflicts, a sentence says so; agreement in one
  doesn't vouch for the other. With no claims of a kind yet, it reads
  **Nothing to compare yet** instead.
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
