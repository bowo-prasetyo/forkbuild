import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { CreateIpfsPublicationContentVerifierUseCase } from '../application/CreateIpfsPublicationContentVerifierUseCase.js';
import { IpfsPublicationContentVerificationCoordinator } from '../application/IpfsPublicationContentVerificationCoordinator.js';
import { CreateIpfsPublicationContentVerificationCoordinatorUseCase } from '../application/CreateIpfsPublicationContentVerificationCoordinatorUseCase.js';
import {
    IpfsPublicationContentVerificationCoordinatorState,
    isValidIpfsPublicationContentVerificationCoordinatorState
} from '../application/IpfsPublicationContentVerificationCoordinatorState.js';
import {
    describeIpfsPublicationContentVerification,
    describeIpfsPublicationContentVerificationStateLabel
} from '../application/IpfsPublicationContentVerificationView.js';
import { IpfsPublicationContentVerificationState } from '../application/IpfsPublicationContentVerificationState.js';

// 0.8.70 — IPFS Publication & Content Verification UI.
//
// The flagship this milestone exists to prove: a real application/
// IpfsPublicationContentVerificationCoordinator.js, wrapping the REAL
// 0.8.69 verifier (only its own network edge — a fake gateway
// `fetchImpl` — is faked), driven through the exact "publish -> verify ->
// verify again -> verify again" sequence the milestone's own design
// names as its flagship: PUBLISHED + CID-A -> HASH_MATCH -> HASH_MISMATCH
// -> UNAVAILABLE, three independent observations of the same bound
// record, none contaminating another.
//
//   Section A: FLAGSHIP — one IpfsPublicationRecord, verified three
//              times as what the gateway serves changes underneath it:
//              HASH_MATCH, then HASH_MISMATCH, then UNAVAILABLE.
//   Section B: two independent publications (CID-A/hash-A and
//              CID-B/hash-B), verified through the SAME coordinator
//              instance, remain two independent observations — no
//              "CID-A verified against hash-B" contamination.
//   Section C: the coordinator requires a genuine IpfsPublicationRecord
//              instance — a plain object carrying the identical
//              contentHash/locator strings is refused, even though the
//              underlying verifier itself would accept it.
//   Section D: the coordinator's constructor requires a real verifier.
//   Section E: IpfsPublicationContentVerificationCoordinatorState reuses
//              HASH_MATCH/HASH_MISMATCH/UNAVAILABLE verbatim from
//              application/IpfsPublicationContentVerificationState.js,
//              and adds exactly IDLE/VERIFYING/FAILED.
//   Section F: the view is a pure, stateless projection; IDLE by
//              default; every state has a factual, non-verdict label.
//   Section G: an exhaustive sweep confirms no forbidden verdict word
//              exists anywhere this milestone's own composition touches.
//   Section H: CreateIpfsPublicationContentVerificationCoordinatorUseCase
//              produces a real, usable coordinator.
//
// See docs/Roadmap.md, "0.8.70 — IPFS Publication & Content Verification UI."

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

// Identical in spirit to tests/IpfsPublicationContentVerification.test.js's
// own fake gateway — a tiny in-memory stand-in keyed by CID, whose
// content a test can mutate BETWEEN calls to simulate what a real gateway
// might honestly report differently over time.
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

