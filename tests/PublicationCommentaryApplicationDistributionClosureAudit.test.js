import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { Publication } from '../publisher/Publication.js';

import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionPeerExchange } from '../application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js';
import { CreatePublicationCommentaryUseCase } from '../application/publication/commentary/CreatePublicationCommentaryUseCase.js';
import { CreatePublicationCommentaryDistributionPeerExchangeUseCase } from '../application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js';

import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.9.621 — Publication Commentary Application Distribution Closure Audit.
//
// TYPE: test-only closure audit. PRODUCTION CHANGES: none (Section M's
// own guard).
//
// 0.9.617 measured that Commentary could not cross a device boundary by
// any path. 0.9.618 built the distribution capability and proved it,
// directly composed, over a real authenticated peer connection. 0.9.619
// asked a different, higher-altitude question — is the capability
// reachable from the real, running application — and found it was not
// (PRODUCTION_WIRING_GAP). 0.9.620 closed exactly that gap: a new
// composition root (application/CreatePublicationCommentaryDistribution
// PeerExchangeUseCase.js) and a single ui/main.js wrapper around the
// existing addPublicationCommentaryCommand, announcing after local
// creation succeeds.
//
// THIS MILESTONE DOES NOT RE-DISCOVER ANY OF THAT ARCHITECTURE. Its one
// job is to answer, one more time and specifically about the WIRED
// application: does creating a Commentary through the real, running
// composition genuinely reach a peer, end to end, with every boundary
// this arc has ever promised still holding — and is that now the final
// word on this arc, or does it surface a concrete, narrow gap.
//
// METHOD, per 0.9.619's own established precedent: 0.9.617/0.9.618/
// 0.9.619/0.9.620's own test files are RE-EXECUTED LIVE, as real
// subprocesses against current on-disk source (Section A), rather than
// re-typing their combined 177 assertions. Every section after that
// either (a) exercises the real, wired application composition live —
// never a directly-instantiated exchange standing in for it — or (b)
// inspects ui/main.js's own source to confirm the composition-root
// shape 0.9.620 built is still exactly what a real caller uses.
//
//   Section A — entry-state reconfirmation: all four prior milestones'
//               own guard files, re-run live, right now.
//   Section B — composition-root census: exactly one construction site,
//               riding the app-wide peerMessageBus/registry/identity,
//               no second peer bus/registry, no second Commentary
//               persistence authority.
//   Section C — THE FLAGSHIP: Application A creates a Commentary through
//               the real, reproduced ui/main.js composition; it is
//               locally persisted, announced, delivered over a real
//               authenticated peer connection to Application B,
//               signature-verified, stored, and locally observed there.
//   Section D — cross-device identity continuity: every field arrives
//               unchanged, and the two devices keep independent stores
//               (same persisted identity, never shared storage).
//   Section E — local-first ordering: persistence has already happened
//               by the moment announce() is invoked; creation is never
//               gated on distribution succeeding.
//   Section F — graceful degradation: zero peers, a peer that
//               disconnects before announce, and a thrown transport
//               fault all leave local creation and storage intact.
//   Section G — signature boundary, through the real wired path:
//               tampering and a forged signer are both rejected on
//               arrival.
//   Section H — idempotent repeated delivery, over the real transport,
//               handled entirely by the existing store, never a new
//               distribution-specific mechanism.
//   Section I — notification locality: local creation notifies once;
//               the distributed arrival on the receiver notifies never.
//   Section J — authorization separation: the wired path never imports
//               or consults Publication ownership/authorship/existence.
//   Section K — announce-only boundary: no request/response, history,
//               subscription, or backfill vocabulary exists anywhere in
//               the wired path.
//   Section L — existing single-device regression, with no peer
//               infrastructure reachable at all.
//   Section M — production-change guard.
//   Section N — classification and verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
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
// against current on-disk source —0.9.619's own established composition
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

// An independent receiving replica — the same test-double shape
// 0.9.618/0.9.619/0.9.620 already use for "the other device." Receiving
// behavior is entirely 0.9.618's own unmodified
// PublicationCommentaryDistributionExchange/PeerExchange — this audit
// never reimplements it.
function makeDevice(identityProvider) {
    const storage = new InMemoryStorageProvider();
    const store = new PublicationCommentaryStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationCommentaryDistributionExchange(store, identityProvider, verifier);
    return { storage, store, verifier, exchange };
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
    new LocalStorageProvider().save('forkbuild-publications', [publication.toJSON()]);
    return publication;
}

// Reproduces EXACTLY the composition ui/main.js itself performs, per
// that file's own 0.9.620 section (imports, constructs, wraps) — the
// identical reproduction method 0.9.619's own Section C and 0.9.620's
// own composeRealAppSide() already established for a real caller's own
// composition roots, since ui/main.js itself boots a full Vue app/DOM
// and cannot be imported directly under plain Node. This is "Application
// A" throughout this file, never a directly-instantiated exchange
// standing in for it.
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

