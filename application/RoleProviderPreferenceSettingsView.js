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
//
// 0.9.517 — Decentralized Publication Lifecycle Product Reassessment.
// `ar` (content/ArweaveContentStore.js's own `storage` name, the SAME key
// ui/main.js registers `arweaveSnapshotPlacementContentStore` under, into
// the SAME `snapshotPlacementStoreRegistry` this file's own
// `availableProviderKeys` is ultimately read from) was missing here —
// title-casing it through the fallback above produced "Ar" on the Content
// Provider settings page, the exact unrecognizable-abbreviation defect
// 0.9.510 already fixed one surface over (STORAGE_TYPE_LABELS, ui/views/
// DecentralizedPublicationsView.js) but this file's own, separate map
// never received. `local`/`ipfs` are unchanged.
//
// `remote-pinning` — content/IpfsRemotePinningContentStore.js's own
// `storage` getter still self-reports `'ipfs'` (it shares an `ipfs://`
// locator scheme with Local Kubo), so it never occupies its own key in
// `snapshotPlacementStoreRegistry` — see that class's own header. Its
// caller (ui/views/ContentProviderSettingsView.js) appends the literal
// string `'remote-pinning'` to `availableProviderKeys` itself, deliberately
// outside that registry, purely so a Wanderer who never runs a Kubo node
// (local or remote) can save it as their preferred Content default. This
// label exists only so that option renders as "IPFS (Remote Pinning)"
// instead of the raw-key fallback's "Remote-pinning".
const PROVIDER_OPTION_LABELS = {
    local: 'Local',
    ipfs: 'IPFS',
    ar: 'Arweave',
    'remote-pinning': 'IPFS (Remote Pinning)'
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
