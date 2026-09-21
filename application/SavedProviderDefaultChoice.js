// 0.9.667 — Role Provider Preference As Dropdown Default.
//
// The gap this file closes: every "Substrate"/"Content" `<select>` this
// codebase ships (ui/views/DecentralizedPublicationsView.js's own two
// pickers, ui/views/EditorView.js's, ui/components/WorldEncounterCanvas.js's,
// ui/components/PublicationCard.js's, and ui/components/OwnPublicationPanel.js's
// own snapshot-storage picker) always opened on a HARDCODED value — 'nostr',
// or the first registry-eligible storage type — never on whatever a person
// had already saved through ui/views/ContentProviderSettingsView.js or
// ui/views/AnnouncementDiscoveryProviderSettingsView.js. That choice was
// real and durably saved (see either settings view's own "0.9.294"
// persistence reference), but only ever consumed by the separate, explicit
// "Use Preferred Provider" trigger those two pages' own headers describe —
// never by the ordinary pickers a person actually reaches for on every
// other visit. This file is the one, small, pure decision every one of
// those pickers now shares: GIVEN a person's saved providerKey (or none)
// and the options a picker is CURRENTLY offering, which one should the
// picker open on.
//
// NEVER A VALIDITY CHECK OF ITS OWN. `savedProviderKey` is trusted exactly
// as far as `availableProviderKeys` says it can be — this function never
// asks a registry, a resolver, or anything else whether the saved key is
// "real"; it only ever asks whether the CALLER's own current option list
// already contains it. A saved choice naming a provider this picker
// doesn't currently offer (not yet registered, not one of the two real
// Announcement/Discovery substrates, ...) silently falls through to
// `fallbackProviderKey` — the exact value that same picker already opened
// on before this file existed — never a thrown error and never a
// manufactured substitute.
//
// STILL ONLY EVER A DEFAULT. Nothing here writes `v-model`, disables a
// picker, or stops a person from picking anything else the instant the page
// renders — this function is called exactly once, to seed a picker's
// initial choice, the same "read only as the DEFAULT when no explicit
// choice is made" restraint ui/views/AnnouncementDiscoveryProviderSettingsView.js's
// own header already draws one layer up.
export function resolveSavedProviderDefault(savedProviderKey, availableProviderKeys, fallbackProviderKey) {
    if (savedProviderKey && Array.isArray(availableProviderKeys) && availableProviderKeys.includes(savedProviderKey)) {
        return savedProviderKey;
    }
    return fallbackProviderKey;
}
