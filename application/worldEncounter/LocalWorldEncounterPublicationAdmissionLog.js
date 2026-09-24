import { Publication } from '../../publisher/Publication.js';

const STORAGE_KEY = 'world-encounter-publication-admission-log:entries';

// 0.9.651 — Persist World-Encounter Publication Admissions.
//
// 0.9.650's own Major User Journey Product Reassessment found a second
// admission path with the identical continuity gap 0.9.607/0.9.608 already
// closed for the first one: ui/components/WorldEncounterCanvas.js's own
// admitToRepositoryDiscovery() (0.9.474/0.9.523/0.9.595) admits a resolved,
// AVAILABLE+VERIFIED World-Encounter Publication into the in-memory
// discovery/DecentralizedPublicationDiscoveryProvider.js — and nowhere
// durable. A restart loses it; a durable PlacementRecord for the same
// Publication survives, so the placement looks orphaned even though the
// Publication itself was genuinely, successfully admitted before shutdown.
//
// application/publication/LocalPublicationCatalog.js — the class that already solves
// this for the OTHER admission path (application/publication/PublicationExchange.js,
// resolved via application/publication/ReconstructPublicationDiscoveryUseCase.js) — is
// NOT the right durable sink here, and reusing it directly is actively
// unsafe: it stores signed core/DecentralizedPublication.js LOCATOR
// ENVELOPES (id, contentKind, contentReference.hash, publisherIdentity,
// signature), reconstructed on read via DecentralizedPublication.fromJSON(),
// which throws on any record lacking a non-empty contentKind. A World
// Encounter never produces such an envelope — application/
// DecentralizedWorldEncounterMaterialSource.js retrieves a Publication
// directly by uri, with no content-addressed locator and no envelope of any
// kind (see that file's own header, "no Publication.fromJSON()... a decentralized
// retriever may already hand back a fully-formed object"). A live
// experiment already proved the corruption this would cause —
// tests/DistributionResultPublicationCenterDeepLinkAudit.test.js's own
// Section B6: calling catalog.add() with a real publisher/Publication.js
// instance is accepted silently, but every subsequent catalog.list() call
// THROWS afterward, breaking every other consumer of the SAME catalog
// (BlueprintAttribution admission included) — "not merely useless, actively
// unsafe."
//
// This class is therefore a SEPARATE, purpose-built durable log for
// exactly this second admission path — the same per-domain "this class
// keeps its own small local record of what it has admitted" shape this
// codebase already uses (application/blueprint/LocalBlueprintAttributionPublicationLog.js,
// application/placeNaming/LocalPlaceNamingPublicationLog.js), never a rename or
// disguised reuse of LocalPublicationCatalog's own schema. It stores plain
// publisher/Publication.js instances — the exact type World-Encounter
// admission already produces — deduplicated by publicationId, first-seen-
// wins, mirroring LocalPublicationCatalog#add()'s own identical contract
// so the two logs read identically to any future maintainer even though
// their payload types are deliberately incompatible.
//
// NEVER RE-VERIFIES ON READ, BY DESIGN. Exactly like LocalPublicationCatalog
// itself: list() only ever calls Publication.fromJSON(), never re-runs
// signature verification. The AVAILABLE+VERIFIED gate that has always
// guarded admitToRepositoryDiscovery() (0.9.523) is the one and only trust
// boundary — this class stores what a caller already verified, and simply
// trusts its own durable, local-only storage on read, the same posture
// every other Local*.js class in this codebase already takes for its own
// StorageProvider-backed state.
//
// NO NETWORK RETRIEVAL, NO CONTENT-STORE WRITE, NO SIGNING, NO NEW
// STORAGE MECHANISM — this class only ever wraps a StorageProvider the
// same way LocalPublicationCatalog.js already does, and never becomes
// peer-syncable, discoverable-by-others, or resolvable through
// application/publication/PublicationResolver.js — it is a strictly LOCAL, strictly
// REPLICA-PRIVATE record of "which World-Encountered Publications has this
// replica itself already verified and admitted," reconstructed only back
// into this SAME replica's own in-memory discovery index at startup — see
// application/worldEncounter/ReconstructWorldEncounterPublicationDiscoveryUseCase.js.
export class LocalWorldEncounterPublicationAdmissionLog {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalWorldEncounterPublicationAdmissionLog: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Records `publication` (a publisher/Publication.js instance a CALLER
    // has already resolved AVAILABLE and verified VERIFIED — see
    // ui/components/WorldEncounterCanvas.js's own admitToRepositoryDiscovery())
    // as durably admitted by this replica. First-seen-wins, exactly like
    // application/publication/LocalPublicationCatalog.js#add(): re-admitting the same
    // publicationId never resets `admittedAt` and never overwrites the
    // stored record. Returns `{ publication, isNew }`; a duplicate is never
    // an error.
    add(publication) {
        if (!(publication instanceof Publication)) {
            throw new Error('LocalWorldEncounterPublicationAdmissionLog: a Publication instance is required');
        }
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry.publication.id === publication.id);
        if (index !== -1) {
            return { publication: Publication.fromJSON(all[index].publication), isNew: false };
        }
        all.push({ publication: publication.toJSON(), admittedAt: new Date().toISOString() });
        this._storageProvider.save(STORAGE_KEY, all);
        return { publication, isNew: true };
    }

    has(publicationId) {
        return this._loadAll().some((entry) => entry.publication.id === publicationId);
    }

    // Every Publication this replica has durably admitted through World
    // Encounter, in the order it was admitted. Never touches the network,
    // never re-verifies — see this class's own header.
    list() {
        return this._loadAll().map((entry) => Publication.fromJSON(entry.publication));
    }

    _loadAll() {
        return this._storageProvider.load(STORAGE_KEY) || [];
    }
}
