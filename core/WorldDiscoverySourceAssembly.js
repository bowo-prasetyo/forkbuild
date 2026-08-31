import { WorldDiscoveryInputKeys } from './WorldDiscoverySource.js';

// 0.9.7 — World Discovery Source Assembly.
//
// 0.9.5 named the seam (`describeWorldDiscoverySource()`) and, in its own
// header, explicitly refused to cross it more than once at a time: "one
// source per call — this file never combines two of them." 0.9.6 crossed
// that seam exactly once per peer message, and refused, in its own header,
// to combine what it produced with anything else either. Neither file
// answers the question both their headers pointed at: once a local source
// and N peer sources all exist as separate, already-described bundles,
// how do they become the one set of six arrays `deriveWorldEncounters()`
// actually takes as its arguments? This file is that answer, and only
// that answer.
//
//   Local data ────────→ WorldDiscoverySource ──┐
//                                                │
//   Peer A message ────→ WorldDiscoverySource ──┤
//                                                │
//   Peer B message ────→ WorldDiscoverySource ──┤
//                                                ▼
//                                    core/WorldDiscoverySourceAssembly.js
//                                       assembleWorldDiscoveryInputs()   ★ (THIS)
//                                                │
//                                                ▼
//                                      core/WorldEncounter.js
//                                         deriveWorldEncounters()
//
// ASSEMBLY IS NOT RECONCILIATION. This is the one rule everything else in
// this file follows from. `assembleWorldDiscoveryInputs()` concatenates —
// it never deduplicates, never groups by identity, never decides which of
// two records "wins," and never notices that two sources disagree, because
// it never looks. If peer A and peer B both hand over a publication with
// the same `id`, the assembled `publications` array contains that record
// twice, unchanged. A future, unscheduled step may one day decide two
// records describe the same object and choose between them — that is
// reconciliation, a real and separate concern this codebase has already
// built dedicated machinery for elsewhere (e.g.
// `application/PublicationObservationArchiveReplacementReview.js`'s own
// candidate/decision vocabulary) — but it is never this file's job, and
// this file does not borrow, anticipate, or half-implement any piece of
// it. Multiset-preserving concatenation is the entire algorithm.
//
// ORDER IS EXPLICIT, DETERMINISTIC, AND NEVER RE-DERIVED. The `sources`
// array's own order is the only order this file has an opinion about:
// `sources[0]`'s records for a given dimension come first, then
// `sources[1]`'s, and so on, and within one source, that source's own
// record order is preserved exactly. No sorting by id, timestamp, origin
// name, or anything else. No grouping. No "local first" special case
// hard-coded here — if a caller wants local data first, it lists the local
// source first; this file has no opinion of its own about which origin
// that caller supplies.
//
// EXACTLY 0.9.5'S OWN SIX DIMENSIONS, NEVER A SEVENTH. This file imports
// `WorldDiscoveryInputKeys` from `core/WorldDiscoverySource.js` rather than
// retyping `publications`, `placements`, `anchors`, `snapshotPlacements`,
// `avatarProfiles`, `avatarPresences` a third time, so the three files —
// 0.9.5's source shape, 0.9.6's peer adapter, and this assembly step — can
// never drift out of sync with `deriveWorldEncounters()`'s own parameter
// list.
//
// PROVENANCE STAYS AT THE SOURCE CONTAINER — IT NEVER LEAKS INTO A RECORD.
// A `WorldDiscoverySource` carries `origin`; the records inside its six
// arrays do not, and this file never adds one. No record assembled here
// ever gains a `sourceOrigin`, `peerIdentity`, `remote`, or any field of
// this file's own invention — every record that comes out is the exact
// same object reference that went in. This is what lets
// `deriveWorldEncounters()` — and everything already built on top of it,
// 0.9.1 through 0.9.4 — go on knowing nothing about whether a publication
// came from local storage or a remote peer. That ignorance is the payoff
// of 0.9.5 through 0.9.7 together, not an oversight of this file alone.
//
// MALFORMED SOURCES DEGRADE TO NO CONTRIBUTION, NEVER THROW AND NEVER
// DISCARD THE WHOLE ASSEMBLY. `sources` itself missing, or not an array,
// degrades to "zero sources," i.e. six empty arrays — never a thrown
// error. Within `sources`, an entry that is `null`, `undefined`, or not
// the frozen shape `describeWorldDiscoverySource()` produces contributes
// nothing for any dimension and is simply skipped; it does not stop this
// file from reading the valid sources on either side of it. A source
// missing one of the six arrays (which `describeWorldDiscoverySource()`
// itself should never produce, since it already defaults every field to
// an empty array) contributes nothing for that one dimension alone,
// exactly mirroring 0.9.5's and 0.9.6's own per-field degrade rule rather
// than introducing a new one.
//
// NO NETWORK, NO STORAGE, NO PEER TRANSPORT KNOWLEDGE. This file never
// imports `peer/PeerMessageBus.js`, never imports `peer/
// PeerWorldDataIngress.js`, and never imports a `StorageProvider`. It
// consumes already-described `WorldDiscoverySource` bundles and has no way
// to obtain one on its own — it does not know, and does not need to know,
// that some of those bundles started life as a peer message 0.9.6 turned
// into a source. That keeps the dependency graph one-directional:
// `PeerWorldDataIngress` depends on `WorldDiscoverySource`, this file
// depends on `WorldDiscoverySource`, and neither of the first two ever
// depends on this one.
//
// NO ENCOUNTER DERIVATION. This file never imports `core/WorldEncounter.js`
// and never calls `deriveWorldEncounters()`. Its output is shaped to be
// handed to that function by a caller — via `WorldDiscoveryInputKeys`'s own
// field names, unchanged — but calling it is that caller's job, not this
// file's. Wiring the assembled result into the running World View is 0.9.8
// (Remote Encounter Integration), separate, later, unscheduled work.
//
// FREEZING, NOT CLONING. The assembled result object and each of its six
// arrays are frozen so a caller cannot accidentally mutate the assembly
// itself — but no record inside those arrays is ever cloned, copied, or
// modified. Every record reference a source contributed is the exact same
// reference that source held.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Deduplication of any kind.** Two sources contributing the "same"
//   record by id, content, or any other notion of identity produces that
//   record twice in the assembled array — see "Assembly is not
//   reconciliation," above.
// - **Sorting, grouping, or any reordering by identity, timestamp, origin,
//   or anything else.** Source order and each source's own record order
//   are the only ordering this file has, or will ever have, an opinion
//   about.
// - **Trust, verification, priority, weight, or any judgment about which
//   source's contribution should be believed or preferred.** This file
//   inherits 0.9.5's and 0.9.6's own "no trust vocabulary of any kind"
//   without a single exception — every source's contribution is
//   structurally equal to this file.
// - **Attaching provenance to a record.** See "Provenance stays at the
//   source container," above.
// - **Reading anything off `peer/PeerMessageBus.js`, `peer/
//   PeerWorldDataIngress.js`, or any `PeerConnection`/`PeerDiscoveryProvider`.**
//   This file consumes already-described sources; how a source came to
//   exist is 0.9.6's own, separate concern.
// - **Persisting the assembled result, or any source, to a
//   `StorageProvider`.** The assembled result is a transient, in-memory
//   bundle, exactly like the sources it was built from.
// - **Calling `deriveWorldEncounters()`, or touching
//   `core/WorldEncounter.js` in any way.** See "No encounter derivation,"
//   above.

