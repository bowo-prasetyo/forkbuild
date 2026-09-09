import { DiscoveryProvider } from './DiscoveryProvider.js';
import { Publication } from '../publisher/Publication.js';

// 0.9.335 — Decentralized Publication Discovery Provider.
//
// 0.9.334 (Federated Repository Discovery Seam Audit) proved the CONTRACT
// was never the gap: Repository's own SearchPublicationsUseCase already
// accepts a plain publisher/Publication.js instance from any
// discoveryProvider.list(), and a Publication resolved through the
// existing decentralized resolution pipeline (0.9.331) already IS one —
// proven live, by instanceof, not by reading a type annotation. What that
// audit's own flagship proof required, and production code did not yet
// supply, was somewhere to accumulate a resolved candidate for list() to
// find (its own Section F).
//
// This class is exactly that accumulator, and nothing else. It performs
// no decentralized discovery of its own — no Nostr, no peer exchange, no
// Arweave, no PublicationResolver call. Discovering a candidate and
// resolving it are somebody else's job, upstream of this class; this
// class only ever catalogs a Publication it is handed, and lists what it
// has been given, in the order it was given.
//
// Deliberately boring, matching the same restraint 0.9.331's own
// decentralized content-kind plugin applied to its own `store` option: no
// signature verification, no content resolution, no trust judgement, and
// no invented deduplication policy — discovery/DiscoveryProvider.js's own
// contract specifies no uniqueness requirement, so none is added here.
export class DecentralizedPublicationDiscoveryProvider extends DiscoveryProvider {
    constructor() {
        super();
        this._publications = [];
    }

    // Accepts an already-resolved Publication and retains it as a
    // discovery result. The only check is that it genuinely is one —
    // nothing about its signature, content, or origin is inspected here.
    add(publication) {
        if (!(publication instanceof Publication)) {
            throw new Error('DecentralizedPublicationDiscoveryProvider.add() requires a Publication instance');
        }
        this._publications.push(publication);
    }

    // Returns every Publication accumulated so far, in insertion order.
    // A defensive copy, so a caller mutating the returned array (as
    // SearchPublicationsUseCase's own `.slice().sort()` already does)
    // never touches this provider's internal state.
    list() {
        return this._publications.slice();
    }

    findById(id) {
        return this._publications.find((p) => p.id === id) || null;
    }

    findByAuthor(author) {
        return this._publications.filter((p) => p.author === author);
    }

    findByParentId(parentDocumentId) {
        return this._publications.filter((p) => p.parentDocumentId === parentDocumentId);
    }

    findByDocumentId(documentId) {
        return this._publications.filter((p) => p.documentId === documentId);
    }
}
