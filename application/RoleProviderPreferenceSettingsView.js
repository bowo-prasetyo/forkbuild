// 0.9.302 — Content Provider Preference Settings Entry Point.
//
// The settings-side counterpart of application/SnapshotPlacementCreationView
// .js (0.8.25) — pure, read-only, presentation-only, and, exactly like that
// file's own header describes, never itself a trigger of anything. This
// file never imports storage/RoleProviderPreferenceStore.js, application/
// SetRoleProviderPreferenceUseCase.js, or core/RoleProviderPreference.js at
// all — it never sees a RoleProviderPreference. Which option is currently
// selected is each settings view's own concern: the view reads the stored
// preference itself and binds it to its radio group's `v-model`.
//
//   a role's own registered provider keys    (read by the caller, e.g.
//        PreferredSnapshotPlacementCreationCoordinator#preferableStorageTypes(),
//        0.8.25 — never re-derived or hardcoded here)
//                    │
//                    ▼
//   describeRoleProviderPreferenceSettings({ availableProviderKeys })   ★ (THIS)
//                    │
//                    ▼
//   { options: [{ providerKey, label }] }
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
// never received. `ipfs` is unchanged; `local` needs no entry — the
// title-case fallback above already renders it as "Local".
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
    ipfs: 'IPFS',
    ar: 'Arweave',
    'remote-pinning': 'IPFS (Remote Pinning)'
};

function providerOptionLabel(providerKey) {
    return PROVIDER_OPTION_LABELS[providerKey]
        || (providerKey.charAt(0).toUpperCase() + providerKey.slice(1));
}

export function describeRoleProviderPreferenceSettings({ availableProviderKeys = [] } = {}) {
    return {
        options: availableProviderKeys.map((providerKey) => ({
            providerKey,
            label: providerOptionLabel(providerKey)
        }))
    };
}
