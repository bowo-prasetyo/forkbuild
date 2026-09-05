import { ContentReference } from '../core/ContentReference.js';
import { DecentralizedSnapshotResolutionOutcome } from './DecentralizedSnapshotResolutionOutcome.js';

// 0.9.134 — Snapshot Retrieval from Decentralized Discovery.
//
// 0.9.132 (content/ArweaveContentStore.js) and 0.9.133 (application/
// NostrSnapshotDiscoveryQueryService.js) each closed one independent half
// of decentralized Snapshot distribution — placement, and discovery — but
// nothing yet connected them. This file is that connection, and nothing
// more: a caller who holds only a `discoveryTag` and a `contentHash` can
// ask this class for the bytes, and gets back either a verified Snapshot
// or a specific, structural reason it could not be produced.
//
//   Nostr discovery
//         │
//         │   contentHash + locator (application/
//         │   NostrSnapshotDiscoveryQueryService.js#search())
//         ▼
//   Snapshot locator
//         │
//         ▼
//   Snapshot ContentStore (application/
//   SnapshotPlacementStoreRegistry.js -> content/ContentStore.js#get())
//         │
//         ▼
//   Snapshot bytes
//         │
//         ▼
//   content hash verification (core/ContentReference.js#verify())
//         │
//         ▼
//   usable Snapshot
//
// FOUR LAYERS, NEVER COLLAPSED INTO ONE STATUS — the centerpiece
// invariant this milestone names in docs/Roadmap.md:
//
//   DISCOVERY     "A locator was announced."       -> NOT_DISCOVERED
//   LOCATION      "The locator can be queried."     -> STORE_UNAVAILABLE
//   RETRIEVAL     "Bytes were obtained."             -> CONTENT_UNAVAILABLE
//   VERIFICATION  "Those bytes are the expected
//                  Snapshot."                        -> CONTENT_HASH_MISMATCH
//
// Only when all four layers succeed does resolve() report RESOLVED — see
// application/DecentralizedSnapshotResolutionOutcome.js for the complete,
// ordered list this pipeline can end on. Discovery succeeding is never
// treated as retrieval succeeding, and retrieval succeeding is never
// treated as verification succeeding — the identical discipline
// application/SnapshotPlacementResolver.js (0.8.18) already holds for a
// SIGNED placement, applied here to an UNSIGNED, Nostr-discovered
// candidate instead (see this file's own header, "no signature," below).
//
// REUSES application/SnapshotPlacementStoreRegistry.js AS THE CONTENT
// STORE REGISTRY — NO NEW REGISTRY IS BUILT. That registry already maps a
// bare `storage` string ('ar', 'ipfs', ...) to a registered content/
// ContentStore.js instance; it doesn't care, and has never cared, whether
// the caller resolving a `storage` name got there via a signed
// PublicationSnapshotPlacement or via a Nostr-discovered candidate. Two
// registries mapping the identical `storage -> ContentStore` relationship
// would drift out of sync by hand; this class takes a `storeRegistry`
// exactly as application/SnapshotPlacementResolver.js already does, and
// never constructs, registers into, or reads from a second one.
//
// NO SIGNATURE, NO ENVELOPE VALIDATION OF ITS OWN. A discovered candidate
// (`{ contentHash, locator, storage }`) already passed through
// core/SnapshotDiscoveryEnvelope.js's own shape validation inside
// application/NostrSnapshotDiscoveryQueryService.js#search() — this class
// trusts that shape and performs no second parse of it. What it never
// trusts is the CLAIM the shape carries: that the locator actually serves
// the announced contentHash. That is exactly what steps 3-4 (retrieve,
// verify) below exist to check, and are the only steps this class treats
// as evidence rather than assertion.
//
// A DETERMINISTIC FIRST-MATCH SELECTION, NEVER RANKING OR PROVIDER
// SELECTION. When more than one discovered candidate names the same
// contentHash under one discoveryTag, this class resolves against the
// FIRST one search() reported — the identical selection rule application/
// NostrSnapshotDiscoveryQueryService.js#resolveLocator() already
// documents and implements ("no ranking, no 'best' provider, no
// preference among several candidates"), extended here only far enough to
// also carry that candidate's own `storage` (resolveLocator() reports a
// bare locator string, which is not enough to pick a ContentStore). Every
// resolve() result also carries the FULL set of matching candidates as
// `candidates` — so a caller who wants to try a different one after a
// CONTENT_UNAVAILABLE or CONTENT_HASH_MISMATCH can do so explicitly, by
// calling resolve() again with an explicit `contentStore` — this class
// never performs that retry automatically. Automatic failover across
// candidates IS a form of provider selection, and stays deliberately
// unbuilt this milestone (see "deliberately excluded," below).
//
// resolve() NEVER THROWS FOR ANYTHING ABOUT DISCOVERY, THE STORE, OR THE
// NETWORK — only for a contract violation by the CALLER (a missing
// discoveryTag/contentHash, or a constructor argument that doesn't look
// like a NostrSnapshotDiscoveryQueryService). Every other failure is
// reported as a specific outcome, exactly the restraint application/
// SnapshotPlacementResolver.js's own resolve() already holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic retry or failover across multiple discovered candidates.**
//   See "a deterministic first-match selection," above.
// - **Any trust scoring, reputation, or "preferred provider" logic.**
// - **Composition wiring into World View, publisher/Publication.js's own
//   autosave/publish flow, or any UI.** This class is a plain,
//   constructible application-layer collaborator — nothing in this
//   milestone wires it into a real composition root (ui/main.js or a
//   sibling) or decides WHEN a resolution should be attempted.
// - **A new ContentStoreRegistry.** See "reuses
//   SnapshotPlacementStoreRegistry," above.
// - **Any change to core/SnapshotDiscoveryEnvelope.js, application/
//   NostrSnapshotDiscoveryQueryService.js, application/
//   NostrSnapshotDiscoveryPublisher.js, application/
//   SnapshotPlacementResolver.js, or application/
//   SnapshotPlacementStoreRegistry.js.** All are read only, by this
//   milestone's own test suite, never edited.
//
// 0.9.152 — Selected Snapshot Candidate Resolution.
//
// `resolve(contentHash)` answers "discover, then resolve WHATEVER matches
// first" — exactly the question above, unchanged. World View's own
// candidate browser (0.9.151) raised a genuinely different one: "the user
// already looked at several discovered candidates and explicitly picked
// ONE of them — resolve THAT SPECIFIC candidate, not whichever one
// discovery would pick again." Re-running `resolve(selected.contentHash)`
// cannot answer that question — if two candidates share a contentHash
// (deliberately unranked, see "a deterministic first-match selection,"
// above), it would silently re-select the first one, discarding the
// user's own choice. `resolveCandidate(candidate)` is the narrow seam
// this milestone adds to answer it instead: given a candidate's own
// `{ contentHash, locator, storage }` — the exact shape `discoverQueryService.search()`
// (via `application/DiscoverSnapshotCandidatesCommand.js`) already
// produces — it performs LOCATION, RETRIEVAL, and VERIFICATION against
// THAT locator, and nothing else. It never searches, never discovers, and
// never substitutes a different candidate.
//
//   selected candidate { contentHash, locator, storage }
//         │
//         ▼
//   resolveCandidate(candidate)   ★ (THIS)
//         │
//         ├── LOCATION     — a content store for candidate.storage
//         ├── RETRIEVAL    — store.get(reference built from THIS locator)
//         └── VERIFICATION — retrieved bytes hash to candidate.contentHash
//         │
//         ▼
//   { outcome, bytes, candidates: [candidate], locator, storage, reason }
//
// ONE ACTUAL CANDIDATE -> RETRIEVAL -> VERIFICATION PATH, NEVER TWO.
// `resolve()` is refactored to perform DISCOVERY and first-match
// SELECTION itself, then hand the selected candidate to THIS SAME
// `resolveCandidate()` for LOCATION/RETRIEVAL/VERIFICATION — never a
// second, independently-written copy of that sequence. `resolve()`'s own
// externally-observable contract (candidates/locator/storage/outcome/
// reason/bytes) is unchanged by this refactor; see
// tests/DecentralizedSnapshotResolution.test.js, untouched, still passing.
//
// NO DISCOVERY, NO RANKING, NO SELECTION LOGIC OF ITS OWN.
// `resolveCandidate()` never calls `this._queryService.search()` and never
// looks at any candidate other than the one it was handed — the caller
// (a UI selection, or `resolve()`'s own first-match rule) already decided
// which candidate this is. This is exactly the invariant the milestone
// that added this method exists to protect: the candidate the caller
// handed in is the candidate that gets resolved, never a substitute.
//
// SELECTION DOES NOT ESTABLISH VALIDITY. A candidate's own declared
// `contentHash` is a claim, not evidence, exactly as it already is for
// `resolve()` — `resolveCandidate()` performs the identical RETRIEVAL and
// VERIFICATION steps `resolve()` already does, and reports
// CONTENT_HASH_MISMATCH under the identical condition. Nothing about a
// candidate having been explicitly selected (rather than discovered and
// auto-matched) skips or weakens verification.
export class DecentralizedSnapshotResolver {
    // queryService: an application/NostrSnapshotDiscoveryQueryService.js
    // instance (or anything duck-type compatible with it) — required,
    // never defaulted. This class performs no Nostr access of its own; it
    // only ever calls queryService.search().
    constructor(queryService) {
        if (!queryService || typeof queryService.search !== 'function') {
            throw new Error('DecentralizedSnapshotResolver: a NostrSnapshotDiscoveryQueryService is required');
        }
        this._queryService = queryService;
    }

