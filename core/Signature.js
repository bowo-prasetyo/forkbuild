// Explicit signature data (0.2.16).
//
// The trust model of the decentralized planes:
//
//   content hash  ->  "What exactly is this object?"
//   revision      ->  "Which version of it?"
//   signature     ->  "Who authorized it?"
//   identity      ->  "Which public key is that authority?"
//
// A hash can prove a PlacementRecord has not changed. It cannot prove
// Alice created it. That is what this entity carries.
//
// ForkBuild NEVER signs arbitrary serialized JSON. Every signature
// covers a canonical signing envelope:
//
//   { domain: 'forkbuild', type, id, revision, payload }
//
// constructed in exactly this property order (canonical serialization
// discipline) — so the same semantic object can never produce two
// different signatures, and so a signature for
// 'forkbuild/placement-record' can never be replayed as one for
// 'forkbuild/publication' (domain separation).
//
// A Signature contains no unsigned claims: signer, algorithm, the raw
// signature bytes, the hash of the signed canonical bytes, and the
// domain. Verification reconstructs the envelope from the object and
// checks everything (see identity/LocalAuthorizationVerifier).
export const SIGNING_DOMAIN = 'forkbuild';

export const SignatureType = Object.freeze({
    PUBLICATION: 'publication',
    PLACEMENT_RECORD: 'placement-record',
    SPATIAL_INDEX_ROOT: 'spatial-index-root',
    // 0.2.38 — an OPTIONAL signature over an AvatarPresenceAdvertisement
    // (core/AvatarPresenceAdvertisement.js's wire shape), never over
    // AvatarPresence itself (core/AvatarPresence.js stays permanently
    // unsigned — see its own header). See
    // core/AvatarPresenceAdvertisement.js's getAvatarPresenceSigningDescriptor().
    AVATAR_PRESENCE: 'avatar-presence',
    // 0.2.41 — the same, one layer up: an OPTIONAL signature over an
    // AvatarProfileAdvertisement (core/AvatarProfileAdvertisement.js's
    // wire shape), never over AvatarProfile itself. See
    // core/AvatarProfileAdvertisement.js's
    // getAvatarProfileSigningDescriptor().
    AVATAR_PROFILE: 'avatar-profile',
    // 0.2.45 — the same, one layer up again: an OPTIONAL signature over
    // an AvatarInteractionAdvertisement (core/
    // AvatarInteractionAdvertisement.js's wire shape) — the ephemeral
    // GREET/WAVE/POINT EVENT counterpart to AVATAR_PRESENCE/
    // AVATAR_PROFILE's own STATE advertisements. See
    // core/AvatarInteractionAdvertisement.js's
    // getAvatarInteractionSigningDescriptor().
    AVATAR_INTERACTION: 'avatar-interaction',
    // 0.2.49 — a REQUIRED signature (never optional the way the
    // advertisement types above are) over a peer authentication PROOF
    // message (core/PeerAuthenticationEnvelope.js's wire shape). Every
    // other SignatureType proves "who authorized this piece of
    // content"; this one proves something narrower and more
    // immediate — "who is currently holding the private key on the
    // other end of THIS connection, answering THIS challenge, right
    // now" — never a claim about a document, placement, or advertised
    // state. See core/PeerAuthenticationEnvelope.js's
    // getPeerAuthenticationSigningDescriptor().
    PEER_AUTHENTICATION: 'peer-authentication',
    // 0.2.57 — a REQUIRED signature (never optional, exactly like
    // PEER_AUTHENTICATION above, and unlike AVATAR_PRESENCE/
    // AVATAR_PROFILE/AVATAR_INTERACTION) over a friendship REQUEST or
    // ACCEPT (core/FriendshipAdvertisement.js's wire shape). Proves
    // "identity X really did request/accept friendship with identity
    // Y" — the one piece of evidence a decentralized system with no
    // central friend database has to offer either side. See
    // core/FriendshipAdvertisement.js's getFriendshipSigningDescriptor().
    FRIENDSHIP: 'friendship',
    // 0.2.66 — an OPTIONAL signature over a peer/RendezvousPublication.js
    // (never over the peer/PeerInvitation.js it wraps, which stays exactly
    // as unsigned as 0.2.50 always made it — see that file's own header).
    // Unlike PEER_AUTHENTICATION/FRIENDSHIP above, this is optional exactly
    // like AVATAR_PRESENCE/AVATAR_PROFILE/AVATAR_INTERACTION: a rendezvous
    // network is deliberately never required to reject an unsigned
    // publication (see peer/RendezvousTransport.js's own header — it
    // authenticates no one, signed or not). What this signature buys, when
    // present, is tamper-evidence one layer BEFORE peer/
    // PeerAuthenticationSession.js's own handshake ever runs: a publication
    // whose signature does not verify, or whose signer does not match the
    // identity it claims to publish for, is discarded as obviously bogus —
    // never treated as "more trustworthy," since only a live handshake ever
    // proves identity. See core/RendezvousPublicationEnvelope.js's
    // getRendezvousPublicationSigningDescriptor().
    RENDEZVOUS_PUBLICATION: 'rendezvous-publication',
    // 0.2.67 — a REQUIRED signature (never optional, like PEER_AUTHENTICATION
    // and FRIENDSHIP above, and unlike the AVATAR_*/RENDEZVOUS_PUBLICATION
    // types), over a self-revocation record (core/
    // IdentityRevocationEnvelope.js's wire shape). Proves "the owner of
    // identityId itself declared this key no longer trustworthy" — the
    // only party this architecture ever lets make that declaration is
    // the identity's own key, so an unsigned or third-party-signed
    // revocation is never even a well-formed claim. See core/
    // IdentityRevocationEnvelope.js's getIdentityRevocationSigningDescriptor().
    IDENTITY_REVOCATION: 'identity-revocation',
    // 0.2.67 — the same REQUIRED discipline, over a signed successor
    // declaration (core/IdentitySuccessionEnvelope.js's wire shape).
    // Proves "identity A itself named identity B as its successor" —
    // signed by the PREDECESSOR only; the successor never counter-signs
    // (see that file's own header for why). See core/
    // IdentitySuccessionEnvelope.js's getIdentitySuccessionSigningDescriptor().
    IDENTITY_SUCCESSION: 'identity-succession',
    // 0.2.78 — a REQUIRED signature (never optional, like PEER_AUTHENTICATION/
    // FRIENDSHIP/IDENTITY_REVOCATION/IDENTITY_SUCCESSION above), over a
    // device authorization grant (core/DeviceAuthorizationEnvelope.js's
    // wire shape). Proves "identity A itself authorized deviceKey B to
    // act on its behalf" — signed by the PARENT identity only; the
    // device never counter-signs, the same asymmetry IDENTITY_SUCCESSION
    // already established for predecessor/successor. Answers a
    // deliberately narrower question than PEER_AUTHENTICATION does:
    // PEER_AUTHENTICATION proves "who is holding this key, right now, on
    // this connection"; DEVICE_AUTHORIZATION_GRANT proves "this key was
    // given permission to act for that OTHER identity" — see docs/
    // Principles.md, "Identity Authentication Proves A Key; Device
    // Authorization Proves Permission." See core/
    // DeviceAuthorizationEnvelope.js's getDeviceAuthorizationGrantSigningDescriptor().
    DEVICE_AUTHORIZATION_GRANT: 'device-authorization-grant',
    // 0.2.78 — the same REQUIRED discipline, withdrawing a grant already
    // made under DEVICE_AUTHORIZATION_GRANT above. See core/
    // DeviceAuthorizationEnvelope.js's getDeviceAuthorizationRevocationSigningDescriptor().
    DEVICE_AUTHORIZATION_REVOCATION: 'device-authorization-revocation',
    // 0.2.98 — a REQUIRED signature (never optional, the same discipline
    // as DEVICE_AUTHORIZATION_GRANT above), over a World edit membership
    // grant (core/WorldEditAuthorizationEnvelope.js's wire shape). Proves
    // "identity A itself granted identity B EDIT authority over World
    // W" — a deliberately NARROWER claim than DEVICE_AUTHORIZATION_GRANT:
    // a device authorization says "this key may act for me, everywhere";
    // a World edit grant says "this OTHER identity may edit exactly this
    // ONE World," and never implies anything about who may act as whom.
    // Signed by the GRANTING identity only; the subject never
    // counter-signs. See core/WorldEditAuthorizationEnvelope.js's
    // getWorldEditAuthorizationGrantSigningDescriptor().
    WORLD_EDIT_AUTHORIZATION_GRANT: 'world-edit-authorization-grant',
    // 0.2.98 — the same REQUIRED discipline, withdrawing a grant already
    // made under WORLD_EDIT_AUTHORIZATION_GRANT above. See core/
    // WorldEditAuthorizationEnvelope.js's
    // getWorldEditAuthorizationRevocationSigningDescriptor().
    WORLD_EDIT_AUTHORIZATION_REVOCATION: 'world-edit-authorization-revocation',
    // 0.5.2 — a REQUIRED signature (never optional — see this file's own
    // "no unsigned claims" rule above), over a PlaceNamingClaim
    // (core/PlaceNamingClaim.js's own wire shape). Proves "identity X
    // itself asserts that region Y is called Z" — a deliberately
    // WEAKER claim than WORLD_EDIT_AUTHORIZATION_GRANT: it never
    // authorizes anything, never requires the signer to hold EDIT on
    // the World the region lives in, and two claims for the same
    // region that disagree are both perfectly valid signed facts, not
    // a conflict either replica needs to resolve. See core/
    // PlaceNamingClaim.js's own getSigningDescriptor() and
    // docs/Principles.md, "A Name Is A Claim, Not A Fact (0.5.2)."
    PLACE_NAMING_CLAIM: 'place-naming-claim',
    // 0.6.5 — a REQUIRED signature (never optional — see this file's
    // own "no unsigned claims" rule above), over a BlueprintAttribution
    // (core/BlueprintAttribution.js's own wire shape). Proves "identity
    // X itself asserts authorship of the blueprint whose design content
    // fingerprints to Y" — deliberately the SAME shape of claim as
    // PLACE_NAMING_CLAIM above, one domain over: it never authorizes
    // anything, never requires the signer to have created the LOCAL
    // Structure instance it was derived from, and several identities'
    // attributions for the same fingerprint disagreeing about who made
    // it are all perfectly valid signed facts, not a conflict either
    // replica needs to resolve. See core/BlueprintAttribution.js's own
    // getSigningDescriptor() and docs/Principles.md, "Attribution Is An
    // External Assertion About A Fingerprint, Never Structure State
    // (0.6.5)."
    BLUEPRINT_ATTRIBUTION: 'blueprint-attribution',
    // 0.6.8 — a REQUIRED signature (never optional — see this file's
    // own "no unsigned claims" rule above), over a BlueprintLineageClaim
    // (core/BlueprintLineageClaim.js's own wire shape). Proves "identity
    // X itself asserts that the design fingerprinting to
    // derivedFingerprint was derived from the design fingerprinting to
    // sourceFingerprint" — deliberately the same shape of claim as
    // BLUEPRINT_ATTRIBUTION above, one concept over: it never authorizes
    // anything, never requires the signer to have authored either
    // design, and several identities' lineage claims about the same pair
    // of fingerprints disagreeing (or even directly contradicting one
    // another) are all perfectly valid signed facts, not a conflict
    // either replica needs to resolve. See core/BlueprintLineageClaim.js's
    // own getSigningDescriptor() and docs/Principles.md, "Lineage Is A
    // Signed Claim, Never A Fact (0.6.8)."
    BLUEPRINT_LINEAGE_CLAIM: 'blueprint-lineage-claim',
    // 0.7.0 — a REQUIRED signature (never optional — see this file's
    // own "no unsigned claims" rule above), over a
    // core/DecentralizedPublication.js envelope. Proves "identity X
    // itself chose to publish this exact ContentReference, under this
    // publicationId, claiming it holds content of this contentKind" —
    // deliberately a NARROWER claim than every SignatureType above it:
    // it says nothing about whether the referenced bytes are true,
    // well-formed, or even retrievable, and nothing about whether X
    // authored whatever the bytes turn out to contain. Several
    // publications can wrap the SAME content hash under different
    // locators, published by different identities, and none of them is
    // more authoritative than another — see core/
    // DecentralizedPublication.js's own header and docs/Principles.md,
    // "Publication Makes Content Discoverable; It Does Not Make It
    // Authoritative (0.7.0)."
    DECENTRALIZED_PUBLICATION: 'decentralized-publication',
    // 0.8.0 — a REQUIRED signature over a core/PublicationAnchor.js
    // record. Proves "identity X observed/recorded this exact
    // contentHash, for this publicationId, in this external system" —
    // an even NARROWER claim than DECENTRALIZED_PUBLICATION above it:
    // it says nothing about whether the anchored content is true,
    // well-formed, or even retrievable, nothing about who authored it,
    // and nothing about who published it — only that the anchoring
    // identity attests this hash was recorded where the anchor's own
    // `locator` says it was. Several anchors, from different anchoring
    // identities, in different external systems, can all name the SAME
    // contentHash, and none of them is ever more authoritative than
    // another — see core/PublicationAnchor.js's own header and
    // docs/Principles.md, "External Anchoring Provides Evidence; It
    // Does Not Establish Authority (0.8.0)."
    PUBLICATION_ANCHOR: 'publication-anchor'
});

