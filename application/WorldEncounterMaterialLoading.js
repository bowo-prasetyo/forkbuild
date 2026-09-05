import { describeWorldEncounterSelectionIdentity } from '../core/WorldEncounterSelectionIdentity.js';
import { LOCAL_WORLD_DISCOVERY_ORIGIN } from './WorldEncounterIntegration.js';

// 0.9.21 — World Encounter Material Loading Boundary.
//
// 0.9.20 finished the selection problem: a Wanderer's click now resolves,
// automatically or through an explicit "Choose Source" pick, all the way
// down to one specific { kind, objectId, origin } — a resolved SELECTION.
// Nothing in this codebase has ever asked the next question a resolved
// selection makes askable for the first time: given that identity, WHAT
// MATERIAL is the system asking to load, and from where? This file is
// that question's contract — the seam a future local loader (0.9.22+)
// and a future peer loader (0.9.23+) will each answer on their own,
// without either one ever having to renegotiate this shape.
//
//   WorldEncounterCanvas's own
//        resolvedEncounterSelection = { kind, objectId, origin }   (0.9.20)
//                       │
//                       ▼
//   application/WorldEncounterMaterialLoading.js   ★ (THIS milestone)
//        loadWorldEncounterMaterial()
//                       │
//           origin === 'local'         origin starts with 'peer:'
//                       │                          │
//                       ▼                          ▼
//          materialSources.local          materialSources.peer
//        (a WorldEncounterMaterialSource, injected by the caller —
//         neither implementation exists yet; see "Deliberately
//         excluded," below)
//                       │
//                       ▼
//        { status, resolvedSelection, material }
//                       │
//              ┌────────┴────────┐
//              ▼                 ▼
//        UNAVAILABLE         AVAILABLE
//     (no selection, no     (the registered source
//      source, or no         actually had it)
//      material)
//                       │
//                       ▼
//   future, unscheduled: 0.9.22 (local loading), 0.9.23 (peer loading),
//   material verification (unscheduled)
//
// ESTABLISHES THE SEAM; PERFORMS NO LOADING OF ITS OWN. This file never
// reads localStorage, never opens a WebRTC data channel, never imports
// StorageProvider or PeerMessageBus, and ships with no concrete
// WorldEncounterMaterialSource of any kind. Its only exports are a
// STATUS vocabulary, a base CONTRACT class, and a DISPATCH function that
// routes a resolved selection to whichever source (if any) a caller
// injected — the actual answer to "how do I retrieve material from local
// disk" or "how do I retrieve it from a specific peer" is deliberately
// not decided here, per the task's own framing: "the loader should
// initially be an interface/boundary, not an implementation."
//
// `WorldEncounterMaterialSource` IS THE CONTRACT A FUTURE LOADER
// IMPLEMENTS — MIRRORING `content/ContentStore.js`'s AND
// `discovery/ContentResolver.js`'s OWN "throw if unimplemented" SHAPE,
// ONE LAYER OVER FOR A DIFFERENT SUBSYSTEM. A `load(resolvedSelection)`
// call returns a `Promise` that resolves to that source's own material,
// or to `null`/`undefined` when the source does not currently have it —
// `null` means "not currently available," the same "resolves to null,
// never throws, for absence" contract `content/IpfsGatewayContentStore.js`
// already holds one layer down for exactly the same reason. This
// milestone never subclasses `WorldEncounterMaterialSource` itself —
// calling `.load()` on the base class always throws, on purpose, so a
// caller that forgets to inject a real source fails loudly during
// development rather than silently returning UNAVAILABLE for the wrong
// reason.
//
// ORIGIN DECIDES WHICH SOURCE SLOT, NEVER WHICH SPECIFIC PEER. Per the
// task's own suggested architecture, `materialSources` has exactly two
// slots — `local` and `peer` — decided by 0.9.5's own origin FAMILY
// (`origin === 'local'`, imported from `application/
// WorldEncounterIntegration.js`'s own `LOCAL_WORLD_DISCOVERY_ORIGIN`
// rather than retyped, vs. `origin` starting with `'peer:'`). This file
// never parses a specific peer identity out of `origin` and never keeps a
// map of one source per peer — `resolvedSelection.origin` is forwarded to
// whichever single `peer` source was injected, and figuring out which
// live connection that origin actually names is that source's own job,
// entirely below this boundary.
//
// `resolvedSelection` IS FORWARDED VERBATIM, NEVER MUTATED, NEVER
// RESHAPED. The exact object reference a caller passes in comes back
// unchanged on both `UNAVAILABLE` and `AVAILABLE` results (`null` only
// when no well-formed selection was supplied at all) — this file never
// adds a field to it, never re-derives a copy of it, and never freezes it
// a second time (0.9.19's and 0.9.20's own output is already frozen).
// `describeWorldEncounterSelectionIdentity()` (0.9.19, unmodified) is
// used only to VALIDATE the shape — its own freshly-derived return value
// is discarded, never substituted for the caller's own reference. This is
// a deliberate difference from 0.9.20's own `UNAVAILABLE` (which always
// carries `resolvedSelection: null`, because zero candidates means there
// is genuinely nothing to name): here, a well-formed selection can be
// perfectly real and still have no material currently available for it —
// collapsing that case down to `resolvedSelection: null` would erase the
// one fact ("origin") the task explicitly asked this file to keep
// meaningful even when nothing loads.
//
// `material` IS NEVER INTERPRETED, VERIFIED, OR EVEN INSPECTED — IT IS
// FORWARDED EXACTLY AS A SOURCE RETURNS IT. This file does not know, and
// does not ask, what shape a publication's material takes versus an
// avatar's — `kind` is forwarded as part of `resolvedSelection`, and
// whatever a source resolves to is handed back byte-for-byte. No parsing,
// no schema check, no signature read. That is explicitly later,
// unscheduled work (Material Verification, unnumbered — see 0.9.24's own
// header for why the number this comment once reserved now names a
// different milestone, Decentralized World Discovery Source Boundary)
// — see "Deliberately excluded," below.
//
// TWO STATUSES, NEVER A THIRD. `WorldEncounterMaterialLoadStatus` holds
// exactly `UNAVAILABLE` and `AVAILABLE` — no `PENDING`, `LOADING`,
// `ERROR`, or `NOT_FOUND` vocabulary. A missing/malformed
// `resolvedSelection`, a `materialSources` slot with nothing registered
// for the resolved origin family, and a registered source that itself
// resolves to `null`/`undefined` are all exactly the same `UNAVAILABLE`
// outcome — the same "zero/nothing means unavailable, never a
// distinguished special case" posture 0.9.16 through 0.9.20 already hold
// throughout this chain, continued here rather than reinvented.
//
// NO CACHING, NO RETRY, NO AUTOMATIC FALLBACK BETWEEN SLOTS. Every call
// to `loadWorldEncounterMaterial()` calls the matching source's own
// `load()` exactly once, fresh — never memoized, never retried on
// failure, and never re-tried against `materialSources.local` after
// `materialSources.peer` came back `UNAVAILABLE` (or vice-versa). Per the
// task's own framing, "the resolved origin should remain meaningful" —
// silently trying a different origin than the one selection actually
// resolved to would make that origin a suggestion rather than a fact.
//
// A THROWN REJECTION IS NEVER SWALLOWED. Unlike a `null`/`undefined`
// resolution (an honest "I don't have it"), a rejected `load()` promise —
// a genuine network failure, a malformed source, a bug — is never caught
// and translated into `UNAVAILABLE` here. This file does not yet decide
// what "material temporarily unreachable" should look like to a caller
// (retry UI, an error banner, a distinct status) — inventing that policy
// now, with no real source ever throwing for a real reason yet, would be
// exactly the kind of guess this milestone exists to avoid. A caller of
// `loadWorldEncounterMaterial()` awaits it like any other promise and
// handles a rejection on its own, for now.
//
// `ui/components/WorldEncounterCanvas.js` IS UNTOUCHED. Exactly like
// 0.9.19 left the UI alone while naming provenance one layer below it,
// this milestone leaves it alone again while naming material loading one
// layer below IT. `resolvedEncounterSelection` (0.9.20) is already the
// exact shape this file's own `resolvedSelection` argument expects — a
// future milestone that actually wires a "Load Material" action into the
// UI, once `materialSources.local`/`materialSources.peer` name real
// implementations, does so without this file's own contract changing.
//
// SYNCHRONOUS VALIDATION, ASYNCHRONOUS RESULT — DELIBERATELY, NOT BY
// ACCIDENT. Every other file in the 0.9.16-0.9.20 chain is "synchronous,
// pure, no clock" because each one only ever transforms already-in-hand
// data. This file is different on purpose: "loading material" names an
// operation that is inherently I/O-bound for every real implementation
// (at minimum an event-loop turn for a disk read; a network round trip
// for a peer fetch) — an async contract now is what lets 0.9.22 and 0.9.23
// each plug in a real, naturally-asynchronous source later without this
// boundary's own signature ever changing. `loadWorldEncounterMaterial()`
// still performs no I/O of its own in this milestone — the `await` below
// resolves instantly for every `materialSources` value this file's own
// tests ever construct, because none of them do real I/O either.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A `StorageProvider`-backed local material source.** Separate,
//   later, unscheduled work (0.9.22).
// - **A peer-transport-backed material source — `PeerMessageBus`,
//   `PeerConnection`, WebRTC, or WebSocket of any kind.** Separate,
//   later, unscheduled work (0.9.23).
// - **`localStorage` access, or any network request, of any kind.**
// - **Signature verification or any trust decision.** A resolved
//   selection's own material, once actually loaded, is still unverified
//   — see 0.9.0's own "no score, rank, trust, verified... vocabulary of
//   any kind," continued here.
// - **Caching, retrying, or automatically falling back between
//   `materialSources.local` and `materialSources.peer`.** See "No
//   caching, no retry, no automatic fallback between slots," above.
// - **Interpreting, parsing, or rendering the `material` a successful
//   result carries.** See "material is never interpreted," above.
// - **Any change to `ui/components/WorldEncounterCanvas.js`, or to the
//   shape of `resolvedEncounterSelection`.** See "WorldEncounterCanvas.js
//   is untouched," above.
// - **Mutating `resolvedSelection` in any way.** See "resolvedSelection
//   is forwarded verbatim," above.
//
// 0.9.166 — Snapshot World Encounter Material Loading.
//
// 0.9.165's own World Discovery Participation Audit (Section F) proved a
// genuine, previously invisible gap in `materialSourceFor()`, below: a
// registered Snapshot's own `"snapshot:<contentHash>:<publicationId>"`
// origin (application/MaterializedSnapshotWorldDiscoveryBridge.js, 0.9.160,
// updated 0.9.163) matched neither the `origin === 'local'` branch nor the
// `origin.startsWith('peer:')` branch — both written well before Snapshot
// existed as a World source family — so `loadWorldEncounterMaterial()`
// reported `UNAVAILABLE` unconditionally for it, no matter what a caller
// supplied. This milestone closes exactly that one branch, and nothing
// else.
//
//   snapshot:<contentHash>:<publicationId>
//                  │
//                  ▼
//   materialSourceFor()   ★ (THIS milestone's own one new branch)
//                  │
//                  ▼
//   materialSources.local   (the SAME slot `origin === 'local'` already
//                             uses — see below for why)
//
// ROUTES TO THE EXISTING `materialSources.local` SLOT, NEVER A NEW
// `materialSources.snapshot` SLOT. By the time a Snapshot's own origin is
// ever selectable here, it has already travelled DISCOVER -> SELECT ->
// RESOLVE -> VERIFY -> MATERIALIZE -> PLACE -> REGISTER
// (`application/MaterializedSnapshotWorldDiscoveryBridge.js`'s own
// `registerMaterializedSnapshotWorldSource()`) — and the Publication that
// registration carries is always `ui/components/OwnPublicationPanel.js`'s
// own already-local `publication` prop, the SAME Publication
// `discovery/LocalDiscoveryProvider.js` already finds by `id` for
// `origin === 'local'`. There is nothing Snapshot-specific left to
// retrieve by the time World material loading runs — Nostr, Arweave,
// candidate selection, and verification are all already behind this
// point, exactly per this milestone's own brief — so this file reuses
// whatever concrete source a caller already registers under
// `materialSources.local` (0.9.22's own local-origin implementation,
// unmodified — this file still never names or imports it, exactly as
// before this milestone), rather than adding a new `SnapshotMaterialSource`
// class or a third `materialSources` slot naming convention. A caller
// wires `materialSources.local` once, and it already serves `local`-origin
// AND `snapshot:*`-origin selections alike.
//
// NEVER TEACHES THIS FILE ABOUT NOSTR, ARWEAVE, OR SNAPSHOT RESOLUTION.
// `materialSourceFor()` only ever pattern-matches the `origin` STRING —
// `origin.startsWith('snapshot:')`, mirroring the existing
// `origin.startsWith('peer:')` check immediately above it — and never
// parses out `contentHash`/`publicationId`, never imports anything from
// the Snapshot distribution/discovery family, and never decides whether a
// Snapshot was ever actually verified. That question was already answered,
// upstream, by the pipeline that produced this origin in the first place.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A new `SnapshotMaterialSource` class, or a `materialSources.snapshot`
//   slot.** See "routes to the existing `materialSources.local` slot,"
//   above.
// - **Any change to the concrete local-origin material source registered
//   under `materialSources.local`, to
//   `application/MaterializedSnapshotWorldDiscoveryBridge.js`, or to
//   `ui/components/WorldEncounterCanvas.js`.** This milestone touches
//   exactly one function, in this one file.
// - **Querying Nostr, contacting Arweave, re-resolving a candidate, or
//   re-materializing bytes.** See "never teaches this file about Nostr,
//   Arweave, or Snapshot resolution," above — by design, none of that
//   infrastructure is ever imported here.
// - **A new failure/status vocabulary for a Snapshot-origin miss.** A
//   `snapshot:*` origin with no `materialSources.local` registered, or one
//   whose `load()` itself resolves to nothing, degrades to the same
//   `UNAVAILABLE` every other origin family already reports for the
//   identical reasons — see "two statuses, never a third," above.

