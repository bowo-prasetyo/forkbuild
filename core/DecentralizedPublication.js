import { createId } from './createId.js';
import { ContentReference } from './ContentReference.js';
import { Signature, SignatureType } from './Signature.js';

// 0.7.0 — Decentralized Publication Protocol & Content Addressing.
//
// Every publishable kind this codebase has built since 0.5.2 already
// self-describes on the wire (`kind`/`schemaVersion` — see
// core/BlueprintAttribution.js's own header) and every one of them
// already travels as a signed assertion (core/Signature.js's own "no
// unsigned claims" rule). What none of them has ever had is a single,
// PROTOCOL-NEUTRAL way to say "here is where a copy of this signed
// object's bytes can be found" that does not care whether "found" means
// a peer's own local store, an IPFS gateway, an Arweave transaction, or
// a plain HTTPS mirror.
//
// A DecentralizedPublication is exactly that: a thin, signed envelope
// around a core/ContentReference.js — never the content itself.
//
//   signed claim / package / document snapshot
//              │
//              ▼ (canonical JSON bytes)
//        content/ContentStore.js#put()
//              │
//              ▼
//        core/ContentReference.js          "what exactly is this, and
//              │                             where might it be found?"
//              ▼
//   DecentralizedPublication (THIS FILE)   "which identity chose to
//                                            publish that reference,
//                                            under this publicationId,
//                                            claiming it holds a
//                                            `contentKind`?"
//
// Two independent claims stay independent, on purpose:
//
//   contentReference.hash   — cryptographic identity of the BYTES
//   signature.signer        — identity of the PUBLISHER of this envelope
//
// Verifying a DecentralizedPublication's signature proves who chose to
// publish this particular content reference. It proves nothing about
// whether the referenced bytes are trustworthy, well-formed, or even
// retrievable — that is exactly what application/PublicationResolver.js
// checks next, in the same "never: retrieve -> trust" order every
// exchange class in this codebase already follows (see e.g. application/
// BlueprintAttributionExchange.js's own four-step discipline). This
// class only ever answers "who published this locator, and for what
// declared kind of content" — never "is the content true," a question
// this codebase has refused to let any publication layer answer since
// core/PlaceNamingClaim.js first drew that line in 0.5.2.
//
// `contentKind`/`contentSchemaVersion` describe the WRAPPED payload
// (e.g. BLUEPRINT_ATTRIBUTION_KIND); this envelope's own `kind`/
// `schemaVersion` describe THIS wrapper — deliberately two separate
// pairs of fields, never one, so a receiver can always tell "is this
// even a decentralized publication envelope?" before it ever has to
// know or care what's inside.
//
// A fingerprint (core/BlueprintFingerprint.js) names WHAT a design is.
// A locator (core/ContentReference.js's own `uri`) names WHERE bytes
// might be found. Neither is ever written into the other: the same
// fingerprint can be wrapped in many independent DecentralizedPublication
// envelopes, published by different identities, pointing at different
// storage backends, all equally valid — see docs/Principles.md,
// "Publication Makes Content Discoverable; It Does Not Make It
// Authoritative (0.7.0)."
export const DECENTRALIZED_PUBLICATION_KIND = 'forkbuild.decentralized-publication';
export const CURRENT_SCHEMA_VERSION = 1;

export class DecentralizedPublication {
    constructor({
        id = createId(),
        contentKind,
        contentSchemaVersion = 1,
        contentReference,
        publisherIdentity = null,
        publishedAt = new Date(),
        signature = null
    } = {}) {
        if (!contentKind || typeof contentKind !== 'string' || !contentKind.trim()) {
            throw new Error('DecentralizedPublication requires a contentKind');
        }
        const reference = contentReference instanceof ContentReference
            ? contentReference
            : ContentReference.fromJSON(contentReference);
        if (!reference || !reference.hash) {
            throw new Error('DecentralizedPublication requires a contentReference with a hash');
        }
        const publishedAtDate = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
        if (Number.isNaN(publishedAtDate.getTime())) {
            throw new Error('DecentralizedPublication: publishedAt must be a valid date');
        }
        this._id = id;
        this._contentKind = contentKind;
        this._contentSchemaVersion = contentSchemaVersion;
        this._contentReference = reference;
        this._publisherIdentity = publisherIdentity ? { ...publisherIdentity } : null;
        this._publishedAt = publishedAtDate;
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get id() { return this._id; }
    get contentKind() { return this._contentKind; }
    get contentSchemaVersion() { return this._contentSchemaVersion; }
    get contentReference() { return this._contentReference; }
    get publisherIdentity() { return this._publisherIdentity ? { ...this._publisherIdentity } : null; }
    get publishedAt() { return this._publishedAt; }
    get signature() { return this._signature; }

    // Never mutates this instance — the same "signing produces a new
    // object" discipline every signed envelope in this codebase already
    // follows (see publisher/Publication.js#withSignature()).
    withSignature(signature) {
        return new DecentralizedPublication({
            id: this._id,
            contentKind: this._contentKind,
            contentSchemaVersion: this._contentSchemaVersion,
            contentReference: this._contentReference,
            publisherIdentity: this._publisherIdentity,
            publishedAt: this._publishedAt,
            signature
        });
    }

    // A DecentralizedPublication is its own first and only revision —
    // republishing (a new locator, a corrected mirror, a different
    // backend) creates a NEW envelope with a new id and a new signature,
    // exactly the posture publisher/Publication.js#getSigningDescriptor()
    // already established for the identical reason.
    getSigningDescriptor() {
        return getDecentralizedPublicationSigningDescriptor(this.toJSON());
    }

    toJSON() {
        return {
            kind: DECENTRALIZED_PUBLICATION_KIND,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            id: this._id,
            contentKind: this._contentKind,
            contentSchemaVersion: this._contentSchemaVersion,
            contentReference: this._contentReference.toJSON(),
            publisherIdentity: this._publisherIdentity ? { ...this._publisherIdentity } : null,
            publishedAt: this._publishedAt.toISOString(),
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new DecentralizedPublication({
            id: json.id,
            contentKind: json.contentKind,
            contentSchemaVersion: json.contentSchemaVersion,
            contentReference: json.contentReference,
            publisherIdentity: json.publisherIdentity || null,
            publishedAt: json.publishedAt ? new Date(json.publishedAt) : new Date(),
            signature: json.signature || null
        });
    }
}

// Standalone form of #getSigningDescriptor(), operating on a plain JSON
// `record` rather than a hydrated instance — the same split every other
// signed envelope in this codebase keeps between its class and its own
// get*SigningDescriptor() free function (see core/BlueprintAttribution.js's
// own getBlueprintAttributionSigningDescriptor()), so identity/
// LocalAuthorizationVerifier.js can reconstruct the identical descriptor
// from a plain record it received off the wire, never from a re-hydrated
// instance it would first have to trust.
export function getDecentralizedPublicationSigningDescriptor(record) {
    return {
        type: SignatureType.DECENTRALIZED_PUBLICATION,
        id: record.id,
        revision: 1,
        payload: {
            id: record.id,
            contentKind: record.contentKind,
            contentSchemaVersion: record.contentSchemaVersion,
            contentReference: record.contentReference,
            publisherIdentity: record.publisherIdentity,
            publishedAt: record.publishedAt instanceof Date ? record.publishedAt.toISOString() : record.publishedAt
        }
    };
}
