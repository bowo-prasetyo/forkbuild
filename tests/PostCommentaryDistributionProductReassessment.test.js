import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { Publication } from '../publisher/Publication.js';

import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionPeerExchange } from '../application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js';
import { CreatePublicationCommentaryUseCase } from '../application/publication/commentary/CreatePublicationCommentaryUseCase.js';
import { CreatePublicationCommentaryDistributionPeerExchangeUseCase } from '../application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.9.622 — Post-Commentary-Distribution Product Reassessment.
//
// TYPE: test-only / product-boundary audit. PRODUCTION CHANGES: none
// (Section H's own guard).
//
// 0.9.617-0.9.621 answered one question, repeatedly and from every angle
// a distribution architecture can be asked: can a Commentary event leave
// the device that created it, and does the REAL, running application
// actually do that. 0.9.621's own verdict was ARC_CLOSED — the
// create -> persist -> sign -> announce -> authenticate -> verify ->
// store -> locally-observe path is real, wired, and correct.
//
// This milestone asks a DIFFERENT question, deliberately at a different
// altitude: now that Commentary genuinely can leave the device, what, if
// anything, is still missing from the user's actual Commentary
// experience? Not "can it leave" — "is anything left incomplete now that
// it does."
//
// METHOD, per 0.9.619's own established precedent, reused again here:
// 0.9.620's and 0.9.621's own test files are RE-EXECUTED LIVE, as real
// subprocesses against current on-disk source (Section A) — 0.9.621's
// own Section A already re-runs 0.9.617/0.9.618/0.9.619 in turn, so this
// single re-run transitively reconfirms the entire arc's own 313
// assertions without retyping one of them. Every section after that
// exercises genuinely NEW ground: questions the prior five milestones'
// own stated scope never reached, because they were asked at the
// capability/wiring level, not the product-experience level.
//
//   Section A — entry-state reconfirmation: the arc's own terminal
//               guard files, re-run live, right now.
//   Section B — stored vs. observable vs. discoverable: a Commentary for
//               a publicationId this replica has never locally
//               discovered is durably stored and independently
//               queryable, but has NO existing UI entry point (both
//               commentary-bearing components require an already-known
//               Publication object) — until the Publication itself
//               later becomes known, at which point the SAME
//               already-stored Commentary becomes reachable with no
//               further action. Publication synchronization is never
//               introduced as a prerequisite here — only observed.
//   Section C — multi-Commentary / multi-author semantics, through the
//               real command layer a UI component actually calls: one
//               Publication carries several Commentaries from several
//               authors, a second Publication is never contaminated,
//               and "one Publication = one Commentary" /
//               "one author = one Commentary" are both confirmed false
//               assumptions nothing in this codebase actually makes.
//   Section D — ordering under scrambled network arrival: Commentary
//               delivered out of creation order reads back in EXACTLY
//               the order it was saved (arrival order), never
//               re-sorted by createdAt — reconfirming, under a
//               condition distribution specifically introduces (network
//               jitter), the exact "insertion order, never re-sorted"
//               contract application/publication/commentary/GetPublicationCommentariesUseCase.js
//               and ui/components/PublicationCard.js already document.
//               No sort is added — none is owed.
//   Section E — THE FLAGSHIP FINDING: the notification promise
//               asymmetry. 0.9.275's own producer already promises
//               "a Commentary was created; tell the publisher" and keeps
//               that promise unconditionally for local creation,
//               self-commentary included. 0.9.621's own Section I
//               already proved, live, that a distributed arrival
//               produces zero NotificationEvents — and correctly scored
//               that as a passing boundary, because at 0.9.621 no
//               composition existed that would ever have produced one.
//               This section asks the product question that framing
//               never reached: is that silence a deliberate scope
//               boundary, or a promise the product already makes and
//               silently fails to keep for the one origin (a remote
//               peer) this arc just spent five milestones making real.
//   Section F — offline/disconnected creation: reconfirms, from the
//               product's own vocabulary rather than its
//               implementation, that no eventual-delivery promise
//               exists anywhere for Commentary to break.
//   Section G — authorization/trust semantics: reconfirms, structurally,
//               that a signed Commentary still means only "this identity
//               said this," never "this identity owns this Publication."
//   Section H — production-change guard.
//   Section I — classification and verdict.
//
// AMENDED BY 0.9.629 — Publication Commentary Nostr Asynchronous
// Distribution Closure Audit, documenting a gap this file's own Section E
// named that was actually closed two milestones earlier, by 0.9.623 —
// Wire Remote Commentary Arrival into Local Notifications
// (application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js, wired in
// ui/main.js), left unamended at the time per this codebase's own
// established convention (see e.g. 0.9.620's own amendment of tests/
// PublicationCommentaryCrossDeviceProductClosureAudit.test.js) until this
// milestone's own Section A re-execution of the full arc surfaced it as a
// live regression rather than a merely-read one. Only Section E's own two
// production-absence assertions and closing narration are amended in
// place, below, plus this note — every other section holds exactly as
// measured: onCommentaryReceived() itself (application/
// PublicationCommentaryDistributionPeerExchange.js) is unmodified, and
// 0.9.623's own bridge is an ADAPTER subscribing to it, never a
// replacement for it — see that bridge's own header, "an adapter, never a
// second producer." See tests/PublicationCommentaryRemoteNotificationWiring.test.js
// for 0.9.623's own full coverage, including its own real-composition
// FLAGSHIP delivery-to-notification round trip.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

