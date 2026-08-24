import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { validateDecentralizedPublication } from './DecentralizedPublicationValidator.js';
import { PublicationResolutionOutcome } from './PublicationResolutionOutcome.js';

// 0.7.0 — Decentralized Publication Protocol & Content Addressing.
// 0.7.1 — IPFS Content Publication & Resolution.
//
// The one place this codebase publishes or resolves a
// core/DecentralizedPublication.js envelope. Every exchange class built
// since 0.5.3 (application/PlaceNamingClaimExchange.js,
// application/BlueprintAttributionExchange.js,
// application/BlueprintLineageExchange.js) already follows the same
// import discipline, but each hard-codes it for exactly one domain type
// and moves bytes over exactly one transport (a peer, a pasted file). A
// PublicationResolver is the protocol-neutral generalization: it moves
// ANY signed content through ANY content/ContentStore.js backend —
// content/LocalContentStore.js today, content/IpfsContentStore.js as of
// this milestone — without importing a single domain module
// (BlueprintAttribution, PlaceNamingClaim, ...) and without importing
// content/IpfsContentStore.js either. It knows about envelopes and
// content addressing; it has no idea what a "blueprint" is, and no idea
// what IPFS is.
//
// That first kind of knowledge is supplied per call as a `kindPlugin`:
//
//   { contentKind, validate(json), fromJSON(json), verify(json),
//     crossCheck(content)?, store(content)? }
//
// so a caller resolving a BlueprintAttribution hands in exactly the
// validator/constructor/verifier that domain already built (application/
// BlueprintAttributionPublicationValidator.js, core/
// BlueprintAttribution.js#fromJSON, identity/
// LocalAuthorizationVerifier.js#verifyBlueprintAttribution) — nothing
// here is reimplemented, only re-sequenced behind one transport-neutral
// pipeline. application/BlueprintAttributionPublicationKind.js and
// application/PlaceNamingClaimPublicationKind.js are the two concrete
// plugins this codebase ships, over two domains whose OWN wire shapes
// disagree (one self-describing, one wrapped in a separate envelope
// module) — proof the pipeline itself cares about neither.
//
// The second kind of knowledge — how bytes actually move — is supplied
// at construction as a `contentStore`, and 0.7.1 is the milestone that
// stops that store from being guaranteed instantaneous.
// content/LocalContentStore.js's own put()/get() are synchronous — a
// local read either finds bytes or it doesn't, right now, forever.
// content/IpfsContentStore.js's are not: a real network call can be
// slow, can time out, can simply fail. `publish()`/`resolve()` are
// therefore both `async` — `await`ing a plain synchronous return value
// (what content/LocalContentStore.js still gives back) is a same-tick
// no-op, so nothing about the 0.7.0 LocalContentStore path actually
// changes behavior; a network-backed store now has somewhere to
// legitimately take its time.
//
// The discipline never changes, and never skips a step:
//
//   1. validate envelope   — is this even a well-formed
//                             DecentralizedPublication?
//   2. construct envelope  — a real instance, never trusted as-is
//   3. verify envelope     — did the claimed publisher really sign
//                             exactly this ContentReference/contentKind?
//   4. retrieve bytes      — from this replica's own ContentStore, by
//                             the envelope's OWN contentReference
//   5. verify bytes        — do the retrieved bytes actually hash to
//                             what the envelope claims?
//   6. validate content    — is the wrapped payload well-formed for its
//                             own contentKind?
//   7. construct content   — a real domain object, never trusted as-is
//   8. verify content      — does the WRAPPED object's own signature
//                             (never the envelope's) check out?
//   9. cross-check content — OPTIONAL, domain-specific (e.g. "does this
//                             fingerprint match what's already local?")
//  10. store content       — OPTIONAL, only after every prior step
//                             succeeded
//
// Never: retrieve -> trust. A publication that fails any step is
// rejected with a specific reason; nothing is stored on partial success.
//
// resolve() never throws for a data problem — it returns
// `{ outcome, content, publication, reason }`, `outcome` always one of
// application/PublicationResolutionOutcome.js's own values. 0.7.0 shipped
// a throw-per-step version of this same pipeline; that was adequate as
// long as failure only ever meant "this publication is bad." Once step 4
// can fail because a network-backed ContentStore genuinely could not
// reach the content right now — not because anything about the
// publication is wrong — "bad" and "not available yet" are two different
// facts a caller needs to be able to tell apart programmatically, the
// same reasoning identity/LocalAuthorizationVerifier.js's own
// `{ valid, signed, reason }` results have followed since 0.2.16, applied
// here to a second, genuinely new dimension: availability. resolve()
// still throws, but only for a contract violation by the CALLER (a
// missing or malformed kindPlugin) — never for anything about the
// publication or the network.
//
// This class never decides what a resolved object MEANS, never ranks
// competing publications, and never fetches from a network by itself —
// content/ContentStore.js already owns "how do bytes actually move,"
// exactly the separation content/ContentStore.js's own header draws
// between itself and StorageProvider.
export class PublicationResolver {
    constructor(contentStore, verifier) {
        if (!contentStore) {
            throw new Error('PublicationResolver: a ContentStore is required');
        }
        if (!verifier) {
            throw new Error('PublicationResolver: an authorization verifier is required');
        }
        this._contentStore = contentStore;
        this._verifier = verifier;
    }

