import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { ResolvePreferredRoleProviderUseCase } from './ResolvePreferredRoleProviderUseCase.js';
import { RoleProviderResolutionStatus } from './RoleAwareProviderResolver.js';

// Preferred Proof & Anchoring Provider Creation Integration.
//
// The PROOF_AND_ANCHORING mirror of application/
// PreferredSnapshotPlacementCreationCoordinator.js (0.9.299) — same shape,
// one role over. That class gave a person a "Use Preferred Provider" one-
// click action for CONTENT placement, wrapping application/
// SnapshotPlacementCreationCoordinator.js with a stored preference; this
// class does the identical thing for PROOF_AND_ANCHORING, wrapping
// application/PublicationAnchorCreationCoordinator.js (0.8.11) instead:
//
//   createAnchor(entry, anchorType)      (ui/views/
//        │                                DecentralizedPublicationsView.js,
//        │                                UNCHANGED — still always passes
//        │                                an explicit anchorType today)
//        ▼
//   PreferredPublicationAnchorCreationCoordinator.create(publicationId, anchorType)   ★ (THIS)
//        │
//        ├── anchorType present ────────────────────► PublicationAnchorCreationCoordinator.create()
//        │                                              (0.8.11, UNCHANGED)
//        │
//        └── anchorType absent
//                 │
//                 ▼
//        ResolvePreferredRoleProviderUseCase.execute({ role: PROOF_AND_ANCHORING })
//                 │
//                 ├── RESOLVED            ──► PublicationAnchorCreationCoordinator.create(publicationId, providerKey)
//                 ├── NO_PREFERENCE       ──► PublicationAnchorCreationCoordinator.create(publicationId, anchorType)
//                 │                            (anchorType is still absent — the SAME "no publisher
//                 │                             registered for undefined" refusal application/
//                 │                             PublicationAnchorCreationCoordinator.js#create() already
//                 │                             throws today, completely unmodified)
//                 └── PROVIDER_NOT_FOUND  ──► an explicit failure result — never a fallback, never CREATED
//
// AN EXPLICIT CHOICE IS NEVER EVEN ASKED ABOUT. When `anchorType` is a
// non-empty string, this class calls the wrapped coordinator directly and
// returns — `resolvePreferredRoleProviderUseCase` is never touched. A
// stored `PROOF_AND_ANCHORING → arweave` preference can never override one
// explicit per-action "Create Bitcoin Anchor" click.
//
// A PREFERENCE IS NEVER A FALLBACK. PROVIDER_NOT_FOUND — a preference IS
// configured, but names an anchorType this replica has no registered
// publisher for — never substitutes another provider and never silently
// proceeds with no anchorType at all. It is reported back as its own
// distinct outcome (`RoleProviderResolutionStatus.PROVIDER_NOT_FOUND`, the
// identical string application/RoleAwareProviderResolver.js and
// application/ResolvePreferredRoleProviderUseCase.js already use for this
// exact fact), carrying the unresolvable `preference` itself so a caller
// can explain WHAT was configured.
//
// ONLY THE ANCHOR TYPES THE WRAPPED REGISTRY ACTUALLY OFFERS. `create()`
// never anchors onto Base — application/PublicationAnchorCreationCoordinator
// .js's own `availableAnchorTypes()` is a pass-through to whatever
// application/ExternalAnchorPublisherRegistry.js actually has registered,
// and ui/main.js deliberately never registers `baseAnchorPublisher` there
// (see anchoring/BaseAnchorPublisher.js's own header — Base needs an
// already-reviewed transaction plan this one-call-per-anchorType shape has
// no way to supply). A stored PROOF_AND_ANCHORING preference of 'base'
// simply resolves to PROVIDER_NOT_FOUND here, exactly like any other
// unregistered anchorType — Base's own dedicated wallet-guided flow
// elsewhere on the page is untouched by, and has no dependency on, this
// class.
//
// ONLY THE PROOF_AND_ANCHORING ROLE IS EVER READ. `execute({ role:
// RoleProviderRole.PROOF_AND_ANCHORING })` is the one and only call this
// class ever makes to `resolvePreferredRoleProviderUseCase` — a stored
// CONTENT or ANNOUNCEMENT_AND_DISCOVERY preference is never read, never
// consulted, and has no way to reach this class at all.
//
// A DELIBERATELY THIN DECISION LAYER, NOT A SECOND CREATION PIPELINE. This
// class never calls a publisher directly, never signs anything, never
// catalogs an anchor, and never re-implements any part of application/
// CreateExternalPublicationAnchorUseCase.js's own pipeline — every real
// operation still happens exactly once, inside the wrapped application/
// PublicationAnchorCreationCoordinator.js, exactly as before this class
// existed.
export class PreferredPublicationAnchorCreationCoordinator {
    // `publicationAnchorCreationCoordinator` — a PublicationAnchorCreationCoordinator
    // (0.8.11); consulted via `create(publicationId, anchorType)` and
    // `availableAnchorTypes()` only, never re-implemented.
    // `resolvePreferredRoleProviderUseCase` — a
    // ResolvePreferredRoleProviderUseCase (0.9.297); consulted via
    // `execute({ role: PROOF_AND_ANCHORING })` only, and only when
    // `anchorType` is absent.
    constructor(publicationAnchorCreationCoordinator, resolvePreferredRoleProviderUseCase) {
        if (!publicationAnchorCreationCoordinator || typeof publicationAnchorCreationCoordinator.create !== 'function'
            || typeof publicationAnchorCreationCoordinator.availableAnchorTypes !== 'function') {
            throw new Error('PreferredPublicationAnchorCreationCoordinator: a PublicationAnchorCreationCoordinator is required');
        }
        if (!(resolvePreferredRoleProviderUseCase instanceof ResolvePreferredRoleProviderUseCase)) {
            throw new Error('PreferredPublicationAnchorCreationCoordinator: a ResolvePreferredRoleProviderUseCase is required');
        }
        this._coordinator = publicationAnchorCreationCoordinator;
        this._resolvePreferredRoleProviderUseCase = resolvePreferredRoleProviderUseCase;
    }

