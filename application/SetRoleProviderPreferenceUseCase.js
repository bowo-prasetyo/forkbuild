import { isValidRoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';

// 0.9.302 — Content Provider Preference Settings Entry Point.
//
// 0.9.293-0.9.297 built the full READ side of the preference chain
// (RoleProviderPreference → RoleProviderPreferenceStore →
// RoleAwareProviderResolver → ResolvePreferredRoleProviderUseCase) and
// 0.9.299/0.9.301 gave it its first real consumer. None of that ever gave
// a person an ordinary product path to CREATE or CHANGE a preference in
// the first place — every preference exercised by those milestones' own
// tests was written directly through RoleProviderPreferenceStore.save(),
// a storage-layer method no UI has ever called. This class is the WRITE
// half ResolvePreferredRoleProviderUseCase's own header already named as
// this chain's missing symmetric partner:
//
//   ResolvePreferredRoleProviderUseCase.execute({ role })   (0.9.297)
//        reads a preference, resolves it, never writes one
//
//   SetRoleProviderPreferenceUseCase.execute({ role, providerKey })   ★ (THIS)
//        writes a preference, never reads, resolves, or acts on one
//
//        │
//        ▼
//   RoleProviderPreferenceStore.save(preference)   (0.9.294, unmodified)
//
// DELIBERATELY THE SMALLEST POSSIBLE APPLICATION CAPABILITY. `execute()`
// does exactly three things, in this order, and nothing else: (1) checks
// `role` is one of the closed RoleProviderRole values, (2) constructs a
// RoleProviderPreference — which itself is what actually validates
// `providerKey`'s SHAPE (core/RoleProviderPreference.js's own
// `isValidRoleProviderKey()`; this class re-implements none of that
// check), (3) saves it, and returns the persisted instance. It never:
//
//   - resolves the provider (no RoleAwareProviderResolver dependency of
//     any kind — see this file's own tests, Section D);
//   - asks whether `providerKey` can actually satisfy `role` (that
//     membership question stays exactly where core/
//     RoleProviderPreference.js's own header already places it — a future
//     registry lookup, never this class);
//   - instantiates, imports, or names a concrete provider (no content/,
//     anchoring/, discovery/, nostr/, arweave/, or base/ import anywhere
//     in this file);
//   - tests provider health, ranks providers, or retries;
//   - modifies any registry, or performs placement of any kind.
//
// A caller wanting to know whether the preference it just saved can
// currently be granted calls ResolvePreferredRoleProviderUseCase.execute()
// separately, exactly like today — this class's own return value is the
// SAVED PREFERENCE, never a resolution outcome, and never implies one.
//
// THE UI NEVER CONSTRUCTS OR INTERPRETS A RoleProviderPreference ITSELF.
// A caller (ui/views/ContentProviderSettingsView.js, 0.9.302) passes this
// class a plain `{ role, providerKey }` — "save preferred CONTENT
// provider = 'ipfs'" — and this class is the only place that ever turns
// that into a real RoleProviderPreference instance and hands it to the
// store. See this file's own tests, Section E.
export class SetRoleProviderPreferenceUseCase {
    // `preferenceStore` — a RoleProviderPreferenceStore (0.9.294);
    // consulted via `save(preference)` only, injected exactly like every
    // other composition-time dependency in this codebase, never
    // constructed here.
    constructor({ preferenceStore } = {}) {
        if (!(preferenceStore instanceof RoleProviderPreferenceStore)) {
            throw new Error('SetRoleProviderPreferenceUseCase requires a RoleProviderPreferenceStore');
        }
        this._preferenceStore = preferenceStore;
    }

    // Saves `providerKey` as the preferred provider for `role`, replacing
    // whatever was previously on file for that role (see
    // RoleProviderPreferenceStore.js's own "PERSISTS BY ROLE" header for
    // why that replacement is a structural property of the store itself,
    // never something this class separately implements). Returns the new,
    // persisted RoleProviderPreference.
    //
    // Throws for `role` outside the closed RoleProviderRole vocabulary, or
    // for a `providerKey` whose SHAPE core/RoleProviderPreference.js's own
    // constructor rejects (not a string, empty, wrong casing, ...) — both
    // are programming errors, the identical split
    // ResolvePreferredRoleProviderUseCase.js's own header already draws
    // one layer over.
    execute({ role, providerKey } = {}) {
        if (!isValidRoleProviderRole(role)) {
            throw new Error(`SetRoleProviderPreferenceUseCase.execute(): unknown role "${role}"`);
        }
        const preference = new RoleProviderPreference({ role, providerKey });
        this._preferenceStore.save(preference);
        return preference;
    }
}
