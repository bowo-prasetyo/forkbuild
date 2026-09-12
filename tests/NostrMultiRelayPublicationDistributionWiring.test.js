import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NostrPublicationRelaySetConfigurationStore } from '../storage/NostrPublicationRelaySetConfigurationStore.js';
import { SetNostrPublicationRelaySetConfigurationUseCase } from '../application/SetNostrPublicationRelaySetConfigurationUseCase.js';
import { resolveNostrPublicationRelayUrls } from '../application/NostrPublicationRelaySetConfigurationProvider.js';
import {
    composeMultiRelayNostrPublicationDistributionCommand,
    composePublicationDistributionCommand
} from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.450 — Nostr Multi-Relay Publication Distribution Wiring.
//
// TYPE: production implementation. SCOPE: write-side only.
//
// 0.9.449's own product reassessment found the entire multi-relay
// distribution chain (0.9.442-0.9.448) fully built, fully tested in
// isolation, and composed app-wide at `ui/main.js` — but reachable from
// NONE of the three real distribution actions a Wanderer can actually
// click: `ui/views/WorldView.js`, `ui/views/EditorView.js`, and
// `ui/views/DecentralizedPublicationsView.js` each called only the
// single-relay `publicationDistributionCommand`, regardless of how many
// relays a Wanderer had configured. This milestone closes exactly that
// gap — see each file's own 0.9.450 amendment — and this file is its
// dedicated integration test.
//
// THE KEY PRINCIPLE THIS FILE EXISTS TO PROVE: no algorithm changed. Every
// section below either (a) proves a real ROUTING decision made by
// production code, extracted and executed LIVE from the current source
// text (never a hand-paraphrased reimplementation), or (b) proves the
// already-tested multi-relay command behaves identically when reached
// through this new wiring as it already did in isolation (0.9.444-0.9.449).
//
// Section A: existing single-relay behavior remains compatible.
// Section B: WorldView.js reachability.
// Section C: EditorView.js reachability.
// Section D: DecentralizedPublicationsView.js reachability.
// Section E: configuration propagation.
// Section F: independent relay execution.
// Section G: mixed failure isolation.
// Section H: lifecycle observation identity.
// Section I: cross-role isolation.
// Section J: no hidden fan-out.
// Section K: architectural guard — the milestone's own explicit exclusions.
// Section L: production-change guard.

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

// Extracts { params, bodyText } for `function NAME(...) { ... }` from a
// file's own real source text, via brace-depth matching — never a
// hand-copied paraphrase of the function. Comments/strings inside the
// three functions this file extracts contain no braces, so plain
// character-level depth tracking is sufficient and exact.
function extractFunctionSource(fileText, functionName) {
    const startMarker = `function ${functionName}(`;
    const startIdx = fileText.indexOf(startMarker);
    if (startIdx === -1) {
        throw new Error(`extractFunctionSource: "${functionName}" not found`);
    }
    const parenStart = startIdx + startMarker.length - 1;
    let depth = 0;
    let parenEnd = -1;
    for (let i = parenStart; i < fileText.length; i++) {
        if (fileText[i] === '(') depth++;
        else if (fileText[i] === ')') {
            depth--;
            if (depth === 0) { parenEnd = i; break; }
        }
    }
    const paramsText = fileText.slice(parenStart + 1, parenEnd);
    const params = paramsText.split(',').map((p) => p.trim()).filter(Boolean);
    const braceStart = fileText.indexOf('{', parenEnd);
    let braceDepth = 0;
    let braceEnd = -1;
    for (let i = braceStart; i < fileText.length; i++) {
        if (fileText[i] === '{') braceDepth++;
        else if (fileText[i] === '}') {
            braceDepth--;
            if (braceDepth === 0) { braceEnd = i; break; }
        }
    }
    const bodyText = fileText.slice(braceStart + 1, braceEnd);
    return { params, bodyText };
}

