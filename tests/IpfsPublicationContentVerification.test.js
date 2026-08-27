import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod, isValidIpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerifier } from '../application/IpfsPublicationContentVerifier.js';
import { IpfsPublicationContentVerificationState, isValidIpfsPublicationContentVerificationState } from '../application/IpfsPublicationContentVerificationState.js';
import { CreateIpfsPublicationContentVerifierUseCase } from '../application/CreateIpfsPublicationContentVerifierUseCase.js';

// 0.8.69 — IPFS Publication Record & Content-Identity Binding.
//
// The flagship this milestone exists to prove: given an
// `IpfsPublicationRecord` naming a `contentHash` and a `locator`,
// `IpfsPublicationContentVerifier` runs the REAL `content/
// IpfsGatewayContentStore.js` (0.8.66) — only its own network edge
// (`fetchImpl`) is faked — and independently reports whether what the
// gateway currently serves at that locator still hashes to the claimed
// content identity, using the REAL `core/ContentReference.js#verify()`.
//
//   Section A: FLAGSHIP — a real gateway serving the original bytes ->
//              HASH_MATCH
//   Section B: the same gateway serving DIFFERENT bytes for a different
//              CID -> HASH_MISMATCH, a real, definite fact
//   Section C: an unreachable/404 CID -> UNAVAILABLE, never a mismatch
//   Section D: a contentStore resolving to `null` -> UNAVAILABLE
//   Section E: caller-contract violations (missing record, missing
//              contentHash/locator) throw before the contentStore is
//              ever consulted
//   Section F: constructor requires a contentStore with a get() method
//   Section G: every verify() call is a fresh retrieval — two calls
//              reach the contentStore twice, never cached
//   Section H: every result is frozen, and carries no forbidden verdict
//              word anywhere
//   Section I: IpfsPublicationRecord validates contentHash/locator/
//              publishedAt/publicationMethod, and round-trips through
//              toJSON/fromJSON
//   Section J: CreateIpfsPublicationContentVerifierUseCase produces a
//              real, usable verifier from an already-constructed store
//   Section K: three independent locators (match, mismatch, unavailable)
//              observed through the SAME verifier instance remain three
//              independent observations, never merged or contaminated
//
// See docs/Roadmap.md, "0.8.69 — IPFS Publication Record &
// Content-Identity Binding."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promiseFn, message) {
    let threw = false;
    try { await promiseFn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

// A tiny in-memory stand-in for a public HTTPS gateway — identical in
// spirit to tests/IpfsGatewayContentStore.test.js's own fake, keyed by
// CID rather than by a Kubo node's own add/cat verbs, since this
// verifier only ever reads.
function makeFakeGateway(network) {
    return async function fetchImpl(url) {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/^\/ipfs\/(.+)$/);
        const cid = match ? decodeURIComponent(match[1]) : null;
        if (!cid || !network.has(cid)) {
            return new Response('not found', { status: 404 });
        }
        return new Response(network.get(cid), { status: 200 });
    };
}

const ORIGINAL_TEXT = 'Hello ForkBuild';
const CONTENT_HASH = computeContentHash(ORIGINAL_TEXT);

