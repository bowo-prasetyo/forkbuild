// 0.9.631 — Publication Commentary Arweave Asynchronous Distribution.
//
// `application/publication/commentary/PublicationCommentaryArweaveDistribution.js` (this same
// milestone) is the raw substrate — an opaque envelope carrier with no
// Commentary vocabulary of its own. This file is the ADMISSION boundary on
// top of it — the Arweave counterpart to `application/
// DiscoverPublicationCommentaryFromNostrUseCase.js` (0.9.628), structurally
// identical, reusing `application/publication/commentary/PublicationCommentaryDistributionExchange.js#
// importCommentaryEnvelope()` (0.9.618, unmodified) exactly as that file
// already does, so verification/signature/storage semantics are IDENTICAL
// across WebRTC, Nostr, and Arweave — one Commentary verification authority,
// never a substrate-specific second one.
//
//   publicationId
//        │
//        ▼
//   PublicationCommentaryArweaveDistribution#discover()   (THIS milestone,
//        │                                                  unmodified here
//        │                                                  — one shared
//        │                                                  campaign tag,
//        │                                                  every candidate)
//        ▼
//   envelopeJson[]   (filtered here, by publicationId — see this file's
//        │            own header, "a discovery tag is a query mechanism,
//        │            not Commentary identity")
//        ▼
//   PublicationCommentaryDistributionExchange#importCommentaryEnvelope()
//        │   (0.9.618, unmodified — verify signature, then
//        │    storage/PublicationCommentaryStore.js#save(), reusing its
//        │    own existing commentaryId idempotent/conflict semantics)
//        ▼
//   { commentary, isNew }[]
//
// AN EXPLICIT, CALLER-INVOKED BOUNDARY — NEVER WIRED INTO EVERY READ. The
// identical restraint `application/
// DiscoverPublicationCommentaryFromNostrUseCase.js`'s own header already
// holds, extended here one substrate over: querying an Arweave gateway/
// GraphQL endpoint is an asynchronous network operation with a materially
// different cost and failure mode than reading local storage, and deciding
// WHEN this runs remains a separate, later product decision this milestone
// does not make. `ui/main.js` (this same milestone) provides this use case
// as its own, separately invocable command, mirroring that file's own
// 0.9.628 section for Nostr.
//
// A COMMENTARY NAMING A LOCALLY UNKNOWN PUBLICATION IS STILL ADMITTED — the
// identical 0.9.627/0.9.628 finding, reused unchanged here because
// `importCommentaryEnvelope()` itself performs no Publication-existence
// check regardless of which transport discovered the candidate.
//
// ONE BAD CANDIDATE NEVER ABORTS THE BATCH. A malformed envelope, a forged
// signature, or a wrong-signer envelope discovered on Arweave is caught and
// skipped — `importCommentaryEnvelope()`'s own thrown error never stops this
// method from processing the remaining candidates, the identical restraint
// `application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js` and
// `application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js#_handleIncoming()`
// already hold for their own transports.
//
// NO NOTIFICATION OF ITS OWN. This file returns `{ commentary, isNew }` for
// every admitted candidate — the EXACT shape every other Commentary
// admission path in this codebase already produces — so a caller can feed
// this transport's own result into the SAME `application/
// PublicationCommentaryRemoteNotificationBridge.js` instance WebRTC and
// Nostr already use (see `ui/main.js`'s own 0.9.628/0.9.631 sections)
// without this file ever importing a notification vocabulary of its own.
//
// A GENUINE TRANSPORT FAILURE PROPAGATES UNMODIFIED — never retried, never
// swallowed into an empty result. `nostrDistribution`/`arweaveDistribution`
// (here) own that distinction one layer down; see `application/
// PublicationCommentaryArweaveDistribution.js`'s own header, "ONE BAD
// CANDIDATE NEVER ABORTS discover()'S OWN BATCH" for exactly which Arweave
// failures reject `discover()` itself versus which are silently skipped
// per-candidate before ever reaching this file.
//
// DELIBERATELY EXCLUDED — same list as `application/
// DiscoverPublicationCommentaryFromNostrUseCase.js`'s own header: no
// automatic lifecycle wiring, no polling, no background sync, no
// subscriptions, no pagination, no per-candidate ordering guarantee beyond
// whatever `discover()` itself returns, and no second admission path —
// every candidate this file admits travels through the SAME, unmodified
// `PublicationCommentaryDistributionExchange` every other transport uses.
export class DiscoverPublicationCommentaryFromArweaveUseCase {
    constructor(arweaveDistribution, commentaryExchange) {
        if (!arweaveDistribution || typeof arweaveDistribution.discover !== 'function') {
            throw new Error('DiscoverPublicationCommentaryFromArweaveUseCase: a PublicationCommentaryArweaveDistribution is required');
        }
        if (!commentaryExchange || typeof commentaryExchange.importCommentaryEnvelope !== 'function') {
            throw new Error('DiscoverPublicationCommentaryFromArweaveUseCase: a PublicationCommentaryDistributionExchange is required');
        }
        this._arweaveDistribution = arweaveDistribution;
        this._commentaryExchange = commentaryExchange;
    }

    // execute({ publicationId }) -> Promise<Array<{ commentary, isNew }>>.
    // No publicationId, no candidates fetched at all — mirrors `application/
    // DiscoverPublicationCommentaryFromNostrUseCase.js`'s own guard exactly.
    // A genuine `arweaveDistribution.discover()` transport failure propagates
    // unmodified — this method has no opinion on whether that is worth
    // retrying.
    async execute({ publicationId } = {}) {
        if (!publicationId || typeof publicationId !== 'string') {
            return [];
        }
        const candidates = await this._arweaveDistribution.discover();
        const admitted = [];
        for (const candidateJson of candidates) {
            if (!candidateJson || candidateJson.publicationId !== publicationId) {
                continue;
            }
            let result;
            try {
                result = this._commentaryExchange.importCommentaryEnvelope(candidateJson);
            } catch {
                continue;
            }
            admitted.push(result);
        }
        return admitted;
    }
}
