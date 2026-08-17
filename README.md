# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are stored using interchangeable publishing providers and can be explored in a shared spatial world.

## Current Status

**Version 0.2.32** — Client-Side Publication Preview & Lazy Rendering

0.2.16 gave every immutable object an answer to "who authorized
this?" (Ed25519 signing identities, signed publications / placement
revisions / spatial-index roots). 0.2.17 through 0.2.19 build on that
foundation: delegated authorization without transferring ownership,
causal replication so independently authorized replicas converge
without destroying either side's history, and a trust/discovery layer
that reasons about authority, freshness, replay, and equivocation —
not just cryptographic validity — before anything is treated as
current state. 0.2.20 closed a gap that fell out of that same
boundary: the World View can now be fully edited in place while a
published snapshot itself remains absolutely immutable, because
editing one is semantically "fork, then edit the fork" — done lazily,
on the first mutation, subject to the same fork policy as an explicit
Fork. 0.2.21 put a face on that enforcement: a Document Properties
editor, a Document Info panel, lifecycle status, and plain-language
explanations for why an edit is or isn't possible. 0.2.22 closed the
remaining gap between the two: the moment a fork is created, the World
View's title, status line, and browser route now atomically switch to
it — the screen never keeps displaying the published source while
every subsequent edit is silently landing on the fork underneath it.
0.2.23 connects a mature but previously unreachable part of the
architecture: publishing now creates an explicit, ownable, revisioned
Placement — separate from the document's title/description/license —
and the World View can show and move it without ever forking or
editing the document it points to. 0.2.24 formalizes the coordinate
system that placement runs on: a document's own content and a
placement's position are two coordinate systems that compose by
addition, never one; positions the system stores are always absolute,
even when chosen or nudged relatively; and initial placement is now a
pure function of a publication's own id instead of how many other
publications the local node happened to already know about — the
difference between "the same publication lands at the same coordinate
on every replica" actually holding and merely looking like it did in
single-node testing. 0.2.25 answers the question 0.2.24 deliberately
left open: `position` was never made globally unique, so what happens
when two placements share one? Sharing a coordinate is now an explicit,
derived observation (an overlap), never an error by itself; deciding
what to do about it is a separate policy (ALLOW/WARN/REJECT), defaulting
to WARN for an explicit move — the requested position is still what
gets placed, only after the person sees what else is already there and
chooses to proceed — while automatic initial placement stays
frictionless, exactly as 0.2.23 established. 0.2.26 turns the last
three milestones' correctness into something a person can actually
use: a World Search over the same decentralized discovery catalog
every other surface reads from (never a second, UI-only index), a
"Documents Here" list that makes 0.2.25's overlap count something you
can act on instead of just see, and Focus formalized as pure
navigation — it moves the camera and switches the active document, and
never, under any circumstance, forks or edits anything.

0.2.26 also exposed a simplification 0.2.27 closes: "where the camera
is" and "which document an edit lands on" had always been the same
field, which was harmless right up until two publications could share
a coordinate and switching between them stopped requiring the camera
to move at all. WorldNavigationSession now tracks camera focus and the
active (editing) document independently — `focusDocument()` still
moves both together by default, but a document can now become active
without the camera moving, and the camera can move without changing
what an edit would target. Making the split explicit surfaced a real,
previously-latent bug: group operations could independently fork
whatever the camera happened to be pointed at, separately from the
document a selection actually belonged to, mixing one document's
`worldId` with another's `brickIds` whenever the two diverged — fixed
by having every mutation path resolve its target from the selection or
the active document, never from camera position. The World View header
now shows "Camera: X · Editing: Y" so this is visible, not just
correct.

0.2.28 gives World Search a spatial half: "find everything within
`radius` World Units of `(x, y, z)`," composable with the 0.2.26 text
search rather than a separate mechanism — one query, both criteria.
Results carry a derived `distance` (never persisted — computed fresh
against whatever center was actually asked about) and are sorted
nearest-first; a publication found only through 0.2.24's deterministic
fallback position still honestly reports `hasPlacement: false`, so a
radius search can never present a fallback as an authored location.
The query is written against a decentralized contract — everything
discoverable within the region, not just what one node's local cache
holds — even though the live implementation is still today's honest,
un-decentralized `LocalWorldLayoutProvider` scan; swapping in a real
spatial-index-backed provider later changes nothing about how any
caller uses it.

