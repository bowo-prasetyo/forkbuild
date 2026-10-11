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
   creation with it. If you aren't logged in, **Publish** asks you to log
   in or create an identity first; **Publish unsigned** there publishes it
   with no author, and no link.
3. Give it a title — Publish refuses an untitled or empty creation — and,
   optionally, a description and a license: click **✎** beside the
   document title in the sidebar to open **Document Properties**. A new
   document has no license; the first time you publish it, ForkBuild asks
   whether others may remix it (see
   [Letting others remix it](#letting-others-remix-it)).
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
> Publishing never sends anything anywhere by itself. A
> [link](#sharing-a-link) you copy carries the build to whoever you give it
> to. Two separate, optional
> steps do: **Distribute**, described below, pushes the publication to
> Arweave or IPFS and announces it on Nostr or Arweave so other people can
> find it without being connected to you; and
> [**Share with Peers**](#sharing-with-connected-peers) offers it to the
> people you are connected to.

## Sharing a link

The moment **Publish** succeeds, the notice in the Editor also shows
**Share…** (where your device has a share sheet), **Copy link**, **Save
picture** and **Embed**, with the link below them. The same buttons are under
**My Shared World** in World View.

- **The build travels inside the link.** Nothing has to be distributed
  first, and no wallet or account is involved: the link carries your signed
  Shared World and the build itself. Anyone who opens it, on any
  device, lands on your build (see
  [What a link opens on](#what-a-link-opens-on)). ForkBuild checks the
  signature, and that the build matches it, before showing anything; a
  link that was changed or cut short says so.
- **It shows what it is.** Pasted into a chat app, an email or a post, the
  link shows your build's title, your name and a picture of the build,
  drawn by ForkBuild's link server, which then sends whoever opens it on to
  ForkBuild. A link that was changed shows only "A shared build".
- **It needs a signature.** Publish while logged in; a creation published
  while logged out gets no link.
- **Size.** A build of up to about 500 bricks fits; the ready-made castle's
  link is about 3,700 characters. Email and most chat apps and social sites
  keep a link that long, but Discord and Telegram limit how long a message
  can be. A larger build says it is too large for a link: distribute it to
  get one.
- **Once distributed**, the buttons offer the shorter link that names where
  the Shared World is stored, which also brings your placement along (see
  [Distribution](Distribution.md)). A link that carries its build doesn't
  carry your placement, so World View stands the build where it puts
  builds without one.
- **Save picture** downloads a 1200 × 630 PNG of the build, with its title
  and "Remix it on ForkBuild" along the bottom, for posting where a link
  alone shows no picture.

Copying or sharing a link, and opening one, are counted anonymously, like
the daily visit; see [Daily visitor count](13-YourData.md#daily-visitor-count).

### What a link opens on

A link to a build, whether it carries the build or names where it is
stored, opens on that build's own page:

- the build, turning slowly;
- its title and who made it;
- **Remixed from "…" by …** when it is a remix, and **Remixed N times**
  when this device has found remixes of it (see
  [Remix counts](#remix-counts));
- its **Family tree**: the builds it was remixed from, back to the
  original, and the remixes made from it and from those, each one a link
  when this device can open it;
- **Edit a Copy**, the big button: your own copy opens in the Editor,
  ready to change, with no account needed. It remembers where it came
  from, so its maker keeps the credit, and **Back to World** takes you to
  the original;
- **Walk around it in the World**, to see it in World View.

When the license allows copies, the page also offers **Download it as a 3D
model** (glTF, STL for 3D printing, or OBJ; see
[Downloading a 3D model](02-TheEditor.md#downloading-a-3d-model)). If the
build's license doesn't allow copies, the page says so and offers only the
walk around it.

### Embedding a build in a web page

A build whose link carries it can also be shown inside a blog post or a web
page, where readers see it turning without leaving the page:

1. Under the link, choose **Embed**. The code to paste appears below it.
2. Choose **Copy embed code**, and paste it where the page accepts HTML or
   an embed (an `<iframe>`).

On the page, the build turns slowly, and dragging sideways turns it by hand.
Its title and maker are along the bottom, beside **Remix on ForkBuild**
(**Open in ForkBuild** when its license allows no copies), which opens the
build's own page in ForkBuild in a new tab (see
[What a link opens on](#what-a-link-opens-on)).

- **The build travels inside the code**, as it does in its link: nothing
  has to be distributed, and the embed checks the signature and the build
  before showing it.
- **It stays quiet.** The embed starts none of ForkBuild's connections and
  stores nothing in the reader's browser; see [Privacy](../Privacy.md).
- **Sites that embed links themselves** (those that support oEmbed, such as
  Notion and Ghost) can be given the link from **Copy link** instead: they
  ask ForkBuild's link server for the embed.
- **Sites that remove `<iframe>` code**, as most social networks do, can't
  show it; share the link or the picture there.

Copying embed code, and an embed being shown or opened in ForkBuild, are
counted anonymously too.

## Distributing straight from the Editor

The moment **Publish** succeeds, the Editor shows a small notice right
there — "Published! Share its link, or use Distribute to send it to the
open networks so anyone can find it." — with a **Distribute** button
beside it, and a **Dismiss** to make it go away without doing
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
distribute it on Nostr, Arweave, Steem or Blurt (see [Distribution](Distribution.md)):
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

### Letting others remix it

The first time you publish a build that has no license, ForkBuild asks
**Let others remix it?** before anything is published:

- **Yes, allow remixes** sets **CC BY 4.0**: anyone may copy and change it,
  as long as they credit you, and each remix shows it was remixed from
  yours.
- **No, just let people look** sets **All Rights Reserved**: people can
  walk around it, but not copy it.
- **Not now** publishes nothing.

Your answer is saved as the build's license, so you're asked only once;
change it any time in **Document Properties**. A fork already carries its
original's license, so publishing one never asks.

### All the licenses

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
fact. To build on one, **Remix** it (below), or use **Edit a Copy** in World
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

### Ready-made builds

At the top, **Start from a ready-made build** shows the builds that come
with ForkBuild: a castle, a harbor island, a village square, a house, a mill
and a bridge. They're there even before anything is published or found.
Click one (**Remix**) to open your own copy in the Editor; nothing is
published until you publish it. Click the heading to fold the row away.

### Creations others distributed

Each time you open the Repository (or an author's page), it looks on Nostr,
Arweave, Steem and Blurt for creations other people distributed there, and
adds the ones it can verify. A line above the list says what it's doing, then
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
| **Remix** | Copy it into your own editable creation |
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
2. Click **Remix**.
3. The copy opens in the Editor, titled *"Fork of &lt;original name&gt;"*.
4. Build on it, then save and publish it as your own.

Your published fork shows up with a **Remixed from "…" by …** note, linking
it back to the original.

### Remix counts

A build's page and its Repository card say how many times it was remixed
(**Remixed 3 times**): how many different builds this device has found
that were forked from it and published. A remix published twice counts
once, and a build nobody has remixed shows nothing. The count is only what
this device knows, so another device may show a different number, and it
never decides what is shown first.

When this device finds someone else's remix of one of your builds, your 🔔
gets a **… remixed your build** entry, once per remix (and your device
shows it too, if you turned on
[Notifications on this device](03-WorldView.md#notifications-on-this-device)).

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

## The weekly build challenge

Every week ForkBuild sets a theme to build (a lighthouse, a bridge, a tiny
home, …), from Monday to the end of Sunday (UTC). Home shows it, and
**Challenge** in the top bar opens its page.

1. **Join the challenge** opens a starting build in the Editor as your own
   copy, already tagged for the week (a tag such as `#lighthouse-20261012`,
   the theme and the Monday it began). The challenge is also the first
   choice in the Editor's **New**, and the page's **Ideas to start from**
   open other fitting builds the same way.
2. Make it yours, or start again from an empty plot: whatever you build
   enters as long as it keeps the week's tag (add it in **Document
   Properties → Tags** if you started some other way).
3. Publish it before the week ends, and share its link. The link's text
   names the challenge and its tag, ready for a post.

The challenge's page lists the entries this device knows of: your own
published builds with the tag, and others' builds found on the networks.
When a build is distributed to Nostr, Arweave, Steem or Blurt, its announcement (on Blurt, its post) lists its tags, and the page asks those networks for the week's tag each time it
opens (**Check again** asks again). Each entry found is checked like
anything the Repository finds, and is listed in the Repository too. A build shared only by its link isn't found this way, nor one announced only on Steem before 8 October 2026, when Steem announcements began to list tags. Earlier weeks stay open by their Monday (**Last week: …**), without
**Join**.

Entries are shown newest first, with their remix counts. Nobody judges
them and nothing is ranked: the challenge is a reason to build something
this week, and to see what others made of the same idea.

When entries were remixed from each other, or from other builds,
**Family trees** under the entries shows where they came from, one tree for
each chain of remixes.

### The challenge plaza

Once a week has entries, **Walk the plaza** on its page takes you into
World View, to a clearing in the shared World where the week's entries
stand in rings round an open square. Walk among them, or pick one in the
panel: **Navigate** flies to it, **Open** opens it as **Explore** would,
and **Edit a Copy** starts your own copy of it.

- The first 24 entries published stand there, the oldest nearest the
  middle, so a new entry joins the outer edge. The rest are on the
  challenge page.
- Entries found on the networks are fetched and checked the way opening
  their link would be. One that can't be fetched is left out, and the
  panel says how many were.
- An entry whose publisher chose **Only I may place it** doesn't stand in
  the plaza, since standing it there would be placing it. It stays on the
  challenge page.
- The entries are exhibits, not placements: nothing is signed or kept for
  anyone, and they're gone when you leave. Like the rest of World View, the
  plaza shows what this device knows, so two visitors may see a different
  set.

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

A build's own page, opened from a shared link, shows the same lineage as a
**Family tree**: what it was remixed from, back to the original, then the
build itself, then the remixes made from it, as far as this device knows.

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