    // Serializes `content` (an instance with toJSON(), or a plain
    // object), stores its canonical bytes in the ContentStore, and
    // returns a freshly signed DecentralizedPublication wrapping the
    // resulting ContentReference. Signing is REQUIRED — a
    // DecentralizedPublication has no unsigned path, the same posture
    // core/DecentralizedPublication.js's own header describes, so an
    // identityProvider that cannot sign fails loudly here rather than
    // producing an envelope nobody could ever trust. Still throws on
    // failure, unlike resolve() below: publishing has no "unavailable"
    // dimension of its own to distinguish — a store that cannot be
    // written to right now is simply a failed publish, for the caller to
    // retry.
    async publish({ content, contentKind, contentSchemaVersion = 1, identityProvider }) {
        if (!content) {
            throw new Error('PublicationResolver: content is required');
        }
        if (!identityProvider
            || typeof identityProvider.signCanonical !== 'function'
            || typeof identityProvider.getSigningIdentity !== 'function') {
            throw new Error('PublicationResolver: publishing requires a cryptographic identityProvider');
        }

        const json = typeof content.toJSON === 'function' ? content.toJSON() : content;
        const bytes = JSON.stringify(json);
        const contentReference = await this._contentStore.put(bytes);

        const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
        let publication = new DecentralizedPublication({
            contentKind,
            contentSchemaVersion,
            contentReference,
            publisherIdentity
        });
        const signature = identityProvider.signCanonical(publication.getSigningDescriptor());
        publication = publication.withSignature(signature);
        return publication;
    }

    // Runs the full ten-step discipline described in this class's own
    // header and resolves to `{ outcome, content, publication, reason }`
    // — see application/PublicationResolutionOutcome.js for every value
    // `outcome` can take and what each one means. `content` is set only
    // when `outcome === RESOLVED`: whatever `kindPlugin.store()` returned
    // (or, if no `store` was supplied, the freshly constructed content
    // object). `publication` is the constructed DecentralizedPublication
    // once the envelope itself parsed, even on later failure, so a
    // caller can log or retry against a specific contentReference.
    // `reason` is a human-readable string on any non-RESOLVED outcome.
    //
    // Never partially resolves, never stores on a failed check. Throws
    // only for a contract violation by the CALLER — a missing or
    // malformed kindPlugin — never for anything about the publication
    // itself or the network.
    async resolve(publicationJson, kindPlugin) {
        if (!kindPlugin || !kindPlugin.contentKind || typeof kindPlugin.validate !== 'function'
            || typeof kindPlugin.fromJSON !== 'function' || typeof kindPlugin.verify !== 'function') {
            throw new Error('PublicationResolver: a kindPlugin with contentKind/validate/fromJSON/verify is required');
        }

        // 1-2. validate + construct the envelope.
        let publication;
        try {
            validateDecentralizedPublication(publicationJson);
            publication = DecentralizedPublication.fromJSON(publicationJson);
        } catch (error) {
            return this._failure(PublicationResolutionOutcome.INVALID_ENVELOPE, error.message);
        }

        if (publication.contentKind !== kindPlugin.contentKind) {
            return this._failure(
                PublicationResolutionOutcome.INVALID_ENVELOPE,
                `expected contentKind "${kindPlugin.contentKind}", got "${publication.contentKind}"`,
                publication
            );
        }

        // 3. verify the envelope's own signature.
        const envelopeResult = this._verifier.verifyDecentralizedPublication(publicationJson);
        if (!envelopeResult.valid) {
            return this._failure(PublicationResolutionOutcome.INVALID_PUBLICATION_SIGNATURE, envelopeResult.reason, publication);
        }

        // 4. retrieve the referenced bytes. A ContentStore may THROW (a
        // network-backed store signaling it could not reach the content)
        // or simply return nothing; both mean the identical thing from a
        // caller's perspective — CONTENT_UNAVAILABLE, never a verdict
        // about the publication itself.
        let bytes;
        try {
            bytes = await this._contentStore.get(publication.contentReference);
        } catch (error) {
            return this._failure(PublicationResolutionOutcome.CONTENT_UNAVAILABLE, error.message, publication);
        }
        if (bytes === null || bytes === undefined) {
            return this._failure(PublicationResolutionOutcome.CONTENT_UNAVAILABLE, 'the referenced content is not available in this ContentStore', publication);
        }

        // 5. verify the retrieved bytes actually match what was signed.
        if (!publication.contentReference.verify(bytes)) {
            return this._failure(PublicationResolutionOutcome.CONTENT_HASH_MISMATCH, 'retrieved content does not match its own content reference', publication);
        }

        let contentJson;
        try {
            contentJson = JSON.parse(bytes);
        } catch (error) {
            return this._failure(PublicationResolutionOutcome.INVALID_CONTENT, `retrieved content is not valid JSON — ${error.message}`, publication);
        }

        // 6-7. validate + construct the wrapped content.
        let content;
        try {
            kindPlugin.validate(contentJson);
            content = kindPlugin.fromJSON(contentJson);
        } catch (error) {
            return this._failure(PublicationResolutionOutcome.INVALID_CONTENT, error.message, publication);
        }

        // 8. verify the wrapped content's OWN signature — never the
        // envelope's, which only ever proves who published the locator.
        const contentResult = kindPlugin.verify(contentJson);
        if (!contentResult.valid) {
            return this._failure(PublicationResolutionOutcome.INVALID_CONTENT_SIGNATURE, contentResult.reason, publication);
        }

        // 9. optional domain-specific cross-check.
        if (typeof kindPlugin.crossCheck === 'function') {
            try {
                kindPlugin.crossCheck(content);
            } catch (error) {
                return this._failure(PublicationResolutionOutcome.DOMAIN_CROSS_CHECK_FAILED, error.message, publication);
            }
        }

        // 10. optional persistence.
        const resolvedContent = typeof kindPlugin.store === 'function' ? kindPlugin.store(content) : content;
        return { outcome: PublicationResolutionOutcome.RESOLVED, content: resolvedContent, publication, reason: null };
    }

    _failure(outcome, reason, publication = null) {
        return { outcome, content: null, publication, reason };
    }
}
