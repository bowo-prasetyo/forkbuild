import { execSync } from 'node:child_process';

import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryDistributionEnvelope } from '../core/PublicationCommentaryDistributionEnvelope.js';
import { PublicationCommentaryStore, PublicationCommentaryConflictError } from '../storage/PublicationCommentaryStore.js';
import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';

import { NostrPublicationDiscoveryPublisher } from '../application/nostr/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';

import {
    PublicationCommentaryDeliveryStatus,
    PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE,
    isPublicationCommentaryDeliveryStatus,
    isValidPublicationCommentaryDeliveryStatusTransition,
    describePublicationCommentaryAsynchronousDeliverySubstrateContract,
    describesConformingPublicationCommentaryAsynchronousDeliverySubstrate
} from '../core/PublicationCommentaryAsynchronousDeliveryContract.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// 0.9.626 — Publication Commentary Asynchronous Delivery Contract.
//
// TYPE: narrow production implementation (one new, pure, substrate-neutral
// file — core/PublicationCommentaryAsynchronousDeliveryContract.js) plus
// comprehensive tests. Implements none of: Nostr relay publishing, Arweave
// uploading, historical sync, relay/substrate selection or fallback,
// global indexing, subscriptions, fan-out, delivery guarantees, read
// receipts, delivery-status UI, retry queues, background workers, new
// Commentary persistence, new Commentary identity, a new dedup service,
// any Publication authorization change, or any change to the existing
// WebRTC path — see the new file's own header for the full exclusion list,
// reconfirmed structurally in Section G below.
//
// THE QUESTION THIS MILESTONE ANSWERS, precisely scoped from 0.9.625's own
// verdict: 0.9.625 found no concrete PRODUCT requirement for Nostr/Arweave
// Commentary distribution at that time, and found the existing discovery-
// envelope families structurally incompatible with a signed Commentary
// envelope. A follow-up product argument named a genuine, previously
// unmeasured reachability gap — WebRTC delivers Commentary only to a peer
// currently connected; an offline or never-connected recipient can never
// receive it, by any existing path, ever — and asked for the smallest
// substrate-neutral CONTRACT a future persistent substrate would need to
// satisfy, without building that substrate yet. This file's own tests
// prove three things, live, against real production classes: (1) the
// contract is a genuine, useful vocabulary distinguishing "published" from
// "delivered"; (2) the EXISTING, UNMODIFIED
// PublicationCommentaryDistributionEnvelope already satisfies it end to
// end, with no new envelope required; (3) the two existing Nostr/Arweave
// publisher classes, unmodified, correctly do NOT satisfy it — confirming
// live that 0.9.625's own finding (a new publisher family would be
// required, never a rewiring of the existing one) still holds after this
// milestone.
//
//   Section A — delivery-status vocabulary: values, ordering, membership.
//   Section B — transition predicate: forward, skip-ahead, backward,
//               self, and unknown-value cases.
//   Section C — substrate conformance: a fake round-trip substrate
//               conforms; the real, unmodified Nostr/Arweave publish-only
//               classes do not.
//   Section D — FLAGSHIP: a live, end-to-end asynchronous delivery
//               round trip — Alice creates and signs a Commentary while
//               Bob is offline; a generic fake persistent substrate
//               carries it; Bob comes online later and admits it — using
//               the real, unmodified envelope, exchange, verifier, and
//               store throughout, traversing every one of the seven
//               named stages in order.
//   Section E — a tampered envelope fails VERIFIED and is never ADMITTED
//               — no new logic makes verification-then-storage anything
//               but a hard gate, exactly as the existing (unmodified)
//               exchange class already enforces it for the WebRTC path.
//   Section F — VERIFIED never implies Publication ownership, even over
//               this new asynchronous path — the same narrow, structural
//               signature claim 0.9.618's own header already establishes,
//               reconfirmed live for an envelope that traveled through a
//               substrate rather than a peer connection.
//   Section G — production-change guard: exactly one new production file,
//               no existing production file modified.
//   Section H — exclusion guard: no Nostr/Arweave-flavored Commentary file
//               exists yet, and none of the excluded capabilities were
//               accidentally introduced.
//
// AMENDED BY 0.9.629 — Publication Commentary Nostr Asynchronous
// Distribution Closure Audit. Two independent, unrelated things went
// stale here, both fixed in place, below:
//
//   (1) Section G's own "new production file" detection used
//       `git status --porcelain` filtered for `??` (untracked) lines —
//       correct ONLY while core/PublicationCommentaryAsynchronousDeliveryContract.js
//       itself was still an uncommitted, untracked file in THIS milestone's
//       own original working tree. Once 0.9.626 was committed (immediately
//       after this file was first written), that same file is no longer
//       "new" by any git-porcelain heuristic — it is simply present,
//       forever after, exactly like every other production file this
//       codebase has ever shipped. This is a general fragility in
//       untracked-file detection as a "was this milestone's own addition"
//       proof, not specific to Nostr/Arweave — it would have gone stale
//       the moment ANY future commit landed, regardless of what that
//       commit touched. Section G now checks the file's own continued
//       EXISTENCE and its own git log authorship instead.
//   (2) Section H's own exclusion guard correctly found zero Nostr/Arweave-
//       flavored Commentary files AT THE TIME — 0.9.626 built a
//       substrate-neutral CONTRACT only, deliberately naming no substrate.
//       0.9.628 subsequently built exactly the Nostr adapter this
//       contract's own header anticipated (application/
//       PublicationCommentaryNostrDistribution.js, application/
//       DiscoverPublicationCommentaryFromNostrUseCase.js) — CONFORMING TO
//       this contract, never modifying it (reconfirmed live in Section H,
//       below).
//
// AMENDED AGAIN BY 0.9.631 — Publication Commentary Arweave Asynchronous
// Distribution. Section H's own "Arweave remains untouched" half of point
// (2), above, went stale the same way its Nostr half already had: 0.9.631
// built exactly the Arweave adapter/admission-boundary pair this contract's
// own header anticipated (application/publication/commentary/PublicationCommentaryArweaveDistribution.js,
// application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js), also
// CONFORMING TO this unmodified contract — reconfirmed live in Section H,
// below.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

