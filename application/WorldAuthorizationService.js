import { WorldAccessLevel } from '../core/WorldAccessLevel.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';

// 0.2.95 — World Editing Authorization Foundation.
//
// Answers exactly one question, for exactly one Document: given who is
// looking right now, what WorldAccessLevel do they hold? Nothing in
// this class ever mutates a Document, a World, a Placement, or any
// identity/device state — it is a pure decision service, consulted by
// callers that already have the mutation pathway (application/
// WorldNavigationSession.js, application/SpatialEditingService.js) and
// need to know whether to USE it. See docs/Principles.md, "World
// Mutation Requires Explicit Document Editing Authority (0.2.95)."
//
// The architectural rule this class exists to enforce, stated once
// here rather than at every call site:
//
//   UI -> UseCase -> Authorization -> Command -> Document
//
// never
//
//   UI -> "if owner then enable button" -> World mutation
//
// A caller may absolutely use resolveAccess()/canEdit() to decide
// whether to SHOW an edit affordance — that's fine, expected, even
// necessary for a good UI. What this class refuses to be is the ONLY
// place that decision is made: every mutation entry point this
// milestone wires (SpatialEditingService's own gesture/layout/delete
// chokepoints) re-consults the SAME service directly, so a caller that
// bypasses the UI entirely and calls the application layer straight
// gets exactly the same answer a button click would have.
//
// Ownership resolution, in order of strength:
//   1. Cryptographic: `document.metadata.authorIdentityId` (a did:key,
//      set at document-creation time — see core/DocumentMetadata.js's
//      own 0.2.95 comment) compared against the VIEWER's own resolved
//      identityId. This is the only comparison that survives two
//      different people typing the same display name, and the only
//      one that understands device authorization (see below).
//   2. Legacy label: when either side has no authorIdentityId (a
//      pre-0.2.95 document, or a provider with no crypto surface),
//      degrades to comparing `document.metadata.author` against the
//      viewer's own `currentUser().username` — the exact comparison
//      that was implicitly, silently true for every single-user local
//      deployment before this milestone ever existed. Never a security
//      boundary on its own; a courtesy default so an old document
//      doesn't suddenly become uneditable by the very person who made
//      it, matching 0.2.34's "validate strictly on write, degrade
//      gracefully on read."
//
// Multi-device resolution: `resolveSocialIdentity`, when supplied, is
// called with zero arguments and expected to return the SAME shape
// application/DeviceAuthorizationPropagationUseCase.js#
// resolveOwnSocialIdentity() already does — `{ identityId, mode,
// deviceIdentityId } | null` — DIRECT when this device is not a
// currently-authorized device of anyone else, DEVICE when it is. This
// class never re-implements that resolution; it only ever asks the
// question and reads `identityId` off the answer, so a device whose
// authorization has since been REVOKED automatically stops resolving
// to its parent's identityId (resolveOwnSocialIdentity() itself falls
// back to DIRECT the moment the grant is gone — see that method's own
// header) and therefore automatically loses EDIT on documents that
// parent owns, with zero code in this class aware that revocation
// happened at all. See docs/Roadmap.md, 0.2.95, "Alice Laptop ->
// authorized device -> EDIT; Alice Phone -> device authorization
// revoked -> no EDIT."
//
// Blocking: `isBlocked`, when supplied, is the SAME `(identityId) =>
// boolean` predicate shape every other trust boundary in this codebase
// already consults (application/PresenceTrustBoundary.js,
// application/AvatarProfileTrustBoundary.js,
// application/AvatarInteractionTrustBoundary.js,
// application/WorldNavigationSession.js's own `_isBlocked` —
// application/CreateWorldViewUseCase.js already derives it from
// application/PeerBlockUseCase.js for those). Deliberately checked
// FIRST, before ownership: a blocked identity gets NONE even for a
// World it happens to own, the same conservative "block wins" posture
// every other trust boundary in this codebase already takes — though
// in practice nobody blocks themselves, so this rarely fires for an
// owner in honest operation.
export class WorldAuthorizationService {
    constructor({ identityProvider = null, resolveSocialIdentity = null, isBlocked = null } = {}) {
        this._identityProvider = identityProvider;
        this._resolveSocialIdentity = resolveSocialIdentity;
        this._isBlocked = isBlocked;
    }

    // Document | null -> WorldAccessLevel. Never throws — an absent
    // Document, an absent viewer, an absent collaborator all degrade to
    // the most conservative answer they can (NONE for no document, READ
    // for an unresolvable-but-not-blocked viewer), exactly the
    // graceful-absence posture every optional collaborator in this
    // codebase already follows.
    resolveAccess(document) {
        if (!document || !document.metadata) {
            return WorldAccessLevel.NONE;
        }
        const viewer = this._resolveViewer();
        if (viewer.identityId && this._isBlocked && this._isBlocked(viewer.identityId)) {
            return WorldAccessLevel.NONE;
        }
        return this._isOwner(document, viewer) ? WorldAccessLevel.EDIT : WorldAccessLevel.READ;
    }

    // Convenience booleans — the shape SpatialEditingService/
    // WorldNavigationSession actually consult at each mutation
    // chokepoint, never re-deriving the ordering resolveAccess() above
    // already settled.
    canRead(document) {
        return this.resolveAccess(document) !== WorldAccessLevel.NONE;
    }

    canEdit(document) {
        return this.resolveAccess(document) === WorldAccessLevel.EDIT;
    }

    // "Given who is looking right now" — resolved FRESH on every call,
    // never cached, so a revoked device or a newly-applied block is
    // reflected the very next time access is asked, exactly the
    // freshness discipline application/DeviceAuthorizationPropagationUseCase.js#
    // resolveOwnSocialIdentity() itself already documents.
    _resolveViewer() {
        let identityId = null;
        if (typeof this._resolveSocialIdentity === 'function') {
            const resolved = this._resolveSocialIdentity();
            identityId = resolved ? resolved.identityId : null;
        }
        if (!identityId) {
            identityId = resolveSigningIdentityId(this._identityProvider);
        }
        const currentUser = this._identityProvider && typeof this._identityProvider.currentUser === 'function'
            ? this._identityProvider.currentUser()
            : null;
        return {
            identityId,
            username: currentUser ? currentUser.username : null
        };
    }

    _isOwner(document, viewer) {
        const ownerIdentityId = document.metadata.authorIdentityId || null;
        if (ownerIdentityId && viewer.identityId) {
            return ownerIdentityId === viewer.identityId;
        }
        // Degrade to the legacy label comparison ONLY when the strong
        // comparison couldn't be made at all (either side has no
        // identityId) — never as a fallback when the strong comparison
        // was made and failed. See this file's own header.
        const ownerUsername = document.metadata.author || null;
        return Boolean(ownerUsername) && Boolean(viewer.username) && ownerUsername === viewer.username;
    }
}
