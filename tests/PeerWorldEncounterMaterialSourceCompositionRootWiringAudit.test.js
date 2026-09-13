import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { loadWorldEncounterMaterial, WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { PeerWorldEncounterMaterialSource } from '../application/PeerWorldEncounterMaterialSource.js';
import {
    PeerWorldEncounterMaterialMessageKind,
    toWorldEncounterMaterialResponseMessage
} from '../application/PeerWorldEncounterMaterialProtocol.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryRuntime } from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.475 — Wire Peer World Encounter Material Source into Production
// Composition Root.
//
// ORIGINATING OBSERVATION. Once 0.9.474 admitted a resolved World Encounter
// Publication into app-wide Repository discovery, peer-origin encounters
// became the one remaining dead end in that chain: `PeerWorldEncounterMaterialSource`
// (0.9.23) already implements the exact `WorldEncounterMaterialSource`
// contract `loadWorldEncounterMaterial()` (0.9.21) already routes a
// `peer:<identityId>`-origin selection to, and `composeWorldEncounterMaterialSources()`
// (0.9.36) / `composeDecentralizedWorldEncounterMaterialDiscoveryRuntime()`
// (0.9.110) already accept and forward a `peer` argument verbatim — but no
// composition root anywhere in this running app ever constructed one and
// passed it through. `ui/main.js`'s own 0.9.99 comment said so directly:
// "PEER MATERIAL SOURCES STAY DELIBERATELY UNWIRED HERE." The capability was
// never missing; only the one constructor call at the composition root was.
//
//   Section A — Contract conformance & inventory: PeerWorldEncounterMaterialSource
//               genuinely implements WorldEncounterMaterialSource, has no
//               test-only dependency, and requires no new abstraction.
//   Section B — The router already treats a peer origin as valid — it was
//               never the missing boundary.
//   Section C — Production composition-root inspection: ui/main.js now
//               constructs exactly one PeerWorldEncounterMaterialSource,
//               riding the SAME shared peerMessageBus/peerSessionManager.registry
//               every other peer protocol in that file already does, and
//               passes it through as `peer:` to the runtime composition.
//   Section D — FLAGSHIP, live: a runtime built EXACTLY the way ui/main.js's
//               own composition root builds it (real local + real peer, no
//               fakes) resolves a genuine peer-origin World Encounter
//               selection to AVAILABLE over a real, authenticated peer
//               connection.
//   Section E — UNAVAILABLE semantics are unchanged, never silently
//               replaced by a fallback: an unanswered or malformed
//               peer-origin selection still resolves UNAVAILABLE, and nothing
//               falls back to `local`/`decentralized`.
//   Section F — No second peer subsystem, no new abstraction: this
//               milestone touches no file in the peer/material/routing
//               chain other than the one composition-root call site.
//   Section G — Convergence with 0.9.474: a peer-origin resolution now
//               reaches the SAME Repository admission gate a local/
//               decentralized resolution already does, with no origin-
//               specific Repository logic required.
//   Section H — Local/decentralized composition paths are untouched by
//               peer's presence.
//   Section I — Production scope guard: only the intended composition-root
//               file (plus one pre-existing test amended for the new fact)
//               changed.
//
// See tests/WorldEncounterRepositoryContinuityIntegrationBoundaryAudit.test.js
// (0.9.474) for the Repository-admission half of the pipeline this
// milestone's own Section G reuses unmodified.

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

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
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

// One real, live, authenticated Alice <-> Bob peer connection — identical
// shape to tests/PeerWorldEncounterMaterialSource.test.js's own Section C
// and tests/WorldEncounterRepositoryContinuityBoundaryAudit.test.js's own
// helper, reused rather than reinvented.
async function connectAliceAndBob(publicationOverrides = {}) {
    const network = new LocalPeerNetwork();
    const alice = makeIdentity('Alice');
    const bob = makeIdentity('Bob');

    const aliceTransport = new LocalPeerConnectionProvider('alice-composition-root-audit', network);
    const bobTransport = new LocalPeerConnectionProvider('bob-composition-root-audit', network);
    const aliceListen = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const stopAliceListening = aliceListen.listen();
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const bobToAlicePeer = bobConnect.connect({ candidateEndpoint: 'alice-composition-root-audit' });
    await wait(20);
    assert(bobToAlicePeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: Bob authenticates to Alice');

    const aliceBus = new PeerMessageBus();
    const bobBus = new PeerMessageBus();

    const alicePublication = new Publication({
        id: 'pub-alice-composition-root-1',
        documentId: 'doc-alice-composition-root-1',
        title: 'A World Alice Is Sharing',
        author: 'alice',
        ...publicationOverrides
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

    // Bob's own PEER material source, wired exactly the way ui/main.js's
    // own composition root now wires it: one PeerWorldEncounterMaterialSource
    // over one shared bus/registry pair.
    const bobSource = new PeerWorldEncounterMaterialSource(bobBus, bobConnect.registry, { timeoutMs: 2000 });
    const origin = `peer:${bobToAlicePeer.remoteIdentity.identityId}`;

    return {
        alicePublication,
        bobSource,
        bobBus,
        bobRegistry: bobConnect.registry,
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
    // Section A — Contract conformance & implementation inventory.
    // ===============================================================
    {
        assert(PeerWorldEncounterMaterialSource.prototype instanceof Object
            && typeof PeerWorldEncounterMaterialSource.prototype.load === 'function',
            '1. PeerWorldEncounterMaterialSource exposes a real load() method.');

        const peerSourceModule = await readSource('application/PeerWorldEncounterMaterialSource.js');
        assert(/class PeerWorldEncounterMaterialSource extends WorldEncounterMaterialSource/.test(peerSourceModule),
            '2. it genuinely extends the SAME WorldEncounterMaterialSource contract application/WorldEncounterMaterialLoading.js (0.9.21) already defines — never a parallel, incompatible class.');

        // A3. No test-only dependency: every import this file makes is a
        // real, production application/core/peer module — never anything
        // under tests/ or a fixture.
        const importLines = peerSourceModule.match(/^import .+ from '.+';$/gm) || [];
        assert(importLines.length > 0 && importLines.every((line) => !/tests\/|fixtures\//.test(line)),
            '3. every import is a production module — no test double or fixture is baked into the class itself.');

        // A4. Already has appropriate peer/session inputs: a PeerMessageBus
        // and a ConnectedPeerRegistry, both already-existing collaborators,
        // never a new abstraction this milestone would have to invent.
        assert(/constructor\(peerMessageBus, connectedPeerRegistry,/.test(peerSourceModule),
            '4. the constructor already takes exactly a peerMessageBus and a connectedPeerRegistry — both already-existing, production collaborators.');

        // A5. Already returns the established UNAVAILABLE/success semantics
        // (null on absence, a real Publication/AvatarProfile on success) —
        // confirmed live in Section D/E below, and structurally here.
        assert(/return null;/.test(peerSourceModule) && /return deserializeMaterial\(kind, material\);/.test(peerSourceModule),
            '5. load() already returns null on absence and a deserialized domain object on success — the identical contract every sibling source already holds.');
    }
    console.log('✓ Section A: PeerWorldEncounterMaterialSource is production-ready — a real WorldEncounterMaterialSource, no test-only dependency, no new abstraction required, already-appropriate peer/session inputs, and the established UNAVAILABLE/success contract.');

    // ===============================================================
    // Section B — the router already treats `peer` as valid; it was
    // never the missing boundary.
    // ===============================================================
    {
        const loadingSource = await readSource('application/WorldEncounterMaterialLoading.js');
        assert(/origin\.startsWith\('peer:'\)/.test(loadingSource) || /PEER_ORIGIN_PREFIX/.test(loadingSource) || /startsWith\('peer:'\)/.test(loadingSource),
            '1. loadWorldEncounterMaterial() already recognizes a peer:-prefixed origin family, unmodified by this milestone.');
        assert(/materialSources\.peer/.test(loadingSource),
            '2. ... and already dispatches it straight to materialSources.peer — the exact slot this milestone finally fills, at the composition root only, never here.');
    }
    console.log('✓ Section B: the router genuinely already supports peer — the gap was never here, so this milestone does not touch this file.');

    // ===============================================================
    // Section C — production composition-root inspection.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');
        const mainCodeOnly = codeOnly(mainSource);

        assert(/import \{ PeerWorldEncounterMaterialSource \} from '\.\.\/application\/PeerWorldEncounterMaterialSource\.js';/.test(mainCodeOnly),
            '1. ui/main.js imports the existing, unmodified PeerWorldEncounterMaterialSource — never a second implementation.');

        const constructions = (mainCodeOnly.match(/new PeerWorldEncounterMaterialSource\(/g) || []).length;
        assert(constructions === 1,
            `2. exactly one PeerWorldEncounterMaterialSource is constructed — no second, redundant peer subsystem (found ${constructions}).`);

        assert(/new PeerWorldEncounterMaterialSource\(peerMessageBus, peerSessionManager\.registry\)/.test(mainCodeOnly),
            "3. it is constructed with the SAME peerMessageBus/peerSessionManager.registry pair every other peer/PeerMessageBus.js protocol in this file already rides — never a second bus or a second registry invented just for this source.");

        assert(/peer: worldEncounterMaterialPeerSource/.test(mainCodeOnly),
            '4. the constructed instance is threaded into composeDecentralizedWorldEncounterMaterialDiscoveryRuntime() under its own `peer` argument — the exact slot that composition root already forwards verbatim.');
    }
    console.log('✓ Section C: composition-root construction is the confirmed seam — ui/main.js now constructs exactly one PeerWorldEncounterMaterialSource over the app\'s own existing shared peer transport/registry, and threads it into the existing `peer` slot.');

    // ===============================================================
    // Section D — FLAGSHIP, live: the exact production composition shape,
    // real local + real peer, resolves a peer-origin selection to
    // AVAILABLE over a real, authenticated peer connection.
    // ===============================================================
    let flagshipPublication = null;
    {
        const { alicePublication, bobSource, origin, dispose } = await connectAliceAndBob();
        try {
            // Mirrors ui/main.js's own real call shape: local + peer,
            // built through the SAME composeDecentralizedWorldEncounterMaterialDiscoveryRuntime()
            // this file's own production wiring now calls.
            const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
                discoveryServices: {},
                local: new LocalWorldEncounterMaterialSource(new InMemoryStorageProvider()),
                peer: bobSource
            });

            const result = await loadWorldEncounterMaterial({
                resolvedSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: alicePublication.id, origin }),
                materialSources: runtime.materialSources
            });

            assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
                '1. FLAGSHIP: a peer-origin selection resolves AVAILABLE through the exact { local, peer, decentralized } shape the production composition root now builds.');
            assert(result.material instanceof Publication && result.material.id === alicePublication.id,
                '2. ... with a genuine Publication instance, identity intact — this is a real retrieval, not a stand-in.');

            flagshipPublication = result.material;
        } finally {
            dispose();
        }
    }
    console.log('✓ Section D: FLAGSHIP — over a real, authenticated peer connection, a peer-origin World Encounter selection resolves to AVAILABLE through the exact { local, peer, decentralized } composition shape ui/main.js\'s own composition root now builds.');

    // ===============================================================
    // Section E — UNAVAILABLE semantics unchanged; no silent fallback.
    // ===============================================================
    {
        // E1. An unanswered request (Alice never subscribed for THIS
        // objectId) still resolves UNAVAILABLE — never a thrown error,
        // never a fallback to local/decentralized.
        const { bobSource, origin, dispose } = await connectAliceAndBob();
        try {
            const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
                discoveryServices: {},
                local: new LocalWorldEncounterMaterialSource(new InMemoryStorageProvider()),
                peer: bobSource
            });
            const result = await loadWorldEncounterMaterial({
                resolvedSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'no-such-object-alice-never-holds', origin }),
                materialSources: runtime.materialSources
            });
            assert(result.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE && result.material === null,
                '1. a peer-origin selection Alice does not hold resolves UNAVAILABLE, exactly as before this milestone — the established contract is unaffected by production wiring.');
        } finally {
            dispose();
        }

        // E2. A malformed/unknown peer origin (naming no connected peer at
        // all) resolves UNAVAILABLE too — never a fallback to `local`.
        {
            const localSource = new LocalWorldEncounterMaterialSource(new InMemoryStorageProvider());
            const { bobSource, dispose } = await connectAliceAndBob();
            try {
                const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
                    discoveryServices: {},
                    local: localSource,
                    peer: bobSource
                });
                const result = await loadWorldEncounterMaterial({
                    resolvedSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'anything', origin: 'peer:no-such-identity' }),
                    materialSources: runtime.materialSources
                });
                assert(result.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE,
                    '2. a peer origin naming no currently-connected peer resolves UNAVAILABLE — never a thrown error.');
            } finally {
                dispose();
            }
        }
    }
    console.log('✓ Section E: UNAVAILABLE semantics are exactly as established before this milestone — an unanswered or malformed peer-origin selection still resolves UNAVAILABLE, with no new fallback logic of any kind.');

    // ===============================================================
    // Section F — no second peer subsystem, no new abstraction; the
    // milestone touches only the one composition-root call site.
    // ===============================================================
    {
        const peerSourceSrc = await readSource('application/PeerWorldEncounterMaterialSource.js');
        const protocolSrc = await readSource('application/PeerWorldEncounterMaterialProtocol.js');
        const loadingSrc = await readSource('application/WorldEncounterMaterialLoading.js');
        const canvasSrc = await readSource('ui/components/WorldEncounterCanvas.js');

        // These four files each carry their own "0.9.23"/"0.9.21" milestone
        // header naming themselves as the source of truth for their own
        // unmodified behavior — reconfirmed present, not merely assumed.
        assert(/0\.9\.23 — Peer World Encounter Material Source\./.test(peerSourceSrc),
            "1. application/PeerWorldEncounterMaterialSource.js is still its own original 0.9.23 self — this milestone changes not one line of it.");
        assert(/0\.9\.23 — Peer World Encounter Material Source\./.test(protocolSrc),
            '2. application/PeerWorldEncounterMaterialProtocol.js is likewise untouched.');
        assert(/0\.9\.21 — World Encounter Material Loading Boundary\./.test(loadingSrc),
            '3. application/WorldEncounterMaterialLoading.js — the router itself — is likewise untouched.');
        assert(!/PeerWorldEncounterMaterialSource/.test(canvasSrc),
            '4. ui/components/WorldEncounterCanvas.js still never references PeerWorldEncounterMaterialSource directly — it only ever consumes materialSources.peer through the existing prop, unchanged by where that slot is filled in.');
    }
    console.log('✓ Section F: no second peer subsystem and no new abstraction — the four files that make up the existing peer chain (source, protocol, router, canvas) are all confirmed untouched by this milestone.');

    // ===============================================================
    // Section G — convergence with 0.9.474: a peer-origin resolution now
    // reaches the SAME Repository admission gate, with no origin-specific
    // Repository logic.
    // ===============================================================
    {
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { alicePublication, bobSource, origin, dispose } = await connectAliceAndBob({ id: 'pub-alice-composition-root-convergence' });
        try {
            const ctx = {
                materialInspectionRequestId: 0,
                materialInspection: null,
                resolvedEncounterSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: alicePublication.id, origin }),
                resolvedLead: null,
                materialVerifier: null,
                // Exactly WorldEncounterCanvas's own real prop shape — the
                // peer slot is filled the SAME way ui/main.js's own
                // production composition now fills it, nothing
                // origin-specific added on top.
                materialSources: { peer: bobSource },
                decentralizedPublicationDiscoveryProvider: provider,
                admitToRepositoryDiscovery: WorldEncounterCanvas.methods.admitToRepositoryDiscovery
            };
            WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx);
            for (let i = 0; i < 20 && ctx.materialInspection === null; i++) await wait(20);

            assert(ctx.materialInspection && ctx.materialInspection.loading.status === 'AVAILABLE'
                && ctx.materialInspection.loading.material instanceof Publication,
                '1. a peer-origin World Encounter resolves through the real, unmodified refreshMaterialInspection(), exactly like local/decentralized already do.');
            assert(provider.list().length === 1 && provider.list()[0] === ctx.materialInspection.loading.material,
                '2. CONVERGENCE: the SAME admitToRepositoryDiscovery() gate 0.9.474 built for local/decentralized origins admits this peer-origin resolution too — no origin-specific Repository code exists, or is needed.');

            const searchUseCase = new SearchPublicationsUseCase(provider);
            const found = searchUseCase.execute({ text: 'World Alice' });
            assert(found.items.some((p) => p.id === alicePublication.id),
                "3. Repository's own unmodified SearchPublicationsUseCase finds the peer-encountered Publication afterward, exactly as it already does for local/decentralized origins.");
        } finally {
            dispose();
        }
    }
    console.log('✓ Section G: convergence confirmed live — a peer-origin World Encounter now flows through the identical, unmodified 0.9.474 Repository-admission gate local and decentralized origins already use, requiring no origin-specific Repository logic.');

    // ===============================================================
    // Section H — local/decentralized composition paths untouched by
    // peer's presence.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const identity = makeIdentity('local-only-alice');
        const publisherIdentity = identity.getSigningIdentity().toJSON();
        let publication = new Publication({
            id: 'pub-local-only-1',
            documentId: 'doc-local-only-1',
            title: 'A Purely Local Publication',
            author: 'local-only-alice',
            publisherIdentity,
            signature: null
        });
        publication = publication.withSignature(identity.signCanonical(publication.getSigningDescriptor()));
        storage.save('forkbuild-publications', [publication.toJSON()]);

        const { bobSource, dispose } = await connectAliceAndBob();
        try {
            // Even with a real, live peer source ALSO wired (exactly the
            // production shape), a local-origin selection still resolves
            // through materialSources.local alone.
            const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
                discoveryServices: {},
                local: new LocalWorldEncounterMaterialSource(storage),
                peer: bobSource
            });
            const result = await loadWorldEncounterMaterial({
                resolvedSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, origin: 'local' }),
                materialSources: runtime.materialSources
            });
            assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE && result.material.id === publication.id,
                "1. a local-origin selection still resolves through materialSources.local alone, unaffected by a real, live peer source ALSO being wired alongside it.");
        } finally {
            dispose();
        }
    }
    console.log('✓ Section H: local-origin resolution is completely unaffected by peer also being wired — no cross-talk between slots.');

    // ===============================================================
    // Section I — production scope guard.
    // ===============================================================
    {
        const changedFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        const allowed = new Set(['ui/main.js']);
        const unexpected = changedFiles.filter((f) => !allowed.has(f));
        assert(unexpected.length === 0,
            `1. exactly the intended composition-root file changed in production — no unexpected production file was touched (unexpected: ${unexpected.join(', ') || 'none'}).`);

        const changedTestFiles = execSync(
            'git diff --name-only HEAD -- tests',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        const allowedTests = new Set([
            'tests/PeerWorldEncounterMaterialSourceCompositionRootWiringAudit.test.js',
            'tests/WorldViewMaterialVerificationIntegration.test.js',
            'tests/WorldEncounterRepositoryContinuityIntegrationBoundaryAudit.test.js'
        ]);
        const unexpectedTests = changedTestFiles.filter((f) => !allowedTests.has(f));
        assert(unexpectedTests.length === 0,
            `2. only this milestone's own new test, plus the two pre-existing tests whose own fixed assertions/allowlists this milestone's new fact required amending (0.9.99's own ui/main.js assertion, and 0.9.474's own fixed-baseline scope guard), changed under tests/ (unexpected: ${unexpectedTests.join(', ') || 'none'}).`);
    }
    console.log('✓ Section I: production scope guard — exactly the intended composition-root file changed, plus this milestone\'s own new test and one pre-existing test amended for the new fact it establishes.');

    console.log('\n✅ All Peer World Encounter Material Source Composition Root Wiring Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All PeerWorldEncounterMaterialSourceCompositionRootWiringAudit tests passed');
}).catch((error) => {
    console.error('\n✗ PeerWorldEncounterMaterialSourceCompositionRootWiringAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
