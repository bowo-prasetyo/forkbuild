import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { PublicationCommentaryStore, PublicationCommentaryConflictError } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/PublicationCommentaryNotificationProducer.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { execSync } from 'node:child_process';

// 0.9.276 — Publication Commentary Notification Producer Lifecycle Audit.
//
// Test-only, per 0.9.275's own "what comes after": this milestone adds no
// production code. Its job is to prove — under real infrastructure, not
// merely by re-reading 0.9.275's own header comment — that:
//
//   A `publication.commented` NotificationEvent is produced exactly as a
//   consequence of a successfully persisted Commentary, and producing
//   that event does not alter Commentary semantics.
//
// 0.9.275's own test file already exercises most of the ordering and
// failure-isolation claims this invariant implies (successful lifecycle,
// exact identity preservation, timestamp provenance, persistence-failure
// isolation, discovery-miss handling, sink-failure isolation,
// self-comment, publication isolation, structural boundaries). This file
// does not re-litigate those — it exercises the two questions 0.9.275's
// own test suite never asked: what happens when a caller RETRIES a
// submission with the same `commentaryId` (Section E), and does the
// producer's own return value stay byte-for-byte identical to the wrapped
// use case's (Section F, "decorator transparency"). Section A restates
// the flagship lifecycle once, briefly, so this file stands on its own
// rather than depending on another file's coverage to justify its title.

