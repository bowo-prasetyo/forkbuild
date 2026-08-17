import { computeContentHash } from '../serializer/contentHash.js';

// 0.2.38 — "Equal-but-different is still a conflict" (0.2.18's own
// principle for revision history), applied to live avatar presence:
// the SAME avatarId, at the SAME sequence, carrying DIFFERENT
// position/rotation/animation. This is exactly what
// `core/TrustObservation.js`'s pre-existing `EQUIVOCATING` status
// already means — "same authority, same causal position, different
// content" — `sequence` playing the role `CausalStamp` plays for
// index roots.
//
// Deliberately a pure, STATELESS comparison rather than an
// accumulating detector like `core/IndexEquivocation.js`'s
// `EquivocationDetector`. That class needs to accumulate because a
// SpatialIndexRoot has no single "current" slot to compare against —
// many roots can coexist across the discovery layer. A presence
// record has exactly one: whatever `application/LocalPresenceStore.js`
// currently has stored for that avatarId. Comparing the incoming claim
// against THAT is sufficient and bounded — no separate accumulating
// map is needed, which also avoids giving a high-frequency, ephemeral
// stream a structure that would grow for as long as a session stays
// open (see core/PresenceReplayWindow.js for the same concern solved
// the other way, for replay detection).
//
// This is only ever meaningful once `core/PresenceAuthority.js` has
// already confirmed the incoming claim comes from the SAME bound
// authority as the currently-stored one — see
// application/PresenceTrustBoundary.js's ordering. A forged claim from
// a different signer never reaches this comparison at all; it is
// rejected earlier as UNAUTHORIZED/INVALID_SIGNATURE, which is a
// STRONGER outcome than equivocation, not a weaker one. Equivocation
// specifically models the bound authority itself producing two
// different claims at one sequence — a buggy or compromised client,
// or two devices racing on the same account — never an outsider
// without the real key.
export class PresenceEquivocation {
    constructor({ avatarId, sequence, claims = [] } = {}) {
        if (!avatarId || typeof avatarId !== 'string') {
            throw new Error('PresenceEquivocation: avatarId is required');
        }
        if (!Number.isFinite(sequence)) {
            throw new Error('PresenceEquivocation: sequence must be a number');
        }
        if (!Array.isArray(claims) || claims.length < 2) {
            throw new Error('PresenceEquivocation: at least two competing claims are required');
        }
        this._avatarId = avatarId;
        this._sequence = sequence;
        this._claims = claims.map((c) => ({ ...c }));
    }

    get avatarId() { return this._avatarId; }
    get sequence() { return this._sequence; }
    get claims() { return this._claims.map((c) => ({ ...c })); }

    toJSON() {
        return { avatarId: this._avatarId, sequence: this._sequence, claims: this._claims };
    }
}

function presenceContentHash(advertisement) {
    return computeContentHash(JSON.stringify({
        position: advertisement.position,
        rotation: advertisement.rotation,
        animation: advertisement.animation
    }));
}

// Given the CURRENTLY STORED advertisement for an avatarId (or null)
// and an INCOMING one, returns a PresenceEquivocation the moment they
// share an avatarId and sequence but disagree on content, or null
// otherwise — including the ordinary "nothing stored yet" and
// "genuinely a newer sequence" cases, which are never equivocation,
// and the "identical content at an equal sequence" case, which is a
// REPLAY (see application/PresenceTrustBoundary.js), not a conflict.
export function detectPresenceEquivocation(currentAdvertisement, incomingAdvertisement) {
    if (!currentAdvertisement || !incomingAdvertisement) {
        return null;
    }
    if (currentAdvertisement.avatarId !== incomingAdvertisement.avatarId) {
        return null;
    }
    if (currentAdvertisement.sequence !== incomingAdvertisement.sequence) {
        return null;
    }
    const currentHash = presenceContentHash(currentAdvertisement);
    const incomingHash = presenceContentHash(incomingAdvertisement);
    if (currentHash === incomingHash) {
        return null;
    }
    return new PresenceEquivocation({
        avatarId: incomingAdvertisement.avatarId,
        sequence: incomingAdvertisement.sequence,
        claims: [
            { hash: currentHash, position: currentAdvertisement.position, rotation: currentAdvertisement.rotation, animation: currentAdvertisement.animation },
            { hash: incomingHash, position: incomingAdvertisement.position, rotation: incomingAdvertisement.rotation, animation: incomingAdvertisement.animation }
        ]
    });
}
