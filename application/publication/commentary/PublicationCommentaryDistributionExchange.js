import { PublicationCommentary } from '../../../core/PublicationCommentary.js';
import { PublicationCommentaryDistributionEnvelope } from '../../../core/PublicationCommentaryDistributionEnvelope.js';
import { resolveSigningIdentityId } from '../../../identity/resolveSigningIdentityId.js';

// 0.9.618 — Publication Commentary Distribution Envelope.
//
// application/anchoring/PublicationAnchorExchange.js's own three-step discipline
// (validate -> construct -> verify SIGNATURE -> catalog), applied to a
// PublicationCommentaryDistributionEnvelope instead of a
// PublicationAnchor — with ONE structural difference from that
// precedent, on the export side: a PublicationAnchor is already signed
// by the time anything calls exportAnchor() (application/
// CreatePublicationAnchorUseCase.js signs at construction). A
// core/PublicationCommentary.js is not — 0.9.617's own audit measured
// this directly (Section A, assertions 2-3): the domain object carries
// no signature field at all, and 0.9.618 deliberately never adds one to
// it (see core/PublicationCommentaryDistributionEnvelope.js's own
// header). So THIS class's own exportCommentary() is where signing
// actually happens — the one new responsibility this exchange carries
// that PublicationAnchorExchange never needed.
//
//   exportCommentary(commentary)
//        │  requires the CURRENTLY AUTHENTICATED identity to equal
//        │  commentary.authorIdentityId — only the commentary's own
//        │  author may produce a valid distribution envelope for it
//        ▼
//   PublicationCommentaryDistributionEnvelope.fromCommentary()  (unsigned)
//        │  identityProvider.signCanonical(envelope.getSigningDescriptor())
//        ▼
//   verifier.verifyPublicationCommentaryDistributionEnvelope()   (never
//        │  export what wouldn't survive verification — the same
//        │  discipline application/blueprint/BlueprintAttributionUseCase.js#
//        │  publish() already applies)
//        ▼
//   envelope.toJSON()   -> wire bytes a transport can carry
//
//   importCommentaryEnvelope(envelopeJson)
//        │  PublicationCommentaryDistributionEnvelope.fromJSON()
//        │  (structural validation — malformed input refused here)
//        ▼
//   verifier.verifyPublicationCommentaryDistributionEnvelope()
//        │  (signature verification — forged/tampered input refused here)
//        ▼
//   envelope.toCommentary()   -> a real PublicationCommentary instance
//        ▼
//   storage/PublicationCommentaryStore.js#save()   (0.9.243, UNMODIFIED —
//        the SAME store a locally authored commentary already uses; its
//        own commentaryId idempotent/conflict semantics apply here
//        exactly as they already do for local writes — see that file's
//        own header. No second Commentary database of any kind.)
//
// ONLY THE AUTHOR MAY SIGN THEIR OWN COMMENTARY FOR DISTRIBUTION.
// exportCommentary() throws when the identityProvider's own currently
// authenticated identity does not equal `commentary.authorIdentityId` —
// never silently signs on someone else's behalf, and never lets a
// caller distribute a commentary under a different identity than the
// one that actually wrote it. This is a direct consequence of
// identity/LocalAuthorizationVerifier.js#
// verifyPublicationCommentaryDistributionEnvelope()'s own signer-must-
// equal-authorIdentityId check, enforced here up front so a caller gets
// a clear, specific error rather than a later, opaque verification
// failure.
//
// STOPS EXACTLY WHERE SIGNATURE VERIFICATION STOPS. Never checks
// whether the signer is "allowed" to comment on the named
// publicationId (application/publication/CanCommentOnPublicationUseCase.js's own,
// separate, LOCAL-ONLY question — see that file's own header on why
// authorization is not this milestone's concern); never checks whether
// the named publicationId even resolves on this replica. A remote
// commentary about a Publication this replica has never heard of is
// still a well-formed, still a genuinely signed, fact this replica now
// knows — exactly the same restraint application/
// PublicationAnchorExchange.js already holds for a publicationId it
// never resolves either.
export class PublicationCommentaryDistributionExchange {
    constructor(store, identityProvider, verifier) {
        if (!store || typeof store.save !== 'function') {
            throw new Error('PublicationCommentaryDistributionExchange: a PublicationCommentaryStore is required');
        }
        if (!identityProvider) {
            throw new Error('PublicationCommentaryDistributionExchange: identityProvider is required');
        }
        if (!verifier || typeof verifier.verifyPublicationCommentaryDistributionEnvelope !== 'function') {
            throw new Error('PublicationCommentaryDistributionExchange: an authorization verifier is required');
        }
        this._store = store;
        this._identityProvider = identityProvider;
        this._verifier = verifier;
    }