function isPlainSource(source) {
    return Boolean(source) && typeof source === 'object' && typeof source.origin === 'string' && source.origin.length > 0;
}

// Pure. Concatenates zero or more already-described `WorldDiscoverySource`
// bundles into the one set of six arrays `deriveWorldEncounters()` takes
// as its own arguments — preserving source order, each source's own
// record order, and every duplicate exactly as contributed. Never
// deduplicates, sorts, groups, or judges between sources; never throws.
// `sources` missing, not an array, or containing a malformed entry
// degrades gracefully — a malformed entry contributes nothing and does
// not disturb the contributions of any other entry.
export function assembleWorldDiscoveryInputs(sources) {
    const list = Array.isArray(sources) ? sources : [];

    const assembled = {};
    for (const key of WorldDiscoveryInputKeys) {
        assembled[key] = [];
    }

    for (const source of list) {
        if (!isPlainSource(source)) {
            continue;
        }
        for (const key of WorldDiscoveryInputKeys) {
            const records = source[key];
            if (!Array.isArray(records)) {
                continue;
            }
            for (const record of records) {
                assembled[key].push(record);
            }
        }
    }

    for (const key of WorldDiscoveryInputKeys) {
        assembled[key] = Object.freeze(assembled[key]);
    }
    return Object.freeze(assembled);
}
