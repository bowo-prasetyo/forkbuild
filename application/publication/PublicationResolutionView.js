import { PublicationResolutionOutcome } from './PublicationResolutionOutcome.js';
import { message } from '../../core/Message.js';

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
// application/publication/CreatePublicationResolutionCoordinatorUseCase.js /
// application/publication/CreatePublicationDisplayKindRegistryUseCase.js outputs,
// and get back one flat, UI-ready shape —
//
//   { publication, contentKind, publisherIdentityId, outcome, resolved,
//     reason, content, contentSummary, retrieval }
//
// — never a ranking, never a verdict about whether the publication is
// "trustworthy" beyond what application/publication/PublicationResolver.js's own
// ten-step discipline already checked. `resolved` is nothing more than
// `outcome === PublicationResolutionOutcome.RESOLVED`, spelled out so a
// template never has to import PublicationResolutionOutcome itself just
// to ask one boolean question.
//
// 0.7.6 — Multi-Peer Publication Retrieval & Replication. `peer` (a
// single candidate) still works unchanged; `peers` (an ORDERED array of
// candidates) is new, passed straight through to application/
// PublicationResolutionCoordinator.js#resolve(), unmodified. `retrieval`
// is that same call's own optional `retrieval` field, passed straight
// through — the OPERATIONAL "did this attempt obtain bytes" fact,
// deliberately kept separate from `outcome`, the RESOLUTION fact of
// "what is the state of this publication." See application/
// PeerContentRetrievalCoordinator.js's own header on why merging the two
// would be exactly the contamination this file has refused since 0.7.5.
//
// A contentKind this replica's own kindPlugins registry has never heard
// of (see application/publication/CreatePublicationDisplayKindRegistryUseCase.js's
// own header on why that registry is deliberately small and explicit,
// never a wildcard) is handled here directly, before ever calling the
// coordinator: `outcome` is null, `resolved` is false, and `reason`
// explains why in a way a person can read, rather than this function
// guessing at a kindPlugin that does not exist.
export async function resolvePublicationView(publication, { coordinator, kindPlugins = {}, peer = null, peers = null, timeoutMs } = {}) {
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
            reason: message('publicationOutcome.unsupportedKindReason', { contentKind }),
            content: null, contentSummary: null, retrieval: null
        };
    }

    const result = await coordinator.resolve(publication.toJSON(), kindPlugin, { peer, peers, timeoutMs });
    const resolved = result.outcome === PublicationResolutionOutcome.RESOLVED;
    return {
        publication: result.publication || publication,
        contentKind,
        publisherIdentityId,
        outcome: result.outcome,
        resolved,
        reason: result.reason,
        content: result.content,
        contentSummary: resolved && typeof kindPlugin.describe === 'function' ? kindPlugin.describe(result.content) : null,
        retrieval: result.retrieval || null
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
        case PublicationResolutionOutcome.RESOLVED: return message('publicationOutcome.available');
        case PublicationResolutionOutcome.CONTENT_UNAVAILABLE: return message('publicationOutcome.contentUnavailable');
        case PublicationResolutionOutcome.INVALID_ENVELOPE: return message('publicationOutcome.invalidEnvelope');
        case PublicationResolutionOutcome.INVALID_PUBLICATION_SIGNATURE: return message('publicationOutcome.invalidPublicationSignature');
        case PublicationResolutionOutcome.CONTENT_HASH_MISMATCH: return message('publicationOutcome.contentHashMismatch');
        case PublicationResolutionOutcome.INVALID_CONTENT: return message('publicationOutcome.invalidContent');
        case PublicationResolutionOutcome.INVALID_CONTENT_SIGNATURE: return message('publicationOutcome.invalidContentSignature');
        case PublicationResolutionOutcome.DOMAIN_CROSS_CHECK_FAILED: return message('publicationOutcome.domainCrossCheckFailed');
        default: return message('publicationOutcome.unsupportedKind');
    }
}

// 0.7.6 — Multi-Peer Publication Retrieval & Replication.
//
// A short, human-readable EXPLANATION of a resolved view's `retrieval`
// field — presentation only, exactly like describePublicationOutcome()
// above, and read by the identical restraint: never a claim about who
// is "trustworthy," only a plain description of what this replica
// actually did. `view.retrieval` is null on a view resolved purely
// locally (no peer was ever asked) — this function returns null too,
// rather than inventing a sentence for an attempt that never happened.
//
// The deliberately narrow security lesson this sentence is written to
// teach, without ever naming an implementation detail: bytes a peer
// hands over are accepted ONLY after this replica independently
// recomputed their hash and confirmed it against the publication's own
// content reference (application/peer/PeerContentExchange.js's own central
// security rule, unchanged since 0.7.4) — never because of who the peer
// happened to be. See docs/Principles.md, "Replication Creates
// Availability; It Does Not Create Authority (0.7.6)."
export function describeRetrieval(view) {
    const retrieval = view && view.retrieval;
    if (!retrieval) {
        return null;
    }
    if (retrieval.retrieved) {
        const count = retrieval.attemptedPeers ? retrieval.attemptedPeers.length : 1;
        return count > 1
            ? message('publicationRetrieval.retrievedAfterEarlier', { count: count - 1 })
            : message('publicationRetrieval.retrieved');
    }
    const attempted = retrieval.attemptedPeers ? retrieval.attemptedPeers.length : 0;
    if (attempted === 0) {
        return message('publicationRetrieval.noPeerAsked');
    }
    return message('publicationRetrieval.noVerifiedAnswer', { count: attempted });
}
