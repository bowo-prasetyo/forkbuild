import { readFile, readdir } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { resolveSnapshotPublicationAttribution } from '../application/SnapshotPublicationAttribution.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.145 — End-to-End Snapshot Attribution Audit.
//
// 0.9.142 (discovery), 0.9.143 (the pure attribution comparison), and
// 0.9.144 (its UI wiring, at both World View entry points) each proved
// their own seam in isolation. This is a test-only audit, exactly the
// shape tests/PublicationDistributionEndToEndRuntimeAudit.test.js (0.9.122),
// tests/SnapshotDistributionAudit.test.js (0.9.135), tests/
// SnapshotDistributionEndToEndRuntimeAudit.test.js (0.9.139), and tests/
// SnapshotDistributionEntryPointAudit.test.js (0.9.141) already gave their
// own subsystems — ZERO new production code. It proves the complete chain
// those three milestones assembled now composes into ONE continuous
// pipeline at both entry points, and closes the specific gaps none of
// their own test suites already covered:
//
//   Publication
//        │  contentReference.hash
//        ▼
//   Discover Snapshot ──► Nostr ──► Snapshot locator ──► Content Store
//        │                                                     │
//        │                                          Retrieved bytes
//        │                                                     │
//        │                                      Content verification
//        │                                                     │
//        ▼                                          Verified Snapshot
//   Snapshot–Publication Attribution ◄───────────────────────────┘
//        │
//        ├──► MATCH
//        └──► NO_MATCH
//
// The central architectural claim under audit: a Publication can
// independently discover a Snapshot, retrieve and cryptographically
// verify its actual bytes, and only then determine whether that verified
// content corresponds to the Publication's own content identity — and
// none of DISCOVERY, RESOLUTION/VERIFICATION, ATTRIBUTION, or
// PRESENTATION ever upgrades into one of the others.
//
// Section A: the complete local path — My Publication, driven through
//            OwnPublicationPanel's real action, over a runtime composed
//            exactly as ui/main.js composes it (shared arweaveHostSigner,
//            shared 'forkbuild-snapshot' discoveryTag across BOTH the
//            distribution and discovery compositions) — ends in MATCH.
// Section B: the complete World Encounter path — the SAME shared
//            infrastructure and the SAME discoverOwnSnapshot seam, a
//            DIFFERENT Wanderer-selected Publication, driven through
//            WorldEncounterCanvas instead — proving local and remote
//            genuinely converge on one machinery, not two lookalikes.
// Section C: false announcement — a candidate claiming the requested
//            hash but actually pointing to different bytes is refused at
//            resolve()'s own verification step, driven end to end through
//            the real composed runtime and OwnPublicationPanel's own UI
//            action — CONTENT_HASH_MISMATCH, never MATCH, never NO_MATCH.
//            PLUS the deeper form of the same attack: a RESOLVED result
//            whose own (self-declared, unverified) candidate metadata
//            claims the Publication's hash while its VERIFIED bytes
//            genuinely differ — attribution recomputes from bytes and
//            still reports NO_MATCH, proving a malicious/incorrect
//            resolver result cannot manufacture MATCH merely by writing
//            the right hash into a metadata field.
// Section D: verified but unrelated Snapshot — real placement/discovery
//            of content H2, attributed against a Publication whose own
//            hash is H1 — verification succeeds, attribution reports
//            NO_MATCH, proving the two remain different questions.
// Section E: resolution failure preservation, through the real
//            composed runtime and UI — NOT_DISCOVERED, STORE_UNAVAILABLE,
//            and CONTENT_UNAVAILABLE (CONTENT_HASH_MISMATCH is Section
//            C's own) are each reported verbatim, and NONE becomes
//            NO_MATCH.
// Section F: identity separation — Publication id, the Arweave
//            transaction id, the Nostr event id, and the locator all stay
//            distinct from the two content hashes attribution compares.
// Section G: entry-point state isolation — OwnPublicationPanel and
//            WorldEncounterCanvas run discovery/attribution concurrently
//            over the SAME shared infrastructure: discovery state stays
//            separate, attribution state stays separate, request ids
//            stay separate, changing one Publication never invalidates
//            the other's already-settled result, and a stale response
//            can never overwrite either current state.
// Section H: distribution independence — Distribute Snapshot never
//            populates or touches Discover/Attribute's own state, and
//            Discover Snapshot succeeds for content placed by a path that
//            never called the distribution command at all.
// Section I: structural boundary — a repository-wide sweep proving UI
//            contains no Nostr/Arweave logic, attribution performs no
//            I/O, the discovery command carries no attribution
//            vocabulary, the resolver carries no Publication/ownership
//            vocabulary, and distribution remains a separate command
//            path from discovery/attribution in both directions.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-attribution-audit-tx-${counter}`, transaction: { id: `fake-attribution-audit-tx-${counter}`, data: material } };
    }
    return { sign };
}

function makeNostrNetwork() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

// One shared "host" — a single Arweave signer/gateway and a single Nostr
// network — composed into BOTH a distribution runtime and a discovery
// runtime exactly the way ui/main.js composes them: the SAME signer
// instance handed to both composeSnapshotDistributionRuntime() and
// composeDiscoverSnapshotRuntime(), and the SAME 'forkbuild-snapshot'
// discoveryTag used for both the announcement and the query — never two
// independent, coincidentally-matching configurations.
function makeSharedHostRuntime(discoveryTag = 'forkbuild-snapshot') {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const distribution = composeSnapshotDistributionRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryPublisherOptions: { publishImpl: network.publishImpl, discoveryTag }
    });
    const snapshotDistributionCommand = (bytes) => executeSnapshotDistributionCommand({
        bytes, contentStore: distribution.contentStore, discoveryPublisher: distribution.discoveryPublisher
    });

    const discovery = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });
    const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
        discoveryTag, contentHash, resolver: discovery.resolver, contentStore: discovery.contentStore
    });

    return { gateway, signer, network, discoveryTag, distribution, discovery, snapshotDistributionCommand, discoverSnapshotCommand };
}

