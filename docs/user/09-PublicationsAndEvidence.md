# 09 — Publications & External Evidence

This guide covers the **Publications** page — a different, more technical
layer than the Repository you already know from
[Publishing & Forking](04-PublishingAndForking.md). Where the Repository is
about *Documents and Worlds*, Publications is about **signed claims**: "I
authored this structure" or "I'm calling this place X" — and, once you have
one, two independent kinds of optional depth you can attach to it:
**external evidence** that the claim was recorded somewhere independent of
ForkBuild, like a Bitcoin transaction that timestamps it; and **snapshot
placements** that name where the claim's own content can currently be
retrieved from, like an IPFS node. Neither one is required by the other,
and neither is required to use the rest of ForkBuild.

None of this is required to use ForkBuild. Skip this guide entirely if you
just want to build, publish Documents, and explore — everything in
[The Editor](02-TheEditor.md), [World View](03-WorldView.md), and
[Publishing & Forking](04-PublishingAndForking.md) works exactly the same
without ever visiting this page.

## Two different meanings of "publish"

It's easy to confuse these, so here's the short version:

| | **Publish** (Repository) | **Publications page** |
|---|---|---|
| What it shares | A Document/World snapshot | A signed *claim* — authorship of a structure, or a place name |
| Where you see it | Repository, Author view, World View | The **Publications** page (top bar) |
| Chapter | [Publishing & Forking](04-PublishingAndForking.md) | This one |

A Document you publish through the ordinary **Publish** button never shows up
on the Publications page, and nothing on the Publications page is a Document
you can open or fork. They're independent systems that happen to share a
word.

## Where a publication comes from

You never create a publication directly from the Publications page itself —
it's a read-only catalog of claims that reached this device some other way.
There are two kinds today:

### Claiming authorship of a structure

Open a structure's **Info** panel from **My Structures** in the Editor's
Build Library. If it has a Blueprint identity (most saved structures do),
you'll see a **Community Attribution** section with:

- **Claim authorship** — signs a claim, under your current identity, that
  you authored this design. Shown only once, before you've claimed it.
- **Export Attribution** — saves your claim as a file you can hand to
  someone directly.
- **Publish to Network** — announces your claim to every peer you're
  currently connected to. This is what makes it show up on *their*
  Publications page, and (once you've published it) on your own.

### Naming a place

Open the naming panel for a Region or Landmark in World View and use
**Publish A Name** — see
[Geographic places](03-WorldView.md#geographic-places). Publishing a name
works the same way: it announces a signed claim to your connected peers.

### Receiving one from a peer

You don't have to publish anything yourself to see entries here. The moment
you're connected to a peer (see
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)), anything
*they* publish while you're connected reaches your device automatically and
appears on your own Publications page. Cataloging a publication only ever
means your device has **seen a validly signed claim** — never that whatever
it points to is sitting on your device right now, which is exactly what the
page's status badge tells you.

## The Publications page

Open **Publications** in the top bar.

```
Publications

Every signed publication this device has cataloged — its own, or one a
connected peer announced. Status is always checked fresh, never remembered
from last time.

┌───────────────────────────────────────────────┐
│  Blueprint Attribution          [Available]    │
│  Published by …a1b2c3d4e5f6a7 · received       │
│  8/20/2026, 4:12:09 PM                         │
│  Blueprint attribution — fp:9f8e…, claimed by  │
│  …a1b2c3d4e5f6a7                               │
│  Available locally. The content matching this  │
│  publication's cryptographic hash is stored    │
│  on this device.                               │
│  [Re-check]                                    │
│                                                 │
│  External Evidence                             │
│  No external evidence known                    │
│  [Discover from Peers]                         │
│                                                 │
│  Snapshot Placements                           │
│  No snapshot placements known                  │
└───────────────────────────────────────────────┘
```

