import { DecentralizedPublication } from '../core/DecentralizedPublication.js';

const STORAGE_KEY = 'publication-catalog:entries';

// 0.7.2 — Decentralized Publication Discovery & Catalog.
//
// 0.7.0 built a signed, protocol-neutral locator (core/
// DecentralizedPublication.js) and 0.7.1 proved it could be resolved
// through a real network-backed ContentStore. Neither ever gave a
// replica anywhere to keep a publication it has SEEN but not yet (or
// not currently) resolved. Every exchange class built since 0.5.3
// (application/PlaceNamingClaimExchange.js, application/
// BlueprintAttributionExchange.js) hands what it imports straight to a
// domain-specific store keyed by something the receiver must already
// know — a fingerprint, a (worldId, regionId) pair. A
// DecentralizedPublication has no such natural key: it can wrap ANY
// contentKind, and "what publications do I know about" has to be
// answerable before a caller has decided which domain, if any, it cares
// about. This class is that missing, deliberately domain-blind index.
//
//   answer:  "what publications do I know about?"
//   answer:  "which of them wrap this contentKind / point at this
//             content hash / were published by this identity?"
//   never:   "which publication is true?"
//   never:   "which of two publications for the same content wins?"
//   never:   "is the wrapped content even retrievable right now?"
//
// That last question is deliberately NOT this class's job — it belongs
// to application/PublicationResolver.js#resolve(), unchanged, called
// separately by whatever caller wants a live answer for one cataloged
// entry. Cataloging a publication only ever means "this replica has
// seen a validly signed envelope claiming this locator" — never
// "this replica has confirmed the bytes are there." See this
// milestone's own docs/Principles.md entry, "Discovery Is Not
// Resolution (0.7.2)," for why collapsing the two would silently
// reintroduce the exact "retrieve -> trust" shortcut application/
// PublicationResolver.js's own header has refused since 0.7.0.
//
// No PublicationCatalogEntry wrapper class exists here on purpose. A
// core/DecentralizedPublication.js instance already IS the slim,
// signed locator record this catalog is meant to index — id,
// contentKind, contentReference, publisherIdentity, signature, nothing
// more. Wrapping it in a second, catalog-specific value object would
// duplicate exactly those fields for no reason; every method below
// returns real DecentralizedPublication instances, ready to hand
// straight to application/PublicationResolver.js#resolve() unchanged.
//
// `receivedAt` is the one fact genuinely local to THIS replica and
// never part of the signed envelope — no author could ever sign in
// advance "when a stranger's replica first heard about this." Unlike
// application/LocalBlueprintAttributionPublicationLog.js and
// application/LocalPlaceNamingPublicationLog.js, which keep that same
// kind of fact in a SEPARATE log class, `receivedAt` lives right next
// to the signed envelope in the same stored record here: those two
// logs exist apart from their own stores because BlueprintAttribution/
// PlaceNamingClaim already had a store that must hold only the signed
// record verbatim, unchanged since 0.5.2/0.6.5. LocalPublicationCatalog
// has no such earlier shape to preserve, so there is nothing gained by
// splitting one local-only timestamp into a second class — the signed
// envelope (`entry.publication`) and the local metadata beside it
// (`entry.receivedAt`) are still two clearly separate fields on the
// stored record, never merged into the signed payload itself.
//
// First-seen-wins: add()ing a publication id already on file never
// resets `receivedAt`, and never overwrites the envelope already
// stored — mirrors application/LocalBlueprintAttributionPublicationLog.js's
// own identical rule, applied here directly rather than through a
// second log.
//
// No ranking, trust score, "canonical," or "preferred" field exists
// anywhere in this class, and none should ever be added to it — see
// this milestone's own docs/Principles.md entry for why turning
// discovery into adjudication would break the exact separation 0.7.0
// drew between "who published this locator" and "is it true."
export class LocalPublicationCatalog {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalPublicationCatalog: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Records `publication` (a DecentralizedPublication instance the
    // CALLER has already validated and verified — see application/
    // PublicationExchange.js, the only place in this codebase allowed to
    // call this with anything received from outside this replica) as
    // known to this replica. Equally correct for a publication this same
    // identity just created via application/PublicationResolver.js#
    // publish() — a replica's own publications are exactly as "known to
    // it" as ones it received, and this method draws no distinction
    // between the two the way application/
    // LocalBlueprintAttributionPublicationLog.js's own header explicitly
    // does for a SEPARATE reason (recordReceipt() is never called for a
    // self-authored attribution because that log exists to answer "when
    // did a STRANGER'S claim first arrive" — a question this catalog
    // never asks).
    //
    // Deduplicates by the envelope's own `id`, never by content hash — a
    // second, independently signed envelope pointing at the identical
    // bytes (a mirror, a re-publish under a new locator) is a distinct
    // publication, exactly the posture core/DecentralizedPublication.js's
    // own header already establishes; findByContentHash() below is how a
    // caller discovers such siblings, never how add() decides identity.
    // Returns `{ publication, isNew }`; a duplicate is never an error,
    // only the ordinary cost of the same publication reaching this
    // replica more than once.
    add(publication) {
        if (!publication || typeof publication.toJSON !== 'function' || !publication.id) {
            throw new Error('LocalPublicationCatalog: a DecentralizedPublication instance is required');
        }
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry.publication.id === publication.id);
        if (index !== -1) {
            return { publication: DecentralizedPublication.fromJSON(all[index].publication), isNew: false };
        }
        all.push({ publication: publication.toJSON(), receivedAt: new Date().toISOString() });
        this._storageProvider.save(STORAGE_KEY, all);
        return { publication, isNew: true };
    }

