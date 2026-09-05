import { StoreSnapshotContentOutcome } from './StoreSnapshotContentOutcome.js';
import { SnapshotMaterializationSourceKind } from './SnapshotMaterializationSourceKind.js';
import { SnapshotCandidateMaterializationOutcome } from './SnapshotCandidateMaterializationOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from './DecentralizedSnapshotResolutionOutcome.js';

// 0.9.158 — Selected Snapshot Materialization.
//
// 0.9.150 through 0.9.157 built and proved DISCOVER -> SELECT -> RESOLVE ->
// VERIFY -> ATTRIBUTE, entirely in memory: a verified Snapshot's bytes
// exist only inside a `resolveCandidate()` result, and disappear the
// moment a person navigates away or the Publication changes. Nothing in
// that pipeline ever turns "verified" into "possessed" — the SAME gap
// application/MaterializeSnapshotFromPlacementUseCase.js (0.8.35) already
// closed for a SIGNED placement, and application/
// MaterializeSnapshotFromPeerUseCase.js (0.8.37) already closed for an
// authenticated peer. This class is their THIRD sibling, closing the
// identical gap for an explicitly SELECTED, Nostr-discovered candidate:
//
//   selected candidate { contentHash, locator, storage }
//        │
//        ▼
//   resolver.resolveCandidate(candidate)   (application/
//        │                                  DecentralizedSnapshotResolver.js,
//        │                                  0.9.152 — UNCHANGED, already run
//        │                                  by a caller BEFORE this class is
//        │                                  ever invoked)
//        ▼
//   resolution = { outcome, bytes, candidates, locator, storage, reason }
//        │
//        ▼
//   execute(resolution)   ★ (THIS)
//        │
//   ┌────┴───────────────────────────────────────┐
//   │ RESOLVED                                    │ anything else
//   ▼                                              ▼
// storeSnapshotContentUseCase.execute(         resolution.outcome, reported
//   { contentHash, bytes: resolution.bytes })  UNCHANGED — never remapped,
//   │                    │                      never NOT_RESOLVED
//   │ ALREADY_AVAILABLE  │ STORED
//   ▼                    ▼
// ALREADY_AVAILABLE     STORED
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated from application/
// MaterializeSnapshotFromPlacementUseCase.js's own header for a THIRD
// caller now: resolution observes whether a candidate can currently
// provide verified bytes; materialization turns those already-verified
// bytes into local possession, through the SAME hash-verify-then-store
// boundary every other explicit source already shares
// (application/StoreSnapshotContentUseCase.js). This class never
// re-resolves, never re-selects, and never re-verifies anything itself —
// see "consumes the resolution result, never the candidate," below.
//
// CONSUMES THE RESOLUTION RESULT, NEVER THE CANDIDATE — THE ONE INVARIANT
// THIS MILESTONE MOST DEPENDS ON. `execute()` takes the RESOLVER'S OWN
// already-computed `{ outcome, bytes, candidates, locator, storage,
// reason }` (application/DecentralizedSnapshotResolver.js#resolveCandidate(),
// 0.9.152, equivalently application/ResolveSelectedSnapshotCommand.js's own
// result, 0.9.152), NEVER a bare `selectedSnapshotCandidate` object and
// NEVER a `resolver` it would have to call itself. A caller that instead
// wired this class to resolve a candidate on its own would open exactly
// the second, un-verified path around resolution that application/
// DecentralizedSnapshotResolver.js's own header ("selection does not
// establish validity") and application/SnapshotPublicationAttribution.js's
// own header ("attribution requires an already-verified Snapshot") both
// already refuse for their own seams — this file refuses it identically,
// one seam over. This class has no `resolver` collaborator, no
// `contentStore`/`storeRegistry` collaborator, and imports nothing from
// application/NostrSnapshotDiscoveryQueryService.js or content/
// ArweaveContentStore.js.
//
// NON-RESOLVED OUTCOMES ARE REPORTED VERBATIM, NEVER REMAPPED — THE
// IDENTICAL RESTRAINT application/SnapshotPublicationAttribution.js's OWN
// resolveSnapshotPublicationAttribution() ALREADY HOLDS, ONE SEAM OVER. A
// resolution that is NOT_DISCOVERED, STORE_UNAVAILABLE, CONTENT_UNAVAILABLE,
// or CONTENT_HASH_MISMATCH is reported as exactly that same application/
// DecentralizedSnapshotResolutionOutcome.js value, unchanged, alongside its
// own `reason` — never folded into a materialization-specific "could not
// materialize" catch-all. See application/
// SnapshotCandidateMaterializationOutcome.js's own header for why that
// file's three values describe only what happens once resolution has
// already succeeded.
//
// NEVER TOUCHES ATTRIBUTION, PLACEMENT, OR SPATIAL POSITION. This class
// never imports application/SnapshotPublicationAttribution.js, never
// constructs or reads a PublicationSnapshotPlacement, and produces no
// notion of "where in the World" the materialized content belongs — it
// answers only "can this replica now retrieve these bytes locally," the
// identical narrow question its own PLACEMENT/PEER siblings already
// answer. World placement of a materialized Snapshot, if ever built, is a
// separate, later, unscheduled seam over this one's own output — see
// docs/Roadmap.md's own 0.9.158 section.
//
// NO `publicationId`, NO `publicationKnown` — DELIBERATELY, UNLIKE ITS TWO
// SIBLINGS. A Nostr-discovered candidate (`{ contentHash, locator,
// storage }`, application/DecentralizedSnapshotResolver.js's own shape)
// carries no `publicationId` at all — unlike a PublicationSnapshotPlacement
// or a peer-exchange request, neither of which this class's `resolution`
// input resembles. Inventing one here (from `attributeSelectedSnapshot()`'s
// own separate comparison, say) would blur MATERIALIZATION back into
// ATTRIBUTION, exactly the seam this milestone's own design keeps apart —
// see docs/Roadmap.md, "materialization must consume the verified
// resolution result, not the candidate... never attribution."
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Calling `resolver.resolveCandidate()`, or accepting a bare
//   candidate/contentHash.** See "consumes the resolution result," above.
// - **Attribution of any kind.** See "no publicationId," above.
// - **World placement, spatial position, or rendering of any kind.**
// - **A UI trigger, composition-root wiring, or new command file's own
//   business logic.** application/MaterializeSelectedSnapshotCommand.js is
//   a plain assembly boundary over this class, exactly mirroring
//   application/ResolveSelectedSnapshotCommand.js one seam over.
// - **Ranking, caching, retry, or automatic materialization of any kind.**
//   A person's own explicit click supplies `resolution`; this class never
//   decides WHEN to run, and never runs more than once per call.
export class MaterializeSnapshotFromSelectedCandidateUseCase {
    // storeSnapshotContentUseCase: an application/
    // StoreSnapshotContentUseCase.js instance — the SAME shared boundary
    // application/MaterializeSnapshotFromPlacementUseCase.js and
    // application/MaterializeSnapshotFromPeerUseCase.js are already wired
    // against, never a second, disconnected one.
    constructor(storeSnapshotContentUseCase) {
        if (!storeSnapshotContentUseCase || typeof storeSnapshotContentUseCase.execute !== 'function') {
            throw new Error('MaterializeSnapshotFromSelectedCandidateUseCase: a StoreSnapshotContentUseCase is required');
        }
        this._storeSnapshotContentUseCase = storeSnapshotContentUseCase;
    }

