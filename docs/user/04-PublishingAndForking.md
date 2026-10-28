# 04 — Publishing & Remixing

<!-- languages -->
**English** · [Deutsch](de/04-PublishingAndForking.md) · [Español](es/04-PublishingAndForking.md) · [Français](fr/04-PublishingAndForking.md) · [Bahasa Indonesia](id/04-PublishingAndForking.md) · [日本語](ja/04-PublishingAndForking.md) · [한국어](ko/04-PublishingAndForking.md) · [Português (Brasil)](pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

This is the heart of ForkBuild. **Publishing** shares your build with the
world. **Remixing** lets anyone make their own copy of a build and take it
further, with its whole history kept. (Developer documents call a remix a
*fork*, as in ForkBuild.)

## Publishing your build

1. Build something in the Editor.
2. Give it a title — Publish refuses an untitled or empty build — and,
   optionally, a description and a license: click **✎** beside the
   build title in the sidebar to open **Build Properties**.
3. Click **Publish**. The first time, one sheet asks whatever Publish
   still needs to know, with an answer already chosen for each:
   - **Your name**, on a device that has none yet, with one suggested
     (such as *Builder 427*): type your own over it if you like.
     Publishing signs the build with it (see
     [Your Name & Identity](05-IdentityAndLogin.md)).
   - **Others may remix it**, on, for a build with no license (see
     [Letting others remix it](#letting-others-remix-it)).
   - **Everyone can find it**, on, the first time this device publishes
     (see [Who can find it?](#who-can-find-it)).

   Untick either choice if you'd rather, then click **Publish as …** (or
   **Publish**). **Keep building** closes the sheet and publishes nothing.
   **Advanced** holds **Publish without a name**, which publishes it with
   no author, and no link. A name that is locked, or one of several, is
   asked for after the sheet. Publishing saves the build too.

Your build now appears in **Explore** on this device, where
you can search for it, open it, and remix it, with your name as the author.
Other people see it once you share its link, or right away when you chose
**Everyone** under [Who can find it?](#who-can-find-it). It's also given a
spot of its own in the shared world (see
[Where a build stands](#where-a-build-stands)), so **Explore** always has
somewhere to take people — see
[Finding worlds](03-WorldView.md#finding-worlds).

### Walk inside it

Beside the link, the notice Publish shows has **Walk inside it** (**Walk
around it** for a build with no door). It opens World View with your avatar
on the ground in front of the build's door, facing it; the door swings open
as you walk up, and walking in (**W**, or the joystick on a phone) ticks off
the last step of [Your first build](02-TheEditor.md#your-first-build). The
door is the build's main way in: a door set into a solid wall or tower, with
nowhere to stand behind it, doesn't count, and a build without one is
arrived at from the front. The **Your first build** card offers the same
button once the build is published.

> **Note:** Publishing stores your build on this device. Its
> card in **Explore** says where this device recorded distributing it (for
> example **Stored on IPFS · Announced on Nostr**), or **No distribution
> recorded on this device**. Back it up on [Your Data](13-YourData.md) to
> keep a copy in the meantime.
> Until you choose where your builds go, publishing sends nothing anywhere
> by itself. A [link](#sharing-a-link) you copy carries the build to whoever
> you give it to. Once you choose a network (see
> [Where it goes](#where-it-goes--sending-a-build-as-you-publish)), each
> Publish sends the build there too, so other people can find it without
> being connected to you. [**Share with Peers**](#sharing-with-connected-peers)
> offers it to the people you are connected to.

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
- **It needs a signature.** Publish under a name; a build published
  without one (**Publish without a name**) gets no link.
- **A short link once it's sent to everyone.** When the build went to
  **Everyone** (see [Who can find it?](#who-can-find-it)), the buttons offer
  a short link instead, about 90 characters, that names the build rather
  than carrying it: whoever opens it gets the build from the public Nostr
  relays it was sent to, checked as a link is. It fits in any chat, Discord
  and Telegram included, and works for builds of up to about 2,000 bricks.
  Builds kept to their link keep the long link, since there is nowhere else
  for the build to be. A short link works as long as a relay keeps the
  build; if none answers, the page says so and offers **Try again**.
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
- **Make a video** records a short video of the build to upload to YouTube,
  Shorts, TikTok or Reels yourself: a **Build time-lapse**, where it rises
  brick by brick from the ground up, or a **Turntable**, where it turns once,
  either **Wide (16:9)** or **Tall (9:16)**. Its name runs along the bottom,
  and it ends on a card saying who built it, with everyone who built it with
  you, and where to remix it. The video is made on your device, taking as
  long as it plays (half a minute at most), and saved to your downloads;
  nothing is uploaded. Then **Copy title** and **Copy description** give you
  text to paste beside it: who built it, the link to your build, a link to
  ForkBuild and the build's license. A remix's video credits whoever built
  its original too, and a non-commercial build's description says it may
  not be earned from. **Make a video** is offered on anyone's published
  build, so before you make one it says what the build's license asks if
  someone else built it: credit, no money made from it (CC BY-NC), or to
  ask them first (All Rights Reserved or no license). Keep the tab in front
  while it records; it pauses while the tab is hidden.
  With **With music** ticked, as it is unless you untick it, the music
  ForkBuild plays is recorded with it and fades away under the end card.
- A **Walk-through**, the third kind in **Make a video**, is filmed in World
  View: it opens at your build, your avatar starts a few steps back, walks
  up to the door (which swings open) and inside, and looks round the room,
  with World View's own sounds (birds or crickets, wind, footsteps, the door)
  and, unless you untick **With music**, its music. Only the 3D view is
  filmed, never the panels, and it takes as long as it plays (about 15
  seconds). A build with no door is walked up to instead. The music and sound
  are in the video even if you have them turned off. A link that carries a
  large build is too long for a YouTube description, so it is left out and
  Make a video says so; publish with **Who can find it?** set to **Everyone**
  for a short link.
  Under **Camera**, **Behind the avatar** follows it from just behind, and
  **Through its eyes** films what it sees, as if the viewer walked in.
  **Start with a sweep round the outside**, ticked unless you untick it, opens
  the video with the camera circling half way round your build before the
  walk. Through its eyes, the avatar walks on to the most open spot in the
  room and is filmed with a wide lens, as house tours are, so a small room
  shows whole.
  While it films, World View is drawn at the video's own shape, wide or tall,
  with bars beside it, so what you see is what goes into the video.

Copying or sharing a link, and opening one, are counted anonymously, like
the daily visit; see [Daily visitor count](13-YourData.md#daily-visitor-count).

### What a link opens on

A link to a build, whether it carries the build or names where it is
stored, opens on that build's own page:

- the build, turning slowly;
- its title and who made it, and **Built with …** and their names when
  friends built it together with its author (see
  [Build with me](02-TheEditor.md#build-with-me-building-together-live)).
  The author's name and each co-builder's open that person's page: the
  builds their identity signed, and the builds others credit them on;
- **Remixed from "…" by …** when it is a remix, and **Remixed N times**
  when this device has found remixes of it (see
  [Remix counts](#remix-counts));
- **What changed**, under **Remixed from** on a remix: what it added (the
  Build Library structures, and the windows, doors, trees and other parts
  among its new bricks), repainted and took away, worked out from the two
  builds' bricks when this device can read the build it remixes;
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

On a build of your own, the page offers no copy of it. When the build is
saved on this device, the big button is **Keep building**, which opens it
in the Editor as you saved it, ready to change and publish again. On
another device, the page says to change it on the device you built it on.

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

## Who can find it?

The first time you click **Publish**, its sheet has **Everyone can find
it**, already ticked:

- **Ticked (Everyone)**: each build you publish is also sent to everyone. It appears
  in **Explore**, in the week's challenge and its plaza, and in the World,
  for anyone using ForkBuild, with no link, wallet or account on either
  side. Right after Publish the Editor says "Sending it to everyone…", then
  "Published! Anyone can find it now, in Explore, the challenge and the
  World." If the networks couldn't be reached, it says so and offers **Try
  again**; the link works either way.
- **Unticked (only people you send the link to)**: the build stays on this device and
  inside its link. The notice says "Only people you send its link to can
  see it." with **Let everyone find it**, which sends this build and makes
  **Everyone** the choice from then on.

The answer is remembered on this device. After a build was sent to
everyone, **Only by link from now on** in the same notice keeps your next
builds to their links.

How it works: the build, signed by you, is sent as a *build note* to the
public Nostr relays under **Network Settings**, together with its tags and
where it stands in the World. The note is signed with a key this device
makes for the purpose (its *carrier key*), not with your identity, so
nothing needs installing. Everyone who finds the note opens it exactly as
they'd open your link: your signature and the build's content are checked
first, and a note that doesn't match is ignored. A build too big for a note
(about 2,000 bricks) says so; share its link, or choose where it goes
below. Builds published without a name can't be sent. See
[Privacy](../Privacy.md).

### Where a build stands

A published build gets a spot of its own in the shared World, with room
round it, so the World feels like a wide, open land:

- **Build here** puts a build on the spot you chose;
- **anything else**, a remix too, gets its own spot on the World's grid,
  chosen from the build itself, so every device puts it in the same place;
- publishing a build again never moves it.

A challenge entry is placed the same way. While someone visits the week's
[challenge plaza](#the-challenge-plaza), it is also shown round the square
beside the week's other entries, without moving it.

To stand a remix beside the build it remixes, move it there: **Move…**, in
World View's [advanced tools](WorldViewAdvancedTools.md#placements).

Everyone who finds the build sees it on the same spot, since its place
travels with it, signed by you. Builds published from 12 to 17 October 2026
were placed round the challenge plaza instead, and stay there until their
builders move them: **Move to its grid spot**, in **Move Placement**, takes
one to its grid spot (see
[World position](WorldViewAdvancedTools.md#world-position)).

## Where it goes — sending a build as you publish

**Publish** keeps your build on this device and in its links until you
choose where it goes, apart from sending it to everyone (above). Right
after a Publish, the notice offers **Choose where it goes** (or **More
networks**, once it was sent to everyone) beside the share link, and a
**Dismiss**.

**Choose where it goes** opens the **Where it goes** dialog: pick a
**Storage** (where the build itself is kept: Arweave, IPFS, or Steem or
Blurt when their writers are on) and an **Announcement / Discovery
substrate** (where it is announced: Nostr, Arweave, Steem or Blurt), then
click **Send**. **Send here every time I publish** starts ticked: once a
send works with it ticked, this device keeps the choice, and **every
Publish after that sends the build there by itself**. The notice then
says "Sending it to Nostr…", then "Published and sent to Nostr: anyone can
find it now.", or, when a send fails, what went wrong, with **Try again**
and **Change where it goes**. Untick the box (in the dialog, from
**Change where it goes**) to stop, and Publish keeps builds on this device
again. Remote pinning is never kept, since its token lasts only for the
visit; choose it in the dialog each time.

Only a signed build is sent by itself; **Publish without a name** sends nothing.
Your browser's wallet or extension for that network (an Arweave wallet such
as Wander, a Nostr extension such as nos2x, Steem or Blurt Keychain) asks
you to approve each send, and Arweave and Blurt charge a small fee for
each. Without one, the send ends in a plain "…could not be completed"
notice and the build stays published here.

The dialog is the same one World View uses — its **Storage** and
**Announcement / Discovery substrate** settings, and the separate
**Distribute Snapshot only** / **Distribute Signed Claim only** buttons
all work as described in
[World Encounters](WorldViewAdvancedTools.md#world-encounters--publications-and-avatars-your-peers-are-sharing).
Two things differ here: it always acts on the exact Shared World your
Publish click just produced, and the **Snapshot** goes first, so **Send**
sends the Snapshot, then the Signed Claim. Closing the dialog (**Close**,
clicking outside it, or Escape) never loses anything it produced.

The Signed Claim's result appears in its own section:

| Field | Meaning |
|---|---|
| **Shared World** | The Shared World's own id — confirms which Shared World this result is about. |
| **Material** | The location the upload produced, or "Not yet uploaded" if it didn't complete. |
| **Discovery** | The announcement id, or "Not yet announced" if it didn't complete — one row per relay when several are configured. |
| **Your build** | An **Explore** button that jumps straight to this publication's page in World View — shown whenever the publication carries somewhere to explore, which in practice is always. |

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

Publishing again replaces the whole notice with a fresh one for the new
publication; dismissing it, or leaving the page, clears it. Neither the
notice nor either section's result is remembered anywhere; only where your
builds go is.

## Sharing with connected peers

A build you publish is listed in *your* Explore only, until it is sent to
everyone (see [Who can find it?](#who-can-find-it)) or you distribute it on
Nostr, Arweave, Steem or Blurt (see [Distribution](Distribution.md)): then
anyone's Explore finds it (see
[Builds others distributed](#builds-others-distributed)). To put it in
the Explore of someone you're connected to (see
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)), click
**Share with Peers** under it in Explore. The button appears only on
your own published Worlds.

- Sharing offers the World to everyone connected right now, and to anyone
  who connects later. **Shared ✓ · Share Again** announces it again to the
  people connected now.
- On their side, a World shared by one of their **Friends** or **Known
  Peers** is added to their Explore by itself, along with everything
  needed to **Explore** it. A World shared by anyone else waits under
  **Shared with you** at the top of their Explore until they click
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

The first time you publish a build that has no license, Publish's sheet
has **Others may remix it**, already ticked:

- **Ticked** sets **CC BY 4.0**: anyone may copy and change it, as long as
  they credit you, and each remix shows it was remixed from yours.
- **Unticked** sets **All Rights Reserved**: people can walk around it, but
  not copy it.

Remixing is what ForkBuild is for, so it starts on. **Keep building**
closes the sheet and publishes nothing.

Your answer is saved as the build's license, so you're asked only once;
change it any time in **Build Properties**. A remix already carries its
original's license, so publishing one never asks.

### All the licenses

A published build is always shown with a license, chosen from the
**Build Properties** dialog:

| License | Meaning |
|---|---|
| **CC0 1.0 — Public Domain** | No rights reserved — anyone can do anything with it |
| **CC BY 4.0 — Attribution** | Anyone can remix and reuse it, crediting you |
| **CC BY-SA 4.0 — Attribution, ShareAlike** | Remixes must carry the same license forward |
| **CC BY-NC 4.0 — Attribution, NonCommercial** | Remixing allowed, commercial use isn't |
| **CC BY-ND 4.0 — Attribution, No Derivatives** | Viewable, but **remixing is not allowed** |
| **All Rights Reserved** | Viewable, but remixing is not allowed |
| **No license specified** | Remixing is not allowed until you set one |

If you leave a build unlicensed, people can still open and explore it —
they just can't remix it until you pick a license that allows it.

### A remix keeps your credit and your terms

A remix of your build credits you, and it keeps your license's terms
however its new builder changes its license in **Build Properties**:

| Your license | A remix of it may carry |
|---|---|
| **CC0 1.0** | Any license |
| **CC BY 4.0** | Any license except CC0, which would drop your credit |
| **CC BY-SA 4.0** | Only CC BY-SA 4.0 |
| **CC BY-NC 4.0** | Only CC BY-NC 4.0, All Rights Reserved or no license, so a remix of a non-commercial build is never one anyone may sell |

**Build Properties** offers a remix only these licenses, says whose build
it remixes, and keeps the credit to you whichever one is chosen. Remixing
your own build doesn't hold you to anything: your copy takes any license.
Saved pictures and videos of a build carry its builder's name.

### When your build looks like someone else's

When you press **Publish** in the Editor, ForkBuild compares your build
with builds by other people that this device has already seen: ones you
opened, found in **Explore** or passed in World View. If yours looks a lot
like one of them, it says so before publishing: which build, whose, and how
much of it is the same. If you started from their build, open it and choose **Edit a Copy**
instead, so they are credited and their terms are kept (see
[How to remix](#how-to-remix)). If their license doesn't allow copies, ask
them first. If it's your own work, choose **It's my own, publish**. It asks
once each visit, and never stops you publishing.

What it compares, and what it can't know:

- Only the bricks you placed yourself count, so two builds started from the
  same ready-made house don't look alike. Nor do ready-made structures from
  the Build Library, on either side, wherever they stand and however they're
  turned, even when some of their bricks were changed: the changed bricks
  count as yours. A build with fewer than 20 bricks of your own isn't compared:
  small builds look alike too easily.
- A brick counts as the same when it is the same kind of brick in the same
  place, even if your whole build stands somewhere else, is turned a quarter turn or is mirrored. Colours, and which way each brick faces, don't count.
- Two builds look alike when most of both is the same, or when nearly all of
  one (85% or more) stands in the other, so a copy with more of its own added
  is noticed too. What they share has to be at least 20 bricks of at least
  four kinds: walls, a floor or a box of one or two kinds of brick, or the
  walls and roof of two small houses, look alike by chance too often to say
  anything.
- Your own builds, every build in your build's family tree (what it was
  remixed from, its remixes, and every other remix in the same family), and
  builds published after yours was first published are left out.
- A build rebuilt by hand from someone else's, or made from bricks copied
  from it or saved from it to **My Structures**, isn't in its family tree:
  only **Edit a Copy** keeps that link. Such a build is compared like any
  other, since spotting it is what these hints are for.
- It only knows the builds this device has seen, so finding nothing doesn't
  mean nobody has built anything like it. It is a hint, not a judgement:
  builds can look alike by chance, and only you know how you made yours.
  Nothing is sent anywhere or saved.

### When someone uses your build in a way its license doesn't allow

ForkBuild has no company or moderator in the middle: builds travel from
device to device, and a video or picture is made and uploaded by the person
who posts it, on a site ForkBuild doesn't run. ForkBuild can't take a video
down or pay you from it. What it does is make your terms hard to miss and
hard to strip: every published build shows its license, every remix and
video credits you, and anyone making a video of your build is told what
your license asks first. Every copy of ForkBuild honors that, but it isn't
a lock: someone who changed the app's code could ignore it, and what
someone does outside ForkBuild is up to them.

If someone posts or earns from your build against your license:

1. **Ask them first.** Many people don't know the license and will gladly
   add your name and link, take a video down, or share what it earns.
2. **Keep the evidence.** Your build's Publication is a claim signed by
   your identity, carrying its license, and it can be anchored on Arweave
   for a date nobody can change later (see
   [Signed Records and Evidence](09-PublicationsAndEvidence.md)). Keep your
   saved copy and a link to it too.
3. **Use the site's own process.** YouTube, TikTok and the others take
   copyright complaints from the person whose work it is. Only file one when
   the use really isn't allowed: a video *about* a build, such as a review,
   may be allowed without permission in many countries.
4. **For anything serious, ask a lawyer.** Copyright works differently
   from country to country, and this guide isn't legal advice.

In ForkBuild itself you can **Block** someone (see
[Peer Connections and Friends](07-PeerConnectionsAndFriends.md)) so your
device stops connecting to them.

## Choosing who can place it

Other people can normally place your published build in their own
Worlds. That adds a placement of your build, never a copy of it, and it never
moves or changes yours (see
[Why can I place other people's builds?](WorldViewAdvancedTools.md#why-can-i-place-other-peoples-builds)).
Remixing is separate and governed by the license (see
[Placing vs remixing](WorldViewAdvancedTools.md#placing-vs-remixing)).
If you'd rather they didn't place it, open **Build Properties** and set **Who can
place it in the World**:

| Setting | Meaning |
|---|---|
| **Anyone may place it** | The default. Anyone can place it wherever they like in their own World |
| **Only I may place it** | Only you can place it. Other people can still find, view and (if the license allows) remix it, but ForkBuild won't let them place it |

The setting is signed as part of the publication when you publish, so
nobody can remove or change it afterwards. That also means it applies only
to what you publish after choosing it. A publication that's already out
keeps the setting it was published with, so publish again if you want the
new one to apply.

It works the same way the license's remix permission does: every copy of
ForkBuild honors it, but it isn't a lock. Someone who changed the app's code
could ignore it, and it can't take back a placement someone made before you
chose it.

Either way, other people see your build where *you* put it once you
send its Snapshot, as Publish does once you've chosen where your builds go, or
with **Distribute** in World View: the announcement carries your
signed placement, and their ForkBuild shows the build there as soon as it
knows your Shared World. Move it and distribute again, and it moves for them
too.

## Editing a published build

A published build is **immutable** — it can never change after the
fact. To build on one, **Remix** it (below), or use **Edit a Copy** in World
View. In World View, making your first change to a published world — its
metadata, a landmark or region name, or an animal decoration —
automatically creates your own copy, titled *"Remix of &lt;original
name&gt;"*, with a short confirmation ("Created your own editable copy — …
is unchanged"); see
[Save and publish here, too](03-WorldView.md#save-and-publish-here-too).

The original is never touched, no matter how much you change your copy.

## Explore

**Explore** in the top bar (called the *Repository* in older versions) is
the searchable catalog of every published build this device knows about:
your own, ones peers have shared with you, and ones found on decentralized
networks. It's built to stay usable whether it holds ten builds or ten
thousand.

### Ready-made builds

At the top, **Start from a ready-made build** shows the builds that come
with ForkBuild: a castle, a harbor island, a village square, a house, a mill
and a bridge. They're there even before anything is published or found.
Click one (**Remix**) to open your own copy in the Editor; nothing is
published until you publish it. Click the heading to fold the row away.

Under them, **How remixes grow** shows three example families that come
with ForkBuild, each a chain of remixes of a ready-made build: the House,
remixed into a House with a Porch, which was remixed twice more (a House
with a Garden and a House with a Tower); the Watchtower, remixed into a
Lighthouse and then a Lighthouse and Keeper's Cottage; and the Mill,
remixed into a Mill and Granary and then a Farmstead. Each one is its
parent with more added, the way a remix of yours would be. Click any name
to open your own copy of it. They're the app's own examples, never anyone's
publications; they're also in the Build Library's **Structures**, under
*collection*.

### Builds others distributed

Each time you open Explore (or an author's page), it looks on Nostr,
Arweave, Steem and Blurt for builds other people distributed there, and
adds the ones it can verify. A line above the list says what it's doing, then
how many new builds it found; **Check again** looks once more.

- Only a build whose signed record checks out is added: signed by the key
  it names and exactly the build that was announced. Anything else is
  skipped, and a record that failed isn't fetched again.
- It checks up to 20 new builds at a time. If there are more, the line
  says how many are left for next time.
- A build found this way stays in your Explore after a reload.
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

Every build offers three actions:

| Button | What it does |
|---|---|
| **Open** | Load that build into the Editor |
| **Remix** | Copy it into your own editable build |
| **Explore** | Fly to it in World View |

(**My Worlds**' own **Continue Exploring** button — see
[My Worlds](03-WorldView.md#my-worlds--worlds-youve-actually-been-to) — does
the same thing as **Explore** here, just worded for a World you've already
visited rather than one you're finding for the first time.)

Click any **author's name** to visit their **Author view** — a portfolio of
everything they've made, including their originals and all the remixes that grew
from them, using the exact same search/sort/pagination catalog as
Explore, just scoped to that one author.

A card whose signature checks out also has a **Follow** button, and an
Author view shows **Signed by …** with **Follow** for each identity that
published under that name. Following someone puts their new work on your
**Following** page and in your notifications; see
[Following people](07-PeerConnectionsAndFriends.md#following-people).

Explore isn't limited to what was published from this device or
discovered outright, either: a decentralized build a peer
showed you in World View's own
[World Encounters](WorldViewAdvancedTools.md#world-encounters--publications-and-avatars-your-peers-are-sharing)
map, once its content actually resolves, joins this same search and its
author's Author view too, and stays there after a reload. It's shown no
differently from anything else here.

## Remixing: make it your own

**Remixing** is what makes ForkBuild special. When you remix a build:

- You get a **brand-new, independent copy** to edit freely.
- The **original is untouched** — your changes never affect it.
- The copy **remembers where it came from**, so credit is never lost.

It works just like forking a project in Git: you branch off, do your own thing,
and the family tree keeps track of everyone. (In World View it also happens automatically the moment you change a
published world — see
[Editing a published build](#editing-a-published-build) above.)

> **Also called "Edit a Copy" in World View.** It's the same underlying
> operation either way, with the same license rules and the same
> [Can't make a copy](#when-a-remix-cant-complete) handling. See
> [Edit a Copy](03-WorldView.md#edit-a-copy--taking-something-into-the-editor)
> for World View's own walkthrough of it.

### How to remix

1. Find a build in **Explore** (or in World View).
2. Click **Remix**.
3. The copy opens in the Editor, titled *"Remix of &lt;original name&gt;"*.
4. Build on it, then save and publish it as your own.

Your published remix shows up with a **Remixed from "…" by …** note, linking
it back to the original.

### Remix counts

A build's page and its card in Explore say how many times it was remixed
(**Remixed 3 times**): how many different builds this device has found
that were remixed from it and published. A remix published twice counts
once, and a build nobody has remixed shows nothing. The count is only what
this device knows, so another device may show a different number, and it
never decides what is shown first.

When this device finds someone else's remix of one of your builds, your 🔔
gets a **… remixed your build** entry, once per remix (and your device
shows it too, if you turned on
[Notifications on this device](03-WorldView.md#notifications-on-this-device)).

### Hearts

Tap **♡** on a build you love: in World View's **About this build** panel
or on its card in **Explore**. It turns into **♥** and says who loves the
build: **Loved by you and 11 others**. Click that line to see everyone, each
name a link to their page. Tap **♥** again to take your heart back.

A heart is public. It's signed with the name you signed in with, sent to
the people connected to you and to the network chosen for hearts in
**Settings → Announcement / Discovery → Hearts** (Nostr unless you change
it, where other Nostr apps show it as a like), and the builder gets a
**… loves your build** entry in their 🔔. The first time, ForkBuild says so
before sending it. Like the remix count, the number is only what this
device has found, and it never decides what is shown first.

### When a remix can't complete

Occasionally a remix can't go through — most often when remixing a Shared World
found through a peer or a decentralized network (see
[Signed Records & External Evidence](09-PublicationsAndEvidence.md)) rather
than an ordinary build in Explore. Instead of dropping you into a blank,
unrelated Editor build, ForkBuild shows a **Can't make a copy** dialog
naming exactly what went wrong:

- **This build's license doesn't allow copies.** — see
  [Choosing a license](#choosing-a-license) above.
- **This build can't be fetched right now.** — the license allows copies,
  but the build itself isn't on this device (or reachable through a
  connected peer) yet.

Either way, the dialog's one button, **Back to the build**, takes you back
to wherever you found it — the World it was placed in, or the Shared World
itself — rather than leaving you stranded in the Editor with nothing to
build on.

## The weekly build challenge

Every week ForkBuild sets a theme to build (a lighthouse, a bridge, a tiny
home, a harbor, a front porch, …), from Monday to the end of Sunday (UTC).
There are 30 themes, so well over half a year passes before one comes round again,
each with ideas to start from and a twist that makes the week's entries
differ, such as *"Make it wide enough for the hay wagon to cross."* Every
fourth week is a remix week instead (see below). Home shows it, and **Challenge** in
the top bar opens its page.

1. **Join the challenge** opens an empty plot of your own in the Editor,
   named after the theme and already tagged for the week (a tag such as
   `#lighthouse-20261012`, the theme and the Monday it began), with the
   week's ready-made structures pinned at the top of the Build Library's
   **Structures**. The challenge is also the first choice in the Editor's
   **New**, and the page's **Ideas to start from** open one of those
   builds as your own copy instead.
2. Build it your way: drop in an idea if you like, then make it yours.
   Whatever you build enters as long as it keeps the week's tag (add it in
   **Build Properties → Tags** if you started some other way).
3. Publish it before the week ends, and share its link. The link's text
   names the challenge and its tag, ready for a post.

**Seasonal themes.** Some themes belong to a season: a garden in spring, a
summer fair, a harvest store in autumn, a winter cabin or a skating pond.
They're spread among the other themes, so one comes round about every six
weeks, the seasons in turn.
World View's seasons turn much faster than the weeks, so the week doesn't
wait for its season; instead the challenge page suggests choosing that
season under **Season** in World View, to see the entries as they're meant
to be seen.

**Remix weeks.** Every fourth week, starting with the week of 2 November
2026, is a remix week (`#remix-20261102`): instead of a theme, an entry
starts as your own copy of one of the week before's entries. **Join** goes
to the challenge page, which lists last week's entries; **Remix** on one
opens your copy in the Editor, tagged for the week. Your copy remembers
whose it was, so its builder is credited in the family tree. If last week
had no entries, the example remix families are offered instead.

The challenge's page lists the entries this device knows of: your own
published builds with the tag, and others' builds found on the networks.
When a build is distributed to Nostr, Arweave, Steem or Blurt, its announcement (on Blurt, its post) lists its tags, and the page asks those networks for the week's tag each time it
opens (**Check again** asks again). Each entry found is checked like
anything Explore finds, and is listed in Explore too. A build shared only by its link isn't found this way, nor one announced only on Steem before 8 October 2026, when Steem announcements began to list tags. Earlier weeks stay open by their Monday (**Last week: …**), without
**Join**.

Entries are shown newest first, with their remix counts. Nobody judges
them and nothing is ranked: the challenge is a reason to build something
this week, and to see what others made of the same idea.

When entries were remixed from each other, or from other builds,
**Family trees** under the entries shows where they came from, one tree for
each chain of remixes. A week with no entries yet shows the example
families instead (see [Ready-made builds](#ready-made-builds)).

### The challenge plaza

**Walk** in the main menu takes you to this week's plaza, and so does
**Walk the plaza** on the challenge page once a week has entries. It is the
village square of the shared World: the six ready-made builds stand round
it for everyone, always, each with **Remix**, and the week's entries stand
just outside them. Walk among them, or pick one in the panel: **Navigate**
flies to it, **Open** opens it as **Explore** would, and **Edit a Copy**
starts your own copy of it.

- Only the week's entries stand round the square: last week's plaza shows
  last week's entries, and this week's shows this week's.
- Each entry is shown, while you're at the plaza, on a spot round the
  square. It's a copy for the exhibition: the build's own spot, out in the
  World, stays where it is. An entry that was placed round the square
  (builds published from 12 to 17 October 2026 were) stands there itself.
- Other builds placed near the square are left out while you're at the
  plaza, so the square shows its week alone. Nothing happens to them: they
  are back when you leave.
- The panel lists the first 24 entries published. The rest are on the
  challenge page.
- Entries found on the networks are fetched and checked the way opening
  their link would be. One that can't be fetched is left out, and the
  panel says how many were.
- An entry whose publisher chose **Only I may place it** doesn't stand in
  the plaza, since standing it there would be placing it. It stays on the
  challenge page.
- An entry shown on its spot is an exhibit, not a placement: nothing is
  signed or kept for anyone, and it's gone when you leave. Like the rest of World View, the
  plaza shows what this device knows, so two visitors may see a different
  set.

## The family tree

Because every remix records its parent, ForkBuild can draw a build's whole
lineage. On an **Author view**, you'll see a **remix tree**:

```
Medieval House (original)
└─ Remix of Medieval House (by Bob)
   └─ Remix of Remix of… (by Carol)
```

This means a great build can inspire an entire ecosystem of variations —
and everyone in the chain gets credit.

A build's own page, opened from a shared link, shows the same lineage as a
**Family tree**: what it was remixed from, back to the original, then the
build itself, then the remixes made from it, as far as this device knows.
The challenge page shows one for each chain of entries. Each build in the
tree names its author, and the friends who built it with them; its title
opens the build, and each name opens that person's page.

Under each remix in the tree, a line says what it changed from the build
above it (*Added 2 bushes, 4 patches of lawn, and 6 other bricks*), when
this device can read both. The ready-made families on the challenge page
show the same.

### Similar builds published earlier

Under the family tree, a build's page lists builds by other people that were
published before it and look a lot like it, among the builds this device has
seen: each one's title and author, how much of it is the same, and when it
was published. It is how you can find a copy of your build: open the copy's
page, and if yours was published first and looks like it, yours is listed
there. Builds compare as they do when you publish (see
[When your build looks like someone else's](#when-your-build-looks-like-someone-elses)),
except that every brick counts that isn't part of a ready-made structure
from the Build Library (even one changed in part), since only the builder's own device knows
which bricks they placed themselves.

Left out: builds by the same builder (and anyone who built it with them),
the whole family tree, and builds published after it. "Before" goes by the date each build was signed with when it was published. Its builder chooses that date, so this device backs it with when it first saw each build: a build only dated before this one, but first seen here later, is listed as "dated … by its builder, first seen here …", and a build dated after this one that this device saw first is listed as "seen here before this one". A copy can't put itself first just by signing an earlier date, and the 🔔 tells you of a build dated before yours that this device only sees now, saying it is dated before yours.

Builds can look alike by chance, or because they changed the same
ready-made structure in similar ways, so a build listed here doesn't mean
anyone copied.
If you think someone has used your build in a way its license doesn't
allow, see
[When someone uses your build in a way its license doesn't allow](#when-someone-uses-your-build-in-a-way-its-license-doesnt-allow).
Nothing is listed when this device hasn't seen any such build, which doesn't
mean there are none.

World View's **About this build** panel lists them too, under the build's
details. And when this device finds a build by someone else that looks a lot
like one of yours and was published after it, your 🔔 gets a
**… published a build that looks like yours** entry, once per build, saying
how much is the same; it opens that build, whose page lists yours (your
device shows it too, if you turned on
[Notifications on this device](03-WorldView.md#notifications-on-this-device)).
Remixes of your builds aren't counted here: they credit you, and have
[their own notification](#remix-counts).

On your own builds, and only there, your card in **Explore** also says how many builds by other people, published after
yours, look a lot like it (**2 builds published after yours look like it**);
click it to see them. Your own builds are the ones you published from this
device and, from your other devices, the ones signed with a name this device
holds the key for. Only you see this: nobody else's card is labelled in the
list everyone browses.

## A typical creative loop

Here's the whole journey in one flow:

1. **Build** something in the Editor.
2. **Save** it.
3. **Publish** it, and send it to everyone or share its link.
4. Someone **finds** it — by searching, by exploring nearby in World View, or
   by browsing your Author page — and **remixes** it.
5. They **publish** their remix.
6. Others **explore** both in World View, and the tree grows.

That's the open construction ecosystem ForkBuild is built for.

## What's next?

Keep the [Controls Reference](ControlsReference.md) handy while you build, or
go back and explore [World View](03-WorldView.md) in more depth.
