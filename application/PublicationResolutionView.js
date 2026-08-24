import { PublicationResolutionOutcome } from './PublicationResolutionOutcome.js';

// 0.7.5 — Decentralized Publication UX & Resolution.
//
// core/BlueprintAttributionView.js and core/PlaceNamingView.js each
// derive a plain, ephemeral, presentation-only shape from whatever this
// replica happens to know right now — never persisted, never itself a
// signed fact. This file is the same idea applied one layer up, over a
// single cataloged application/DecentralizedPublication.js entry instead
// of a set of domain claims. It lives in application/, not core/, for
// one concrete reason those two files don't share: deriving THIS view
// requires actually calling application/
// PublicationResolutionCoordinator.js#resolve() — genuinely asynchronous
// I/O (a ContentStore read, maybe a live peer round trip) — where
// core/BlueprintAttributionView.js's own attributionView() only ever
// reads an array already sitting in memory. Everything core/ in this
// codebase stays synchronous and side-effect-free; this file is the
// application-layer counterpart for a view that cannot be.
//
// `resolvePublicationView()` is the single entry point a UI needs:
// hand it one DecentralizedPublication and this milestone's own
// application/CreatePublicationResolutionCoordinatorUseCase.js /
// application/CreatePublicationDisplayKindRegistryUseCase.js outputs,
// and get back one flat, UI-ready shape —
//
//   { publication, contentKind, publisherIdentityId, outcome, resolved,
//     reason, content, contentSummary }
//
// — never a ranking, never a verdict about whether the publication is
// "trustworthy" beyond what application/PublicationResolver.js's own
// ten-step discipline already checked. `resolved` is nothing more than
// `outcome === PublicationResolutionOutcome.RESOLVED`, spelled out so a
// template never has to import PublicationResolutionOutcome itself just
// to ask one boolean question.
//
// A contentKind this replica's own kindPlugins registry has never heard
// of (see application/CreatePublicationDisplayKindRegistryUseCase.js's
// own header on why that registry is deliberately small and explicit,
// never a wildcard) is handled here directly, before ever calling the
// coordinator: `outcome` is null, `resolved` is false, and `reason`
// explains why in a way a person can read, rather than this function
// guessing at a kindPlugin that does not exist.
export async function resolvePublicationView(publication, { coordinator, kindPlugins = {}, peer = null, timeoutMs } = {}) {
    if (!publication) {
        throw new Error('resolvePublicationView: a DecentralizedPublication is required');
    }
    if (!coordinator) {
        throw new Error('resolvePublicationView: a PublicationResolutionCoordinator is required');
    }

    const contentKind = publication.contentKind;
    const publisherIdentityId = publication.publisherIdentity ? publication.publisherIdentity.id : null;
    const kindPlugin = kindPlugins[contentKind];

    if (!kindPlugin) {
        return {
            publication, contentKind, publisherIdentityId,
            outcome: null, resolved: false,
            reason: `this replica does not yet know how to display a "${contentKind}" publication`,
            content: null, contentSummary: null
        };
    }

    const result = await coordinator.resolve(publication.toJSON(), kindPlugin, { peer, timeoutMs });
    const resolved = result.outcome === PublicationResolutionOutcome.RESOLVED;
    return {
        publication: result.publication || publication,
        contentKind,
        publisherIdentityId,
        outcome: result.outcome,
        resolved,
        reason: result.reason,
        content: result.content,
        contentSummary: resolved && typeof kindPlugin.describe === 'function' ? kindPlugin.describe(result.content) : null
    };
}

// A short, human-readable label for `outcome` — presentation only,
// mirroring core/BlueprintAttributionView.js#describeAttributionView()'s
// own restraint (a plain string, never a translation table the caller
// has to maintain in parallel). `null` (the "unknown kind" case above)
// reads as its own distinct label, never silently folded into
// CONTENT_UNAVAILABLE or any other outcome it did not actually reach.
export function describePublicationOutcome(outcome) {
    switch (outcome) {
        case PublicationResolutionOutcome.RESOLVED: return 'Available';
        case PublicationResolutionOutcome.CONTENT_UNAVAILABLE: return 'Content unavailable';
        case PublicationResolutionOutcome.INVALID_ENVELOPE: return 'Invalid publication envelope';
        case PublicationResolutionOutcome.INVALID_PUBLICATION_SIGNATURE: return 'Invalid publication signature';
        case PublicationResolutionOutcome.CONTENT_HASH_MISMATCH: return 'Content does not match its own reference';
        case PublicationResolutionOutcome.INVALID_CONTENT: return 'Invalid content';
        case PublicationResolutionOutcome.INVALID_CONTENT_SIGNATURE: return 'Invalid content signature';
        case PublicationResolutionOutcome.DOMAIN_CROSS_CHECK_FAILED: return 'Failed a domain-specific check';
        default: return 'Unsupported publication kind';
    }
}
