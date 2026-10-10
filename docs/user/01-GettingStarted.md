# 01 — Getting Started

<!-- languages -->
**English** · [Deutsch](de/01-GettingStarted.md) · [Español](es/01-GettingStarted.md) · [Français](fr/01-GettingStarted.md) · [Bahasa Indonesia](id/01-GettingStarted.md) · [日本語](ja/01-GettingStarted.md) · [한국어](ko/01-GettingStarted.md) · [Português (Brasil)](pt-BR/01-GettingStarted.md)
<!-- /languages -->

Welcome! This guide gets you from "just opened the app" to "I built something"
in about five minutes.

## Opening ForkBuild

ForkBuild runs in any current web browser. Open the hosted URL, and you'll
land on the **Home** screen. To run your own copy, serve the folder over HTTP
(for example `python3 -m http.server 8000`, then open
<http://localhost:8000/>): opening `index.html` straight from disk doesn't
work, because browsers won't load its modules from a `file://` page. The
default rendezvous server only serves the hosted site, so a copy of your own
can't use it to find people; connect with invitations instead, or set up a
rendezvous server of your own (see
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)).

The **Home** screen shows a small village turning in 3D and offers three
ways in: **Try it now: start with a house** opens a ready-made house in the
Editor as your own copy, ready to change; **Start from scratch** opens the
Editor on an empty plot; and **Explore builds** opens the Repository. Under
**Start from a ready-made build**, each card (a castle, a harbor island, a
village square, a house, a mill and a bridge) opens your own copy of that
build the same way; the Repository, My Worlds and the Editor's **New** offer
the same builds. Nothing is published or sent anywhere until you choose to.
Home also shows **This week's build challenge**: a theme to build, with
**Join the challenge** (see
[The weekly build challenge](04-PublishingAndForking.md#the-weekly-build-challenge)).

The bar at the top is always visible:

`ForkBuild Home Editor Repository Challenge My Worlds More ▾ 🔔 [Login]`

- **Home** — the landing page
- **Editor** — where you build
- **Repository** — browse everyone's published creations
- **Challenge** — this week's build challenge and its entries, see
  [The weekly build challenge](04-PublishingAndForking.md#the-weekly-build-challenge)
- **My Worlds** — Worlds you've actually visited on this device, see
  [My Worlds](03-WorldView.md#my-worlds--worlds-youve-actually-been-to)

**More** opens the rest, in four groups: **You** (My Avatar, My Identities,
Your Data), **People** (Peers, Following, Conversations), **Advanced**
(Publications, Network Settings) and **App** (Language, About, and
**Install ForkBuild** where the browser can install it). On a phone,
**Menu** shows them all at once.

- **My Avatar** — how you appear to others in World View, see
  [Avatars & Presence](06-AvatarsAndPresence.md)
- **My Identities** — the cryptographic identities stored on this device, see
  [Identity & Login](05-IdentityAndLogin.md)
- **Peers** — the people you're connected, known, or friends with, see
  [Peer Connections & Friends](07-PeerConnectionsAndFriends.md)
- **Conversations** — your direct messages, see
  [Chat & Conversations](08-ChatAndConversations.md)
- **Publications** — signed authorship/place-name claims, where to store
  and announce them, and (*experimental*) their external evidence, see
  [Publications & External Evidence](09-PublicationsAndEvidence.md)
- **Network Settings** — gateways, relays, providers, and peer-connection
  servers, see
  [Network Settings](10-NetworkSettings.md)
- **Language** — the language ForkBuild shows on this device. It follows
  your browser's languages until you choose one; saving reloads the page, so
  save your work first. ForkBuild comes in English, German, Spanish,
  French, Bahasa Indonesia, Japanese, Korean and Brazilian Portuguese (see [Translating ForkBuild](../Translating.md)).
- **About** — version info

## Installing ForkBuild

ForkBuild can be installed as an app, so it opens from your home screen,
dock or app list in a window of its own, and works without a connection.
Click **Install ForkBuild** on the Home screen (or under **More**), then
confirm in the browser's own dialog. In Safari on an iPhone or iPad, the
button says how instead: tap **Share**, then **Add to Home Screen**. Where
the browser can't install apps, or ForkBuild is already installed, the
button isn't shown.

- **Offline.** The first time you open ForkBuild, your browser keeps its
  files, so it opens again with no connection, installed or not: Home, the
  Editor, your saved builds and the ready-made ones all work. Anything that
  needs the network (finding builds and people, distributing, chat and
  calls) waits until you are back online.
- **Updates.** When a new version is out, a line at the top says **A new
  version of ForkBuild is ready**; click **Reload** to start it, or it
  starts by itself the next time you open ForkBuild.
- **Notifications.** An installed ForkBuild (or one open in a background
  tab) can show your notifications through your device; see
  [Notifications on this device](03-WorldView.md#notifications-on-this-device).

This applies to the hosted site. A copy you run straight from the folder
(as above) doesn't install or work offline; one built with
`node scripts/build.mjs` does (see [Deployment](../Deployment.md)).

## Logging in

You don't need to log in to start building. The first time you click
**Publish**, ForkBuild asks you to log in, or to create an identity right
there, because publishing signs your creation. You can also log in at any
time: click **Login** in the top-right corner. ForkBuild doesn't use passwords or
central accounts — instead, **your identity is a cryptographic key pair
stored on this device**. The Log In dialog lists every identity this browser
already holds; click one to use it, or create a new one:

1. Type a **display name** — this is what other people will see.
2. Type a **passphrase** of at least 8 characters, twice. It encrypts your
   key on this device, and there is no reset, so choose one you'll keep.
   (To skip it, tick **Create without a passphrase**; the key is then stored
   unencrypted in this browser.)
3. Click **Create & Log In**.

That's it — you're now signed in, and everything you build, publish, or send
is signed with this identity.

What a passphrase protects, locking and unlocking, and backing your
identity up are all covered in [Identity & Login](05-IdentityAndLogin.md).

## Taking the tour

ForkBuild has several main areas:

| Area | What it's for |
|---|---|
| **Editor** | Build and edit your own creations |
| **Repository** | Search, browse, open, fork, and explore published creations |
| **Author view** | See everything one person has made (open by clicking any author's name) |
| **World View** | Fly through the shared world where all creations live in 3D space, and search or explore to find things |
| **My Avatar / Peers / Conversations** | How you appear to others, who you're connected to, and your direct messages — see the guides linked above |

## Placing your first brick

The first time you open the Editor, a **Your first build** card in the
corner of the 3D view walks you through five steps and ticks each one off
as you do it; see [Your first build](02-TheEditor.md#your-first-build).

1. Click **Editor** in the top bar.
2. In the left sidebar, make sure the **Place** tool is active (press `2`).
3. In the **Build Library** below it, open the **Bricks** tab and click a
   brick — for example, **Cube** under **Basic**.
4. Move your mouse into the 3D viewport. A translucent **ghost** of the brick
   follows the grid.
5. **Click** to place it.

Congratulations — you've built your first brick! 🎉

### Stacking bricks

You don't have to build on the ground. Hover over a **face** of an existing
brick and the ghost snaps to it — click to stack on top, or attach to the side.
This is how you build walls, towers, and roofs.

## Saving your work

Press **Ctrl+S** (or click **Save** in the toolbar). The **● Unsaved changes**
indicator turns into **Saved**.

Your creation is stored in your browser, so it's still there when you come back.
While you edit, ForkBuild also keeps a crash-recovery copy of unsaved changes,
and offers to restore it if the page closes before you save.

Browsers limit how much each site may store, usually to a share of the
disk. If ForkBuild's share fills up, saving and crash recovery stop with a
message saying so; nothing you have open is lost. Use **Export** in the
toolbar to keep a copy of the document as a file. The first time you save,
some browsers ask whether ForkBuild may keep its data permanently; allowing
it stops the browser from clearing it when the disk runs low.

You don't need to be logged in to build. Logging in matters once you
publish or work with other people: a creation you publish while logged out
has no author and no signature, so it can't be shared with peers or
distributed later, and gets no link. Publish asks you to log in first.

## What's next?

- Learn the full building toolkit in **[The Editor](02-TheEditor.md)**.
- Ready to share? Jump to **[Publishing & Forking](04-PublishingAndForking.md)**.
- Set up your identity, avatar, and connections in
  **[Identity & Login](05-IdentityAndLogin.md)**,
  **[Avatars & Presence](06-AvatarsAndPresence.md)**, and
  **[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)**.