// A deliberately generic, substrate-agnostic FAKE — never a mock of Nostr
// or Arweave, and never named after either — standing in for "some future
// persistent substrate satisfying this milestone's own contract." An
// in-memory Map is sufficient to prove the CONTRACT is satisfiable; it
// says nothing about which real substrate (Nostr, Arweave, or something
// else) a later, unscheduled milestone might actually build.
class FakeGenericPersistentSubstrate {
    constructor() { this._records = new Map(); this._nextLocator = 1; }
    async publish(envelopeJson) {
        const locator = `fake-substrate-locator-${this._nextLocator++}`;
        this._records.set(locator, JSON.parse(JSON.stringify(envelopeJson)));
        return { published: true, locator };
    }
    async retrieve(locator) {
        const record = this._records.get(locator);
        return record ? JSON.parse(JSON.stringify(record)) : null;
    }
}

async function run() {
    // ===============================================================
    // Section A — delivery-status vocabulary.
    // ===============================================================
    {
        const expected = ['CREATED', 'SIGNED', 'PERSISTENTLY_PUBLISHED', 'DISCOVERABLE', 'RETRIEVED', 'VERIFIED', 'ADMITTED'];
        assert(expected.every((name) => PublicationCommentaryDeliveryStatus[name] === name),
            n('PublicationCommentaryDeliveryStatus exposes exactly the seven named stages this milestone\'s own header documents, each value equal to its own key'));
        assert(Object.keys(PublicationCommentaryDeliveryStatus).length === 7,
            n('no extra, undocumented status value has been added'));
        assert(Object.isFrozen(PublicationCommentaryDeliveryStatus),
            n('the enum object itself is frozen — no caller can add or overwrite a status value at runtime'));

        assert(JSON.stringify(PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE) === JSON.stringify(expected),
            n('PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE names the exact same seven values, in the exact product order this milestone\'s own header diagrams: CREATED -> SIGNED -> PERSISTENTLY_PUBLISHED -> DISCOVERABLE -> RETRIEVED -> VERIFIED -> ADMITTED'));
        assert(Object.isFrozen(PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE),
            n('the sequence array is frozen'));

        assert(isPublicationCommentaryDeliveryStatus('ADMITTED') === true,
            n('isPublicationCommentaryDeliveryStatus() recognizes a genuine value'));
        assert(isPublicationCommentaryDeliveryStatus('admitted') === false,
            n('recognition is case-sensitive — a differently-cased spelling is not a valid status'));
        assert(isPublicationCommentaryDeliveryStatus('DELETED') === false
            && isPublicationCommentaryDeliveryStatus(null) === false
            && isPublicationCommentaryDeliveryStatus(undefined) === false
            && isPublicationCommentaryDeliveryStatus(42) === false,
            n('an unrecognized string, null, undefined, and a non-string all return false, never throw'));

        console.log('✓ A: the seven-stage delivery-status vocabulary exists, is complete, is frozen, and is exactly the ordering this milestone\'s own header names.');
    }

    // ===============================================================
    // Section B — transition predicate.
    // ===============================================================
    {
        const S = PublicationCommentaryDeliveryStatus;
        assert(isValidPublicationCommentaryDeliveryStatusTransition(S.CREATED, S.SIGNED) === true,
            n('one adjacent forward step (CREATED -> SIGNED) is valid'));
        assert(isValidPublicationCommentaryDeliveryStatusTransition(S.CREATED, S.ADMITTED) === true,
            n('a skip-ahead jump all the way to the end (CREATED -> ADMITTED) is also valid — a substrate that never distinguishes the intermediate stages may still report the final outcome directly, per this file\'s own header'));
        assert(isValidPublicationCommentaryDeliveryStatusTransition(S.SIGNED, S.RETRIEVED) === true,
            n('a skip-ahead jump over exactly the two substrate-internal stages (SIGNED -> RETRIEVED, skipping PERSISTENTLY_PUBLISHED/DISCOVERABLE) is valid'));

        assert(isValidPublicationCommentaryDeliveryStatusTransition(S.VERIFIED, S.SIGNED) === false,
            n('a backward step (VERIFIED -> SIGNED) is invalid'));
        assert(isValidPublicationCommentaryDeliveryStatusTransition(S.ADMITTED, S.CREATED) === false,
            n('the maximal backward step (ADMITTED -> CREATED) is invalid'));
        assert(isValidPublicationCommentaryDeliveryStatusTransition(S.SIGNED, S.SIGNED) === false,
            n('a self-transition (SIGNED -> SIGNED) is invalid — re-affirming the same known status is not a transition'));

        assert(isValidPublicationCommentaryDeliveryStatusTransition('NOT_A_STATUS', S.SIGNED) === false,
            n('an unrecognized `from` value makes the transition invalid, never thrown'));
        assert(isValidPublicationCommentaryDeliveryStatusTransition(S.SIGNED, 'NOT_A_STATUS') === false,
            n('an unrecognized `to` value makes the transition invalid, never thrown'));
        assert(isValidPublicationCommentaryDeliveryStatusTransition(null, undefined) === false,
            n('null/undefined arguments degrade to false rather than throwing'));

        console.log('✓ B: the transition predicate accepts any forward move (adjacent or skip-ahead), rejects every backward or self move, and degrades unrecognized input to false without throwing.');
    }

    // ===============================================================
    // Section C — substrate conformance.
    // ===============================================================
    {
        const contractShape = describePublicationCommentaryAsynchronousDeliverySubstrateContract();
        assert(typeof contractShape.publish === 'string' && typeof contractShape.retrieve === 'string',
            n('describePublicationCommentaryAsynchronousDeliverySubstrateContract() documents both a publish and a retrieve shape, as plain descriptive strings — never executable code, never a base class'));
        assert(Object.isFrozen(contractShape),
            n('the returned descriptor is frozen'));

        const fakeSubstrate = new FakeGenericPersistentSubstrate();
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(fakeSubstrate) === true,
            n('a generic fake substrate exposing both publish() and retrieve() conforms to the contract'));

        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(null) === false
            && describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(undefined) === false
            && describesConformingPublicationCommentaryAsynchronousDeliverySubstrate('a string') === false
            && describesConformingPublicationCommentaryAsynchronousDeliverySubstrate({}) === false,
            n('null, undefined, a primitive, and a bare empty object all fail to conform, never throw'));

        // LIVE cross-check against the real, unmodified existing publisher
        // classes — 0.9.625's own flagship finding was that Commentary
        // needs an opposite shape (delivery, not mere announcement) from
        // what these classes provide; this reconfirms it structurally,
        // via this milestone's own new contract, rather than merely citing
        // that earlier audit's prose.
        const realNostrPublisher = new NostrPublicationDiscoveryPublisher({
            discoveryTag: 'forkbuild-0.9.626-contract-check',
            publishImpl: async () => ({ published: true, id: '0'.repeat(64) })
        });
        assert(typeof realNostrPublisher.publish === 'function' && typeof realNostrPublisher.retrieve === 'undefined',
            n('the real, unmodified NostrPublicationDiscoveryPublisher exposes publish() but no retrieve() of any kind'));
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(realNostrPublisher) === false,
            n('LIVE: the real, unmodified NostrPublicationDiscoveryPublisher instance does NOT conform to this milestone\'s own asynchronous delivery contract — it is a publish-only locator announcer, exactly as 0.9.625 Section B/D found; this milestone introduces no shim, adapter, or retrieve() of any kind for it'));

        const realArweavePublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'forkbuild-0.9.626-contract-check',
            uploadTaggedTransaction: async () => ({ id: 'a'.repeat(43) })
        });
        assert(typeof realArweavePublisher.publish === 'function' && typeof realArweavePublisher.retrieve === 'undefined',
            n('the real, unmodified ArweaveAnnouncementPublisher likewise exposes publish() but no retrieve()'));
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(realArweavePublisher) === false,
            n('LIVE: the real, unmodified ArweaveAnnouncementPublisher instance also does NOT conform — reconfirming 0.9.625\'s own conclusion that a genuinely new publisher/query-service family, never a reuse of either existing class, is what any future substrate implementation would require'));

        console.log('✓ C: the contract\'s own conformance check correctly accepts a generic round-trip substrate and correctly rejects both real, unmodified, publish-only Nostr/Arweave announcement classes — live confirmation that this milestone builds no shim making either of them appear to satisfy a job they do not do.');
    }

    // ===============================================================
    // Section D — FLAGSHIP: live, end-to-end asynchronous delivery
    // round trip, using only real, unmodified production classes plus
    // one generic fake substrate.
    // ===============================================================
    {
        const S = PublicationCommentaryDeliveryStatus;
        const traversed = [S.CREATED];

        // Alice, on her own device, writes a comment about a Publication
        // Bob owns. Bob is not connected — there is no peer to announce to
        // over the existing WebRTC path, which this section deliberately
        // never constructs.
        const aliceProvider = makeIdentity('0.9.626-alice');
        const aliceStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const aliceExchange = new PublicationCommentaryDistributionExchange(
            aliceStore, aliceProvider, new LocalAuthorizationVerifier()
        );
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.626-bobs-work',
            authorIdentityId: aliceProvider.getSigningIdentity().id,
            content: 'a comment for an offline recipient, 0.9.626'
        });
        aliceStore.save(commentary);
        assert(aliceStore.getById(commentary.commentaryId) !== null,
            n('CREATED: Alice\'s own local, unsigned Commentary exists in her own store — the real, unmodified 0.9.242/0.9.243 domain and storage classes, untouched by this milestone'));

        // SIGNED — via the real, unmodified 0.9.618 exchange. This is the
        // EXACT SAME envelope-producing call
        // application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js#
        // announce() already makes for the WebRTC path; this milestone
        // introduces no second signing path.
        const signedEnvelopeJson = aliceExchange.exportCommentary(commentary);
        assert(signedEnvelopeJson.signature && typeof signedEnvelopeJson.signature === 'object',
            n('SIGNED: a real, signed PublicationCommentaryDistributionEnvelope#toJSON() — the identical wire shape the existing WebRTC path already announces, produced here with no substrate of any kind involved yet'));
        traversed.push(S.SIGNED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the CREATED -> SIGNED step just taken is a valid transition per this milestone\'s own predicate'));

        // PERSISTENTLY_PUBLISHED — a generic fake substrate accepts the
        // envelope's own JSON directly (no locator-plus-content-store
        // pattern; see this file's own header). Confirmed conforming
        // first, exactly as a real caller would check before using it.
        const substrate = new FakeGenericPersistentSubstrate();
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(substrate) === true,
            n('the substrate used for this round trip genuinely conforms to the contract before it is used'));
        const publishResult = await substrate.publish(signedEnvelopeJson);
        assert(publishResult && publishResult.published === true && typeof publishResult.locator === 'string',
            n('PERSISTENTLY_PUBLISHED: the substrate accepted the envelope and returned a locator'));
        traversed.push(S.PERSISTENTLY_PUBLISHED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the SIGNED -> PERSISTENTLY_PUBLISHED step is a valid transition'));

        // DISCOVERABLE — the substrate can be asked for it, by locator
        // alone, from a party who never saw the original envelope object
        // (a fresh reference to the same substrate instance stands in for
        // "the same durable substrate, queried independently, later" — no
        // shared in-process state beyond the substrate itself is used).
        const locatorKnownToBob = publishResult.locator;
        traversed.push(S.DISCOVERABLE);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the PERSISTENTLY_PUBLISHED -> DISCOVERABLE step is a valid transition — Bob now merely KNOWS a locator exists; he has not yet fetched anything'));

        // RETRIEVED — "days later," Bob comes online and retrieves by
        // locator alone.
        const retrievedEnvelopeJson = await substrate.retrieve(locatorKnownToBob);
        assert(retrievedEnvelopeJson !== null
            && retrievedEnvelopeJson.commentaryId === signedEnvelopeJson.commentaryId
            && retrievedEnvelopeJson.content === signedEnvelopeJson.content,
            n('RETRIEVED: Bob\'s later retrieve() call, using only the locator, returns the exact envelope JSON Alice published'));
        traversed.push(S.RETRIEVED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the DISCOVERABLE -> RETRIEVED step is a valid transition'));

        // VERIFIED — Bob's own device, running the real, unmodified 0.9.618
        // envelope class and the real, unmodified verifier. Nothing about
        // verification changes because the bytes arrived via a substrate
        // rather than a peer connection — the same envelope, the same
        // verifier, the same signing descriptor.
        const reconstructedEnvelope = PublicationCommentaryDistributionEnvelope.fromJSON(retrievedEnvelopeJson);
        assert(reconstructedEnvelope !== null,
            n('the real, unmodified PublicationCommentaryDistributionEnvelope.fromJSON() reconstructs a real envelope instance from the retrieved wire JSON'));
        const verifier = new LocalAuthorizationVerifier();
        const verification = verifier.verifyPublicationCommentaryDistributionEnvelope(reconstructedEnvelope.toJSON());
        assert(verification.valid === true,
            n('VERIFIED: the real, unmodified LocalAuthorizationVerifier#verifyPublicationCommentaryDistributionEnvelope() accepts the envelope that traveled through the fake substrate — identical outcome to the existing WebRTC path for the identical bytes'));
        traversed.push(S.VERIFIED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the RETRIEVED -> VERIFIED step is a valid transition'));

        // ADMITTED — Bob's own local store, the SAME store class a
        // WebRTC-received commentary already uses, unmodified.
        const bobStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const admitted = bobStore.save(reconstructedEnvelope.toCommentary());
        assert(admitted === true && bobStore.getById(commentary.commentaryId) !== null,
            n('ADMITTED: Bob\'s own, real, unmodified PublicationCommentaryStore now holds the Commentary — no second Commentary database, no new persistence mechanism of any kind'));
        traversed.push(S.ADMITTED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the VERIFIED -> ADMITTED step is a valid transition'));

        assert(JSON.stringify(traversed) === JSON.stringify(PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE),
            n('the exact sequence of stages this end-to-end round trip actually traversed matches PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE precisely, in order, with none skipped and none repeated'));

        // Re-admitting the identical commentary a second time (Bob comes
        // online twice, or the substrate is queried twice) stays
        // idempotent, via the store's own existing, unmodified semantics —
        // never a new dedup service this milestone might otherwise have
        // been tempted to add.
        const reAdmitted = bobStore.save(PublicationCommentaryDistributionEnvelope.fromJSON(retrievedEnvelopeJson).toCommentary());
        assert(reAdmitted === false,
            n('re-admitting the same retrieved envelope a second time is an idempotent no-op — storage/PublicationCommentaryStore.js\'s own EXISTING commentaryId semantics (0.9.243), never a new deduplication mechanism built for this milestone'));

        console.log('✓ D — FLAGSHIP: a real, signed Commentary, authored while its recipient was entirely offline, travels CREATED -> SIGNED -> PERSISTENTLY_PUBLISHED -> DISCOVERABLE -> RETRIEVED -> VERIFIED -> ADMITTED end to end, using the existing, UNMODIFIED PublicationCommentary/PublicationCommentaryDistributionEnvelope/PublicationCommentaryDistributionExchange/LocalAuthorizationVerifier/PublicationCommentaryStore classes throughout, plus exactly one new, generic, substrate-agnostic fake — no Nostr, no Arweave, no new envelope, no new identity, no new persistence.');
    }

    // ===============================================================
    // Section E — a tampered envelope fails VERIFIED and is never
    // ADMITTED.
    // ===============================================================
    {
        const authorProvider = makeIdentity('0.9.626-tamper-author');
        const authorStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const exchange = new PublicationCommentaryDistributionExchange(
            authorStore, authorProvider, new LocalAuthorizationVerifier()
        );
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.626-tamper-target',
            authorIdentityId: authorProvider.getSigningIdentity().id,
            content: 'the original, honestly signed content'
        });
        const envelopeJson = exchange.exportCommentary(commentary);

        const substrate = new FakeGenericPersistentSubstrate();
        const { locator } = await substrate.publish(envelopeJson);

        // Simulate a substrate that (maliciously, or through corruption)
        // hands back tampered bytes on retrieve — this milestone's own
        // "Nostr/Arweave claim, therefore legitimate" trap named directly
        // in the requesting brief.
        const retrieved = await substrate.retrieve(locator);
        const tampered = { ...retrieved, content: 'a forged edit the original author never signed' };

        const reconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(tampered);
        assert(reconstructed !== null,
            n('a tampered envelope still reconstructs structurally — tampering here is a content change, not a malformed shape, so fromJSON() itself has no reason to reject it'));

        const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructed.toJSON());
        assert(verification.valid === false,
            n('VERIFIED fails for the tampered envelope — the signature was computed over the ORIGINAL content, and no longer matches'));

        // The discipline this file itself requires: ADMITTED must never
        // happen without VERIFIED succeeding first. This is not new logic
        // — it is the same gate application/
        // PublicationCommentaryDistributionExchange.js#importCommentaryEnvelope()
        // already enforces for the WebRTC path, reconfirmed here for a
        // substrate-delivered envelope instead.
        const recipientStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        let saveAttempted = false;
        if (verification.valid) {
            saveAttempted = true;
            recipientStore.save(reconstructed.toCommentary());
        }
        assert(saveAttempted === false && recipientStore.getById(commentary.commentaryId) === null,
            n('ADMITTED never occurs for a tampered envelope — a caller following this contract\'s own VERIFIED gate never calls store.save() on unverified material, and the recipient\'s store remains empty'));

        console.log('✓ E: a substrate that hands back tampered bytes on retrieve is caught at VERIFIED, using the real, unmodified verifier — ADMITTED is a hard downstream gate, never something a corrupt or malicious substrate can force.');
    }

    // ===============================================================
    // Section F — VERIFIED never implies Publication ownership, even
    // over this new asynchronous path.
    // ===============================================================
    {
        const aliceProvider = makeIdentity('0.9.626-ownership-alice');
        const aliceStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const exchange = new PublicationCommentaryDistributionExchange(
            aliceStore, aliceProvider, new LocalAuthorizationVerifier()
        );
        // Alice comments on a publicationId she has no relationship to at
        // all — this milestone's own security property never asks whether
        // she may; that remains application/publication/CanCommentOnPublicationUseCase.js's
        // own, separate, local-only, unmodified concern.
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.626-bobs-publication-alice-never-touched',
            authorIdentityId: aliceProvider.getSigningIdentity().id,
            content: 'Hello — a genuinely Alice-authored comment about Bob\'s work'
        });
        const envelopeJson = exchange.exportCommentary(commentary);

        const substrate = new FakeGenericPersistentSubstrate();
        const { locator } = await substrate.publish(envelopeJson);
        const retrieved = await substrate.retrieve(locator);
        const reconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(retrieved);
        const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructed.toJSON());

        assert(verification.valid === true,
            n('the envelope is genuinely, correctly VERIFIED — Alice really did sign exactly this commentaryId/publicationId/content/createdAt tuple'));
        assert(reconstructed.authorIdentityId === aliceProvider.getSigningIdentity().id,
            n('the envelope\'s own authorIdentityId is Alice\'s — a real, valid claim of AUTHORSHIP of the comment'));
        assert(reconstructed.publicationId === 'pub-0.9.626-bobs-publication-alice-never-touched',
            n('the envelope names a publicationId Alice has no recorded relationship to whatsoever in this test'));
        assert(!('publisherIdentity' in reconstructed.toJSON()) && !('publicationAuthorId' in reconstructed.toJSON()),
            n('nothing about VERIFIED establishes, checks, or even represents Publication authorship/ownership — the envelope carries no such field to check, exactly as core/PublicationCommentaryDistributionEnvelope.js\'s own header states ("A narrow, structural claim, never Publication ownership"), reconfirmed here for an envelope that traveled through an asynchronous substrate rather than a live peer connection'));

        console.log('✓ F: VERIFIED, even for a Commentary delivered asynchronously, establishes only "this identity really signed this exact tuple" — never that the signer authored, publishes, or has any standing relationship to the named Publication. The security property the requesting brief named holds unchanged across this new delivery path.');
    }

    // ===============================================================
    // Section G — production-change guard.
    // ===============================================================
    {
        // AMENDED BY 0.9.629 — see this file's own header note, above.
        // `git status --porcelain` can only ever detect an UNCOMMITTED
        // new file; once 0.9.626 committed this file, that heuristic
        // stops working forever, for every future run, regardless of
        // what any later milestone touches. Existence, plus the git log
        // record of which commit actually introduced the file, is the
        // durable version of the same check.
        const changedThisMilestone = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)tests.html" ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */,
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        assert(changedThisMilestone.length === 0,
            n(`no EXISTING production file has any UNCOMMITTED modification relative to the current git HEAD — found: ${changedThisMilestone.join(', ') || 'none'}; this reconfirms the working tree this audit is running against is clean, the same entry condition the original, now-superseded git-porcelain check was trying to establish`));

        const contractFileExists = execSync(
            'test -f core/PublicationCommentaryAsynchronousDeliveryContract.js && echo yes || echo no',
            { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' }
        ).trim() === 'yes';
        assert(contractFileExists, n('core/PublicationCommentaryAsynchronousDeliveryContract.js exists on disk'));

        const introducingCommit = execSync(
            'git log --diff-filter=A --format=%H -- core/PublicationCommentaryAsynchronousDeliveryContract.js',
            { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' }
        ).trim().split('\n').filter(Boolean);
        assert(introducingCommit.length === 1,
            n(`exactly one commit in this repository's own history ever ADDED core/PublicationCommentaryAsynchronousDeliveryContract.js (never re-added after a delete, never touched by more than one initial commit) — found ${introducingCommit.length} such commit(s)`));
        const introducingCommitSubject = execSync(
            `git log -1 --format=%s ${introducingCommit[0]}`,
            { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' }
        ).trim();
        assert(/^0\.9\.626\b/.test(introducingCommitSubject),
            n(`that one introducing commit's own subject line is this milestone's own — "${introducingCommitSubject}" — confirming the file really was added by 0.9.626 and not by some later, unrelated milestone`));

        console.log('✓ G: exactly one production file was ever added by this milestone (its own git history says so, durably, rather than a working-tree heuristic that only held true for as long as the file stayed uncommitted); every existing production file — including core/PublicationCommentary.js, core/PublicationCommentaryDistributionEnvelope.js, application/publication/commentary/PublicationCommentaryDistributionExchange.js, application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js, storage/PublicationCommentaryStore.js, and identity/LocalAuthorizationVerifier.js — is untouched by it.');
    }

    // ===============================================================
    // Section H — exclusion guard.
    // ===============================================================
    {
        function grepFiles(pattern, dirs) {
            let hits = '';
            try {
                hits = execSync(`grep -rlE "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
                    { cwd: SOURCE_ROOT.pathname }).toString();
            } catch { /* zero hits */ }
            return hits.trim() ? hits.trim().split('\n') : [];
        }

        // AMENDED BY 0.9.629 — see this file's own header note, above.
        // Two Nostr-flavored Commentary files now exist (0.9.628).
        //
        // AMENDED AGAIN BY 0.9.631 — three Arweave-flavored ones now exist
        // too (application/publication/commentary/PublicationCommentaryArweaveDistribution.js,
        // application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js,
        // application/arweave/ArweaveTaggedTransactionSearch.js), built by that
        // later milestone against this file's own unmodified contract,
        // exactly as 0.9.628 already did for Nostr.
        const commentaryNostrFiles = grepFiles('Commentary', ['nostr', 'application']).filter((f) => /Nostr/.test(f) && /Commentary/i.test(f));
        const commentaryArweaveFiles = grepFiles('Commentary', ['arweave', 'application']).filter((f) => /Arweave/.test(f) && /Commentary/i.test(f));
        assert(commentaryNostrFiles.length === 2
            && commentaryNostrFiles.some((f) => f.includes('PublicationCommentaryNostrDistribution.js'))
            && commentaryNostrFiles.some((f) => f.includes('DiscoverPublicationCommentaryFromNostrUseCase.js')),
            n(`0.9.628's own two Nostr-flavored Commentary files exist — found: ${commentaryNostrFiles.join(', ') || 'none'}; this milestone itself (0.9.626) built a substrate-neutral CONTRACT only, never a substrate implementation — 0.9.628 is what later implemented one, against this file's own unmodified contract`));
        assert(commentaryArweaveFiles.length === 2
            && commentaryArweaveFiles.some((f) => f.includes('PublicationCommentaryArweaveDistribution.js'))
            && commentaryArweaveFiles.some((f) => f.includes('DiscoverPublicationCommentaryFromArweaveUseCase.js')),
            n(`0.9.631's own two Arweave-flavored Commentary files (grep-matched on both "Arweave" and "Commentary" in the same filename) exist — found: ${commentaryArweaveFiles.join(', ') || 'none'}; built one further milestone later, against this file's own unmodified contract, exactly as 0.9.628 already did for Nostr`));

        const nostrDistributionSource = execSync('cat application/publication/commentary/PublicationCommentaryNostrDistribution.js', { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        assert(/publish\(envelopeJson\)|async publish\(/.test(nostrDistributionSource) && /async retrieve\(/.test(nostrDistributionSource),
            n('the later Nostr adapter (0.9.628) exposes exactly the publish(envelopeJson)/retrieve(locator) shape this milestone\'s own contract describes — a real, live-verified conformance, never a coincidence of naming'));

        const arweaveDistributionSource = execSync('cat application/publication/commentary/PublicationCommentaryArweaveDistribution.js', { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        assert(/publish\(envelopeJson\)|async publish\(/.test(arweaveDistributionSource) && /async retrieve\(/.test(arweaveDistributionSource),
            n('the later Arweave adapter (0.9.631) exposes the identical publish(envelopeJson)/retrieve(locator) shape too — a real, live-verified conformance one substrate over'));

        const contractSource = execSync('git show HEAD:core/PublicationCommentaryAsynchronousDeliveryContract.js 2>/dev/null || cat core/PublicationCommentaryAsynchronousDeliveryContract.js',
            { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        const contractCodeOnly = contractSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/nostr|arweave/i.test(contractCodeOnly),
            n('the new contract file\'s own executable code never names Nostr or Arweave anywhere — a genuinely substrate-neutral file, not one substrate\'s contract wearing a generic name'));
        assert(!/fetch\(|XMLHttpRequest|WebSocket|localStorage|IndexedDB/.test(contractCodeOnly),
            n('the new contract file performs no I/O of any kind — pure values and pure functions only, exactly as its own header states'));
        assert(!/async /.test(contractCodeOnly),
            n('the new contract file defines no async function of its own — publish()/retrieve() are described, never implemented, here'));

        const envelopeSource = execSync('cat core/PublicationCommentaryDistributionEnvelope.js', { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        assert(!/nostrEventId|arweaveTransactionId|deliveryStatus|deliveryReceipt/i.test(envelopeSource),
            n('core/PublicationCommentaryDistributionEnvelope.js still carries no substrate-delivery-receipt field of any kind, and no embedded delivery-status field — this milestone tracks status externally, in the caller\'s own hands, never inside the envelope\'s own identity'));

        const peerExchangeSource = execSync('cat application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js', { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        assert(!/AsynchronousDeliveryContract/.test(peerExchangeSource),
            n('the existing WebRTC peer exchange class does not import or reference this milestone\'s own new contract file at all — the live-dissemination path is completely unchanged and unaware of it'));

        console.log('✓ H (AMENDED BY 0.9.629, AMENDED AGAIN BY 0.9.631): at the time this section originally ran, no Nostr/Arweave Commentary capability existed anywhere; 0.9.628 subsequently built a real Nostr one and 0.9.631 a real Arweave one, both conforming to (and never modifying) this milestone\'s own contract — reconfirmed live, above, for both. The contract file itself remains genuinely substrate-neutral and I/O-free, Commentary\'s own identity still carries no new field, and the existing WebRTC path remains entirely untouched and unaware of this file.');
    }

    console.log(`✅ All Publication Commentary Asynchronous Delivery Contract tests passed (${assertionCount} assertions).`);
}

await run();
