# ForkBuild User Documentation

How-to guides for using ForkBuild in the browser. Everything here
describes the product as it works today; engine internals live in
[docs/Architecture.md](../Architecture.md) and the rest of the
top-level [docs/](..) folder.

## Start here (read in order)

1. **[Getting Started](01-GettingStarted.md)** — open the app, log in,
   and place your first brick.
2. **[The Editor](02-TheEditor.md)** — the building toolkit: tools,
   selection, transforms, brick colors, groups, the Build Library's
   structures and your own blueprints, structure instances, and a
   creation's title/description/license.
3. **[World View](03-WorldView.md)** — the shared, read-only 3D space
   every published creation lives in: flying around, finding and
   inspecting things, **Edit a Copy** to take something into the Editor,
   World Encounters shared by your peers, distributing your own
   publication from **My Publication**, commentary and notifications.
4. **[Publishing & Forking](04-PublishingAndForking.md)** — publishing,
   licenses, forking, the Repository catalog, and distributing a
   publication straight from the Editor.
5. **[Identity & Login](05-IdentityAndLogin.md)** — your cryptographic
   identity, the vault (locking/unlocking), backing it up with
   export/import, and managing identities from **My Identities**.
6. **[Avatars & Presence](06-AvatarsAndPresence.md)** — customizing your
   avatar, who can see you, walking, camera perspectives, vehicles,
   animals, and your inventory.
7. **[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)** —
   connecting directly to other people, remembering, friending, blocking,
   automatic reconnection, and your own TURN relay.
8. **[Chat & Conversations](08-ChatAndConversations.md)** — direct,
   friends-only messaging, offline delivery, read receipts, and voice
   calls.
9. **[Publications & External Evidence](09-PublicationsAndEvidence.md)** —
   the technical, optional layer: signed authorship and place-name
   claims, commentary, local snapshots, external evidence and the
   Bitcoin/Base anchor pipelines, snapshot placements, Network Settings,
   IPFS publishing, the observation archive, references, achievements,
   publisher identities, and the Leaderboard pages.

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
