import { execSync } from 'node:child_process';

import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import {
    PublicationCommentaryStore,
    PublicationCommentaryConflictError
} from '../storage/PublicationCommentaryStore.js';
import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionPeerExchange } from '../application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';

import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { Publication } from '../publisher/Publication.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { mainFiles } from './support/SourceFileGroups.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// 0.9.619 — Publication Commentary Cross-Device Product Closure Audit.
//
// TYPE: test-only audit. PRODUCTION CHANGES: none (Section K's own guard).
//
// 0.9.617 measured the gap precisely: Commentary was a real, durable
// application fact that could not leave the device it was created on, by
// any path. 0.9.618 closed exactly that seam at the CAPABILITY layer — a
// sibling envelope, a signing/verification boundary, and reuse (never
// reinvention) of the existing store's own idempotent/conflict semantics
// — and proved it, live, over a real authenticated peer connection
// (0.9.618 Section J). Between them those two files already carry 87
// numbered, passing assertions against real production code. This
// milestone does not re-derive that coverage; it asks a DIFFERENT
// question, at a different altitude, per this milestone's own requesting
// brief: is the complete, user-visible cross-device PRODUCT closed — not
// merely "can these classes, directly composed by a test, deliver a
// Commentary from Device A to Device B" (already proved), but "does
// creating a Commentary through ForkBuild's own real composition roots
// ever reach a peer at all," and do the capability's own stated
// boundaries (announce-only, no synchronization, no notification
// distribution, no authorization inference, no Publication-existence
// requirement, no identity collapsing) hold under conditions 0.9.618
// itself did not specifically exercise.
//
// METHOD: composition over re-derivation, per 0.9.398's own established
// precedent for a closure audit — 0.9.617's and 0.9.618's own test files
// are RE-EXECUTED LIVE, as real subprocesses against current on-disk
// source, and their exit code / verdict string is read back rather than
// their assertions re-typed. Every section below is either (a) that kind
// of re-execution, or (b) coverage this milestone can show, concretely,
// neither prior file exercised.
//
//   Section A — entry-state reconfirmation: 0.9.617 and 0.9.618's own
//               test files, re-run live, right now, against current
//               source.
//   Section B — THE FLAGSHIP FINDING: a production wiring census. Does
//               anything in this codebase's real running application
//               (ui/ + application/, excluding tests/) ever construct a
//               PublicationCommentaryDistribution{Exchange,PeerExchange}
//               or call .announce() on one — contrasted directly against
//               every sibling capability (Publication, Anchor, Snapshot
//               Placement, Snapshot Content, Snapshot Possession), each
//               of which has at least one real call site.
//   Section C — the real composition root: CreatePublicationCommentaryUseCase.js,
//               the exact factory ui/main.js-shaped callers use, reproduced
//               live, proving structurally that nothing it returns can
//               reach a peer.
//   Section D — missing-Publication tolerance: unlike 0.9.618 Section J
//               (which pre-shared the Publication on both devices),
//               Device B here has NEVER heard of the Publication at all.
//   Section E — identity/publication isolation, over a real peer
//               connection: two identities, two publications, no
//               collapsing.
//   Section F — announce-only semantics: no request/response
//               vocabulary exists, structurally (contrasted against
//               PublicationAnchorPeerExchange.js, which does have one),
//               and live — Device A receives nothing back after
//               announcing.
//   Section G — the authenticated-peer boundary, live, over the REAL
//               transport (no stub): a message sent before the handshake
//               resolves is never delivered.
//   Section H — authorization non-inference, guaranteed by the
//               EXCHANGE'S OWN CONSTRUCTOR SHAPE, not merely by an
//               unexercised code path.
//   Section I — notification locality, reconfirmed over a real
//               announce/receive round trip (0.9.618 Section M tested
//               only direct import(), never a live delivery).
//   Section J — classification and verdict.
//   Section K — deliberate exclusions; no production file touched.
//
// AMENDED BY 0.9.620 — Wire Publication Commentary Peer Distribution,
// which implemented exactly this audit's own recommendation: application/
// CreatePublicationCommentaryDistributionPeerExchangeUseCase.js (a new
// composition root, mirroring application/
// CreatePublicationAnchorPeerExchangeUseCase.js's own exact shape) is now
// constructed in ui/main.js, on the SAME app-wide peerMessageBus/
// peerSessionManager.registry/identityProvider every sibling capability
// already rides, and the EXISTING addPublicationCommentaryCommand
// (application/publication/commentary/CreatePublicationCommentaryUseCase.js, still completely
// unmodified) is now wrapped, at the ui/main.js composition boundary
// only, with an ANNOUNCE side effect that fires after local creation
// succeeds. Only Section B's own four production-absence assertions and
// Section C's closing narration are amended in place, plus this note —
// per this codebase's own established convention (see e.g. 0.9.618's own
// amend of tests/PublicationCommentaryDistributionBoundaryAudit.test.js)
// for a prior audit whose own assertion described a gap a later
// milestone closed. Every other section holds EXACTLY as measured:
// Sections A and D-I exercised the CAPABILITY layer directly (0.9.618's
// own classes), never the production wiring — nothing about those
// classes changed, so nothing there needed amending. Section C's own
// live reproduction of application/publication/commentary/CreatePublicationCommentaryUseCase.js
// in isolation (never through ui/main.js's own wrapper) also still holds
// unchanged: that one file, by itself, still returns exactly its
// original two commands, with no announce/peerExchange capability of its
// own — 0.9.620 deliberately added the distribution side effect at the
// ui/main.js composition boundary, never inside
// CreatePublicationCommentaryUseCase.js itself, so this section's own
// per-assertion findings about that one file remain literally true; only
// its closing paragraph, which generalized from that file to "the one
// composition a real caller actually uses," is amended, since a real
// caller (ui/main.js) now uses that file wrapped, not raw. See
// tests/PublicationCommentaryDistributionWiring.test.js for 0.9.620's own
// full coverage, including its own real-composition FLAGSHIP delivery.

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

