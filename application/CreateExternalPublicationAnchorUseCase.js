import { ExternalAnchorCreationOutcome } from './ExternalAnchorCreationOutcome.js';

// 0.8.10 — External Anchor Creation Orchestration & Publisher Registry.
//
// 0.8.8 gave this codebase a way to CREATE a signed anchor claim from
// evidence parameters already in hand. 0.8.9 gave it a way to OBTAIN
// those evidence parameters from Bitcoin specifically. Nothing yet
// connected the two — a caller had to look up a publication, derive its
// contentHash, call `anchoring/BitcoinAnchorPublisher.js#publish()`
// itself, and then feed the result into `application/
// CreatePublicationAnchorUseCase.js#execute()` by hand. This class is
// that missing connective tissue, and nothing more:
//
//   publicationId, anchorType
//         │
//         ▼
//   CreateExternalPublicationAnchorUseCase.execute()   (THIS FILE)
//         │
//         ├── publication lookup           — publicationCatalog
//         ├── publisher selection          — ExternalAnchorPublisherRegistry
//         ├── contentHash derivation       — publication's OWN
//         │                                  contentReference.hash,
//         │                                  never a caller-supplied one
//         ├── publisher.publish(contentHash)
//         └── CreatePublicationAnchorUseCase.execute(...)   (0.8.8, UNCHANGED)
//                   │
//                   ▼
//            signed, cataloged PublicationAnchor
//
// REUSES 0.8.8; NEVER RE-IMPLEMENTS IT. This class never constructs a
// `core/PublicationAnchor.js` itself, never signs anything, and never
// touches an anchor catalog directly — every one of those responsibilities
// stays exactly where 0.8.8 already put them. See tests/
// ExternalAnchorCreationOrchestration.test.js's own spy-use-case section,
// which proves this class delegates to a real `CreatePublicationAnchorUseCase`
// rather than manufacturing an anchor by hand.
//
// PUBLISHER FAILURE PREVENTS ANCHOR CREATION. A publisher that reaches a
// definite rejection, or cannot presently tell whether it published,
// never reaches `CreatePublicationAnchorUseCase` at all — see application/
// ExternalAnchorCreationOutcome.js's own header for why. ForkBuild is
// deliberately claiming that an external recording operation it just
// requested succeeded; if that operation never happened, creating a
// corresponding claim would misrepresent it.
//
// NO AUTOMATIC RETRY. `publisher.publish()` is called exactly once per
// `execute()` call. A caller that gets back PUBLISH_UNAVAILABLE decides
// for itself whether and when to call `execute()` again — this class
// never loops, backs off, or retries on the caller's behalf, keeping the
// external side effect fully visible to whoever triggered it.
//
// NO DEDUPLICATION, NO "ALREADY ANCHORED" CHECK. A publication anchored
// twice on the same anchorType produces two independent, equally valid
// PublicationAnchor records — two separate external recording operations
// really did happen. This class never inspects the anchor catalog for an
// existing anchor before publishing, and never refuses to create a
// second one; application/LocalPublicationAnchorCatalog.js's own id-based
// dedup remains the only place duplicate ENVELOPES (not duplicate
// evidence) are ever collapsed.
//
// NO "PREFERRED" ANCHOR TYPE. `anchorType` is always supplied by the
// caller, explicitly. This class never falls back from one anchorType to
// another, never ranks registered publishers, and never picks one on the
// caller's behalf — the identical restraint application/
// ExternalProofVerifierRegistry.js already holds on the verification
// side, held here for creation.
//
// See docs/Principles.md, "A Publisher's Failure Is Not the
// Orchestration's Failure — But It Is Still No Anchor (0.8.10)."
export class CreateExternalPublicationAnchorUseCase {
    constructor(publicationCatalog, publisherRegistry, createPublicationAnchorUseCase) {
        if (!publicationCatalog) {
            throw new Error('CreateExternalPublicationAnchorUseCase: a publication catalog is required');
        }
        if (!publisherRegistry || typeof publisherRegistry.get !== 'function') {
            throw new Error('CreateExternalPublicationAnchorUseCase: a publisher registry is required');
        }
        if (!createPublicationAnchorUseCase || typeof createPublicationAnchorUseCase.execute !== 'function') {
            throw new Error('CreateExternalPublicationAnchorUseCase: a CreatePublicationAnchorUseCase is required');
        }
        this._publicationCatalog = publicationCatalog;
        this._publisherRegistry = publisherRegistry;
        this._createPublicationAnchorUseCase = createPublicationAnchorUseCase;
    }

    // Resolves to `{ outcome, anchor, reason }` — `outcome` always one of
    // application/ExternalAnchorCreationOutcome.js's own values, `anchor`
    // the cataloged PublicationAnchor on CREATED and null otherwise,
    // `reason` a human-readable string on any outcome other than CREATED.
    //
    // Throws (never returns an outcome) only for a contract violation by
    // the caller: an unknown `publicationId`, or an `anchorType` with no
    // registered publisher — the identical "unknown identifier" refusal
    // application/CreatePublicationAnchorUseCase.js already gives for an
    // unknown publicationId, applied here to anchorType as well, since
    // neither has a degraded-but-honest outcome to report. Everything
    // downstream of a real publisher actually being consulted — rejection,
    // unavailability, or a failure inside `createPublicationAnchorUseCase`
    // itself (e.g. nobody signed in) — is never caught or reinterpreted
    // here; a publisher-level failure returns an outcome, while a signing
    // failure propagates exactly as 0.8.8 already throws it.
    async execute(publicationId, anchorType) {
        if (typeof anchorType !== 'string' || !anchorType.trim()) {
            throw new Error('CreateExternalPublicationAnchorUseCase: anchorType is required');
        }

        const publication = this._publicationCatalog.get(publicationId);
        if (!publication) {
            throw new Error(`CreateExternalPublicationAnchorUseCase: publication ${publicationId} not found`);
        }

        const publisher = this._publisherRegistry.get(anchorType);
        if (!publisher) {
            throw new Error(`CreateExternalPublicationAnchorUseCase: no publisher registered for anchorType '${anchorType}'`);
        }

        // The publication's OWN contentReference.hash, never anything a
        // caller could supply — execute() takes no contentHash parameter
        // at all. application/CreatePublicationAnchorUseCase.js re-derives
        // this identical value from the same publication a moment later;
        // both derivations read the same field on the same record, so
        // the publisher and the eventual signed anchor are always bound
        // to the same bytes.
        const contentHash = publication.contentReference.hash;

        let evidence;
        try {
            evidence = await publisher.publish(contentHash);
        } catch (error) {
            return this._failure(ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE, error.message);
        }

        if (!evidence || evidence.published !== true) {
            const outcome = (evidence && evidence.unavailable)
                ? ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE
                : ExternalAnchorCreationOutcome.PUBLISH_REJECTED;
            return this._failure(outcome, (evidence && evidence.reason) || 'publisher declined to publish this content hash');
        }

        // Only what the publisher itself reported — never a manufactured
        // `anchoredAt` (see anchoring/BitcoinAnchorPublisher.js's own
        // header on why it never returns one). CreatePublicationAnchorUseCase's
        // own "defaults to now" behavior applies unchanged.
        const anchor = this._createPublicationAnchorUseCase.execute(publicationId, {
            anchorType: publisher.anchorType,
            locator: evidence.locator,
            proof: evidence.proof
        });

        return { outcome: ExternalAnchorCreationOutcome.CREATED, anchor, reason: null };
    }

    _failure(outcome, reason) {
        return { outcome, anchor: null, reason };
    }
}
