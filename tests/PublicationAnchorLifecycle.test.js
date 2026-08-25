import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { AddPublicationAnchorUseCase } from '../application/AddPublicationAnchorUseCase.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { AnchorVerificationLifecycleState } from '../application/AnchorVerificationLifecycleState.js';
import { createVerificationObservation } from '../application/PublicationAnchorVerificationObservation.js';
import {
    deriveAnchorVerificationLifecycle, describeAnchorVerificationLifecycleNote
} from '../application/PublicationAnchorVerificationLifecycleView.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.12 — External Anchor Lifecycle & Stale Evidence Semantics.
//
//   Section A: FLAGSHIP — the SAME anchor, verified four times as a real
//              fake Bitcoin network's own state changes underneath it
//              (unconfirmed -> confirmed -> explorer unreachable ->
//              explorer reachable again). The derived lifecycle tracks
//              every transition honestly, including the one this
//              milestone was built for: PROOF_UNAVAILABLE after an
//              earlier VALID reads as "currently unavailable," with a
//              note that it was once independently verified — never as
//              "invalid" or "revoked." core/PublicationAnchor.js#toJSON()
//              is asserted byte-identical after all four calls.
//   Section B: definite rejection — a confirmed transaction that simply
//              does not carry this anchor's own contentHash reports
//              INVALID_PROOF/REJECTED, never confused with UNAVAILABLE,
//              and the anchor itself is still unchanged.
//   Section C: multiple independent anchors for one publication each
//              derive their own lifecycle from their own observations
//              alone — never ranked, never influencing one another.
//   Section D: local observation isolation — two independently
//              constructed verifiers (standing in for two replicas)
//              observe the SAME anchor under DIFFERENT external
//              conditions at the same time and reach different,
//              non-shared results; neither touches the anchor or a
//              shared catalog.
//   Section E: repeated verification always re-derives from current
//              external state — idempotent while nothing changes,
//              immediately reflects a real change, never a cached
//              verdict.
//   Section F: application/PublicationAnchorVerificationLifecycleView.js
//              and application/
//              PublicationAnchorVerificationObservation.js exercised
//              directly as pure functions, covering every application/
//              AnchorVerificationOutcome.js value.
//
// See docs/Principles.md, "A Verification Result Describes What Can Be
// Established Now; It Does Not Rewrite The Historical Claim Being
// Verified (0.8.12)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
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
    return provider;
}