async function run() {
    // ===============================================================
    // Section A — entry-state reconfirmation.
    // ===============================================================
    {
        const boundaryAudit = runGuardLive('tests/PublicationCommentaryDistributionBoundaryAudit.test.js');
        assert(boundaryAudit.passed && /All Publication Commentary Distribution Boundary Audit tests passed/.test(boundaryAudit.stdout),
            n('0.9.617\'s own boundary audit, re-executed live against current source, still exits 0 and prints its own passing verdict'));

        const distributionSuite = runGuardLive('tests/PublicationCommentaryDistribution.test.js');
        assert(distributionSuite.passed && /All Publication Commentary Distribution tests passed/.test(distributionSuite.stdout),
            n('0.9.618\'s own envelope/flagship suite, re-executed live, still exits 0 and prints its own passing verdict'));

        const crossDeviceAudit = runGuardLive('tests/PublicationCommentaryCrossDeviceProductClosureAudit.test.js');
        assert(crossDeviceAudit.passed && /All Publication Commentary Cross-Device Product Closure Audit tests passed/.test(crossDeviceAudit.stdout),
            n('0.9.619\'s own cross-device closure audit, re-executed live, still exits 0 and prints its own passing verdict — including its own re-execution of 0.9.617/0.9.618'));

        const wiringSuite = runGuardLive('tests/PublicationCommentaryDistributionWiring.test.js');
        assert(wiringSuite.passed && /All Publication Commentary Distribution Wiring tests passed/.test(wiringSuite.stdout),
            n('0.9.620\'s own wiring suite, re-executed live, still exits 0 and prints its own passing verdict — the wiring this audit reconfirms is not assumed, it is running, right now, against current source'));

        console.log('✓ A: all four prior milestones\' own guard files re-confirmed live, right now, against current source — composition, not re-derivation.');
    }

    // ===============================================================
    // Section B — composition-root census.
    // ===============================================================
    {
        const mainSource = codeOnly(await rawSource('ui/main.js'));

        const busConstructions = (mainSource.match(/new PeerMessageBus\(\)/g) || []).length;
        assert(busConstructions === 1,
            n(`ui/main.js constructs exactly one app-wide PeerMessageBus — found ${busConstructions}; Commentary distribution must ride it, never own a second one`));

        const sessionManagerConstructions = (mainSource.match(/new PeerSessionManager\(/g) || []).length;
        assert(sessionManagerConstructions === 1,
            n(`ui/main.js constructs exactly one app-wide PeerSessionManager — found ${sessionManagerConstructions}; Commentary distribution must ride its own .registry, never own a second one`));

        const commentaryPeerExchangeConstructions = grepFiles('new CreatePublicationCommentaryDistributionPeerExchangeUseCase\\(', ['ui', 'application']);
        assert(commentaryPeerExchangeConstructions.length === 1 && commentaryPeerExchangeConstructions[0].includes('ui/main.js'),
            n(`exactly one production construction site for the Commentary distribution composition root exists, in ui/main.js — found: ${commentaryPeerExchangeConstructions.join(', ') || 'none'}`));

        assert(/new CreatePublicationCommentaryDistributionPeerExchangeUseCase\(\)\.execute\(\{\s*\n\s*identityProvider,\s*\n\s*peerMessageBus,\s*\n\s*connectedPeerRegistry: peerSessionManager\.registry\s*\n\s*\}\)/.test(mainSource),
            n('that one construction site is fed the SAME app-wide identityProvider/peerMessageBus/peerSessionManager.registry every sibling capability rides — never a distinct instance of any of the three'));

        const useCaseSource = codeOnly(await rawSource('application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js'));
        assert(/new PublicationCommentaryStore\(/.test(useCaseSource) && !/new LocalStorageProvider\(\)\.load|Map\(\)/.test(useCaseSource),
            n('the composition root constructs exactly the existing storage/PublicationCommentaryStore.js — no in-memory cache, no second persistence class, of its own'));
        assert(!/LocalPublicationCommentaryStore|DistributedPublicationCommentaryStore|CommentaryReplicationStore|CommentaryNetworkStore/.test(useCaseSource),
            n('no second, Commentary-specific persistence authority is introduced anywhere in the composition root\'s own source'));

        assert(grepFiles('class PublicationCommentaryStore', ['storage']).length === 1,
            n('exactly one PublicationCommentaryStore class exists on disk — the distribution peer exchange and local creation share ONE persistence authority (same durable window.localStorage keys, via independently-constructed adapter instances), never a second source of truth; see Section F below for this proven behaviorally, not merely by class count'));

        console.log('✓ B: composition-root census — one construction site, riding the one app-wide peer bus/registry/identity, no second Commentary persistence authority.');
    }

    // ===============================================================
    // Section C — THE FLAGSHIP: Application A creates a Commentary
    // through the real, wired composition; it is locally persisted,
    // announced, delivered over a real authenticated peer connection to
    // Application B, signature-verified, stored, and locally observed.
    // ===============================================================
    let deviceA, deviceBStore, deviceBStorage, flagshipCommentary, flagshipPublication;
    {
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('closure-publisher');
        const publication = seedPublication('pub-closure-621', publisherProvider);
        flagshipPublication = publication;

        const authorProvider = makeIdentity('closure-author-a');
        const bIdentity = makeIdentity('closure-device-b');

        const network = new LocalPeerNetwork();
        const aTransport = new LocalPeerConnectionProvider('app-a-621', network);
        const bTransport = new LocalPeerConnectionProvider('app-b-621', network);
        const aConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aTransport, identityProvider: authorProvider });
        const stopAListening = aConnect.listen();
        const bConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bTransport, identityProvider: bIdentity });
        const stopBListening = bConnect.listen();
        const bToA = bConnect.connect({ candidateEndpoint: 'app-a-621' });
        await wait(20);
        assert(bToA.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: Application B authenticates to Application A over a real, live transport'));

        // APPLICATION A — the real, wired composition, exactly as
        // ui/main.js constructs it, riding the real aConnect.registry
        // standing in for peerSessionManager.registry.
        const appA = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aConnect.registry });
        deviceA = appA;

        // APPLICATION B — an independent replica, never a second binding
        // onto Application A's own store.
        const { storage: bStorage, store: bStore, exchange: bExchange } = makeDevice(bIdentity);
        deviceBStore = bStore;
        deviceBStorage = bStorage;
        const bPeerExchange = new PublicationCommentaryDistributionPeerExchange(bExchange, new PeerMessageBus(), bConnect.registry);
        const observedOnB = [];
        bPeerExchange.onCommentaryReceived((result) => observedOnB.push(result));

        const { commentary, isNew } = appA.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'flagship: created on Application A, observed on Application B' });
        flagshipCommentary = commentary;
        assert(commentary instanceof PublicationCommentary && isNew === true, n('Application A really did create a genuine, newly-persisted PublicationCommentary'));
        assert(appA.distributionStore.getById(commentary.commentaryId) !== null, n('local persistence on Application A happened — readable back through its own store immediately'));

        await wait(30);

        const onB = bStore.getById(commentary.commentaryId);
        assert(onB !== null, n('THE FLAGSHIP: a Commentary created through the real, running, wired application composition arrives, unprompted, on an independent Application B — over a real, authenticated peer connection, end to end'));
        assert(onB.commentaryId === commentary.commentaryId && onB.publicationId === commentary.publicationId
            && onB.authorIdentityId === commentary.authorIdentityId && onB.content === commentary.content,
            n('every field arrived intact on Application B'));
        assert(observedOnB.length === 1 && observedOnB[0].isNew === true,
            n('Application B\'s own local observation (onCommentaryReceived) fired exactly once, reporting a genuinely new arrival — this is the "local observation" step, never a second network hop'));

        stopAListening();
        stopBListening();
        appA.distributionPeerExchange.dispose();
        bPeerExchange.dispose();

        console.log('✓ C: FLAGSHIP — Application A (real, wired ui/main.js-shaped composition) creates a Commentary; it is persisted, announced, delivered over a real authenticated peer connection, and locally observed on an independent Application B. The full arc this audit exists to close.');
    }

    // ===============================================================
    // Section D — cross-device identity continuity and independent
    // storage.
    // ===============================================================
    {
        assert(deviceA !== undefined && deviceBStore !== undefined && flagshipCommentary !== undefined, n('setup: Section C\'s own device pair and delivered commentary are reused'));
        const onA = deviceA.distributionStore.getById(flagshipCommentary.commentaryId);
        const onB = deviceBStore.getById(flagshipCommentary.commentaryId);
        assert(onA !== null && onB !== null, n('setup: the flagship commentary is present on both stores'));
        assert(onA.commentaryId === onB.commentaryId, n('commentaryId unchanged across devices'));
        assert(onA.publicationId === onB.publicationId, n('publicationId unchanged across devices'));
        assert(onA.authorIdentityId === onB.authorIdentityId, n('authorIdentityId unchanged across devices'));
        assert(onA.content === onB.content, n('content unchanged across devices'));
        assert(onA.createdAt.getTime() === onB.createdAt.getTime(), n('createdAt unchanged across devices'));

        // Independent stores: a commentary saved directly on Device B
        // (never through Application A, never over the wire) is invisible
        // to Application A's own store — same persisted identity for
        // anything actually delivered, never a shared-storage illusion.
        const bOnlyCommentary = new PublicationCommentary({
            publicationId: flagshipPublication.id,
            authorIdentityId: makeIdentity('device-b-local-author').getSigningIdentity().id,
            content: 'created directly on Device B, never sent anywhere'
        });
        deviceBStore.save(bOnlyCommentary);
        assert(deviceBStore.getById(bOnlyCommentary.commentaryId) !== null, n('setup: the Device-B-only commentary is really on Device B\'s own store'));
        assert(deviceA.distributionStore.getById(bOnlyCommentary.commentaryId) === null,
            n('and is completely absent from Application A\'s own store — the two devices keep independent persistence; a shared Commentary identity for delivered records is never a shared storage backend'));

        console.log('✓ D: every field of the delivered commentary survives the trip unchanged, and the two devices keep genuinely independent stores.');
    }

    // ===============================================================
    // Section E — local-first ordering: persistence happens before
    // announce, structurally and behaviorally.
    // ===============================================================
    {
        const mainSource = codeOnly(await rawSource('ui/main.js'));
        const wrapperMatch = mainSource.match(/function addPublicationCommentaryCommand\(input\) \{([\s\S]*?)\n\}/);
        assert(wrapperMatch !== null, n('ui/main.js\'s own addPublicationCommentaryCommand wrapper is found, source-level'));
        const wrapperBody = wrapperMatch[1];
        const createIndex = wrapperBody.indexOf('createPublicationCommentaryCommand(input)');
        const announceIndex = wrapperBody.indexOf('.announce(');
        assert(createIndex >= 0 && announceIndex >= 0 && createIndex < announceIndex,
            n('source order: createPublicationCommentaryCommand(input) — local creation and persistence — textually precedes the .announce( call in ui/main.js\'s own wrapper; never the reverse'));

        installWindowLocalStorage();
        const publisherProvider = makeIdentity('ordering-publisher');
        const publication = seedPublication('pub-ordering-621', publisherProvider);
        const authorProvider = makeIdentity('ordering-author');

        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new NoPeerRegistry() });

        let alreadyPersistedWhenAnnounceFired = null;
        const originalAnnounce = app.distributionPeerExchange.announce.bind(app.distributionPeerExchange);
        app.distributionPeerExchange.announce = (commentary) => {
            alreadyPersistedWhenAnnounceFired = app.distributionStore.getById(commentary.commentaryId) !== null;
            return originalAnnounce(commentary);
        };

        app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'ordering check' });
        assert(alreadyPersistedWhenAnnounceFired === true,
            n('behaviorally: at the exact moment announce() is invoked, the commentary is already durably readable back through the store — persistence is a precondition of announcing, never a race with it'));

        app.distributionPeerExchange.dispose();
        console.log('✓ E: create → persist → announce, confirmed both by source order and by live instrumentation — never the reverse, never a race.');
    }

    // ===============================================================
    // Section F — graceful degradation: zero peers, a disconnecting
    // peer, and a thrown transport fault all leave local creation and
    // storage intact.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('degradation-publisher');
        const publication = seedPublication('pub-degradation-621', publisherProvider);
        const authorProvider = makeIdentity('degradation-author');

        // E1. No peers at all.
        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app1 = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new NoPeerRegistry() });
        const { commentary: c1, isNew: isNew1 } = app1.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'no peers connected' });
        assert(c1 instanceof PublicationCommentary && isNew1 === true, n('with zero connected peers, local creation still succeeds and persists'));
        app1.distributionPeerExchange.dispose();

        // E2. A peer that authenticates, then disconnects, before the
        // Commentary is ever created — announce() must not throw, and
        // local creation must still succeed.
        const network = new LocalPeerNetwork();
        const aTransport = new LocalPeerConnectionProvider('degrade-a-621', network);
        const bTransport = new LocalPeerConnectionProvider('degrade-b-621', network);
        const aConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aTransport, identityProvider: authorProvider });
        const stopA = aConnect.listen();
        const bConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bTransport, identityProvider: makeIdentity('degradation-device-b') });
        const stopB = bConnect.listen();
        const connection = bConnect.connect({ candidateEndpoint: 'degrade-a-621' });
        await wait(20);
        assert(connection.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: a real peer authenticates before being disconnected'));
        connection.close();
        stopB();
        await wait(10);

        const app2 = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aConnect.registry });
        let threw2 = false;
        let result2;
        try {
            result2 = app2.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'peer disconnected before announce' });
        } catch { threw2 = true; }
        assert(!threw2 && result2 && result2.commentary instanceof PublicationCommentary,
            n('with the only known peer already disconnected, addPublicationCommentaryCommand still does not throw, and local creation still succeeds'));
        assert(app2.getPublicationCommentariesCommand(publication.id).some((c) => c.commentaryId === result2.commentary.commentaryId),
            n('and the commentary really is durably persisted despite the disconnected peer'));
        stopA();
        app2.distributionPeerExchange.dispose();

        // E3. announce() itself throws (a simulated transport fault) —
        // creation must not propagate that failure.
        class ThrowingRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app3 = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new ThrowingRegistry() });
        app3.distributionPeerExchange.announce = () => { throw new Error('simulated transport failure'); };
        let threw3 = false;
        let result3;
        try {
            result3 = app3.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'transport throws' });
        } catch { threw3 = true; }
        assert(!threw3 && result3 && result3.commentary instanceof PublicationCommentary,
            n('even when announce() itself throws (simulated transport failure), local creation is unaffected and is returned to the caller'));
        assert(app3.getPublicationCommentariesCommand(publication.id).some((c) => c.commentaryId === result3.commentary.commentaryId),
            n('and that commentary too is durably persisted locally'));

        console.log('✓ F: zero peers, a peer disconnected before announce, and a thrown transport fault all leave local creation and storage fully intact — distribution is best-effort, never the persistence authority.');
    }

    // ===============================================================
    // Section G — signature boundary through the real wired path:
    // tampering and a forged signer are both rejected on arrival.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('signature-publisher');
        const publication = seedPublication('pub-signature-621', publisherProvider);
        const authorProvider = makeIdentity('signature-author-a');
        const mallory = makeIdentity('signature-mallory');

        const network = new LocalPeerNetwork();
        const aTransport = new LocalPeerConnectionProvider('sig-a-621', network);
        const bTransport = new LocalPeerConnectionProvider('sig-b-621', network);
        const aConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aTransport, identityProvider: authorProvider });
        const stopA = aConnect.listen();
        const receiverIdentity = makeIdentity('signature-receiver');
        const bConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bTransport, identityProvider: receiverIdentity });
        const stopB = bConnect.listen();
        const connection = bConnect.connect({ candidateEndpoint: 'sig-a-621' });
        await wait(20);
        assert(connection.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: a real, authenticated peer connection for the signature check'));

        const bus = new PeerMessageBus();
        const app = bootApplication(authorProvider, { peerMessageBus: bus, connectedPeerRegistry: aConnect.registry });

        let sentEnvelope = null;
        const originalSend = bus.send.bind(bus);
        bus.send = (peer, protocol, message) => { sentEnvelope = message && message.envelope; return originalSend(peer, protocol, message); };

        app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'real signature must survive' });
        assert(sentEnvelope && sentEnvelope.signature && sentEnvelope.signature.signer === authorProvider.getSigningIdentity().id,
            n('the envelope actually placed on the wire by the real, wired composition is signed by the commentary\'s own author — the real, live signing path, not a stand-in'));

        // Tampering after signing is rejected on arrival.
        const { exchange: receiverExchange } = makeDevice(receiverIdentity);
        const tampered = JSON.parse(JSON.stringify(sentEnvelope));
        tampered.content = 'tampered after the real, wired sender signed it';
        let tamperThrew = false;
        try { receiverExchange.importCommentaryEnvelope(tampered); } catch { tamperThrew = true; }
        assert(tamperThrew, n('a receiver independently verifies the signature — a tampered payload from the real, wired sender is rejected'));

        // Mallory cannot forge a commentary attributed to the real
        // author through the real wired sender — exportCommentary()
        // itself refuses before anything is ever announced.
        let malloryThrew = false;
        try {
            new PublicationCommentaryDistributionExchange(app.distributionStore, mallory, new LocalAuthorizationVerifier())
                .exportCommentary(flagshipCommentary);
        } catch { malloryThrew = true; }
        assert(malloryThrew, n('a different identity (Mallory), even with access to the same underlying store the real wired composition uses, cannot sign a commentary she did not author'));

        // A hand-forged envelope naming the real author as signer, but
        // actually signed by Mallory, is rejected at verification — the
        // identical boundary 0.9.618\'s own Section H already proved,
        // now reconfirmed reaching the RECEIVING side of the real wired
        // path, never merely a raw verifier call in isolation.
        const malloryOwnCommentary = new PublicationCommentary({
            publicationId: publication.id,
            authorIdentityId: mallory.getSigningIdentity().id,
            content: 'forged: claims to be from the real author'
        });
        const malloryEnvelope = new PublicationCommentaryDistributionExchange(new PublicationCommentaryStore(new InMemoryStorageProvider()), mallory, new LocalAuthorizationVerifier())
            .exportCommentary(malloryOwnCommentary);
        const forged = { ...malloryEnvelope, authorIdentityId: authorProvider.getSigningIdentity().id, commentaryId: flagshipCommentary.commentaryId + '-forged' };
        let forgedThrew = false;
        try { receiverExchange.importCommentaryEnvelope(forged); } catch { forgedThrew = true; }
        assert(forgedThrew, n('a forged envelope, claiming the real author\'s identity but actually signed by Mallory, is rejected by the real receiving path\'s own import boundary'));

        stopA();
        stopB();
        app.distributionPeerExchange.dispose();
        console.log('✓ G: the real, wired composition signs every envelope with its true author, and both tampering and a forged signer are rejected on the real receiving path.');
    }

    // ===============================================================
    // Section H — idempotent repeated delivery over the real transport.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('idempotence-publisher');
        const publication = seedPublication('pub-idempotence-621', publisherProvider);
        const authorProvider = makeIdentity('idempotence-author');
        const receiverIdentity = makeIdentity('idempotence-receiver');

        const network = new LocalPeerNetwork();
        const aTransport = new LocalPeerConnectionProvider('idem-a-621', network);
        const bTransport = new LocalPeerConnectionProvider('idem-b-621', network);
        const aConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aTransport, identityProvider: authorProvider });
        const stopA = aConnect.listen();
        const bConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bTransport, identityProvider: receiverIdentity });
        const stopB = bConnect.listen();
        const connection = bConnect.connect({ candidateEndpoint: 'idem-a-621' });
        await wait(20);
        assert(connection.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: a real, authenticated peer connection for the idempotence check'));

        const app = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aConnect.registry });
        const { store: receiverStore, exchange: receiverExchange } = makeDevice(receiverIdentity);
        const receiverPeerExchange = new PublicationCommentaryDistributionPeerExchange(receiverExchange, new PeerMessageBus(), bConnect.registry);
        const receivedResults = [];
        receiverPeerExchange.onCommentaryReceived((result) => receivedResults.push(result));

        const { commentary } = app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'delivered twice over the real transport' });
        await wait(30);
        // Re-announce the SAME already-created commentary a second time,
        // through the SAME real wired peer exchange — never a
        // hand-constructed duplicate.
        app.distributionPeerExchange.announce(commentary);
        await wait(30);

        assert(receivedResults.length === 2, n('the receiver\'s own onCommentaryReceived fired twice — once per real delivery'));
        assert(receivedResults[0].isNew === true, n('the first arrival, over the real transport, reports isNew: true'));
        assert(receivedResults[1].isNew === false, n('the second, repeated arrival of the identical commentary reports isNew: false — never a duplicate'));

        const allOnReceiver = receiverStore.getForPublication(publication.id);
        assert(allOnReceiver.filter((c) => c.commentaryId === commentary.commentaryId).length === 1,
            n('exactly one stored record exists on the receiver despite two real deliveries — handled entirely by storage/PublicationCommentaryStore.js\'s own existing commentaryId identity, never a new distribution-specific deduplication mechanism'));

        stopA();
        stopB();
        app.distributionPeerExchange.dispose();
        receiverPeerExchange.dispose();
        console.log('✓ H: repeated delivery over the real, wired transport stays idempotent — the existing store\'s own commentaryId identity is authoritative, unmodified.');
    }

    // ===============================================================
    // Section I — notification locality.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('notif-publisher');
        const publication = seedPublication('pub-notif-621', publisherProvider);
        const authorProvider = makeIdentity('notif-author');

        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const localApp = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new NoPeerRegistry() });
        localApp.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'local creation should notify' });
        const senderNotifications = new NotificationEventStore(new LocalStorageProvider()).loadAll();
        assert(senderNotifications.length === 1,
            n('local creation, through the real wired command, produces exactly one local NotificationEvent on the creating device'));
        localApp.distributionPeerExchange.dispose();

        const network = new LocalPeerNetwork();
        const receiverIdentity = makeIdentity('notif-receiver');
        const aTransport = new LocalPeerConnectionProvider('notif-a-621', network);
        const bTransport = new LocalPeerConnectionProvider('notif-b-621', network);
        const aConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aTransport, identityProvider: authorProvider });
        const stopA = aConnect.listen();
        const bConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bTransport, identityProvider: receiverIdentity });
        const stopB = bConnect.listen();
        const connection = bConnect.connect({ candidateEndpoint: 'notif-a-621' });
        await wait(20);
        assert(connection.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: a real, authenticated peer connection for the notification-locality check'));

        const liveApp = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aConnect.registry });
        const { storage: receiverStorage, exchange: receiverExchange } = makeDevice(receiverIdentity);
        const receiverPeerExchange = new PublicationCommentaryDistributionPeerExchange(receiverExchange, new PeerMessageBus(), bConnect.registry);

        const { commentary } = liveApp.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'remote arrival must not notify' });
        await wait(30);
        assert(receiverExchange._store.getById(commentary.commentaryId) !== null, n('setup: the independent receiver really did receive it, live'));

        const receiverNotifications = new NotificationEventStore(receiverStorage).loadAll();
        assert(receiverNotifications.length === 0,
            n('the RECEIVING device\'s own NotificationEventStore stays at zero — a distributed arrival, through the real production wiring, never produces a NotificationEvent; that stays local to the creating device and downstream of local creation only'));

        stopA();
        stopB();
        liveApp.distributionPeerExchange.dispose();
        receiverPeerExchange.dispose();
        console.log('✓ I: notification stays local to the creating device — a live, real-wiring distributed arrival produces zero NotificationEvents on the receiver.');
    }

    // ===============================================================
    // Section J — authorization separation.
    // ===============================================================
    {
        const useCaseSource = codeOnly(await rawSource('application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js'));
        const peerExchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js'));
        const exchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionExchange.js'));
        const mainSource = codeOnly(await rawSource('ui/main.js'));
        const wrapperMatch = mainSource.match(/function addPublicationCommentaryCommand\(input\) \{([\s\S]*?)\n\}/);
        const wrapperBody = wrapperMatch ? wrapperMatch[1] : '';

        // AMENDED BY 0.9.631 — Publication Commentary Arweave Asynchronous
        // Distribution added a `discoveryProvider` STRING parameter to the
        // ui/main.js wrapper (`input.discoveryProvider`, 'nostr' | 'arweave')
        // selecting which asynchronous TRANSPORT SUBSTRATE to publish
        // through — the exact term application/publication/distribution/PublicationDistributionRuntimeComposition.js's
        // own `discoveryProvider` option already uses for the identical
        // concept, one layer over. This is a different thing from what this
        // assertion actually guards against: a Publication EXISTENCE/
        // ownership lookup COLLABORATOR (an object with its own
        // `.findById()`, such as `LocalDiscoveryProvider`) leaking into the
        // write path. The two happen to share a name; only the collaborator
        // class pattern (capitalized `DiscoveryProvider`, matching
        // `LocalDiscoveryProvider`/`NostrDiscoveryProvider`/etc. by
        // substring) is still guarded here — a bare, lowercase, string-
        // valued `discoveryProvider` selecting a substrate is not the
        // invariant this section protects.
        for (const [label, source] of [['composition root', useCaseSource], ['peer exchange', peerExchangeSource], ['exchange', exchangeSource], ['ui/main.js wrapper', wrapperBody]]) {
            assert(!/CanCommentOnPublicationUseCase|publisherIdentity|publicationCatalog|DiscoveryProvider/.test(source),
                n(`the ${label} imports or mentions no Publication ownership/authorship/discovery/existence collaborator of any kind`));
        }

        // Behaviorally: a Commentary about a publicationId the receiver
        // has never heard of, delivered through the real wired sender,
        // still arrives — the exact 0.9.617/0.9.618/0.9.619 boundary,
        // reconfirmed once more through the real production path.
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('authz-publisher');
        seedPublication('pub-authz-621-known-only-to-sender', publisherProvider);
        const authorProvider = makeIdentity('authz-author');
        const receiverIdentity = makeIdentity('authz-receiver-never-heard-of-it');

        const network = new LocalPeerNetwork();
        const aTransport = new LocalPeerConnectionProvider('authz-a-621', network);
        const bTransport = new LocalPeerConnectionProvider('authz-b-621', network);
        const aConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aTransport, identityProvider: authorProvider });
        const stopA = aConnect.listen();
        const bConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bTransport, identityProvider: receiverIdentity });
        const stopB = bConnect.listen();
        const connection = bConnect.connect({ candidateEndpoint: 'authz-a-621' });
        await wait(20);
        assert(connection.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: a real, authenticated peer connection for the authorization-separation check'));

        const app = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aConnect.registry });
        const { store: receiverStore, exchange: receiverExchange } = makeDevice(receiverIdentity);
        const receiverPeerExchange = new PublicationCommentaryDistributionPeerExchange(receiverExchange, new PeerMessageBus(), bConnect.registry);

        const { commentary } = app.addPublicationCommentaryCommand({ publicationId: 'pub-authz-621-known-only-to-sender', content: 'about a publication the receiver never discovered' });
        await wait(30);
        assert(receiverStore.getById(commentary.commentaryId) !== null,
            n('a Commentary about a publicationId the receiving device has never independently discovered or resolved still arrives and is stored — the distribution layer, end to end through the real wiring, never checks Publication existence, ownership, or discoverability'));

        stopA();
        stopB();
        app.distributionPeerExchange.dispose();
        receiverPeerExchange.dispose();
        console.log('✓ J: no Publication authorization/ownership/existence check exists anywhere in the wired path, structurally or behaviorally.');
    }

    // ===============================================================
    // Section K — announce-only boundary: no historical synchronization
    // was accidentally activated by wiring distribution into the real
    // application.
    // ===============================================================
    {
        const peerExchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js'));
        // Deliberately does NOT flag `.subscribe(`/`.unsubscribe(`/
        // `onChange(` — the ordinary PeerMessageBus/EventBus transport
        // primitives every sibling *PeerExchange class in this codebase
        // already uses to attach a listener. What this checks for is
        // application-level historical-sync vocabulary: a second message
        // kind beyond ANNOUNCE, or a backfill/request-response protocol.
        assert(!/REQUEST|RESPONSE|BACKFILL|HISTORY_SYNC|historical.sync/i.test(peerExchangeSource),
            n('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js — the class ui/main.js now constructs into the running application — carries no request/response, backfill, or historical-synchronization vocabulary of any kind'));
        const messageKindConstants = (peerExchangeSource.match(/MESSAGE_KIND_\w+/g) || []);
        assert(new Set(messageKindConstants).size === 1 && messageKindConstants[0] === 'MESSAGE_KIND_ANNOUNCE',
            n('exactly one message-kind constant exists in this file — MESSAGE_KIND_ANNOUNCE — never a second REQUEST/RESPONSE/HISTORY kind'));
        assert(/MESSAGE_KIND_ANNOUNCE = 'ANNOUNCE'/.test(peerExchangeSource),
            n('exactly one message kind exists — ANNOUNCE — and it is the only one this file\'s own _handleIncoming() ever accepts'));

        const useCaseSource = codeOnly(await rawSource('application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js'));
        assert(!/request|response|subscribe|backfill|history/i.test(useCaseSource),
            n('the composition root itself introduces no request/response or historical-sync wiring of its own'));

        // Live: after Application A announces, it receives nothing back
        // from Application B — no reply traffic of any kind.
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('announce-only-publisher');
        const publication = seedPublication('pub-announce-only-621', publisherProvider);
        const authorProvider = makeIdentity('announce-only-author');
        const receiverIdentity = makeIdentity('announce-only-receiver');

        const network = new LocalPeerNetwork();
        const aTransport = new LocalPeerConnectionProvider('announce-a-621', network);
        const bTransport = new LocalPeerConnectionProvider('announce-b-621', network);
        const aConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aTransport, identityProvider: authorProvider });
        const stopA = aConnect.listen();
        const bConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bTransport, identityProvider: receiverIdentity });
        const stopB = bConnect.listen();
        const connection = bConnect.connect({ candidateEndpoint: 'announce-a-621' });
        await wait(20);
        assert(connection.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: a real, authenticated peer connection for the announce-only check'));

        const aBus = new PeerMessageBus();
        const app = bootApplication(authorProvider, { peerMessageBus: aBus, connectedPeerRegistry: aConnect.registry });
        let incomingOnA = 0;
        aBus.subscribe(PublicationCommentaryDistributionPeerExchange.DEFAULT_PROTOCOL, () => { incomingOnA += 1; });

        const { exchange: receiverExchange } = makeDevice(receiverIdentity);
        const receiverPeerExchange = new PublicationCommentaryDistributionPeerExchange(receiverExchange, new PeerMessageBus(), bConnect.registry);

        app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'announce only, no reply expected' });
        await wait(30);
        assert(incomingOnA === 0, n('after a real announce delivered to an authenticated peer, Application A receives zero messages back on the commentary-distribution protocol — no reply, no acknowledgment, no history request'));

        stopA();
        stopB();
        app.distributionPeerExchange.dispose();
        receiverPeerExchange.dispose();
        console.log('✓ K: the wired path remains strictly announce-only — no request/response, subscription, or backfill vocabulary exists or fires, structurally or live.');
    }

    // ===============================================================
    // Section L — existing single-device regression, with no peer
    // infrastructure reachable at all.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisherProvider = makeIdentity('regression-publisher');
        const publication = seedPublication('pub-regression-621', publisherProvider);
        const authorProvider = makeIdentity('regression-author');

        // No real transport, no real registry, and no peer ever
        // connects — the same NoPeerRegistry shape used throughout this
        // file, standing in for "networking unavailable" rather than a
        // constructor-time failure (the composition root's own
        // constructor legitimately lists current peers up front — see
        // application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js's
        // own constructor — so a registry that THROWS on list() is not a
        // real degradation scenario ui/main.js's own peerSessionManager.registry
        // could ever produce; "no peers reachable" is representative,
        // not a broken collaborator).
        class UnreachableRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new UnreachableRegistry() });

        const { commentary } = app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'ordinary single-device flow, networking entirely unavailable' });
        assert(commentary instanceof PublicationCommentary, n('create: succeeds even though peer infrastructure is entirely unreachable'));
        const readBack = app.getPublicationCommentariesCommand(publication.id);
        assert(readBack.some((c) => c.commentaryId === commentary.commentaryId),
            n('store → retrieve: the commentary reads back through the same real command a UI surface actually calls'));
        assert(readBack.find((c) => c.commentaryId === commentary.commentaryId).content === 'ordinary single-device flow, networking entirely unavailable',
            n('display: the exact content authored is what would be rendered — the complete create → store → retrieve → display path needs no peer connection whatsoever'));

        app.distributionPeerExchange.dispose();
        console.log('✓ L: the ordinary, single-device Commentary workflow is a complete regression pass even when peer infrastructure itself is unreachable — decentralized distribution is genuinely an additional capability, never a new requirement.');
    }

    // ===============================================================
    // Section M — production-change guard.
    // ===============================================================
    {
        // AMENDED BY 0.9.638 — see
        // tests/PublicationCommentaryCrossDeviceProductClosureAudit.test.js's
        // own identical 0.9.638 amendment for the full rationale: a
        // live, point-in-time guard, amended to except 0.9.638's own,
        // separately-justified UI-only files.
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        const expectedLaterMilestoneFiles = new Set(['ui/components/PublicationCard.js', 'ui/components/PublicationList.js']);
        const unexpectedNonTestFiles = changedNonTestFiles.split('\n').filter(Boolean)
            .filter((f) => !expectedLaterMilestoneFiles.has(f));
        assert(unexpectedNonTestFiles.length === 0, n(`AMENDED BY 0.9.638 — no UNEXPECTED production file is modified by this milestone — found: ${unexpectedNonTestFiles.join(', ') || 'none'}`));

        console.log('✓ M: no production file touched. This audit implements nothing — it reconfirms the arc 0.9.617-0.9.620 already built.');
    }

    // ===============================================================
    // Section N — classification and verdict.
    // ===============================================================
    {
        console.log(
            '\nDecision tree:\n'
            + '             0.9.621\n'
            + '                |\n'
            + '       Does the real application\n'
            + '       path distribute Commentary?\n'
            + '                |\n'
            + '               YES  (Section C, FLAGSHIP)\n'
            + '                |\n'
            + '       Check boundaries (D-L)\n'
            + '                |\n'
            + '           all pass -> YES\n'
            + '                |\n'
            + '            ARC_CLOSED\n'
            + '                |\n'
            + '              STOP\n'
        );
        console.log(
            '0.9.621 verdict: ARC_CLOSED. Sections A confirm all four prior milestones\' own guard files still pass, live, against '
            + 'current source. Section B confirms the composition root 0.9.620 built is still the ONE construction site, riding the '
            + 'ONE app-wide peer bus/registry/identity, with no second Commentary persistence authority. Section C — the flagship — '
            + 'proves the complete, previously-unproven-as-one-chain path: Application A creates a Commentary through the real, wired '
            + 'ui/main.js-shaped composition; it is locally persisted; the composition-boundary announce fires; a real, authenticated '
            + 'peer connection carries it; Application B verifies the signature, stores it, and locally observes it. Sections D-L '
            + 'reconfirm, through that same real wiring rather than a directly-instantiated exchange, every boundary this arc has ever '
            + 'promised: cross-device identity continuity with genuinely independent stores (D), local-first ordering (E), graceful '
            + 'degradation under no peers, a disconnected peer, and a thrown transport fault (F), the signature boundary against both '
            + 'tampering and a forged signer (G), idempotent repeated delivery handled entirely by the existing store (H), notification '
            + 'locality (I), no Publication authorization/ownership/existence check (J), strict announce-only semantics with zero reply '
            + 'traffic (K), and a complete single-device regression with peer infrastructure entirely unreachable (L). No production '
            + 'file is touched (M). RECOMMENDATION: stop working on Commentary distribution. The architecture has a complete path — '
            + 'Commentary creation -> local persistence -> signed distribution envelope -> authenticated peer transport -> receiver '
            + 'verification -> existing Commentary store -> local observation — and there is no architectural reason to manufacture a '
            + '0.9.622 for this arc. Deliberately excluded, carried forward unchanged from 0.9.617-0.9.620: historical synchronization, '
            + 'Commentary subscriptions, guaranteed delivery, retry queues, offline replication, relay fan-out, provider ranking/'
            + 'fallback, distributed notifications, global Commentary discovery/search, Publication authorization changes, Publication '
            + 'synchronization, new persistence, new deduplication, conflict-resolution redesign, and any Commentary mutation protocol.'
        );
        console.log(`✅ All Publication Commentary Application Distribution Closure Audit tests passed (${assertionCount} assertions).`);
    }
}

await run();
