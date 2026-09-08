// 0.9.302 — Content Provider Preference Settings Entry Point.
//
// The settings-side counterpart of application/SnapshotPlacementCreationView
// .js (0.8.25) — pure, read-only, presentation-only, and, exactly like that
// file's own header describes, never itself a trigger of anything. This
// file never imports storage/RoleProviderPreferenceStore.js, application/
// SetRoleProviderPreferenceUseCase.js, or core/RoleProviderPreference.js's
// own constructor — it only ever READS the `.role`/`.providerKey` a
// RoleProviderPreference the caller already obtained elsewhere already
// carries, never builds one and never decides whether one is valid.
//
//   RoleProviderPreferenceStore.get(role)   (0.9.294, read by the caller)
//   a role's own registered provider keys    (read by the caller, e.g.
//        PreferredSnapshotPlacementCreationCoordinator#availableStorageTypes(),
//        0.8.25 — never re-derived or hardcoded here)
//                    │
//                    ▼
//   describeRoleProviderPreferenceSettings({ role, availableProviderKeys, preference })   ★ (THIS)
//                    │
//                    ▼
//   { role, selectedProviderKey, options: [{ providerKey, label, selected }] }
//
// THE PROVIDER LIST IS ALWAYS SUPPLIED, NEVER DISCOVERED HERE. This file
// never asks "is X a valid CONTENT provider" — that membership question
// stays exactly where core/RoleProviderPreference.js's own header already
// places it, a real registry lookup. `availableProviderKeys` is simply
// rendered, in the order given, as this role's current, actually-usable
// options; an empty list renders zero options, never a fabricated default.
//
// A providerKey with no friendly name in `PROVIDER_OPTION_LABELS` below
// still renders — under its own raw key, title-cased — never hidden and
// never refused; that map is a PRESENTATION-ONLY convenience local to this
// file, the same restraint ui/views/AvatarSettingsView.js's own
// SKIN_TONE_SWATCHES lookup already holds one axis over.
const PROVIDER_OPTION_LABELS = {
    local: 'Local',
    ipfs: 'IPFS'
};

function providerOptionLabel(providerKey) {
    return PROVIDER_OPTION_LABELS[providerKey]
        || (providerKey.charAt(0).toUpperCase() + providerKey.slice(1));
}

// Never throws for a missing `preference` — `null` is a perfectly
// ordinary "nothing configured for this role yet" input, exactly like
// RoleProviderPreferenceStore.get()'s own return contract. `selected` is
// computed once, here, from `preference` alone, so a caller never has to
// separately compare `option.providerKey === preference.providerKey`
// itself.
export function describeRoleProviderPreferenceSettings({ role, availableProviderKeys = [], preference = null } = {}) {
    const selectedProviderKey = preference ? preference.providerKey : null;
    return {
        role,
        selectedProviderKey,
        options: availableProviderKeys.map((providerKey) => ({
            providerKey,
            label: providerOptionLabel(providerKey),
            selected: providerKey === selectedProviderKey
        }))
    };
}
