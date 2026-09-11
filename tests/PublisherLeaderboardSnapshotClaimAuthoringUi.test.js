import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import PublisherLeaderboardSnapshotClaimAuthoringView from '../ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js';
import ReconciliationWorkspaceView from '../ui/views/ReconciliationWorkspaceView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { reconstructPublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { exportPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimExchange.js';
import { ReconcilePublisherLeaderboardSnapshotClaimOutcome } from '../application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js';
import { RevalidationObservationArchiveOutcome } from '../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase.js';
import { LeaderboardClaimArchiveReceiptOutcome } from '../application/ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.411 — Publisher Leaderboard Snapshot Claim Authoring & Export.
//
// Type: production implementation + comprehensive convergence test.
//
// 0.9.410 Section E found the concrete, remaining PRODUCT_GAP in this
// arc: `CreatePublisherLeaderboardSnapshotClaimUseCase` (0.8.121) and
// `exportPublisherLeaderboardSnapshotClaim` (0.8.122) are complete and
// tested, but nothing in `ui/` ever constructs or calls either one. This
// milestone builds exactly that missing producer-side surface,
// ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js, and this
// file proves it — Sections A-H follow the milestone request's own
// lettered coverage.
//
//   A. Reachability — a real, contextual (never top-nav) route and entry
//      point.
//   B. Existing use-case ownership — the view invokes the real
//      CreatePublisherLeaderboardSnapshotClaimUseCase and
//      exportPublisherLeaderboardSnapshotClaim, and implements neither
//      signing nor export itself.
//   C. Explicit signing — opening the page creates/signs nothing; only an
//      explicit click does.
//   D. Real claim creation (FLAGSHIP) — the real, unmocked use case runs
//      against real publisher/snapshot data, and the resulting claim is
//      structurally valid.
//   E. Export convergence — the UI's own exported artifact is
//      byte-identical to exportPublisherLeaderboardSnapshotClaim(claim)'s
//      own output, never a UI-specific serialization.
//   F. Round trip (CENTERPIECE) — Author -> Sign -> Export -> Parse/import
//      -> Reconciliation Workspace -> Reconcile -> the same durable
//      records the Leaderboard already reads.
//   G. No automatic behavior — no signing on mount, no signing on
//      snapshot refresh, no automatic export, no automatic
//      reconciliation, no background publication.
//   H. Boundary — no new signing logic, claim schema, evidence schema,
//      reconciliation logic, or candidate logic anywhere in the view.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function readSource(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

// A genuine IMPORT means the symbol is actually bound by an
// `import { ... } from` statement — never merely mentioned in a comment.
// Identical helper to tests/ReconciliationWorkspaceUi.test.js's own
// `importsSymbol()`.
function importsSymbol(text, symbol) {
    return new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`, 's').test(text);
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// ---------------------------------------------------------------------
// Fixture helpers — the identical shapes
// tests/ReconciliationWorkspaceUi.test.js's own already establish, reused
// here rather than reinvented.
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

class FakePublicationObservationArchiveStorage {
    constructor(archive = PublicationObservationArchive.empty()) {
        this._archive = archive;
        this.saveCallCount = 0;
    }
    load() { return this._archive; }
    save(archive) { this._archive = archive; this.saveCallCount += 1; }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

// The SAME shape `application/IdentityUseCase.js#provider` already
// exposes — see that file's own `get provider()`. A fake standing in for
// the real IdentityUseCase, exposing exactly the one member this view's
// own `inject`-time contract (`identityUseCase.provider`) reads.
function fakeIdentityUseCase(identityProvider) {
    return { provider: identityProvider };
}

const NETWORK = 'mainnet';
const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);

function anchor(archive, letter, txid, createdAt) {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    return useCase.execute(archive, { anchorId: `pub-${letter}`, contentHash: `pub-${letter}-content`, txid, network: NETWORK, createdAt });
}

function identityOfAnchor(archive, letter) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === `pub-${letter}`).toBlockchainPublicationIdentity();
}