    // `resolution`: the ALREADY-COMPUTED `{ outcome, bytes, candidates,
    // locator, storage, reason }` result of `resolver.resolveCandidate()`
    // (0.9.152) — never re-resolved, never re-verified against a
    // candidate this class looks up itself. See this file's own header,
    // "consumes the resolution result, never the candidate."
    //
    // Returns `{ outcome, contentHash, contentReference, reason, source }`:
    //   outcome           — on a non-RESOLVED `resolution`, exactly
    //                        `resolution.outcome`, UNCHANGED (one of
    //                        application/DecentralizedSnapshotResolutionOutcome.js's
    //                        own NOT_DISCOVERED/STORE_UNAVAILABLE/
    //                        CONTENT_UNAVAILABLE/CONTENT_HASH_MISMATCH
    //                        values); on RESOLVED, one of application/
    //                        SnapshotCandidateMaterializationOutcome.js's
    //                        own three values.
    //   contentHash       — the resolved candidate's own contentHash
    //                        (`resolution.candidates[0].contentHash`), or
    //                        `null` when `resolution.candidates` is empty
    //                        (NOT_DISCOVERED).
    //   contentReference  — the core/ContentReference.js this replica now
    //                        holds bytes under (STORED/ALREADY_AVAILABLE),
    //                        or `null` otherwise.
    //   reason            — `resolution`'s own `reason`, unchanged, on any
    //                        non-RESOLVED outcome or on HASH_MISMATCH; null
    //                        on STORED/ALREADY_AVAILABLE.
    //   source            — `{ kind: SnapshotMaterializationSourceKind.CANDIDATE }`,
    //                        always this same value, on every outcome.
    async execute(resolution) {
        if (!resolution || typeof resolution !== 'object' || typeof resolution.outcome !== 'string') {
            throw new Error('MaterializeSnapshotFromSelectedCandidateUseCase: execute() requires a resolveCandidate() resolution result');
        }

        const candidate = Array.isArray(resolution.candidates) && resolution.candidates.length > 0
            ? resolution.candidates[0]
            : null;
        const contentHash = candidate ? candidate.contentHash : null;
        const source = Object.freeze({ kind: SnapshotMaterializationSourceKind.CANDIDATE });

        if (resolution.outcome !== DecentralizedSnapshotResolutionOutcome.RESOLVED) {
            return { outcome: resolution.outcome, contentHash, contentReference: null, reason: resolution.reason, source };
        }

        const stored = await this._storeSnapshotContentUseCase.execute({ contentHash, bytes: resolution.bytes });
        if (stored.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH) {
            return {
                outcome: SnapshotCandidateMaterializationOutcome.HASH_MISMATCH,
                contentHash, contentReference: null,
                reason: 'the resolved bytes do not match the selected candidate\'s own contentHash',
                source
            };
        }

        return {
            outcome: stored.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE
                ? SnapshotCandidateMaterializationOutcome.ALREADY_AVAILABLE
                : SnapshotCandidateMaterializationOutcome.STORED,
            contentHash, contentReference: stored.contentReference,
            reason: null,
            source
        };
    }
}