async function run() {
    // ---------------------------------------------------------------
    // Section A — flagship: a real gateway serving the original bytes.
    // ---------------------------------------------------------------
    {
        const network = new Map([['bafyMATCH', ORIGINAL_TEXT]]);
        const gateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGateway(network) });
        const verifier = new IpfsPublicationContentVerifier({ contentStore: gateway });
        const record = new IpfsPublicationRecord({
            contentHash: CONTENT_HASH, locator: 'ipfs://bafyMATCH', publishedAt: new Date(),
            publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });

        const result = await verifier.verify(record);
        assert(result.state === IpfsPublicationContentVerificationState.HASH_MATCH, '1. matching bytes report HASH_MATCH');
        assert(result.contentHash === CONTENT_HASH, '2. contentHash is carried through');
        assert(result.locator === 'ipfs://bafyMATCH', '3. locator is carried through');
        assert(result.reason === null, '4. a match carries no reason');
        assert(result.observedAt instanceof Date, '5. observedAt is a real Date');
    }
    console.log('✓ Section A: flagship — a real IpfsGatewayContentStore, faked only at its own network edge, reaches HASH_MATCH');

    // ---------------------------------------------------------------
    // Section B — the same gateway serving DIFFERENT bytes for a
    // different CID: a real, definite mismatch.
    // ---------------------------------------------------------------
    {
        const network = new Map([['bafyMISMATCH', 'these are not the original bytes']]);
        const gateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGateway(network) });
        const verifier = new IpfsPublicationContentVerifier({ contentStore: gateway });
        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyMISMATCH', publishedAt: new Date() });

        const result = await verifier.verify(record);
        assert(result.state === IpfsPublicationContentVerificationState.HASH_MISMATCH, '6. different bytes report HASH_MISMATCH');
        assert(result.reason === null, '7. a mismatch carries no synthetic reason of its own — the state alone names the fact');
    }
    console.log('✓ Section B: different bytes at a different CID report HASH_MISMATCH — a real, definite fact');

    // ---------------------------------------------------------------
    // Section C — an unreachable/404 CID reports UNAVAILABLE, never a
    // mismatch.
    // ---------------------------------------------------------------
    {
        const gateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGateway(new Map()) });
        const verifier = new IpfsPublicationContentVerifier({ contentStore: gateway });
        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyUNKNOWN', publishedAt: new Date() });

        const result = await verifier.verify(record);
        assert(result.state === IpfsPublicationContentVerificationState.UNAVAILABLE, '8. an unreachable CID reports UNAVAILABLE, never HASH_MISMATCH');
        assert(typeof result.reason === 'string' && result.reason.length > 0, '9. UNAVAILABLE carries an honest reason');
    }
    console.log('✓ Section C: an unreachable CID reports UNAVAILABLE, never conflated with a mismatch');

    // ---------------------------------------------------------------
    // Section D — a contentStore resolving to null reports UNAVAILABLE.
    // ---------------------------------------------------------------
    {
        const nullStore = { get: async () => null };
        const verifier = new IpfsPublicationContentVerifier({ contentStore: nullStore });
        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyNULL', publishedAt: new Date() });

        const result = await verifier.verify(record);
        assert(result.state === IpfsPublicationContentVerificationState.UNAVAILABLE, '10. a contentStore resolving to null reports UNAVAILABLE');
    }
    console.log('✓ Section D: a contentStore resolving to null reports UNAVAILABLE, never a crash and never a mismatch');

    // ---------------------------------------------------------------
    // Section E — caller-contract violations throw before the
    // contentStore is ever consulted.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const countingStore = { get: async () => { calls += 1; return ORIGINAL_TEXT; } };
        const verifier = new IpfsPublicationContentVerifier({ contentStore: countingStore });

        await expectRejects(() => verifier.verify(null), '11. a missing record throws');
        await expectRejects(() => verifier.verify({ locator: 'ipfs://bafyX' }), '12. a record missing contentHash throws');
        await expectRejects(() => verifier.verify({ contentHash: CONTENT_HASH }), '13. a record missing locator throws');
        assert(calls === 0, '14. the contentStore is never consulted for any caller-contract violation');
    }
    console.log('✓ Section E: caller-contract violations throw before the contentStore is ever consulted');

    // ---------------------------------------------------------------
    // Section F — the constructor requires a contentStore with a get()
    // method.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new IpfsPublicationContentVerifier(), '15. no contentStore throws');
        expectThrows(() => new IpfsPublicationContentVerifier({ contentStore: {} }), '16. a contentStore with no get() throws');
        expectThrows(() => new IpfsPublicationContentVerifier({ contentStore: { get: 'not a function' } }), '17. a non-function get throws');
    }
    console.log('✓ Section F: constructing the verifier with no usable contentStore throws');

    // ---------------------------------------------------------------
    // Section G — every verify() call is a fresh retrieval, never
    // cached.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const countingStore = { get: async () => { calls += 1; return ORIGINAL_TEXT; } };
        const verifier = new IpfsPublicationContentVerifier({ contentStore: countingStore });
        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafySAME', publishedAt: new Date() });

        await verifier.verify(record);
        await verifier.verify(record);
        assert(calls === 2, '18. two explicit verify() calls reach the contentStore twice — nothing is cached');
    }
    console.log('✓ Section G: verify() performs a fresh retrieval every call, never caching a prior result');

    // ---------------------------------------------------------------
    // Section H — every result is frozen, and carries no forbidden
    // verdict word.
    // ---------------------------------------------------------------
    {
        const gateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGateway(new Map([['bafyFROZEN', ORIGINAL_TEXT]])) });
        const verifier = new IpfsPublicationContentVerifier({ contentStore: gateway });
        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyFROZEN', publishedAt: new Date() });

        const result = await verifier.verify(record);
        assert(Object.isFrozen(result), '19. the result is frozen');
        const forbidden = ['valid', 'healthy', 'trusted', 'reliable', 'canonical', 'confidence', 'status', 'verified', 'safe', 'permanent', 'guaranteed'];
        for (const key of Object.keys(result)) {
            assert(!forbidden.includes(key), `20. result.${key} must never exist — an observation, never a verdict`);
        }
        assert(isValidIpfsPublicationContentVerificationState(result.state), '21. the reported state is one of the named vocabulary values');
    }
    console.log('✓ Section H: every result is frozen, and carries no forbidden verdict word anywhere');

    // ---------------------------------------------------------------
    // Section I — IpfsPublicationRecord validation and round-trip.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new IpfsPublicationRecord({ locator: 'ipfs://bafyX', publishedAt: new Date() }), '22. a missing contentHash throws');
        expectThrows(() => new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'https://not-ipfs.example/x', publishedAt: new Date() }), '23. a non-ipfs:// locator throws');
        expectThrows(() => new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://', publishedAt: new Date() }), '24. an ipfs:// locator with no CID throws');
        expectThrows(() => new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyX', publishedAt: 'not a date' }), '25. an invalid publishedAt throws');
        expectThrows(() => new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyX', publishedAt: new Date(), publicationMethod: 'smoke-signal' }), '26. an unrecognized publicationMethod throws');

        const publishedAt = new Date('2026-08-27T12:00:00.000Z');
        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyX', publishedAt, publicationMethod: IpfsPublicationMethod.KUBO });
        assert(record.contentHash === CONTENT_HASH, '27. contentHash getter');
        assert(record.locator === 'ipfs://bafyX', '28. locator getter');
        assert(record.publishedAt.getTime() === publishedAt.getTime(), '29. publishedAt getter');
        assert(record.publicationMethod === IpfsPublicationMethod.KUBO, '30. publicationMethod getter');

        const recordWithNoMethod = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyX', publishedAt });
        assert(recordWithNoMethod.publicationMethod === null, '31. publicationMethod defaults to null');

        const roundTripped = IpfsPublicationRecord.fromJSON(record.toJSON());
        assert(roundTripped.contentHash === record.contentHash
            && roundTripped.locator === record.locator
            && roundTripped.publishedAt.getTime() === record.publishedAt.getTime()
            && roundTripped.publicationMethod === record.publicationMethod, '32. toJSON/fromJSON round-trips exactly');

        assert(isValidIpfsPublicationMethod(IpfsPublicationMethod.KUBO) && isValidIpfsPublicationMethod(IpfsPublicationMethod.REMOTE_PINNING), '33. both named publication methods are valid');
        assert(!isValidIpfsPublicationMethod('smoke-signal'), '34. an unrecognized publicationMethod is not valid');
    }
    console.log('✓ Section I: IpfsPublicationRecord validates every field, and round-trips exactly through toJSON/fromJSON');

    // ---------------------------------------------------------------
    // Section J — CreateIpfsPublicationContentVerifierUseCase produces
    // a real, usable verifier from an already-constructed store.
    // ---------------------------------------------------------------
    {
        const gateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGateway(new Map([['bafyUSECASE', ORIGINAL_TEXT]])) });
        const { ipfsPublicationContentVerifier } = new CreateIpfsPublicationContentVerifierUseCase().execute({ contentStore: gateway });
        assert(ipfsPublicationContentVerifier instanceof IpfsPublicationContentVerifier, '35. the use case returns a real IpfsPublicationContentVerifier');

        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyUSECASE', publishedAt: new Date() });
        const result = await ipfsPublicationContentVerifier.verify(record);
        assert(result.state === IpfsPublicationContentVerificationState.HASH_MATCH, '36. the use-case-built verifier is genuinely wired to the supplied store');
    }
    console.log('✓ Section J: CreateIpfsPublicationContentVerifierUseCase wires a real, usable verifier to an already-constructed contentStore');

    // ---------------------------------------------------------------
    // Section K — three independent locators, observed through the
    // SAME verifier instance, remain three independent observations.
    // ---------------------------------------------------------------
    {
        const network = new Map([
            ['bafyA', ORIGINAL_TEXT],
            ['bafyB', 'gateway returned entirely different bytes for CID-B']
        ]);
        const gateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGateway(network) });
        const verifier = new IpfsPublicationContentVerifier({ contentStore: gateway });

        const resultA = await verifier.verify(new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyA', publishedAt: new Date() }));
        const resultB = await verifier.verify(new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyB', publishedAt: new Date() }));
        const resultC = await verifier.verify(new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyC', publishedAt: new Date() }));

        assert(resultA.state === IpfsPublicationContentVerificationState.HASH_MATCH, '37. CID-A: HASH_MATCH');
        assert(resultB.state === IpfsPublicationContentVerificationState.HASH_MISMATCH, '38. CID-B: HASH_MISMATCH');
        assert(resultC.state === IpfsPublicationContentVerificationState.UNAVAILABLE, '39. CID-C: UNAVAILABLE');
        assert(resultA.locator === 'ipfs://bafyA' && resultB.locator === 'ipfs://bafyB' && resultC.locator === 'ipfs://bafyC', '40. each observation carries its own, distinct locator');
        assert(new Set([resultA.state, resultB.state, resultC.state]).size === 3, '41. all three states are genuinely distinct — none contaminated the others');
    }
    console.log('✓ Section K: three independent locators observed through the same verifier remain three independent, uncontaminated observations');

    console.log('\nAll IpfsPublicationContentVerification tests passed.');
}

run().catch((error) => {
    console.error('IpfsPublicationContentVerification.test.js FAILED:', error);
    process.exitCode = 1;
});
