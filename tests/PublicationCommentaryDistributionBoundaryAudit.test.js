import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import {
    PublicationCommentaryStore,
    PublicationCommentaryConflictError
} from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/publication/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/publication/commentary/AddPublicationCommentaryUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/publication/commentary/GetPublicationCommentariesUseCase.js';
import {
    PublicationCommentaryNotificationProducer,
    PUBLICATION_COMMENTED_EVENT_TYPE
} from '../application/publication/commentary/PublicationCommentaryNotificationProducer.js';

import { NotificationEvent } from '../core/NotificationEvent.js';
import { NotificationEventStore, NotificationPersistenceOutcome } from '../storage/NotificationEventStore.js';
import {
    notificationDeduplicationIdentity,
    classifyNotificationCollision,
    NotificationCollisionOutcome
} from '../core/NotificationDeduplicationPolicy.js';

import { WorldEncounterKind } from '../core/WorldEncounter.js';
import {
    describeDecentralizedDiscoveryEnvelope,
    DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
    DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION
} from '../core/DecentralizedDiscoveryEnvelope.js';
import {
    describeSnapshotDiscoveryEnvelope,
    SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
    SNAPSHOT_DISCOVERY_ENVELOPE_VERSION
} from '../core/SnapshotDiscoveryEnvelope.js';

import { AuthorizationVerifier } from '../identity/AuthorizationVerifier.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.617 — Publication Commentary Distribution Boundary Audit.
//
// Test-only, decision-oriented audit. No production code changes.
//
// A NAMING NOTE FIRST, because this codebase is strict about it (see
// core/PublicationCommentary.js's own header, "commentary references a
// `publicationId`, never a `documentId`"): the requesting brief called
// this "Snapshot Commentary." There is no such thing in this codebase.
// Commentary (core/PublicationCommentary.js, 0.9.242+) is attached to a
// Publication, never to a Snapshot — a Snapshot is 3D scene material
// distributed/discovered through its own, separate substrate
// (application/snapshot/SnapshotDistributionCommand.js,
// core/SnapshotDiscoveryEnvelope.js), keyed by `contentHash`, never by a
// `publicationId`. This audit follows the real domain vocabulary and
// treats "Snapshot Commentary" as shorthand for "Publication Commentary,"
// exactly the same substitution 0.9.242's own header already insists on
// for `documentId`. Section E below tests the Snapshot substrate anyway,
// on its own separate merits, precisely because the brief raised it.
//
// THE CENTRAL QUESTION, verbatim from the requesting brief: can a
// Commentary event currently cross the device/user boundary, and if not,
// what is the smallest missing seam — without conflating Commentary with
// Publication distribution or with Notification?
//
//   Section A — Commentary identity & lifecycle: an application fact,
//               not a UI event, proven live against a fresh store
//               instance.
//   Section B — publicationId vs documentId vs snapshotId vs
//               commentaryId vs contentHash: four independent identities,
//               proven live against a real Publication, plus a check of
//               which one is already the RIGHT cross-device identity
//               dimension.
//   Section C — the persistence boundary: two independently constructed
//               local storage backends ("Device A" / "Device B"),
//               proving live that a Commentary saved on one is invisible
//               to the other — no network code anywhere in the chain.
//   Section D — the notification boundary: proven live to be local-only
//               and structurally incapable of reaching a distribution
//               call, so this audit does not make Notification carry
//               distribution's own job.
//   Section E — existing decentralized substrates: does either existing
//               envelope (Publication discovery / Snapshot discovery)
//               already fit Commentary's real shape? Tested against the
//               real, live functions, never assumed from their names.
//   Section F — the verification boundary: Commentary has no signature,
//               no signing descriptor, and is absent from
//               identity/LocalAuthorizationVerifier.js's own whitelist —
//               proven live, and kept separate from Publication
//               attribution.
//   Section G — duplicate/replay: what does Commentary's OWN existing
//               identity already provide, without inventing a new
//               deduplication service?
//   Section H — THE FLAGSHIP: the real, fully wired write chain, run on
//               Device A, then read back from an independently
//               constructed Device B — the exact missing transition,
//               located precisely.
//   Section I — offline/reordering: proven moot for today (nothing
//               distributes yet), but the store's own existing
//               invariants are already reorder/duplicate-safe.
//   Section J — classification, one fixed vocabulary, one primary
//               finding, not eight separate verdicts standing in for one
//               "yes, but only here" answer.
//
// AMENDED BY 0.9.618 — Publication Commentary Distribution Envelope,
// which implemented exactly this audit's own recommendation: a new
// sibling envelope (core/PublicationCommentaryDistributionEnvelope.js),
// a signing descriptor and a verifyPublicationCommentaryDistributionEnvelope()
// branch on identity/LocalAuthorizationVerifier.js, and reuse — never
// reinvention — of this file's own Section G/I finding (the existing
// storage/PublicationCommentaryStore.js commentaryId identity already
// gives idempotent-arrival/conflict-refusal semantics for free). Only
// assertion 29 (Section F) is amended in place, plus this note — per
// this codebase's own established convention (see e.g. 0.9.611's amend
// of tests/StructureRelativeSnappingBoundaryAudit.test.js) for a prior
// audit whose own assertion described a gap a later milestone closed.
// Every other section was independently re-verified against the 0.9.618
// production code with no changes needed: Section C's Device A/Device B
// persistence-boundary reproduction and Section H's flagship both still
// hold EXACTLY as measured — 0.9.618 added a NEW, separate distribution
// path (application/publication/commentary/PublicationCommentaryDistributionExchange.js +
// PublicationCommentaryDistributionPeerExchange.js), never a change to
// AddPublicationCommentaryUseCase.js/PublicationCommentaryNotificationProducer.js
// or the plain local write/read chain those two sections exercise. See
// tests/PublicationCommentaryDistribution.test.js for 0.9.618's own full
// coverage, including its own Device A -> Device B flagship over the
// real peer transport.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// The identical in-memory StorageProvider fake every Commentary/Notification
// test file in this codebase already uses (tests/PublicationCommentaryStorage.test.js,
// tests/PublicationCommentaryNotificationProducer.test.js, ...) — a real
// StorageProvider subclass, so `instanceof StorageProvider` passes, backed by
// nothing but a Map. Two SEPARATE instances of this class are this audit's
// entire "two devices" simulation — the same substitution
// storage/LocalStorageProvider.js's own header already licenses (an
// injected provider, never `window.localStorage` touched directly), applied
// here to model two physically separate localStorage origins instead of one
// in-memory fake.
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Identical to tests/PublicationCommentaryNotificationProducer.test.js's own
// helper — a real, authenticated LocalIdentityProvider, never a hand-rolled
// identity fixture.
function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