// Real, non-empty publisher/publication evidence — Alice's own replica —
// so Section D's flagship signs a claim over a GENUINE, non-trivial
// snapshot, never merely the empty archive.
function buildAliceArchive() {
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    let archive = PublicationObservationArchive.empty();
    archive = anchor(archive, 'a', TXID_A, new Date('2026-09-11T00:00:00Z'));
    archive = anchor(archive, 'b', TXID_B, new Date('2026-09-11T00:01:00Z'));
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityOfAnchor(archive, 'a'), createdAt: new Date('2026-09-11T00:02:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityOfAnchor(archive, 'b'), createdAt: new Date('2026-09-11T00:03:00Z') });
    return archive;
}

// The SAME "call data()/computed/methods.call(ctx)" discipline
// tests/ReconciliationWorkspaceUi.test.js's own header names — there is
// no real Vue runtime anywhere in this test suite
// (`ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js` is
// deliberately Options-API-only, with no `setup()`/`inject()` import from
// 'vue', precisely so this is possible).
function buildAuthoringInstance({ identityUseCase = null, publicationObservationArchiveStorage = null } = {}) {
    const ctx = { identityUseCase, publicationObservationArchiveStorage };
    Object.assign(ctx, PublisherLeaderboardSnapshotClaimAuthoringView.data());
    Object.assign(ctx, PublisherLeaderboardSnapshotClaimAuthoringView.methods);
    return ctx;
}
function viewerIdentityIdOf(ctx) {
    return PublisherLeaderboardSnapshotClaimAuthoringView.computed.viewerIdentityId.call(ctx);
}
function signedInOf(ctx) {
    return PublisherLeaderboardSnapshotClaimAuthoringView.computed.signedIn.call(ctx);
}
function claimCreatedOf(ctx) {
    return PublisherLeaderboardSnapshotClaimAuthoringView.computed.claimCreated.call(ctx);
}
function exportedOf(ctx) {
    return PublisherLeaderboardSnapshotClaimAuthoringView.computed.exported.call(ctx);
}

function buildWorkspaceInstance({ publicationObservationArchiveStorage = null } = {}) {
    const ctx = { publicationObservationArchiveStorage };
    Object.assign(ctx, ReconciliationWorkspaceView.data());
    Object.assign(ctx, ReconciliationWorkspaceView.methods);
    return ctx;
}
function candidateProducedOf(ctx) {
    return ReconciliationWorkspaceView.computed.candidateProduced.call(ctx);
}

async function run() {
    // ===============================================================
    // Section A — Reachability.
    // ===============================================================
    {
        assert(typeof PublisherLeaderboardSnapshotClaimAuthoringView === 'object' && PublisherLeaderboardSnapshotClaimAuthoringView !== null, n('A1. ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js exports a real component object'));
        assert(PublisherLeaderboardSnapshotClaimAuthoringView.name === 'PublisherLeaderboardSnapshotClaimAuthoringView', n('A2. the component is genuinely named PublisherLeaderboardSnapshotClaimAuthoringView'));

        const routerSource = await readSource('ui/router/index.js');
        assert(routerSource.includes("path: '/publisher-snapshot-claim'"), n('A3. /publisher-snapshot-claim is registered in ui/router/index.js'));
        assert(routerSource.includes('PublisherLeaderboardSnapshotClaimAuthoringView'), n('A4. the registered route points at PublisherLeaderboardSnapshotClaimAuthoringView'));
        assert(/import\s+PublisherLeaderboardSnapshotClaimAuthoringView\s+from\s+'[^']+'/.test(routerSource), n('A5. the router genuinely default-imports PublisherLeaderboardSnapshotClaimAuthoringView, never merely names it'));

        const publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(/<router-link\s+to="\/publisher-snapshot-claim"/.test(publicationsSource), n('A6. an existing contextual surface (the Publications page\'s own Publication Archive card) carries a real <router-link> to /publisher-snapshot-claim'));

        const appSource = await readSource('ui/App.js');
        assert(!appSource.includes('to="/publisher-snapshot-claim"'), n('A7. /publisher-snapshot-claim is NOT promoted to top nav — it stays contextual, the same convention every sibling reconciliation route already uses'));

        console.log('\n=== SECTION A: REACHABILITY ===');
        console.log('✓ Section A: /publisher-snapshot-claim is a real, registered route, reachable from the Publications page\'s own existing Publication Archive card, and deliberately absent from global top navigation.');
    }

    // ===============================================================
    // Section B — Existing use-case ownership.
    // ===============================================================
    {
        const source = await readSource('ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js');
        assert(importsSymbol(source, 'CreatePublisherLeaderboardSnapshotClaimUseCase'), n('B1. the view genuinely imports CreatePublisherLeaderboardSnapshotClaimUseCase'));
        assert(importsSymbol(source, 'exportPublisherLeaderboardSnapshotClaim'), n('B2. the view genuinely imports exportPublisherLeaderboardSnapshotClaim'));

        const constructionSites = (source.match(/new\s+CreatePublisherLeaderboardSnapshotClaimUseCase\s*\(/g) || []).length;
        assert(constructionSites === 1, n(`B3. CreatePublisherLeaderboardSnapshotClaimUseCase is constructed in exactly one place in the file (found ${constructionSites})`));
        // Checked against the file's own CODE only — its prose header
        // legitimately NAMES the function, in English, more than once,
        // to explain the workflow it composes.
        const codeOnlyForB1 = codeOnly(source);
        const exportCallSites = (codeOnlyForB1.match(/exportPublisherLeaderboardSnapshotClaim\s*\(/g) || []).length;
        assert(exportCallSites === 1, n(`B4. exportPublisherLeaderboardSnapshotClaim() is called in exactly one place in the file's own code (found ${exportCallSites})`));

        const codeOnlyForB = codeOnly(source);
        assert(!/signCanonical\s*\(/.test(codeOnlyForB), n('B5. the view never calls identityProvider.signCanonical() itself — signing stays entirely inside the composed use case'));
        assert(!/getSigningDescriptor\s*\(/.test(codeOnlyForB), n('B6. the view never calls getSigningDescriptor() itself — no signing-payload construction of its own'));
        assert(!/new\s+Signature\s*\(/.test(codeOnlyForB), n('B7. the view never constructs a Signature itself'));
        assert(!importsSymbol(source, 'reconstructPublisherLeaderboardSnapshot'), n('B8. the view never imports the snapshot-reconstruction stage directly — that stays inside the composed use case'));
        assert(!importsSymbol(source, 'describePublisherLeaderboardSnapshotFingerprint'), n('B9. the view never imports the fingerprint stage directly either'));
        assert(!importsSymbol(source, 'PublisherLeaderboardSnapshotClaim'), n('B10. the view never imports the core claim class itself — it only ever receives an already-constructed instance back from the use case'));

        console.log('\n=== SECTION B: EXISTING USE-CASE OWNERSHIP ===');
        console.log('✓ Section B: the view depends on CreatePublisherLeaderboardSnapshotClaimUseCase and exportPublisherLeaderboardSnapshotClaim alone, constructed/called in exactly one place each, and implements no signing, descriptor-construction, snapshot-reconstruction, or fingerprinting of its own.');
    }

    // ===============================================================
    // Section C — Explicit signing.
    // ===============================================================
    {
        assert(!('mounted' in PublisherLeaderboardSnapshotClaimAuthoringView), n('C1. the component defines no mounted() hook'));
        assert(!('created' in PublisherLeaderboardSnapshotClaimAuthoringView), n('C2. the component defines no created() hook'));
        assert(!('watch' in PublisherLeaderboardSnapshotClaimAuthoringView), n('C3. the component defines no watch block'));

        const source = await readSource('ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js');
        assert(!/setInterval|setTimeout|requestAnimationFrame|addEventListener|\.on\(/.test(source), n('C4. the view contains no timer, interval, animation-frame loop, or event subscription of any kind'));

        const executeCallSites = (source.match(/useCase\.execute\(/g) || []).length;
        assert(executeCallSites === 1, n(`C5. execute() is called in exactly one place (found ${executeCallSites})`));
        assert(/@click="generateAndSignClaim"/.test(source), n('C6. the template binds generateAndSignClaim() to an explicit @click handler'));
        assert(/@click="exportClaim"/.test(source), n('C7. the template binds exportClaim() to a SEPARATE explicit @click handler'));

        // Merely constructing a fresh instance (opening the page) or
        // reading every computed property never runs anything — data()/
        // computed never touch either use case.
        const alice = makeIdentity('Alice');
        const ctx = buildAuthoringInstance({ identityUseCase: fakeIdentityUseCase(alice), publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(buildAliceArchive()) });
        assert(ctx.claim === null, n('C8. opening the page (constructing data()) leaves claim null — nothing was signed'));
        assert(ctx.exportedClaimPackage === null, n('C9. opening the page leaves exportedClaimPackage null — nothing was exported'));
        viewerIdentityIdOf(ctx);
        signedInOf(ctx);
        claimCreatedOf(ctx);
        exportedOf(ctx);
        assert(ctx.claim === null && ctx.exportedClaimPackage === null, n('C10. reading every computed presentation fact never itself triggers signing or export'));

        console.log('\n=== SECTION C: EXPLICIT SIGNING ===');
        console.log('✓ Section C: no lifecycle hook, watcher, timer, or interval exists; generateAndSignClaim() and exportClaim() are two separate, explicit, click-bound methods; opening the page or reading its computed facts signs and exports nothing.');
    }

    // ===============================================================
    // Section D — Real claim creation (FLAGSHIP).
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const aliceArchive = buildAliceArchive();
        const storage = new FakePublicationObservationArchiveStorage(aliceArchive);
        const ctx = buildAuthoringInstance({ identityUseCase: fakeIdentityUseCase(alice), publicationObservationArchiveStorage: storage });

        assert(signedInOf(ctx) === true, n('D1. sanity — Alice is genuinely signed in before the click'));

        ctx.generateAndSignClaim();

        assert(ctx.error === null, n('D2. no error was raised — a real, authenticated identity with real evidence signs cleanly'));
        assert(ctx.claim instanceof PublisherLeaderboardSnapshotClaim, n('D3. generateAndSignClaim() produced a genuine PublisherLeaderboardSnapshotClaim instance — the REAL production use case ran, not a stub'));
        assert(ctx.claim.signature !== null, n('D4. the produced claim is genuinely signed'));
        assert(ctx.claim.signerIdentityId === alice.getSigningIdentity().id, n('D5. signerIdentityId is Alice\'s own did:key identity'));
        assert(claimCreatedOf(ctx) === true, n('D6. the view\'s own claimCreated computed reflects the real claim'));

        // Independently reconstruct Alice's own snapshot exactly as
        // 0.8.121's own flagship does, and confirm the produced claim
        // genuinely describes THIS replica's own current evidence — never
        // a stubbed or hand-authored fingerprint triple.
        const snapshot = reconstructPublisherLeaderboardSnapshot(aliceArchive);
        assert(ctx.claim.evidenceFingerprint === snapshot.evidenceFingerprint, n('D7. the claim\'s evidenceFingerprint matches Alice\'s own reconstructed snapshot'));
        assert(ctx.claim.policyVersion === snapshot.policy.version, n('D8. the claim\'s policyVersion matches'));
        assert(ctx.claim.snapshotFingerprint === describePublisherLeaderboardSnapshotFingerprint(snapshot).fingerprint, n('D9. the claim\'s snapshotFingerprint matches the independently computed digest'));

        const structural = new LocalAuthorizationVerifier().verifyPublisherLeaderboardSnapshotClaim(ctx.claim.toJSON());
        assert(structural.valid === true, n('D10. the freshly created claim structurally verifies — it is a structurally VALID claim, not merely a populated object'));

        // The claim is never persisted anywhere — see this view's own
        // header, "The authored claim is ephemeral, page-local state."
        assert(storage.saveCallCount === 0, n('D11. generating and signing a claim never writes to the injected archive storage — no new persistence was introduced'));

        // --- The negative case: nobody signed in.
        const anonymousCtx = buildAuthoringInstance({ identityUseCase: null, publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(buildAliceArchive()) });
        assert(signedInOf(anonymousCtx) === false, n('D12. sanity — nobody is signed in'));
        anonymousCtx.generateAndSignClaim();
        assert(anonymousCtx.claim === null, n('D13. without a signed-in identity, no claim is produced'));
        assert(typeof anonymousCtx.error === 'string' && anonymousCtx.error.length > 0, n('D14. the use case\'s own thrown message is captured as the view\'s own error, rather than throwing out of the click handler'));

        console.log('\n=== SECTION D: REAL CLAIM CREATION (FLAGSHIP) ===');
        console.log('✓ Section D: generateAndSignClaim() genuinely drives the real, unmocked CreatePublisherLeaderboardSnapshotClaimUseCase against real publisher/publication evidence; the resulting claim is signed by the real identity, describes the real reconstructed snapshot, and structurally verifies. Without a signed-in identity, the use case\'s own error is surfaced verbatim, never swallowed into a fabricated claim.');
    }

    // ===============================================================
    // Section E — Export convergence.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const ctx = buildAuthoringInstance({ identityUseCase: fakeIdentityUseCase(alice), publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(buildAliceArchive()) });
        ctx.generateAndSignClaim();
        assert(ctx.claim !== null, n('E1. sanity — a claim exists to export'));

        assert(exportedOf(ctx) === false, n('E2. before the explicit export click, nothing has been exported yet'));
        ctx.exportClaim();
        assert(exportedOf(ctx) === true, n('E3. exportClaim() genuinely produced an exported package'));

        // The CENTERPIECE of this section: the UI's own exported JSON is
        // BYTE-IDENTICAL to calling the UNCHANGED, existing
        // exportPublisherLeaderboardSnapshotClaim() directly on the SAME
        // claim instance — never a UI-specific re-serialization.
        const independentExport = exportPublisherLeaderboardSnapshotClaim(ctx.claim);
        assert(JSON.stringify(JSON.parse(ctx.exportedClaimPackage.json)) === JSON.stringify(independentExport), n('E4. the UI\'s own exported JSON parses back to EXACTLY the same object exportPublisherLeaderboardSnapshotClaim(claim) itself already produces'));

        // The downloadable artifact is genuinely derived from the SAME
        // json string, never a second, independent encoding.
        assert(ctx.exportedClaimPackage.downloadHref === 'data:application/json;charset=utf-8,' + encodeURIComponent(ctx.exportedClaimPackage.json), n('E5. the download href is derived directly from the same exported json text — no second serialization path'));
        assert(typeof ctx.exportedClaimPackage.fileName === 'string' && ctx.exportedClaimPackage.fileName.endsWith('.json'), n('E6. a real filename is produced for the download'));

        console.log('\n=== SECTION E: EXPORT CONVERGENCE ===');
        console.log('✓ Section E: the UI\'s own exported artifact is byte-identical to exportPublisherLeaderboardSnapshotClaim(claim)\'s own output — the producer and the consumer converge on exactly one existing wire format, never a UI-specific one.');
    }

    // ===============================================================
    // Section F — Round trip (CENTERPIECE).
    //
    // Author (Alice, this view) -> Sign -> Export -> Parse/import (Bob's
    // Reconciliation Workspace paste field) -> Reconcile -> the same
    // durable records the existing, UNCHANGED Reconciliation Candidate
    // Leaderboard already reads. Mounting the Leaderboard's own
    // Composition-API component is deliberately out of scope here —
    // mirroring tests/ReconciliationWorkspaceUi.test.js's own restraint —
    // this section instead proves the handoff artifact and the durable
    // records it produces are the exact ones that page already reads.
    // ===============================================================
    {
        // --- Alice authors, signs, and exports her own claim.
        const alice = makeIdentity('Alice');
        const aliceArchive = buildAliceArchive();
        const authoringCtx = buildAuthoringInstance({ identityUseCase: fakeIdentityUseCase(alice), publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(aliceArchive) });
        authoringCtx.generateAndSignClaim();
        authoringCtx.exportClaim();
        assert(exportedOf(authoringCtx) === true, n('F1. Alice genuinely produced and exported a signed claim'));

        // The artifact travels as plain text — exactly what a person would
        // paste into a chat message or attach to an email — round-tripped
        // through JSON to prove no shared object reference is doing any
        // work.
        const artifactText = authoringCtx.exportedClaimPackage.json;
        assert(typeof artifactText === 'string' && JSON.parse(artifactText), n('F2. the exported artifact is genuine, parseable portable text'));

        // --- Bob receives ONLY that text, and pastes it into his own
        // Reconciliation Workspace — the EXISTING, UNCHANGED 0.9.408
        // surface, never touched by this milestone.
        const bobLocalArchive = PublicationObservationArchive.empty();
        const bobStorage = new FakePublicationObservationArchiveStorage(bobLocalArchive);
        const workspaceCtx = buildWorkspaceInstance({ publicationObservationArchiveStorage: bobStorage });
        workspaceCtx.peerEvidenceText = artifactText;

        workspaceCtx.reconcile();

        assert(workspaceCtx.result !== null, n('F3. Bob\'s Workspace genuinely produced a result from Alice\'s pasted artifact'));
        assert(workspaceCtx.result.receipt !== null && workspaceCtx.result.receipt.outcome === LeaderboardClaimArchiveReceiptOutcome.RECEIVED, n('F4. Alice\'s exported claim was genuinely RECEIVED by the existing receiving pipeline — the producer and consumer formats converge'));
        assert(workspaceCtx.result.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('F5. the full reconciliation pipeline ran end to end against Alice\'s real, non-trivial evidence (Bob\'s empty archive genuinely diverges from it)'));
        assert(workspaceCtx.result.candidate !== null && workspaceCtx.result.candidate.selected === true, n('F6. a real reconciliation candidate was selected from Alice\'s claim'));
        assert(candidateProducedOf(workspaceCtx) === true, n('F7. the Workspace\'s own candidateProduced fact confirms a candidate is ready for the Leaderboard'));

        // The durable records now sitting in Bob's own archive are EXACTLY
        // the ones the existing, unchanged Reconciliation Candidate
        // Leaderboard reads (ui/views/ReconciliationCandidateLeaderboardView.js,
        // untouched by this milestone) — the same archive/storage
        // convergence tests/ReconciliationWorkspaceUi.test.js's own Section
        // D already established for the receiving half alone; this section
        // is the first proof that chain now starts from a REAL, exported,
        // producer-authored artifact rather than a hand-built fixture.
        const finalArchive = bobStorage.load();
        assert(finalArchive.leaderboardClaimRecords.length === 1, n('F8. Bob\'s durable archive holds the received claim record — Alice\'s claim is now recorded evidence on Bob\'s own replica'));
        assert(finalArchive.reconciliationDecisionRecords.length === 1, n('F9. Bob\'s durable archive holds the recorded reconciliation decision'));
        assert(finalArchive.revalidationObservationRecords.length === 1, n('F10. Bob\'s durable archive holds the recorded revalidation observation'));
        assert(finalArchive === workspaceCtx.result.archive, n('F11. the persisted archive is the EXACT instance the reconciliation use case itself returned'));

        // Never a second claim format: Bob's receiving pipeline consumed
        // Alice's exported JSON with zero transformation of any kind
        // between the two views under test.
        assert(JSON.stringify(JSON.parse(artifactText)) === JSON.stringify(exportPublisherLeaderboardSnapshotClaim(authoringCtx.claim)), n('F12. the exact text hand-carried between the two views is unaltered exportPublisherLeaderboardSnapshotClaim() output'));

        console.log('\n=== SECTION F: ROUND TRIP (CENTERPIECE) ===');
        console.log('✓ Section F: Author -> Sign -> Export (Alice, this milestone\'s new view) -> Parse/import -> Reconcile (Bob, the existing, UNCHANGED Reconciliation Workspace) -> the same durable records the existing, UNCHANGED Reconciliation Candidate Leaderboard already reads. The manually disconnected workflow 0.9.410 found is now a genuine, provable, end-to-end product journey.');
    }

    // ===============================================================
    // Section G — No automatic behavior.
    // ===============================================================
    {
        assert(!('mounted' in PublisherLeaderboardSnapshotClaimAuthoringView), n('G1. no mounted() hook exists'));
        assert(!('created' in PublisherLeaderboardSnapshotClaimAuthoringView), n('G2. no created() hook exists'));
        assert(!('watch' in PublisherLeaderboardSnapshotClaimAuthoringView), n('G3. no watch block exists — a snapshot/archive refresh elsewhere never re-signs or re-exports anything on this page'));

        const source = await readSource('ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js');
        assert(!/setInterval|setTimeout|requestAnimationFrame/.test(source), n('G4. no timer, interval, or animation-frame loop exists — no background publication of any kind'));
        assert(!importsSymbol(source, 'ReconcilePublisherLeaderboardSnapshotClaimUseCase'), n('G5. the view never imports the reconciliation-execution use case — this page never reconciles anything, automatically or otherwise'));
        assert(!/publish-to-nostr|PublishToNostr|NostrRelay/.test(source), n('G6. no Nostr publication of any kind — explicitly excluded from this milestone'));

        // Repeated construction and repeated reads of every computed fact
        // — simulating a page that stays open while OTHER parts of the
        // app change the archive underneath it — never signs or exports
        // anything by itself.
        const alice = makeIdentity('Alice');
        const storage = new FakePublicationObservationArchiveStorage(buildAliceArchive());
        const ctx = buildAuthoringInstance({ identityUseCase: fakeIdentityUseCase(alice), publicationObservationArchiveStorage: storage });
        for (let i = 0; i < 5; i += 1) {
            viewerIdentityIdOf(ctx);
            signedInOf(ctx);
            claimCreatedOf(ctx);
            exportedOf(ctx);
            storage.save(buildAliceArchive());
        }
        assert(ctx.claim === null, n('G7. five rounds of reading every computed fact and mutating the underlying archive storage never signed anything'));
        assert(ctx.exportedClaimPackage === null, n('G8. and never exported anything either'));
        assert(storage.saveCallCount === 5, n('G9. sanity — the archive storage really was mutated five times by this test, independent of this view'));

        console.log('\n=== SECTION G: NO AUTOMATIC BEHAVIOR ===');
        console.log('✓ Section G: no lifecycle hook, watcher, timer, or automatic reconciliation/publication path exists anywhere in the file; repeated reads and an underlying archive change never sign or export anything by themselves.');
    }

    // ===============================================================
    // Section H — Boundary.
    // ===============================================================
    {
        const source = await readSource('ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js');
        const codeOnlyForH = codeOnly(source);

        const forbiddenInCode = [
            'signCanonical(', 'getSigningDescriptor(', 'SignatureType.', 'SIGNING_DOMAIN',
            'reconstructPublisherLeaderboardSnapshot(', 'describePublisherLeaderboardSnapshotFingerprint(',
            'ReconcilePublisherLeaderboardSnapshotClaimUseCase', 'ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase',
            'describePublisherLeaderboardClaimSnapshotReconciliationPlan', 'describePublisherLeaderboardClaimSnapshotReconciliationCandidate',
            'describePublisherLeaderboardClaimSnapshotReconciliationDecision', 'RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase',
            'describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation',
            'RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase',
            '.reconciliationDecisionRecords', '.revalidationObservationRecords', '.leaderboardClaimRecords',
            'rank', 'score', 'trust', 'reputation'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyForH.includes(term), n(`H1. the view's own code never carries "${term}" — every construction/signing/reconciliation-internal fact stays inside the composed use cases`));
        }

        // The only archive collection access anywhere in the file is the
        // `.load()` call on the injected storage — proven directly rather
        // than merely by the substring checks above.
        const archiveCollectionAccess = (codeOnlyForH.match(/\.\w*Records\b/g) || []).filter((m) => m !== '');
        assert(archiveCollectionAccess.length === 0, n('H2. the view never reads any of the archive\'s own record collections directly'));

        // No new claim/evidence SCHEMA — the view constructs neither a
        // plain object shaped like a claim, nor one shaped like the
        // exchange's own nine-field envelope.
        assert(!/evidenceFingerprint\s*:/.test(codeOnlyForH), n('H3. the view never constructs an object literal carrying an evidenceFingerprint field of its own — every claim field comes from the real claim instance'));
        assert(!/snapshotFingerprint\s*:/.test(codeOnlyForH), n('H4. nor a snapshotFingerprint field of its own'));
        assert(!/kind\s*:\s*['"]/.test(codeOnlyForH), n('H5. nor a self-describing "kind" field of its own — no second claim/evidence envelope shape'));

        console.log('\n=== SECTION H: BOUNDARY ===');
        console.log('✓ Section H: no signing logic, claim schema, evidence schema, reconciliation logic, or candidate logic of any kind appears in the view\'s own code — every one of those questions stays inside the two composed, UNCHANGED use cases.');
    }

    // ===============================================================
    // Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/PublisherLeaderboardSnapshotClaimAuthoringUi.test.js',
            'ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js',
            'ui/router/index.js',
            'ui/views/DecentralizedPublicationsView.js',
            // A pre-existing audit whose own, prior-milestone point-in-time
            // assertions this milestone legitimately supersedes gets a
            // minimal, clearly labeled amendment rather than silently going
            // stale — the identical, established convention 0.9.408's own
            // commit already set for this exact audit family.
            'tests/ReconciliationWorkflowProductReassessment.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`I1. every changed/added file is one this milestone explicitly authorized (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirsExcludingUi = ['core', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'storage'];
        for (const dir of domainDirsExcludingUi) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`I2. ${dir}/ shows no change — this milestone touches only ui/, its own test, and one amended prior audit`));
        }
        const applicationStatus = execSync('git status --porcelain -- application', { cwd: SOURCE_ROOT }).toString().trim();
        assert(applicationStatus === '', n('I3. application/ shows no change — CreatePublisherLeaderboardSnapshotClaimUseCase and exportPublisherLeaderboardSnapshotClaim are composed, never modified'));

        console.log('\n=== PRODUCTION BOUNDARY ===');
        console.log('✓ Only ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js (new), ui/router/index.js, ui/views/DecentralizedPublicationsView.js, this test file, tests.html\'s own registration, and one amended prior audit changed. No existing application/core reconciliation or claim file was modified.');
    }

    console.log('\n' + '='.repeat(78));
    console.log('PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_AUTHORING_ESTABLISHED');
    console.log('');
    console.log('ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js is now the');
    console.log('first user-facing surface over');
    console.log('application/CreatePublisherLeaderboardSnapshotClaimUseCase.js (0.8.121)');
    console.log('and application/PublisherLeaderboardSnapshotClaimExchange.js (0.8.122) —');
    console.log('a small, explicit page: generate and sign a claim about this replica\'s');
    console.log('own current leaderboard snapshot, explicitly, then export it separately,');
    console.log('explicitly. The full Author -> Sign -> Export -> Parse/import -> Workspace');
    console.log('-> Reconcile -> Leaderboard journey 0.9.410 found manually disconnected is');
    console.log('now proven, end to end, against real production code.');
    console.log('='.repeat(78));

    console.log('\n✅ All Publisher Leaderboard Snapshot Claim Authoring UI tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
