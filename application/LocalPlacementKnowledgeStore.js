import {
    createSnapshotPlacementKnowledgeRecord,
    snapshotPlacementKnowledgeRecordFromJSON,
    snapshotPlacementKnowledgeRecordToJSON
} from './SnapshotPlacementKnowledgeRecord.js';

export const PLACEMENT_KNOWLEDGE_STORE_KEY = 'publication-snapshot-placement-catalog:knowledge';

// 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
//
// application/LocalAnchorKnowledgeStore.js's own class (0.8.17), applied
// to a placement instead of an anchor. application/
// LocalPublicationSnapshotPlacementCatalog.js answers "what placement
// CLAIMS do I know about." This class answers a deliberately SEPARATE
// question: "how did I come to know about each one, and when did I first
// learn it." It sits ALONGSIDE the placement catalog, never inside it —
// the exact split application/AnchorKnowledgeRecord.js's own header draws
// between `PublicationAnchor` and `AnchorKnowledgeRecord`, applied here:
//
//   LocalPublicationSnapshotPlacementCatalog   "what placements do I know?"
//   LocalPlacementKnowledgeStore                "how — and when — did I
//                                                 learn each?"
//
// DELIBERATELY NOT A SECOND CATALOG API. application/
// LocalPublicationSnapshotPlacementCatalog.js#add()'s own public contract
// is UNCHANGED by this milestone — a caller that both catalogs a
// placement and wants to record how it learned it makes two separate
// calls, to two separate collaborators (see application/
// CreatePublicationSnapshotPlacementUseCase.js, application/
// ImportPackageSnapshotPlacementsUseCase.js, and application/
// PublicationSnapshotPlacementPeerExchange.js, the three places this
// milestone wires a record() call alongside an existing catalog.add()-
// triggering import).
//
// FIRST-SEEN-WINS, the identical discipline application/
// LocalAnchorKnowledgeStore.js#record() already holds: record()-ing a
// placementId already on file is a no-op that returns `{ record: <the
// ORIGINAL record>, isNew: false }` — it never resets `firstSeenAt` and
// never overwrites the stored `acquisition.kind`. This is what makes
// "Bob receives Placement P1 via peer exchange, then later imports it
// again from a package; his own knowledge of it stays PEER" hold without
// any special-casing at any of this class's three callers — every one of
// them can call record() unconditionally, every time a placement reaches
// them, and the FIRST call across a replica's entire lifetime (restarts
// included, since this is as durable as the catalog itself) is the only
// one that ever sticks.
//
// PERSISTED, UNLIKE application/
// SnapshotPlacementResolutionObservation.js. A resolution outcome can
// change every time this replica re-checks the locator, so 0.8.20
// deliberately left that ephemeral, session-only UI state. How a replica
// FIRST learned a claim is a fact about that replica's own history that
// never changes once established — durability here is the whole point,
// exactly as application/LocalAnchorKnowledgeStore.js's own header
// already establishes for anchors.
//
// NEVER SIGNED, NEVER RE-VALIDATED ON RESTART. Unlike application/
// LocalPublicationSnapshotPlacementStore.js (whose entries application/
// RestorePublicationSnapshotPlacementCatalogUseCase.js re-earns trust in
// every startup), a stray or tampered SnapshotPlacementKnowledgeRecord
// carries no authority to lose — at worst it makes this replica's OWN
// "Learned via" badge wrong for one placement id, on this replica alone.
// It answers no question a signature could ever settle, and asserts
// nothing about any OTHER replica. There is therefore no restoration use
// case for this store: a fresh instance simply serves whatever is
// already on file.
export class LocalPlacementKnowledgeStore {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalPlacementKnowledgeStore: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Records that this replica has learned `placementId` via
    // `acquisitionKind` (an application/PlacementAcquisitionKind.js
    // value). `firstSeenAt` is this replica's own local clock, never the
    // external system's own reported time, and never trusted from a
    // peer. Safe to call unconditionally, every time a placement reaches
    // one of this store's three callers — see this class's own header on
    // why FIRST-SEEN-WINS makes that safe. Returns `{ record, isNew }`.
    record(placementId, acquisitionKind, firstSeenAt = new Date()) {
        const existing = this._loadOne(placementId);
        if (existing) {
            return { record: existing, isNew: false };
        }
        const record = createSnapshotPlacementKnowledgeRecord({ placementId, acquisitionKind, firstSeenAt });
        const all = this._loadAll();
        all.push(snapshotPlacementKnowledgeRecordToJSON(record));
        this._storageProvider.save(PLACEMENT_KNOWLEDGE_STORE_KEY, all);
        return { record, isNew: true };
    }

    has(placementId) {
        return this._loadOne(placementId) !== null;
    }

    // The SnapshotPlacementKnowledgeRecord for `placementId`, or null if
    // this replica has no record of ever learning it — including for a
    // placement that IS cataloged (application/
    // AddPublicationSnapshotPlacementUseCase.js's own generic,
    // no-acquisition-tracked path can catalog a placement with no
    // corresponding knowledge record); a caller reading `get()` back as
    // null there is simply "this replica has no local knowledge of how
    // it learned this," never an error.
    get(placementId) {
        return this._loadOne(placementId);
    }

    // Withdraws the knowledge record for `placementId`. LOCAL ONLY,
    // exactly like application/LocalPublicationSnapshotPlacementCatalog.js
    // #remove() — never called automatically by this codebase; a caller
    // that removes a placement from the catalog decides separately
    // whether its knowledge record should go with it.
    remove(placementId) {
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry && entry.placementId === placementId);
        if (index === -1) {
            return false;
        }
        all.splice(index, 1);
        this._storageProvider.save(PLACEMENT_KNOWLEDGE_STORE_KEY, all);
        return true;
    }

    // Every knowledge record on file, in storage order — never sorted
    // and never hydrated beyond the ordinary
    // snapshotPlacementKnowledgeRecordFromJSON() conversion every other
    // read here already applies. A caller that wants "most recently
    // learned first" sorts by `firstSeenAt` itself.
    list() {
        return this._loadAll()
            .filter((entry) => entry && entry.placementId)
            .map((entry) => snapshotPlacementKnowledgeRecordFromJSON(entry));
    }

    _loadOne(placementId) {
        const entry = this._loadAll().find((e) => e && e.placementId === placementId);
        return entry ? snapshotPlacementKnowledgeRecordFromJSON(entry) : null;
    }

    _loadAll() {
        return this._storageProvider.load(PLACEMENT_KNOWLEDGE_STORE_KEY) || [];
    }
}