0.2.29 makes that spatial query reachable from where a person actually
is, rather than requiring they already know a document's name or type
coordinates by hand: "Explore Here" and "What's Here?" turn the
CAMERA's current world position into a query center — deliberately not
the active document's placement, since 0.2.27 already established that
the two can genuinely differ, and a person looking at empty space
between two documents should still be able to explore there. Both
reuse the exact same spatial query 0.2.28 built (`exploreLocation` is
a thin wrapper over `searchWorldByLocation`); "What's Here?" just asks
it with a small fixed tolerance instead of a chosen radius, since a
continuous camera coordinate essentially never lands exactly on a
recorded placement. Each result in the new World Location Browser
supports three read-only actions — Focus (moves the camera, and by
default makes the document active, exactly like Focus always has),
Select (makes it the active document without moving the camera, per
0.2.27's separation), and Inspect (an inline, read-only expansion of
Document Info and Placement Info that never loads or navigates) — and
never moves a placement, edits a document, forks anything, or
publishes; those remain separate, deliberate actions elsewhere. The
result count reads "Showing N of N discoverable documents," the same
decentralized honesty 0.2.26/0.2.28 already established: what the
configured discovery provider can currently find, not a claim of
omniscient knowledge.

0.2.30 answers the question those milestones left open: how does a
decentralized World View know that what it found is trustworthy,
current, and complete enough to present? `exploreLocation` now returns
`{ documents, diagnostics }` — the document list is completely
unaffected by trust (a stale, conflicting, or unverifiable document is
still shown, never hidden), while `diagnostics` reports, honestly and
separately, what an OPTIONAL trust-capable provider observed about
that same region: `available: false` when no such provider was even
consulted (today's live default — the app still resolves documents
through the plain `LocalWorldLayoutProvider`, unchanged); `fatal` when
a provider was consulted but its index root/authority couldn't be
trusted at all; `complete: true` when the trust layer ran and found
nothing to flag; or itemized `warnings` (a stale accelerator entry, an
unavailable manifest, a rejected record, an unresolved conflict) when
it found something real. The Location Browser shows this as a banner
above its results — "✓ Discovery complete," "⚠ 1 stale entry," or a
neutral "diagnostics unavailable" note — and Inspect can now show a
specific document's own discovery status alongside its Document/Placement
Info. Nothing here is invented by the UI: every field traces back to a
real `TrustObservation` the 0.2.19 verification pipeline actually
produced when a real `DecentralizedSpatialDiscoveryProvider` was
wired and run (see tests/DiscoveryDiagnosticsSummary.test.js).