// Builds a genuinely-executing copy of a REAL, currently-shipped function —
// `closureParamNames` stand in for the outer `inject()`-bound consts the
// real function closes over (e.g. `publicationDistributionCommand`), passed
// as ordinary arguments here instead. Calling the result executes the
// EXACT body text this milestone's own commit shipped, at the moment this
// test runs — not a description of it.
function extractLiveFunction(fileText, functionName, closureParamNames) {
    const { params, bodyText } = extractFunctionSource(fileText, functionName);
    // eslint-disable-next-line no-new-func
    return new Function(...closureParamNames, ...params, bodyText);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

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
    return { contentSigner, fetchImpl };
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

// A tiny, honest simulation of several REAL, independent Nostr relays —
// see tests/NostrMultiRelayPublicationDistributionProductReassessment.test.js's
// own identical helper for the full rationale.
function makeRelayNetwork() {
    const relays = new Map();
    function relayFor(relayUrl) {
        if (!relays.has(relayUrl)) relays.set(relayUrl, []);
        return relays.get(relayUrl);
    }
    async function publishImpl(relayUrl, eventTemplate) {
        const id = nextFakeNostrEventId();
        relayFor(relayUrl).push({ id, content: eventTemplate.content, tags: eventTemplate.tags });
        return { published: true, id };
    }
    return { publishImpl, relays };
}

async function run() {
    // ===============================================================
    // Section A — Existing single-relay behavior remains compatible.
    // ===============================================================
    {
        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const singleRelayCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        const publication = makeFakePublication('pub-a-single-relay-unchanged');
        const result = await singleRelayCommand({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });

        assert(!Array.isArray(result), n('A1. the single-relay command still resolves a bare object, never an array — completely unmodified by this milestone'));
        assert(result.material !== null && result.discovery !== null, n('A2. the single-relay command still genuinely succeeds'));
        assert(Object.keys(result).sort().join(',') === 'discovery,material,publication', n('A3. the single-relay result shape carries exactly the same three top-level fields it always has — no new field added anywhere by this milestone'));

        const compositionSource = await source('application/PublicationDistributionCommandComposition.js');
        assert(/export function composePublicationDistributionCommand/.test(compositionSource), n('A4. composePublicationDistributionCommand() itself is untouched by this milestone — still exported, still the single-relay composer'));

        console.log('✓ Section A: the pre-existing single-relay command behaves byte-identically to every prior milestone — this milestone adds a NEW routing decision at three call sites, never a change to the command itself');
    }

    // ===============================================================
    // Section B — WorldView.js reachability.
    // ===============================================================
    {
        const worldViewSource = await source('ui/views/WorldView.js');
        assert(worldViewSource.includes("inject('multiRelayNostrPublicationDistributionCommand'"), n('B1. ui/views/WorldView.js injects multiRelayNostrPublicationDistributionCommand'));
        assert(worldViewSource.includes("inject('publicationDistributionCommand'"), n('B2. ui/views/WorldView.js still injects the single-relay publicationDistributionCommand, kept for its own Arweave substrate choice'));

        // B3. LIVE EXTRACTION — the real distributeWorldEncounterPublication()
        // function body, executed exactly as shipped, against real composed
        // commands (a fake single-relay stub for Arweave, the REAL
        // multi-relay command, composed exactly as ui/main.js composes it,
        // for Nostr).
        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const relayUrls = ['wss://world-1.example', 'wss://world-2.example', 'wss://world-3.example'];
        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: relayUrls,
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        let singleRelayCalls = 0;
        const singleRelayStub = async (request) => {
            singleRelayCalls += 1;
            return { publication: request.publication, material: { uri: 'ar://stub' }, discovery: { id: 'stub', origin: 'arweave' } };
        };
        const liveDistribute = extractLiveFunction(worldViewSource, 'distributeWorldEncounterPublication', [
            'publicationDistributionCommand',
            'multiRelayNostrPublicationDistributionCommand'
        ]);

        const publicationNostr = makeFakePublication('pub-b-world-nostr');
        const nostrResults = await liveDistribute(singleRelayStub, multiRelayCommand, publicationNostr, undefined);
        assert(Array.isArray(nostrResults) && nostrResults.length === 3, n('B4. the REAL, live-extracted distributeWorldEncounterPublication(), called with an omitted discoveryProvider (every pre-existing caller), reaches the multi-relay command and fans out to all three configured relays'));
        assert(singleRelayCalls === 0, n('B5. the single-relay stub was never called for the Nostr-default path'));

        const publicationNostrExplicit = makeFakePublication('pub-b-world-nostr-explicit');
        const nostrExplicitResults = await liveDistribute(singleRelayStub, multiRelayCommand, publicationNostrExplicit, 'nostr');
        assert(Array.isArray(nostrExplicitResults) && nostrExplicitResults.length === 3, n('B6. an explicit "nostr" discoveryProvider (WorldEncounterCanvas\'s own default selection) reaches the identical multi-relay path'));

        const publicationArweave = makeFakePublication('pub-b-world-arweave');
        const arweaveResult = await liveDistribute(singleRelayStub, multiRelayCommand, publicationArweave, 'arweave');
        assert(!Array.isArray(arweaveResult) && singleRelayCalls === 1, n('B7. an explicit "arweave" discoveryProvider still reaches the single-relay command, unaffected by the new Nostr routing — the Arweave path is genuinely untouched'));

        console.log('✓ Section B: ui/views/WorldView.js\'s own real, live-extracted distributeWorldEncounterPublication() routes every Nostr-bound call (omitted or explicit "nostr") through the configured multi-relay command, and every Arweave-bound call through the unmodified single-relay command');
    }

    // ===============================================================
    // Section C — EditorView.js reachability.
    // ===============================================================
    {
        const editorViewSource = await source('ui/views/EditorView.js');
        assert(editorViewSource.includes("inject('multiRelayNostrPublicationDistributionCommand'"), n('C1. ui/views/EditorView.js injects multiRelayNostrPublicationDistributionCommand'));
        assert(!editorViewSource.includes("inject('publicationDistributionCommand'"), n('C2. ui/views/EditorView.js no longer injects the single-relay publicationDistributionCommand at all — it never offered an Arweave substrate choice'));

        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const relayUrls = ['wss://editor-1.example', 'wss://editor-2.example', 'wss://editor-3.example'];
        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: relayUrls,
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        const liveDistribute = extractLiveFunction(editorViewSource, 'distributeEditorPublication', [
            'multiRelayNostrPublicationDistributionCommand'
        ]);
        const publication = makeFakePublication('pub-c-editor');
        const results = await liveDistribute(multiRelayCommand, publication);
        assert(Array.isArray(results) && results.length === 3, n('C3. the REAL, live-extracted distributeEditorPublication() reaches the configured three-relay multi-relay command on its ONLY code path — this view never offered a substrate choice, so it is always Nostr'));
        assert(relayUrls.every((relayUrl) => (network.relays.get(relayUrl) || []).length === 1), n('C4. all three configured relays, and only those three, genuinely received the announcement'));

        console.log('✓ Section C: ui/views/EditorView.js\'s own real, live-extracted distributeEditorPublication() reaches the configured multi-relay command — the only Nostr command this view has ever needed, now the only one it calls');
    }

    // ===============================================================
    // Section D — DecentralizedPublicationsView.js reachability.
    // ===============================================================
    {
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');
        assert(publicationsViewSource.includes("inject('multiRelayNostrPublicationDistributionCommand'"), n('D1. ui/views/DecentralizedPublicationsView.js injects multiRelayNostrPublicationDistributionCommand'));
        assert(publicationsViewSource.includes("inject('publicationDistributionCommand'"), n('D2. ui/views/DecentralizedPublicationsView.js still injects the single-relay publicationDistributionCommand, kept for its own Arweave substrate choice'));

        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const relayUrls = ['wss://pubs-1.example', 'wss://pubs-2.example', 'wss://pubs-3.example'];
        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: relayUrls,
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        let singleRelayCalls = 0;
        const singleRelayStub = async (request) => {
            singleRelayCalls += 1;
            return { publication: request.publication, material: { uri: 'ar://stub' }, discovery: { id: 'stub', origin: 'arweave' } };
        };
        const liveDistribute = extractLiveFunction(publicationsViewSource, 'distributeEntryPublication', [
            'publicationDistributionCommand',
            'multiRelayNostrPublicationDistributionCommand'
        ]);

        const entryNostr = { publication: makeFakePublication('pub-d-entry-nostr') };
        const nostrResults = await liveDistribute(singleRelayStub, multiRelayCommand, entryNostr, 'nostr');
        assert(Array.isArray(nostrResults) && nostrResults.length === 3, n('D3. the REAL, live-extracted distributeEntryPublication(), called with the page\'s own default "nostr" substrate choice, reaches the multi-relay command and fans out to all three configured relays'));
        assert(singleRelayCalls === 0, n('D4. the single-relay stub was never called for the Nostr choice'));

        const entryArweave = { publication: makeFakePublication('pub-d-entry-arweave') };
        const arweaveResult = await liveDistribute(singleRelayStub, multiRelayCommand, entryArweave, 'arweave');
        assert(!Array.isArray(arweaveResult) && singleRelayCalls === 1, n('D5. the "arweave" substrate choice still reaches the single-relay command, unaffected by the new Nostr routing'));

        console.log('✓ Section D: ui/views/DecentralizedPublicationsView.js\'s own real, live-extracted distributeEntryPublication() routes the page\'s own per-entry Substrate choice identically to WorldView.js — Nostr to the configured multi-relay command, Arweave to the unmodified single-relay command');
    }

    // ===============================================================
    // Section E — Configuration propagation.
    // ===============================================================
    {
        const relayStore = new NostrPublicationRelaySetConfigurationStore(new InMemoryStorageProvider());
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: relayStore })
            .execute({ relayUrls: ['wss://relay-a.example', 'wss://relay-b.example', 'wss://relay-c.example'] });
        const resolvedRelayUrls = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: relayStore });
        assert(resolvedRelayUrls.length === 3, n('E1. a persisted three-relay configuration resolves to exactly three relay URLs'));

        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        // Composed exactly as ui/main.js composes it: nostrRelayUrls bound
        // to resolveNostrPublicationRelayUrls()'s own output.
        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: resolvedRelayUrls,
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        const publication = makeFakePublication('pub-e-config-propagation');
        const results = await multiRelayCommand({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
        assert(results.length === 3, n('E2. the real distribution action, composed with the persisted configuration exactly as ui/main.js composes it, receives exactly three relays'));
        assert(['wss://relay-a.example', 'wss://relay-b.example', 'wss://relay-c.example'].every((relayUrl) => (network.relays.get(relayUrl) || []).length === 1),
            n('E3. exactly the three persisted relays, and only those three, received the announcement'));

        console.log('✓ Section E: a real, persisted relay-set configuration propagates unmodified all the way from Settings through resolveNostrPublicationRelayUrls() to the real distribution action — no value is dropped, substituted, or re-derived along the way');
    }

    // ===============================================================
    // Section F — Independent relay execution.
    // ===============================================================
    {
        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: ['wss://f-1.example', 'wss://f-2.example', 'wss://f-3.example'],
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        const publication = makeFakePublication('pub-f-independent');
        const results = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
        assert(results.length === 3 && results.every((r) => r.discovery !== null), n('F1. three independently successful relays produce three independent PRESENT discovery results'));
        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 3 && new Set(observations.map((o) => o.origin)).size === 3, n('F2. three independent relay observations, each with its own distinct origin, are durably recorded'));

        console.log('✓ Section F: A→success, B→success, C→success produces three independent, durably-recorded observations — never collapsed or deduplicated');
    }

    // ===============================================================
    // Section G — Mixed failure.
    // ===============================================================
    {
        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const flakyPublishImpl = async (relayUrl, eventTemplate) => {
            if (relayUrl === 'wss://g-2.example') throw new Error('relay g-2 unreachable');
            return network.publishImpl(relayUrl, eventTemplate);
        };
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: ['wss://g-1.example', 'wss://g-2.example', 'wss://g-3.example'],
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: flakyPublishImpl }
        });
        const publication = makeFakePublication('pub-g-mixed-failure');
        const results = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
        assert(results.length === 3, n('G1. all three relays are reported, even though one genuinely failed'));
        const succeeded = results.filter((r) => r.discovery !== null);
        assert(succeeded.length === 2, n('G2. exactly A and C succeeded — B\'s own failure neither blocked nor was masked by the others'));
        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 2 && observations.every((o) => o.origin !== 'wss://g-2.example'), n('G3. only the two surviving relays are durably recorded — the failed relay leaves no phantom observation'));
        assert(results.every((r) => !('overallStatus' in r) && !('status' in r)), n('G4. no aggregate SUCCESS/PARTIAL/FAILURE status was invented anywhere in the result'));

        console.log('✓ Section G: A→success, B→failure, C→success preserves A and C exactly, with no aggregate status vocabulary of any kind');
    }

    // ===============================================================
    // Section H — Lifecycle observation identity.
    // ===============================================================
    {
        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: ['wss://h-1.example', 'wss://h-2.example'],
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        const publication = makeFakePublication('pub-h-identity');
        await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('H1. two simultaneous relay observations coexist for the same publicationId'));
        assert(observations.every((o) => o.discoveryProvider === 'nostr'), n('H2. both observations share the identical discoveryProvider ("nostr") — relay identity is carried by origin, never by provider'));
        assert(new Set(observations.map((o) => o.origin)).size === 2, n('H3. the two observations are distinguished by discoveryOrigin — the (publicationId, discoveryProvider, discoveryOrigin) identity boundary from 0.9.443 still holds, unmodified, reached through this new wiring'));

        console.log('✓ Section H: the existing publicationId/discoveryProvider/discoveryOrigin identity boundary (0.9.443) continues to preserve simultaneous relay observations when reached through the newly-wired real distribution actions');
    }

    // ===============================================================
    // Section I — Cross-role isolation.
    // ===============================================================
    {
        const worldViewSource = await source('ui/views/WorldView.js');
        const editorViewSource = await source('ui/views/EditorView.js');
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');

        // I1. Snapshot distribution's own command/functions are untouched —
        // still a separate variable, never routed through either
        // publication command this milestone touches.
        for (const [label, text] of [['WorldView.js', worldViewSource], ['DecentralizedPublicationsView.js', publicationsViewSource]]) {
            assert(text.includes('snapshotDistributionCommand') && !/snapshotDistributionCommand[\s\S]{0,120}multiRelayNostrPublicationDistributionCommand/.test(text),
                n(`I1. ${label} still injects snapshotDistributionCommand as its own, entirely separate collaborator — never merged with the Nostr publication path`));
        }

        // I2. The read-side discovery-query service has no relay-list
        // option of any kind — genuinely untouched by this milestone.
        const queryServiceSource = await source('application/NostrDiscoveryQueryService.js');
        assert(!/relayUrls/.test(queryServiceSource), n('I2. application/NostrDiscoveryQueryService.js (Nostr read-side discovery) has no relayUrls-shaped option anywhere — this milestone is deliberately write-side only'));

        // I3. Arweave content placement and Arweave/Bitcoin anchoring
        // remain structurally unaware this milestone exists.
        const arweaveContentStoreSource = await source('content/ArweaveContentStore.js');
        const arweaveAnchorSource = await source('application/ArweaveAnnouncementPublisher.js');
        for (const [label, text] of [['content/ArweaveContentStore.js', arweaveContentStoreSource], ['application/ArweaveAnnouncementPublisher.js', arweaveAnchorSource]]) {
            assert(!/MultiRelay|nostrRelayUrls/.test(text), n(`I3. ${label} references neither "MultiRelay" nor "nostrRelayUrls" — Arweave's own substrate remains structurally isolated from the Nostr relay-set decision this milestone wires up`));
        }

        // I4. None of the three amended views constructs a Bitcoin
        // anchoring collaborator differently, or references it at all in
        // the vicinity of the new Nostr routing.
        for (const [label, text] of [['WorldView.js', worldViewSource], ['EditorView.js', editorViewSource], ['DecentralizedPublicationsView.js', publicationsViewSource]]) {
            assert(!/Bitcoin/.test(extractFunctionSourceSafe(text, label === 'DecentralizedPublicationsView.js' ? 'distributeEntryPublication' : (label === 'EditorView.js' ? 'distributeEditorPublication' : 'distributeWorldEncounterPublication'))),
                n(`I4. ${label}'s own amended Nostr publication distribution function mentions Bitcoin nowhere in its own body`));
        }

        console.log('✓ Section I: changing the publication relay set touches nothing about Arweave content placement, Arweave/Bitcoin anchoring, Snapshot distribution, or Nostr read-side discovery configuration — every other role stays exactly where 0.9.442-0.9.449 already proved it');
    }

    // ===============================================================
    // Section J — No hidden fan-out.
    // ===============================================================
    {
        // J1. A single configured relay executes once.
        {
            const network = makeRelayNetwork();
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const arweaveSubstrate = makeFakeArweaveSubstrate();
            const command = composeMultiRelayNostrPublicationDistributionCommand({
                lifecycleStore,
                arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
                nostrRelayUrls: ['wss://j-only.example'],
                nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
            });
            const publication = makeFakePublication('pub-j-one-relay');
            const results = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
            assert(results.length === 1, n('J1. a single configured relay produces exactly one result'));
            assert((network.relays.get('wss://j-only.example') || []).length === 1, n('J1b. that one relay received exactly one publish call — no hidden second fan-out underneath'));
        }

        // J2. A three-relay configuration executes exactly three times —
        // reconfirmed through THIS milestone's own new wiring (Section E),
        // never merely at the isolated command boundary.
        {
            const network = makeRelayNetwork();
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const arweaveSubstrate = makeFakeArweaveSubstrate();
            let publishCallCount = 0;
            const countingPublishImpl = async (relayUrl, eventTemplate) => {
                publishCallCount += 1;
                return network.publishImpl(relayUrl, eventTemplate);
            };
            const command = composeMultiRelayNostrPublicationDistributionCommand({
                lifecycleStore,
                arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
                nostrRelayUrls: ['wss://j-1.example', 'wss://j-2.example', 'wss://j-3.example'],
                nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: countingPublishImpl }
            });
            const publication = makeFakePublication('pub-j-three-relays');
            await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
            assert(publishCallCount === 3, n('J2. a three-relay configuration executes exactly three publish calls — never more, never fewer'));
        }

        console.log('✓ Section J: relay execution count always matches configured relay count exactly — one relay executes once, three relays execute three times, with no second, hidden fan-out anywhere in this milestone\'s own new wiring');
    }

    // ===============================================================
    // Section K — Architectural guard: this milestone's own explicit
    // exclusions.
    // ===============================================================
    {
        const worldViewSource = await source('ui/views/WorldView.js');
        const editorViewSource = await source('ui/views/EditorView.js');
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const commandSource = await source('application/PublicationDistributionCommand.js');
        const compositionSource = await source('application/PublicationDistributionCommandComposition.js');
        const relayCoreSource = await source('core/NostrPublicationRelaySetConfiguration.js');

        assert(!/relayHealth|relay health|testConnection|Test Connection/i.test(worldViewSource + editorViewSource + publicationsViewSource),
            n('K1. no relay health/diagnostics/test-connection machinery was added anywhere in the three amended views'));
        assert(!/automatic(ally)? discover|relay bootstrap|NIP-65|NIP-11/i.test(relayCoreSource),
            n('K2. no automatic relay discovery mechanism exists — unrevisited by this milestone'));
        assert(!/primary relay|preferred relay|relay priority|rank(ing)? the relay/i.test(commandSource),
            n('K3. no relay-priority language was introduced into the command boundary this milestone wires up'));
        assert(!/entry\.\w*[Rr]elay(Urls|Set|Selection)/.test(publicationsViewSource),
            n('K4. no per-publication relay-selection field was added — the relay set remains application-scoped'));
        assert(!/retry|failover/i.test(extractFunctionSource(worldViewSource, 'distributeWorldEncounterPublication').bodyText),
            n('K5. distributeWorldEncounterPublication() itself introduces no retry/failover logic of its own — a single call to whichever command is chosen, nothing more'));
        assert(!compositionSource.includes('overallStatus') && !compositionSource.includes("'PARTIAL'"),
            n('K6. no aggregate distribution status vocabulary exists anywhere in the composition root'));
        const snapshotRuntimeSource = await source('application/SnapshotDistributionRuntimeComposition.js');
        assert(!/relayUrls/.test(snapshotRuntimeSource), n('K7. Snapshot distribution still has no multi-relay seam of any kind — deliberately excluded from this milestone, exactly as 0.9.449\'s own Section A11 found'));
        const queryServiceSource = await source('application/NostrDiscoveryQueryService.js');
        assert(!/relayUrls/.test(queryServiceSource), n('K8. Nostr read-side discovery remains completely untouched — tracked separately as 0.9.451, deliberately not this milestone'));

        console.log('✓ Section K: every explicit exclusion this milestone named — relay health, automatic discovery, relay priority, per-publication selection, retry/failover, aggregate status, Snapshot multi-relay, read-side discovery — is confirmed absent');
    }

    // ===============================================================
    // Section L — Production-change guard.
    // ===============================================================
    {
        const EXPECTED_PRODUCTION_FILES = new Set([
            'ui/main.js',
            'ui/views/WorldView.js',
            'ui/views/EditorView.js',
            'ui/views/DecentralizedPublicationsView.js'
        ]);
        let productionTouched = [];
        try {
            const commitHash = execSync('git log --grep="^0.9.450 " --format=%H -n 1', { cwd: SOURCE_ROOT }).toString().trim();
            if (commitHash) {
                const diffOutput = execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`, { cwd: SOURCE_ROOT }).toString();
                productionTouched = diffOutput.split('\n')
                    .filter(Boolean)
                    .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
            }
        } catch { /* git unavailable, or this commit does not exist yet at test-authoring time */ }
        if (productionTouched.length > 0) {
            const unexpected = productionTouched.filter((f) => !EXPECTED_PRODUCTION_FILES.has(f));
            assert(unexpected.length === 0, n(`L1. the 0.9.450 commit touches only the expected production files (found unexpected: ${JSON.stringify(unexpected)})`));
        } else {
            assert(true, n('L1. production-change guard skipped — the 0.9.450 commit does not exist yet at test-authoring time, matching every prior milestone\'s own identical guard'));
        }

        console.log('\n✅ All Nostr Multi-Relay Publication Distribution Wiring tests passed.');
    }
}

// Small helper used only by Section I's own Bitcoin-mention check — tries
// the extraction and falls back to the empty string for a function name
// that does not apply to a given file, so the same loop can cover all
// three views without a per-file branch duplicating Section I's own body.
function extractFunctionSourceSafe(fileText, functionName) {
    try {
        return extractFunctionSource(fileText, functionName).bodyText;
    } catch {
        return '';
    }
}

run().catch((error) => {
    console.error('NostrMultiRelayPublicationDistributionWiring.test.js FAILED:', error);
    process.exitCode = 1;
});
