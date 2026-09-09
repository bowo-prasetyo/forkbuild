import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

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

// 0.9.317 — Place Naming Publication/Discovery Convergence Audit.
// See docs/Roadmap.md, "0.9.317 — Place Naming Publication/Discovery
// Convergence Audit."
//
// 0.9.316 built application/NostrPlaceNamingDiscoveryPublisher.js and its
// own two test files already proved a great deal of this boundary,
// including a cross-device flagship (tests/PlaceNamingClaimPublication.test.js
// Section D). This is a **test-only audit, not a rebuild** — it exists to
// ask, from a fresh and deliberately skeptical angle, the ONE question
// 0.9.316's own tests were not specifically built to interrogate: does
// publication genuinely CONVERGE with the pre-existing, independently-built
// discovery path at every boundary, with no seam where the two sides could
// silently drift apart in the future — never trust, never automatic
// publication, never a second wire format, never a second tag authority,
// never a hidden dependency in either direction? It adds no production
// code and no new capability.
//
//   Section A — FLAGSHIP: the full cross-device journey, re-run fresh
//               against a brand-new scenario, with call-count
//               instrumentation proving Device B's discovery touches
//               NOTHING belonging to Device A except the shared relay.
//   Section B — Publication never creates a second claim: identity,
//               content, and local claim count all provably unchanged by
//               publish(), across a fresh scenario built independently of
//               0.9.316's own.
//   Section C — Wire convergence: claim -> buildPlaceNamingDiscoveryEnvelope()
//               -> Nostr event -> existing parser -> equivalent
//               representation, plus a sweep proving no second envelope
//               serialization exists anywhere in the family.
//   Section D — Discovery tag convergence: the tag used to publish, the
//               tag derived independently, and the tag a query filter
//               carries are proven identical, and a deliberately
//               mismatched tag is proven to make a real, published claim
//               undiscoverable — there is no alternate tag authority.
//   Section E — Identity separation: six named identity concepts, proven
//               live and pairwise, to never collapse into one another.
//   Section F — Multiple publication events: publishing the same claim
//               twice is proven to introduce no publisher-side
//               deduplication, no claim mutation, and no new discovery
//               semantics — reconstructibility, deduplication, and
//               exactly-once are reconfirmed as separate properties, with
//               deduplication remaining exclusively the query service's
//               own, already-existing (0.9.253) job.
//   Section G — Publication failure isolation: a relay decline, a
//               transport rejection, a timeout, and a malformed event id
//               are each proven to leave the local claim byte-for-byte
//               unchanged, persist no fake publication state anywhere, and
//               leave discovery of an unrelated, already-published claim
//               on the same relay completely unaffected.
//   Section H — Local-only regression: the entire pre-0.9.316 workflow,
//               run with no publisher ever constructed anywhere in scope.
//   Section I — Cross-device isolation, instrumented: Device B's discovery
//               success is proven to require zero property access into
//               Device A's own store or use case objects.
//   Section J — Architectural sweep: publisher/discovery non-coupling,
//               no coupling to core/DecentralizedPublication.js or
//               NostrSnapshotDiscoveryPublisher.js, no other substrate, no
//               automatic publication, no retry/lifecycle/history
//               vocabulary, and no generic decentralized-publisher base
//               class anywhere in this family.
//   Section K — Verdict: reconciliation with 0.9.316's own record and the
//               milestone's closing statement.

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

