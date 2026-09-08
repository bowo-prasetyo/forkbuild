import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { ResolvePreferredRoleProviderUseCase } from './ResolvePreferredRoleProviderUseCase.js';
import { RoleProviderResolutionStatus } from './RoleAwareProviderResolver.js';

// 0.9.299 — Content Creation Provider Preference Integration.
//
// 0.9.293-0.9.297 built the full preference chain (RoleProviderPreference
// → RoleProviderPreferenceStore → RoleAwareProviderResolver →
// ResolvePreferredRoleProviderUseCase) and left every link of it
// deliberately unconsumed. 0.9.298's own audit then read every real
// production workflow this codebase has and found exactly one — content
// placement CREATION, ui/views/DecentralizedPublicationsView.js's own
// `createPlacement(entry, storage)` click handler, backed by application/
// SnapshotPlacementCreationCoordinator.js (0.8.25) — where a person
// already explicitly names a `storage` per action, AND real,
// already-registered multi-provider redundancy exists in production
// (`local` + `ipfs`, side by side in ui/main.js). This class is that
// audit's own named "strongest candidate," made real:
//
//   createPlacement(entry, storage)      (ui/views/
//        │                                DecentralizedPublicationsView.js,
//        │                                UNCHANGED — still always passes
//        │                                an explicit storage today)
//        ▼
//   PreferredSnapshotPlacementCreationCoordinator.create(publicationId, storage)   ★ (THIS)
//        │
//        ├── storage present  ──────────────────────► SnapshotPlacementCreationCoordinator.create()
//        │                                              (0.8.25, UNCHANGED)
//        │
//        └── storage absent
//                 │
//                 ▼
//        ResolvePreferredRoleProviderUseCase.execute({ role: CONTENT })   (0.9.297, UNCHANGED)
//                 │
//                 ├── RESOLVED            ──► SnapshotPlacementCreationCoordinator.create(publicationId, providerKey)
//                 ├── NO_PREFERENCE       ──► SnapshotPlacementCreationCoordinator.create(publicationId, storage)
//                 │                            (storage is still absent — the SAME "storage is required" refusal
//                 │                             application/CreateExternalSnapshotPlacementUseCase.js already
//                 │                             throws today, completely unmodified)
//                 └── PROVIDER_NOT_FOUND  ──► an explicit failure result — never a fallback, never CREATED
//
// AN EXPLICIT CHOICE IS NEVER EVEN ASKED ABOUT. When `storage` is a
// non-empty string, this class calls the wrapped coordinator directly and
// returns — `resolvePreferredRoleProviderUseCase` is never touched. A
// stored `CONTENT → arweave` preference can never override one explicit
// per-action "Create Ipfs Placement" click; see this file's own tests,
// Section A.
//
// A PREFERENCE IS NEVER A FALLBACK. PROVIDER_NOT_FOUND — a preference IS
// configured, but names a storage this replica has no registered content
// store for — never substitutes another provider and never silently
// proceeds with no storage at all. It is reported back as its own
// distinct outcome (`RoleProviderResolutionStatus.PROVIDER_NOT_FOUND`,
// the identical string application/RoleAwareProviderResolver.js and
// application/ResolvePreferredRoleProviderUseCase.js already use for this
// exact fact — never a new, competing vocabulary), carrying the
// unresolvable `preference` itself so a caller can explain WHAT was
// configured. See this file's own tests, Section D.
//
// NO_PREFERENCE PRESERVES EXISTING BEHAVIOR, LITERALLY, NOT BY
// RE-IMPLEMENTING IT. Before this milestone, nothing ever called
// `create(publicationId)` with no `storage` at all — every real caller
// always names one. This class does not invent a new meaning for that
// case; when nothing is configured for CONTENT, it forwards the SAME
// absent `storage` value to the wrapped coordinator, which forwards it
// unchanged to application/CreateExternalSnapshotPlacementUseCase.js,
// which throws its own pre-existing "storage is required" error —
// exactly the refusal calling this class with no storage and no
// preference would already produce. See this file's own tests, Section C.
//
// ONLY THE CONTENT ROLE IS EVER READ. `execute({ role:
// RoleProviderRole.CONTENT })` is the one and only call this class ever
// makes to `resolvePreferredRoleProviderUseCase` — a stored
// ANNOUNCEMENT_AND_DISCOVERY or PROOF_AND_ANCHORING preference is never
// read, never consulted, and has no way to reach this class at all. See
// this file's own tests, Section E.
//
// A DELIBERATELY THIN DECISION LAYER, NOT A SECOND CREATION PIPELINE.
// This class never calls `contentStore.put()`, never signs anything,
// never catalogs a placement, and never re-implements any part of
// application/CreateExternalSnapshotPlacementUseCase.js's own pipeline —
// every real operation still happens exactly once, inside the wrapped
// application/SnapshotPlacementCreationCoordinator.js, exactly as before
// this milestone. See this file's own tests, Section G.
//
// PUBLICATION PLACEMENT AND SNAPSHOT PLACEMENT ARE THE SAME SEAM IN THIS
// CODEBASE TODAY. 0.9.298's own audit evidence (ui/main.js registering
// `local`+`ipfs` "for BOTH Publication and Snapshot placement creation")
// describes ONE real production creation pipeline — a Publication's own
// snapshot content, placed onto an external content/ContentStore.js — not
// two independent ones. This class integrates that one real seam; there
// is no second, genuinely distinct "Publication content creation" path
// in production to integrate separately. See this file's own tests,
// Section H/I.
export class PreferredSnapshotPlacementCreationCoordinator {
    // `snapshotPlacementCreationCoordinator` — a SnapshotPlacementCreationCoordinator
    // (0.8.25); consulted via `create(publicationId, storage)` and
    // `availableStorageTypes()` only, never re-implemented.
    // `resolvePreferredRoleProviderUseCase` — a
    // ResolvePreferredRoleProviderUseCase (0.9.297); consulted via
    // `execute({ role: CONTENT })` only, and only when `storage` is
    // absent.
    constructor(snapshotPlacementCreationCoordinator, resolvePreferredRoleProviderUseCase) {
        if (!snapshotPlacementCreationCoordinator || typeof snapshotPlacementCreationCoordinator.create !== 'function'
            || typeof snapshotPlacementCreationCoordinator.availableStorageTypes !== 'function') {
            throw new Error('PreferredSnapshotPlacementCreationCoordinator: a SnapshotPlacementCreationCoordinator is required');
        }
        if (!(resolvePreferredRoleProviderUseCase instanceof ResolvePreferredRoleProviderUseCase)) {
            throw new Error('PreferredSnapshotPlacementCreationCoordinator: a ResolvePreferredRoleProviderUseCase is required');
        }
        this._coordinator = snapshotPlacementCreationCoordinator;
        this._resolvePreferredRoleProviderUseCase = resolvePreferredRoleProviderUseCase;
    }

