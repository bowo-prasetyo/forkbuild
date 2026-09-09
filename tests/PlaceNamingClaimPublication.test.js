import { readFile } from 'node:fs/promises';

import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import {
    buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag
} from '../core/PlaceNamingDiscoveryEnvelope.js';
import { NostrPlaceNamingDiscoveryPublisher } from '../application/NostrPlaceNamingDiscoveryPublisher.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.316 — Place Naming Claim Publication Boundary.
// See docs/Roadmap.md, "0.9.316 — Place Naming Claim Publication Boundary."
//
// 0.9.315 demonstrated, live, that a self-published PlaceNamingClaim never
// reaches a second device through this codebase's own decentralized
// discovery path, because nothing in this domain ever writes to a relay.
// This file proves the seam that closes that gap — application/
// NostrPlaceNamingDiscoveryPublisher.js — without changing claim
// semantics, local persistence, or discovery, and without inventing a
// second kind of naming claim or a publication lifecycle.
//
//   Section A — an existing claim remains authoritative: publishing
//               derives from it and never creates a second local claim.
//   Section B — round-trip: claim -> envelope -> published event ->
//               discovery parser -> equivalent claim information.
//   Section C — FLAGSHIP (write): a real publish reaches an injected fake
//               relay transport.
//   Section D — FLAGSHIP (cross-device): Device A publishes, Device B
//               discovers, through the unmodified existing discovery
//               chain, with no shared local storage.
//   Section E — local persistence independence: the publisher never
//               touches LocalPlaceNamingClaimStore.
//   Section F — identity preservation: claim identity, publisher-side
//               identity, Nostr event identity, and discovery origin
//               never collapse into one another.
//   Section G — publication failure is surfaced, never silently converted
//               into a successful publication.
//   Section H — discovery remains independent: the discovery source can
//               consume a published event without importing or calling
//               the publisher.
//   Section I — no accidental coupling to Arweave/IPFS/Bitcoin/Base or any
//               provider-preference concept.
//   Section J — regression: existing local-only Place Naming behavior is
//               unaffected when no publication capability is supplied.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch { rejected = true; }
    assert(rejected, message);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
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
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    provider.identityId = identity.identityId;
    return provider;
}

// A full, real Place Naming collaborator graph BELOW the World/session
// layer — the same shape 0.9.315's own makeReplica() already used.
function makeReplica(identityProvider, { storage = new InMemoryStorageProvider() } = {}) {
    const store = new LocalPlaceNamingClaimStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    return { storage, store, verifier, useCase };
}

const FAKE_EVENT_ID = 'b'.repeat(64);

