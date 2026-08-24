import { BlueprintAttribution } from '../core/BlueprintAttribution.js';
import { deriveBlueprintFingerprint } from '../core/BlueprintFingerprint.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { attributionView } from '../core/BlueprintAttributionView.js';

// 0.6.5 — Blueprint Identity & Attribution.
//
// The explicit entry point for "publish/retract/read attribution for a
// blueprint's design" — thin over LocalBlueprintAttributionStore.js (raw
// persistence) and core/BlueprintFingerprint.js (pure derivation), the
// same three-layer split application/PlaceNamingClaimUseCase.js already
// keeps one domain over: ui/ talks to THIS class, never to the store or
// the fingerprint module directly.
//
// publish() REQUIRES a signing identity and REQUIRES a Structure with
// derivable design content — a BlueprintAttribution has never existed
// unsigned or fingerprint-less; see core/Signature.js's own
// BLUEPRINT_ATTRIBUTION header on why the signature is REQUIRED, the
// same posture PlaceNamingClaimUseCase.js already takes for a naming
// claim.
//
// Deliberately never checks whether the caller actually AUTHORED the
// local Structure it derives a fingerprint from — publish() only ever
// consults "can this identity sign at all," the exact same restraint
// PlaceNamingClaimUseCase.js#publish() already applies. Claiming
// authorship of a design you did not create is possible here for the
// same reason claiming a place name you have no connection to already
// was in 0.5.2: this layer establishes what a claim MEANS, never who is
// telling the truth — that judgment is left entirely to whoever reads
// attributions later (see core/PlaceNamingClaim.js's own header on the
// identical restraint, one domain over).
export class BlueprintAttributionUseCase {
    // `publicationLog` is OPTIONAL and OFF by default — every call site
    // that predates 0.6.7 keeps constructing this class with exactly
    // three arguments, and communityView() below degrades gracefully
    // (every claim's own receivedAt reads as null) when it is omitted.
    // See that method's own header on why it, not summarize(), is the
    // one place this class is allowed to read the publication log at
    // all.
    constructor(store, identityProvider, verifier, publicationLog = null) {
        if (!store) {
            throw new Error('BlueprintAttributionUseCase: a BlueprintAttribution store is required');
        }
        if (!identityProvider) {
            throw new Error('BlueprintAttributionUseCase: identityProvider is required');
        }
        if (!verifier) {
            throw new Error('BlueprintAttributionUseCase: an authorization verifier is required');
        }
        this._store = store;
        this._identityProvider = identityProvider;
        this._verifier = verifier;
        this._publicationLog = publicationLog;
    }

    // Signs and stores a new attribution: "I, the currently authenticated
    // identity, assert authorship of the blueprint `structure`'s own
    // design content." Returns the stored BlueprintAttribution. Throws
    // if `structure` has no derivable fingerprint, if nobody is signed
    // in, or if the identityProvider lacks the 0.2.16 cryptographic
    // surface — see this class's own header.
    publish(structure) {
        const fingerprint = deriveBlueprintFingerprint(structure);
        if (!fingerprint) {
            throw new Error('BlueprintAttributionUseCase: structure has no derivable design content');
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('BlueprintAttributionUseCase: sign in to claim authorship of a blueprint');
        }
        if (typeof this._identityProvider.signCanonical !== 'function') {
            throw new Error('BlueprintAttributionUseCase: this identity provider cannot sign an attribution');
        }
        let attribution = new BlueprintAttribution({ fingerprint, authorIdentityId });
        const signature = this._identityProvider.signCanonical(attribution.getSigningDescriptor());
        attribution = attribution.withSignature(signature);

        // Verify our own output before it ever reaches storage — the
        // same "never persist what wouldn't survive verification"
        // discipline PlaceNamingClaimUseCase.js#publish() already
        // applies. A failure here means the identityProvider or
        // verifier disagree about the signing domain/algorithm, never a
        // normal runtime outcome.
        const result = this._verifier.verifyBlueprintAttribution(attribution.toJSON());
        if (!result.valid) {
            throw new Error(`BlueprintAttributionUseCase: refusing to publish an unverifiable attribution — ${result.reason}`);
        }
        this._store.save(attribution);
        return attribution;
    }