function signAnchor(identityProvider, fields) {
    let anchor = new PublicationAnchor({
        ...fields,
        anchorIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    return anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
}

function opReturnOutput(hexData) {
    return {
        scriptpubkey_type: 'op_return',
        scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${hexData.length / 2} ${hexData}`
    };
}

// The identical fake-Bitcoin-network technique tests/
// PublicationAnchorCreationUX.test.js, tests/
// ExternalAnchorCreationOrchestration.test.js, and tests/
// BitcoinAnchorCreationAdapter.test.js already established, extended
// here with `outage`/`recover` to simulate the explorer itself becoming
// unreachable — the T2 case this milestone's own design conversation
// centers on — without ever touching the transaction it already recorded.
function makeFakeBitcoinNetwork() {
    const chain = new Map();
    let down = false;

    function record(txid, hexData) {
        chain.set(txid, { txid, vout: [opReturnOutput(hexData)], status: { confirmed: false } });
    }

    async function fetchImpl(url) {
        if (down) throw new Error('simulated network outage: explorer unreachable');
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i);
        if (match) {
            const tx = chain.get(match[1]);
            if (!tx) return new Response('not found', { status: 404 });
            return new Response(JSON.stringify(tx), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    function confirm(txid) {
        chain.get(txid).status = { confirmed: true, block_height: 800000 };
    }

    // Overwrites the OP_RETURN data an already-recorded, already-
    // confirmed transaction reports — simulating a proof that never
    // actually carried the anchor's own contentHash, never a mutation of
    // the anchor itself (which this function never touches).
    function tamper(txid, hexData) {
        chain.get(txid).vout = [opReturnOutput(hexData)];
    }

    return {
        record, confirm, tamper, fetchImpl,
        outage() { down = true; },
        recover() { down = false; }
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the same anchor, verified as the external
    // world changes underneath it
    // ---------------------------------------------------------------
    {
        const net = makeFakeBitcoinNetwork();
        const identityProvider = makeIdentity('Alice');
        const contentHash = 'aa'.repeat(32);
        const txid = '11'.repeat(32);
        net.record(txid, contentHash);

        const anchor = signAnchor(identityProvider, {
            publicationId: 'pub-flagship', contentHash, anchorType: 'bitcoin-op-return', locator: `bitcoin:${txid}`,
            proof: { txid, network: 'mainnet' }
        });
        const originalJson = JSON.stringify(anchor.toJSON());

        const verifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const proofVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: net.fetchImpl, minConfirmations: 1 });
        const history = [];

        async function checkOnce() {
            const result = await verifier.verify(anchor.toJSON(), { expectedContentHash: contentHash, proofVerifier });
            history.push(createVerificationObservation({ anchorId: anchor.id, outcome: result.outcome, reason: result.reason }));
            return result;
        }

        // T1 — broadcast, not yet confirmed.
        let result = await checkOnce();
        assert(result.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, '1. unconfirmed transaction reports PROOF_UNAVAILABLE');
        let lifecycle = deriveAnchorVerificationLifecycle(history);
        assert(lifecycle.state === AnchorVerificationLifecycleState.UNAVAILABLE, '2. lifecycle state is UNAVAILABLE before any confirmation');
        assert(lifecycle.everValid === false, '3. everValid is false — this anchor has never been independently confirmed yet');
        assert(describeAnchorVerificationLifecycleNote(lifecycle) === null, '4. no "previously verified" note before any VALID observation exists');

        // T2 — confirmed.
        net.confirm(txid);
        result = await checkOnce();
        assert(result.outcome === AnchorVerificationOutcome.VALID, '5. a confirmed transaction carrying the right contentHash reports VALID');
        lifecycle = deriveAnchorVerificationLifecycle(history);
        assert(lifecycle.state === AnchorVerificationLifecycleState.VERIFIED, '6. lifecycle state is VERIFIED once confirmed');
        assert(lifecycle.everValid === true, '7. everValid flips true the moment a VALID observation is recorded');
        assert(describeAnchorVerificationLifecycleNote(lifecycle) === null, '8. no note while the CURRENT state is already VERIFIED');

        // T3 — the explorer itself goes down. The anchor and the
        // transaction it names are completely unchanged; only this
        // replica's ability to currently reach the external system
        // changed.
        net.outage();
        result = await checkOnce();
        assert(result.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, '9. an unreachable explorer reports PROOF_UNAVAILABLE, never INVALID_PROOF');
        lifecycle = deriveAnchorVerificationLifecycle(history);
        assert(lifecycle.state === AnchorVerificationLifecycleState.UNAVAILABLE, '10. lifecycle state is UNAVAILABLE again');
        assert(lifecycle.everValid === true, '11. everValid STAYS true — an earlier VALID observation is never erased by a later UNAVAILABLE one');
        const note = describeAnchorVerificationLifecycleNote(lifecycle);
        assert(typeof note === 'string' && /independently verified earlier/.test(note) && !/invalid|revoked|expired/i.test(note),
            '12. THE CENTRAL CASE: previously-VALID-now-UNAVAILABLE gets an honest "verified earlier, unavailable now" note, never language implying rejection');

        // T4 — the explorer recovers. The SAME unchanged anchor reports
        // VALID again, purely because the external world changed back.
        net.recover();
        result = await checkOnce();
        assert(result.outcome === AnchorVerificationOutcome.VALID, '13. once the explorer is reachable again, the SAME anchor reports VALID again');
        lifecycle = deriveAnchorVerificationLifecycle(history);
        assert(lifecycle.state === AnchorVerificationLifecycleState.VERIFIED, '14. lifecycle state returns to VERIFIED');
        assert(lifecycle.observationCount === 4, '15. all four attempts are preserved in the observation history');

        assert(JSON.stringify(anchor.toJSON()) === originalJson,
            '16. FLAGSHIP INVARIANT: anchor.toJSON() is byte-identical after four verifications under three different external states — verification is an observation, never a mutation of the anchor');
    }
    console.log('✓ Section A: the same anchor, verified as the external world changes underneath it — UNAVAILABLE after VALID never reads as invalid, and the anchor itself never changes');

    // ---------------------------------------------------------------
    // Section B — definite rejection, never confused with unavailability
    // ---------------------------------------------------------------
    {
        const net = makeFakeBitcoinNetwork();
        const identityProvider = makeIdentity('Alice');
        const claimedHash = 'bb'.repeat(32);
        const actualHash = 'cc'.repeat(32);
        const txid = '22'.repeat(32);
        net.record(txid, claimedHash);
        net.confirm(txid);
        // The confirmed transaction does not actually carry the anchor's
        // own claimed contentHash — a forged/mistaken proof, structurally
        // different from "not yet reachable."
        net.tamper(txid, actualHash);

        const anchor = signAnchor(identityProvider, {
            publicationId: 'pub-rejected', contentHash: claimedHash, anchorType: 'bitcoin-op-return', locator: `bitcoin:${txid}`,
            proof: { txid, network: 'mainnet' }
        });
        const originalJson = JSON.stringify(anchor.toJSON());
        const verifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const proofVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: net.fetchImpl });

        const history = [];
        for (let i = 0; i < 2; i += 1) {
            const result = await verifier.verify(anchor.toJSON(), { expectedContentHash: claimedHash, proofVerifier });
            history.push(createVerificationObservation({ anchorId: anchor.id, outcome: result.outcome, reason: result.reason }));
            assert(result.outcome === AnchorVerificationOutcome.INVALID_PROOF,
                `17.${i} a confirmed transaction that does not carry the claimed contentHash reports INVALID_PROOF, deterministically on repeat`);
        }
        const lifecycle = deriveAnchorVerificationLifecycle(history);
        assert(lifecycle.state === AnchorVerificationLifecycleState.REJECTED, '18. lifecycle state is REJECTED, a state PROOF_UNAVAILABLE never reaches');
        assert(lifecycle.everValid === false, '19. everValid stays false — this anchor was never independently confirmed');
        assert(describeAnchorVerificationLifecycleNote(lifecycle) === null, '20. REJECTED never gets the "previously verified" note');
        assert(JSON.stringify(anchor.toJSON()) === originalJson, '21. the anchor is unchanged even after a definite rejection');
    }
    console.log('✓ Section B: a confirmed transaction that does not carry the claimed contentHash is REJECTED, never confused with UNAVAILABLE, and never mutates the anchor');

    // ---------------------------------------------------------------
    // Section C — multiple independent anchors, never ranked
    // ---------------------------------------------------------------
    {
        const net = makeFakeBitcoinNetwork();
        const identityProvider = makeIdentity('Alice');
        const contentHash = 'dd'.repeat(32);
        const publicationId = 'pub-multi';

        const txValid = '33'.repeat(32);
        net.record(txValid, contentHash);
        net.confirm(txValid);
        const anchorValid = signAnchor(identityProvider, {
            publicationId, contentHash, anchorType: 'bitcoin-op-return', locator: `bitcoin:${txValid}`, proof: { txid: txValid, network: 'mainnet' }
        });

        const txUnconfirmed = '44'.repeat(32);
        net.record(txUnconfirmed, contentHash);
        const anchorUnconfirmed = signAnchor(identityProvider, {
            publicationId, contentHash, anchorType: 'bitcoin-op-return', locator: `bitcoin:${txUnconfirmed}`, proof: { txid: txUnconfirmed, network: 'mainnet' }
        });

        const txWrong = '55'.repeat(32);
        net.record(txWrong, contentHash);
        net.confirm(txWrong);
        net.tamper(txWrong, 'ee'.repeat(32));
        const anchorWrong = signAnchor(identityProvider, {
            publicationId, contentHash, anchorType: 'bitcoin-op-return', locator: `bitcoin:${txWrong}`, proof: { txid: txWrong, network: 'mainnet' }
        });

        const verifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const proofVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: net.fetchImpl });

        const histories = {};
        for (const anchor of [anchorValid, anchorUnconfirmed, anchorWrong]) {
            const result = await verifier.verify(anchor.toJSON(), { expectedContentHash: contentHash, proofVerifier });
            histories[anchor.id] = [createVerificationObservation({ anchorId: anchor.id, outcome: result.outcome, reason: result.reason })];
        }

        const lifecycleValid = deriveAnchorVerificationLifecycle(histories[anchorValid.id]);
        const lifecycleUnconfirmed = deriveAnchorVerificationLifecycle(histories[anchorUnconfirmed.id]);
        const lifecycleWrong = deriveAnchorVerificationLifecycle(histories[anchorWrong.id]);

        assert(lifecycleValid.state === AnchorVerificationLifecycleState.VERIFIED, '22. anchor A (confirmed, correct) derives VERIFIED');
        assert(lifecycleUnconfirmed.state === AnchorVerificationLifecycleState.UNAVAILABLE, '23. anchor B (unconfirmed) derives UNAVAILABLE');
        assert(lifecycleWrong.state === AnchorVerificationLifecycleState.REJECTED, '24. anchor C (confirmed, wrong data) derives REJECTED');
        // Each derivation reads only its OWN anchor's observation array —
        // there is no shared/aggregate state anywhere in this call chain
        // that could let one anchor's outcome influence another's.
        assert(lifecycleValid.observationCount === 1 && lifecycleUnconfirmed.observationCount === 1 && lifecycleWrong.observationCount === 1,
            '25. three independent, equally-sized histories — nothing merged, nothing ranked');
    }
    console.log('✓ Section C: three independent anchors for one publication each derive their own lifecycle from their own observations alone — never ranked, never influencing one another');

    // ---------------------------------------------------------------
    // Section D — local observation isolation between replicas
    // ---------------------------------------------------------------
    {
        const identityProvider = makeIdentity('Alice');
        const contentHash = 'ff'.repeat(32);
        const txid = '66'.repeat(32);
        const anchor = signAnchor(identityProvider, {
            publicationId: 'pub-isolation', contentHash, anchorType: 'bitcoin-op-return', locator: `bitcoin:${txid}`,
            proof: { txid, network: 'mainnet' }
        });

        const catalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        new AddPublicationAnchorUseCase(catalog).execute(anchor.toJSON());
        const beforeIds = catalog.findByPublicationId('pub-isolation').map((a) => a.id);

        // Alice's own explorer sees a confirmed, correctly-carrying
        // transaction. Bob's own explorer — a completely separate
        // BitcoinOpReturnProofVerifier instance, never wired to Alice's
        // in any way — cannot currently be reached at all.
        const aliceNet = makeFakeBitcoinNetwork();
        aliceNet.record(txid, contentHash);
        aliceNet.confirm(txid);
        const bobNet = makeFakeBitcoinNetwork(); // never `.record()`ed — every lookup 404s

        const aliceVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const bobVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const aliceProofVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: aliceNet.fetchImpl });
        const bobProofVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: bobNet.fetchImpl });

        const aliceResult = await aliceVerifier.verify(anchor.toJSON(), { expectedContentHash: contentHash, proofVerifier: aliceProofVerifier });
        const bobResult = await bobVerifier.verify(anchor.toJSON(), { expectedContentHash: contentHash, proofVerifier: bobProofVerifier });

        assert(aliceResult.outcome === AnchorVerificationOutcome.VALID, '26. Alice, whose network sees a confirmed correct transaction, observes VALID');
        assert(bobResult.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, '27. Bob, whose network cannot find the transaction at all, independently observes PROOF_UNAVAILABLE');

        const aliceHistory = [createVerificationObservation({ anchorId: anchor.id, outcome: aliceResult.outcome, reason: aliceResult.reason })];
        const bobHistory = [createVerificationObservation({ anchorId: anchor.id, outcome: bobResult.outcome, reason: bobResult.reason })];
        assert(deriveAnchorVerificationLifecycle(aliceHistory).state === AnchorVerificationLifecycleState.VERIFIED, '28. Alice\'s own derived lifecycle is VERIFIED');
        assert(deriveAnchorVerificationLifecycle(bobHistory).state === AnchorVerificationLifecycleState.UNAVAILABLE, '29. Bob\'s own derived lifecycle is UNAVAILABLE — completely unaffected by Alice\'s result');

        // Neither observation ever reached the shared catalog or the
        // anchor itself — both stayed exactly what they were before
        // either replica verified anything.
        const afterIds = catalog.findByPublicationId('pub-isolation').map((a) => a.id);
        assert(JSON.stringify(beforeIds) === JSON.stringify(afterIds), '30. the shared catalog is completely unaffected by either replica\'s local verification');
    }
    console.log('✓ Section D: two independent verifiers observe the same anchor under different external conditions and reach different, non-shared results — neither the anchor nor a shared catalog is ever touched');

    // ---------------------------------------------------------------
    // Section E — repeated verification always re-derives from current
    // external state, never a cached verdict
    // ---------------------------------------------------------------
    {
        const net = makeFakeBitcoinNetwork();
        const identityProvider = makeIdentity('Alice');
        const contentHash = '12'.repeat(32);
        const txid = '77'.repeat(32);
        net.record(txid, contentHash);
        net.confirm(txid);
        const anchor = signAnchor(identityProvider, {
            publicationId: 'pub-repeat', contentHash, anchorType: 'bitcoin-op-return', locator: `bitcoin:${txid}`,
            proof: { txid, network: 'mainnet' }
        });
        const verifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const proofVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: net.fetchImpl });

        for (let i = 0; i < 3; i += 1) {
            const result = await verifier.verify(anchor.toJSON(), { expectedContentHash: contentHash, proofVerifier });
            assert(result.outcome === AnchorVerificationOutcome.VALID, `31.${i} repeated verification with nothing changed stays VALID every time — never flips on its own`);
        }

        net.outage();
        const afterOutage = await verifier.verify(anchor.toJSON(), { expectedContentHash: contentHash, proofVerifier });
        assert(afterOutage.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, '32. the very next call after a real external change immediately reflects it — no stale cached VALID');
    }
    console.log('✓ Section E: repeated verification always re-derives from current external state — idempotent while nothing changes, never a cached verdict once something does');

    // ---------------------------------------------------------------
    // Section F — pure unit coverage of the lifecycle derivation itself
    // ---------------------------------------------------------------
    {
        let lifecycle = deriveAnchorVerificationLifecycle([]);
        assert(lifecycle.state === AnchorVerificationLifecycleState.NOT_VERIFIED && lifecycle.everValid === false && lifecycle.observationCount === 0,
            '33. no observations at all derives NOT_VERIFIED');
        assert(describeAnchorVerificationLifecycleNote(lifecycle) === null, '34. NOT_VERIFIED never gets a note');
        assert(deriveAnchorVerificationLifecycle(undefined).state === AnchorVerificationLifecycleState.NOT_VERIFIED, '35. an undefined observation list is treated as none, never throws');

        const obsFor = (outcome) => [createVerificationObservation({ anchorId: 'anchor-1', outcome, reason: null })];
        assert(deriveAnchorVerificationLifecycle(obsFor(AnchorVerificationOutcome.VALID)).state === AnchorVerificationLifecycleState.VERIFIED, '36. VALID -> VERIFIED');
        assert(deriveAnchorVerificationLifecycle(obsFor(AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED)).state === AnchorVerificationLifecycleState.UNVERIFIED_PROOF, '37. VALID_PROOF_UNVERIFIED -> UNVERIFIED_PROOF');
        assert(deriveAnchorVerificationLifecycle(obsFor(AnchorVerificationOutcome.PROOF_UNAVAILABLE)).state === AnchorVerificationLifecycleState.UNAVAILABLE, '38. PROOF_UNAVAILABLE -> UNAVAILABLE');
        for (const outcome of [
            AnchorVerificationOutcome.INVALID_PROOF, AnchorVerificationOutcome.CONTENT_MISMATCH,
            AnchorVerificationOutcome.INVALID_SIGNATURE, AnchorVerificationOutcome.INVALID_ENVELOPE
        ]) {
            assert(deriveAnchorVerificationLifecycle(obsFor(outcome)).state === AnchorVerificationLifecycleState.REJECTED, `39. ${outcome} -> REJECTED`);
        }

        // The note appears ONLY for the exact CURRENT=UNAVAILABLE +
        // everValid=true combination — asserted directly against a hand-
        // built history, independent of any real verifier.
        const upDownUp = [
            createVerificationObservation({ anchorId: 'a', outcome: AnchorVerificationOutcome.VALID }),
            createVerificationObservation({ anchorId: 'a', outcome: AnchorVerificationOutcome.PROOF_UNAVAILABLE }),
            createVerificationObservation({ anchorId: 'a', outcome: AnchorVerificationOutcome.VALID })
        ];
        const finalLifecycle = deriveAnchorVerificationLifecycle(upDownUp);
        assert(finalLifecycle.state === AnchorVerificationLifecycleState.VERIFIED && describeAnchorVerificationLifecycleNote(finalLifecycle) === null,
            '40. once re-verified VALID, the note disappears again — it only ever describes the CURRENT observation, never the whole history at once');

        // createVerificationObservation() itself: validation and shape.
        expectThrows(() => createVerificationObservation({ outcome: AnchorVerificationOutcome.VALID }), '41. an anchorId is required');
        expectThrows(() => createVerificationObservation({ anchorId: 'a' }), '42. an outcome is required');
        const observation = createVerificationObservation({ anchorId: 'a', outcome: AnchorVerificationOutcome.VALID });
        assert(observation.reason === null, '43. reason defaults to null when omitted');
        assert(observation.observedAt instanceof Date, '44. observedAt defaults to a real Date when omitted');
        assert(Object.isFrozen(observation), '45. a verification observation is immutable once created');
    }
    console.log('✓ Section F: application/PublicationAnchorVerificationLifecycleView.js and application/PublicationAnchorVerificationObservation.js exercised directly as pure functions, covering every AnchorVerificationOutcome value');

    console.log('\nAll External Anchor Lifecycle & Stale Evidence Semantics tests passed.');
}

run().catch((error) => {
    console.error('PublicationAnchorLifecycle.test.js FAILED:', error);
    process.exitCode = 1;
});
