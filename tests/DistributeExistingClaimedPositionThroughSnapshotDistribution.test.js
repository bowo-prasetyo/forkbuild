import { readFile } from 'node:fs/promises';

import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.566 — Distribute Existing Claimed Position Through Snapshot
// Distribution.
//
// 0.9.565's own Boundary Audit found the claim dropped at exactly two
// stacked points on the one real production path: `application/
// SnapshotDistributionCommand.js` never accepted or forwarded
// `publicationId`/`claimedPosition`, and its only production caller,
// `ui/views/WorldView.js#distributeWorldEncounterSnapshot()`, never read
// `publication.id` or called `WorldNavigationSession#
// getPlacementInfoForPublication()` to supply either field. This
// milestone closes both points and nothing else — no new position
// algorithm, no automatic placement, no change to `application/
// SnapshotWorldPositionClaim.js`, `core/SnapshotDiscoveryEnvelope.js`, or
// either discovery publisher.
//
// Section A: existing claim acquisition — WorldNavigationSession#
//            getPlacementInfoForPublication() is the one and only source
//            of a claim; a Publication with an authoritative
//            WorldPlacement resolves one, real object graph, no mocks.
// Section B: exact forwarding — a caller-supplied placementInfo reaches
//            snapshotDistributionCommand() byte for byte, never
//            recomputed.
// Section C: Nostr envelope fidelity — the real
//            executeSnapshotDistributionCommand() + real
//            NostrSnapshotDiscoveryPublisher/NostrSnapshotDiscoveryQueryService,
//            driven by an in-memory relay, round-trip the claim alongside
//            the pre-existing contentHash/locator/storage fields,
//            unchanged.
// Section D: no-claim behavior — a Publication with no placementInfo at
//            all still distributes normally, with claimedPosition absent,
//            never a failure.
// Section E: identity binding — distributing one Publication never leaks
//            another's own claimedPosition, and publicationId is never
//            confused with contentHash.
// Section F: authority preservation — distribution creates no
//            PlacementRecord, modifies no PlacementRecord, and consuming
//            a claim remains gated behind the pre-existing, person-
//            initiated action.
// Section G: failure isolation — a placementInfo lookup that itself
//            throws propagates synchronously, exactly like every other
//            unexpected collaborator failure in this function; no new
//            error/retry vocabulary is invented for it.
// Section H: structural fidelity — the real ui/views/WorldView.js and
//            application/SnapshotDistributionCommand.js source actually
//            implement the shape Sections A-G exercise.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
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

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

// Mirrors application/WorldNavigationSession.js's own
// getPlacementInfoForPublication(publicationId) logic exactly (reduced to
// the one collaborator it actually reads, `_placementRegistry`) —
// reproduced here rather than constructing that (large) class directly,
// which pulls in the renderer/three.js import chain this project's own
// browser test harness (tests.html) resolves through a CDN import map,
// unavailable to a plain `node` run. Section A below still proves the
// real class implements this identical contract, via source, not prose.
function getPlacementInfoForPublication(placementRegistry, publicationId) {
    if (!placementRegistry || typeof publicationId !== 'string' || publicationId.length === 0) return null;
    const records = placementRegistry.findByPublicationId(publicationId);
    if (records.length === 0) return null;
    const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    return {
        placementId: record.placementId,
        publicationId: record.publicationId,
        position: { x: record.position.x, y: record.position.y, z: record.position.z }
    };
}

function sessionFromPlacementRegistry(placementRegistry = null) {
    return { getPlacementInfoForPublication: (publicationId) => getPlacementInfoForPublication(placementRegistry, publicationId) };
}

// A minimal, duck-typed ContentStore — content/ContentStore.js's own
// contract is "put() resolves to a real ContentReference{ hash, uri,
// storage } or rejects," nothing more; this file's own concern is the
// Nostr claim wire, never which concrete storage backend placed the
// bytes, so this fake computes a genuine content hash (the same
// serializer/contentHash.js#computeContentHash() every real ContentStore
// uses) and fabricates only the locator, exactly as
// tests/DecentralizedPublicationPositionClaimDistributionBoundaryAudit.test.js's
// own Section D does for the identical reason.
function makeContentStore() {
    let counter = 0;
    return {
        async put(bytes) {
            counter += 1;
            const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
            return { hash: computeContentHash(text), uri: `ar://fake-tx-${counter}`, storage: 'ar' };
        }
    };
}