    // Withdraws an attribution THIS identity itself published. Silently
    // no-ops (returns false) for an unknown attribution id or one
    // authored by someone else — the same author-only asymmetry
    // PlaceNamingClaimUseCase.js#retract() already keeps.
    retract(fingerprint, attributionId) {
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        const existing = this._store.list(fingerprint).find((attribution) => attribution.id === attributionId);
        if (!existing || existing.authorIdentityId !== authorIdentityId) {
            return false;
        }
        return this._store.retract(fingerprint, attributionId);
    }

    // Every attribution this replica has on file for one Structure's own
    // derived fingerprint, most recent first — raw facts, unranked, the
    // same restraint core/PlaceNamingClaimUseCase.js#claimsForRegion()
    // already keeps. Returns `[]` for a structure with no derivable
    // fingerprint rather than throwing.
    attributionsForBlueprint(structure) {
        const fingerprint = deriveBlueprintFingerprint(structure);
        return fingerprint ? this._store.list(fingerprint) : [];
    }

    // A small, presentation-oriented summary a UI can render directly —
    // never a ranking or authority verdict, the same "confidence, not
    // authority" restraint core/PlaceNamingView.js already keeps one
    // domain over. `mine` is the CURRENTLY SIGNED-IN identity's own
    // attribution for this fingerprint, if it has published one;
    // `attributions` is every attribution this replica has on file,
    // most recent first. `fingerprint` is null for a structure with no
    // derivable design content (e.g. `null` itself), in which case
    // `attributions` is always `[]` and `mine` is always `null`.
    summarize(structure) {
        const fingerprint = deriveBlueprintFingerprint(structure);
        if (!fingerprint) {
            return { fingerprint: null, attributions: [], mine: null };
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        const attributions = this._store.list(fingerprint);
        const mine = authorIdentityId
            ? attributions.find((attribution) => attribution.authorIdentityId === authorIdentityId) || null
            : null;
        return { fingerprint, attributions, mine };
    }

    // 0.6.7 — Blueprint Attribution Resolution & Community Identity.
    //
    // The presentation-ready counterpart to summarize() above: the exact
    // same fingerprint/attributions/identity read, but run through
    // core/BlueprintAttributionView.js#attributionView() so a caller gets
    // back a distinct-author ranking (`authors`/`authorCount`) instead of
    // a flat, unranked list. Deliberately a SEPARATE method rather than a
    // change to summarize()'s own return shape — summarize() stays the
    // plain, unranked read every existing caller already relies on, the
    // same restraint core/PlaceNamingView.js keeps as its own module,
    // entirely apart from application/PlaceNamingClaimUseCase.js.
    //
    // This is also the ONE place in this class allowed to read
    // `publicationLog`, attaching a companion `receivedAt` map keyed by
    // attribution id — never merged into the attribution objects
    // themselves (they stay immutable, exactly as core/
    // BlueprintAttribution.js constructs them), and never influencing
    // `authors`/`authorCount`/ordering in any way. summarize() above
    // still never touches the log at all — see application/
    // LocalBlueprintAttributionPublicationLog.js's own header on why that
    // restraint predates this method and stays exactly where 0.6.6 left
    // it.
    communityView(structure) {
        const fingerprint = deriveBlueprintFingerprint(structure);
        if (!fingerprint) {
            return { ...attributionView(null, [], null), receivedAt: {} };
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        const attributions = this._store.list(fingerprint);
        const view = attributionView(fingerprint, attributions, authorIdentityId);
        const receivedAt = {};
        if (this._publicationLog) {
            for (const claim of view.claims) {
                receivedAt[claim.id] = this._publicationLog.getReceivedAt(fingerprint, claim.id);
            }
        }
        return { ...view, receivedAt };
    }
}