async function runTests() {
    console.log('Running Place Naming Claim Publication Boundary tests...\n');

    // ===============================================================
    // Section A — an existing claim remains authoritative. Publishing
    // derives from the claim already created by the existing use case; it
    // never creates a second local claim.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-1', 'region-1', 'Riverbend');
        assert(replica.store.list('world-1').length === 1, 'A1. Exactly one local claim exists before publication.');

        const relay = { calls: [], async publishImpl(relayUrl, eventTemplate) { this.calls.push({ relayUrl, eventTemplate }); return { published: true, id: FAKE_EVENT_ID }; } };
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl.bind(relay) });

        const result = await publisher.publish(claim);
        assert(result !== null && result.published === true, 'A2. Publishing the existing claim succeeds.');
        assert(replica.store.list('world-1').length === 1, 'A3. Publishing never creates a second local claim — the store still has exactly one.');
        assert(replica.store.list('world-1')[0].id === claim.id, 'A4. The one claim on file is still the exact same claim, unchanged by publication.');

        const publishedEnvelope = JSON.parse(relay.calls[0].eventTemplate.content);
        assert(publishedEnvelope.claim.id === claim.id && publishedEnvelope.claim.name === claim.name,
            'A5. The published representation derives from the existing claim\'s own fields — publishing never re-authors the claim.');

        console.log('✓ A: an existing, already-created and already-locally-persisted claim remains authoritative — publishing derives the wire representation from it and never creates a second local claim.');
    }

    // ===============================================================
    // Section B — correct discovery representation: claim -> envelope ->
    // published event -> discovery parser -> equivalent claim information.
    // No new serialization format is introduced.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-2', 'region-2', 'Sunspire Vale');

        const relay = { calls: [], async publishImpl(relayUrl, eventTemplate) { this.calls.push({ relayUrl, eventTemplate }); return { published: true, id: FAKE_EVENT_ID }; } };
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl.bind(relay) });
        await publisher.publish(claim);

        // The exact JSON the publisher wrote to the wire is exactly what
        // buildPlaceNamingDiscoveryEnvelope() would independently produce
        // for this same claim — one format, not two.
        const independentlyBuilt = buildPlaceNamingDiscoveryEnvelope(claim);
        const publishedContent = JSON.parse(relay.calls[0].eventTemplate.content);
        assert(JSON.stringify(publishedContent) === JSON.stringify(independentlyBuilt),
            'B1. The publisher writes exactly the envelope core/PlaceNamingDiscoveryEnvelope.js#buildPlaceNamingDiscoveryEnvelope() already defines — no second, competing serialization format.');

        // Round-trip through the same parser every discovery source already
        // relies on.
        const roundTripped = parsePlaceNamingDiscoveryEnvelope(relay.calls[0].eventTemplate.content);
        assert(roundTripped !== null, 'B2. The published event content parses back through the existing discovery parser.');
        assert(
            roundTripped.claim.id === claim.id && roundTripped.claim.name === claim.name
                && roundTripped.claim.authorIdentityId === claim.authorIdentityId
                && roundTripped.worldId === claim.worldId && roundTripped.regionId === claim.regionId,
            'B3. The round-tripped information is equivalent, field for field, to the original claim.'
        );

        console.log('✓ B: claim -> envelope -> published event -> discovery parser -> equivalent claim information round-trips cleanly through the existing, unmodified wire contract.');
    }

    // ===============================================================
    // Section C — FLAGSHIP (write): a real publication reaches an injected
    // fake relay transport.
    // ===============================================================
    {
        const relayEvents = [];
        async function fakePublishImpl(relayUrl, eventTemplate) {
            relayEvents.push({ kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content });
            return { published: true, id: FAKE_EVENT_ID };
        }

        const alice = makeIdentity('Alice');       // Device A
        const deviceA = makeReplica(alice);
        const claim = deviceA.useCase.publish('world-3', 'region-3', 'Riverbend');
        assert(relayEvents.length === 0, 'C1. Before publication, the shared relay has nothing.');

        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: fakePublishImpl });
        const result = await publisher.publish(claim);

        assert(result !== null && result.published === true, 'C2. FLAGSHIP — publishing a real claim through the publisher succeeds.');
        assert(relayEvents.length === 1, 'C3. FLAGSHIP — exactly one event reached the fake relay.');
        const tag = derivePlaceNamingDiscoveryTag(claim.worldId, claim.regionId);
        assert(relayEvents[0].tags.some((t) => t[0] === 't' && t[1] === tag), 'C4. FLAGSHIP — the event reaching the relay carries the correct discovery tag.');

        console.log('✓ C (FLAGSHIP): Device A -> PlaceNamingClaim -> NostrPlaceNamingDiscoveryPublisher -> fake Nostr relay -> relayEvents — a real publication demonstrably reaches the transport.');
    }

    // ===============================================================
    // Section D — FLAGSHIP (cross-device): the payoff from 0.9.315. Device
    // A creates and publishes; Device B, with NO shared local storage,
    // discovers through the existing, unmodified decentralized discovery
    // path.
    // ===============================================================
    {
        // `relayEvents` stands in for the entire Nostr network, exactly as
        // 0.9.315's own Section F used it — the only thing the two devices
        // below share.
        const relayEvents = [];
        async function fakePublishImpl(relayUrl, eventTemplate) {
            relayEvents.push({ kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content });
            return { published: true, id: FAKE_EVENT_ID };
        }
        function fakeQueryImpl(relayUrl, filter) {
            const wantedTags = filter['#t'] || [];
            return Promise.resolve(relayEvents.filter((event) => event.tags.some((t) => t[0] === 't' && wantedTags.includes(t[1]))));
        }

        const alice = makeIdentity('Alice');       // Device A
        const bob = makeIdentity('Bob');            // Device B — independent replica, no shared storage.
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const worldId = 'world-shared';
        const regionId = 'region-shared';
        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);

        // Device A: create locally, then explicitly publish (0.9.316's own
        // product decision — never automatic).
        const claim = deviceA.useCase.publish(worldId, regionId, 'Riverbend');
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: fakePublishImpl });
        const publishResult = await publisher.publish(claim);
        assert(publishResult !== null, 'D1. Device A\'s explicit publish action succeeds.');

        // Device B: discover through the exact, unmodified, already-shipped
        // chain (NostrPlaceNamingDiscoverySource -> PlaceNamingDiscoveryQueryService
        // -> executeDiscoverPlaceNamingClaimsCommand).
        const bobsDiscoverySource = new NostrPlaceNamingDiscoverySource({ queryImpl: fakeQueryImpl });
        const bobsQueryService = new PlaceNamingDiscoveryQueryService([bobsDiscoverySource]);
        const discovered = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: bobsQueryService });

        assert(Array.isArray(discovered) && discovered.length === 1,
            'D2. THE GAP IS CLOSED, LIVE: Device B\'s unmodified decentralized discovery now finds exactly Alice\'s published claim.');
        assert(discovered[0].claim.id === claim.id && discovered[0].claim.name === 'Riverbend',
            'D3. The discovered claim information matches what Device A actually published, field for field.');
        assert(deviceB.store.has(worldId, claim.id) === false,
            'D4. Discovery alone never writes into Device B\'s own local store — that remains a separate, later, unbuilt adoption step, exactly as 0.9.253 already scoped it.');
        assert(deviceA.storage !== deviceB.storage,
            'D5. The two devices share NO local storage of any kind — only the relayEvents array connects them.');

        console.log('✓ D (FLAGSHIP): Device A creates a claim locally, explicitly publishes it, and Device B — an independent replica sharing no local storage — discovers it through the exact, unmodified, already-shipped decentralized discovery path. The workflow 0.9.315 proved uncompletable now completes.');
    }

    // ===============================================================
    // Section E — local persistence independence: publishing does not
    // require, and does not perform, any local write. The existing local
    // persistence remains owned entirely by the existing claim use case.
    // ===============================================================
    {
        const publisherSource = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        assert(!/LocalPlaceNamingClaimStore/.test(publisherSource),
            'E1. The publisher never imports LocalPlaceNamingClaimStore — it has no access to local persistence at all, structurally.');

        // Behavioral: publishing a claim that was never saved to any
        // store the publisher can reach still succeeds — proving the
        // publisher performs no local read or write of its own.
        const alice = makeIdentity('Alice');
        const storage = new InMemoryStorageProvider();
        const store = new LocalPlaceNamingClaimStore(storage);
        const verifier = new LocalAuthorizationVerifier();
        const useCase = new PlaceNamingClaimUseCase(store, alice, verifier);
        const claim = useCase.publish('world-4', 'region-4', 'Emberfall');

        const relay = { async publishImpl() { return { published: true, id: FAKE_EVENT_ID }; } };
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        const beforeCount = store.list('world-4').length;
        const result = await publisher.publish(claim);
        const afterCount = store.list('world-4').length;

        assert(result !== null, 'E2. Publishing succeeds using only the claim instance handed to it — no store reference was ever given to the publisher.');
        assert(beforeCount === afterCount, 'E3. The local store\'s own claim count is unchanged by publication — the publisher performed no local write.');

        console.log('✓ E: publishing never requires, and never performs, a local write — local persistence remains entirely PlaceNamingClaimUseCase\'s and LocalPlaceNamingClaimStore\'s own responsibility.');
    }

    // ===============================================================
    // Section F — identity preservation: claim identity, Nostr event
    // identity, and discovery origin never collapse into one another.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-5', 'region-5', 'Ashwood');

        const relay = { async publishImpl() { return { published: true, id: FAKE_EVENT_ID }; } };
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        const result = await publisher.publish(claim);

        assert(result.id === FAKE_EVENT_ID && result.id !== claim.id,
            'F1. The Nostr event id and the PlaceNamingClaim\'s own id are distinct — publishing never overwrites or aliases the claim\'s own identity with a relay-assigned one.');
        assert(claim.toJSON().id === claim.id, 'F2. The claim\'s own JSON representation still carries only its own id, never the relay event id.');

        // Publisher identity: the publisher itself carries no author/claim
        // identity of its own — it is a stateless transport wrapper,
        // reusable across any number of distinct claims and authors.
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const bobsClaim = bobReplica.useCase.publish('world-5', 'region-5', 'Different Name');
        const secondResult = await publisher.publish(bobsClaim);
        assert(secondResult.id === FAKE_EVENT_ID, 'F3. The SAME publisher instance publishes a second, independently-authored claim with no cross-contamination of identity.');
        assert(bobsClaim.authorIdentityId !== claim.authorIdentityId, 'F4. The two claims retain their own distinct author identities throughout.');

        // Discovery origin lives on the envelope's own shape, never folded
        // into the claim.
        const envelope = parsePlaceNamingDiscoveryEnvelope(JSON.stringify(buildPlaceNamingDiscoveryEnvelope(claim)));
        assert(!('relayUrl' in envelope) && !('eventId' in envelope) && !('id' in envelope),
            'F5. The discovery envelope carries no relay/event identity field of its own — discovery origin stays a fact a query source tracks separately, never a fact the claim or envelope carries about itself.');

        console.log('✓ F: claim identity, publisher identity, Nostr event identity, and discovery origin are proven to stay structurally distinct — a Nostr event id never silently becomes the Place Naming claim id.');
    }

    // ===============================================================
    // Section G — publication failure is surfaced, never silently
    // converted into a successful publication.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-6', 'region-6', 'Failtown');

        // A genuine transport failure propagates as a rejection.
        const failingRelay = { async publishImpl() { throw new Error('simulated: relay unreachable'); } };
        const failingPublisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: failingRelay.publishImpl });
        await expectRejects(failingPublisher.publish(claim), 'G1. A genuine relay failure propagates as a rejection — never reported back as a successful publication.');

        // A definite relay decline resolves to null — distinctly not the
        // same shape as a success.
        const decliningRelay = { async publishImpl() { return { published: false, reason: 'rate limited' }; } };
        const decliningPublisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: decliningRelay.publishImpl });
        const declineResult = await decliningPublisher.publish(claim);
        assert(declineResult === null, 'G2. A relay decline resolves to null — never an object claiming published: true.');

        console.log('✓ G: publication failure — both a genuine transport failure and a definite relay decline — is surfaced honestly, never silently converted into a successful publication result.');
    }

    // ===============================================================
    // Section H — discovery remains independent: the discovery source can
    // consume a published event without importing or calling the
    // publication implementation. Publish -> Discover, never Publisher ->
    // Discovery.
    // ===============================================================
    {
        const sourceSource = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoverySource.js'));
        assert(!/NostrPlaceNamingDiscoveryPublisher/.test(sourceSource),
            'H1. The discovery source never imports the publisher — Publish and Discover share only the passive wire contract, never a code dependency.');

        const queryServiceSource = codeOnlyLines(await rawSource('application/PlaceNamingDiscoveryQueryService.js'));
        assert(!/NostrPlaceNamingDiscoveryPublisher/.test(queryServiceSource),
            'H2. The discovery aggregator never imports the publisher either.');

        const envelopeSource = codeOnlyLines(await rawSource('core/PlaceNamingDiscoveryEnvelope.js'));
        assert(!/NostrPlaceNamingDiscoveryPublisher/.test(envelopeSource),
            'H3. The shared envelope contract itself never references the publisher — it is a passive shape both sides independently agree on.');

        // Live: a discovery source consumes a real published event with
        // zero reference to the publisher class anywhere in the call
        // graph exercised.
        const relayEvents = [];
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-7', 'region-7', 'Independence Hollow');
        const publisher = new NostrPlaceNamingDiscoveryPublisher({
            publishImpl: async (relayUrl, eventTemplate) => {
                relayEvents.push({ tags: eventTemplate.tags, content: eventTemplate.content });
                return { published: true, id: FAKE_EVENT_ID };
            }
        });
        await publisher.publish(claim);

        const discoverySource = new NostrPlaceNamingDiscoverySource({
            queryImpl: (relayUrl, filter) => Promise.resolve(
                relayEvents.filter((e) => e.tags.some((t) => t[0] === 't' && (filter['#t'] || []).includes(t[1])))
            )
        });
        const queryService = new PlaceNamingDiscoveryQueryService([discoverySource]);
        const discoveryTag = derivePlaceNamingDiscoveryTag('world-7', 'region-7');
        const results = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: queryService });
        assert(results.length === 1 && results[0].claim.id === claim.id,
            'H4. The discovery chain consumes the published event correctly with no import of, or call into, the publisher anywhere in its own code.');

        console.log('✓ H: discovery remains structurally independent of publication — Publish and Discover are two branches off Place Naming, never Publisher -> Discovery.');
    }

    // ===============================================================
    // Section I — no accidental other-substrate coupling. 0.9.316 is
    // specifically an Announcement & Discovery -> Nostr capability.
    // ===============================================================
    {
        const publisherSource = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        const FORBIDDEN_SUBSTRATES = ['Arweave', 'IPFS', 'Bitcoin', 'Base'];
        for (const substrate of FORBIDDEN_SUBSTRATES) {
            assert(!new RegExp(substrate, 'i').test(publisherSource), `I1. The publisher never references ${substrate} anywhere in its own code.`);
        }
        assert(!/provider.?preference/i.test(publisherSource), 'I2. The publisher introduces no provider-preference concept of any kind.');

        console.log('✓ I: 0.9.316 introduces no coupling to Arweave, IPFS, Bitcoin, Base, or any provider-preference concept — this is exclusively an Announcement & Discovery -> Nostr capability.');
    }

    // ===============================================================
    // Section J — regression: all existing local-only Place Naming
    // behavior continues working when no publication capability is
    // supplied. The feature is additive, not a mandatory replacement.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);

        // The entire existing local lifecycle, exercised with ZERO
        // reference to NostrPlaceNamingDiscoveryPublisher anywhere.
        const claim = replica.useCase.publish('world-8', 'region-8', 'Oldpath');
        assert(claim instanceof PlaceNamingClaim && replica.store.has('world-8', claim.id) === true,
            'J1. publish() still signs, stores, and returns a real, persisted PlaceNamingClaim with no publication capability ever supplied.');

        const view = replica.useCase.namingView('world-8', 'region-8');
        assert(Array.isArray(view) && view.length === 1 && view[0].name === 'Oldpath', 'J2. namingView() still derives the expected local presentation.');

        const retracted = replica.useCase.retract('world-8', claim.id);
        assert(retracted === true && replica.store.has('world-8', claim.id) === false,
            'J3. retract() still works exactly as before — local-only behavior is completely unaffected by this milestone.');

        const useCaseSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        assert(!/NostrPlaceNamingDiscoveryPublisher/.test(useCaseSource),
            'J4. PlaceNamingClaimUseCase itself never imports or calls the new publisher — publication is never automatic, and local creation never depends on network capability.');

        console.log('✓ J: every existing local-only Place Naming behavior (publish, view, retract) continues working completely unchanged and unaffected — 0.9.316 is purely additive.');
    }

    console.log('\n✅ All Place Naming Claim Publication Boundary tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PlaceNamingClaimPublication tests passed');
}).catch((error) => {
    console.error('\n✗ PlaceNamingClaimPublication tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
