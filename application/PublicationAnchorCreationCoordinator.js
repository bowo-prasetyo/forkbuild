// 0.8.11 — Explicit External Anchoring UX.
//
// application/PublicationEvidenceCoordinator.js (0.8.3) sequences the
// two READ-side questions the Publication Center asks about evidence —
// "what's known" (discover) and "does it hold up" (verify). This class
// is the third, symmetric question a person can now ask explicitly from
// the same page — "go create some" — and nothing more:
//
//   availableAnchorTypes()          — which anchorTypes this replica can
//                                      currently ask to record evidence
//                                      for at all (a synchronous,
//                                      side-effect-free registry read)
//   create(publicationId, anchorType) — trigger exactly ONE external
//                                      recording attempt, for exactly
//                                      the anchorType the caller named
//
// A DELIBERATELY THIN PASS-THROUGH, NOT A SECOND ORCHESTRATOR. This
// class never selects an anchorType, never retries, never verifies,
// never modifies application/LocalPublicationAnchorCatalog.js directly,
// never interprets a Bitcoin transaction, and never ranks existing
// anchors — every one of those responsibilities already lives exactly
// where 0.8.8/0.8.9/0.8.10 put them (application/
// CreatePublicationAnchorUseCase.js, anchoring/BitcoinAnchorPublisher.js,
// application/CreateExternalPublicationAnchorUseCase.js). `create()`
// forwards to application/CreateExternalPublicationAnchorUseCase.js#
// execute() unchanged and returns its `{ outcome, anchor, reason }'
// exactly as received — never reinterpreted, never caught, never turned
// into a different shape. A caller wanting a display-ready shape uses
// application/PublicationAnchorCreationView.js#describeCreationAttempt()
// separately, exactly as application/PublicationEvidenceCoordinator.js's
// own `verify()` stays separate from application/
// PublicationEvidenceView.js's own display derivation.
//
// A SIGNING FAILURE (nobody signed in) is a genuine caller contract
// violation `application/CreateExternalPublicationAnchorUseCase.js`
// itself declines to catch (see that file's own header) — this class
// does not catch it either. It is ui/views/DecentralizedPublicationsView
// .js's own job, as the UI layer, to wrap a `create()` call in a
// try/catch and turn that specific failure into its own honest display
// state — see application/PublicationAnchorCreationView.js's own header
// on why that reads to a person exactly like PUBLISH_UNAVAILABLE:
// nothing external was ever attempted either way.
//
// availableAnchorTypes() IS WHAT KEEPS THE UI FROM EVER OFFERING AN
// ANCHOR TYPE NOBODY CAN ACTUALLY CREATE. `create()` throws for an
// anchorType with no registered publisher — a genuine contract
// violation, not a degraded-but-honest outcome (see application/
// CreateExternalPublicationAnchorUseCase.js's own header) — so a caller
// is expected to only ever offer an anchorType this method actually
// lists, exactly the same discipline this milestone's own UI already
// holds for "Retrieve from Peers" only appearing once a candidate peer
// exists (see ui/views/DecentralizedPublicationsView.js, 0.7.6).
export class PublicationAnchorCreationCoordinator {
    constructor(createExternalPublicationAnchorUseCase, publisherRegistry) {
        if (!createExternalPublicationAnchorUseCase || typeof createExternalPublicationAnchorUseCase.execute !== 'function') {
            throw new Error('PublicationAnchorCreationCoordinator: a CreateExternalPublicationAnchorUseCase is required');
        }
        if (!publisherRegistry || typeof publisherRegistry.get !== 'function' || !Array.isArray(publisherRegistry.anchorTypes)) {
            throw new Error('PublicationAnchorCreationCoordinator: an ExternalAnchorPublisherRegistry is required');
        }
        this._createExternalPublicationAnchorUseCase = createExternalPublicationAnchorUseCase;
        this._publisherRegistry = publisherRegistry;
    }

    // Every anchorType this replica currently has a registered publisher
    // for, in the registry's own order — never ranked, never narrowed to
    // a "preferred" or "default" one. Empty is a perfectly ordinary
    // result (no publisher configured on this device yet); it is never
    // this class's job to explain why, only to report it.
    availableAnchorTypes() {
        return this._publisherRegistry.anchorTypes;
    }

    // Triggers exactly ONE external recording attempt for `publicationId`
    // /`anchorType`. Resolves to `{ outcome, anchor, reason }` — application/
    // ExternalAnchorCreationOutcome.js's own three values — completely
    // unchanged from what application/
    // CreateExternalPublicationAnchorUseCase.js#execute() returned. Never
    // called automatically by anything in this codebase; always the
    // direct result of one explicit person's click.
    async create(publicationId, anchorType) {
        return this._createExternalPublicationAnchorUseCase.execute(publicationId, anchorType);
    }
}
