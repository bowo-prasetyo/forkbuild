import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';

// 0.8.29 — Publication Replica Export & Offline Transfer.
//
// The portable package format for moving one replica's DURABLE knowledge
// of one publication to another replica, entirely offline — the inverse
// of 0.8.28's own question ("what can this replica reconstruct without
// the network?"). Where application/BlueprintPackage.js (0.4.6) bundles a
// core/Structure.js plus whatever signed claims happen to travel
// alongside it, this file bundles no Structure at all: its ONE subject is
// a core/DecentralizedPublication.js envelope, plus the signed
// core/PublicationAnchor.js/core/PublicationSnapshotPlacement.js claims
// that name the SAME publicationId.
//
//   Publication Replica Package
//   ├── publication   — the signed envelope itself (0.7.0)
//   ├── anchors        — zero or more signed evidence claims about it (0.8.0)
//   └── placements      — zero or more signed retrieval-locator claims about it (0.8.18)
//
// Deliberately scoped to exactly ONE publication — see this milestone's
// own docs/Roadmap.md entry, "Deliberately excluded." A package with
// several unrelated publications, a diff between two replicas' knowledge,
// or any notion of ranking one replica's package over another's is
// explicitly future work (retargeted to 0.8.30, a replica
// synchronization/diff layer), not this file's concern.
//
// This module is PURE DATA ASSEMBLY, the identical restraint application/
// BlueprintPackage.js's own header already states one file over: no
// StorageProvider, no catalog, no network, no verification. Deterministic
// — the same publication (and the same anchors/placements) produces
// byte-identical JSON on every call, because each domain object's own
// toJSON() already emits fields in a fixed order.
//
// Every bundled anchor/placement must name the packaged publication's own
// `id` as its `publicationId` — unlike a Blueprint Package (which has no
// notion of "the publication this package is about," see that file's own
// header), THIS package explicitly names one, so nothing here should ever
// silently bundle a claim about a different publication under the wrong
// wrapper. This is a structural, single-field check, never a policy
// judgment about whether a claim is trustworthy.
export const CURRENT_SCHEMA_VERSION = 1;
export const PUBLICATION_REPLICA_PACKAGE_KIND = 'forkbuild.publication-replica-package';

// Builds the plain, JSON-safe replica package for one publication.
// `publication` must be a SIGNED core/DecentralizedPublication.js
// instance; `anchors`/`placements` (both optional, default empty) must be
// arrays of SIGNED core/PublicationAnchor.js/core/
// PublicationSnapshotPlacement.js instances, each naming
// `publication.id`. Refusing to package an unsigned envelope mirrors
// every export*() method in this codebase already refusing to export one
// (application/PublicationExchange.js#exportPublication(), application/
// PublicationAnchorExchange.js#exportAnchor(), application/
// PublicationSnapshotPlacementExchange.js#exportPlacement()) — a
// DecentralizedPublication/PublicationAnchor/PublicationSnapshotPlacement
// has no unsigned path at all once it reaches a catalog, so this is a
// structural impossibility being caught early, not a policy choice.
//
// `anchors`/`placements` are omitted entirely from the resulting package
// (rather than written out as empty arrays) when there are none to
// bundle — the identical "omit when empty" shape application/
// BlueprintPackage.js#buildBlueprintPackage() already establishes, so a
// publication-only package (no known claims yet) stays exactly as valid
// as one bundling several.
export function buildPublicationReplicaPackage(publication, { anchors = [], placements = [] } = {}) {
    if (!publication || !(publication instanceof DecentralizedPublication)) {
        throw new Error('PublicationReplicaPackage: a DecentralizedPublication instance is required');
    }
    if (!publication.signature) {
        throw new Error('PublicationReplicaPackage: refusing to package an unsigned publication');
    }
    if (!Array.isArray(anchors) || anchors.some((anchor) => !(anchor instanceof PublicationAnchor))) {
        throw new Error('PublicationReplicaPackage: anchors must be an array of PublicationAnchor instances');
    }
    if (anchors.some((anchor) => !anchor.signature)) {
        throw new Error('PublicationReplicaPackage: refusing to package an unsigned anchor');
    }
    if (anchors.some((anchor) => anchor.publicationId !== publication.id)) {
        throw new Error('PublicationReplicaPackage: every anchor must name the packaged publication\'s own id');
    }
    if (!Array.isArray(placements) || placements.some((placement) => !(placement instanceof PublicationSnapshotPlacement))) {
        throw new Error('PublicationReplicaPackage: placements must be an array of PublicationSnapshotPlacement instances');
    }
    if (placements.some((placement) => !placement.signature)) {
        throw new Error('PublicationReplicaPackage: refusing to package an unsigned placement');
    }
    if (placements.some((placement) => placement.publicationId !== publication.id)) {
        throw new Error('PublicationReplicaPackage: every placement must name the packaged publication\'s own id');
    }

    const pkg = {
        kind: PUBLICATION_REPLICA_PACKAGE_KIND,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        publication: publication.toJSON()
    };
    if (anchors.length > 0) {
        pkg.anchors = anchors.map((anchor) => anchor.toJSON());
    }
    if (placements.length > 0) {
        pkg.placements = placements.map((placement) => placement.toJSON());
    }
    return pkg;
}
