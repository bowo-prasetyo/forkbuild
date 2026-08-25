import { PUBLICATION_REPLICA_PACKAGE_KIND, CURRENT_SCHEMA_VERSION } from './PublicationReplicaPackage.js';
import { validateDecentralizedPublication, DecentralizedPublicationError } from './DecentralizedPublicationValidator.js';
import { validatePublicationAnchor, PublicationAnchorError } from './PublicationAnchorValidator.js';
import { validatePublicationSnapshotPlacement, PublicationSnapshotPlacementError } from './PublicationSnapshotPlacementValidator.js';

// 0.8.29 — Publication Replica Export & Offline Transfer.
//
// Strict, side-effect-free STRUCTURAL validation of a portable Publication
// Replica Package — the identical split application/
// BlueprintImportValidator.js already draws one file over: this module
// answers ONE question, "is this well-formed as a Publication Replica
// Package?", and never constructs a domain object, never checks a
// signature, and never persists anything. A package is untrusted input —
// it may have been hand-edited, corrupted in transit, or forged outright
// — so malformed input fails HERE, before anything is constructed or
// verified, exactly the same "nothing to roll back because nothing was
// ever attempted" posture every validator in this codebase already
// holds.
//
// Reuses every existing per-field structural check rather than
// reimplementing one: `publication` is checked with application/
// DecentralizedPublicationValidator.js, each bundled anchor with
// application/PublicationAnchorValidator.js, each bundled placement with
// application/PublicationSnapshotPlacementValidator.js — the SAME checks
// those files already run for a publication/anchor/placement arriving
// any other way (peer message, Blueprint Package, direct import). Every
// error one of those raises is re-thrown as THIS module's own
// PublicationReplicaPackageError, never leaked past this file's own
// boundary, mirroring application/BlueprintImportValidator.js's own
// per-field re-throw discipline exactly.
//
// The one check with no BlueprintImportValidator precedent: every bundled
// anchor/placement must name `publication.id` as its own `publicationId`.
// A Blueprint Package has no notion of "the publication this package is
// about" (see application/BlueprintPackage.js's own header), so it never
// makes this check; a Publication Replica Package's entire subject IS one
// publication, so enforcing that every claim it carries is actually about
// that publication keeps "one publication and its associated durable
// claims" a structural invariant, not merely a convention a caller could
// forget. This is a single string comparison, never a policy judgment
// about whether a claim is trustworthy — that stays entirely
// signature verification's job, one step later, in application/
// ImportPublicationReplicaPackageUseCase.js.
export class PublicationReplicaPackageError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PublicationReplicaPackageError';
    }
}

// Throws PublicationReplicaPackageError describing exactly what's wrong;
// returns nothing on success. Never mutates or normalizes `pkg`, never
// constructs a DecentralizedPublication/PublicationAnchor/
// PublicationSnapshotPlacement — a caller that wants hydrated instances
// does so afterward, the same "validate, THEN construct, THEN verify"
// order every exchange in this codebase already requires.
export function validatePublicationReplicaPackage(pkg) {
    if (!pkg || typeof pkg !== 'object') {
        throw new PublicationReplicaPackageError('PublicationReplicaPackage: package is missing or not an object');
    }
    if (pkg.kind !== PUBLICATION_REPLICA_PACKAGE_KIND) {
        throw new PublicationReplicaPackageError('PublicationReplicaPackage: this file is not a ForkBuild publication replica package');
    }
    if (pkg.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new PublicationReplicaPackageError(`PublicationReplicaPackage: unsupported schema version ${pkg.schemaVersion}`);
    }

    try {
        validateDecentralizedPublication(pkg.publication);
    } catch (e) {
        if (e instanceof DecentralizedPublicationError) {
            throw new PublicationReplicaPackageError(`PublicationReplicaPackage: publication is malformed — ${e.message}`);
        }
        throw e;
    }
    const publicationId = pkg.publication.id;

    if (pkg.anchors !== undefined) {
        if (!Array.isArray(pkg.anchors)) {
            throw new PublicationReplicaPackageError('PublicationReplicaPackage: anchors must be an array');
        }
        pkg.anchors.forEach((anchor, index) => {
            try {
                validatePublicationAnchor(anchor);
            } catch (e) {
                if (e instanceof PublicationAnchorError) {
                    throw new PublicationReplicaPackageError(`PublicationReplicaPackage: anchors[${index}] is malformed — ${e.message}`);
                }
                throw e;
            }
            if (anchor.publicationId !== publicationId) {
                throw new PublicationReplicaPackageError(`PublicationReplicaPackage: anchors[${index}] names a different publicationId than this package's own publication`);
            }
        });
    }

    if (pkg.placements !== undefined) {
        if (!Array.isArray(pkg.placements)) {
            throw new PublicationReplicaPackageError('PublicationReplicaPackage: placements must be an array');
        }
        pkg.placements.forEach((placement, index) => {
            try {
                validatePublicationSnapshotPlacement(placement);
            } catch (e) {
                if (e instanceof PublicationSnapshotPlacementError) {
                    throw new PublicationReplicaPackageError(`PublicationReplicaPackage: placements[${index}] is malformed — ${e.message}`);
                }
                throw e;
            }
            if (placement.publicationId !== publicationId) {
                throw new PublicationReplicaPackageError(`PublicationReplicaPackage: placements[${index}] names a different publicationId than this package's own publication`);
            }
        });
    }
}