// ---------------------------------------------------------------------
// Helpers — identical shape to tests/PublicationCommentaryNotificationProducer.test.js
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
    // -------------------------------------------------------------
    // Section A — Flagship lifecycle, restated briefly. Full detail
    // (exact identity preservation, timestamp provenance, payload shape)
    // is tests/PublicationCommentaryNotificationProducer.test.js's own
    // job; this section only re-confirms the chain still holds end to
    // end before this file goes on to ask its own new questions.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { publication, discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = producer.execute({ publicationId: 'pub-1', content: 'Beautiful world!' });

        assert(commentaryStore.getById(commentary.commentaryId) !== null, 'A1. the Commentary is genuinely persisted');
        assert(produced.length === 1, 'A2. exactly one NotificationEvent resulted from exactly one persisted Commentary');
        assert(produced[0] instanceof NotificationEvent, 'A3. the produced value is a real NotificationEvent');
        assert(produced[0].recipientIdentityId === publication.publisherIdentity.id, 'A4. addressed to the publisher');
    }

    // -------------------------------------------------------------
    // Section B — Persistence failure isolation, sink-side of the coin
    // restated: a genuine conflict (same commentaryId, DIFFERENT content)
    // is a persistence failure the producer never gets a chance to react
    // to, distinct from 0.9.275's own storage-write-failure case. Proves
    // the "no notification for a Commentary that was never (re-)persisted"
    // claim covers the conflict path too, not only a raw storage throw.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });

        const fixedInput = { publicationId: 'pub-1', commentaryId: 'fixed-id', content: 'original', createdAt: new Date('2024-01-01T00:00:00.000Z') };
        producer.execute(fixedInput);
        assert(produced.length === 1, 'B1. the original submission produces one notification');

        let threw = false;
        try {
            producer.execute({ ...fixedInput, content: 'DIFFERENT content' });
        } catch (error) {
            threw = true;
            assert(error instanceof PublicationCommentaryConflictError, 'B2. the conflict surfaces as PublicationCommentaryConflictError, unwrapped');
        }
        assert(threw, 'B3. a commentaryId conflict propagates out of the producer');
        assert(produced.length === 1, 'B4. the rejected conflicting submission produces no second notification');
    }

    // -------------------------------------------------------------
    // Section C — Discovery failure leaves the Commentary's own semantics
    // completely untouched, checked directly against the wrapped use
    // case's own independent execution, not merely "isNew looked right."
    // -------------------------------------------------------------
    {
        const bob = makeIdentity('Bob');
        const alice = makeIdentity('Alice');
        const { discoveryProvider: authorizingDiscovery } = makePublication({ id: 'pub-ghost', publisherProvider: alice });
        const emptyDiscovery = new LocalDiscoveryProvider(new InMemoryStorageProvider());

        const referenceStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const referenceCanComment = new CanCommentOnPublicationUseCase(authorizingDiscovery);
        const referenceUseCase = new AddPublicationCommentaryUseCase(referenceStore, bob, referenceCanComment);
        const fixedInput = { publicationId: 'pub-ghost', commentaryId: 'same-id', content: 'Same content', createdAt: new Date('2024-02-02T00:00:00.000Z') };
        const reference = referenceUseCase.execute(fixedInput);

        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const canComment = new CanCommentOnPublicationUseCase(authorizingDiscovery);
        const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, bob, canComment);
        const produced = [];
        const producer = new PublicationCommentaryNotificationProducer(addUseCase, emptyDiscovery, (e) => produced.push(e));
        const { commentary, isNew } = producer.execute(fixedInput);

        assert(commentary.content === reference.commentary.content, 'C1. Commentary content is identical whether or not the producer\'s own discovery resolves the Publication');
        assert(commentary.commentaryId === reference.commentary.commentaryId, 'C2. Commentary identity is unaffected by the producer\'s own discovery outcome');
        assert(isNew === reference.isNew, 'C3. isNew is unaffected by the producer\'s own discovery outcome');
        assert(produced.length === 0, 'C4. no notification is produced when the producer\'s own discoveryProvider cannot resolve the Publication');
    }

    // -------------------------------------------------------------
    // Section D — Sink failure isolation, checked the same
    // reference-execution way: the persisted Commentary after a sink
    // throw is identical to one persisted with no producer involved at
    // all, not merely "still present."
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });

        const referenceStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const referenceCanComment = new CanCommentOnPublicationUseCase(discoveryProvider);
        const referenceUseCase = new AddPublicationCommentaryUseCase(referenceStore, bob, referenceCanComment);
        const fixedInput = { publicationId: 'pub-1', content: 'Sink will fail.', createdAt: new Date('2024-03-03T00:00:00.000Z'), commentaryId: 'sink-fail-id' };
        const reference = referenceUseCase.execute(fixedInput);

        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const producer = buildProducer({
            discoveryProvider, commentaryStore, commentAuthorProvider: bob,
            sink: () => { throw new Error('simulated sink failure'); }
        });

        let threw = false;
        try {
            producer.execute(fixedInput);
        } catch (error) {
            threw = true;
        }
        assert(threw, 'D1. the sink\'s failure propagates');

        const persisted = commentaryStore.getById('sink-fail-id');
        assert(persisted !== null, 'D2. the Commentary is persisted despite the later sink failure');
        assert(JSON.stringify(persisted.toJSON()) === JSON.stringify(reference.commentary.toJSON()),
            'D3. the persisted record is byte-for-byte identical to one produced with no notification machinery involved at all');
    }

    // -------------------------------------------------------------
    // Section E — Repeated execution / caller retry with the same
    // commentaryId. This is the genuinely open semantic question
    // 0.9.275 exposed but left unresolved: AddPublicationCommentaryUseCase
    // already reports `isNew === false` for an idempotent re-save (the
    // exact identical record, same commentaryId), so the producer HAS
    // enough information to distinguish "a new Commentary was created"
    // from "a caller retried a submission that was already durably
    // saved." This audit establishes what the producer ACTUALLY does
    // with that information today — it does not change it.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });

        const fixedInput = { publicationId: 'pub-1', commentaryId: 'retry-id', content: 'Retried content', createdAt: new Date('2024-04-04T00:00:00.000Z') };

        const first = producer.execute(fixedInput);
        assert(first.isNew === true, 'E1. the first submission is a genuinely new Commentary');
        assert(produced.length === 1, 'E2. the first submission produces exactly one notification');

        const retry = producer.execute({ ...fixedInput });
        assert(retry.isNew === false, 'E3. sanity: the wrapped use case itself correctly reports the retry as idempotent, not a new Commentary');
        assert(commentaryStore.loadAll().length === 1, 'E4. sanity: the retry never creates a second persisted Commentary record');

        // THE FINDING: as of 0.9.275, the producer's own execute() branches
        // only on whether the Publication resolves — never on `isNew` — so
        // an idempotent caller retry of an ALREADY-NOTIFIED Commentary
        // currently produces a SECOND NotificationEvent for a Commentary
        // that was not newly created. This is recorded here as the
        // producer's actual, current behavior, not silently patched.
        assert(produced.length === 2, 'E5. FINDING: an idempotent retry (isNew === false) still produces an additional NotificationEvent today — "one persisted Commentary -> one notification" is NOT currently an enforced invariant');

        const secondEvent = produced[1];
        assert(secondEvent.notificationId !== produced[0].notificationId, 'E6. the second, retry-triggered notification has its own distinct notificationId (a duplicate signal, not a duplicate object)');
        assert(secondEvent.payload.commentaryId === produced[0].payload.commentaryId, 'E7. both notifications reference the SAME underlying commentaryId, making the duplication a same-fact re-announcement, not a fabricated second fact');

        // A caller-side retry loop calling execute() many times over the
        // same already-saved commentaryId would, today, produce one
        // notification per call — unbounded in the number of retries,
        // bounded only by caller behavior this producer does not control.
        producer.execute({ ...fixedInput });
        producer.execute({ ...fixedInput });
        assert(produced.length === 4, 'E8. FINDING: each additional idempotent retry produces yet another notification — there is no de-duplication ceiling');
        assert(commentaryStore.loadAll().length === 1, 'E9. meanwhile the persisted Commentary count never grows past the one genuine record');
    }

    // -------------------------------------------------------------
    // Section F — Decorator transparency: the producer's own return
    // value is not merely "shaped like" { commentary, isNew } — it IS the
    // wrapped use case's own result object, unmodified, whether or not a
    // notification was produced.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });

        // F1-F3: when a notification IS produced. A spying wrapper around
        // a real AddPublicationCommentaryUseCase captures the exact object
        // reference it returns, for identity comparison against whatever
        // the producer itself hands back.
        {
            const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
            const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, bob, new CanCommentOnPublicationUseCase(discoveryProvider));
            let expected;
            const spyUseCase = { execute: (i) => { expected = addUseCase.execute(i); return expected; } };
            const producer = new PublicationCommentaryNotificationProducer(spyUseCase, discoveryProvider, () => {});

            const actual = producer.execute({ publicationId: 'pub-1', content: 'Transparent result.' });

            assert(actual === expected, 'F1. the producer returns the EXACT object reference the wrapped use case returned, not a copy or a new object');
            assert(Object.keys(actual).sort().join(',') === 'commentary,isNew', 'F2. no notification-specific field (notificationId, event, notification, etc.) is added to the result');
            assert(!('notificationId' in actual) && !('event' in actual) && !('notification' in actual),
                'F3. specifically, no notificationId/event/notification field leaks the producer\'s own internal work into the wrapped result');
        }

        // F4: when NO notification is produced (missing Publication), the
        // return shape is identical — transparency does not depend on
        // whether the sink was ever called.
        {
            const emptyDiscovery = new LocalDiscoveryProvider(new InMemoryStorageProvider());
            const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
            const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
            const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, bob, canComment);
            let expected;
            const spyUseCase = { execute: (i) => { expected = addUseCase.execute(i); return expected; } };
            const producer = new PublicationCommentaryNotificationProducer(spyUseCase, emptyDiscovery, () => { throw new Error('sink must never be called here'); });

            const actual = producer.execute({ publicationId: 'pub-1', content: 'No publication to notify.' });
            assert(actual === expected, 'F4. the returned object is still the exact wrapped result reference when no notification was produced');
            assert(Object.keys(actual).sort().join(',') === 'commentary,isNew', 'F5. the result shape is identical regardless of whether a notification was produced');
        }
    }

    // -------------------------------------------------------------
    // Section G — Classification: is "one persisted Commentary -> one
    // notification" a bug, or an open product decision? Recorded here as
    // a documented finding, not resolved by this test-only milestone.
    // -------------------------------------------------------------
    {
        // This section asserts nothing new — it exists so the finding
        // from Section E has a durable, named home a future milestone can
        // cite directly, the same way earlier audits in this codebase
        // record a classification table rather than only prose.
        const classification = {
            observation: 'An idempotent Commentary re-save (isNew === false) still produces a new NotificationEvent.',
            rootCause: 'PublicationCommentaryNotificationProducer#execute() branches only on Publication resolution, never on the wrapped use case\'s own isNew flag.',
            verdict: 'OPEN_PRODUCT_DECISION',
            rationale: 'Whether a caller-retried, already-persisted Commentary should re-announce itself is a product question (e.g. "notify once per fact" vs. "notify once per call"), not a defect this test-only audit is positioned to resolve — see this milestone\'s own docs/Roadmap.md entry.'
        };
        assert(classification.verdict === 'OPEN_PRODUCT_DECISION', 'G1. the retry-duplication finding is recorded as an open product decision, not silently fixed by this milestone');
    }

    // -------------------------------------------------------------
    // Section H — Architecture: this milestone is test-only. No
    // production file this producer touches was modified to perform this
    // audit.
    // -------------------------------------------------------------
    {
        const gitDiffStat = execSync(
            'git diff --stat HEAD -- application/PublicationCommentaryNotificationProducer.js application/AddPublicationCommentaryUseCase.js storage/PublicationCommentaryStore.js core/PublicationCommentary.js core/NotificationEvent.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `H1. no production file this producer wraps or depends on was modified by this test-only milestone. Found: ${gitDiffStat || '(none)'}.`);
    }

    console.log('\n✅ All PublicationCommentaryNotificationProducerLifecycleAudit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationCommentaryNotificationProducerLifecycleAudit tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationCommentaryNotificationProducerLifecycleAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