Below **External Evidence**, every card also has its own **Snapshot
Placements** section — a third, independent question neither the status
badge above nor External Evidence answers. See
[Snapshot Placements](#snapshot-placements) below.

Each card shows:

- The kind of publication and who published it (the `…lastNchars` shortened
  form you'll see throughout the app).
- A **status badge**: **Available**, **Content unavailable**, or a more
  specific rejection like **Invalid publication signature** — see
  [Status meanings](#status-meanings) below. It's re-derived every time the
  page loads or you click **Re-check**; nothing here is remembered from a
  previous visit.
- A one-line summary of what was claimed (an attribution's fingerprint and
  claimant, or a place name and claimant).
- **Retrieve from Peers**, shown whenever the content is currently
  unavailable (disabled until you have at least one connected peer) —
  asks every connected peer, in order, for the actual bytes. Bytes handed
  over by a peer are only ever accepted after your device independently
  recomputes their hash and confirms it matches — never because of who
  the peer happened to be.
- **Re-check** — re-derives the status from scratch, right now.

### Status meanings

| Badge | Meaning |
|---|---|
| **Available** | The content this publication points to is on this device right now. |
| **Content unavailable** | The claim itself is genuine, but the actual content isn't here yet — try **Retrieve from Peers**. |
| **Invalid publication envelope** / **Invalid publication signature** | The publication record itself is malformed, or wasn't genuinely signed. |
| **Content does not match its own reference** / **Invalid content** / **Invalid content signature** | The bytes retrieved don't match what the publication claims. |
| **Failed a domain-specific check** | The content is well-formed and signed, but fails a check specific to its kind. |
| **Unsupported publication kind** | This device doesn't yet know how to display this kind of publication. |

None of these is a claim about whether the underlying *design or name is
good* — only about whether the signed record and its content check out
mechanically.

## External Evidence

Every publication card has its own **External Evidence** section — a place
to attach and inspect independent evidence that a claim existed at a
particular time, entirely separate from whether the claim itself is
available or well-formed.

> **Evidence is not verification, and known is not verified.** A piece of
> evidence appearing here means only that your device holds a genuinely
> signed record saying "this was externally recorded." Whether that
> recording actually happened is a separate question you answer explicitly,
> below, with **Verify Evidence** — never assumed just because an anchor is
> listed.

### Creating evidence

If this device has an evidence publisher configured, you'll see a card per
type it can create (today, that's Bitcoin — labeled **Bitcoin Op Return**,
the specific technique used to write a hash into a Bitcoin transaction):

- **Create Bitcoin Op Return Anchor** records a claim that this
  publication's content hash was written into a real Bitcoin transaction.
  Clicking it always produces one of three honest outcomes:
  - **Anchor created** — the recording succeeded, and the new anchor
    immediately appears below, unverified.
  - **Recording rejected** — the external system was reached and refused.
  - **No anchor was created** — the external system couldn't currently be
    reached (or nothing on this device is configured to publish to it yet
    — this build ships no real Bitcoin wallet, so you'll always see this
    outcome unless one has been connected).
- Clicking again after a success offers **Create Another Bitcoin Op Return
  Anchor** — a second, fully independent anchor, never a replacement for
  the first.

Creating evidence never verifies it. A freshly created anchor shows up in
the list below exactly like any other, "Not yet verified," until you check
it yourself.

### Discover from Peers

```
External Evidence

3 anchors known                              [Show Evidence]

[Discover from Peers]   2 new evidence claims discovered from peers.
```

Ordinary peer connections only ever gossip evidence created or re-announced
*while you're connected* — if a peer signed an anchor a week before you two
ever connected, you'll never hear about it just by being connected now.
**Discover from Peers** closes that gap: click it, and your device asks
every peer you're currently connected to, one at a time, "what evidence do
you know about for this publication?" — including anything they learned
about historically, from someone else entirely.

This is always something you trigger yourself. Opening the Publications
page, or expanding **Show Evidence**, never contacts a peer on its own — the
only thing that ever does is this button.

What you'll see afterward, right under the button:

| Message | Meaning |
|---|---|
| *N new evidence claims discovered from peers.* | Peers answered, and you now know about anchors you didn't before. They're already in the list below. |
| *No new evidence claims discovered from peers.* | Peers answered, but had nothing you didn't already have. **This is not the same as "no evidence exists"** — it only describes what these specific peers, right now, had to offer. |
| *No authenticated peer was available to ask.* | There was nobody currently connected to ask. Connect to a peer first (see [Peer Connections & Friends](07-PeerConnectionsAndFriends.md)) and try again. |
| *The requested peer discovery operation could not complete.* | Something went wrong locally before any peer could even be asked. |

Discovering evidence never verifies it, either — it works exactly like
receiving evidence any other way: a discovered anchor lands in the list
below "Not yet verified," and your own past verification results for
anchors you already knew about are completely unaffected. Discovering the
same anchor a second time (from the same peer or a different one) never
creates a duplicate.

### The evidence list

Click **Show Evidence** to see every anchor known for this publication.
Several independent anchors — even ones that disagree — are always shown
side by side; nothing here ever picks a "winner."

If more than one anchor is known, a **Content binding** summary appears
first:

```
Content binding

  a1b2c3d4e6…f9a0  2 anchors      b3c4d5e6f7…a1b2  1 anchor

  ⚠ Evidence claims disagree about the content hash — 2 different
    content hashes are each claimed by at least one anchor.
```

The warning appears only when known anchors genuinely disagree about which
content hash this publication corresponds to. It's a heads-up, never a
verdict about which claim is correct.

Each anchor's own card shows:

| Field | Meaning |
|---|---|
| **Locator** | Where the external system says to find this recording. |
| **Recorded** | The claimed recording time — *claimed*, because nobody has re-checked it yet unless you click Verify. |
| **Publication / Content hash** | Exactly what this anchor's signature binds together. |
| **Attested by** | The identity that signed this anchor. |

And two buttons:

- **Verify Evidence** (or **Verify Again**) — the one thing that actually
  reaches out to the external system this anchor names, right now, and
  tells you what it currently finds. See
  [Verification outcomes](#verification-outcomes) below.
- **Inspect Evidence** — opens the raw claim: the exact recording time
  claimed, the external locator, and (for a recognized type like Bitcoin) a
  followable link to a block explorer plus the raw proof data. Purely a
  local read of what's already on your device — it never touches the
  network and never changes what **Verify Evidence** would later find.

  A separate **Local Knowledge** section, at the bottom, answers a
  different question — not "what does this evidence claim," but "how did
  *this device* come to know about it":

  | Field | Meaning |
  |---|---|
  | **Acquisition** | *Learned locally* (you created it), *Learned via package import* (it arrived bundled in a package you imported), or *Learned via peer exchange* (a peer sent or synchronized it to you). |
  | **First seen by this replica** | When this device first learned the claim — never reset by learning it again some other way later. |

  This is bookkeeping about your own device's history, nothing more. It
  never names *which* peer, and it's never a hint about which evidence to
  trust more — see [Verification outcomes](#verification-outcomes) below
  for the only thing that actually speaks to whether a claim holds up.

### Verification outcomes

| Label | Meaning |
|---|---|
| **Independently verified** | The external system was reached and confirms exactly what was claimed. |
| **Proof not independently verified** | Genuinely signed evidence, but this device has no way to check the external system for this anchor's type. |
| **Verification unavailable** | The external system couldn't currently be reached — not the same as invalid. |
| **Invalid evidence** / **Invalid signature** | The record itself is malformed or wasn't genuinely signed. |
| **Content mismatch** | This anchor's claim doesn't match the publication you're looking at. |
| **Invalid external proof** | The external system was reached, and it says the claim is false. |

If an anchor was **Independently verified** earlier in this visit but a
later check comes back **Verification unavailable**, you'll see one extra
line: *"This evidence was independently verified earlier; verification is
currently unavailable."* It's never downgraded to "invalid" — an external
system being temporarily unreachable doesn't erase what you already
confirmed.

> **Verifying is always your own choice, every time.** Nothing on this page
> ever checks external evidence automatically — not on load, not when new
> evidence is discovered, not when you expand the list. You decide, per
> anchor, when it's worth the round trip.

## Snapshot Placements

Every publication card also has its own **Snapshot Placements** section —
a third question, independent of both the status badge at the top of the
card and External Evidence above it:

| Question | Where it's answered |
|---|---|
| Does *this device* have the bytes right now? | The card's own status badge |
| Was this claim recorded by an outside system, at some point? | **External Evidence** |
| Where else, right now, can the bytes be fetched from? | **Snapshot Placements** |

A **snapshot placement** is a signed claim, made by whoever created it,
that a specific storage backend — today, **IPFS** or this device's own
**Local** storage — can presently serve the bytes for this publication's
content hash. It's not a copy of the claim itself, not a guarantee the
backend will still have the bytes tomorrow, and not a ranking of one
backend over another: several independent placements, on different
backends, from different people, coexist side by side, and none is ever
preferred.

> **A placement is a locator, not evidence of history.** A Bitcoin anchor
> recording a hash proves nothing about whether the bytes can still be
> fetched anywhere; a storage backend serving the bytes proves nothing
> about when the claim was first made. The two answer genuinely different
> questions, on purpose — see [External Evidence](#external-evidence)
> above for the first.

### Creating a placement

If this device has at least one storage backend configured — this build
always ships **Local** (this device's own storage) and **IPFS** (a real
IPFS node's HTTP API, expected at `http://127.0.0.1:5001`) — you'll see a
card per backend:

- **Create Local Placement** / **Create Ipfs Placement** — takes the bytes
  this device already holds for this publication and hands them to that
  backend. Clicking it always produces one of two honest outcomes:
  - **Placement created** — the backend accepted the bytes, and a new
    signed placement immediately appears in the list below.
  - **No placement was created** — the backend couldn't currently be
    reached (for **IPFS**, this is what you'll see unless a real IPFS node
    is actually running and reachable at that address), or this device
    has no local content for this publication to place at all.
- Clicking again after a success offers **Create Another … Placement** — a
  second, fully independent placement, never a replacement for the first.

The strongest thing this ever tells you is *"a snapshot placement was
recorded for `<storage>`."* Never "decentralized," "permanent," or
"available everywhere" — a created placement only means a storage backend
accepted these bytes just now.

### The Snapshot Placements list

```
Snapshot Placements

3 placements known                              [Show Placements]
```

Click **Show Placements** to see every placement known for this
publication — one you created, one a connected peer sent you, or one that
arrived bundled inside an imported Blueprint Package (see
[The Editor](02-TheEditor.md#structures-composing-forking-and-your-personal-library)
for exporting/importing blueprints). Each card shows:

| Field | Meaning |
|---|---|
| **Locator** | Where the storage backend says to find the bytes — an opaque string this app never tries to parse or improve on. |
| **Placed** | The *claimed* placement time — claimed, because nobody has resolved it yet unless you ask. |
| **Publication** / **Content hash** | Exactly what this placement's signature binds together. |
| **Placed by** | The identity that signed this placement. |

And two buttons, kept deliberately separate:

- **Inspect Placement** — a purely local read of the placement's own
  claimed fields, plus, for a recognized backend like IPFS, a followable
  gateway link. Never touches the network, never checks whether the bytes
  are actually still there.
- **Resolve Snapshot** (or **Resolve Again**) — the one action that
  actually reaches out to the named storage backend, right now, and
  reports what it currently finds.

### Resolution outcomes

| Badge | Meaning |
|---|---|
| **Content available** | The backend was reached and served bytes that match this placement's content hash. |
| **No storage backend configured** | This device has no backend registered for this placement's storage type. |
| **Content unavailable** | The backend was reached, but it doesn't currently have the bytes. |
| **Retrieved content does not match this placement** | The backend answered, but with the wrong bytes — a definite finding, not a maybe. |
| **Invalid placement** / **Invalid signature** | The placement record itself is malformed, or wasn't genuinely signed. |

Resolving a placement never rewrites the placement itself, and the result
is never shared with anyone or written back to the catalog — it lives only
on this page, for as long as it stays open. Two different people can hold
the byte-identical, identically signed placement and get two entirely
different, entirely honest resolution outcomes (say, because only one of
them has an IPFS node running) — neither one is wrong.

### Local Knowledge

Expand **Inspect Placement** and, below the placement's own claimed
fields, you may see a separate **Local Knowledge** section — not "what
does this placement claim," but "how did *this device* come to know about
it":

| Field | Meaning |
|---|---|
| **Acquisition** | *Learned locally* (you created it), *Learned via package import* (it arrived bundled in a package you imported), or *Learned via peer exchange* (a connected peer sent it to you). |
| **First seen by this replica** | When this device first learned the claim — never reset by learning it again some other way later. |

Just like the equivalent section for external evidence, this is
bookkeeping about your own device's history, nothing more — never a
peer's name, never a hint about which placement to trust more.

### Placement relationships

When more than one placement is known and the list is expanded, a
**Placement relationships** card appears above the per-placement list:

```
Placement relationships

3 known placements · 2 storage backends · 3 distinct locations

  a1b2c3d4e6…f9a0  2 placements      b3c4d5e6f7…a1b2  1 placement

Content binding: AGREEMENT
```

It summarizes how the whole known set relates to *itself* — how many
distinct storage backends and physical locations are represented, and
whether every placement agrees on the content hash (**AGREEMENT**) or not
(**CONFLICT**, shown with a warning). Exactly like **Content binding** for
external evidence, a bigger group is never styled, ordered, or worded as
more likely correct — and unlike that comparison, this one is never
affected by whether you've actually resolved any of the placements; it's
derived purely from the claims themselves, every time.

## What survives a reload

Evidence you've cataloged — your own, a peer's, or something you
discovered — is stored on this device and is still there after you close
the tab and come back, exactly like everything else this app saves locally.
So does each anchor's **Local Knowledge** (see above) — how and when your
device first learned it stays exactly as it was the first time, even if the
identical evidence later reaches you a second way. **Verification results
are not** — they're only ever known for the current visit. Reload the page and every anchor you'd checked goes back to "Not yet
verified" until you check it again; nothing about that is a bug; it simply
reflects that "was this true a moment ago" and "is this device holding a
genuine claim" are two different facts, and only the second one is worth
keeping around.

**Snapshot Placements follow the identical rule.** A cataloged placement
and its own **Local Knowledge** are stored on this device and survive a
reload exactly like evidence does. **Resolution results do not** — every
placement you'd resolved goes back to "Not yet resolved" until you click
**Resolve Snapshot** again, for the same reason a verification result
resets: "was this retrievable a moment ago" and "is this device holding a
genuine claim" are two different facts, and only the second is worth
keeping around.

## What's next?

Publications, their evidence, and their snapshot placements are entirely
optional depth on top of everything else ForkBuild does. If you came here
from [Publishing & Forking](04-PublishingAndForking.md), that's still
where sharing your actual builds happens — head back there, or to
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md) to connect
with more people whose publications, evidence, and placements you might
want to see.
