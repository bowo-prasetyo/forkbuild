import { readFile } from 'node:fs/promises';

import { NostrPlaceNamingDiscoveryPublisher } from '../application/NostrPlaceNamingDiscoveryPublisher.js';
import { parsePlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.316 — Place Naming Claim Publication Boundary.
// See docs/Roadmap.md, "0.9.316 — Place Naming Claim Publication Boundary."
//
// Deterministic, network-free coverage of application/
// NostrPlaceNamingDiscoveryPublisher.js's own wire behavior — the identical
// technique tests/NostrSnapshotDiscoveryPublisher.test.js already
// established for its own sibling, adapted to this file's own
// claim-shaped, rather than raw-fields-shaped, input.
//
//   Section A: flagship — an existing, signed PlaceNamingClaim publishes
//              and resolves to { published: true, relayUrl, id, discoveryTag }
//   Section B: the event template carries the canonical discovery envelope
//              JSON in content, and a tag DERIVED from the claim's own
//              worldId/regionId — never a caller-supplied one
//   Section C: an unsigned or non-PlaceNamingClaim input throws
//              synchronously, publishImpl is never consulted
//   Section D: a publishImpl reporting published:false resolves to null
//   Section E: a genuine publishImpl failure (including a timeout)
//              propagates, never swallowed as null
//   Section F: a publishImpl that resolves published:true but with no/a
//              malformed id throws — never degrades to null
//   Section G: the published content round-trips through
//              parsePlaceNamingDiscoveryEnvelope() unmodified
//   Section H: a constructor missing relayUrl or publishImpl throws
//              immediately
//   Section I: no caching — two calls issue two fresh publish exchanges
//   Section J: architectural regression — no forbidden imports/vocabulary

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch { rejected = true; }
    assert(rejected, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeSignedClaim({ worldId = 'world-1', regionId = 'region-1', name = 'Riverbend' } = {}) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    const identity = identityProvider.createLocalIdentity('Alice');
    identityProvider.authenticate(identity.identityId);
    const store = new LocalPlaceNamingClaimStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    return useCase.publish(worldId, regionId, name);
}

function makeFakeRelay({ handler }) {
    const calls = [];
    async function publishImpl(relayUrl, eventTemplate) {
        calls.push({ relayUrl, eventTemplate });
        return handler(relayUrl, eventTemplate);
    }
    return { calls, publishImpl };
}

const FAKE_EVENT_ID = 'a'.repeat(64);

async function run() {
    // ---------------------------------------------------------------
    // Section A — flagship: a signed claim publishes successfully.
    // ---------------------------------------------------------------
    {
        const claim = makeSignedClaim();
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });

        const result = await publisher.publish(claim);
        assert(result !== null, '1. FLAGSHIP — a signed claim publishes successfully');
        assert(result.published === true, '2. FLAGSHIP — result reports published: true');
        assert(result.id === FAKE_EVENT_ID, '3. FLAGSHIP — result carries the id publishImpl reported');
        assert(result.relayUrl === NostrPlaceNamingDiscoveryPublisher.DEFAULT_RELAY_URL, '4. FLAGSHIP — result names the targeted relay');
        assert(result.discoveryTag === derivePlaceNamingDiscoveryTag(claim.worldId, claim.regionId), '5. FLAGSHIP — result names the tag derived from the claim itself');
        assert(Object.isFrozen(result), '6. the returned result is frozen');
    }
    console.log('✓ Section A: a signed claim publishes and resolves to { published: true, relayUrl, id, discoveryTag }');

    // ---------------------------------------------------------------
    // Section B — the event template carries the canonical envelope JSON
    // in content, and a discovery tag DERIVED from the claim, never
    // supplied by a caller.
    // ---------------------------------------------------------------
    {
        const claim = makeSignedClaim({ worldId: 'world-42', regionId: 'region-42', name: 'Campaign Camp' });
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrPlaceNamingDiscoveryPublisher({
            relayUrl: 'wss://custom-relay.example',
            tagName: 'x',
            kind: 30078,
            publishImpl: relay.publishImpl
        });

        await publisher.publish(claim);
        assert(relay.calls.length === 1, '7. exactly one publish call is made');
        const { relayUrl, eventTemplate } = relay.calls[0];
        assert(relayUrl === 'wss://custom-relay.example', '8. publishImpl is invoked against the configured relay');
        assert(eventTemplate.kind === 30078, '9. the event template carries the configured kind');
        const expectedTag = derivePlaceNamingDiscoveryTag('world-42', 'region-42');
        assert(
            eventTemplate.tags.length === 1 && eventTemplate.tags[0][0] === 'x' && eventTemplate.tags[0][1] === expectedTag,
            '10. the event template carries exactly one tag: the configured tag name and a tag derived from the claim\'s own worldId/regionId'
        );
        const parsedContent = JSON.parse(eventTemplate.content);
        assert(
            parsedContent.protocol === 'forkbuild-place-naming-discovery' && parsedContent.version === 1
                && parsedContent.worldId === 'world-42' && parsedContent.regionId === 'region-42'
                && parsedContent.claim.id === claim.id && parsedContent.claim.name === 'Campaign Camp',
            '11. the event content is the canonical Place Naming Discovery Envelope JSON, field for field, derived from the claim itself'
        );
    }
    console.log('✓ Section B: the event template carries the canonical envelope JSON and a claim-derived discovery tag');

    // ---------------------------------------------------------------
    // Section C — an unsigned or non-PlaceNamingClaim input throws
    // synchronously; publishImpl is never consulted.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });

        await expectRejects(publisher.publish(undefined), '12. a missing claim throws (rejects) rather than publishing');
        await expectRejects(publisher.publish({ worldId: 'w', regionId: 'r', name: 'x' }), '13. a plain object masquerading as a claim throws rather than publishing');

        const claim = makeSignedClaim();
        const unsignedClaim = claim.withSignature(null);
        await expectRejects(publisher.publish(unsignedClaim), '14. an unsigned claim throws rather than publishing');

        assert(relay.calls.length === 0, '15. publishImpl is never consulted for any malformed/unsigned candidate');
    }
    console.log('✓ Section C: a malformed or unsigned claim throws synchronously without consulting publishImpl');

    // ---------------------------------------------------------------
    // Section D — publishImpl reporting published:false resolves to null.
    // ---------------------------------------------------------------
    {
        const claim = makeSignedClaim();
        const relay = makeFakeRelay({ handler: () => ({ published: false, reason: 'relay declined the event' }) });
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });

        const result = await publisher.publish(claim);
        assert(result === null, '16. a relay decline (published: false) resolves to null');
        assert(relay.calls.length === 1, '17. publishImpl was in fact consulted before the decline was reported');
    }
    console.log('✓ Section D: a publishImpl decline resolves to null');

    // ---------------------------------------------------------------
    // Section E — a genuine publishImpl failure (including a timeout)
    // propagates, never swallowed as null.
    // ---------------------------------------------------------------
    {
        const claim = makeSignedClaim();
        const failingImpl = async () => { throw new Error('simulated: relay connection failed'); };
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: failingImpl });
        await expectRejects(publisher.publish(claim), '18. a genuine publishImpl failure propagates as a rejection, never swallowed as null');

        const neverSettles = () => new Promise(() => {});
        const timingOutPublisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: neverSettles, timeoutMs: 20 });
        await expectRejects(timingOutPublisher.publish(claim), '19. a publishImpl that never settles propagates as a rejection once timeoutMs elapses');
    }
    console.log('✓ Section E: a genuine publishImpl failure, including a timeout, propagates rather than degrading to null');

    // ---------------------------------------------------------------
    // Section F — publishImpl resolving published:true but violating its
    // own id contract throws, never degrades to null.
    // ---------------------------------------------------------------
    {
        const claim = makeSignedClaim();
        const noId = makeFakeRelay({ handler: () => ({ published: true }) });
        await expectRejects(
            new NostrPlaceNamingDiscoveryPublisher({ publishImpl: noId.publishImpl }).publish(claim),
            '20. publishImpl resolving with no id throws rather than returning null'
        );

        const malformedId = makeFakeRelay({ handler: () => ({ published: true, id: 'not-a-valid-nip01-event-id' }) });
        await expectRejects(
            new NostrPlaceNamingDiscoveryPublisher({ publishImpl: malformedId.publishImpl }).publish(claim),
            '21. publishImpl resolving with a malformed id throws rather than returning null'
        );
    }
    console.log('✓ Section F: publishImpl violating its own { published, id } contract throws, never degrades to null');

    // ---------------------------------------------------------------
    // Section G — the exact same JSON this file writes to content is what
    // parsePlaceNamingDiscoveryEnvelope() reads back on the consuming side.
    // ---------------------------------------------------------------
    {
        const claim = makeSignedClaim({ worldId: 'world-rt', regionId: 'region-rt', name: 'Roundtrip Hollow' });
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });

        const result = await publisher.publish(claim);
        assert(result !== null, '22. publishing succeeds');

        const publishedContent = relay.calls[0].eventTemplate.content;
        const roundTripped = parsePlaceNamingDiscoveryEnvelope(publishedContent);
        assert(roundTripped !== null, '23. the published content parses back as a well-formed envelope via this domain\'s own reader');
        assert(
            roundTripped.claim.id === claim.id && roundTripped.claim.name === 'Roundtrip Hollow'
                && roundTripped.worldId === 'world-rt' && roundTripped.regionId === 'region-rt',
            '24. the round-tripped envelope is byte-identical, field for field, to what was published'
        );
    }
    console.log('✓ Section G: the published content round-trips through this domain\'s own reader unmodified');

    // ---------------------------------------------------------------
    // Section H — a constructor missing relayUrl or publishImpl throws
    // immediately.
    // ---------------------------------------------------------------
    {
        const { publishImpl } = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        expectThrows(() => new NostrPlaceNamingDiscoveryPublisher({ relayUrl: '', publishImpl }), '25. an empty relayUrl throws at construction time');
        expectThrows(() => new NostrPlaceNamingDiscoveryPublisher({}), '26. a missing publishImpl throws at construction time');
        expectThrows(() => new NostrPlaceNamingDiscoveryPublisher({ publishImpl: 'not-a-function' }), '27. a non-function publishImpl throws at construction time');
    }
    console.log('✓ Section H: a constructor missing relayUrl or publishImpl throws immediately');

    // ---------------------------------------------------------------
    // Section I — no caching: two calls issue two fresh publish exchanges.
    // ---------------------------------------------------------------
    {
        const claim = makeSignedClaim();
        let callCount = 0;
        const publishImpl = async () => { callCount++; return { published: true, id: FAKE_EVENT_ID.slice(0, 63) + String(callCount % 10) }; };
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl });

        const first = await publisher.publish(claim);
        const second = await publisher.publish(claim);
        assert(callCount === 2, '28. calling publish() twice for the same claim issues two independent publishImpl calls, never cached');
        assert(first.id !== second.id, '29. the two independent calls report two independent event ids');
    }
    console.log('✓ Section I: no caching — every call publishes fresh');

    // ---------------------------------------------------------------
    // Section J — architectural regression: no forbidden imports or
    // vocabulary.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/NostrPlaceNamingDiscoveryPublisher.js', import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('LocalPlaceNamingClaimStore'), '30. never imports local persistence — see this file\'s own header, "local persistence independence"');
        assert(!codeOnly.includes('NostrPlaceNamingDiscoverySource') && !codeOnly.includes('PlaceNamingDiscoveryQueryService') && !codeOnly.includes('DiscoverPlaceNamingClaimsCommand'), '31. never imports anything from the discovery/read side of this domain');
        assert(!codeOnly.includes('PlaceNamingClaimUseCase'), '32. never imports or calls the one producer of a naming claim — it only ever receives an already-created instance');
        assert(!codeOnly.includes('Arweave') && !codeOnly.includes('IPFS') && !codeOnly.includes('Bitcoin') && !codeOnly.includes('Base')
            && !codeOnly.toLowerCase().includes('provider preference'), '33. no other substrate or provider-preference vocabulary of any kind');
        assert(!codeOnly.includes('WebSocket'), '34. never references WebSocket directly — that belongs to publishImpl');
        assert(!codeOnly.includes('crypto') && !codeOnly.includes('Wallet') && !codeOnly.includes('JWK') && !codeOnly.includes('nsec'), '35. never references key/wallet material of any kind — signing is fully delegated to the injected publishImpl');

        const forbiddenTerms = ['pending', 'retrying', 'confirmed', 'distributed', 'retry', 'ranking', 'scoring', 'preferred', 'trusted'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `36. code must never use "${term}" — no publication lifecycle or trust/status semantics at this boundary`);
        }

        assert(codeOnly.includes('buildPlaceNamingDiscoveryEnvelope') && codeOnly.includes('derivePlaceNamingDiscoveryTag'), '37. reuses this domain\'s own envelope builder and tag deriver rather than inventing a second format');

        console.log('✓ Section J: architectural regression — no forbidden imports, no key management, no lifecycle/trust vocabulary');
    }

    console.log('\nAll NostrPlaceNamingDiscoveryPublisher tests passed.');
}

run().catch((error) => {
    console.error('NostrPlaceNamingDiscoveryPublisher.test.js FAILED:', error);
    process.exitCode = 1;
});
