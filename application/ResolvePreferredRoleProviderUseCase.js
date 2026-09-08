import { isValidRoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleAwareProviderResolver, RoleProviderResolutionStatus } from './RoleAwareProviderResolver.js';

// 0.9.297 — Role Provider Preference Application Boundary.
//
// 0.9.293/0.9.294/0.9.295 each stopped at the exact seam their own header
// named next, on purpose: a preference MEANS something (core/
// RoleProviderPreference.js), it SURVIVES a restart (storage/
// RoleProviderPreferenceStore.js), and it now RESOLVES into a concrete
// provider capability through the real per-role registries that already
// exist (application/RoleAwareProviderResolver.js). 0.9.296's own
// evidence-backed audit then answered the question every one of those
// three files' own "What comes after" had left open: not one of eleven
// real production provider-selection seams is a clean, unconditional
// "just call resolve() here" insertion point today — each one carries
// either a data-provenance conflict, an explicit documented "never
// preferred or default" principle, an existing query-everything behavior
// to reconcile, or a missing second provider to choose between (see that
// audit's own Section C and Section I verdict).
//
// This file is the answer to a narrower, prior question that finding
// makes unavoidable: WHO is allowed to ask "what does the user prefer for
// this role," and what do they get back, independent of whether any
// production workflow is ready to act on the answer yet.
//
//   RoleProviderPreferenceStore.get(role)   (0.9.294, unmodified)
//   RoleAwareProviderResolver.resolve(role) (0.9.295, unmodified)
//                    │
//                    ▼
//   ResolvePreferredRoleProviderUseCase.execute({ role })   ★ (THIS)
//        the one application-level seam a future workflow calls instead
//        of importing RoleProviderPreferenceStore or
//        RoleAwareProviderResolver directly
//                    │
//                    ▼
//   { role, preference, status, providerKey, provider? }
//                    │
//        (unscheduled) a future product decision names WHICH workflow may
//        actually consume this — this class does not make that decision,
//        and is not imported by anything operational yet (see "Not wired
//        into any workflow," below)
//
// WHY THIS IS A SEPARATE FILE FROM THE RESOLVER IT WRAPS. Nothing about
// application/RoleAwareProviderResolver.js's own public API changes here
// — resolve(role) already reads the preference store and returns a real,
// three-outcome decision. What this class adds is not new resolution
// LOGIC; it is a stable, named, application-layer seam a workflow can
// depend on without needing to know that a "preference" and a "resolver"
// are two separate collaborators at all, the identical reason
// application/CanCommentOnPublicationUseCase.js exists as its own class
// even though its entire body is one `discoveryProvider.findById()` call
// — a future caller (a Content distribution UI, a Discovery composition
// root, anything) should depend on ONE application-level class with a
// product-shaped name, never on the internal wiring of a preference store
// plus a resolver plus whichever per-role registries happen to back it
// today. That indirection is also exactly what keeps a later real
// integration a one-file change: only this class's own callers would ever
// need to change, never RoleAwareProviderResolver.js or
// RoleProviderPreferenceStore.js themselves.
//
// BOTH COLLABORATORS ARE EXERCISED, NEITHER IS RE-IMPLEMENTED. `execute()`
// calls `preferenceStore.get(role)` itself, once, to obtain the raw
// RoleProviderPreference this role currently has on file (or `null`) —
// see this file's own tests, Section A. It separately calls
// `resolver.resolve(role)`, once, to obtain the actual capability decision
// — see Section B. It never opens a registry, never re-derives "is there
// a preference" from the resolver's own outcome instead of asking the
// store directly, and never second-guesses either collaborator's answer.
// The two reads can disagree only if a caller wires a `resolver` whose own
// internal preferenceStore is a DIFFERENT instance than the one passed to
// this class — wiring both from the same store, exactly like every
// existing composition root already wires one registry into one
// coordinating class, is the caller's responsibility, not something this
// class can (or should) verify from the outside.
//
// THE PREFERENCE IS INCLUDED IN THE DECISION, NEVER USED TO OVERRIDE IT.
// The returned decision carries BOTH the raw `preference` (what the user
// actually has configured, or `null`) and the resolver's own `status` /
// `providerKey` / `provider` (what that preference actually resolved to).
// These can differ — `preference.providerKey` still names the configured
// value even when `status` is PROVIDER_NOT_FOUND — and `execute()` never
// collapses them into one. A caller that only wants the resolvable
// capability reads `status`/`provider`; a caller that wants to explain a
// PROVIDER_NOT_FOUND outcome to a person ("you configured X for this
// role") reads `preference` directly, without a second store call of its
// own.
//
// THREE OUTCOMES, PRESERVED EXACTLY — NEVER A FOURTH. `status` is always
// one of RoleProviderResolutionStatus's own RESOLVED / NO_PREFERENCE /
// PROVIDER_NOT_FOUND, read straight off the resolver's own outcome and
// never remapped. In particular:
//
//   - PROVIDER_NOT_FOUND is NEVER turned into "use whatever is already
//     configured" or "use the first available provider." No fallback of
//     any kind exists in this class, matching RoleAwareProviderResolver's
//     own "no fallback, ever" design one layer down — see this file's own
//     tests, Section F.
//   - NO_PREFERENCE is NEVER turned into a manufactured default
//     providerKey. `preference` is `null` and `providerKey` is `null`,
//     exactly as the resolver itself already reports — see Section D.
//
// This class does not even contain an `if (status === PROVIDER_NOT_FOUND)`
// branch of its own — there is nothing for it to DO with that status
// beyond pass it through, which is the point: inventing a branch here
// would be the first step toward a fallback policy this milestone's own
// brief explicitly declines to make.
//
// NO CONSTRUCTION, ANYWHERE. This class never imports content/,
// anchoring/, discovery/, nostr/, arweave/, base/, or any concrete
// provider implementation, and never calls `new` on one — every
// `provider` this class ever hands back was constructed by whichever
// composition root built the registry `resolver` was wired with, long
// before this class ever saw it. See this file's own tests, Section J.
//
// NOT WIRED INTO ANY WORKFLOW. No existing composition root — application/
// PublicationDistributionRuntimeComposition.js, application/
// SnapshotDistributionRuntimeComposition.js, application/
// DiscoverSnapshotRuntimeComposition.js, application/
// DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js, any
// anchoring/ composition, any ui/ view — imports this class. 0.9.296's own
// audit already traced why: every real candidate insertion point carries
// a genuine, unmade product decision (see that audit's own Section C).
// This milestone deliberately answers only "what is the single seam a
// FUTURE decision would call," never "which workflow gets to call it
// first" — see this file's own tests, Section K.
export class ResolvePreferredRoleProviderUseCase {
    // `preferenceStore` — a RoleProviderPreferenceStore (0.9.294); read via
    // `get(role)` only, never written.
    // `resolver` — a RoleAwareProviderResolver (0.9.295); consulted via
    // `resolve(role)` only. This class never constructs either
    // collaborator itself — both are injected, exactly like every other
    // composition-time dependency in this codebase.
    constructor({ preferenceStore, resolver } = {}) {
        if (!(preferenceStore instanceof RoleProviderPreferenceStore)) {
            throw new Error('ResolvePreferredRoleProviderUseCase requires a RoleProviderPreferenceStore');
        }
        if (!(resolver instanceof RoleAwareProviderResolver)) {
            throw new Error('ResolvePreferredRoleProviderUseCase requires a RoleAwareProviderResolver');
        }
        this._preferenceStore = preferenceStore;
        this._resolver = resolver;
    }