    // Resolves to `{ outcome, bytes, candidates, locator, storage, reason }`:
    //   outcome    — always one of DecentralizedSnapshotResolutionOutcome's
    //                own values.
    //   bytes      — set only when `outcome === RESOLVED`.
    //   candidates — every discovered candidate whose own contentHash
    //                matched the one requested (possibly more than one —
    //                see "a deterministic first-match selection," above),
    //                in the exact order search() reported them. `[]` when
    //                outcome is NOT_DISCOVERED.
    //   locator    — the locator of the ONE candidate this call actually
    //                attempted (`candidates[0]`), or `null` when
    //                outcome is NOT_DISCOVERED.
    //   storage    — that same candidate's own `storage`, or `null`.
    //   reason     — a human-readable string on any outcome other than
    //                RESOLVED, else `null`.
    //
    // `contentStore` (explicit) always wins over a lookup in
    // `storeRegistry` — a caller that passed both meant the explicit one.
    // Mirrors application/SnapshotPlacementResolver.js#resolve()'s own
    // `{ contentStore, storeRegistry }` option shape exactly.
    async resolve(discoveryTag, contentHash, { contentStore = null, storeRegistry = null } = {}) {
        if (!discoveryTag || typeof discoveryTag !== 'string') {
            throw new Error('DecentralizedSnapshotResolver: resolve() requires a discoveryTag');
        }
        if (!contentHash || typeof contentHash !== 'string') {
            throw new Error('DecentralizedSnapshotResolver: resolve() requires a contentHash');
        }

        // 1. DISCOVERY — "a locator was announced." Never invented,
        // never cached across calls; a fresh search() every time, the
        // identical restraint application/
        // NostrSnapshotDiscoveryQueryService.js#search() itself already
        // holds one layer down.
        const discovered = await this._queryService.search(discoveryTag);
        const candidates = (Array.isArray(discovered) ? discovered : [])
            .filter((candidate) => candidate && candidate.contentHash === contentHash);
        if (candidates.length === 0) {
            return this._failure(
                DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
                `no discovery candidate found for contentHash '${contentHash}' under discoveryTag '${discoveryTag}'`,
                []
            );
        }

        // Deterministic first-match selection — see this file's own
        // header, "a deterministic first-match selection, never ranking."
        const selected = candidates[0];

        // 2-4. LOCATION, RETRIEVAL, VERIFICATION — delegated to
        // resolveCandidate(), the SAME method a caller resolving an
        // explicitly USER-SELECTED candidate (never discovered by this
        // call) also goes through — see this file's own header, "0.9.152
        // — Selected Snapshot Candidate Resolution," "one actual
        // candidate -> retrieval -> verification path, never two." Only
        // `candidates` (the FULL discovered set, not just the one
        // attempted) is overridden on the returned result — every other
        // field is resolveCandidate()'s own, unchanged.
        const candidateResult = await this.resolveCandidate(selected, { contentStore, storeRegistry });
        return { ...candidateResult, candidates };
    }

