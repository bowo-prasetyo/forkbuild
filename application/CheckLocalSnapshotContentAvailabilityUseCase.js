import { LocalSnapshotContentAvailabilityOutcome } from './LocalSnapshotContentAvailabilityOutcome.js';

// 0.8.33 — Local Snapshot Content Availability & Integrity UX.
//
// 0.8.28 asked "what does this replica KNOW about a publication?" and
// answered it without ever looking at content/ContentStore.js. 0.8.32
// finally gave a replica an OFFLINE way to obtain a publication's actual
// bytes — but built no way to ask the one question that transfer
// mechanism's own "Deliberately excluded" list named directly: "is this
// replica currently holding bytes matching a publication's content hash,
// right now?" This class is that question, and nothing else:
//
//   publication.contentReference
//        │
//        ▼
//   contentStore.has(reference)
//        │                  │
//        │ false            │ true
//        ▼                  ▼
//   NOT_AVAILABLE      contentStore.get(reference)
//                              │
//                              ▼
//                  reference.verify(bytes)
//                        │           │
//                        │ false     │ true
//                        ▼           ▼
//              CONTENT_HASH_MISMATCH   AVAILABLE
//
// Deliberately scoped to exactly ONE content/ContentStore.js — this
// replica's own LOCAL one, the identical store application/
// BuildPublicationSnapshotTransferPackageUseCase.js (0.8.32) already reads
// bytes from when this replica is the one HANDING them out. This class
// never accepts an application/SnapshotPlacementStoreRegistry.js, never
// consults a placement's own `storage`/`locator`, and never calls
// application/SnapshotPlacementResolver.js — checking "do I already have
// this?" and checking "can this be retrieved from a claimed location?"
// stay two independent operations, exactly as content transfer (0.8.32)
// and placement resolution (0.8.18/0.8.20) already stay independent paths
// to the same bytes. See docs/Principles.md, "Local Content Availability
// Is An Observation, Not A Verdict (0.8.33)."
//
// Deliberately accepts the PUBLICATION itself — not a bare publicationId
// plus a separate catalog lookup — mirroring application/
// SnapshotPlacementResolutionCoordinator.js#resolve(placement) and
// application/PublicationEvidenceCoordinator.js#verify(anchor): every
// caller of this class already holds the publication in hand (it came
// from application/LocalPublicationCatalog.js#list()/get() in the first
// place), so this class introduces no second, redundant catalog
// dependency of its own.
//
// Reports NOTHING persistent. Calling this twice for the same publication
// — even with nothing else having changed — re-reads the ContentStore
// both times; if the bytes were deleted between calls, the second call
// reports NOT_AVAILABLE with no memory of the first call's AVAILABLE. See
// this milestone's own docs/Roadmap.md entry, "Local content availability
// is an observation about this replica's present content state; it does
// not validate external claims, modify placements, or establish trust."
export class CheckLocalSnapshotContentAvailabilityUseCase {
    // contentStore: a content/ContentStore.js instance — this replica's
    // own local store, and the ONLY storage boundary this class ever
    // reads through.
    constructor(contentStore) {
        if (!contentStore || typeof contentStore.has !== 'function' || typeof contentStore.get !== 'function') {
            throw new Error('CheckLocalSnapshotContentAvailabilityUseCase: a ContentStore is required');
        }
        this._contentStore = contentStore;
    }

    // `publication`: anything carrying `id` and a `contentReference`
    // (core/ContentReference.js instance or its JSON shape with a
    // `hash`) — ordinarily a core/DecentralizedPublication.js instance
    // this caller already has in hand.
    //
    // Returns `{ publicationId, contentHash, contentReference, outcome }`
    // — `outcome` is one of application/
    // LocalSnapshotContentAvailabilityOutcome.js's three values.
    // `contentReference` is always the publication's own claimed
    // reference, unchanged, regardless of outcome — this class never
    // manufactures a different one from whatever bytes it happened to
    // find.
    async execute(publication) {
        if (!publication || !publication.id) {
            throw new Error('CheckLocalSnapshotContentAvailabilityUseCase: a publication with an id is required');
        }
        const reference = publication.contentReference;
        if (!reference || !reference.hash) {
            throw new Error('CheckLocalSnapshotContentAvailabilityUseCase: a publication with a contentReference carrying a hash is required');
        }

        const present = await this._contentStore.has(reference);
        if (!present) {
            return {
                publicationId: publication.id,
                contentHash: reference.hash,
                contentReference: reference,
                outcome: LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE
            };
        }

        const bytes = await this._contentStore.get(reference);
        const matches = reference.verify(bytes);
        return {
            publicationId: publication.id,
            contentHash: reference.hash,
            contentReference: reference,
            outcome: matches
                ? LocalSnapshotContentAvailabilityOutcome.AVAILABLE
                : LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH
        };
    }
}
