# 04 — Publishing & Forking

<!-- languages -->
**English** · [Deutsch](de/04-PublishingAndForking.md) · [Español](es/04-PublishingAndForking.md) · [Français](fr/04-PublishingAndForking.md) · [Bahasa Indonesia](id/04-PublishingAndForking.md) · [日本語](ja/04-PublishingAndForking.md) · [한국어](ko/04-PublishingAndForking.md) · [Português (Brasil)](pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

This is the heart of ForkBuild. **Publishing** shares your creation with the
world. **Forking** lets anyone copy a creation and evolve it — with the whole
history preserved.

## Publishing your creation

1. Build something in the Editor.
2. Log in and make sure your identity is unlocked (see
   [Identity & Login](05-IdentityAndLogin.md)). Publishing signs the
   creation with it; published while logged out, it has no author.
3. Give it a title — Publish refuses an untitled or empty creation — and,
   optionally, a description and a license: click **✎** beside the
   document title in the sidebar to open **Document Properties**. A new
   document has no license, so nobody can fork it until you pick one.
4. Press **Save** so it's stored.
5. Click **Publish**.

Your creation now appears in **your own Repository** on this device, where
you can search for it, open it, and fork it, with your name as the author.
Other people see it only once you share or distribute it (see the note
below). It's also automatically given a position in the shared world, so
**Explore** always has somewhere to take people — see
[Finding worlds](03-WorldView.md#finding-worlds).

> **Note:** Publishing stores your Document/World on this device only. Its
> Repository card says where this device recorded distributing it (for
> example **Stored on IPFS · Announced on Nostr**), or **No distribution
> recorded on this device**. Back it up on [Your Data](13-YourData.md) to
> keep a copy in the meantime.
> Publishing never sends anything anywhere by itself. Two separate, optional
> steps do: **Distribute**, described next, pushes the publication to
> Arweave or IPFS and announces it on Nostr or Arweave so other people can
> find it without being connected to you; and
> [**Share with Peers**](#sharing-with-connected-peers) offers it to the
> people you are connected to.

## Distributing straight from the Editor

The moment **Publish** succeeds, the Editor shows a small notice right
there — "Shared World published successfully." — with a **Distribute**
button beside it, and a **Dismiss** to make it go away without doing
anything. Clicking **Distribute** opens a **Distribute** dialog rather
than cluttering the overlay with pickers and results you only need once
in a while; closing it again (**Close**, clicking outside it, or Escape)
never loses anything it produced — reopening it shows the exact same
result, error, or in-flight state you left it in.

The dialog is the same one World View uses — its **Storage** and
**Announcement / Discovery substrate** settings, the combined
**Distribute** button, and the separate **Distribute Snapshot only** /
**Distribute Signed Claim only** buttons all work as described in
[World Encounters](03-WorldView.md#world-encounters--publications-and-avatars-your-peers-are-sharing).
Two things differ here: it always acts on the exact Shared World your
Publish click just produced, and the **Snapshot** section comes first,
so the combined button runs the Snapshot first, then the Signed Claim.

The Signed Claim's result appears in its own section:

| Field | Meaning |
|---|---|
| **Shared World** | The Shared World's own id — confirms which Shared World this result is about. |
| **Material** | The location the upload produced, or "Not yet uploaded" if it didn't complete. |
| **Discovery** | The announcement id, or "Not yet announced" if it didn't complete — one row per relay when several are configured. |
| **Repository** | An **Explore** button that jumps straight to this publication's page in World View — shown whenever the publication carries somewhere to explore, which in practice is always. |

**Large builds.** Arweave storage takes a Snapshot of up to 256 KB, about
eight thousand bricks. For anything larger, choose IPFS storage (a local
IPFS node or remote pinning), which has no size limit; if you choose
Arweave anyway, the Snapshot section says how large the build is and asks
you to pick IPFS, and nothing is uploaded. Peers you're connected to can
fetch builds of up to 64 MB straight from you, with no storage needed.

The Snapshot's own result — a **Content hash**, a **Locator**,
and an **Announcement** id, or "No announcement" for a placement that
succeeded without one — is entirely separate, since Snapshots are placed
and discovered independently of Signed Claim distribution; see
[Local Snapshot](09-PublicationsAndEvidence.md#local-snapshot) for what
that distinction means.

Like every other distribution button in this app, distributing needs a
signing browser extension — an Arweave wallet (such as Wander) or a Nostr
extension (such as nos2x); without one, it ends in a plain "…could not be
completed" notice. Publishing itself never distributes anything on its
own: distribution only ever
happens on this later, separate, explicit click. Publishing again
replaces the whole overlay with a fresh one for the new publication;
dismissing it, or leaving the page, clears it — neither the notice nor
either section's result is remembered anywhere.

## Sharing with connected peers

A World you publish is listed in *your* Repository only, until you
distribute it on Nostr, Arweave or Steem (see [Distribution](Distribution.md)):
then anyone's Repository finds it (see
[Creations others distributed](#creations-others-distributed)). To put it in the
Repository of someone you're connected to (see
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)), click
**Share with Peers** under it in the Repository. The button appears only on
your own published Worlds.

- Sharing offers the World to everyone connected right now, and to anyone
  who connects later. **Shared ✓ · Share Again** announces it again to the
  people connected now.
- On their side, a World shared by one of their **Friends** or **Known
  Peers** is added to their Repository by itself, along with everything
  needed to **Explore** it. A World shared by anyone else waits under
  **Shared with you** at the top of their Repository until they click
  **Retrieve**. Nobody's device downloads a stranger's World without
  being asked. Each one is listed by its title, so they can choose; their
  device makes sure the World they retrieve is the one that title names.
  A World you shared before titles were included is listed as "A World
  shared by …" until you click **Share Again**.
- The World is fetched only from you, and only while you're connected: if
  you're offline, **Retrieve** waits until you're back, and a Friend or
  Known Peer gets it as soon as you reconnect. Your device checks that the
  World is signed by you before adding it, so nobody can pass off a copy as
  theirs.
- Like any publishing, sharing can't be taken back from people who already
  received it.

## Choosing a license

A published creation is always shown with a license, chosen from the
**Document Properties** dialog:

| License | Meaning |
|---|---|
| **CC0 1.0 — Public Domain** | No rights reserved — anyone can do anything with it |
| **CC BY 4.0 — Attribution** | Anyone can fork and reuse it, crediting you |
| **CC BY-SA 4.0 — Attribution, ShareAlike** | Forks must carry the same license forward |
| **CC BY-NC 4.0 — Attribution, NonCommercial** | Forking allowed, commercial use isn't |
| **CC BY-ND 4.0 — Attribution, No Derivatives** | Viewable, but **forking is not allowed** |
| **All Rights Reserved** | Viewable, but forking is not allowed |
| **No license specified** | Forking is not allowed until you set one |

If you leave a creation unlicensed, people can still open and explore it —
they just can't fork it until you pick a license that allows it.

## Choosing who can place it

Other people can normally place your published creation in their own
Worlds. That adds a placement of your build, never a copy of it, and it never
moves or changes yours (see
[Why can I place other people's builds?](03-WorldView.md#why-can-i-place-other-peoples-builds)).
Forking is separate and governed by the license (see
[Placing vs forking](03-WorldView.md#placing-vs-forking)).
If you'd rather they didn't place it, open **Document Properties** and set **Who can
place it in the World**:

| Setting | Meaning |
|---|---|
| **Anyone may place it** | The default. Anyone can place it wherever they like in their own World |
| **Only I may place it** | Only you can place it. Other people can still find, view and (if the license allows) fork it, but ForkBuild won't let them place it |

The setting is signed as part of the publication when you publish, so
nobody can remove or change it afterwards. That also means it applies only
to what you publish after choosing it. A publication that's already out
keeps the setting it was published with, so publish again if you want the
new one to apply.

It works the same way the license's fork permission does: every copy of
ForkBuild honors it, but it isn't a lock. Someone who changed the app's code
could ignore it, and it can't take back a placement someone made before you
chose it.

Either way, other people see your build where *you* put it once you
**Distribute** its Snapshot, from World View or right after publishing in the
Editor: the announcement carries your
signed placement, and their ForkBuild shows the build there as soon as it
knows your Shared World. Move it and distribute again, and it moves for them
too.

## Editing a published creation

A published creation is **immutable** — it can never change after the
fact. To build on one, **Fork** it (below), or use **Edit a Copy** in World
View. In World View, making your first change to a published world — its
metadata, a landmark or region name, or an animal decoration —
automatically creates your own copy, titled *"Fork of &lt;original
name&gt;"*, with a short confirmation ("Created your own editable copy — …
is unchanged"); see
[Save and publish here, too](03-WorldView.md#save-and-publish-here-too).

The original is never touched, no matter how much you change your copy.

## The Repository

The **Repository** is the searchable catalog of every published creation
this device knows about: your own, ones peers have shared with you, and
ones found on decentralized networks. It's built to stay usable whether it
holds ten creations or ten thousand.

### Creations others distributed

Each time you open the Repository (or an author's page), it looks on Nostr,
Arweave and Steem for creations other people distributed there, and adds
the ones it can verify. A line above the list says what it's doing, then
how many new creations it found; **Check again** looks once more.

- Only a creation whose signed record checks out is added: signed by the key
  it names and exactly the creation that was announced. Anything else is
  skipped, and a record that failed isn't fetched again.
- It checks up to 20 new creations at a time. If there are more, the line
  says how many are left for next time.
- A creation found this way stays in your Repository after a reload.
- Its build isn't on your device yet. **Explore** fetches it from where it
  was stored and checks it, then opens it in World View, just like opening
  a shared link.

```
Search [________________]  ☐ Include descriptions  [Search]

Sort: [Recently Published ▾]   Group: [None ▾]   [Cards] [List]

1,248 publications

┌─────────────────────────────────────────┐
│  [preview]  Ancient City                 │
│             A reconstruction of a        │
│             Roman city showing…          │
│             🔒 Published  by alice       │
│             8/16/2026 · CC BY 4.0        │
│             [Open] [Fork] [Explore]      │
└─────────────────────────────────────────┘

        [← Previous]  1 2 3 4 5 … 125  [Next →]
```

- **Search** looks at title and author by default. Check **Include
  descriptions** to also search inside descriptions — this can take a moment
  longer, since it has to read more than the listing normally needs.
- **Sort** offers five orders: Recently Published, Oldest Published, Title
  A–Z, Title Z–A, and Author A–Z.
- **Group** clusters the current page's results by Author, Date, or License —
  purely for browsing; it doesn't change what's found or how many pages there
  are.
- **Cards** is best for browsing visually; **List** is a compact table —
  switch to it once you're scanning a lot of results quickly.
- Pagination is explicit, page by page, rather than endless scrolling — so
  "page 5" always means the same thing if you come back to it later.

Every creation offers three actions:

| Button | What it does |
|---|---|
| **Open** | Load that document into the Editor |
| **Fork** | Copy it into your own editable creation |
| **Explore** | Fly to it in World View |

(**My Worlds**' own **Continue Exploring** button — see
[My Worlds](03-WorldView.md#my-worlds--worlds-youve-actually-been-to) — does
the same thing as **Explore** here, just worded for a World you've already
visited rather than one you're finding for the first time.)

Click any **author's name** to visit their **Author view** — a portfolio of
everything they've made, including their originals and all the forks that grew
from them, using the exact same search/sort/pagination catalog as the
Repository, just scoped to that one author.

A card whose signature checks out also has a **Follow** button, and an
Author view shows **Signed by …** with **Follow** for each identity that
published under that name. Following someone puts their new work on your
**Following** page and in your notifications; see
[Following people](07-PeerConnectionsAndFriends.md#following-people).

The Repository isn't limited to what was published from this device or
discovered outright, either: a decentralized Repository creation a peer
showed you in World View's own
[World Encounters](03-WorldView.md#world-encounters--publications-and-avatars-your-peers-are-sharing)
map, once its content actually resolves, joins this same search and its
author's Author view too, and stays there after a reload. It's shown no
differently from anything else here.

## Forking: make it your own

**Forking** is what makes ForkBuild special. When you fork a creation:

- You get a **brand-new, independent copy** to edit freely.
- The **original is untouched** — your changes never affect it.
- The copy **remembers where it came from**, so credit is never lost.

It works just like forking a project in Git: you branch off, do your own thing,
and the family tree keeps track of everyone. (In World View it also happens automatically the moment you change a
published world — see
[Editing a published creation](#editing-a-published-creation) above.)

> **Also called "Edit a Copy" in World View.** It's the same underlying
> operation either way, with the same license rules and the same
> [Fork Unavailable](#when-a-fork-cant-complete) handling. See
> [Edit a Copy](03-WorldView.md#edit-a-copy--taking-something-into-the-editor)
> for World View's own walkthrough of it.

### How to fork

1. Find a creation in the **Repository** (or in World View).
2. Click **Fork**.
3. The copy opens in the Editor, titled *"Fork of &lt;original name&gt;"*.
4. Build on it, then save and publish it as your own.

Your published fork shows up with a **"↳ Fork of …"** note, linking it back to
the original.

### When a fork can't complete

Occasionally a fork can't go through — most often when forking a Shared World
found through a peer or a decentralized network (see
[Publications & External Evidence](09-PublicationsAndEvidence.md)) rather
than an ordinary Repository entry. Instead of dropping you into a blank,
unrelated Editor document, ForkBuild shows a **Fork Unavailable** dialog
naming exactly what went wrong:

- **This Shared World cannot be forked under its license** — the license
  attached to what you were trying to fork doesn't allow it (see
  [Choosing a license](#choosing-a-license) above).
- **This Shared World's material is currently unavailable** — the license
  allows forking, but the actual content isn't on this device (or
  reachable through a connected peer) yet.

Either way, the dialog's one button, **Back to Shared World**, takes you back
to wherever you found it — the World it was placed in, or the Shared World
itself — rather than leaving you stranded in the Editor with nothing to
build on.

## The family tree

Because every fork records its parent, ForkBuild can draw a creation's whole
lineage. On an **Author view**, you'll see a **fork tree**:

```
Medieval House (original)
└─ Fork of Medieval House (by Bob)
   └─ Fork of Fork of… (by Carol)
```

This means a great creation can inspire an entire ecosystem of variations —
and everyone in the chain gets credit.

## A typical creative loop

Here's the whole journey in one flow:

1. **Build** a creation in the Editor.
2. **Save** it.
3. **Publish** it to the Repository.
4. Someone **finds** it — by searching, by exploring nearby in World View, or
   by browsing your Author page — and **forks** it.
5. They **publish** their fork.
6. Others **explore** both in World View, and the tree grows.

That's the open construction ecosystem ForkBuild is built for.

## What's next?

Keep the [Controls Reference](ControlsReference.md) handy while you build, or
go back and explore [World View](03-WorldView.md) in more depth.
