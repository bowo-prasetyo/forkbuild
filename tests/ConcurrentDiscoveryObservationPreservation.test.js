import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

// 0.9.433 — Concurrent Discovery Observation Preservation.
//
// 0.9.432's own read-only audit (tests/PublicationDistributionLifecycleObservationAudit.test.js)
// proved a minimal, additive seam could preserve both an earlier and a
// later substrate's own independently successful Announcement/Discovery
// observation for the same Publication, without changing
// `PublicationDistributionLifecycleStore.js`'s own existing get()/set()/
// subscribe() contract. This milestone is that seam, actually built:
//
//   PublicationDistributionLifecycleStore.js
//        + recordDiscoveryObservation(publicationId, discoveryProvider, section)
//        + getDiscoveryObservations(publicationId)      (both additive)
//
//   PublicationDistributionCommand.js
//        recordPublicationDistributionResult() now also calls
//        recordDiscoveryObservation() whenever a fresh result reports
//        discovery PRESENT — alongside, never instead of, the existing
//        lifecycleStore.set() call.
//
//   ui/components/WorldEncounterCanvas.js
//        the Distribution panel's Discovery row becomes a v-for over
//        discoveryObservations() whenever more than one substrate
//        observation exists; otherwise it stays byte-identical to
//        today's single row.
//
// This is a PRODUCTION test (unlike 0.9.432's own audit) — every section
// below exercises the real store/command/UI seam, never a test-only
// prototype.
//
//   Section A: existing single-provider behavior — unchanged
//   Section B: Nostr + Arweave coexistence (nostr-then-arweave)
//   Section C: reverse-order coexistence (arweave-then-nostr)
//   Section D: per-provider replacement — four calls, two observations
//   Section E: provider isolation across distinct publications
//   Section F: backward compatibility of the existing get() contract
//   Section G: existing subscribers remain functional
//   Section H: the UI's own discoveryObservations computed renders every
//              current observation, via the real component export
//   Section I: Content (material) remains untouched by any of this
//   Section J: Proof/Anchor remains untouched — cross-role isolation holds
//   Section K: no fan-out — exactly one publisher invocation per call
//   Section L: no new lifecycle vocabulary anywhere this milestone touches
//   Section M: architectural regression — the store's own get()/set()/
//              subscribe() contract, and the command's own duck-typing
//              discipline, are unmodified

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

// The same fake Arweave substrate technique 0.9.431/0.9.432 already
// established, extended with call counters for Section K's own
// no-fan-out check.
function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
    let uploadCount = 0;
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
            ledger.set(transaction.id, { data: transaction.data, tag: null });
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    async function uploadTaggedTransaction(material, tag) {
        uploadCount += 1;
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }
    return { ledger, contentSigner, fetchImpl, uploadTaggedTransaction, getUploadCount: () => uploadCount };
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

let fakeNostrEventCounter = 0;
function nextFakeNostrEventId() {
    fakeNostrEventCounter += 1;
    return String(fakeNostrEventCounter).padStart(64, '0');
}

function makeRealComposedCommand() {
    const net = makeFakeArweaveSubstrate();
    let nostrPublishCount = 0;
    const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
    const command = composePublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
        nostrPublisherOptions: {
            discoveryTag: 'preservation-nostr',
            publishImpl: async () => {
                nostrPublishCount += 1;
                return { published: true, id: nextFakeNostrEventId() };
            }
        },
        arweaveAnnouncementPublisherOptions: {
            discoveryTag: 'preservation-arweave',
            uploadTaggedTransaction: net.uploadTaggedTransaction
        }
    });
    return { command, lifecycleStore, net, getNostrPublishCount: () => nostrPublishCount };
}

function distribute(command, publication, discoveryProvider) {
    return command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()), discoveryProvider });
}