    // Unchanged pass-through — see application/
    // PublicationAnchorCreationCoordinator.js's own header for why this is
    // what keeps a caller from ever offering an anchorType nobody can
    // actually anchor onto.
    availableAnchorTypes() {
        return this._coordinator.availableAnchorTypes();
    }

    // Resolves to exactly what the wrapped coordinator's own `create()`
    // resolves to (`{ outcome, anchor, reason }`) on every path except
    // PROVIDER_NOT_FOUND, where it resolves to `{ outcome:
    // RoleProviderResolutionStatus.PROVIDER_NOT_FOUND, anchor: null,
    // reason, preference }` instead — never CREATED, never a fabricated
    // anchor. `anchorType` is OPTIONAL here (the one contract change from
    // the class it wraps) — omitting it, or passing null/''/whitespace, is
    // what triggers preference resolution; every other value is forwarded
    // completely unchanged.
    async create(publicationId, anchorType = null) {
        if (typeof anchorType === 'string' && anchorType.trim()) {
            return this._coordinator.create(publicationId, anchorType);
        }

        const decision = this._resolvePreferredRoleProviderUseCase.execute({ role: RoleProviderRole.PROOF_AND_ANCHORING });

        if (decision.status === RoleProviderResolutionStatus.PROVIDER_NOT_FOUND) {
            return {
                outcome: RoleProviderResolutionStatus.PROVIDER_NOT_FOUND,
                anchor: null,
                reason: `Proof/Anchoring preference names anchorType '${decision.preference.providerKey}', but no publisher is registered for it`,
                preference: decision.preference
            };
        }

        // RESOLVED — use the preferred provider's own anchorType key.
        // NO_PREFERENCE — nothing configured either; forward the SAME
        // absent `anchorType` so the wrapped coordinator's own pre-existing
        // refusal fires, unmodified.
        const resolvedAnchorType = decision.status === RoleProviderResolutionStatus.RESOLVED
            ? decision.providerKey
            : anchorType;
        return this._coordinator.create(publicationId, resolvedAnchorType);
    }
}
