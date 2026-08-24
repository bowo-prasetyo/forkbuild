import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { validateDecentralizedPublication } from './DecentralizedPublicationValidator.js';

// 0.7.0 — Decentralized Publication Protocol & Content Addressing.
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
// local today, IPFS/Arweave/HTTP once those ship their own ContentStore
// subclasses (content/ContentStore.js's own header already names them) —
// without importing a single domain module (BlueprintAttribution,
// PlaceNamingClaim, ...) itself. It knows about envelopes and content
// addressing; it has no idea what a "blueprint" or a "place name" is.
//
// That knowledge is supplied per call as a `kindPlugin`:
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
// pipeline.
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
    // producing an envelope nobody could ever trust.
    publish({ content, contentKind, contentSchemaVersion = 1, identityProvider }) {
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
        const contentReference = this._contentStore.put(bytes);

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
    // header and returns whatever `kindPlugin.store()` returned (or, if
    // no `store` was supplied, the freshly constructed content object).
    // Throws a specific, step-labeled error the moment any step fails —
    // never partially resolves, never stores on a failed check.
    resolve(publicationJson, kindPlugin) {
        if (!kindPlugin || !kindPlugin.contentKind || typeof kindPlugin.validate !== 'function'
            || typeof kindPlugin.fromJSON !== 'function' || typeof kindPlugin.verify !== 'function') {
            throw new Error('PublicationResolver: a kindPlugin with contentKind/validate/fromJSON/verify is required');
        }

        // 1-2. validate + construct the envelope.
        validateDecentralizedPublication(publicationJson);
        const publication = DecentralizedPublication.fromJSON(publicationJson);

        if (publication.contentKind !== kindPlugin.contentKind) {
            throw new Error(
                `PublicationResolver: refusing to resolve a "${publication.contentKind}" publication as `
                + `"${kindPlugin.contentKind}" — the caller asked for the wrong kind`
            );
        }

        // 3. verify the envelope's own signature.
        const envelopeResult = this._verifier.verifyDecentralizedPublication(publicationJson);
        if (!envelopeResult.valid) {
            throw new Error(`PublicationResolver: refusing to resolve an unverifiable publication — ${envelopeResult.reason}`);
        }

        // 4. retrieve the referenced bytes from this replica's own store.
        const bytes = this._contentStore.get(publication.contentReference);
        if (bytes === null || bytes === undefined) {
            throw new Error('PublicationResolver: the referenced content is not available in this ContentStore');
        }

        // 5. verify the retrieved bytes actually match what was signed.
        if (!publication.contentReference.verify(bytes)) {
            throw new Error('PublicationResolver: retrieved content does not match its own content reference — refusing to trust it');
        }

        const contentJson = JSON.parse(bytes);

        // 6-7. validate + construct the wrapped content.
        kindPlugin.validate(contentJson);
        const content = kindPlugin.fromJSON(contentJson);

        // 8. verify the wrapped content's OWN signature — never the
        // envelope's, which only ever proves who published the locator.
        const contentResult = kindPlugin.verify(contentJson);
        if (!contentResult.valid) {
            throw new Error(`PublicationResolver: refusing to resolve unverifiable content — ${contentResult.reason}`);
        }

        // 9. optional domain-specific cross-check.
        if (typeof kindPlugin.crossCheck === 'function') {
            kindPlugin.crossCheck(content);
        }

        // 10. optional persistence.
        if (typeof kindPlugin.store === 'function') {
            return kindPlugin.store(content);
        }
        return content;
    }
}
