import { computeLifecycleStatus, describeLifecycleStatus } from '../document/DocumentLifecycleStatus.js';
import { detectSpatialOverlap } from '../../core/SpatialOverlap.js';
import { evaluateSpatialAllocation } from '../../core/SpatialAllocationPolicy.js';
import { isWithinRadius, distanceBetween } from '../../core/SpatialQuery.js';
import { summarizeDiscoveryDiagnostics } from '../../core/DiscoveryDiagnosticsSummary.js';

// Location-browser radii. NEARBY_RADIUS is small but non-zero: the camera
// essentially never lands exactly on a placement's position (Focus parks it
// at an orbit offset), so "What's here?" needs a tolerance.
const DEFAULT_EXPLORE_RADIUS = 25;

const NEARBY_RADIUS = 5;

// WorldNavigationSession methods for publications and their placements:
// document and placement info, overlap checks, search, the location browser,
// placing/moving/removing placements, unpublishing, commentary and
// notification history.
//
// The World Location Browser is camera-driven exploration of a region,
// instead of knowing a name or typing coordinates. Not a second discovery
// mechanism: every method wraps searchWorldByLocation/searchWorld, so there
// is one path (query -> discoveryProvider -> position enrichment -> radius
// test). Nothing in it moves, edits, forks or publishes (see
// docs/Principles.md, "Navigation Never Implies Editing").
export const placementMethods = {
    // Normalized data for the Document Info panel — the same shape
    // for a published snapshot, a fork, or an ordinary loaded
    // document, so the UI component doesn't need to know which one
    // it's looking at. `hasBeenSaved` is approximated as "not dirty":
    // every fork starts dirty the instant it's created (_forkForEdit
    // always calls history.markUnsaved()), so a clean history reliably
    // means an explicit saveDocument() happened since.
    getDocumentInfo(documentId) {
        const id = documentId || this._activeDocumentId;
        const doc = this.getDocument(id);
        if (!doc) return null;
        const isPublished = this.isDocumentPublished(id);
        const dirty = this.isDocumentDirty(id);
        const status = computeLifecycleStatus({ hasBeenSaved: !dirty, isPublished });
        return {
            documentId: id,
            title: doc.metadata.title || 'Untitled',
            description: doc.metadata.description || '',
            author: doc.metadata.author,
            // The ownership fact WorldAuthorizationService/WorldMembershipUseCase use,
            // so a Members panel can label the owner's row. Null for older documents.
            authorIdentityId: doc.metadata.authorIdentityId || null,
            license: doc.metadata.license,
            parentDocumentId: doc.metadata.parentDocumentId,
            status,
            statusLabel: describeLifecycleStatus(status, { dirty }),
            dirty,
            editable: !isPublished,
            editabilityNotice: this.getEditabilityNotice(id)
        };
    },

    // The Publication a loaded document's placements belong to; an unpublished
    // fork has none. Separate from _isKnownPublication/_findPublications, which
    // decide the fork-on-edit boundary: this answers which Publication the
    // spatial layer keys placements under, for the source or a fork of it.
    _resolvePublicationForPlacement(documentId) {
        const publications = this._findPublications(documentId);
        if (publications.length === 0) return null;
        return publications.reduce((latest, p) => (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
    },

    // A document can have several placements (see docs/Principles.md, "A
    // Publication Is What; A Placement Is Where"). This picks the most recently
    // updated one, like WorldLayoutProvider.getPosition; browsing/choosing among several is future scope.
    _resolvePlacementRecord(documentId) {
        if (!this._placementRegistry) return null;
        const publication = this._resolvePublicationForPlacement(documentId);
        if (!publication) return null;
        const records = this._placementRegistry.findByPublicationId(publication.id);
        if (records.length === 0) return null;
        return records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    },

    // Per-record facts (position, revision, owner, whether this identity may
    // move/remove it) shared by getPlacementInfo() and
    // getPlacementsForPublication(), so both compute them identically.
    _enrichPlacementRecord(record) {
        const currentUser = this._identityProvider ? this._identityProvider.currentUser() : null;
        const currentUsername = currentUser ? (currentUser.username || currentUser.id) : null;
        // A best-effort local ownership signal for the UI, never the authorization
        // boundary: a move is signed as the current user and fails verification
        // wherever it's checked if that isn't the owner or a valid delegate. A
        // placement with no recorded owner is treated as movable.
        const ownerName = record.owner || (record.ownerIdentity ? (record.ownerIdentity.username || record.ownerIdentity.id) : null);
        const ownedByCurrentUser = !ownerName || (currentUsername !== null && ownerName === currentUsername);
        // Passive overlap: how many other known placements sit at this exact
        // position (see docs/Principles.md, "Overlap Is A Fact; Collision Is A
        // Policy Decision"). Never blocks anything.
        const overlap = this._placementRegistry
            ? detectSpatialOverlap(record.position, this._placementRegistry.list(), { excludePlacementId: record.placementId })
            : null;
        return {
            placementId: record.placementId,
            publicationId: record.publicationId,
            position: { x: record.position.x, y: record.position.y, z: record.position.z },
            rotation: record.rotation,
            revision: record.revision,
            owner: ownerName,
            movable: ownedByCurrentUser,
            // Removing a placement, like moving one, is authority over where a
            // publication sits; reuses `ownedByCurrentUser`.
            removable: ownedByCurrentUser,
            overlapCount: overlap ? overlap.count : 0
        };
    },

    // Normalized data for a Placement Info panel — position, revision,
    // owner, and whether THIS identity is (as far as this session can
    // tell, locally) the one who may move it. Returns null when the
    // document has no known placement yet (never published, or
    // placementRegistry isn't wired) rather than a placement-shaped
    // object full of nulls.
    getPlacementInfo(documentId) {
        const id = documentId || this._activeDocumentId;
        const record = this._resolvePlacementRecord(id);
        if (!record) return null;
        return { documentId: id, ...this._enrichPlacementRecord(record) };
    },

    // Every placement of a Publication, unreduced, each enriched like
    // getPlacementInfo()'s record (see docs/Principles.md, "A Publication Is
    // What; A Placement Is Where"). Order is whatever findByPublicationId()
    // returns; never sorted, deduped or ranked. No `documentId`: a Publication
    // placed several times has no single document.
    //
    // Returns [] with no registry, no publicationId, or zero placements. A
    // discovery failure propagates rather than becoming an empty array, so
    // callers can tell "zero placements" from "discovery failed" (see
    // OwnPublicationPanel's refreshPublicationPlacements()).
    getPlacementsForPublication(publicationId) {
        if (!this._placementRegistry || typeof publicationId !== 'string' || publicationId.length === 0) return [];
        const records = this._placementRegistry.findByPublicationId(publicationId);
        return records.map((record) => this._enrichPlacementRecord(record));
    },

    // Like getPlacementInfo() but starting from a publicationId, for background
    // Snapshot processing (application/snapshot/AutomaticSnapshotEncounterCascade.js)
    // that has no open document. Returns only what
    // resolveSnapshotWorldPlacement() needs: `{ placementId, publicationId,
    // position }`. Null with no registry or no placement.
    getPlacementInfoForPublication(publicationId) {
        if (!this._placementRegistry || typeof publicationId !== 'string' || publicationId.length === 0) return null;
        const records = this._placementRegistry.findByPublicationId(publicationId);
        if (records.length === 0) return null;
        const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
        return {
            placementId: record.placementId,
            publicationId: record.publicationId,
            position: { x: record.position.x, y: record.position.y, z: record.position.z }
        };
    },

    // Exact-id Publication lookup for the Snapshot cascade's
    // `findPublicationById`. Reads `_publicationActionDiscoveryProvider`: an
    // exact-id lookup has no documentId-collision risk, so seeing
    // Repository-admitted Publications is safe. _describeSpatialOccupant()
    // keeps its own `_discoveryProvider` lookup. Null when unknown; never
    // throws.
    findPublicationById(publicationId) {
        if (!this._publicationActionDiscoveryProvider || typeof publicationId !== 'string' || publicationId.length === 0) return null;
        return this._publicationActionDiscoveryProvider.findById(publicationId) || null;
    },

    // Pre-flight for an explicit placement move: what's at newPosition, and does
    // the policy require confirmation? A pure query; movePlacement() doesn't
    // call it, the UI calls it first (see docs/Principles.md, "Overlap Is A
    // Fact; Collision Is A Policy Decision"). Null when there's nothing to check
    // (no registry, or no placement to move).
    checkPlacementOverlap(documentId, newPosition) {
        const id = documentId || this._activeDocumentId;
        if (!this._placementRegistry) return null;
        const record = this._resolvePlacementRecord(id);
        if (!record) return null;
        const overlap = detectSpatialOverlap(newPosition, this._placementRegistry.list(), { excludePlacementId: record.placementId });
        const decision = evaluateSpatialAllocation(this._spatialAllocationPolicy, overlap);
        return {
            ...decision,
            occupants: overlap.occupants.map((occupant) => this._describeSpatialOccupant(occupant))
        };
    },

    // "What's actually here?", including the inspected placement itself (unlike
    // checkPlacementOverlap, which excludes the one being moved). Read-only.
    //
    // Only published placements appear: an editing fork has no placement of its
    // own (it inherits a local, non-authoritative position; see
    // _localPositions).
    //
    // A PlacementRecord that outlived its unpublished Publication is a storage
    // fact, not a user-facing one. _describeSpatialOccupant() reports it with
    // documentId: null, and this presentation boundary omits it. The record,
    // spatial index and checkPlacementOverlap's occupants are untouched.
    getDocumentsAtPosition(position) {
        if (!this._placementRegistry) return [];
        const overlap = detectSpatialOverlap(position, this._placementRegistry.list());
        return overlap.occupants
            .map((occupant) => this._describeSpatialOccupant(occupant))
            .filter((occupant) => occupant.documentId !== null);
    },

    // Resolves a placement record into a title and a documentId to focus, falling
    // back to the publicationId when discovery can't resolve it. Shared by
    // checkPlacementOverlap and getDocumentsAtPosition.
    //
    // It doesn't know why a publication fails to resolve. checkPlacementOverlap
    // keeps unresolved occupants, since they are still physically there to
    // collide with; getDocumentsAtPosition omits them because it lists
    // user-facing documents.
    _describeSpatialOccupant(record) {
        const publication = this._discoveryProvider ? this._discoveryProvider.findById(record.publicationId) : null;
        return {
            documentId: publication ? publication.documentId : null,
            publicationId: record.publicationId,
            title: publication ? publication.title : record.publicationId,
            owner: record.owner || null
        };
    },

    // Search over the shared discovery machinery (application/world/SearchWorldUseCase.js),
    // enriched with a resolved position and whether it came from a real
    // PlacementRecord or the deterministic fallback grid (see docs/Principles.md,
    // "Publication Found Is Not The Same As Placement Found"). Read-only.
    //
    // Accepts a plain string or `{ text, center, radius }`. The spatial filter
    // runs here, after position enrichment, because a discovery-layer use case
    // has no reason to know about placements (see docs/Principles.md, "A
    // Spatial Query Is Authoritative Over Placement, Not A Local-Cache Scan").
    // Spatial results are nearest-first; text-only results keep discovery's
    // order.
    searchWorld(queryOrOptions) {
        if (!this._searchWorldUseCase) return [];
        const options = typeof queryOrOptions === 'string' ? { text: queryOrOptions } : (queryOrOptions || {});
        const candidates = this._searchWorldUseCase.execute(options);
        let results = candidates.map((publication) => this._describeSearchResult(publication, options.center));
        if (options.center && Number.isFinite(options.radius)) {
            results = results
                .filter((r) => r.position && isWithinRadius(r.position, options.center, options.radius))
                .sort((a, b) => a.distance - b.distance);
        }
        return results;
    },

    // A pure spatial query, equivalent to `searchWorld({ center, radius })`,
    // named separately because it reads more clearly.
    searchWorldByLocation({ center, radius }) {
        return this.searchWorld({ center, radius });
    },

    // `center` is optional — only passed when a spatial query is in
    // progress, so `distance` is computed (and included) ONLY when it
    // actually means something; a plain text search never carries a
    // `distance` field implying a query that was never made.
    _describeSearchResult(publication, center = null) {
        const explicit = this._placementRegistry
            ? this._placementRegistry.findByPublicationId(publication.id)
                .reduce((latest, r) => (!latest || r.revision > latest.revision) ? r : latest, null)
            : null;
        const resolved = this._worldLayoutProvider
            ? this._worldLayoutProvider.getPosition(publication.documentId)
            : null;
        const position = explicit
            ? { x: explicit.position.x, y: explicit.position.y, z: explicit.position.z }
            : (resolved ? { x: resolved.x, y: resolved.y, z: resolved.z } : null);
        return {
            documentId: publication.documentId,
            publicationId: publication.id,
            title: publication.title,
            author: publication.author,
            hasPlacement: !!explicit,
            position,
            distance: (center && position) ? distanceBetween(position, center) : null
        };
    },

    // Center/radius exploration. `searchWorldByLocation` decides which
    // documents come back; the result is `{ documents, diagnostics }` so a
    // caller can show what was found and what the trust layer says about it
    // without confusing the two (see docs/Principles.md, "Discovery And Trust
    // Are Related, But They Are Not The Same Operation"). searchWorld/
    // searchWorldByLocation still return plain arrays; see
    // docs/ArchitectureHistory.md for why the shapes weren't unified.
    exploreLocation({ center, radius }) {
        const documents = this.searchWorldByLocation({ center, radius });
        const diagnostics = this._runSpatialDiscoveryDiagnostics(center, radius);
        return { documents, diagnostics };
    },

    // "Explore Here": centered on the camera, not the active document's
    // placement; the camera may be over empty space with no active document.
    // Returns an empty envelope (diagnostics.available false) before any camera
    // state exists.
    exploreHere(radius = DEFAULT_EXPLORE_RADIUS) {
        const center = this.getSpatialState().cameraPosition;
        if (!center) return { documents: [], diagnostics: summarizeDiscoveryDiagnostics(null) };
        return this.exploreLocation({ center, radius });
    },

    // "What's Here?": exploreHere with a small radius (NEARBY_RADIUS).
    // getDocumentsAtPosition() tests exact position equality, which a
    // continuous camera coordinate never matches, so this uses a radius query
    // through the same code path.
    whatsHere() {
        return this.exploreHere(NEARBY_RADIUS);
    },

    // Runs the optional trust-capable spatialDiscoveryProvider over the same
    // center/radius only for diagnostics; its PlacementRecords are discarded and
    // never replace exploreLocation's documents.
    //
    // DecentralizedSpatialDiscoveryProvider.discover() throws for an untrusted
    // root/authority, which is right for an authoritative caller. Exploration is
    // read-only, so the throw becomes `diagnostics.fatal` instead of escaping a
    // UI action.
    _runSpatialDiscoveryDiagnostics(center, radius) {
        if (!this._spatialDiscoveryProvider || typeof this._spatialDiscoveryProvider.discover !== 'function') {
            this._lastDiscoveryDiagnosticsRaw = null;
            return summarizeDiscoveryDiagnostics(null);
        }
        let raw = null;
        try {
            this._spatialDiscoveryProvider.discover(center, radius);
            raw = typeof this._spatialDiscoveryProvider.getLastDiagnostics === 'function'
                ? this._spatialDiscoveryProvider.getLastDiagnostics()
                : null;
            this._lastDiscoveryDiagnosticsRaw = raw;
            return summarizeDiscoveryDiagnostics(raw);
        } catch (err) {
            this._lastDiscoveryDiagnosticsRaw = null;
            return summarizeDiscoveryDiagnostics(null, { fatal: err.message });
        }
    },

    // Read-only bundle for the Location Browser's "Inspect": Document Info and
    // Placement Info, never forcing a load. Results are usually not loaded, and
    // loading just to inspect would be a real side effect, so documentInfo may
    // be null; WorldLocationBrowser then falls back to the result's own fields.
    // placementInfo comes from the registry and is often available anyway.
    //
    // `trust` is the TrustObservation for this document's placement from the
    // most recent explore/whatsHere call's cached raw diagnostics, or null. Not
    // a fresh query.
    inspectDocument(documentId) {
        const placementInfo = this.getPlacementInfo(documentId);
        return {
            documentId,
            documentInfo: this.getDocumentInfo(documentId),
            placementInfo,
            trust: this._lookupTrustObservation(placementInfo)
        };
    },

    _lookupTrustObservation(placementInfo) {
        if (!placementInfo || !this._lastDiscoveryDiagnosticsRaw) {
            return null;
        }
        const match = this._lastDiscoveryDiagnosticsRaw.observations.find((o) =>
            o.subjectType === 'placement-record' && o.subjectId === placementInfo.placementId);
        if (!match) {
            return null;
        }
        return {
            status: match.status,
            reason: match.reason,
            freshness: match.freshness && typeof match.freshness.toJSON === 'function'
                ? match.freshness.toJSON()
                : match.freshness
        };
    },

    // Keyed by publicationId, unlike movePlacement()/removePlacement(): it
    // reaches Publications with no documentId path at all, such as a
    // Repository-admitted Publication this replica never published.
    //
    // Delegates to placePublicationUseCase, which builds the placement and
    // already supports first and later placements alike, so there's no "already
    // placed" guard. The PlacementRecord's owner is the caller, never the
    // Publication's author: placing a Publication never makes you its owner.
    //
    // Authorization is ungated, as for automatic initial placement; whether it
    // should be gated is an open product decision.
    //
    // Throws when no placePublicationUseCase is wired, like
    // movePlacement()/removePlacement().
    placePublication(publicationId, position) {
        if (!this._placePublicationUseCase) {
            throw new Error('WorldNavigationSession: publication cannot be placed — no PlacePublicationUseCase wired');
        }
        if (typeof publicationId !== 'string' || publicationId.length === 0) {
            throw new Error('WorldNavigationSession: placePublication requires a publicationId');
        }
        return this._placePublicationUseCase.execute(publicationId, position);
    },

    // Moves a placement. Not a document mutation: it never touches the
    // Document or Publication and never forks (see docs/Principles.md, "Moving
    // A Placement Is Not Editing A Document"), even for a still-published
    // snapshot. MoveWorldPlacementUseCase makes the signed revision; this only
    // resolves which placement `documentId` means.
    movePlacement(documentId, newPosition) {
        const id = documentId || this._activeDocumentId;
        if (!this._moveWorldPlacementUseCase) {
            throw new Error('WorldNavigationSession: placement cannot be moved — no MoveWorldPlacementUseCase wired');
        }
        const record = this._resolvePlacementRecord(id);
        if (!record) {
            throw new Error(`WorldNavigationSession: "${id}" has no known placement to move`);
        }
        return this._moveWorldPlacementUseCase.execute(record.placementId, newPosition);
    },

    // Takes the placement out of shared space. Not unpublish: the Publication,
    // Document and material are untouched, and the Publication can be found and
    // placed again. getPlacementInfo() returns null afterwards, so the panel
    // collapses on the next refresh.
    //
    // `expectedPlacementId` is an optional compare-and-swap guard: if the
    // placement now resolved for this document differs (moved, replaced or
    // removed since the panel rendered), it refuses rather than removing one
    // the person never saw. Without it, whatever resolves is removed.
    removePlacement(documentId, expectedPlacementId = null) {
        const id = documentId || this._activeDocumentId;
        if (!this._removeWorldPlacementUseCase) {
            throw new Error('WorldNavigationSession: placement cannot be removed — no RemoveWorldPlacementUseCase wired');
        }
        const record = this._resolvePlacementRecord(id);
        if (!record) {
            throw new Error(`WorldNavigationSession: "${id}" has no known placement to remove`);
        }
        if (expectedPlacementId && record.placementId !== expectedPlacementId) {
            throw new Error('WorldNavigationSession: this placement has changed since it was selected — refusing to remove a different placement');
        }
        this._removeWorldPlacementUseCase.execute(record.placementId);
    },

    // Retracts the Publication governing `documentId` from the catalog. Not a
    // placement removal or a document deletion: UnpublishDocumentUseCase decides
    // what happens, and this adds no cleanup of its own.
    //
    // Known side effect: getPlacementInfo()/movePlacement()/removePlacement()
    // resolve placements through the current Publication, so an existing
    // placement becomes unreachable by documentId, though the PlacementRecord
    // is untouched and still reachable by publicationId (see
    // getPlacementInfoForPublication()).
    //
    // `expectedPublicationId` is a compare-and-swap guard like
    // removePlacement()'s: a stale panel never retracts a Publication it didn't
    // read. Without it, whatever resolves is unpublished.
    //
    // Returns UnpublishDocumentUseCase.execute()'s boolean unchanged.
    unpublishDocument(documentId, expectedPublicationId = null) {
        const id = documentId || this._activeDocumentId;
        if (!this._unpublishDocumentUseCase) {
            throw new Error('WorldNavigationSession: publication cannot be unpublished — no UnpublishDocumentUseCase wired');
        }
        const publication = this._resolvePublicationForPlacement(id);
        if (!publication) {
            throw new Error(`WorldNavigationSession: "${id}" has no known publication to unpublish`);
        }
        if (expectedPublicationId && publication.id !== expectedPublicationId) {
            throw new Error('WorldNavigationSession: this publication has changed since it was selected — refusing to unpublish a different publication');
        }
        return this._unpublishDocumentUseCase.execute(publication.id);
    },

    // Read side, via GetPublicationCommentariesUseCase. Without it, `[]`. No
    // sorting here.
    getPublicationCommentaries(publicationId) {
        if (!this._getPublicationCommentariesUseCase || !publicationId) {
            return [];
        }
        return this._getPublicationCommentariesUseCase.execute({ publicationId });
    },

    // Write side, delegated to AddPublicationCommentaryUseCase. Throws when not
    // wired: creating commentary is an explicit action whose outcome the caller
    // must see. `authorIdentityId` is deliberately not a parameter. Optional
    // `commentaryId`/`createdAt` let a manual retry of an unchanged draft reuse
    // the store's idempotent-retry identity instead of creating a visible
    // duplicate (see OwnPublicationPanel).
    addPublicationCommentary({ publicationId, content, commentaryId, createdAt }) {
        if (!this._addPublicationCommentaryUseCase) {
            throw new Error('WorldNavigationSession: publication commentary cannot be created — no AddPublicationCommentaryUseCase wired');
        }
        return this._addPublicationCommentaryUseCase.execute({ publicationId, content, commentaryId, createdAt });
    },

    // Read-only seam for the Notification History panel. Without the use case,
    // `[]`. Once wired there is no try/catch here: authentication and storage
    // failures propagate, so the caller can tell "no notifications" from
    // "couldn't load" (see ui/components/NotificationHistoryPanel.js). No
    // sorting here.
    getRecipientNotificationEvents() {
        if (!this._getRecipientNotificationEventsUseCase) {
            return [];
        }
        return this._getRecipientNotificationEventsUseCase.execute();
    },
};
