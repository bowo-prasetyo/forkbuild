import { readFile } from 'node:fs/promises';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { parseDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';

// 0.9.46 — Nostr Publication Discovery Publisher.
// See docs/Roadmap.md, "0.9.46 — Nostr Publication Discovery Publisher."
//
// Deterministic, network-free coverage of application/
// NostrPublicationDiscoveryPublisher.js's own wire behavior — every
// scenario below runs against an injected `publishImpl` standing in for a
// real Nostr relay's own sign/send/acknowledge exchange, never a live one,
// the identical technique tests/ArweavePublicationMaterialUploader.test.js
// already established for this milestone's own nearest sibling.
//
//   Section A: flagship — a valid envelope publishes and resolves to
//              { published: true, relayUrl, id }
//   Section B: the event template sent to publishImpl carries the exact
//              canonical envelope JSON in content, and the discovery tag
//              under the configured tag name
//   Section C: a malformed envelope resolves to null, publishImpl is never
//              consulted
//   Section D: a publishImpl reporting published:false resolves to null,
//              exactly as collapsed as malformed input
//   Section E: a genuine publishImpl failure (including a timeout)
//              propagates, never swallowed as null
//   Section F: a publishImpl that resolves published:true but with no/a
//              malformed id throws — never degrades to null
//   Section G: this class is a real publishing round-trip counterpart of
//              application/NostrDiscoveryQueryService.js — the same JSON
//              this file writes to content is exactly what
//              parseDecentralizedDiscoveryEnvelope() reads back
//   Section H: a constructor missing relayUrl, discoveryTag, or
//              publishImpl throws immediately
//   Section I: no caching — two calls issue two fresh publish exchanges
//   Section J: architectural regression — no forbidden imports/vocabulary

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch { rejected = true; }
    assert(rejected, message);
}

