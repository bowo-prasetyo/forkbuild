import { RoleProviderRole, isValidRoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';

// 0.9.295 — Role-Aware Provider Resolution Boundary.
//
// 0.9.293 defined what a preference MEANS ({ role, providerKey }, pure,
// unconsumed). 0.9.294 gave it a durable home (RoleProviderPreferenceStore,
// still unconsumed by anything operational). Both milestones' own headers
// named the same next question, on purpose, and left it for later: "what
// WOULD looking one up even mean, once a real per-role registry exists to
// look it up in." This file is that lookup step, and nothing more —
//
//   RoleProviderPreferenceStore.get(role)   (0.9.294, unmodified)
//        │  a RoleProviderPreference, or null — "nothing configured"
//        ▼
//   RoleAwareProviderResolver.resolve(role)   ★ (THIS)
//        │  picks the ONE registry that role owns, looks preference.
//        │  providerKey up in it, reports what happened
//        ▼
//   { role, providerKey, status, provider? }
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: A PROVIDER KEY RECURS ACROSS
// ROLES; A PROVIDER CAPABILITY NEVER DOES. `resolve()` never collapses to
// `resolveProvider(providerKey)` — that would silently assume one registry
// answers for every role, which is false today (content/ContentStore.js's
// registry and anchoring/ProofVerifier.js's registry are two independent
// Maps, keyed by two independently-chosen vocabularies — 'ar'/'ipfs'/
// 'local' versus 'bitcoin-op-return' — and Discovery has no keyed registry
// at all; see "three registries, never one," below). `resolve(role)` reads
// ROLE's own preference and consults ROLE's own registry, full stop; the
// same providerKey string resolved for a different role would consult a
// completely different registry and could resolve to a completely
// different outcome, or none at all — see this file's own tests, Section H.
//
// THREE REGISTRIES, NEVER ONE UNIVERSAL LOOKUP. This class never
// instantiates, imports, or hardcodes a concrete provider (content/
// ArweaveContentStore.js, anchoring/BitcoinOpReturnProofVerifier.js, or any
// Discovery service) — every registry it consults is supplied by the
// caller at construction time, exactly like application/
// CreateSnapshotPlacementOrchestratorUseCase.js already wires application/
// SnapshotPlacementStoreRegistry.js in from outside rather than building
// one itself. Content and Proof already ship a real keyed registry apiece
// (application/SnapshotPlacementStoreRegistry.js keyed by a ContentStore's
// own `storage`; application/ExternalProofVerifierRegistry.js keyed by a
// ProofVerifier's own `anchorType`) — this file hands `contentRegistry`/
// `proofRegistry` straight to whichever of those a caller passes in, and
// never re-implements, wraps, or second-guesses either one's own `get()`.
// Discovery has NO such registry yet (0.9.292 Section F's own gap #3, still
// open, still unscheduled, still NOT this milestone's job to fill) — so
// `discoveryRegistry` here is deliberately the same minimal shape as the
// other two (anything exposing `get(providerKey)`), satisfied for real
// Discovery capability by wrapping application/
// DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js's own
// `composeDecentralizedWorldEncounterMaterialDiscoveryServices()` — see
// this file's own tests, Section B, for exactly that adapter, built ONLY in
// the test file, never shipped here as a new
// `DiscoveryProviderRegistry` production class. That keeps Discovery's own
// "different provider/query shapes, not yet a keyed registry" reality
// visible instead of papering over it with a fake uniform abstraction this
// codebase does not actually have yet.
//
// RESOLUTION OUTCOMES: EXACTLY THE DISTINCTIONS THE REAL REGISTRIES CAN
// ACTUALLY MAKE, NEVER MORE. Three statuses, not four:
//
//   RESOLVED             — `role`'s own registry returned a real provider
//                           for `preference.providerKey`.
//   NO_PREFERENCE        — RoleProviderPreferenceStore.get(role) returned
//                           null; nothing has been configured for this role
//                           at all. `providerKey` is null on the outcome.
//   PROVIDER_NOT_FOUND   — a preference IS configured, but `role`'s own
//                           registry has nothing registered under
//                           `preference.providerKey`.
//
// A fourth status distinguishing "providerKey names no provider anywhere"
// from "providerKey names a provider, but not one that implements this
// role" was deliberately NOT added. Every real registry in this codebase
// (SnapshotPlacementStoreRegistry.get(), ExternalProofVerifierRegistry.
// get()) already returns the identical `null` for both cases — a lookup
// miss is a lookup miss, whether the key was never registered anywhere or
// was registered only under a completely different registry's own
// vocabulary (0.9.292 Section B's own Base/Proof partial: 'base' is never
// registered in any ExternalProofVerifierRegistry, because anchoring/
// BaseProofVerifier.js does not exist — resolving `PROOF_AND_ANCHORING` +
// 'base' reports PROVIDER_NOT_FOUND, the exact same status an entirely
// made-up key would get; see this file's own tests, Section G).
// Manufacturing a distinction the registries themselves cannot make would
// be inventing vocabulary ahead of the architecture — the same restraint
// core/RoleProviderPreference.js's own header already held for capability
// validation, carried forward here for resolution outcomes.
//
// NO FALLBACK, IN EITHER DIRECTION. When `resolve()` reports
// PROVIDER_NOT_FOUND, it returns that outcome — it never tries a second
// registered provider, never substitutes a "default," and never widens the
// search to another role's registry. `preference.providerKey` is read
// exactly once, looked up in exactly one registry, and the outcome of that
// one lookup is the whole answer. Preference and fallback policy are
// different product decisions; this milestone only resolves the first one
// (see this file's own tests, Section I, and application/
// ExternalProofVerifierRegistry.js's own header, which already draws the
// identical line one layer down: an unregistered anchorType there falls
// through to an explicit "unverified" outcome, never a substitute
// verifier).
//
// THE PREFERENCE STORE IS READ, NEVER WRITTEN. `resolve()` calls
// `preferenceStore.get(role)` exactly once and nothing else on it — no
// `save()`, no mutation, no re-persisting a "resolved" value back. A
// RoleProviderPreference read out of the store is also never mutated by
// this file; `preference.providerKey` is read, never reassigned (the class
// is frozen at construction anyway — see core/RoleProviderPreference.js).
//
// NOT WIRED INTO ANY COMPOSITION ROOT. No existing file — application/
// PublicationDistributionRuntimeComposition.js, application/
// DiscoverSnapshotRuntimeComposition.js, application/
// DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js, any
// anchoring/ composition — imports this class. Existing publication
// distribution, Snapshot distribution, discovery, material loading, and
// anchoring behavior is unchanged by this milestone, on purpose: this
// resolver is a real, independently testable capability that CAN exist
// without yet being consumed by production workflows, exactly like
// core/RoleProviderPreference.js's own 0.9.293 header held the identical
// line one milestone earlier ("nothing constructs one yet").
export const RoleProviderResolutionStatus = Object.freeze({
    RESOLVED: 'RESOLVED',
    NO_PREFERENCE: 'NO_PREFERENCE',
    PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND'
});

// A "registry," for this file's purposes, is anything exposing
// `get(providerKey)` and returning a provider (or a falsy value when
// nothing is registered under that key) — the exact shape application/
// SnapshotPlacementStoreRegistry.js and application/
// ExternalProofVerifierRegistry.js already share, and the minimum shape a
// caller-built Discovery adapter needs to satisfy too. This is a fail-fast
// constructor-time shape check, never a capability check — it never calls
// `get()` itself, and never asks whether any particular providerKey is
// registered.
function requireKeyedRegistry(registry, label) {
    if (!registry || typeof registry.get !== 'function') {
        throw new Error(`RoleAwareProviderResolver: ${label} must expose a get(providerKey) method`);
    }
    return registry;
}

export class RoleAwareProviderResolver {
    // `preferenceStore` — a RoleProviderPreferenceStore (0.9.294); read via
    // `get(role)` only, never written.
    // `discoveryRegistry` / `contentRegistry` / `proofRegistry` — one
    // keyed registry per RoleProviderRole, injected, never instantiated
    // here. Each is used ONLY when resolving its own role — see
    // `_registryFor()` below and this file's own tests, Section J.
    constructor({ preferenceStore, discoveryRegistry, contentRegistry, proofRegistry } = {}) {
        if (!(preferenceStore instanceof RoleProviderPreferenceStore)) {
            throw new Error('RoleAwareProviderResolver requires a RoleProviderPreferenceStore');
        }
        this._preferenceStore = preferenceStore;
        this._registries = Object.freeze({
            [RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY]: requireKeyedRegistry(discoveryRegistry, 'discoveryRegistry'),
            [RoleProviderRole.CONTENT]: requireKeyedRegistry(contentRegistry, 'contentRegistry'),
            [RoleProviderRole.PROOF_AND_ANCHORING]: requireKeyedRegistry(proofRegistry, 'proofRegistry')
        });
    }

    // Resolves `role`'s currently configured preference into a concrete
    // provider capability, or reports exactly why it could not. Never
    // throws for "no preference" or "provider not found" — those are
    // real, expected outcomes, reported through `status`, not exceptions;
    // it throws only for `role` itself being outside the closed
    // RoleProviderRole vocabulary, the same "invalid input is a
    // programming error, an absent value is a business outcome" split
    // storage/RoleProviderPreferenceStore.js#get() already draws.
    //
    // Returns a frozen `{ role, providerKey, status, provider? }`:
    // `provider` is present only when `status` is RESOLVED — see this
    // file's own tests, Section E/F.
    resolve(role) {
        if (!isValidRoleProviderRole(role)) {
            throw new Error(`RoleAwareProviderResolver.resolve(): unknown role "${role}"`);
        }

        const preference = this._preferenceStore.get(role);
        if (!preference) {
            return Object.freeze({ role, providerKey: null, status: RoleProviderResolutionStatus.NO_PREFERENCE });
        }

        const registry = this._registryFor(role);
        const provider = registry.get(preference.providerKey) || null;
        if (!provider) {
            return Object.freeze({
                role,
                providerKey: preference.providerKey,
                status: RoleProviderResolutionStatus.PROVIDER_NOT_FOUND
            });
        }

        return Object.freeze({
            role,
            providerKey: preference.providerKey,
            status: RoleProviderResolutionStatus.RESOLVED,
            provider
        });
    }

    // The one registry `role` owns — never any other. `role` is already
    // validated by the only caller, `resolve()`, above.
    _registryFor(role) {
        return this._registries[role];
    }
}
