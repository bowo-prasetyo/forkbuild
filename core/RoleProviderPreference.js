import { RoleProviderRole, isValidRoleProviderRole } from './RoleProviderRole.js';

// 0.9.293 — Decentralized Role Provider Preference Boundary.
//
// 0.9.292's own audit answered "is this codebase ready for a provider-
// selection UI" with a source-verified NO, and named the reason: no
// preference concept exists anywhere (Sections G/I), so a UI built today
// would be configuration for capability that isn't uniformly there yet.
// This milestone answers a narrower, earlier question that audit's own
// Section J verdict left open — not "is capability ready," but "what
// WOULD a preference even mean, once it is." A `RoleProviderPreference`
// is that meaning, and nothing else: "for this role, this is the
// provider identifier this user prefers." It is deliberately NOT a
// resolver, NOT a registry lookup, NOT a fallback policy, and NOT a
// persisted setting — see "Four things this file deliberately does not
// do," below, each one a direct answer to a gap 0.9.292 named by number.
//
//   core/RoleProviderRole.js   (THIS milestone, sibling — the closed
//        ANNOUNCEMENT_AND_DISCOVERY/CONTENT/PROOF_AND_ANCHORING
//        vocabulary, promoted out of 0.9.292's own test-local constants)
//                    │
//                    ▼
//   core/RoleProviderPreference.js   ★ (THIS)
//        { role, providerKey } — a pure, immutable description
//                    │
//                    │   deliberately UNCONSUMED by anything yet — see
//                    │   "Nothing constructs one yet," below
//                    ▼
//   (unscheduled) a future Role Provider Resolver reads a preference's
//   `providerKey` and looks it up in a THEN-existing per-role registry —
//   0.9.292's own Section F already runs this exact "plugin names its
//   own key, a registry only ever reads it back" shape for Content
//   (SnapshotPlacementStoreRegistry) and Proof (ExternalProofVerifierRegistry);
//   Discovery's own equivalent registry does not exist yet (0.9.292
//   Section F, gap #3) — this file does not build it, and does not need
//   it to exist to be meaningful on its own.
//
// A PROVIDER KEY IS AN OPAQUE STRING, NEVER A PROVIDER. `providerKey`
// holds exactly the same kind of short, stable, lowercase, self-declared
// string every real provider in this codebase already exposes as its own
// identity — `ContentStore#storage` ('ipfs', 'ar', 'local'),
// `ProofVerifier#anchorType` ('bitcoin-op-return') — see content/
// ContentStore.js and anchoring/ProofVerifier.js's own headers for why
// those fields exist. This file never imports a single one of those
// classes, never imports anything from content/, anchoring/, discovery/,
// nostr/, arweave/, or base/, and never constructs, names in an `import`,
// or hardcodes a real provider's identity as anything other than a
// caller-supplied string. The one validation this file does run against
// `providerKey` — `/^[a-z][a-z0-9-]*$/`, see `isValidRoleProviderKey()`
// below — is a SHAPE rule ("a short, lowercase, self-identifying token"),
// never a MEMBERSHIP rule against any concrete provider's actual roster.
// "ipfs" and "not-a-real-provider-yet" both satisfy it equally; only a
// future registry lookup, deliberately absent here, could ever tell them
// apart.
//
// FOUR THINGS THIS FILE DELIBERATELY DOES NOT DO — each one a direct,
// named answer to a gap 0.9.292 identified, never an oversight:
//
// 1. NO CAPABILITY VALIDATION. This class never asks "can `providerKey`
//    actually satisfy `role`." Answering that requires a real registry
//    lookup per role, and 0.9.292 Section F found Discovery has none yet
//    — coupling this file to that answer would make an otherwise-pure
//    description depend on which registries happen to exist this week.
//    `RoleProviderPreference({ role: PROOF_AND_ANCHORING, providerKey:
//    'base' })` constructs successfully today, even though 0.9.292
//    Section B found Base's own verify half does not exist yet — that is
//    correct, not a bug: the preference is a real, well-formed statement
//    of what a user wants, independent of whether anything can grant it
//    yet. Capability resolution is a future, separate seam's job.
//
// 2. NO PROVIDER RESOLUTION. Constructing a preference never
//    instantiates, imports, looks up, or even names a concrete provider
//    class. There is no `resolve()` method here, and none belongs here —
//    see the diagram above.
//
// 3. NO FALLBACK SEMANTICS. 0.9.292 Section H found "no fallback between
//    providers" documented in six-plus file headers and implemented as
//    an actual class or function in exactly zero of them — "preferred
//    provider ≠ only provider" is a real, still-open policy question.
//    This file does not resolve it in either direction: a
//    `RoleProviderPreference` names ONE `providerKey` per role, full
//    stop, with no second/backup slot and no "if unavailable" behavior
//    of any kind.
//
// 4. NO PERSISTENCE. 0.9.292 Section I found that no per-role or generic
//    provider-preference storage key existed anywhere. This file adds
//    none: `toJSON()`/`fromJSON()` below are the same plain-data-shape
//    convenience every value object in this codebase already carries
//    (core/ContentReference.js, core/AvatarProfileVisibilityPolicy.js) —
//    this file itself never calls `localStorage`, never reads or writes
//    any storage key, and is exercised in-memory only, exactly like
//    0.9.292's own audit was.
//
// NOTHING CONSTRUCTS ONE YET. No production file outside this one, and
// core/RoleProviderRole.js, imports `RoleProviderPreference` — this
// milestone is the boundary itself, deliberately unconsumed, the same
// restraint core/DecentralizedPublicationLocationClaim.js's own 0.9.29
// header held ("a claim, never a verification... verifying a claim's
// signature, if this codebase ever needs it, is later, unscheduled
// work"). A future Role Provider Configuration/Persistence/Resolution
// milestone is what gives this class a caller; that milestone is real,
// named, and unscheduled — see docs/Roadmap.md, "0.9.293 — Decentralized
// Role Provider Preference Boundary," "What comes after."
//
// IMMUTABLE, BY CONSTRUCTION, NOT BY CONVENTION. Every instance is
// `Object.freeze()`d in its own constructor — there is no setter of any
// kind. `withProviderKey()` is the ONLY way to derive a changed
// preference, and it always returns a brand-new, independently frozen
// instance; it never mutates `this`, and mutating the object returned by
// one preference's `toJSON()` can never reach another preference's own
// state (each call to `toJSON()` allocates a fresh plain object).
//
// `role` IS NEVER MUTABLE, EVEN VIA A `with*()` METHOD — deliberately.
// The milestone brief's own framing ("the role is part of the semantic
// identity of the preference") means a Content preference that changed
// its own role to Proof would not be "the same preference, updated" —
// it would be a different preference, about a different question,
// wearing the same object identity. This class makes that impossible: to
// change a role, construct a new `RoleProviderPreference` outright.
export function isValidRoleProviderKey(value) {
    return typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);
}

