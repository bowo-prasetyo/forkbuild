import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.1 — External Anchor Proof Adapters & Verification Registry.
//
// The flagship this milestone exists to prove: a real anchorType-
// specific proofVerifier (anchoring/BitcoinOpReturnProofVerifier.js),
// reached through application/ExternalProofVerifierRegistry.js's own
// anchorType lookup, plugged into application/ExternalAnchorVerifier.js
// through the EXACT `proofVerifierRegistry` seam 0.8.0 left open and
// never itself touched. Alice anchors a publication's content hash
// externally and signs a PublicationAnchor; Bob — starting with NONE of
// Alice's local state, only the anchor envelope and the registry he
// wired for himself — independently verifies it against a fake but
// wire-faithful Bitcoin block explorer (the identical fake-network
// technique tests/BitcoinOpReturnProofVerifier.test.js already
// established; no live daemon, no real chain, ever touched here).
//
//   Section A: the honest path — Alice anchors, Bob verifies through the
//              registry, and gets AnchorVerificationOutcome.VALID
//   Section B: attacks, each remaining distinguishable from every other:
//              correct signature + wrong contentHash (CONTENT_MISMATCH);
//              correct anchor + forged proof (INVALID_PROOF); correct
//              proof + modified locator after signing
//              (INVALID_SIGNATURE — the locator is part of the signed
//              descriptor); correct anchor + unavailable external system
//              (PROOF_UNAVAILABLE)
//   Section C: a second, independent anchor for the IDENTICAL
//              publicationId/contentHash, anchored by a different
//              identity through a completely different anchorType
//              (`local-test`, never touching Bitcoin at all), verified
//              through the SAME registry without the first anchor or
//              proofVerifier ever being consulted or affected
//
// See docs/Principles.md, "External Evidence Adapters Never Change What
// PublicationAnchor Means (0.8.1)."

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

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function signAnchor(identityProvider, fields) {
    let anchor = new PublicationAnchor({ ...fields, anchorIdentity: identityProvider.getSigningIdentity().toJSON() });
    return anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
}

