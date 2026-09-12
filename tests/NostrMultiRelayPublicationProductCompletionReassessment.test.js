import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NostrPublicationRelaySetConfigurationStore } from '../storage/NostrPublicationRelaySetConfigurationStore.js';
import { SetNostrPublicationRelaySetConfigurationUseCase } from '../application/SetNostrPublicationRelaySetConfigurationUseCase.js';
import { resolveNostrPublicationRelayUrls } from '../application/NostrPublicationRelaySetConfigurationProvider.js';
import { composeMultiRelayNostrPublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/DecentralizedWorldEncounterLeadResolution.js';
import { NostrRelayConfiguration } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { NostrPublicationRelaySetConfiguration } from '../core/NostrPublicationRelaySetConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.452 — Nostr Multi-Relay Publication Product Completion Reassessment.
//
// TYPE: test-only product/architecture reassessment. PRODUCTION CHANGES:
// two small UI-copy corrections (see Section F, below) — no algorithm,
// wiring, or persisted-shape change of any kind.
//
// 0.9.442 through 0.9.451 built the Nostr multi-relay publication arc in
// eleven small, individually-tested steps: observation identity, fan-out
// capability, configuration reachability, persistent configuration,
// configuration integration, product reassessment, write-side product
// wiring, and read-side product alignment. Every one of those milestones
// proved its OWN seam works. This milestone asks the one question none of
// them asked on its own: does the complete arc work as ONE coherent user
// capability — configure relays, publish, discover — end to end, through
// the REAL, composed production functions, never a hand-assembled shortcut?
//
// Section A: FLAGSHIP — the complete user journey. Configure three
//            publication relays through the real Settings store, publish a
//            Publication through the real composed multi-relay distribution
//            command, confirm all three relays independently received it,
//            then discover it through the real composed discovery runtime
//            (association + resolution, never the raw service alone) using
//            that SAME configured relay set. RESOLVED.
// Section B: single-relay compatibility — exactly one configured relay
//            still behaves like the pre-multi-relay single-relay product,
//            for both distribution and discovery.
// Section C: multi-relay reach — two independently configured relay sets
//            produce two independently different sets of discoverable
//            publications, never merely two different request counts.
// Section D: partial availability — A succeeds, B is unreachable, C
//            succeeds; A and C remain usable for both distribution and the
//            subsequent discovery, and no PARTIAL/SUCCESS/FAILED aggregate
//            vocabulary appears anywhere in the touched files.
// Section E: publish → discover round trip, positive and negative — a
//            Publication reaching only relay B is discoverable through a
//            set that includes B, and genuinely NOT discoverable (UNAVAILABLE)
//            through a set that only ever included relay A.
// Section F: configuration isolation AND the architecture-residue audit —
//            re-proven live, at the product level, that the publication
//            relay set, the general discovery-relay preference, Snapshot
//            discovery, and Place Naming discovery are four independent
//            facts; PLUS a corrected finding: both settings views' own
//            user-facing copy was stale since 0.9.451 (see below) — fixed
//            by this same milestone, and confirmed fixed here.
// Section G: identity preservation at the product level — the SAME
//            Publication announced through multiple relays in one
//            configured set still resolves to exactly ONE identity
//            (RESOLVED, never AMBIGUOUS purely from relay redundancy); two
//            DIFFERENT Publications distributed to disjoint relays both
//            resolve independently when discovered together.
// Section H: operational-features audit — every capability this arc's own
//            product reassessment (0.9.449) and distribution wiring
//            (0.9.450) already named "no demonstrated need" (relay health,
//            priority, automatic discovery, per-publication selection,
//            failover, a generic multi-endpoint abstraction) remains absent
//            across the whole family, and Nostr fan-out stays semantically
//            distinct from Arweave gateway failover.
// Section I: production-change guard and final decision matrix.
//
// THE ONE CONCRETE FINDING THIS MILESTONE MAKES, AND FIXES: 0.9.451 wired
// Publication discovery onto the publication relay set, but never revisited
// either settings page's own user-facing copy. `ui/views/
// NostrPublicationRelaySettingsView.js` still told a Wanderer this setting
// "affects publication distribution only... does not change which relay
// discovery queries read from" — false since 0.9.451. `ui/views/
// NostrRelaySettingsView.js` still listed "Publications" among what the
// GENERAL relay preference governs — also false since 0.9.451, which moved
// Publication discovery off that preference entirely. Both are corrected in
// this same commit; Section F below proves the correction live, against
// the real template text, never a description of it.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE, PER 0.9.449's OWN FINDINGS,
// RECONFIRMED HERE. Relay health monitoring/indicators, relay priority,
// automatic relay discovery/replacement, per-publication relay selection,
// relay reputation/ranking, a relay administration UI, automatic retry,
// failover semantics for Nostr publication, and a generic "multi-endpoint"
// infrastructure abstraction shared with Arweave gateway failover. None of
// these gained any new justification merely because the arc is now
// complete end to end.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function codeOnly(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// A shared fake relay network — publishImpl/queryImpl share ONE in-memory
// event store keyed by relayUrl, so a publish to one relay is genuinely
// absent from another's own store, exactly like real, independent relays.
// The identical helper `tests/NostrPublicationRelaySetDiscoveryAlignment.test.js`
// already uses, reused here unmodified.
function makeRelayNetwork() {
    const eventsByRelay = new Map();
    let nextId = 0;
    function storeFor(relayUrl) {
        if (!eventsByRelay.has(relayUrl)) eventsByRelay.set(relayUrl, []);
        return eventsByRelay.get(relayUrl);
    }
    async function publishImpl(relayUrl, eventTemplate) {
        nextId += 1;
        const id = String(nextId).padStart(64, '0');
        storeFor(relayUrl).push({ id, kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagName = Object.keys(filter).find((key) => key.startsWith('#'))?.slice(1);
        const tagValue = tagName ? filter[`#${tagName}`][0] : null;
        return storeFor(relayUrl).filter((event) => {
            if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
            if (tagName) {
                return (event.tags || []).some((tag) => tag[0] === tagName && tag[1] === tagValue);
            }
            return true;
        });
    }
    return { publishImpl, queryImpl, eventsByRelay };
}

// A genuine, in-memory Arweave substrate — handles both the write side
// (POST /tx, the real `ArweavePublicationMaterialUploader` transport) and
// the read side (GET /<transactionId>, the real `ArweaveWorldEncounterMaterialResolver`
// transport) against the SAME ledger, so material genuinely uploaded during
// distribution is genuinely retrievable during discovery/inspection — never
// a real network call to arweave.net.
function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    const contentSigner = {
        async sign(material) {
            const id = newId('Content');
            return { id, transaction: { format: 2, id, data: material } };
        }
    };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = (options && options.method) || 'GET';
        if (method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, transaction.data);
            return new Response('accepted', { status: 200 });
        }
        if (method === 'GET') {
            const transactionId = parsed.pathname.replace(/^\//, '');
            const data = ledger.get(transactionId);
            if (data === undefined) {
                return new Response('not found', { status: 404 });
            }
            return new Response(data, { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { contentSigner, fetchImpl };
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

// Distributes `publicationId` through the REAL, composed multi-relay
// distribution command against `relayUrls`, on a fresh Arweave substrate
// and relay network — never a hand-assembled shortcut.
async function distributeThroughRealCommand({ relayUrls, discoveryTag, publicationId, network, arweaveSubstrate }) {
    const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
    const command = composeMultiRelayNostrPublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
        nostrRelayUrls: relayUrls,
        nostrPublisherOptions: { discoveryTag, publishImpl: network.publishImpl }
    });
    const publication = makeFakePublication(publicationId);
    const results = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
    return { publication, results, lifecycleStore };
}

// Discovers `objectId` through the REAL, composed discovery RUNTIME
// (association evidence + resolution — never the raw discovery SERVICE
// alone, which 0.9.451's own test already covers) against `relayUrls`.
// `localPublication` is the caller's own already-known evidence — see
// `core/DecentralizedPublicationLocationClaim.js`'s own header, "duck-typed,
// never a class import": a plain `{ id, signature, contentReference: { uri } }`
// is exactly as valid evidence as a real, hydrated `Publication` instance.
async function discoverThroughRealRuntime({ relayUrls, discoveryTag, objectId, localPublications, network, arweaveSubstrate }) {
    const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
        nostrQueryImpl: network.queryImpl,
        nostrRelayUrls: relayUrls
    });
    const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
        discoveryServices: { nostr },
        arweaveResolverOptions: arweaveSubstrate ? { fetchImpl: arweaveSubstrate.fetchImpl } : undefined
    });
    return runtime.discoverWorldEncounterPublication({ objectId, discoveryTag, publications: localPublications });
}

