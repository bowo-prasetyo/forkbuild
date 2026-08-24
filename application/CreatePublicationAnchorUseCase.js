import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';

// 0.8.8 — Explicit Publication Anchor Creation & Lifecycle.
//
// 0.8.0 through 0.8.7 gave this codebase every way to CONSUME external
// evidence — verify it (0.8.1), catalog it (0.8.2), show it (0.8.3),
// exchange it over peers (0.8.4), discover it historically (0.8.5),
// compare it (0.8.6), import it from a package (0.8.7) — but never a way
// to deliberately CREATE one. This class is that missing application-
// layer workflow, and nothing more: it orchestrates core/
// PublicationAnchor.js, an identityProvider, identity/
// LocalAuthorizationVerifier.js, and application/
// LocalPublicationAnchorCatalog.js exactly the way application/
// BlueprintAttributionUseCase.js#publish() already orchestrates
// core/BlueprintAttribution.js — no new domain model, no change to
// core/PublicationAnchor.js at all.
//
// CREATING A CLAIM IS NOT ANCHORING. This class produces a signed
// assertion — "the current identity attests this publicationId/
// contentHash pair was recorded by some external system, at this
// locator, with this proof" — and nothing else. It never talks to
// Bitcoin, IPFS, or any other external system; the caller supplies
// whatever evidence it already obtained from one (a txid, a CID, a
// transparency-log entry), exactly as application/
// ExternalAnchorVerifier.js's own header already insists a proof
// verifier is always supplied BY the caller, never hard-coded here.
// See docs/Principles.md, "Creating an Anchor Claim Does Not Create
// External Evidence (0.8.8)."
//
// PUBLICATION BINDING, NOT ADJUDICATION. Unlike application/
// AddPublicationAnchorUseCase.js (which accepts an already-complete
// envelope, arbitrary publicationId/contentHash included, because it
// exists to catalog a STRANGER's claim unchanged), this use case
// deliberately does NOT accept a caller-supplied contentHash at all. It
// looks the publication up and derives contentHash from the publication's
// OWN `contentReference.hash` — the one thing this class can actually
// verify locally, since it is creating ForkBuild's own claim rather than
// preserving an imported one. That is not evidence adjudication (0.8.6's
// own restraint on cross-anchor comparison is untouched); it is simply
// ensuring a locally CREATED anchor cannot accidentally misname the
// publication it is about.
//
//   create locally  -> validate against a known publication (THIS FILE)
//   import (0.8.4/0.8.7) -> preserve the external claim, unchanged
//
// NO PROOF VERIFICATION. execute() never constructs, calls, or even
// imports application/ExternalAnchorVerifier.js — see tests/
// PublicationAnchorCreation.test.js's own spy-verifier proof that
// creating an anchor never consults one. Whether the created claim's
// proof actually holds up against the named external system remains a
// completely separate, later action, exactly like every other anchor
// this codebase has ever cataloged.
//
// EXPLICIT IDENTITY, NEVER INFERRED. The signing identity comes from the
// `identityProvider` this class was constructed with, resolved the exact
// same way application/BlueprintAttributionUseCase.js#publish() already
// resolves an author — never a hidden "currentUser" global, and never
// defaulted to anything if nobody is signed in.
export class CreatePublicationAnchorUseCase {
    constructor(publicationCatalog, identityProvider, verifier, anchorCatalog) {
        if (!publicationCatalog) {
            throw new Error('CreatePublicationAnchorUseCase: a publication catalog is required');
        }
        if (!identityProvider) {
            throw new Error('CreatePublicationAnchorUseCase: identityProvider is required');
        }
        if (!verifier) {
            throw new Error('CreatePublicationAnchorUseCase: an authorization verifier is required');
        }
        if (!anchorCatalog) {
            throw new Error('CreatePublicationAnchorUseCase: an anchor catalog is required');
        }
        this._publicationCatalog = publicationCatalog;
        this._identityProvider = identityProvider;
        this._verifier = verifier;
        this._anchorCatalog = anchorCatalog;
    }

    // Creates, signs, and catalogs a new PublicationAnchor for
    // `publicationId`, using externally supplied evidence parameters —
    // never anything this class fetches or constructs itself (see this
    // class's own header on why wallet/broadcast mechanics stay
    // explicitly out of scope). `options`:
    //
    //   anchorType   (required) — e.g. 'bitcoin-op-return'
    //   locator      (required) — where the external system can be
    //                              checked, e.g. a block explorer URL
    //   proof        (optional) — anchorType-specific evidence, e.g.
    //                              { txid, blockHeight }
    //   anchoredAt   (optional) — the EXTERNAL system's own reported
    //                              record time; defaults to now, exactly
    //                              as core/PublicationAnchor.js itself
    //                              defaults it
    //
    // `contentHash` is deliberately NOT an option — it is always derived
    // from the looked-up publication's own `contentReference.hash`, per
    // this class's own header. Throws if `publicationId` names no
    // publication this replica knows about, if nobody is signed in, or
    // if the identityProvider lacks the 0.2.16 cryptographic surface.
    // Returns the cataloged PublicationAnchor.
    execute(publicationId, { anchorType, locator, proof = null, anchoredAt = new Date() } = {}) {
        const publication = this._publicationCatalog.get(publicationId);
        if (!publication) {
            throw new Error(`CreatePublicationAnchorUseCase: publication ${publicationId} not found`);
        }
        const contentHash = publication.contentReference.hash;

        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('CreatePublicationAnchorUseCase: sign in to create a publication anchor');
        }
        if (typeof this._identityProvider.signCanonical !== 'function') {
            throw new Error('CreatePublicationAnchorUseCase: this identity provider cannot sign a publication anchor');
        }

        let anchor = new PublicationAnchor({
            publicationId,
            contentHash,
            anchorType,
            locator,
            proof,
            anchoredAt,
            anchorIdentity: this._identityProvider.getSigningIdentity().toJSON()
        });
        anchor = anchor.withSignature(this._identityProvider.signCanonical(anchor.getSigningDescriptor()));

        // Verify our own output before it ever reaches the catalog — the
        // same "never persist what wouldn't survive verification"
        // discipline application/BlueprintAttributionUseCase.js#publish()
        // already applies. A failure here means the identityProvider and
        // verifier disagree about the signing domain/algorithm, never a
        // normal runtime outcome, and never a judgment about the
        // supplied proof, which this method never inspects at all.
        const result = this._verifier.verifyPublicationAnchor(anchor.toJSON());
        if (!result.valid) {
            throw new Error(`CreatePublicationAnchorUseCase: refusing to create an unverifiable anchor — ${result.reason}`);
        }

        const { anchor: cataloged } = this._anchorCatalog.add(anchor);
        return cataloged;
    }
}
