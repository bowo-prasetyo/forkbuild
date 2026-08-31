// 0.9.5 — World Discovery Source Boundary.
//
// 0.9.0 through 0.9.4 built the entire World Encounter pipeline —
// discovery (core/WorldEncounter.js), read model, presentation, the
// canvas, and selection — on a single unstated assumption: that
// `deriveWorldEncounters()`'s six arrays (`publications`, `placements`,
// `anchors`, `snapshotPlacements`, `avatarProfiles`, `avatarPresences`)
// simply already exist, handed in by "whatever caller assembled them."
// So far, that caller has only ever meant "read them out of this
// replica's own local storage." Nothing yet names what changes once a
// second replica — a peer, over `peer/PeerMessageBus.js` — can also
// supply some of those same six arrays.
//
//   LOCAL WORLD DATA                    REMOTE PEER
//         │                                  │
//         │                                  ▼
//         │                           peer/PeerMessageBus.js
//         │                                  │
//         │                                  ▼
//         │                     (future, unscheduled: Peer World
//         │                      Data Ingress — turns a received
//         │                      message into raw records)
//         │                                  │
//         ▼                                  ▼
//   ┌─────────────────────────────────────────────────┐
//   │      core/WorldDiscoverySource.js   ★ (THIS)     │
//   │           describeWorldDiscoverySource()          │
//   └─────────────────────────────────────────────────┘
//         │                                  │
//         └────────────────┬─────────────────┘
//                           ▼
//         (future, unscheduled: World Data Assembly —
//          concatenates N sources into one set of six arrays)
//                           ▼
//              core/WorldEncounter.js
//                 deriveWorldEncounters()
//
// THIS MILESTONE NAMES THE SEAM; IT DOES NOT CROSS IT. It answers one
// question only: "what is the shape of the data one origin contributes
// to the World?" It does not answer "how do we get that data from a
// peer" (a transport question — `peer/`'s own job), "how do we combine
// what two origins both contributed" (an assembly question — separate,
// later, unscheduled work), or "should we believe what an origin sent"
// (a trust/verification question — see "No trust vocabulary," below).
// Those are three different questions, and this file is deliberately
// not equipped to answer any of them.
//
// FOUR DIFFERENT THINGS THIS CODEBASE HAS CALLED "DISCOVERY," KEPT
// SEPARATE. `peer/PeerDiscoveryProvider.js` already answers "I know
// another peer exists." `core/WorldEncounter.js` already answers
// "given the data I currently possess, this object has a present World
// placement/presence." A future, unnamed verification pipeline will
// answer "I cryptographically verified this signed statement." This
// file is the missing fourth: "this data came from here." Collapsing
// any two of those four into one step — "peer found" straight to
// "trusted," or "data received" straight to "shown in the World" with
// no seam in between — is exactly the shortcut this milestone exists to
// refuse. See docs/Principles.md's own running distinction between
// identity, provenance, and truth (0.8.83, "Provenance Describes Where
// A Fact Entered This Archive; It Does Not Establish Whether The Fact
// Is True") — `origin` below is that same idea, one layer up, for a
// batch of records rather than one archive entry.
//
// `origin` IS AN OPEN, FREE-FORM LABEL — DELIBERATELY NOT A CLOSED
// ENUM. `WorldEncounterKind` (0.9.0) is a closed, two-value enum because
// there are, and only ever will be, two kinds of encounterable object.
// The set of places World data can come from has no such ceiling: local
// storage, a same-browser `BroadcastChannel` tab, a `peer/
// WebRtcPeerConnection.js`, a future rendezvous-brokered exchange, a
// future HTTP source, a future imported evidence file — this file
// commits to none of that list and closes off none of it either. The
// one requirement is structural, not a value: `origin` must be a
// non-empty string naming SOME single place this batch came from.
//
// A SOURCE IS EXACTLY 0.9.0's OWN SIX ARRAYS, NEVER A SEVENTH KIND OF
// FIELD. `publications`, `placements`, `anchors`, `snapshotPlacements`,
// `avatarProfiles`, `avatarPresences` are `deriveWorldEncounters()`'s
// own parameter names, unchanged — see `WorldDiscoveryInputKeys` below,
// which exists so a future assembly step never has to re-type this list
// and risk it drifting out of sync with 0.9.0's own signature. This
// file adds no field of its own to any record inside those arrays, and
// no field to the bundle beyond `origin` — no `receivedAt`, no
// `connectionId`, no `signature`. A caller that wants to remember when
// or over which connection a batch arrived keeps that fact at ITS OWN
// layer (the future Peer World Data Ingress this file's own header
// diagram names), not inside the shape this file defines.
//
// ONE SOURCE PER CALL — MULTIPLE SOURCES ARE NEVER COMBINED HERE.
// `describeWorldDiscoverySource()` describes exactly one origin's own
// contribution. It has no plural counterpart in this file: no
// `combineWorldDiscoverySources()`, no `mergeWorldDiscoverySources()`,
// nothing that concatenates, deduplicates, or reconciles two bundles
// against each other. A local batch and a peer batch, once each is
// separately described here, still have to be brought together
// somewhere before `deriveWorldEncounters()` can see all of it — that
// "somewhere" is the unscheduled World Data Assembly step named in this
// file's own header diagram, never this one.
//
// NO NETWORK, NO STORAGE, NO VERIFICATION, NO MUTATION. This file never
// imports `peer/PeerMessageBus.js`, never imports a `StorageProvider`,
// never imports `identity/LocalAuthorizationVerifier.js` or anything
// that checks a signature, and never reaches into `core/WorldEncounter.js`
// itself — it has nothing to hand `deriveWorldEncounters()` beyond what
// a caller already has, and no opinion about whether that caller should
// call it. Every value this file returns is `Object.freeze()`'d, and
// nothing passed in is ever mutated.
//
// NO TRUST VOCABULARY OF ANY KIND — inherited from 0.9.0's own
// boundary, held here one layer earlier. `origin` names WHERE a batch
// came from, never whether it should be believed: no `trusted`,
// `verified`, `authority`, `priority`, or `weight` field exists here or
// ever will, at this layer. Two sources with different `origin` values
// are structurally equal to this file — it is not this file's question
// which one "wins" if they disagree, because this file never even looks
// at whether they disagree.
//
// MALFORMED RECORD ARRAYS DEGRADE TO EMPTY, NEVER THROW — A MISSING OR
// INVALID `origin` RETURNS `null`, NEVER THROWS. This mirrors 0.9.0's
// own `describeEncounterablePublication()`/`describeEncounterableAvatar()`
// contract exactly: `origin` is this bundle's own required identity,
// the same role `publication`/`placement` play one layer down, so a
// bundle with no origin to name is simply not a describable source —
// never an encounter, never a thrown error. Anything supplied for one
// of the six record-array fields that is not itself an array (missing,
// `null`, a stray object) degrades to an empty array for that field
// alone, exactly like `deriveWorldEncounters()`'s own defaults already
// do for its six parameters.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Connecting to a peer, or reading anything off `peer/
//   PeerMessageBus.js`, `peer/PeerConnection.js`, or any
//   `PeerDiscoveryProvider`.** That is Peer World Data Ingress —
//   separate, later, unscheduled work. This file does not know a peer
//   exists.
// - **Fetching, subscribing to, or polling anything.** This file is
//   handed data; it never goes and gets any.
// - **Signature verification, or any trust/authority judgment about a
//   source's own data.** See "No trust vocabulary," above.
// - **Persisting a source, or any record inside one, to a
//   `StorageProvider`.** A source is a transient, in-memory bundle —
//   nothing here is ever written down.
// - **Combining, concatenating, deduplicating, or reconciling two or
//   more sources.** See "One source per call," above — World Data
//   Assembly's own, separate, unscheduled job.
// - **Touching `core/WorldEncounter.js` in any way.** `describeEncounter
//   ablePublication()`, `describeEncounterableAvatar()`, and
//   `deriveWorldEncounters()` are all unchanged by this milestone, and
//   this file never imports any of them.
// - **A closed list of valid `origin` values.** See "`origin` is an
//   open, free-form label," above.

