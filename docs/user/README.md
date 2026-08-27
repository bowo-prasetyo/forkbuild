# ForkBuild User Documentation

How-to guides for using ForkBuild in the browser. Everything here
describes the product as it works today; engine internals live in
[docs/Architecture.md](../Architecture.md) and the rest of the
top-level [docs/](..) folder.

## Start here (read in order)

1. **[Getting Started](01-GettingStarted.md)** — open the app, log in,
   and place your first brick.
2. **[The Editor](02-TheEditor.md)** — the building toolkit: tools,
   selection, transforms, groups, composing and forking ready-made
   structures from the Build Library, saving your own builds to a
   personal blueprint library and sharing them as files, placing
   reusable structure instances, and a creation's title/description/
   license.
3. **[World View](03-WorldView.md)** — the shared 3D space every
   published creation lives in: flying around, orienting yourself and
   finding places, searching and exploring to find things, inspecting
   bricks and placed structures, taking something into the Editor with
   **Edit a Copy**, and the operation timeline.
4. **[Publishing & Forking](04-PublishingAndForking.md)** — sharing
   your work, licenses, how forking works (including the automatic
   fork that happens the moment you edit a published creation), and
   browsing the Repository's searchable, sortable, paginated catalog.
5. **[Identity & Login](05-IdentityAndLogin.md)** — your cryptographic
   identity, the vault (locking/unlocking), and backing it up with
   export/import.
6. **[Avatars & Presence](06-AvatarsAndPresence.md)** — customizing how
   you look, controlling who can see you, seeing (and walking
   among) everyone else in World View, and understanding what they're
   doing through spatial awareness.
7. **[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)** —
   connecting directly to other people, remembering, friending, and
   blocking.
8. **[Chat & Conversations](08-ChatAndConversations.md)** — direct,
   friends-only messaging, offline delivery, read receipts, and voice
   calls.
9. **[Publications & External Evidence](09-PublicationsAndEvidence.md)** —
   signed authorship and place-name claims, catalog status, retrieving
   content from peers, optional external evidence: creating, discovering
   from peers, verifying, and inspecting anchors like a Bitcoin timestamp,
   optional snapshot placements: creating, inspecting, resolving,
   materializing, and comparing locators like an IPFS node that can
   currently serve a claim's content (resolving now works through a
   public IPFS gateway, with no local node required), an **IPFS
   Publishing** section for explicitly publishing content to a
   configured remote pinning provider, independently verifying it's
   still retrievable, and inspecting the full history of both, a
   **Local Snapshot** section for checking, importing, and pulling in
   the actual bytes this device holds (from a placement, a peer, or an
   offline file), a **Decentralization** overview comparing your
   evidence and placements, synchronizing knowledge with peers, and
   seeing how each claim was learned, and the **Bitcoin Anchor
   Pipeline** — connecting a real browser wallet and walking a real
   transaction through funding, construction, review, signing,
   cryptographic verification, broadcast, and confirmation.

## Reference

- **[Controls Reference](ControlsReference.md)** — every mouse and
  keyboard interaction in the Editor and World View, in one lookup
  table. If this page and the in-app Command Palette (`Ctrl/Cmd+K`)
  ever disagree, the Palette is right and this page has a bug — please
  report it.
- **[Interactive Transform Gizmo](InteractiveTransformGizmo.md)** — how
  to move and rotate your selection by dragging directly in the
  viewport: handles, the pivot, snapping, committing, cancelling,
  undo, and how groups behave.

## Where you build, where you explore

The Editor is the one place ForkBuild ever builds; World View is a
read-only exploration surface:

- **Editor** (`/editor`) — your private workspace. Place bricks from
  the palette, select them, and transform them with the keyboard or
  the gizmo. Save, load, and publish documents from the toolbar.
- **World View** (`/world/:id`) — the shared spatial world. Fly between
  published worlds, search for and explore what's around you, inspect
  bricks and placed structures, walk your avatar across structures and
  terrain, and use **Edit a Copy** to open whatever you found in the
  Editor, ready to build on.

Whatever you do in the Editor, every change is one undoable step, and
`Ctrl/Cmd+Z` takes it back.

## Collaboration and exploration

ForkBuild gives you embodied collaboration and world discovery:

- **Walk and navigate** — use WASD keys to walk your avatar across
  buildings and terrain, jump, climb, and explore vertical spaces.
- **Build together** — see other builders' avatars and understand what
  they're working on through spatial awareness, then use **Edit a
  Copy** to take something you found into the Editor and build on it
  yourself.
- **Discover the world** — use the compass with contextual location
  markers to find nearby structures and terrain features like forests,
  rivers, and grasslands.
- **Follow collaborators** — lock your camera to follow someone's
  avatar as they move through the world.

Everything you see is derived from the world's deterministic seed —
terrain, ecology, and hydrology are computed identically for everyone,
creating a coherent shared place without storing extra data.

## Reusable structures and blueprints

Beyond individual bricks, the Editor's Build Library lets you build with
whole structures at once — twenty ready-made ones spanning five
categories, plus anything you save yourself:

- **Place** a structure straight into what you're building, or **fork**
  one into a brand-new document of its own.
- **Save your own** builds as reusable structures in **My Structures**,
  your personal blueprint library.
- **Export and import** a blueprint as a portable file to share it with
  someone else, or carry it to another device.

See [The Editor](02-TheEditor.md#structures-composing-forking-and-your-personal-library)
for the full walkthrough.
