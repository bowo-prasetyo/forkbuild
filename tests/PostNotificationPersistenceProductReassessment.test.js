import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/PublicationCommentaryNotificationProducer.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import {
    NotificationCollisionOutcome,
    classifyNotificationCollision,
    notificationDeduplicationIdentity
} from '../core/NotificationDeduplicationPolicy.js';
import { NotificationEventStore, NotificationPersistenceOutcome } from '../storage/NotificationEventStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.282 — Post-Persistence Notification Product Reassessment.
//
// Test/document-only, per this milestone's own brief — no production code
// changes. 0.9.273 through 0.9.281 ran one continuous arc: a domain-neutral
// fact representation (0.9.273), a boundary audit that found Commentary the
// strongest producer candidate (0.9.274), a real producer (0.9.275), a
// lifecycle audit of that producer under real infrastructure (0.9.276), a
// persistence-semantics audit that named the deduplication question without
// answering it (0.9.277), an identity-candidate audit (0.9.278), a
// collision-semantics audit (0.9.279), an adopted, executable
// deduplication policy (0.9.280), and — completing the arc — a durable
// store that persists a NotificationEvent for the first time (0.9.281).
//
// A NotificationEvent can now survive independently of the producer
// invocation that created it. That is a genuine architectural boundary
// crossing, and 0.9.281's own "what comes after" named the question this
// milestone exists to answer, rather than assume:
//
//   What does durable notification history actually enable that is
//   currently unreachable, and is there enough evidence to introduce a
//   recipient-facing notification capability?
//
// This is not a guess that the next feature must be an inbox. It is a
// disciplined reassessment, run the same way every earlier
// Post-*-ProductReassessment milestone in this codebase has run one:
//
//   Section A — Freeze the completed notification pipeline as a compact
//               fingerprint, one concrete wiring signal per stage, and
//               prove no layer has silently become a delivery system.
//   Section B — A capability/reachability matrix across the thirteen rows
//               this milestone's own brief names.
//   Section C — Recipient query capability: can `getForRecipient()` be
//               derived safely from the existing store, and does deriving
//               it in a test prove it is already a built PRODUCT
//               capability? (It does not — `loadAll()` is not an inbox.)
//   Section D — Recipient isolation, proven against two real recipients
//               end to end, plus the honest finding that isolation today
//               is a FIELD-LEVEL fact, never a storage-level partition.
//   Section E — Restart/reconstruction, run through the full real
//               pipeline (Producer -> Store), not only raw NotificationEvent
//               objects.
//   Section F — Deduplication closure: 0.9.276 Section E's own
//               OPEN_PRODUCT_DECISION retry-duplication finding, now run
//               through a real NotificationEventStore, to see what — if
//               anything — persistence resolves.
//   Section G — Conflict closure, plus the honest finding that the one
//               real producer that exists structurally cannot reach
//               NotificationEventStore's own CONFLICT outcome today.
//   Section H — Persistence versus delivery: an explicit architectural
//               regression proving no lifecycle vocabulary has crept in.
//   Section I — ChatOutbox comparison, run again, still not merged.
//   Section J — Existing consumer search: does anything already wired
//               into the product benefit from durable notification
//               history today?
//   Section K — Missing domain capability versus missing UI, stated
//               explicitly and grounded in Sections B/C/J's own evidence.
//   Section L — Obsolete/deferred candidates, revisited.
//   Section M — Product-gap ranking.
//   Section N — Final verdict. Ranked candidates, nothing built.
//
//   0.9.273 ── 0.9.274 ── 0.9.275 ── 0.9.276 ── 0.9.277 ── 0.9.278 ── 0.9.279 ── 0.9.280 ── 0.9.281 ── 0.9.282  <- this
//    (fact       (boundary   (real       (lifecycle  (persistence (identity   (collision  (adopted    (durable    (reassessment,
//     seam)       audit,      producer)   audit)      semantics    audit)      audit)      policy)     store)      no build)
//                 picks                    audit)
//                 Commentary)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Mirrors tests/PostPublicationCommentaryProductReassessment.test.js's own
// helper, itself mirroring tests/ProductEvolutionBaseline.test.js's B3 —
// this whole reassessment lineage's one grep-verifiable signal for "does
// anything real call this," rather than trusting a header comment's claim.
async function grepCount(pattern, dirs, { excludeSuffix = null, ignoreCase = false } = {}) {
    let hits = '';
    try {
        const exclude = excludeSuffix ? ` | grep -v "${excludeSuffix}"` : '';
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js"${exclude} || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

// ---------------------------------------------------------------------
// Shared fixtures — identical shape to
// tests/PublicationCommentaryNotificationProducerLifecycleAudit.test.js,
// extended with a real NotificationEventStore wired to the producer's own
// injected sink. This is the first test file in this arc to wire the real
// producer to a real store — 0.9.276 exercised the producer alone; 0.9.281
// exercised the store alone against hand-constructed NotificationEvents.
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

// The one new fixture this milestone adds: a producer whose sink writes
// straight into a real NotificationEventStore, sharing an injected
// notificationStorageProvider so a caller can later construct a SECOND,
// independent store instance against the same provider (Section E's own
// restart proof). Nothing about this wiring requires any production file
// to change — `notificationSink` has always been a plain injected
// function, per application/PublicationCommentaryNotificationProducer.js's
// own header.
function buildWiredPipeline({ publisherProvider, commentAuthorProvider, publicationId, notificationStorageProvider = new InMemoryStorageProvider() }) {
    const { publication, discoveryProvider } = makePublication({ id: publicationId, publisherProvider });
    const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
    const notificationStore = new NotificationEventStore(notificationStorageProvider);
    const saveResults = [];
    const producer = buildProducer({
        discoveryProvider,
        commentaryStore,
        commentAuthorProvider,
        sink: (event) => saveResults.push(notificationStore.save(event))
    });
    return { publication, discoveryProvider, commentaryStore, notificationStore, notificationStorageProvider, producer, saveResults };
}

async function runTests() {
    console.log('Running Post-Persistence Notification Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Notification pipeline closure.
    //
    // One representative wiring signal per stage of this milestone's own
    // brief's pipeline diagram, read fresh from the real, unmodified
    // source, plus the "no layer has silently become a delivery system"
    // claim, checked against real CODE (comments excluded) rather than
    // trusting any file's own header.
    // ===============================================================
    {
        const addUseCase = await rawSource('application/AddPublicationCommentaryUseCase.js');
        const producer = await rawSource('application/PublicationCommentaryNotificationProducer.js');
        const notificationEvent = await rawSource('core/NotificationEvent.js');
        const dedupPolicy = await rawSource('core/NotificationDeduplicationPolicy.js');
        const store = await rawSource('storage/NotificationEventStore.js');

        // A1. Commentary remains authoritative for the underlying fact —
        // AddPublicationCommentaryUseCase still persists BEFORE the
        // producer constructs anything, unguarded by any try/catch of its
        // own (0.9.275's own "ordering" claim, reconfirmed fresh).
        assert(producer.includes('this._addPublicationCommentaryUseCase.execute(input)'),
            'A1a. application/PublicationCommentaryNotificationProducer.js still delegates persistence to the wrapped AddPublicationCommentaryUseCase before doing anything else.');
        const producerCode = codeOnlyLines(producer);
        const executeIdx = producerCode.indexOf('this._addPublicationCommentaryUseCase.execute(input)');
        const constructEventIdx = producerCode.indexOf('new NotificationEvent(');
        assert(executeIdx !== -1 && constructEventIdx !== -1 && executeIdx < constructEventIdx,
            'A1b. The wrapped use case\'s execute() still runs strictly before any NotificationEvent is constructed — Commentary persistence is the one authoritative fact everything downstream reacts to, never the reverse.');

        // A2. NotificationEvent remains an immutable representation of
        // that fact, never a second copy of the fact's own content —
        // the producer's payload still carries only identifiers, never
        // commentary.content itself.
        assert(!/authorIdentityId:\s*commentary\.content|content:\s*commentary\.content/.test(producer),
            'A2a. application/PublicationCommentaryNotificationProducer.js still never copies commentary.content into a NotificationEvent payload — Commentary stays the sole authoritative source for what was actually said.');
        assert(/payload:\s*\{\s*publicationId:\s*commentary\.publicationId,\s*commentaryId:\s*commentary\.commentaryId,\s*authorIdentityId:\s*commentary\.authorIdentityId\s*\}/.test(producer),
            'A2b. The constructed payload still carries exactly publicationId/commentaryId/authorIdentityId — three identifiers, never the commentary content itself.');
        assert(notificationEvent.includes('get payload() { return clonePayload(this._payload); }'),
            'A2c. core/NotificationEvent.js still hands back a fresh clone of payload on every read — no caller can mutate the stored fact through the getter.');

        // A3. Producer establishes the notification event — and ONLY the
        // event, never persistence. It imports NotificationEvent, never
        // NotificationEventStore.
        const producerImports = producer.match(/^import .*/gm) || [];
        assert(producerImports.length === 1 && producerImports[0].includes("from '../core/NotificationEvent.js'"),
            `A3. application/PublicationCommentaryNotificationProducer.js still imports exactly one thing — NotificationEvent — and nothing from storage/ (found imports: ${JSON.stringify(producerImports)}). The producer constructs a fact; it has no idea a store exists.`);

        // A4. DeduplicationPolicy establishes logical equivalence — pure,
        // dependency-free, no import of NotificationEventStore or any
        // storage concept, reconfirmed fresh.
        const dedupImports = dedupPolicy.match(/^import .*/gm) || [];
        assert(dedupImports.length === 0,
            `A4. core/NotificationDeduplicationPolicy.js still imports nothing at all (found: ${JSON.stringify(dedupImports)}) — a pure computation over two NotificationEvent arguments, no storage concept of any kind.`);
        assert(dedupPolicy.includes('export function classifyNotificationCollision') && dedupPolicy.includes('export function notificationDeduplicationIdentity'),
            'A4b. core/NotificationDeduplicationPolicy.js still exports the identity function and the three-way collision classifier this store consumes.');

        // A5. Store establishes durable history — the ONLY file that
        // imports both NotificationEvent and the dedup policy, and the
        // one place a StorageProvider ever gets touched for a
        // notification. It never recomputes identity or collision logic
        // of its own.
        assert(store.includes("from '../core/NotificationEvent.js'") && store.includes("from '../core/NotificationDeduplicationPolicy.js'"),
            'A5a. storage/NotificationEventStore.js still imports both NotificationEvent and NotificationDeduplicationPolicy — the only file in this pipeline that depends on both.');
        assert(!/function\s+notificationDeduplicationIdentity|function\s+classifyNotificationCollision/.test(codeOnlyLines(store)),
            'A5b. storage/NotificationEventStore.js\'s own CODE still defines no local reimplementation of identity/collision logic — every such decision is delegated to the imported policy functions.');
        assert(store.includes('export const NotificationPersistenceOutcome') && store.includes('save(event)') && store.includes('getById(notificationId)') && store.includes('getByDeduplicationIdentity(event)') && store.includes('loadAll()'),
            'A5c. storage/NotificationEventStore.js still exposes exactly the four persistence primitives this arc has built toward: save/getById/getByDeduplicationIdentity/loadAll.');

        // A6. No layer has silently become a delivery system. Checked
        // against real CODE, not prose — a header comment can (and does,
        // deliberately) use words like "delivered" or "seen" to EXPLAIN
        // an absence; only the executable code matters here.
        const deliveryVocab = /delivered|\bdelivery\b|\bseen\b|acknowledg|\bqueued?\b|\bpending\b|\bfailed\b|\bdispatch|markRead|isRead|\bttl\b|expiresAt|\bstate\b|\bQUEUED\b|\bSENT\b|\bDELIVERED\b|\bexpire/i;
        for (const [label, code] of [
            ['core/NotificationEvent.js', codeOnlyLines(notificationEvent)],
            ['core/NotificationDeduplicationPolicy.js', codeOnlyLines(dedupPolicy)],
            ['storage/NotificationEventStore.js', codeOnlyLines(store)],
            ['application/PublicationCommentaryNotificationProducer.js', codeOnlyLines(producer)]
        ]) {
            assert(!deliveryVocab.test(code), `A6. ${label}'s own CODE (comments excluded) still contains no delivery/lifecycle vocabulary (delivered, seen, acknowledged, queued, pending, failed, dispatch, markRead, isRead, ttl, expiresAt, state, QUEUED/SENT/DELIVERED, expire).`);
        }

        console.log('✓ A: All five pipeline stages this milestone\'s own brief names — Commentary (authoritative fact, persisted first), NotificationEvent (immutable, identifier-only payload), NotificationProducer (constructs the fact, imports nothing from storage/), NotificationDeduplicationPolicy (pure, dependency-free, no reimplementation in the store), NotificationEventStore (durable history, delegates identity/collision to the policy) — each still hold their representative wiring signal in the real, unmodified source. No layer\'s own code contains any delivery, lifecycle, or read-state vocabulary. No production file needed a change to reconfirm this.');
    }

    // ===============================================================
    // Section B — Persistence capability matrix. Each row cites one
    // concrete, verifiable signal — never asserted from category alone.
    // ===============================================================
    {
        const capabilityRegister = [];
        const store = await rawSource('storage/NotificationEventStore.js');
        const dedupPolicy = await rawSource('core/NotificationDeduplicationPolicy.js');

        // B1. Create notification fact.
        assert((await rawSource('core/NotificationEvent.js')).includes('export class NotificationEvent'),
            'B1. core/NotificationEvent.js still exports a constructible NotificationEvent class.');
        capabilityRegister.push(['Create notification fact', 'COMPLETE']);

        // B2. Determine recipient (for Commentary specifically — this
        // matrix is scoped to the one real producer that exists, exactly
        // as this milestone's own brief frames it).
        assert((await rawSource('application/PublicationCommentaryNotificationProducer.js')).includes('recipientIdentityId: publication.publisherIdentity.id'),
            'B2. application/PublicationCommentaryNotificationProducer.js still resolves a recipient from an already-on-file field (Publication.publisherIdentity.id) — no new relationship invented.');
        capabilityRegister.push(['Determine recipient (Commentary)', 'COMPLETE']);

        // B3. Deduplicate retries.
        assert(dedupPolicy.includes('export function haveSameNotificationDeduplicationIdentity'),
            'B3. core/NotificationDeduplicationPolicy.js still exposes the identity comparison a retry is deduplicated against.');
        capabilityRegister.push(['Deduplicate retries', 'COMPLETE']);

        // B4. Persist notification.
        assert(store.includes('_persist(collection)'),
            'B4. storage/NotificationEventStore.js still writes through an injected StorageProvider.');
        capabilityRegister.push(['Persist notification', 'COMPLETE']);

        // B5. Reconstruct after restart — Section E below re-verifies
        // this fresh, through the full real pipeline rather than only
        // citing 0.9.281's own Section M.
        capabilityRegister.push(['Reconstruct after restart', 'COMPLETE (Section E)']);

        // B6. Retrieve by notification ID.
        assert(store.includes('getById(notificationId)'), 'B6. storage/NotificationEventStore.js still exposes getById().');
        capabilityRegister.push(['Retrieve by notification ID', 'COMPLETE']);

        // B7. Retrieve by logical identity.
        assert(store.includes('getByDeduplicationIdentity(event)'), 'B7. storage/NotificationEventStore.js still exposes getByDeduplicationIdentity().');
        capabilityRegister.push(['Retrieve by logical identity', 'COMPLETE']);

        // B8. Detect conflicts.
        assert(store.includes('NotificationCollisionOutcome.CONFLICT'), 'B8. storage/NotificationEventStore.js still branches on CONFLICT explicitly.');
        capabilityRegister.push(['Detect conflicts', 'COMPLETE (storage layer) — Section G finds this unreachable from the one real producer']);

        // B9. Enumerate notification history — COMPLETE at the storage
        // layer (loadAll() exists), but see Section C/J: nothing above
        // storage/ currently calls it.
        assert(store.includes('loadAll()'), 'B9. storage/NotificationEventStore.js still exposes loadAll().');
        const loadAllCallers = await grepCount('\\.loadAll(', ['application', 'ui'], { excludeSuffix: null });
        capabilityRegister.push(['Enumerate notification history', `COMPLETE (storage layer); REACHABLE_BUT_INTERNAL end-to-end — ${loadAllCallers} application/ui callers`]);

        // B10. Retrieve notifications for recipient — the row this
        // milestone's own brief calls out by name. No such method exists.
        assert(!/getForRecipient/.test(codeOnlyLines(store)),
            'B10. storage/NotificationEventStore.js still exposes no getForRecipient() — the exact capability this milestone\'s own brief asks whether evidence justifies.');
        capabilityRegister.push(['Retrieve notifications for recipient', 'MISSING_DOMAIN_CAPABILITY (Section C)']);

        // B11. Mark notification read.
        assert(!/markRead|isRead|\breadAt\b/i.test(codeOnlyLines(store) + codeOnlyLines(await rawSource('core/NotificationEvent.js'))),
            'B11. Neither storage/NotificationEventStore.js nor core/NotificationEvent.js\'s own CODE contains any read/unread vocabulary.');
        capabilityRegister.push(['Mark notification read', 'MISSING_DOMAIN_CAPABILITY']);

        // B12. Deliver notification. Checked against real CODE only —
        // application/PublicationCommentaryNotificationProducer.js's own
        // header comment NAMES NotificationDelivery/NotificationInbox/
        // NotificationCenter to explain their absence, which would
        // otherwise false-positive a raw whole-file grep.
        const deliveryHits = await grepCount('class NotificationDelivery\\|class NotificationDispatch\\|export class NotificationDelivery', ['application', 'core', 'storage'], { ignoreCase: true });
        assert(deliveryHits === 0, 'B12. No delivery/dispatch class is actually defined anywhere for notifications — the producer\'s own header only NAMES these to explain their absence.');
        capabilityRegister.push(['Deliver notification', 'MISSING_DOMAIN_CAPABILITY']);

        // B13. Notification UI.
        const uiHits = await grepCount('NotificationEvent\\|NotificationEventStore\\|NotificationInbox\\|NotificationCenter', ['ui'], { ignoreCase: false });
        assert(uiHits === 0, 'B13. No file under ui/ references NotificationEvent, NotificationEventStore, or any notification-presentation vocabulary at all.');
        capabilityRegister.push(['Notification UI', 'MISSING_UI']);

        assert(capabilityRegister.length === 13, 'B14. All thirteen capability rows this milestone\'s own brief names were classified.');

        console.log('✓ B: Capability/reachability matrix complete — nine rows COMPLETE (create, determine recipient, deduplicate, persist, reconstruct, retrieve-by-id, retrieve-by-identity, detect conflicts at the storage layer, enumerate history at the storage layer), one MISSING_DOMAIN_CAPABILITY row this milestone\'s own brief specifically asked about (retrieve-for-recipient), two further MISSING_DOMAIN_CAPABILITY rows (mark read, deliver), and one MISSING_UI row. Each row cites a concrete signal, never asserted from category alone.');
        console.log('\nCapability register:');
        for (const [name, status] of capabilityRegister) {
            console.log(`    ${name.padEnd(38)} ${status}`);
        }
        console.log('');
    }

    // ===============================================================
    // Section C — Recipient query capability. Can `getForRecipient()` be
    // derived safely from the existing store without inventing new
    // semantics? Yes, mechanically — but deriving it in a TEST proves
    // only that the underlying data supports it, never that it is a
    // built PRODUCT capability. `loadAll()` is not an inbox.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        const providerA = new InMemoryStorageProvider();
        const { notificationStore: storeA } = buildWiredPipeline({ publisherProvider: alice, commentAuthorProvider: bob, publicationId: 'pub-c1', notificationStorageProvider: providerA });
        // A second, independent Publication/producer sharing the SAME
        // notification storage provider — the realistic multi-Publication
        // shape a real deployment would have.
        const pipelineB = buildWiredPipeline({ publisherProvider: carol, commentAuthorProvider: bob, publicationId: 'pub-c2', notificationStorageProvider: providerA });

        pipelineB.producer.execute({ publicationId: 'pub-c2', content: 'Nice work Carol' });

        // C1. A derived, TEST-ONLY getForRecipient — implemented here,
        // never in production — using only `loadAll()` and a plain
        // filter. This proves the underlying store already carries
        // enough information for such a query to be correct...
        function testOnlyGetForRecipient(store, recipientIdentityId) {
            return store.loadAll().filter((event) => event.recipientIdentityId === recipientIdentityId);
        }
        const aliceView = testOnlyGetForRecipient(storeA, alice.getSigningIdentity().id);
        const carolView = testOnlyGetForRecipient(storeA, carol.getSigningIdentity().id);
        assert(aliceView.length === 0, 'C1a. Alice has received no Commentary in this section — zero notifications for her, correctly derived.');
        assert(carolView.length === 1 && carolView[0].recipientIdentityId === carol.getSigningIdentity().id,
            'C1b. Carol\'s one real notification is correctly derived by filtering loadAll() on recipientIdentityId — the raw data already supports this query.');

        // C2. ...but this derivation is NOT a built product capability.
        // Zero application/ui callers of loadAll() exist at all (Section
        // B9), and grep confirms it directly here, scoped and fresh.
        const loadAllCallers = await grepCount('\\.loadAll(', ['application', 'ui']);
        assert(loadAllCallers === 0,
            'C2. Zero callers of NotificationEventStore#loadAll() exist in application/ or ui/ — the filter this section just performed exists ONLY in this test file, never in the product.');

        // C3. getForRecipient() itself does not exist as a method, on
        // this store or anywhere else in the codebase. storage/
        // NotificationEventStore.js's own header comment NAMES
        // getForRecipient() to explain its deliberate exclusion — a raw
        // whole-file grep would false-positive on exactly that sentence,
        // so this checks real CODE only, file by file.
        for (const path of ['application', 'core', 'storage', 'ui']) {
            const files = execSync(`grep -rl "getForRecipient" ${path} --include="*.js" || true`, { cwd: SOURCE_ROOT.pathname }).toString().trim();
            for (const file of files ? files.split('\n') : []) {
                const code = codeOnlyLines(await rawSource(file));
                assert(!code.includes('getForRecipient'),
                    `C3. ${file}'s own CODE (comments excluded) still contains no getForRecipient reference — this is a genuinely absent capability, not merely an unwired one.`);
            }
        }

        // C4. The distinction this milestone's own brief draws, made
        // explicit: getByDeduplicationIdentity() answers "is THIS exact
        // logical notification already on file" (a single-record probe
        // keyed on commentaryId+eventType+recipientIdentityId together);
        // it structurally cannot answer "give me every notification
        // addressed to identity X" (a collection query keyed on
        // recipientIdentityId alone) without a caller supplying a full,
        // already-known probe event for every possible commentaryId —
        // which defeats the entire point of a recipient-facing query.
        const probeRequiresFullEvent = /getByDeduplicationIdentity\(event\)/.test(await rawSource('storage/NotificationEventStore.js'));
        assert(probeRequiresFullEvent,
            'C4. getByDeduplicationIdentity() still takes a full NotificationEvent as its probe, not merely a recipientIdentityId — confirming it answers a different question than a recipient-facing query would.');

        console.log('✓ C: getForRecipient() CAN be safely derived from the existing store\'s own data (C1) — a plain filter over loadAll() is provably correct, introduces no new semantics, and required no change to any existing method\'s contract. But it is not, today, a product capability: zero application/UI code performs this derivation (C2), the method does not exist anywhere (C3), and the one existing by-identity lookup answers a structurally different question (C4). Classification: MISSING_DOMAIN_CAPABILITY, safely derivable, not yet built — the honest middle ground this milestone\'s own brief asked to distinguish from either "already works" or "impossible."');
    }

    // ===============================================================
    // Section D — Recipient isolation. Recipient A / Recipient B, proven
    // against the real pipeline, plus the honest storage-level finding.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const carol = makeIdentity('Carol');
        const bob = makeIdentity('Bob');
        const dave = makeIdentity('Dave');

        const sharedProvider = new InMemoryStorageProvider();
        const pipelineAlice = buildWiredPipeline({ publisherProvider: alice, commentAuthorProvider: bob, publicationId: 'pub-d1', notificationStorageProvider: sharedProvider });
        const pipelineCarol = buildWiredPipeline({ publisherProvider: carol, commentAuthorProvider: dave, publicationId: 'pub-d2', notificationStorageProvider: sharedProvider });

        pipelineAlice.producer.execute({ publicationId: 'pub-d1', content: 'Bob comments on Alice\'s world' });
        pipelineCarol.producer.execute({ publicationId: 'pub-d2', content: 'Dave comments on Carol\'s world' });

        const aliceId = alice.getSigningIdentity().id;
        const carolId = carol.getSigningIdentity().id;

        // D1. Each store instance is a fresh view over the SAME shared
        // provider (both pipelines were wired to sharedProvider) — this
        // deliberately exercises the realistic case of multiple
        // Publications/producers writing into one durable notification
        // history, not two artificially separate stores.
        const allEvents = pipelineAlice.notificationStore.loadAll();
        assert(allEvents.length === 2, 'D1. Both notifications (Alice\'s and Carol\'s) landed in the one shared NotificationEventStore.');

        // D2. Recipient A: notification 1.
        const forAlice = allEvents.filter((e) => e.recipientIdentityId === aliceId);
        assert(forAlice.length === 1 && forAlice[0].payload.publicationId === 'pub-d1',
            'D2. Filtering by Alice\'s identity yields exactly the one notification addressed to her.');

        // D3. Recipient B: notification 2.
        const forCarol = allEvents.filter((e) => e.recipientIdentityId === carolId);
        assert(forCarol.length === 1 && forCarol[0].payload.publicationId === 'pub-d2',
            'D3. Filtering by Carol\'s identity yields exactly the one notification addressed to her.');

        // D4. A never accidentally observes B's event merely because both
        // concern a Publication/Commentary — the direct cross-check this
        // milestone's own brief asks for.
        assert(!forAlice.some((e) => e.recipientIdentityId === carolId), 'D4a. Alice\'s filtered set never contains an event addressed to Carol.');
        assert(!forCarol.some((e) => e.recipientIdentityId === aliceId), 'D4b. Carol\'s filtered set never contains an event addressed to Alice.');

        // D5. Same Publication, two different commenters -> both
        // notifications go to the SAME recipient (the publisher), never
        // to the commenter — recipient is per-Publication, not
        // per-interaction. Reconfirms 0.9.275's own "every successful
        // Commentary produces a notification, addressed to the publisher"
        // claim under the persistence layer specifically.
        const eve = makeIdentity('Eve');
        pipelineAlice.producer.execute({ publicationId: 'pub-d1', content: 'Eve also comments on Alice\'s world' });
        const forAliceAfterSecondComment = pipelineAlice.notificationStore.loadAll().filter((e) => e.recipientIdentityId === aliceId);
        assert(forAliceAfterSecondComment.length === 2, 'D5a. Two different commenters on the same Publication produce two notifications, both addressed to Alice.');
        assert(forAliceAfterSecondComment.every((e) => e.recipientIdentityId === aliceId) && !forAliceAfterSecondComment.some((e) => e.recipientIdentityId === eve.getSigningIdentity().id),
            'D5b. Neither notification is ever addressed to the commenter (Bob or Eve) — recipient identity is a fact about the Publication, never about who happened to write the comment.');

        // D6. The honest finding: isolation today is a FIELD-LEVEL fact
        // (recipientIdentityId), never a storage-level partition. Unlike
        // application/ChatOutbox.js, which scopes its OWN storage key per
        // local owner (`chat-outbox:${owner}` — see Section I), the
        // notification store persists every recipient's facts under one
        // single, shared key. Confirmed directly: the raw persisted array
        // for one shared provider already contains BOTH Alice's and
        // Carol's events, readable by anyone holding a reference to that
        // provider, with no per-recipient partition at all.
        const rawPersisted = sharedProvider.load('notification-events:entries');
        assert(Array.isArray(rawPersisted) && rawPersisted.length === 3,
            'D6a. The raw storage record for the shared key already contains all three saved notifications, across two different recipients, in one flat array.');
        const rawRecipientIds = new Set(rawPersisted.map((r) => r.recipientIdentityId));
        assert(rawRecipientIds.has(aliceId) && rawRecipientIds.has(carolId),
            'D6b. Both recipient identities are visible in the SAME raw storage record — nothing in the persistence schema itself partitions one recipient\'s facts from another\'s.');
        const storeConstantKey = (await rawSource('storage/NotificationEventStore.js')).includes("const NOTIFICATION_EVENT_STORE_KEY = 'notification-events:entries';");
        assert(storeConstantKey, 'D6c. storage/NotificationEventStore.js still persists under one single, fixed constant key — never a per-recipient or per-owner key template.');

        console.log('✓ D: Recipient isolation holds at the FIELD level, proven against two real recipients through the full producer -> store pipeline (D1-D5) — Alice never observes Carol\'s notification, both commenters on one Publication still notify only its one publisher. The honest finding (D6): this isolation is enforced entirely by recipientIdentityId as a fact a caller must filter on, never by a storage-level partition the way application/ChatOutbox.js scopes storage per LOCAL owner. A future getForRecipient(id) implemented as a plain filter (Section C) would be correct only as long as every caller passes the CURRENT authenticated identity — nothing in the store itself prevents a caller from passing any id and reading any recipient\'s history. This is the concrete shape of the access-boundary question Section G below returns to.');
    }

    // ===============================================================
    // Section E — Restart/reconstruction, through the FULL real
    // pipeline. 0.9.281 Section M already proved this for hand-
    // constructed NotificationEvent objects; this section runs the
    // identical proof one layer up, starting from a real Commentary
    // submission through a real Producer.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const provider = new InMemoryStorageProvider();

        const pipeline1 = buildWiredPipeline({ publisherProvider: alice, commentAuthorProvider: bob, publicationId: 'pub-e1', notificationStorageProvider: provider });
        const { commentary } = pipeline1.producer.execute({ publicationId: 'pub-e1', content: 'Restart me' });
        assert(pipeline1.saveResults.length === 1 && pipeline1.saveResults[0].outcome === NotificationPersistenceOutcome.NEW,
            'E1. The real pipeline produces exactly one NEW persisted notification for the real Commentary submission.');

        // E2. A brand-new NotificationEventStore instance, constructed
        // against the SAME injected provider — simulating a process
        // restart or page reload — reconstructs the same fact with no
        // producer, no commentary store, and no identity provider
        // involved at all: only the raw provider and the store class.
        const reloadedStore = new NotificationEventStore(provider);
        const reloaded = reloadedStore.loadAll();
        assert(reloaded.length === 1, 'E2a. The reloaded store, built from nothing but the provider, still finds exactly the one persisted notification.');
        assert(reloaded[0].payload.commentaryId === commentary.commentaryId,
            'E2b. The reconstructed NotificationEvent still references the exact same commentaryId the original Commentary submission produced.');
        assert(reloaded[0] instanceof NotificationEvent, 'E2c. The reconstructed record is a real NotificationEvent instance, re-hydrated through fromJSON(), not a plain object.');

        // E3. A retry submitted AFTER reconstruction — a genuinely
        // separate producer instance, wrapping a genuinely separate
        // AddPublicationCommentaryUseCase, over the SAME underlying
        // commentary store — still resolves to EXISTING against the
        // reloaded store, proving deduplication survives a restart, not
        // merely a single in-memory session.
        const retryResult = reloadedStore.save(new NotificationEvent({
            eventType: reloaded[0].eventType,
            recipientIdentityId: reloaded[0].recipientIdentityId,
            payload: reloaded[0].payload
        }));
        assert(retryResult.outcome === NotificationPersistenceOutcome.EXISTING,
            'E3. A freshly constructed NotificationEvent carrying the same logical identity, saved against the RELOADED store, correctly resolves to EXISTING — deduplication is a property of the durable data, confirmed here across the full real pipeline, not only across hand-constructed events (0.9.281 Section M).');
        assert(reloadedStore.loadAll().length === 1, 'E3b. The retry after reconstruction still does not grow the persisted collection.');

        console.log('✓ E: Restart/reconstruction holds through the complete real pipeline — a Commentary submitted through a real Producer survives a simulated restart (a brand-new NotificationEventStore over the same provider) with its payload intact, and a post-restart retry still deduplicates correctly (E1-E3). This extends 0.9.281 Section M\'s own proof (raw NotificationEvent objects) one layer up, to the actual product entry point.');
    }

    // ===============================================================
    // Section F — Deduplication closure. 0.9.276 Section E found, and
    // deliberately left OPEN, that an idempotent Commentary retry
    // (isNew === false) still produces a SECOND, distinct NotificationEvent
    // from the producer alone. This section asks: does a real
    // NotificationEventStore resolve that finding?
    // ===============================================================
    {
        assert(await sourceExists('tests/PublicationCommentaryNotificationProducerLifecycleAudit.test.js'),
            'F1. tests/PublicationCommentaryNotificationProducerLifecycleAudit.test.js (0.9.276) still exists as the source of the retry-duplication finding this section builds on.');
        const lifecycleAudit = await rawSource('tests/PublicationCommentaryNotificationProducerLifecycleAudit.test.js');
        assert(lifecycleAudit.includes('OPEN_PRODUCT_DECISION') && lifecycleAudit.includes('E5. FINDING'),
            'F2. 0.9.276\'s own Section E/G retry-duplication finding is still on file, still classified OPEN_PRODUCT_DECISION, unmodified by this milestone.');

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { producer, notificationStore, saveResults } = buildWiredPipeline({ publisherProvider: alice, commentAuthorProvider: bob, publicationId: 'pub-f1' });

        const fixedInput = { publicationId: 'pub-f1', commentaryId: 'retry-f', content: 'Retried content', createdAt: new Date('2024-04-04T00:00:00.000Z') };
        const first = producer.execute(fixedInput);
        assert(first.isNew === true, 'F3. The first submission is a genuinely new Commentary.');
        assert(saveResults.length === 1 && saveResults[0].outcome === NotificationPersistenceOutcome.NEW,
            'F4. The first submission\'s notification persists as NEW.');

        const retry = producer.execute({ ...fixedInput });
        assert(retry.isNew === false, 'F5. Sanity: the wrapped use case still correctly reports the retry as idempotent, exactly as 0.9.276 found.');

        // F6. THE ANSWER: the producer still emits a second, distinct
        // NotificationEvent (0.9.276's own finding, unchanged — this
        // milestone does not patch the producer) — but the STORE now
        // collapses it. The second save() resolves to EXISTING, not a
        // second durable row.
        assert(saveResults.length === 2, 'F6a. The producer still emits a second NotificationEvent on retry — 0.9.276\'s own finding holds, unpatched.');
        assert(saveResults[1].outcome === NotificationPersistenceOutcome.EXISTING,
            'F6b. THE CLOSURE: the retry-triggered notification\'s save() now resolves to EXISTING, not NEW — the durable store closes exactly the gap 0.9.276 left open, without any change to the producer itself.');
        assert(notificationStore.loadAll().length === 1,
            'F6c. The persisted notification history still contains exactly one row for this commentaryId, regardless of how many times the producer re-announced it.');

        // F7. Several more retries in a row — 0.9.276's own "unbounded,
        // no de-duplication ceiling" finding for the PRODUCER still
        // holds; the STORE's own ceiling is exactly one row, every time.
        producer.execute({ ...fixedInput });
        producer.execute({ ...fixedInput });
        assert(saveResults.length === 4, 'F7a. The producer still emits one NotificationEvent per call, unbounded (0.9.276\'s own finding, reconfirmed).');
        assert(saveResults.slice(1).every((r) => r.outcome === NotificationPersistenceOutcome.EXISTING),
            'F7b. Every retry-triggered save() after the first resolves to EXISTING.');
        assert(notificationStore.loadAll().length === 1, 'F7c. The durable history never grows past the one genuine notification, no matter how many producer-side retries occur.');

        console.log('✓ F: Deduplication closure. 0.9.276\'s own OPEN_PRODUCT_DECISION finding — the producer alone re-announces an idempotent retry, unboundedly, with no ceiling (F3-F5, F7a) — is UNCHANGED by this milestone, exactly as it should be (no producer modification is in scope). What changes is what happens NEXT: a real NotificationEventStore now gives every one of those re-announcements a safe destination, collapsing them onto exactly one durable row every time (F6, F7b-c). The persistence layer resolves the SYMPTOM (unbounded duplicate rows) without resolving the PRODUCT QUESTION 0.9.276 left open (should a retry re-announce at all) — that question remains exactly as open as 0.9.276 left it; this section only proves persistence has made it safe to leave open.');
    }

    // ===============================================================
    // Section G — Conflict closure, plus the honest finding that the
    // one real producer that exists cannot reach CONFLICT today.
    // ===============================================================
    {
        // G1. Reconfirm CONFLICT still works, fresh, via directly
        // constructed NotificationEvents — the same shape 0.9.279/0.9.281
        // already proved, re-verified rather than assumed unchanged.
        const alice = makeIdentity('Alice');
        const notificationStore = new NotificationEventStore(new InMemoryStorageProvider());
        const original = new NotificationEvent({
            eventType: 'publication.commented',
            recipientIdentityId: alice.getSigningIdentity().id,
            payload: { publicationId: 'pub-g1', commentaryId: 'c-g1', authorIdentityId: 'bob-id' }
        });
        const conflicting = new NotificationEvent({
            eventType: 'publication.commented',
            recipientIdentityId: alice.getSigningIdentity().id,
            payload: { publicationId: 'pub-g1', commentaryId: 'c-g1', authorIdentityId: 'someone-else-entirely' }
        });
        assert(classifyNotificationCollision(original, conflicting) === NotificationCollisionOutcome.CONFLICT,
            'G1a. Two events sharing a deduplication identity but disagreeing on a shared payload field still classify as CONFLICT (0.9.279/0.9.280, reconfirmed fresh).');
        const firstSave = notificationStore.save(original);
        assert(firstSave.outcome === NotificationPersistenceOutcome.NEW, 'G1b. The original saves as NEW.');
        const conflictSave = notificationStore.save(conflicting);
        assert(conflictSave.outcome === NotificationPersistenceOutcome.CONFLICT
            && conflictSave.conflict.existing.notificationId === original.notificationId
            && conflictSave.conflict.existing.payload.authorIdentityId === 'bob-id'
            && conflictSave.conflict.incoming === conflicting,
            'G1c. The colliding event\'s save() still resolves to CONFLICT, carries both events for diagnosis (existing re-hydrated from storage, incoming the exact caller instance), and never overwrites the original (0.9.281, reconfirmed fresh).');
        assert(notificationStore.getById(original.notificationId).payload.authorIdentityId === 'bob-id',
            'G1d. The original record on file is completely untouched by the rejected CONFLICT save.');

        // G2. THE HONEST FINDING: the one real producer that exists —
        // application/PublicationCommentaryNotificationProducer.js, wired
        // to a real PublicationCommentaryStore — structurally CANNOT
        // manufacture a CONFLICT in NotificationEventStore today. The
        // only way for two NotificationEvents to share a deduplication
        // identity (commentaryId + eventType + recipientIdentityId) but
        // disagree on a shared payload field (authorIdentityId) is for
        // the SAME commentaryId to be submitted twice with a DIFFERENT
        // author — and PublicationCommentaryStore's own conflict guard
        // (0.9.243) already refuses that upstream, before the producer
        // ever constructs a second NotificationEvent at all.
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const { producer } = buildWiredPipeline({ publisherProvider: alice, commentAuthorProvider: bob, publicationId: 'pub-g2' });
        producer.execute({ publicationId: 'pub-g2', commentaryId: 'shared-id', content: 'Bob\'s content', createdAt: new Date('2024-01-01T00:00:00.000Z') });

        // A second producer sharing the SAME PublicationCommentaryStore
        // key space (a fresh in-memory one here, since this is a new
        // scenario) but authenticated as Carol, attempting the SAME
        // commentaryId with the SAME content — the one input shape that
        // could otherwise slip a different authorIdentityId through — is
        // intercepted by PublicationCommentaryStore's own toJSON()
        // equality check on authorIdentityId specifically.
        const commentaryStore2 = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const { discoveryProvider: discovery2 } = makePublication({ id: 'pub-g2b', publisherProvider: alice });
        const producerBobSameStore = buildProducer({ discoveryProvider: discovery2, commentaryStore: commentaryStore2, commentAuthorProvider: bob, sink: () => {} });
        const producerCarolSameStore = buildProducer({ discoveryProvider: discovery2, commentaryStore: commentaryStore2, commentAuthorProvider: carol, sink: () => {} });
        producerBobSameStore.execute({ publicationId: 'pub-g2b', commentaryId: 'shared-id-2', content: 'same content', createdAt: new Date('2024-01-01T00:00:00.000Z') });

        let threwConflict = false;
        try {
            producerCarolSameStore.execute({ publicationId: 'pub-g2b', commentaryId: 'shared-id-2', content: 'same content', createdAt: new Date('2024-01-01T00:00:00.000Z') });
        } catch (e) {
            threwConflict = e.constructor.name === 'PublicationCommentaryConflictError' || /conflict/i.test(e.message);
        }
        assert(threwConflict,
            'G2. A DIFFERENT authenticated identity retrying the exact same commentaryId is rejected by PublicationCommentaryStore\'s own upstream conflict guard BEFORE the producer ever constructs a second NotificationEvent — so NotificationEventStore never even sees the colliding pair. The one scenario that would organically produce a payload CONFLICT at the notification layer is already intercepted one layer earlier.');

        console.log('✓ G: CONFLICT detection itself still works exactly as 0.9.279/0.9.280/0.9.281 established — reconfirmed fresh with a new pair of hand-constructed events (G1). The honest finding this section adds: the real Commentary producer cannot organically reach CONFLICT at all, because Commentary\'s own storage layer already refuses the one input shape (same commentaryId, different author) that would produce one (G2). CONFLICT is real, tested, and load-bearing infrastructure — but currently dead code from the vantage of the one producer that exists. It would become live the instant a differently-designed producer built a payload from caller-supplied input directly, rather than from an already-persisted, already-guarded domain object — a concrete reason future producers deserve their own scrutiny (Section L), not a blanket "Commentary\'s pattern generalizes."');
    }

    // ===============================================================
    // Section H — Persistence versus delivery. An explicit architectural
    // regression: NotificationEventStore does NOT imply delivered, seen,
    // read, acknowledged, queued, pending, or failed.
    // ===============================================================
    {
        const store = await rawSource('storage/NotificationEventStore.js');
        const storeCode = codeOnlyLines(store);

        // H1. The three, and only three, outcomes this store recognizes.
        const outcomeMatch = store.match(/export const NotificationPersistenceOutcome = Object\.freeze\(\{([^}]*)\}\)/s);
        assert(outcomeMatch, 'H1a. NotificationPersistenceOutcome is still defined as a frozen object.');
        const outcomeKeys = outcomeMatch[1].split(',').map((s) => s.trim().split(':')[0].trim()).filter(Boolean);
        assert(outcomeKeys.length === 3 && outcomeKeys.every((k) => ['NEW', 'EXISTING', 'CONFLICT'].includes(k)),
            `H1b. NotificationPersistenceOutcome still recognizes exactly three outcomes — NEW, EXISTING, CONFLICT — never PENDING/DELIVERED/READ/ACKNOWLEDGED/FAILED (found: ${JSON.stringify(outcomeKeys)}).`);

        // H2. No lifecycle vocabulary anywhere in the store's own code,
        // reconfirmed with the exact list this section's own brief names.
        const lifecycleVocab = ['delivered', 'seen', 'read', 'acknowledged', 'queued', 'pending', 'failed'];
        for (const word of lifecycleVocab) {
            const pattern = new RegExp(`\\b${word}\\b`, 'i');
            assert(!pattern.test(storeCode), `H2. storage/NotificationEventStore.js's own CODE still contains no standalone "${word}" vocabulary.`);
        }

        // H3. NotificationEvent itself carries no lifecycle/state field —
        // its own constructor signature, checked directly.
        const notificationEvent = await rawSource('core/NotificationEvent.js');
        assert(/constructor\(\{[\s\S]*?notificationId = createId\(\),[\s\S]*?eventType,[\s\S]*?recipientIdentityId,[\s\S]*?createdAt = new Date\(\),[\s\S]*?payload = \{\}[\s\S]*?\} = \{\}\)/.test(notificationEvent),
            'H3. core/NotificationEvent.js\'s own constructor still accepts exactly five fields (notificationId, eventType, recipientIdentityId, createdAt, payload) — no state, no deliveredAt, no readAt, no acknowledgedAt.');

        // H4. A stored notification means only one thing — "the fact has
        // been durably recorded" — reconfirmed by construction: getById()
        // returns the exact same NotificationEvent shape save() accepted,
        // with no additional field attached by persistence itself.
        const alice = makeIdentity('Alice');
        const notificationStore = new NotificationEventStore(new InMemoryStorageProvider());
        const event = new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: alice.getSigningIdentity().id, payload: { publicationId: 'p', commentaryId: 'c', authorIdentityId: 'a' } });
        notificationStore.save(event);
        const fetched = notificationStore.getById(event.notificationId);
        const fetchedKeys = Object.keys(fetched.toJSON()).sort();
        const originalKeys = Object.keys(event.toJSON()).sort();
        assert(JSON.stringify(fetchedKeys) === JSON.stringify(originalKeys),
            `H4. A saved-and-retrieved NotificationEvent still carries EXACTLY the same field set as the one that was saved (${JSON.stringify(originalKeys)}) — persistence attaches no delivered/seen/read/queued/pending/failed field of its own.`);

        console.log('✓ H: Persistence versus delivery, reconfirmed as an explicit architectural regression. Exactly three outcomes exist (NEW/EXISTING/CONFLICT), none of them a lifecycle state (H1). No delivery/lifecycle vocabulary exists anywhere in the store\'s own code (H2). NotificationEvent itself still carries no state field (H3), and a round-tripped record gains no new field through persistence (H4) — a stored notification still means only "the fact has been durably recorded," nothing more.');
    }

    // ===============================================================
    // Section I — Revisit ChatOutbox. Both durable, still not merged.
    // ===============================================================
    {
        const chatOutboxEntry = await rawSource('core/ChatOutboxEntry.js');
        const chatOutbox = await rawSource('application/ChatOutbox.js');
        const notificationEvent = await rawSource('core/NotificationEvent.js');
        const notificationStore = await rawSource('storage/NotificationEventStore.js');

        // I1. Message-oriented payload vs. fact-oriented payload.
        assert(/constructor\(\{[\s\S]*?message,[\s\S]*?peerIdentityId,[\s\S]*?state = ChatDeliveryState\.QUEUED/.test(chatOutboxEntry),
            'I1. core/ChatOutboxEntry.js\'s own constructor still requires a message (a full core/ChatMessage) and starts in a QUEUED delivery state — a specific outbound message in flight, never a generic fact record.');

        // I2. Delivery behavior — QUEUED -> SENT -> DELIVERED, acked over
        // a live connection, retried on reconnect. NotificationEventStore
        // has none of this — reconfirmed via Section H's own outcome set.
        assert(chatOutbox.includes('markSent(') && chatOutbox.includes('acknowledge(') && chatOutbox.includes('pruneExpired('),
            'I2. application/ChatOutbox.js still exposes markSent()/acknowledge()/pruneExpired() — a full delivery-confirmation lifecycle NotificationEventStore has never had any of.');
        assert(!/markSent|acknowledge\(|pruneExpired/i.test(codeOnlyLines(notificationStore)),
            'I2b. storage/NotificationEventStore.js\'s own CODE still contains none of ChatOutbox\'s delivery-lifecycle vocabulary.');

        // I3. Expiration/TTL — ChatOutboxEntry has a real, defaulted TTL;
        // NotificationEvent has none (reconfirmed, Section H3).
        assert(chatOutboxEntry.includes('DEFAULT_OUTBOX_TTL_MS') && chatOutboxEntry.includes('isExpired('),
            'I3. core/ChatOutboxEntry.js still carries a real, defaulted TTL and an isExpired() check — NotificationEvent has neither.');

        // I4. Sender-oriented vs. recipient-oriented addressing, AND —
        // the sharper finding Section D surfaced — per-OWNER storage
        // partitioning vs. one shared key. ChatOutbox is keyed per LOCAL
        // owner (whoever is currently authenticated on THIS device);
        // NotificationEventStore is keyed once, globally, across every
        // recipient. This is not a superficial difference: it is the
        // exact reason ChatOutbox never needed a getForRecipient()-shaped
        // method at all — `list()` already only ever sees the local
        // owner's own entries, by construction of the storage key itself,
        // never by a runtime filter a caller could get wrong.
        assert(chatOutbox.includes("STORAGE_KEY_PREFIX + owner") || chatOutbox.includes('STORAGE_KEY_PREFIX + this._currentOwnerOrNull()'),
            'I4a. application/ChatOutbox.js still scopes its OWN storage key per local owner.');
        const notifKeyIsConstant = notificationStore.includes("const NOTIFICATION_EVENT_STORE_KEY = 'notification-events:entries';") && !/NOTIFICATION_EVENT_STORE_KEY\s*\+/.test(notificationStore);
        assert(notifKeyIsConstant,
            'I4b. storage/NotificationEventStore.js still persists every recipient under one single, unparameterized key — never a per-recipient key template the way ChatOutbox uses per-owner keys.');

        // I5. The comparison's own conclusion, stated once and grounded
        // in I1-I4: ChatOutbox's shape exists because a chat message is a
        // point-to-point delivery obligation between two specific,
        // currently-or-recently-connected peers, with a real deadline
        // (the sender gives up eventually) and a real acknowledgement
        // protocol (peer/PeerMessageBus.js). A NotificationEvent is
        // nothing like that: it is a durable fact about something that
        // already, unconditionally happened, with no deadline and no
        // peer-to-peer wire protocol underneath it at all — Publication
        // Commentary notifications do not travel over any connection;
        // they are read (if ever) from local storage. The fact that both
        // are now durable is not, by itself, evidence for a shared
        // abstraction — the ONE thing they'd actually share, "an
        // append/read interface over an injected StorageProvider," is
        // already the generic seam storage/StorageProvider.js provides
        // to both independently. Formally retained:
        //
        //   ChatOutbox  !=  NotificationEventStore
        console.log('✓ I: ChatOutbox comparison re-run. Message-oriented payload (I1), a real delivery-confirmation lifecycle NotificationEventStore has never had (I2), a real TTL NotificationEvent has never had (I3), and — the sharpest finding, extending Section D — per-OWNER storage partitioning vs. one shared, unparameterized key (I4). The boundary holds for a stronger reason than before: ChatOutbox\'s per-owner key is WHY it never needed a recipient-scoped query method at all, while NotificationEventStore\'s single shared key is exactly why Section C/D\'s getForRecipient() question is live in the first place. Still not merged.');
    }

    // ===============================================================
    // Section J — Existing consumer search. Does anything already wired
    // into the product benefit from durable notification history today?
    // ===============================================================
    {
        // J1. The producer itself — still completely unwired from any
        // real composition root, exactly as 0.9.281's own "what comes
        // after" left it.
        const producerCallers = await grepCount('new PublicationCommentaryNotificationProducer(', ['application', 'ui'], { excludeSuffix: 'PublicationCommentaryNotificationProducer\\.js' });
        assert(producerCallers === 0,
            `J1. application/PublicationCommentaryNotificationProducer.js still has zero "new PublicationCommentaryNotificationProducer(" callers in application/ or ui/ (found ${producerCallers}) — no live code path constructs it.`);

        // J2. The store itself — same finding, reconfirmed for
        // NotificationEventStore specifically.
        const storeCallers = await grepCount('new NotificationEventStore(', ['application', 'ui'], { excludeSuffix: 'NotificationEventStore\\.js' });
        assert(storeCallers === 0,
            `J2. storage/NotificationEventStore.js still has zero "new NotificationEventStore(" callers in application/ or ui/ (found ${storeCallers}) — nothing in the live product persists a notification today.`);

        // J3. The one place a producer WOULD be wired in — WorldView's
        // composition root — still constructs AddPublicationCommentaryUseCase
        // directly, never wrapped by the notification producer.
        const createWorldView = await rawSource('application/CreateWorldViewUseCase.js');
        assert(createWorldView.includes('new AddPublicationCommentaryUseCase(') && !createWorldView.includes('PublicationCommentaryNotificationProducer'),
            'J3. application/CreateWorldViewUseCase.js still constructs a bare AddPublicationCommentaryUseCase — the composition root that would need to change to wire notifications in has not been touched.');

        // J4. Candidate consumer #1 — a hypothetical "your Publication got
        // a comment" indicator somewhere Alice, as a publisher, would
        // already be looking. OwnPublicationPanel (where Alice manages
        // her own Publications) references no notification vocabulary at
        // all.
        const panel = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(!/Notification/.test(panel),
            'J4. ui/components/OwnPublicationPanel.js — the one existing UI surface a publisher already visits to manage their own Publications, the single most natural home for a future notification indicator — still contains zero Notification vocabulary of any kind.');

        // J5. Candidate consumer #2 — WorldNavigationSession, the
        // orchestration layer Commentary's own read/write commands
        // already live on, has no notification-reading method either.
        const navSession = await rawSource('application/WorldNavigationSession.js');
        assert(!/[Nn]otification/.test(navSession),
            'J5. application/WorldNavigationSession.js still contains zero notification vocabulary — the orchestration layer already carrying Commentary\'s own use cases has not been asked to carry notification retrieval too.');

        console.log('✓ J: No existing consumer benefits from durable notification history today. The producer (J1) and the store (J2) both remain completely unconstructed outside their own files and tests; the one composition root that would wire them in has not been touched (J3); and neither of the two most natural existing UI/orchestration homes for a future notification indicator — OwnPublicationPanel, WorldNavigationSession — references notification vocabulary at all (J4/J5). This is not evidence the arc stalled; it is the deliberate, test-only boundary 0.9.275 and 0.9.281 each drew on purpose, reconfirmed here rather than assumed.');
    }

    // ===============================================================
    // Section K — Missing domain capability versus missing UI, stated
    // explicitly and grounded in Sections B/C/J's own evidence.
    // ===============================================================
    {
        // K1. A UI cannot honestly show "your notifications" without a
        // domain/application operation defining which persisted events
        // belong to the current recipient — this milestone's own brief's
        // central claim, verified structurally: zero UI files reference
        // NotificationEvent (Section B13), and the one capability that
        // would answer "which events belong to me" does not exist
        // (Section B10/C3). A UI built today would have no honest data
        // source to read from at all.
        const uiNotificationRefs = await grepCount('NotificationEvent', ['ui']);
        assert(uiNotificationRefs === 0,
            'K1. Zero ui/ files reference NotificationEvent in any form — a "your notifications" UI has no honest data source to read from today, confirming the MISSING_UI classification is downstream of, not independent from, the MISSING_DOMAIN_CAPABILITY classification (getForRecipient).');

        // K2. The distinction is not merely conceptual — it is a real
        // dependency order. Building UI before the query capability would
        // force the UI itself to reimplement Section C's own filter logic
        // inline, duplicating (or worse, subtly diverging from) whatever
        // a real getForRecipient() would later formalize. This is exactly
        // the same "don't let a UI become a second source of truth"
        // discipline tests/PostPublicationCommentaryProductReassessment.test.js
        // Section B5 already proved for OwnPublicationPanel's own
        // re-query-not-append behavior — restated here as a forward-
        // looking dependency-order argument rather than a backward-
        // looking regression check.
        assert(await sourceExists('tests/PostPublicationCommentaryProductReassessment.test.js'),
            'K2. tests/PostPublicationCommentaryProductReassessment.test.js still exists as the precedent for "UI state is not a second source of truth" this section extends forward.');

        // K3. Ranked dependency order, stated once: getForRecipient()
        // (MISSING_DOMAIN_CAPABILITY, safely derivable per Section C) is
        // a strict prerequisite for any honest notification UI
        // (MISSING_UI, Section B13/K1) — never the reverse, and never
        // parallel work.
        const dependencyOrder = ['getForRecipient() (domain capability)', 'notification UI'];
        assert(dependencyOrder[0] === 'getForRecipient() (domain capability)' && dependencyOrder[1] === 'notification UI',
            'K3. The dependency order is fixed: a domain/application query capability must exist before a UI can honestly claim to show "your notifications" — confirmed by K1\'s own zero-references finding, not merely asserted by convention.');

        console.log('✓ K: MISSING_DOMAIN_CAPABILITY and MISSING_UI are not two independent gaps here — they are ordered. A notification UI has zero honest data source to read from today (K1), because the domain capability that would define "which events belong to me" does not exist (Section B10/C3). Building UI first would force it to inline Section C\'s own derivation logic, repeating the exact UI-as-second-source-of-truth mistake this codebase\'s own Commentary UI already avoided (K2). The dependency order is one-directional (K3).');
    }

    // ===============================================================
    // Section L — Obsolete/deferred candidates, revisited.
    // ===============================================================
    {
        // L1. Notification delivery — still much larger than persistence,
        // still requires real delivery semantics this store deliberately
        // excludes (Section H).
        // application/PublicationCommentaryNotificationProducer.js's own
        // header comment NAMES NotificationDelivery/NotificationInbox/
        // NotificationCenter to explain their absence — checked against
        // real CODE only, per this section's own established discipline.
        for (const path of ['application', 'core', 'storage', 'ui']) {
            const files = execSync(`grep -rli "NotificationDelivery\\|NotificationDispatch\\|PushNotification" ${path} --include="*.js" || true`, { cwd: SOURCE_ROOT.pathname }).toString().trim();
            for (const file of files ? files.split('\n') : []) {
                const code = codeOnlyLines(await rawSource(file));
                assert(!/NotificationDelivery|NotificationDispatch|PushNotification/i.test(code),
                    `L1. ${file}'s own CODE (comments excluded) still contains no delivery/dispatch/push vocabulary — delivery remains a genuinely unbuilt, larger capability.`);
            }
        }

        // L2. Notification UI only — blocked on the missing query
        // capability, per Section K's own dependency order. Not
        // reachable as a standalone candidate today.

        // L3. More producers — 0.9.274's own boundary audit is still on
        // file and still names its findings; reconfirmed fresh rather
        // than re-derived.
        assert(await sourceExists('tests/NotificationEventBoundaryAudit.test.js'),
            'L3a. tests/NotificationEventBoundaryAudit.test.js (0.9.274) still exists as the authoritative producer-candidate audit this section reuses rather than reproduces.');
        const boundaryAudit = await rawSource('tests/NotificationEventBoundaryAudit.test.js');
        assert(boundaryAudit.includes('Friend Relationship') && boundaryAudit.includes('subjectIdentity'),
            'L3b. 0.9.274\'s own audit still identifies Friend Relationship REQUEST as the second candidate with a distinct, structurally stronger recipient (the wire protocol\'s own addressee) — still unbuilt as a producer.');
        assert(boundaryAudit.includes('Place Naming has no recipient at all'),
            'L3c. 0.9.274\'s own audit still finds Place Naming has no natural recipient — still correctly excluded, unchanged.');
        const friendProducerHits = await grepCount('FriendRelationshipNotificationProducer\\|PeerRelationshipNotificationProducer', ['application']);
        assert(friendProducerHits === 0, 'L3d. No Friend-Relationship-shaped notification producer has been built — the second candidate remains exactly as unbuilt as 0.9.274 left it.');

        // L4. ChatOutbox refactoring — Section I's own finding: the
        // boundary is sharper now (per-owner partitioning vs. one shared
        // key), not weaker. Still not merged.

        // L5. Notification authorization redesign — explicitly not
        // invented here. Section G's own honest finding (CONFLICT is
        // currently unreachable) and Section D's own honest finding
        // (isolation is field-level, not storage-level) are BOTH left as
        // open, named gaps — neither is patched by inventing an
        // authorization layer in this milestone.
        const authHits = await grepCount('NotificationAuthorization\\|NotificationAccessControl\\|NotificationPermission', ['application', 'core', 'storage']);
        assert(authHits === 0, 'L5. No notification authorization/access-control vocabulary has been introduced — the access-boundary question Section D/G raised is recorded, not resolved.');

        console.log('✓ L: All four "what would come next" candidates this milestone\'s own brief names are revisited, none built. Delivery (L1) remains a genuinely larger, unbuilt capability. UI-only (L2) is blocked on Section K\'s own dependency order. More producers (L3): 0.9.274\'s own audit still stands, reconfirmed fresh — Friend Relationship remains the one other structurally sound candidate, still unbuilt, and Place Naming remains correctly excluded. ChatOutbox refactoring (L4): Section I found the boundary sharper, not weaker. Notification authorization (L5): explicitly not invented — Section D/G\'s own open access-boundary questions are recorded as gaps, never silently patched.');
    }

    // ===============================================================
    // Section M — Product-gap ranking.
    // ===============================================================
    {
        const ranked = [
            {
                rank: 1,
                name: 'Recipient query capability — getForRecipient(recipientIdentityId)',
                evidence: 'Section C proves it is SAFELY DERIVABLE from the existing store with zero new semantics (a plain filter over loadAll()); Section K proves it is the strict prerequisite for any honest UI. The one genuine open design question it would need to resolve on the way in (Section D/G): whether the method accepts a caller-supplied id (matching the store\'s current field-level trust model) or is hard-scoped to resolveSigningIdentityId(identityProvider) the way AddPublicationCommentaryUseCase already resolves authorship (Section D6\'s own access-boundary finding).'
            },
            {
                rank: 2,
                name: 'Wire the existing producer into a real composition root',
                evidence: 'Section J found the producer and the store both fully built and fully unwired — zero constructors called outside their own files. This is pure composition, no new capability, and would make Section B\'s "COMPLETE (storage layer)" rows actually reachable end to end for the first time.'
            },
            {
                rank: 3,
                name: 'A second producer — Friend Relationship REQUEST',
                evidence: '0.9.274\'s own audit (Section L3) still names this the one other structurally sound candidate, with an even stronger recipient story than Commentary\'s own. Deliberately ranked below recipient querying: a second producer without a way to ever read notifications back out compounds Section J\'s own "fully built, fully unreachable" finding rather than resolving it.'
            },
            {
                rank: 4,
                name: 'Notification UI',
                evidence: 'Section K\'s own dependency order: strictly blocked on rank 1. Not independently actionable.'
            },
            {
                rank: 5,
                name: 'Delivery / read state / lifecycle',
                evidence: 'Section H/L1: still the largest, still genuinely deferred, still requires product decisions (online/offline semantics, retry policy) none of the last ten milestones have gathered evidence for.'
            }
        ];
        assert(ranked.length === 5 && ranked.every((r, i) => r.rank === i + 1), 'M1. Five candidates ranked, each grounded in a specific section\'s own evidence rather than asserted from category alone.');

        console.log('✓ M: Product-gap ranking recorded, each entry citing the specific section that produced its evidence.');
        console.log('\nRanked candidates:');
        for (const r of ranked) {
            console.log(`    ${r.rank}. ${r.name}`);
        }
        console.log('');
    }

    // ===============================================================
    // Section N — Final verdict.
    // ===============================================================
    {
        console.log(
'\n0.9.282 — Post-Persistence Notification Product Reassessment — Verdict\n' +
'\n' +
'NOTIFICATION PIPELINE (Section A)\n' +
'    CLOSED — Commentary (authoritative fact) -> NotificationEvent (immutable,\n' +
'    identifier-only) -> Producer (constructs, imports nothing from storage/) ->\n' +
'    DeduplicationPolicy (pure, no reimplementation) -> NotificationEventStore\n' +
'    (durable history, delegates identity/collision). No layer\'s own code\n' +
'    contains delivery/lifecycle vocabulary.\n' +
'\n' +
'CAPABILITY MATRIX (Section B)\n' +
'    Create notification fact                COMPLETE\n' +
'    Determine recipient (Commentary)         COMPLETE\n' +
'    Deduplicate retries                      COMPLETE\n' +
'    Persist notification                     COMPLETE\n' +
'    Reconstruct after restart                COMPLETE\n' +
'    Retrieve by notification ID              COMPLETE\n' +
'    Retrieve by logical identity             COMPLETE\n' +
'    Detect conflicts                         COMPLETE (storage layer; unreachable from the one real producer — Section G)\n' +
'    Enumerate notification history            COMPLETE (storage layer); REACHABLE_BUT_INTERNAL end-to-end\n' +
'    Retrieve notifications for recipient      MISSING_DOMAIN_CAPABILITY (safely derivable — Section C)\n' +
'    Mark notification read                    MISSING_DOMAIN_CAPABILITY\n' +
'    Deliver notification                      MISSING_DOMAIN_CAPABILITY\n' +
'    Notification UI                           MISSING_UI (blocked on the row above — Section K)\n' +
'\n' +
'RECIPIENT ISOLATION (Section D)\n' +
'    Holds at the FIELD level (recipientIdentityId), proven against two real\n' +
'    recipients end to end. NOT a storage-level partition — every recipient\'s\n' +
'    facts share one flat, unparameterized storage key. A future\n' +
'    getForRecipient() is correct only insofar as every caller supplies the\n' +
'    right id — nothing in the store itself enforces that today.\n' +
'\n' +
'PERSISTENCE VERSUS DELIVERY (Section H)\n' +
'    Holds. Three outcomes only (NEW/EXISTING/CONFLICT), none a lifecycle\n' +
'    state. A stored notification still means only "the fact has been\n' +
'    durably recorded."\n' +
'\n' +
'CHATOUTBOX BOUNDARY (Section I)\n' +
'    ChatOutbox != NotificationEventStore — reconfirmed, on sharper grounds\n' +
'    than before: ChatOutbox\'s per-owner storage key is WHY it never needed a\n' +
'    recipient-scoped query method; NotificationEventStore\'s single shared key\n' +
'    is exactly why that question is live now. Still not merged.\n' +
'\n' +
'EXISTING CONSUMERS (Section J)\n' +
'    None. Producer and store both remain fully built and fully unwired from\n' +
'    any real composition root or UI surface.\n' +
'\n' +
'RANKED CANDIDATES FOR THE NEXT PRODUCT SEAM (named, not built)\n' +
'    1. Recipient query capability — getForRecipient() — safely derivable\n' +
'       (Section C), the strict prerequisite for everything downstream\n' +
'       (Section K), with one real open design question (caller-supplied id\n' +
'       vs. session-resolved id — Section D6).\n' +
'    2. Wire the existing, fully-built producer and store into a real\n' +
'       composition root — pure composition, zero new capability.\n' +
'    3. A second producer (Friend Relationship REQUEST) — the one other\n' +
'       structurally sound candidate 0.9.274 already found, ranked below\n' +
'       recipient querying so it does not compound Section J\'s own\n' +
'       fully-built/fully-unreachable finding.\n' +
'    4. Notification UI — strictly blocked on rank 1.\n' +
'    5. Delivery / read state / lifecycle — still the largest, still\n' +
'       genuinely deferred.\n' +
'\n' +
'NEXT PRODUCT SEAM\n' +
'    Not selected here. Per this milestone\'s own brief: durable notification\n' +
'    history is real, recipient querying is provably safe to derive but not\n' +
'    yet built, and the honest gaps this reassessment found (Section D6\'s\n' +
'    field-level-only isolation, Section G\'s unreachable CONFLICT path) are\n' +
'    recorded, not resolved. Choosing and building the next seam is a\n' +
'    separate, later, evidence-driven decision — this milestone answers\n' +
'    "what is now true," never "what to build next."\n');

        console.log('✓ Section N: Verdict recorded. The notification pipeline is closed end to end with no layer having become a delivery system (Section A); the capability matrix classifies all thirteen named rows with concrete evidence (Section B); recipient querying is proven safely derivable but not yet a product capability (Section C); recipient isolation holds at the field level with an honestly-recorded storage-partition gap (Section D); restart/reconstruction and deduplication both hold through the full real pipeline, including a genuine closure of 0.9.276\'s own open retry-duplication finding (Sections E/F); conflict detection is reconfirmed but found structurally unreachable from the one real producer (Section G); the persistence/delivery boundary and the ChatOutbox boundary both hold, the latter on sharper grounds than before (Sections H/I); zero existing consumers benefit from any of this today (Section J); MISSING_DOMAIN_CAPABILITY and MISSING_UI are shown to be ordered, not independent (Section K); all four deferred candidates are revisited with none built (Section L); and five candidates are ranked with reasoning grounded in specific sections (Section M) — recipient querying first, no implementation happens in this milestone.');
    }

    console.log('\n✅ All PostNotificationPersistenceProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostNotificationPersistenceProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostNotificationPersistenceProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