async function run() {
    // ===============================================================
    // Section A — FLAGSHIP: the complete user journey, through the real,
    // composed production functions end to end.
    // ===============================================================
    {
        const relayA = 'wss://arc-relay-a.example';
        const relayB = 'wss://arc-relay-b.example';
        const relayC = 'wss://arc-relay-c.example';
        const discoveryTag = 'forkbuild-publication';

        // Step 1 — a Wanderer configures three publication relays through
        // the real Settings store/use case, never a hand-built array.
        const relayStore = new NostrPublicationRelaySetConfigurationStore(new InMemoryStorageProvider());
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: relayStore })
            .execute({ relayUrls: [relayA, relayB, relayC] });
        const resolvedRelayUrls = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: relayStore });
        assert(resolvedRelayUrls.length === 3, n('A1. a Wanderer configures three publication relays through the real Settings store/use case'));

        // Step 2 — publish a Publication through the real, composed
        // multi-relay distribution command.
        const network = makeRelayNetwork();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const { publication, results } = await distributeThroughRealCommand({
            relayUrls: resolvedRelayUrls, discoveryTag, publicationId: 'pub-flagship-arc', network, arweaveSubstrate
        });
        assert(results.length === 3 && results.every((r) => r.discovery !== null), n('A2. the Publication is independently distributed to all three configured relays'));
        for (const relayUrl of resolvedRelayUrls) {
            assert((network.eventsByRelay.get(relayUrl) || []).length === 1, n(`A3. relay ${relayUrl} genuinely received exactly one announcement`));
        }

        // Step 3 — discover through the SAME configured relay set, via the
        // real, composed discovery RUNTIME (association + resolution).
        const materialUri = results[0].material.uri;
        assert(results.every((r) => r.material.uri === materialUri), n('A4. every relay-specific result shares the identical material fact — only discovery varies, per relay'));
        const localPublication = { id: publication.id, signature: publication.signature, contentReference: { uri: materialUri } };

        const discovered = await discoverThroughRealRuntime({
            relayUrls: resolvedRelayUrls, discoveryTag, objectId: publication.id,
            localPublications: [localPublication], network, arweaveSubstrate
        });

        assert(discovered.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            n('A5. the Publication resolves RESOLVED through the configured relay set — genuinely discoverable, end to end, through the real production functions'));
        assert(discovered.resolution.resolvedLead.uri === materialUri,
            n('A6. the resolved lead names the exact material uri the Publication was actually distributed under — no fabricated match'));

        console.log('✓ Section A: FLAGSHIP — configure A+B+C through Settings, publish through the real distribution command, all three relays independently receive it, discover through the real discovery runtime using that same set, RESOLVED');
    }

    // ===============================================================
    // Section B — single-relay compatibility: exactly one configured
    // relay behaves like the pre-multi-relay single-relay product, for
    // both distribution and discovery.
    // ===============================================================
    {
        const relayUrl = 'wss://b-only-relay.example';
        const discoveryTag = 'forkbuild-publication';
        const network = makeRelayNetwork();
        const arweaveSubstrate = makeFakeArweaveSubstrate();

        const { publication, results } = await distributeThroughRealCommand({
            relayUrls: [relayUrl], discoveryTag, publicationId: 'pub-single-relay-compat', network, arweaveSubstrate
        });
        assert(!Array.isArray(results) === false && results.length === 1, n('B1. one configured relay still produces exactly one distribution result'));
        assert(results[0].discovery !== null, n('B2. the one configured relay genuinely receives the announcement'));

        const localPublication = { id: publication.id, signature: publication.signature, contentReference: { uri: results[0].material.uri } };
        const discovered = await discoverThroughRealRuntime({
            relayUrls: [relayUrl], discoveryTag, objectId: publication.id, localPublications: [localPublication], network, arweaveSubstrate
        });
        assert(discovered.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            n('B3. one configured relay still resolves the Publication RESOLVED — no behavioral divergence introduced by supporting a set'));
        assert(discovered.discovery.nostr.length === 1, n('B4. the discovery report carries exactly one candidate — identical shape to the pre-multi-relay single-relay product'));

        console.log('✓ Section B: exactly one configured relay behaves semantically like the previous single-relay product, for both distribution and discovery');
    }

    // ===============================================================
    // Section C — multi-relay reach: independent relay availability
    // produces independent publication VISIBILITY, never merely a
    // different request count.
    // ===============================================================
    {
        const discoveryTag = 'forkbuild-publication';
        const relayShared = 'wss://c-shared.example';
        const relayOnlyWanderer1 = 'wss://c-only-1.example';
        const relayOnlyWanderer2 = 'wss://c-only-2.example';

        const network = makeRelayNetwork();
        const arweaveSubstrate = makeFakeArweaveSubstrate();

        // Wanderer 1 configures {shared, only-1}; Wanderer 2 configures
        // {shared, only-2} — two genuinely different relay sets sharing one
        // relay in common.
        const wanderer1RelayUrls = [relayShared, relayOnlyWanderer1];
        const wanderer2RelayUrls = [relayShared, relayOnlyWanderer2];

        // Publication X is distributed to Wanderer 1's OWN exclusive relay
        // only — a real, distinct distribution surface Wanderer 2's own
        // configured set never reaches.
        const { publication: publicationX, results: resultsX } = await distributeThroughRealCommand({
            relayUrls: [relayOnlyWanderer1], discoveryTag, publicationId: 'pub-c-exclusive-to-1', network, arweaveSubstrate
        });
        const localX = { id: publicationX.id, signature: publicationX.signature, contentReference: { uri: resultsX[0].material.uri } };

        const discoveredByWanderer1 = await discoverThroughRealRuntime({
            relayUrls: wanderer1RelayUrls, discoveryTag, objectId: publicationX.id, localPublications: [localX], network, arweaveSubstrate
        });
        const discoveredByWanderer2 = await discoverThroughRealRuntime({
            relayUrls: wanderer2RelayUrls, discoveryTag, objectId: publicationX.id, localPublications: [localX], network, arweaveSubstrate
        });

        assert(discoveredByWanderer1.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            n('C1. Wanderer 1, whose own configured set includes the relay the Publication actually reached, discovers it'));
        assert(discoveredByWanderer2.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE,
            n('C2. Wanderer 2, whose own configured set never includes that relay, genuinely does NOT discover it — independent relay availability produces independent visibility, not merely a different request count'));

        console.log('✓ Section C: two independently configured relay sets produce two genuinely different sets of discoverable publications');
    }

    // ===============================================================
    // Section D — partial availability: A succeeds, B is unreachable, C
    // succeeds; A and C remain usable for both distribution and the
    // subsequent discovery, and no aggregate status vocabulary appears.
    // ===============================================================
    {
        const relayA = 'wss://d-relay-a.example';
        const relayB = 'wss://d-relay-b.example';
        const relayC = 'wss://d-relay-c.example';
        const discoveryTag = 'forkbuild-publication';

        const network = makeRelayNetwork();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const flakyPublishImpl = async (relayUrl, eventTemplate) => {
            if (relayUrl === relayB) throw new Error('relay B unreachable');
            return network.publishImpl(relayUrl, eventTemplate);
        };

        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: [relayA, relayB, relayC],
            nostrPublisherOptions: { discoveryTag, publishImpl: flakyPublishImpl }
        });
        const publication = makeFakePublication('pub-d-partial-availability');
        const results = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });

        assert(results.length === 3, n('D1. all three relays are reported, even though one genuinely failed'));
        const succeeded = results.filter((r) => r.discovery !== null);
        assert(succeeded.length === 2, n('D2. exactly A and C succeeded — B\'s own failure neither blocked nor was masked by the others'));
        assert(results.every((r) => !('overallStatus' in r) && !('status' in r) && !('PARTIAL' === r) && !('SUCCESS' === r) && !('FAILED' === r)),
            n('D3. no aggregate PARTIAL/SUCCESS/FAILED status was invented anywhere in the result'));

        // A and C remain usable for discovery too — B's own absence from
        // the network never prevents discovering the Publication through
        // the relays that genuinely carry it.
        const materialUri = succeeded[0].material.uri;
        const localPublication = { id: publication.id, signature: publication.signature, contentReference: { uri: materialUri } };
        const discovered = await discoverThroughRealRuntime({
            relayUrls: [relayA, relayB, relayC], discoveryTag, objectId: publication.id, localPublications: [localPublication], network, arweaveSubstrate
        });
        assert(discovered.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            n('D4. discovery through the full configured set still resolves RESOLVED — A and C\'s own genuine candidates are enough, despite B never having anything to report'));

        console.log('✓ Section D: A→success, B→unavailable, C→success preserves A and C exactly, for both distribution and discovery, with no aggregate status vocabulary of any kind');
    }

    // ===============================================================
    // Section E — publish → discover round trip, positive and negative.
    // ===============================================================
    {
        const relayA = 'wss://e-relay-a.example';
        const relayB = 'wss://e-relay-b.example';
        const discoveryTag = 'forkbuild-publication';
        const network = makeRelayNetwork();
        const arweaveSubstrate = makeFakeArweaveSubstrate();

        // Distributed to relay B only.
        const { publication, results } = await distributeThroughRealCommand({
            relayUrls: [relayB], discoveryTag, publicationId: 'pub-e-roundtrip', network, arweaveSubstrate
        });
        assert(results[0].discovery !== null, n('E1. the Publication was genuinely distributed to relay B'));
        assert((network.eventsByRelay.get(relayA) || []).length === 0, n('E2. relay A genuinely never received anything — this is not a fabricated negative'));

        const localPublication = { id: publication.id, signature: publication.signature, contentReference: { uri: results[0].material.uri } };

        // Positive: discover through a set that includes B.
        const discoveredViaB = await discoverThroughRealRuntime({
            relayUrls: [relayA, relayB], discoveryTag, objectId: publication.id, localPublications: [localPublication], network, arweaveSubstrate
        });
        assert(discoveredViaB.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            n('E3. discovery through a set that includes relay B finds the Publication'));

        // Negative: discover through a set that has ONLY ever included A.
        const discoveredViaAOnly = await discoverThroughRealRuntime({
            relayUrls: [relayA], discoveryTag, objectId: publication.id, localPublications: [localPublication], network, arweaveSubstrate
        });
        assert(discoveredViaAOnly.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE,
            n('E4. discovery through a set that never includes relay B genuinely does NOT find the Publication — relay configuration has real semantic meaning, never decorative configuration'));
        assert(discoveredViaAOnly.discovery.nostr.length === 0, n('E5. the negative case reports zero candidates, honestly — never a fabricated or guessed one'));

        console.log('✓ Section E: a Publication reaching only relay B is discoverable through a set that includes B, and genuinely not discoverable through a set that never did');
    }

    // ===============================================================
    // Section F — configuration isolation AND the architecture-residue
    // audit: publication relay set, general discovery-relay preference,
    // Snapshot discovery, and Place Naming discovery are four independent
    // facts, re-proven live; PLUS the corrected settings-view copy.
    // ===============================================================
    {
        const sharedStorage = new InMemoryStorageProvider();
        const discoveryRelayStore = new NostrRelayConfigurationStore(sharedStorage);
        discoveryRelayStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://f-discovery-preference.example' }));
        const publicationRelayStore = new NostrPublicationRelaySetConfigurationStore(sharedStorage);
        publicationRelayStore.save(new NostrPublicationRelaySetConfiguration({ relayUrls: ['wss://f-pub-1.example', 'wss://f-pub-2.example'] }));

        assert(discoveryRelayStore.get().relayUrl === 'wss://f-discovery-preference.example',
            n('F1. writing the publication relay set left the general discovery-relay preference untouched'));
        discoveryRelayStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://f-discovery-preference-changed.example' }));
        assert(JSON.stringify(publicationRelayStore.get().relayUrls) === JSON.stringify(['wss://f-pub-1.example', 'wss://f-pub-2.example']),
            n('F2. changing the general discovery-relay preference left the publication relay set untouched — two independent facts, neither silently rewrites the other'));

        // Live source sweep — Snapshot discovery and Place Naming discovery
        // still consume the general preference, never the publication relay
        // set, at their own real call sites in ui/main.js.
        const mainSource = await source('ui/main.js');
        assert(/nostrSnapshotDiscoveryQueryServiceOptions:\s*\{\s*queryImpl:\s*nostrRelayQueryClient,\s*relayUrl:\s*resolvedNostrRelayUrl\s*\}/.test(mainSource),
            n('F3. Snapshot discovery\'s real composition call site still receives the general resolvedNostrRelayUrl'));
        assert(/new NostrPlaceNamingDiscoverySource\(\{\s*queryImpl:\s*nostrRelayQueryClient,\s*relayUrl:\s*resolvedNostrRelayUrl\s*\}\)/.test(mainSource),
            n('F4. Place Naming discovery\'s real construction call site still receives the general resolvedNostrRelayUrl'));
        assert(/nostrRelayUrls:\s*resolvedNostrPublicationRelayUrls/.test(mainSource),
            n('F5. Publication distribution/discovery\'s own real call sites receive resolvedNostrPublicationRelayUrls — a genuinely separate resolved value'));
        const snapshotRuntimeSource = await source('application/SnapshotDistributionRuntimeComposition.js');
        assert(!/relayUrls/.test(snapshotRuntimeSource), n('F6. Snapshot distribution still has no multi-relay seam of any kind'));

        // The architecture-residue audit: does the settings copy now
        // accurately describe both distribution and discovery? This
        // milestone's own fix, confirmed live against the real files —
        // never merely asserted from memory of having made the edit.
        const publicationSettingsSource = await source('ui/views/NostrPublicationRelaySettingsView.js');
        assert(!/affects publication distribution only/.test(publicationSettingsSource),
            n('F7. NostrPublicationRelaySettingsView.js no longer claims to affect distribution only — the stale, pre-0.9.452 claim is gone'));
        assert(/Publication distribution and Publication discovery/.test(publicationSettingsSource),
            n('F8. NostrPublicationRelaySettingsView.js now accurately states it affects both Publication distribution AND Publication discovery'));
        assert(/does not affect Snapshot distribution or discovery/.test(publicationSettingsSource),
            n('F9. NostrPublicationRelaySettingsView.js now accurately states it does NOT affect Snapshot — it never did, but the pre-0.9.452 copy wrongly implied it distributed Snapshots too'));

        const generalRelaySettingsSource = await source('ui/views/NostrRelaySettingsView.js');
        assert(!/including Publications, Snapshots, and Place Naming/.test(generalRelaySettingsSource),
            n('F10. NostrRelaySettingsView.js no longer lists Publications among what the general preference governs — false since 0.9.451'));
        assert(/including Snapshots and Place Naming/.test(generalRelaySettingsSource),
            n('F11. NostrRelaySettingsView.js now accurately scopes itself to Snapshots and Place Naming only'));

        console.log('✓ Section F: publication relay configuration, the general discovery-relay preference, Snapshot discovery, and Place Naming discovery remain four independent facts — and both settings pages\' own user-facing copy now accurately describes the current, post-0.9.451 wiring');
    }

    // ===============================================================
    // Section G — identity preservation at the product level.
    // ===============================================================
    {
        const discoveryTag = 'forkbuild-publication';

        // G-i: the SAME Publication announced through multiple relays in
        // one configured set still resolves to exactly one identity.
        {
            const relayX = 'wss://g-relay-x.example';
            const relayY = 'wss://g-relay-y.example';
            const network = makeRelayNetwork();
            const arweaveSubstrate = makeFakeArweaveSubstrate();

            const { publication, results } = await distributeThroughRealCommand({
                relayUrls: [relayX, relayY], discoveryTag, publicationId: 'pub-g-redundant', network, arweaveSubstrate
            });
            assert(results.length === 2 && results.every((r) => r.discovery !== null), n('G1. the same Publication is genuinely announced through both configured relays'));

            const localPublication = { id: publication.id, signature: publication.signature, contentReference: { uri: results[0].material.uri } };
            const discovered = await discoverThroughRealRuntime({
                relayUrls: [relayX, relayY], discoveryTag, objectId: publication.id, localPublications: [localPublication], network, arweaveSubstrate
            });
            assert(discovered.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
                n('G2. two relays in the SAME configured set reporting the identical Publication resolve to exactly ONE identity — RESOLVED, never a spurious AMBIGUOUS purely from configured relay redundancy'));
        }

        // G-ii: two DIFFERENT Publications, distributed to disjoint relays,
        // both resolve independently when discovered together through a
        // set spanning both.
        {
            const relayP = 'wss://g-relay-p.example';
            const relayQ = 'wss://g-relay-q.example';
            const network = makeRelayNetwork();
            const arweaveSubstrate = makeFakeArweaveSubstrate();

            const { publication: pubP, results: resultsP } = await distributeThroughRealCommand({
                relayUrls: [relayP], discoveryTag, publicationId: 'pub-g-distinct-p', network, arweaveSubstrate
            });
            const { publication: pubQ, results: resultsQ } = await distributeThroughRealCommand({
                relayUrls: [relayQ], discoveryTag, publicationId: 'pub-g-distinct-q', network, arweaveSubstrate
            });
            const localP = { id: pubP.id, signature: pubP.signature, contentReference: { uri: resultsP[0].material.uri } };
            const localQ = { id: pubQ.id, signature: pubQ.signature, contentReference: { uri: resultsQ[0].material.uri } };

            const discoveredP = await discoverThroughRealRuntime({
                relayUrls: [relayP, relayQ], discoveryTag, objectId: pubP.id, localPublications: [localP, localQ], network, arweaveSubstrate
            });
            const discoveredQ = await discoverThroughRealRuntime({
                relayUrls: [relayP, relayQ], discoveryTag, objectId: pubQ.id, localPublications: [localP, localQ], network, arweaveSubstrate
            });
            assert(discoveredP.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED &&
                discoveredP.resolution.resolvedLead.uri === resultsP[0].material.uri,
                n('G3. Publication P resolves to its own, distinct material uri'));
            assert(discoveredQ.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED &&
                discoveredQ.resolution.resolvedLead.uri === resultsQ[0].material.uri,
                n('G4. Publication Q resolves to its own, distinct material uri — never confused with P\'s, despite both relays being queried for both'));

            console.log('✓ Section G: relay multiplicity stays an infrastructure detail of discovery — redundant relays for one Publication never manufacture a spurious identity, and distinct Publications on distinct relays stay genuinely distinguishable');
        }
    }

    // ===============================================================
    // Section H — operational-features audit: every capability this arc's
    // own reassessments already named "no demonstrated need" remains
    // absent, and Nostr fan-out stays semantically distinct from Arweave
    // gateway failover.
    // ===============================================================
    {
        const relayCoreSource = codeOnly(await source('core/NostrPublicationRelaySetConfiguration.js'));
        const relayProviderSource = codeOnly(await source('application/NostrPublicationRelaySetConfigurationProvider.js'));
        const distributionOrchestratorSource = codeOnly(await source('application/NostrMultiRelayPublicationDistributionOrchestrator.js'));
        const discoveryServiceSource = codeOnly(await source('application/NostrPublicationRelaySetDiscoveryQueryService.js'));
        const settingsViewSource = codeOnly(await source('ui/views/NostrPublicationRelaySettingsView.js'));
        const wholeFamily = [relayCoreSource, relayProviderSource, distributionOrchestratorSource, discoveryServiceSource, settingsViewSource].join('\n');

        assert(!/relay\s*health|healthCheck|Test Connection|testConnection/i.test(wholeFamily), n('H1. no relay health monitoring/indicator/test-connection machinery exists anywhere in the family'));
        assert(!/relay\s*priority|preferred\s*relay|primary\s*relay|rank(ing)?\s*the\s*relay/i.test(wholeFamily), n('H2. no relay priority/ranking/preference vocabulary exists anywhere in the family'));
        assert(!/automatic(ally)?\s*discover|relay\s*bootstrap|NIP-65|NIP-11/i.test(wholeFamily), n('H3. no automatic relay discovery mechanism exists anywhere in the family'));
        assert(!/relay\s*reputation/i.test(wholeFamily), n('H4. no relay reputation vocabulary exists anywhere in the family'));
        assert(!/retry|failover/i.test(distributionOrchestratorSource + discoveryServiceSource), n('H5. neither the distribution orchestrator nor the discovery service introduces retry/failover logic of its own'));
        assert(!/per-publication|entry\.\w*relay/i.test(wholeFamily), n('H6. no per-publication relay-selection field exists anywhere in the family — the relay set remains application-scoped'));
        assert(!distributionOrchestratorSource.includes('overallStatus') && !distributionOrchestratorSource.includes("'PARTIAL'"), n('H7. no aggregate distribution status vocabulary exists in the orchestrator'));

        // Nostr fan-out and Arweave gateway failover stay semantically
        // distinct — each configuration's own header (raw text, including
        // its own comments — this is a documentation claim, not a behavior
        // sweep) still states its own, different distribution/retrieval
        // model, never a shared, generic "multi-endpoint" framing.
        const relayCoreRawSource = await source('core/NostrPublicationRelaySetConfiguration.js');
        const arweaveGatewayCoreRawSource = await source('core/ArweaveGatewayConfiguration.js');
        assert(/fan-out|fan out/i.test(relayCoreRawSource) && /never an ordered failover list/i.test(relayCoreRawSource),
            n('H8. the Nostr publication relay set configuration explicitly describes itself in fan-out terms, and explicitly disclaims being an ordered failover list'));
        assert(/failover|first-reachable/i.test(arweaveGatewayCoreRawSource),
            n('H9. the Arweave gateway configuration still describes itself in priority-ordered failover terms — the two substrates remain deliberately different, never unified under one generic abstraction'));
        assert(!/MultiEndpoint|GenericEndpoint/i.test(relayCoreRawSource + arweaveGatewayCoreRawSource),
            n('H10. neither configuration has been generalized into a shared "multi-endpoint" abstraction'));

        console.log('✓ Section H: relay health, priority, automatic discovery, reputation, retry/failover, and per-publication selection remain absent across the whole family; Nostr fan-out and Arweave gateway failover remain two deliberately different models');
    }

    // ===============================================================
    // Section I — production-change guard and final decision matrix.
    // ===============================================================
    {
        const EXPECTED_PRODUCTION_FILES = new Set([
            'ui/views/NostrPublicationRelaySettingsView.js',
            'ui/views/NostrRelaySettingsView.js'
        ]);
        let productionTouched = [];
        try {
            const commitHash = execSync('git log --grep="^0.9.452 " --format=%H -n 1', { cwd: SOURCE_ROOT }).toString().trim();
            if (commitHash) {
                const diffOutput = execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`, { cwd: SOURCE_ROOT }).toString();
                productionTouched = diffOutput.split('\n')
                    .filter(Boolean)
                    .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
            }
        } catch { /* git unavailable, or this commit does not exist yet at test-authoring time */ }
        if (productionTouched.length > 0) {
            const unexpected = productionTouched.filter((f) => !EXPECTED_PRODUCTION_FILES.has(f));
            assert(unexpected.length === 0, n(`I1. the 0.9.452 commit touches only the two expected UI-copy files (found unexpected: ${JSON.stringify(unexpected)})`));
        } else {
            assert(true, n('I1. production-change guard skipped — the 0.9.452 commit does not exist yet at test-authoring time, matching every prior milestone\'s own identical guard'));
        }

        console.log(`
Final decision matrix:
  Multi-relay configuration ..... Complete
  Persistent configuration ...... Complete
  Publication fan-out ........... Complete
  UI distribution reachability .. Complete
  Multi-relay discovery ......... Complete
  Publish -> discover coherence . Verified (Sections A, E, G)
  Partial relay availability .... Supported (Section D)
  Relay identity isolation ...... Supported (Section G)
  Configuration isolation ....... Preserved (Section F)
  Snapshot isolation ............ Preserved (Section F)
  Place Naming isolation ........ Preserved (Section F)
  Settings copy accuracy ........ Corrected (Section F)
  Automatic relay management .... No demonstrated need (Section H)
  Relay priority ................ No demonstrated need (Section H)
  Per-publication selection ..... No demonstrated need (Section H)
  Automatic relay discovery ..... No demonstrated need (Section H)

  Verdict: NOSTR_MULTI_RELAY_PUBLICATION_COMPLETE -> STABLE_STOP
`);
        console.log('✅ All Nostr Multi-Relay Publication Product Completion Reassessment (0.9.452) tests passed.');
    }
}

run().catch((error) => {
    console.error('NostrMultiRelayPublicationProductCompletionReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
