import { PUBLICATION_SNAPSHOT_TRANSFER_PACKAGE_KIND, CURRENT_SCHEMA_VERSION } from './PublicationSnapshotTransferPackage.js';
import { isValidContentHash } from './PeerContentProtocol.js';

// 0.8.32 — Explicit Snapshot Content Transfer.
//
// Strict, side-effect-free STRUCTURAL validation of a portable Publication
// Snapshot Transfer Package — the identical split every *PackageValidator.js
// in this codebase already draws (application/BlueprintImportValidator.js,
// application/PublicationReplicaPackageValidator.js, 0.8.29): this module
// answers ONE question, "is this well-formed as a Publication Snapshot
// Transfer Package?", and never checks whether `content` actually hashes
// to `contentHash` — that is a TRUST question, asked one layer up by
// application/ImportPublicationSnapshotTransferPackageUseCase.js, exactly
// the same "structural shape here, trust boundary one layer up" split
// application/PublicationReplicaPackageValidator.js's own header already
// draws between itself and a bundled anchor/placement's SIGNATURE
// verification.
//
// `isValidContentHash()` is reused, unchanged, from application/
// PeerContentProtocol.js (0.7.4) — the identical format check a content
// hash arriving over a LIVE peer connection already passes through,
// applied here to the SAME field arriving via an offline file instead.
export class PublicationSnapshotTransferPackageError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PublicationSnapshotTransferPackageError';
    }
}

// Throws PublicationSnapshotTransferPackageError describing exactly
// what's wrong; returns nothing on success. Never mutates `pkg`, and
// never computes or compares a hash — see this file's own header.
export function validatePublicationSnapshotTransferPackage(pkg) {
    if (!pkg || typeof pkg !== 'object') {
        throw new PublicationSnapshotTransferPackageError('PublicationSnapshotTransferPackage: package is missing or not an object');
    }
    if (pkg.kind !== PUBLICATION_SNAPSHOT_TRANSFER_PACKAGE_KIND) {
        throw new PublicationSnapshotTransferPackageError('PublicationSnapshotTransferPackage: this file is not a ForkBuild snapshot content transfer package');
    }
    if (pkg.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new PublicationSnapshotTransferPackageError(`PublicationSnapshotTransferPackage: unsupported schema version ${pkg.schemaVersion}`);
    }
    if (!pkg.publicationId || typeof pkg.publicationId !== 'string' || !pkg.publicationId.trim()) {
        throw new PublicationSnapshotTransferPackageError('PublicationSnapshotTransferPackage: publicationId is missing or not a string');
    }
    if (!isValidContentHash(pkg.contentHash)) {
        throw new PublicationSnapshotTransferPackageError('PublicationSnapshotTransferPackage: contentHash is missing or not a valid content hash');
    }
    if (typeof pkg.content !== 'string' || pkg.content.length === 0) {
        throw new PublicationSnapshotTransferPackageError('PublicationSnapshotTransferPackage: content is missing or not a non-empty string');
    }
}