    has(publicationId) {
        return this._loadAll().some((entry) => entry.publication.id === publicationId);
    }

    // The cataloged DecentralizedPublication for `publicationId`, or null
    // if this replica has never seen one. Never resolves or retrieves
    // the wrapped content — see this class's own header.
    get(publicationId) {
        const entry = this._loadAll().find((e) => e.publication.id === publicationId);
        return entry ? DecentralizedPublication.fromJSON(entry.publication) : null;
    }

    // Withdraws a publication this replica knows about, by id.
    // LOCAL ONLY — mirrors application/LocalBlueprintAttributionStore.js#
    // retract()'s own header on why this can never reach a replica that
    // already cataloged the same publication independently; forgetting a
    // locator here never un-publishes it, and never makes the content it
    // pointed at any less real. Returns true if an entry existed and was
    // removed.
    remove(publicationId) {
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry.publication.id === publicationId);
        if (index === -1) {
            return false;
        }
        all.splice(index, 1);
        this._storageProvider.save(STORAGE_KEY, all);
        return true;
    }

    // Every publication known to this replica, most recently RECEIVED
    // first. Deliberately ordered by `receivedAt`, never by the
    // envelope's own self-reported `publishedAt` — a publisher-controlled
    // field is never the right axis for what THIS replica considers
    // "newest to it," the same restraint that motivated `receivedAt`
    // existing at all (see this class's own header).
    list() {
        return this._sorted(this._loadAll()).map((entry) => DecentralizedPublication.fromJSON(entry.publication));
    }

    // The ISO timestamp this replica first cataloged `publicationId` at,
    // or null if it has never been cataloged.
    getReceivedAt(publicationId) {
        const entry = this._loadAll().find((e) => e.publication.id === publicationId);
        return entry ? entry.receivedAt : null;
    }

    // Every cataloged publication whose OWN contentReference.hash equals
    // `hash` — every independently signed locator this replica has seen
    // for the identical bytes, none more authoritative than another. See
    // this class's own header on why add() never treats these as
    // duplicates of one another.
    findByContentHash(hash) {
        return this._filtered((entry) => entry.publication.contentReference?.hash === hash);
    }

    // Every cataloged publication wrapping `contentKind` — e.g. every
    // known BLUEPRINT_ATTRIBUTION_KIND envelope, regardless of which
    // design or publisher. A caller narrows further with its own
    // in-memory filter; this catalog never learns what a contentKind
    // string MEANS.
    findByContentKind(contentKind) {
        return this._filtered((entry) => entry.publication.contentKind === contentKind);
    }

    // Every cataloged publication whose signature names `publisherIdentityId`
    // as its own publisher — "what has this identity published, as far
    // as this replica has seen," never "what has this identity published,
    // full stop" (a question no single replica's catalog can ever answer
    // — see this class's own header on why 0.7.2 builds no global index).
    findByPublisher(publisherIdentityId) {
        return this._filtered((entry) => entry.publication.publisherIdentity?.id === publisherIdentityId);
    }

    _filtered(predicate) {
        return this._sorted(this._loadAll().filter(predicate))
            .map((entry) => DecentralizedPublication.fromJSON(entry.publication));
    }

    _sorted(entries) {
        return [...entries].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    }

    _loadAll() {
        return this._storageProvider.load(STORAGE_KEY) || [];
    }
}
