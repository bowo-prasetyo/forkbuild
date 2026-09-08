import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import {
    PublicationCommentaryNotificationProducer,
    PUBLICATION_COMMENTED_EVENT_TYPE
} from '../application/PublicationCommentaryNotificationProducer.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import {
    NotificationCollisionOutcome,
    describeNotificationDeduplicationPolicy,
    notificationDeduplicationIdentity,
    haveSameNotificationDeduplicationIdentity,
    classifyNotificationCollision
} from '../core/NotificationDeduplicationPolicy.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.280 — Notification Deduplication Policy Boundary.
//
// 0.9.278 and 0.9.279 were both, by their own brief, test-only audits:
// they characterized candidate dedup identities and collision outcomes
// without ever writing an adopted answer down anywhere a real caller
// could use it. This milestone is the first production consumer of
// either audit's findings — `core/NotificationDeduplicationPolicy.js`,
// a pure, dependency-free module exposing exactly four functions:
// `describeNotificationDeduplicationPolicy`,
// `notificationDeduplicationIdentity`,
// `haveSameNotificationDeduplicationIdentity`, and
// `classifyNotificationCollision`. Unlike 0.9.278/0.9.279, this is a
// PRODUCTION POLICY + FOCUSED TEST milestone, not an audit: the policy
// file is real, adopted code, and this file exists to prove it behaves
// exactly as its own header claims.
//
//   Section A — Policy descriptor: the declared identity dimensions and
//               exclusions, each cross-checked against real behavior
//               rather than trusted as prose.
//   Section B — Stable identity: same Commentary/type/recipient produces
//               the same identity despite different notificationId,
//               createdAt, payload shape, and object identity.
//   Section C — Event-type isolation: different eventType values never
//               share an identity.
//   Section D — Recipient isolation: different recipients never share an
//               identity.
//   Section E — Commentary isolation: different commentaryIds never
//               share an identity.
//   Section F — Reconstruction: an original event and a live
//               reconstruction of it share an identity and classify as
//               MATCH.
//   Section G — Self-comment: author == recipient changes nothing about
//               identity or classification — no special-case branch
//               exists to find.
//   Section H — Compatible collision: same identity, no disagreement on
//               any shared payload field (including the payload-
//               identical case and a benign superset) → MATCH.
//   Section I — Contradictory collision: same identity, a shared payload
//               field disagrees → CONFLICT, never silently resolved.
//   Section J — Producer invocation exclusion: two independent
//               `.execute()` calls for the identical underlying fact
//               classify exactly like one hand-constructed pair would —
//               retiring 0.9.278's own fifth candidate (producer
//               invocation) from the identity model for good.
//   Section K — Policy purity: no storage, provider, `NotificationEvent`
//               mutation, time, random ID generation, or I/O anywhere in
//               `core/NotificationDeduplicationPolicy.js`; deterministic
//               output for identical inputs; and no production file
//               this milestone did not intend to touch was modified.
//
// See docs/Roadmap.md, 0.9.280, for the full milestone entry, and
// docs/Principles.md for the prose form of this file's own findings.

// ---------------------------------------------------------------------
// Helpers — identical shape to
// tests/NotificationDeduplicationCollisionSemanticsAudit.test.js
// ---------------------------------------------------------------------

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

function makePublication({ id, publisherProvider }) {
    const publication = new Publication({
        id,
        documentId: `doc-for-${id}`,
        title: `World ${id}`,
        author: 'author',
        publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
    });
    const discoveryStorage = new InMemoryStorageProvider();
    discoveryStorage.save('forkbuild-publications', [publication.toJSON()]);
    return { publication, discoveryProvider: new LocalDiscoveryProvider(discoveryStorage) };
}

function buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider, sink }) {
    const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
    const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, commentAuthorProvider, canComment);
    return new PublicationCommentaryNotificationProducer(addUseCase, discoveryProvider, sink);
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function runTests() {
    const findings = {};

    // -------------------------------------------------------------
    // Section A — Policy descriptor: the declared identity dimensions
    // and exclusions, cross-checked against real behavior.
    // -------------------------------------------------------------
    {
        const descriptor = describeNotificationDeduplicationPolicy();

        assert(Array.isArray(descriptor.identityDimensions), 'A1. descriptor exposes identityDimensions as an array');
        assert(JSON.stringify(descriptor.identityDimensions) === JSON.stringify(['commentaryId', 'eventType', 'recipientIdentityId']),
            'A2. the adopted identity is exactly commentaryId + eventType + recipientIdentityId, in that order');
        assert(descriptor.notificationIdParticipatesInIdentity === false, 'A3. notificationId is declared excluded from identity');
        assert(descriptor.createdAtParticipatesInIdentity === false, 'A4. createdAt is declared excluded from identity');
        assert(descriptor.payloadParticipatesInIdentity === false, 'A5. the payload as a whole is declared excluded from identity (only payload.commentaryId is elevated)');
        assert(descriptor.producerInvocationParticipatesInIdentity === false, 'A6. producer invocation is declared excluded from identity');
        assert(descriptor.collisionHandling === 'INSPECT_FOR_CONFLICT', 'A7. collision handling is declared as inspection, never blind overwrite');
        assert(descriptor.reconstructionIsStable === true, 'A8. reconstruction stability is declared true');
        assert(descriptor.recipientFanOutIsSeparated === true, 'A9. recipient fan-out separation is declared true');
        assert(descriptor.eventTypeIsSeparated === true, 'A10. event-type separation is declared true');
        assert(descriptor.selfCommentIsSpecialCased === false, 'A11. self-comment is declared NOT special-cased');

        // A returned descriptor is a fresh, independent object every
        // call — mutating one caller's copy must never affect another's,
        // or the module's own frozen constant.
        descriptor.identityDimensions.push('mutated');
        const descriptorAgain = describeNotificationDeduplicationPolicy();
        assert(descriptorAgain.identityDimensions.length === 3, 'A12. mutating a returned descriptor never affects a subsequent call — each call returns an independent copy');

        // Direct cross-check: notificationId truly plays no role, proven
        // by constructing two events differing ONLY in notificationId.
        const alice = makeIdentity('Alice');
        const eventOne = new NotificationEvent({
            eventType: 'publication.commented',
            recipientIdentityId: alice.getSigningIdentity().id,
            payload: { commentaryId: 'descriptor-check-id', publicationId: 'pub-x', authorIdentityId: 'author-x' }
        });
        const eventTwo = new NotificationEvent({
            eventType: eventOne.eventType,
            recipientIdentityId: eventOne.recipientIdentityId,
            createdAt: eventOne.createdAt,
            payload: { ...eventOne.payload }
        });
        assert(eventOne.notificationId !== eventTwo.notificationId, 'A13. sanity: two independently constructed events never share a notificationId');
        assert(haveSameNotificationDeduplicationIdentity(eventOne, eventTwo) === true,
            'A14. cross-check: identity is unaffected by notificationId, confirming descriptor field A3 by direct behavior, not only declaration');

        findings.descriptor = descriptor;
    }

    // -------------------------------------------------------------
    // Section B — Stable identity: same Commentary/type/recipient
    // produces the same identity despite different notificationId,
    // createdAt, payload shape, and object identity.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-stable', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const fixedInput = { publicationId: 'pub-stable', commentaryId: 'stable-id', content: 'Stable identity probe', createdAt: new Date('2024-09-09T00:00:00.000Z') };
        producer.execute(fixedInput);
        const original = produced[0];

        // A hand-built event: same commentaryId/eventType/recipient, but
        // a different notificationId (auto-generated, unavoidable),
        // different createdAt, and an extra, non-conflicting payload
        // field — every axis this section names, varied simultaneously.
        const varied = new NotificationEvent({
            eventType: original.eventType,
            recipientIdentityId: original.recipientIdentityId,
            createdAt: new Date(original.createdAt.getTime() + 3_600_000),
            payload: { ...original.payload, extraField: 'not present on the original' }
        });

        assert(original.notificationId !== varied.notificationId, 'B1. sanity: distinct notificationId');
        assert(original.createdAt.getTime() !== varied.createdAt.getTime(), 'B2. sanity: distinct createdAt');
        assert(JSON.stringify(original.payload) !== JSON.stringify(varied.payload), 'B3. sanity: distinct payload shape (varied carries an extra field)');
        assert(original !== varied, 'B4. sanity: distinct object identity');

        assert(notificationDeduplicationIdentity(original) === notificationDeduplicationIdentity(varied),
            'B5. the computed identity string is identical despite every one of B1-B4\'s own differences');
        assert(haveSameNotificationDeduplicationIdentity(original, varied) === true,
            'B6. haveSameNotificationDeduplicationIdentity agrees with B5\'s own direct string comparison');

        findings.stableIdentityHolds = true;
    }

    // -------------------------------------------------------------
    // Section C — Event-type isolation: different eventType values
    // never share an identity.
    // -------------------------------------------------------------
    {
        const HYPOTHETICAL_EVENT_TYPE = 'publication.mentioned'; // does not exist in production; a probe only

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-eventtype', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-eventtype', commentaryId: 'eventtype-id', content: 'One fact, two hypothetical event kinds' });
        const commentedEvent = produced[0];

        const mentionedEvent = new NotificationEvent({
            eventType: HYPOTHETICAL_EVENT_TYPE,
            recipientIdentityId: commentedEvent.recipientIdentityId,
            createdAt: commentedEvent.createdAt,
            payload: { ...commentedEvent.payload }
        });

        assert(commentedEvent.eventType !== mentionedEvent.eventType, 'C1. sanity: two genuinely different eventType values');
        assert(haveSameNotificationDeduplicationIdentity(commentedEvent, mentionedEvent) === false,
            'C2. different eventType values for the SAME commentaryId/recipient never share an identity');
        assert(classifyNotificationCollision(commentedEvent, mentionedEvent) === NotificationCollisionOutcome.NO_MATCH,
            'C3. classification agrees: NO_MATCH, never MATCH or CONFLICT, since these are not even candidates for the same notification');

        findings.eventTypeIsolationHolds = true;
    }

    // -------------------------------------------------------------
    // Section D — Recipient isolation: different recipients never share
    // an identity.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const { discoveryProvider } = makePublication({ id: 'pub-recipient', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-recipient', commentaryId: 'recipient-id', content: 'One Commentary, two recipients' });
        const eventToPublisher = produced[0];

        const eventToThirdParty = new NotificationEvent({
            eventType: eventToPublisher.eventType,
            recipientIdentityId: carol.getSigningIdentity().id,
            createdAt: eventToPublisher.createdAt,
            payload: { ...eventToPublisher.payload }
        });

        assert(eventToPublisher.recipientIdentityId !== eventToThirdParty.recipientIdentityId, 'D1. sanity: two genuinely different recipients');
        assert(haveSameNotificationDeduplicationIdentity(eventToPublisher, eventToThirdParty) === false,
            'D2. different recipients of the SAME Commentary never share an identity');
        assert(classifyNotificationCollision(eventToPublisher, eventToThirdParty) === NotificationCollisionOutcome.NO_MATCH,
            'D3. classification agrees: NO_MATCH — Alice and Carol\'s hypothetical copies are always separate notifications');

        findings.recipientIsolationHolds = true;
    }

    // -------------------------------------------------------------
    // Section E — Commentary isolation: different commentaryIds never
    // share an identity, even for the same recipient and event type.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-commentary', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-commentary', commentaryId: 'commentary-one', content: 'First Commentary' });
        producer.execute({ publicationId: 'pub-commentary', commentaryId: 'commentary-two', content: 'Second, distinct Commentary' });
        assert(produced.length === 2, 'E1. sanity: two genuinely distinct Commentaries produced two events');

        const [eventOne, eventTwo] = produced;
        assert(eventOne.payload.commentaryId !== eventTwo.payload.commentaryId, 'E2. sanity: distinct commentaryId values');
        assert(eventOne.eventType === eventTwo.eventType && eventOne.recipientIdentityId === eventTwo.recipientIdentityId,
            'E3. sanity: same eventType and same recipient — commentaryId is the ONLY axis of difference');
        assert(haveSameNotificationDeduplicationIdentity(eventOne, eventTwo) === false,
            'E4. different Commentaries never share an identity, even with everything else held constant');
        assert(classifyNotificationCollision(eventOne, eventTwo) === NotificationCollisionOutcome.NO_MATCH,
            'E5. classification agrees: NO_MATCH');

        findings.commentaryIsolationHolds = true;
    }

    // -------------------------------------------------------------
    // Section F — Reconstruction: an original event and a live
    // reconstruction of it share an identity and classify as MATCH.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-reconstruct', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = producer.execute({ publicationId: 'pub-reconstruct', commentaryId: 'reconstruct-id', content: 'Reconstruct me if lost' });
        const original = produced[0];

        function reconstruct() {
            const rehydratedCommentary = commentaryStore.getById(commentary.commentaryId);
            const rehydratedPublication = discoveryProvider.findById(rehydratedCommentary.publicationId);
            return new NotificationEvent({
                eventType: PUBLICATION_COMMENTED_EVENT_TYPE,
                recipientIdentityId: rehydratedPublication.publisherIdentity.id,
                createdAt: rehydratedCommentary.createdAt,
                payload: {
                    publicationId: rehydratedCommentary.publicationId,
                    commentaryId: rehydratedCommentary.commentaryId,
                    authorIdentityId: rehydratedCommentary.authorIdentityId
                }
            });
        }

        const reconstructed = reconstruct();
        const reconstructedAgain = reconstruct();

        assert(original.notificationId !== reconstructed.notificationId, 'F1. sanity: reconstruction yields a fresh notificationId, never the original\'s own');
        assert(haveSameNotificationDeduplicationIdentity(original, reconstructed) === true,
            'F2. an original and its reconstruction share an identity');
        assert(haveSameNotificationDeduplicationIdentity(reconstructed, reconstructedAgain) === true,
            'F3. two independent reconstructions of the same fact share an identity with each other too');
        assert(classifyNotificationCollision(original, reconstructed) === NotificationCollisionOutcome.MATCH,
            'F4. classification is MATCH: reconstruction is stable, not merely same-identity but genuinely compatible');
        assert(classifyNotificationCollision(original, reconstructedAgain) === NotificationCollisionOutcome.MATCH,
            'F5. MATCH holds transitively across a second independent reconstruction as well');

        findings.reconstructionIsStable = true;
    }

    // -------------------------------------------------------------
    // Section G — Self-comment: author == recipient changes nothing
    // about identity or classification.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice'); // both publisher and, here, author
        const { discoveryProvider } = makePublication({ id: 'pub-self', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: alice, sink: (e) => produced.push(e) });
        const selfInput = { publicationId: 'pub-self', commentaryId: 'self-id', content: 'Commenting on my own Publication' };
        producer.execute(selfInput);
        producer.execute({ ...selfInput });
        assert(produced.length === 2, 'G1. a self-comment retry still produces two NotificationEvent instances');

        const [eventA, eventB] = produced;
        assert(eventA.payload.authorIdentityId === eventA.recipientIdentityId, 'G2. sanity: this really is the self-comment case — author and recipient coincide');
        assert(haveSameNotificationDeduplicationIdentity(eventA, eventB) === true, 'G3. a self-comment retry shares an identity exactly like any other retry');
        assert(classifyNotificationCollision(eventA, eventB) === NotificationCollisionOutcome.MATCH,
            'G4. classification is MATCH — no special case for author == recipient exists anywhere in this policy');

        // The absence of a special case, proven directly rather than by
        // restraint alone: a DIFFERENT recipient for the same self-authored
        // Commentary still separates cleanly, exactly like Section D's own
        // non-self scenario.
        const bob = makeIdentity('Bob');
        const eventToThirdParty = new NotificationEvent({
            eventType: eventA.eventType,
            recipientIdentityId: bob.getSigningIdentity().id,
            createdAt: eventA.createdAt,
            payload: { ...eventA.payload }
        });
        assert(haveSameNotificationDeduplicationIdentity(eventA, eventToThirdParty) === false,
            'G5. recipient separation still applies to a self-authored Commentary exactly as it does to any other — no self-comment carve-out');

        findings.selfCommentNoSpecialCase = true;
    }

    // -------------------------------------------------------------
    // Section H — Compatible collision: same identity, no disagreement
    // on any shared payload field → MATCH. Covers both the payload-
    // identical case and a benign superset.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-compatible', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const fixedInput = { publicationId: 'pub-compatible', commentaryId: 'compatible-id', content: 'Compatible collision probe' };
        producer.execute(fixedInput);
        producer.execute({ ...fixedInput });
        assert(produced.length === 2, 'H1. sanity: a genuine retry produced two instances');

        const [retryA, retryB] = produced;
        assert(JSON.stringify(retryA.payload) === JSON.stringify(retryB.payload), 'H2. sanity: payload-identical retry');
        assert(classifyNotificationCollision(retryA, retryB) === NotificationCollisionOutcome.MATCH,
            'H3. a payload-identical collision classifies as MATCH');

        // The benign-superset case: a hand-built event sharing the
        // identical identity but carrying one additional field the
        // original lacks — as if a future producer revision started
        // attaching an editorial excerpt.
        const richerEvent = new NotificationEvent({
            eventType: retryA.eventType,
            recipientIdentityId: retryA.recipientIdentityId,
            createdAt: retryA.createdAt,
            payload: { ...retryA.payload, contentExcerpt: fixedInput.content.slice(0, 10) }
        });
        assert(JSON.stringify(richerEvent.payload) !== JSON.stringify(retryA.payload), 'H4. sanity: the payloads genuinely differ (richerEvent carries an extra field)');
        assert(haveSameNotificationDeduplicationIdentity(retryA, richerEvent) === true, 'H5. sanity: the extra field plays no role in identity');
        assert(classifyNotificationCollision(retryA, richerEvent) === NotificationCollisionOutcome.MATCH,
            'H6. a benign-superset collision (no shared-field disagreement) also classifies as MATCH — this is the OPEN question 0.9.279 Section C left unresolved, now decided');

        findings.compatibleCollisionIsMatch = true;
    }

    // -------------------------------------------------------------
    // Section I — Contradictory collision: same identity, a shared
    // payload field disagrees → CONFLICT, never silently resolved.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const mallory = makeIdentity('Mallory');
        const { discoveryProvider } = makePublication({ id: 'pub-conflict', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-conflict', commentaryId: 'conflict-id', content: 'Bob really wrote this' });
        const genuineEvent = produced[0];

        // A hand-built event sharing the IDENTICAL identity but claiming
        // a DIFFERENT authorIdentityId — a field this policy never uses
        // to compute identity, but which cannot legitimately differ for
        // one real, immutable commentaryId.
        const corruptedEvent = new NotificationEvent({
            eventType: genuineEvent.eventType,
            recipientIdentityId: genuineEvent.recipientIdentityId,
            createdAt: genuineEvent.createdAt,
            payload: { ...genuineEvent.payload, authorIdentityId: mallory.getSigningIdentity().id }
        });

        assert(haveSameNotificationDeduplicationIdentity(genuineEvent, corruptedEvent) === true,
            'I1. the two events share an identity — the policy is blind to authorIdentityId for identity purposes');
        assert(genuineEvent.payload.authorIdentityId !== corruptedEvent.payload.authorIdentityId, 'I2. sanity: the two events genuinely disagree on authorIdentityId');
        assert(classifyNotificationCollision(genuineEvent, corruptedEvent) === NotificationCollisionOutcome.CONFLICT,
            'I3. classification is CONFLICT — a shared identity with a disagreeing shared field is never silently treated as MATCH');

        // The distinction from Section H's own benign superset, made
        // explicit: this disagreement is on a field BOTH payloads carry,
        // not a field only one carries.
        assert('authorIdentityId' in genuineEvent.payload && 'authorIdentityId' in corruptedEvent.payload,
            'I4. sanity: authorIdentityId is present in BOTH payloads — this is a genuine shared-field contradiction, not a benign superset like Section H\'s richerEvent');

        // CONFLICT is never resolved by this policy — no "winner" is
        // chosen, and the classification result carries no
        // representative event, only the fact that one is required.
        const result = classifyNotificationCollision(genuineEvent, corruptedEvent);
        assert(typeof result === 'string' && result === 'CONFLICT', 'I5. the CONFLICT result is a plain classification value, never a resolved/merged event');

        findings.contradictoryCollisionIsConflict = true;
    }

    // -------------------------------------------------------------
    // Section J — Producer invocation exclusion: two independent
    // `.execute()` calls for the identical underlying fact classify
    // exactly like one hand-constructed pair would — retiring 0.9.278's
    // own fifth candidate (producer invocation) from the identity model.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-invocation', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const fixedInput = { publicationId: 'pub-invocation', commentaryId: 'invocation-id', content: 'Two genuinely separate producer calls' };

        // TWO genuinely separate `.execute()` invocations — not a
        // hand-built pair — of the identical underlying fact.
        producer.execute(fixedInput);
        producer.execute({ ...fixedInput });
        assert(produced.length === 2, 'J1. sanity: two real, independent producer invocations occurred');

        const [fromInvocationOne, fromInvocationTwo] = produced;
        assert(classifyNotificationCollision(fromInvocationOne, fromInvocationTwo) === NotificationCollisionOutcome.MATCH,
            'J2. two independent invocations of the identical fact classify as MATCH — invocation count plays no role');

        // The structural proof this section exists for: nothing on
        // either event records which invocation produced it, so no
        // future caller could even ATTEMPT to special-case "these came
        // from two different calls" using this policy or the events
        // themselves.
        const invocationProvenanceFields = ['invocationId', 'callId', 'producedBy', 'invocationIndex'];
        for (const field of invocationProvenanceFields) {
            assert(typeof fromInvocationOne[field] === 'undefined', `J3. NotificationEvent exposes no "${field}" — invocation provenance does not exist to be excluded, it is structurally absent`);
        }
        assert(describeNotificationDeduplicationPolicy().producerInvocationParticipatesInIdentity === false,
            'J4. the descriptor itself records this exclusion explicitly — 0.9.278\'s own fifth candidate (producer invocation) is formally retired, not merely unused');

        findings.producerInvocationExcluded = true;
    }

    // -------------------------------------------------------------
    // Section K — Policy purity: no storage, provider, NotificationEvent
    // mutation, time, random ID generation, or I/O anywhere in
    // core/NotificationDeduplicationPolicy.js; deterministic output for
    // identical inputs; and no production file this milestone did not
    // intend to touch was modified.
    // -------------------------------------------------------------
    {
        const policySource = readFileSync(new URL('../core/NotificationDeduplicationPolicy.js', import.meta.url), 'utf8');

        assert(!/^\s*import\s/m.test(policySource), 'K1. core/NotificationDeduplicationPolicy.js has zero imports — no storage, provider, or any other dependency');
        const forbiddenTokens = ['Date.now(', 'new Date(', 'Math.random(', 'createId(', 'fetch(', 'require(', 'XMLHttpRequest', 'localStorage', 'setTimeout(', 'setInterval('];
        for (const token of forbiddenTokens) {
            assert(!policySource.includes(token), `K2. core/NotificationDeduplicationPolicy.js contains no "${token}" — no time, randomness, or I/O of any kind`);
        }

        // Determinism / referential transparency: the same inputs
        // always produce the same outputs, called repeatedly.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-purity', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-purity', commentaryId: 'purity-id', content: 'Determinism probe' });
        producer.execute({ publicationId: 'pub-purity', commentaryId: 'purity-id', content: 'Determinism probe' });
        const [eventA, eventB] = produced;

        const snapshotA = JSON.stringify(eventA.toJSON());
        const snapshotB = JSON.stringify(eventB.toJSON());
        const firstClassification = classifyNotificationCollision(eventA, eventB);
        const secondClassification = classifyNotificationCollision(eventA, eventB);
        const thirdClassification = classifyNotificationCollision(eventA, eventB);
        assert(firstClassification === secondClassification && secondClassification === thirdClassification,
            'K3. classifyNotificationCollision is deterministic — three calls with identical arguments return the identical result');
        assert(JSON.stringify(eventA.toJSON()) === snapshotA && JSON.stringify(eventB.toJSON()) === snapshotB,
            'K4. neither argument to classifyNotificationCollision was mutated by any of the three calls above');

        const identityFirstCall = notificationDeduplicationIdentity(eventA);
        const identitySecondCall = notificationDeduplicationIdentity(eventA);
        assert(identityFirstCall === identitySecondCall, 'K5. notificationDeduplicationIdentity is deterministic for the same event');

        // Architectural regression: no production file outside this
        // milestone's own new policy file was modified.
        const gitDiffStat = execSync(
            'git diff --stat HEAD -- application/PublicationCommentaryNotificationProducer.js application/AddPublicationCommentaryUseCase.js storage/PublicationCommentaryStore.js core/PublicationCommentary.js core/NotificationEvent.js application/ChatOutbox.js core/ChatOutboxEntry.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `K6. no pre-existing production file this milestone examines was modified. Found: ${gitDiffStat || '(none)'}.`);

        // Extends 0.9.278/0.9.279's own forbidden-method lists: this
        // milestone's new collision vocabulary still does not leak onto
        // NotificationEvent itself.
        const forbiddenMethodNames = [
            'dedupKey', 'identityKey', 'equals', 'isDuplicateOf', 'collapseKey', 'deduplicationId',
            'collidesWith', 'isCompatibleWith', 'isConflictingWith', 'supersedes', 'merge', 'reconcile',
            'classify', 'classifyCollision'
        ];
        for (const name of forbiddenMethodNames) {
            assert(typeof eventA[name] === 'undefined', `K7. NotificationEvent exposes no "${name}" — deduplication policy stays entirely external, in core/NotificationDeduplicationPolicy.js`);
        }

        findings.policyPurityHolds = true;
    }

    console.log('\n✅ All NotificationDeduplicationPolicy tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All NotificationDeduplicationPolicy tests passed');
}).catch((error) => {
    console.error('\n✗ NotificationDeduplicationPolicy tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