export class Signature {
    constructor({ algorithm, signer, signature, signedHash, domain, signedAt = null } = {}) {
        if (!algorithm || typeof algorithm !== 'string') {
            throw new Error('Signature: algorithm is required');
        }
        if (!signer || typeof signer !== 'string') {
            throw new Error('Signature: signer is required');
        }
        if (!signature || typeof signature !== 'string') {
            throw new Error('Signature: signature bytes are required');
        }
        if (!signedHash || typeof signedHash !== 'string') {
            throw new Error('Signature: signedHash is required');
        }
        if (!domain || typeof domain !== 'string') {
            throw new Error('Signature: domain is required');
        }
        this._algorithm = algorithm;
        this._signer = signer;
        this._signature = signature;
        this._signedHash = signedHash;
        this._domain = domain;
        this._signedAt = signedAt instanceof Date ? signedAt : (signedAt ? new Date(signedAt) : null);
    }

    get algorithm() { return this._algorithm; }
    get signer() { return this._signer; }
    get signature() { return this._signature; }
    get signedHash() { return this._signedHash; }
    get domain() { return this._domain; }
    get signedAt() { return this._signedAt; }

    toJSON() {
        return {
            algorithm: this._algorithm,
            signer: this._signer,
            signature: this._signature,
            signedHash: this._signedHash,
            domain: this._domain,
            signedAt: this._signedAt ? this._signedAt.toISOString() : null
        };
    }

    // Defensive: returns null for anything that is not a real 0.2.16
    // signature — including legacy attribution stamps
    // ({ signedBy, providerId, data }) stored by pre-0.2.16 publishers.
    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        if (typeof json.signature !== 'string'
            || typeof json.signer !== 'string'
            || typeof json.signedHash !== 'string'
            || typeof json.domain !== 'string') {
            return null;
        }
        return new Signature({
            algorithm: json.algorithm || 'Ed25519',
            signer: json.signer,
            signature: json.signature,
            signedHash: json.signedHash,
            domain: json.domain,
            signedAt: json.signedAt || null
        });
    }

    // The canonical signing envelope. Property order is part of the
    // protocol — it must never change without a new signature version.
    static canonicalEnvelope(descriptor) {
        return {
            domain: SIGNING_DOMAIN,
            type: descriptor.type,
            id: descriptor.id,
            revision: descriptor.revision,
            payload: descriptor.payload
        };
    }

    static canonicalBytes(descriptor) {
        return JSON.stringify(Signature.canonicalEnvelope(descriptor));
    }
}