const ORIGINAL_TEXT = 'Hello ForkBuild, from 0.8.70';
const CONTENT_HASH = computeContentHash(ORIGINAL_TEXT);

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: publish -> PUBLISHED + CID-A -> verify ->
    // HASH_MATCH -> verify again -> HASH_MISMATCH -> verify again ->
    // UNAVAILABLE, all against the ONE bound record.
    // ---------------------------------------------------------------
    {
        const CID_A = 'bafyFLAGSHIPCIDA';
        const network = new Map([[CID_A, ORIGINAL_TEXT]]);
        const gateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGateway(network) });
        const { ipfsPublicationContentVerifier } = new CreateIpfsPublicationContentVerifierUseCase().execute({ contentStore: gateway });
        const coordinator = new IpfsPublicationContentVerificationCoordinator({ ipfsPublicationContentVerifier });

        // "publish" — the exact record a real PUBLISHED outcome would be
        // captured into by ui/views/DecentralizedPublicationsView.js's own
        // publishToRemoteIpfs().
        const record = new IpfsPublicationRecord({
            contentHash: CONTENT_HASH, locator: `ipfs://${CID_A}`, publishedAt: new Date(),
            publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });

        // "verify" -> HASH_MATCH.
        const resultA = await coordinator.verify(record);
        assert(resultA.state === IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH, '1. first verify reaches HASH_MATCH');
        assert(resultA.locator === `ipfs://${CID_A}` && resultA.contentHash === CONTENT_HASH, '2. the observation carries the bound record\'s own contentHash/locator');
        assert(Object.isFrozen(resultA), '3. the observation is frozen');

        // What the gateway serves at CID-A changes — "verify again" ->
        // HASH_MISMATCH, a real, definite fact.
        network.set(CID_A, 'these bytes are not what was published');
        const resultB = await coordinator.verify(record);
        assert(resultB.state === IpfsPublicationContentVerificationCoordinatorState.HASH_MISMATCH, '4. second verify reaches HASH_MISMATCH');

        // The gateway no longer serves CID-A at all — "verify again" ->
        // UNAVAILABLE, never conflated with the mismatch above.
        network.delete(CID_A);
        const resultC = await coordinator.verify(record);
        assert(resultC.state === IpfsPublicationContentVerificationCoordinatorState.UNAVAILABLE, '5. third verify reaches UNAVAILABLE');

        // All three observations remain independent — the first two are
        // untouched by later calls.
        assert(resultA.state === IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH, '6. the first observation was never mutated by later calls');
        assert(resultB.state === IpfsPublicationContentVerificationCoordinatorState.HASH_MISMATCH, '7. the second observation was never mutated by the third call');
        assert(new Set([resultA.state, resultB.state, resultC.state]).size === 3, '8. all three states are genuinely distinct');
    }
    console.log('✓ Section A (FLAGSHIP): publish -> PUBLISHED + CID-A -> verify -> HASH_MATCH -> verify again -> HASH_MISMATCH -> verify again -> UNAVAILABLE');

    // ---------------------------------------------------------------
    // Section B — two independent publications, verified through the
    // SAME coordinator instance, remain two independent observations.
    // ---------------------------------------------------------------
    {
        const TEXT_B = 'a completely different publication\'s content';
        const HASH_B = computeContentHash(TEXT_B);
        const network = new Map([
            ['bafyPUBA', ORIGINAL_TEXT],
            ['bafyPUBB', TEXT_B]
        ]);
        const gateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGateway(network) });
        const { ipfsPublicationContentVerifier } = new CreateIpfsPublicationContentVerifierUseCase().execute({ contentStore: gateway });
        const coordinator = new IpfsPublicationContentVerificationCoordinator({ ipfsPublicationContentVerifier });

        const recordA = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyPUBA', publishedAt: new Date(), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING });
        const recordB = new IpfsPublicationRecord({ contentHash: HASH_B, locator: 'ipfs://bafyPUBB', publishedAt: new Date(), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING });

        const resultA = await coordinator.verify(recordA);
        const resultB = await coordinator.verify(recordB);

        assert(resultA.state === IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH, '9. publication A verifies against its OWN content hash');
        assert(resultB.state === IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH, '10. publication B verifies against its OWN content hash');
        assert(resultA.contentHash === CONTENT_HASH && resultA.locator === 'ipfs://bafyPUBA', '11. publication A\'s own observation names ONLY publication A\'s own contentHash/locator');
        assert(resultB.contentHash === HASH_B && resultB.locator === 'ipfs://bafyPUBB', '12. publication B\'s own observation names ONLY publication B\'s own contentHash/locator');

        // Never verifying CID-A's locator against hash-B — this record
        // would have to be deliberately constructed with a mismatched
        // pair; the coordinator faithfully reports exactly that.
        const crossPairedRecord = new IpfsPublicationRecord({ contentHash: HASH_B, locator: 'ipfs://bafyPUBA', publishedAt: new Date() });
        const crossResult = await coordinator.verify(crossPairedRecord);
        assert(crossResult.state === IpfsPublicationContentVerificationCoordinatorState.HASH_MISMATCH, '13. a deliberately mismatched CID/hash pair reports HASH_MISMATCH, proving the coordinator never silently reuses a DIFFERENT record\'s own contentHash');
    }
    console.log('✓ Section B: two independent publications, verified through the same coordinator, remain two independent, uncontaminated observations');

    // ---------------------------------------------------------------
    // Section C — the coordinator requires a genuine IpfsPublicationRecord
    // instance, stricter than the underlying verifier's own duck-typed
    // acceptance.
    // ---------------------------------------------------------------
    {
        let verifierCalls = 0;
        const countingVerifier = { verify: async () => { verifierCalls += 1; return { state: 'hash-match', contentHash: 'x', locator: 'ipfs://x', reason: null, observedAt: new Date() }; } };
        const coordinator = new IpfsPublicationContentVerificationCoordinator({ ipfsPublicationContentVerifier: countingVerifier });

        await expectRejects(() => coordinator.verify(null), '14. a missing record throws');
        await expectRejects(() => coordinator.verify({ contentHash: 'abc', locator: 'ipfs://bafyPlain' }), '15. a plain object carrying contentHash/locator — which the underlying verifier itself would accept — is still refused');
        await expectRejects(() => coordinator.verify('ipfs://not-a-record'), '16. a bare string throws');
        assert(verifierCalls === 0, '17. the injected verifier is never consulted for any caller-contract violation');

        const realRecord = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: 'ipfs://bafyREAL', publishedAt: new Date() });
        await coordinator.verify(realRecord);
        assert(verifierCalls === 1, '18. a genuine IpfsPublicationRecord instance reaches the injected verifier');
    }
    console.log('✓ Section C: the coordinator requires a genuine IpfsPublicationRecord instance, never a reconstructed plain object');

    // ---------------------------------------------------------------
    // Section D — the coordinator's constructor requires a real
    // verifier.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new IpfsPublicationContentVerificationCoordinator(), '19. no verifier throws');
        expectThrows(() => new IpfsPublicationContentVerificationCoordinator({ ipfsPublicationContentVerifier: {} }), '20. a verifier with no verify() throws');
        expectThrows(() => new IpfsPublicationContentVerificationCoordinator({ ipfsPublicationContentVerifier: { verify: 'not a function' } }), '21. a non-function verify throws');
    }
    console.log('✓ Section D: constructing the coordinator with no usable verifier throws');

    // ---------------------------------------------------------------
    // Section E — the coordinator state vocabulary reuses
    // HASH_MATCH/HASH_MISMATCH/UNAVAILABLE verbatim, and adds exactly
    // IDLE/VERIFYING/FAILED.
    // ---------------------------------------------------------------
    {
        assert(Object.values(IpfsPublicationContentVerificationCoordinatorState).length === 6, '22. the coordinator vocabulary carries exactly six values');
        assert(IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH === IpfsPublicationContentVerificationState.HASH_MATCH, '23. HASH_MATCH is reused verbatim, never redefined');
        assert(IpfsPublicationContentVerificationCoordinatorState.HASH_MISMATCH === IpfsPublicationContentVerificationState.HASH_MISMATCH, '24. HASH_MISMATCH is reused verbatim, never redefined');
        assert(IpfsPublicationContentVerificationCoordinatorState.UNAVAILABLE === IpfsPublicationContentVerificationState.UNAVAILABLE, '25. UNAVAILABLE is reused verbatim, never redefined');
        assert(typeof IpfsPublicationContentVerificationCoordinatorState.IDLE === 'string', '26. IDLE is a genuinely new value');
        assert(typeof IpfsPublicationContentVerificationCoordinatorState.VERIFYING === 'string', '27. VERIFYING is a genuinely new value');
        assert(typeof IpfsPublicationContentVerificationCoordinatorState.FAILED === 'string', '28. FAILED is a genuinely new value');
        assert(isValidIpfsPublicationContentVerificationCoordinatorState(IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH), '29. isValid...() recognizes a real value');
        assert(!isValidIpfsPublicationContentVerificationCoordinatorState('verified'), '30. isValid...() rejects a value outside the vocabulary');
    }
    console.log('✓ Section E: the coordinator vocabulary reuses the verifier\'s own three values verbatim, and adds exactly IDLE/VERIFYING/FAILED');

    // ---------------------------------------------------------------
    // Section F — the view is a pure, stateless projection; IDLE by
    // default; every state has a factual, non-verdict label.
    // ---------------------------------------------------------------
    {
        const idleView = describeIpfsPublicationContentVerification(null);
        assert(idleView.state === IpfsPublicationContentVerificationCoordinatorState.IDLE, '31. describeIpfsPublicationContentVerification(null) reports IDLE');
        assert(Object.isFrozen(idleView), '32. the view result is frozen');
        assert(idleView.contentHash === null && idleView.locator === null && idleView.reason === null, '33. an IDLE view carries no leftover fact from any previous attempt');

        for (const state of Object.values(IpfsPublicationContentVerificationCoordinatorState)) {
            const label = describeIpfsPublicationContentVerificationStateLabel(state);
            assert(typeof label === 'string' && label.length > 0, `34. every named state (${state}) has a non-empty label`);
        }
        assert(describeIpfsPublicationContentVerificationStateLabel('not-a-real-state') === null, '35. an unrecognized state has no label');

        const outcome = { state: IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH, contentHash: CONTENT_HASH, locator: 'ipfs://bafyVIEW', reason: null, observedAt: new Date() };
        const view = describeIpfsPublicationContentVerification(outcome);
        assert(view.contentHash === CONTENT_HASH && view.locator === 'ipfs://bafyVIEW', '36. the view exposes the real contentHash/locator, unmodified');
        assert(view.stateLabel === 'Retrieved content matches the recorded content hash', '37. HASH_MATCH carries its own factual label');
    }
    console.log('✓ Section F: the view is a pure, stateless projection; IDLE by default; every state carries a factual label');

    // ---------------------------------------------------------------
    // Section G — an exhaustive sweep confirms no forbidden verdict
    // word exists anywhere this milestone's own composition touches.
    // ---------------------------------------------------------------
    {
        const forbidden = ['valid', 'healthy', 'trusted', 'reliable', 'canonical', 'confidence', 'status', 'verified', 'safe', 'permanent', 'guaranteed', 'score', 'health'];

        const serializedVocabulary = JSON.stringify(Object.values(IpfsPublicationContentVerificationCoordinatorState)).toLowerCase();
        for (const word of forbidden) {
            assert(!serializedVocabulary.includes(word), `38. the state vocabulary never carries "${word}"`);
        }

        const CID_G = 'bafySWEEPCID';
        const network = new Map([[CID_G, ORIGINAL_TEXT]]);
        const gateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGateway(network) });
        const { ipfsPublicationContentVerifier } = new CreateIpfsPublicationContentVerifierUseCase().execute({ contentStore: gateway });
        const coordinator = new IpfsPublicationContentVerificationCoordinator({ ipfsPublicationContentVerifier });
        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: `ipfs://${CID_G}`, publishedAt: new Date() });
        const outcome = await coordinator.verify(record);
        const view = describeIpfsPublicationContentVerification(outcome);

        const serializedView = JSON.stringify(view).toLowerCase();
        for (const word of forbidden) {
            assert(!serializedView.includes(word), `39. a real HASH_MATCH view never carries "${word}" — an observation is never promoted to a broader verdict`);
        }
        for (const key of Object.keys(outcome)) {
            assert(!forbidden.includes(key), `40. outcome.${key} must never exist as a top-level field`);
        }
    }
    console.log('✓ Section G: an exhaustive sweep confirms no forbidden verdict word exists anywhere in this milestone\'s own composition');

    // ---------------------------------------------------------------
    // Section H — CreateIpfsPublicationContentVerificationCoordinatorUseCase
    // produces a real, usable coordinator.
    // ---------------------------------------------------------------
    {
        const CID_H = 'bafyUSECASECID';
        const network = new Map([[CID_H, ORIGINAL_TEXT]]);
        const gateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGateway(network) });
        const { ipfsPublicationContentVerifier } = new CreateIpfsPublicationContentVerifierUseCase().execute({ contentStore: gateway });
        const { coordinator } = new CreateIpfsPublicationContentVerificationCoordinatorUseCase().execute({ ipfsPublicationContentVerifier });
        assert(coordinator instanceof IpfsPublicationContentVerificationCoordinator, '41. the use case returns a real IpfsPublicationContentVerificationCoordinator');

        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: `ipfs://${CID_H}`, publishedAt: new Date() });
        const outcome = await coordinator.verify(record);
        assert(outcome.state === IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH, '42. the use-case-built coordinator is genuinely wired to the supplied verifier');
        await expectRejects(() => coordinator.verify({ contentHash: 'x', locator: 'ipfs://x' }), '43. the use case\'s own coordinator still enforces the IpfsPublicationRecord caller contract');
    }
    console.log('✓ Section H: CreateIpfsPublicationContentVerificationCoordinatorUseCase produces a real, usable coordinator');

    console.log('\nAll IpfsPublicationContentVerificationUX tests passed.');
}

run().catch((error) => {
    console.error('IpfsPublicationContentVerificationUX.test.js FAILED:', error);
    process.exitCode = 1;
});
