import { PublicationAnchor } from '../core/PublicationAnchor.js';

const STORAGE_KEY = 'publication-anchor-catalog:entries';

// 0.8.2 — Anchor Catalog & Evidence Discovery.
//
// 0.8.0 gave this codebase a new kind of signed evidence
// (`core/PublicationAnchor.js`); 0.8.1 gave it a way to independently
// verify one. Neither ever gave a replica anywhere to KEEP an anchor it
// has seen. This class is application/LocalPublicationCatalog.js's own
// pattern, applied one step further down the same chain that class's own
// header draws:
//
//   Content            "what are these bytes?"
//      │
//      ▼
//   DecentralizedPublication -> LocalPublicationCatalog  "what locators
//      │                         do I know about?"
//      ▼
//   PublicationAnchor (THIS FILE'S subject) -> LocalPublicationAnchorCatalog
//                                              "what evidence CLAIMS do
//                                               I know about?"
//
//   answer:  "what anchors do I know about?"
//   answer:  "which of them name this publicationId / contentHash /
//             anchorType?"
//   never:   "which of them are true?"
//   never:   "which anchor is canonical for this publication?"
//
// Cataloging Is Not Verifying — the identical restraint application/
// LocalPublicationCatalog.js's own header already draws between
// discovery and resolution, applied here to evidence instead of
// locators. add() never calls application/ExternalAnchorVerifier.js,
// never checks a signature, never touches the network, and never stores
// a verification outcome. An anchor whose external system is currently
// unreachable, whose proof is outright wrong, or whose signature would
// fail to verify is exactly as cataloggable as a perfectly valid one —
// this class cannot tell the difference, and does not try to. A caller
// that wants to know whether a cataloged anchor actually holds up asks
// application/ExternalAnchorVerifier.js separately, every time, and
// never gets to cache the answer here. See docs/Principles.md,
// "Cataloging External Evidence Does Not Validate External Evidence
// (0.8.2)."
//
// No PublicationAnchorCatalogEntry wrapper class exists here, for the
// identical reason application/LocalPublicationCatalog.js's own header
// gives for skipping one: a core/PublicationAnchor.js instance already
// IS the slim, signed record this catalog indexes. Every method below
// returns real PublicationAnchor instances, ready to hand straight to
// application/ExternalAnchorVerifier.js#verify() unchanged.
//
// Identity for dedup is the anchor's own `id` — core/PublicationAnchor.js
// already mints one (`createId()`) as part of every anchor's signed
// payload, so this class introduces no second fingerprinting scheme.
// Two replicas that each receive the identical anchor recognize it as
// the same anchor regardless of when either one first saw it, the exact
// property application/LocalPublicationCatalog.js's own `publication.id`
// dedup already gives publications.
//
// First-seen-wins, exactly like application/LocalPublicationCatalog.js#
// add(): re-adding an anchor id already on file never resets
// `receivedAt` and never overwrites the stored envelope. `receivedAt` is
// local-only metadata, never part of the signed anchor itself — no
// anchoring identity could ever sign in advance "when a stranger's
// replica first heard about this."
//
// Multiple independent anchors — different anchoring identities,
// different anchorTypes, different locators, even different anchor ids
// naming the SAME publicationId/contentHash — all coexist here, exactly
// as core/PublicationAnchor.js's own header requires. This catalog never
// collapses them into one, never picks a "best" one, and holds no
// ranking, trust score, or "canonical anchor" field anywhere in it —
// see this milestone's own docs/Principles.md entry.
export class LocalPublicationAnchorCatalog {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalPublicationAnchorCatalog: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Records `anchor` (a PublicationAnchor instance the CALLER is
    // responsible for having already structurally validated — see
    // application/AddPublicationAnchorUseCase.js, the ordinary way an
    // anchor reaches this catalog) as known to this replica. Never
    // verifies the anchor's signature or proof — see this class's own
    // header. Deduplicates by the envelope's own `id`; a duplicate is
    // never an error, only the ordinary cost of the same anchor reaching
    // this replica more than once. Returns `{ anchor, isNew }`.
    add(anchor) {
        if (!anchor || typeof anchor.toJSON !== 'function' || !anchor.id) {
            throw new Error('LocalPublicationAnchorCatalog: a PublicationAnchor instance is required');
        }
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry.anchor.id === anchor.id);
        if (index !== -1) {
            return { anchor: PublicationAnchor.fromJSON(all[index].anchor), isNew: false };
        }
        all.push({ anchor: anchor.toJSON(), receivedAt: new Date().toISOString() });
        this._storageProvider.save(STORAGE_KEY, all);
        return { anchor, isNew: true };
    }

