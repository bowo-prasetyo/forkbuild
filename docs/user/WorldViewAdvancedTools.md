# World View: Advanced Tools

<!-- languages -->
**English** · [Deutsch](de/WorldViewAdvancedTools.md) · [Español](es/WorldViewAdvancedTools.md) · [Français](fr/WorldViewAdvancedTools.md) · [Bahasa Indonesia](id/WorldViewAdvancedTools.md) · [日本語](ja/WorldViewAdvancedTools.md) · [한국어](ko/WorldViewAdvancedTools.md) · [Português (Brasil)](pt-BR/WorldViewAdvancedTools.md)
<!-- /languages -->

This page covers the parts of [World View](03-WorldView.md) that show only
when you tick **Show advanced tools** at the bottom of the side panel. They
are for the networks behind the World: where a build is placed, where it is
stored, and what other people have announced nearby.

You don't need any of them to walk, build, remix or share a link. Ticking
the box is remembered on this device and changes nothing for anyone else.

**With advanced tools on, you get:**

| Tool | Where it is | What it's for |
|---|---|---|
| [Inspecting](#inspecting-a-brick--or-a-placed-structure) | Click a brick or a placed structure | See what it is and where it came from |
| [Camera vs. Editing](#camera-vs-editing) | A line in the panel's header | See which build your next change applies to |
| [About this build, and Placement](#build-information-and-placement) | Below the header, after a click | A build's details, and where it stands |
| Coordinates and **Location** search | Over the view, and in **Search** | Find things by X/Y/Z position |
| [World Encounters](#world-encounters--publications-and-avatars-your-peers-are-sharing) | Explore's **Nearby** section | What connected people are sharing |
| [Place Names](#nearby-place-names--discovering-claims-from-anyone) | Explore's **Nearby** section | Names other people gave the places around you |
| [Claimed Builds](#claimed-builds--other-peoples-builds-where-their-publishers-say-they-stand) | Explore's **Nearby** section | Builds announced near you, shown as ghosts |
| [My Shared World](#my-shared-world--distributing-your-own-snapshot-no-peers-required) | Lower in the panel | Your own build's placements, sending it out, and its comments |

Advanced tools also add the list of Worlds that couldn't load and, under
**Avatar settings**, the avatar diagnostics.

## Inspecting a brick — or a placed structure

Click any brick to open the **Inspection** panel. (Without advanced tools,
a click only picks another avatar.) It shows:

- what kind of brick it is;
- its position and rotation;
- which World and build it belongs to;
- who made that World.

**Focus Brick** zooms in on the brick. **Focus World** takes you to the
World's home position. **Edit a Copy** makes your own copy of the World and
opens it in the Editor; the original stays as it is.

Clicking bare ground inside a World opens the same panel, with the position
and the World but no brick details. It has **Edit a Copy** too, so you can
copy a World by clicking anywhere in it.

A **placed structure** is a whole build dropped into a World from the
Editor (see
[Structure instances](02-TheEditor.md#structure-instances-a-live-reference)).
Click one and the panel shows the build it points to: its title, its
position and rotation, the ground height, and the World it stands in. You
can't move it here. It has two buttons:

- **Open Source** opens the build it points to in the Editor. Every copy of
  that structure, wherever it's placed, shows what you change there.
- **Edit a Copy** makes your own copy of that build instead, and leaves the
  original and every placed copy of it unchanged.

Every **Edit a Copy** in World View does the same thing; see
[Edit a Copy](03-WorldView.md#edit-a-copy--taking-something-into-the-editor).

## Camera vs. Editing

The header shows a line like this:

```
Camera: Alice's Castle · Editing: Bob's Castle
```

- **Camera** is what you're looking at. Flying to a World, or clicking
  **Focus** or **Go**, changes it.
- **Editing** is the build your next change applies to: a landmark, a
  region, its details, or publishing. Clicking a brick or a placement, or
  **Select** in a search result, changes it without moving the camera.

Usually the two are the same, because **Focus** changes both. They differ
when you've selected one build and are looking at another, or when two
builds stand on exactly the same spot: focusing the second one doesn't
move the camera, but the line shows that you now edit the other build.
Looking around never changes what you edit; only selecting does.

**Go** and **Focus** are the same thing under two names: both move the
camera. Whether they also change what you edit depends on the panel (in
[Search](03-WorldView.md#search--which-publications-match-this), Focus
does).

## Build Information and Placement

Click a brick, bare ground or a placed structure and two panels open below
the header, for the build you clicked:

- **About this build**: its title, description, tags, license, status,
  author, and what it was remixed from. **Edit Metadata** changes the
  title, description, license and who can place it.
- **Placement**: where the build stands in the World, in **World Units**.
  These are ForkBuild's own coordinates, not GPS; one World Unit is one
  metre. **Focus** takes you there. **Move** opens **Move Placement**,
  where you type new X, Y and Z values or nudge the build by 1, 10 or 100
  units. **Move to its grid spot** fills in the build's own spot on the
  World's grid, where builds are placed when published; click **Move** to
  go there. **Remove from World** takes this placement out.

They're two panels because *what* a build is and *where* it stands are
separate. Moving a placement never changes the build, and changing the
build never moves it.

### World position

To take a build back to its own spot on the World's grid (one published
from 12 to 17 October 2026 was placed round the challenge plaza instead),
open **Move Placement**, click **Move to its grid spot**, then **Move**.
Then send it out again with **Distribute** in **My Shared World**, so
other devices move it too.

If another build already stands exactly where you're moving to, **Move
Placement** warns you and lists what's there before you confirm. Sharing a
spot is allowed: a courtyard scene and the building around it can stand in
the same place. ForkBuild just makes sure you know.

### Placements you don't own

When someone else placed a build, the Placement panel says **🔒 Placed by
&lt;name&gt; — you can view this placement but not move it**, and **Move**
is greyed out. You can still focus it, inspect it, and use **Edit a Copy**
to build on it. Only where it stands is theirs to change.

### Builds Here

When the Placement panel says other builds share this spot, click **View**
to open **Builds Here**: a list of every build at that spot, each with a
**Focus** button. Builds that have been unpublished are left off.

### Why can I place other people's builds?

A real building can't be picked up and moved, so it may seem odd that you
can place anyone's published build wherever you like. But a published build
isn't one physical object. It's fixed content, known by its content hash,
like a file. A **placement** is a separate, signed note that says "show
this build here". It points at the build; it doesn't copy it. One build can
have many placements, and each shows exactly the same content.

So placing someone else's build never moves or changes theirs:

- **Their placement stays where they put it.** Only they can move it (see
  [Placements you don't own](#placements-you-dont-own)).
- **Your placement is signed by you.** It only says where *you* show their
  build.
- **The build keeps its author and history.** It's still exactly what they
  published, and anyone can check that against its hash and signature.

There's no central map that says who owns which plot of land. Each World
shows the placements it has accepted. That's why a build someone announces
near you shows only as a ghost until you choose **Accept Position** (see
[Claimed Builds](#claimed-builds--other-peoples-builds-where-their-publishers-say-they-stand)).
Nobody can put a build into your World without your say-so.

Some reasons to place a build you didn't make:

- **Curating**, such as a gallery World of builds you like.
- **Making a scene**, such as putting a friend's castle next to your
  village.
- **Using it as it is.** Place it when you want it unchanged, and use
  [Edit a Copy](03-WorldView.md#edit-a-copy--taking-something-into-the-editor)
  when you want to change it.

A publisher who doesn't want this can choose **Only I may place it** when
they publish (see
[Choosing who can place it](04-PublishingAndForking.md#choosing-who-can-place-it)).
You can still find and look at their build, and remix it if the license
allows, but you can't place it.

### Why can two builds sit in the same spot?

Two real buildings can't stand in the same place. In ForkBuild they can,
because a placement doesn't take up land. It's only a signed note saying
"show this build here", and two notes can name the same spot.

ForkBuild allows this on purpose:

- **Nobody hands out land.** No central server decides who got a spot
  first, and ForkBuild never picks a winner between two signed placements.
  Both stay valid.
- **Each device knows different placements.** A spot that's taken on your
  friend's device may still be empty on yours until their placements reach
  you. A strict "one build per spot" rule would give different answers on
  different devices, so ForkBuild doesn't pretend to have one.
- **Sometimes you want it.** A courtyard scene inside a building, or an
  older version shown in place of the new one, belong in the same spot.

That doesn't mean anyone can crowd your builds:

- **You're warned first.** **Move Placement** lists what's already at a
  spot before you confirm, and never quietly moves your build somewhere
  else (see [World position](#world-position)).
- **No accidental duplicates.** **Add Placement Here** refuses when a
  placement already stands exactly where you are.
- **Someone else's claim is only a ghost.** A position announced by anyone
  but the build's own publisher shows only as a see-through ghost, and
  never on a spot where this device already knows a real placement (see
  [Claimed Builds](#claimed-builds--other-peoples-builds-where-their-publishers-say-they-stand)).
- **Only the owner can move or remove a placement** (see
  [Placements you don't own](#placements-you-dont-own)).

ForkBuild only checks for builds at exactly the same point. Two builds a
little apart whose bricks happen to touch aren't flagged. For the design
reasons, see
[Overlap Is A Fact; Collision Is A Policy Decision](../principles/placement.md#overlap-is-a-fact-collision-is-a-policy-decision-0225)
and the rules after it.

### Placing vs remixing

Both put someone else's build in a World of yours, but they're different:

| | Placing | Remixing (Remix, or Edit a Copy) |
|---|---|---|
| What's created | A placement: a small signed note of where to show the build | A new build, with new ids, that belongs to you |
| The build | The same Shared World, shown as published | Your own copy, with a note linking back to the original |
| Can you change the bricks? | No | Yes, in the Editor |
| Who's the author | The original publisher | You, with the original recorded as its parent |
| Controlled by | The publisher's **Who can place it** setting | The license |
| Publishing it | Nothing new is published | Creates a new Shared World under your name |

Placing is like linking to a file; remixing is like making your own copy of
it to change. Someone who chose **Only I may place it** can still allow
remixes through their license, and a remix is yours to place wherever you
like.

## World Encounters — publications and avatars your peers are sharing

**World Encounters** is a group in Explore's **Nearby** section. It is a
small map of its own (not the World Map) showing what your
[connected peers](07-PeerConnectionsAndFriends.md) have told you about:

- **publications** placed nearby (see
  [Publications & External Evidence](09-PublicationsAndEvidence.md));
- other people's **avatars**;
- a marker for you.

Until a connected peer has shared something, the group says **Nothing
encounterable here yet**.

Click a marker to inspect it:

- A **publication** shows its title, publisher, whether it's signed, its
  position, and how many anchors and snapshot placements it has.
- An **avatar** shows its name, owner and position.

If more than one peer offers the same thing, **Choose Source** lets you
pick whose copy to look at. Nothing here moves your camera or changes
anything.

### Material and Verification

Selecting a publication shows two more lines:

- **Material**: can its content be loaded? **Available** or
  **Unavailable**.
- **Verification**: does the content match what was claimed for it?
  **Verified** or **Unverifiable**.

Content already on this device loads and checks straight away. Something a
peer only showed you usually reads **Unavailable** / **Unverifiable** until
you look it up with [Discover Shared World](#discover-shared-world--searching-decentralized-networks-directly).
If that finds it on Arweave or Nostr, it's used here too. When it finds
more than one place, **Choose Location** lets you pick one; nothing is
loaded until you do, and the choice applies to this publication only.

A **Source** line says where the content came from: **Local** (this
device) or **Decentralized** (Arweave or Nostr). It's a plain fact, not a
trust score.

Once a peer's publication reads **Available**, it is added to Explore and
its author's page as if you had found it there, and it stays after a
reload. Nothing marks it as found through a peer: your own device has
checked the content, so it's the same as any other.

### The Distribute dialog

Once this device holds a publication's content, a **Distribute** button
opens the **Distribute** dialog. The same dialog opens from
[My Shared World](#my-shared-world--distributing-your-own-snapshot-no-peers-required)
for your own build. For what each network does, see
[Distributing Your Work](Distribution.md).

At the top are two settings, used for everything in the dialog. Both start
on your saved preferences:

- **Storage**: where the content goes. **Arweave**, **IPFS (Local Kubo)**,
  **IPFS (Remote Pinning)**, or, experimental, **Steem** or **Blurt** (see
  [Steem](11-EvidenceAndStorage.md#steem) and
  [Blurt](11-EvidenceAndStorage.md#blurt)). Remote Pinning asks for an
  Endpoint and Credential each time and never saves them. Only storage
  this device can actually use is listed.
- **Announcement / Discovery substrate**: where it's announced so others
  can find it. **Arweave**, **Blurt**, **Nostr** or **Steem**.

The dialog can send two things:

- the **Signed Claim**, which says you published this, and
- the **Snapshot**, a copy of the build itself (see
  [Local Snapshot](09-PublicationsAndEvidence.md#local-snapshot)).

When both can be sent, the main **Distribute** button sends them one after
the other, because both may ask the same wallet extension to sign. Each has
its own section with its own result, and one failing never hides or stops
the other. **Distribute Signed Claim only** and **Distribute Snapshot
only** send just one, to retry a half that failed, say. When only one can
be sent, its button is just **Distribute Signed Claim** or **Distribute
Snapshot**.

You need a browser extension to sign: an Arweave wallet (such as Wander)
for Arweave, and a Nostr signer (such as nos2x) for Nostr. Without it, the
section says "Distribution could not be completed." and why.

- The **Signed Claim** section reads **Absent** for **Material** and
  **Discovery** until it has been sent. Afterwards it shows the
  publication's id, where its material is, and the announcement's id, with
  one row per [Nostr relay](10-NetworkSettings.md#nostr-relays).
- The **Snapshot** section shows a **Content hash**, a **Locator** and an
  **Announcement** id. "No announcement" means the copy was stored but not
  announced; that's a partial result, not an error. A real failure says
  "Snapshot distribution could not be completed."

Closing the dialog loses nothing: open it again and the results are still
there. They're forgotten when you select another publication or leave the
page.

## Discover Shared World — searching decentralized networks directly

Inside World Encounters, **Shared World Discovery** opens the **Discover
Shared World** panel. It needs no peer and no marker. Type a **Shared World
id**, keep the **discovery tag** (it starts on ForkBuild's own tag, which
is almost always right), and click **Discover Shared World**. ForkBuild
asks Arweave and Nostr directly.

The **Discovery** line then reads **Unavailable**, **Resolved**, or
**Ambiguous** (more than one lead for the same location). Once resolved,
it shows the same Material, Source and Verification lines as above.

Today it only resolves your own publications: ones you signed and still
have on this device. Think of it as "is my build really out there,
intact?", not as a search of everyone's work.

When a result reads **Verified**, **Select Shared World** marks it as the
one you're working with, shown in a note underneath. That's all it does:
it doesn't send or check anything again. It stays until you select another
or leave the page. Closing the panel keeps what you typed and found.

## Nearby Place Names — discovering claims from anyone

**Place Names**, a group in Explore's **Nearby** section, shows the names
people have published for the World Regions around you. It looks them up
on Nostr, so it needs no connected peer. It starts folded, because these
names haven't been checked yet.

Each row shows the name, roughly where it is, who named it, and when:

- **Navigate** moves your camera to that region, like **Go**. It doesn't
  rename or accept anything.
- **Adopt** saves the name to this device, after the same signature check
  as a name from a connected peer (see
  [Receiving one from a peer](09-PublicationsAndEvidence.md#receiving-one-from-a-peer)).
  The button then reads **✓ Already saved**.

When two people named the same ground, both names show. ForkBuild never
picks a winner, and adopting one doesn't mean it's more correct. If the
lookup fails, a notice says so and the names you already saw stay. To
publish a name yourself, see
[Naming a place](09-PublicationsAndEvidence.md#naming-a-place).

## Claimed Builds — other people's builds, where their publishers say they stand

As you walk, ForkBuild downloads Snapshots announced near you (see
[My Shared World](#my-shared-world--distributing-your-own-snapshot-no-peers-required)).
An announcement may say where the build stands, but that's only a
**claim**: trusting it blindly would let anyone put a build on top of
yours. So a claimed build shows as a **ghost**, its bricks see-through at
the claimed spot, and never becomes a real placement on its own.

**One exception needs no click.** When publishers send out their own
Snapshot, the announcement carries their **signed placement**. Once this
device knows that build's Shared World (it's in Explore, or you click
**Verify**), ForkBuild checks the placement is signed with that Shared
World's key. If it is, the build shows solid, exactly where they put it.
It's still their placement, so you can't move or remove it, and if they
move it and send it out again, it moves for you too. A position signed by
anyone else stays a ghost.

A ghost is drawn only when:

- it's near you (your map cell or the ones next to it, about 1,000 units
  each way), and it goes away again as you walk off;
- its content downloaded and matched its content hash;
- this device has no placement of that build yet (once it has, the real
  build shows instead);
- nothing this device knows already stands on exactly that spot.

You can't select, inspect, edit or copy a ghost. Very large builds are
drawn only in part (the first few thousand bricks).

Each ghost has a row in **Claimed Builds**, nearest first: its title,
distance, position and "claimed by …". The title and author come from the
build itself and are just as unchecked as its position. Each row has:

- **Navigate**: moves the camera to the claimed spot. Nothing else changes.
- **Verify**: shown while this device doesn't have the build's signed
  Shared World. It looks it up on Nostr and Arweave and checks that it's
  validly signed, that it's this build's Shared World, and that it names
  exactly the content the ghost shows. If so, it's added to Explore and the
  row reads "signed by *name* (key did:key:…)". If not, the row says why:
  nothing was announced (the publisher may have sent only the Snapshot), no
  copy was validly signed, or it names different content. Verify doesn't
  accept the position, but if the publisher's own signed placement came
  with it, the build now shows solid where they put it.
- **Accept Position**: the one way to trust a claim. It places the build at
  the claimed spot with a placement of *your own*, signed by you, and from
  then on it's a normal build in your World. It works only once this device
  holds the publisher's signed, checked Shared World, and only if that
  names exactly the content the ghost shows. You get it through
  **Verify**, when they [share the World with you](04-PublishingAndForking.md#sharing-with-connected-peers),
  or when a peer's [World Encounter](#world-encounters--publications-and-avatars-your-peers-are-sharing)
  for it reads **Available**. It also stays off when the publisher chose
  **Only I may place it** (see
  [Choosing who can place it](04-PublishingAndForking.md#choosing-who-can-place-it)).
  When it's off, the row says why.

  **What "verified" means.** The build is exactly the content of a Shared
  World signed by the key shown. It doesn't prove who holds that key
  (anyone can make one and call themselves "bob"), and it doesn't prove
  the position, which is still only claimed. Accept Position works for
  keys you don't know too; whether to trust one is up to you.
- **Hide**: removes that ghost and its row until you leave World View.
  Nothing is reported or deleted.

## My Shared World — distributing your own Snapshot, no peers required

**My Shared World**, lower in the panel below Search and Avatar, is about
the build you have open. It shows its title and author once it's
published, and works whether or not anyone else is around.

Up front are **Distribute** and the share link. **Distribute** opens the
same [Distribute dialog](#the-distribute-dialog) as World Encounters, but
for your own build. Until the build is published, the button is greyed out
with a note saying there's nothing to send yet. Remote IPFS pinning and
Bitcoin or Base anchoring aren't here: they need an account or a wallet
first, so they live on the Publications page (see
[IPFS Publishing](11-EvidenceAndStorage.md#ipfs-publishing) and
[The Bitcoin Anchor Pipeline](11-EvidenceAndStorage.md#the-bitcoin-anchor-pipeline)).

**More ▾** holds the rarer actions:

- **Export Snapshot** and **Check Snapshot Match**. Their results stay on
  the panel after the menu closes.
- **Diagnostic Tools** (see [below](#diagnostic-tools)).
- **Unpublish…** asks once, then takes the World out of the catalog. Its
  placements, the build and any copies you already sent out stay; sent
  copies can't be recalled, but this device remembers what you unpublished,
  so Explore doesn't list them again. **Cancel** backs out.

When the World you have open was published by someone else (a peer shared
it with you, say), the panel is called **Shared World** and has no
**Unpublish** or **Distribute**: only a World's publisher can do those.
Everything else stays, including comments.

**▸ Commentary (N)** opens the build's comments; the count stays up to
date while it's folded. You can post once the build is published. See
[Commentary](09-PublicationsAndEvidence.md#commentary) for who can comment.

### Placements

**Placements (N)** lists every place this Shared World stands: position,
revision and, when known, owner. A build can stand in more than one place,
and every placement this device knows is listed.

- **Move…** opens **Move Placement** for that placement, with its warning
  about builds already at the new spot.
- **Remove…** asks once, then takes that placement out of the World. The
  build and its other placements stay. Without any placement, the build
  just isn't shown anywhere until you place it again.

Both are greyed out on a placement someone else made.

**Add Placement Here**, under the list, places the same build *again*
where your avatar stands (or under the camera, without one). It doesn't
move an existing placement, and it doesn't make a copy: it's still one
Shared World (see [Placing vs remixing](#placing-vs-remixing)). It says where
it placed the build and how many placements it now has. If a placement
already stands exactly where you are, it asks you to move first, so
clicking twice can't stack two on one spot.

### Diagnostic Tools

ForkBuild finds Snapshots on its own as you walk (see below). **Diagnostic
Tools**, under **More**, does the same steps by hand, for when that
doesn't find what you expect. Each step is its own click, and nothing runs
by itself:

1. **Discover Snapshots** lists everything announced under ForkBuild's
   shared tag. It works with no peers and no published build of your own.
2. **Resolve Selected Snapshot** checks the one you picked can be fetched.
3. **Attribute Selected Snapshot** checks it matches this Shared World's
   content hash. **Materialize Selected Snapshot** stores it on this
   device. You can do either, in any order.
4. **Place Materialized Snapshot**, then **Register Placed Snapshot**, add
   it to the World you're in, without a reload.

**Use Claimed Position**, at any point after picking one, uses the position
the Snapshot itself claims, if it has one.

**What happens automatically.** As you walk, ForkBuild checks now and then
for Snapshots, the same way **Discover Snapshots** does. It looks at what
this device has, what connected peers share just by being connected, and
what Nostr reports. One that checks out goes through the same steps by
itself and shows up as a [World Encounter](#world-encounters--publications-and-avatars-your-peers-are-sharing)
marker; there's no separate list or notification.

It only downloads Snapshots near you: those placed, or said to be placed,
in your map cell or the ones next to it (about 1,000 units each way), plus
the 20 newest that don't say where they belong. Farther ones download when
you walk near them. At most four download at a time. One this device
already has is read from its own storage after the same content check.

## What's next?

Back to **[World View](03-WorldView.md)**, or on to
**[Distributing Your Work](Distribution.md)** for everything a build can be
sent to.
