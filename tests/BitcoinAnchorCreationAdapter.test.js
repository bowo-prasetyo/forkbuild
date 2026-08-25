import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { CreatePublicationAnchorUseCase } from '../application/CreatePublicationAnchorUseCase.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { BitcoinAnchorPublisher } from '../anchoring/BitcoinAnchorPublisher.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.9 — Bitcoin Anchor Creation Adapter.
//
// The flagship this milestone exists to prove: anchoring/
// BitcoinAnchorPublisher.js can produce the SAME external representation
// anchoring/BitcoinOpReturnProofVerifier.js (0.8.1) already knows how to
// check — entirely network-free, against a fake but wire-faithful Bitcoin
// block explorer (the identical fake-network technique tests/
// BitcoinOpReturnProofVerifier.test.js and tests/
// ExternalAnchorProofAdapters.test.js already established).
//
//   Section A: flagship — Alice's publisher broadcasts her publication's
//              contentHash to a fake Bitcoin network; the resulting
//              evidence feeds application/CreatePublicationAnchorUseCase.js
//              (0.8.8, unchanged) to create a real, signed PublicationAnchor.
//              Bob — with none of Alice's publisher or broadcaster state,
//              only the anchor envelope and his own proofVerifier pointed
//              at the same public chain — verifies it and gets
//              PROOF_UNAVAILABLE while the transaction is unconfirmed.
//   Section B: lifecycle — the fake network confirms the SAME transaction,
//              without the anchor changing at all; Bob verifies again and
//              gets VALID. Proves the external world changes; the signed
//              anchor claim does not.
//   Section C: wire compatibility — the OP_RETURN payload the publisher
//              asked to be broadcast is the raw contentHash, byte for
//              byte, with no second application-chosen encoding.
//   Section D: failure modes — a broadcaster that throws, one that
//              explicitly reports unavailable, and one that definitely
//              rejects the transaction all stay distinguishable from each
//              other and from success; a malformed contentHash is refused
//              before the broadcaster is ever consulted.
//   Section E: no manufactured anchoredAt — publish()'s result carries no
//              anchoredAt at all; CreatePublicationAnchorUseCase's own
//              honest "now" default applies, never a value invented to
//              look like it came from Bitcoin itself.
//
// See docs/Principles.md, "Broadcast Acceptance Is Not Anchor Validity
// (0.8.9)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (e) { threw = true; }
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