0.2.31 turns Repository/Author View from a small demo catalog into a
real, repository-scale browsing surface — a proper catalog model
first, then the UI on top of it. `SearchPublicationsUseCase` answers a
genuinely different question than World Search does ("which
publications match this description?" vs. "where is this in the
world?"), returning a `PublicationPage` — items plus enough metadata
to render explicit pagination (deliberately not infinite scroll — see
docs/Architecture.md). Ordering is one of a small set of meaningful
sorts (Recently/Oldest Published, Title A–Z/Z–A, Author A–Z) and is
provably deterministic across replicas: identical timestamps always
break their tie the same way, via an ordinal (not locale-dependent)
comparison. Every card/row now shows a truncated description and a
deterministic placeholder preview (a color + initial derived from the
publication itself — a real, signed, content-addressed preview is
deliberately deferred, since adding one to `Publication`'s already-signed
schema would retroactively break every existing publication's
signature; see docs/Principles.md). Description SEARCH is opt-in via
an explicit checkbox, since matching it means loading full documents —
a real cost this milestone is honest about rather than hiding.
Repository and Author View now share ONE `PublicationCatalog`
component rather than two slowly-diverging implementations, differing
only by an author scope. Tested against a 10,000-publication synthetic
catalog, not a handful of fixtures — pagination walks every page with
zero gaps or duplicates, in exact sorted order. See
[docs/Architecture.md](docs/Architecture.md) for the full write-up of
each milestone.

0.2.32 answers the preview question 0.2.31 deliberately left open —
and reverses its own earlier lean toward a signed, content-addressed
preview. A THUMBNAIL is rendered client-side, on demand, from a
publication's actual immutable document content (never from
user-supplied metadata, so a beautiful thumbnail can never advertise a
trivial document), using a deterministic camera framing (fixed
isometric angle, bounding-sphere distance so the whole object always
fits) computed as pure geometry in `core/PreviewCameraFraming.js` —
the same content always gets the same intended shot, though not
byte-identical pixels across GPUs, since a preview is a derived
visualization, not a cryptographic artifact. Generation is lazy
(`IntersectionObserver`-gated — a card off-screen never renders),
queued off the main thread (`requestIdleCallback`), cancellable (an
old page's or an old search's in-flight previews simply stop when
their cards unmount), and cached in memory only, keyed by content
identity, with LRU eviction. A preview failure never hides the
publication it belongs to — it just falls back to 0.2.31's existing
placeholder. Nothing about a preview is signed, persisted, or
replicated: see docs/Principles.md, "Previews Are Derived Client
State."

## Features