    // Answers "what provider capability does the user prefer for this
    // role" as one frozen decision:
    //
    //   { role, preference, status, providerKey, provider? }
    //
    // `preference` — the RoleProviderPreferenceStore's own RoleProviderPreference
    //   for `role`, or `null` when nothing is configured. Read directly
    //   from the store, not re-derived from the resolver's own outcome.
    // `status` / `providerKey` / `provider` — exactly
    //   RoleAwareProviderResolver.resolve(role)'s own outcome, unmodified.
    //   `provider` is present only when `status` is RESOLVED, the
    //   identical shape the resolver's own outcome already carries.
    //
    // Throws only for `role` itself being outside the closed
    // RoleProviderRole vocabulary — the same "invalid input is a
    // programming error, an absent value is a business outcome" split
    // every collaborator this class wraps already draws.
    execute({ role } = {}) {
        if (!isValidRoleProviderRole(role)) {
            throw new Error(`ResolvePreferredRoleProviderUseCase.execute(): unknown role "${role}"`);
        }

        const preference = this._preferenceStore.get(role);
        const outcome = this._resolver.resolve(role);

        const decision = {
            role,
            preference,
            status: outcome.status,
            providerKey: outcome.providerKey
        };
        if (outcome.status === RoleProviderResolutionStatus.RESOLVED) {
            decision.provider = outcome.provider;
        }
        return Object.freeze(decision);
    }
}
