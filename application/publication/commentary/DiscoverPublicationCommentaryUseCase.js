// Imports one Publication's commentary from any distribution with a
// discover() method, through the commentary exchange's verifier. The Nostr
// and Arweave use cases do the same with their own names; newer carriers
// (Steem) use this one.
export class DiscoverPublicationCommentaryUseCase {
    constructor(distribution, commentaryExchange) {
        if (!distribution || typeof distribution.discover !== 'function') {
            throw new Error('DiscoverPublicationCommentaryUseCase: a distribution with discover() is required');
        }
        if (!commentaryExchange || typeof commentaryExchange.importCommentaryEnvelope !== 'function') {
            throw new Error('DiscoverPublicationCommentaryUseCase: a PublicationCommentaryDistributionExchange is required');
        }
        this._distribution = distribution;
        this._commentaryExchange = commentaryExchange;
    }

    // A candidate that fails verification is skipped, not fatal: anyone can
    // post to a public carrier.
    async execute({ publicationId } = {}) {
        if (!publicationId || typeof publicationId !== 'string') {
            return [];
        }
        const candidates = await this._distribution.discover();
        const admitted = [];
        for (const candidateJson of candidates) {
            if (!candidateJson || candidateJson.publicationId !== publicationId) {
                continue;
            }
            try {
                admitted.push(this._commentaryExchange.importCommentaryEnvelope(candidateJson));
            } catch {
                // Malformed or unverifiable.
            }
        }
        return admitted;
    }
}
