import { AuthorizationVerifier } from './AuthorizationVerifier.js';
import { Signature, SIGNING_DOMAIN } from '../core/Signature.js';
import { getAvatarPresenceSigningDescriptor } from '../core/AvatarPresenceAdvertisement.js';
import { getAvatarProfileSigningDescriptor } from '../core/AvatarProfileAdvertisement.js';
import { getAvatarInteractionSigningDescriptor } from '../core/AvatarInteractionAdvertisement.js';
import { getFriendshipSigningDescriptor } from '../core/FriendshipAdvertisement.js';
import { getRendezvousPublicationSigningDescriptor } from '../core/RendezvousPublicationEnvelope.js';
import { getIdentityRevocationSigningDescriptor } from '../core/IdentityRevocationEnvelope.js';
import { getIdentitySuccessionSigningDescriptor } from '../core/IdentitySuccessionEnvelope.js';
import {
    getDeviceAuthorizationGrantSigningDescriptor,
    getDeviceAuthorizationRevocationSigningDescriptor
} from '../core/DeviceAuthorizationEnvelope.js';
import {
    getWorldEditAuthorizationGrantSigningDescriptor,
    getWorldEditAuthorizationRevocationSigningDescriptor
} from '../core/WorldEditAuthorizationEnvelope.js';
import { getPlaceNamingClaimSigningDescriptor } from '../core/PlaceNamingClaim.js';
import { getBlueprintAttributionSigningDescriptor } from '../core/BlueprintAttribution.js';
import { getBlueprintLineageClaimSigningDescriptor } from '../core/BlueprintLineageClaim.js';
import { computeContentHash } from '../serializer/contentHash.js';
import * as Ed25519 from './Ed25519.js';

// The V0.1 concrete verifier.
//
// Verification reconstructs the canonical envelope from the object's
// own signing descriptor — it never trusts anything the signature
// claims about the payload:
//
//   canonical object -> canonical bytes -> signedHash check
//                                      -> Ed25519 verification
//
// Authorization rules (0.2.16, deliberately simple):
//   Publication  — signature must verify against publisherIdentity,
//                  and signer must BE that identity.
//   Placement    — signature must verify against ownerIdentity, and
//                  signer must BE that identity. (Bob placing Alice's
//                  castle is a POLICY question for 0.2.17; here the
//                  placer must own the placement revision they sign.)
//   Index root   — signer's key is recovered from the did:key in the
//                  signature itself; if an indexAuthorityIdentity is
//                  configured, the signer must match it.
//
// Unsigned (pre-0.2.16) objects are tolerated and reported as
// signed: false — the deployed corpus must keep working.
export class LocalAuthorizationVerifier extends AuthorizationVerifier {
    constructor({ indexAuthorityIdentity = null } = {}) {
        super();
        this._indexAuthorityIdentity = indexAuthorityIdentity;
    }

    verifyPublication(publication) {
        if (!publication) {
            return { valid: false, signed: false, reason: 'no publication' };
        }
        if (!publication.signature) {
            return { valid: true, signed: false, reason: 'unsigned publication (legacy)' };
        }
        if (!publication.publisherIdentity) {
            return { valid: false, signed: true, reason: 'signature without publisher identity' };
        }
        return this.verifyDescriptor(
            publication.getSigningDescriptor(),
            publication.signature,
            publication.publisherIdentity
        );
    }