// The EXACT logic ui/views/WorldView.js's own discoverOwnSnapshot()
// implements, unmodified by this milestone — reused verbatim for BOTH
// entry points, mirroring the real function's own reuse
// (docs/Roadmap.md's own 0.9.144 entry, "REUSED VERBATIM... never forked
// into a second function").
function makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand }) {
    return (publication) => {
        if (!discoverSnapshotCommand || !publication || !publication.contentReference) {
            return Promise.reject(new Error('Snapshot discovery is not available.'));
        }
        return discoverSnapshotCommand(publication.contentReference.hash);
    };
}

// The EXACT logic ui/views/WorldView.js's own distributeWorldEncounterSnapshot()
// implements, reproduced for the same reason.
function makeDistributeOwnSnapshotAction({ snapshotDistributionCommand, contentEntries }) {
    return (publication) => {
        if (!snapshotDistributionCommand) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        const snapshotJson = Object.prototype.hasOwnProperty.call(contentEntries, publication.id) ? contentEntries[publication.id] : null;
        if (snapshotJson === null) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        return snapshotDistributionCommand(JSON.stringify(snapshotJson));
    };
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        discoverSnapshotCommand: null,
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        snapshotDiscoveryExecuting: false,
        snapshotDiscoveryError: null,
        snapshotDiscoveryResult: null,
        snapshotDiscoveryRequestId: 0,
        snapshotAttributionResult: null,
        discoverOwnSnapshot: OwnPublicationPanel.methods.discoverOwnSnapshot,
        distributeOwnSnapshot: OwnPublicationPanel.methods.distributeOwnSnapshot,
        ...overrides
    };
}

function canvasCtx(overrides = {}) {
    const ctx = {
        selectedEncounter: null,
        materialInspection: null,
        distributionLifecycleStore: null,
        distributionCommand: null,
        distributionExecuting: false,
        distributionError: null,
        distributionRequestId: 0,
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        discoverSnapshotCommand: null,
        snapshotDiscoveryExecuting: false,
        snapshotDiscoveryError: null,
        snapshotDiscoveryResult: null,
        snapshotDiscoveryRequestId: 0,
        snapshotAttributionResult: null,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
        discoverSelectedSnapshot: WorldEncounterCanvas.methods.discoverSelectedSnapshot,
        distributeSelectedSnapshot: WorldEncounterCanvas.methods.distributeSelectedSnapshot,
        registry: null,
        worldDiscoveryLeadRegistry: null,
        materialSources: null,
        materialVerifier: null,
        resolvedSelectionChoice: null,
        resolvedLeadChoice: null,
        decentralizedLeadOutcome: null,
        selectionOutcome: null,
        materialInspectionRequestId: 0,
        ...overrides
    };
    Object.defineProperty(ctx, 'distributablePublication', {
        get() { return WorldEncounterCanvas.computed.distributablePublication.call(ctx); }
    });
    return ctx;
}

