import { PublicationHeart } from './PublicationHeart.js';
import { Signature, SignatureType } from './Signature.js';

// A heart as it travels: the record's own fields, its kind and schema
// version, and the signature of the identity that gave it (the signer must
// be its `authorIdentityId`; identity/LocalAuthorizationVerifier.js). It
// rides the same carriers as comments (peers, Nostr, Arweave, Steem, Blurt;
// docs/Protocol.md, "Publication Hearts"), told apart by `kind`: a copy of
// ForkBuild from before hearts reads one as a malformed comment and skips
// it, so it never shows an empty comment.
export const PUBLICATION_HEART_DISTRIBUTION_KIND = 'forkbuild.publication-heart-distribution';
export const CURRENT_HEART_SCHEMA_VERSION = 1;

export function isPublicationHeartEnvelope(json) {
    return !!json && typeof json === 'object' && json.kind === PUBLICATION_HEART_DISTRIBUTION_KIND;
}

export class PublicationHeartDistributionEnvelope {
    constructor({ heart, signature = null } = {}) {
        const resolved = heart instanceof PublicationHeart ? heart : PublicationHeart.fromJSON(heart);
        if (!resolved) {
            throw new Error('PublicationHeartDistributionEnvelope requires a valid PublicationHeart payload');
        }
        this._heart = resolved;
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get heart() { return this._heart; }
    get signature() { return this._signature; }

    withSignature(signature) {
        return new PublicationHeartDistributionEnvelope({ heart: this._heart, signature });
    }

    getSigningDescriptor() {
        return getPublicationHeartDistributionSigningDescriptor(this.toJSON());
    }

    toJSON() {
        return {
            kind: PUBLICATION_HEART_DISTRIBUTION_KIND,
            schemaVersion: CURRENT_HEART_SCHEMA_VERSION,
            ...this._heart.toJSON(),
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    toHeart() {
        return this._heart;
    }

    static fromHeart(heart) {
        return new PublicationHeartDistributionEnvelope({ heart });
    }

    // Never throws; anything not a heart envelope is null.
    static fromJSON(json) {
        if (!isPublicationHeartEnvelope(json)) {
            return null;
        }
        try {
            return new PublicationHeartDistributionEnvelope({ heart: json, signature: json.signature || null });
        } catch {
            return null;
        }
    }
}

// Every field of the record is signed, the name and the heart-or-not
// included, so neither can be changed on the way.
export function getPublicationHeartDistributionSigningDescriptor(record) {
    return {
        type: SignatureType.PUBLICATION_HEART_DISTRIBUTION,
        id: record.heartId,
        revision: record.createdAt,
        payload: {
            heartId: record.heartId,
            publicationId: record.publicationId,
            authorIdentityId: record.authorIdentityId,
            authorName: record.authorName ?? null,
            hearted: record.hearted,
            createdAt: record.createdAt
        }
    };
}