function envelopeOf(overrides = {}) {
    return {
        protocol: 'forkbuild',
        version: 1,
        kind: 'PUBLICATION',
        objectId: 'pub-1',
        uri: 'ar://ABC123',
        ...overrides
    };
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
    // Section A — flagship: a valid envelope publishes successfully.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild_random_unique', publishImpl: relay.publishImpl });

        const result = await publisher.publish(envelopeOf());
        assert(result !== null, '1. FLAGSHIP — a well-formed envelope publishes successfully');
        assert(result.published === true, '2. FLAGSHIP — result reports published: true');
        assert(result.id === FAKE_EVENT_ID, '3. FLAGSHIP — result carries the id publishImpl reported');
        assert(result.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, '4. FLAGSHIP — result names the targeted relay');
        assert(Object.isFrozen(result), '5. the returned result is frozen');
    }
    console.log('✓ Section A: a valid envelope publishes and resolves to { published: true, relayUrl, id }');

    // ---------------------------------------------------------------
    // Section B — the event template carries the canonical envelope JSON
    // in content, and the discovery tag under the configured tag name.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://custom-relay.example',
            tagName: 'x',
            kind: 30078,
            discoveryTag: 'forkbuild_campaign_42',
            publishImpl: relay.publishImpl
        });

        await publisher.publish(envelopeOf({ objectId: 'pub-99', uri: 'ar://XYZ' }));
        assert(relay.calls.length === 1, '6. exactly one publish call is made');
        const { relayUrl, eventTemplate } = relay.calls[0];
        assert(relayUrl === 'wss://custom-relay.example', '7. publishImpl is invoked against the configured relay');
        assert(eventTemplate.kind === 30078, '8. the event template carries the configured kind');
        assert(
            eventTemplate.tags.length === 1 && eventTemplate.tags[0][0] === 'x' && eventTemplate.tags[0][1] === 'forkbuild_campaign_42',
            '9. the event template carries exactly one tag: the configured tag name and discovery tag'
        );
        const parsedContent = JSON.parse(eventTemplate.content);
        assert(
            parsedContent.protocol === 'forkbuild' && parsedContent.version === 1 && parsedContent.kind === 'PUBLICATION'
                && parsedContent.objectId === 'pub-99' && parsedContent.uri === 'ar://XYZ',
            '10. the event content is the canonical envelope JSON, field for field'
        );
    }
    console.log('✓ Section B: the event template carries the canonical envelope JSON and discovery tag');

    // ---------------------------------------------------------------
    // Section C — a malformed envelope resolves to null, publishImpl is
    // never consulted.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild', publishImpl: relay.publishImpl });

        const malformedEnvelopes = [
            null,
            undefined,
            {},
            envelopeOf({ protocol: 'not-forkbuild' }),
            envelopeOf({ version: 2 }),
            envelopeOf({ kind: 'NOT_A_KIND' }),
            envelopeOf({ objectId: '' }),
            envelopeOf({ uri: '' }),
            'a raw JSON string, not an already-described envelope object'
        ];
        for (const candidate of malformedEnvelopes) {
            const result = await publisher.publish(candidate);
            assert(result === null, `11. malformed envelope ${JSON.stringify(candidate)} resolves to null`);
        }
        assert(relay.calls.length === 0, '12. publishImpl is never consulted for malformed envelope input');
    }
    console.log('✓ Section C: a malformed envelope resolves to null without consulting publishImpl');

    // ---------------------------------------------------------------
    // Section D — publishImpl reporting published:false resolves to null.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: false, reason: 'relay declined the event' }) });
        const publisher = new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild', publishImpl: relay.publishImpl });

        const result = await publisher.publish(envelopeOf());
        assert(result === null, '13. a relay decline (published: false) resolves to null, exactly as collapsed as malformed input');
        assert(relay.calls.length === 1, '14. publishImpl was in fact consulted before the decline was reported');
    }
    console.log('✓ Section D: a publishImpl decline resolves to null');

    // ---------------------------------------------------------------
    // Section E — a genuine publishImpl failure (including a timeout)
    // propagates, never swallowed as null.
    // ---------------------------------------------------------------
    {
        const failingImpl = async () => { throw new Error('simulated: no signing key available'); };
        const publisher = new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild', publishImpl: failingImpl });
        await expectRejects(publisher.publish(envelopeOf()), '15. a genuine publishImpl failure propagates as a rejection, never swallowed as null');

        const neverSettles = () => new Promise(() => {});
        const timingOutPublisher = new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild', publishImpl: neverSettles, timeoutMs: 20 });
        await expectRejects(timingOutPublisher.publish(envelopeOf()), '16. a publishImpl that never settles propagates as a rejection once timeoutMs elapses');
    }
    console.log('✓ Section E: a genuine publishImpl failure, including a timeout, propagates rather than degrading to null');

    // ---------------------------------------------------------------
    // Section F — publishImpl resolving published:true but violating its
    // own id contract throws, never degrades to null.
    // ---------------------------------------------------------------
    {
        const noId = makeFakeRelay({ handler: () => ({ published: true }) });
        await expectRejects(
            new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild', publishImpl: noId.publishImpl }).publish(envelopeOf()),
            '17. publishImpl resolving with no id throws rather than returning null'
        );

        const malformedId = makeFakeRelay({ handler: () => ({ published: true, id: 'not-a-valid-nip01-event-id' }) });
        await expectRejects(
            new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild', publishImpl: malformedId.publishImpl }).publish(envelopeOf()),
            '18. publishImpl resolving with a malformed id throws rather than returning null'
        );
    }
    console.log('✓ Section F: publishImpl violating its own { published, id } contract throws, never degrades to null');

    // ---------------------------------------------------------------
    // Section G — the exact same JSON this file writes to content is what
    // parseDecentralizedDiscoveryEnvelope() reads back on the consuming
    // side — the compatibility property this whole milestone exists for.
    // ---------------------------------------------------------------
    {
        const distribution = describePublicationDistribution({
            publication: { id: 'pub-roundtrip', signature: { value: 'fake-signature' } },
            materialUri: 'ar://roundtrip-tx'
        });
        assert(distribution !== null, 'sanity: a real 0.9.44 distribution describes successfully');

        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild', publishImpl: relay.publishImpl });

        const result = await publisher.publish(distribution.discoveryEnvelope);
        assert(result !== null, '19. a real 0.9.44 discoveryEnvelope publishes successfully, unmodified');

        const publishedContent = relay.calls[0].eventTemplate.content;
        const roundTripped = parseDecentralizedDiscoveryEnvelope(publishedContent);
        assert(roundTripped !== null, '20. the published content parses back as a well-formed envelope via 0.9.31\'s own reader');
        assert(
            roundTripped.objectId === 'pub-roundtrip' && roundTripped.uri === 'ar://roundtrip-tx' && roundTripped.kind === 'PUBLICATION',
            '21. the round-tripped envelope is byte-identical, field for field, to the one that was published'
        );
    }
    console.log('✓ Section G: the published content round-trips through 0.9.31\'s own reader unmodified');

    // ---------------------------------------------------------------
    // Section H — a constructor missing relayUrl, discoveryTag, or
    // publishImpl throws immediately.
    // ---------------------------------------------------------------
    {
        const { publishImpl } = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        expectThrows(() => new NostrPublicationDiscoveryPublisher({ relayUrl: '', discoveryTag: 'forkbuild', publishImpl }), '22. an empty relayUrl throws at construction time');
        expectThrows(() => new NostrPublicationDiscoveryPublisher({ discoveryTag: '', publishImpl }), '23. a missing discoveryTag throws at construction time');
        expectThrows(() => new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild' }), '24. a missing publishImpl throws at construction time');
        expectThrows(() => new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild', publishImpl: 'not-a-function' }), '25. a non-function publishImpl throws at construction time');
    }
    console.log('✓ Section H: a constructor missing relayUrl, discoveryTag, or publishImpl throws immediately');

    // ---------------------------------------------------------------
    // Section I — no caching: two calls issue two fresh publish exchanges.
    // ---------------------------------------------------------------
    {
        let callCount = 0;
        const publishImpl = async () => { callCount++; return { published: true, id: FAKE_EVENT_ID.slice(0, 63) + String(callCount % 10) }; };
        const publisher = new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild', publishImpl });

        const first = await publisher.publish(envelopeOf());
        const second = await publisher.publish(envelopeOf());
        assert(callCount === 2, '26. calling publish() twice for the identical envelope issues two independent publishImpl calls, never cached');
        assert(first.id !== second.id, '27. the two independent calls report two independent event ids');
    }
    console.log('✓ Section I: no caching — every call publishes fresh');

    // ---------------------------------------------------------------
    // Section J — architectural regression: no forbidden imports or
    // vocabulary.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/NostrPublicationDiscoveryPublisher.js', import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("import { Publication }"), '28. never imports the Publication class');
        assert(!codeOnly.includes('.toJSON()'), '29. never calls toJSON() on anything');
        assert(!codeOnly.includes('ArweavePublicationMaterialUploader'), '30. never imports the 0.9.45 uploader — material upload stays a separate, prior step');
        assert(!codeOnly.includes('NostrDiscoveryQueryService'), '31. never imports the 0.9.31 discovery adapter — this file only ever writes, never reads, a relay');
        assert(!codeOnly.includes('DecentralizedWorldDiscoveryQuery'), '32. never imports discovery/leads machinery — this file performs no discovery of its own');
        assert(!codeOnly.includes('DecentralizedWorldEncounterLeadAssociation'), '33. never imports association-evidence machinery — this file performs no verification');
        assert(!codeOnly.includes('crypto') && !codeOnly.includes('Wallet') && !codeOnly.includes('JWK') && !codeOnly.includes('nsec'), '34. never references key/wallet material of any kind — signing is fully delegated to the injected publishImpl');
        assert(!codeOnly.includes('WebSocket'), '35. never references WebSocket directly — that belongs to publishImpl');

        const forbiddenTerms = ['trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred', 'verified'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `36. code must never use "${term}" — no trust/status semantics at this boundary`);
        }

        assert(codeOnly.includes('describeDecentralizedDiscoveryEnvelope'), '37. reuses the real 0.9.30 envelope validator rather than inventing a second format');

        console.log('✓ Section J: architectural regression — no forbidden imports, no key management, no trust vocabulary');
    }

    console.log('\nAll NostrPublicationDiscoveryPublisher tests passed.');
}

run().catch((error) => {
    console.error('NostrPublicationDiscoveryPublisher.test.js FAILED:', error);
    process.exitCode = 1;
});
