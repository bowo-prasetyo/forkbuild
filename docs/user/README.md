# ForkBuild User Documentation

How-to guides for using ForkBuild in the browser. Everything here
describes the product as it works today; engine internals live in
[docs/Architecture.md](../Architecture.md) and the rest of the
top-level [docs/](..) folder.

## Start here (read in order)

1. **[Getting Started](01-GettingStarted.md)** — open the app, log in,
   and place your first brick.
2. **[The Editor](02-TheEditor.md)** — the building toolkit: tools,
   selection, transforms, groups, placing reusable structure instances,
   and a creation's title/description/license.
3. **[World View](03-WorldView.md)** — the shared 3D space every
   published creation lives in: flying around, orienting yourself and
   finding places, searching and exploring to find things, inspecting
   bricks and placed structures, editing in place, and the operation
   timeline.
4. **[Publishing & Forking](04-PublishingAndForking.md)** — sharing
   your work, licenses, how forking works (including the automatic
   fork that happens the moment you edit a published creation), and
   browsing the Repository's searchable, sortable, paginated catalog.
5. **[Identity & Login](05-IdentityAndLogin.md)** — your cryptographic
   identity, the vault (locking/unlocking), and backing it up with
   export/import.
6. **[Avatars & Presence](06-AvatarsAndPresence.md)** — customizing how
   you look, controlling who can see you, and seeing (and walking
   among) everyone else in World View.
7. **[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)** —
   connecting directly to other people, remembering, friending, and
   blocking.
8. **[Chat & Conversations](08-ChatAndConversations.md)** — direct,
   friends-only messaging, offline delivery, and read receipts.

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

## The two places you build

ForkBuild has two editing surfaces, and they behave the same way:

- **Editor** (`/editor`) — your private workspace. Place bricks from
  the palette, select them, and transform them with the keyboard or
  the gizmo. Save, load, and publish documents from the toolbar.
- **World View** (`/world/:id`) — the shared spatial world. Fly between
  published worlds, search for and explore what's around you, inspect
  bricks, and — with the same gizmo — edit them in place.

Whatever you do in either surface, every change is one undoable step,
and `Ctrl/Cmd+Z` takes it back.
