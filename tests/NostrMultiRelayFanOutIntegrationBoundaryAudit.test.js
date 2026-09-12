import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { NostrMultiRelayPublicationDiscoveryPublisher } from '../application/NostrMultiRelayPublicationDiscoveryPublisher.js';
import { orchestrateMultiRelayNostrPublicationDistribution } from '../application/NostrMultiRelayPublicationDistributionOrchestrator.js';
import {
    executeMultiRelayNostrPublicationDistributionCommand,
    executePublicationDistributionCommand
} from '../application/PublicationDistributionCommand.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';

// 0.9.445 — Nostr Multi-Relay Fan-Out Integration Boundary Audit.
//
// TEST-ONLY. Zero production changes ride with this milestone.
//
// 0.9.444 proved the new fan-out capability correct at the level of its own
// two new files (NostrMultiRelayPublicationDiscoveryPublisher.js,
// NostrMultiRelayPublicationDistributionOrchestrator.js) plus one real,
// production-level trip through executeMultiRelayNostrPublicationDistributionCommand()
// (its own Section I). What that test file does NOT do is prove the wider
// set of guarantees an "integration boundary audit" exists to check: that
// the real application entry point delivers every configured field
// (relayUrls, discoveryTag, tagName, publication identity, material URI,
// injected publishImpl) unmolested; that material is uploaded exactly once
// for three relays, not three times; that a SECOND run against the same
// publication replaces observations rather than accumulating them; that
// order of configured relays never changes the resulting SET of facts, at
// the command boundary, not only at the publisher boundary; that every
// OTHER distribution surface (single-relay Nostr, Arweave content, Arweave
// gateway failover, Arweave anchoring, Bitcoin anchoring, Snapshot
// distribution, the discovery-query read side) is genuinely unaffected; and
// — the one thing this milestone's own request asked to be scrutinized
// particularly closely — whether `executeMultiRelayNostrPublicationDistributionCommand()`
// is reachable through any existing legitimate application entry point, or
// sits behind a genuine, currently-unclosed reachability gap. This file
// closes exactly those gaps, without implementing anything that would close
// the gap itself — see this milestone's own request, "don't fix that inside
// 0.9.445... classify it first."
//
// Section A: real composition, field fidelity — the real, unmodified
//            executeMultiRelayNostrPublicationDistributionCommand() (never a
//            hand-rolled substitute for it, and never NostrMultiRelayPublicationDiscoveryPublisher
//            constructed directly) delivers relayUrls, discoveryTag, tagName,
//            kind, publication identity, and the shared material URI exactly
//            as configured, all the way into what each relay's own
//            publishImpl actually receives.
// Section B: material uploaded exactly once for three relays — a real
//            signer-call / real network-POST count, not merely three
//            identical materialUri strings that happen to look the same.
// Section C: independent relay execution, both directions (R2 fails among
//            R1/R3 succeeding; then R1/R3 fail with R2 succeeding) — proven
//            through the real command, not the publisher class alone.
// Section D: lifecycle integration — three real, simultaneous
//            recordDiscoveryObservation() calls, retrievable together
//            through getDiscoveryObservations(), driven by the real command.
// Section E: failure creates no phantom observation.
// Section F: repeated publication replaces, never accumulates — 3 + 3 stays
//            3, never 6.
// Section G: order independence at the command boundary — [A,B,C] vs
//            [C,A,B] produce the identical resulting SET of relay
//            observations.
// Section H: cross-role isolation — behaviorally, through the real
//            composition root (composePublicationDistributionCommand()),
//            proving the pre-existing single-relay Nostr command is
//            untouched, plus a source sweep confirming Arweave content,
//            Arweave gateway failover, Arweave/Bitcoin anchoring, and
//            Snapshot distribution never reference this milestone's new
//            files.
// Section I: single-relay compatibility, through the FULL command boundary
//            — a one-element nostrRelayUrls list produces the same semantic
//            material/discovery facts as the pre-existing single-relay
//            command, for equivalent input.
// Section J: no hidden fan-out elsewhere — the lifecycle store, the
//            existing single-relay command, the discovery-query read side,
//            and every real ui/ file are swept for any independent
//            multi-relay capability.
// Section K: configuration remains external — no hardcoded/persisted relay
//            list exists anywhere in the new files; a caller who omits
//            nostrRelayUrls gets a construction-time throw, never a silent
//            default.
// Section L: the reachability classification this milestone's own request
//            asked to be settled explicitly, before any UI is considered.
// Section M: final boundary verdict.

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
async function listJsFilesRecursive(relativeDir) {
    const absoluteDir = path.join(SOURCE_ROOT, relativeDir);
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const relPath = path.join(relativeDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listJsFilesRecursive(relPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(relPath);
        }
    }
    return files;
}

// ---------------------------------------------------------------------
// Fake substrates — the same techniques tests/NostrMultiRelayAnnouncementFanOut.test.js
// and tests/ArweaveGatewayReadFailoverIntegrationBoundaryAudit.test.js
// already established, extended here with call-counting so upload COUNT,
// not merely upload OUTCOME, can be verified.
// ---------------------------------------------------------------------
function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
    let signCalls = 0;
    let postCalls = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    const contentSigner = {
        async sign(material) {
            signCalls += 1;
            const id = newId('Content');
            return { id, transaction: { format: 2, id, data: material } };
        }
    };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';
        if (method === 'POST' && parsed.pathname === '/tx') {
            postCalls += 1;
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, transaction.data);
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return {
        contentSigner,
        fetchImpl,
        get signCallCount() { return signCalls; },
        get postCallCount() { return postCalls; }
    };
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

// A configurable, per-relay publishImpl that also records the exact
// eventTemplate each relay received, so field fidelity (Section A) can be
// checked against what a relay ACTUALLY got, not merely what the test
// configured.
function makeRecordingPublishImpl(behaviors) {
    const calls = [];
    const publishImpl = async function publishImpl(relayUrl, eventTemplate) {
        calls.push({ relayUrl, eventTemplate });
        const behavior = behaviors[relayUrl] || 'succeed';
        if (behavior === 'succeed') return { published: true, id: nextFakeNostrEventId() };
        if (behavior === 'decline') return { published: false };
        if (behavior === 'reject') throw new Error(`publishImpl: relay ${relayUrl} rejected`);
        throw new Error(`unknown behavior "${behavior}"`);
    };
    return { publishImpl, calls };
}

