// 0.9.628 — Publication Commentary Nostr Asynchronous Distribution.
//
// application/publication/commentary/PublicationCommentaryNostrDistribution.js (this same
// milestone) is the raw substrate — an opaque envelope carrier with no
// Commentary vocabulary of its own. This file is the ADMISSION boundary
// on top of it: the one place a candidate envelope discovered on Nostr
// actually becomes a verified, stored PublicationCommentary — reusing
// application/publication/commentary/PublicationCommentaryDistributionExchange.js#
// importCommentaryEnvelope() (0.9.618, unmodified) exactly as application/
// PublicationCommentaryDistributionPeerExchange.js#_handleIncoming()
// already does for the WebRTC path, so verification/signature/storage
// semantics are identical across both transports.
//
//   publicationId
//        │
//        ▼
//   PublicationCommentaryNostrDistribution#discover()   (THIS milestone,
//        │                                                unmodified here
//        │                                                — one shared
//        │                                                campaign tag,
//        │                                                every candidate)
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
// AN EXPLICIT, CALLER-INVOKED BOUNDARY — NEVER WIRED INTO EVERY READ.
// application/publication/commentary/GetPublicationCommentariesUseCase.js's own header already
// commits to being "as thin as the write side's own first step" — a
// synchronous, storage-only query. This file does not touch that class,
// does not wrap it, and is never called automatically from inside it:
// querying a Nostr relay is an asynchronous network operation with a
// materially different cost and failure mode than reading local storage,
// and the requesting brief for this milestone was explicit that deciding
// WHEN this runs (app startup, entering a Publication, an explicit
// refresh, a periodic sync) is a separate, later product decision this
// milestone does not make. ui/main.js (this same milestone) provides this
// use case as its own, separately invocable command — see that file's own
// 0.9.628 section — never folded into `getPublicationCommentariesCommand`.
//
// A COMMENTARY NAMING A LOCALLY UNKNOWN PUBLICATION IS STILL ADMITTED —
// 0.9.627's own Section F finding, reused unchanged here because
// importCommentaryEnvelope() itself performs no Publication-existence
// check (see that file's own header, "stops exactly where signature
// verification stops"). This file adds no publicationId resolution step
// of its own before calling it.
//
// ONE BAD CANDIDATE NEVER ABORTS THE BATCH. A malformed envelope, a
// forged signature, or a wrong-signer envelope on the shared relay is
// caught and skipped — importCommentaryEnvelope()'s own thrown error is
// never allowed to stop this method from processing the remaining
// candidates, the identical restraint application/
// PublicationCommentaryDistributionPeerExchange.js#_handleIncoming()
// already holds for a single bad peer message.
//
// NO NOTIFICATION OF ITS OWN. This file returns `{ commentary, isNew }`
// for every admitted candidate — the EXACT shape application/
// PublicationCommentaryDistributionPeerExchange.js#onCommentaryReceived()
// already fires — so a caller can feed either transport's own result into
// the SAME application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js
// instance (see ui/main.js's own 0.9.628 section) without this file ever
// importing NotificationEvent, a notification sink, or any transport-
// specific notification vocabulary of its own.
//
// DELIBERATELY EXCLUDED — same list as application/
// PublicationCommentaryNostrDistribution.js's own header: no automatic
// lifecycle wiring, no polling, no background sync, no subscriptions, no
// pagination, no per-candidate ordering guarantee beyond whatever
// discover() itself returns, and no second admission path — every
// candidate this file admits travels through the SAME, unmodified
// PublicationCommentaryDistributionExchange every other transport uses.
export class DiscoverPublicationCommentaryFromNostrUseCase {
    constructor(nostrDistribution, commentaryExchange) {
        if (!nostrDistribution || typeof nostrDistribution.discover !== 'function') {
            throw new Error('DiscoverPublicationCommentaryFromNostrUseCase: a PublicationCommentaryNostrDistribution is required');
        }
        if (!commentaryExchange || typeof commentaryExchange.importCommentaryEnvelope !== 'function') {
            throw new Error('DiscoverPublicationCommentaryFromNostrUseCase: a PublicationCommentaryDistributionExchange is required');
        }
        this._nostrDistribution = nostrDistribution;
        this._commentaryExchange = commentaryExchange;
    }

    // execute({ publicationId }) -> Promise<Array<{ commentary, isNew }>>.
    // No publicationId, no candidates fetched at all — mirrors application/
    // GetPublicationCommentariesUseCase.js's own composed
    // getPublicationCommentariesCommand() guard exactly (see application/
    // CreatePublicationCommentaryUseCase.js's own header): never a thrown
    // error for a call made before a Publication was ready. A genuine
    // nostrDistribution.discover() transport failure propagates unmodified
    // — this method has no opinion on whether that is worth retrying.
    async execute({ publicationId } = {}) {
        if (!publicationId || typeof publicationId !== 'string') {
            return [];
        }
        const candidates = await this._nostrDistribution.discover();
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
