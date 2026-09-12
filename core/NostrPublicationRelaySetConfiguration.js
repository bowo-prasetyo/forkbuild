import { isValidNostrRelayUrl } from './NostrRelayConfiguration.js';

const DEFAULT_NOSTR_PUBLICATION_RELAY_URL = 'wss://relay.damus.io';

// 0.9.447 — Nostr Publication Relay Set Configuration.
//
// 0.9.446's own audit (tests/NostrMultiRelayConfigurationUIReachabilityAudit.test.js)
// traced every existing Nostr configuration source live and found a real,
// but narrow, gap: `application/NostrMultiRelayPublicationDiscoveryPublisher.js`
// (0.9.444) already fans a signed announcement out across many relays, but
// `nostrRelayUrls` — the array it fans out to — has no persisted home
// anywhere in this codebase. That audit's own Section J explicitly ruled
// OUT widening `core/NostrRelayConfiguration.js` / `/settings/nostr-relay`
// to hold it: that existing boundary is explicitly, repeatedly documented
// as READ/DISCOVERY ONLY (see that file's own header), and the write path
// (both the pre-existing single-relay command and 0.9.444's own fan-out)
// already, provably, never consults it. This file is the new, genuinely
// separate, sibling configuration the audit recommended instead — the
// WRITE-side counterpart to `NostrRelayConfiguration`'s READ-side value
// object, applied to a relay SET instead of a single relay URL.
//
//   Settings UI (ui/views/NostrPublicationRelaySettingsView.js, this same
//   milestone)
//        │  { relayUrls }
//        ▼
//   core/NostrPublicationRelaySetConfiguration.js   ★ (THIS)
//        new NostrPublicationRelaySetConfiguration({ relayUrls })
//        │  — normalizes (trim/drop-empty/dedupe), then throws unless at
//        │    least one entry survives AND every surviving entry is a
//        │    valid ws:/wss: URL per THIS SAME isValidNostrRelayUrl() the
//        │    read-path class already enforces
//        ▼
//   { relayUrls }   (immutable, frozen, non-empty, deduplicated, ordered)
//        │
//        ▼
//   storage/NostrPublicationRelaySetConfigurationStore.js   (this same
//        milestone, sibling file, its OWN storage key — never
//        NostrRelayConfigurationStore's)
//        │
//        ▼
//   application/NostrPublicationRelaySetConfigurationProvider.js  (this
//        same milestone) resolves the effective array (falling back to
//        DEFAULT_NOSTR_PUBLICATION_RELAY_URL, below, when nothing is
//        configured) for
//   application/PublicationDistributionCommandComposition.js's own new
//        composeMultiRelayNostrPublicationDistributionCommand() to pre-bind
//        as `nostrRelayUrls`.
//
// A SEPARATE OBJECT, NEVER A SHARED SHAPE WITH `NostrRelayConfiguration`.
// The two classes share exactly one thing on purpose — the per-entry
// `isValidNostrRelayUrl()` predicate, imported here, never reimplemented —
// because 0.9.446's own Section H proved the fan-out publisher's own
// bare-non-empty-string check is measurably LOOSER than that predicate, and
// recommended resolving the inconsistency by reusing the STRICTER existing
// check at this new configuration boundary, never by loosening it. Beyond
// that one shared predicate, this file shares no field, no storage key, no
// default constant, and no class with `NostrRelayConfiguration` — discovery
// relay preference and publication-distribution relay SET remain two
// independent, unconnected facts, exactly the "separate object" precedent
// that file's own header already set for itself against
// `ArweaveGatewayConfiguration`.
//
// A SET OF INDEPENDENT FAN-OUT TARGETS, NEVER AN ORDERED FAILOVER LIST.
// Unlike `core/ArweaveGatewayConfiguration.js`'s own `gatewayUrls` (0.9.440
// — priority-ordered, first-reachable-wins read failover), every entry here
// is an equal, independent publication-distribution target — matching
// `NostrMultiRelayPublicationDiscoveryPublisher.js`'s own "fan-out, never
// failover" invariant one layer up. This class preserves configured order
// only so a caller/UI has a stable, predictable rendering — it assigns no
// meaning of "primary" or "fallback" to position.
//
// NORMALIZATION HAPPENS HERE, ONCE, BEFORE VALIDATION — NEVER LEFT TO A
// CALLER OR TO THE FAN-OUT PUBLISHER'S OWN LOOSER NORMALIZATION. Entries are
// trimmed, empty/whitespace-only entries are dropped, and duplicates
// (by trimmed string equality) are collapsed to their first occurrence —
// the identical normalization `NostrMultiRelayPublicationDiscoveryPublisher.js`'s
// own `normalizeRelayUrls()` already performs one layer down. This file
// performs that same normalization ONE LAYER EARLIER, at the configuration
// boundary, so a malformed or duplicate entry never even reaches
// construction-time validation as a candidate.
//
// VALIDATION IS STRICT, MODEST, AND SHAPE-ONLY — NEVER REACHABILITY. Every
// normalized entry must satisfy `isValidNostrRelayUrl()` (absolute ws:/wss:)
// or construction throws, synchronously, before anything is persisted. This
// is deliberately STRICTER than `NostrMultiRelayPublicationDiscoveryPublisher.js`'s
// own constructor (which accepts any non-empty string) — see this file's own
// header, above, "a set of independent fan-out targets." A caller supplying
// a garbage string here is rejected at THIS boundary, before it can ever
// reach a real network fan-out attempt — never a network call of any kind
// is made to check reachability.
//
// `[]` IS NEVER A VALID CONFIGURATION — THE SAME RULE
// `NostrMultiRelayPublicationDiscoveryPublisher.js`'s OWN CONSTRUCTOR
// ALREADY HOLDS, 0.9.446's OWN SECTION C ALREADY PROVED. An empty array, or
// an array whose every entry normalizes away to nothing, throws — "no
// relays configured" is represented by having no
// `NostrPublicationRelaySetConfiguration` instance at all (this class is
// simply never constructed for that state), never by an empty, "disabled"
// instance. See storage/NostrPublicationRelaySetConfigurationStore.js's own
// header for how a caller represents and resolves that absence.
//
// A VALUE OBJECT, NEVER A DEFAULT-INJECTING ONE — THE IDENTICAL RESTRAINT
// `NostrRelayConfiguration.js`/`ArweaveGatewayConfiguration.js` ALREADY HOLD.
// This class validates exactly the `relayUrls` it is given; it never
// substitutes `DEFAULT_NOSTR_PUBLICATION_RELAY_URL` for a missing or empty
// list. "The user configured nothing" is a fact a CALLER (this file's own
// sibling store's `get()`, or the configuration provider built on top of
// it) represents by having no instance at all — never by this class quietly
// constructing a one-element default instance on a caller's behalf.
//
// `DEFAULT_NOSTR_PUBLICATION_RELAY_URL` IS ITS OWN CONSTANT — NEVER IMPORTED
// FROM `core/NostrRelayConfiguration.js`'s OWN `DEFAULT_NOSTR_RELAY_URL`,
// AND NEVER FROM `application/NostrPublicationDiscoveryPublisher.js`'s OWN
// `DEFAULT_RELAY_URL`. The three constants happen to hold the identical
// string value today — the same relay every Nostr-facing class in this
// codebase already hardcodes as its own default — but per this codebase's
// own "no cross-import of a sibling's own constant" restraint (see
// `core/NostrRelayConfiguration.js`'s own header), each configuration
// boundary owns its own copy. This is specifically the constant a caller
// resolving "no publication relay set configured" falls back to — see
// `application/NostrPublicationRelaySetConfigurationProvider.js`'s own
// header for exactly where and how.
//
// DELIBERATELY EXCLUDED — NOT THIS FILE'S JOB.
// - **Persistence of any kind.** See
//   storage/NostrPublicationRelaySetConfigurationStore.js, this same
//   milestone, sibling file.
// - **A network call of any kind, ever, for any reason.** See "validation
//   is strict, modest, and shape-only," above.
// - **`timeout`/`retry`/`healthCheck`/`priority`/preferred-relay fields, or
//   any field beyond `relayUrls`.** Every configured relay is an equal fan-
//   out target — see "a set of independent fan-out targets," above.
// - **A settings UI, or any `ui/` import.** See
//   ui/views/NostrPublicationRelaySettingsView.js, this same milestone.
// - **Reading, discovery, or any relationship to
//   `core/NostrRelayConfiguration.js` beyond the one shared validation
//   predicate.** See "a separate object," above.
// - **Per-publication scoping of any kind.** This configuration is
//   application-wide infrastructure — "these are the application's Nostr
//   publication distribution surfaces," never "these are the relays for
//   this particular publication." No field here ever carries a
//   publicationId/objectId.
export function isValidNostrPublicationRelayUrl(value) {
    return isValidNostrRelayUrl(value);
}