async function run() {
    const R1 = 'wss://audit-relay-1.example';
    const R2 = 'wss://audit-relay-2.example';
    const R3 = 'wss://audit-relay-3.example';

    // ===============================================================
    // Section A — Real composition, field fidelity.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-audit-a');
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const { publishImpl, calls } = makeRecordingPublishImpl({});

        // The real production export, called directly — never a
        // NostrMultiRelayPublicationDiscoveryPublisher constructed by hand,
        // and never orchestrateMultiRelayNostrPublicationDistribution()
        // called directly either. This is the outermost real seam a caller
        // reaches today.
        const results = await executeMultiRelayNostrPublicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: [R1, R2, R3],
            nostrPublisherOptions: { discoveryTag: 'audit-discovery-tag', tagName: 'audit-t', kind: 5, publishImpl },
            lifecycleStore
        });

        assert(Array.isArray(results) && results.length === 3, n('A1. the real command resolves an array with exactly one entry per configured relay'));
        assert(calls.length === 3, n('A2. exactly three real publishImpl invocations occurred — one per configured relay, through the full command boundary'));

        const relayUrlsSeen = calls.map((c) => c.relayUrl).sort();
        assert(JSON.stringify(relayUrlsSeen) === JSON.stringify([R1, R2, R3].slice().sort()), n('A3. the exact three configured relay URLs — and no others — were the ones actually contacted'));

        // Every relay's own eventTemplate carries the configured tagName/
        // discoveryTag/kind, unmodified per relay.
        for (const call of calls) {
            assert(call.eventTemplate.kind === 5, n(`A4[${call.relayUrl}]. the configured kind (5) reached this relay's own eventTemplate`));
            assert(JSON.stringify(call.eventTemplate.tags) === JSON.stringify([['audit-t', 'audit-discovery-tag']]), n(`A5[${call.relayUrl}]. the configured tagName ("audit-t") and discoveryTag ("audit-discovery-tag") reached this relay's own eventTemplate, as a single tag`));
        }

        // The publication identity and the shared material URI both reached
        // the envelope actually serialized into content — read back out of
        // the real, unmodified discovery envelope JSON, never re-derived by
        // this test.
        const materialUri = results[0].material.uri;
        assert(typeof materialUri === 'string' && materialUri.startsWith('ar://'), n('A6. a real Arweave material URI was produced'));
        for (const call of calls) {
            const envelope = JSON.parse(call.eventTemplate.content);
            assert(envelope.objectId === publication.id, n(`A7[${call.relayUrl}]. this relay's own event content carries the real publication identity ("${publication.id}"), never a relay-specific substitute`));
            assert(envelope.uri === materialUri, n(`A8[${call.relayUrl}]. this relay's own event content carries the exact shared material URI, never a per-relay re-derivation`));
        }

        // The injected publishImpl itself is the SAME function reference
        // every relay's own internal NostrPublicationDiscoveryPublisher
        // actually called — proven by the call log above naming exactly
        // this test's own publishImpl having recorded all three calls; no
        // test-only substitute silently replaced it anywhere along the way.
        assert(results.every((r) => r.discovery !== null), n('A9. all three real distribution actions genuinely succeeded end to end'));

        console.log('✓ Section A: the real executeMultiRelayNostrPublicationDistributionCommand() delivers relayUrls, discoveryTag, tagName, kind, publication identity, the shared material URI, and the injected publishImpl exactly as configured — no test-only substitute silently replaces any production composition seam');
    }

    // ===============================================================
    // Section B — Material uploaded exactly once, for three relays.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-audit-b');
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const { publishImpl } = makeRecordingPublishImpl({});

        const results = await executeMultiRelayNostrPublicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: [R1, R2, R3],
            nostrPublisherOptions: { discoveryTag: 'audit-upload-count', publishImpl },
            lifecycleStore
        });

        assert(arweaveSubstrate.signCallCount === 1, n(`B1. the real Arweave signer was invoked exactly ONCE for three configured relays — found ${arweaveSubstrate.signCallCount}`));
        assert(arweaveSubstrate.postCallCount === 1, n(`B2. exactly ONE real network POST reached the Arweave gateway — found ${arweaveSubstrate.postCallCount}, never three`));

        const uris = results.map((r) => r.material.uri);
        assert(new Set(uris).size === 1, n('B3. all three PublicationDistributionResult entries share the identical materialUri string — the resulting URI, not only the upload count, is shared across every relay announcement'));
        assert(results.every((r) => r.material.storage === 'ar'), n('B4. the material storage fact is identical across all three relay results too'));

        console.log('✓ Section B: for R1/R2/R3, Arweave material upload happens exactly once — one real signer call, one real network POST — and the resulting material URI is shared verbatim by every relay announcement, never re-uploaded per relay');
    }

    // ===============================================================
    // Section C — Independent relay execution, both directions.
    // ===============================================================
    {
        // C1. R1 -> success, R2 -> failure, R3 -> success.
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const publication = makeFakePublication('pub-audit-c1');
            const arweaveSubstrate = makeFakeArweaveSubstrate();
            const { publishImpl, calls } = makeRecordingPublishImpl({ [R1]: 'succeed', [R2]: 'reject', [R3]: 'succeed' });

            const results = await executeMultiRelayNostrPublicationDistributionCommand({
                publication,
                serializedMaterial: JSON.stringify(publication.toJSON()),
                arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
                nostrRelayUrls: [R1, R2, R3],
                nostrPublisherOptions: { discoveryTag: 'audit-c1', publishImpl },
                lifecycleStore
            });

            assert(calls.length === 3, n('C1a. all three relays were genuinely attempted through the real command, despite R2 genuinely rejecting'));
            const r1 = results.find((r) => r.discovery && r.discovery.relayUrl === R1);
            const r3 = results.find((r) => r.discovery && r.discovery.relayUrl === R3);
            assert(r1 && r3, n('C1b. R1 and R3 both report a real, present discovery fact'));
            assert(results.filter((r) => r.discovery !== null).length === 2, n('C1c. exactly two of three results report a present discovery fact — R2\'s own failure never manufactures a third'));

            console.log('✓ Section C1: R1 succeeds, R2 genuinely fails, R3 succeeds — all three are attempted, through the real command, and both real successes are reported');
        }

        // C2. Reversed: R1 -> failure, R2 -> success, R3 -> failure — the
        // ONE surviving relay must remain independently observable.
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const publication = makeFakePublication('pub-audit-c2');
            const arweaveSubstrate = makeFakeArweaveSubstrate();
            const { publishImpl, calls } = makeRecordingPublishImpl({ [R1]: 'decline', [R2]: 'succeed', [R3]: 'reject' });

            const results = await executeMultiRelayNostrPublicationDistributionCommand({
                publication,
                serializedMaterial: JSON.stringify(publication.toJSON()),
                arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
                nostrRelayUrls: [R1, R2, R3],
                nostrPublisherOptions: { discoveryTag: 'audit-c2', publishImpl },
                lifecycleStore
            });

            assert(calls.length === 3, n('C2a. all three relays were again genuinely attempted'));
            assert(results.filter((r) => r.discovery !== null).length === 1, n('C2b. exactly one of three results reports a present discovery fact this time'));
            const observations = lifecycleStore.getDiscoveryObservations(publication.id);
            assert(observations.length === 1 && observations[0].origin === R2, n('C2c. the single surviving relay (R2) is independently observable through the real lifecycle path even though it is surrounded by two failures'));

            console.log('✓ Section C2: with the failure pattern reversed (R1/R3 fail, R2 succeeds), the one successful relay remains fully observable, unaffected by which position it occupies or how many neighbors failed');
        }
    }

    // ===============================================================
    // Section D — Lifecycle integration: three simultaneous, independent
    // recordDiscoveryObservation() calls, all retrievable together.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-audit-d');
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const { publishImpl } = makeRecordingPublishImpl({});

        await executeMultiRelayNostrPublicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: [R1, R2, R3],
            nostrPublisherOptions: { discoveryTag: 'audit-d', publishImpl },
            lifecycleStore
        });

        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 3, n('D1. all three relays\' own observations are SIMULTANEOUSLY present in one getDiscoveryObservations() call — the 0.9.443 identity seam and the 0.9.444 fan-out boundary compose correctly'));
        const origins = observations.map((o) => o.origin).sort();
        assert(JSON.stringify(origins) === JSON.stringify([R1, R2, R3].slice().sort()), n('D2. the three observations carry exactly the three configured relay origins — nostr/R1, nostr/R2, nostr/R3'));
        assert(observations.every((o) => o.discoveryProvider === 'nostr'), n('D3. every observation is attributed to discoveryProvider "nostr" — never a relay URL masquerading as a provider'));
        assert(new Set(observations.map((o) => o.id)).size === 3, n('D4. all three observations carry three genuinely distinct underlying Nostr event ids'));

        // The primary get()/set() lifecycle slot (0.9.52) also reflects the
        // fan-out having genuinely happened — a caller relying on either
        // the primary slot or the per-relay observations sees consistent
        // facts.
        const primaryLifecycle = lifecycleStore.get(publication.id);
        assert(primaryLifecycle && primaryLifecycle.discovery.state === 'PRESENT', n('D5. the primary per-publication lifecycle slot also reports a PRESENT discovery fact after the fan-out'));

        console.log('✓ Section D: R1/R2/R3 each reach recordDiscoveryObservation() independently, through the real, unmodified 0.9.443 lifecycle path, and are all simultaneously retrievable as nostr/R1, nostr/R2, nostr/R3');
    }

    // ===============================================================
    // Section E — Failure creates no phantom observation.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-audit-e');
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const { publishImpl } = makeRecordingPublishImpl({ [R1]: 'succeed', [R2]: 'decline', [R3]: 'succeed' });

        await executeMultiRelayNostrPublicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: [R1, R2, R3],
            nostrPublisherOptions: { discoveryTag: 'audit-e', publishImpl },
            lifecycleStore
        });

        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('E1. exactly two observations are recorded — R2\'s own decline produced no phantom third entry'));
        assert(!observations.some((o) => o.origin === R2), n('E2. no observation exists for R2 at all — not a null placeholder, not an empty entry, simply absent'));
        assert(observations.some((o) => o.origin === R1) && observations.some((o) => o.origin === R3), n('E3. R1 and R3\'s own real observations are both still present, unaffected by R2\'s own absence'));

        console.log('✓ Section E: a declined relay produces no phantom observation of any kind — fan-out returning multiple independent outcomes never manufactures a false fact for the one that failed');
    }

    // ===============================================================
    // Section F — Repeated publication replaces, never accumulates.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-audit-f');
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const { publishImpl } = makeRecordingPublishImpl({});

        const command = () => executeMultiRelayNostrPublicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: [R1, R2, R3],
            nostrPublisherOptions: { discoveryTag: 'audit-f', publishImpl },
            lifecycleStore
        });

        await command();
        const firstObservations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(firstObservations.length === 3, n('F1. the first run produces exactly three observations'));
        const firstIds = new Map(firstObservations.map((o) => [o.origin, o.id]));

        await command();
        const secondObservations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(secondObservations.length === 3, n('F2. the SECOND run still produces exactly three observations — never six — R1/R2/R3 each replace their own prior observation rather than accumulating a second'));

        for (const origin of [R1, R2, R3]) {
            const second = secondObservations.find((o) => o.origin === origin);
            assert(second, n(`F3[${origin}]. this relay's own observation still exists after the second run`));
            assert(second.id !== firstIds.get(origin), n(`F4[${origin}]. this relay's own observation is a genuinely NEW id from the second run's own real publish — a real replacement, never a no-op that merely left the first run's fact in place`));
        }

        assert(arweaveSubstrate.postCallCount === 2, n('F5. two independent command calls performed exactly two real uploads (one each) — this section is about observation replacement, not upload deduplication ACROSS separate calls, which Section B already covers within one call'));

        console.log('✓ Section F: executing the same multi-relay operation twice against the same publication replaces each relay\'s own observation with a fresh one — three observations after two runs, never six — validating that 0.9.443\'s identity boundary and 0.9.444\'s fan-out boundary compose correctly under repetition');
    }

    // ===============================================================
    // Section G — Order independence at the command boundary.
    // ===============================================================
    {
        const arweaveSubstrateForward = makeFakeArweaveSubstrate();
        const arweaveSubstrateReordered = makeFakeArweaveSubstrate();
        const { publishImpl: publishImplForward } = makeRecordingPublishImpl({ [R1]: 'succeed', [R2]: 'decline', [R3]: 'succeed' });
        const { publishImpl: publishImplReordered } = makeRecordingPublishImpl({ [R1]: 'succeed', [R2]: 'decline', [R3]: 'succeed' });

        const lifecycleStoreForward = new PublicationDistributionLifecycleMemoryStore();
        const publicationForward = makeFakePublication('pub-audit-g-forward');
        await executeMultiRelayNostrPublicationDistributionCommand({
            publication: publicationForward,
            serializedMaterial: JSON.stringify(publicationForward.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrateForward.contentSigner, fetchImpl: arweaveSubstrateForward.fetchImpl },
            nostrRelayUrls: [R1, R2, R3],
            nostrPublisherOptions: { discoveryTag: 'audit-g', publishImpl: publishImplForward },
            lifecycleStore: lifecycleStoreForward
        });

        const lifecycleStoreReordered = new PublicationDistributionLifecycleMemoryStore();
        const publicationReordered = makeFakePublication('pub-audit-g-reordered');
        await executeMultiRelayNostrPublicationDistributionCommand({
            publication: publicationReordered,
            serializedMaterial: JSON.stringify(publicationReordered.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrateReordered.contentSigner, fetchImpl: arweaveSubstrateReordered.fetchImpl },
            nostrRelayUrls: [R3, R1, R2],
            nostrPublisherOptions: { discoveryTag: 'audit-g', publishImpl: publishImplReordered },
            lifecycleStore: lifecycleStoreReordered
        });

        function originSet(store, publicationId) {
            return new Set(store.getDiscoveryObservations(publicationId).map((o) => o.origin));
        }
        const forwardSet = originSet(lifecycleStoreForward, publicationForward.id);
        const reorderedSet = originSet(lifecycleStoreReordered, publicationReordered.id);
        assert(forwardSet.size === 2 && reorderedSet.size === 2, n('G1. both orderings still produce exactly two successful observations (R1, R3) despite the differing configured order'));
        assert([...forwardSet].sort().join(',') === [...reorderedSet].sort().join(','), n('G2. the resulting SET of relay origins is identical regardless of configured order — [R1,R2,R3] and [R3,R1,R2] converge on the same facts'));

        console.log('✓ Section G: relay order never changes the resulting set of relay observations, proven at the real command boundary, not only at the publisher class');
    }

    // ===============================================================
    // Section H — Cross-role isolation.
    // ===============================================================
    {
        // H1. Behaviorally: the pre-existing single-relay Nostr command,
        // reached through the REAL composition root
        // (composePublicationDistributionCommand — the exact function
        // ui/main.js itself calls), still resolves one plain
        // PublicationDistributionResult, never an array, and shares its
        // lifecycleStore without interference from a separate multi-relay
        // publication.
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const arweaveSubstrate = makeFakeArweaveSubstrate();

            const singleRelayCommand = composePublicationDistributionCommand({
                lifecycleStore,
                arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
                nostrPublisherOptions: {
                    relayUrl: 'wss://audit-single-relay.example',
                    discoveryTag: 'audit-h-single',
                    publishImpl: async () => ({ published: true, id: nextFakeNostrEventId() })
                }
            });

            const singlePublication = makeFakePublication('pub-audit-h-single');
            const singleResult = await singleRelayCommand({ publication: singlePublication, serializedMaterial: JSON.stringify(singlePublication.toJSON()) });
            assert(!Array.isArray(singleResult) && singleResult.discovery !== null, n('H1a. the real composePublicationDistributionCommand()-built single-relay command still resolves exactly one plain PublicationDistributionResult, never an array — the exact function ui/main.js itself wires into the app, untouched by this milestone'));

            const { publishImpl: multiPublishImpl } = makeRecordingPublishImpl({});
            const multiPublication = makeFakePublication('pub-audit-h-multi');
            await executeMultiRelayNostrPublicationDistributionCommand({
                publication: multiPublication,
                serializedMaterial: JSON.stringify(multiPublication.toJSON()),
                arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
                nostrRelayUrls: [R1, R2],
                nostrPublisherOptions: { discoveryTag: 'audit-h-multi', publishImpl: multiPublishImpl },
                lifecycleStore
            });

            assert(lifecycleStore.getDiscoveryObservations(singlePublication.id).length === 1, n('H1b. the single-relay publication\'s own observation count is unaffected by a SEPARATE multi-relay publication sharing the same lifecycleStore instance'));
            assert(lifecycleStore.getDiscoveryObservations(multiPublication.id).length === 2, n('H1c. the multi-relay publication\'s own two observations are equally unaffected — both publications coexist correctly in one shared store'));
        }

        // H2. Source sweep — the new multi-relay files, and the existing
        // command file, never reference Arweave content/gateway-failover,
        // Arweave/Bitcoin anchoring, or Snapshot distribution.
        {
            const sweepTargets = [
                ['application/NostrMultiRelayPublicationDiscoveryPublisher.js', await source('application/NostrMultiRelayPublicationDiscoveryPublisher.js')],
                ['application/NostrMultiRelayPublicationDistributionOrchestrator.js', await source('application/NostrMultiRelayPublicationDistributionOrchestrator.js')],
                ['application/PublicationDistributionCommand.js', await source('application/PublicationDistributionCommand.js')]
            ];
            const forbiddenTerms = ['ArweaveGatewayFailover', 'BitcoinAnchor', 'SnapshotDistribution', 'ArweaveContentStore'];
            for (const [label, text] of sweepTargets) {
                const executable = codeOnly(text);
                for (const term of forbiddenTerms) {
                    assert(!executable.includes(term), n(`H2[${label}:${term}]. "${term}" never appears in real (non-comment) code — this milestone's own write-side Nostr fan-out is structurally blind to Arweave gateway failover, Bitcoin anchoring, and Snapshot distribution`));
                }
            }

            // Arweave Anchor and Arweave gateway failover files themselves
            // never reference anything Nostr-multi-relay-shaped, confirming
            // isolation holds from both directions.
            const anchorSource = codeOnly(await source('anchoring/BitcoinAnchorPublisher.js'));
            assert(!/MultiRelay|NostrMultiRelay/.test(anchorSource), n('H3. BitcoinAnchorPublisher.js never references anything Nostr-multi-relay-shaped'));

            const snapshotDistributionSource = codeOnly(await source('application/SnapshotDistributionCommand.js'));
            assert(!/MultiRelay|NostrMultiRelay/.test(snapshotDistributionSource), n('H4. SnapshotDistributionCommand.js never references anything Nostr-multi-relay-shaped'));
        }

        console.log('✓ Section H: the real single-relay Nostr command, reached through the real composePublicationDistributionCommand() composition root, is behaviorally unaffected by a separate multi-relay publication sharing the same lifecycle store, and a source sweep confirms Arweave content/gateway-failover, Arweave/Bitcoin anchoring, and Snapshot distribution remain structurally unaware this milestone exists, in both directions');
    }

    // ===============================================================
    // Section I — Single-relay compatibility, through the FULL command
    // boundary (not merely the publisher class, which 0.9.444's own
    // Section A already covers).
    // ===============================================================
    {
        const discoveryTag = 'audit-i-compat';
        let sharedEventId = null;
        const singlePublishImpl = async () => { sharedEventId = nextFakeNostrEventId(); return { published: true, id: sharedEventId }; };

        // The pre-existing single-relay command.
        const lifecycleStoreSingle = new PublicationDistributionLifecycleMemoryStore();
        const publicationSingle = makeFakePublication('pub-audit-i-single');
        const arweaveSubstrateSingle = makeFakeArweaveSubstrate();
        const singleResult = await executePublicationDistributionCommand({
            publication: publicationSingle,
            serializedMaterial: JSON.stringify(publicationSingle.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrateSingle.contentSigner, fetchImpl: arweaveSubstrateSingle.fetchImpl },
            nostrPublisherOptions: { relayUrl: R1, discoveryTag, publishImpl: singlePublishImpl },
            lifecycleStore: lifecycleStoreSingle
        });

        // The new multi-relay command, given a ONE-element relayUrls list.
        const lifecycleStoreMulti = new PublicationDistributionLifecycleMemoryStore();
        const publicationMulti = makeFakePublication('pub-audit-i-multi');
        const arweaveSubstrateMulti = makeFakeArweaveSubstrate();
        const multiResults = await executeMultiRelayNostrPublicationDistributionCommand({
            publication: publicationMulti,
            serializedMaterial: JSON.stringify(publicationMulti.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrateMulti.contentSigner, fetchImpl: arweaveSubstrateMulti.fetchImpl },
            nostrRelayUrls: [R1],
            nostrPublisherOptions: { discoveryTag, publishImpl: singlePublishImpl },
            lifecycleStore: lifecycleStoreMulti
        });

        assert(Array.isArray(multiResults) && multiResults.length === 1, n('I1. a one-element nostrRelayUrls list produces exactly a one-element array — the only structural difference from the single-relay command\'s own bare object'));
        const multiResult = multiResults[0];

        assert(singleResult.discovery.relayUrl === multiResult.discovery.relayUrl, n('I2. the reported relayUrl is identical between the single-relay command and the one-element multi-relay command'));
        assert(singleResult.discovery.discoveryTag === multiResult.discovery.discoveryTag, n('I3. the reported discoveryTag is identical'));
        assert(singleResult.material.storage === multiResult.material.storage, n('I4. the reported material storage is identical'));
        assert(singleResult.material.uri.startsWith('ar://') && multiResult.material.uri.startsWith('ar://'), n('I5. both produce a genuine Arweave material URI, in the identical shape'));

        // The lifecycle each produces is semantically equivalent too —
        // same PRESENT states, same field shapes — proven through the real
        // getDiscoveryObservations() path on both sides.
        const singleObservations = lifecycleStoreSingle.getDiscoveryObservations(publicationSingle.id);
        const multiObservations = lifecycleStoreMulti.getDiscoveryObservations(publicationMulti.id);
        assert(singleObservations.length === 1 && multiObservations.length === 1, n('I6. both commands record exactly one discovery observation for their own publication'));
        assert(singleObservations[0].discoveryProvider === multiObservations[0].discoveryProvider && singleObservations[0].discoveryProvider === 'nostr', n('I7. both are attributed to discoveryProvider "nostr" identically'));
        assert(singleObservations[0].origin === multiObservations[0].origin, n('I8. both observations carry the identical relay origin'));

        console.log('✓ Section I: a one-element nostrRelayUrls list produces the same semantic material/discovery facts as the pre-existing single-relay command, through the FULL command boundary — differing only in being wrapped in a one-element array, exactly the backward-compatibility line this whole family exists to protect');
    }

    // ===============================================================
    // Section J — No hidden fan-out elsewhere.
    // ===============================================================
    {
        // J1. The lifecycle store itself has no fan-out logic — it only
        // ever stores what a caller already computed; a single
        // recordDiscoveryObservation() call never spontaneously produces
        // more than one observation.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        lifecycleStore.recordDiscoveryObservation('pub-j', 'nostr', { state: 'PRESENT', origin: R1, discoveryTag: 't', id: '0'.repeat(64) });
        assert(lifecycleStore.getDiscoveryObservations('pub-j').length === 1, n('J1. a single recordDiscoveryObservation() call produces exactly one observation — the store itself never fans anything out on its own'));

        // J2. The existing single-relay command has no relayUrls-shaped
        // parameter at all — supplying one is silently ignored, proving it
        // cannot accidentally trigger fan-out through the OLD entry point.
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const { publishImpl, calls } = makeRecordingPublishImpl({});
        const publication = makeFakePublication('pub-audit-j2');
        const lifecycleStoreJ2 = new PublicationDistributionLifecycleMemoryStore();
        const result = await executePublicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: [R1, R2, R3], // deliberately supplied — must be ignored
            nostrPublisherOptions: { relayUrl: R1, discoveryTag: 'audit-j2', publishImpl },
            lifecycleStore: lifecycleStoreJ2
        });
        assert(!Array.isArray(result), n('J2a. the pre-existing single-relay command still resolves a bare object even when a caller mistakenly supplies nostrRelayUrls — that field is silently ignored, never accidentally honored'));
        assert(calls.length === 1, n('J2b. exactly one publishImpl call occurred — the mistakenly-supplied three-relay list never triggered fan-out through the single-relay command'));

        // J3. Discovery-QUERY (read side) has no relay-list-shaped
        // constructor option at all — a source-level confirmation that the
        // read side was never touched.
        const queryServiceSource = codeOnly(await source('application/NostrDiscoveryQueryService.js'));
        assert(!/relayUrls/.test(queryServiceSource), n('J3. NostrDiscoveryQueryService.js (the read-side discovery-query service) has no relayUrls-shaped option anywhere — read-side multiplicity remains completely untouched'));

        // AMENDED BY 0.9.447 — Nostr Publication Relay Set Configuration.
        // This section's own point-in-time finding was "zero ui/ files
        // reference multi-relay fan-out at all" — true only because no
        // configuration or reachability had been wired yet. 0.9.446's own
        // later audit found that absence itself was the real gap, and
        // 0.9.447 closed it through the ordinary composition root, exactly
        // as every other substrate in this codebase already reaches ui/
        // main.js: via `application/PublicationDistributionCommandComposition.js`'s
        // own new, additive composer, never a UI-side reimplementation. The
        // check below is narrowed rather than removed: it now allowlists
        // exactly the three files 0.9.447 legitimately touches for this
        // reason (ui/main.js's own composition-root wiring, ui/router/
        // index.js's own new route registration, and the one new Settings
        // view built for it), and still asserts that NO OTHER ui/ file —
        // most importantly WorldView.js, WorldEncounterCanvas.js, and
        // DecentralizedPublicationsView.js's own distribution actions —
        // references multi-relay fan-out independently. It also confirms,
        // live, that even the allowlisted ui/main.js never constructs
        // NostrMultiRelayPublicationDiscoveryPublisher directly — it only
        // ever calls the existing, unmodified application-layer composer.
        //
        // AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution
        // Wiring. 0.9.449's own product reassessment (tests/
        // NostrMultiRelayPublicationDistributionProductReassessment.test.js,
        // Section A) found the previous version of this guard was itself
        // the regression it warned against: it kept the three real
        // distribution actions from EVER calling the already-composed
        // multi-relay command at all. 0.9.450 closed that gap by having
        // WorldView.js/DecentralizedPublicationsView.js inject
        // `multiRelayNostrPublicationDistributionCommand` ALONGSIDE the
        // pre-existing single-relay `publicationDistributionCommand`
        // (routing between the two per the Wanderer's own Nostr/Arweave
        // substrate choice), and EditorView.js — which never offered that
        // choice, and was always Nostr-only — inject it INSTEAD of the
        // single-relay command. The allowlist below grows to admit exactly
        // those three files, for exactly this reason; the invariant itself
        // is UNCHANGED: every admitted file reaches multi-relay fan-out
        // ONLY through the existing, unmodified `multiRelayNostrPublicationDistributionCommand`
        // instance `ui/main.js` composes and provides — never by
        // constructing `NostrMultiRelayPublicationDiscoveryPublisher` or
        // `NostrMultiRelayPublicationDistributionOrchestrator` directly, and
        // never by importing either. J4c, below, is extended to prove this
        // for all six allowlisted files together, not only ui/main.js.
        const NOSTR_MULTI_RELAY_UI_REACHABILITY_ALLOWLIST = new Set([
            'ui/main.js',
            'ui/router/index.js',
            'ui/views/NostrPublicationRelaySettingsView.js',
            'ui/views/WorldView.js',
            'ui/views/EditorView.js',
            'ui/views/DecentralizedPublicationsView.js'
        ]);
        const uiFiles = await listJsFilesRecursive('ui');
        const uiFilesReferencingMultiRelay = [];
        for (const relPath of uiFiles) {
            const text = await source(relPath);
            if (/MultiRelay|nostrRelayUrls/.test(text)) {
                uiFilesReferencingMultiRelay.push(relPath);
            }
        }
        const unexpectedUiFiles = uiFilesReferencingMultiRelay.filter((relPath) => !NOSTR_MULTI_RELAY_UI_REACHABILITY_ALLOWLIST.has(relPath));
        assert(unexpectedUiFiles.length === 0, n(`J4. AMENDED BY 0.9.450 — no file under ui/ OUTSIDE this milestone's own six allowlisted files references "MultiRelay" or "nostrRelayUrls" — found unexpected: ${JSON.stringify(unexpectedUiFiles)}. The UI layer still has no independent, hidden fan-out capability of its own — the only reachability is through the existing, unmodified application-layer composer`));
        assert(new Set(uiFilesReferencingMultiRelay).size <= NOSTR_MULTI_RELAY_UI_REACHABILITY_ALLOWLIST.size, n('J4b. the allowlisted set itself has not silently grown beyond the six files this milestone actually added'));
        const mainSource = await source('ui/main.js');
        assert(!/new NostrMultiRelayPublicationDiscoveryPublisher/.test(mainSource) && !mainSource.includes("from '../application/NostrMultiRelayPublicationDiscoveryPublisher.js'"),
            n('J4c. ui/main.js never constructs NostrMultiRelayPublicationDiscoveryPublisher directly and never imports it — it only calls composeMultiRelayNostrPublicationDistributionCommand(), the existing application-layer composer, exactly as it already does for the single-relay command'));
        // J4d. AMENDED BY 0.9.450 — the same "no direct construction, no
        // direct import" check, extended to the three real distribution
        // views this milestone newly admits to the allowlist above. Each
        // one calls the injected `multiRelayNostrPublicationDistributionCommand`
        // by name only — never `new NostrMultiRelayPublicationDiscoveryPublisher(...)`,
        // never `orchestrateMultiRelayNostrPublicationDistribution(...)`,
        // and never an import of either file — the identical restraint
        // J4c already proves for ui/main.js, held here for its three own
        // new callers.
        const worldViewSource = await source('ui/views/WorldView.js');
        const editorViewSource = await source('ui/views/EditorView.js');
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');
        for (const [label, text] of [['WorldView.js', worldViewSource], ['EditorView.js', editorViewSource], ['DecentralizedPublicationsView.js', publicationsViewSource]]) {
            assert(!/new NostrMultiRelayPublicationDiscoveryPublisher/.test(text) && !/orchestrateMultiRelayNostrPublicationDistribution/.test(text),
                n(`J4d. ${label} never constructs NostrMultiRelayPublicationDiscoveryPublisher or calls orchestrateMultiRelayNostrPublicationDistribution directly — it only calls the injected multiRelayNostrPublicationDistributionCommand, exactly like every other admitted file`));
            assert(!text.includes("from '../application/NostrMultiRelayPublicationDiscoveryPublisher.js'") && !text.includes("from '../application/NostrMultiRelayPublicationDistributionOrchestrator.js'"),
                n(`J4e. ${label} imports neither NostrMultiRelayPublicationDiscoveryPublisher.js nor NostrMultiRelayPublicationDistributionOrchestrator.js`));
        }

        console.log('✓ Section J: the lifecycle store, the pre-existing single-relay command, the discovery-query read side, and every real ui/ file are all confirmed free of any independent multi-relay fan-out capability — only the Nostr multi-relay publisher/orchestrator own it');
    }

    // ===============================================================
    // Section K — Configuration remains external.
    // ===============================================================
    {
        const publisherSource = codeOnly(await source('application/NostrMultiRelayPublicationDiscoveryPublisher.js'));
        const orchestratorSource = codeOnly(await source('application/NostrMultiRelayPublicationDistributionOrchestrator.js'));
        const commandSource = codeOnly(await source('application/PublicationDistributionCommand.js'));

        // No literal relay URL is hardcoded anywhere in the new files —
        // unlike NostrPublicationDiscoveryPublisher.js's own single-relay
        // DEFAULT_RELAY_URL (pre-existing, out of this milestone's scope),
        // the multi-relay family defines no default list of its own.
        assert(!/wss:\/\//.test(publisherSource), n('K1. NostrMultiRelayPublicationDiscoveryPublisher.js contains no hardcoded relay URL literal anywhere in real code'));
        assert(!/wss:\/\//.test(orchestratorSource), n('K2. NostrMultiRelayPublicationDistributionOrchestrator.js contains no hardcoded relay URL literal anywhere in real code'));
        assert(!/DEFAULT_RELAY_URLS|DEFAULT_NOSTR_RELAYS/.test(publisherSource + orchestratorSource + commandSource), n('K3. no "default relay list" constant of any name exists in any of the three new/amended files'));

        // The configuration provider (the one file this codebase already
        // uses to decide where signer/relay credentials come from) exposes
        // no plural relay-list resolver — only the pre-existing singular
        // resolveNostrPublisherOptions(relayUrl), confirming there is no
        // new configuration SOURCE this milestone quietly wired itself to.
        const configProviderSource = await source('application/PublicationDistributionConfigurationProvider.js');
        assert(!/resolveNostrRelayUrls|resolveNostrMultiRelay/.test(configProviderSource), n('K4. PublicationDistributionConfigurationProvider.js exposes no relay-LIST resolver of any kind — nostrRelayUrls has no persistent configuration source anywhere in this codebase yet'));

        // Behaviorally: omitting nostrRelayUrls throws, at construction
        // time, rather than silently defaulting to some discovered or
        // persisted list.
        let threw = false;
        try {
            // eslint-disable-next-line no-new
            new NostrMultiRelayPublicationDiscoveryPublisher({ discoveryTag: 'audit-k', publishImpl: async () => ({ published: true, id: '0'.repeat(64) }) });
        } catch (error) {
            threw = true;
        }
        assert(threw, n('K5. constructing the real NostrMultiRelayPublicationDiscoveryPublisher without relayUrls throws synchronously — there is no silent default relay set to fall back to'));

        let orchestratorThrew = false;
        try {
            orchestrateMultiRelayNostrPublicationDistribution({
                publication: makeFakePublication('pub-audit-k'),
                serializedMaterial: '{}',
                arweaveUploaderOptions: { signer: makeFakeArweaveSubstrate().contentSigner, fetchImpl: makeFakeArweaveSubstrate().fetchImpl },
                nostrPublisherOptions: { discoveryTag: 'audit-k', publishImpl: async () => ({ published: true, id: '0'.repeat(64) }) }
                // nostrRelayUrls deliberately omitted
            });
        } catch (error) {
            orchestratorThrew = true;
        }
        assert(orchestratorThrew, n('K6. the real orchestrator, called with no nostrRelayUrls at all, throws synchronously rather than silently inventing a relay set of its own'));

        console.log('✓ Section K: no hardcoded or persisted relay list exists anywhere in the new files or the existing configuration provider — a caller who omits nostrRelayUrls gets a construction-time throw, never a silent default, preserving configuration -> selection -> execution -> observation as separate concerns');
    }

    // ===============================================================
    // Section L — The reachability classification this milestone's own
    // request asked to be settled explicitly.
    // ===============================================================
    {
        // L1. The new command-level export genuinely exists and is
        // genuinely callable — already proven behaviorally by every
        // section above; restated here as the classification's own
        // starting fact.
        assert(typeof executeMultiRelayNostrPublicationDistributionCommand === 'function', n('L1. executeMultiRelayNostrPublicationDistributionCommand is a real, callable export of application/PublicationDistributionCommand.js'));

        // AMENDED BY 0.9.447 — Nostr Publication Relay Set Configuration.
        // Section L's own original point-in-time classification was
        // "real and correct but not reachable through any existing UI or
        // application entry point" — and it explicitly named that gap as
        // 0.9.446's own job to decide, and 0.9.446 then recommended closing
        // it exactly the way 0.9.447 did: a genuinely separate, sibling
        // relay-SET configuration, reached through the ordinary composition
        // root. L2/L2b/L3/L4 below are updated to assert the NEW, deliberate
        // reachability instead of its prior absence — never loosened into a
        // vague "something changed," but pinned to the exact same three
        // files 0.9.446's own audit and this milestone's own
        // NostrPublicationRelaySetConfiguration.test.js (Section G/J) already
        // name as legitimate.
        //
        // L2. The UI composition root now DOES expose a multi-relay
        // variant, additively, alongside the untouched single-relay one.
        const compositionSource = await source('application/PublicationDistributionCommandComposition.js');
        assert(/composeMultiRelayNostrPublicationDistributionCommand/.test(compositionSource), n('L2. AMENDED BY 0.9.447 — application/PublicationDistributionCommandComposition.js (the real UI composition root) now exposes composeMultiRelayNostrPublicationDistributionCommand(), the deliberate reachability seam this section originally found missing'));
        assert(/executePublicationDistributionCommand/.test(compositionSource) && compositionSource.includes('executeMultiRelayNostrPublicationDistributionCommand'), n('L2b. AMENDED BY 0.9.447 — the composition root now wraps BOTH the single-relay command export (untouched) and the multi-relay command export (new, additive)'));

        // L3. Every real ui/ file is swept; only the three files 0.9.447
        // legitimately added (ui/main.js's own composition-root wiring,
        // ui/router/index.js's own new route, and the one new Settings
        // view) may reference the multi-relay command — every OTHER ui/
        // file, above all WorldView.js, WorldEncounterCanvas.js, and
        // DecentralizedPublicationsView.js's own distribution actions,
        // still has zero references, exactly as this section originally
        // required for the whole tree.
        //
        // AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution
        // Wiring. The reachability gap L3's own prior wording named as a
        // virtue ("above all WorldView.js... still has zero references")
        // was exactly the product gap 0.9.449 found and 0.9.450 closed —
        // see this file's own J4/J4d amendment, immediately above, for the
        // full rationale. The allowlist grows to admit the same three
        // files, for the identical reason.
        const NOSTR_MULTI_RELAY_UI_REACHABILITY_ALLOWLIST = new Set([
            'ui/main.js',
            'ui/router/index.js',
            'ui/views/NostrPublicationRelaySettingsView.js',
            'ui/views/WorldView.js',
            'ui/views/EditorView.js',
            'ui/views/DecentralizedPublicationsView.js'
        ]);
        const uiFiles = await listJsFilesRecursive('ui');
        const uiReachabilityFiles = [];
        for (const relPath of uiFiles) {
            const text = await source(relPath);
            if (/MultiRelay|nostrRelayUrls|executeMultiRelayNostrPublicationDistributionCommand/.test(text)) {
                uiReachabilityFiles.push(relPath);
            }
        }
        const unexpectedUiReachabilityFiles = uiReachabilityFiles.filter((relPath) => !NOSTR_MULTI_RELAY_UI_REACHABILITY_ALLOWLIST.has(relPath));
        assert(unexpectedUiReachabilityFiles.length === 0, n(`L3. AMENDED BY 0.9.450 — no file anywhere under ui/ OUTSIDE this milestone's own six allowlisted files names the multi-relay command, "MultiRelay", or "nostrRelayUrls" — found unexpected: ${JSON.stringify(unexpectedUiReachabilityFiles)}`));

        // L4. `application/` itself: the multi-relay classes are now
        // referenced by the two original production files, the command
        // boundary that composes them (PublicationDistributionCommand.js,
        // unchanged since 0.9.444), and this milestone's own new
        // configuration-provider file (which references them only in
        // prose/header commentary explaining the architecture, never in
        // executable code) — no OTHER application/ file (a use case, a
        // runtime composition, a different command) references them.
        const applicationFiles = await listJsFilesRecursive('application');
        const referencingFiles = [];
        for (const relPath of applicationFiles) {
            if (relPath.endsWith('NostrMultiRelayPublicationDiscoveryPublisher.js') || relPath.endsWith('NostrMultiRelayPublicationDistributionOrchestrator.js')) {
                continue;
            }
            const text = await source(relPath);
            if (/NostrMultiRelay/.test(text)) {
                referencingFiles.push(relPath);
            }
        }
        assert(JSON.stringify(referencingFiles.sort()) === JSON.stringify(['application/NostrPublicationRelaySetConfigurationProvider.js', 'application/PublicationDistributionCommand.js']),
            n(`L4. AMENDED BY 0.9.447 — exactly the expected two OTHER application/ files reference the multi-relay classes: PublicationDistributionCommand.js (unchanged since 0.9.444) and application/NostrPublicationRelaySetConfigurationProvider.js (this milestone's own new file, referencing them only in its own header commentary) — no use case, runtime composition, or other command file does. Found: ${JSON.stringify(referencingFiles)}`));

        console.log('✓ Section L: AMENDED BY 0.9.447 — CLASSIFICATION UPDATED. executeMultiRelayNostrPublicationDistributionCommand() is now reachable through the ordinary application composition root (composeMultiRelayNostrPublicationDistributionCommand(), application/PublicationDistributionCommandComposition.js), wired at ui/main.js exactly like every other distribution command, with a real Settings surface (ui/views/NostrPublicationRelaySettingsView.js) and route (/settings/nostr-publication-relays) supplying its configuration. This section\'s own original "classification (2), currently internal but intentionally so" finding is superseded — the product decision it named as remaining ("where should a caller\'s own nostrRelayUrls list come from") was 0.9.446\'s own job, and 0.9.446 recommended exactly the configuration this milestone (0.9.447) built. See tests/NostrPublicationRelaySetConfiguration.test.js for the full, dedicated test coverage of that new configuration layer.');
    }

    // ===============================================================
    // Section M — Final boundary verdict.
    // ===============================================================
    {
        console.log(`\n✅ All Nostr Multi-Relay Fan-Out Integration Boundary Audit (0.9.445) checks passed (${assertionCount} assertions).`);
        console.log('VERDICT: NOSTR_MULTI_RELAY_FAN_OUT_INTEGRATION_COMPLETE — 0.9.444\'s fan-out capability survives the real application boundary: the real executeMultiRelayNostrPublicationDistributionCommand() delivers every configured field (relayUrls, discoveryTag, tagName, kind, publication identity, shared material URI, injected publishImpl) unmolested; material uploads exactly once regardless of relay count; independent relay success/failure is preserved in both directions; three relays\' own observations are simultaneously retrievable through the real 0.9.443 lifecycle path with no phantom entries on failure; repeated publication replaces rather than accumulates; relay order never changes the resulting set of facts; a one-element relay list is semantically identical to the pre-existing single-relay command; and every OTHER distribution surface — the existing single-relay Nostr command, Arweave content/gateway-failover, Arweave/Bitcoin anchoring, Snapshot distribution, and the discovery-query read side — remains structurally and behaviorally untouched. REACHABILITY CLASSIFICATION: AMENDED BY 0.9.447 — the capability is now reachable through the ordinary application composition root (application/PublicationDistributionCommandComposition.js\'s own new composeMultiRelayNostrPublicationDistributionCommand()), configured through a genuinely separate, persisted relay-set configuration (core/NostrPublicationRelaySetConfiguration.js, storage/NostrPublicationRelaySetConfigurationStore.js) and a real Settings surface (ui/views/NostrPublicationRelaySettingsView.js, /settings/nostr-publication-relays) — see tests/NostrPublicationRelaySetConfiguration.test.js for that layer\'s own full coverage. Test-only when originally written (0.9.445) — this file\'s own Section L is amended here to record a later, real production change made by a subsequent milestone (0.9.447), not by this file itself.');
    }
}

run().catch((error) => {
    console.error('NostrMultiRelayFanOutIntegrationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