export const WorldEncounterMaterialLoadStatus = Object.freeze({
    UNAVAILABLE: 'UNAVAILABLE',
    AVAILABLE: 'AVAILABLE'
});

// The contract a future local/peer material source implements. Never
// subclassed by this file itself — see this file's own header, "the
// contract a future loader implements." Calling `load()` on the base
// class always throws, so an un-implemented source fails loudly rather
// than silently reporting UNAVAILABLE for the wrong reason.
export class WorldEncounterMaterialSource {
    // Returns a Promise resolving to this source's own material for
    // `resolvedSelection` ({ kind, objectId, origin }), or to
    // `null`/`undefined` when this source does not currently have it.
    // `null` means "not currently available" — never a thrown error for
    // that case; see this file's own header, "`null` means not currently
    // available."
    load(resolvedSelection) {
        throw new Error('WorldEncounterMaterialSource.load() not implemented');
    }
}

function materialSourceFor(origin, materialSources) {
    if (!materialSources || typeof materialSources !== 'object') {
        return null;
    }
    if (origin === LOCAL_WORLD_DISCOVERY_ORIGIN) {
        return materialSources.local || null;
    }
    if (typeof origin === 'string' && origin.startsWith('peer:')) {
        return materialSources.peer || null;
    }
    // 0.9.166 — a "snapshot:<contentHash>:<publicationId>" origin (application/
    // MaterializedSnapshotWorldDiscoveryBridge.js, 0.9.160/0.9.163) names a
    // Publication this replica already possesses LOCALLY by the time it is
    // ever selectable here — see this file's own header, "0.9.166," for why
    // that routes to the SAME `materialSources.local` slot `origin ===
    // LOCAL_WORLD_DISCOVERY_ORIGIN` already uses, never a third slot of its
    // own.
    if (typeof origin === 'string' && origin.startsWith('snapshot:')) {
        return materialSources.local || null;
    }
    return null;
}

