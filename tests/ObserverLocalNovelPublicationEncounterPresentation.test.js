import { AutomaticSnapshotEncounterCascade } from '../application/snapshot/AutomaticSnapshotEncounterCascade.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { StoreSnapshotContentOutcome } from '../application/snapshot/materialization/StoreSnapshotContentOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/snapshot/placement/SnapshotWorldRegistrationOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/snapshot/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/worldEncounter/ObserverLocalEncounterStore.js';
import { describeObserverLocalPublicationEncounter, ObserverLocalPublicationEncounterKind } from '../core/ObserverLocalPublicationEncounter.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.552 — Observer-Local Novel Publication Encounter Presentation.
//
// TYPE: production implementation milestone. New files: core/
// ObserverLocalPublicationEncounter.js, application/worldEncounter/ObserverLocalEncounterStore.js.
// Modified: application/snapshot/AutomaticSnapshotEncounterCascade.js (an additive
// `encounter` field on an UNPLACED result, and an optional, newly-injected
// `resolveEncounterPosition` collaborator — see that file's own "0.9.552"
// header section), ui/views/WorldView.js (composition), ui/components/
// WorldEncounterCanvas.js (rendering).
//
// 0.9.551's own audit named exactly one product gap: a Wanderer's own
// walking drives a genuinely novel Publication all the way through real
// discovery, resolution, content-hash verification, and materialization,
// and the pipeline then deliberately stops at
// SnapshotWorldPlacementOutcome.UNPLACED with nothing presented to the
// person who triggered it. This milestone closes that gap with the
// narrowest mechanism 0.9.551's own Section E named as viable — an
// observer-local encounter, scoped to the Wanderer who discovered it,
// backed by the Wanderer's OWN encounter position, never the publisher's
// claimedPosition, and never a PlacementRecord.
//
// This file verifies the milestone's own acceptance criteria A-J, letter
// for letter, against the real, unmodified production cascade, store, and
// descriptor — the SAME real-machinery harness (in-memory Nostr relay,
// in-memory Arweave gateway/signer, real LocalContentStore) 0.9.551's own
// audit and 0.9.191-0.9.194's own e2e guards already established.

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
        return { id: `fake-tx-${counter}`, transaction: { id: `fake-tx-${counter}`, data: material } };
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

function makeHost(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });

    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

    const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
    const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);

    let resolveCallCount = 0;
    let materializeCallCount = 0;
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService: queryService });
    const resolveSelectedSnapshotCommand = (candidate) => {
        resolveCallCount += 1;
        return executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore });
    };
    const materializeSelectedSnapshotCommand = (resolution) => {
        materializeCallCount += 1;
        return executeMaterializeSelectedSnapshotCommand({ resolution, materializer });
    };

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        localContentStore,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand,
        callCounts: () => ({ resolve: resolveCallCount, materialize: materializeCallCount })
    };
}

async function placeAndAnnounce(host, bytes, { publicationId = undefined, claimedPosition = undefined } = {}) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId, claimedPosition });
    return reference;
}

function makeWorldModel() {
    const publications = new Map();
    const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
    return {
        publications,
        placementRegistry,
        knowPublication(publication) { publications.set(publication.id, publication); },
        placeAt(publicationId, position, owner = 'alice') {
            placementRegistry.add(new PlacementRecord({ publicationId, position, owner }));
        },
        resolvePlacementInfo: (publicationId) => {
            const records = placementRegistry.findByPublicationId(publicationId);
            if (records.length === 0) return null;
            const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
            return { placementId: record.placementId, publicationId: record.publicationId, position: { x: record.position.x, y: record.position.y, z: record.position.z } };
        },
        findPublicationById: (publicationId) => publications.get(publicationId) || null
    };
}

function makeCascade(host, worldModel, registry, { resolveEncounterPosition = null } = {}) {
    return new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry: registry,
        resolvePlacementInfo: worldModel.resolvePlacementInfo,
        findPublicationById: worldModel.findPublicationById,
        resolveEncounterPosition
    });
}

