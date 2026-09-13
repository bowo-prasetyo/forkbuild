import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { PeerWorldEncounterMaterialSource } from '../application/PeerWorldEncounterMaterialSource.js';
import {
    PeerWorldEncounterMaterialMessageKind,
    toWorldEncounterMaterialResponseMessage
} from '../application/PeerWorldEncounterMaterialProtocol.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.473 — World Encounter -> Repository Continuity Boundary Audit.
//
// Test-only. Production changes: none (enforced by Section J's own
// git-diff guard).
//
// ORIGINATING OBSERVATION, IN THE PRODUCT OWNER'S OWN WORDS: a Wanderer who
// automatically encounters something interesting in World View has no
// product-level path to find that same material again from the Repository
// afterward -- "I just encountered something interesting in the world.
// Where can I find it again?" has no answer today. The observation
// explicitly named the destination object a "Snapshot" and asked for a
// test-only boundary audit before any implementation.
//
// THIS IS NOT THE FIRST TIME THIS EXACT QUESTION WAS ASKED.
// tests/FederatedRepositoryProductGapAudit.test.js (0.9.329) Section G
// already ran the standing "Capability A complete, Capability B complete,
// A -> B blocked" test against World Encounter -> Repository specifically,
// and found it "structurally never offered," by an explicit, twice-stated,
// family-wide "never persists what it retrieves" rule holding at both the
// material-source layer and the orchestration layer above it, for
// decentralized AND fully-trusted local encounters alike -- verdict
// NOT_A_PRODUCT_GAP -- STOP (docs/Roadmap.md:90152-90169). This milestone
// does not re-litigate whether that verdict was correct when written. It
// asks the sharper, dated question 0.9.329 could not yet ask: eight
// milestones later (0.9.330-0.9.339 through 0.9.352), this codebase built
// the identical "admit an encountered, resolved Publication into a real,
// list()-able, Repository-visible catalog" mechanism for a SIBLING
// encounter flow. Does 0.9.329's "family-wide" rule still describe the
// codebase as it exists today, or has one sibling quietly stopped
// following it while World Encounter's own silence was never revisited?
//
//   Section A -- Vocabulary correction: the originating brief's own
//               "Snapshot" is the wrong domain object, and "World
//               Encounter" itself names TWO structurally different
//               families, only one of which the brief's own symptom
//               ("I encountered something, then lost it") can even
//               describe.
//   Section B -- 0.9.329's own citations, reconfirmed fresh against
//               current HEAD: the WorldEncounter* family still never
//               references LocalPublicationCatalog,
//               DecentralizedPublicationDiscoveryProvider, or
//               admitToRepositoryDiscovery anywhere.
//   Section C -- FLAGSHIP, live: a genuine Publication, delivered to Bob
//               over a real, authenticated peer connection through the
//               real, unmodified PeerWorldEncounterMaterialSource, reaches
//               WorldEncounterCanvas.js's own real, unmodified
//               refreshMaterialInspection() method and lands in
//               materialInspection.loading.material as a genuine
//               `instanceof Publication`, identity intact.
//   Section D -- The contract is not the gap, proven live: the exact
//               Publication instance Section C produced, hoisted into a
//               real, separately-constructed DecentralizedPublicationDiscoveryProvider,
//               is found immediately by a real, unmodified
//               SearchPublicationsUseCase -- mirroring 0.9.334/0.9.335's
//               own proof shape, sourced from World Encounter material
//               instead of Publications-page resolution.
//   Section E -- The gap, confirmed live and structurally: repeating
//               Section C's exact scenario, the resolved Publication never
//               reaches the app-wide provider ui/main.js actually
//               constructs and provides; no call path exists anywhere in
//               the WorldEncounter* production family.
//   Section F -- Content-kind/origin isolation, reconfirmed for free: a
//               decentralized-origin World Encounter selection never
//               produces a Publication instance at all, so an `instanceof
//               Publication` gate excludes it automatically -- exactly
//               0.9.337's own discrimination, requiring no new logic.
//   Section G -- The family this is NOT about: the Automatic Snapshot
//               Encounter Cascade (application/AutomaticSnapshotEncounterCascade.js)
//               most closely matches the brief's own "automatic encounter
//               ... materialized" language, but is structurally gated on
//               a Publication already being locally known
//               (WorldNavigationSession#findPublicationById(), backed by a
//               plain, local-only LocalDiscoveryProvider) -- it can never
//               exhibit the symptom the brief describes, and a future
//               milestone should not "fix" it by mistake.
//   Section H -- Has 0.9.329's own grounding eroded? 0.9.337/0.9.339's own
//               production wiring, read directly, broke the "family-wide"
//               uniformity 0.9.329's NOT_A_PRODUCT_GAP verdict rested on.
//   Section I -- Smallest seam, identified but not built: WorldView.js
//               already injects decentralizedPublicationDiscoveryProvider
//               today, for an unrelated purpose -- the one dependency a
//               fix would need is already sitting at the exact layer that
//               owns WorldEncounterCanvas.js.
//   Section J -- No UI change; no production file touched; final
//               classification.
//
// See docs/Roadmap.md's own 0.9.329, 0.9.330, 0.9.334, 0.9.335, 0.9.337,
// 0.9.339 entries for the sibling arc this milestone measures against.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function selectionOf({ kind, objectId, origin }) {
    return Object.freeze({ kind, objectId, origin });
}

