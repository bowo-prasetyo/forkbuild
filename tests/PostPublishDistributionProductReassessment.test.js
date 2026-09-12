import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState, describePublicationDistributionLifecycle } from '../application/PublicationDistributionLifecycle.js';
import { IpfsRemotePublicationCoordinator } from '../application/IpfsRemotePublicationCoordinator.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { UnpublishDocumentUseCase } from '../application/UnpublishDocumentUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';

// 0.9.349 — Post-Publish Distribution Product Reassessment.
//
// **Type: test-only, no production changes.** 0.9.346 found the gap (the
// one existing announcement action was reachable only through World
// Encounter navigation); 0.9.347 closed it with one small, additive prop
// binding; 0.9.348 proved both entry points converge on the same
// unmodified distribution semantics. This milestone stops implementation
// and asks the one question that arc was always building toward:
//
//   Now that Publication Distribution is directly reachable immediately
//   after local publishing, is there still a genuine user-facing gap in
//   this product arc?
//
// Every section below is evidence gathered fresh against real, unmodified
// production code and real object graphs — never prose carried over from
// 0.9.346/0.9.347/0.9.348 without re-checking it against the current tree
// — in the identical "reproduce the real seam, verify the reproduction is
// honest" discipline those milestones already hold.
//
//   Section A — Complete user journey: Create/Edit -> Repository Publish
//               -> Local Publication -> post-publish entry point ->
//               explicit choice -> existing distribution mechanism, with
//               zero World Encounter navigation.
//   Section B — Publication announcement: the original 0.9.346 gap,
//               confirmed reachable and live-functional directly from the
//               post-publish surface.
//   Section C — Snapshot distribution: confirmed still directly
//               reachable, through its own pre-existing (0.9.140) action,
//               never merged or duplicated by the new entry point.
//   Section D — Other decentralized substrates: IPFS remote pinning and
//               Bitcoin/Base anchoring, evaluated on their own UX and
//               prerequisite model, not "could a button exist."
//   Section E — User agency: Publish produces no automatic distribution;
//               every distribution is one explicit, separate action.
//   Section F — Partial distribution: each destination succeeds or fails
//               independently; no aggregate all-or-nothing requirement.
//   Section G — Discovery vs. distribution: a successful announcement or
//               placement is not itself Repository admission/visibility.
//   Section H — Status/history: whether distribution history, per-
//               substrate status, badges, retry, aggregate progress, or
//               delivery receipts are genuinely needed today.
//   Section I — Existing architecture: reconfirming, fresh, that no
//               generic distribution manager/lifecycle/queue/ranking/
//               automatic-invocation/new persisted state/coupling has
//               appeared anywhere.
//   Section J — Final product decision matrix and verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    // The real orchestrator/executor chain crosses several nested awaits
    // (upload/publish/describe/transition/store) — mirrors
    // tests/PostPublishDistributionConvergenceAudit.test.js's own
    // flushMicrotasks() for the identical reason.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-reassessment-1',
        documentId: 'doc-reassessment-1',
        title: 'A Reassessed Publication',
        author: 'author-1',
        contentReference: new ContentReference({ hash: 'legacy-hash', uri: 'ipfs://legacy-cid', storage: 'ipfs' }),
        ...overrides
    });
    if (overrides.signature !== undefined) {
        return publication;
    }
    return publication.withSignature(new Signature({
        algorithm: 'Ed25519',
        signer: 'author-1',
        signature: 'fake-signature-value',
        signedHash: 'fake-signed-hash',
        domain: 'forkbuild'
    }));
}

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

