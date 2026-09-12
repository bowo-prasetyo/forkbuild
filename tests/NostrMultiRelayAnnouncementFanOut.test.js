import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { NostrMultiRelayPublicationDiscoveryPublisher } from '../application/NostrMultiRelayPublicationDiscoveryPublisher.js';
import { orchestrateMultiRelayNostrPublicationDistribution } from '../application/NostrMultiRelayPublicationDistributionOrchestrator.js';
import { executeMultiRelayNostrPublicationDistributionCommand, executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';

// 0.9.444 — Nostr Multi-Relay Announcement Fan-Out.
//
// 0.9.442 named the product gap (relay multiplicity is replication across
// independent distribution surfaces, never endpoint failover) and 0.9.443
// closed the exact prerequisite it depended on (a Nostr relay observation is
// keyed by (publicationId, discoveryProvider, discoveryOrigin), never
// collapsing two real relays' own facts into one). This milestone is the
// fan-out capability itself. Eleven lettered sections, matching this
// milestone's own requested test list (A through K) plus one architectural
// guard section (L).
//
// DELIBERATELY EXCLUDED FROM THIS TEST FILE'S OWN SCOPE, PER THIS
// MILESTONE'S OWN REQUEST: a relay Settings UI, relay health checks,
// automatic relay discovery, relay ranking, retry policy, failover, an
// aggregate SUCCESS/PARTIAL/FAILED status, notification integration, and any
// change to Arweave gateway behavior, Bitcoin anchoring, or read-side
// (discovery-query) relay multiplicity.

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

// ---------------------------------------------------------------------
// Fake substrates — the same techniques tests/NostrRelayObservationIdentityBoundary.test.js
// and tests/ConcurrentDiscoveryObservationPreservation.test.js already
// established.
// ---------------------------------------------------------------------
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
        const method = options.method || 'GET';
        if (method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, transaction.data);
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    async function uploadTaggedTransaction(material, tag) {
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }
    return { contentSigner, fetchImpl, uploadTaggedTransaction };
}