- **Command Surface (0.1.50)** — One action registry driving shortcuts, the command palette (Ctrl/Cmd+K), and the sidebar; consistent feedback; disabled states with reasons; empty-state guidance.
- **Numeric Transform Input (0.1.49)** — Exact translation and rotation values with absolute/relative modes, bypassing gesture snapping.
- **Alignment & Distribution (0.1.48)** — Nine world-axis alignment operations and even center distribution along X/Y/Z, through the unified transform command path.
- **Transform Precision (0.1.47)** — Grid/increment snapping with Shift precision mode, identical for keyboard and pointer.
- **Interactive Transform Gizmo (0.1.46)** — Axis handles, free-move pad, rotation ring; one undo step per drag; identical in both views.
- **Groups (0.1.43)** — Create, rename, duplicate, delete; selections resolve to member bricks and transforms never touch membership.
- **Clipboard (0.1.42)** — Copy/paste selections through the command path.
- **Editor** — Place, select (single/multi/marquee), move, rotate, delete, undo/redo, grid snapping, placement preview.
- **Command Replay / Operation Timeline (0.1.39)** — Serialized command histories that replay exactly.
- **Brick Palette** — Core library with dimension-aware definitions (cube, slope, plate, window).
- **Persistence** — Save and load documents via localStorage with a document manifest.
- **Identity** — Local username-based identity provider; author attribution on documents and publications.
- **Publishing & Discovery** — Publish documents to a local discovery catalog; browse Repository View and Author View.
- **Forking** — Derive new documents from existing ones with fresh instance IDs and preserved lineage.
- **Spatial World View** — Free camera navigation through a shared coordinate system where multiple worlds stream in and out based on camera position.
- **Decentralized Spatial Discovery (0.2.15)** — cell-based immutable spatial index manifests; viewport queries fetch only intersecting cells; stale-index-tolerant resolution.
- **Decentralized Identity & Signatures (0.2.16)** — Ed25519 signing identities, canonical signing envelopes with domain separation, signed publications/placements/index roots, and authorization verification in decentralized discovery.
- **Delegated Ownership & Authorization (0.2.17)** — signed, narrowly-scoped delegations (e.g. "place this publication," optionally region-constrained) that let someone other than the resource owner act with explicit, verifiable authority, without transferring ownership.
- **Decentralized Replication & Conflict Handling (0.2.18)** — causal (vector-clock) history on every placement revision; independently authorized replicas that edit the same placement while disconnected converge deterministically on reconciliation, with every competing revision retained and verifiable rather than one silently overwriting the other.
- **Trust & Discovery Hardening (0.2.19)** — a trust-policy layer (pinned/discovered/untrusted authorities, legacy-content tolerance) and equivocation detection (an authority signing two different index roots at the same causal position) sit around the discovery pipeline, plus a structured diagnostics surface explaining exactly why a query returned what it did.
- **Fork-on-Edit & Immutable Snapshot Lineage (0.2.20)** — the World View lazily forks a published snapshot on its first mutation instead of ever mutating it in place; viewing never forks, exactly one fork is created per editing session, the fork carries `parentDocumentId` provenance through the existing forking mechanism, and fork policy (0.2.13 licensing) still governs whether the fork may happen at all.
- **Document Lifecycle & Metadata UI (0.2.21)** — a Document Properties editor (title/description/license) and a shared Document Info panel across the Editor and World View, showing computed lifecycle status (Draft/Saved/Published) and fork lineage; publishing now validates a title and non-empty content before creating anything immutable; a blocked or about-to-fork edit is explained in plain language, proactively and reactively, instead of failing silently.
- **Fork Transition & World View Document Switching (0.2.22)** — the moment fork-on-edit creates a fork, the World View's title, status badge ("🔒 Published" / "✎ Editing fork — forked from …"), and browser route atomically switch to it, re-derived from the session's active document on every interaction rather than a value frozen at page load; camera and scene position are untouched, only document identity changes; a denied fork leaves everything pointed at the source.
- **World Placement & Spatial Positioning (0.2.23)** — publishing now creates an explicit, signed, revisioned Placement (position/rotation/scale) kept entirely separate from the document's title/description/license; a Placement panel shows position/revision/owner with Focus/Move controls, and moving a placement never edits or forks the document it points to — a still-published, un-forked world can be repositioned exactly as freely as a fork can.
- **World Coordinate Semantics & Placement UX (0.2.24)** — a document's own content and a placement's position are now an explicit, documented contract (canonical origin, right-handed axes, a named "World Unit" that deliberately does not claim to be a meter); initial placement is a pure, deterministic function of a publication's own id instead of a locally-observed publication count, so the same publication lands at the same coordinate on every replica; the Move Placement dialog gains relative nudge buttons as a convenience over the same absolute, persisted position.
- **Spatial Allocation & Placement Collision Policy (0.2.25)** — two placements sharing a world position is now an explicit, derived observation (an overlap), never an error by itself and never persisted as its own entity; a configurable policy (ALLOW/WARN/REJECT) decides what happens next, defaulting to WARN for an explicit Move Placement request — the requested position is still what gets placed, only after the person sees who else is already there and confirms — while automatic initial placement stays frictionless; the Placement panel passively shows "N other documents share this location" regardless of how a placement got there.
- **World Navigation & Spatial Discovery UX (0.2.26)** — a World Search panel finds any published document by title or author over the same decentralized discovery catalog every other surface reads from, regardless of camera position, and reports whether it resolved a real recorded placement or a deterministic fallback position; a "Documents Here" dialog turns 0.2.25's passive overlap count into an actual, choosable list; Focus is formalized as pure navigation — camera + active document only, never a mutation, never a fork.
- **World View Context & Selection Model (0.2.27)** — camera focus and the active (editing) document are now tracked independently rather than as one field: focusing a document still moves both by default, but the active document can now change (e.g. by selecting a brick) without moving the camera, and the camera can move without changing what an edit targets; every mutation path resolves its target from the selection or the active document, never from camera position, closing a real latent bug where group operations could mix one document's `worldId` with another's `brickIds` whenever the two had diverged; the header now shows "Camera: X · Editing: Y" whenever they might differ.
- **Spatial Query & Location Discovery (0.2.28)** — World Search gains a spatial half, composable with the existing text search: "find everything within a radius (in World Units) of a coordinate," backed by the same decentralized discovery contract as text search rather than a local-cache-only scan; results carry a derived `distance` (never persisted) and sort nearest-first, and a publication resolved only through 0.2.24's deterministic fallback position still honestly reports no explicit placement rather than presenting a fallback as an authored location.
- **World Location Browser & Spatial Exploration (0.2.29)** — "Explore Here" and "What's Here?" turn the camera's own world position into a spatial-query center, reusing 0.2.28's query rather than building a second one; each result supports strictly read-only Focus / Select / Inspect actions (moving the camera, changing the active document without moving the camera, and an inline Document/Placement Info expansion that never loads or navigates, respectively); the result count reads "Showing N of N discoverable documents" to keep the same decentralized honesty text/spatial search already established.
- **Trust-Aware Spatial Discovery & Diagnostics (0.2.30)** — `exploreLocation` returns `{ documents, diagnostics }`: the document list is never filtered or reordered by trust, while `diagnostics` (available/fatal/complete/warnings, derived from real 0.2.19 `TrustObservation`s via an optional `spatialDiscoveryProvider`) honestly reports what a trust-capable provider could verify about that region — shown as a banner in the Location Browser and a per-document "Discovery status" in Inspect; the live app's own document resolution is completely unchanged.
- **Publication Catalog & Repository UX (0.2.31)** — Repository/Author View share one `PublicationCatalog` component with real pagination, deterministic sort (5 orders, ordinal comparison, guaranteed-consistent tiebreaks), Cards/List views, presentation-only grouping (author/date/license), a deterministic placeholder preview per publication, and search that opt-in extends to full document descriptions; `SearchPublicationsUseCase` is a deliberately separate query from World Search, answering "which publications match this?" rather than "where is this in the world?"; tested against a 10,000-publication synthetic catalog.
- **Client-Side Publication Preview & Lazy Rendering (0.2.32)** — Repository/Author View cards render a real thumbnail generated locally from a publication's actual document content, never from user-supplied metadata; a deterministic camera framing (fixed isometric angle, bounding-sphere distance) means the same content always gets the same intended shot; generation is lazy (only for cards actually scrolled into view), off the main thread, cancellable when a page or search changes, and cached in memory only, keyed by content identity — nothing about a preview is signed, persisted, or replicated, and a preview failure never hides the publication it belongs to.
  