function opReturnOutput(hexData) {
    return {
        scriptpubkey_type: 'op_return',
        scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${hexData.length / 2} ${hexData}`
    };
}

// A fake Esplora-compatible block explorer, the same technique tests/
// BitcoinOpReturnProofVerifier.test.js already established — `txs` is a
// Map<txid, tx>, standing in for "what the real Bitcoin network has
// actually confirmed."
function makeFakeExplorer(txs = new Map()) {
    return async function fetchImpl(url) {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i);
        if (match) {
            const tx = txs.get(match[1]);
            if (!tx) return new Response('not found', { status: 404 });
            return new Response(JSON.stringify(tx), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    };
}

async function run() {
    const alice = makeIdentity('Alice');
    const contentHash = 'f00dcafe';
    const publicationId = 'pub-flagship-1';
    const txid = 'b'.repeat(64);

    const chain = new Map();
    chain.set(txid, {
        txid,
        vout: [opReturnOutput(contentHash)],
        status: { confirmed: true, block_height: 800100 }
    });

    // ---------------------------------------------------------------
    // Alice anchors her publication's content hash to a (fake, but
    // wire-faithful) confirmed Bitcoin transaction, and signs the
    // PublicationAnchor attesting to it.
    // ---------------------------------------------------------------
    const anchor = signAnchor(alice, {
        publicationId, contentHash, anchorType: 'bitcoin-op-return',
        locator: `bitcoin:${txid}`,
        proof: { txid, network: 'mainnet' }
    });
    const anchorJson = anchor.toJSON();
    console.log('✓ Alice anchored her publication\'s contentHash to a Bitcoin transaction and signed the PublicationAnchor');

    // ---------------------------------------------------------------
    // Section A — Bob, with none of Alice's local state, wires his OWN
    // registry and independently verifies.
    // ---------------------------------------------------------------
    {
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobVerifier);
        const bobRegistry = new ExternalProofVerifierRegistry();
        bobRegistry.register(new BitcoinOpReturnProofVerifier({
            apiUrl: 'https://bob-explorer.test/api',
            fetchImpl: makeFakeExplorer(chain)
        }));

        const result = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            expectedPublicationId: publicationId,
            proofVerifierRegistry: bobRegistry
        });
        assert(result.outcome === AnchorVerificationOutcome.VALID, '1. Bob independently verifies Alice\'s anchor as VALID through the registry, without a directly-supplied proofVerifier');
        assert(result.anchor.id === anchor.id, '2. the verified anchor is the same record Alice signed');
    }
    console.log('✓ Section A: Bob resolved the correct proofVerifier from his own registry by anchorType alone, and verified VALID');

    // ---------------------------------------------------------------
    // Section B — attacks. Each must remain distinguishable from every
    // other, and from the honest VALID path above.
    // ---------------------------------------------------------------
    {
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobVerifier);
        const bobRegistry = new ExternalProofVerifierRegistry();
        bobRegistry.register(new BitcoinOpReturnProofVerifier({
            apiUrl: 'https://bob-explorer.test/api',
            fetchImpl: makeFakeExplorer(chain)
        }));

        // Correct signature, but the caller expected a DIFFERENT
        // contentHash — the anchor itself is genuine, it just does not
        // attest to what Bob is looking for.
        const wrongExpectation = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: 'some-other-hash',
            proofVerifierRegistry: bobRegistry
        });
        assert(wrongExpectation.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH, '1. correct signature + wrong expected contentHash is CONTENT_MISMATCH');

        // Correct anchor, but a forged proof — a transaction that exists
        // and is confirmed, but never actually carried this contentHash.
        const forgedTxid = 'c'.repeat(64);
        const forgedChain = new Map(chain);
        forgedChain.set(forgedTxid, {
            txid: forgedTxid,
            vout: [opReturnOutput('00000000')],
            status: { confirmed: true, block_height: 800101 }
        });
        const forgedProofAnchor = signAnchor(alice, {
            publicationId, contentHash, anchorType: 'bitcoin-op-return',
            locator: `bitcoin:${forgedTxid}`, proof: { txid: forgedTxid, network: 'mainnet' }
        });
        const forgedRegistry = new ExternalProofVerifierRegistry();
        forgedRegistry.register(new BitcoinOpReturnProofVerifier({
            apiUrl: 'https://bob-explorer.test/api', fetchImpl: makeFakeExplorer(forgedChain)
        }));
        const forgedResult = await bobAnchorVerifier.verify(forgedProofAnchor.toJSON(), {
            expectedContentHash: contentHash, proofVerifierRegistry: forgedRegistry
        });
        assert(forgedResult.outcome === AnchorVerificationOutcome.INVALID_PROOF, '2. correct anchor + a real but non-matching transaction is INVALID_PROOF');

        // Correct proof, but the locator was modified AFTER signing —
        // the locator is part of the signed descriptor, so this is
        // caught as a signature failure, never silently accepted with a
        // "corrected" locator.
        const modifiedLocator = { ...anchorJson, locator: `bitcoin:${txid}-tampered` };
        const modifiedResult = await bobAnchorVerifier.verify(modifiedLocator, { proofVerifierRegistry: bobRegistry });
        assert(modifiedResult.outcome === AnchorVerificationOutcome.INVALID_SIGNATURE, '3. correct proof + a locator modified after signing is INVALID_SIGNATURE');

        // Correct anchor, but the external system is unreachable — the
        // exact honest external system Alice's own anchor names, just
        // temporarily (or permanently) unreachable to Bob.
        const downRegistry = new ExternalProofVerifierRegistry();
        downRegistry.register(new BitcoinOpReturnProofVerifier({
            apiUrl: 'https://bob-explorer.test/api',
            fetchImpl: async () => { throw new Error('simulated network outage'); }
        }));
        const unavailableResult = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash, proofVerifierRegistry: downRegistry
        });
        assert(unavailableResult.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, '4. correct anchor + an unreachable external system is PROOF_UNAVAILABLE, never a rejection');
        assert(unavailableResult.anchor !== null, '5. the anchor itself still parsed and is returned even when its proof could not be checked');
    }
    console.log('✓ Section B: every attack remains distinguishable — CONTENT_MISMATCH, INVALID_PROOF, INVALID_SIGNATURE, and PROOF_UNAVAILABLE never collapse into each other');

    // ---------------------------------------------------------------
    // Section C — a second, independent anchor for the SAME
    // publication/content hash, from a different identity, through a
    // completely different anchorType, verified through the SAME
    // registry without touching Bitcoin at all — the central 0.8.0
    // property, still holding after 0.8.1 adds a real backend.
    // ---------------------------------------------------------------
    {
        const registryAuthority = makeIdentity('LocalRegistry');
        const localTestAnchor = signAnchor(registryAuthority, {
            publicationId, contentHash, anchorType: 'local-test', locator: 'local://ledger/1',
            proof: { entries: [publicationId] }
        });

        const bobVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobVerifier);
        const bobRegistry = new ExternalProofVerifierRegistry();
        bobRegistry.register(new BitcoinOpReturnProofVerifier({
            apiUrl: 'https://bob-explorer.test/api', fetchImpl: makeFakeExplorer(chain)
        }));
        bobRegistry.register({
            anchorType: 'local-test',
            verify: (proof) => ({ valid: Array.isArray(proof.entries) && proof.entries.includes(publicationId) })
        });
        assert(bobRegistry.anchorTypes.includes('bitcoin-op-return') && bobRegistry.anchorTypes.includes('local-test'),
            '1. Bob\'s registry now holds two independent anchorType plugins');

        const bitcoinResult = await bobAnchorVerifier.verify(anchorJson, { expectedContentHash: contentHash, proofVerifierRegistry: bobRegistry });
        const localResult = await bobAnchorVerifier.verify(localTestAnchor.toJSON(), { expectedContentHash: contentHash, proofVerifierRegistry: bobRegistry });

        assert(bitcoinResult.outcome === AnchorVerificationOutcome.VALID, '2. the Bitcoin anchor still verifies VALID');
        assert(localResult.outcome === AnchorVerificationOutcome.VALID, '3. the independent local-test anchor, for the SAME publicationId/contentHash, also verifies VALID on its own terms');
        assert(bitcoinResult.anchor.anchorIdentity.id !== localResult.anchor.anchorIdentity.id, '4. the two anchors carry two distinct anchoring identities');
        assert(bitcoinResult.anchor.locator !== localResult.anchor.locator, '5. the two anchors name two distinct locators, neither ever superseding the other');
    }
    console.log('✓ Section C: two independent anchors, two different anchorTypes, one registry — neither ever collides with, ranks, or invalidates the other');

    console.log('\nAll ExternalAnchorProofAdapters tests passed.');
}

run().catch((error) => {
    console.error('ExternalAnchorProofAdapters.test.js FAILED:', error);
    process.exitCode = 1;
});