let fakeNostrEventCounter = 0;
function nextFakeNostrEventId() {
    fakeNostrEventCounter += 1;
    return String(fakeNostrEventCounter).padStart(64, '0');
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

// A configurable, per-relay publishImpl — the single injection point every
// real NostrPublicationDiscoveryPublisher this milestone constructs shares,
// exactly mirroring how a real signer/transport would be relay-aware itself.
// `behaviors` maps relayUrl -> 'succeed' | 'decline' | 'reject' | a function.
function makeConfigurablePublishImpl(behaviors, callLog) {
    return async function publishImpl(relayUrl, eventTemplate) {
        if (callLog) callLog.push(relayUrl);
        const behavior = behaviors[relayUrl] || 'succeed';
        if (typeof behavior === 'function') {
            return behavior(relayUrl, eventTemplate);
        }
        if (behavior === 'succeed') {
            return { published: true, id: nextFakeNostrEventId() };
        }
        if (behavior === 'decline') {
            return { published: false };
        }
        if (behavior === 'reject') {
            throw new Error(`publishImpl: relay ${relayUrl} rejected`);
        }
        throw new Error(`unknown behavior "${behavior}"`);
    };
}

async function run() {
    // ===============================================================
    // Section A — Single-relay compatibility: one relay behaves exactly as
    // 0.9.46's own NostrPublicationDiscoveryPublisher already does, byte-
    // identical per-relay outcome.
    // ===============================================================
    {
        const callLog = [];
        const publishImpl = makeConfigurablePublishImpl({}, callLog);
        const single = new NostrPublicationDiscoveryPublisher({ relayUrl: 'wss://only.example', discoveryTag: 'fanout-a', publishImpl });
        const multi = new NostrMultiRelayPublicationDiscoveryPublisher({ relayUrls: ['wss://only.example'], discoveryTag: 'fanout-a', publishImpl });

        assert(multi.relayUrls.length === 1 && multi.relayUrls[0] === 'wss://only.example', n('A1. a single-element relayUrls array constructs exactly one internal relay publisher'));
        assert(multi.discoveryTag === 'fanout-a', n('A2. discoveryTag is exposed identically to the single-relay class'));

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-a', uri: 'ar://TESTTX' };
        const singleResult = await single.publish(envelope);
        const multiResults = await multi.publish(envelope);

        assert(singleResult.published === true && typeof singleResult.id === 'string', n('A3. the real, unmodified single-relay publisher genuinely succeeds'));
        assert(multiResults.length === 1, n('A4. the multi-relay publisher resolves exactly one entry for one configured relay'));
        assert(multiResults[0].relayUrl === 'wss://only.example' && multiResults[0].published === true, n('A5. that one entry reports the identical relay, published: true'));
        assert(typeof multiResults[0].id === 'string' && multiResults[0].id.length === 64, n('A6. that one entry carries a real, well-formed Nostr event id'));

        console.log('✓ Section A: a single configured relay behaves exactly as 0.9.46\'s own single-relay publisher already does');
    }

    // ===============================================================
    // Section B — Two-relay fan-out: both real NostrPublicationDiscoveryPublisher
    // instances are exercised.
    // ===============================================================
    {
        const callLog = [];
        const publishImpl = makeConfigurablePublishImpl({}, callLog);
        const multi = new NostrMultiRelayPublicationDiscoveryPublisher({
            relayUrls: ['wss://relay-a.example', 'wss://relay-b.example'],
            discoveryTag: 'fanout-b',
            publishImpl
        });

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-b', uri: 'ar://TESTTX' };
        const results = await multi.publish(envelope);

        assert(callLog.length === 2 && callLog.includes('wss://relay-a.example') && callLog.includes('wss://relay-b.example'), n('B1. both real relays were genuinely contacted through the real publishImpl injection point'));
        assert(results.length === 2, n('B2. two configured relays produce exactly two result entries'));
        assert(results.every((r) => r.published === true), n('B3. both real publish attempts succeeded'));
        assert(new Set(results.map((r) => r.id)).size === 2, n('B4. the two relays produced two genuinely distinct event ids'));

        console.log('✓ Section B: two configured relays are both genuinely, independently exercised through real NostrPublicationDiscoveryPublisher instances');
    }

    // ===============================================================
    // Section C — Three-relay fan-out: multiplicity is not accidentally
    // limited to two.
    // ===============================================================
    {
        const callLog = [];
        const publishImpl = makeConfigurablePublishImpl({}, callLog);
        const multi = new NostrMultiRelayPublicationDiscoveryPublisher({
            relayUrls: ['wss://relay-a.example', 'wss://relay-b.example', 'wss://relay-c.example'],
            discoveryTag: 'fanout-c',
            publishImpl
        });

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-c', uri: 'ar://TESTTX' };
        const results = await multi.publish(envelope);

        assert(callLog.length === 3, n('C1. all three configured relays were contacted'));
        assert(results.length === 3, n('C2. three configured relays produce exactly three result entries — multiplicity is not capped at two'));
        assert(new Set(results.map((r) => r.relayUrl)).size === 3, n('C3. all three result entries name three distinct relays'));

        console.log('✓ Section C: three configured relays fan out correctly — multiplicity is not accidentally limited to two');
    }

    // ===============================================================
    // Section D — Independent relay results: each relay produces its own
    // result, never a shared/copied fact.
    // ===============================================================
    {
        const publishImpl = makeConfigurablePublishImpl({
            'wss://relay-a.example': 'succeed',
            'wss://relay-b.example': 'decline'
        });
        const multi = new NostrMultiRelayPublicationDiscoveryPublisher({
            relayUrls: ['wss://relay-a.example', 'wss://relay-b.example'],
            discoveryTag: 'fanout-d',
            publishImpl
        });

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-d', uri: 'ar://TESTTX' };
        const results = await multi.publish(envelope);

        const a = results.find((r) => r.relayUrl === 'wss://relay-a.example');
        const b = results.find((r) => r.relayUrl === 'wss://relay-b.example');
        assert(a.published === true && typeof a.id === 'string', n('D1. relay A\'s own independent success is genuinely reported'));
        assert(b.published === false && b.id === undefined, n('D2. relay B\'s own independent decline is genuinely reported, with no fabricated id'));

        console.log('✓ Section D: each relay produces its own independent result — a decline on one never bleeds into another\'s fact');
    }

    // ===============================================================
    // Section E — One relay failure: a failure on R2 does not prevent R1/R3
    // from being attempted (decline AND a genuinely rejecting publishImpl,
    // both covered).
    // ===============================================================
    {
        const callLog = [];
        const publishImpl = makeConfigurablePublishImpl({
            'wss://relay-a.example': 'succeed',
            'wss://relay-b.example': 'reject',
            'wss://relay-c.example': 'succeed'
        }, callLog);
        const multi = new NostrMultiRelayPublicationDiscoveryPublisher({
            relayUrls: ['wss://relay-a.example', 'wss://relay-b.example', 'wss://relay-c.example'],
            discoveryTag: 'fanout-e',
            publishImpl
        });

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-e', uri: 'ar://TESTTX' };
        let threw = false;
        let results = null;
        try {
            results = await multi.publish(envelope);
        } catch {
            threw = true;
        }

        assert(!threw, n('E1. a genuinely REJECTING publishImpl on relay B never causes the whole publish() call to reject'));
        assert(callLog.length === 3, n('E2. all three relays were genuinely, concurrently attempted — relay B\'s own rejection did not stop relay C from ever being contacted'));
        const a = results.find((r) => r.relayUrl === 'wss://relay-a.example');
        const b = results.find((r) => r.relayUrl === 'wss://relay-b.example');
        const c = results.find((r) => r.relayUrl === 'wss://relay-c.example');
        assert(a.published === true, n('E3. relay A still genuinely succeeded'));
        assert(b.published === false && b.error instanceof Error, n('E4. relay B\'s own genuine failure is reported as published: false, with its own error preserved, never thrown out'));
        assert(c.published === true, n('E5. relay C still genuinely succeeded, unaffected by relay B\'s own failure'));

        console.log('✓ Section E: a failure on one relay never prevents the others from being attempted or reported');
    }

    // ===============================================================
    // Section F — All-relays failure: no fabricated success.
    // ===============================================================
    {
        const publishImpl = makeConfigurablePublishImpl({
            'wss://relay-a.example': 'decline',
            'wss://relay-b.example': 'reject'
        });
        const multi = new NostrMultiRelayPublicationDiscoveryPublisher({
            relayUrls: ['wss://relay-a.example', 'wss://relay-b.example'],
            discoveryTag: 'fanout-f',
            publishImpl
        });

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-f', uri: 'ar://TESTTX' };
        const results = await multi.publish(envelope);

        assert(results.length === 2, n('F1. both configured relays still produce their own entries even when every one of them fails'));
        assert(results.every((r) => r.published === false), n('F2. no relay reports published: true when none genuinely succeeded — no fabricated success'));

        console.log('✓ Section F: when every configured relay fails, none is fabricated as a success');
    }

    // ===============================================================
    // Section G — Ordering independence: [A, B, C] vs [C, A, B] produce the
    // identical resulting SET of distribution facts.
    // ===============================================================
    {
        const publishImpl = makeConfigurablePublishImpl({
            'wss://relay-a.example': 'succeed',
            'wss://relay-b.example': 'decline',
            'wss://relay-c.example': 'succeed'
        });
        const forward = new NostrMultiRelayPublicationDiscoveryPublisher({
            relayUrls: ['wss://relay-a.example', 'wss://relay-b.example', 'wss://relay-c.example'],
            discoveryTag: 'fanout-g',
            publishImpl
        });
        const reordered = new NostrMultiRelayPublicationDiscoveryPublisher({
            relayUrls: ['wss://relay-c.example', 'wss://relay-a.example', 'wss://relay-b.example'],
            discoveryTag: 'fanout-g',
            publishImpl
        });

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-g', uri: 'ar://TESTTX' };
        const forwardResults = await forward.publish(envelope);
        const reorderedResults = await reordered.publish(envelope);

        function asSet(results) {
            return new Set(results.map((r) => `${r.relayUrl}:${r.published}`));
        }
        assert(forwardResults.length === 3 && reorderedResults.length === 3, n('G1. both orderings still produce three entries'));
        assert(JSON.stringify([...asSet(forwardResults)].sort()) === JSON.stringify([...asSet(reorderedResults)].sort()), n('G2. the resulting set of (relayUrl, published) facts is identical regardless of configured order'));
        assert(reordered.relayUrls[0] === 'wss://relay-c.example', n('G3. the reordered instance\'s own relayUrls getter reflects the configured order it was given — order is preserved as configuration data, never silently re-sorted'));

        console.log('✓ Section G: relay order never changes the resulting set of distribution facts');
    }

    // ===============================================================
    // Section H — Duplicate relay configuration: [A, A, B] is explicitly
    // normalized — the same relay is never published to twice.
    // ===============================================================
    {
        const callLog = [];
        const publishImpl = makeConfigurablePublishImpl({}, callLog);
        const multi = new NostrMultiRelayPublicationDiscoveryPublisher({
            relayUrls: ['wss://relay-a.example', 'wss://relay-a.example', 'wss://relay-b.example'],
            discoveryTag: 'fanout-h',
            publishImpl
        });

        assert(multi.relayUrls.length === 2, n('H1. [A, A, B] normalizes to exactly two distinct relays, A and B'));
        assert(JSON.stringify(multi.relayUrls) === JSON.stringify(['wss://relay-a.example', 'wss://relay-b.example']), n('H2. normalization preserves the first-seen order and drops the later duplicate'));

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-h', uri: 'ar://TESTTX' };
        const results = await multi.publish(envelope);

        assert(callLog.filter((r) => r === 'wss://relay-a.example').length === 1, n('H3. relay A\'s own publishImpl was invoked exactly once, never twice, despite appearing twice in configuration'));
        assert(results.length === 2, n('H4. exactly two result entries are produced, never three'));

        // Whitespace-only duplicates normalize identically.
        const whitespaceVariant = new NostrMultiRelayPublicationDiscoveryPublisher({
            relayUrls: [' wss://relay-a.example ', 'wss://relay-a.example'],
            discoveryTag: 'fanout-h',
            publishImpl
        });
        assert(whitespaceVariant.relayUrls.length === 1, n('H5. a duplicate that differs only by surrounding whitespace still normalizes to one relay'));

        console.log('✓ Section H: duplicate relay URLs are normalized before execution — the same relay is never published to twice');
    }

    // ===============================================================
    // Section I — Observation integration: A + B become two independent
    // observations through the REAL 0.9.443 lifecycle path, driven by the
    // real, production executeMultiRelayNostrPublicationDistributionCommand().
    // ===============================================================
    let sectionIResults;
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-i-observation');
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const publishImpl = makeConfigurablePublishImpl({});

        const command = (request) => executeMultiRelayNostrPublicationDistributionCommand({
            ...request,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: ['wss://relay-a.example', 'wss://relay-b.example'],
            nostrPublisherOptions: { discoveryTag: 'fanout-i', publishImpl },
            lifecycleStore
        });

        sectionIResults = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });

        assert(Array.isArray(sectionIResults) && sectionIResults.length === 2, n('I1. the real command resolves an array of two PublicationDistributionResult values, one per relay'));
        assert(sectionIResults.every((r) => r.material !== null && r.material.uri.startsWith('ar://')), n('I2. both results share the identical, real material fact — material was uploaded exactly once'));
        assert(sectionIResults.every((r) => r.discovery !== null), n('I3. both real distribution actions genuinely succeeded'));

        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('I4. the REAL 0.9.443 lifecycle path records two independent Nostr observations for this one publication — never collapsed to one'));
        const observationA = observations.find((o) => o.origin === 'wss://relay-a.example');
        const observationB = observations.find((o) => o.origin === 'wss://relay-b.example');
        assert(observationA && observationA.discoveryProvider === 'nostr', n('I5. relay A\'s own observation is genuinely retrievable, correctly attributed to discoveryProvider "nostr"'));
        assert(observationB && observationB.discoveryProvider === 'nostr', n('I6. relay B\'s own observation is genuinely retrievable, correctly attributed'));
        assert(observationA.id !== observationB.id, n('I7. the two observations carry two genuinely distinct underlying event ids'));

        console.log('✓ Section I: two configured relays become two independent, real observations through the unmodified 0.9.443 lifecycle path');
    }

    // ===============================================================
    // Section J — Cross-provider isolation: Arweave remains single-gateway
    // / read-failover behavior, entirely untouched; Bitcoin anchoring is
    // untouched; the single-relay command path is untouched.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-j-cross-provider');
        const arweaveSubstrate = makeFakeArweaveSubstrate();

        // The pre-existing single-relay Nostr command still works exactly as
        // before — this milestone added a new function, it did not modify
        // the existing one.
        const singleRelayCommand = executePublicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrPublisherOptions: {
                relayUrl: 'wss://single-relay.example',
                discoveryTag: 'fanout-j-single',
                publishImpl: async () => ({ published: true, id: nextFakeNostrEventId() })
            },
            lifecycleStore
        });
        const singleResult = await singleRelayCommand;
        assert(singleResult.discovery !== null && !Array.isArray(singleResult), n('J1. the pre-existing single-relay command still resolves one plain PublicationDistributionResult, never an array — completely unmodified'));

        // Arweave-as-announcement-provider (0.9.428) is entirely untouched:
        // this milestone's own new command never selects it and never
        // imports ArweaveAnnouncementPublisher.
        const commandSource = codeOnly(await source('application/PublicationDistributionCommand.js'));
        assert(!/ArweaveAnnouncementPublisher/.test(commandSource), n('J2. PublicationDistributionCommand.js still never imports ArweaveAnnouncementPublisher directly — Arweave-as-announcement-provider construction remains entirely PublicationDistributionRuntimeComposition.js\'s own job, untouched by this milestone'));

        const orchestratorSource = codeOnly(await source('application/NostrMultiRelayPublicationDistributionOrchestrator.js'));
        assert(!/ArweaveAnnouncementPublisher|BitcoinAnchor/.test(orchestratorSource), n('J3. the new multi-relay orchestrator imports nothing Arweave-announcement-related or Bitcoin-related — this milestone modifies announcement publication for Nostr only'));

        assert(typeof ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL === 'string', n('J4. ArweaveAnnouncementPublisher itself remains fully intact and importable, unmodified by this milestone'));

        console.log('✓ Section J: Arweave and the pre-existing single-relay Nostr command remain completely untouched by this milestone');
    }

    // ===============================================================
    // Section K — No hidden fallback: a failed relay must not silently
    // cause another relay to be interpreted as its replacement.
    // ===============================================================
    {
        const callLog = [];
        const publishImpl = makeConfigurablePublishImpl({
            'wss://relay-a.example': 'reject'
        }, callLog);
        const multi = new NostrMultiRelayPublicationDiscoveryPublisher({
            relayUrls: ['wss://relay-a.example', 'wss://relay-b.example'],
            discoveryTag: 'fanout-k',
            publishImpl
        });

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-k', uri: 'ar://TESTTX' };
        const results = await multi.publish(envelope);

        // Relay B was contacted with the SAME real relayUrl argument it was
        // configured with — never substituted with relay A's own url, and
        // never invoked a second time on relay A's own behalf.
        assert(callLog.filter((r) => r === 'wss://relay-a.example').length === 1, n('K1. relay A was attempted exactly once — no retry of its own failure'));
        assert(callLog.filter((r) => r === 'wss://relay-b.example').length === 1, n('K2. relay B was attempted exactly once, under its own real relayUrl — never substituted for relay A'));
        const b = results.find((r) => r.relayUrl === 'wss://relay-b.example');
        assert(b.published === true, n('K3. relay B\'s own real outcome is reported under its own identity, never merged with or standing in for relay A\'s failure'));

        console.log('✓ Section K: a failed relay is never silently replaced by another — fan-out, never failover');
    }

    // ===============================================================
    // Section L — Architectural guard: no aggregate status vocabulary, no
    // relay Settings UI, no failover/retry/ranking, discoveryProvider is
    // never redefined, and Nostr discovery-QUERY multiplicity is untouched.
    // ===============================================================
    {
        const publisherCode = codeOnly(await source('application/NostrMultiRelayPublicationDiscoveryPublisher.js'));
        const orchestratorCode = codeOnly(await source('application/NostrMultiRelayPublicationDistributionOrchestrator.js'));
        const commandCode = codeOnly(await source('application/PublicationDistributionCommand.js'));

        const forbiddenVocabulary = ['PARTIAL_SUCCESS', 'AGGREGATE_STATUS', 'RELAY_HEALTH', 'RELAY_RANK', 'FAILOVER', 'relayList', 'RelayConfiguration', 'Settings'];
        for (const term of forbiddenVocabulary) {
            for (const [label, code] of [['publisher', publisherCode], ['orchestrator', orchestratorCode]]) {
                assert(!code.includes(term), n(`L1[${label}:${term}]. no "${term}" vocabulary appears in the new ${label} file`));
            }
        }

        assert(!/Promise\.race/.test(publisherCode), n('L2. the fan-out publisher never uses Promise.race — no "first relay wins" semantics of any kind'));
        assert(/Promise\.allSettled/.test(publisherCode), n('L3. CONFIRMED FROM SOURCE: the fan-out publisher uses Promise.allSettled — every relay is genuinely awaited independently, none discarded on account of another\'s rejection'));

        // discoveryProvider itself is never redefined by this milestone —
        // the strict two-value substrate selector is untouched.
        const runtimeCompositionSource = await source('application/PublicationDistributionRuntimeComposition.js');
        assert(/unrecognized discoveryProvider/.test(runtimeCompositionSource), n('L4. PublicationDistributionRuntimeComposition.js still rejects any discoveryProvider outside "nostr"/"arweave" — untouched by this milestone'));
        assert(!commandCode.includes("discoveryProvider: 'wss://") && !commandCode.includes('discoveryProvider: relayUrl'), n('L5. no relay URL is ever passed as a discoveryProvider value anywhere in the command file'));

        // Nostr discovery-QUERY (read-side) multiplicity is untouched —
        // this milestone never imports or modifies the read-path query
        // service.
        assert(!/NostrDiscoveryQueryService/.test(publisherCode) && !/NostrDiscoveryQueryService/.test(orchestratorCode), n('L6. neither new file imports the read-side NostrDiscoveryQueryService — this milestone modifies announcement PUBLICATION only'));

        // No relay Settings UI, and no wiring into ui/main.js or the
        // command composition root — configuration reachability remains
        // explicitly out of scope.
        const commandCompositionSource = await source('application/PublicationDistributionCommandComposition.js');
        assert(!/MultiRelay/.test(commandCompositionSource), n('L7. PublicationDistributionCommandComposition.js (the UI composition root) is untouched — no relay-list configuration reachability was wired in this milestone'));

        console.log('✓ Section L: no aggregate status, no hidden race semantics, no relay Settings UI, and discoveryProvider identity remains exactly as 0.9.443 left it');
    }

    console.log(`\nAll NostrMultiRelayAnnouncementFanOut tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