// Normalizes `relayUrls` for construction — trims each entry, drops
// non-string/empty-after-trim entries, and collapses duplicates (by trimmed
// string equality) to their first occurrence, preserving configured order.
// Exported only for this file's own sibling store to reuse identically when
// re-hydrating a persisted payload — never intended as a general-purpose
// utility elsewhere.
export function normalizeNostrPublicationRelayUrls(relayUrls) {
    if (!Array.isArray(relayUrls)) return [];
    const seen = new Set();
    const normalized = [];
    for (const relayUrl of relayUrls) {
        if (typeof relayUrl !== 'string') continue;
        const trimmed = relayUrl.trim();
        if (trimmed.length === 0 || seen.has(trimmed)) continue;
        seen.add(trimmed);
        normalized.push(trimmed);
    }
    return normalized;
}

export class NostrPublicationRelaySetConfiguration {
    constructor({ relayUrls } = {}) {
        if (!Array.isArray(relayUrls) || relayUrls.length === 0) {
            throw new Error('NostrPublicationRelaySetConfiguration: a non-empty relayUrls array is required');
        }
        const normalized = normalizeNostrPublicationRelayUrls(relayUrls);
        if (normalized.length === 0) {
            throw new Error('NostrPublicationRelaySetConfiguration: relayUrls must contain at least one non-empty relay URL');
        }
        for (const relayUrl of normalized) {
            if (!isValidNostrRelayUrl(relayUrl)) {
                throw new Error(`NostrPublicationRelaySetConfiguration: invalid relayUrl "${relayUrl}"`);
            }
        }
        this._relayUrls = Object.freeze(normalized);
        Object.freeze(this);
    }

    get relayUrls() { return this._relayUrls; }

    // Value equality, never identity — the same convention this codebase's
    // other configuration value objects already hold. Order matters: two
    // configurations naming the same relays in a different order are NOT
    // equal — configured order is preserved, deliberately, for stable
    // rendering (see this file's own header), even though it carries no
    // fan-out-priority meaning.
    equals(other) {
        return other instanceof NostrPublicationRelaySetConfiguration &&
            other._relayUrls.length === this._relayUrls.length &&
            other._relayUrls.every((relayUrl, index) => relayUrl === this._relayUrls[index]);
    }

    // Plain-data convenience for
    // storage/NostrPublicationRelaySetConfigurationStore.js — this class
    // itself never calls it, and never reads or writes any storage key on
    // its own.
    toJSON() {
        return { relayUrls: [...this._relayUrls] };
    }
}

export { DEFAULT_NOSTR_PUBLICATION_RELAY_URL };
