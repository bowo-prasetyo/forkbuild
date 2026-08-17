// 0.2.38 — closes the gap 0.2.37's own header left explicit: "a
// higher sequence number from ANYONE currently wins." See
// docs/Principles.md, "An Avatar ID Identifies An Avatar; It Does Not
// Prove Who Currently Controls It."
//
// This is a trust-ON-FIRST-USE binding, deliberately NOT a lookup
// against a distributed AvatarProfile directory — 0.2.38 was
// explicitly asked to harden the ingestion boundary 0.2.37 built, not
// to invent AvatarProfile distribution as a side effect. The FIRST
// claim a replica accepts for a given avatarId establishes who is
// allowed to speak for it from then on:
//
//   - if that first claim carried a verified signature, `signerId`
//     (the did:key that produced it) becomes the permanent authority
//     for this avatarId, for the life of this registry. No other
//     signer, and no unsigned claim, can ever replace it.
//   - if it did not (a permissive-policy participant with no signing
//     identity at all), the plain `ownerIdentity` string is the best
//     available check — weaker, spoofable by anyone willing to claim
//     the same string, but still enough to catch an avatarId being
//     silently reassigned to a different owner mid-stream.
//   - a currently-unsigned binding upgrades gracefully the first time
//     a real signer claims that avatarId. This is deliberately
//     asymmetric: it is always safe to demand MORE proof than you
//     previously had, never to accept LESS. (In the narrow window
//     before ANY claim has ever been accepted for a brand-new
//     avatarId, whichever signer claims it first wins that race — the
//     same trust-on-first-use property SSH host keys and every other
//     TOFU scheme accepts; a policy that requires signed presence up
//     front — see core/PresenceTrustPolicy.js — closes even that
//     window, since an attacker without the real key can never
//     produce the FIRST accepted claim in the first place.)
//
// Never cleared when an avatar goes ABSENT/is pruned from
// application/LocalPresenceStore.js — a returning participant must
// still only be believed as the SAME authority that left, not
// whoever next claims their avatarId. This registry's lifetime is
// tied to the trust boundary that owns it (effectively one replica
// session), not to how long a specific avatar has recently been seen.
export class PresenceAuthorityRegistry {
    constructor() {
        this._bindings = new Map(); // avatarId -> { ownerIdentity, signerId }
    }

    // claim: { ownerIdentity: string|null, signerId: string|null }.
    // signerId is the did:key recovered from a VERIFIED signature, or
    // null for an unsigned claim — never pass an unverified signer
    // here. Returns { authorized, reason }.
    evaluate(avatarId, claim) {
        const existing = this._bindings.get(avatarId);
        if (!existing) {
            this._bindings.set(avatarId, { ownerIdentity: claim.ownerIdentity, signerId: claim.signerId });
            return { authorized: true, reason: 'first-seen' };
        }
        if (existing.signerId) {
            if (claim.signerId === existing.signerId) {
                return { authorized: true, reason: null };
            }
            return {
                authorized: false,
                reason: claim.signerId
                    ? 'signer does not match the signing authority already bound to this avatarId'
                    : 'unsigned claim for an avatarId that already has a bound signing authority'
            };
        }
        if (claim.signerId) {
            // Upgrade: the binding was unsigned so far — the first
            // real signer to claim this avatarId becomes authoritative.
            this._bindings.set(avatarId, { ownerIdentity: claim.ownerIdentity, signerId: claim.signerId });
            return { authorized: true, reason: 'authority upgraded to a signed claim' };
        }
        // Neither the existing binding nor the incoming claim carries
        // a signer — the best available check is the plain
        // ownerIdentity string.
        if (claim.ownerIdentity === existing.ownerIdentity) {
            return { authorized: true, reason: null };
        }
        return {
            authorized: false,
            reason: 'ownerIdentity does not match the identity already bound to this avatarId (unsigned)'
        };
    }

    // Debug/test surface — the binding currently held for an
    // avatarId, or null if none has ever been established.
    binding(avatarId) {
        const existing = this._bindings.get(avatarId);
        return existing ? { ...existing } : null;
    }

    clear() {
        this._bindings.clear();
    }
}
