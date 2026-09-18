import { resolvePublicationView } from './PublicationResolutionView.js';
import { Publication } from '../publisher/Publication.js';

// 0.9.608 — Reconstruct Publication Discovery at Application Composition.
//
// 0.9.607's own Sections D-J proved the fix precisely: durable admission
// (application/LocalPublicationCatalog.js) and the ephemeral discovery
// INDEX (discovery/DecentralizedPublicationDiscoveryProvider.js) are two
// separable facts, and rebuilding the index needs no new class and no new
// store — only re-running, for every catalog entry, the exact
// resolvePublicationView() call ui/views/DecentralizedPublicationsView.js's
// own resolveEntry() already makes one entry at a time. This class is
// that routine, promoted from that audit's own test-local
// reconstructDiscoveryProvider() helper into a real, reusable
// application-layer use case — taking every collaborator by constructor
// injection (the same shape application/PlacePublicationUseCase.js
// already uses) rather than constructing a second catalog, resolver, or
// coordinator of its own. ui/main.js's ONE existing instance of each (see
// that file's own 0.7.5/0.9.337 headers) is reused unchanged, never
// duplicated — this class introduces no second Publication persistence
// layer of any kind.
//
// Deliberately never passes `peer`/`peers` to resolvePublicationView() —
// see application/PublicationResolutionCoordinator.js's own header: with
// both omitted, no retrieval candidate list is ever built, so no network
// call runs even when `coordinator` was itself constructed with a live
// peerContentExchange (ui/main.js's `publicationResolutionCoordinator`
// always is). Reconstruction is LOCAL DURABLE RECONSTRUCTION only, never
// NETWORK REDISCOVERY — this class is structurally incapable of the
// latter, exactly 0.9.607's own Section K finding.
//
// Runs the FULL, unmodified application/PublicationResolver.js ten-step
// discipline for every catalog entry, so a missing, corrupted, malformed,
// or tampered entry is refused exactly as it would be if resolved one
// entry at a time — never silently trusted because it happened to be
// persisted. One such refusal never suppresses any other, independently
// valid entry — see execute() below.
//
// Never reads or writes placement/ of any kind — see 0.9.607's own
// Sections G/I: a reconstructed Publication's placement, if any, is a
// wholly separate, independently durable fact, joined only by
// publicationId equality performed by whichever caller needs both. This
// class only ever populates discoveryProvider — it never mutates the
// catalog it reads from, and never constructs, modifies, or infers a
// placement.
//
// 0.9.609 — idempotent by publicationId, deliberately NOT by changing
// discovery/DecentralizedPublicationDiscoveryProvider.js's own add().
// That provider's 0.9.335 header commits it to "no invented
// deduplication policy" for ITS callers in general (a provider may
// legitimately be fed the same Publication from more than one discovery
// source). This class's own contract is narrower and does own an
// idempotence guarantee: ui/main.js calls execute() exactly once against
// a freshly-constructed, still-empty provider today, but nothing about
// that composition-root fact is enforced by this class itself, and the
// lifecycle-closure audit (tests/PublicationDiscoveryReconstructionLifecycleClosureAudit.test.js,
// Section B) requires execute() to be safely callable more than once
// against the SAME provider without doubling its discoverable set —
// Reconstruct(Reconstruct(S)) = Reconstruct(S). Skipping an id the
// provider already knows about (via its own pre-existing findById())
// keeps that guarantee local to this use case, changes zero behavior for
// the single-call production wiring (the provider is always empty at
// that point), and adds no new store, cache, or class.
export class ReconstructPublicationDiscoveryUseCase {
    constructor(catalog, coordinator, kindPlugins, discoveryProvider) {
        if (!catalog || typeof catalog.list !== 'function') {
            throw new Error('ReconstructPublicationDiscoveryUseCase: a LocalPublicationCatalog is required');
        }
        if (!coordinator || typeof coordinator.resolve !== 'function') {
            throw new Error('ReconstructPublicationDiscoveryUseCase: a PublicationResolutionCoordinator is required');
        }
        if (!discoveryProvider || typeof discoveryProvider.add !== 'function') {
            throw new Error('ReconstructPublicationDiscoveryUseCase: a DecentralizedPublicationDiscoveryProvider is required');
        }
        this._catalog = catalog;
        this._coordinator = coordinator;
        this._kindPlugins = kindPlugins || {};
        this._provider = discoveryProvider;
    }

    // Resolves every cataloged entry and admits into discoveryProvider
    // exactly those that resolve and are not already present by id. Each
    // entry is resolved and admitted independently: one entry that fails
    // resolution (missing material, a content-hash mismatch, an
    // incomplete record, a tampered signature) never prevents any other,
    // independently valid entry from reconstructing. `reconstructed`
    // counts only ids newly added by THIS call — see this class's own
    // 0.9.609 header for why a repeated call against the same provider
    // reports 0 rather than re-adding what is already discoverable.
    async execute() {
        let reconstructed = 0;
        for (const entry of this._catalog.list()) {
            const view = await resolvePublicationView(entry, { coordinator: this._coordinator, kindPlugins: this._kindPlugins });
            if (view.resolved && view.content instanceof Publication && this._provider.findById(view.content.id) === null) {
                this._provider.add(view.content);
                reconstructed += 1;
            }
        }
        return { reconstructed };
    }
}
