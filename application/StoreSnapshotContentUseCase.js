import { ContentReference } from '../core/ContentReference.js';
import { StoreSnapshotContentOutcome } from './StoreSnapshotContentOutcome.js';

// 0.8.36 — Unified Explicit Snapshot Materialization Sources.
//
// application/ImportPublicationSnapshotTransferPackageUseCase.js (0.8.32)
// and application/MaterializeSnapshotFromPlacementUseCase.js (0.8.35) each
// independently grew the identical three-step shape once bytes and a
// claimed content hash were in hand:
//
//   ContentReference({ hash: claimedHash }).verify(bytes)
//        │                                  │
//        │ fails                            │ passes
//        ▼                                  ▼
//   (reject, nothing stored)          contentStore.has(reference)
//                                            │
//                                            ▼
//                                     contentStore.put(bytes)
//
// This class is that shape, extracted ONCE, so the two paths can never
// again grow subtly different storage or integrity rules by accident. It
// is the ONLY place in this codebase that turns "bytes claiming a hash"
// into "bytes durably held in content/ContentStore.js":
//
//   contentHash + bytes
//        │
//        ▼
//   verify hash                (core/ContentReference.js#verify() —
//        │                      UNCHANGED, the identical check both
//        │                      callers already performed themselves)
//   ┌────┴──────────────┐
//   │ fails              │ passes
//   ▼                    ▼
// HASH_MISMATCH    contentStore.has(reference)
// (nothing stored)        │                  │
//                          │ true             │ false
//                          ▼                  ▼
//                   ALREADY_AVAILABLE   contentStore.put(bytes)
//                                              │
//                                              ▼
//                                            STORED
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: hash verification is the
// actual content trust boundary, and it happens HERE, exactly once, no
// matter which explicit action supplied the bytes. This class has no idea
// whether `bytes` arrived from a Publication Snapshot Transfer Package
// (0.8.32) or a resolved PublicationSnapshotPlacement (0.8.20/0.8.35), and
// it never asks — see application/SnapshotMaterializationSourceKind.js's
// own header for why "which explicit mechanism supplied these bytes"
// stays a fact the CALLER carries, never a fact this boundary branches on.
// A caller that skips verification, stores under an unverified hash, or
// invents a second way to decide STORED vs ALREADY_AVAILABLE would defeat
// the entire point of this class existing — there is exactly one correct
// way to answer "should this replica keep these bytes," and it lives only
// here.
//
// Deliberately never discovers a source, never resolves a placement,
// never validates package structure, never touches a publication, an
// anchor, or a placement, and never reports whether a publication is
// known locally — those remain each caller's OWN job, exactly as before
// this class existed. See docs/Principles.md, "A Shared Storage Boundary
// Does Not Merge The Sources That Feed It (0.8.36)."
export class StoreSnapshotContentUseCase {
    // localContentStore: a content/ContentStore.js instance — this
    // replica's own LOCAL store, the ONLY place this class ever writes
    // bytes to. Both application/
    // ImportPublicationSnapshotTransferPackageUseCase.js and application/
    // MaterializeSnapshotFromPlacementUseCase.js now construct exactly one
    // instance of this class over the SAME local store every other local
    // read/write already goes through — never a second, disconnected one.
    constructor(localContentStore) {
        if (!localContentStore || typeof localContentStore.put !== 'function' || typeof localContentStore.has !== 'function') {
            throw new Error('StoreSnapshotContentUseCase: a local ContentStore is required');
        }
        this._localContentStore = localContentStore;
    }

    // `contentHash`: the hash the caller CLAIMS `bytes` satisfy — from a
    // transfer package's own `contentHash` field, or a placement's own
    // `contentHash` field. `bytes`: the actual content, already retrieved
    // by the caller (from a package's `content`, or from a successful
    // placement resolution) — this class never itself retrieves anything.
    //
    // Returns `{ outcome, contentReference }`:
    //   outcome           — one of application/
    //                        StoreSnapshotContentOutcome.js's own three
    //                        values
    //   contentReference  — the core/ContentReference.js this replica now
    //                        holds bytes under (STORED/ALREADY_AVAILABLE),
    //                        or null (HASH_MISMATCH — nothing stored)
    async execute({ contentHash, bytes } = {}) {
        if (!contentHash || typeof contentHash !== 'string') {
            throw new Error('StoreSnapshotContentUseCase: a contentHash is required');
        }
        if (bytes === undefined || bytes === null) {
            throw new Error('StoreSnapshotContentUseCase: bytes are required');
        }

        const reference = new ContentReference({ hash: contentHash });
        if (!reference.verify(bytes)) {
            return { outcome: StoreSnapshotContentOutcome.HASH_MISMATCH, contentReference: null };
        }

        const alreadyStored = await this._localContentStore.has(reference);
        const storedReference = await this._localContentStore.put(bytes);
        return {
            outcome: alreadyStored ? StoreSnapshotContentOutcome.ALREADY_AVAILABLE : StoreSnapshotContentOutcome.STORED,
            contentReference: storedReference
        };
    }
}