// The exact six parameter names `core/WorldEncounter.js#deriveWorldEncounters()`
// destructures, named once here so a future caller assembling several
// described sources into that function's own arguments never has to
// retype — or accidentally drift from — this list.
export const WorldDiscoveryInputKeys = Object.freeze([
    'publications',
    'placements',
    'anchors',
    'snapshotPlacements',
    'avatarProfiles',
    'avatarPresences'
]);

function toFrozenArray(value) {
    return Object.freeze(Array.isArray(value) ? [...value] : []);
}

// Pure. Describes ONE origin's own contribution of World-relevant
// records — nothing about where `origin` sits relative to any other
// source, and nothing about whether any record inside it should be
// believed. Returns `null`, never throws, when there is no `origin` to
// name; every record-array field degrades to an empty, frozen array
// when it is missing or not itself an array.
export function describeWorldDiscoverySource({
    origin,
    publications,
    placements,
    anchors,
    snapshotPlacements,
    avatarProfiles,
    avatarPresences
} = {}) {
    if (typeof origin !== 'string' || origin.length === 0) {
        return null;
    }
    return Object.freeze({
        origin,
        publications: toFrozenArray(publications),
        placements: toFrozenArray(placements),
        anchors: toFrozenArray(anchors),
        snapshotPlacements: toFrozenArray(snapshotPlacements),
        avatarProfiles: toFrozenArray(avatarProfiles),
        avatarPresences: toFrozenArray(avatarPresences)
    });
}