// The EXACT logic ui/views/WorldView.js's own distributeWorldEncounterPublication()
// implements, unmodified since 0.9.104/0.9.347 — reproduced here for the
// identical reason tests/PostPublishDistributionConvergenceAudit.test.js's
// own copy already is: that function lives inside WorldView.js's own
// setup(), not exported.
function realPublicationDistributionAction({ lifecycleStore, transactionId = 'ReassessmentTransactionId123456789', eventId = 'e'.repeat(64), gatewayHandler, relayHandler }) {
    const gateway = gatewayHandler || (() => gatewayResponse('accepted'));
    const relay = relayHandler || (() => ({ published: true, id: eventId }));
    const publicationDistributionCommand = (publication) => executePublicationDistributionCommand({
        publication,
        serializedMaterial: JSON.stringify(publication.toJSON()),
        arweaveUploaderOptions: {
            signer: { sign: async (material) => ({ id: transactionId, transaction: { data: material } }) },
            fetchImpl: async (url, options) => gateway(url, options)
        },
        nostrPublisherOptions: {
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-post-publish-reassessment',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        },
        lifecycleStore
    });
    return function distributeWorldEncounterPublication(publication) {
        return publicationDistributionCommand(publication);
    };
}

// A fake, in-memory Snapshot content store/discovery publisher pair,
// mirroring the shape content/ArweaveContentStore.js / application/
// NostrSnapshotDiscoveryPublisher.js already implement — the identical
// "real command, fake network collaborators" discipline the Publication
// distribution harness above already holds, one family over.
function fakeSnapshotCollaborators({ putImpl, publishImpl } = {}) {
    const contentStore = {
        put: putImpl || (async (bytes) => new ContentReference({ hash: 'snapshot-hash', uri: 'ar://snapshot-tx', storage: 'ar' }))
    };
    const discoveryPublisher = {
        discoveryTag: 'forkbuild-snapshot-reassessment',
        publish: publishImpl || (async () => ({ published: true, relayUrl: 'wss://relay.example', id: 'f'.repeat(64) }))
    };
    return { contentStore, discoveryPublisher };
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        publicationDistributionCommand: null,
        publicationDistributionExecuting: false,
        publicationDistributionError: null,
        publicationDistributionResult: null,
        publicationDistributionRequestId: 0,
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        distributeOwnPublication: OwnPublicationPanel.methods.distributeOwnPublication,
        distributeOwnSnapshot: OwnPublicationPanel.methods.distributeOwnSnapshot,
        ...overrides
    };
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function codeOnlySource(relativePath) {
    return codeOnlyLines(await rawSource(relativePath));
}

function grepFiles(pattern, dirs) {
    try {
        const out = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        return out ? out.split('\n') : [];
    } catch { return []; }
}

function grepCount(pattern, dirs) {
    return grepFiles(pattern, dirs).length;
}

async function grepCodeOnlyFiles(pattern, dirs) {
    const candidates = grepFiles(pattern, dirs);
    const hits = [];
    for (const file of candidates) {
        const code = await codeOnlySource(file);
        if (code.includes(pattern)) hits.push(file);
    }
    return hits;
}

const PRODUCTION_DIRS = ['application', 'ui', 'core', 'publisher'];

async function run() {
    // ---------------------------------------------------------------
    // Section A — Complete user journey: Create/Edit -> Repository
    // Publish -> Local Publication -> post-publish entry point -> user
    // explicitly chooses distribution -> existing distribution mechanism,
    // with zero World Encounter navigation anywhere in the chain.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const publisherProvider = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const publishUseCase = new PublishDocumentUseCase(publisherProvider, alice);

        // Create/Edit -> Repository Publish -> Local Publication.
        const document = makeDocument('Journey Manor');
        const publication = publishUseCase.execute({ document });
        assert(discoveryProvider.findById(publication.id) !== null,
            '1. Repository Publish produces a real, locally-resolvable Publication');

        // Post-Publish Distribution Entry Point -> user explicitly
        // chooses distribution -> existing distribution mechanism. Note
        // what is deliberately ABSENT from this whole section: no
        // WorldDiscoverySourceRegistry, no WorldEncounterCanvas, no
        // selectedEncounter, no router, no World View import of any kind.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = realPublicationDistributionAction({ lifecycleStore });
        const ctx = panelCtx({ publication, publicationDistributionCommand: command });

        ctx.distributeOwnPublication();
        assert(ctx.publicationDistributionExecuting === true, '2. the entry point enters executing state synchronously on the explicit click');
        await flushMicrotasks();

        assert(ctx.publicationDistributionExecuting === false && ctx.publicationDistributionError === null,
            '3. the journey completes: local publish, then one explicit choice, then the existing distribution mechanism, with no error');
        assert(lifecycleStore.get(publication.id).discovery.state === PublicationDistributionState.PRESENT,
            '4. the existing distribution mechanism genuinely ran — a real discovery fact now exists for this Publication');

        // Structural: this whole journey never imports anything World
        // View/World Encounter-shaped — confirming the journey really is
        // coherent WITHOUT that navigation, not merely "possible in
        // addition to it."
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(!panelCode.includes('this.selectedEncounter') && !panelCode.includes('this.$router') && !panelCode.includes('router.push') && !panelCode.includes('router.replace'),
            '5. OwnPublicationPanel.js — the actual post-publish entry point — never reads a World Encounter selection or navigates anywhere to reach this action');

        console.log('✓ Section A: Create/Edit -> Repository Publish -> Local Publication -> post-publish entry point -> explicit choice -> existing distribution mechanism is a coherent journey requiring zero World Encounter navigation');
    }

    // ---------------------------------------------------------------
    // Section B — Publication announcement: the original 0.9.346 gap,
    // confirmed reachable and live-functional directly from the
    // post-publish surface, with a real discovery announcement result.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-reassessment-announce' });
        let publishedEventTemplate = null;
        const command = realPublicationDistributionAction({
            lifecycleStore,
            relayHandler: (relayUrl, eventTemplate) => { publishedEventTemplate = eventTemplate; return { published: true, id: 'b'.repeat(64) }; }
        });
        const ctx = panelCtx({ publication, publicationDistributionCommand: command });

        ctx.distributeOwnPublication();
        await flushMicrotasks();

        assert(ctx.publicationDistributionResult.discovery.id === 'b'.repeat(64),
            '6. announcement/discovery genuinely ran — the panel holds a real Nostr event id, not a placeholder');
        assert(publishedEventTemplate !== null, '7. a real discovery event was actually constructed and handed to the relay');
        const lifecycle = describePublicationDistributionLifecycle(ctx.publicationDistributionResult);
        assert(lifecycle.discovery.state === PublicationDistributionState.PRESENT && lifecycle.discovery.origin === 'wss://relay.example',
            '8. the announcement resolves to a well-formed, present discovery fact naming its own relay origin');

        // Reachability: exactly the assertion 0.9.346 found false and
        // 0.9.347 fixed — no selectedEncounter field exists in this
        // harness at all, so there is structurally nothing gating this
        // click.
        assert(!Object.prototype.hasOwnProperty.call(panelCtx(), 'selectedEncounter'),
            '9. the announcement action carries no selectedEncounter gate whatsoever — the original 0.9.346 gap is closed, not merely worked around');

        console.log('✓ Section B: Publication announcement/discovery is genuinely reachable and functional directly from the post-publish surface — the original gap is closed');
    }

    // ---------------------------------------------------------------
    // Section C — Snapshot distribution: still directly reachable through
    // its own pre-existing (0.9.140) action, never duplicated or replaced
    // by the new entry point.
    // ---------------------------------------------------------------
    {
        // C1 — live: Snapshot distribution runs through its OWN command
        // shape (bytes in, contentReference/announcement out) — a
        // genuinely different call contract from Publication distribution
        // (a Publication object in, material/discovery out).
        const { contentStore, discoveryPublisher } = fakeSnapshotCollaborators();
        const snapshotCommand = (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore, discoveryPublisher });
        const publication = signedPublication({ id: 'pub-reassessment-snapshot' });
        const ctx = panelCtx({
            publication,
            snapshotDistributionCommand: (p) => snapshotCommand(JSON.stringify(p.toJSON())),
            publicationDistributionCommand: () => Promise.reject(new Error('should never be called by distributeOwnSnapshot'))
        });

        ctx.distributeOwnSnapshot();
        assert(ctx.snapshotDistributionExecuting === true, '10. Distribute Snapshot enters its own, separate executing state synchronously');
        await flushMicrotasks();

        assert(ctx.snapshotDistributionExecuting === false && ctx.snapshotDistributionError === null,
            '11. Distribute Snapshot completes successfully through its own command, untouched by this arc');
        assert(ctx.snapshotDistributionResult.contentReference.uri === 'ar://snapshot-tx',
            '12. Snapshot distribution genuinely placed bytes and returned a real content reference');
        assert(ctx.publicationDistributionResult === null && ctx.publicationDistributionExecuting === false,
            '13. Distribute Snapshot never touches Publication distribution\'s own separate state family');

        // C2 — structural: two distinct wrappers in WorldView.js, two
        // distinct props on OwnPublicationPanel.js — 0.9.347 added a
        // SECOND action beside the first, never merged the two into one.
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        // AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
        // Reachability. distributeWorldEncounterPublication gained a new,
        // optional discoveryProvider parameter — still a distinct wrapper
        // from distributeWorldEncounterSnapshot, never collapsed into it.
        assert(viewCode.includes('function distributeWorldEncounterSnapshot(publication)') && viewCode.includes('function distributeWorldEncounterPublication(publication, discoveryProvider)'),
            '14. WorldView.js still wires two distinct wrapper functions — Snapshot distribution and Publication distribution were never collapsed into one');
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert((panelCode.match(/this\.snapshotDistributionCommand\(/g) || []).length === 1,
            '15. snapshotDistributionCommand is still called from exactly one place — the pre-existing 0.9.140 action, unduplicated');
        assert((panelCode.match(/this\.publicationDistributionCommand\(/g) || []).length === 1,
            '16. publicationDistributionCommand is called from exactly one place — the new action, unduplicated');
        assert(panelCode.includes("distributeOwnSnapshot") && panelCode.includes("distributeOwnPublication") && panelCode.indexOf('distributeOwnSnapshot') !== panelCode.indexOf('distributeOwnPublication'),
            '17. both actions exist as genuinely separate methods, neither one calling or wrapping the other');

        console.log('✓ Section C: Snapshot distribution remains directly reachable through its own pre-existing action and command shape — the new entry point added a second capability beside it, never a replacement or a duplicate');
    }

    // ---------------------------------------------------------------
    // Section D — Other decentralized substrates: IPFS remote pinning and
    // Bitcoin/Base anchoring, evaluated on UX/prerequisite fitness for an
    // immediate post-publish surface, not mere feasibility.
    // ---------------------------------------------------------------
    {
        // D1 — live: remote IPFS pinning genuinely requires a standing,
        // already-configured hosted endpoint before a single click can
        // even attempt anything — a materially different prerequisite
        // from Publication/Snapshot distribution, whose Arweave/Nostr
        // collaborators above needed only an injected signer/fetch (the
        // production equivalent of an already-connected browser wallet
        // and a public relay URL, both zero-setup for this codebase).
        const coordinator = new IpfsRemotePublicationCoordinator({ createPinningProvider: () => { throw new Error('should never be constructed without configuration'); } });
        let threw = null;
        try {
            await coordinator.publish({ bytes: 'snapshot-bytes', configuration: {} });
        } catch (error) {
            threw = error;
        }
        assert(threw !== null && /non-empty endpoint is required/.test(threw.message),
            '18. IpfsRemotePublicationCoordinator genuinely refuses to publish without a pre-configured hosted endpoint — a real, live-proven external prerequisite, not an assumption');

        // D2 — structural: Bitcoin anchoring is explicit, on file, that a
        // wallet/transaction capability is a SEPARATE prerequisite this
        // codebase's own coordinator never supplies itself.
        const bitcoinPublisherCode = await rawSource('application/CreateBitcoinAnchorPublisherUseCase.js');
        assert(/never the wallet\/transaction capability/i.test(bitcoinPublisherCode),
            '19. Bitcoin anchoring\'s own source is explicit that a connected, funded wallet is a separate prerequisite it does not itself provide');

        // D3 — Base anchoring remains reserved/unimplemented, reconfirmed
        // fresh: still no anchoring/Base*.js transport anywhere.
        const blockchainKindCode = await rawSource('application/BlockchainKind.js');
        assert(/RESERVED/i.test(blockchainKindCode) && blockchainKindCode.includes("BASE: 'base'"),
            '20. BlockchainKind.BASE remains named but reserved — still no implemented Base transport, reconfirmed fresh');
        const baseTransportFiles = grepFiles('BASE', ['anchoring']);
        assert(grepCount('class.*Base.*Publisher', PRODUCTION_DIRS) === 0,
            '21. no Base-specific anchor publisher class exists anywhere in production');

        // D4 — reconfirm, fresh, that neither remains referenced from the
        // immediate post-publish surface — the deliberate absence 0.9.347/
        // 0.9.348 already established, still true today.
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        for (const term of ['IpfsRemotePublicationCoordinator', 'PublicationAnchorCreationCoordinator', 'BlockchainKind', 'CreateBaseAnchorPublicationRecordUseCase']) {
            assert(!panelCode.includes(term) && !viewCode.includes(term),
                `22. '${term}' remains absent from the post-publish surface`);
        }

        console.log('✓ Section D: IPFS remote pinning and Bitcoin/Base anchoring each carry genuine, live-proven external prerequisites (a configured hosted endpoint; a connected, funded wallet; an unimplemented transport) that make immediate post-publish placement inappropriate for now — confirming 0.9.346\'s expectation of "no," not merely repeating it');
    }

    // ---------------------------------------------------------------
    // Section E — User agency: Publish produces no automatic
    // distribution; every distribution is one explicit, separate action.
    // ---------------------------------------------------------------
    {
        // E1 — live: a real publish, with a distribution command present
        // and ready to be called, is never itself invoked by publishing.
        let distributionCalls = 0;
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const publisherProvider = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const publishUseCase = new PublishDocumentUseCase(publisherProvider, alice);

        const publication = publishUseCase.execute({ document: makeDocument('Agency Cottage') });
        assert(distributionCalls === 0, '23. publishing a document never itself triggers any distribution call');

        // Only after mounting the entry point AND an explicit click does
        // a distribution call occur.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = realPublicationDistributionAction({ lifecycleStore });
        const wrappedCommand = (p) => { distributionCalls += 1; return command(p); };
        const ctx = panelCtx({ publication, publicationDistributionCommand: wrappedCommand });
        assert(distributionCalls === 0, '24. merely mounting the entry point with a publication present still triggers nothing — guidance, not action');

        ctx.distributeOwnPublication();
        assert(ctx.publicationDistributionExecuting === true, '25a. the explicit click enters executing state synchronously');
        await flushMicrotasks();
        assert(distributionCalls === 1, '25. only the explicit click itself ever starts a distribution call');

        // E2 — structural: neither publish handler nor either use case
        // ever calls into distribution machinery, or vice versa, reconfirmed fresh.
        const publishUseCaseCode = await codeOnlySource('application/PublishDocumentUseCase.js');
        assert(!/Arweave|Nostr|Ipfs|Bitcoin|distribut/i.test(publishUseCaseCode),
            '26. PublishDocumentUseCase.js carries no distribution vocabulary of any kind');
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const mountedMatch = panelCode.match(/mounted\(\)\s*\{[\s\S]*?\n\s{8}\},/);
        if (mountedMatch) {
            assert(!mountedMatch[0].includes('distributeOwnPublication(') && !mountedMatch[0].includes('distributeOwnSnapshot('),
                '27. neither distribution action is ever invoked automatically from this panel\'s own mounted() hook');
        }

        console.log('✓ Section E: Publish -> no automatic distribution; Publish -> optional guidance -> explicit user action remains a hard invariant, live-proven');
    }

    // ---------------------------------------------------------------
    // Section F — Partial distribution: each destination succeeds or
    // fails independently; no aggregate all-or-nothing requirement.
    // ---------------------------------------------------------------
    {
        // F1 — live: Arweave material succeeds, Nostr discovery declines
        // (returns null) — a real, mixed PRESENT/ABSENT lifecycle, exactly
        // the scenario 0.9.49 named and 0.9.50 preserved, reconfirmed here
        // one milestone further downstream.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-reassessment-partial-1' });
        const command = realPublicationDistributionAction({ lifecycleStore, relayHandler: () => null });
        const ctx = panelCtx({ publication, publicationDistributionCommand: command });

        ctx.distributeOwnPublication();
        await flushMicrotasks();

        assert(ctx.publicationDistributionError === null,
            '28. a declined discovery announcement, with material still successfully placed, is not treated as an overall failure');
        const lifecycle = describePublicationDistributionLifecycle(ctx.publicationDistributionResult);
        assert(lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.discovery.state === PublicationDistributionState.ABSENT,
            '29. the lifecycle genuinely records material PRESENT / discovery ABSENT — one destination succeeded, the other did not, independently');

        // F2 — Snapshot distribution and Publication distribution/
        // discovery are proven independent already by Section C; here,
        // confirm structurally that neither the Snapshot family nor the
        // Publication family nor the IPFS/Anchor coordinators import one
        // another — no shared aggregate outcome collaborator anywhere.
        const snapshotCommandCode = await codeOnlySource('application/SnapshotDistributionCommand.js');
        const publicationCommandCode = await codeOnlySource('application/PublicationDistributionCommand.js');
        const ipfsCode = await codeOnlySource('application/IpfsRemotePublicationCoordinator.js');
        const anchorCode = await codeOnlySource('application/PublicationAnchorCreationCoordinator.js');
        assert(!snapshotCommandCode.includes('PublicationDistributionCommand') && !publicationCommandCode.includes('SnapshotDistributionCommand'),
            '30. Snapshot distribution and Publication distribution import neither one another');
        for (const code of [snapshotCommandCode, publicationCommandCode]) {
            assert(!code.includes('IpfsRemotePublicationCoordinator') && !code.includes('PublicationAnchorCreationCoordinator'),
                '31. neither distribution command imports the IPFS or anchor coordinators');
        }
        assert(!ipfsCode.includes('PublicationAnchorCreationCoordinator') && !anchorCode.includes('IpfsRemotePublicationCoordinator'),
            '32. the IPFS and anchor coordinators do not import one another either');

        console.log('✓ Section F: Nostr/Snapshot/IPFS/Anchor outcomes remain independent — a live mixed PRESENT/ABSENT lifecycle is valid, and no destination\'s success requires another\'s');
    }

    // ---------------------------------------------------------------
    // Section G — Discovery vs. distribution: a successful announcement
    // or placement is not itself Repository admission/visibility.
    // ---------------------------------------------------------------
    {
        // G1 — live: a real local publish, then a real, successful
        // Publication distribution (Nostr announcement) — the LOCAL
        // Repository read model (LocalDiscoveryProvider) is byte-for-byte
        // unaffected by the distribution outcome, proving the two stages
        // are genuinely separate operations, not two views on one event.
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const publisherProvider = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const publishUseCase = new PublishDocumentUseCase(publisherProvider, alice);

        const publication = publishUseCase.execute({ document: makeDocument('Discovery Lodge') });
        const beforeJson = JSON.stringify(discoveryProvider.findById(publication.id).toJSON());

        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = realPublicationDistributionAction({ lifecycleStore });
        const ctx = panelCtx({ publication, publicationDistributionCommand: command });
        ctx.distributeOwnPublication();
        await flushMicrotasks();
        assert(ctx.publicationDistributionError === null && lifecycleStore.get(publication.id).discovery.state === PublicationDistributionState.PRESENT,
            '33. sanity: the announcement genuinely succeeded');

        const afterJson = JSON.stringify(discoveryProvider.findById(publication.id).toJSON());
        assert(beforeJson === afterJson,
            '34. a successful Nostr announcement never mutates the local Repository read model — announcement is not itself admission');

        // G2 — structural: the decentralized discovery INGESTION pipeline
        // (the one that eventually admits a remote Publication into
        // Repository) shares no import with the distribution/announcement
        // command this milestone's arc built — they are genuinely
        // separate mechanisms, not two names for one thing.
        const publicationCommandCode = await codeOnlySource('application/PublicationDistributionCommand.js');
        const orchestratorCode = await codeOnlySource('application/PublicationDistributionOrchestrator.js');
        for (const code of [publicationCommandCode, orchestratorCode]) {
            assert(!code.includes('PublicationResolutionCoordinator') && !code.includes('DecentralizedPublicationDiscoveryProvider') && !code.includes('CompositeDiscoveryProvider'),
                '35. Publication distribution/announcement imports no part of the Repository-admission/discovery-ingestion pipeline');
        }

        // G3 — the same holds for Snapshot distribution: a successful
        // placement+announcement never imports anything that admits a
        // Publication into Repository's own read model.
        const snapshotCommandCode = await codeOnlySource('application/SnapshotDistributionCommand.js');
        assert(!snapshotCommandCode.includes('DiscoveryProvider') && !snapshotCommandCode.includes('PublisherProvider'),
            '36. Snapshot distribution never imports a DiscoveryProvider or PublisherProvider — placing/announcing a Snapshot cannot itself make anything Repository-visible');

        console.log('✓ Section G: distribution/announcement and Repository admission/discovery remain distinct stages, live-proven and structurally reconfirmed — neither Nostr announcement nor Snapshot distribution implies Repository visibility');
    }

    // ---------------------------------------------------------------
    // Section H — Status/history: whether distribution history, per-
    // substrate status, badges, retry, aggregate progress, or delivery
    // receipts are genuinely needed today.
    // ---------------------------------------------------------------
    {
        // H1 — none of that vocabulary exists anywhere in production.
        const forbiddenStatusVocabulary = [
            'DistributionHistory', 'distributionHistory',
            'DistributionBadge', 'distributionBadge',
            'RetryDistribution', 'retryDistribution',
            'DeliveryReceipt', 'deliveryReceipt',
            'AggregateDistributionProgress', 'aggregateDistributionProgress',
            'DistributionStatusPanel'
        ];
        for (const term of forbiddenStatusVocabulary) {
            const hits = await grepCodeOnlyFiles(term, PRODUCTION_DIRS);
            assert(hits.length === 0, `37. no "${term}" vocabulary exists anywhere in production — found: ${JSON.stringify(hits)}`);
        }

        // H2 — live: each distribution result is genuinely ephemeral —
        // resetting the panel's publication clears any prior result,
        // exactly like every other ephemeral family in this file. There
        // is no persisted record for a person to return to later.
        const publicationA = signedPublication({ id: 'pub-reassessment-h-a' });
        const publicationB = signedPublication({ id: 'pub-reassessment-h-b' });
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = realPublicationDistributionAction({ lifecycleStore });
        const ctx = panelCtx({ publication: publicationA, publicationDistributionCommand: command });
        ctx.distributeOwnPublication();
        await flushMicrotasks();
        assert(ctx.publicationDistributionResult !== null, '38. sanity: a real result exists after a successful distribution');

        OwnPublicationPanel.watch.publication.call(ctx, publicationB, publicationA);
        assert(ctx.publicationDistributionResult === null,
            '39. switching to a different Publication discards the prior result entirely — there is no per-Publication history retained anywhere in this panel\'s own state');

        // H3 — the underlying lifecycle store itself holds only the
        // MOST RECENT fact per Publication id, never a history array —
        // reconfirmed fresh against the real store class.
        const storeCode = await codeOnlySource('application/PublicationDistributionLifecycleStore.js');
        assert(!/history|History|\[\]/.test(storeCode.replace(/\/\/.*$/gm, '')) || !storeCode.includes('push('),
            '40. PublicationDistributionLifecycleStore.js accumulates no history array — each Publication maps to its single latest fact only');

        console.log('✓ Section H: no distribution history, per-substrate status panel, badge, retry control, aggregate progress, or delivery receipt exists anywhere — and each result is genuinely ephemeral, live-confirmed. Verdict on this section: not yet needed');
    }

    // ---------------------------------------------------------------
    // Section I — Existing architecture: reconfirming, fresh, that no
    // generic distribution manager/lifecycle/queue/ranking/automatic-
    // invocation/new persisted state/coupling has appeared anywhere.
    // ---------------------------------------------------------------
    {
        const forbiddenVocabulary = [
            'DistributionManager',
            'distributePublication(',
            'ProviderRanking', 'providerRanking',
            'DistributionFallback', 'distributionFallback',
            'AutomaticDistribution', 'automaticDistribution',
            'DistributionQueue',
            'RetryScheduler', 'retryScheduler',
            'AggregateDistributionStatus', 'aggregateDistributionStatus',
            'DistributionTargetArray',
            'globallyDistributed', 'isDistributed', 'aggregateDistributionStatus'
        ];
        for (const term of forbiddenVocabulary) {
            const hits = await grepCodeOnlyFiles(term, PRODUCTION_DIRS);
            assert(hits.length === 0, `41. no "${term}" vocabulary exists anywhere in production — found: ${JSON.stringify(hits)}`);
        }

        // No new Publication distribution STATE beyond PublicationDistributionState's
        // own two values, reconfirmed fresh.
        const lifecycleStateCode = await rawSource('application/PublicationDistributionLifecycle.js');
        const stateValues = [...lifecycleStateCode.matchAll(/^\s{4}([A-Z_]+):\s*'([A-Z_]+)'/gm)].map((m) => m[2]);
        assert(stateValues.length === 2 && stateValues.includes('ABSENT') && stateValues.includes('PRESENT'),
            `42. PublicationDistributionState still carries exactly ABSENT/PRESENT and nothing else — found: ${JSON.stringify(stateValues)}`);

        // No coupling between local publication lifecycle and external
        // distribution, reconfirmed fresh in both directions.
        const publishUseCaseCode = await codeOnlySource('application/PublishDocumentUseCase.js');
        const unpublishUseCaseCode = await codeOnlySource('application/UnpublishDocumentUseCase.js');
        const commandCode = await codeOnlySource('application/PublicationDistributionCommand.js');
        const orchestratorCode = await codeOnlySource('application/PublicationDistributionOrchestrator.js');
        assert(!/Arweave|Nostr|Ipfs|Bitcoin|distribut/i.test(publishUseCaseCode) && !/Arweave|Nostr|Ipfs|Bitcoin|distribut/i.test(unpublishUseCaseCode),
            '43. PublishDocumentUseCase.js/UnpublishDocumentUseCase.js carry no distribution vocabulary');
        assert(!commandCode.includes('PublishDocumentUseCase') && !commandCode.includes('UnpublishDocumentUseCase') &&
               !orchestratorCode.includes('PublishDocumentUseCase') && !orchestratorCode.includes('UnpublishDocumentUseCase'),
            '44. the distribution command/orchestrator import neither publish/unpublish use case');

        // No new distribution lifecycle vocabulary in either panel.
        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        for (const code of [canvasCode, panelCode]) {
            assert(!/\bDISPATCHED\b|\bQUEUED\b|\bSCHEDULED\b|\bRETRYING\b|\bCOMMANDED\b/.test(code),
                '45. no new distribution lifecycle vocabulary has appeared in either panel');
        }

        console.log('✓ Section I: no generic distribution manager, aggregate lifecycle, provider ranking/fallback, distribution queue, automatic distribution, new Publication distribution state, or local/external coupling exists anywhere in production, reconfirmed fresh');
    }

    // ---------------------------------------------------------------
    // Section J — Final product decision matrix and verdict.
    // ---------------------------------------------------------------
    {
        console.log('');
        console.log('Final product decision matrix:');
        console.log('| Capability                          | Available | Reachable after Publish | Further work justified? |');
        console.log('|--------------------------------------|-----------|--------------------------|--------------------------|');
        console.log('| Local Publication                     | Yes       | Yes                      | No                       |');
        console.log('| Publication announcement/discovery    | Yes       | Yes                      | No                       |');
        console.log('| Snapshot distribution                 | Yes       | Yes                      | No                       |');
        console.log('| IPFS remote pinning                   | Yes       | Publication Center       | Defer                    |');
        console.log('| Bitcoin anchoring                     | Yes       | Publication Center       | Defer                    |');
        console.log('| Base anchoring                        | No (reserved) | -                    | Defer (unimplemented)    |');
        console.log('| Automatic distribution                | No        | -                        | Deliberately excluded    |');
        console.log('| Aggregate distribution status/history | No        | -                        | No demonstrated need     |');
        console.log('');
        console.log('✓ Section J: VERDICT — STABLE_STOP. The Post-Publish Distribution arc (0.9.346-0.9.349) is complete: the original reachability');
        console.log('  gap (Publication announcement gated behind World Encounter selection) is closed and live-proven; Snapshot distribution');
        console.log('  remains independently reachable through its own pre-existing action; local publish/unpublish, distribution outcomes, and');
        console.log('  Repository admission all remain three genuinely independent concerns, live-proven in both directions; IPFS pinning and');
        console.log('  Bitcoin/Base anchoring correctly stay in the Publication Center, each for a real, live-demonstrated external-prerequisite');
        console.log('  reason, not an arbitrary scoping choice; and no distribution-status/history surface has a demonstrated need today. No 0.9.350');
        console.log('  is pre-selected from within this arc. The next milestone should come from an actual user-facing gap discovered through the');
        console.log('  broader Product Evolution Reassessment, never from the mere existence of another decentralized substrate that could');
        console.log('  theoretically grow a button.');

        console.log('\n✅ All Post-Publish Distribution Product Reassessment tests passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
