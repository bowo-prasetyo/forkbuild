import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import {
    PublicationCommentaryDistributionEnvelope,
    PUBLICATION_COMMENTARY_DISTRIBUTION_KIND
} from '../core/PublicationCommentaryDistributionEnvelope.js';
import {
    PublicationCommentaryStore,
    PublicationCommentaryConflictError
} from '../storage/PublicationCommentaryStore.js';
import { PublicationCommentaryDistributionExchange } from '../application/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionPeerExchange } from '../application/PublicationCommentaryDistributionPeerExchange.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';

import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

import { readFile } from 'node:fs/promises';

// 0.9.618 — Publication Commentary Distribution Envelope.
//
// 0.9.617's own audit measured the gap precisely: Commentary is a real,
// durable, storage-backed application fact whose one existing identity
// (publicationId) already targets the right cross-device dimension, but
// it could not leave the device it was created on, by any path — and
// neither existing decentralized envelope fit its shape without being
// repurposed. This milestone closes exactly the gap the audit named,
// nothing more: a sibling envelope (core/
// PublicationCommentaryDistributionEnvelope.js), a signing descriptor
// and verifier branch (identity/LocalAuthorizationVerifier.js#
// verifyPublicationCommentaryDistributionEnvelope()), and reuse — never
// reinvention — of the EXISTING storage/PublicationCommentaryStore.js
// for arrival dedup, announced over the EXISTING peer transport
// (peer/PeerMessageBus.js + application/ConnectedPeerRegistry.js).
//
//   Section A — envelope creation, from a real, already-in-hand
//               PublicationCommentary.
//   Section B — serialization/deserialization round trip.
//   Section C — publicationId preservation across sign/export/import.
//   Section D — commentaryId (Commentary identity) preservation.
//   Section E — signature creation.
//   Section F — signature verification.
//   Section G — tampered payload rejection.
//   Section H — wrong signing identity rejection.
//   Section I — existing Commentary-store deduplication, reused, never
//               reinvented.
//   Section J — THE FLAGSHIP: independent Device A -> Device B delivery
//               over the real, live, authenticated peer transport.
//   Section K — repeated delivery remains idempotent.
//   Section L — Publication authorship is never inferred from Commentary
//               signature.
//   Section M — Notification remains a local, downstream concern —
//               structurally, not just by convention.
//   Section N — existing local Commentary behavior is unchanged.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// The identical in-memory StorageProvider fake every Commentary/
// Notification test file in this codebase already uses.
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

function makeCommentary({ publicationId = 'pub-x', authorIdentityId, content = 'a real comment' } = {}) {
    return new PublicationCommentary({ publicationId, authorIdentityId, content });
}

// One full, real "device": its own storage, its own PublicationCommentaryStore,
// its own verifier and exchange. Mirrors tests/PublicationAnchorPeerExchange.test.js's
// own makeAnchorExchange().
function makeCommentaryExchange(identityProvider) {
    const storage = new InMemoryStorageProvider();
    const store = new PublicationCommentaryStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationCommentaryDistributionExchange(store, identityProvider, verifier);
    return { storage, store, verifier, exchange };
}

