import { readFile } from 'node:fs/promises';

import { NostrRelayConfiguration, DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryServices } from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';

// 0.9.369 — Nostr Relay Configuration Discovery Integration.
// See docs/Roadmap.md, "0.9.369 — Nostr Relay Configuration Boundary."
//
// 0.9.368's own audit named the gap: `ui/main.js` constructs exactly one
// `nostrRelayQueryClient` transport and threads it into all three read-path
// discovery classes (World Encounter decentralized discovery, Snapshot
// discovery, Place Naming discovery) with no `relayUrl` override anywhere,
// so all three silently inherit `wss://relay.damus.io`. This file proves
// both halves this milestone closes: the composition-level plumbing
// actually threads a configured `relayUrl` all the way to the real adapter
// classes (Sections A/B/C, against the real, unmodified composition
// functions and classes), and `ui/main.js` itself — the one real
// composition root — is now wired to do exactly that, and only for
// read/discovery, never for publishing (Section D, a source sweep of the
// real file).
//
// Section A: a configured relayUrl reaches NostrDiscoveryQueryService
//            through composeDecentralizedWorldEncounterMaterialDiscoveryServices()
// Section B: a configured relayUrl reaches NostrSnapshotDiscoveryQueryService
//            through composeDiscoverSnapshotRuntime()
// Section C: a configured relayUrl reaches NostrPlaceNamingDiscoverySource
// Section D: ui/main.js source sweep — the resolved relayUrl reaches TWO
//            of the three read-path call sites (Snapshot discovery, Place
//            Naming discovery), and never reaches any Nostr publishing
//            call site
// Section E: end-to-end resolution — store absent -> deployment default;
//            store configured -> the user's own override, no merge, for
//            all three consumers at once
// Section F: isolation — changing this configuration structurally cannot
//            reach Arweave, IPFS, Bitcoin, Base, or peer connectivity
//
// AMENDED BY 0.9.451 — Nostr Publication Relay Set Discovery Alignment.
// The THIRD read-path call site, World Encounter (Publication) discovery,
// no longer receives `resolvedNostrRelayUrl` at all: `application/
// DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`'s own
// `nostrRelayUrls` (plural) amendment now receives `resolvedNostrPublicationRelayUrls`
// instead (0.9.447's own write-side relay SET, already reachable from
// distribution since 0.9.450) — see that file's own 0.9.451 header for why.
// Section D below is amended to assert this directly rather than silently
// going stale; Section A (below) still proves the composition function's
// own SINGULAR `nostrRelayUrl` parameter works exactly as before when
// called directly (it is simply no longer how `ui/main.js` itself calls
// it for Publication discovery) — the composition function's backward
// compatibility, not `ui/main.js`'s own real wiring, is what Section A
// verifies.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// A queryImpl double that never actually needs to resolve — every section
// here asserts against the CONSTRUCTED instance's own relayUrl, never
// against a network round-trip, matching every sibling read-path class's
// own "queryImpl is an injection point" restraint.
async function fakeQueryImpl() { return []; }

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    // ===============================================================
    // Section A — a configured relayUrl reaches NostrDiscoveryQueryService
    // through composeDecentralizedWorldEncounterMaterialDiscoveryServices(),
    // the real, unmodified World Encounter discovery composition function.
    // ===============================================================
    {
        const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: fakeQueryImpl,
            nostrRelayUrl: 'wss://my-world-encounter-relay.example'
        });
        assert(nostr instanceof NostrDiscoveryQueryService, 'A1. a usable queryImpl still produces a real NostrDiscoveryQueryService');
        assert(nostr.relayUrl === 'wss://my-world-encounter-relay.example', 'A2. the configured relayUrl reaches the constructed NostrDiscoveryQueryService verbatim, through the unmodified composition function');
        console.log('✓ Section A: a configured relayUrl reaches application/NostrDiscoveryQueryService.js through application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js unmodified');
    }

    // ===============================================================
    // Section B — a configured relayUrl reaches
    // NostrSnapshotDiscoveryQueryService through composeDiscoverSnapshotRuntime(),
    // the real, unmodified Snapshot discovery composition function.
    // ===============================================================
    {
        const { queryService } = composeDiscoverSnapshotRuntime({
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: fakeQueryImpl, relayUrl: 'wss://my-snapshot-relay.example' }
        });
        assert(queryService instanceof NostrSnapshotDiscoveryQueryService, 'B1. a usable queryImpl still produces a real NostrSnapshotDiscoveryQueryService');
        assert(queryService.relayUrl === 'wss://my-snapshot-relay.example', 'B2. the configured relayUrl reaches the constructed NostrSnapshotDiscoveryQueryService verbatim, through the unmodified composition function');
        console.log('✓ Section B: a configured relayUrl reaches application/NostrSnapshotDiscoveryQueryService.js through application/DiscoverSnapshotRuntimeComposition.js unmodified');
    }

    // ===============================================================
    // Section C — a configured relayUrl reaches
    // NostrPlaceNamingDiscoverySource. ui/main.js constructs this class
    // directly (there is no dedicated composition function for it, unlike
    // Sections A/B), so this section proves the class itself, the exact
    // shape ui/main.js's own construction uses.
    // ===============================================================
    {
        const placeNamingSource = new NostrPlaceNamingDiscoverySource({ queryImpl: fakeQueryImpl, relayUrl: 'wss://my-place-naming-relay.example' });
        assert(placeNamingSource.relayUrl === 'wss://my-place-naming-relay.example', 'C1. the configured relayUrl reaches the constructed NostrPlaceNamingDiscoverySource verbatim');
        console.log('✓ Section C: a configured relayUrl reaches application/NostrPlaceNamingDiscoverySource.js through direct construction, the exact shape ui/main.js uses');
    }

    // ===============================================================
    // Section D — ui/main.js source sweep: the resolved relayUrl actually
    // reaches TWO of the three read-path call sites (Snapshot discovery,
    // Place Naming discovery), World Encounter (Publication) discovery
    // instead receives the resolved publication relay SET (0.9.451), and
    // resolvedNostrRelayUrl never reaches any Nostr publishing call site —
    // run against the real file, never a guess from this file's own prose.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');

        assert(mainSource.includes("import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';"), 'D1. ui/main.js imports NostrRelayConfigurationStore');
        assert(mainSource.includes("import { DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';"), 'D2. ui/main.js imports DEFAULT_NOSTR_RELAY_URL');
        assert(mainSource.includes('new NostrRelayConfigurationStore('), 'D3. ui/main.js actually constructs a NostrRelayConfigurationStore, never just imports the class unused');
        assert(/nostrRelayConfigurationStore\.get\(\)\s*\|\|\s*\{\s*relayUrl:\s*DEFAULT_NOSTR_RELAY_URL\s*\}/.test(mainSource), 'D4. ui/main.js resolves "absent -> default, present -> override" exactly — never a merge, never silently dropping the persisted store\'s own value');

        const mainStoreConstructions = (mainSource.match(/new NostrRelayConfigurationStore\(/g) || []).length;
        assert(mainStoreConstructions === 1, `D5. ui/main.js constructs exactly one NostrRelayConfigurationStore instance — found ${mainStoreConstructions}`);

        // AMENDED BY 0.9.451 — World Encounter (Publication) discovery no
        // longer receives resolvedNostrRelayUrl; it receives the resolved
        // publication relay SET instead. See this file's own 0.9.451 header.
        assert(!/nostrQueryImpl:\s*nostrRelayQueryClient,\s*\n\s*nostrRelayUrl:\s*resolvedNostrRelayUrl/.test(mainSource), 'D6. composeDecentralizedWorldEncounterMaterialDiscoveryServices() (World Encounter discovery) no longer receives resolvedNostrRelayUrl — 0.9.451 moved it onto the publication relay set instead');
        assert(/nostrQueryImpl:\s*nostrRelayQueryClient,\s*\n\s*nostrRelayUrls:\s*resolvedNostrPublicationRelayUrls/.test(mainSource), 'D6b. composeDecentralizedWorldEncounterMaterialDiscoveryServices() (World Encounter discovery) instead receives resolvedNostrPublicationRelayUrls (0.9.451)');
        assert(/nostrSnapshotDiscoveryQueryServiceOptions:\s*\{\s*queryImpl:\s*nostrRelayQueryClient,\s*relayUrl:\s*resolvedNostrRelayUrl\s*\}/.test(mainSource), 'D7. composeDiscoverSnapshotRuntime() (Snapshot discovery) still receives the resolved relayUrl, untouched by 0.9.451');
        assert(/new NostrPlaceNamingDiscoverySource\(\{\s*queryImpl:\s*nostrRelayQueryClient,\s*relayUrl:\s*resolvedNostrRelayUrl\s*\}\)/.test(mainSource), 'D8. NostrPlaceNamingDiscoverySource (Place Naming discovery) still receives the resolved relayUrl, untouched by 0.9.451');

        // Publishing (write-path) call sites: none may reference
        // resolvedNostrRelayUrl — see core/NostrRelayConfiguration.js's own
        // header, "applied only to read/discovery." Publisher class names
        // DO appear in this file's own prose comments (including this
        // milestone's own 0.9.369 comment, explaining the boundary by
        // name) — so this checks CODE lines only, never comment text, and
        // asks the narrower, decisive question: does any line that
        // constructs/calls a publisher also mention resolvedNostrRelayUrl?
        assert(!/createNostrInjectedProviderPublisher\([^)]*resolvedNostrRelayUrl/.test(mainSource), 'D9. createNostrInjectedProviderPublisher() (Nostr publishing) never references the resolved relayUrl');
        const codeLines = mainSource.split('\n').filter((line) => !/^\s*\/\//.test(line));
        const publisherNames = ['NostrPublicationDiscoveryPublisher', 'NostrSnapshotDiscoveryPublisher', 'NostrPlaceNamingDiscoveryPublisher'];
        for (const publisherName of publisherNames) {
            const offendingLine = codeLines.find((line) => line.includes(publisherName) && line.includes('resolvedNostrRelayUrl'));
            assert(!offendingLine, `D10 (${publisherName}). no CODE line in ui/main.js both references this write-path publisher and the resolved relayUrl — confirming resolvedNostrRelayUrl never reaches it through this file`);
        }

        console.log('✓ Section D: ui/main.js source sweep confirms the resolved relayUrl reaches the two remaining read-path composition call sites (World Encounter discovery now receives the publication relay set instead, per 0.9.451), and no Nostr publishing call site references it');
    }

    // ===============================================================
    // Section E — end-to-end resolution against the real store and
    // constant this milestone ships: store absent -> deployment default;
    // store configured -> the user's own override, no merge — proven for
    // all three consumers constructed from the same resolved value at once.
    // ===============================================================
    {
        function resolveEffectiveRelayUrl(store) {
            return (store.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        }

        // Absent: all three resolve to the deployment default.
        const storeAbsent = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        const resolvedAbsent = resolveEffectiveRelayUrl(storeAbsent);
        assert(resolvedAbsent === DEFAULT_NOSTR_RELAY_URL, 'E1. no user configuration -> the deployment default, exactly wss://relay.damus.io');

        const { nostr: nostrAbsent } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: fakeQueryImpl, nostrRelayUrl: resolvedAbsent });
        const { queryService: snapshotQueryServiceAbsent } = composeDiscoverSnapshotRuntime({ nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: fakeQueryImpl, relayUrl: resolvedAbsent } });
        const placeNamingSourceAbsent = new NostrPlaceNamingDiscoverySource({ queryImpl: fakeQueryImpl, relayUrl: resolvedAbsent });
        assert(nostrAbsent.relayUrl === DEFAULT_NOSTR_RELAY_URL, 'E2. World Encounter discovery resolves to the deployment default');
        assert(snapshotQueryServiceAbsent.relayUrl === DEFAULT_NOSTR_RELAY_URL, 'E3. Snapshot discovery resolves to the deployment default');
        assert(placeNamingSourceAbsent.relayUrl === DEFAULT_NOSTR_RELAY_URL, 'E4. Place Naming discovery resolves to the deployment default');

        // Configured: all three resolve to the SAME user override.
        const storeConfigured = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        storeConfigured.save(new NostrRelayConfiguration({ relayUrl: 'wss://alternative.example' }));
        const resolvedConfigured = resolveEffectiveRelayUrl(storeConfigured);
        assert(resolvedConfigured === 'wss://alternative.example', 'E5. a saved configuration -> the user\'s own override, never merged with the default');

        const { nostr: nostrConfigured } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: fakeQueryImpl, nostrRelayUrl: resolvedConfigured });
        const { queryService: snapshotQueryServiceConfigured } = composeDiscoverSnapshotRuntime({ nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: fakeQueryImpl, relayUrl: resolvedConfigured } });
        const placeNamingSourceConfigured = new NostrPlaceNamingDiscoverySource({ queryImpl: fakeQueryImpl, relayUrl: resolvedConfigured });
        assert(nostrConfigured.relayUrl === 'wss://alternative.example', 'E6. World Encounter discovery becomes the alternative relay, no fallback to the default alongside it');
        assert(snapshotQueryServiceConfigured.relayUrl === 'wss://alternative.example', 'E7. Snapshot discovery becomes the alternative relay, no fallback to the default alongside it');
        assert(placeNamingSourceConfigured.relayUrl === 'wss://alternative.example', 'E8. Place Naming discovery becomes the alternative relay, no fallback to the default alongside it');

        console.log('✓ Section E: end-to-end, "absence stays meaningful" — an unconfigured store resolves the deployment default for all three consumers, a configured store resolves the user\'s own explicit replacement for all three, and the two are never combined');
    }

    // ===============================================================
    // Section F — isolation: changing this configuration structurally
    // cannot reach Arweave, IPFS, Bitcoin, Base, or peer connectivity — the
    // configuration boundary and its store import nothing beyond their own
    // declared, minimal seam.
    // ===============================================================
    {
        const configSource = await source('core/NostrRelayConfiguration.js');
        const configExecutable = configSource.replace(/\/\/.*$/gm, '');
        assert(!/Arweave|Ipfs|IPFS|Bitcoin|Base\b|peer\//i.test(configExecutable.replace(/PlaceNaming/g, '')), 'F1. core/NostrRelayConfiguration.js has no Arweave/IPFS/Bitcoin/Base/peer dependency of any kind');

        const storeSource = await source('storage/NostrRelayConfigurationStore.js');
        const storeExecutable = storeSource.replace(/\/\/.*$/gm, '');
        assert(!/Arweave|Ipfs|IPFS|Bitcoin|Base\b|peer\//i.test(storeExecutable), 'F2. storage/NostrRelayConfigurationStore.js has no Arweave/IPFS/Bitcoin/Base/peer dependency of any kind');

        // Isolation from Nostr PUBLISHING specifically: the value object and
        // store never import any of the three Nostr write-path publishers.
        assert(!/Publisher/.test(configExecutable), 'F3. core/NostrRelayConfiguration.js has no Publisher dependency of any kind');
        assert(!/Publisher/.test(storeExecutable), 'F4. storage/NostrRelayConfigurationStore.js has no Publisher dependency of any kind');

        console.log('✓ Section F: neither the configuration value object nor its persistence store imports anything Arweave/IPFS/Bitcoin/Base/peer-connectivity-shaped, or any Nostr publishing collaborator');
    }

    console.log('\n✅ All Nostr Relay Configuration Discovery Integration tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
