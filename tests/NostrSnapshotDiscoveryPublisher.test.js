import { readFile } from 'node:fs/promises';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { parseSnapshotDiscoveryEnvelope } from '../core/SnapshotDiscoveryEnvelope.js';

// 0.9.133 — Nostr Snapshot Discovery Publisher.
// See docs/Roadmap.md, "0.9.133 — Snapshot Location Discovery via Nostr."
//
// Deterministic, network-free coverage of application/
// NostrSnapshotDiscoveryPublisher.js's own wire behavior — every scenario
// below runs against an injected `publishImpl` standing in for a real
// Nostr relay's own sign/send/acknowledge exchange, never a live one, the
// identical technique tests/NostrPublicationDiscoveryPublisher.test.js
// already established for this file's own nearest sibling.
//
//   Section A: flagship — { contentHash, locator, storage } publishes and
//              resolves to { published: true, relayUrl, id }
//   Section B: the event template sent to publishImpl carries the exact
//              canonical envelope JSON in content, and the discovery tag
//              under the configured tag name
//   Section C: malformed input resolves to null, publishImpl is never
//              consulted
//   Section D: a publishImpl reporting published:false resolves to null
//   Section E: a genuine publishImpl failure (including a timeout)
//              propagates, never swallowed as null
//   Section F: a publishImpl that resolves published:true but with no/a
//              malformed id throws — never degrades to null
//   Section G: the published content round-trips through
//              parseSnapshotDiscoveryEnvelope() unmodified
//   Section H: a constructor missing relayUrl, discoveryTag, or
//              publishImpl throws immediately
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

