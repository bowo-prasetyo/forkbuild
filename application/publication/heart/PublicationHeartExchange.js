import { PublicationHeart } from '../../../core/publication/PublicationHeart.js';
import { PublicationHeartDistributionEnvelope } from '../../../core/publication/PublicationHeartDistributionEnvelope.js';
import { resolveSigningIdentityId } from '../../../identity/resolveSigningIdentityId.js';

// The one place a heart is signed for distribution and the one place a
// heart from elsewhere is accepted: verified (signed by its own author, over
// every field), then kept. Mirrors PublicationCommentaryDistributionExchange.
export class PublicationHeartExchange {
    constructor(store, identityProvider, verifier) {
        if (!store || typeof store.save !== 'function') {
            throw new Error('PublicationHeartExchange: a PublicationHeartStore is required');
        }
        if (!identityProvider) {
            throw new Error('PublicationHeartExchange: identityProvider is required');
        }
        if (!verifier || typeof verifier.verifyPublicationHeartDistributionEnvelope !== 'function') {
            throw new Error('PublicationHeartExchange: an authorization verifier is required');
        }
        this._store = store;
        this._identityProvider = identityProvider;
        this._verifier = verifier;
    }

    // The signed envelope for one of this identity's own hearts.
    exportHeart(heart) {
        if (!(heart instanceof PublicationHeart)) {
            throw new Error('PublicationHeartExchange: a PublicationHeart instance is required');
        }
        const signingIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!signingIdentityId) {
            throw new Error('PublicationHeartExchange: sign in to distribute a heart');
        }
        if (signingIdentityId !== heart.authorIdentityId) {
            throw new Error('PublicationHeartExchange: only the heart\'s own author may sign it for distribution');
        }
        if (typeof this._identityProvider.signCanonical !== 'function') {
            throw new Error('PublicationHeartExchange: this identity provider cannot sign a heart');
        }
        let envelope = PublicationHeartDistributionEnvelope.fromHeart(heart);
        envelope = envelope.withSignature(this._identityProvider.signCanonical(envelope.getSigningDescriptor()));
        const result = this._verifier.verifyPublicationHeartDistributionEnvelope(envelope.toJSON());
        if (!result.valid) {
            throw new Error(`PublicationHeartExchange: refusing to export an unverifiable heart — ${result.reason}`);
        }
        return envelope.toJSON();
    }

    // `{ heart, isNew }`; throws for anything malformed or unverifiable.
    importHeartEnvelope(envelopeJson) {
        const envelope = PublicationHeartDistributionEnvelope.fromJSON(envelopeJson);
        if (!envelope) {
            throw new Error('PublicationHeartExchange: malformed heart envelope');
        }
        const result = this._verifier.verifyPublicationHeartDistributionEnvelope(envelope.toJSON());
        if (!result.valid) {
            throw new Error(`PublicationHeartExchange: refusing to accept an unverifiable heart — ${result.reason}`);
        }
        const heart = envelope.toHeart();
        const isNew = this._store.save(heart);
        return { heart, isNew };
    }
}