    // Signs `commentary` — a real, already-in-hand PublicationCommentary
    // instance (typically one this replica already saved locally via
    // application/publication/commentary/AddPublicationCommentaryUseCase.js) — for distribution,
    // and returns the resulting envelope's plain JSON, ready to hand to a
    // transport. Throws when `commentary` is not a PublicationCommentary
    // instance, when nobody is authenticated, when the authenticated
    // identity does not equal `commentary.authorIdentityId` (see this
    // class's own header), when the identityProvider lacks the 0.2.16
    // cryptographic surface, or when the freshly signed envelope somehow
    // fails its own verifier check.
    exportCommentary(commentary) {
        if (!(commentary instanceof PublicationCommentary)) {
            throw new Error('PublicationCommentaryDistributionExchange: a PublicationCommentary instance is required');
        }
        const signingIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!signingIdentityId) {
            throw new Error('PublicationCommentaryDistributionExchange: sign in to distribute a commentary');
        }
        if (signingIdentityId !== commentary.authorIdentityId) {
            throw new Error('PublicationCommentaryDistributionExchange: only the commentary\'s own author may sign it for distribution');
        }
        if (typeof this._identityProvider.signCanonical !== 'function') {
            throw new Error('PublicationCommentaryDistributionExchange: this identity provider cannot sign a commentary distribution envelope');
        }

        let envelope = PublicationCommentaryDistributionEnvelope.fromCommentary(commentary);
        envelope = envelope.withSignature(this._identityProvider.signCanonical(envelope.getSigningDescriptor()));

        const result = this._verifier.verifyPublicationCommentaryDistributionEnvelope(envelope.toJSON());
        if (!result.valid) {
            throw new Error(`PublicationCommentaryDistributionExchange: refusing to export an unverifiable envelope — ${result.reason}`);
        }
        return envelope.toJSON();
    }

    // Verifies `envelopeJson` (structural shape, then signature) and, on
    // success, saves the reconstructed PublicationCommentary into the
    // EXISTING store — reusing its own commentaryId idempotent/conflict
    // semantics directly, never reinventing them. Returns
    // `{ commentary, isNew }`, the identical shape application/
    // AddPublicationCommentaryUseCase.js's own execute() already returns.
    // Throws for a malformed envelope, an unverifiable/forged signature,
    // or (propagated, unmodified) a genuine PublicationCommentaryConflictError
    // when the same commentaryId is already on file with DIFFERENT
    // content — see storage/PublicationCommentaryStore.js's own header.
    importCommentaryEnvelope(envelopeJson) {
        const envelope = PublicationCommentaryDistributionEnvelope.fromJSON(envelopeJson);
        if (!envelope) {
            throw new Error('PublicationCommentaryDistributionExchange: malformed commentary distribution envelope');
        }
        const result = this._verifier.verifyPublicationCommentaryDistributionEnvelope(envelope.toJSON());
        if (!result.valid) {
            throw new Error(`PublicationCommentaryDistributionExchange: refusing to accept an unverifiable envelope — ${result.reason}`);
        }
        const commentary = envelope.toCommentary();
        const isNew = this._store.save(commentary);
        return { commentary, isNew };
    }
}