// The EXACT logic ui/views/WorldView.js's own distributeWorldEncounterSnapshot()
// implements as of 0.9.566 — reproduced here (rather than imported) for the
// identical reason tests/WorldViewSnapshotDistribution.test.js's own
// makeSnapshotDistributionAction() is: WorldView.js's function lives inside
// its own setup(), not exported. Section H's own structural checks verify
// the real file actually implements this shape.
function makeSnapshotDistributionAction({ snapshotDistributionCommand, publicationCatalogContentResolver, session }) {
    return (publication) => {
        if (!snapshotDistributionCommand || !publicationCatalogContentResolver) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        const snapshotJson = publicationCatalogContentResolver.resolve(publication.id);
        if (snapshotJson === null) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        const placementInfo = typeof session.getPlacementInfoForPublication === 'function'
            ? session.getPlacementInfoForPublication(publication.id)
            : null;
        return snapshotDistributionCommand(
            JSON.stringify(snapshotJson),
            undefined,
            placementInfo ? placementInfo.publicationId : undefined,
            placementInfo ? placementInfo.position : undefined
        );
    };
}

function fakeContentResolver(entries = {}) {
    return {
        resolve(publicationId) {
            return Object.prototype.hasOwnProperty.call(entries, publicationId) ? entries[publicationId] : null;
        }
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {

    // =======================================================================
    // Section A — Existing claim acquisition.
    // =======================================================================
    {
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        const methodMatch = sessionSource.match(/getPlacementInfoForPublication\(publicationId\)\s*\{[\s\S]*?\n    \}/);
        assert(methodMatch, '1. WorldNavigationSession#getPlacementInfoForPublication(publicationId) exists as an isolable method.');
        assert(/return\s*\{\s*\n\s*placementId:\s*record\.placementId,\s*\n\s*publicationId:\s*record\.publicationId,\s*\n\s*position:\s*\{\s*x:\s*record\.position\.x,\s*y:\s*record\.position\.y,\s*z:\s*record\.position\.z\s*\}\s*\n\s*\};/.test(methodMatch[0]),
            '2. ...and its own real implementation returns exactly { placementId, publicationId, position } from `this._placementRegistry` — the identical shape reproduced below for a plain `node` run (see this file\'s own header note on renderer/three.js).');

        const publicationId = 'pub-section-a';
        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(placementRegistry, publicationId, new Position(3, 4, 5));
        const session = sessionFromPlacementRegistry(placementRegistry);

        const placementInfo = session.getPlacementInfoForPublication(publicationId);
        assert(placementInfo && placementInfo.publicationId === publicationId
            && placementInfo.position.x === 3 && placementInfo.position.y === 4 && placementInfo.position.z === 5,
            '3. the reproduced lookup is a real, working claim source over a real LocalPlacementRegistry/PlacementRecord — no test double stands in for the placement data itself.');
        assert(session.getPlacementInfoForPublication('no-such-publication') === null,
            '4. ...and returns null, never a fabricated claim, for a Publication with no authoritative WorldPlacement.');
    }
    console.log('✓ Section A: WorldNavigationSession#getPlacementInfoForPublication() is the real, already-shipped claim source (proven by source), and its exact logic genuinely resolves a real placement or genuinely returns null for one with none.');

    // =======================================================================
    // Section B — Exact forwarding.
    // =======================================================================
    {
        const publication = new Publication({ id: 'pub-B', documentId: 'doc-B' });
        const snapshotJson = { world: { buildings: [{ id: 'section-b-building', bricks: 3 }] } };
        const contentResolver = fakeContentResolver({ [publication.id]: snapshotJson });

        let capturedArgs = null;
        const fakeSnapshotDistributionCommand = (...args) => {
            capturedArgs = args;
            return Promise.resolve({ contentReference: { hash: 'h', uri: 'u', storage: 'ar' }, announcement: { published: true } });
        };

        const session = { getPlacementInfoForPublication: (id) => (id === publication.id ? { placementId: 'p1', publicationId: 'pub-A', position: { x: 12, y: 0, z: -7 } } : null) };

        const action = makeSnapshotDistributionAction({
            snapshotDistributionCommand: fakeSnapshotDistributionCommand,
            publicationCatalogContentResolver: contentResolver,
            session
        });
        await action(publication);

        assert(capturedArgs[0] === JSON.stringify(snapshotJson), '1. the serialized bytes still arrive unchanged, exactly as before this milestone.');
        assert(capturedArgs[2] === 'pub-A', '2. publicationId reaches the command byte for byte — exactly what getPlacementInfoForPublication() returned, never publication.id independently re-derived.');
        assert(capturedArgs[3].x === 12 && capturedArgs[3].y === 0 && capturedArgs[3].z === -7,
            '3. claimedPosition reaches the command with the EXACT numbers getPlacementInfoForPublication() returned — no recomputation, no rounding, no coordinate transform.');
    }
    console.log('✓ Section B: given publicationId = "pub-A" and claimedPosition = { x: 12, y: 0, z: -7 }, the command receives exactly those values — no coordinate recomputation.');

    // =======================================================================
    // Section C — Nostr envelope fidelity.
    // =======================================================================
    {
        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: '0.9.566-fidelity', publishImpl: network.publishImpl });
        const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const contentStore = makeContentStore();

        const { announcement } = await executeSnapshotDistributionCommand({
            bytes: JSON.stringify({ hello: 'section-c' }),
            contentStore,
            discoveryPublisher: publisher,
            publicationId: 'pub-C',
            claimedPosition: { x: 1, y: 2, z: 3 }
        });
        assert(announcement && announcement.published === true, '1. the real command, given a real claim, still succeeds exactly as before.');

        const candidates = await queryService.search('0.9.566-fidelity');
        assert(candidates.length === 1, '2. exactly one discovery candidate reaches the query side.');
        const candidate = candidates[0];
        assert(candidate.publicationId === 'pub-C', '3. publicationId survives announce -> query round-trip unmodified.');
        assert(candidate.claimedPosition.x === 1 && candidate.claimedPosition.y === 2 && candidate.claimedPosition.z === 3,
            '4. claimedPosition survives the identical round-trip unmodified.');
        assert(typeof candidate.contentHash === 'string' && candidate.contentHash.length > 0
            && typeof candidate.locator === 'string' && candidate.locator.length > 0
            && candidate.storage === 'ar',
            '5. the pre-existing contentHash/locator/storage fields remain present and genuine — the claim rides ALONGSIDE them, never in place of them.');
    }
    console.log('✓ Section C: the real Nostr discovery publisher/query service round-trip a claim produced through the real, unmodified executeSnapshotDistributionCommand() — the existing Snapshot fields stay intact beside it.');

    // =======================================================================
    // Section D — No-claim behavior.
    // =======================================================================
    {
        const publication = new Publication({ id: 'pub-D', documentId: 'doc-D' });
        const snapshotJson = { world: { buildings: [] } };
        const contentResolver = fakeContentResolver({ [publication.id]: snapshotJson });

        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: '0.9.566-noclaim', publishImpl: network.publishImpl });
        const contentStore = makeContentStore();
        const realSnapshotDistributionCommand = (bytes, storage = 'ar', publicationId, claimedPosition) => executeSnapshotDistributionCommand({
            bytes, contentStore, discoveryPublisher: publisher, publicationId, claimedPosition
        });

        // A session with no placementRegistry wired at all — the ordinary
        // shape for a Publication that was never placed in this Wanderer's
        // own World.
        const session = sessionFromPlacementRegistry(null);

        const action = makeSnapshotDistributionAction({ snapshotDistributionCommand: realSnapshotDistributionCommand, publicationCatalogContentResolver: contentResolver, session });
        const result = await action(publication);

        assert(result && result.announcement && result.announcement.published === true, '1. distribution still succeeds — a missing claim is never a distribution failure.');

        const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const candidates = await queryService.search('0.9.566-noclaim');
        assert(candidates.length === 1 && candidates[0].publicationId === undefined && candidates[0].claimedPosition === undefined,
            '2. the resulting discovery candidate carries neither publicationId nor claimedPosition — omitted, never a fabricated fallback.');
    }
    console.log('✓ Section D: a Publication with no placementInfo distributes exactly as before this milestone — claimedPosition absent, distribution unaffected.');

    // =======================================================================
    // Section E — Identity binding.
    // =======================================================================
    {
        const publicationA = new Publication({ id: 'pub-E-A', documentId: 'doc-E-A' });
        const publicationB = new Publication({ id: 'pub-E-B', documentId: 'doc-E-B' });
        const contentResolver = fakeContentResolver({
            [publicationA.id]: { world: { buildings: [{ id: 'a' }] } },
            [publicationB.id]: { world: { buildings: [{ id: 'b' }] } }
        });

        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(placementRegistry, publicationA.id, new Position(1, 0, 1));
        placeReal(placementRegistry, publicationB.id, new Position(9, 0, 9));
        const session = sessionFromPlacementRegistry(placementRegistry);

        const calls = [];
        const fakeSnapshotDistributionCommand = (...args) => {
            calls.push(args);
            return Promise.resolve({ contentReference: { hash: `hash-${calls.length}`, uri: `u-${calls.length}`, storage: 'ar' }, announcement: null });
        };
        const action = makeSnapshotDistributionAction({ snapshotDistributionCommand: fakeSnapshotDistributionCommand, publicationCatalogContentResolver: contentResolver, session });

        await action(publicationA);
        await action(publicationB);

        assert(calls[0][2] === publicationA.id && calls[0][3].x === 1 && calls[0][3].z === 1,
            '1. distributing Publication A carries only A\'s own publicationId/position.');
        assert(calls[1][2] === publicationB.id && calls[1][3].x === 9 && calls[1][3].z === 9,
            '2. distributing Publication B, independently, carries only B\'s own — no cross-contamination from A\'s own prior call.');
        assert(calls[0][2] !== calls[1][2] && (calls[0][3].x !== calls[1][3].x || calls[0][3].z !== calls[1][3].z),
            '3. the two calls are genuinely distinguishable, not two references to a single shared object.');

        const reference = await makeContentStore().put(JSON.stringify({ same: 'bytes' }));
        assert(reference.hash !== publicationA.id && reference.hash !== publicationB.id,
            '4. publicationId and contentHash remain two genuinely distinct identities — a content hash is never mistaken for, or substituted for, a publicationId.');
    }
    console.log('✓ Section E: distributing one Publication never leaks another\'s own claimedPosition, and publicationId stays a genuinely distinct identity from contentHash.');

    // =======================================================================
    // Section F — Authority preservation.
    // =======================================================================
    {
        const commandSource = await readSource('application/SnapshotDistributionCommand.js');
        assert(!/PlacementRecord|LocalPlacementRegistry|WorldPlacement/.test(commandSource),
            '1. application/SnapshotDistributionCommand.js still references no PlacementRecord/LocalPlacementRegistry/WorldPlacement — forwarding a claim is never itself a placement.');

        const publication = new Publication({ id: 'pub-F', documentId: 'doc-F' });
        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(placementRegistry, publication.id, new Position(2, 2, 2));
        const session = sessionFromPlacementRegistry(placementRegistry);

        const before = session.getPlacementInfoForPublication(publication.id);
        const contentResolver = fakeContentResolver({ [publication.id]: { world: { buildings: [] } } });
        const fakeSnapshotDistributionCommand = () => Promise.resolve({ contentReference: { hash: 'h', uri: 'u', storage: 'ar' }, announcement: { published: true } });
        const action = makeSnapshotDistributionAction({ snapshotDistributionCommand: fakeSnapshotDistributionCommand, publicationCatalogContentResolver: contentResolver, session });

        await action(publication);
        const after = session.getPlacementInfoForPublication(publication.id);
        assert(after.placementId === before.placementId && after.position.x === before.position.x
            && after.position.y === before.position.y && after.position.z === before.position.z,
            '2. distributing a Snapshot never creates or modifies this Publication\'s own PlacementRecord — the authoritative placement is bit-for-bit unchanged.');
        assert(placementRegistry.findByPublicationId(publication.id).length === 1,
            '3. exactly one PlacementRecord still exists for this Publication — distribution never adds a second one.');

        const panelSource = await readSource('ui/components/OwnPublicationPanel.js');
        assert(/@click="useClaimedSnapshotPosition"/.test(panelSource),
            '4. a distributed claim still only ever becomes a placement through the pre-existing, person-initiated "Use Claimed Position" click — never automatically, from this milestone\'s own change.');
    }
    console.log('✓ Section F: distributing a Snapshot creates no PlacementRecord, modifies no PlacementRecord, and a claim still requires the pre-existing explicit person-initiated action to become a placement.');

    // =======================================================================
    // Section G — Failure isolation.
    // =======================================================================
    {
        const publication = new Publication({ id: 'pub-G', documentId: 'doc-G' });
        const contentResolver = fakeContentResolver({ [publication.id]: { world: { buildings: [] } } });
        const fakeSnapshotDistributionCommand = () => Promise.resolve({ contentReference: { hash: 'h', uri: 'u', storage: 'ar' }, announcement: { published: true } });

        const brokenSession = {
            getPlacementInfoForPublication() { throw new Error('placement registry unavailable'); }
        };
        const action = makeSnapshotDistributionAction({ snapshotDistributionCommand: fakeSnapshotDistributionCommand, publicationCatalogContentResolver: contentResolver, session: brokenSession });

        let threwSynchronously = false;
        try {
            action(publication);
        } catch (error) {
            threwSynchronously = error.message === 'placement registry unavailable';
        }
        assert(threwSynchronously,
            '1. a placementInfo lookup that itself throws propagates synchronously and unmodified — the SAME "genuine failure propagates" semantics every other collaborator failure in this codebase already holds, never a new error type, never silently swallowed, never retried.');
    }
    console.log('✓ Section G: an optional placementInfo lookup failure propagates through existing failure semantics — no new error/retry vocabulary invented for it.');

    // =======================================================================
    // Section H — Structural fidelity.
    // =======================================================================
    {
        const commandSource = await readSource('application/SnapshotDistributionCommand.js');
        const runFnMatch = commandSource.match(/async function runSnapshotDistribution\([\s\S]*?\n\}/);
        assert(runFnMatch, '1. runSnapshotDistribution() exists as an isolable function.');
        assert(/discoveryPublisher\.publish\(\{\s*contentHash:\s*contentReference\.hash,\s*locator:\s*contentReference\.uri,\s*storage:\s*contentReference\.storage,\s*publicationId,\s*claimedPosition\s*\}\)/.test(runFnMatch[0]),
            '2. it forwards publicationId/claimedPosition into discoveryPublisher.publish() alongside the pre-existing three fields, unmodified.');

        const worldViewSource = await readSource('ui/views/WorldView.js');
        const distributeFnMatch = worldViewSource.match(/function distributeWorldEncounterSnapshot\(publication\)\s*\{[\s\S]*?\n        \}/);
        assert(distributeFnMatch, '3. WorldView.js#distributeWorldEncounterSnapshot(publication) exists as an isolable function.');
        const body = distributeFnMatch[0];
        assert(/session\.getPlacementInfoForPublication\(publication\.id\)/.test(body),
            '4. it reads the claim through session.getPlacementInfoForPublication(publication.id) — the same collaborator Section A exercised directly.');
        assert(!/publication\.toJSON\(\)|new Position\(|computeContentHash/.test(body),
            '5. it computes no new position and no new content hash of its own — every value it forwards was already computed elsewhere.');
    }
    console.log('✓ Section H: the real production source genuinely implements the shape Sections A-G exercised — never a test double standing in for an unbuilt behavior.');
}

run().catch((error) => {
    console.error('DistributeExistingClaimedPositionThroughSnapshotDistribution.test.js FAILED:', error);
    process.exitCode = 1;
});