// Sets up one real, live, authenticated Alice <-> Bob peer connection and
// hands back everything a caller needs to drive PeerWorldEncounterMaterialSource
// exactly the way tests/PeerWorldEncounterMaterialSource.test.js's own
// Section C ("FLAGSHIP") already does -- reused here rather than
// reinvented, since this milestone's own flagship depends on the identical
// live-transport proof, one layer further downstream (the UI component,
// not just the application-layer source).
async function connectAliceAndBob() {
    const network = new LocalPeerNetwork();
    const alice = makeIdentity('Alice');
    const bob = makeIdentity('Bob');

    const aliceTransport = new LocalPeerConnectionProvider('alice-continuity-audit', network);
    const bobTransport = new LocalPeerConnectionProvider('bob-continuity-audit', network);
    const aliceListen = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const stopAliceListening = aliceListen.listen();
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const bobToAlicePeer = bobConnect.connect({ candidateEndpoint: 'alice-continuity-audit' });
    await wait(20);
    assert(bobToAlicePeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: Bob authenticates to Alice');

    const aliceBus = new PeerMessageBus();
    const bobBus = new PeerMessageBus();

    const alicePublication = new Publication({
        id: 'pub-alice-continuity-1',
        documentId: 'doc-alice-continuity-1',
        title: 'A World Alice Is Sharing',
        author: 'alice'
    });

    for (const peer of aliceListen.registry.list()) aliceBus.attach(peer);
    aliceListen.registry.onChange((peers) => { for (const peer of peers) aliceBus.attach(peer); });
    aliceBus.subscribe(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL, (payload, meta) => {
        if (payload.kind !== PeerWorldEncounterMaterialMessageKind.REQUEST) return;
        if (payload.encounterKind === WorldEncounterKind.PUBLICATION && payload.objectId === alicePublication.id) {
            aliceBus.send(meta.connectedPeer, PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, alicePublication.id, alicePublication.toJSON()));
        }
    });

    const bobSource = new PeerWorldEncounterMaterialSource(bobBus, bobConnect.registry, { timeoutMs: 2000 });
    const origin = `peer:${bobToAlicePeer.remoteIdentity.identityId}`;

    return {
        alicePublication,
        bobSource,
        origin,
        dispose() {
            bobSource.dispose();
            stopAliceListening();
            aliceTransport.dispose();
            bobTransport.dispose();
        }
    };
}