export class RoleProviderPreference {
    constructor({ role, providerKey } = {}) {
        if (!isValidRoleProviderRole(role)) {
            throw new Error(`RoleProviderPreference: unknown role "${role}"`);
        }
        if (!isValidRoleProviderKey(providerKey)) {
            throw new Error(`RoleProviderPreference: invalid providerKey "${providerKey}"`);
        }
        this._role = role;
        this._providerKey = providerKey;
        Object.freeze(this);
    }

    get role() { return this._role; }
    get providerKey() { return this._providerKey; }

    // Value equality, never identity — two independently-constructed
    // preferences naming the same role and the same providerKey are
    // equal, exactly like this codebase's other small value objects
    // compare (core/ContentReference.js#verify() compares by hash, never
    // by instance).
    equals(other) {
        return other instanceof RoleProviderPreference
            && other._role === this._role
            && other._providerKey === this._providerKey;
    }

    // The only way to derive a changed preference — role stays fixed
    // (see "role is never mutable," above); only the chosen provider can
    // change, and only by producing a brand-new, independently frozen
    // instance. `this` is never touched.
    withProviderKey(providerKey) {
        return new RoleProviderPreference({ role: this._role, providerKey });
    }

    // Plain-data convenience only — see "No persistence," above. Nothing
    // in this file reads or writes any storage key.
    toJSON() {
        return { role: this._role, providerKey: this._providerKey };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return new RoleProviderPreference({ role: json.role, providerKey: json.providerKey });
    }
}

export { RoleProviderRole };