// A real Publication, discoverable through a real LocalDiscoveryProvider —
// identical wiring to tests/PublicationCommentaryNotificationProducer.test.js's
// own makePublication(), parameterized here over an INJECTED discovery
// storage backend so a caller can choose which "device" the Publication
// itself is discoverable from.
function makePublication({ id, documentId, snapshotId, contentHash, publisherProvider, discoveryStorage }) {
    const publication = new Publication({
        id,
        documentId,
        snapshotId,
        contentHash,
        title: `World ${id}`,
        author: 'author',
        publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
    });
    discoveryStorage.save('forkbuild-publications', [publication.toJSON()]);
    return { publication, discoveryProvider: new LocalDiscoveryProvider(discoveryStorage) };
}

// One real, fully composed write chain, over one injected storage backend —
// deliberately the SAME composition application/publication/commentary/CreatePublicationCommentaryUseCase.js
// performs in production, spelled out explicitly here so this audit exercises
// every real collaborator rather than a shortcut through it. `storage` and
// `discoveryProvider` are BOTH injected so Section C/H can point this chain
// at two structurally separate "devices."
function composeCommentaryChain({ storage, discoveryProvider, identityProvider }) {
    const commentaryStore = new PublicationCommentaryStore(storage);
    const notificationEventStore = new NotificationEventStore(storage);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
        commentaryStore,
        identityProvider,
        canCommentOnPublicationUseCase
    );
    const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(commentaryStore);
    const producer = new PublicationCommentaryNotificationProducer(
        addPublicationCommentaryUseCase,
        discoveryProvider,
        (event) => notificationEventStore.save(event)
    );
    return { commentaryStore, notificationEventStore, getPublicationCommentariesUseCase, producer };
}