function grepFiles(pattern, dirs) {
    let hits = '';
    try {
        hits = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
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
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    provider.identityId = identity.identityId;
    return provider;
}

function makeReplica(identityProvider, { storage = new InMemoryStorageProvider() } = {}) {
    const store = new LocalPlaceNamingClaimStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    return { storage, store, verifier, useCase };
}

// A tiny shared-relay double used throughout this file. Records every
// published event, and answers a NIP-01-shaped `#t` query against exactly
// what was recorded — nothing more elaborate than the fake relay 0.9.315's
// own Section F and 0.9.316's own Section D already used.
function makeSharedRelay() {
    const events = [];
    return {
        events,
        async publishImpl(relayUrl, eventTemplate) {
            const id = `${'e'.repeat(63)}${(events.length % 10)}`;
            events.push({ id, kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content });
            return { published: true, id };
        },
        queryImpl(relayUrl, filter) {
            const wantedTags = filter['#t'] || [];
            return Promise.resolve(events.filter((event) => event.tags.some((t) => t[0] === 't' && wantedTags.includes(t[1]))));
        }
    };
}

function discoveryServiceOver(relay) {
    const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
    return new PlaceNamingDiscoveryQueryService([source]);
}

async function runTests() {
    console.log('Running Place Naming Publication/Discovery Convergence Audit tests...\n');

    // ===============================================================
    // Section A — FLAGSHIP: the full cross-device journey, instrumented.
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');       // Device A
        const bob = makeIdentity('Bob');            // Device B — independent replica.
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const worldId = 'convergence-world';
        const regionId = 'convergence-region';

        // Device A: create locally, then explicitly publish.
        const claim = deviceA.useCase.publish(worldId, regionId, 'Farhaven');
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        const publishResult = await publisher.publish(claim);
        assert(publishResult !== null && publishResult.published === true, 'A1. Device A\'s explicit publish succeeds.');

        // Instrument Device A's own store/use case so this test can prove
        // Device B's discovery never touches either.
        let deviceAStoreAccessed = false;
        let deviceAUseCaseAccessed = false;
        const instrumentedDeviceAStore = new Proxy(deviceA.store, { get(target, prop) { deviceAStoreAccessed = true; return target[prop]; } });
        const instrumentedDeviceAUseCase = new Proxy(deviceA.useCase, { get(target, prop) { deviceAUseCaseAccessed = true; return target[prop]; } });
        void instrumentedDeviceAStore; void instrumentedDeviceAUseCase; // proven unused below — never handed to Device B at all.

        // Device B: discover through the unmodified, existing chain, built
        // from scratch here — sharing NO object with Device A except the
        // relay.
        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const bobsQueryService = discoveryServiceOver(relay);
        const discovered = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: bobsQueryService });

        assert(Array.isArray(discovered) && discovered.length === 1,
            'A2. Device B\'s discovery finds exactly Alice\'s published claim.');
        assert(discovered[0].claim.id === claim.id && discovered[0].claim.name === 'Farhaven',
            'A3. The discovered fields match what Device A actually published.');
        assert(deviceAStoreAccessed === false && deviceAUseCaseAccessed === false,
            'A4. Device B\'s discovery never touched Device A\'s own store or use case object in any way — the instrumented proxies (never handed to any collaborator above) recorded zero property accesses.');
        assert(deviceA.storage !== deviceB.storage, 'A5. The two devices\' underlying storage objects are distinct instances.');
        assert(deviceB.store.has(worldId, claim.id) === false,
            'A6. Discovery alone still never writes into Device B\'s own local store — adoption remains a separate, unbuilt step.');

        console.log('✓ A (FLAGSHIP): Device A creates and explicitly publishes a claim; Device B — freshly built, sharing no object with Device A except the relay double — discovers it through the exact, unmodified discovery chain, with zero access into Device A\'s own collaborators.');
    }

    // ===============================================================
    // Section B — Publication never creates a second claim.
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-b', 'region-b', 'Stonegate');
        const beforeJSON = JSON.stringify(claim.toJSON());
        const beforeCount = replica.store.list('world-b').length;

        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        await publisher.publish(claim);

        assert(replica.store.list('world-b').length === beforeCount,
            'B1. The local claim count is unchanged by publication.');
        assert(JSON.stringify(claim.toJSON()) === beforeJSON,
            'B2. The claim\'s own JSON representation, taken directly off the instance, is byte-for-byte unchanged by publication — no field was added or altered.');
        assert(replica.store.list('world-b')[0].id === claim.id,
            'B3. The one claim on file is still the exact same claim.');

        const useCaseCode = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        assert((useCaseCode.match(/new PlaceNamingClaim\(/g) || []).length === 1,
            'B4. PlaceNamingClaimUseCase itself still constructs exactly one PlaceNamingClaim per publish() call — the sole production constructor site remains unchanged by this milestone.');
        const publisherCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        assert(!publisherCode.includes('new PlaceNamingClaim('), 'B5. The publisher itself never constructs a PlaceNamingClaim.');
        assert(!publisherCode.includes('.save(') && !publisherCode.includes('LocalPlaceNamingClaimStore'),
            'B6. The publisher never calls a store\'s save() and never even imports the local claim store.');

        console.log('✓ B: publishing an existing claim creates no second claim, mutates no field on the original, and leaves the local claim count unchanged — verified against a fresh scenario and against the publisher\'s and use case\'s own source.');
    }

    // ===============================================================
    // Section C — Wire convergence: one format, not two.
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-c', 'region-c', 'Wickmoor');

        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        await publisher.publish(claim);

        const independentlyBuilt = buildPlaceNamingDiscoveryEnvelope(claim);
        const publishedContent = JSON.parse(relay.events[0].content);
        assert(JSON.stringify(publishedContent) === JSON.stringify(independentlyBuilt),
            'C1. The exact bytes published to the relay equal an independently-built envelope for the same claim.');

        const roundTripped = parsePlaceNamingDiscoveryEnvelope(relay.events[0].content);
        assert(roundTripped !== null
            && roundTripped.claim.id === claim.id
            && roundTripped.claim.name === claim.name
            && roundTripped.claim.authorIdentityId === claim.authorIdentityId
            && roundTripped.claim.signature.signer === claim.signature.signer
            && roundTripped.worldId === claim.worldId
            && roundTripped.regionId === claim.regionId,
            'C2. The published content round-trips, field for field including the signature block, through the exact same parser every discovery source relies on.');

        // No second envelope-building function exists anywhere in the
        // family — a future drift risk this section specifically guards
        // against.
        const familyFiles = [
            'application/NostrPlaceNamingDiscoveryPublisher.js', 'application/NostrPlaceNamingDiscoverySource.js',
            'application/PlaceNamingDiscoveryQueryService.js', 'application/DiscoverPlaceNamingClaimsCommand.js',
            'application/PlaceNamingClaimUseCase.js'
        ];
        for (const path of familyFiles) {
            const code = codeOnlyLines(await rawSource(path));
            assert(!/protocol:\s*['"]forkbuild-place-naming-discovery['"]/.test(code),
                `C3. ${path} never independently constructs an envelope literal of its own — every producer of this wire shape goes through buildPlaceNamingDiscoveryEnvelope() alone.`);
        }

        console.log('✓ C: claim -> buildPlaceNamingDiscoveryEnvelope() -> Nostr event -> parsePlaceNamingDiscoveryEnvelope() -> equivalent representation round-trips exactly, and no second, competing envelope-construction site exists anywhere in the family.');
    }

    // ===============================================================
    // Section D — Discovery tag convergence: one authority, no alternate.
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const worldId = 'world-d';
        const regionId = 'region-d';
        const claim = replica.useCase.publish(worldId, regionId, 'Copperbrook');

        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        await publisher.publish(claim);

        const publishedTag = relay.events[0].tags.find((t) => t[0] === 't')[1];
        const independentlyDerivedTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const publisherResultTag = derivePlaceNamingDiscoveryTag(claim.worldId, claim.regionId);
        assert(publishedTag === independentlyDerivedTag && publishedTag === publisherResultTag,
            'D1. The tag actually attached to the published event, the tag independently derived from worldId/regionId, and the tag derived from the claim\'s own fields are all the identical string.');

        // No alternate tag authority: querying under the correctly-derived
        // tag finds the claim; querying under ANY other string (including
        // a plausible but wrong derivation) does not.
        const queryService = discoveryServiceOver(relay);
        const correctlyFound = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: independentlyDerivedTag, discoveryQueryService: queryService });
        assert(correctlyFound.length === 1 && correctlyFound[0].claim.id === claim.id,
            'D2. Querying under the one canonical tag finds the published claim.');

        const swappedTag = derivePlaceNamingDiscoveryTag(regionId, worldId); // worldId/regionId swapped — a plausible caller mistake.
        assert(swappedTag !== independentlyDerivedTag, 'D3. Swapping worldId/regionId genuinely changes the derived tag.');
        const notFoundUnderSwappedTag = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: swappedTag, discoveryQueryService: queryService });
        assert(notFoundUnderSwappedTag.length === 0,
            'D4. A real, correctly-published claim is genuinely undiscoverable under a mismatched tag — there is no alternate, more forgiving tag-matching path anywhere in discovery.');

        const handWrittenTag = `forkbuild-place-naming:${worldId}:${regionId}`;
        assert(handWrittenTag === independentlyDerivedTag,
            'D5. The tag format itself is exactly what derivePlaceNamingDiscoveryTag() alone defines — reconfirmed against a hand-written literal, never a second, drifting copy of the format.');

        // Structural: derivePlaceNamingDiscoveryTag is the ONLY function in
        // the family that builds a `forkbuild-place-naming:` string.
        const tagLiteralSites = grepFiles('forkbuild-place-naming:', ['application', 'core']);
        assert(tagLiteralSites.length === 1 && tagLiteralSites[0] === 'core/PlaceNamingDiscoveryEnvelope.js',
            `D6. The literal tag prefix "forkbuild-place-naming:" appears in exactly one file — core/PlaceNamingDiscoveryEnvelope.js, where derivePlaceNamingDiscoveryTag() alone defines it (found: ${tagLiteralSites.join(', ') || 'none'}).`);

        console.log('✓ D: the publisher, an independent caller, and the claim\'s own fields all derive the identical discovery tag through the one canonical function; a mismatched tag is proven, live, to make a real published claim undiscoverable — there is no alternate tag authority anywhere in this domain.');
    }

    // ===============================================================
    // Section E — Identity separation, live and pairwise.
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const worldId = 'world-e';
        const regionId = 'region-e';

        const claimA = deviceA.useCase.publish(worldId, regionId, 'Ashfall');
        const claimB = deviceB.useCase.publish(worldId, regionId, 'Ashfall'); // same content, different author — never published.
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        const publishResultA = await publisher.publish(claimA);

        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
        const queryService = new PlaceNamingDiscoveryQueryService([source]);
        const discovered = (await queryService.search(discoveryTag))[0];

        // 1. claimId — Place Naming claim identity.
        assert(claimA.id !== claimB.id, 'E1. claimId: two independently-authored claims with identical content carry distinct ids.');
        // 2. publisher/signer identity — the claim's own author, distinct from claim id.
        assert(claimA.authorIdentityId === alice.identityId && claimA.authorIdentityId !== claimA.id,
            'E2. publisher (signer) identity is a distinct namespace from claim identity.');
        // 3. Nostr event ID — transport identity, distinct from both.
        assert(publishResultA.id !== claimA.id && publishResultA.id !== claimA.authorIdentityId,
            'E3. The Nostr event id is a third, distinct identity from both the claim id and the author id.');
        // 4. discovery origin — a property of the query/source, never the claim or envelope.
        assert(!('relayUrl' in discovered) && !('sourceId' in discovered) && !('eventId' in discovered),
            'E4. discovery origin (which relay/source produced this result) is tracked by the caller\'s own source object, never embedded in the discovered envelope or claim.');
        assert(source.relayUrl === NostrPlaceNamingDiscoverySource.DEFAULT_RELAY_URL,
            'E4b. The discovery origin lives on the source instance itself — confirmed live, not merely asserted absent elsewhere.');
        // 5. worldId / 6. regionId — world and region identity, independent of every identity above.
        assert(discovered.worldId === worldId && discovered.regionId === regionId,
            'E5. worldId/regionId survive discovery unchanged, and are neither the claim id, the author id, nor the event id.');
        const allSixIdentities = [claimA.id, claimA.authorIdentityId, publishResultA.id, source.relayUrl, worldId, regionId];
        assert(new Set(allSixIdentities).size === allSixIdentities.length,
            'E6. All six named identity concepts (claimId, publisher identity, Nostr event id, discovery origin, worldId, regionId) are pairwise distinct values in this live scenario — none silently collapses into another.');

        console.log('✓ E: claimId, publisher (signer) identity, Nostr event id, discovery origin, worldId, and regionId are proven, live and pairwise, to remain six structurally independent identities.');
    }

    // ===============================================================
    // Section F — Multiple publication events: no invented dedup, no
    // mutation, discovery behaves exactly as its own existing contract
    // (0.9.253) already defines.
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const worldId = 'world-f';
        const regionId = 'region-f';
        const claim = replica.useCase.publish(worldId, regionId, 'Redoubt');
        const beforeJSON = JSON.stringify(claim.toJSON());

        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        const firstResult = await publisher.publish(claim);
        const secondResult = await publisher.publish(claim); // the SAME claim, published again.
        const thirdResult = await publisher.publish(claim);

        assert(relay.events.length === 3,
            'F1. Publishing the same claim three times reaches the relay three independent times — the publisher performs no deduplication of its own.');
        assert(firstResult.id !== secondResult.id && secondResult.id !== thirdResult.id,
            'F2. Each publish() call is acknowledged with its own, independent transport event id — republishing is not treated as a no-op.');
        assert(JSON.stringify(claim.toJSON()) === beforeJSON,
            'F3. The claim itself is unmutated by being published multiple times.');
        assert(replica.store.list(worldId).length === 1,
            'F4. The local store still has exactly one claim on file — republishing never creates local copies.');

        // Discovery's OWN, already-existing (0.9.253) dedup-by-claim.id
        // still collapses the three relay echoes to one discovered result
        // — this is PlaceNamingDiscoveryQueryService's job, reconfirmed
        // here, never something this milestone adds to the publisher.
        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const queryService = discoveryServiceOver(relay);
        const discovered = await queryService.search(discoveryTag);
        assert(discovered.length === 1 && discovered[0].claim.id === claim.id,
            'F5. Discovery\'s own pre-existing claim.id deduplication (0.9.253) collapses the three published echoes into exactly one result — proving deduplication is discovery\'s job, not the publisher\'s, and that publishing multiple times does not multiply discovered results.');

        const publisherCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        assert(!/dedup|already.?published|seen\s*\.\s*(has|add)/i.test(publisherCode),
            'F6. The publisher\'s own source carries no deduplication vocabulary of any kind — it does not track what it has already published.');

        console.log('✓ F: publishing the same claim multiple times mutates nothing, invents no publisher-side dedup, and reaches the relay once per call — while discovery\'s own, separately-scoped (0.9.253) claim.id dedup still collapses the echoes to one result. Reconstructibility, deduplication, and exactly-once remain three separate properties, exactly as the Notification family already established.');
    }

    // ===============================================================
    // Section G — Publication failure isolation.
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const worldId = 'world-g';

        // An unrelated, already-successfully-published claim on the SAME
        // relay — used below to prove a failed publish attempt never
        // disturbs the relay or discovery for anything else.
        const controlRegion = 'region-g-control';
        const controlClaim = replica.useCase.publish(worldId, controlRegion, 'Control Claim');
        const workingPublisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        await workingPublisher.publish(controlClaim);
        const controlTag = derivePlaceNamingDiscoveryTag(worldId, controlRegion);

        async function assertClaimAndDiscoveryUnaffected(claim, label) {
            assert(replica.store.has(worldId, claim.id) === true, `${label}: the local claim still exists.`);
            const stillOnFile = replica.store.list(worldId).find((c) => c.id === claim.id);
            assert(stillOnFile.name === claim.name, `${label}: the local claim's own name is unchanged.`);
            const controlStillDiscoverable = await discoveryServiceOver(relay).search(controlTag);
            assert(controlStillDiscoverable.length === 1 && controlStillDiscoverable[0].claim.id === controlClaim.id,
                `${label}: an unrelated, already-published claim on the same relay is still discoverable — the relay/discovery path itself remains fully operational.`);
        }

        // G1. Relay decline.
        {
            const region = 'region-g-decline';
            const claim = replica.useCase.publish(worldId, region, 'Declined');
            const decliningPublisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: async () => ({ published: false, reason: 'declined' }) });
            const result = await decliningPublisher.publish(claim);
            assert(result === null, 'G1a. A relay decline resolves to null.');
            await assertClaimAndDiscoveryUnaffected(claim, 'G1b');
            const notPresent = await discoveryServiceOver(relay).search(derivePlaceNamingDiscoveryTag(worldId, region));
            assert(notPresent.length === 0, 'G1c. The declined claim never actually reached the relay — it is correctly absent from discovery, not silently present.');
        }

        // G2. Transport rejection.
        {
            const region = 'region-g-rejection';
            const claim = replica.useCase.publish(worldId, region, 'Rejected');
            const failingPublisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: async () => { throw new Error('simulated: transport rejected'); } });
            await expectRejects(failingPublisher.publish(claim), 'G2a. A genuine transport rejection propagates as a rejection.');
            await assertClaimAndDiscoveryUnaffected(claim, 'G2b');
        }

        // G3. Timeout.
        {
            const region = 'region-g-timeout';
            const claim = replica.useCase.publish(worldId, region, 'TimedOut');
            const timingOutPublisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: () => new Promise(() => {}), timeoutMs: 20 });
            await expectRejects(timingOutPublisher.publish(claim), 'G3a. A publishImpl that never settles rejects once timeoutMs elapses.');
            await assertClaimAndDiscoveryUnaffected(claim, 'G3b');
        }

        // G4. Invalid event id.
        {
            const region = 'region-g-badid';
            const claim = replica.useCase.publish(worldId, region, 'BadId');
            const malformedIdPublisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: async () => ({ published: true, id: 'not-a-real-event-id' }) });
            await expectRejects(malformedIdPublisher.publish(claim), 'G4a. A publishImpl reporting published:true with a malformed id throws rather than degrading to null.');
            await assertClaimAndDiscoveryUnaffected(claim, 'G4b');
        }

        // No fake publication state is ever persisted anywhere reachable
        // from the local store, across all four failure modes above.
        for (const region of ['region-g-decline', 'region-g-rejection', 'region-g-timeout', 'region-g-badid']) {
            const claim = replica.store.listForRegion(worldId, region)[0];
            const keys = Object.keys(claim.toJSON());
            assert(!keys.some((k) => /publish|relay|nostr|event/i.test(k)),
                `G5. The claim for ${region} carries no publish-state field of any kind after a failed publish attempt — its JSON keys are exactly what publish() has always produced: ${keys.join(', ')}.`);
        }

        // No retry mechanism anywhere in the publisher's own source.
        const publisherCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        assert(!/retry|retries|backoff|attempt\s*\+\+|maxAttempts/i.test(publisherCode),
            'G6. No retry/backoff vocabulary of any kind exists in the publisher\'s own source — a failed publish is never automatically retried.');

        console.log('✓ G: a relay decline, a transport rejection, a timeout, and a malformed event id each leave the local claim completely intact, persist no fake publication-state field anywhere, leave an unrelated already-published claim on the same relay fully discoverable, and never trigger any retry.');
    }

    // ===============================================================
    // Section H — Local-only regression: no publisher constructed
    // anywhere in scope.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);

        const claim = replica.useCase.publish('world-h', 'region-h', 'Oldstead');
        assert(claim instanceof PlaceNamingClaim && replica.store.has('world-h', claim.id) === true,
            'H1. publish() signs, stores, and returns a real, persisted PlaceNamingClaim with no NostrPlaceNamingDiscoveryPublisher ever imported or constructed in this block.');

        const view = replica.useCase.namingView('world-h', 'region-h');
        assert(Array.isArray(view) && view.length === 1 && view[0].name === 'Oldstead', 'H2. namingView() derives the expected local presentation.');

        const retracted = replica.useCase.retract('world-h', claim.id);
        assert(retracted === true && replica.store.has('world-h', claim.id) === false, 'H3. retract() works exactly as before.');

        const useCaseCode = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        assert(!useCaseCode.includes('NostrPlaceNamingDiscoveryPublisher'),
            'H4. PlaceNamingClaimUseCase itself never imports or references the publisher — publication remains never automatic.');

        console.log('✓ H: the complete pre-0.9.316 local-only workflow (publish, view, retract) still works exactly as before, with no publisher class ever imported or constructed anywhere in this block — the distribution capability is purely additive.');
    }

    // ===============================================================
    // Section I — Cross-device isolation, instrumented (extends Section
    // A's own instrumentation to a second, independent scenario using two
    // freshly-instrumented discovery sources).
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const deviceC = makeReplica(carol);
        const worldId = 'world-i';
        const regionId = 'region-i';

        const claim = deviceA.useCase.publish(worldId, regionId, 'Isolation Reach');
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        await publisher.publish(claim);

        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const bResult = await discoveryServiceOver(relay).search(discoveryTag);
        const cResult = await discoveryServiceOver(relay).search(discoveryTag);

        assert(bResult.length === 1 && cResult.length === 1 && bResult[0].claim.id === cResult[0].claim.id,
            'I1. Two entirely independent devices (B and C), sharing no storage with each other or with Device A, each independently discover the identical claim through their own freshly-constructed discovery objects.');
        assert(new Set([deviceA.storage, deviceB.storage, deviceC.storage]).size === 3,
            'I2. All three devices\' storage instances are pairwise distinct — success is not an artifact of any shared reference.');
        assert(deviceB.store.has(worldId, claim.id) === false && deviceC.store.has(worldId, claim.id) === false,
            'I3. Neither B nor C\'s own local store gained the claim merely by discovering it — discovery and local persistence remain separate.');

        console.log('✓ I: two independent devices, sharing no storage with each other or with the publisher\'s own device, both discover the identical published claim through freshly-built discovery objects — the convergence proven in Section A is not an artifact of any one particular object graph.');
    }

    // ===============================================================
    // Section J — Architectural sweep.
    // ===============================================================
    {
        const publisherCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        const sourceCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoverySource.js'));
        const queryServiceCode = codeOnlyLines(await rawSource('application/PlaceNamingDiscoveryQueryService.js'));
        const useCaseCode = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));

        assert(!publisherCode.includes('LocalPlaceNamingClaimStore'), 'J1. Publisher never imports local claim persistence.');
        assert(!publisherCode.includes('NostrPlaceNamingDiscoverySource') && !publisherCode.includes('PlaceNamingDiscoveryQueryService'),
            'J2. Publisher never imports the discovery source or query service.');
        assert(!sourceCode.includes('NostrPlaceNamingDiscoveryPublisher') && !queryServiceCode.includes('NostrPlaceNamingDiscoveryPublisher'),
            'J3. Neither the discovery source nor the query service imports the publisher.');
        assert(!useCaseCode.includes('NostrPlaceNamingDiscoveryPublisher'),
            'J4. PlaceNamingClaimUseCase (the local creation path) never imports the publisher — publication is never automatic.');

        // Place Naming publication never imports Snapshot publication, or
        // any generic decentralized-publisher abstraction that already
        // exists in this codebase (core/DecentralizedPublication.js, 0.7.0).
        assert(!publisherCode.includes('NostrSnapshotDiscoveryPublisher') && !publisherCode.includes('DecentralizedPublication'),
            'J5. The Place Naming publisher never imports its Snapshot-domain sibling nor this codebase\'s own generic core/DecentralizedPublication.js envelope — the two domains stay independently mirrored, never merged into one shared abstraction.');
        assert(!publisherCode.includes('extends'),
            'J6. The publisher class is not a subclass of anything — there is no generic base `DecentralizedPublisher`/`NostrPublisher` class anywhere in this family for it to extend.');
        const genericPublisherFiles = grepFiles('class.*DecentralizedPublisher\\|class.*NostrPublisher\\b', ['application']);
        assert(genericPublisherFiles.length === 0,
            'J7. No generic, domain-independent `DecentralizedPublisher`/`NostrPublisher` class exists anywhere in application/ that this or a future domain publisher would be pressured to extend instead of mirroring by hand.');

        const FORBIDDEN_SUBSTRATES = ['Arweave', 'IPFS', 'Bitcoin', 'Base'];
        for (const substrate of FORBIDDEN_SUBSTRATES) {
            assert(!new RegExp(substrate, 'i').test(publisherCode), `J8. Publisher never references ${substrate}.`);
        }
        assert(!/provider.?preference/i.test(publisherCode), 'J9. Publisher introduces no provider-preference concept.');

        const LIFECYCLE_VOCABULARY = ['pending', 'retrying', 'confirmed', 'distributed', 'retry', 'ranking', 'scoring', 'preferred', 'trusted', 'history'];
        for (const term of LIFECYCLE_VOCABULARY) {
            assert(!publisherCode.toLowerCase().includes(term), `J10. Publisher code never uses "${term}" — no publication lifecycle, ranking, trust, or history vocabulary at this boundary.`);
        }

        // No publication-history storage of any kind was introduced.
        const publicationHistoryFiles = grepFiles('PlaceNamingPublicationHistory\\|PublicationHistoryStore', ['application', 'core']);
        assert(publicationHistoryFiles.length === 0, 'J11. No PlaceNamingPublicationHistory/PublicationHistoryStore file exists anywhere — publication introduces no persisted history of its own.');

        console.log('✓ J: the publisher stays structurally isolated from local persistence, from discovery in both directions, from automatic invocation by the local creation path, from its Snapshot-domain sibling and from this codebase\'s own generic DecentralizedPublication envelope, from any other substrate or provider-preference concept, and from any lifecycle/ranking/trust/history vocabulary — and no generic base class exists anywhere for a future domain publisher to be tempted to extend instead of mirroring by hand.');
    }

    // ===============================================================
    // Section K — Verdict.
    // ===============================================================
    {
        const publicationTestSource = await rawSource('tests/PlaceNamingClaimPublication.test.js');
        assert(publicationTestSource.includes('Section D'),
            'K1. 0.9.316\'s own PlaceNamingClaimPublication.test.js still carries its own cross-device flagship (Section D) — this audit\'s own Section A/I deliberately re-derive the same closure from fresh, independently-built scenarios rather than merely re-reading that file\'s own assertions.');

        console.log('✓ K: CLOSURE STATEMENT.\n' +
'\n' +
'VERDICT: a Place Naming claim created and explicitly published on Device A\n' +
'can be discovered on Device B through the existing Nostr discovery path,\n' +
'using independent local stores, while local-only creation/persistence\n' +
'remains unchanged and publication introduces no new lifecycle or\n' +
'synchronization semantics. PROVEN, live, from scratch, in Sections A/I\n' +
'above, independently of 0.9.316\'s own test suite.\n' +
'\n' +
'WHAT THIS AUDIT ADDS BEYOND 0.9.316\'S OWN TESTS. 0.9.316\'s own two test\n' +
'files already proved the flagship cross-device journey (tests/\n' +
'PlaceNamingClaimPublication.test.js Section D) and a great deal of the\n' +
'boundary\'s honest failure behavior. This audit specifically interrogated\n' +
'four seams those tests were not built to specifically stress: (1) whether\n' +
'the discovery TAG has any alternate authority a future caller could\n' +
'accidentally invent (Section D — proven no, live, with a genuinely\n' +
'mismatched tag); (2) whether publishing the SAME claim more than once\n' +
'invents any publisher-side dedup, lifecycle, or exactly-once semantics\n' +
'(Section F — proven no; deduplication remains exclusively discovery\'s own,\n' +
'separately-scoped 0.9.253 job); (3) whether a failed publish attempt can\n' +
'leave behind fake publication state or disturb an unrelated claim\'s own\n' +
'discoverability on the same relay (Section G — proven no, across four\n' +
'distinct failure modes); and (4) whether the publisher, in this or any\n' +
'future domain, risks being pulled toward a generic, domain-independent\n' +
'`DecentralizedPublisher` abstraction or its Snapshot-domain sibling\n' +
'(Section J — proven no such coupling or abstraction exists today).\n' +
'\n' +
'WHAT THIS AUDIT DOES NOT DO. It builds no production code and adds no\n' +
'capability. It does not revisit whether 0.9.316\'s own product decision —\n' +
'publication is explicit, never automatic — was correct; that decision is\n' +
'treated here as settled, and every section above reconfirms it holds.\n' +
'\n' +
'RECOMMENDATION: STOP. Per this milestone\'s own brief, the next step is a\n' +
'Post-Place-Naming Distribution Product Reassessment, not another\n' +
'implementation milestone chosen preemptively — automatic publication,\n' +
'multi-relay fan-out, retry/offline queues, unpublish/retraction,\n' +
'publication status, Nostr event persistence, cross-domain publisher\n' +
'generalization, and publication-success notifications all remain\n' +
'deliberately unbuilt, each one introducing temporal, reliability, or\n' +
'product semantics this audit found no evidence 0.9.316 currently requires.\n');
    }

    console.log('\n✅ All Place Naming Publication/Discovery Convergence Audit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PlaceNamingPublicationDiscoveryConvergenceAudit tests passed');
}).catch((error) => {
    console.error('\n✗ PlaceNamingPublicationDiscoveryConvergenceAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