async function run() {
    // ===============================================================
    // Section A — existing single-provider behavior is unchanged.
    // ===============================================================
    {
        for (const onlyProvider of ['nostr', 'arweave']) {
            const { command, lifecycleStore } = makeRealComposedCommand();
            const publication = makeFakePublication(`pub-a-${onlyProvider}-only`);
            const result = await distribute(command, publication, onlyProvider);

            assert(result && result.discovery !== null, n(`A1[${onlyProvider}]. the real distribution genuinely succeeded`));

            const observations = lifecycleStore.getDiscoveryObservations(publication.id);
            assert(observations.length === 1, n(`A2[${onlyProvider}]. exactly one observation exists when only one substrate was ever used`));
            assert(observations[0].discoveryProvider === onlyProvider, n(`A3[${onlyProvider}]. it correctly names the one substrate actually used`));

            const lifecycle = lifecycleStore.get(publication.id);
            assert(lifecycle.discovery.origin === observations[0].origin, n(`A4[${onlyProvider}]. the pre-existing get() accessor still agrees with the new accessor for the single-provider case`));
        }

        // A publication never distributed at all reports zero observations.
        {
            const { lifecycleStore } = makeRealComposedCommand();
            assert(lifecycleStore.getDiscoveryObservations('pub-a-never-distributed').length === 0, n('A5. a publication with no distribution attempt reports zero observations, never a fabricated entry'));
        }

        console.log('✓ Section A: single-provider behavior is unchanged — exactly one observation, agreeing with get()');
    }

    // ===============================================================
    // Section B — Nostr + Arweave coexistence, nostr-then-arweave.
    // ===============================================================
    {
        const { command, lifecycleStore } = makeRealComposedCommand();
        const publication = makeFakePublication('pub-b-nostr-then-arweave');

        const nostrResult = await distribute(command, publication, 'nostr');
        const arweaveResult = await distribute(command, publication, 'arweave');

        // The pre-existing single-slot contract is UNCHANGED — it still
        // collapses to the last substrate used, exactly as 0.9.431 found.
        const collapsed = lifecycleStore.get(publication.id);
        assert(collapsed.discovery.origin === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, n('B1. the existing get() contract is untouched — it still names only the last substrate'));

        // The additive seam retains BOTH, independently.
        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('B2. both substrate observations are retained, never collapsed to one'));
        const nostrObservation = observations.find((o) => o.discoveryProvider === 'nostr');
        const arweaveObservation = observations.find((o) => o.discoveryProvider === 'arweave');
        assert(nostrObservation.origin === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL && nostrObservation.id === nostrResult.discovery.id, n('B3. the retained Nostr observation is genuinely the real, earlier fact'));
        assert(arweaveObservation.origin === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL && arweaveObservation.id === arweaveResult.discovery.id, n('B4. the retained Arweave observation is genuinely the real, later fact'));

        console.log('✓ Section B: nostr-then-arweave — both observations remain independently retrievable, and the pre-existing get() stays exactly as it was');
    }

    // ===============================================================
    // Section C — reverse-order coexistence, arweave-then-nostr.
    // ===============================================================
    {
        const { command, lifecycleStore } = makeRealComposedCommand();
        const publication = makeFakePublication('pub-c-arweave-then-nostr');

        const arweaveResult = await distribute(command, publication, 'arweave');
        const nostrResult = await distribute(command, publication, 'nostr');

        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('C1. reversing the order still retains both observations'));
        const nostrObservation = observations.find((o) => o.discoveryProvider === 'nostr');
        const arweaveObservation = observations.find((o) => o.discoveryProvider === 'arweave');
        assert(nostrObservation.id === nostrResult.discovery.id && arweaveObservation.id === arweaveResult.discovery.id, n('C2. both facts are correctly attributed regardless of order — a later substrate never erases an earlier one\'s own independent retrievability'));

        console.log('✓ Section C: arweave-then-nostr — the invariant holds in both directions');
    }

    // ===============================================================
    // Section D — per-provider replacement: Nostr#1, Nostr#2, Arweave#1,
    // Arweave#2 -> exactly two CURRENT observations (Nostr's own latest,
    // Arweave's own latest), never four.
    // ===============================================================
    {
        const { command, lifecycleStore } = makeRealComposedCommand();
        const publication = makeFakePublication('pub-d-replacement');

        await distribute(command, publication, 'nostr');
        const nostrSecond = await distribute(command, publication, 'nostr');
        await distribute(command, publication, 'arweave');
        const arweaveSecond = await distribute(command, publication, 'arweave');

        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('D1. exactly two CURRENT observations after four calls (two per substrate) — never four, never an append-only history'));
        const nostrObservation = observations.find((o) => o.discoveryProvider === 'nostr');
        const arweaveObservation = observations.find((o) => o.discoveryProvider === 'arweave');
        assert(nostrObservation.id === nostrSecond.discovery.id, n('D2. the Nostr slot holds only its own latest fact — the first Nostr attempt is gone, replaced, never accumulated'));
        assert(arweaveObservation.id === arweaveSecond.discovery.id, n('D3. the Arweave slot holds only its own latest fact, independently of the Nostr slot'));

        console.log('✓ Section D: per-provider replacement holds — this remains "current fact per substrate," never a history');
    }

    // ===============================================================
    // Section E — provider isolation across distinct publications.
    // ===============================================================
    {
        const { command, lifecycleStore } = makeRealComposedCommand();
        const pubX = makeFakePublication('pub-e-distinct-x');
        const pubY = makeFakePublication('pub-e-distinct-y');

        await distribute(command, pubX, 'nostr');
        await distribute(command, pubY, 'arweave');

        const observationsX = lifecycleStore.getDiscoveryObservations(pubX.id);
        const observationsY = lifecycleStore.getDiscoveryObservations(pubY.id);
        assert(observationsX.length === 1 && observationsX[0].discoveryProvider === 'nostr', n('E1. publication X holds only its own Nostr observation'));
        assert(observationsY.length === 1 && observationsY[0].discoveryProvider === 'arweave', n('E2. publication Y holds only its own Arweave observation, entirely independent of X'));

        // Removing one publication's own lifecycle entry never disturbs
        // the other's observations, and clears its own.
        lifecycleStore.remove(pubX.id);
        assert(lifecycleStore.getDiscoveryObservations(pubX.id).length === 0, n('E3. remove() clears this publication\'s own discovery observations too — no ghost left behind get()\'s own null'));
        assert(lifecycleStore.getDiscoveryObservations(pubY.id).length === 1, n('E4. ...while a different publication\'s own observations are entirely unaffected'));

        console.log('✓ Section E: provider isolation holds across distinct publications, including on remove()');
    }

    // ===============================================================
    // Section F — backward compatibility of the existing get() contract.
    // ===============================================================
    {
        const { command, lifecycleStore } = makeRealComposedCommand();
        const publication = makeFakePublication('pub-f-compat');

        assert(lifecycleStore.get(publication.id) === null, n('F1. get() on a never-distributed publication still returns null, exactly as before'));

        await distribute(command, publication, 'nostr');
        await distribute(command, publication, 'arweave');

        const lifecycle = lifecycleStore.get(publication.id);
        assert(lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle), n('F2. get() still returns a single plain lifecycle object, never an array, regardless of how many discovery observations now exist'));
        assert(lifecycle.discovery.state === PublicationDistributionState.PRESENT && typeof lifecycle.discovery.origin === 'string', n('F3. get()\'s own single discovery section still has exactly its pre-0.9.433 shape'));
        assert(lifecycleStore.get('') === null && lifecycleStore.get(null) === null && lifecycleStore.get(undefined) === null, n('F4. malformed publicationId still degrades get() to null, exactly as before'));

        console.log('✓ Section F: get()\'s own existing contract is fully backward compatible');
    }

    // ===============================================================
    // Section G — existing subscribers remain functional.
    // ===============================================================
    {
        const { command, lifecycleStore } = makeRealComposedCommand();
        const publication = makeFakePublication('pub-g-subscribers');

        let notifications = 0;
        let lastLifecycle;
        const unsubscribe = lifecycleStore.subscribe(publication.id, (publicationId, lifecycle) => {
            notifications += 1;
            lastLifecycle = lifecycle;
            assert(publicationId === publication.id, n('G-inline. the subscriber is told about the correct publicationId'));
        });

        await distribute(command, publication, 'nostr');
        assert(notifications >= 1, n('G1. the pre-existing subscription still fires on a fresh distribution result'));
        assert(lastLifecycle === lifecycleStore.get(publication.id), n('G2. the subscriber receives the exact same reference get() now returns — identity preserved, unchanged from 0.9.53'));

        await distribute(command, publication, 'arweave');
        assert(lastLifecycle === lifecycleStore.get(publication.id), n('G3. a second substrate\'s own set() still notifies the same subscriber with the fresh, current lifecycle'));

        unsubscribe();
        const notificationsBeforeFinalCall = notifications;
        await distribute(command, publication, 'nostr');
        assert(notifications === notificationsBeforeFinalCall, n('G4. unsubscribe() still works exactly as before — no further notifications after unsubscribing'));

        console.log('✓ Section G: existing subscribers observe the additive change exactly the same way they always observed set(), with no new notification channel');
    }

    // ===============================================================
    // Section H — the UI's own discoveryObservations computed renders
    // every current observation, through the real component export
    // (the same "pull methods/computed off the real export" technique
    // tests/WorldViewPublicationDistributionActionIntegration.test.js
    // already established).
    // ===============================================================
    {
        const { command, lifecycleStore } = makeRealComposedCommand();
        const publication = makeFakePublication('pub-h-ui');

        function ctx(overrides = {}) {
            return {
                distributionLifecycleStore: lifecycleStore,
                selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
                distributionLifecycle: lifecycleStore.get(publication.id),
                ...overrides
            };
        }

        // Before any distribution: no lifecycle observed yet, so the
        // computed reports zero observations, never a fabricated entry.
        assert(WorldEncounterCanvas.computed.discoveryObservations.call(ctx()).length === 0, n('H1. before any distribution, the UI\'s own computed reports zero observations'));

        await distribute(command, publication, 'nostr');
        const afterNostr = ctx({ distributionLifecycle: lifecycleStore.get(publication.id) });
        const oneObservation = WorldEncounterCanvas.computed.discoveryObservations.call(afterNostr);
        assert(oneObservation.length === 1 && oneObservation[0].discoveryProvider === 'nostr', n('H2. after one substrate, the UI\'s own computed reports exactly that one observation'));

        await distribute(command, publication, 'arweave');
        const afterBoth = ctx({ distributionLifecycle: lifecycleStore.get(publication.id) });
        const bothObservations = WorldEncounterCanvas.computed.discoveryObservations.call(afterBoth);
        assert(bothObservations.length === 2, n('H3. after a second, independently successful substrate, the UI\'s own computed reports BOTH — the exact fact the Distribution panel previously hid'));
        assert(bothObservations.some((o) => o.discoveryProvider === 'nostr') && bothObservations.some((o) => o.discoveryProvider === 'arweave'), n('H4. both substrates are correctly named in what the UI would render'));

        // No distributionLifecycleStore, or a store lacking the new
        // method — degrades to zero observations, never throws.
        assert(WorldEncounterCanvas.computed.discoveryObservations.call(ctx({ distributionLifecycleStore: null })).length === 0, n('H5. no distributionLifecycleStore supplied — the computed degrades to zero observations, never throws'));
        assert(WorldEncounterCanvas.computed.discoveryObservations.call(ctx({ distributionLifecycleStore: { get: () => null, subscribe: () => () => {} } })).length === 0, n('H6. a store lacking getDiscoveryObservations() (duck-typed) still degrades safely — a Wanderer on an older store keeps seeing today\'s single row, never a crash'));

        // The real template genuinely contains the v-for this computed
        // feeds, scoped to the Discovery row alone.
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');
        assert(/v-for="observation in discoveryObservations"/.test(canvasSource), n('H7. the real Distribution panel template contains the v-for over discoveryObservations — confirmed live, not merely inferred from the computed alone'));

        console.log('✓ Section H: the UI genuinely renders every current discovery observation, degrading safely when there is only one (or none), through the real component export');
    }

    // ===============================================================
    // Section I — Content (material) remains untouched.
    // ===============================================================
    {
        const { command, lifecycleStore } = makeRealComposedCommand();
        const publication = makeFakePublication('pub-i-content');

        const nostrResult = await distribute(command, publication, 'nostr');
        const materialAfterFirst = lifecycleStore.get(publication.id).material;
        assert(materialAfterFirst.state === PublicationDistributionState.PRESENT, n('I1. the material dimension is recorded exactly as before — unaffected by discovery observation tracking'));

        await distribute(command, publication, 'arweave');
        const materialAfterSecond = lifecycleStore.get(publication.id).material;
        assert(materialAfterSecond.state === PublicationDistributionState.PRESENT, n('I2. a second distribution call still records material exactly as 0.9.50/0.9.51 already define, regardless of how many discovery observations now exist'));

        // Structurally: the new store methods' own code bodies never read
        // or write anything material-shaped.
        const storeSource = codeOnly(await source('application/PublicationDistributionLifecycleStore.js'));
        const recordStart = storeSource.indexOf('recordDiscoveryObservation(publicationId, discoveryProvider, discoverySection) {');
        const recordEnd = storeSource.indexOf('\n    }', recordStart);
        const getObservationsStart = storeSource.indexOf('getDiscoveryObservations(publicationId) {');
        const getObservationsEnd = storeSource.indexOf('\n    }', getObservationsStart);
        const newMethodsCode = storeSource.slice(recordStart, recordEnd) + storeSource.slice(getObservationsStart, getObservationsEnd);
        assert(newMethodsCode.length > 0, n('I3. the new methods\' own source was actually located for scanning'));
        assert(!/material/i.test(newMethodsCode), n('I4. the new methods\' own code never mentions material at all — this addition is scoped to Announcement/Discovery alone'));

        console.log('✓ Section I: Content/material is completely untouched by this milestone, confirmed both behaviorally and structurally');
    }

    // ===============================================================
    // Section J — Proof/Anchor remains untouched; cross-role isolation
    // holds exactly as 0.9.432's own Section I already established.
    // ===============================================================
    {
        const anchorFiles = [
            'application/CreateArweaveAnchorPublisherUseCase.js',
            'application/CreateArweaveAnchorProofVerifierUseCase.js',
            'application/CreateArweaveAnchorEvidenceViewUseCase.js'
        ];
        for (const file of anchorFiles) {
            const code = await source(file);
            assert(!/PublicationDistributionLifecycle/.test(code), n(`J1[${file}]. Proof/Anchor never references the Announcement/Discovery lifecycle family — this milestone's own additive change reaches no anchor file at all`));
            assert(!/recordDiscoveryObservation|getDiscoveryObservations/.test(code), n(`J2[${file}]. ...and specifically never references either of this milestone's own two new methods`));
        }

        const placementFiles = [
            'core/PublicationSnapshotPlacement.js',
            'application/LocalPublicationSnapshotPlacementCatalog.js',
            'application/AddPublicationSnapshotPlacementUseCase.js'
        ];
        for (const file of placementFiles) {
            const code = await source(file).catch(() => '');
            if (!code) continue;
            assert(!/recordDiscoveryObservation|getDiscoveryObservations/.test(code), n(`J3[${file}]. Content placement never references either of this milestone's own new methods either — the two dimensions share Arweave as a substrate, never any code path`));
        }

        console.log('✓ Section J: Proof/Anchor and Content placement remain fully isolated from this milestone\'s own additive change');
    }

    // ===============================================================
    // Section K — no fan-out: exactly one publisher invocation per
    // distribution call, never both, regardless of how many observations
    // now accumulate across calls.
    // ===============================================================
    {
        const { command, lifecycleStore, net, getNostrPublishCount } = makeRealComposedCommand();
        const publication = makeFakePublication('pub-k-no-fanout');

        await distribute(command, publication, 'nostr');
        assert(getNostrPublishCount() === 1 && net.getUploadCount() === 0, n('K1. selecting Nostr invokes exactly the Nostr publisher, never Arweave\'s own announcement upload'));

        await distribute(command, publication, 'arweave');
        assert(getNostrPublishCount() === 1 && net.getUploadCount() === 1, n('K2. selecting Arweave next invokes exactly the Arweave announcement upload, never a second Nostr publish — one explicit provider per action, never automatic execution of the other'));

        console.log('✓ Section K: execution stays exactly "one explicit provider per distribution action" — no fan-out, regardless of how many observations this milestone now retains');
    }

    // ===============================================================
    // Section L — no new lifecycle vocabulary anywhere this milestone
    // touches, scanned from the CODE (never the documentation prose,
    // which legitimately names excluded vocabulary to document that it
    // is excluded).
    // ===============================================================
    {
        const forbiddenVocabulary = ['PARTIAL', 'MULTI_SUCCESS', 'FAILED', 'SUCCESS', 'PENDING', 'RETRYING', 'CONFIRMED', 'WITHDRAWN', 'kind/objectId'];
        const storeCode = codeOnly(await source('application/PublicationDistributionLifecycleStore.js'));
        const commandCode = codeOnly(await source('application/PublicationDistributionCommand.js'));
        const canvasCode = codeOnly(await source('ui/components/WorldEncounterCanvas.js'));

        for (const term of forbiddenVocabulary) {
            assert(!storeCode.includes(term), n(`L1[${term}]. PublicationDistributionLifecycleStore.js's own CODE never introduces "${term}"`));
            assert(!commandCode.includes(term), n(`L2[${term}]. PublicationDistributionCommand.js's own CODE never introduces "${term}"`));
            assert(!canvasCode.includes(term), n(`L3[${term}]. WorldEncounterCanvas.js's own CODE never introduces "${term}"`));
        }
        assert(!/\bstatus\s*[:=]/.test(storeCode), n('L4. no overall status/success field is computed anywhere in the store\'s own additive methods'));

        console.log('✓ Section L: no new lifecycle vocabulary anywhere this milestone touches — every retained fact keeps precisely PublicationDistributionState.PRESENT\'s own existing semantics');
    }

    // ===============================================================
    // Section M — architectural regression.
    // ===============================================================
    {
        const storeSource = await source('application/PublicationDistributionLifecycleStore.js');
        assert(!storeSource.includes('PublicationDistributionCommand'), n('M1. the store still never names any particular caller by file — it remains just as ignorant of PublicationDistributionCommand.js as it always was'));
        assert(/get\(publicationId\)\s*\{/.test(storeSource) && /set\(publicationId, lifecycle\)\s*\{/.test(storeSource) && /subscribe\(publicationId, listener\)\s*\{/.test(storeSource), n('M2. get()/set()/subscribe() keep exactly their pre-0.9.433 signatures'));

        const commandSource = await source('application/PublicationDistributionCommand.js');
        assert(/typeof lifecycleStore\.recordDiscoveryObservation === 'function'/.test(codeOnly(commandSource)), n('M3. the command duck-types recordDiscoveryObservation() before calling it — a minimal { get, set } lifecycleStore (this codebase\'s own existing test convention) keeps working exactly as before, unmodified'));

        console.log('✓ Section M: get()/set()/subscribe() keep their exact pre-0.9.433 shape, and the command stays duck-typed rather than newly required');
    }

    console.log(`\nAll ConcurrentDiscoveryObservationPreservation tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