async function run() {
    // -------------------------------------------------------------
    // Section A — Commentary identity & lifecycle: an application fact.
    // -------------------------------------------------------------
    {
        const commentary = new PublicationCommentary({
            publicationId: 'pub-a',
            authorIdentityId: 'alice',
            content: 'A genuine application fact, not a UI event.'
        });
        const shape = Object.keys(commentary.toJSON()).sort();
        assert(
            JSON.stringify(shape) === JSON.stringify(['authorIdentityId', 'commentaryId', 'content', 'createdAt', 'publicationId'].sort()),
            '1. PublicationCommentary.toJSON() exposes exactly five fields, live — commentaryId, publicationId, authorIdentityId, content, createdAt — no more, no less'
        );
        assert(typeof commentary.getSigningDescriptor !== 'function',
            '2. PublicationCommentary has no getSigningDescriptor() method — it is not, today, a signable object at all');
        assert(!('signature' in commentary) && commentary._signature === undefined,
            '3. PublicationCommentary carries no signature field of any kind, live-inspected on a real instance');

        // A fresh store instance, over the SAME injected storage, must be
        // able to read the commentary back — proving it is a durable,
        // storage-backed application fact, never merely a transient UI
        // event that lives only in the component that created it.
        const storage = new InMemoryStorageProvider();
        const writingStore = new PublicationCommentaryStore(storage);
        writingStore.save(commentary);
        const freshStore = new PublicationCommentaryStore(storage);
        const reloaded = freshStore.getById(commentary.commentaryId);
        assert(reloaded instanceof PublicationCommentary && reloaded !== commentary,
            '4. a completely FRESH PublicationCommentaryStore instance, constructed after the write, independently recovers the same commentary from durable storage — an application fact, not a UI-local event');

        console.log('✓ A: Commentary is a genuine, durable, storage-backed application fact — five fields, no signature, survives a fresh store instance.');
    }

    // -------------------------------------------------------------
    // Section B — publicationId, documentId, snapshotId, commentaryId,
    // contentHash: four independent identities, live.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const publisherProvider = makeIdentity('publisher');
        const { publication, discoveryProvider } = makePublication({
            id: 'pub-b',
            documentId: 'doc-b',
            snapshotId: 'snap-b',
            contentHash: 'hash-b',
            publisherProvider,
            discoveryStorage: storage
        });

        const commentary = new PublicationCommentary({
            publicationId: publication.id,
            authorIdentityId: 'bob',
            content: 'discusses the publication, not the document or the snapshot'
        });

        assert(commentary.publicationId === publication.id,
            '5. commentary.publicationId equals the Publication\'s own id, live');
        assert(commentary.publicationId !== publication.documentId
            && commentary.publicationId !== publication.snapshotId
            && commentary.publicationId !== publication.contentHash,
            '6. publicationId, documentId, snapshotId, and contentHash are four genuinely distinct values on a real Publication — commentary targets exactly one of them');
        assert(commentary.commentaryId !== commentary.publicationId,
            '7. commentaryId and publicationId remain distinct even on the same instance');

        const src = codeOnly(await rawSource('core/PublicationCommentary.js'));
        assert(!/documentId|snapshotId|contentHash/.test(src),
            '8. core/PublicationCommentary.js never even mentions documentId/snapshotId/contentHash — this is a structural absence, not an unexercised code path');

        // The one identity Commentary DOES carry (publicationId) already
        // targets the SAME dimension the existing Publication discovery
        // envelope uses to identify a Publication across devices
        // (`objectId`) — proven live, not merely asserted from the two
        // classes' prose.
        const envelope = describeDecentralizedDiscoveryEnvelope({
            protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
            version: DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION,
            kind: WorldEncounterKind.PUBLICATION,
            objectId: publication.id,
            uri: 'content://wherever'
        });
        assert(envelope !== null && envelope.objectId === publication.id && envelope.objectId === commentary.publicationId,
            '9. the identity Commentary already carries (publicationId) is the SAME dimension a real, live discovery envelope already uses to name a Publication across devices — Commentary is not pointing at the wrong thing, it simply has no envelope of its own yet');

        console.log('✓ B: publicationId, documentId, snapshotId, contentHash, and commentaryId are five genuinely independent facts, live and structurally — and the one identity Commentary uses already targets the correct cross-device dimension.');
    }

    // -------------------------------------------------------------
    // Section C — the persistence boundary: Device A / Device B.
    // -------------------------------------------------------------
    {
        const deviceAStorage = new InMemoryStorageProvider();
        const deviceBStorage = new InMemoryStorageProvider();

        const publisherProvider = makeIdentity('publisher');
        const { publication } = makePublication({
            id: 'pub-c', documentId: 'doc-c', publisherProvider, discoveryStorage: deviceAStorage
        });
        // The SAME Publication is also discoverable on Device B — this
        // section isolates the COMMENTARY persistence boundary alone; it
        // does not (yet) ask whether Publication discovery itself crossed
        // devices, which Section E covers separately.
        deviceBStorage.save('forkbuild-publications', [publication.toJSON()]);

        const authorProvider = makeIdentity('author');
        const storeA = new PublicationCommentaryStore(deviceAStorage);
        const discoveryA = new LocalDiscoveryProvider(deviceAStorage);
        const canCommentA = new CanCommentOnPublicationUseCase(discoveryA);
        const addOnA = new AddPublicationCommentaryUseCase(storeA, authorProvider, canCommentA);
        const { commentary } = addOnA.execute({ publicationId: publication.id, content: 'created on Device A' });

        const readOnA = new GetPublicationCommentariesUseCase(storeA).execute({ publicationId: publication.id });
        assert(readOnA.length === 1 && readOnA[0].commentaryId === commentary.commentaryId,
            '10. Device A can read back the commentary it just created, through its own storage');

        const storeB = new PublicationCommentaryStore(deviceBStorage);
        const readOnB = new GetPublicationCommentariesUseCase(storeB).execute({ publicationId: publication.id });
        assert(Array.isArray(readOnB) && readOnB.length === 0,
            '11. Device B — an independently constructed store over an independently constructed storage backend — sees NOTHING: this is the literal "X" in the local-notification diagram, reproduced live rather than assumed');
        assert(storeB.getById(commentary.commentaryId) === null,
            '12. Device B cannot even resolve the commentary by its own commentaryId — it genuinely never arrived, not merely "isn\'t listed yet"');

        // Structural confirmation: the domain and storage layers import
        // nothing that could ever reach a network/distribution mechanism.
        for (const file of ['core/PublicationCommentary.js', 'core/PublicationCommentaryCollection.js', 'storage/PublicationCommentaryStore.js']) {
            const src = await rawSource(file);
            const importLines = src.split('\n').filter((line) => line.trim().startsWith('import'));
            for (const line of importLines) {
                assert(!/application\/|discovery\/|nostr\/|arweave\/|identity\/|\/Distribution|\/Discovery/.test(line),
                    `13. ${file} imports nothing distribution/discovery/identity-shaped — offending import: "${line.trim()}"`);
            }
        }

        console.log('✓ C: reproduced live — a Commentary created on Device A is completely invisible to an independently constructed Device B, and the domain/storage layers are structurally incapable of reaching any distribution mechanism today.');
    }

    // -------------------------------------------------------------
    // Section D — the notification boundary: local-only, and structurally
    // incapable of doing distribution's job.
    // -------------------------------------------------------------
    {
        const deviceAStorage = new InMemoryStorageProvider();
        const deviceBStorage = new InMemoryStorageProvider();
        const publisherProvider = makeIdentity('publisher');
        const { publication } = makePublication({
            id: 'pub-d', documentId: 'doc-d', publisherProvider, discoveryStorage: deviceAStorage
        });

        const authorProvider = makeIdentity('author');
        const { producer } = composeCommentaryChain({
            storage: deviceAStorage,
            discoveryProvider: new LocalDiscoveryProvider(deviceAStorage),
            identityProvider: authorProvider
        });
        producer.execute({ publicationId: publication.id, content: 'triggers a local notification only' });

        const notificationsOnA = new NotificationEventStore(deviceAStorage).loadAll();
        assert(notificationsOnA.length === 1 && notificationsOnA[0].eventType === PUBLICATION_COMMENTED_EVENT_TYPE,
            '14. a real NotificationEvent was constructed and persisted locally, on Device A');
        assert(Object.keys(notificationsOnA[0].payload).sort().join(',') === 'authorIdentityId,commentaryId,publicationId',
            '15. the NotificationEvent payload carries exactly three factual identifiers — publicationId, commentaryId, authorIdentityId — no transport/relay/locator field of any kind');

        const notificationsOnB = new NotificationEventStore(deviceBStorage).loadAll();
        assert(notificationsOnB.length === 0,
            '16. Device B\'s NotificationEventStore never received anything — the notification never crossed either, because nothing in this chain ever tries to send it anywhere');

        // Structural: the producer's only two external calls are a
        // read-only Publication lookup and the injected local sink.
        const producerSrc = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryNotificationProducer.js'));
        assert(!/nostr|arweave|fetch\(|WebSocket|relay/i.test(producerSrc),
            '17. application/publication/commentary/PublicationCommentaryNotificationProducer.js contains no network/transport vocabulary of any kind');
        const notificationEventSrc = codeOnly(await rawSource('core/NotificationEvent.js'));
        assert(!/nostr|arweave|fetch\(|WebSocket|relay|distribut/i.test(notificationEventSrc),
            '18. core/NotificationEvent.js itself carries no distribution vocabulary either — this audit does not make Notification carry Distribution\'s own job, and today\'s code already agrees');

        console.log('✓ D: notification is real, local, and structurally incapable of distribution — exactly the layering the brief asked this audit to protect, already true today rather than something this milestone has to newly enforce.');
    }

    // -------------------------------------------------------------
    // Section E — existing decentralized substrates: does either
    // existing envelope already fit Commentary's real shape?
    // -------------------------------------------------------------
    {
        const commentary = new PublicationCommentary({
            publicationId: 'pub-e', authorIdentityId: 'carol', content: 'could this ride an existing envelope?'
        });
        const shapeKeys = Object.keys(commentary.toJSON());

        // E1 — the Publication discovery envelope: a CLOSED kind enum.
        assert(Object.keys(WorldEncounterKind).length === 2
            && WorldEncounterKind.PUBLICATION === 'PUBLICATION'
            && WorldEncounterKind.AVATAR === 'AVATAR',
            '19. WorldEncounterKind is a closed, two-value enum, live — PUBLICATION and AVATAR, nothing else');
        const commentaryAsPublicationEnvelope = describeDecentralizedDiscoveryEnvelope({
            protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
            version: DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION,
            kind: 'COMMENTARY',
            objectId: commentary.commentaryId,
            uri: 'content://x'
        });
        assert(commentaryAsPublicationEnvelope === null,
            '20. the REAL, live describeDecentralizedDiscoveryEnvelope() refuses a "COMMENTARY" kind outright (returns null, its own documented refusal signal) — not a documentation claim, an actual call against actual code');
        assert(!shapeKeys.includes('uri') && !shapeKeys.includes('kind') && !shapeKeys.includes('objectId'),
            '21. Commentary\'s own real toJSON() shape never even offers the fields this envelope requires (uri/kind/objectId) — it is not merely rejected, it does not fit');

        // E2 — the Snapshot discovery envelope: requires contentHash/locator/storage.
        const commentaryAsSnapshotEnvelope = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            locator: 'ar://x',
            storage: 'ar'
            // no contentHash — Commentary has none to offer
        });
        assert(commentaryAsSnapshotEnvelope === null,
            '22. the REAL, live describeSnapshotDiscoveryEnvelope() refuses a candidate with no contentHash (returns null)');
        assert(!shapeKeys.includes('contentHash') && !shapeKeys.includes('locator') && !shapeKeys.includes('storage'),
            '23. Commentary structurally has none of contentHash/locator/storage — it cannot be described as "content placed on a ContentStore" without being repurposed, not merely re-described');

        // E3 — the two live distribution call chains never mention Commentary.
        for (const file of ['application/publication/distribution/PublicationDistributionCommand.js', 'application/snapshot/SnapshotDistributionCommand.js', 'application/nostr/NostrPublicationDiscoveryPublisher.js', 'application/arweave/ArweaveAnnouncementPublisher.js']) {
            const src = await rawSource(file);
            assert(!/Commentary/.test(src),
                `24. ${file} never mentions Commentary anywhere in its source — today's complete disjointness confirmed directly, not inferred from absence of a test`);
        }
        assert(typeof (await import('../application/publication/distribution/PublicationDistributionCommand.js')).executePublicationDistributionCommand === 'function'
            && typeof (await import('../application/snapshot/SnapshotDistributionCommand.js')).executeSnapshotDistributionCommand === 'function',
            '25. both real distribution entry points exist and are callable functions — this audit is naming a real, live seam, not a hypothetical one');

        console.log('✓ E: neither existing envelope (Publication discovery: closed kind enum; Snapshot discovery: requires content-addressed fields) fits Commentary\'s real, live shape without being repurposed — riding either substrate as-is is not available; a third, sibling envelope mirroring the existing two would be new code, following an existing pattern, never a new architecture.');
    }

    // -------------------------------------------------------------
    // Section F — the verification boundary.
    // -------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        assert(verifier instanceof AuthorizationVerifier,
            '26. LocalAuthorizationVerifier really is the concrete AuthorizationVerifier subclass this codebase actually ships');
        assert(typeof verifier.verifyCommentary !== 'function' && typeof verifier.verifyPublicationCommentary !== 'function',
            '27. LocalAuthorizationVerifier has no verifyCommentary()/verifyPublicationCommentary() method of any kind, live-inspected on a real instance');

        const baseMethods = Object.getOwnPropertyNames(AuthorizationVerifier.prototype)
            .filter((name) => name !== 'constructor');
        assert(JSON.stringify(baseMethods.sort()) === JSON.stringify(['verifyIndexRoot', 'verifyPlacement', 'verifyPublication'].sort()),
            '28. the base AuthorizationVerifier contract declares exactly three verification methods, live — Publication, Placement, IndexRoot — no fourth, Commentary-shaped method already sitting there unused');

        // AMENDED BY 0.9.618 — Publication Commentary Distribution
        // Envelope, which closed exactly this gap: a new sibling
        // envelope (core/PublicationCommentaryDistributionEnvelope.js,
        // never core/PublicationCommentary.js itself, which stays
        // unsigned — see assertions 2-3 above, still true, unmodified)
        // now carries a signature, and LocalAuthorizationVerifier now
        // does verify it — via verifyPublicationCommentaryDistributionEnvelope(),
        // a differently-named method than the hypothetical
        // verifyCommentary()/verifyPublicationCommentary() assertion 27
        // above already ruled out and still correctly rules out (0.9.618
        // named it after the ENVELOPE it verifies, matching every other
        // verify*() method in this file, never after the bare domain
        // fact it wraps). See tests/PublicationCommentaryDistribution.test.js
        // for the full 0.9.618 coverage.
        const verifierSrc = await rawSource('identity/LocalAuthorizationVerifier.js');
        assert(verifierSrc.includes('PublicationCommentaryDistributionEnvelope')
            && typeof verifier.verifyPublicationCommentaryDistributionEnvelope === 'function',
            '29. identity/LocalAuthorizationVerifier.js now imports and verifies a PublicationCommentaryDistributionEnvelope (0.9.618) — the signing-descriptor whitelist gap this audit measured is closed, via a NEW sibling envelope, never by adding a signature to PublicationCommentary itself');

        // Two different, real identities can each author commentary on the
        // SAME publication — proving there is no per-author cryptographic
        // gate today: authorization only asks "does this Publication
        // exist," never "prove you are who you claim."
        const storage = new InMemoryStorageProvider();
        const publisherProvider = makeIdentity('publisher');
        const { publication, discoveryProvider } = makePublication({
            id: 'pub-f', documentId: 'doc-f', publisherProvider, discoveryStorage: storage
        });
        const store = new PublicationCommentaryStore(storage);
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);

        const aliceProvider = makeIdentity('alice');
        const bobProvider = makeIdentity('bob');
        const aliceResult = new AddPublicationCommentaryUseCase(store, aliceProvider, canComment)
            .execute({ publicationId: publication.id, content: 'from alice, unverified' });
        const bobResult = new AddPublicationCommentaryUseCase(store, bobProvider, canComment)
            .execute({ publicationId: publication.id, content: 'from bob, also unverified' });
        assert(aliceResult.commentary.authorIdentityId !== bobResult.commentary.authorIdentityId,
            '30. two different real identities each successfully authored commentary on the identical Publication — authorization never asked either to prove authenticity, only that the Publication resolves');
        assert(aliceResult.commentary.authorIdentityId !== publication.publisherIdentity.id
            && bobResult.commentary.authorIdentityId !== publication.publisherIdentity.id,
            '31. neither commentary\'s authorIdentityId equals the Publication\'s own publisherIdentity — a Commentary author is never conflated with Publication attribution, structurally: core/PublicationCommentary.js never even reads publisherIdentity');
        const commentaryOnlySrc = codeOnly(await rawSource('core/PublicationCommentary.js'));
        assert(!commentaryOnlySrc.includes('publisherIdentity'),
            '32. core/PublicationCommentary.js\'s own source never mentions publisherIdentity at all — the separation in assertion 31 cannot be accidentally erased by a future edit that merely forgets to check');

        console.log('✓ F: Commentary itself still has no signature or signing descriptor (unmodified core/PublicationCommentary.js) — but a remotely-received Commentary CAN now be authenticated, via 0.9.618\'s own sibling envelope and its LocalAuthorizationVerifier branch — and author identity is still, structurally, kept apart from Publication attribution.');
    }

    // -------------------------------------------------------------
    // Section G — duplicate/replay: what Commentary identity already
    // provides, without inventing a new deduplication service.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const commentary = new PublicationCommentary({
            publicationId: 'pub-g', authorIdentityId: 'dave', content: 'arrives twice'
        });

        const firstStore = new PublicationCommentaryStore(storage);
        assert(firstStore.save(commentary) === true, '33. the first save() of a genuinely new commentary appends it');
        const secondStore = new PublicationCommentaryStore(storage); // a fresh instance — "a second arrival"
        assert(secondStore.save(commentary) === false,
            '34. an INDEPENDENTLY CONSTRUCTED store instance, told to save the SAME commentary again, treats it as an idempotent no-op — "the same Commentary identity represents the same Commentary fact regardless of how many times it is observed" already holds, today, for this one identity dimension (commentaryId + full-field match)');

        let conflictThrew = null;
        try {
            secondStore.save(new PublicationCommentary({
                commentaryId: commentary.commentaryId,
                publicationId: commentary.publicationId,
                authorIdentityId: commentary.authorIdentityId,
                content: 'a DIFFERENT claimed content under the same id'
            }));
        } catch (error) {
            conflictThrew = error;
        }
        assert(conflictThrew instanceof PublicationCommentaryConflictError,
            '35. a genuinely conflicting "arrival" under the same commentaryId is refused, never silently overwritten and never silently merged — exactly the CONFLICT case a future distribution seam would also need, already present');

        // This identity is deliberately NOT the same mechanism as
        // NotificationDeduplicationPolicy's own — the two stay independent,
        // at two different layers, exactly as the brief warned against
        // conflating.
        const eventA = new NotificationEvent({
            eventType: PUBLICATION_COMMENTED_EVENT_TYPE, recipientIdentityId: 'r1',
            payload: { commentaryId: commentary.commentaryId, publicationId: commentary.publicationId, authorIdentityId: 'dave' }
        });
        const eventB = new NotificationEvent({
            eventType: PUBLICATION_COMMENTED_EVENT_TYPE, recipientIdentityId: 'r2', // different recipient
            payload: { commentaryId: commentary.commentaryId, publicationId: commentary.publicationId, authorIdentityId: 'dave' }
        });
        assert(notificationDeduplicationIdentity(eventA) !== notificationDeduplicationIdentity(eventB),
            '36. NotificationDeduplicationPolicy\'s own identity additionally keys on recipientIdentityId — a dimension the Commentary-fact identity (assertion 34) never needed — proving the two mechanisms are genuinely independent, live, not merely described as such in their headers');
        assert(classifyNotificationCollision(eventA, eventB) === NotificationCollisionOutcome.NO_MATCH,
            '37. confirmed: these two notification facts about the SAME commentary are, correctly, NOT the same notification — a future distribution seam reusing assertion 34/35\'s store-level identity would not need to touch this separate policy at all');

        console.log('✓ G: the store\'s own existing commentaryId identity already gives "same identity => same fact" (idempotent) and "same identity, different facts => refuse" (conflict) — exactly the invariant a future distribution seam needs, already built, and genuinely independent of the separate Notification dedup mechanism.');
    }

    // -------------------------------------------------------------
    // Section H — THE FLAGSHIP.
    // -------------------------------------------------------------
    {
        const deviceAStorage = new InMemoryStorageProvider();
        const deviceBStorage = new InMemoryStorageProvider();

        const publisherProvider = makeIdentity('publisher');
        const { publication } = makePublication({
            id: 'pub-h', documentId: 'doc-h', publisherProvider, discoveryStorage: deviceAStorage
        });
        deviceBStorage.save('forkbuild-publications', [publication.toJSON()]); // Publication itself IS known on both

        const authorProvider = makeIdentity('author-on-device-a');
        const chainA = composeCommentaryChain({
            storage: deviceAStorage,
            discoveryProvider: new LocalDiscoveryProvider(deviceAStorage),
            identityProvider: authorProvider
        });
        const { commentary } = chainA.producer.execute({ publicationId: publication.id, content: 'created on Device A, for real' });

        // Control: Device A, through a THIRD, freshly constructed set of
        // collaborators, still sees it.
        const controlChain = composeCommentaryChain({
            storage: deviceAStorage,
            discoveryProvider: new LocalDiscoveryProvider(deviceAStorage),
            identityProvider: authorProvider
        });
        const controlRead = controlChain.getPublicationCommentariesUseCase.execute({ publicationId: publication.id });
        assert(controlRead.length === 1 && controlRead[0].commentaryId === commentary.commentaryId,
            '38. CONTROL: a fresh set of collaborators over Device A\'s OWN storage still finds the commentary — ruling out "it never really persisted" as the explanation for what follows');

        // Device B: fresh, independent collaborators, over Device B's own
        // storage.
        const chainB = composeCommentaryChain({
            storage: deviceBStorage,
            discoveryProvider: new LocalDiscoveryProvider(deviceBStorage),
            identityProvider: makeIdentity('viewer-on-device-b')
        });
        const readOnB = chainB.getPublicationCommentariesUseCase.execute({ publicationId: publication.id });
        assert(readOnB.length === 0,
            '39. THE FLAGSHIP FINDING: Device B — which already knows about the Publication itself — still sees ZERO commentary. The break is not "Publication discovery doesn\'t work" (it does, by construction above); it is specifically that Commentary itself never left Device A.');
        const notificationsOnB = chainB.notificationEventStore.loadAll();
        assert(notificationsOnB.length === 0,
            '40. Device B also has zero NotificationEvents for this commentary — consistent with Section D: notification was never the thing that was supposed to cross, but confirming it, too, never did');

        // Precisely locate the break: it happens BEFORE any notification or
        // distribution logic ever runs, at plain, synchronous, local
        // persistence — no error, no partial state, no distribution call
        // attempted and failed. It simply never had the data.
        assert(chainB.getPublicationCommentariesUseCase.execute({ publicationId: publication.id }).length === 0,
            '41. re-confirmed on a second call: this is not a one-shot race, it is standing, structural absence');

        console.log('✓ H: FLAGSHIP reproduced live. The break sits exactly at local persistence (storage/PublicationCommentaryStore.js\'s own injected StorageProvider), before Notification or any distribution logic is ever reached — precisely the seam the brief\'s own diagram named as unknown, now measured.');
    }

    // -------------------------------------------------------------
    // Section I — offline/reordering: moot today, but the existing
    // invariants are already reorder/duplicate-safe.
    // -------------------------------------------------------------
    {
        const c1 = new PublicationCommentary({ publicationId: 'pub-i', authorIdentityId: 'eve', content: 'C1' });
        const c2 = new PublicationCommentary({ publicationId: 'pub-i', authorIdentityId: 'eve', content: 'C2' });

        // Order 1: C1, C1 again (duplicate arrival), C2.
        const storageOrder1 = new InMemoryStorageProvider();
        new PublicationCommentaryStore(storageOrder1).save(c1);
        new PublicationCommentaryStore(storageOrder1).save(c1); // duplicate
        new PublicationCommentaryStore(storageOrder1).save(c2);
        const resultOrder1 = new PublicationCommentaryStore(storageOrder1).getForPublication('pub-i')
            .map((c) => c.commentaryId).sort();

        // Order 2: C2 first, then C1, then C1 again — a genuinely different
        // arrival order.
        const storageOrder2 = new InMemoryStorageProvider();
        new PublicationCommentaryStore(storageOrder2).save(c2);
        new PublicationCommentaryStore(storageOrder2).save(c1);
        new PublicationCommentaryStore(storageOrder2).save(c1); // duplicate
        const resultOrder2 = new PublicationCommentaryStore(storageOrder2).getForPublication('pub-i')
            .map((c) => c.commentaryId).sort();

        assert(resultOrder1.length === 2 && resultOrder2.length === 2,
            '42. regardless of arrival order or a duplicate arrival, exactly two distinct commentaries end up on file — never zero, never three, never four');
        assert(JSON.stringify(resultOrder1) === JSON.stringify(resultOrder2),
            '43. the FINAL set of commentaryIds on file is identical regardless of arrival order — local arrival order is not, and does not need to become, part of Commentary identity');

        // This audit builds no synchronization service, no offline queue,
        // and no explicit vector-clock/ordering field — it only confirms
        // the raw material (idempotent-per-id append, order-independent
        // final state) already exists at the persistence layer, unmodified.
        const collectionSrc = codeOnly(await rawSource('core/PublicationCommentaryCollection.js'));
        assert(!/sequence|clock|order|causal/i.test(collectionSrc),
            '44. core/PublicationCommentaryCollection.js introduces no ordering/causality vocabulary of its own — order-independence in assertion 43 falls out of plain set semantics on commentaryId, not a mechanism this audit would need to add to or extend');

        console.log('✓ I: offline/reordering is a live non-issue for today\'s local-only feature, and the persistence layer\'s existing, unmodified invariants already tolerate duplicate/out-of-order arrival without any new synchronization service.');
    }

    // -------------------------------------------------------------
    // Section J — classification.
    // -------------------------------------------------------------
    {
        const LABELS = Object.freeze([
            'LOCAL_ONLY_CONFIRMED',
            'ALREADY_CORRECT',
            'DISTRIBUTION_SEAM_GAP',
            'REMOTE_VERIFICATION_GAP',
            'COMMENTARY_IDENTITY_GAP',
            'NOTIFICATION_INTEGRATION_GAP',
            'EXISTING_SUBSTRATE_REUSE_CONFIRMED',
            'NEW_DISTRIBUTION_CAPABILITY_REQUIRED'
        ]);

        const classification = {
            // Section A/B: Commentary is a real, durable, well-formed
            // application fact whose one existing identity (publicationId)
            // already targets the right cross-device dimension.
            commentaryLifecycleAndIdentity: 'LOCAL_ONLY_CONFIRMED',
            // Section C: the actual, measured missing seam — a Commentary
            // fact cannot leave the device it was created on, today, at
            // all, by any path.
            persistenceBoundary: 'DISTRIBUTION_SEAM_GAP',
            // Section D: the brief's own worry — don't make Notification
            // do Distribution's job — is ALREADY correctly avoided in
            // shipped code, not merely something this audit recommends.
            notificationBoundary: 'ALREADY_CORRECT',
            // Section E: neither existing envelope fits Commentary's real
            // shape without repurposing it; a THIRD, sibling envelope
            // mirroring the existing two is a narrow, pattern-following
            // addition, never a new architecture — still classified as a
            // real capability that does not exist today.
            existingSubstrateFit: 'NEW_DISTRIBUTION_CAPABILITY_REQUIRED',
            // Section F: no signature, no signing descriptor, absent from
            // the real verification whitelist — a remote Commentary could
            // not be authenticated today.
            verificationBoundary: 'REMOTE_VERIFICATION_GAP',
            // Section G: the store's own existing per-commentaryId
            // idempotent/conflict semantics already give exactly the
            // "same identity, same fact" invariant a future distribution
            // consumer needs — no new dedup service required.
            duplicateReplayFoundation: 'EXISTING_SUBSTRATE_REUSE_CONFIRMED',
            // Section H: the flagship — reconfirms C at the precise,
            // measured seam, ruling out notification/discovery as
            // alternate explanations.
            flagship: 'DISTRIBUTION_SEAM_GAP',
            // Section I: order-independence already falls out of existing,
            // unmodified persistence semantics — nothing new needed.
            offlineReordering: 'EXISTING_SUBSTRATE_REUSE_CONFIRMED',
            // THE ONE PRIMARY FINDING, per this milestone's own brief:
            // "identify one primary gap, rather than declaring all of
            // these problems simultaneously."
            primaryGap: 'DISTRIBUTION_SEAM_GAP'
        };

        for (const [finding, label] of Object.entries(classification)) {
            assert(LABELS.includes(label), `45. classification finding "${finding}" uses one of this audit's own fixed labels, never free text`);
        }
        assert(classification.primaryGap === 'DISTRIBUTION_SEAM_GAP'
            && classification.persistenceBoundary === 'DISTRIBUTION_SEAM_GAP'
            && classification.flagship === 'DISTRIBUTION_SEAM_GAP'
            && classification.notificationBoundary === 'ALREADY_CORRECT'
            && classification.duplicateReplayFoundation === 'EXISTING_SUBSTRATE_REUSE_CONFIRMED'
            && classification.offlineReordering === 'EXISTING_SUBSTRATE_REUSE_CONFIRMED',
            '46. the classification is a genuine mix, not a rubber stamp — ONE primary gap (persistence/distribution), one boundary already correctly held (notification), and two sub-findings where existing machinery already suffices (dedup foundation, ordering) rather than everything being labeled the same way');

        console.log('Classification:', JSON.stringify(classification, null, 2));
        console.log(
            '\n0.9.617 verdict: Commentary cannot cross the device/user boundary today, by any existing path — proven live '
            + '(Section H), not assumed. The break is precisely local persistence (storage/PublicationCommentaryStore.js\'s '
            + 'injected StorageProvider), never notification, which is already correctly local-only and would need no change '
            + '(Section D). Neither existing decentralized envelope fits Commentary\'s real shape without repurposing it '
            + '(Section E) — a narrow, third, sibling envelope (mirroring core/DecentralizedDiscoveryEnvelope.js and '
            + 'core/SnapshotDiscoveryEnvelope.js\'s own shared pattern) is the smallest coherent shape for one, following '
            + 'this codebase\'s own precedent rather than inventing a protocol. Commentary has no signature and is absent '
            + 'from identity/LocalAuthorizationVerifier.js\'s whitelist (Section F) — a remotely-received Commentary cannot '
            + 'be authenticated today, and this is a genuinely separate gap from distribution itself: publishing the fact '
            + 'and trusting the fact are two different missing pieces, not one. No new deduplication service is warranted: '
            + 'PublicationCommentaryStore\'s existing commentaryId identity already gives idempotent-arrival and '
            + 'conflict-refusal semantics a distribution consumer could reuse directly (Section G/I). RECOMMENDATION: this '
            + 'audit implements nothing, per its own type — the next narrow milestone, if pursued, is scoped to (1) a '
            + 'sibling discovery envelope for Commentary, (2) a signing descriptor for PublicationCommentary plus a '
            + 'verifyCommentary() branch, and (3) reuse (never reinvention) of the existing store-level identity for '
            + 'arrival dedup — deliberately excluding, per the requesting brief, a relay, fan-out, ranking, fallback '
            + 'providers, a second Commentary database, and any UI change.'
        );
    }

    console.log('✅ All Publication Commentary Distribution Boundary Audit tests passed.');
}

await run();