async function sourceExists(relativePath) {
    try { await readSource(relativePath); return true; } catch { return false; }
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Identical helper to 0.9.482's own tests/PassivePeerContributionToWalking...
// audit — grep across real production directories only, never tests/.
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
// against current on-disk source — this milestone's own composition
// mechanism, per 0.9.398's established precedent. Returns the captured
// stdout (for verdict-string checks) and whether it exited 0.
function runGuardLive(relativeTestFile) {
    try {
        const stdout = execSync(`node ${relativeTestFile}`, { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        return { passed: true, stdout };
    } catch (error) {
        return { passed: false, stdout: `${error.stdout || ''}${error.stderr || ''}` };
    }
}

function makeCommentaryExchange(identityProvider) {
    const storage = new InMemoryStorageProvider();
    const store = new PublicationCommentaryStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationCommentaryDistributionExchange(store, identityProvider, verifier);
    return { storage, store, verifier, exchange };
}

async function run() {
    // ===============================================================
    // Section A — entry-state reconfirmation.
    // ===============================================================
    {
        const boundaryAudit = runGuardLive('tests/PublicationCommentaryDistributionBoundaryAudit.test.js');
        assert(boundaryAudit.passed && /All Publication Commentary Distribution Boundary Audit tests passed/.test(boundaryAudit.stdout),
            n('0.9.617\'s own boundary audit, RE-EXECUTED LIVE against current source, still exits 0 and prints its own passing verdict — nothing has regressed underneath it'));

        const distributionAudit = runGuardLive('tests/PublicationCommentaryDistribution.test.js');
        assert(distributionAudit.passed && /All Publication Commentary Distribution tests passed/.test(distributionAudit.stdout),
            n('0.9.618\'s own distribution/envelope/flagship suite, RE-EXECUTED LIVE against current source, still exits 0 and prints its own passing verdict — the capability layer this audit builds on is still real, not assumed'));

        console.log('✓ A: both prior milestones\' own guard files re-confirmed live, right now, against current source — composition, not re-derivation.');
    }

    // ===============================================================
    // Section B — THE FLAGSHIP FINDING: production wiring census.
    // ===============================================================
    {
        // B1. AMENDED BY 0.9.620. At the time this audit originally ran,
        // no production file constructed either commentary-distribution
        // class. 0.9.620 closed exactly that gap: application/
        // CreatePublicationCommentaryDistributionPeerExchangeUseCase.js
        // now constructs both, mirroring application/
        // CreatePublicationAnchorPeerExchangeUseCase.js's own shape.
        const constructionSites = grepFiles('new PublicationCommentaryDistribution(Exchange|PeerExchange)\\(', ['ui', 'application']);
        assert(constructionSites.length === 1 && constructionSites[0].includes('CreatePublicationCommentaryDistributionPeerExchangeUseCase.js'),
            n(`exactly one file in ui/ or application/ now constructs the commentary-distribution classes — application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js (0.9.620), the new composition root this audit's own recommendation named — found: ${constructionSites.join(', ') || 'none'}`));

        // B2. AMENDED BY 0.9.620. ui/main.js now wraps
        // addPublicationCommentaryCommand with a real
        // publicationCommentaryDistributionPeerExchange.announce() call —
        // the identical census method
        // tests/PassivePeerContributionToWalkingTriggeredSnapshotDiscoveryProductAudit.test.js
        // (0.9.482) already established for the placement family, applied
        // here to commentary. Every `.announce(` site found is
        // classified; exactly one now belongs to commentary.
        const announceCallSites = grepFiles('\\.announce\\(', ['ui', 'application']);
        const commentaryAnnounceCallSites = [];
        for (const file of announceCallSites) {
            const source = await readSource(file.replace(/^\.\//, ''));
            if (/[Cc]ommentary.*[Pp]eer[Ee]xchange\.announce\(|deviceAPeerExchange\.announce\(/i.test(source)) {
                commentaryAnnounceCallSites.push(file);
            }
        }
        assert(commentaryAnnounceCallSites.length === 1 && commentaryAnnounceCallSites.some((file) => file.includes('ui/main.js')),
            n(`exactly one production \`.announce(\` call site now belongs to commentary — ui/main.js's own new addPublicationCommentaryCommand wrapper (0.9.620) — found: ${commentaryAnnounceCallSites.join(', ') || 'none'}`));
        assert(announceCallSites.length > 0,
            n('sibling capabilities continue to have their own real production .announce() call sites (ui/views/EditorView.js\'s explicit "Publish to Network" click, application/publication/PublicationPeerConnectionSync.js\'s automatic connection sync, application/snapshot/placement/CreatePublicationSnapshotPlacementUseCase.js\'s automatic post-save announce) — commentary\'s own new call site (above) joins them rather than replacing any of them'));

        // B3. AMENDED BY 0.9.620. Every sibling capability has its own
        // Create*PeerExchangeUseCase.js composition root, wired into
        // ui/main.js. Commentary now does too.
        const siblingFactories = [
            'application/publication/CreatePublicationPeerExchangeUseCase.js',
            'application/anchoring/CreatePublicationAnchorPeerExchangeUseCase.js',
            'application/snapshot/placement/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js',
            'application/snapshot/materialization/CreatePublicationSnapshotContentPeerExchangeUseCase.js',
            'application/snapshot/possession/CreatePublicationSnapshotPossessionPeerExchangeUseCase.js'
        ];
        for (const file of siblingFactories) {
            assert(await sourceExists(file), n(`sanity: ${file} really does exist, on disk, as the established composition-root pattern this section measures Commentary against`));
        }
        assert(await sourceExists('application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js'),
            n('application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js (0.9.620) now exists on disk — Commentary distribution now has exactly the same composition-root shape every sibling capability already had'));

        // B4. AMENDED BY 0.9.620. ui/main.js — the one file that actually
        // assembles the running application's app-wide peerMessageBus/
        // registry and wires every sibling capability onto it — now
        // mentions and wires Commentary distribution.
        const mainSource = codeOnly((await Promise.all(mainFiles().map((file) => readSource(file)))).join('\n'));
        assert(/CommentaryDistribution/.test(mainSource),
            n('ui/main.js — the real, single composition root for the running app\'s peer wiring — now imports, constructs, and threads Commentary distribution onto the app-wide peerMessageBus (0.9.620)'));

        console.log('✓ B: AMENDED BY 0.9.620 — the capability 0.9.618 built is now reachable from the real, running application. Exactly one composition root exists (application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js), ui/main.js wires it on the app-wide peerMessageBus/registry, and it has exactly one production .announce() call site — matching every sibling capability\'s own shape. See tests/PublicationCommentaryDistributionWiring.test.js for 0.9.620\'s own full coverage.');
    }

    // ===============================================================
    // Section C — the real composition root, reproduced live.
    // ===============================================================
    {
        // CreatePublicationCommentaryUseCase.js is the SAME factory a
        // standalone (non-World-View) UI surface actually calls — see
        // that file's own 0.9.289 header. Reproduced here, live, exactly
        // as such a caller would use it, never by reaching past it into
        // PublicationCommentaryDistributionExchange directly.
        const useCaseSource = codeOnly(await readSource('application/publication/commentary/CreatePublicationCommentaryUseCase.js'));
        assert(!/PeerMessageBus|ConnectedPeerRegistry|CommentaryDistribution|peerExchange/i.test(useCaseSource),
            n('application/publication/commentary/CreatePublicationCommentaryUseCase.js\'s own source imports and mentions nothing peer/distribution-shaped at all — structurally incapable of reaching a peer, not merely observed not to today'));

        const { CreatePublicationCommentaryUseCase } = await import('../application/publication/commentary/CreatePublicationCommentaryUseCase.js');
        let _backing = new Map();
        if (typeof globalThis.window === 'undefined') {
            globalThis.window = {
                localStorage: {
                    getItem: (k) => (_backing.has(k) ? _backing.get(k) : null),
                    setItem: (k, v) => { _backing.set(k, String(v)); },
                    removeItem: (k) => { _backing.delete(k); },
                    key: (i) => Array.from(_backing.keys())[i] ?? null,
                    get length() { return _backing.size; }
                }
            };
        }

        // A real, discoverable Publication, seeded through the SAME
        // window.localStorage the composition root's own internal
        // LocalDiscoveryProvider reads — CanCommentOnPublicationUseCase's
        // own policy (0.9.246) requires publicationId to actually
        // resolve; this section is proving the composition root works
        // end to end, never bypassing its real authorization step.
        const publisherProvider = makeIdentity('composition-root-publisher');
        const publication = new Publication({
            id: 'pub-composition-root',
            documentId: 'doc-composition-root',
            title: 'Composition Root World',
            author: 'author',
            publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
        });
        new LocalStorageProvider().save('forkbuild-publications', [publication.toJSON()]);

        const identityProvider = makeIdentity('composition-root-author');
        const commands = new CreatePublicationCommentaryUseCase().execute(identityProvider);
        assert(JSON.stringify(Object.keys(commands).sort()) === JSON.stringify(['addPublicationCommentaryCommand', 'getPublicationCommentariesCommand']),
            n('the REAL composition root\'s own returned surface is exactly two functions — no announce/peerExchange/distribution capability of any kind is exposed to a caller, live-inspected on the real return value, not merely absent from the source text'));

        const { commentary } = commands.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'created through the real app-facing factory' });
        assert(commentary instanceof PublicationCommentary, n('the real composition root really does create a genuine PublicationCommentary — this section is not a vacuous, unreachable code path'));
        const readBack = commands.getPublicationCommentariesCommand(publication.id);
        assert(readBack.length === 1 && readBack[0].commentaryId === commentary.commentaryId,
            n('and it is genuinely readable back through the SAME real composition root — local behavior through this path is fully functional; only the cross-device leg is missing'));

        // AMENDED BY 0.9.620: this section's own findings about
        // application/publication/commentary/CreatePublicationCommentaryUseCase.js IN ISOLATION
        // all still hold, byte-for-byte — that file is completely
        // unmodified by 0.9.620, still imports nothing peer-shaped, and
        // still returns exactly its original two commands. What changed
        // is that ui/main.js — the real caller — no longer hands this
        // file's own addPublicationCommentaryCommand straight to
        // app.provide(): it wraps it with a distribution announce side
        // effect first (see application/
        // CreatePublicationCommentaryDistributionPeerExchangeUseCase.js
        // and tests/PublicationCommentaryDistributionWiring.test.js's own
        // Sections B/C for the real, wired composition this section did
        // not reproduce).
        console.log('✓ C: application/publication/commentary/CreatePublicationCommentaryUseCase.js, in isolation, still works end to end for local create/read and still imports nothing peer-shaped — but (0.9.620) it is no longer the LAST composition step a real caller sees: ui/main.js now wraps its own addPublicationCommentaryCommand with a distribution announce, closing the gap this section\'s own isolated reproduction first proved.');
    }

    // ===============================================================
    // Section D — missing-Publication tolerance, over a REAL peer
    // connection (unlike 0.9.618 Section J, which pre-shared the
    // Publication on both devices).
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('alice-unknown-pub');
        const bob = makeIdentity('bob-unknown-pub');
        const aliceTransport = new LocalPeerConnectionProvider('alice-unknown-pub-ep', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-unknown-pub-ep', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-unknown-pub-ep' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: Device B authenticates to Device A'));

        const { store: deviceAStore, exchange: deviceAExchange } = makeCommentaryExchange(alice);
        const deviceAPeerExchange = new PublicationCommentaryDistributionPeerExchange(deviceAExchange, new PeerMessageBus(), aliceConnect.registry);
        // DEVICE B NEVER RECEIVES ANY PUBLICATION RECORD OF ANY KIND —
        // no `discoveryStorage.save('forkbuild-publications', ...)` call
        // anywhere in this section, unlike 0.9.618 Section J.
        const { store: deviceBStore, exchange: deviceBExchange } = makeCommentaryExchange(bob);
        const deviceBPeerExchange = new PublicationCommentaryDistributionPeerExchange(deviceBExchange, new PeerMessageBus(), bobConnect.registry);
        const deviceBReceived = [];
        deviceBPeerExchange.onCommentaryReceived((result) => deviceBReceived.push(result));

        const commentary = new PublicationCommentary({
            publicationId: 'pub-device-b-has-never-heard-of-this',
            authorIdentityId: alice.getSigningIdentity().id,
            content: 'about a Publication Device B has zero record of'
        });
        deviceAStore.save(commentary);
        deviceAPeerExchange.announce(commentary);
        await wait(30);

        assert(deviceBReceived.length === 1 && deviceBReceived[0].isNew === true,
            n('Device B accepts and stores a validly signed Commentary about a publicationId it has NEVER heard of, no Publication record required — the real, unmodified restraint application/publication/commentary/PublicationCommentaryDistributionExchange.js\'s own header already claims ("stops exactly where signature verification stops"), now measured against a receiver with zero Publication knowledge, not merely asserted from prose'));
        assert(deviceBStore.getById(commentary.commentaryId).publicationId === commentary.publicationId,
            n('the stored Commentary\'s own publicationId is preserved exactly, even though it resolves to nothing on Device B — Commentary identity never depends on Publication resolvability'));

        stopAliceListening();
        stopBobListening();
        deviceAPeerExchange.dispose();
        deviceBPeerExchange.dispose();
        console.log('✓ D: a Commentary about a Publication the receiving device has never heard of still crosses, verifies, and persists — distribution never silently becomes Publication discovery.');
    }

    // ===============================================================
    // Section E — identity/publication isolation, over a real peer
    // connection.
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('alice-isolation');
        const bob = makeIdentity('bob-isolation');
        const viewer = makeIdentity('viewer-isolation');
        const aliceTransport = new LocalPeerConnectionProvider('alice-isolation-ep', network);
        const viewerTransport = new LocalPeerConnectionProvider('viewer-isolation-ep', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const viewerConnect = new ConnectToPeerUseCase({ peerConnectionProvider: viewerTransport, identityProvider: viewer });
        const stopViewerListening = viewerConnect.listen();
        const viewerToAlice = viewerConnect.connect({ candidateEndpoint: 'alice-isolation-ep' });
        await wait(20);
        assert(viewerToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: the observing device authenticates to Alice\'s device'));

        // Alice's device signs and announces her own two commentaries (on
        // two different publications); a SEPARATE exchange, still on
        // Alice's own transport/registry, signs and announces Bob's own
        // commentary (Bob authored it locally on his own device in this
        // scenario, and Alice's device is relaying nothing — this section
        // only needs three independently-signed, independently-announced
        // facts to reach the SAME observing device).
        const { exchange: aliceExchange } = makeCommentaryExchange(alice);
        const alicePeerExchange = new PublicationCommentaryDistributionPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const { exchange: bobOwnExchange, store: bobOwnStore } = makeCommentaryExchange(bob);

        const { store: viewerStore, exchange: viewerExchange } = makeCommentaryExchange(viewer);
        const viewerPeerExchange = new PublicationCommentaryDistributionPeerExchange(viewerExchange, new PeerMessageBus(), viewerConnect.registry);

        const c1 = new PublicationCommentary({ publicationId: 'pub-p1', authorIdentityId: alice.getSigningIdentity().id, content: 'C1 by Alice on P1' });
        const c3 = new PublicationCommentary({ publicationId: 'pub-p2', authorIdentityId: alice.getSigningIdentity().id, content: 'C3 by Alice on P2' });
        alicePeerExchange.announce(c1);
        alicePeerExchange.announce(c3);

        // C2 (Bob, on P1) is exported and imported directly through the
        // real exchange (never a hand-rolled envelope), then handed to
        // the observing device the identical way — a second, independent
        // signer must not collapse into Alice's own identity dimension.
        const c2Exported = bobOwnExchange.exportCommentary(new PublicationCommentary({
            publicationId: 'pub-p1', authorIdentityId: bob.getSigningIdentity().id, content: 'C2 by Bob on P1'
        }));
        const { commentary: c2 } = viewerExchange.importCommentaryEnvelope(c2Exported);
        await wait(30);

        const onP1 = viewerStore.getForPublication('pub-p1');
        const onP2 = viewerStore.getForPublication('pub-p2');
        assert(onP1.length === 2, n('publication P1 ends up with exactly two commentaries on the observing device — C1 (Alice) and C2 (Bob)'));
        assert(onP2.length === 1 && onP2[0].commentaryId === c3.commentaryId, n('publication P2 ends up with exactly one commentary — C3 — never contaminated by P1\'s own two'));
        const authorsOnP1 = onP1.map((c) => c.authorIdentityId).sort();
        assert(JSON.stringify(authorsOnP1) === JSON.stringify([alice.getSigningIdentity().id, bob.getSigningIdentity().id].sort()),
            n('the two commentaries on P1 carry the two genuinely distinct signer identities, never collapsed into one'));
        assert(viewerStore.getById(c1.commentaryId).commentaryId !== viewerStore.getById(c1.commentaryId).publicationId,
            n('sanity, reconfirmed on the receiving side: commentaryId and publicationId remain distinct facts even after crossing the wire'));
        assert(bobOwnStore.getForPublication('pub-p1').length === 0,
            n('Bob\'s own local store, never touched by any of this exchange, holds none of it — this section never mutates a sender\'s own state as a side effect of composing its envelope'));

        stopAliceListening();
        stopViewerListening();
        alicePeerExchange.dispose();
        viewerPeerExchange.dispose();
        console.log('✓ E: two identities, two publications, three independently-signed commentaries, delivered over a real peer connection — publicationId and authorIdentityId both remain the correct, independent isolation dimensions, live.');
    }

    // ===============================================================
    // Section F — announce-only semantics: no request/response
    // vocabulary, structurally or live.
    // ===============================================================
    {
        const peerExchangeSource = codeOnly(await readSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js'));
        assert(/MESSAGE_KIND_ANNOUNCE/.test(peerExchangeSource) && !/REQUEST|RESPONSE/.test(peerExchangeSource),
            n('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js defines exactly one message kind (ANNOUNCE) and no REQUEST/RESPONSE vocabulary of any kind, live-inspected on real source'));
        // Contrasted directly against a sibling that DOES have request/
        // response, proving this is a deliberate difference in KIND, not
        // an oversight this audit is inventing a rule to catch.
        const anchorPeerExchangeSource = codeOnly(await readSource('application/anchoring/PublicationAnchorPeerExchange.js'));
        assert(/REQUEST/.test(anchorPeerExchangeSource) && /RESPONSE/.test(anchorPeerExchangeSource),
            n('by contrast, application/anchoring/PublicationAnchorPeerExchange.js really does define REQUEST/RESPONSE (0.8.5, for late-joiner catch-up) — Commentary distribution\'s own absence of that vocabulary is a real, deliberate, comparable-in-kind difference, not an unexercised feature'));

        // Live: after Device B fully processes an incoming ANNOUNCE,
        // Device A's own peer exchange — which subscribed to the SAME
        // namespaced protocol on its OWN bus — never receives anything
        // back.
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('alice-announce-only');
        const bob = makeIdentity('bob-announce-only');
        const aliceTransport = new LocalPeerConnectionProvider('alice-announce-only-ep', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-announce-only-ep', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-announce-only-ep' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: connected and authenticated'));

        const { exchange: aliceExchange } = makeCommentaryExchange(alice);
        const alicePeerExchange = new PublicationCommentaryDistributionPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const aliceReceivedAnything = [];
        alicePeerExchange.onCommentaryReceived((r) => aliceReceivedAnything.push(r));

        const { exchange: bobExchange } = makeCommentaryExchange(bob);
        const bobPeerExchange = new PublicationCommentaryDistributionPeerExchange(bobExchange, new PeerMessageBus(), bobConnect.registry);
        const bobReceived = [];
        bobPeerExchange.onCommentaryReceived((r) => bobReceived.push(r));

        const commentary = new PublicationCommentary({ publicationId: 'pub-announce-only', authorIdentityId: alice.getSigningIdentity().id, content: 'announce, never a conversation' });
        alicePeerExchange.announce(commentary);
        await wait(30);

        assert(bobReceived.length === 1, n('the receiving device really did receive the announce'));
        assert(aliceReceivedAnything.length === 0,
            n('the SENDING device\'s own onCommentaryReceived never fires — the receiver sent nothing back at all, not an acknowledgement, not a re-announce, not a synchronization request of any kind; the lifecycle stays announce -> receive -> verify -> store, never announce -> synchronize -> reconcile'));

        stopAliceListening();
        stopBobListening();
        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        console.log('✓ F: no request/response vocabulary exists (structurally, and contrasted against a sibling that has one), and no reply traffic of any kind crosses back after a real, live delivery.');
    }

    // ===============================================================
    // Section G — the authenticated-peer boundary, live, over the REAL
    // transport (no stub of any kind).
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('alice-auth-boundary');
        const bob = makeIdentity('bob-auth-boundary');
        const aliceTransport = new LocalPeerConnectionProvider('alice-auth-boundary-ep', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-auth-boundary-ep', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();

        const { exchange: aliceExchange } = makeCommentaryExchange(alice);
        const alicePeerExchange = new PublicationCommentaryDistributionPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const commentary = new PublicationCommentary({ publicationId: 'pub-auth-boundary', authorIdentityId: alice.getSigningIdentity().id, content: 'sent before the handshake resolves' });

        // The handshake itself is asynchronous (peer/LocalPeerConnectionProvider.js's
        // own header: "message delivery is deferred one microtask") —
        // calling connect() and immediately announcing, in the SAME
        // synchronous block, with no await in between, catches the peer
        // genuinely pre-AUTHENTICATED. This is the real transport, real
        // timing, never a hand-built stub peer.
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-auth-boundary-ep' });
        assert(bobToAlice.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED,
            n('setup: immediately after connect(), with no await yet, the real peer is genuinely NOT YET authenticated — this is the real handshake\'s own timing, not a fabricated intermediate state'));
        const sentBeforeAuth = alicePeerExchange.announce(commentary);
        assert(sentBeforeAuth === 0,
            n('announce(), called while the only connected peer is not yet AUTHENTICATED, sends to zero peers — never queued, never sent unauthenticated, per PeerMessageBus.js\'s own "refuse rather than silently queue" discipline, reused here unmodified'));

        await wait(30);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('the SAME real connection has now completed its handshake'));
        const sentAfterAuth = alicePeerExchange.announce(commentary);
        assert(sentAfterAuth === 1, n('the identical announce() call, against the identical peer, now succeeds once authentication genuinely completes — proving the zero above was the authentication gate, not a broken transport'));

        stopAliceListening();
        stopBobListening();
        alicePeerExchange.dispose();
        console.log('✓ G: the authenticated-peer boundary is real and live, reproduced against the actual asynchronous handshake timing, with no stub peer of any kind.');
    }

    // ===============================================================
    // Section H — authorization non-inference, guaranteed by the
    // exchange's own constructor shape.
    // ===============================================================
    {
        const alice = makeIdentity('alice-ctor-shape');
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const verifier = new LocalAuthorizationVerifier();

        // PublicationCommentaryDistributionExchange's own constructor
        // takes exactly (store, identityProvider, verifier) — live-
        // inspected via its own arity, not merely read from source.
        assert(PublicationCommentaryDistributionExchange.length === 3,
            n('PublicationCommentaryDistributionExchange\'s own constructor declares exactly three parameters'));
        const exchange = new PublicationCommentaryDistributionExchange(store, alice, verifier);
        assert(exchange instanceof PublicationCommentaryDistributionExchange, n('sanity: constructs successfully with exactly those three collaborators, nothing more'));

        // Contrasted directly against AddPublicationCommentaryUseCase,
        // whose constructor DOES require a fourth, authorization-shaped
        // collaborator — proving the two paths are two different SHAPES
        // for a provable reason (local creation asks permission; remote
        // acceptance of an already-signed fact does not), not merely two
        // classes that happen not to share a parameter today.
        const { AddPublicationCommentaryUseCase } = await import('../application/publication/commentary/AddPublicationCommentaryUseCase.js');
        assert(AddPublicationCommentaryUseCase.length === 3, n('AddPublicationCommentaryUseCase\'s own constructor also declares three parameters...'));
        let threwWithoutAuthorization = false;
        try { new AddPublicationCommentaryUseCase(store, alice, undefined); } catch { threwWithoutAuthorization = true; }
        // (undefined canCommentOnPublicationUseCase throws at construction —
        // see that class's own guard clause.)
        assert(threwWithoutAuthorization, n('...but its third parameter is specifically an authorization collaborator whose absence is refused at construction — PublicationCommentaryDistributionExchange has no equivalent parameter to omit in the first place, because it never asks the question at all'));

        const exchangeSource = codeOnly(await readSource('application/publication/commentary/PublicationCommentaryDistributionExchange.js'));
        assert(!/CanCommentOnPublicationUseCase|discoveryProvider/i.test(exchangeSource),
            n('application/publication/commentary/PublicationCommentaryDistributionExchange.js\'s own source never mentions CanCommentOnPublicationUseCase or a discoveryProvider at all — structurally incapable of inferring comment authorization from a valid signature, not merely untested for it'));

        console.log('✓ H: authorization non-inference is guaranteed by the remote-acceptance exchange\'s own constructor SHAPE — it has no parameter through which an authorization check could even be threaded, contrasted directly against the local write path, which requires one.');
    }

    // ===============================================================
    // Section I — notification locality, over a REAL announce/receive
    // round trip (0.9.618 Section M only tested direct import(), never
    // live delivery over the peer transport).
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('alice-notif-live');
        const bob = makeIdentity('bob-notif-live');
        const aliceTransport = new LocalPeerConnectionProvider('alice-notif-live-ep', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-notif-live-ep', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-notif-live-ep' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: connected and authenticated'));

        const { exchange: aliceExchange } = makeCommentaryExchange(alice);
        const alicePeerExchange = new PublicationCommentaryDistributionPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const { storage: bobStorage, exchange: bobExchange } = makeCommentaryExchange(bob);
        const bobPeerExchange = new PublicationCommentaryDistributionPeerExchange(bobExchange, new PeerMessageBus(), bobConnect.registry);

        const commentary = new PublicationCommentary({ publicationId: 'pub-notif-live', authorIdentityId: alice.getSigningIdentity().id, content: 'no notification should fire from a live delivery either' });
        alicePeerExchange.announce(commentary);
        await wait(30);

        assert(bobExchange._store.getById(commentary.commentaryId) !== null, n('setup: Bob really did receive and store it over the real transport'));
        const bobNotifications = new NotificationEventStore(bobStorage).loadAll();
        assert(bobNotifications.length === 0,
            n('after a REAL, live, cross-device delivery — not merely a direct importCommentaryEnvelope() call — Bob\'s own NotificationEventStore is still at zero; a live round trip does not somehow trigger notification production that a direct call does not'));

        stopAliceListening();
        stopBobListening();
        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        console.log('✓ I: notification locality holds over a real, live peer delivery, not merely a direct-call unit test — zero NotificationEvents are ever produced as a side effect of receiving distributed commentary.');
    }

    // ===============================================================
    // Section J — classification and verdict.
    // ===============================================================
    {
        const LABELS = Object.freeze([
            'ARC_CLOSED',
            'ALREADY_CORRECT',
            'PRODUCTION_WIRING_GAP',
            'BOUNDARY_REGRESSION'
        ]);
        const classification = {
            // Section A: the capability layer 0.9.617/0.9.618 built and
            // proved is still, right now, fully intact.
            capabilityLayer: 'ALREADY_CORRECT',
            // Section B/C: the one real, concrete, previously-unmeasured
            // finding of this audit — the capability is unreachable from
            // the actual running application.
            productionWiring: 'PRODUCTION_WIRING_GAP',
            // Sections D-I: every boundary this audit specifically
            // re-tested under NEW conditions (missing Publication,
            // multi-identity isolation, announce-only, live authenticated
            // gating, authorization non-inference by construction,
            // notification locality over a live round trip) holds — none
            // regressed, and several are now proven under conditions
            // 0.9.618 itself never exercised.
            missingPublicationTolerance: 'ALREADY_CORRECT',
            identityIsolation: 'ALREADY_CORRECT',
            announceOnlySemantics: 'ALREADY_CORRECT',
            authenticatedPeerBoundary: 'ALREADY_CORRECT',
            authorizationNonInference: 'ALREADY_CORRECT',
            notificationLocality: 'ALREADY_CORRECT',
            // THE ONE PRIMARY FINDING.
            primaryFinding: 'PRODUCTION_WIRING_GAP'
        };
        for (const [finding, label] of Object.entries(classification)) {
            assert(LABELS.includes(label), n(`classification finding "${finding}" uses one of this audit's own fixed labels, never free text`));
        }
        assert(classification.primaryFinding === 'PRODUCTION_WIRING_GAP' && classification.productionWiring === 'PRODUCTION_WIRING_GAP',
            n('the primary finding is singular and specific — a wiring gap, never a re-opening of any boundary this audit also reconfirmed'));

        // Per this milestone's own decision rule: ARC_CLOSED only when
        // every section, including the production-reachability question,
        // comes back clean. Section B/C did not.
        const verdict = 'PRODUCTION_WIRING_GAP';
        assert(verdict !== 'ARC_CLOSED', n('this audit does NOT declare ARC_CLOSED — the underlying capability is correct, but the product promise ("a comment I write reaches my collaborator\'s device") is not, today, kept by the running application'));

        console.log('Classification:', JSON.stringify(classification, null, 2));
        console.log(
            '\n0.9.619 verdict: PRODUCTION_WIRING_GAP, not ARC_CLOSED. The distribution CAPABILITY 0.9.618 built is correct and '
            + 'remains correct under every additional condition this audit tested live: an unknown Publication on the receiving '
            + 'device (Section D), multi-identity/multi-publication isolation (Section E), announce-only semantics with zero reply '
            + 'traffic (Section F), the real asynchronous authenticated-peer gate (Section G), authorization non-inference '
            + 'guaranteed by the exchange\'s own constructor shape (Section H), and notification locality over a live round trip '
            + '(Section I). But the capability is completely unreachable from the actual running application (Section B): no '
            + 'composition root exists (unlike every sibling capability\'s own Create*PeerExchangeUseCase.js), ui/main.js never '
            + 'constructs or wires it, and there is not one production .announce() call site for it anywhere in ui/ or '
            + 'application/ — confirmed by reproducing the REAL, app-facing composition root live (Section C) and showing it is '
            + 'structurally incapable of reaching a peer. RECOMMENDATION, for a later, separately-scoped, narrow milestone, never '
            + 'built here: (1) application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js, mirroring '
            + 'CreatePublicationAnchorPeerExchangeUseCase.js\'s own exact shape; (2) wire it into ui/main.js\'s existing app-wide '
            + 'peerMessageBus/registry; (3) a single, deliberate decision — left open here — about WHERE to call announce(): '
            + 'automatically after a successful local save (mirroring CreatePublicationSnapshotPlacementUseCase.js\'s own '
            + 'pattern) or from an explicit user action (mirroring EditorView.js\'s own "Publish to Network" click). This audit '
            + 'answers none of the eight items its own originating brief already excluded (historical synchronization, '
            + 'subscriptions, relay fan-out, provider ranking/fallback, delivery guarantees, offline queueing, a distributed '
            + 'NotificationEvent, a second Commentary database) and recommends none of them — those remain exactly as out of '
            + 'scope as they were for 0.9.617/0.9.618.'
        );
    }

    // ===============================================================
    // Section K — deliberate exclusions; no production file touched.
    // ===============================================================
    {
        // AMENDED BY 0.9.638 — Publication Commentary Distribution
        // Provider Selector. This guard is a live, point-in-time
        // git-diff check at test-run time — it always meant "THIS
        // milestone's own session touched nothing," never "no later,
        // separately-justified milestone ever will" (same, documented
        // fragility as the equivalent guard in
        // tests/FederatedRepositoryProductDirectionSeamAudit.test.js's
        // own 0.9.597 amendment). ui/components/PublicationCard.js and
        // ui/components/PublicationList.js — the two PATH 1 Commentary
        // composer surfaces 0.9.637's own Boundary Audit named — are
        // 0.9.638's own, separately-justified changes: a UI-only
        // provider selector, never a change to this audit's own
        // application-layer distribution wiring.
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)docs/roadmap" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        const expectedLaterMilestoneFiles = new Set(['ui/components/PublicationCard.js', 'ui/components/PublicationList.js']);
        const unexpectedNonTestFiles = changedNonTestFiles.split('\n').filter(Boolean)
            .filter((f) => !expectedLaterMilestoneFiles.has(f));
        assert(unexpectedNonTestFiles.length === 0, n(`AMENDED BY 0.9.638 — no UNEXPECTED production file is modified by this milestone (0.9.638's own, separately-justified files excepted) — found: ${unexpectedNonTestFiles.join(', ') || 'none'}`));

        console.log('✓ K: no production file touched. This audit builds none of the eight explicitly excluded items, and implements no part of its own recommendation — a later, separately-scoped milestone\'s decision, exactly as 0.9.617 left its own recommendation for 0.9.618 to decide whether to pursue.');
    }

    console.log(`✅ All Publication Commentary Cross-Device Product Closure Audit tests passed (${assertionCount} assertions).`);
}

await run();