async function run() {
    // -------------------------------------------------------------
    // Section A — envelope creation.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('alice');
        const commentary = makeCommentary({ authorIdentityId: alice.getSigningIdentity().id, content: 'first comment' });
        const envelope = PublicationCommentaryDistributionEnvelope.fromCommentary(commentary);

        assert(envelope.commentaryId === commentary.commentaryId, '1. envelope.commentaryId matches the wrapped commentary');
        assert(envelope.publicationId === commentary.publicationId, '2. envelope.publicationId matches the wrapped commentary');
        assert(envelope.authorIdentityId === commentary.authorIdentityId, '3. envelope.authorIdentityId matches the wrapped commentary');
        assert(envelope.content === commentary.content, '4. envelope.content matches the wrapped commentary');
        assert(envelope.signature === null, '5. a freshly built envelope carries no signature yet');
        assert(envelope.toCommentary() === commentary, '6. toCommentary() hands back the exact same instance this envelope wraps, never a re-derived copy');

        expectThrows(() => new PublicationCommentaryDistributionEnvelope({ commentary: { publicationId: 'p', authorIdentityId: 'a', content: '' } }),
            '7. constructing an envelope around structurally invalid commentary fields (blank content) refuses — the wrapped PublicationCommentary\'s own validation is never duplicated, only reused');

        console.log('✓ A: envelope creation from a real, already-in-hand PublicationCommentary — every field preserved, no signature yet, invalid payloads refused via reuse of PublicationCommentary\'s own validation.');
    }

    // -------------------------------------------------------------
    // Section B — serialization/deserialization round trip.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('alice');
        const commentary = makeCommentary({ authorIdentityId: alice.getSigningIdentity().id, content: 'round trips cleanly' });
        const envelope = PublicationCommentaryDistributionEnvelope.fromCommentary(commentary);
        const json = envelope.toJSON();

        assert(json.kind === PUBLICATION_COMMENTARY_DISTRIBUTION_KIND, '8. the wire shape self-describes its own kind');
        assert(json.schemaVersion === 1, '9. the wire shape self-describes its own schema version');
        assert(json.commentaryId === commentary.commentaryId
            && json.publicationId === commentary.publicationId
            && json.authorIdentityId === commentary.authorIdentityId
            && json.content === commentary.content
            && json.createdAt === commentary.createdAt.toISOString(),
            '10. toJSON() carries every one of the wrapped commentary\'s own fields, verbatim');

        const restored = PublicationCommentaryDistributionEnvelope.fromJSON(json);
        assert(restored instanceof PublicationCommentaryDistributionEnvelope && restored !== envelope,
            '11. fromJSON() produces a genuinely new, independent instance');
        assert(JSON.stringify(restored.toJSON()) === JSON.stringify(json), '12. a round trip through toJSON()/fromJSON() is byte-identical');

        assert(PublicationCommentaryDistributionEnvelope.fromJSON(null) === null, '13. fromJSON(null) degrades to null, never throws');
        assert(PublicationCommentaryDistributionEnvelope.fromJSON({ kind: 'garbage' }) === null, '14. fromJSON() of a structurally invalid payload degrades to null, never throws');

        console.log('✓ B: serialization/deserialization round trip is byte-identical; malformed input degrades to null, never throws.');
    }

    // -------------------------------------------------------------
    // Section C/D — publicationId and commentaryId preservation across
    // sign/export/import.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('alice');
        const aliceId = alice.getSigningIdentity().id;
        const commentary = makeCommentary({ publicationId: 'pub-preserve', authorIdentityId: aliceId, content: 'identity must survive the trip' });

        const { exchange: aliceExchange } = makeCommentaryExchange(alice);
        const exported = aliceExchange.exportCommentary(commentary);
        assert(exported.publicationId === 'pub-preserve', '15. publicationId survives export, byte-identical');
        assert(exported.commentaryId === commentary.commentaryId, '16. commentaryId survives export, byte-identical');

        const { exchange: bobExchange } = makeCommentaryExchange(makeIdentity('bob-unused'));
        const { commentary: imported } = bobExchange.importCommentaryEnvelope(exported);
        assert(imported.publicationId === 'pub-preserve', '17. publicationId survives import, byte-identical');
        assert(imported.commentaryId === commentary.commentaryId, '18. commentaryId survives import, byte-identical — the SAME Commentary identity on both sides');

        console.log('✓ C/D: publicationId and commentaryId both survive the full sign -> export -> import trip, byte-identical.');
    }

    // -------------------------------------------------------------
    // Section E/F — signature creation and verification.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('alice');
        const aliceId = alice.getSigningIdentity().id;
        const commentary = makeCommentary({ authorIdentityId: aliceId, content: 'signed for real' });
        const { exchange, verifier } = makeCommentaryExchange(alice);

        const exported = exchange.exportCommentary(commentary);
        assert(exported.signature && typeof exported.signature.signature === 'string', '19. exportCommentary() produces a real signature');
        assert(exported.signature.signer === aliceId, '20. the signature\'s own signer equals the commentary\'s own authorIdentityId');

        const result = verifier.verifyPublicationCommentaryDistributionEnvelope(exported);
        assert(result.valid === true && result.signed === true, '21. a genuinely signed envelope verifies as valid');

        console.log('✓ E/F: signature creation and verification both work against a real, live signed envelope.');
    }

    // -------------------------------------------------------------
    // Section G — tampered payload rejection.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('alice');
        const aliceId = alice.getSigningIdentity().id;
        const commentary = makeCommentary({ authorIdentityId: aliceId, content: 'original content' });
        const { exchange } = makeCommentaryExchange(alice);
        const exported = exchange.exportCommentary(commentary);

        const tampered = { ...exported, content: 'attacker-modified content' };
        const { exchange: receiverExchange } = makeCommentaryExchange(makeIdentity('receiver-unused'));
        expectThrows(() => receiverExchange.importCommentaryEnvelope(tampered),
            '22. a tampered envelope (content changed after signing) is rejected — refuses to import, never silently accepted');

        const verifier = new LocalAuthorizationVerifier();
        const result = verifier.verifyPublicationCommentaryDistributionEnvelope(tampered);
        assert(result.valid === false && result.signed === true, '23. verification itself reports the tampered envelope as invalid-but-signed, never valid');

        console.log('✓ G: a tampered payload is rejected at both the exchange import boundary and the raw verifier check.');
    }

    // -------------------------------------------------------------
    // Section H — wrong signing identity rejection.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('alice');
        const mallory = makeIdentity('mallory');
        const aliceId = alice.getSigningIdentity().id;
        const commentary = makeCommentary({ authorIdentityId: aliceId, content: 'attributed to alice' });

        // Mallory cannot even PRODUCE a valid envelope for Alice's own
        // commentary — the exchange refuses up front, before ever
        // calling signCanonical().
        const { exchange: malloryExchange } = makeCommentaryExchange(mallory);
        expectThrows(() => malloryExchange.exportCommentary(commentary),
            '24. only the commentary\'s own author may sign it for distribution — Mallory, signed in as herself, cannot export Alice\'s commentary');

        // Even a hand-forged envelope naming Mallory as the signer, for
        // content claiming to be Alice's, fails verification — the
        // signer must equal the envelope's own authorIdentityId.
        const { exchange: aliceExchange } = makeCommentaryExchange(alice);
        const genuineFromAlice = aliceExchange.exportCommentary(commentary);
        const { exchange: malloryOwnExchange } = makeCommentaryExchange(mallory);
        const malloryOwnCommentary = makeCommentary({ authorIdentityId: mallory.getSigningIdentity().id, content: 'attributed to alice' });
        const malloryEnvelope = malloryOwnExchange.exportCommentary(malloryOwnCommentary);
        const forged = { ...malloryEnvelope, authorIdentityId: aliceId, commentaryId: genuineFromAlice.commentaryId };
        const verifier = new LocalAuthorizationVerifier();
        const forgedResult = verifier.verifyPublicationCommentaryDistributionEnvelope(forged);
        assert(forgedResult.valid === false, '25. an envelope claiming a DIFFERENT authorIdentityId than its own real signer is rejected — the signer never becomes whoever the payload claims');

        console.log('✓ H: wrong signing identity is rejected both at export (only the real author may sign) and at verification (signer must equal the claimed author).');
    }

    // -------------------------------------------------------------
    // Section I — existing Commentary-store deduplication, reused.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('alice');
        const aliceId = alice.getSigningIdentity().id;
        const commentary = makeCommentary({ authorIdentityId: aliceId, content: 'arrives twice' });
        const { exchange: aliceExchange } = makeCommentaryExchange(alice);
        const exported = aliceExchange.exportCommentary(commentary);

        const { store, exchange: receiverExchange } = makeCommentaryExchange(makeIdentity('receiver-unused'));
        const first = receiverExchange.importCommentaryEnvelope(exported);
        assert(first.isNew === true, '26. the first arrival is genuinely new');
        const second = receiverExchange.importCommentaryEnvelope(exported);
        assert(second.isNew === false, '27. an identical second arrival is an idempotent no-op — storage/PublicationCommentaryStore.js\'s own existing identity semantics, reused directly, never reinvented');
        assert(store.getForPublication(commentary.publicationId).length === 1, '28. exactly one commentary ends up on file, never a duplicate');

        // A genuinely conflicting arrival under the SAME commentaryId
        // (a different signed record) follows the store's existing
        // conflict semantics — never a new conflict-resolution
        // subsystem built for distribution.
        const conflictingCommentary = new PublicationCommentary({
            commentaryId: commentary.commentaryId,
            publicationId: commentary.publicationId,
            authorIdentityId: aliceId,
            content: 'a different claimed content under the same id'
        });
        const conflictingEnvelope = { ...exported, content: conflictingCommentary.content };
        // Re-sign so the tampered content still carries a genuinely
        // valid signature — this models a second, honestly-signed
        // envelope under the same commentaryId, not a forged one.
        let resignable = PublicationCommentaryDistributionEnvelope.fromCommentary(conflictingCommentary);
        resignable = resignable.withSignature(alice.signCanonical(resignable.getSigningDescriptor()));
        expectThrows(() => receiverExchange.importCommentaryEnvelope(resignable.toJSON()),
            '29. a genuinely different, genuinely signed record under the SAME commentaryId is refused as a conflict — PublicationCommentaryConflictError propagates unmodified from the existing store');
        try {
            receiverExchange.importCommentaryEnvelope(resignable.toJSON());
            assert(false, 'unreachable');
        } catch (error) {
            assert(error instanceof PublicationCommentaryConflictError, '30. the propagated error is genuinely a PublicationCommentaryConflictError, the store\'s own existing type');
        }

        console.log('✓ I: arrival dedup and conflict-refusal both come straight from the existing PublicationCommentaryStore — no second, distribution-specific dedup or conflict mechanism was built.');
    }

    // -------------------------------------------------------------
    // Section J — THE FLAGSHIP: Device A -> Device B, over the real,
    // live, authenticated peer transport.
    // -------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('alice-device-a');
        const bob = makeIdentity('bob-device-b');

        const aliceTransport = new LocalPeerConnectionProvider('alice-commentary', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-commentary', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();

        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-commentary' });

        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '31. setup: Device B authenticates to Device A over the real transport');

        // DEVICE A — creates the commentary and its own distribution
        // exchange/peer-exchange, wired to its OWN independent
        // PublicationCommentaryStore.
        const { store: deviceAStore, exchange: deviceAExchange } = makeCommentaryExchange(alice);
        const deviceABus = new PeerMessageBus();
        const deviceAPeerExchange = new PublicationCommentaryDistributionPeerExchange(deviceAExchange, deviceABus, aliceConnect.registry);

        // DEVICE B — an entirely independent PublicationCommentaryStore,
        // storage, exchange, and peer-exchange. Nothing here is shared
        // with Device A except the live authenticated connection.
        const { store: deviceBStore, exchange: deviceBExchange } = makeCommentaryExchange(bob);
        const deviceBBus = new PeerMessageBus();
        const deviceBPeerExchange = new PublicationCommentaryDistributionPeerExchange(deviceBExchange, deviceBBus, bobConnect.registry);

        const deviceBReceived = [];
        deviceBPeerExchange.onCommentaryReceived((result) => deviceBReceived.push(result));

        const aliceId = alice.getSigningIdentity().id;
        const commentary = new PublicationCommentary({
            publicationId: 'pub-cross-device',
            authorIdentityId: aliceId,
            content: 'created on Device A, distributed to Device B'
        });
        deviceAStore.save(commentary);
        assert(deviceAStore.getById(commentary.commentaryId) !== null, '32. setup: Device A holds the commentary locally, through the ordinary, unmodified store');
        assert(deviceBStore.getById(commentary.commentaryId) === null, '33. setup: Device B has never heard of it — the exact starting gap 0.9.617\'s own audit measured');

        const sentCount = deviceAPeerExchange.announce(commentary);
        assert(sentCount === 1, '34. Device A announces to exactly the one AUTHENTICATED peer it has');
        await wait(30);

        // THE DECISIVE ASSERTION: Device B's own, INDEPENDENT
        // PublicationCommentaryStore contains the same Commentary
        // identity.
        const onDeviceB = deviceBStore.getById(commentary.commentaryId);
        assert(onDeviceB !== null, '35. THE FLAGSHIP: Device B\'s own independent store now holds a commentary under the exact same commentaryId — the missing product capability, closed');
        assert(onDeviceB.publicationId === commentary.publicationId
            && onDeviceB.authorIdentityId === commentary.authorIdentityId
            && onDeviceB.content === commentary.content,
            '36. every field arrived intact — publicationId, authorIdentityId, and content all match Device A\'s own original');
        assert(deviceBReceived.length === 1 && deviceBReceived[0].isNew === true, '37. onCommentaryReceived fired exactly once, reporting a genuinely new arrival');

        // Device A's own store is completely untouched by any of this —
        // distribution never mutates the sender's own local state.
        assert(deviceAStore.getForPublication('pub-cross-device').length === 1, '38. Device A\'s own store still holds exactly the one commentary it always did');

        stopAliceListening();
        stopBobListening();
        deviceAPeerExchange.dispose();
        deviceBPeerExchange.dispose();

        console.log('✓ J: FLAGSHIP — a commentary created on Device A crosses a real, live, authenticated peer connection and lands, byte-identical, in Device B\'s own independent PublicationCommentaryStore.');
    }

    // -------------------------------------------------------------
    // Section K — repeated delivery remains idempotent.
    // -------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('alice-repeat');
        const bob = makeIdentity('bob-repeat');
        const aliceTransport = new LocalPeerConnectionProvider('alice-repeat-ep', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-repeat-ep', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-repeat-ep' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '39. setup: repeat-delivery devices connected');

        const { store: deviceAStore, exchange: deviceAExchange } = makeCommentaryExchange(alice);
        const deviceABus = new PeerMessageBus();
        const deviceAPeerExchange = new PublicationCommentaryDistributionPeerExchange(deviceAExchange, deviceABus, aliceConnect.registry);
        const { store: deviceBStore, exchange: deviceBExchange } = makeCommentaryExchange(bob);
        const deviceBBus = new PeerMessageBus();
        const deviceBPeerExchange = new PublicationCommentaryDistributionPeerExchange(deviceBExchange, deviceBBus, bobConnect.registry);
        const received = [];
        deviceBPeerExchange.onCommentaryReceived((r) => received.push(r));

        const commentary = new PublicationCommentary({
            publicationId: 'pub-repeat',
            authorIdentityId: alice.getSigningIdentity().id,
            content: 'sent more than once'
        });
        deviceAStore.save(commentary);

        deviceAPeerExchange.announce(commentary);
        deviceAPeerExchange.announce(commentary);
        deviceAPeerExchange.announce(commentary);
        await wait(30);

        assert(received.length === 3, '40. onCommentaryReceived fires once per delivery, even for repeats');
        assert(received[0].isNew === true && received[1].isNew === false && received[2].isNew === false,
            '41. only the first delivery is genuinely new; the second and third are idempotent no-ops');
        assert(deviceBStore.getForPublication('pub-repeat').length === 1, '42. exactly one commentary ends up on Device B\'s own store, regardless of how many times it was delivered');

        stopAliceListening();
        stopBobListening();
        deviceAPeerExchange.dispose();
        deviceBPeerExchange.dispose();

        console.log('✓ K: repeated delivery of the identical envelope stays idempotent, all the way through the real peer transport, with the store never accumulating a duplicate.');
    }

    // -------------------------------------------------------------
    // Section L — Publication authorship is never inferred from
    // Commentary signature.
    // -------------------------------------------------------------
    {
        const publisher = makeIdentity('publisher');
        const commenter = makeIdentity('commenter');
        const commentary = makeCommentary({ authorIdentityId: commenter.getSigningIdentity().id, content: 'a comment, not a publication claim' });
        const { exchange, verifier } = makeCommentaryExchange(commenter);
        const exported = exchange.exportCommentary(commentary);

        const result = verifier.verifyPublicationCommentaryDistributionEnvelope(exported);
        assert(result.valid === true, '43. a commentary signed by an identity with NO relationship to any Publication\'s own publisherIdentity still verifies — the two identities (publisher.getSigningIdentity().id, commenter.getSigningIdentity().id) are provably different, and it doesn\'t matter');
        assert(publisher.getSigningIdentity().id !== commenter.getSigningIdentity().id, '44. sanity: the publisher and the commenter really are different identities in this scenario');

        const verifierSrc = await rawSource('identity/LocalAuthorizationVerifier.js');
        const method = verifierSrc.slice(verifierSrc.indexOf('verifyPublicationCommentaryDistributionEnvelope('), verifierSrc.indexOf('verifyPublicationCommentaryDistributionEnvelope(') + 1400);
        assert(!method.includes('publisherIdentity'), '45. verifyPublicationCommentaryDistributionEnvelope()\'s own source never reads publisherIdentity at all — structurally incapable of conflating the two claims, not merely untested');

        console.log('✓ L: Publication authorship and Commentary authorship stay two independent identity claims — proven live, and structurally, in the verifier\'s own source.');
    }

    // -------------------------------------------------------------
    // Section M — Notification remains a local, downstream concern.
    // -------------------------------------------------------------
    {
        for (const file of ['application/PublicationCommentaryDistributionExchange.js', 'application/PublicationCommentaryDistributionPeerExchange.js', 'core/PublicationCommentaryDistributionEnvelope.js']) {
            const src = codeOnly(await rawSource(file));
            assert(!/NotificationEvent|NotificationEventStore/.test(src),
                `46. ${file} never imports or mentions NotificationEvent/NotificationEventStore — distribution stays structurally incapable of doing Notification's own job`);
        }

        // The existing NotificationEventStore is completely untouched by
        // an incoming distributed commentary — nothing in this milestone
        // ever writes to it.
        const alice = makeIdentity('alice-notif');
        const commentary = makeCommentary({ authorIdentityId: alice.getSigningIdentity().id, content: 'no notification should fire from this' });
        const { exchange: aliceExchange } = makeCommentaryExchange(alice);
        const exported = aliceExchange.exportCommentary(commentary);

        const receiverStorage = new InMemoryStorageProvider();
        const receiverStore = new PublicationCommentaryStore(receiverStorage);
        const receiverExchange = new PublicationCommentaryDistributionExchange(receiverStore, makeIdentity('receiver-notif'), new LocalAuthorizationVerifier());
        receiverExchange.importCommentaryEnvelope(exported);

        const notifications = new NotificationEventStore(receiverStorage).loadAll();
        assert(notifications.length === 0, '47. importing a distributed commentary writes zero NotificationEvents — notification, if it ever reacts to this, is entirely a separate, later, local caller\'s decision');

        console.log('✓ M: Notification stays a local, downstream concern — structurally (no import of NotificationEvent anywhere in the new files) and behaviorally (importing a distributed commentary fires zero notifications on its own).');
    }

    // -------------------------------------------------------------
    // Section N — existing local Commentary behavior is unchanged.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('alice-regression');
        const storage = new InMemoryStorageProvider();
        const store = new PublicationCommentaryStore(storage);
        const commentary = new PublicationCommentary({
            publicationId: 'pub-regression',
            authorIdentityId: alice.getSigningIdentity().id,
            content: 'ordinary local commentary, never touched by distribution'
        });
        assert(store.save(commentary) === true, '48. local, non-distributed commentary creation still works exactly as before');
        assert(store.getById(commentary.commentaryId).content === commentary.content, '49. local read-back is unchanged');
        assert(typeof commentary.getSigningDescriptor !== 'function', '50. core/PublicationCommentary.js itself still carries no getSigningDescriptor() method — this milestone adds a signature to the DISTRIBUTION ENVELOPE only, never to the domain object 0.9.617\'s own audit measured as unsigned');
        assert(!('signature' in commentary) && commentary._signature === undefined, '51. core/PublicationCommentary.js itself still carries no signature field of any kind — unmodified by this milestone, exactly as its own header promises');

        console.log('✓ N: existing, local, non-distributed Commentary behavior is completely unchanged — core/PublicationCommentary.js itself was never modified.');
    }

    console.log('✅ All Publication Commentary Distribution tests passed.');
}

await run();