    // Unchanged pass-through — see application/
    // SnapshotPlacementCreationCoordinator.js's own header for why this
    // is what keeps a caller from ever offering a storage type nobody can
    // actually place onto.
    availableStorageTypes() {
        return this._coordinator.availableStorageTypes();
    }

    // Resolves to exactly what the wrapped coordinator's own `create()`
    // resolves to (`{ outcome, placement, reason }`) on every path except
    // PROVIDER_NOT_FOUND, where it resolves to `{ outcome:
    // RoleProviderResolutionStatus.PROVIDER_NOT_FOUND, placement: null,
    // reason, preference }` instead — never CREATED, never a fabricated
    // placement. `storage` is OPTIONAL here (the one contract change from
    // the class it wraps) — omitting it, or passing null/''/whitespace,
    // is what triggers preference resolution; every other value is
    // forwarded completely unchanged.
    async create(publicationId, storage = null) {
        if (typeof storage === 'string' && storage.trim()) {
            return this._coordinator.create(publicationId, storage);
        }

        const decision = this._resolvePreferredRoleProviderUseCase.execute({ role: RoleProviderRole.CONTENT });

        if (decision.status === RoleProviderResolutionStatus.PROVIDER_NOT_FOUND) {
            return {
                outcome: RoleProviderResolutionStatus.PROVIDER_NOT_FOUND,
                placement: null,
                reason: `Content preference names storage '${decision.preference.providerKey}', but no content store is registered for it`,
                preference: decision.preference
            };
        }

        // RESOLVED — use the preferred provider's own storage key.
        // NO_PREFERENCE — nothing configured either; forward the SAME
        // absent `storage` so the wrapped coordinator's own pre-existing
        // refusal fires, unmodified.
        const resolvedStorage = decision.status === RoleProviderResolutionStatus.RESOLVED
            ? decision.providerKey
            : storage;
        return this._coordinator.create(publicationId, resolvedStorage);
    }
}
