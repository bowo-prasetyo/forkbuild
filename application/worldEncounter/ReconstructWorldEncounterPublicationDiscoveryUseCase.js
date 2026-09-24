// 0.9.651 — Persist World-Encounter Publication Admissions.
//
// The World-Encounter counterpart to application/
// ReconstructPublicationDiscoveryUseCase.js (0.9.608) — same shape
// (a durable log's own list() re-fed into the app-wide discovery/
// DecentralizedPublicationDiscoveryProvider.js), deliberately a SEPARATE,
// much simpler class rather than a change to that one.
//
// It is simpler because there is nothing to RESOLVE. 0.9.608's own
// counterpart re-runs the full application/publication/PublicationResolver.js
// ten-step discipline for every catalog entry because a
// core/DecentralizedPublication.js catalog entry is only ever a signed
// LOCATOR — the actual content still has to be retrieved and verified
// from a ContentStore. application/worldEncounter/LocalWorldEncounterPublicationAdmissionLog.js
// stores no locator at all: every entry IS already the fully resolved,
// AVAILABLE+VERIFIED publisher/Publication.js instance
// ui/components/WorldEncounterCanvas.js's own admitToRepositoryDiscovery()
// admitted — there is no envelope to unwrap and no bytes to fetch. This
// class therefore never imports application/publication/PublicationResolver.js,
// application/publication/PublicationResolutionCoordinator.js, or any kindPlugin
// registry, and performs no network access of any kind — reconstruction
// is LOCAL DURABLE RECONSTRUCTION ONLY, exactly the same restraint 0.9.608's
// own header holds for the sibling class.
//
// Never reads or writes placement/ of any kind, for the identical reason
// 0.9.608's own counterpart does not — a Publication's placement, if any,
// is a wholly separate, independently durable fact.
//
// Idempotent by publicationId, the same restraint 0.9.609 established for
// the sibling class: skips an id the provider already knows about (via its
// own pre-existing findById()) rather than adding it again, so
// Reconstruct(Reconstruct(S)) = Reconstruct(S).
export class ReconstructWorldEncounterPublicationDiscoveryUseCase {
    constructor(admissionLog, discoveryProvider) {
        if (!admissionLog || typeof admissionLog.list !== 'function') {
            throw new Error('ReconstructWorldEncounterPublicationDiscoveryUseCase: a LocalWorldEncounterPublicationAdmissionLog is required');
        }
        if (!discoveryProvider || typeof discoveryProvider.add !== 'function' || typeof discoveryProvider.findById !== 'function') {
            throw new Error('ReconstructWorldEncounterPublicationDiscoveryUseCase: a DecentralizedPublicationDiscoveryProvider is required');
        }
        this._admissionLog = admissionLog;
        this._provider = discoveryProvider;
    }

    // Re-admits every durably logged Publication into discoveryProvider,
    // skipping any id already present. `reconstructed` counts only ids
    // newly added by THIS call — see this class's own header on idempotence.
    execute() {
        let reconstructed = 0;
        for (const publication of this._admissionLog.list()) {
            if (this._provider.findById(publication.id) === null) {
                this._provider.add(publication);
                reconstructed += 1;
            }
        }
        return { reconstructed };
    }
}
