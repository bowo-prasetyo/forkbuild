# 09 — Signed Records & External Evidence

<!-- languages -->
**English** · [Deutsch](de/09-PublicationsAndEvidence.md) · [Español](es/09-PublicationsAndEvidence.md) · [Français](fr/09-PublicationsAndEvidence.md) · [Bahasa Indonesia](id/09-PublicationsAndEvidence.md) · [日本語](ja/09-PublicationsAndEvidence.md) · [한국어](ko/09-PublicationsAndEvidence.md) · [Português (Brasil)](pt-BR/09-PublicationsAndEvidence.md)
<!-- /languages -->

> **Advanced.** You don't need this chapter to build, share, remix or walk
> around with friends: the [Play chapters](README.md#play-read-in-order) cover that. Read on
> when you want to know what runs underneath.

> **Partly experimental.** The Signed Records page is a regular feature: its
> list and statuses, removing records that can't be used, announcing on
> Nostr or Arweave, storing on IPFS or Arweave, anchoring on Arweave, and
> all four of a card's tabs: **Snapshot**, **Decentralization & Evidence**,
> **Placements & IPFS** and **History**. The rest is **Experimental**: it
> works, but may change or be removed in a later version, and what it
> produces may not carry over. The page marks each such part with an
> **Experimental** badge: every kind of anchoring but Arweave, the wallets
> and their Bitcoin and Base steps, Steem, Blurt, remote IPFS pinning, and
> the whole **Wallet & Archive Tools** panel. Guides
> [11](11-EvidenceAndStorage.md) and [12](12-ArchiveAndAchievements.md) say
> which of their sections are Experimental. Building, saving, publishing to
> Explore, remixing, identities and peers don't depend on any of it.

None of this is needed to use ForkBuild. Skip it if you just want to build,
publish and explore.

The **Signed Records** page is a more technical layer than Explore. Explore
is about builds and Worlds; the Signed Records page is about
**signed claims** such as "I designed this structure" or "I call this place
X", and about the optional depth you can add to a claim:

- **This guide** — where claims come from, the Signed Records page,
  [Commentary](#commentary), and [Local Snapshot](#local-snapshot) (what
  your device holds).
- **[Network Settings](10-NetworkSettings.md)** — gateways, relays,
  providers and peer-connection servers. Not experimental, and useful to
  everyone.
- **[Evidence & Storage](11-EvidenceAndStorage.md)** — external evidence
  (Bitcoin, Base, Arweave, Steem, Blurt), the wallet pipelines, Snapshot
  Placements, IPFS publishing, Steem and Blurt.
- **[Archive & Achievements](12-ArchiveAndAchievements.md)** — the durable
  observation archive, references and achievements.

## Two meanings of "publish"

| | **Publish** (Explore) | **Signed Records page** |
|---|---|---|
| What it shares | A build or World | A signed record: a Shared World, authorship of a structure, or a place name |
| Where you see it | Explore, your page (**My Builds**), World View | The **Signed Records** page |
| What you do with it | Open, explore, remix | Check it, fetch its content, distribute and anchor it |
| Guide | [Publishing & Remixing](04-PublishingAndForking.md) | This one |

**Publish** alone doesn't put a World on the Signed Records page. **Share
with Peers** does: it signs the World as a **Shared World** that can travel
to peers (see [A build from Explore, decentralized](#a-build-from-explore-decentralized)).
Everything you published is on your own page, **More → My Builds** (the
builds your name signed), and in Explore.

The Signed Records page has no **Open**, **Explore** or **Remix**, not even for
a Shared World. It shows the signed record, not the World. To open, explore
or remix a Shared World, find it in Explore, on its author's page or
in World View. One you received from a peer appears there once its content
is on this device. (The one exception is **Open in Editor** on your own
Shared World that needs publishing again; see
[Status meanings](#status-meanings).)

Every entry on the Signed Records page is a *record*, and each is one of
three kinds:

| Kind | What it is |
|---|---|
| **Shared World** | A published World, as a signed record that can travel between peers and networks |
| **Blueprint Attribution** | A claim that you designed a structure |
| **Place Naming Claim** | A name for a Region or Landmark |

World View, the Editor and Explore call a World's signed record a
**Shared World** too, as in **My Shared World**, **Discover Shared World**
and **Select Shared World**.

## What surrounds a record

A record is only the signed claim itself. Everything else you'll see on its
card, and around it in World View, is something done with it or attached
to it. None of these is a kind of record, and only the record
itself is required:

| Term | Like… | What it is |
|---|---|---|
| **Record** | The book itself | A signed record: a Shared World, a Blueprint Attribution or a Place Naming Claim. It carries the hash of its content and its publisher's signature. |
| **Content** | Where printed copies are kept | The bytes the record is about, such as a World's bricks. They're always kept on this device first; **Store on …** puts a copy on IPFS, Arweave, Steem or Blurt so others can fetch it. See [Content Provider](10-NetworkSettings.md#content-provider). |
| **Snapshot** | A printed copy | One stored copy of a record's content, such as a World's bricks, which others can fetch and check against its hash. See [Local Snapshot](#local-snapshot). |
| **Placement** | Where the copy is shelved | A signed record of where a build stands in the World. One Shared World can have several. See [Placing vs remixing](WorldViewAdvancedTools.md#placing-vs-remixing). |
| **Announcement / Discovery** | A library catalogue entry | A small signed notice on Nostr, Arweave, Steem or Blurt saying the record or Snapshot exists and where its copy is, so people who aren't connected to you can find it. See [Announcement / Discovery Provider](10-NetworkSettings.md#announcement--discovery-provider). |
| **Proof / Anchoring** *(Experimental, except on Arweave)* | A notary's stamp | The content's hash written into a blockchain transaction (Bitcoin, Base, Arweave, Steem or Blurt), as evidence it existed by that time. It stores and announces nothing. See [Evidence & Storage](11-EvidenceAndStorage.md). |
| **Commentary** | Readers' reviews | Comments anyone with a name can attach to a record, each signed by its commenter, not the publisher. See [Commentary](#commentary). |

So you make a record; then, if you like, store its content, announce
it, anchor it, and place it (for a Shared World); and anyone can comment on
it.

## Where a record comes from

You never create a claim on the Signed Records page itself. It lists claims
you made elsewhere, ones peers sent you, and builds from Explore that
arrived in decentralized form. Place-name claims can also be found straight
from Nostr, with no peer involved; see
[Nearby Place Names](WorldViewAdvancedTools.md#nearby-place-names--discovering-claims-from-anyone).

### Claiming authorship of a structure

Open a structure's **Info** panel from **My Structures** in the Editor's
Build Library. If it has a Blueprint identity (most saved structures do),
its **Community Attribution** section offers:

- **Claim authorship** — signs a claim, with your current identity, that
  you designed it. Shown until you've claimed it.
- **Export Attribution** — saves your claim as a file you can hand to
  someone.
- **Publish to Network** — announces your claim to every peer you're
  connected to, which puts it on their Signed Records page, and on yours.

Once it's published, the panel offers to **Distribute** it, so people who
aren't connected to you can find it too. **Distribute** opens the same
dialog the Editor offers after you publish a World, with only the Signed
Claim half (an authorship claim has no Snapshot): choose where its content
is stored and where it's announced, then **Distribute Signed Claim**.
**Not now** hides the offer; you can still distribute the claim later from
its card on the Signed Records page (see
[Distribution](Distribution.md)).

### Naming a place

In World View, open the naming panel for a Region or Landmark and use
**Publish A Name** (see [Geographic places](03-WorldView.md#geographic-places)).
This announces a signed claim to your connected peers.

Right after you publish, the panel offers to **Distribute** the name, so
people who aren't connected to you can find it too, for example through
[Nearby Place Names](WorldViewAdvancedTools.md#nearby-place-names--discovering-claims-from-anyone).
Pick the **Network** (Arweave, Blurt, Nostr or Steem; it starts on your
[Announcement / Discovery Provider](10-NetworkSettings.md#announcement--discovery-provider))
and click **Distribute**, or **Not now** to skip it. You can distribute any
claim later too: open the naming panel's **More** and click **Distribute**
beside it under **All Claims**. Publishing and distributing stay separate
steps: neither does the other. A success says which network the name was
announced on; a failure shows why, most often a missing Nostr browser
extension or a network that isn't set up on this device.

### Receiving one from a peer

When you connect to a peer (see
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)), your device
receives everything they've published, not only what they publish while
you're connected. A received claim is only a validly signed record: its
content isn't on your device until you fetch it with **Retrieve from Peers**
(below).

### A build from Explore, decentralized

A card can also hold a **Shared World** — the same kind of object as a
listing in Explore, wrapped for decentralized travel. **Share with Peers** in
Explore creates one for your own Worlds (see
[Sharing with connected peers](04-PublishingAndForking.md#sharing-with-connected-peers)).
Once you resolve one here with **Re-check** or **Retrieve from Peers**, it
joins Explore's search, its author's page and World View, and stays
after a reload.

## The Signed Records page

Open **Signed Records** (**More → Advanced**). It lists every signed record this
device has cataloged, yours or a peer's. At the bottom, the folded **Wallet
& Archive Tools** panel holds page-wide tools in three tabs:
**Blockchain Anchoring**, **Archive Tools** and **References &
Achievements** (see guides [11](11-EvidenceAndStorage.md) and
[12](12-ArchiveAndAchievements.md)). The link to it in the page's intro, and
in any step that needs a wallet observed first, opens it for you.

The panel is listed only while **Show experimental tools** is on in
[Network Settings](10-NetworkSettings.md#show-experimental-tools); until then, the intro links to Network Settings
instead. A step that needs a wallet observed first still opens the panel
for that visit.

Each record card shows:

- Its name, once its content has been checked: a Shared World's title or a
  place name. Otherwise, or for an authorship claim, the kind of
  record.
- The kind of record (under the name, when there is one) and who
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

- **Distribution** — announce the record, store its content and anchor
  it. Storing and anchoring each lead with one button for the provider you
  saved under **Configure** (**Store on IPFS**, **Anchor on Steem**), with
  every other provider folded under **Other … options**. Without a saved
  provider it can use, all the options show instead. Steem, Blurt and remote IPFS
  pinning are marked **Experimental** wherever they're offered, and so is
  every kind of anchoring but Arweave. See
  [Distributing from the Signed Records page](#distributing-from-the-signed-records-page)
  and [Evidence & Storage](11-EvidenceAndStorage.md).
- **Details**, in four tabs:

| Tab | What's there |
|---|---|
| **Snapshot** | [Local Snapshot](#local-snapshot): what this device holds, and how to get it. |
| **Decentralization & Evidence** | [Decentralization](#decentralization-at-a-glance), the [evidence list](11-EvidenceAndStorage.md#the-evidence-list), and the Bitcoin and Base transaction steps (Experimental). |
| **Placements & IPFS** | The [Snapshot Placements](11-EvidenceAndStorage.md#snapshot-placements) list and [IPFS Publishing](11-EvidenceAndStorage.md#ipfs-publishing) (Experimental). |
| **History** | **Show Cross-Domain Timeline**: every IPFS, Bitcoin and Base observation this device recorded for this record, in time order, from the [Observation Archive](12-ArchiveAndAchievements.md#the-record-observation-archive), so it's kept across visits; or a note that nothing is recorded yet. |

### Status meanings

| Badge | Meaning |
|---|---|
| **Available** | The content is on this device now. |
| **Content unavailable** | The claim is genuine, but the content isn't here yet. Try **Retrieve from Peers**. |
| **Invalid record envelope** / **Invalid record signature** | The record is malformed, or wasn't genuinely signed. |
| **Content does not match its own reference** / **Invalid content** / **Invalid content signature** | The content doesn't match what the record claims. |
| **Failed a domain-specific check** | Well-formed and signed, but fails a check specific to its kind. |
| **Unsupported record kind** | This version can't display this kind of record. |

These describe whether the record checks out, not whether the design or name
is any good.

A record whose status is anything but **Available** or **Content
unavailable** can't be opened, distributed or anchored, so it isn't given a
full card. These are gathered at the bottom of the page in a folded group,
"*N* records that can't be used", each with its status, the reason,
**Re-check** and **Remove from This Device**. They're left out of **Anchor
Several Records** too. The most common reason is a record made
before content hashes became SHA-256: only its author can fix that, by
publishing it again.

If one of these is **yours** (signed by an identity on this device) and
failed only because of its old hash, it's listed first with a **Yours**
badge. Instead of "its author needs to publish it again", it tells you how:

| Kind | How to publish it again |
|---|---|
| **Shared World** | Publish the World again from the Editor, then **Share with Peers** under it in Explore (**Open Explore**). |
| **Blueprint Attribution** | In the Editor, open the structure's **Info** panel, **Re-sign for this design**, then **Publish to Network** (**Open Editor**). |
| **Place Naming Claim** | In World View, open the place's naming panel and **Publish A Name** again. |

For a World, the card goes one step further when this device still has its
own record of what you published: it's named for the World (**My Castle**
instead of **Shared World**) and **Open in Editor** opens that World, ready to
publish again. The name and the link come from your own record, never from
the old entry's content, which nobody can check. If the record is gone (you
unpublished that World since), the card shows **Open Explore** as above.

The new copy gets its own card; then remove the old one. The old one is
never accepted, even though it's yours: this device also stores content
it received from peers, so the old hash can't prove which bytes you
published.

**Remove from This Device** (or **Remove All *N* from This Device** at the
top of the group) asks you to confirm, then forgets the record here.
It doesn't un-publish anything or reach anyone else, and a connected peer
that still has the record may announce it again. Only records in
this group can be removed.

Removing a record never touches your builds. The build behind a Shared World
stays in the Editor, in Explore and on your page (**More → My Builds**); only
this device's copy of the signed record goes. To share such a build with peers
again, open it, **Publish** it and **Share with Peers**: that makes a new record.

### Distributing from the Signed Records page

**Distribution → Announcement / Discovery** has two cards:

- **Record** announces the signed record itself on the
  **Substrate** you choose (Arweave, Nostr, or Steem or Blurt, which are
  Experimental). It starts on your
  [Announcement / Discovery Provider](10-NetworkSettings.md#announcement--discovery-provider).
- **Snapshot** stores content under **Content** and announces it on its
  own **Substrate**, which also starts on that provider. For a World, it's
  the World's own snapshot, announced with where its publisher placed it
  when this device holds that signed placement, as **Distribute** in World
  View does. For any other kind, it's the record's content, announced
  by its hash alone. This device needs the bytes: for a World you haven't
  opened, open it in World View or get it from a peer first.

The result names the substrate it used, such as **Steem: Announced**, and
for a World says whether its publisher's placement went with it. **Not
announced** means only the announcement failed; the content was stored.

## Commentary

Anyone with a name can comment on any record that resolves: a
build from Explore, an authorship claim or a place name. There's no
ownership check, friendship requirement or moderation.

You'll find comments:

- in **Explore** and on author pages: the **Comment** button on
  every card and list row;
- in World View's
  [My Shared World](WorldViewAdvancedTools.md#my-shared-world--distributing-your-own-snapshot-no-peers-required)
  panel, in its **Commentary** section;
- on a selected **World Encounter**: its **Comment** button.

Each shows the comments, oldest first, with each author's identity. With a
name chosen, you get a text box and **Post Comment**; otherwise, a note
asking you to choose a name.

Comments are permanent: no editing, deleting or replies.

### How comments travel

A comment posted from **Explore** is saved on your device, sent to
peers you're connected to, and published to the network chosen next to
**Post Comment** (Nostr, Arweave, Steem or Blurt; it starts on your
[Announcement / Discovery Provider](10-NetworkSettings.md#announcement--discovery-provider)),
so people who weren't connected can find it. Closing the section (**Hide
Comments**) discards anything you'd typed but not posted. Comments posted
from World View's **My Shared World** or **World Encounters** travel the
same way, with the same network choice beside **Post Comment**.

To keep a comment off every network, choose **Local & peers only** instead.
It's saved on your device and sent only to the peers connected right now, so
it needs no network account. Anyone not connected when you post won't
receive it, and nobody can find it on a network later.
To start every comment form on it, choose it under **Comments** on the
[Announcement / Discovery
Provider](10-NetworkSettings.md#announcement--discovery-provider) page.

Made a network account since, or want a comment on another network too?
Under each of your own comments, a line says which networks this device has
sent it to, or *Not sent to any network from this device yet*.
**Distribute** there sends it to the network you pick and says whether it
worked; a network it already went to is marked and can't be sent to again.
Only the comment's author, using that name, sees it, since only they can sign the
comment for a network, and the line knows only what this device sent.

Other people's comments reach you:

- from connected peers, as they're posted;
- from the networks, when you open a record's comments and whenever
  you click **Check for new comments**. This is how you see comments posted
  while you were offline.

The line beside the button reports the last check, such as *Found 2 new
comments* or *No new comments found* (which only covers the networks that
answered). An unreachable network is named (*Arweave unavailable*); if none
answers, you see *Couldn't reach Nostr or Arweave — showing comments stored
on this device*. Only records whose comments you open are checked.
Every fetched comment's signature is checked, and none is counted twice.

When someone comments on a record you published, a **New comment on
your build** entry appears in your
[Notification History](03-WorldView.md#orientation-and-locations) (the 🔔
button in the header).

## Local Snapshot

On a card's **Snapshot** tab, **Local Snapshot** answers one question: does
this device hold the bytes for this record's content right now? It
doesn't check signatures or placements, and it contacts the network only
when you click one of the retrieval actions.

### Checking what you have

**Check Local Snapshot** (then **Check Again**):

| Badge | Meaning |
|---|---|
| **Available** | The bytes are here and match the content hash. |
| **Not available** | Nothing has ever been stored under this hash. |
| **Hash mismatch** | Something is stored under this hash, but it no longer matches. |

Two people with the same record can get different answers, because
their storage differs. After a check, a line reads *Record: known
locally / not known locally · Snapshot: available / not available*: whether
this device has cataloged the signed record, and whether it holds valid
bytes.

If the check finds no valid bytes, a hint points to the ways to bring them
in, below. Nothing retries by itself.

### Bringing the bytes in

Three actions, each its own click:

**Import Snapshot** — shows a file picker and paste box for a **Publication
Snapshot Transfer Package** (a JSON bundle of one record's content).
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

### Which peers have it?

**Which peers have it?** asks your connected peers whether they hold the
bytes, without fetching them. Every connected peer is listed, ticked; untick
any you don't want to ask, then click **Ask Selected Peers** (then **Ask
Selected Peers Again**). Each peer's latest answer is shown with when it
came, plus totals: **Available**, **Not available**, or **Could not
determine** (no answer in time). An answer is what that peer said at that
moment, not a promise.

A peer that answered **Available** gets its own **Get Snapshot from
*peer*** button. It asks that peer alone for the bytes and checks them, as
**Get Snapshot from Peer** does; nothing is ever fetched from anyone else
for you. **Show Answers from This Visit** lists every answer, one row each
(such as `20:21:04 — Alice → Available`); click a row for the full report,
record and content hash. A row is never rewritten.

### Attempts this visit

Once you've tried to bring the bytes in, **Attempts this visit** counts
this visit's attempts by outcome and by source. An attempt that stored the
bytes doesn't mean they're still here; **Check Local Snapshot** says that.
**Show Acquisition History** lists each attempt (such as
`20:16 — Peer → Hash mismatch`); click one for its outcome, record and
content hash.

## Decentralization at a glance

On the **Decentralization & Evidence** tab, once a record has an anchor
or a placement, **Decentralization** compares
[External Evidence](11-EvidenceAndStorage.md#external-evidence) and
[Snapshot Placements](11-EvidenceAndStorage.md#snapshot-placements):

- **Record: known locally / not known locally** — whether this device
  has cataloged the signed record.
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
| **Bitcoin/Base Anchor Records** records, made at finalization | The wallet pipelines' connection, funding or account observation, plan, review, signature, finalized transaction, broadcast result and on-screen confirmation or inclusion history |
| The **Record Observation Archive** (every IPFS publish and verification, Bitcoin broadcast, confirmation and content proof, and Base inclusion), until **Clear Archive** | — |
| Record References | Which cards and rows you had open |

After a reload, a pipeline's or IPFS publish's results are still visible in
the [Observation Archive](12-ArchiveAndAchievements.md#the-record-observation-archive),
a record's lifecycle, or (for Bitcoin) Historical Bitcoin Anchor Evidence.
Reconnect the wallet, or reconfigure the pinning provider, to continue.

## What's next?

Sharing your builds still happens in
[Publishing & Remixing](04-PublishingAndForking.md). To go further here,
continue with [Evidence & Storage](11-EvidenceAndStorage.md).