async function runTests() {
    console.log('Running Observer-Local Novel Publication Encounter Presentation tests...\n');

    // ===============================================================
    // Section A — Novel verified material becomes visible.
    // ===============================================================
    {
        const host = makeHost('0.9.552-section-a');
        const publicationId = 'unknown-publisher-pub-a';
        const claimedPosition = { x: 4200, y: 0, z: 4200 };
        const wandererPosition = { x: 12, y: 0, z: -7 };

        const reference = await placeAndAnnounce(host, 'novel-bytes-a', { publicationId, claimedPosition });
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => wandererPosition });

        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);

        assert(result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, `A1. Unknown publisher, no authoritative placement: cascade stops at UNPLACED (got ${result.outcome}).`);
        assert(result.encounter !== null, 'A2. An encounter presentation IS produced for genuinely novel, verified, materialized content.');
        assert(result.encounter.kind === ObserverLocalPublicationEncounterKind.OBSERVER_LOCAL_PUBLICATION_ENCOUNTER, 'A3. The encounter carries its own, distinct kind.');
        assert(result.encounter.publicationId === publicationId, 'A4. The encounter names the correct publicationId.');
        assert(result.encounter.contentHash === reference.hash, 'A5. The encounter names the correct contentHash.');

        store.record(result.encounter);
        assert(store.list().length === 1, 'A6. The described encounter reaches a session-scoped store when a caller records it.');
        console.log('✓ A — a novel, verified, materialized publication with no authoritative placement produces an encounter presentation.');
    }

    // ===============================================================
    // Section B — Existing placement path remains identical.
    // ===============================================================
    {
        const host = makeHost('0.9.552-section-b');
        const publicationId = 'placed-pub-b';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(3, 0, 3));
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'B', contentReference: new ContentReference({ hash: 'placeholder' }) }));
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 99, y: 0, z: 99 }) });

        const reference = await host.contentStore.put('placed-bytes-b');
        const candidate = { contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId };
        const result = await cascade.processCandidate(candidate);

        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `B1. An authoritatively-placed Publication still reaches REGISTERED unchanged (got ${result.outcome}).`);
        assert(result.encounter === null, 'B2. A REGISTERED result never carries an encounter — the existing placement path is byte-for-byte unaffected by 0.9.552.');
        if (result.encounter) store.record(result.encounter);
        assert(store.list().length === 0, 'B3. Nothing is ever recorded into the observer-local store for an already-authoritative placement.');
        console.log('✓ B — the existing authoritative placement path (REGISTERED) is completely unaffected: no encounter field, no observer-local recording.');
    }

    // ===============================================================
    // Section C — No persistent placement mutation.
    // ===============================================================
    {
        const host = makeHost('0.9.552-section-c');
        const publicationId = 'novel-pub-c';
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 1, y: 0, z: 1 }) });

        await placeAndAnnounce(host, 'novel-bytes-c', { publicationId, claimedPosition: { x: 10, y: 0, z: 10 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);

        assert(result.encounter !== null, 'C0. Sanity: an encounter was produced.');
        assert(worldModel.placementRegistry.findByPublicationId(publicationId).length === 0,
            'C1. placementRegistry carries no PlacementRecord for this publicationId after the encounter — an observer-local encounter never creates one.');
        assert(worldModel.resolvePlacementInfo(publicationId) === null, 'C2. resolvePlacementInfo still reports no authoritative placement — a second call to the SAME cascade instance would still stop at UNPLACED, never REGISTERED.');
        console.log('✓ C — encountering novel content creates no PlacementRecord and mutates no placement registry.');
    }

    // ===============================================================
    // Section D — claimedPosition is non-authoritative.
    // ===============================================================
    {
        const host = makeHost('0.9.552-section-d');
        const publicationId = 'malicious-claim-pub-d';
        const maliciousClaim = { x: 999999, y: 0, z: 999999 };
        const wandererPosition = { x: 8, y: 0, z: 8 };
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => wandererPosition });

        await placeAndAnnounce(host, 'novel-bytes-d', { publicationId, claimedPosition: maliciousClaim });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        assert(candidate.claimedPosition.x === 999999, 'D0. Sanity: the discovered candidate really does carry the malicious claim.');
        const result = await cascade.processCandidate(candidate);

        assert(result.encounter !== null, 'D1. An encounter is still produced despite the malicious claim.');
        assert(result.encounter.position.x === wandererPosition.x && result.encounter.position.z === wandererPosition.z,
            `D2. The encounter's own position is the Wanderer's real encounter position (${wandererPosition.x},${wandererPosition.z}), never the malicious claim (got ${result.encounter.position.x},${result.encounter.position.z}).`);
        assert(worldModel.placementRegistry.findByPublicationId(publicationId).length === 0,
            'D3. No PlacementRecord was created at the malicious claimed coordinate (or anywhere else).');
        console.log('✓ D — an adversarial, arbitrarily distant claimedPosition never reaches the encounter\'s own position, and never causes a persistent placement anywhere.');
    }

    // ===============================================================
    // Section E — Encounter position is retained (the Wanderer's own,
    // never a second/duplicate position representation).
    // ===============================================================
    {
        const encounter = describeObserverLocalPublicationEncounter({
            publicationId: 'pub-e', contentHash: 'hash-e', encounterPosition: { x: 5, y: 1, z: -2 }
        });
        assert(encounter !== null, 'E1. A well-formed call produces an encounter.');
        assert(encounter.position.x === 5 && encounter.position.y === 1 && encounter.position.z === -2, 'E2. The encounter position is exactly the supplied encounterPosition.');
        const keys = Object.keys(encounter).sort();
        assert(keys.join(',') === ['contentHash', 'kind', 'position', 'publicationId'].sort().join(','),
            `E3. The encounter carries exactly one position field ("position") — no second/duplicate position representation of any kind (got keys: ${keys.join(',')}).`);
        assert(Object.isFrozen(encounter) && Object.isFrozen(encounter.position), 'E4. Both the encounter and its own position are frozen — never later mutated in place.');
        console.log('✓ E — the encounter carries exactly one position field, the Wanderer\'s own supplied encounterPosition, with no second position representation.');
    }

    // ===============================================================
    // Section F — Publication identity remains exact.
    // ===============================================================
    {
        const host = makeHost('0.9.552-section-f');
        const publicationId = 'exact-identity-pub-f';
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 2, y: 0, z: 2 }) });

        const reference = await placeAndAnnounce(host, 'novel-bytes-f', { publicationId, claimedPosition: { x: 77, y: 0, z: 77 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);

        assert(result.encounter.publicationId === publicationId, 'F1. publicationId is retained exactly.');
        assert(result.encounter.contentHash === reference.hash, 'F2. contentHash is retained exactly.');
        assert(!('documentId' in result.encounter), 'F3. No documentId field is ever substituted for publication identity.');
        assert(!('locator' in result.encounter), 'F4. No locator field is ever substituted for publication identity.');
        assert(!('claimedPosition' in result.encounter), 'F5. claimedPosition never appears on the encounter itself.');
        console.log('✓ F — publication identity on the encounter is exactly { publicationId, contentHash } — never a documentId, a locator, or claimedPosition standing in for it.');
    }

    // ===============================================================
    // Section G — Content verification remains mandatory.
    // ===============================================================
    {
        // G1. A forged contentHash never reaches the encounter step at all
        // — verification fails first, exactly as it already does for
        // ordinary placement (0.9.551 Section G's own precedent).
        const host = makeHost('0.9.552-section-g');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 0, y: 0, z: 0 }) });

        const realReference = await placeAndAnnounce(host, 'real-bytes-g', { publicationId: 'victim-pub-g', claimedPosition: { x: 1, y: 0, z: 1 } });
        const forgedCandidate = {
            contentHash: 'forged-hash-never-verifies',
            locator: realReference.uri,
            storage: realReference.storage,
            publicationId: 'victim-pub-g',
            claimedPosition: { x: 2, y: 0, z: 2 }
        };
        const forgedResult = await cascade.processCandidate(forgedCandidate);
        assert(forgedResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            `G1. A forged contentHash is rejected at verification, never reaching UNPLACED/encounter at all (got ${forgedResult.outcome}).`);
        assert(forgedResult.encounter === null, 'G2. No encounter is ever produced for content that never verified.');

        // G3. A materialization failure (no materialize command configured)
        // never produces an encounter either — AVAILABLE + VERIFIED remains
        // a hard precondition, never weakened by this milestone.
        const host2 = makeHost('0.9.552-section-g2');
        const worldModel2 = makeWorldModel();
        const registry2 = new WorldDiscoverySourceRegistry();
        const brokenCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: host2.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: null,
            worldDiscoverySourceRegistry: registry2,
            resolvePlacementInfo: worldModel2.resolvePlacementInfo,
            findPublicationById: worldModel2.findPublicationById,
            resolveEncounterPosition: () => ({ x: 0, y: 0, z: 0 })
        });
        await placeAndAnnounce(host2, 'novel-bytes-g2', { publicationId: 'novel-pub-g2', claimedPosition: { x: 3, y: 0, z: 3 } });
        const [candidate2] = await host2.discoverSnapshotCandidatesCommand();
        const result2 = await brokenCascade.processCandidate(candidate2);
        assert(result2.outcome === 'ineligible', `G3. No materialize command configured: INELIGIBLE, never an encounter (got ${result2.outcome}).`);
        assert(result2.encounter === null, 'G4. INELIGIBLE never carries an encounter.');
        console.log('✓ G — a merely-downloaded/unverified publication never becomes visible through this new path; AVAILABLE + VERIFIED remains mandatory.');
    }

    // ===============================================================
    // Section H — Cross-Wanderer isolation.
    // ===============================================================
    {
        const host = makeHost('0.9.552-section-h');
        const publicationId = 'shared-novel-pub-h';
        await placeAndAnnounce(host, 'novel-bytes-h', { publicationId, claimedPosition: { x: 40, y: 0, z: 40 } });

        // Wanderer A: own worldModel/registry/cascade/store — the same
        // "fresh instance per WorldView mount" shape ui/views/WorldView.js
        // itself uses.
        const worldModelA = makeWorldModel();
        const registryA = new WorldDiscoverySourceRegistry();
        const storeA = new ObserverLocalEncounterStore();
        const cascadeA = makeCascade(host, worldModelA, registryA, { resolveEncounterPosition: () => ({ x: 1, y: 0, z: 1 }) });

        const [candidateForA] = await host.discoverSnapshotCandidatesCommand();
        const resultA = await cascadeA.processCandidate(candidateForA);
        assert(resultA.encounter !== null, 'H0. Sanity: Wanderer A\'s own cascade produced an encounter.');
        storeA.record(resultA.encounter);
        assert(storeA.list().length === 1, 'H1. Wanderer A sees the novel publication in their own store.');

        // Wanderer B: an entirely separate worldModel/registry/cascade/
        // store — never handed candidateForA, and never sharing storeA,
        // registryA, or cascadeA with anything above.
        const storeB = new ObserverLocalEncounterStore();
        assert(storeB.list().length === 0, 'H2. Wanderer B\'s own, independent store starts empty and never automatically receives Wanderer A\'s recorded encounter — there is no shared object between them.');
        assert(storeA !== storeB, 'H3. The two stores are genuinely separate instances, not merely separately-named references to the same one.');

        // B only ever sees it if B's OWN cascade independently discovers/
        // verifies/materializes/records it too.
        const worldModelB = makeWorldModel();
        const registryB = new WorldDiscoverySourceRegistry();
        const cascadeB = makeCascade(host, worldModelB, registryB, { resolveEncounterPosition: () => ({ x: 2, y: 0, z: 2 }) });
        const [candidateForB] = await host.discoverSnapshotCandidatesCommand();
        const resultB = await cascadeB.processCandidate(candidateForB);
        storeB.record(resultB.encounter);
        assert(storeB.list().length === 1, 'H4. Wanderer B sees it too, but only after their own independent encounter/discovery — never as a side effect of A\'s.');
        assert(storeB.list()[0].position.x === 2 && storeA.list()[0].position.x === 1,
            'H5. Each Wanderer\'s own recorded encounter carries THEIR OWN encounter position — the two are not merged, averaged, or reconciled in any way.');
        console.log('✓ H — cross-Wanderer isolation holds: one Wanderer\'s observer-local encounter is never automatically visible to another; each store is a genuinely separate, session-scoped instance.');
    }

    // ===============================================================
    // Section I — Failure isolation.
    // ===============================================================
    {
        // I1. A throwing resolveEncounterPosition degrades to
        // encounter: null, WITHOUT corrupting the underlying UNPLACED
        // outcome into INELIGIBLE.
        const host = makeHost('0.9.552-section-i1');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry, {
            resolveEncounterPosition: () => { throw new Error('boom — a broken encounter-position collaborator'); }
        });
        await placeAndAnnounce(host, 'novel-bytes-i1', { publicationId: 'novel-pub-i1', claimedPosition: { x: 9, y: 0, z: 9 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);
        assert(result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, `I1. A throwing resolveEncounterPosition still leaves the cascade's own outcome at UNPLACED, never INELIGIBLE (got ${result.outcome}).`);
        assert(result.encounter === null, 'I2. ...with encounter degraded to null, never a half-built or fabricated encounter.');

        // I2b. Materialized bytes remain genuinely present locally — the
        // presentational failure does not roll back acquisition either.
        assert(await host.localContentStore.has(new ContentReference({ hash: candidate.contentHash })), 'I3. The materialized bytes remain present locally despite the presentational failure.');

        // I4. A malformed (non-finite) position also degrades to
        // encounter: null, never a fabricated/partial encounter.
        const host2 = makeHost('0.9.552-section-i2');
        const worldModel2 = makeWorldModel();
        const registry2 = new WorldDiscoverySourceRegistry();
        const cascade2 = makeCascade(host2, worldModel2, registry2, { resolveEncounterPosition: () => ({ x: NaN, y: 0, z: 0 }) });
        await placeAndAnnounce(host2, 'novel-bytes-i2', { publicationId: 'novel-pub-i2', claimedPosition: { x: 9, y: 0, z: 9 } });
        const [candidate2] = await host2.discoverSnapshotCandidatesCommand();
        const result2 = await cascade2.processCandidate(candidate2);
        assert(result2.outcome === SnapshotWorldPlacementOutcome.UNPLACED, 'I4. A malformed position still leaves outcome at UNPLACED.');
        assert(result2.encounter === null, 'I5. ...with encounter null, never a partially-described one.');

        // I6. Existing World placement (an unrelated, already-placed
        // Publication) remains completely unaffected by either failure
        // above.
        const worldModel3 = makeWorldModel();
        worldModel3.placeAt('unrelated-placed-pub', new Position(5, 0, 5));
        worldModel3.knowPublication(new Publication({ id: 'unrelated-placed-pub', title: 'Unrelated', contentReference: new ContentReference({ hash: 'placeholder' }) }));
        assert(worldModel3.resolvePlacementInfo('unrelated-placed-pub').position.x === 5, 'I6. An unrelated, already-placed Publication is untouched by any of the above failures — no shared state connects them.');

        console.log('✓ I — a throwing or malformed resolveEncounterPosition degrades only the encounter field to null; it never corrupts the underlying outcome, never rolls back materialization, and never disturbs unrelated World placement.');
    }

    // ===============================================================
    // Section J — No duplicate encounter loading path.
    // ===============================================================
    {
        const host = makeHost('0.9.552-section-j');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        let encounterPositionCalls = 0;
        const cascade = makeCascade(host, worldModel, registry, {
            resolveEncounterPosition: () => { encounterPositionCalls += 1; return { x: 1, y: 0, z: 1 }; }
        });

        await placeAndAnnounce(host, 'novel-bytes-j', { publicationId: 'novel-pub-j', claimedPosition: { x: 6, y: 0, z: 6 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);

        assert(result.encounter !== null, 'J0. Sanity: an encounter was produced.');
        assert(host.callCounts().resolve === 1, `J1. resolveSelectedSnapshotCommand is called exactly once for this candidate — 0.9.552 reuses the SAME resolution result, never re-verifying (got ${host.callCounts().resolve}).`);
        assert(host.callCounts().materialize === 1, `J2. materializeSelectedSnapshotCommand is called exactly once — 0.9.552 never re-materializes to build the encounter (got ${host.callCounts().materialize}).`);
        assert(encounterPositionCalls === 1, `J3. resolveEncounterPosition is consulted exactly once for this run (got ${encounterPositionCalls}).`);

        // J4. Re-processing the SAME candidate a second time (a later
        // observation tick re-feeding an unchanged discovery result, per
        // ui/views/WorldView.js's own refreshSpatialUI() comment) triggers
        // no additional resolve/materialize call — the cascade's own
        // existing idempotency map, unmodified, already absorbs this.
        const secondResult = await cascade.processCandidate(candidate);
        assert(secondResult === result || (secondResult.encounter && secondResult.encounter.publicationId === result.encounter.publicationId),
            'J4a. Re-processing the identical candidate reuses the cascade\'s own existing idempotent result.');
        assert(host.callCounts().resolve === 1 && host.callCounts().materialize === 1,
            `J4b. No additional resolve/materialize call occurred on re-processing (resolve=${host.callCounts().resolve}, materialize=${host.callCounts().materialize}).`);

        // J5. A REGISTERED run never even consults resolveEncounterPosition
        // — no wasted "second pipeline" work for the case that never needs
        // an encounter at all.
        const worldModelPlaced = makeWorldModel();
        worldModelPlaced.placeAt('placed-pub-j5', new Position(1, 0, 1));
        worldModelPlaced.knowPublication(new Publication({ id: 'placed-pub-j5', title: 'J5', contentReference: new ContentReference({ hash: 'placeholder' }) }));
        const registryJ5 = new WorldDiscoverySourceRegistry();
        let encounterPositionCallsJ5 = 0;
        const cascadeJ5 = makeCascade(host, worldModelPlaced, registryJ5, {
            resolveEncounterPosition: () => { encounterPositionCallsJ5 += 1; return { x: 0, y: 0, z: 0 }; }
        });
        const referenceJ5 = await host.contentStore.put('placed-bytes-j5');
        const candidateJ5 = { contentHash: referenceJ5.hash, locator: referenceJ5.uri, storage: referenceJ5.storage, publicationId: 'placed-pub-j5' };
        const resultJ5 = await cascadeJ5.processCandidate(candidateJ5);
        assert(resultJ5.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'J5a. Sanity: this run reaches REGISTERED.');
        assert(encounterPositionCallsJ5 === 0, `J5b. resolveEncounterPosition is never consulted for a run that never reaches UNPLACED (got ${encounterPositionCallsJ5} calls).`);

        console.log('✓ J — no duplicate loading path: resolution/materialization each run exactly once, resolveEncounterPosition is consulted at most once and only for an UNPLACED outcome, and re-processing an already-settled candidate triggers no additional work.');
    }

    // ===============================================================
    // Section K — application/worldEncounter/ObserverLocalEncounterStore.js's own
    // contract, directly (record/list/subscribe/unsubscribe).
    // ===============================================================
    {
        const store = new ObserverLocalEncounterStore();
        assert(Array.isArray(store.list()) && store.list().length === 0, 'K1. A fresh store starts empty.');

        let notifyCount = 0;
        const unsubscribe = store.subscribe(() => { notifyCount += 1; });

        const encounterOne = describeObserverLocalPublicationEncounter({ publicationId: 'k-pub-1', contentHash: 'k-hash-1', encounterPosition: { x: 1, y: 0, z: 1 } });
        store.record(encounterOne);
        assert(store.list().length === 1 && notifyCount === 1, 'K2. record() stores the encounter and notifies exactly one subscriber once.');

        // K3. Replacement, not accumulation — the same publicationId:
        // contentHash key recorded again replaces, never duplicates.
        const encounterOneAgain = describeObserverLocalPublicationEncounter({ publicationId: 'k-pub-1', contentHash: 'k-hash-1', encounterPosition: { x: 2, y: 0, z: 2 } });
        store.record(encounterOneAgain);
        assert(store.list().length === 1 && store.list()[0].position.x === 2, 'K3. Recording the identical publicationId:contentHash again replaces the entry, never accumulates a duplicate.');

        const encounterTwo = describeObserverLocalPublicationEncounter({ publicationId: 'k-pub-2', contentHash: 'k-hash-2', encounterPosition: { x: 3, y: 0, z: 3 } });
        store.record(encounterTwo);
        assert(store.list().length === 2, 'K4. A distinct publicationId:contentHash key is a separate entry.');

        const notifyCountBeforeUnsubscribe = notifyCount;
        unsubscribe();
        store.record(describeObserverLocalPublicationEncounter({ publicationId: 'k-pub-3', contentHash: 'k-hash-3', encounterPosition: { x: 4, y: 0, z: 4 } }));
        assert(notifyCount === notifyCountBeforeUnsubscribe, 'K5. unsubscribe() is permanent — no further notifications after it is called.');
        unsubscribe();
        assert(notifyCount === notifyCountBeforeUnsubscribe, 'K6. unsubscribe() is idempotent — calling it again is a harmless no-op.');

        store.record(null);
        store.record({ publicationId: 'no-hash' });
        assert(store.list().length === 3, 'K7. A malformed/incomplete encounter is silently ignored, never stored, never thrown.');

        const listResult = store.list();
        try { listResult.push('mutation-attempt'); } catch { /* frozen array — throwing here is fine too */ }
        assert(store.list().length === 3, 'K8. list() returns a frozen, fresh array each call — a mutation attempt on it never affects the store\'s own state.');

        let listenerThrew = false;
        const survivingUnsubscribe = store.subscribe(() => { throw new Error('a subscriber\'s own bug'); });
        const secondListenerCalls = [];
        store.subscribe(() => secondListenerCalls.push(true));
        try {
            store.record(describeObserverLocalPublicationEncounter({ publicationId: 'k-pub-4', contentHash: 'k-hash-4', encounterPosition: { x: 5, y: 0, z: 5 } }));
        } catch {
            listenerThrew = true;
        }
        assert(!listenerThrew, 'K9. record() itself never throws even when a subscriber does.');
        assert(secondListenerCalls.length === 1, 'K10. A throwing subscriber never prevents other subscribers from being notified.');
        survivingUnsubscribe();

        console.log('✓ K — ObserverLocalEncounterStore\'s own record()/list()/subscribe() contract mirrors WorldDiscoverySourceRegistry\'s established shape exactly: replacement not accumulation, idempotent unsubscribe, subscriber isolation, and a defensively-copied list().');
    }

    // ===============================================================
    // Section L — core/ObserverLocalPublicationEncounter.js's own pure
    // function contract, directly.
    // ===============================================================
    {
        assert(describeObserverLocalPublicationEncounter() === null, 'L1. No arguments at all: null, never a throw.');
        assert(describeObserverLocalPublicationEncounter({ publicationId: '', contentHash: 'h', encounterPosition: { x: 0, y: 0, z: 0 } }) === null, 'L2. Empty publicationId: null.');
        assert(describeObserverLocalPublicationEncounter({ publicationId: 'p', contentHash: '', encounterPosition: { x: 0, y: 0, z: 0 } }) === null, 'L3. Empty contentHash: null.');
        assert(describeObserverLocalPublicationEncounter({ publicationId: 'p', contentHash: 'h' }) === null, 'L4. No encounterPosition at all: null.');
        assert(describeObserverLocalPublicationEncounter({ publicationId: 'p', contentHash: 'h', encounterPosition: { x: 1, y: Infinity, z: 1 } }) === null, 'L5. A non-finite position component: null.');
        const ok = describeObserverLocalPublicationEncounter({ publicationId: 'p', contentHash: 'h', encounterPosition: { x: 1, y: 2, z: 3 } });
        assert(ok !== null && ok.position.x === 1 && ok.position.y === 2 && ok.position.z === 3, 'L6. A well-formed call succeeds with the exact position supplied.');
        console.log('✓ L — describeObserverLocalPublicationEncounter() degrades to null, never a throw, for every malformed input, and returns the exact supplied identity/position when well-formed.');
    }

    console.log('\n✅ All Observer-Local Novel Publication Encounter Presentation tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All ObserverLocalNovelPublicationEncounterPresentation tests passed');
}).catch((error) => {
    console.error('\n✗ ObserverLocalNovelPublicationEncounterPresentation tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