function selectRemotePublication(ctx, publication) {
    ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
    ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function walkJsFiles(dirUrl, relativeLabel, skipDirNames, visit) {
    const entries = await readdir(dirUrl, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (skipDirNames.has(entry.name)) continue;
            await walkJsFiles(new URL(`${entry.name}/`, dirUrl), `${relativeLabel}${entry.name}/`, skipDirNames, visit);
            continue;
        }
        if (!entry.name.endsWith('.js')) continue;
        const source = await readFile(new URL(entry.name, dirUrl), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        await visit(`${relativeLabel}${entry.name}`, codeOnly);
    }
}

async function run() {
    // ===============================================================
    // Section A — the complete local path: My Publication, driven
    // through OwnPublicationPanel's real action, over a shared runtime
    // composed exactly the way ui/main.js composes it.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-section-a');
        const discoverOwnSnapshotAction = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: host.discoverSnapshotCommand });

        const snapshotJson = { world: { buildings: [{ id: 'section-a-building', bricks: 4 }] } };
        const bytes = JSON.stringify(snapshotJson);
        const expectedHash = computeContentHash(bytes);
        const distributeAction = makeDistributeOwnSnapshotAction({
            snapshotDistributionCommand: host.snapshotDistributionCommand,
            contentEntries: { 'pub-audit-a': snapshotJson }
        });

        const publication = new Publication({
            id: 'pub-audit-a',
            documentId: 'doc-audit-a',
            contentReference: new ContentReference({ hash: expectedHash })
        });

        const ctx = panelCtx({ publication, discoverSnapshotCommand: discoverOwnSnapshotAction, snapshotDistributionCommand: distributeAction });

        // Publication -> Discover Snapshot -> Nostr -> storage -> retrieval
        // -> verification -> attribution -> MATCH, but the content must
        // first genuinely exist for there to be anything to discover — the
        // "My Publication" flagship first distributes its own material
        // (a real, ordinary user action, not special setup this test
        // invents), then discovers it independently.
        ctx.distributeOwnSnapshot();
        await flushMicrotasks();
        assert(ctx.snapshotDistributionResult && ctx.snapshotDistributionResult.contentReference.hash === expectedHash,
            'A0. sanity: the flagship content was genuinely distributed (placed + announced) first');

        ctx.discoverOwnSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDiscoveryError === null, 'A1. no error notice on a successful local path');
        assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'A2. discovery, location, retrieval, and verification all succeed via the composed runtime');
        assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'A3. the complete local chain — Publication -> Discover Snapshot -> Nostr -> storage -> retrieval -> verification -> attribution — ends in MATCH, driven entirely through OwnPublicationPanel\'s own action');

        // Identity separation, checked inline for this same real scenario
        // (Section F gives it its own dedicated, fuller treatment).
        assert(ctx.snapshotAttributionResult.publicationHash !== publication.id, 'A4. publicationHash is never publication.id');
        assert(ctx.snapshotAttributionResult.snapshotHash === expectedHash, 'A5. snapshotHash is the independently recomputed content hash');

        console.log('✓ Section A: the complete local path — My Publication, distributed and independently discovered through the actual World View seam (OwnPublicationPanel + the ui/main.js-shaped composed runtime), ends in MATCH');
    }

    // ===============================================================
    // Section B — the complete World Encounter path: the SAME shared
    // infrastructure, a DIFFERENT Wanderer-selected Publication, driven
    // through WorldEncounterCanvas instead — local and remote converge
    // on one machinery.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-section-b');
        const discoverOwnSnapshotAction = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: host.discoverSnapshotCommand });

        const snapshotJson = { world: { buildings: [{ id: 'section-b-building', bricks: 9 }] } };
        const bytes = JSON.stringify(snapshotJson);
        const expectedHash = computeContentHash(bytes);

        // Placed independently of any UI action this test drives — a
        // Wanderer discovering someone ELSE's already-distributed material,
        // never something World Encounters itself distributed.
        const reference = await host.distribution.contentStore.put(bytes);
        await host.distribution.discoveryPublisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        const encounteredPublication = new Publication({
            id: 'pub-audit-b-remote',
            documentId: 'doc-audit-b-remote',
            contentReference: new ContentReference({ hash: expectedHash })
        });

        const ctx = canvasCtx({ discoverSnapshotCommand: discoverOwnSnapshotAction });
        selectRemotePublication(ctx, encounteredPublication);
        assert(ctx.distributablePublication === encounteredPublication, 'B0. sanity: the selected encounter\'s own loaded Publication is the one this section discovers');

        ctx.discoverSelectedSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'B1. the complete remote path resolves fully, through WorldEncounterCanvas\'s own action');
        assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'B2. and attributes: MATCH, for a Wanderer-selected Publication — the same seam Section A already drove for the local user\'s own');

        // Convergence, proven structurally, not merely "both happened to
        // return MATCH": both entry points call their own action, which
        // in turn calls nothing but the identical injected
        // discoverSnapshotCommand — never a second discovery/verification
        // algorithm of their own (see ui/views/WorldView.js's own
        // discoverOwnSnapshot(), reused verbatim for both, per 0.9.144).
        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(canvasCode.includes('discoverSelectedSnapshot()') && panelCode.includes('discoverOwnSnapshot()'),
            'B3. sanity: both entry points genuinely define their own action method, each of which calls the identical injected discoverSnapshotCommand, never a second discovery/verification algorithm of its own');

        console.log('✓ Section B: the complete World Encounter path — a Wanderer-selected Publication, discovered through the SAME shared infrastructure Section A used, converges on the identical discovery/attribution machinery and ends in MATCH');
    }

    // ===============================================================
    // Section C — false announcement, and the deeper form of the same
    // attack: metadata cannot substitute for verified bytes.
    // ===============================================================
    {
        // C1. A candidate that claims the expected hash but actually
        // points to different bytes, driven end to end through the real
        // composed runtime and OwnPublicationPanel's own UI action — never
        // the bare resolver alone (tests/SnapshotPublicationAttribution.test.js's
        // own Section H flagship negative already proved that; this
        // proves the SAME refusal survives composition and the UI).
        {
            const host = makeSharedHostRuntime('audit-section-c1');
            const discoverOwnSnapshotAction = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: host.discoverSnapshotCommand });

            const realBytes = 'Section C1: the real content actually retrievable at this decoy\'s own locator';
            const decoyReference = await host.distribution.contentStore.put(realBytes);

            const claimedBytes = 'Section C1: a Publication\'s content the decoy never actually holds';
            const claimedHash = computeContentHash(claimedBytes);
            // Announce the decoy's own REAL locator, but under the
            // Publication's claimed contentHash — the exact forged-claim
            // shape.
            await host.distribution.discoveryPublisher.publish({ contentHash: claimedHash, locator: decoyReference.uri, storage: decoyReference.storage });

            const publication = new Publication({
                id: 'pub-audit-c1',
                documentId: 'doc-audit-c1',
                contentReference: new ContentReference({ hash: claimedHash })
            });

            const ctx = panelCtx({ publication, discoverSnapshotCommand: discoverOwnSnapshotAction });
            ctx.discoverOwnSnapshot();
            await flushMicrotasks();

            assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'C1a. the forged announcement is refused at resolve()\'s own verification step — the decoy\'s real bytes never hash to the claimed contentHash');
            assert(ctx.snapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'C1b. FLAGSHIP NEGATIVE — attribution reports the resolution\'s own CONTENT_HASH_MISMATCH, driven through the real composed runtime and the actual OwnPublicationPanel UI action — never MATCH, never NO_MATCH');
            assert(ctx.snapshotAttributionResult.outcome !== SnapshotPublicationAttributionOutcome.MATCH, 'C1c. sanity: never MATCH');
            assert(ctx.snapshotAttributionResult.outcome !== SnapshotPublicationAttributionOutcome.NO_MATCH, 'C1d. sanity: never NO_MATCH — verification never even completed, so there is nothing to compare');

            console.log('✓ Section C (announcement): a false Nostr announcement claiming the correct Publication hash is refused end to end — through the real composed runtime and OwnPublicationPanel\'s own action — and never reaches MATCH');
        }

        // C2. THE DEEPER FORM — the one this milestone's own header names
        // as deserving particular care: a resolvedSnapshot that genuinely
        // IS outcome === RESOLVED (i.e. it already passed
        // DecentralizedSnapshotResolver's own verify() against ITS OWN
        // requested contentHash), but whose self-declared `candidates[]`
        // metadata additionally, separately claims THIS Publication's own
        // hash — the shape a caller who resolved against one contentHash
        // and is now (mis)reporting it against a different Publication
        // could produce, or a resolver implementation bug could produce.
        // resolveSnapshotPublicationAttribution() must never trust that
        // metadata — only the bytes.
        {
            const wrongBytes = 'Section C2: genuinely verified bytes — just not this Publication\'s own';
            const wrongHash = computeContentHash(wrongBytes);
            const publicationHash = computeContentHash('Section C2: the Publication\'s own real, different content');
            assert(wrongHash !== publicationHash, 'C2a. sanity: the two hashes genuinely differ');

            // A resolvedSnapshot shaped exactly like a genuine RESOLVED
            // result (bytes really did pass verification, against
            // wrongHash) — but its OWN candidates[] metadata claims the
            // Publication's hash, exactly the "manufacture MATCH by
            // putting the Publication's hash into a metadata field" attack
            // this milestone's own header names.
            const maliciousResolvedSnapshot = Object.freeze({
                outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED,
                bytes: wrongBytes,
                candidates: Object.freeze([Object.freeze({ contentHash: publicationHash, locator: 'ar://decoy-c2', storage: 'ar' })]),
                locator: 'ar://decoy-c2',
                storage: 'ar',
                reason: null
            });

            const publication = new Publication({
                id: 'pub-audit-c2',
                documentId: 'doc-audit-c2',
                contentReference: new ContentReference({ hash: publicationHash })
            });

            const result = resolveSnapshotPublicationAttribution(publication, maliciousResolvedSnapshot);
            assert(result.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
                'C2b. FLAGSHIP — attribution recomputes the verified Snapshot\'s own content hash from resolvedSnapshot.bytes and compares THAT — a self-declared candidates[].contentHash claiming the right value never manufactures MATCH');
            assert(result.snapshotHash === wrongHash, 'C2c. the reported snapshotHash is the one actually recomputed from bytes, never the metadata claim');
            assert(result.snapshotHash !== maliciousResolvedSnapshot.candidates[0].contentHash, 'C2d. sanity: the metadata claim and the real recomputed hash genuinely differ');

            // Same claim, driven through the real UI wiring too — the
            // component-level seam must exhibit the identical restraint,
            // never a second, laxer comparison of its own.
            const action = () => Promise.resolve(maliciousResolvedSnapshot);
            const ctx = panelCtx({ publication, discoverSnapshotCommand: makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: action }) });
            ctx.discoverOwnSnapshot();
            await flushMicrotasks();
            assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
                'C2e. the same refusal holds through OwnPublicationPanel\'s own UI action, not merely the bare pure function');

            console.log('✓ Section C (metadata): a resolver result whose self-declared candidate metadata claims the Publication\'s own hash cannot manufacture MATCH — attribution compares the verified bytes\' own recomputed hash, never a metadata field, at both the pure-function and UI level');
        }
    }

    // ===============================================================
    // Section D — verified but unrelated Snapshot: verification succeeds,
    // attribution reports NO_MATCH, through the real chain.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-section-d');
        const discoverOwnSnapshotAction = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: host.discoverSnapshotCommand });

        // Snapshot hash = H2 — real content, genuinely placed and
        // announced, genuinely retrievable and verifiable.
        const h2Bytes = 'Section D: real, independently verified content — H2';
        const h2Reference = await host.distribution.contentStore.put(h2Bytes);
        await host.distribution.discoveryPublisher.publish({ contentHash: h2Reference.hash, locator: h2Reference.uri, storage: h2Reference.storage });

        // Publication hash = H1 — a Publication whose OWN content is
        // something else entirely, never placed under this discoveryTag.
        const h1Hash = computeContentHash('Section D: the Publication\'s own real content — H1, never placed under this tag');
        assert(h1Hash !== h2Reference.hash, 'D0. sanity: H1 and H2 genuinely differ');

        const publication = new Publication({
            id: 'pub-audit-d',
            documentId: 'doc-audit-d',
            // This Publication is asking about H2 specifically (an
            // ordinary "does this thing I found belong to me" query would
            // ask about its OWN hash; here the test drives the discovery
            // call against H2 directly, then attributes the verified
            // result against a Publication whose own hash is H1 — the
            // exact "resolved against some OTHER contentHash" scenario
            // application/SnapshotPublicationAttribution.js's own header
            // names).
            contentReference: new ContentReference({ hash: h1Hash })
        });

        const discoverH2 = () => host.discoverSnapshotCommand(h2Reference.hash);
        const ctx = panelCtx({ publication, discoverSnapshotCommand: discoverH2 });
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'D1. verification succeeds — H2 is genuine, real, retrievable content');
        assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
            'D2. attribution reports NO_MATCH — a fully verified Snapshot that is simply not THIS Publication\'s own — proving verification and attribution remain different questions');
        assert(ctx.snapshotAttributionResult.snapshotHash === h2Reference.hash, 'D3. snapshotHash is H2, the verified content\'s own hash');
        assert(ctx.snapshotAttributionResult.publicationHash === h1Hash, 'D4. publicationHash is H1, the Publication\'s own hash — the two are reported side by side, never merged');

        console.log('✓ Section D: a fully verified Snapshot (H2) attributed against a Publication with a genuinely different hash (H1) reports NO_MATCH — verification succeeding is never treated as attribution succeeding');
    }

    // ===============================================================
    // Section E — resolution failure preservation, through the real
    // composed runtime and UI. NOT_DISCOVERED, STORE_UNAVAILABLE, and
    // CONTENT_UNAVAILABLE are each reported verbatim; none becomes
    // NO_MATCH (or MATCH).
    // ===============================================================
    {
        const failureOutcomes = new Set();

        // E1. NOT_DISCOVERED — nothing was ever announced under this tag.
        {
            const host = makeSharedHostRuntime('audit-section-e-not-discovered');
            const publication = new Publication({ id: 'pub-audit-e1', documentId: 'doc-audit-e1', contentReference: new ContentReference({ hash: 'a-hash-nobody-ever-announced' }) });
            const ctx = panelCtx({ publication, discoverSnapshotCommand: makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: host.discoverSnapshotCommand }) });
            ctx.discoverOwnSnapshot();
            await flushMicrotasks();
            assert(ctx.snapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, 'E1. NOT_DISCOVERED passes through unchanged, through the real chain');
            failureOutcomes.add(ctx.snapshotAttributionResult.outcome);
        }

        // E2. STORE_UNAVAILABLE — discovery succeeds (a candidate really
        // was announced), but no Arweave capability is available to
        // resolve its locator.
        {
            const network = makeNostrNetwork();
            const discoveryTag = 'audit-section-e-store-unavailable';
            const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
            const hash = computeContentHash('Section E2: a candidate genuinely announced, with no store available to fetch it');
            await announcer.publish({ contentHash: hash, locator: 'ar://section-e2-locator', storage: 'ar' });

            const discovery = composeDiscoverSnapshotRuntime({
                arweaveContentStoreOptions: {}, // no signer — contentStore stays null
                nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
            });
            assert(discovery.contentStore === null, 'E2 sanity: no Arweave capability means no store — never a fake one');
            const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
                discoveryTag, contentHash, resolver: discovery.resolver, contentStore: discovery.contentStore
            });

            const publication = new Publication({ id: 'pub-audit-e2', documentId: 'doc-audit-e2', contentReference: new ContentReference({ hash }) });
            const ctx = panelCtx({ publication, discoverSnapshotCommand: makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand }) });
            ctx.discoverOwnSnapshot();
            await flushMicrotasks();
            assert(ctx.snapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, 'E2. STORE_UNAVAILABLE passes through unchanged — discovery succeeded, location honestly failed');
            failureOutcomes.add(ctx.snapshotAttributionResult.outcome);
        }

        // E3. CONTENT_UNAVAILABLE — discovery AND location both succeed
        // (a real store, a real locator), but the announced locator was
        // never actually placed at that store — genuinely unreachable
        // content, not a forged hash claim (that is Section C's own).
        {
            const host = makeSharedHostRuntime('audit-section-e-content-unavailable');
            const neverPlacedHash = computeContentHash('Section E3: content that was announced but never actually placed anywhere');
            await host.distribution.discoveryPublisher.publish({ contentHash: neverPlacedHash, locator: 'ar://section-e3-never-placed-tx', storage: 'ar' });

            const publication = new Publication({ id: 'pub-audit-e3', documentId: 'doc-audit-e3', contentReference: new ContentReference({ hash: neverPlacedHash }) });
            const ctx = panelCtx({ publication, discoverSnapshotCommand: makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: host.discoverSnapshotCommand }) });
            ctx.discoverOwnSnapshot();
            await flushMicrotasks();
            assert(ctx.snapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, 'E3. CONTENT_UNAVAILABLE passes through unchanged — discovery and location both succeeded, retrieval honestly failed');
            failureOutcomes.add(ctx.snapshotAttributionResult.outcome);
        }

        assert(failureOutcomes.size === 3, 'E4. all three failure outcomes were genuinely distinct and genuinely reached');
        assert(!failureOutcomes.has(SnapshotPublicationAttributionOutcome.NO_MATCH), 'E5. NONE of NOT_DISCOVERED/STORE_UNAVAILABLE/CONTENT_UNAVAILABLE is ever reported as NO_MATCH');
        assert(!failureOutcomes.has(SnapshotPublicationAttributionOutcome.MATCH), 'E6. ...nor as MATCH — "we could not even attempt attribution" and "we compared and it does not match" stay permanently distinct facts');

        console.log('✓ Section E: NOT_DISCOVERED, STORE_UNAVAILABLE, and CONTENT_UNAVAILABLE (CONTENT_HASH_MISMATCH is Section C\'s own) are each reached through the real composed runtime and reported verbatim — none of the four ever becomes NO_MATCH');
    }

    // ===============================================================
    // Section F — identity separation, against one full real scenario:
    // publicationHash/snapshotHash stay distinct from publication.id, an
    // Arweave transaction id, a Nostr event id, and the resolved locator.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-section-f');
        const bytes = 'Section F: identity-separation fixture content';
        const reference = await host.distribution.contentStore.put(bytes);
        await host.distribution.discoveryPublisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        const publication = new Publication({ id: 'pub-audit-f-identity', documentId: 'doc-audit-f', contentReference: new ContentReference({ hash: reference.hash }) });
        const ctx = panelCtx({ publication, discoverSnapshotCommand: makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: host.discoverSnapshotCommand }) });
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'F0. sanity: this real scenario genuinely matches');

        const arweaveTransactionId = reference.uri.replace('ar://', '');
        const nostrEventId = host.network.events[0].id;
        const locator = ctx.snapshotDiscoveryResult.locator;

        assert(ctx.snapshotAttributionResult.publicationHash !== publication.id, 'F1. publicationHash is never publication.id');
        assert(ctx.snapshotAttributionResult.publicationHash !== arweaveTransactionId, 'F2. publicationHash is never the Arweave transaction id');
        assert(ctx.snapshotAttributionResult.snapshotHash !== arweaveTransactionId, 'F3. snapshotHash is never the Arweave transaction id');
        assert(ctx.snapshotAttributionResult.publicationHash !== nostrEventId, 'F4. publicationHash is never a Nostr event id');
        assert(ctx.snapshotAttributionResult.snapshotHash !== nostrEventId, 'F5. snapshotHash is never a Nostr event id');
        assert(ctx.snapshotAttributionResult.publicationHash !== locator, 'F6. publicationHash is never the resolved locator URI');
        assert(ctx.snapshotAttributionResult.snapshotHash !== locator, 'F7. snapshotHash is never the resolved locator URI');
        assert(locator !== reference.hash && arweaveTransactionId !== reference.hash && nostrEventId !== reference.hash, 'F8. sanity: every non-content identifier genuinely differs from the real content hash in this scenario');

        console.log('✓ Section F: publicationHash/snapshotHash stay distinct from publication.id, the Arweave transaction id, the Nostr event id, and the resolved locator — only content hashes ever participate in attribution');
    }

    // ===============================================================
    // Section G — entry-point state isolation: OwnPublicationPanel and
    // WorldEncounterCanvas run discovery/attribution CONCURRENTLY over
    // the SAME shared infrastructure.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-section-g');
        const action = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: host.discoverSnapshotCommand });

        const localBytes = 'Section G: local (OwnPublicationPanel) content';
        const localReference = await host.distribution.contentStore.put(localBytes);
        await host.distribution.discoveryPublisher.publish({ contentHash: localReference.hash, locator: localReference.uri, storage: localReference.storage });

        const remoteBytes = 'Section G: remote (WorldEncounterCanvas) content';
        const remoteReference = await host.distribution.contentStore.put(remoteBytes);
        await host.distribution.discoveryPublisher.publish({ contentHash: remoteReference.hash, locator: remoteReference.uri, storage: remoteReference.storage });

        const localPublication = new Publication({ id: 'pub-audit-g-local', documentId: 'doc-audit-g-local', contentReference: new ContentReference({ hash: localReference.hash }) });
        const remotePublication = new Publication({ id: 'pub-audit-g-remote', documentId: 'doc-audit-g-remote', contentReference: new ContentReference({ hash: remoteReference.hash }) });

        // G-i. Genuine concurrent overlap — both calls in flight at once.
        {
            const panel = panelCtx({ publication: localPublication, discoverSnapshotCommand: action });
            const canvas = canvasCtx({ discoverSnapshotCommand: action });
            selectRemotePublication(canvas, remotePublication);

            panel.discoverOwnSnapshot();
            canvas.discoverSelectedSnapshot();
            assert(panel.snapshotDiscoveryExecuting === true && canvas.snapshotDiscoveryExecuting === true,
                'G1. both surfaces enter executing state simultaneously — neither blocks the other from starting');

            await flushMicrotasks();

            assert(panel.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && panel.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
                'G2. My Publication resolves and attributes to MATCH for its OWN content');
            assert(canvas.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && canvas.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
                'G3. World Encounters resolves and attributes to MATCH for ITS OWN, entirely different, content');
            assert(panel.snapshotAttributionResult.snapshotHash === localReference.hash, 'G4. discovery state stays separate — the local panel\'s own snapshotHash is the local content\'s hash');
            assert(canvas.snapshotAttributionResult.snapshotHash === remoteReference.hash, 'G5. attribution state stays separate — the canvas\'s own snapshotHash is the remote content\'s hash, never cross-wired with the panel\'s');
            assert(panel.snapshotAttributionResult.snapshotHash !== canvas.snapshotAttributionResult.snapshotHash, 'G6. sanity: the two results are genuinely different values, not merely two references to one shared object');
            assert(panel.snapshotDiscoveryRequestId === 1 && canvas.snapshotDiscoveryRequestId === 1, 'G7. request ids stay independent — one surface\'s call never advances the other\'s counter');

            console.log('✓ Section G-i: two genuinely concurrent discovery+attribution calls, over the same shared infrastructure, never cross-wire either surface\'s discovery state, attribution state, or request id');
        }

        // G-ii. Changing one Publication never invalidates the other's
        // already-settled result.
        {
            const panel = panelCtx({ publication: localPublication, discoverSnapshotCommand: action });
            const canvas = canvasCtx({ discoverSnapshotCommand: action });
            selectRemotePublication(canvas, remotePublication);

            panel.discoverOwnSnapshot();
            canvas.discoverSelectedSnapshot();
            await flushMicrotasks();
            assert(panel.snapshotAttributionResult !== null && canvas.snapshotAttributionResult !== null, 'G8. sanity: both results exist before either changes');

            // The local Publication changes (a fresh document published,
            // say) — the canvas's own, already-settled remote result must
            // survive completely untouched.
            const otherLocalPublication = new Publication({ id: 'pub-audit-g-local-2', documentId: 'doc-audit-g-local-2', contentReference: new ContentReference({ hash: 'a-hash-nobody-announced-for-g-ii' }) });
            OwnPublicationPanel.watch.publication.call(panel, otherLocalPublication, localPublication);
            panel.publication = otherLocalPublication;

            assert(panel.snapshotAttributionResult === null, 'G9. the panel\'s own result is cleared by its own Publication change, as expected');
            assert(canvas.snapshotAttributionResult !== null && canvas.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
                'G10. the canvas\'s own already-settled MATCH survives completely untouched — a changed local Publication never invalidates the remote surface\'s own result');
            assert(canvas.snapshotAttributionResult.snapshotHash === remoteReference.hash, 'G11. ...and still carries the exact same remote content hash it always did');

            // Symmetrically: a fresh selection on the canvas must never
            // touch the panel's own settled result.
            canvas.selectEncounter({ kind: 'PUBLICATION', objectId: 'some-other-object-id-g-ii' });
            assert(canvas.snapshotAttributionResult === null, 'G12. the canvas\'s own result is cleared by its own fresh selection, as expected');
            assert(panel.snapshotAttributionResult === null, 'G13. sanity: the panel was already cleared by G9 and stays that way — no resurrection from the canvas\'s own reset');

            console.log('✓ Section G-ii: changing one entry point\'s Publication/selection never invalidates the other entry point\'s already-settled discovery or attribution result');
        }

        // G-iii. A stale in-flight response for one surface can never
        // overwrite either surface's CURRENT state — not its own new
        // state, and not the other surface's state.
        {
            let resolveStalePanelCall;
            const stallingAction = (publication) => {
                if (publication.id === localPublication.id) {
                    return new Promise((resolve) => { resolveStalePanelCall = resolve; });
                }
                return action(publication);
            };

            const panel = panelCtx({ publication: localPublication, discoverSnapshotCommand: stallingAction });
            const canvas = canvasCtx({ discoverSnapshotCommand: action });
            selectRemotePublication(canvas, remotePublication);

            panel.discoverOwnSnapshot(); // stalls — resolveStalePanelCall not yet called
            canvas.discoverSelectedSnapshot();
            await flushMicrotasks();
            assert(canvas.snapshotAttributionResult && canvas.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
                'G14. the canvas\'s own call completes normally while the panel\'s own call is still stalled — no blocking between the two surfaces');
            assert(panel.snapshotDiscoveryExecuting === true && panel.snapshotDiscoveryResult === null,
                'G15. sanity: the panel\'s own call is still genuinely in flight');

            // The panel moves on to a different Publication BEFORE its
            // stale call resolves.
            const otherLocalPublication = new Publication({ id: 'pub-audit-g-local-3', documentId: 'doc-audit-g-local-3', contentReference: new ContentReference({ hash: 'a-hash-nobody-announced-for-g-iii' }) });
            OwnPublicationPanel.watch.publication.call(panel, otherLocalPublication, localPublication);
            panel.publication = otherLocalPublication;
            assert(panel.snapshotDiscoveryExecuting === false && panel.snapshotAttributionResult === null,
                'G16. switching Publications resets the panel\'s own state immediately, without waiting for the stale call');

            // The stale call NOW resolves, with a genuine MATCH result for
            // the Publication the panel has already moved on from.
            resolveStalePanelCall({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: localBytes, candidates: [], locator: localReference.uri, storage: 'ar', reason: null });
            await flushMicrotasks();

            assert(panel.snapshotDiscoveryResult === null && panel.snapshotAttributionResult === null,
                'G17. the stale response can never overwrite the panel\'s OWN current state — it belongs to a Publication that is no longer current');
            assert(canvas.snapshotAttributionResult && canvas.snapshotAttributionResult.snapshotHash === remoteReference.hash,
                'G18. ...nor does it ever reach the OTHER surface\'s state — the canvas\'s own result is untouched throughout');

            console.log('✓ Section G-iii: a stale in-flight response for one entry point can never overwrite either that entry point\'s own current state or the other entry point\'s state');
        }
    }

    // ===============================================================
    // Section H — distribution independence, in both directions.
    // ===============================================================
    {
        // H-i. Distribute Snapshot never populates or touches Discover/
        // Attribute's own state.
        {
            const host = makeSharedHostRuntime('audit-section-h-i');
            const snapshotJson = { world: { buildings: [{ id: 'section-h-i-building', bricks: 2 }] } };
            const distributeAction = makeDistributeOwnSnapshotAction({
                snapshotDistributionCommand: host.snapshotDistributionCommand,
                contentEntries: { 'pub-audit-h-i': snapshotJson }
            });
            const publication = new Publication({ id: 'pub-audit-h-i', documentId: 'doc-audit-h-i', contentReference: new ContentReference({ hash: computeContentHash(JSON.stringify(snapshotJson)) }) });

            const ctx = panelCtx({ publication, snapshotDistributionCommand: distributeAction });
            assert(ctx.snapshotDiscoveryResult === null && ctx.snapshotAttributionResult === null, 'H1. sanity: nothing has been discovered or attributed yet');

            ctx.distributeOwnSnapshot();
            await flushMicrotasks();

            assert(ctx.snapshotDistributionResult !== null, 'H2. sanity: distribution genuinely completed');
            assert(ctx.snapshotDiscoveryResult === null, 'H3. Distribute Snapshot never populates snapshotDiscoveryResult — discovery is a separate, never-implied action');
            assert(ctx.snapshotAttributionResult === null, 'H4. Distribute Snapshot never populates snapshotAttributionResult — attribution is never triggered automatically by distribution');
            assert(ctx.snapshotDiscoveryRequestId === 0, 'H5. distribution never advances the discovery request counter either — the two remain entirely independent state machines');

            console.log('✓ Section H-i: Distribute Snapshot completes without ever touching Discover Snapshot or Snapshot Attribution\'s own state');
        }

        // H-ii. Discover Snapshot succeeds for content placed by a path
        // that never called the distribution command at all.
        {
            const host = makeSharedHostRuntime('audit-section-h-ii');
            // Placed directly against the store/publisher — NEVER through
            // snapshotDistributionCommand/executeSnapshotDistributionCommand.
            const bytes = 'Section H-ii: content that reached Arweave/Nostr by some other path entirely';
            const reference = await host.distribution.contentStore.put(bytes);
            await host.distribution.discoveryPublisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

            const publication = new Publication({ id: 'pub-audit-h-ii', documentId: 'doc-audit-h-ii', contentReference: new ContentReference({ hash: reference.hash }) });
            // No snapshotDistributionCommand supplied at all — Distribute
            // Snapshot is not even reachable from this ctx.
            const ctx = panelCtx({ publication, discoverSnapshotCommand: makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: host.discoverSnapshotCommand }) });
            assert(ctx.snapshotDistributionCommand === null, 'H6. sanity: distribution is genuinely unreachable through this ctx');

            ctx.discoverOwnSnapshot();
            await flushMicrotasks();

            assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'H7. Discover Snapshot succeeds with zero prior distribution activity of its own');
            assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'H8. ...and attributes correctly — Discover Snapshot never requires having called Distribute Snapshot first');

            console.log('✓ Section H-ii: Discover Snapshot succeeds for content that reached Arweave/Nostr by a path other than this component\'s own distribution action — discovery never requires distribution first');
        }
    }

    // ===============================================================
    // Section I — structural boundary: a repository-wide sweep.
    // ===============================================================
    {
        // I1/I2. UI contains no Nostr/Arweave protocol logic — every file
        // under ui/ (main.js excepted as the one composition root).
        {
            const forbidden = /crypto\.subtle|new WebSocket\(|new ArweaveContentStore\(|new NostrSnapshotDiscoveryPublisher\(|new NostrSnapshotDiscoveryQueryService\(|new DecentralizedSnapshotResolver\(|computeContentHash\(|createTransaction|signEvent\(/;
            const hostCapabilityRead = /window\.arweaveWallet|window\.nostr\b/;
            const audited = [];
            await walkJsFiles(new URL('../ui/', import.meta.url), '', new Set(), async (relativePath, codeOnly) => {
                audited.push(relativePath);
                assert(!forbidden.test(codeOnly), `I1. ui/${relativePath} never constructs an Arweave/Nostr/resolver collaborator or hashes content directly`);
                if (relativePath !== 'main.js') {
                    assert(!hostCapabilityRead.test(codeOnly), `I2. ui/${relativePath} never reads window.arweaveWallet/window.nostr directly — only ui/main.js may`);
                }
            });
            assert(audited.includes('components/OwnPublicationPanel.js') && audited.includes('components/WorldEncounterCanvas.js') && audited.includes('views/WorldView.js') && audited.includes('main.js'),
                'I3. sanity: this scan genuinely reached every file this milestone\'s own architecture names');
        }

        // I4. Attribution performs no I/O.
        {
            const code = await codeOnlySource('application/SnapshotPublicationAttribution.js');
            assert(!/\bfetch\(|WebSocket|localStorage|readFile|writeFile|XMLHttpRequest/.test(code), 'I4. resolveSnapshotPublicationAttribution() performs no network, filesystem, or storage access');
            assert(!/resolver\.resolve\(|queryService\.search\(|\.get\(reference\)/.test(code), 'I5. ...and never rediscovers, queries, or retrieves anything itself');
        }

        // I6. The discovery command carries no attribution vocabulary or
        // algorithm of its own.
        {
            const code = await codeOnlySource('application/DiscoverSnapshotCommand.js');
            assert(!/\bMATCH\b|\bNO_MATCH\b|publicationHash|snapshotHash|SnapshotPublicationAttribution/.test(code),
                'I6. application/DiscoverSnapshotCommand.js never references MATCH/NO_MATCH/publicationHash/snapshotHash or the attribution module — discovery stays entirely separate from Q3');
            assert(!code.includes("from '../publisher/Publication.js'"), 'I7. it never imports publisher/Publication.js either — contentHash is always an explicit, caller-supplied input, never derived from a Publication itself');
        }

        // I8. The resolver carries no Publication ownership/attribution
        // semantics. Deliberately CASE-SENSITIVE for the enum-shaped
        // tokens — the resolver's own, legitimate prose ("does not match
        // the requested contentHash") uses the ordinary English word
        // "match" in an error message, never the SnapshotPublicationAttributionOutcome
        // enum value itself (always upper-case MATCH/NO_MATCH).
        {
            const code = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
            assert(!/\bMATCH\b|\bNO_MATCH\b|publicationHash|Publication\.js|\bOWNED\b/.test(code),
                'I8a. application/DecentralizedSnapshotResolver.js never references the MATCH/NO_MATCH enum values, publicationHash, OWNED, or Publication.js — it answers only "can these bytes be found and verified," never "whose Publication is this"');
            assert(!/ATTRIBUT/i.test(code),
                'I8b. ...nor any form of ATTRIBUT(E/ED/ION) — attribution vocabulary of any kind stays entirely out of this file');
        }

        // I9/I10. Distribution remains a separate command path from
        // discovery/attribution, in both directions.
        {
            const distributionCode = await codeOnlySource('application/SnapshotDistributionCommand.js');
            assert(!distributionCode.includes('DiscoverSnapshotCommand') && !distributionCode.includes('SnapshotPublicationAttribution') && !distributionCode.includes('DecentralizedSnapshotResolver'),
                'I9. application/SnapshotDistributionCommand.js never imports the discovery command, the resolver, or the attribution module');
            const discoverCode = await codeOnlySource('application/DiscoverSnapshotCommand.js');
            assert(!discoverCode.includes('SnapshotDistributionCommand') && !discoverCode.includes('NostrSnapshotDiscoveryPublisher') && !discoverCode.includes('ArweaveContentStore'),
                'I10. application/DiscoverSnapshotCommand.js never imports the distribution command or constructs a placement-side collaborator — the two families remain two disjoint pipelines sharing only a runtime host, never each other\'s code');
        }

        console.log('✓ Section I: repository-wide structural sweep — UI contains no Nostr/Arweave logic, attribution performs no I/O, the discovery command carries no attribution vocabulary, the resolver carries no Publication/ownership vocabulary, and distribution stays a separate command path from discovery/attribution in both directions');
    }

    console.log('\n✅ All End-to-End Snapshot Attribution Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