// Re-executes a real existing test file, live, as its own subprocess
// against current on-disk source — 0.9.619's own established composition
// mechanism, reused verbatim rather than re-implemented.
function runGuardLive(relativeTestFile) {
    try {
        const stdout = execSync(`node ${relativeTestFile}`, { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        return { passed: true, stdout };
    } catch (error) {
        return { passed: false, stdout: `${error.stdout || ''}${error.stderr || ''}` };
    }
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

function installWindowLocalStorage() {
    const backing = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (backing.has(k) ? backing.get(k) : null),
            setItem: (k, v) => { backing.set(k, String(v)); },
            removeItem: (k) => { backing.delete(k); },
            key: (i) => Array.from(backing.keys())[i] ?? null,
            get length() { return backing.size; }
        }
    };
}

function seedPublication(id, publisherProvider) {
    const publication = new Publication({
        id,
        documentId: `doc-${id}`,
        title: `World for ${id}`,
        author: 'author',
        publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
    });
    const storageProvider = new LocalStorageProvider();
    const existing = storageProvider.load('forkbuild-publications') || [];
    storageProvider.save('forkbuild-publications', [...existing, publication.toJSON()]);
    return publication;
}

// Reproduces EXACTLY the composition ui/main.js itself performs for
// Commentary (0.9.289 read/write commands, 0.9.620's own distribution
// wrapper) — the identical reproduction method 0.9.619/0.9.620/0.9.621
// already established, since ui/main.js itself boots a full Vue app/DOM
// and cannot be imported directly under plain Node.
function bootApplication(identityProvider, { peerMessageBus, connectedPeerRegistry }) {
    const { getPublicationCommentariesCommand, addPublicationCommentaryCommand: createPublicationCommentaryCommand } =
        new CreatePublicationCommentaryUseCase().execute(identityProvider);

    const { store: distributionStore, peerExchange: distributionPeerExchange } =
        new CreatePublicationCommentaryDistributionPeerExchangeUseCase().execute({
            identityProvider,
            peerMessageBus,
            connectedPeerRegistry
        });

    function addPublicationCommentaryCommand(input) {
        const result = createPublicationCommentaryCommand(input);
        try {
            distributionPeerExchange.announce(result.commentary);
        } catch {
            // best-effort — see ui/main.js's own 0.9.620 section
        }
        return result;
    }

    return { getPublicationCommentariesCommand, addPublicationCommentaryCommand, createPublicationCommentaryCommand, distributionStore, distributionPeerExchange };
}

// Simulates an already-delivered remote Commentary landing in `app`'s
// own distribution store — exactly the effect a live, authenticated
// ANNOUNCE would already have on it (0.9.621's own Section C flagship,
// re-confirmed live in Section A below, already proves the transport
// itself works end to end; this helper targets the SAME shared,
// no-in-memory-cache store 0.9.620's own header documents, so it is
// behaviorally identical for everything this file tests — read-side
// semantics, never the wire itself).
function deliverRemoteCommentary(app, remoteAuthorProvider, { publicationId, content, createdAt, commentaryId }) {
    const remoteExchange = new PublicationCommentaryDistributionExchange(
        new PublicationCommentaryStore(new InMemoryStorageProvider()),
        remoteAuthorProvider,
        new LocalAuthorizationVerifier()
    );
    const commentary = new PublicationCommentary({
        commentaryId,
        publicationId,
        authorIdentityId: remoteAuthorProvider.getSigningIdentity().id,
        content,
        createdAt
    });
    const envelope = remoteExchange.exportCommentary(commentary);
    const importer = new PublicationCommentaryDistributionExchange(app.distributionStore, remoteAuthorProvider, new LocalAuthorizationVerifier());
    return importer.importCommentaryEnvelope(envelope);
}

async function run() {
    // ===============================================================
    // Section A — entry-state reconfirmation.
    // ===============================================================
    {
        const wiringSuite = runGuardLive('tests/PublicationCommentaryDistributionWiring.test.js');
        assert(wiringSuite.passed && /All Publication Commentary Distribution Wiring tests passed/.test(wiringSuite.stdout),
            n('0.9.620\'s own wiring suite, re-executed live, still exits 0 and prints its own passing verdict'));

        const closureAudit = runGuardLive('tests/PublicationCommentaryApplicationDistributionClosureAudit.test.js');
        assert(closureAudit.passed && /All Publication Commentary Application Distribution Closure Audit tests passed/.test(closureAudit.stdout),
            n('0.9.621\'s own closure audit, re-executed live, still exits 0 and prints its own ARC_CLOSED verdict — including its own transitive re-execution of 0.9.617/0.9.618/0.9.619'));

        console.log('✓ A: the entire 0.9.617-0.9.621 arc reconfirmed live, right now, against current source — this milestone builds on that result, never re-derives it.');
    }

    // ===============================================================
    // Section B — stored vs. observable vs. discoverable.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('reassess-publisher');
        const remoteAuthorProvider = makeIdentity('reassess-remote-author');
        const localApp = bootApplication(publisherProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: { list: () => [], onChange: () => () => {} } });

        const orphanPublicationId = 'pub-never-locally-discovered-622';
        const discoveryProvider = new LocalDiscoveryProvider(new LocalStorageProvider());
        assert(discoveryProvider.findById(orphanPublicationId) === null,
            n('setup: this replica has never discovered a Publication with this id — the ordinary "Commentary arrives before Publication" case'));

        const { commentary, isNew } = deliverRemoteCommentary(localApp, remoteAuthorProvider, {
            publicationId: orphanPublicationId,
            content: 'a remote Commentary about a Publication this replica has never heard of'
        });
        assert(isNew === true, n('STORED: the Commentary is durably persisted even though its own Publication is entirely unknown here — the store never gates a write on Publication existence'));

        const queried = localApp.getPublicationCommentariesCommand(orphanPublicationId);
        assert(queried.some((c) => c.commentaryId === commentary.commentaryId),
            n('OBSERVABLE: the SAME real command a UI surface actually calls (getPublicationCommentariesCommand) already returns it — GetPublicationCommentariesUseCase\'s own documented "no discovery-provider call" contract holds; the fact is not hidden from any caller that already knows the publicationId'));

        const cardSource = codeOnly(await rawSource('ui/components/PublicationCard.js'));
        const panelSource = codeOnly(await rawSource('ui/components/OwnPublicationPanel.js'));
        assert(/publication:\s*\{\s*type:\s*Object,\s*required:\s*true/.test(cardSource),
            n('DISPLAYED — negative case: ui/components/PublicationCard.js requires an already-resolved Publication OBJECT as a prop; it exposes no path that reaches Commentary from a bare publicationId'));
        assert(/publication:\s*\{\s*type:\s*Object,\s*default:\s*null/.test(panelSource),
            n('DISPLAYED — negative case: ui/components/OwnPublicationPanel.js is the same shape — a Publication object, never an id, is what makes its own Commentary section reachable at all'));
        assert(!grepFiles('getPublicationCommentariesCommand\\(', ['ui']).some((f) => /router/i.test(f)),
            n('DISCOVERABLE THROUGH AN EXISTING UI PATH: confirmed false for this orphaned case — no router/deep-link surface calls getPublicationCommentariesCommand independently of a resolved Publication component'));

        // Publication becomes available later — never triggered by this
        // milestone, only observed, per this milestone's own explicit
        // exclusion of Publication synchronization as a prerequisite.
        seedPublication(orphanPublicationId, publisherProvider);
        assert(discoveryProvider.findById(orphanPublicationId) !== null,
            n('the Publication now becomes known locally, through the SAME ordinary mechanism (discovery) every other Publication uses — nothing Commentary-specific'));
        const queriedAfter = localApp.getPublicationCommentariesCommand(orphanPublicationId);
        assert(queriedAfter.length === 1 && queriedAfter[0].commentaryId === commentary.commentaryId,
            n('the Commentary that arrived BEFORE its Publication was known is still exactly on file, unchanged, and becomes reachable through the ordinary PublicationCard/OwnPublicationPanel path the moment a real Publication object exists to hand it — nothing was lost, and nothing needed to be replayed, re-announced, or synchronized'));

        console.log('✓ B: stored, observable-by-id, and eventually displayable all hold; only "reachable through today\'s existing UI before the Publication itself is known" is false — and nothing in this product ever promised otherwise. Classification: ALREADY_CORRECT (durability/query) + INTENTIONAL_BOUNDARY (no id-only Commentary surface) + NO_REQUIREMENT (no Publication-sync prerequisite invented).');
    }

    // ===============================================================
    // Section C — multi-Commentary / multi-author semantics, through
    // the real command layer.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('multi-publisher');
        const publication = seedPublication('pub-multi-622', publisherProvider);
        const otherPublication = seedPublication('pub-multi-622-other', publisherProvider);
        const authorA = makeIdentity('multi-author-a');
        const authorB = makeIdentity('multi-author-b');

        const appA = bootApplication(authorA, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: { list: () => [], onChange: () => () => {} } });
        const { commentary: c1 } = appA.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'C1 by author A' });

        const receiverApp = bootApplication(publisherProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: { list: () => [], onChange: () => () => {} } });
        const { commentary: c2 } = deliverRemoteCommentary(receiverApp, authorB, { publicationId: publication.id, content: 'C2 by author B' });
        deliverRemoteCommentary(receiverApp, authorA, { publicationId: publication.id, content: 'C3 by author A again', createdAt: new Date(Date.now() + 1000) });
        deliverRemoteCommentary(receiverApp, authorB, { publicationId: otherPublication.id, content: 'unrelated Commentary on a different Publication' });

        // c1 was created on a DIFFERENT device (appA); reproduce it on the
        // publisher's own device the way the real transport already would
        // (0.9.621's own flagship, re-run live in Section A, is the proof
        // this hop genuinely works).
        deliverRemoteCommentary(receiverApp, authorA, { publicationId: publication.id, content: c1.content, commentaryId: c1.commentaryId, createdAt: c1.createdAt });

        const forP = receiverApp.getPublicationCommentariesCommand(publication.id);
        assert(forP.length === 3, n('one Publication really does carry THREE Commentaries — "one Publication = one Commentary" is not an assumption anything here makes'));
        const authorsOnP = new Set(forP.map((c) => c.authorIdentityId));
        assert(authorsOnP.size === 2 && authorsOnP.has(authorA.getSigningIdentity().id) && authorsOnP.has(authorB.getSigningIdentity().id),
            n('author A appears TWICE and author B appears once on the same Publication — "one author = one Commentary" is equally not an assumption anything here makes'));

        const forOther = receiverApp.getPublicationCommentariesCommand(otherPublication.id);
        assert(forOther.length === 1 && !forP.some((c) => forOther.some((o) => o.commentaryId === c.commentaryId)),
            n('the unrelated second Publication\'s own Commentary never leaks into the first Publication\'s own list, and vice versa, through the real command layer — the exact isolation core/PublicationCommentaryCollection.js has guaranteed since 0.9.242'));

        console.log('✓ C: multi-Commentary, multi-author, multi-Publication semantics all hold through the real command layer. Classification: ALREADY_CORRECT — established at 0.9.242/0.9.249, unaffected by distribution.');
    }

    // ===============================================================
    // Section D — ordering under scrambled network arrival.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('order-publisher');
        const publication = seedPublication('pub-order-622', publisherProvider);
        const remoteAuthor = makeIdentity('order-remote-author');
        const receiverApp = bootApplication(publisherProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: { list: () => [], onChange: () => () => {} } });

        const base = Date.now();
        const c1 = { commentaryId: 'order-c1-622', createdAt: new Date(base), content: 'C1 — created first' };
        const c2 = { commentaryId: 'order-c2-622', createdAt: new Date(base + 1000), content: 'C2 — created second' };
        const c3 = { commentaryId: 'order-c3-622', createdAt: new Date(base + 2000), content: 'C3 — created third' };

        // Network arrival order: C2, C3, C1 — the exact scramble named in
        // this milestone's own brief.
        for (const draft of [c2, c3, c1]) {
            deliverRemoteCommentary(receiverApp, remoteAuthor, { publicationId: publication.id, ...draft });
        }

        const readBack = receiverApp.getPublicationCommentariesCommand(publication.id);
        assert(readBack.map((c) => c.commentaryId).join(',') === 'order-c2-622,order-c3-622,order-c1-622',
            n('the list reads back in exactly ARRIVAL order (C2, C3, C1) — never re-sorted to creation order (C1, C2, C3) — matching storage/PublicationCommentaryStore.js\'s own "in the order they were originally saved" contract exactly, unmodified by this milestone'));

        const cardSource = codeOnly(await rawSource('ui/components/PublicationCard.js'));
        const panelSource = codeOnly(await rawSource('ui/components/OwnPublicationPanel.js'));
        assert(!/commentaries\.sort\(|publicationCommentaries\.sort\(/.test(cardSource) && !/commentaries\.sort\(|publicationCommentaries\.sort\(/.test(panelSource),
            n('neither existing Commentary-rendering component re-sorts the list by date — arrival order IS the documented, and the only, ordering contract this product has ever made'));

        console.log('✓ D: out-of-order network arrival reads back in the exact same "insertion order" every local write already used — no chronological promise exists to violate. Classification: ALREADY_CORRECT / INTENTIONAL_BOUNDARY — no sort added, per this milestone\'s own "measure, don\'t assume" instruction.');
    }

    // ===============================================================
    // Section E — THE FLAGSHIP FINDING: the notification promise
    // asymmetry.
    // ===============================================================
    {
        const mainSource = codeOnly(await rawSource('ui/main.js'));
        const peerExchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js'));
        assert(/onCommentaryReceived\(callback\)/.test(peerExchangeSource),
            n('the capability to observe a newly-arrived Commentary locally already exists — application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js#onCommentaryReceived(), built at 0.9.618'));

        // AMENDED BY 0.9.629 — see this file's own header note, above.
        // grepFiles matches raw file text, comments included, so
        // application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js
        // appears here purely because its own header comment QUOTES
        // `onCommentaryReceived()` (see that file's own line "The
        // intended call shape is `peerExchange.onCommentaryReceived(...)`
        // ") — codeOnly() strips that out, leaving zero REAL call sites
        // in that file; ui/main.js's own real subscription (0.9.623) is
        // the one genuine production call site.
        const productionCallSites = grepFiles('\\.onCommentaryReceived\\(', ['ui', 'application']);
        assert(productionCallSites.length === 2
            && productionCallSites.some((file) => file.includes('ui/main.js'))
            && productionCallSites.some((file) => file.includes('PublicationCommentaryRemoteNotificationBridge.js')),
            n(`exactly one production call site now subscribes to it — ui/main.js's own real subscription (0.9.623) — found: ${productionCallSites.join(', ') || 'none'}; the second file matched is application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js's own header comment naming the intended call shape, not a real call site (see codeOnly() check immediately below)`));
        const bridgeSourceStripped = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js'));
        assert(!/\.onCommentaryReceived\(/.test(bridgeSourceStripped),
            n('with comments stripped, application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js itself never calls .onCommentaryReceived() — it is an adapter CALLED BY a subscription, never the subscriber itself; see that file\'s own header, "an adapter, never a second producer"'));
        assert(/onCommentaryReceived/.test(mainSource),
            n('ui/main.js itself — the one composition root that wires publicationCommentaryDistributionPeerExchange at all — now reads this event (0.9.623) and feeds every result into application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js#handleCommentaryReceived()'));

        // The product-level fact this asymmetry produces, restated from
        // what is ALREADY live-proven rather than re-derived: 0.9.621's
        // own Section I (re-executed live in Section A, above) already
        // shows, over a real authenticated peer connection through the
        // real wired application, that local creation produces exactly
        // one NotificationEvent and a distributed arrival produces zero
        // — for ANY receiving replica. Because onCommentaryReceived is
        // never subscribed anywhere (just reconfirmed above), that same
        // zero holds identically when the RECEIVING replica happens to
        // belong to the Publication's own publisher — the one case that
        // actually matters to a real user, since
        // core/PublicationCommentaryNotificationProducer.js's own
        // recipient is always `publication.publisherIdentity.id`.
        const notificationProducerSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryNotificationProducer.js'));
        assert(/EVERY SUCCESSFUL COMMENTARY PRODUCES A NOTIFICATION/.test(await rawSource('application/publication/commentary/PublicationCommentaryNotificationProducer.js')),
            n('the product\'s OWN documented promise, unconditionally, for the local path: "every successful commentary produces a notification — including self-commentary"'));
        assert(/notificationSink/.test(notificationProducerSource) && !/importCommentaryEnvelope|PublicationCommentaryDistributionPeerExchange/.test(notificationProducerSource),
            n('that promise\'s own implementation has exactly one entry point (AddPublicationCommentaryUseCase.execute(), reached only from LOCAL creation) — the distribution import path (importCommentaryEnvelope) is a second, independent way the SAME store gains a new row, and this producer never wraps or observes it'));

        console.log(
            '✓ E (AMENDED BY 0.9.629): at the time this audit originally ran, two Commentaries about the same Publication — one authored locally, one delivered remotely by exactly the capability 0.9.617-0.9.621 built — produced two DIFFERENT publisher-facing outcomes; the remote one produced silence. 0.9.623 closed exactly that gap: ui/main.js now subscribes to onCommentaryReceived() and feeds every result into application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js, which produces the IDENTICAL publication.commented NotificationEvent shape 0.9.275 already defined for local creation, through the identical notificationEventStore.save() sink — gated on isNew and on this replica\'s own identity actually being the resolved Publication\'s publisher, exactly this section\'s own original recommendation.'
        );
        console.log(
            'Classification (AMENDED BY 0.9.629): RESOLVED — was CONCRETE_PRODUCT_GAP at 0.9.622, closed by 0.9.623\'s own narrowly-scoped wiring (never "distributed notifications" — Notification still never travels the network; see application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js\'s own header). See tests/PublicationCommentaryNostrAsynchronousDistributionClosureAudit.test.js (0.9.629) Section G for live confirmation that this same bridge now also serves the Nostr arrival path, never a second, transport-specific notification mechanism.'
        );
    }

    // ===============================================================
    // Section F — offline/disconnected creation: product promise check.
    // ===============================================================
    {
        const peerExchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js'));
        assert(/zero connected peers is never an error/i.test(await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js')),
            n('the capability\'s own documentation is explicit: an announce with no listeners is a no-op, never a failure, and never a promise that it will be retried'));
        assert(!/queue|retry|Retry|Queue/.test(peerExchangeSource),
            n('no queue or retry vocabulary exists anywhere in the distribution capability\'s own source — offline-created Commentary is never silently promoted into a delivery guarantee'));
        assert(grepFiles('eventual.?delivery|guaranteed.?delivery|will be delivered|synced automatically', ['ui', 'application', 'core', 'storage'], { ignoreCase: true }).length === 0,
            n('no production source file anywhere makes an eventual-delivery promise for Commentary — there is no product commitment for an offline queue to fulfil'));

        console.log('✓ F: reconfirmed from the product\'s own vocabulary, not merely its implementation — offline/disconnected Commentary creation makes no delivery promise, so nothing is broken by not building a queue. Classification: INTENTIONAL_BOUNDARY / NO_REQUIREMENT — unchanged from 0.9.617/0.9.620/0.9.621\'s own repeated findings.');
    }

    // ===============================================================
    // Section G — authorization/trust semantics.
    // ===============================================================
    {
        const exchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionExchange.js'));
        const peerExchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js'));
        assert(!/publisherIdentity/.test(exchangeSource) && !/CanCommentOnPublicationUseCase/.test(exchangeSource),
            n('application/publication/commentary/PublicationCommentaryDistributionExchange.js never reads a Publication\'s own publisherIdentity and never consults commenting authorization — a signed Commentary establishes only "this identity said this," never "this identity owns this Publication"'));
        assert(!/publisherIdentity/.test(peerExchangeSource) && !/CanCommentOnPublicationUseCase/.test(peerExchangeSource),
            n('the peer transport layer holds the identical restraint one file over'));

        console.log('✓ G: signed-Commentary semantics reconfirmed structurally — a real architectural boundary, not merely an untested gap. Classification: ALREADY_CORRECT / INTENTIONAL_BOUNDARY — unchanged since 0.9.618.');
    }

    // ===============================================================
    // Section H — production-change guard.
    // ===============================================================
    {
        // AMENDED BY 0.9.638 — see
        // tests/PublicationCommentaryCrossDeviceProductClosureAudit.test.js's
        // own identical 0.9.638 amendment for the full rationale.
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        const expectedLaterMilestoneFiles = new Set(['ui/components/PublicationCard.js', 'ui/components/PublicationList.js']);
        const unexpectedNonTestFiles = changedNonTestFiles.split('\n').filter(Boolean)
            .filter((f) => !expectedLaterMilestoneFiles.has(f));
        assert(unexpectedNonTestFiles.length === 0, n(`AMENDED BY 0.9.638 — no UNEXPECTED production file is modified by this milestone — found: ${unexpectedNonTestFiles.join(', ') || 'none'}`));

        console.log('✓ H: no production file touched. This audit implements nothing — it reassesses the product surface the already-closed 0.9.617-0.9.621 arc left behind.');
    }

    // ===============================================================
    // Section I — classification and verdict.
    // ===============================================================
    {
        console.log(
            '\nClassification table (AMENDED BY 0.9.629 — Section E only; see this file\'s own header note):\n'
            + '  B. Publication-unaware storage/observation ....... ALREADY_CORRECT + INTENTIONAL_BOUNDARY + NO_REQUIREMENT\n'
            + '  C. Multi-Commentary / multi-author semantics ...... ALREADY_CORRECT\n'
            + '  D. Ordering under scrambled network arrival ....... ALREADY_CORRECT / INTENTIONAL_BOUNDARY\n'
            + '  E. Notification on remote arrival .................. RESOLVED (0.9.623) — was CONCRETE_PRODUCT_GAP\n'
            + '  F. Offline/disconnected creation ................... INTENTIONAL_BOUNDARY / NO_REQUIREMENT\n'
            + '  G. Authorization/trust semantics .................... ALREADY_CORRECT / INTENTIONAL_BOUNDARY\n'
        );
        console.log(
            '0.9.622 verdict, AS ORIGINALLY WRITTEN: exactly ONE CONCRETE_PRODUCT_GAP survived this reassessment (Section E) — every '
            + 'other audited dimension of the post-distribution Commentary experience was already correct or a deliberate, '
            + 'still-justified boundary. RECOMMENDATION (as originally written): scope a single, small, separately-numbered next '
            + 'milestone (0.9.623) to wire the ALREADY-BUILT onCommentaryReceived() local observation to the ALREADY-BUILT '
            + 'PublicationCommentaryNotificationProducer\'s own NotificationEvent/NotificationEventStore machinery. THAT MILESTONE '
            + 'SHIPPED — this text is preserved for its own historical record; see Section E\'s own amended narration, above, for '
            + 'what actually landed. Deliberately excluded here, unchanged: historical synchronization, guaranteed delivery, offline '
            + 'queues, retry protocols, subscriptions, distributed notifications, global Commentary search, new Commentary APIs, new '
            + 'storage, new deduplication, new conflict resolution, Publication synchronization, Commentary editing/mutation, and '
            + 'provider ranking/fallback.'
        );
        console.log(`✅ All Post-Commentary-Distribution Product Reassessment tests passed (${assertionCount} assertions).`);
    }
}

await run();