function fieldsOf(overrides = {}) {
    return {
        contentHash: 'snapshot-hash-abc123',
        locator: 'ar://SnapshotTx000000000000000000001',
        storage: 'ar',
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
    // Section A — flagship: well-formed fields publish successfully.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relay.publishImpl });

        const result = await publisher.publish(fieldsOf());
        assert(result !== null, '1. FLAGSHIP — well-formed fields publish successfully');
        assert(result.published === true, '2. FLAGSHIP — result reports published: true');
        assert(result.id === FAKE_EVENT_ID, '3. FLAGSHIP — result carries the id publishImpl reported');
        assert(result.relayUrl === NostrSnapshotDiscoveryPublisher.DEFAULT_RELAY_URL, '4. FLAGSHIP — result names the targeted relay');
        assert(Object.isFrozen(result), '5. the returned result is frozen');
    }
    console.log('✓ Section A: well-formed fields publish and resolve to { published: true, relayUrl, id }');

    // ---------------------------------------------------------------
    // Section B — the event template carries the canonical envelope JSON
    // in content, and the discovery tag under the configured tag name.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrSnapshotDiscoveryPublisher({
            relayUrl: 'wss://custom-relay.example',
            tagName: 'x',
            kind: 30078,
            discoveryTag: 'forkbuild-snapshot-campaign-42',
            publishImpl: relay.publishImpl
        });

        await publisher.publish(fieldsOf({ contentHash: 'hash-99', locator: 'ar://XYZ', storage: 'ar' }));
        assert(relay.calls.length === 1, '6. exactly one publish call is made');
        const { relayUrl, eventTemplate } = relay.calls[0];
        assert(relayUrl === 'wss://custom-relay.example', '7. publishImpl is invoked against the configured relay');
        assert(eventTemplate.kind === 30078, '8. the event template carries the configured kind');
        assert(
            eventTemplate.tags.length === 1 && eventTemplate.tags[0][0] === 'x' && eventTemplate.tags[0][1] === 'forkbuild-snapshot-campaign-42',
            '9. the event template carries exactly one tag: the configured tag name and discovery tag'
        );
        const parsedContent = JSON.parse(eventTemplate.content);
        assert(
            parsedContent.protocol === 'forkbuild-snapshot-discovery' && parsedContent.version === 1
                && parsedContent.contentHash === 'hash-99' && parsedContent.locator === 'ar://XYZ' && parsedContent.storage === 'ar',
            '10. the event content is the canonical Snapshot Discovery Envelope JSON, field for field'
        );
    }
    console.log('✓ Section B: the event template carries the canonical envelope JSON and discovery tag');

    // ---------------------------------------------------------------
    // Section C — malformed input resolves to null, publishImpl is never
    // consulted.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relay.publishImpl });

        const malformedInputs = [
            undefined,
            {},
            fieldsOf({ contentHash: '' }),
            fieldsOf({ contentHash: undefined }),
            fieldsOf({ locator: '' }),
            fieldsOf({ storage: '' })
        ];
        for (const candidate of malformedInputs) {
            const result = await publisher.publish(candidate);
            assert(result === null, `11. malformed input ${JSON.stringify(candidate)} resolves to null`);
        }
        assert(relay.calls.length === 0, '12. publishImpl is never consulted for malformed input');
    }
    console.log('✓ Section C: malformed input resolves to null without consulting publishImpl');

    // ---------------------------------------------------------------
    // Section D — publishImpl reporting published:false resolves to null.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: false, reason: 'relay declined the event' }) });
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relay.publishImpl });

        const result = await publisher.publish(fieldsOf());
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
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: failingImpl });
        await expectRejects(publisher.publish(fieldsOf()), '15. a genuine publishImpl failure propagates as a rejection, never swallowed as null');

        const neverSettles = () => new Promise(() => {});
        const timingOutPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: neverSettles, timeoutMs: 20 });
        await expectRejects(timingOutPublisher.publish(fieldsOf()), '16. a publishImpl that never settles propagates as a rejection once timeoutMs elapses');
    }
    console.log('✓ Section E: a genuine publishImpl failure, including a timeout, propagates rather than degrading to null');

    // ---------------------------------------------------------------
    // Section F — publishImpl resolving published:true but violating its
    // own id contract throws, never degrades to null.
    // ---------------------------------------------------------------
    {
        const noId = makeFakeRelay({ handler: () => ({ published: true }) });
        await expectRejects(
            new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: noId.publishImpl }).publish(fieldsOf()),
            '17. publishImpl resolving with no id throws rather than returning null'
        );

        const malformedId = makeFakeRelay({ handler: () => ({ published: true, id: 'not-a-valid-nip01-event-id' }) });
        await expectRejects(
            new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: malformedId.publishImpl }).publish(fieldsOf()),
            '18. publishImpl resolving with a malformed id throws rather than returning null'
        );
    }
    console.log('✓ Section F: publishImpl violating its own { published, id } contract throws, never degrades to null');

    // ---------------------------------------------------------------
    // Section G — the exact same JSON this file writes to content is what
    // parseSnapshotDiscoveryEnvelope() reads back on the consuming side.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relay.publishImpl });

        const result = await publisher.publish(fieldsOf({ contentHash: 'roundtrip-hash', locator: 'ar://roundtrip-tx', storage: 'ar' }));
        assert(result !== null, '19. publishing succeeds');

        const publishedContent = relay.calls[0].eventTemplate.content;
        const roundTripped = parseSnapshotDiscoveryEnvelope(publishedContent);
        assert(roundTripped !== null, '20. the published content parses back as a well-formed envelope via this milestone\'s own reader');
        assert(
            roundTripped.contentHash === 'roundtrip-hash' && roundTripped.locator === 'ar://roundtrip-tx' && roundTripped.storage === 'ar',
            '21. the round-tripped envelope is byte-identical, field for field, to what was published'
        );
    }
    console.log('✓ Section G: the published content round-trips through this milestone\'s own reader unmodified');

    // ---------------------------------------------------------------
    // Section H — a constructor missing relayUrl, discoveryTag, or
    // publishImpl throws immediately.
    // ---------------------------------------------------------------
    {
        const { publishImpl } = makeFakeRelay({ handler: () => ({ published: true, id: FAKE_EVENT_ID }) });
        expectThrows(() => new NostrSnapshotDiscoveryPublisher({ relayUrl: '', discoveryTag: 'forkbuild-snapshot', publishImpl }), '22. an empty relayUrl throws at construction time');
        expectThrows(() => new NostrSnapshotDiscoveryPublisher({ discoveryTag: '', publishImpl }), '23. a missing discoveryTag throws at construction time');
        expectThrows(() => new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot' }), '24. a missing publishImpl throws at construction time');
        expectThrows(() => new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: 'not-a-function' }), '25. a non-function publishImpl throws at construction time');
    }
    console.log('✓ Section H: a constructor missing relayUrl, discoveryTag, or publishImpl throws immediately');

    // ---------------------------------------------------------------
    // Section I — no caching: two calls issue two fresh publish exchanges.
    // ---------------------------------------------------------------
    {
        let callCount = 0;
        const publishImpl = async () => { callCount++; return { published: true, id: FAKE_EVENT_ID.slice(0, 63) + String(callCount % 10) }; };
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl });

        const first = await publisher.publish(fieldsOf());
        const second = await publisher.publish(fieldsOf());
        assert(callCount === 2, '26. calling publish() twice for identical fields issues two independent publishImpl calls, never cached');
        assert(first.id !== second.id, '27. the two independent calls report two independent event ids');
    }
    console.log('✓ Section I: no caching — every call publishes fresh');

    // ---------------------------------------------------------------
    // Section J — architectural regression: no forbidden imports or
    // vocabulary.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/NostrSnapshotDiscoveryPublisher.js', import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('NostrPublicationDiscoveryPublisher'), '28. never imports application/NostrPublicationDiscoveryPublisher.js — a distinct semantic contract, per this milestone\'s own header');
        assert(!codeOnly.includes('DecentralizedDiscoveryEnvelope'), '29. never imports the Signed Claim\'s own envelope shape');
        assert(!codeOnly.includes('PublicationDistribution'), '30. never imports the Signed Claim distribution family');
        assert(!codeOnly.includes('ArweavePublicationMaterialUploader'), '31. never imports the Arweave material uploader — material upload stays a separate concern');
        assert(!codeOnly.includes('ArweaveContentStore'), '32. never imports content/ArweaveContentStore.js — this file only announces a locator a caller already produced, it never places content itself');
        assert(!codeOnly.includes('SnapshotPlacementResolver') && !codeOnly.includes('SnapshotPlacementStoreRegistry') && !codeOnly.includes('PublicationSnapshotPlacement'), '33. never imports the Snapshot Placement family\'s own signing/catalog/resolution machinery');
        assert(!codeOnly.includes('crypto') && !codeOnly.includes('Wallet') && !codeOnly.includes('JWK') && !codeOnly.includes('nsec'), '34. never references key/wallet material of any kind — signing is fully delegated to the injected publishImpl');
        assert(!codeOnly.includes('WebSocket'), '35. never references WebSocket directly — that belongs to publishImpl');

        const forbiddenTerms = ['trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred', 'verified'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `36. code must never use "${term}" — no trust/status semantics at this boundary`);
        }

        assert(codeOnly.includes('describeSnapshotDiscoveryEnvelope'), '37. reuses this milestone\'s own envelope validator rather than inventing a second format');

        console.log('✓ Section J: architectural regression — no forbidden imports, no key management, no trust vocabulary');
    }

    console.log('\nAll NostrSnapshotDiscoveryPublisher tests passed.');
}

run().catch((error) => {
    console.error('NostrSnapshotDiscoveryPublisher.test.js FAILED:', error);
    process.exitCode = 1;
});