## Architecture

ForkBuild is layered as **core / application / renderer / ui**, with infrastructure adapters (storage, publisher, discovery, serializer, world-layout) surrounding them.

- **core/** — Pure domain model: World, Building, Brick, events. No Three.js, no Vue.
- **application/** — Use cases, editor state, commands, the transform gesture transaction, shared transform math, and the command subsystem (CommandHistory, CommandRegistry). As of 0.1.50 also the EditorActionRegistry / EditorActionContext / InputRouter action layer — above the kernel, never inside it.
- **renderer/** — Three.js incremental renderer, picking, camera, overlay layers, and the interactive transform gizmo.
- **ui/** — Vue 3 Composition API views and components.

The editing stack, end to end:

```
Command Palette / Sidebar / Shortcuts
│
▼
EditorActionRegistry (actions — not commands)
│
▼
Existing Sessions
│
┌─────────────┼─────────────┐
▼ ▼ ▼
Selection Transform Groups/Clipboard
│ │ │
└─────────────┼─────────────┘
▼
Existing Commands
│
▼
CommandHistory
```

See [docs/Architecture.md](docs/Architecture.md) for the full architectural overview and [docs/user/](docs/user/README.md) for how-to guides.

## Documentation

- [docs/Architecture.md](docs/Architecture.md) — engine architecture, layer rules, milestone notes.
- [docs/Roadmap.md](docs/Roadmap.md) — milestone roadmap.
- [docs/Protocol.md](docs/Protocol.md) — the ForkBuild Protocol.
- [docs/Principles.md](docs/Principles.md) — engineering principles, including "Actions are not commands".
- [docs/user/README.md](docs/user/README.md) — user guides, including the [Controls Reference](docs/user/ControlsReference.md) (generated from the action registry) and the [Interactive Transform Gizmo guide](docs/user/InteractiveTransformGizmo.md).

## Quick Start

Open `index.html` in a modern browser. No build step is required. Press **Ctrl/Cmd+K** in the Editor or World View to open the command palette.

## Roadmap

- [x] 0.1.1 – 0.1.38 — engine foundations through Transform Gizmo & Group Pivot (see docs/Roadmap.md)
- [x] 0.1.39 Command Replay / Operation Timeline
- [x] 0.1.40 Advanced Selection & Grouping
- [x] 0.1.41 Unified Transform Architecture
- [x] 0.1.42 Clipboard & Editing Kernel Consolidation
- [x] 0.1.43 Groups & Selection Separation
- [x] 0.1.44 Transform Parity & Group Gizmo Architecture
- [x] 0.1.45 Advanced Selection & Editor Group Surface
- [x] 0.1.46 Interactive Transform Gizmo & Viewport Editing Parity
- [x] 0.1.47 Transform Precision, Snapping & Editing Polish
- [x] 0.1.48 Alignment & Distribution Tools
- [x] 0.1.49 Numeric Transform Input
- [x] 0.1.50 Editing UX Consolidation & Command Surface
- [x] 0.1.51 Stability / Performance / Large-Document Hardening
- [x] 0.1.52 Protocol & Persistence Hardening
- [x] 0.2.0   Durable Documents & Publishing Boundary       
- [x] 0.2.1   Editor / World Editing Parity                 
- [x] 0.2.2   Schema Versioning & Real Migration Fixtures   
- [x] 0.2.3   Publish / Unpublish Lifecycle                 
- [x] 0.2.4   Read-only Published World                     
- [x] 0.2.5   World Placement & Spatial Discovery
- [x] 0.2.6   Persistence, Recovery & Autosave
- [x] 0.2.7   Collaboration Protocol Foundation           
- [x] 0.2.8   Fork / Edit Published World                 
- [x] 0.2.9   Multi-client Synchronization                
- [x] 0.2.10  Decentralized Placement Registry
- [x] 0.2.11  Spatial Discovery & Content Resolution
- [x] 0.2.12  World View Streaming & Runtime Integration  ✓
- [x] 0.2.13  Publication Licensing & Fork Policy
- [x] 0.2.14  Decentralized Content Backend
- [x] 0.2.15  Decentralized Spatial Discovery
- [x] 0.2.16  Decentralized Identity & Signatures
- [x] 0.2.17  Delegated Ownership & Authorization
- [x] 0.2.18  Decentralized Replication & Conflict Handling
- [x] 0.2.19  Trust / Discovery Hardening
- [x] 0.2.20  Fork-on-Edit & Immutable Snapshot Lineage
- [x] 0.2.21  Document Lifecycle & Metadata UI
- [x] 0.2.22  Fork Transition & World View Document Switching
- [x] 0.2.23  World Placement & Spatial Positioning
- [x] 0.2.24  World Coordinate Semantics & Placement UX
- [x] 0.2.25  Spatial Allocation & Placement Collision Policy
- [x] 0.2.26  World Navigation & Spatial Discovery UX
- [x] 0.2.27  World View Context & Selection Model
- [x] 0.2.28  Spatial Query & Location Discovery
- [x] 0.2.29  World Location Browser & Spatial Exploration
- [x] 0.2.30  Trust-Aware Spatial Discovery & Diagnostics
- [x] 0.2.31  Publication Catalog & Repository UX
- [x] 0.2.32  Client-Side Publication Preview & Lazy Rendering

Nested Groups remains optional and is not on the roadmap yet — the flat-group model has proven sufficient through 0.1.50. Automatic collision resolution (silently relocating onto a free cell), geometric/bounds-based collision detection, box selection/collision geometry/polygon regions/spatial clustering in the location browser, fully wiring the decentralized spatial index as the World View's actual document-resolution backend ("spatial streaming/index integration," proposed, not started — 0.2.30 already connects its trust/diagnostics vocabulary as an optional, additive source), an indexed metadata representation for description search at real decentralized scale, license/tag filters, cross-page grouping, and infinite scroll (deliberately not implemented — see docs/Principles.md) are similarly deferred until real usage shows each is actually needed — see docs/Roadmap.md. (A real, immutable, content-addressed publication preview is no longer on this list — 0.2.32 concluded a signed preview was never the right design; see docs/Principles.md, "Previews Are Derived Client State.")

## License

Mozilla Public License Version 2.0