async function run() {
    // ===============================================================
    // Section A -- Vocabulary correction.
    // ===============================================================
    {
        // A1. "Snapshot" (World placement material, discoveryTag-keyed --
        // application/DiscoverSnapshotCandidatesCommand.js,
        // application/MaterializeSnapshotFromPlacementUseCase.js) and
        // "Publication" (Repository's own object, publisher/Publication.js)
        // are already-established, structurally disjoint domain concepts
        // -- 0.9.330's own Section A drew this line first; reconfirmed
        // here by direct import search rather than accepted by citation.
        const snapshotSource = await readSource('application/MaterializeSnapshotFromPlacementUseCase.js');
        assert(!/from '\.\.\/publisher\/Publication\.js'/.test(snapshotSource) || /publisherIdentity|attribution/i.test(snapshotSource),
            "1. the Snapshot placement pipeline's own use of Publication (if any) is limited to attribution lookups, never a placement-native identity.");

        // A2. "World Encounter" itself names TWO structurally different
        // production families in this codebase, distinguished directly by
        // what they are gated on:
        //
        //   (a) ui/components/WorldEncounterCanvas.js's own peer-broadcast
        //       Publication markers (core/WorldEncounter.js,
        //       application/WorldEncounterMaterialLoading.js,
        //       application/PeerWorldEncounterMaterialSource.js) -- a
        //       connected peer's own World contribution is registered into
        //       application/WorldDiscoverySourceRegistry.js UNCONDITIONALLY,
        //       under its own "peer:<identityId>" origin
        //       (peer/PeerWorldDiscoveryLifecycleBridge.js), regardless of
        //       whether this device has ever seen that Publication before.
        //       This is the ONLY family that can produce the brief's own
        //       symptom -- encountering something genuinely new.
        //
        //   (b) application/AutomaticSnapshotEncounterCascade.js's own
        //       background discover -> resolve -> materialize -> place ->
        //       register chain -- whose OWN vocabulary ("Automatic
        //       Snapshot Encounter") most closely echoes the brief's own
        //       words, but which Section G below proves is gated on a
        //       Publication already being locally known. It cannot
        //       exhibit the brief's own symptom at all.
        //
        // Every later section reasons about family (a) unless explicitly
        // marked otherwise (Section G is explicitly about family (b)).
        const worldEncounterCoreSource = await readSource('core/WorldEncounter.js');
        assert(worldEncounterCoreSource.includes("WorldEncounterKind.PUBLICATION") && worldEncounterCoreSource.includes('AVATAR'),
            '2. core/WorldEncounter.js still names exactly the two kinds this audit reasons about.');
        const cascadeSource = await readSource('application/AutomaticSnapshotEncounterCascade.js');
        assert(/_findPublicationById/.test(cascadeSource),
            '3. the Automatic Snapshot Encounter Cascade is real and, as Section G traces, gated on a publication lookup.');
    }
    console.log("✓ Section A: vocabulary corrected against source -- 'Snapshot' and 'Publication' stay the disjoint objects 0.9.330 already established; 'World Encounter' itself names two structurally different families, and only the peer-broadcast Publication-marker family can produce the brief's own symptom.");

    // ===============================================================
    // Section B -- 0.9.329's own citations, reconfirmed fresh.
    // ===============================================================
    {
        const worldEncounterFiles = [
            'ui/components/WorldEncounterCanvas.js',
            'application/WorldEncounterMaterialLoading.js',
            'application/WorldEncounterMaterialInspection.js',
            'application/PeerWorldEncounterMaterialSource.js',
            'application/LocalWorldEncounterMaterialSource.js',
            'application/DecentralizedWorldEncounterMaterialSource.js',
            'application/WorldEncounterInspection.js',
            'application/WorldEncounterReadModel.js',
            'application/WorldEncounterView.js'
        ];
        for (const file of worldEncounterFiles) {
            const src = await readSource(file);
            assert(!/LocalPublicationCatalog|DecentralizedPublicationDiscoveryProvider|admitToRepositoryDiscovery/.test(src),
                `1. ${file} still carries no reference to LocalPublicationCatalog, DecentralizedPublicationDiscoveryProvider, or admitToRepositoryDiscovery -- 0.9.329's own "never persists what it retrieves" finding still holds, unchanged, at this file today.`);
        }

        // B2. ui/main.js -- the one file that legitimately constructs
        // BOTH the shared decentralizedPublicationDiscoveryProvider and
        // the whole WorldEncounter composition family, as any composition
        // root would -- never passes that provider into any WorldEncounter-
        // family composition call. Exactly three occurrences of the
        // provider's own name exist in that file: its `const` declaration,
        // and its app.provide('decentralizedPublicationDiscoveryProvider',
        // decentralizedPublicationDiscoveryProvider) call (one occurrence
        // for the string key, one for the variable) -- never a fourth,
        // which a WorldEncounter-composition call site would require.
        const mainSourceForB = await readSource('ui/main.js');
        const providerOccurrences = (mainSourceForB.match(/decentralizedPublicationDiscoveryProvider/g) || []).length;
        assert(providerOccurrences === 3,
            `2. ui/main.js references decentralizedPublicationDiscoveryProvider exactly three times -- its own declaration plus its own app.provide() call (key + value) -- never threaded into WorldEncounter composition (found ${providerOccurrences} occurrences).`);
    }
    console.log('✓ Section B: 0.9.329’s own "never persists what it retrieves" citations are reconfirmed fresh against current HEAD -- the WorldEncounter* family still references neither Repository catalog, anywhere.');

    // ===============================================================
    // Section C -- FLAGSHIP, live: a real peer-delivered Publication
    // reaches WorldEncounterCanvas.js's own real, unmodified
    // refreshMaterialInspection() as a genuine Publication instance.
    // ===============================================================
    let flagshipPublication = null;
    {
        const { alicePublication, bobSource, origin, dispose } = await connectAliceAndBob();
        try {
            // Bob's own WorldEncounterCanvas instance, minimally shaped:
            // exactly the fields refreshMaterialInspection() itself reads
            // (this file's own header, "materialInspection IS DATA,
            // WRITTEN BY refreshMaterialInspection()"), called the exact
            // same way tests/WorldEncounterCanvasUI.test.js's own
            // established convention already calls this component's other
            // methods -- directly, against a plain ctx object, never
            // through a DOM/Vue-Test-Utils mount.
            const ctx = {
                materialInspectionRequestId: 0,
                materialInspection: null,
                resolvedEncounterSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: alicePublication.id, origin }),
                resolvedLead: null,
                materialVerifier: null,
                materialSources: { peer: bobSource }
            };

            WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx);
            // refreshMaterialInspection() writes materialInspection
            // asynchronously (this file's own header, "a request counter
            // guards against a stale async response"); the peer round
            // trip itself needs a tick or two to complete.
            for (let i = 0; i < 20 && ctx.materialInspection === null; i++) await wait(20);

            assert(ctx.materialInspection !== null, '1. materialInspection is written by the real, unmodified refreshMaterialInspection() method.');
            assert(ctx.materialInspection.loading.status === 'AVAILABLE', '2. loading status is AVAILABLE -- Bob genuinely received Alice’s material over the wire.');
            assert(ctx.materialInspection.loading.material instanceof Publication,
                '3. FLAGSHIP: the material WorldEncounterCanvas.js’s own real refreshMaterialInspection() produced is a genuine publisher/Publication.js instance, not a plain object.');
            assert(ctx.materialInspection.loading.material.id === alicePublication.id
                && ctx.materialInspection.loading.material.documentId === alicePublication.documentId
                && ctx.materialInspection.loading.material.title === alicePublication.title,
                '4. identity survives intact: id, documentId, and title are exactly what Alice supplied.');

            flagshipPublication = ctx.materialInspection.loading.material;
        } finally {
            dispose();
        }
    }
    console.log('✓ Section C: FLAGSHIP -- a genuine Publication, delivered to Bob over a real, authenticated peer connection, reaches WorldEncounterCanvas.js’s own real, unmodified refreshMaterialInspection() method and lands in materialInspection.loading.material as a real `instanceof Publication`, identity intact.');

    // ===============================================================
    // Section D -- the contract is not the gap, proven live.
    // ===============================================================
    {
        const provider = new DecentralizedPublicationDiscoveryProvider();
        provider.add(flagshipPublication);
        const searchUseCase = new SearchPublicationsUseCase(provider);

        const byText = searchUseCase.execute({ text: 'World Alice' });
        assert(byText.items.some((p) => p.id === flagshipPublication.id),
            '1. Repository’s own real, unmodified SearchPublicationsUseCase finds the World-Encounter-sourced Publication by title text search, exactly as 0.9.334/0.9.335 already proved for the sibling Publications-page flow.');

        const byAuthor = searchUseCase.execute({ author: 'alice' });
        assert(byAuthor.items.some((p) => p.id === flagshipPublication.id && p.documentId === flagshipPublication.documentId),
            '2. ... and by author filter, with documentId intact for Fork/Explore to key on.');

        const miss = searchUseCase.execute({ text: 'no-such-title-exists-anywhere' });
        assert(!miss.items.some((p) => p.id === flagshipPublication.id),
            '3. ... and correctly excludes it from an unrelated query -- a real catalog, not a wildcard match.');
    }
    console.log('✓ Section D: the CONTRACT is not the gap -- handed to a real DecentralizedPublicationDiscoveryProvider, Section C’s own World-Encounter-sourced Publication is found immediately by Repository’s own real, unmodified SearchPublicationsUseCase, no new field or wrapper required.');

    // ===============================================================
    // Section E -- the gap, confirmed live and structurally: no call
    // path from World Encounter material into the app-wide provider
    // exists anywhere in production.
    // ===============================================================
    {
        // E1. Structural: ui/main.js constructs exactly one app-wide
        // DecentralizedPublicationDiscoveryProvider and provides it under
        // one key; the ONLY production reader of that key that also calls
        // .add() on it is ui/views/DecentralizedPublicationsView.js.
        const mainSource = await readSource('ui/main.js');
        const provideMatches = mainSource.match(/app\.provide\('decentralizedPublicationDiscoveryProvider'/g) || [];
        assert(provideMatches.length === 1, '1. ui/main.js provides the shared decentralizedPublicationDiscoveryProvider exactly once.');

        const injectHits = grepFiles("inject\\('decentralizedPublicationDiscoveryProvider'", ['ui']);
        const addCallers = [];
        for (const file of injectHits) {
            const src = await readFile(new URL(file, SOURCE_ROOT), 'utf8');
            if (/discoveryProvider\.add\(|decentralizedDiscoveryProviderFor\w*\.add\(/.test(src)) addCallers.push(file);
        }
        assert(injectHits.includes('ui/views/WorldView.js'), '2. ui/views/WorldView.js already injects the shared provider (0.9.339, for enrichment).');
        assert(addCallers.length === 1 && addCallers[0] === 'ui/views/DecentralizedPublicationsView.js',
            `3. exactly one production file ever calls .add() on the shared provider today, and it is the Publications-page flow, not World View (found: ${addCallers.join(', ') || 'none'}).`);
        assert(!/discoveryProvider\.add\(|\.add\(flagship|decentralizedDiscoveryProviderForEnrichment\.add\(/.test(await readSource('ui/views/WorldView.js')),
            '4. ui/views/WorldView.js itself never calls .add() on the provider it injects -- confirmed structurally, not merely absent from the grep above.');

        // E2. Live, repeating Section C's exact scenario one more time,
        // this time watching a REAL, freshly-constructed app-wide-shaped
        // provider that stands in for ui/main.js's own singleton: nothing
        // in the WorldEncounterCanvas.js call path Section C exercised
        // ever touches it.
        const watchedProvider = new DecentralizedPublicationDiscoveryProvider();
        const { alicePublication, bobSource, origin, dispose } = await connectAliceAndBob();
        try {
            const ctx = {
                materialInspectionRequestId: 0,
                materialInspection: null,
                resolvedEncounterSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: alicePublication.id, origin }),
                resolvedLead: null,
                materialVerifier: null,
                materialSources: { peer: bobSource },
                // A component that DID admit resolved material would need
                // some such dependency in scope; WorldEncounterCanvas.js's
                // own real methods object never reads a property named
                // anything like this (Section E1 above), so handing it
                // here changes nothing about what the real method does --
                // it only gives this section something to assert stayed
                // empty.
                decentralizedPublicationDiscoveryProvider: watchedProvider
            };
            WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx);
            for (let i = 0; i < 20 && ctx.materialInspection === null; i++) await wait(20);
            assert(ctx.materialInspection && ctx.materialInspection.loading.material instanceof Publication,
                '5. setup sanity: the live round trip resolved again, exactly as Section C proved.');
            assert(watchedProvider.list().length === 0,
                '6. GAP, confirmed live: after a genuinely successful, real World Encounter resolution, the app-wide-shaped provider still holds zero entries -- nothing in this call path ever calls add().');
        } finally {
            dispose();
        }
    }
    console.log('✓ Section E: the gap is confirmed both structurally (the shared provider’s only production .add() caller is the Publications-page flow) and live (a repeat of Section C’s own successful resolution leaves a real, freshly-watched provider at zero entries).');

    // ===============================================================
    // Section F -- content-kind/origin isolation, reconfirmed for free.
    // ===============================================================
    {
        const decentralizedSource = await readSource('application/DecentralizedWorldEncounterMaterialSource.js');
        assert(decentralizedSource.includes('no `Publication.fromJSON()`'),
            "1. application/DecentralizedWorldEncounterMaterialSource.js's own header states directly that resolved material is returned exactly as supplied -- no Publication.fromJSON(), no hash check, no signature read.");
        assert(!/instanceof Publication/.test(decentralizedSource),
            '2. ... confirmed structurally: the file never even performs the instanceof check a hydration step would require.');
    }
    console.log('✓ Section F: content-kind/origin isolation holds for free -- a decentralized-origin World Encounter selection never produces a Publication instance at all, so an `instanceof Publication` admission gate (0.9.337’s own discrimination) would exclude it automatically, inventing no new logic.');

    // ===============================================================
    // Section G -- the family this is NOT about.
    // ===============================================================
    {
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        assert(/findPublicationById\(publicationId\) \{[\s\S]{0,200}_discoveryProvider\.findById\(publicationId\)/.test(sessionSource),
            '1. WorldNavigationSession#findPublicationById() delegates to its own injected _discoveryProvider.findById() -- the exact collaborator application/AutomaticSnapshotEncounterCascade.js reads (see 0.9.187’s own comment, quoted in source, "null ... when ... the publication is not locally known").');

        const createWorldViewSource = await readSource('application/CreateWorldViewUseCase.js');
        assert(/new LocalDiscoveryProvider\(storageProvider\)/.test(createWorldViewSource),
            "2. application/CreateWorldViewUseCase.js constructs a plain, local-only LocalDiscoveryProvider for that session -- never composed with decentralizedPublicationDiscoveryProvider, confirmed directly against 0.9.339's own explicit note that session.searchWorld() stays local-only and untouched.");
        assert(!/decentralizedPublicationDiscoveryProvider|DecentralizedPublicationDiscoveryProvider/.test(createWorldViewSource),
            '3. ... confirmed by absence: the file carries no reference to the decentralized provider at all.');

        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(/findPublicationById: \(publicationId\) => \(typeof session\.findPublicationById/.test(worldViewSource),
            '4. ui/views/WorldView.js wires the Automatic Snapshot Encounter Cascade’s own findPublicationById collaborator straight through to this same local-only session, unmodified.');
    }
    console.log('✓ Section G: the Automatic Snapshot Encounter Cascade -- the family whose own vocabulary most closely echoes the originating brief’s "automatic encounter... materialized" language -- is structurally gated on a Publication already being locally known via a plain, local-only LocalDiscoveryProvider. It cannot exhibit the brief’s own symptom (encountering something new with no way back to it), and is not this audit’s subject.');

    // ===============================================================
    // Section H -- has 0.9.329's own grounding eroded?
    // ===============================================================
    {
        // H1. 0.9.329's own verdict, on file, characterized the rule as
        // "family-wide" -- holding identically across decentralized AND
        // local, leaf AND orchestration layers, for World Encounter.
        // Reconfirmed directly from the Roadmap entry itself rather than
        // merely cited.
        const roadmap = await readSource('docs/Roadmap.md');
        assert(roadmap.includes('family-wide rule, not a decentralized-specific asymmetry'),
            "1. docs/Roadmap.md's own 0.9.329 entry is on file, verbatim, characterizing the rule as family-wide.");

        // H2. But 0.9.337's own production wiring -- built EIGHT
        // milestones after 0.9.329, for the sibling Publications-page/
        // decentralized-transport encounter flow -- installed exactly the
        // admission mechanism 0.9.329's own Section C found absent
        // everywhere. The rule is no longer family-wide; one sibling
        // stopped following it while World Encounter's own silence
        // (Section B, above) was never revisited.
        assert(roadmap.includes('Wire Resolved Decentralized Publications into Repository Discovery'),
            "2. docs/Roadmap.md's own 0.9.337 entry, building the sibling's admission mechanism, is on file.");
        const decentralizedPublicationsViewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(/function admitToRepositoryDiscovery/.test(decentralizedPublicationsViewSource),
            "3. ... and its own admitToRepositoryDiscovery() function is real, live in production, confirmed directly from source, not merely from the Roadmap's own account of it.");

        // H3. The asymmetry, stated plainly: BOTH flows resolve
        // encountered material into a genuine Publication instance on
        // SUCCESS and do nothing on failure/wrong-content-kind (Section F,
        // above, and 0.9.337's own Section D/E). The ONLY difference
        // between them is which one calls .add() -- not an architectural
        // distinction 0.9.329 or 0.9.337 ever drew, just an unexamined gap
        // between two otherwise-parallel call sites.
    }
    console.log('✓ Section H: 0.9.329’s own "family-wide never persists what it retrieves" finding, true when written, no longer describes this codebase -- 0.9.337 broke that uniformity for the sibling Publications-page flow eight milestones later, and World Encounter’s own silence (Section B) was never revisited against that new fact until now.');

    // ===============================================================
    // Section I -- smallest seam, identified but not built.
    // ===============================================================
    {
        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(worldViewSource.includes("inject('decentralizedPublicationDiscoveryProvider', null)"),
            '1. ui/views/WorldView.js already injects the exact dependency a fix would need, today, for an unrelated purpose (0.9.339’s own Repository-enrichment listPublicationsUseCase) -- no new provide()/inject() wiring at the composition root would be required.');

        // I2. The gate a seam would reuse is not invented here -- it is
        // 0.9.337's own admitToRepositoryDiscovery() shape, proven in
        // Section D above to accept exactly this family's own output.
        function admissionGateShapedLikeAdmitToRepositoryDiscovery(discoveryProvider, materialInspectionResult) {
            if (discoveryProvider && materialInspectionResult
                && materialInspectionResult.loading
                && materialInspectionResult.loading.status === 'AVAILABLE'
                && materialInspectionResult.loading.material instanceof Publication) {
                discoveryProvider.add(materialInspectionResult.loading.material);
                return true;
            }
            return false;
        }
        const demoProvider = new DecentralizedPublicationDiscoveryProvider();
        const admitted = admissionGateShapedLikeAdmitToRepositoryDiscovery(demoProvider, {
            loading: { status: 'AVAILABLE', material: flagshipPublication }
        });
        assert(admitted && demoProvider.list().length === 1 && demoProvider.list()[0] === flagshipPublication,
            "2. a gate identical in shape to 0.9.337's own admitToRepositoryDiscovery() admits Section C's own World-Encounter-sourced Publication correctly, and only on success -- proving the seam this section names is not merely theoretical.");
        const rejected = admissionGateShapedLikeAdmitToRepositoryDiscovery(demoProvider, {
            loading: { status: 'UNAVAILABLE', material: null }
        });
        assert(!rejected && demoProvider.list().length === 1,
            '3. ... and, symmetrically, never admits a failed or non-Publication resolution, exactly as 0.9.337’s own gate never does.');

        // I3. Named, not built: WHERE this call belongs (inside
        // WorldEncounterCanvas.js's own refreshMaterialInspection(), or an
        // emitted event WorldView.js consumes) is a real, open choice this
        // audit deliberately leaves to whichever milestone wires it -- the
        // identical restraint 0.9.336's own audit already showed for its
        // own open call-site choice.
        assert(!/decentralizedPublicationDiscoveryProvider/.test(await readSource('ui/components/WorldEncounterCanvas.js')),
            '4. confirmed once more: this section adds no such wiring to WorldEncounterCanvas.js itself -- the seam is named, never built, in this milestone.');
    }
    console.log('✓ Section I: the smallest seam is named, not built -- WorldView.js already holds the one dependency a fix would need, and a gate identical in shape to 0.9.337’s own admitToRepositoryDiscovery() is proven, live, to admit exactly this family’s own resolved output correctly and only on success.');

    // ===============================================================
    // Section J -- no UI change; no production file touched; final
    // classification.
    // ===============================================================
    {
        // J1. No production file was modified by this milestone.
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', `1. no production file is modified by this milestone (found: ${changedNonTestFiles || 'none'}).`);

        const CLASSIFICATIONS = [
            'NOT_A_PRODUCT_GAP',
            'ALREADY_COVERED',
            'CONTINUITY_GAP_CONFIRMED'
        ];
        const verdict = 'CONTINUITY_GAP_CONFIRMED';
        assert(CLASSIFICATIONS.includes(verdict), '2. the verdict is drawn from this milestone’s own named taxonomy.');
        assert(flagshipPublication instanceof Publication,
            '3. Section C’s own live proof -- the central fact this verdict rests on -- is carried forward, not re-litigated.');
    }
    console.log('\n✓ Section J: FINAL DECISION.\n' +
'\n' +
'OUTCOME: CONTINUITY_GAP_CONFIRMED.\n' +
'\n' +
"WHY. Section A corrected the originating brief's own vocabulary: 'Snapshot' names a structurally different domain\n" +
"object (0.9.330's own finding, reconfirmed), and 'World Encounter' itself names two different families, only one of\n" +
'which (peer-broadcast Publication markers) can even produce the described symptom. Section B reconfirmed, fresh\n' +
"against current HEAD, that 0.9.329's own 'never persists what it retrieves' citations still hold true today, letter\n" +
'for letter. Section C proved live -- through the real, unmodified WorldEncounterCanvas.js#refreshMaterialInspection(),\n' +
'not a stand-in -- that a genuinely new-to-this-device Publication, delivered over a real peer connection, already\n' +
"arrives as a real publisher/Publication.js instance with intact identity. Section D proved Repository's own real,\n" +
'unmodified SearchPublicationsUseCase already finds it the moment any DiscoveryProvider lists it -- the CONTRACT is\n' +
'not the gap, exactly as 0.9.334 already found for the sibling flow. Section E confirmed, live and structurally, that\n' +
'no call path anywhere in production connects that successful resolution to the one app-wide catalog Repository\n' +
'search actually reads. Section F showed the natural admission gate needs no new discrimination logic: a\n' +
'decentralized-origin selection never produces a Publication instance to admit in the first place. Section G named\n' +
"the family this is explicitly NOT about -- the Automatic Snapshot Encounter Cascade, whose own vocabulary echoes the\n" +
"brief's language most closely but which is gated on a Publication already being locally known, and so cannot exhibit\n" +
"this symptom -- heading off a plausible but wrong scope for whatever milestone builds a fix. Section H is this\n" +
"milestone's own reason to exist: 0.9.329's NOT_A_PRODUCT_GAP verdict rested explicitly on a 'family-wide' rule that\n" +
"0.9.337 itself broke eight milestones later for a sibling encounter flow, without World Encounter's own silence ever\n" +
'being revisited against that new fact until now. Section I found the smallest seam already half-built: WorldView.js\n' +
"already injects the one dependency a fix needs, and a gate shaped exactly like 0.9.337's own admitToRepositoryDiscovery()\n" +
"is proven, live, to admit this family's own resolved output correctly.\n" +
'\n' +
'WHAT THIS MEANS. This is not NOT_A_PRODUCT_GAP: the grounding for that 0.9.329 verdict, as applied to World Encounter\n' +
"specifically, no longer matches the codebase's own current, self-inconsistent state. This is not ALREADY_COVERED\n" +
'either: no production file today admits a resolved World-Encounter Publication anywhere, confirmed live in Section E.\n' +
'One precisely-scoped, evidenced gap survives, matching the originating observation’s own shape rather than its own\n' +
"vocabulary: a Wanderer who automatically encounters a peer's Publication in World View, and whose device genuinely\n" +
'retrieves and verifies it, has no product-level path back to that same Publication from the Repository -- not\n' +
"because the mechanism is missing (it is proven, live, to already exist and work, one call away) but because nobody\n" +
'has yet wired the one call. Per this milestone’s own scope, that call is not made here.\n');

    console.log('\n✅ All World Encounter Repository Continuity Boundary Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All WorldEncounterRepositoryContinuityBoundaryAudit tests passed');
}).catch((error) => {
    console.error('\n✗ WorldEncounterRepositoryContinuityBoundaryAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