function unavailable(resolvedSelection) {
    return Object.freeze({
        status: WorldEncounterMaterialLoadStatus.UNAVAILABLE,
        resolvedSelection: resolvedSelection || null,
        material: null
    });
}

// The one entry point a caller actually uses. Validates `resolvedSelection`
// (via 0.9.19's own `describeWorldEncounterSelectionIdentity()`, used only
// to check well-formedness — its own return value is discarded, never
// substituted for the caller's reference), routes it to whichever
// `materialSources` slot matches its own `origin` family, and awaits that
// source's own `load()` — see this file's own header for exactly what
// `UNAVAILABLE`/`AVAILABLE` each mean and what is deliberately excluded.
// Never throws for a missing selection, a missing source, or a source
// that itself resolves to nothing; a genuine rejection from a source's
// own `load()` propagates to the caller unchanged.
export async function loadWorldEncounterMaterial({ resolvedSelection, materialSources } = {}) {
    if (!describeWorldEncounterSelectionIdentity(resolvedSelection)) {
        return unavailable(null);
    }

    const source = materialSourceFor(resolvedSelection.origin, materialSources);
    if (!source || typeof source.load !== 'function') {
        return unavailable(resolvedSelection);
    }

    const material = await source.load(resolvedSelection);
    if (material === null || typeof material === 'undefined') {
        return unavailable(resolvedSelection);
    }

    return Object.freeze({
        status: WorldEncounterMaterialLoadStatus.AVAILABLE,
        resolvedSelection,
        material
    });
}
