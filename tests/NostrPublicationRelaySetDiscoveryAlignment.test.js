import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { NostrPublicationRelaySetDiscoveryQueryService } from '../application/NostrPublicationRelaySetDiscoveryQueryService.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryServices } from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { NostrPublicationRelaySetConfiguration } from '../core/NostrPublicationRelaySetConfiguration.js';
import { NostrPublicationRelaySetConfigurationStore } from '../storage/NostrPublicationRelaySetConfigurationStore.js';
import { resolveNostrPublicationRelayUrls } from '../application/NostrPublicationRelaySetConfigurationProvider.js';
import { NostrRelayConfiguration, DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.451 — Nostr Publication Relay Set Discovery Alignment.
//
// TYPE: production implementation. SCOPE: Nostr Publication discovery only.
//
// 0.9.449's own product reassessment named two halves of one gap: a
// configured publication relay set that DISTRIBUTION never reached
// (write-side), and, by the same logic, a configured publication relay set
// that DISCOVERY never queries either (read-side). 0.9.450 closed the
// write-side half. This milestone closes the read-side half: World
// Encounter (Publication) discovery now consumes the SAME resolved
// publication relay set 0.9.450's own distribution wiring already reads,
// through a new, additive seam — `application/
// NostrPublicationRelaySetDiscoveryQueryService.js` — rather than by
// widening `application/NostrDiscoveryQueryService.js` itself or merging
// publication configuration with the general discovery-relay preference.
//
// Section A: current (pre-0.9.451-call-site) discovery behavior, proven
//            directly against the composition function's own singular
//            fallback — still exactly what it always was.
// Section B: publication configuration propagation — a persisted 3-relay
//            set reaches the constructed discovery service, end to end.
// Section C: single-relay compatibility — one configured relay reports
//            identical candidates to the plain single-relay service.
// Section D: multi-relay discovery — every configured relay is genuinely
//            queried.
// Section E: FLAGSHIP — publish -> relay B -> discover using the
//            publication relay set -> publication found.
// Section F: independent relay results — one unreachable relay never hides
//            another relay's own genuine result.
// Section G: configuration isolation — publication relay configuration and
//            discovery-relay configuration never cross-write each other.
// Section H: identity preservation — no relay-ownership vocabulary leaks
//            into a candidate, and multiple relays reporting the identical
//            uri collapse to one lead, never a spurious AMBIGUOUS.
// Section I: cross-role isolation — Snapshot discovery, Place Naming
//            discovery, Arweave, and Bitcoin stay untouched.
// Section J: no second source of truth — the effective relay list comes
//            from resolveNostrPublicationRelayUrls() alone.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE, PER 0.9.449's OWN FINDINGS.
// Relay health checks, relay priority/ranking, automatic relay discovery,
// per-publication relay selection, and retry policy — none of these gained
// any new justification merely because discovery now queries more than one
// relay.

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

// A shared fake relay network — `publishImpl`/`queryImpl` share the SAME
// in-memory event store, keyed by relayUrl, so a publish to one relay is
// genuinely absent from another's own store, exactly like real, independent
// relays. Both functions share this file's own "queryImpl/publishImpl are
// injection points" restraint every real class in this chain already holds
// — no real network, no real WebSocket, anywhere in this file.
function makeFakeRelayNetwork() {
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

function makeEnvelope(overrides = {}) {
    return describeDecentralizedDiscoveryEnvelope({
        protocol: 'forkbuild',
        version: 1,
        kind: WorldEncounterKind.PUBLICATION,
        objectId: 'pub-alignment-1',
        uri: 'ar://' + 'x'.repeat(43),
        ...overrides
    });
}

async function run() {
    // ===============================================================
    // Section A — current discovery behavior: the composition function's
    // own SINGULAR fallback (used whenever a caller supplies no
    // `nostrRelayUrls`) is exactly what it always was, byte-for-byte.
    // ===============================================================
    {
        const network = makeFakeRelayNetwork();
        const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: network.queryImpl,
            nostrRelayUrl: 'wss://single-relay.example'
        });
        assert(nostr instanceof NostrDiscoveryQueryService, 'A1. with no nostrRelayUrls supplied, the composition still builds the plain single-relay NostrDiscoveryQueryService, unchanged');
        assert(!(nostr instanceof NostrPublicationRelaySetDiscoveryQueryService), 'A2. …never the new relay-set service, when no relay set was supplied');
        assert(nostr.relayUrl === 'wss://single-relay.example', 'A3. the singular relayUrl reaches it verbatim, exactly as before 0.9.451');
        console.log('✓ Section A: the pre-0.9.451 singular-relay discovery path is untouched');
    }

    // ===============================================================
    // Section B — publication configuration propagation: a persisted
    // 3-relay publication relay set reaches the constructed discovery
    // service end to end, through the SAME provider 0.9.450 already reuses
    // for distribution — never a second, parallel resolution path.
    // ===============================================================
    {
        const relayA = 'wss://relay-a.example';
        const relayB = 'wss://relay-b.example';
        const relayC = 'wss://relay-c.example';

        const store = new NostrPublicationRelaySetConfigurationStore(new InMemoryStorageProvider());
        store.save(new NostrPublicationRelaySetConfiguration({ relayUrls: [relayA, relayB, relayC] }));
        const resolved = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store });
        assert(resolved.length === 3 && resolved[0] === relayA && resolved[1] === relayB && resolved[2] === relayC,
            n('B1. the provider resolves exactly the persisted 3-relay set, in order'));

        const network = makeFakeRelayNetwork();
        const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: network.queryImpl,
            nostrRelayUrls: resolved
        });
        assert(nostr instanceof NostrPublicationRelaySetDiscoveryQueryService, n('B2. a resolved multi-relay set builds the new relay-set discovery service'));
        assert(JSON.stringify(nostr.relayUrls) === JSON.stringify([relayA, relayB, relayC]),
            n('B3. the effective relay set reaches the constructed service verbatim, in order — the SAME array the provider resolved, not a re-derived one'));

        console.log('✓ Section B: a persisted publication relay set propagates end to end into the real discovery composition');
    }

    // ===============================================================
    // Section C — single-relay compatibility: exactly one configured
    // publication relay reports the identical candidates a plain
    // single-relay NostrDiscoveryQueryService would for that same relay.
    // ===============================================================
    {
        const relayUrl = 'wss://only-relay.example';
        const discoveryTag = 'forkbuild-tag-single';
        const envelope = makeEnvelope({ objectId: 'pub-single', uri: 'ar://' + 's'.repeat(43) });

        const network = makeFakeRelayNetwork();
        const publisher = new NostrPublicationDiscoveryPublisher({ relayUrl, discoveryTag, publishImpl: network.publishImpl });
        await publisher.publish(envelope);

        const plainService = new NostrDiscoveryQueryService({ relayUrl, queryImpl: network.queryImpl });
        const relaySetService = new NostrPublicationRelaySetDiscoveryQueryService({ relayUrls: [relayUrl], queryImpl: network.queryImpl });

        const plainResult = await plainService.search(discoveryTag);
        const relaySetResult = await relaySetService.search(discoveryTag);

        assert(plainResult.length === 1 && relaySetResult.length === 1, n('C1. both a plain single-relay service and a one-relay relay-set service find exactly the one published candidate'));
        assert(plainResult[0].uri === relaySetResult[0].uri && plainResult[0].storage === relaySetResult[0].storage,
            n('C2. the two services report an identical candidate for the identical single relay — one configured relay behaves exactly as before'));

        console.log('✓ Section C: a one-relay publication relay set reports identical candidates to the plain single-relay service');
    }

    // ===============================================================
    // Section D — multi-relay discovery: every configured relay is
    // genuinely queried, live-confirmed against the real queryImpl calls.
    // ===============================================================
    {
        const relayUrls = ['wss://d-relay-1.example', 'wss://d-relay-2.example', 'wss://d-relay-3.example'];
        const calledRelays = [];
        async function trackingQueryImpl(relayUrl, filter) {
            calledRelays.push(relayUrl);
            return [];
        }

        const service = new NostrPublicationRelaySetDiscoveryQueryService({ relayUrls, queryImpl: trackingQueryImpl });
        await service.search('forkbuild-tag-multi');

        assert(calledRelays.length === 3, n(`D1. exactly three queries were issued (found ${calledRelays.length})`));
        for (const relayUrl of relayUrls) {
            assert(calledRelays.includes(relayUrl), n(`D2. relay ${relayUrl} was genuinely queried`));
        }
        console.log('✓ Section D: every configured relay in the set is genuinely queried on search()');
    }

    // ===============================================================
    // Section E — FLAGSHIP: publish -> relay B -> discover using the
    // publication relay set -> publication found. The exact concrete
    // failure 0.9.449 demonstrated (a publication reaching a configured
    // relay while being invisible to discovery), closed end to end.
    // ===============================================================
    {
        const relayA = 'wss://e-relay-a.example';
        const relayB = 'wss://e-relay-b.example';
        const relayC = 'wss://e-relay-c.example';
        const discoveryTag = 'forkbuild-tag-roundtrip';
        const publicationUri = 'ar://' + 'r'.repeat(43);
        const envelope = makeEnvelope({ objectId: 'pub-roundtrip', uri: publicationUri });

        const network = makeFakeRelayNetwork();

        // Publication is distributed to exactly ONE of the three configured
        // relays — relay B — exactly the 0.9.449 scenario: a real,
        // configured relay genuinely carries the announcement.
        const publisher = new NostrPublicationDiscoveryPublisher({ relayUrl: relayB, discoveryTag, publishImpl: network.publishImpl });
        const publishResult = await publisher.publish(envelope);
        assert(publishResult && publishResult.published === true, n('E1. the publication was genuinely distributed to relay B'));
        assert(network.eventsByRelay.get(relayA) === undefined && network.eventsByRelay.get(relayC) === undefined,
            n('E2. relays A and C genuinely never received anything — this is not a fabricated success'));

        // Discovery queries the WHOLE configured publication relay set —
        // through the real composition root, not a hand-built shortcut.
        const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: network.queryImpl,
            nostrRelayUrls: [relayA, relayB, relayC]
        });
        const candidates = await nostr.search(discoveryTag);

        assert(candidates.length === 1, n(`E3. discovery through the configured relay set finds exactly the one publication (found ${candidates.length})`));
        assert(candidates[0].uri === publicationUri, n('E4. the discovered candidate names the exact uri the publication was distributed under'));

        console.log('✓ Section E: FLAGSHIP — a publication distributed to one relay in the configured publication relay set is discoverable through that same set');
    }

    // ===============================================================
    // Section F — independent relay results: one unavailable relay never
    // makes another, genuinely reachable relay's own result invisible.
    // Discovery's own existing "concurrent, independent" semantics decide
    // this — never a new failover policy invented by this milestone.
    // ===============================================================
    {
        const relayDead = 'wss://f-relay-dead.example';
        const relayLive = 'wss://f-relay-live.example';
        const discoveryTag = 'forkbuild-tag-independent';
        const envelope = makeEnvelope({ objectId: 'pub-independent', uri: 'ar://' + 'i'.repeat(43) });

        const network = makeFakeRelayNetwork();
        const publisher = new NostrPublicationDiscoveryPublisher({ relayUrl: relayLive, discoveryTag, publishImpl: network.publishImpl });
        await publisher.publish(envelope);

        async function queryImplWithDeadRelay(relayUrl, filter) {
            if (relayUrl === relayDead) {
                throw new Error('relay unreachable');
            }
            return network.queryImpl(relayUrl, filter);
        }

        const service = new NostrPublicationRelaySetDiscoveryQueryService({ relayUrls: [relayDead, relayLive], queryImpl: queryImplWithDeadRelay });
        const candidates = await service.search(discoveryTag);

        assert(candidates.length === 1, n(`F1. the live relay's own genuine candidate is still reported despite the dead relay rejecting (found ${candidates.length})`));
        assert(candidates[0].uri === envelope.uri, n('F2. the reported candidate is genuinely the live relay\'s own'));

        console.log('✓ Section F: an unreachable relay never hides another, genuinely reachable relay\'s own result');
    }

    // ===============================================================
    // Section G — configuration isolation: writing the publication relay
    // set never mutates the persisted discovery-relay configuration, and
    // vice versa — two genuinely separate stores, under separate keys.
    // ===============================================================
    {
        const sharedStorage = new InMemoryStorageProvider();

        const discoveryRelayStore = new NostrRelayConfigurationStore(sharedStorage);
        discoveryRelayStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://discovery-preference.example' }));

        const publicationRelayStore = new NostrPublicationRelaySetConfigurationStore(sharedStorage);
        publicationRelayStore.save(new NostrPublicationRelaySetConfiguration({ relayUrls: ['wss://pub-1.example', 'wss://pub-2.example'] }));

        assert(discoveryRelayStore.get().relayUrl === 'wss://discovery-preference.example',
            n('G1. writing the publication relay set left the discovery-relay preference untouched'));
        assert(JSON.stringify(publicationRelayStore.get().relayUrls) === JSON.stringify(['wss://pub-1.example', 'wss://pub-2.example']),
            n('G2. the publication relay set itself reads back exactly as written'));

        // Now mutate discovery-relay configuration and confirm the
        // publication relay set is untouched by the reverse direction too.
        discoveryRelayStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://discovery-preference-changed.example' }));
        assert(JSON.stringify(publicationRelayStore.get().relayUrls) === JSON.stringify(['wss://pub-1.example', 'wss://pub-2.example']),
            n('G3. changing the discovery-relay preference left the publication relay set untouched'));

        console.log('✓ Section G: publication relay configuration and discovery-relay configuration never cross-write each other');
    }

    // ===============================================================
    // Section H — identity preservation: no relay-ownership vocabulary
    // leaks into a candidate, and two DIFFERENT relays in the SAME
    // configured set reporting the identical uri collapse to one lead,
    // never a spurious AMBIGUOUS purely because a Wanderer configured
    // redundant relays for the same distribution target.
    // ===============================================================
    {
        const relayX = 'wss://h-relay-x.example';
        const relayY = 'wss://h-relay-y.example';
        const discoveryTag = 'forkbuild-tag-identity';
        const envelope = makeEnvelope({ objectId: 'pub-identity', uri: 'ar://' + 'h'.repeat(43) });

        const network = makeFakeRelayNetwork();
        // The SAME announcement reaches BOTH configured relays — exactly
        // what a real multi-relay fan-out publish already does.
        await new NostrPublicationDiscoveryPublisher({ relayUrl: relayX, discoveryTag, publishImpl: network.publishImpl }).publish(envelope);
        await new NostrPublicationDiscoveryPublisher({ relayUrl: relayY, discoveryTag, publishImpl: network.publishImpl }).publish(envelope);

        const service = new NostrPublicationRelaySetDiscoveryQueryService({ relayUrls: [relayX, relayY], queryImpl: network.queryImpl });
        const candidates = await service.search(discoveryTag);

        assert(candidates.length === 2, n('H1. both relays\' own raw candidates are reported — this file never deduplicates its own search() result'));
        assert(candidates.every((candidate) => !('relayUrl' in candidate) && !('origin' in candidate)),
            n('H2. no candidate carries a relayUrl/origin field of its own — identity stays exactly { uri, storage }, unchanged since 0.9.24'));
        assert(typeof service.origin === 'string' && service.origin.length > 0,
            n('H3. the service reports one non-empty composite origin'));

        // The registry-level consequence: because both relays share ONE
        // origin, `describeDecentralizedWorldDiscoveryLead()` (via
        // `queryDecentralizedWorldDiscovery()`) stamps both candidates with
        // the SAME origin — so `DecentralizedWorldDiscoveryLeadRegistry`'s
        // own (origin, discoveryTag, uri) key collapses them to ONE lead,
        // never two competing candidates resolving AMBIGUOUS.
        const { queryDecentralizedWorldDiscovery } = await import('../application/DecentralizedWorldDiscoveryQuery.js');
        const leads = await queryDecentralizedWorldDiscovery(service, discoveryTag);
        assert(leads.length === 2 && leads[0].origin === leads[1].origin,
            n('H4. both leads share the identical origin — the registry\'s own (origin, discoveryTag, uri) key will collapse them to one slot, never AMBIGUOUS'));

        console.log('✓ Section H: candidate identity stays { uri, storage } only, and redundant relays in one configured set never manufacture a spurious AMBIGUOUS');
    }

    // ===============================================================
    // Section I — cross-role isolation: Snapshot discovery, Place Naming
    // discovery, Arweave, and Bitcoin stay entirely untouched by this
    // milestone — a source sweep of the real files, never a guess.
    // ===============================================================
    {
        const newServiceSource = codeOnly(await source('application/NostrPublicationRelaySetDiscoveryQueryService.js'));
        assert(!/Arweave|Bitcoin|Snapshot|PlaceNaming/i.test(newServiceSource),
            n('I1. application/NostrPublicationRelaySetDiscoveryQueryService.js has no Arweave/Bitcoin/Snapshot/PlaceNaming dependency of any kind'));

        const snapshotCompositionSource = codeOnly(await source('application/DiscoverSnapshotRuntimeComposition.js'));
        assert(!/NostrPublicationRelaySetDiscoveryQueryService/.test(snapshotCompositionSource),
            n('I2. Snapshot discovery\'s own composition never imports the new Publication-relay-set discovery service'));

        const mainSource = await source('ui/main.js');
        assert(/nostrSnapshotDiscoveryQueryServiceOptions:\s*\{\s*queryImpl:\s*nostrRelayQueryClient,\s*relayUrl:\s*resolvedNostrRelayUrl\s*\}/.test(mainSource),
            n('I3. Snapshot discovery\'s real composition call site still receives the general resolvedNostrRelayUrl, untouched'));
        assert(/new NostrPlaceNamingDiscoverySource\(\{\s*queryImpl:\s*nostrRelayQueryClient,\s*relayUrl:\s*resolvedNostrRelayUrl\s*\}\)/.test(mainSource),
            n('I4. Place Naming discovery\'s real construction call site still receives the general resolvedNostrRelayUrl, untouched'));

        const compositionSource = codeOnly(await source('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js'));
        assert(!/Bitcoin|BitcoinAnchor|ProofVerifier/.test(compositionSource),
            n('I5. the amended World Encounter discovery composition has no Bitcoin/anchoring dependency of any kind'));

        console.log('✓ Section I: Snapshot discovery, Place Naming discovery, and Arweave/Bitcoin stay entirely untouched by this milestone');
    }

    // ===============================================================
    // Section J — no second source of truth: the effective publication
    // relay list reaches discovery through resolveNostrPublicationRelayUrls()
    // alone — never a second, independent read of localStorage, Settings
    // component state, another Nostr configuration key, or a hardcoded
    // relay array.
    // ===============================================================
    {
        const newServiceSource = codeOnly(await source('application/NostrPublicationRelaySetDiscoveryQueryService.js'));
        assert(!/localStorage|LocalStorageProvider|NostrRelayConfigurationStore|NostrPublicationRelaySetConfigurationStore|NostrPublicationRelaySetConfigurationProvider/.test(newServiceSource),
            n('J1. the new discovery service never reads persistence or a configuration provider itself — it only ever accepts an already-resolved relayUrls array'));
        assert(!/wss:\/\/relay\.damus\.io/.test(newServiceSource),
            n('J2. the new discovery service carries no hardcoded relay URL of its own'));

        const mainSource = await source('ui/main.js');
        const resolutionSites = (codeOnly(mainSource).match(/const resolvedNostrPublicationRelayUrls\s*=/g) || []).length;
        assert(resolutionSites === 1, n(`J3. resolvedNostrPublicationRelayUrls is resolved exactly once in ui/main.js (found ${resolutionSites}) — one authority, reused by both the write-side (0.9.450) and read-side (0.9.451) call sites`));

        const writeCallSiteUses = (mainSource.match(/resolvedNostrPublicationRelayUrls/g) || []).length;
        assert(writeCallSiteUses >= 3, n(`J4. resolvedNostrPublicationRelayUrls is referenced at least three times (its declaration + the write-side and read-side call sites) — found ${writeCallSiteUses}`));

        console.log('✓ Section J: the effective publication relay list has exactly one source of truth, reused by both distribution and discovery');
    }

    console.log('\n✅ All Nostr Publication Relay Set Discovery Alignment (0.9.451) tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
