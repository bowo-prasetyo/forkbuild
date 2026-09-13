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

// 0.9.474 — Admit World-Encountered Publications into App-Wide Discovery —
// Integration Boundary Audit.
//
// tests/WorldEncounterRepositoryContinuityBoundaryAudit.test.js (0.9.473)
// found the gap and named the seam, live and test-only: WorldView.js
// already injects decentralizedPublicationDiscoveryProvider, and a gate
// shaped exactly like ui/views/DecentralizedPublicationsView.js's own
// admitToRepositoryDiscovery() (0.9.337) admits this family's own
// resolved output correctly. THIS milestone builds that one call, kept
// deliberately narrow (see ui/components/WorldEncounterCanvas.js's own
// "0.9.474" header): a new, optional
// `decentralizedPublicationDiscoveryProvider` prop, one new method
// (`admitToRepositoryDiscovery()`), called from the existing
// `refreshMaterialInspection()`/`refreshComparisonMaterialInspection()`
// `.then()` callbacks, and one new binding in ui/views/WorldView.js
// reusing its own already-injected provider — no new store, no new
// persistence layer, no World->Repository synchronization mechanism.
//
// This file proves the COMPLETE journey the production change enables,
// exactly the shape the product owner's own brief asked for:
//
//   Section A — Production wiring: the real WorldView.js passes its own
//               already-injected provider straight through to the real
//               WorldEncounterCanvas.js, under the exact prop name it
//               declares.
//   Section B — Real encounter: a genuine, peer-delivered Publication
//               reaches WorldEncounterCanvas.js's own real, unmodified-
//               in-shape refreshMaterialInspection() (0.9.473's own
//               flagship, reconfirmed against the AMENDED method).
//   Section C — Admission: the resolved Publication is admitted into the
//               app-wide-shaped provider Section B supplied.
//   Section D — Identity fidelity: the admitted object IS (===) the same
//               instance materialInspection.loading.material holds — no
//               reconstruction from partial metadata.
//   Section E — Repository visibility: Repository's own real, unmodified
//               SearchPublicationsUseCase finds it afterward, by text and
//               by author.
//   Section F — Openability: the admitted Publication carries a real,
//               intact documentId — the concrete field the existing
//               Publication/materialization path keys on to open it —
//               and is directly retrievable by id from the same catalog.
//   Section G — No duplicate discovery mechanism: WorldEncounterCanvas.js
//               constructs no DiscoveryProvider of its own, imports no
//               catalog class, and has exactly one `.add()` call site
//               (admitToRepositoryDiscovery itself), reused by both
//               material-inspection refresh methods rather than forked.
//   Section H — World isolation: with no provider supplied at all, World
//               Encounter resolution and rendering proceed exactly as
//               they did before this milestone.
//   Section I — Cross-feature isolation: the sibling
//               admitToRepositoryDiscovery() this milestone's own gate is
//               modeled on, in ui/views/DecentralizedPublicationsView.js,
//               is untouched, verbatim.
//   Section J — Failure semantics: a discovery-admission failure never
//               turns an already-successful World Encounter resolution
//               into a failed one.
//   Section K — No second source of truth: Repository search and World
//               Encounter admission observe the SAME provider instance —
//               proven by using one live provider for both, never two.
//   Section L — Production scope guard: relative to 0.9.473's own commit,
//               exactly the intended two production files changed.
//
// See tests/WorldEncounterRepositoryContinuityBoundaryAudit.test.js
// (0.9.473) for the audit this milestone answers, and docs/Roadmap.md's
// own 0.9.474 entry.

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

