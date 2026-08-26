import { ContentReference } from '../core/ContentReference.js';
import { isValidContentHash } from './PeerContentProtocol.js';

// 0.8.32 — Explicit Snapshot Content Transfer.
//
// Every offline package this codebase has built since 0.8.7 transfers
// CLAIMS: application/BlueprintPackage.js bundles a Structure plus signed
// attributions, application/PublicationReplicaPackage.js (0.8.29) bundles
// a DecentralizedPublication plus signed anchors/placements. None of them
// has ever bundled the one thing every anchor/placement claim is
// ultimately ABOUT — the actual snapshot bytes a `core/
// ContentReference.js#hash` names. A replica that imports a full
// Publication Replica Package now knows a publication exists, knows what
// evidence anchors it, and knows where a placement CLAIMS its bytes can
// be retrieved — and still does not possess a single byte of the
// snapshot itself. This file is the missing counterpart:
//
//   Publication Replica Package (0.8.29)   "what does this replica know
//        publication + anchors + placements   about this publication?"
//
//   Publication Snapshot Transfer Package   "here are the actual bytes"
//        (THIS FILE)
//
// Deliberately scoped to exactly ONE publication's content, exactly like
// application/PublicationReplicaPackage.js scopes itself to one
// publication's claims (see that file's own header, "Deliberately
// excluded"). A package bundling several publications' content, or any
// notion of ranking one replica's copy of the bytes over another's, is
// out of scope here for the identical reason.
//
// This module is PURE DATA ASSEMBLY, the same restraint every *Package.js
// module in this codebase already holds: no ContentStore, no catalog, no
// network. `content` is handed in already retrieved by the caller — this
// file never fetches it, and never verifies it hashes to `contentHash`
// (that check belongs to whichever boundary is about to TRUST the bytes:
// application/ImportPublicationSnapshotTransferPackageUseCase.js on
// import, mirroring the identical asymmetry application/
// PeerContentExchange.js already draws between its own sending side,
// which trusts its own ContentStore, and its own receiving side, which
// verifies every byte it did not produce itself).
//
//   publicationId — names WHICH publication this transfer is about,
//                    never validated against a bundled publication
//                    envelope, because none travels in this package —
//                    see this file's own header on why that pairing is
//                    application/PublicationReplicaPackage.js's job, not
//                    this one's.
//   contentHash   — the CLAIMED identity of `content`, in the identical
//                    hex-string shape application/PeerContentProtocol.js#
//                    isValidContentHash() already accepts for the SAME
//                    field carried over a live peer connection.
//   content       — the snapshot bytes themselves, as a string — the same
//                    "bytes are always a string" convention content/
//                    LocalContentStore.js and content/IpfsContentStore.js
//                    already both hold.
export const CURRENT_SCHEMA_VERSION = 1;
export const PUBLICATION_SNAPSHOT_TRANSFER_PACKAGE_KIND = 'forkbuild.snapshot-content-transfer-package';

// Builds the plain, JSON-safe snapshot transfer package for one
// publication's content. `publicationId` must be a non-empty string;
// `contentReference` must be (or parse into) a core/ContentReference.js
// carrying a `hash`; `content` must be a non-empty string. Structural
// checks only — see this file's own header on why hash verification
// happens one layer up, never here.
export function buildPublicationSnapshotTransferPackage(publicationId, contentReference, content) {
    if (!publicationId || typeof publicationId !== 'string' || !publicationId.trim()) {
        throw new Error('PublicationSnapshotTransferPackage: a publicationId is required');
    }
    const reference = contentReference instanceof ContentReference
        ? contentReference
        : ContentReference.fromJSON(contentReference);
    if (!reference || !isValidContentHash(reference.hash)) {
        throw new Error('PublicationSnapshotTransferPackage: a contentReference with a valid hash is required');
    }
    if (typeof content !== 'string' || content.length === 0) {
        throw new Error('PublicationSnapshotTransferPackage: non-empty content bytes are required');
    }

    return {
        kind: PUBLICATION_SNAPSHOT_TRANSFER_PACKAGE_KIND,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        publicationId,
        contentHash: reference.hash,
        content
    };
}
