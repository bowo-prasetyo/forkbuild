import { createAnchorKnowledgeRecord, anchorKnowledgeRecordFromJSON, anchorKnowledgeRecordToJSON } from './AnchorKnowledgeRecord.js';

export const ANCHOR_KNOWLEDGE_STORE_KEY = 'publication-anchor-catalog:knowledge';

// 0.8.17 — Evidence Provenance & Observation Boundary.
//
// application/LocalPublicationAnchorCatalog.js answers "what evidence
// CLAIMS do I know about." This class answers a deliberately SEPARATE
// question this codebase has never recorded anywhere: "how did I come
// to know about each one, and when did I first learn it." It sits
// ALONGSIDE the anchor catalog, never inside it — the exact split this
// milestone's own docs/Roadmap.md entry draws between `PublicationAnchor`
// (the immutable claim) and `AnchorKnowledgeRecord` (a replica-local
// observation about that claim):
//
//   LocalPublicationAnchorCatalog   "what anchors do I know about?"
//   LocalAnchorKnowledgeStore       "how — and when — did I learn each?"
//
// DELIBERATELY NOT A SECOND CATALOG API. application/
// LocalPublicationAnchorCatalog.js#add()'s own public contract is
// UNCHANGED by this milestone — see that file's own header on why
// changing it was ruled out. A caller that both catalogs an anchor and
// wants to record how it learned it makes two separate calls, to two
// separate collaborators (see application/CreatePublicationAnchorUseCase
// .js, application/ImportPackageAnchorsUseCase.js, and application/
// PublicationAnchorPeerExchange.js, the three places this milestone
// wires a record() call alongside an existing catalog.add()-triggering
// import).
//
// FIRST-SEEN-WINS, the identical discipline application/
// LocalPublicationAnchorStore.js#save() already holds for the catalog
// itself (0.8.2/0.8.15): record()-ing an anchorId already on file is a
// no-op that returns `{ record: <the ORIGINAL record>, isNew: false }` —
// it never resets `firstSeenAt` and never overwrites the stored
// `acquisition.kind`. This is what makes "Bob receives Anchor A via
// peer exchange, then later imports it again from a package; his own
// knowledge of it stays PEER" hold without any special-casing at any of
// this class's three callers — every one of them can call record()
// unconditionally, every time an anchor reaches them, and the FIRST call
// across a replica's entire lifetime (restarts included, since this is
// as durable as the catalog itself) is the only one that ever sticks.
//
// PERSISTED, UNLIKE application/
// PublicationAnchorVerificationObservation.js. A verification outcome
// can change every time the external world is re-checked, so 0.8.12
// deliberately kept it session-only, ephemeral UI state. How a replica
// FIRST learned a claim is a fact about that replica's own history that
// never changes once established — durability here is the whole point,
// not an oversight the way it would be for a verification observation.
// See application/AnchorKnowledgeRecord.js's own header.
//
// NEVER SIGNED, NEVER RE-VALIDATED ON RESTART. Unlike application/
// LocalPublicationAnchorStore.js (whose entries application/
// RestorePublicationAnchorCatalogUseCase.js re-earns trust in every
// startup, because a forged catalog entry would let a replica claim
// evidence that was never actually signed), a stray or tampered
// AnchorKnowledgeRecord carries no authority to lose — at worst it makes
// this replica's OWN "Learned via" badge wrong for one anchor id, on
// this replica alone. It answers no question a signature could ever
// settle, and asserts nothing about any OTHER replica. There is
// therefore no restoration use case for this store: a fresh instance
// simply serves whatever is already on file, exactly as application/
// LocalPublicationAnchorCatalog.js itself did before 0.8.15 introduced
// restoration for the (much higher-stakes) catalog.
export class LocalAnchorKnowledgeStore {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalAnchorKnowledgeStore: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Records that this replica has learned `anchorId` via
    // `acquisitionKind` (an application/AnchorAcquisitionKind.js value).
    // `firstSeenAt` is this replica's own local clock, exactly like
    // application/LocalPublicationAnchorStore.js#save()'s own
    // `receivedAt` — never the external system's own reported time, and
    // never trusted from a peer. Safe to call unconditionally, every
    // time an anchor reaches one of this store's three callers — see
    // this class's own header on why FIRST-SEEN-WINS makes that safe.
    // Returns `{ record, isNew }`.
    record(anchorId, acquisitionKind, firstSeenAt = new Date()) {
        const existing = this._loadOne(anchorId);
        if (existing) {
            return { record: existing, isNew: false };
        }
        const record = createAnchorKnowledgeRecord({ anchorId, acquisitionKind, firstSeenAt });
        const all = this._loadAll();
        all.push(anchorKnowledgeRecordToJSON(record));
        this._storageProvider.save(ANCHOR_KNOWLEDGE_STORE_KEY, all);
        return { record, isNew: true };
    }

    has(anchorId) {
        return this._loadOne(anchorId) !== null;
    }

    // The AnchorKnowledgeRecord for `anchorId`, or null if this replica
    // has no record of ever learning it — including for an anchor that
    // IS cataloged (application/AddPublicationAnchorUseCase.js's own
    // generic, no-acquisition-tracked path can catalog an anchor with no
    // corresponding knowledge record; a caller reading `get()` back as
    // null there is simply "this replica has no local knowledge of how
    // it learned this," never an error).
    get(anchorId) {
        return this._loadOne(anchorId);
    }

    // Withdraws the knowledge record for `anchorId`. LOCAL ONLY, exactly
    // like application/LocalPublicationAnchorCatalog.js#remove() — never
    // called automatically by this codebase; a caller that removes an
    // anchor from the catalog decides separately whether its knowledge
    // record should go with it.
    remove(anchorId) {
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry && entry.anchorId === anchorId);
        if (index === -1) {
            return false;
        }
        all.splice(index, 1);
        this._storageProvider.save(ANCHOR_KNOWLEDGE_STORE_KEY, all);
        return true;
    }

    // Every knowledge record on file, in storage order — never sorted
    // and never hydrated beyond the ordinary anchorKnowledgeRecordFromJSON()
    // conversion every other read here already applies. A caller that
    // wants "most recently learned first" sorts by `firstSeenAt` itself,
    // exactly as application/LocalPublicationAnchorCatalog.js#list() does
    // one layer up over the (much higher-stakes) anchor catalog.
    list() {
        return this._loadAll()
            .filter((entry) => entry && entry.anchorId)
            .map((entry) => anchorKnowledgeRecordFromJSON(entry));
    }

    _loadOne(anchorId) {
        const entry = this._loadAll().find((e) => e && e.anchorId === anchorId);
        return entry ? anchorKnowledgeRecordFromJSON(entry) : null;
    }

    _loadAll() {
        return this._storageProvider.load(ANCHOR_KNOWLEDGE_STORE_KEY) || [];
    }
}
