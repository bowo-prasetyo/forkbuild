// 0.9.331 — Publication Content Kind for Decentralized Discovery.
//
// Strict, side-effect-free STRUCTURAL validation of a Publication as it
// travels wrapped inside a core/DecentralizedPublication.js envelope —
// the exact same split every other publication validator in this
// codebase already draws (see application/
// BlueprintAttributionPublicationValidator.js's own header): this module
// answers ONE question, "is this well-formed?", and never constructs a
// publisher/Publication.js instance, never touches a verifier, and never
// persists anything.
//
// Unlike application/PlaceNamingClaimPublication.js, THERE IS NO SEPARATE
// wrapper struct here, for the identical reason application/
// BlueprintAttributionPublicationValidator.js's own header gives: a
// wrapper only earns its place when the wrapped domain object does not
// already self-describe on the wire. A Publication does not carry its
// own `kind`/`schemaVersion` self-descriptor the way a
// core/BlueprintAttribution.js does — but it does not need one here,
// because the ENCLOSING core/DecentralizedPublication.js envelope's own
// `contentKind`/`contentSchemaVersion` fields already answer "what kind
// of content is this?" before application/PublicationResolver.js ever
// calls into this module (see that class's own header, step 1-2). So the
// wire shape this module validates is simply `publication.toJSON()`,
// completely unwrapped — reusing publisher/Publication.js's own existing
// serialization exactly as it already exists, rather than inventing a
// second one.
//
// `PUBLICATION_CONTENT_KIND` is this module's own contribution: the
// string a `contentKind` field must equal for application/
// PublicationContentKind.js's plugin to accept an envelope at all. It is
// a plain discriminator (not a security boundary) — exactly the posture
// every other *_KIND constant in this codebase already takes.
export const PUBLICATION_CONTENT_KIND = 'forkbuild.publication';

export class PublicationContentError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PublicationContentError';
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function validateSignature(signature, prefix) {
    if (!signature || typeof signature !== 'object') {
        throw new PublicationContentError(`${prefix}.signature is missing or not an object`);
    }
    for (const field of ['algorithm', 'signer', 'signature', 'signedHash', 'domain']) {
        if (!isNonEmptyString(signature[field])) {
            throw new PublicationContentError(`${prefix}.signature.${field} is missing or not a string`);
        }
    }
}

function validatePublisherIdentity(identity, prefix) {
    if (!identity || typeof identity !== 'object') {
        throw new PublicationContentError(`${prefix}.publisherIdentity is missing or not an object`);
    }
    for (const field of ['id', 'algorithm', 'publicKey']) {
        if (!isNonEmptyString(identity[field])) {
            throw new PublicationContentError(`${prefix}.publisherIdentity.${field} is missing or not a string`);
        }
    }
}

// Throws PublicationContentError describing exactly what's wrong;
// returns nothing on success. Never mutates or normalizes `pkg`, never
// constructs a publisher/Publication.js instance — a caller that wants a
// hydrated Publication does so afterward (application/
// PublicationResolver.js's own "validate, THEN construct, THEN verify"
// order), the same discipline every other publication validator in this
// codebase already requires.
//
// `id` and `documentId` are the two identities this milestone exists to
// preserve — see docs/Roadmap.md, 0.9.331 — so both are REQUIRED, unlike
// `author`/`title`, which publisher/Publication.js's own constructor
// already tolerates as absent (e.g. an anonymous publisher).
//
// `signature`/`publisherIdentity` stay OPTIONAL, unlike every publication
// kind built since 0.2.16 (see core/Signature.js's own "no unsigned
// claims" rule for BLUEPRINT_ATTRIBUTION/PLACE_NAMING_CLAIM/
// DECENTRALIZED_PUBLICATION and every SignatureType after it). A
// publisher/Publication.js has never followed that rule —
// SignatureType.PUBLICATION is the one entry in that enum with no
// "REQUIRED" header, and publisher/Publication.js's own class header
// says as much directly: "Both fields are optional for pre-0.2.16
// compatibility." identity/LocalAuthorizationVerifier.js#
// verifyPublication() already encodes the identical tolerance
// (`{ valid: true, signed: false, reason: 'unsigned publication
// (legacy)' }`) — requiring a signature HERE would make this content
// kind reject the one construction path this codebase actually ships
// (publisher/LocalPublisherProvider.js signs only when its
// identityProvider exposes the cryptographic surface), defeating the
// seam this milestone exists to activate. When a signature IS present,
// though, it must be well-formed, and a publisherIdentity must
// accompany it — the same pairing verifyPublication() itself already
// requires ("signature without publisher identity" is invalid, never
// merely unsigned).
export function validatePublicationContent(pkg) {
    if (!pkg || typeof pkg !== 'object') {
        throw new PublicationContentError('PublicationContent: package is missing or not an object');
    }
    for (const field of ['id', 'documentId', 'publishedAt']) {
        if (!isNonEmptyString(pkg[field])) {
            throw new PublicationContentError(`PublicationContent: ${field} is missing or not a string`);
        }
    }
    if (pkg.signature !== null && pkg.signature !== undefined) {
        validateSignature(pkg.signature, 'PublicationContent');
        validatePublisherIdentity(pkg.publisherIdentity, 'PublicationContent');
    }
}