function opReturnOutput(hexData) {
    return {
        scriptpubkey_type: 'op_return',
        scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${hexData.length / 2} ${hexData}`
    };
}

// A fake public Bitcoin network: `chain` is a Map<txid, tx>, the same
// shared record both a broadcaster (writing to it) and an Esplora-style
// `fetchImpl` (reading from it) see — standing in for "the actual Bitcoin
// network," never Alice's own private state. Confirming a transaction
// later is nothing more than mutating this same Map entry in place —
// exactly what a real chain does out from under any single participant.
function makeFakeBitcoinNetwork() {
    const chain = new Map();
    let nextTxid = 0;

    const broadcaster = {
        async broadcast(opReturnHex, { network }) {
            nextTxid += 1;
            const txid = String(nextTxid).padStart(64, '0');
            chain.set(txid, {
                txid,
                network,
                vout: [opReturnOutput(opReturnHex)],
                status: { confirmed: false }
            });
            return { broadcast: true, txid };
        }
    };

    async function fetchImpl(url) {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i);
        if (match) {
            const tx = chain.get(match[1]);
            if (!tx) return new Response('not found', { status: 404 });
            return new Response(JSON.stringify(tx), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    function confirm(txid, blockHeight) {
        const tx = chain.get(txid);
        tx.status = { confirmed: true, block_height: blockHeight };
    }

    return { chain, broadcaster, fetchImpl, confirm };
}

function publishContent(publicationCatalog, { id, hash }) {
    const publication = new DecentralizedPublication({
        id,
        contentKind: 'forkbuild.structure',
        contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — flagship
    // ---------------------------------------------------------------
    let sharedAnchorJson, sharedTxid, network;
    {
        const alice = makeIdentity('Alice');
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const authVerifier = new LocalAuthorizationVerifier();
        const createAnchor = new CreatePublicationAnchorUseCase(publicationCatalog, alice, authVerifier, anchorCatalog);

        const contentHash = 'f00dcafe';
        const publication = publishContent(publicationCatalog, { id: 'pub-flagship', hash: contentHash });

        const net = makeFakeBitcoinNetwork();
        const publisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: net.broadcaster });
        assert(publisher.anchorType === 'bitcoin-op-return', '1. publisher.anchorType matches the verifier\'s own anchorType exactly');

        const evidence = await publisher.publish(publication.contentReference.hash);
        assert(evidence.published === true, '2. publishing to a healthy fake network succeeds');
        assert(typeof evidence.locator === 'string' && evidence.locator.length > 0, '3. a successful publish returns a non-empty locator');
        assert(evidence.proof && typeof evidence.proof.txid === 'string' && evidence.proof.network === 'mainnet', '4. a successful publish returns a proof shaped exactly like BitcoinOpReturnProofVerifier expects');

        const anchor = createAnchor.execute('pub-flagship', {
            anchorType: publisher.anchorType,
            locator: evidence.locator,
            proof: evidence.proof
        });
        assert(anchor instanceof PublicationAnchor, '5. the evidence feeds straight into CreatePublicationAnchorUseCase, unchanged, producing a real PublicationAnchor');
        assert(anchor.contentHash === contentHash, '6. the created anchor still binds to the publication\'s own contentHash, exactly as 0.8.8 already guarantees');
        assert(anchor.proof.txid === evidence.proof.txid, '7. the anchor carries the publisher\'s own txid, verbatim');

        // ---- Bob: none of Alice's local state, only the anchor and his
        // own proofVerifier pointed at the same public (fake) network.
        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);
        const bobProofVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://bob-explorer.test/api', fetchImpl: net.fetchImpl });

        const anchorJson = anchor.toJSON();
        const stillUnconfirmed = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash, proofVerifier: bobProofVerifier
        });
        assert(stillUnconfirmed.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE,
            '8. immediately after broadcast, Bob\'s independent verification reports PROOF_UNAVAILABLE — broadcast acceptance is not confirmation');

        sharedAnchorJson = anchorJson;
        sharedTxid = evidence.proof.txid;
        network = net;
    }
    console.log('✓ Section A: flagship — the publisher\'s evidence feeds CreatePublicationAnchorUseCase unchanged; Bob independently verifies PROOF_UNAVAILABLE while unconfirmed');

    // ---------------------------------------------------------------
    // Section B — lifecycle: the external world changes; the anchor does
    // not.
    // ---------------------------------------------------------------
    {
        const beforeJson = JSON.stringify(sharedAnchorJson);

        network.confirm(sharedTxid, 900001);

        assert(JSON.stringify(sharedAnchorJson) === beforeJson, '9. confirming the transaction never touches the already-signed anchor record');

        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);
        const bobProofVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://bob-explorer.test/api', fetchImpl: network.fetchImpl });

        const nowConfirmed = await bobAnchorVerifier.verify(sharedAnchorJson, {
            expectedContentHash: sharedAnchorJson.contentHash, proofVerifier: bobProofVerifier
        });
        assert(nowConfirmed.outcome === AnchorVerificationOutcome.VALID,
            '10. the SAME anchor, unchanged, now verifies VALID once the external network confirms the transaction it already named');
    }
    console.log('✓ Section B: lifecycle — the same unmodified anchor moves from PROOF_UNAVAILABLE to VALID purely because the external world changed');

    // ---------------------------------------------------------------
    // Section C — wire compatibility: no second, application-chosen
    // encoding.
    // ---------------------------------------------------------------
    {
        const contentHash = 'deadbeef';
        const net = makeFakeBitcoinNetwork();
        const publisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: net.broadcaster });
        const evidence = await publisher.publish(contentHash);

        const tx = net.chain.get(evidence.proof.txid);
        const opReturn = tx.vout.find((output) => output.scriptpubkey_type === 'op_return');
        const pushedHex = opReturn.scriptpubkey_asm.trim().split(/\s+/).pop();
        assert(pushedHex.toLowerCase() === contentHash.toLowerCase(),
            '11. the OP_RETURN payload the publisher asked to be broadcast is the raw contentHash itself — no hash-of-a-hash, no envelope');
    }
    console.log('✓ Section C: the publisher writes exactly the raw contentHash bytes the verifier already expects — no new encoding invented');

    // ---------------------------------------------------------------
    // Section D — failure modes stay distinguishable.
    // ---------------------------------------------------------------
    {
        const contentHash = 'cafebabe';

        const throwingPublisher = new BitcoinAnchorPublisher({
            broadcaster: { broadcast: async () => { throw new Error('simulated connection failure'); } }
        });
        const thrown = await throwingPublisher.publish(contentHash);
        assert(thrown.published === false && thrown.unavailable === true, '12. a broadcaster that throws reports unavailable, never a definite rejection');

        const explicitlyUnavailablePublisher = new BitcoinAnchorPublisher({
            broadcaster: { broadcast: async () => ({ broadcast: false, unavailable: true, reason: 'no funds currently available to spend' }) }
        });
        const explicitlyUnavailable = await explicitlyUnavailablePublisher.publish(contentHash);
        assert(explicitlyUnavailable.published === false && explicitlyUnavailable.unavailable === true,
            '13. a broadcaster that explicitly cannot presently tell reports unavailable');

        const rejectingPublisher = new BitcoinAnchorPublisher({
            broadcaster: { broadcast: async () => ({ broadcast: false, reason: 'transaction rejected as non-standard' }) }
        });
        const rejected = await rejectingPublisher.publish(contentHash);
        assert(rejected.published === false && !rejected.unavailable, '14. a broadcaster that definitely rejects the transaction is distinguishable from "unavailable"');

        let broadcastCalls = 0;
        const spyPublisher = new BitcoinAnchorPublisher({
            broadcaster: { broadcast: async () => { broadcastCalls += 1; return { broadcast: true, txid: '0'.repeat(64) }; } }
        });
        await expectThrowsAsync(() => spyPublisher.publish('not-hex-data'),
            '15. a malformed contentHash is refused');
        await expectThrowsAsync(() => spyPublisher.publish('abc'),
            '16. an odd-length hex contentHash is refused — it cannot be raw bytes');
        assert(broadcastCalls === 0, '17. the broadcaster is never consulted for a malformed contentHash');

        const acceptingPublisher = new BitcoinAnchorPublisher({
            broadcaster: { broadcast: async () => ({ broadcast: true, txid: '1'.repeat(64) }) }
        });
        const accepted = await acceptingPublisher.publish(contentHash);
        assert(accepted.published === true && !('unavailable' in accepted), '18. a clean broadcast reports success with no unavailable/reason noise');
    }
    console.log('✓ Section D: throwing, explicit-unavailable, definite-rejection, and success all stay distinguishable; malformed input never reaches the broadcaster');

    // ---------------------------------------------------------------
    // Section E — no manufactured anchoredAt.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const authVerifier = new LocalAuthorizationVerifier();
        const createAnchor = new CreatePublicationAnchorUseCase(publicationCatalog, alice, authVerifier, anchorCatalog);
        const contentHash = 'abad1dea';
        publishContent(publicationCatalog, { id: 'pub-time', hash: contentHash });

        const net = makeFakeBitcoinNetwork();
        const publisher = new BitcoinAnchorPublisher({ broadcaster: net.broadcaster });
        const evidence = await publisher.publish(contentHash);
        assert(!('anchoredAt' in evidence), '19. publish() never includes an anchoredAt — it has no meaningful external record time to report');

        const before = Date.now();
        const anchor = createAnchor.execute('pub-time', { anchorType: publisher.anchorType, locator: evidence.locator, proof: evidence.proof });
        const after = Date.now();
        assert(anchor.anchoredAt.getTime() >= before && anchor.anchoredAt.getTime() <= after,
            '20. CreatePublicationAnchorUseCase\'s own honest "now" default applies — never a value invented to look like it came from Bitcoin');
    }
    console.log('✓ Section E: the publisher never manufactures an anchoredAt; the generic use case\'s own honest "now" default applies unchanged');

    console.log('\nAll BitcoinAnchorCreationAdapter tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorCreationAdapter.test.js FAILED:', error);
    process.exitCode = 1;
});