    has(anchorId) {
        return this._loadAll().some((entry) => entry.anchor.id === anchorId);
    }

    // The cataloged PublicationAnchor for `anchorId`, or null if this
    // replica has never seen one. Never verifies anything — see this
    // class's own header.
    get(anchorId) {
        const entry = this._loadAll().find((e) => e.anchor.id === anchorId);
        return entry ? PublicationAnchor.fromJSON(entry.anchor) : null;
    }

    // Withdraws an anchor this replica knows about, by id. LOCAL ONLY —
    // mirrors application/LocalPublicationCatalog.js#remove()'s own
    // header: forgetting an anchor here never un-attests it, and never
    // makes the evidence it claimed any less (or more) real for a
    // replica that still has it. Never mutates the removed anchor itself
    // — the returned/removed record is the same immutable envelope that
    // was added. Returns true if an entry existed and was removed.
    remove(anchorId) {
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry.anchor.id === anchorId);
        if (index === -1) {
            return false;
        }
        all.splice(index, 1);
        this._storageProvider.save(STORAGE_KEY, all);
        return true;
    }

    // Every anchor known to this replica, most recently RECEIVED first —
    // deterministic, and ordered by `receivedAt`, never by the envelope's
    // own self-reported `anchoredAt` (an anchoring-identity-controlled
    // field is never the right axis for what THIS replica considers
    // "newest to it" — the identical restraint application/
    // LocalPublicationCatalog.js#list() already applies to `publishedAt`).
    list() {
        return this._sorted(this._loadAll()).map((entry) => PublicationAnchor.fromJSON(entry.anchor));
    }

    // The ISO timestamp this replica first cataloged `anchorId` at, or
    // null if it has never been cataloged.
    getReceivedAt(anchorId) {
        const entry = this._loadAll().find((e) => e.anchor.id === anchorId);
        return entry ? entry.receivedAt : null;
    }

    // Every cataloged anchor naming `publicationId` — every independent
    // piece of evidence this replica has seen about that publication,
    // none more authoritative than another.
    findByPublicationId(publicationId) {
        return this._filtered((entry) => entry.anchor.publicationId === publicationId);
    }

    // Every cataloged anchor naming `contentHash` — the same evidence
    // search as findByPublicationId(), narrowed to the bytes themselves
    // rather than one particular publication envelope that named them.
    findByContentHash(contentHash) {
        return this._filtered((entry) => entry.anchor.contentHash === contentHash);
    }

    // Every cataloged anchor whose own `anchorType` equals `anchorType` —
    // e.g. every known `bitcoin-op-return` anchor, regardless of which
    // publication or anchoring identity. A caller narrows further with
    // its own in-memory filter; this catalog never learns what an
    // anchorType string MEANS.
    findByAnchorType(anchorType) {
        return this._filtered((entry) => entry.anchor.anchorType === anchorType);
    }

    _filtered(predicate) {
        return this._sorted(this._loadAll().filter(predicate))
            .map((entry) => PublicationAnchor.fromJSON(entry.anchor));
    }

    _sorted(entries) {
        return [...entries].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    }

    _loadAll() {
        return this._storageProvider.load(STORAGE_KEY) || [];
    }
}