// Reused verbatim from tests/WorldEncounterRepositoryContinuityBoundaryAudit.test.js
// (0.9.473) — one real, live, authenticated Alice <-> Bob peer connection,
// Alice serving her own real Publication over the wire on request.
async function connectAliceAndBob(publicationOverrides = {}) {
    const network = new LocalPeerNetwork();
    const alice = makeIdentity('Alice');
    const bob = makeIdentity('Bob');

    const aliceTransport = new LocalPeerConnectionProvider('alice-admission-audit', network);
    const bobTransport = new LocalPeerConnectionProvider('bob-admission-audit', network);
    const aliceListen = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const stopAliceListening = aliceListen.listen();
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const bobToAlicePeer = bobConnect.connect({ candidateEndpoint: 'alice-admission-audit' });
    await wait(20);
    assert(bobToAlicePeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: Bob authenticates to Alice');

    const aliceBus = new PeerMessageBus();
    const bobBus = new PeerMessageBus();

    const alicePublication = new Publication({
        id: 'pub-alice-admission-1',
        documentId: 'doc-alice-admission-1',
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

function makeCanvasCtx({ alicePublication, bobSource, origin, discoveryProvider }) {
    return {
        materialInspectionRequestId: 0,
        materialInspection: null,
        comparisonMaterialInspectionRequestId: 0,
        comparisonMaterialInspection: null,
        resolvedEncounterSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: alicePublication.id, origin }),
        comparisonResolvedSelection: null,
        resolvedLead: null,
        materialVerifier: null,
        materialSources: { peer: bobSource },
        decentralizedPublicationDiscoveryProvider: discoveryProvider,
        admitToRepositoryDiscovery: WorldEncounterCanvas.methods.admitToRepositoryDiscovery
    };
}

async function run() {
    // ===============================================================
    // Section A — Production wiring.
    // ===============================================================
    {
        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(/const decentralizedDiscoveryProviderForEnrichment = inject\('decentralizedPublicationDiscoveryProvider', null\);/.test(worldViewSource),
            '1. ui/views/WorldView.js still injects the shared provider exactly once, under its own established name.');
        assert(/decentralizedDiscoveryProviderForEnrichment\s*$/m.test(worldViewSource) || /decentralizedDiscoveryProviderForEnrichment\n\s*\};/.test(worldViewSource),
            '2. ui/views/WorldView.js exposes decentralizedDiscoveryProviderForEnrichment to its own template (returned from setup()).');
        assert(/<WorldEncounterCanvas[\s\S]{0,1200}?:decentralizedPublicationDiscoveryProvider="decentralizedDiscoveryProviderForEnrichment"[\s\S]{0,400}?\/>/.test(worldViewSource),
            '3. FLAGSHIP WIRING: the real <WorldEncounterCanvas> element binds :decentralizedPublicationDiscoveryProvider to the SAME decentralizedDiscoveryProviderForEnrichment this view already injects for search-result enrichment — one dependency, two consumers, no second inject().');

        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        assert(/decentralizedPublicationDiscoveryProvider:\s*\{\s*\n\s*type: Object,\s*\n\s*default: null\s*\n\s*\},/.test(canvasSource),
            '4. ui/components/WorldEncounterCanvas.js declares decentralizedPublicationDiscoveryProvider as an optional, null-default prop — a mount with none supplied changes nothing about resolution or rendering.');
        assert(/admitToRepositoryDiscovery\(loading\)\s*\{/.test(canvasSource),
            '5. ui/components/WorldEncounterCanvas.js defines its own admitToRepositoryDiscovery(loading) method.');
        assert(/import \{ Publication \} from '\.\.\/\.\.\/publisher\/Publication\.js';/.test(canvasSource),
            "6. ... importing publisher/Publication.js's own Publication for its own instanceof gate.");
    }
    console.log('✓ Section A: production wiring confirmed at the source — WorldView.js\'s own single injected provider flows, under its own established name, straight into the real <WorldEncounterCanvas> element\'s new prop, and WorldEncounterCanvas.js declares both that prop and its own admission method.');

    // ===============================================================
    // Section B — Real encounter (0.9.473's own flagship, reconfirmed
    // against the amended method).
    // ===============================================================
    let flagshipPublication = null;
    let flagshipProvider = null;
    {
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { alicePublication, bobSource, origin, dispose } = await connectAliceAndBob();
        try {
            const ctx = makeCanvasCtx({ alicePublication, bobSource, origin, discoveryProvider: provider });
            WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx);
            for (let i = 0; i < 20 && ctx.materialInspection === null; i++) await wait(20);

            assert(ctx.materialInspection !== null, '1. materialInspection is written by the real, unmodified-in-shape refreshMaterialInspection() method.');
            assert(ctx.materialInspection.loading.status === 'AVAILABLE', '2. loading status is AVAILABLE — Bob genuinely received Alice’s material over the wire.');
            assert(ctx.materialInspection.loading.material instanceof Publication,
                '3. FLAGSHIP: the material is a genuine publisher/Publication.js instance, not a plain object.');
            assert(ctx.materialInspection.loading.material.id === alicePublication.id
                && ctx.materialInspection.loading.material.documentId === alicePublication.documentId
                && ctx.materialInspection.loading.material.title === alicePublication.title,
                '4. identity survives intact: id, documentId, and title are exactly what Alice supplied.');

            flagshipPublication = ctx.materialInspection.loading.material;
            flagshipProvider = provider;
        } finally {
            dispose();
        }
    }
    console.log('✓ Section B: a genuine Publication, delivered to Bob over a real, authenticated peer connection, still reaches the real refreshMaterialInspection() as a real `instanceof Publication`, identity intact — 0.9.473’s own flagship, reconfirmed against the amended method.');

    // ===============================================================
    // Section C — Admission.
    // ===============================================================
    {
        assert(flagshipProvider.list().length === 1, '1. exactly one Publication was admitted into the app-wide-shaped provider Section B supplied.');
        assert(flagshipProvider.list()[0] === flagshipPublication, '2. it is Section B’s own resolved Publication, not a stand-in.');
    }
    console.log('✓ Section C: the resolved Publication is admitted into the app-wide-shaped provider — the gap 0.9.473 confirmed is closed.');

    // ===============================================================
    // Section D — Identity fidelity.
    // ===============================================================
    {
        // Re-run Section B's own scenario once more, this time holding
        // onto BOTH materialInspection.loading.material and whatever the
        // provider actually received, so identity can be compared by
        // reference rather than by re-reading the same shared variable.
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { alicePublication, bobSource, origin, dispose } = await connectAliceAndBob({ id: 'pub-alice-admission-identity' });
        try {
            const ctx = makeCanvasCtx({ alicePublication, bobSource, origin, discoveryProvider: provider });
            WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx);
            for (let i = 0; i < 20 && ctx.materialInspection === null; i++) await wait(20);

            const displayed = ctx.materialInspection.loading.material;
            const admitted = provider.findById(displayed.id);
            assert(admitted === displayed,
                '1. IDENTITY FIDELITY: the object admitted to discovery is the exact same instance World Encounter resolved for display — no reconstruction from partial metadata, no re-parsing of a serialized form.');
        } finally {
            dispose();
        }
    }
    console.log('✓ Section D: identity fidelity — the Publication admitted to discovery is the SAME logical (and literal, ===) Publication World Encounter resolved, never rebuilt from partial metadata.');

    // ===============================================================
    // Section E — Repository visibility.
    // ===============================================================
    {
        const searchUseCase = new SearchPublicationsUseCase(flagshipProvider);

        const byText = searchUseCase.execute({ text: 'World Alice' });
        assert(byText.items.some((p) => p.id === flagshipPublication.id),
            '1. Repository’s own real, unmodified SearchPublicationsUseCase finds the World-Encounter-admitted Publication by title text search.');

        const byAuthor = searchUseCase.execute({ author: 'alice' });
        assert(byAuthor.items.some((p) => p.id === flagshipPublication.id && p.documentId === flagshipPublication.documentId),
            '2. ... and by author filter, with documentId intact.');

        const miss = searchUseCase.execute({ text: 'no-such-title-exists-anywhere' });
        assert(!miss.items.some((p) => p.id === flagshipPublication.id),
            '3. ... and correctly excludes it from an unrelated query.');
    }
    console.log('✓ Section E: after encounter, Repository search finds the same Publication through its normal, unmodified discovery path — text, author, and correct exclusion alike.');

    // ===============================================================
    // Section F — Openability.
    // ===============================================================
    {
        const foundById = flagshipProvider.findById(flagshipPublication.id);
        assert(foundById === flagshipPublication, '1. the admitted Publication is directly retrievable by id from the same catalog Repository search reads.');
        assert(typeof foundById.documentId === 'string' && foundById.documentId.length > 0,
            '2. its documentId — the concrete field the existing Publication/materialization path keys on to open a selected search result — is intact, not blanked or placeholder.');
    }
    console.log('✓ Section F: the discovered Publication carries an intact documentId and is directly retrievable by id — the exact hand-off the existing Publication/materialization path already keys on to open it, unmodified by this milestone.');

    // ===============================================================
    // Section G — No duplicate discovery mechanism.
    // ===============================================================
    {
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        assert(!/new DecentralizedPublicationDiscoveryProvider\(/.test(canvasSource),
            '1. WorldEncounterCanvas.js never constructs a DiscoveryProvider of its own — it only ever receives one, as a prop.');
        assert(!/import .*DecentralizedPublicationDiscoveryProvider.* from/.test(canvasSource),
            '2. ... confirmed structurally: it never even imports that catalog class.');
        const addCallSites = (canvasSource.match(/decentralizedPublicationDiscoveryProvider\.add\(/g) || []);
        assert(addCallSites.length === 1,
            `3. exactly one call site invokes .add() on the injected provider — inside admitToRepositoryDiscovery() itself, reused by both refresh methods rather than forked (found ${addCallSites.length}).`);
        const callerCount = (canvasSource.match(/this\.admitToRepositoryDiscovery\(/g) || []).length;
        assert(callerCount === 2,
            `4. admitToRepositoryDiscovery() itself is called from exactly two places — refreshMaterialInspection() and refreshComparisonMaterialInspection() — never a third, standalone admission path (found ${callerCount}).`);
    }
    console.log('✓ Section G: no duplicate discovery mechanism — WorldEncounterCanvas.js constructs no catalog of its own, and reuses one admission method from both its own refresh call sites rather than forking a second.');

    // ===============================================================
    // Section H — World isolation.
    // ===============================================================
    {
        const { alicePublication, bobSource, origin, dispose } = await connectAliceAndBob({ id: 'pub-alice-admission-isolation' });
        try {
            const ctx = makeCanvasCtx({ alicePublication, bobSource, origin, discoveryProvider: null });
            WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx);
            for (let i = 0; i < 20 && ctx.materialInspection === null; i++) await wait(20);

            assert(ctx.materialInspection !== null && ctx.materialInspection.loading.status === 'AVAILABLE',
                '1. with no decentralizedPublicationDiscoveryProvider supplied at all, World Encounter resolution still succeeds exactly as before this milestone.');
            assert(ctx.materialInspection.loading.material instanceof Publication && ctx.materialInspection.loading.material.id === alicePublication.id,
                '2. ... and renders the identical Publication, identity intact — World rendering is completely unaffected by the absence of a discovery provider.');
        } finally {
            dispose();
        }
    }
    console.log('✓ Section H: World isolation — a mount with no discovery provider supplied resolves and renders World Encounter material exactly as it did before this milestone; admission is purely additive.');

    // ===============================================================
    // Section I — Cross-feature isolation.
    // ===============================================================
    {
        const decentralizedPublicationsViewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(/function admitToRepositoryDiscovery\(view\) \{\s*\n\s*if \(discoveryProvider && view && view\.resolved && view\.content instanceof Publication\) \{\s*\n\s*discoveryProvider\.add\(view\.content\);\s*\n\s*\}\s*\n\s*\}/.test(decentralizedPublicationsViewSource),
            "1. ui/views/DecentralizedPublicationsView.js's own admitToRepositoryDiscovery() (0.9.337) — the sibling this milestone's own gate is modeled on — is untouched, verbatim.");
    }
    console.log('✓ Section I: cross-feature isolation — the sibling Publications-page admission mechanism (0.9.337) this milestone reuses the SHAPE of is itself untouched, verbatim.');

    // ===============================================================
    // Section J — Failure semantics.
    // ===============================================================
    {
        const throwingProvider = {
            add() { throw new Error('simulated discovery-admission failure'); }
        };
        const { alicePublication, bobSource, origin, dispose } = await connectAliceAndBob({ id: 'pub-alice-admission-failure' });
        try {
            const ctx = makeCanvasCtx({ alicePublication, bobSource, origin, discoveryProvider: throwingProvider });
            WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx);
            for (let i = 0; i < 20 && ctx.materialInspection === null; i++) await wait(20);

            assert(ctx.materialInspection !== null && ctx.materialInspection.loading.status === 'AVAILABLE',
                '1. FAILURE SEMANTICS: a discovery provider whose own .add() throws never prevents materialInspection from being written — World Encounter remains usable.');
            assert(ctx.materialInspection.loading.material instanceof Publication && ctx.materialInspection.loading.material.id === alicePublication.id,
                '2. ... and the rendered material is exactly what was resolved, unaffected by the admission failure.');
        } finally {
            dispose();
        }
    }
    console.log('✓ Section J: discovery-admission failure never turns an already-successful World Encounter resolution into a failed one — rendering and admission fail independently, exactly as this milestone’s own product brief required.');

    // ===============================================================
    // Section K — No second source of truth.
    // ===============================================================
    {
        // Sections C/E/F already used flagshipProvider for BOTH admission
        // (World Encounter's own write) and Repository search (a read) —
        // the same live instance, never two. This section makes that
        // sharing explicit and adversarial: a SEPARATE, freshly-constructed
        // provider that World Encounter never touches finds nothing,
        // proving Repository's own visibility in Section E came from the
        // shared provider, not from some other, un-observed collection.
        const untouchedProvider = new DecentralizedPublicationDiscoveryProvider();
        const untouchedSearch = new SearchPublicationsUseCase(untouchedProvider);
        const miss = untouchedSearch.execute({ text: 'World Alice' });
        assert(!miss.items.some((p) => p.id === flagshipPublication.id),
            '1. a second, un-admitted-to provider finds nothing — Repository visibility in Section E came specifically from the ONE shared provider World Encounter admitted into, confirming there is no second, hidden World-Encounter-specific catalog Repository could instead be reading from.');
    }
    console.log('✓ Section K: no second source of truth — Repository observes the exact provider World Encounter admits into; a separate, un-admitted-to provider finds nothing.');

    // ===============================================================
    // Section L — Production scope guard.
    // ===============================================================
    {
        // 0.9.473's own commit (b0d1307) is this milestone's own baseline —
        // the audit that found the gap and named the seam, with zero
        // production changes of its own (enforced by that milestone's own
        // Section J). Everything THIS milestone (0.9.474) changed, relative
        // to that baseline, was exactly the two production files the
        // audit's own Section I named.
        //
        // AMENDED BY 0.9.475 — Wire Peer World Encounter Material Source
        // into Production Composition Root. A scope guard pinned to a fixed
        // historical baseline commit, by construction, only ever describes
        // the ONE milestone that introduced it — every later milestone that
        // legitimately touches a production file this guard did not yet
        // know about must widen the allowlist here, in place, exactly as
        // 0.9.474 itself amended 0.9.473's own findings above rather than
        // leaving them to silently rot into a false failure. 0.9.475 added
        // exactly one legitimate line to `ui/main.js` (constructing a
        // PeerWorldEncounterMaterialSource and threading it into the
        // pre-existing `peer` composition slot) — see tests/
        // PeerWorldEncounterMaterialSourceCompositionRootWiringAudit.test.js
        // for that milestone's own dedicated proof and scope guard.
        const BASELINE_COMMIT = 'b0d1307';
        let changedFiles = [];
        try {
            changedFiles = execSync(
                `git diff --name-only ${BASELINE_COMMIT} -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"`,
                { cwd: SOURCE_ROOT.pathname }
            ).toString().trim().split('\n').filter(Boolean);
        } catch {
            // 2. A shallow clone or missing baseline commit degrades this
            // section to a skip rather than a false failure — the live
            // proofs in Sections A-K already establish the production
            // behavior directly; this section only adds a scope guard on
            // top, where the baseline is reachable.
            console.log('✓ Section L: SKIPPED — baseline commit not reachable in this checkout (shallow clone); Sections A-K already prove production behavior directly.');
            changedFiles = null;
        }
        if (changedFiles !== null) {
            const allowed = new Set(['ui/components/WorldEncounterCanvas.js', 'ui/views/WorldView.js', 'ui/main.js']);
            const unexpected = changedFiles.filter((f) => !allowed.has(f));
            assert(unexpected.length === 0,
                `1. relative to 0.9.473's own baseline, only the intended World/application integration seam (AMENDED BY 0.9.475 to also allow ui/main.js's own composition-root change) changed — no unexpected production file was touched (unexpected: ${unexpected.join(', ') || 'none'}).`);
            console.log(`✓ Section L: production scope guard — relative to 0.9.473's own baseline, exactly the intended files changed (${changedFiles.join(', ') || 'none'}).`);
        }
    }

    console.log('\n✅ All World Encounter Repository Continuity Integration Boundary Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All WorldEncounterRepositoryContinuityIntegrationBoundaryAudit tests passed');
}).catch((error) => {
    console.error('\n✗ WorldEncounterRepositoryContinuityIntegrationBoundaryAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