    // resolveCandidate(candidate, { contentStore, storeRegistry }) ->
    // Promise<{ outcome, bytes, candidates, locator, storage, reason }>.
    //
    // Resolves EXACTLY the candidate handed in — never a discovery
    // search, never a selection among several. See this file's own
    // header, "0.9.152 — Selected Snapshot Candidate Resolution," for the
    // full contract and why `resolve(candidate.contentHash)` cannot
    // substitute for this method when more than one candidate can share a
    // contentHash.
    //
    // `candidate` is a plain `{ contentHash, locator, storage }` object —
    // exactly the shape a discovered candidate already has (see
    // `application/DiscoverSnapshotCandidatesCommand.js`'s own result
    // shape) — never a `DecentralizedSnapshotResolver`-specific type.
    // `candidates` on the returned result is always `[candidate]` — the
    // one candidate this call actually attempted; a caller composing this
    // from `resolve()`'s own discovery step overrides it with the full
    // discovered set (see `resolve()`, above).
    //
    // Throws synchronously (before any I/O) only for a caller contract
    // violation — a missing/malformed candidate — never for a discovery,
    // store, or network failure; mirrors `resolve()`'s own restraint, one
    // layer over.
    async resolveCandidate(candidate, { contentStore = null, storeRegistry = null } = {}) {
        if (!candidate || typeof candidate !== 'object') {
            throw new Error('DecentralizedSnapshotResolver: resolveCandidate() requires a candidate');
        }
        if (!candidate.contentHash || typeof candidate.contentHash !== 'string') {
            throw new Error('DecentralizedSnapshotResolver: resolveCandidate() requires a candidate with a contentHash');
        }
        if (!candidate.locator || typeof candidate.locator !== 'string') {
            throw new Error('DecentralizedSnapshotResolver: resolveCandidate() requires a candidate with a locator');
        }

        // 2. LOCATION — "the locator can be queried." An explicit
        // contentStore always wins over a storeRegistry lookup.
        const resolvedStore = contentStore || (storeRegistry ? storeRegistry.get(candidate.storage) : null);
        if (!resolvedStore) {
            return this._failure(
                DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE,
                `no content store available for storage '${candidate.storage}'`,
                [candidate],
                candidate
            );
        }

        // 3. RETRIEVAL — "bytes were obtained." Addressed by an AD-HOC
        // ContentReference this class builds from THIS candidate's OWN
        // contentHash and locator/storage — never a reference built from
        // some OTHER, previously-requested contentHash, so that a
        // candidate whose declared contentHash disagrees with its own
        // bytes is caught at verification, not silently trusted at this
        // step.
        const reference = new ContentReference({ hash: candidate.contentHash, uri: candidate.locator, storage: candidate.storage });
        let bytes;
        try {
            bytes = await resolvedStore.get(reference);
        } catch (error) {
            return this._failure(
                DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
                error.message,
                [candidate],
                candidate
            );
        }
        if (bytes === null || bytes === undefined) {
            return this._failure(
                DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
                'the referenced content is not available from this content store',
                [candidate],
                candidate
            );
        }

        // 4. VERIFICATION — "those bytes are the expected Snapshot."
        // Selection is not verification, exactly as discovery is not
        // verification: a selected locator resolving and genuinely
        // retrieving bytes is never, by itself, treated as proof those
        // bytes are the right ones.
        if (!reference.verify(bytes)) {
            return this._failure(
                DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'retrieved content does not match the candidate\'s own declared contentHash — selection is not verification',
                [candidate],
                candidate
            );
        }

        return {
            outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED,
            bytes,
            candidates: [candidate],
            locator: candidate.locator,
            storage: candidate.storage,
            reason: null
        };
    }

    _failure(outcome, reason, candidates, selected = null) {
        return {
            outcome,
            bytes: null,
            candidates,
            locator: selected ? selected.locator : null,
            storage: selected ? selected.storage : null,
            reason
        };
    }
}
