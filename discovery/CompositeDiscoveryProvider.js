import { DiscoveryProvider } from './DiscoveryProvider.js';

// 0.9.339 — Merge Decentralized Publication Discovery into Repository
// Discovery.
//
// 0.9.338's own audit located the ONE remaining gap precisely:
// application/CreateDiscoveryUseCase.js — the composition root Repository,
// Author, Editor's fork/load lookup, and World View all independently
// call — constructs a fresh discovery/LocalDiscoveryProvider.js every
// time and never merges in the app-wide
// discovery/DecentralizedPublicationDiscoveryProvider.js instance
// ui/main.js already builds and shares (0.9.337). Its own recommended
// fix, verbatim: "a small, generic composite discoveryProvider, never a
// new Repository-owned store, never a source/origin field on a result."
// This class is exactly that, and nothing else.
//
// It performs no discovery, no resolution, no deduplication, no
// ranking, and no source preference of its own — it only ever forwards
// each discovery/DiscoveryProvider.js method to every provider it was
// given, combining their answers:
//   - list()/findByAuthor()/findByParentId()/findByDocumentId() return
//     the CONCATENATION of every provider's own results, in the order
//     the providers were given to the constructor. That order is an
//     implementation detail of composition, not a designed "local
//     first" or "decentralized first" policy — nothing here chooses it
//     on the results' behalf. It is also, in practice, rarely visible:
//     application/SearchPublicationsUseCase.js's own execute() already
//     re-sorts the FULL candidate set via query.sort immediately after
//     calling list() (see its own header), so a Repository search
//     result's actual display order never depends on this class's
//     concatenation order at all.
//   - findById() returns the first match found, checking each provider
//     in the same given order, so exactly one Publication — never a
//     duplicate — is ever returned for a given id.
//
// A falsy provider (e.g. a view that received `null` because no shared
// decentralized provider was ever injected) is simply skipped — see
// this class's own constructor — so composing with an absent provider
// degrades to exactly the single-provider behavior a caller would get
// by using that one provider directly, never an error.
export class CompositeDiscoveryProvider extends DiscoveryProvider {
    constructor(providers) {
        super();
        this._providers = providers.filter(Boolean);
    }

    list() {
        return this._providers.flatMap((provider) => provider.list());
    }

    findById(id) {
        for (const provider of this._providers) {
            const found = provider.findById(id);
            if (found) {
                return found;
            }
        }
        return null;
    }

    findByAuthor(author) {
        return this._providers.flatMap((provider) => provider.findByAuthor(author));
    }

    findByParentId(parentDocumentId) {
        return this._providers.flatMap((provider) => provider.findByParentId(parentDocumentId));
    }

    findByDocumentId(documentId) {
        return this._providers.flatMap((provider) => provider.findByDocumentId(documentId));
    }
}