    verifyPlacement(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no placement record' };
        }
        if (!record.signature) {
            return { valid: true, signed: false, reason: 'unsigned placement (legacy)' };
        }
        if (!record.ownerIdentity) {
            return { valid: false, signed: true, reason: 'signature without owner identity' };
        }
        return this.verifyDescriptor(
            record.getSigningDescriptor(),
            record.signature,
            record.ownerIdentity
        );
    }

    verifyIndexRoot(root) {
        if (!root) {
            return { valid: false, signed: false, reason: 'no index root' };
        }
        const signature = root.signature;
        if (!signature) {
            return { valid: true, signed: false, reason: 'unsigned index root (legacy)' };
        }
        // The root carries no identity payload — the did:key signer IS
        // the public key.
        const publicKeyBytes = Ed25519.didKeyToPublicKey(signature.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = {
            id: signature.signer,
            algorithm: 'Ed25519',
            publicKey: Ed25519.bytesToHex(publicKeyBytes)
        };
        const result = this.verifyDescriptor(root.getSigningDescriptor(), signature, identity);
        if (!result.valid) {
            return result;
        }
        if (this._indexAuthorityIdentity && signature.signer !== this._indexAuthorityIdentity.id) {
            return { valid: false, signed: true, reason: 'signer is not the index authority' };
        }
        return result;
    }

    // 0.2.38 — an AvatarPresenceAdvertisement (core/
    // AvatarPresenceAdvertisement.js) carries no identity payload of
    // its own, exactly like a SpatialIndexRoot above: the did:key
    // signer of a valid signature IS the public key. Unsigned is
    // tolerated at THIS layer (structural verification only) — see
    // core/PresenceTrustPolicy.js for whether a receiver's policy
    // actually accepts an unsigned claim, and
    // application/PresenceTrustBoundary.js for the identity-binding
    // check ("is this signer allowed to speak for this avatarId at
    // all") that a merely-VALID signature does not by itself answer.
    verifyPresenceAdvertisement(advertisement) {
        if (!advertisement) {
            return { valid: false, signed: false, reason: 'no advertisement' };
        }
        if (!advertisement.signature) {
            return { valid: true, signed: false, reason: 'unsigned presence advertisement' };
        }
        const sig = Signature.fromJSON(advertisement.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getAvatarPresenceSigningDescriptor(advertisement), advertisement.signature, identity);
    }

    // 0.2.41 — the same shape verifyPresenceAdvertisement() above
    // already established, one layer up: an AvatarProfileAdvertisement
    // carries no identity payload of its own, so the did:key signer of
    // a valid signature IS the public key. Unsigned is tolerated at
    // THIS layer (structural verification only) — 0.2.41 introduces no
    // policy knob equivalent to core/PresenceTrustPolicy.js, so
    // application/AvatarProfileTrustBoundary.js always tolerates an
    // unsigned profile claim, exactly like presence's own permissive
    // default.
    verifyAvatarProfileAdvertisement(advertisement) {
        if (!advertisement) {
            return { valid: false, signed: false, reason: 'no advertisement' };
        }
        if (!advertisement.signature) {
            return { valid: true, signed: false, reason: 'unsigned profile advertisement' };
        }
        const sig = Signature.fromJSON(advertisement.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getAvatarProfileSigningDescriptor(advertisement), advertisement.signature, identity);
    }

    // 0.2.45 — the same shape verifyPresenceAdvertisement()/
    // verifyAvatarProfileAdvertisement() above already established, one
    // more layer up: an AvatarInteractionAdvertisement carries no
    // identity payload of its own, so the did:key signer of a valid
    // signature IS the public key. Unsigned is tolerated at THIS layer
    // (structural verification only) — see
    // core/AvatarInteractionTrustPolicy.js for whether a receiver's
    // policy actually accepts an unsigned claim, and
    // application/AvatarInteractionTrustBoundary.js for the
    // identity-binding check a merely-VALID signature does not by
    // itself answer.
    verifyAvatarInteractionAdvertisement(advertisement) {
        if (!advertisement) {
            return { valid: false, signed: false, reason: 'no advertisement' };
        }
        if (!advertisement.signature) {
            return { valid: true, signed: false, reason: 'unsigned interaction advertisement' };
        }
        const sig = Signature.fromJSON(advertisement.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getAvatarInteractionSigningDescriptor(advertisement), advertisement.signature, identity);
    }

    // 0.2.57 — unlike verifyPresenceAdvertisement()/
    // verifyAvatarProfileAdvertisement()/verifyAvatarInteractionAdvertisement()
    // above, a friendship advertisement is NEVER tolerated unsigned —
    // see core/FriendshipAdvertisement.js's own header on why there is
    // no server anywhere that could otherwise vouch for "Bob accepted
    // Alice's request." It also, uniquely among this file's verify*
    // methods, checks the signer against a claim CARRIED ON the
    // advertisement itself (`actorIdentity`) rather than merely
    // recovering an identity from the signature and trusting whatever
    // the payload happens to say about it — a REQUEST/ACCEPT is
    // meaningless unless it is provably FROM the identity it claims to
    // be from, every single time, with no trust-on-first-use binding
    // the way core/PresenceAuthority.js allows one layer down.
    verifyFriendshipAdvertisement(advertisement) {
        if (!advertisement) {
            return { valid: false, signed: false, reason: 'no advertisement' };
        }
        if (!advertisement.signature) {
            return { valid: false, signed: false, reason: 'a friendship advertisement must be signed' };
        }
        const sig = Signature.fromJSON(advertisement.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== advertisement.actorIdentity) {
            return { valid: false, signed: true, reason: 'signer does not match the claimed actorIdentity' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getFriendshipSigningDescriptor(advertisement), advertisement.signature, identity);
    }

    // 0.2.66 — a peer/RendezvousPublication.js signature is OPTIONAL,
    // exactly like verifyPresenceAdvertisement()/verifyAvatarProfileAdvertisement()
    // above and unlike verifyFriendshipAdvertisement()'s REQUIRED one — see
    // core/Signature.js's own RENDEZVOUS_PUBLICATION header. Unlike those
    // two permissive checks, though, this one DOES cross-check the signer
    // against the publication's own claimed identity (`identityHint`),
    // the same binding verifyFriendshipAdvertisement() already does against
    // `actorIdentity`: a publication is a claim of the form "identityHint
    // is reachable here," so a signature that verifies but was produced by
    // some OTHER identity proves nothing about identityHint at all — it
    // would otherwise let anyone sign a syntactically valid "endorsement"
    // of an endpoint under a name that isn't theirs. Still never a
    // substitute for peer/PeerAuthenticationSession.js's own handshake —
    // see this method's only caller, peer/RendezvousDiscoveryProvider.js#_mergePublication,
    // for how a verified signature only ever means "discard this earlier,
    // as obviously bogus," never "trust this connection."
    verifyRendezvousPublication(publication) {
        if (!publication) {
            return { valid: false, signed: false, reason: 'no publication' };
        }
        if (!publication.signature) {
            return { valid: true, signed: false, reason: 'unsigned publication' };
        }
        const sig = Signature.fromJSON(publication.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== publication.identityHint) {
            return { valid: false, signed: true, reason: 'signer does not match the publication\'s own identityHint' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getRendezvousPublicationSigningDescriptor(publication), publication.signature, identity);
    }

    // 0.2.67 — like verifyFriendshipAdvertisement() above and unlike
    // every AVATAR_*/RENDEZVOUS_PUBLICATION verify* method, a revocation
    // record is NEVER tolerated unsigned: see core/
    // IdentityRevocationEnvelope.js's own header on why only the
    // identity's own key can ever produce a meaningful one. The signer
    // MUST equal the record's own `identityId` — a revocation record is
    // pointless unless the identity it claims to revoke is provably the
    // one that signed it; nothing here trusts a claimed identityId on
    // its own the way a legacy/unsigned object elsewhere in this
    // codebase is tolerated.
    verifyIdentityRevocation(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no revocation record' };
        }
        if (!record.signature) {
            return { valid: false, signed: false, reason: 'a revocation record must be signed' };
        }
        const sig = Signature.fromJSON(record.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== record.identityId) {
            return { valid: false, signed: true, reason: 'signer does not match the revoked identityId' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getIdentityRevocationSigningDescriptor(record), record.signature, identity);
    }

    // 0.2.67 — the same REQUIRED-signature discipline as
    // verifyIdentityRevocation() above, applied to a successor
    // declaration: the signer MUST equal the record's own
    // `predecessorIdentityId` (see core/IdentitySuccessionEnvelope.js's
    // own header on why only the predecessor ever signs one — the
    // successor never counter-signs).
    verifyIdentitySuccession(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no succession record' };
        }
        if (!record.signature) {
            return { valid: false, signed: false, reason: 'a succession record must be signed' };
        }
        const sig = Signature.fromJSON(record.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== record.predecessorIdentityId) {
            return { valid: false, signed: true, reason: 'signer does not match the predecessorIdentityId' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getIdentitySuccessionSigningDescriptor(record), record.signature, identity);
    }

    // 0.2.78 — like verifyIdentityRevocation()/verifyIdentitySuccession()
    // above, a device authorization grant is NEVER tolerated unsigned:
    // see core/DeviceAuthorizationEnvelope.js's own header on why only
    // the PARENT identity's own key can ever produce a meaningful one.
    // The signer MUST equal the record's own `identityId` — a grant is
    // pointless unless the identity it claims authorizes the device is
    // provably the one that signed it. Deliberately does NOT check
    // whether `deviceIdentityId` is a real, live, currently-connected
    // peer at all — that is a completely separate question, answered by
    // whoever is holding a live peer/PeerConnection.js, never by this
    // structural signature check (see application/
    // DeviceAuthorizationPropagationUseCase.js's own header).
    verifyDeviceAuthorizationGrant(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no device authorization grant' };
        }
        if (!record.signature) {
            return { valid: false, signed: false, reason: 'a device authorization grant must be signed' };
        }
        const sig = Signature.fromJSON(record.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== record.identityId) {
            return { valid: false, signed: true, reason: 'signer does not match the authorizing identityId' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getDeviceAuthorizationGrantSigningDescriptor(record), record.signature, identity);
    }

    // 0.2.78 — the same REQUIRED-signature discipline, withdrawing a
    // grant already made above: the signer MUST equal the record's own
    // `identityId`, the same parent-only asymmetry.
    verifyDeviceAuthorizationRevocation(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no device authorization revocation' };
        }
        if (!record.signature) {
            return { valid: false, signed: false, reason: 'a device authorization revocation must be signed' };
        }
        const sig = Signature.fromJSON(record.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== record.identityId) {
            return { valid: false, signed: true, reason: 'signer does not match the authorizing identityId' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getDeviceAuthorizationRevocationSigningDescriptor(record), record.signature, identity);
    }

    // 0.2.98 — like verifyDeviceAuthorizationGrant() above, a World edit
    // authorization grant is NEVER tolerated unsigned: see core/
    // WorldEditAuthorizationEnvelope.js's own header on why only the
    // GRANTING identity's own key can ever produce a meaningful one. The
    // signer MUST equal the record's own `grantingIdentityId` — a grant
    // is pointless unless the identity it claims grants EDIT is provably
    // the one that signed it. This is STRUCTURAL verification only —
    // whether `grantingIdentityId` is actually THIS World's owner is a
    // separate question application/WorldMembershipUseCase.js answers by
    // consulting the World document itself, never here (this class has
    // no notion of "a World" at all).
    verifyWorldEditAuthorizationGrant(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no world edit authorization grant' };
        }
        if (!record.signature) {
            return { valid: false, signed: false, reason: 'a world edit authorization grant must be signed' };
        }
        const sig = Signature.fromJSON(record.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== record.grantingIdentityId) {
            return { valid: false, signed: true, reason: 'signer does not match the granting identity' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getWorldEditAuthorizationGrantSigningDescriptor(record), record.signature, identity);
    }

    // 0.2.98 — the same REQUIRED-signature discipline, withdrawing a
    // grant already made above: the signer MUST equal the record's own
    // `grantingIdentityId`, the same granting-identity-only asymmetry.
    verifyWorldEditAuthorizationRevocation(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no world edit authorization revocation' };
        }
        if (!record.signature) {
            return { valid: false, signed: false, reason: 'a world edit authorization revocation must be signed' };
        }
        const sig = Signature.fromJSON(record.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== record.grantingIdentityId) {
            return { valid: false, signed: true, reason: 'signer does not match the granting identity' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getWorldEditAuthorizationRevocationSigningDescriptor(record), record.signature, identity);
    }

    // 0.5.2 — a PlaceNamingClaim is NEVER tolerated unsigned, the same
    // REQUIRED discipline as verifyWorldEditAuthorizationGrant() above —
    // see core/PlaceNamingClaim.js's own header on why "distinct
    // authors" (core/PlaceNamingView.js#namingView()'s own score) only
    // means anything if each claim is provably a different identity's
    // own assertion. Unlike a World edit grant, the signer MUST equal
    // the claim's own `authorIdentityId` rather than some separate
    // "granting" identity — a naming claim has exactly one party to it,
    // the person doing the claiming. This is STRUCTURAL verification
    // only: whether authorIdentityId holds EDIT on the region's World,
    // or membership in it at all, is never asked here, and never asked
    // anywhere else either — see this file's own header comment on
    // core/PlaceNamingClaim.js for why a naming claim deliberately needs
    // no such authority.
    verifyPlaceNamingClaim(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no place naming claim' };
        }
        if (!record.signature) {
            return { valid: false, signed: false, reason: 'a place naming claim must be signed' };
        }
        const sig = Signature.fromJSON(record.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== record.authorIdentityId) {
            return { valid: false, signed: true, reason: 'signer does not match the claim\'s own author' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getPlaceNamingClaimSigningDescriptor(record), record.signature, identity);
    }

    // 0.6.5 — a BlueprintAttribution is NEVER tolerated unsigned, the
    // same REQUIRED discipline as verifyPlaceNamingClaim() above — see
    // core/BlueprintAttribution.js's own header on why "N known
    // authors" only means anything if each attribution is provably a
    // different identity's own assertion. The signer MUST equal the
    // attribution's own `authorIdentityId`, exactly like a naming
    // claim's signer must equal ITS OWN author — an attribution has
    // exactly one party to it, the person doing the claiming. This is
    // STRUCTURAL verification only: whether authorIdentityId actually
    // created the Structure it was derived from is never asked here,
    // and never asked anywhere else either — a fingerprint match is
    // never proof, only a candidate, exactly the same restraint
    // core/PlaceIdentity.js's own header already applies one domain
    // over.
    verifyBlueprintAttribution(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no blueprint attribution' };
        }
        if (!record.signature) {
            return { valid: false, signed: false, reason: 'a blueprint attribution must be signed' };
        }
        const sig = Signature.fromJSON(record.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== record.authorIdentityId) {
            return { valid: false, signed: true, reason: 'signer does not match the attribution\'s own author' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getBlueprintAttributionSigningDescriptor(record), record.signature, identity);
    }

    // 0.6.8 — a BlueprintLineageClaim is NEVER tolerated unsigned, the
    // same REQUIRED discipline as verifyBlueprintAttribution() above.
    // The signer MUST equal the claim's own `authorIdentityId` — a
    // lineage claim has exactly one party to it, the identity asserting
    // the derivation. STRUCTURAL verification only: whether
    // sourceFingerprint/derivedFingerprint actually describe a real
    // derivation is never asked here, and never asked anywhere else
    // either — core/BlueprintSimilarity.js's own evidence is the closest
    // this codebase ever comes to that question, and even it only ever
    // produces a number for a human to weigh. See core/
    // BlueprintLineageClaim.js's own header.
    verifyBlueprintLineageClaim(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no blueprint lineage claim' };
        }
        if (!record.signature) {
            return { valid: false, signed: false, reason: 'a blueprint lineage claim must be signed' };
        }
        const sig = Signature.fromJSON(record.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        if (sig.signer !== record.authorIdentityId) {
            return { valid: false, signed: true, reason: 'signer does not match the claim\'s own author' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getBlueprintLineageClaimSigningDescriptor(record), record.signature, identity);
    }

    // The core check, exposed for direct use (tests, future verifiers).
    verifyDescriptor(descriptor, signature, identityJson) {
        const sig = signature instanceof Signature ? signature : Signature.fromJSON(signature);
        if (!sig || !identityJson || !identityJson.id || !identityJson.publicKey) {
            return { valid: false, signed: false, reason: 'missing signature or identity' };
        }
        if (sig.algorithm !== 'Ed25519' || identityJson.algorithm !== 'Ed25519') {
            return { valid: false, signed: true, reason: 'unsupported algorithm' };
        }
        if (sig.signer !== identityJson.id) {
            return { valid: false, signed: true, reason: 'signer identity mismatch' };
        }
        if (sig.domain !== SIGNING_DOMAIN + '/' + descriptor.type) {
            return { valid: false, signed: true, reason: 'signature domain mismatch' };
        }
        const bytes = Signature.canonicalBytes(descriptor);
        if (computeContentHash(bytes) !== sig.signedHash) {
            return { valid: false, signed: true, reason: 'signed hash mismatch' };
        }
        const ok = Ed25519.verify(
            Ed25519.hexToBytes(identityJson.publicKey),
            Ed25519.utf8ToBytes(bytes),
            Ed25519.hexToBytes(sig.signature)
        );
        return ok
            ? { valid: true, signed: true, reason: null }
            : { valid: false, signed: true, reason: 'signature verification failed' };
    }
}
