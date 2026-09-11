import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.406 — Reconciliation Front-Door Product Direction Audit.
//
// **Type: test-only, decision artifact. No production changes.**
//
// 0.9.405 answered "is something missing?" — YES, and not a single wiring
// edge: an entire, unowned front door spanning all five producer stages
// (claim receipt / plan / candidate selection / decision / revalidation
// observation), with the backend machinery proven LIVE and working
// (0.9.405 Section B) and zero UI call sites anywhere (0.9.405 Section C).
// That milestone deliberately stopped there — its own Category-C
// instruction was to record the gap, not propose an implementation edge.
//
// This milestone asks the DIFFERENT, narrower question 0.9.405 left open:
//
//   "What user-visible operation should cause ForkBuild to reconcile a
//    local publication record against peer evidence, and thereby produce
//    the candidate/decision/revalidation records the Leaderboard
//    consumes?"
//
// This is a PRODUCT-DIRECTION DECISION, not an implementation. It does
// not build a "Run Reconciliation" button, does not wire a producer path,
// and does not touch the Leaderboard's own read-only surface — see
// Section K for the full, explicit exclusion list. The deliverable is a
// single selected direction with a named, evidenced owner, exactly the
// shape 0.9.397's own gate produced for a different (whole-product)
// question.
//
// METHOD: a six-dimension scoring framework — userValue, semanticOwnership,
// existingDataAvailability, architecturalFit, scope, semanticCost — is
// defined fresh in Section B (an EXTENSION of 0.9.384/0.9.397's five-
// dimension framework, not a byte-identical reuse: this is a genuinely
// different question, "which existing thing legitimately owns this
// operation," not "does this candidate clear a build-it-at-all gate").
// The new dimension, semanticOwnership, is the one the request identifies
// as decisive: which existing object or workflow has the strongest
// LEGITIMATE AUTHORITY to initiate reconciliation — checked against real,
// quoted, current source for every candidate, never asserted from
// instinct about where a button would be convenient to add.
//
// FIVE CANDIDATES (Sections D-H), the exact roster the request names:
//   1. Reconcile from Publications
//   2. Reconcile from Peer Connections
//   3. Reconcile from the Leaderboard
//   4. Automatic reconciliation
//   5. Explicit reconciliation workspace
//
// THIRTEEN LETTERED SECTIONS:
//   A. Entry-state reconfirmation — 0.9.405's own verdict, re-checked
//      fresh against its own still-existing source file.
//   B. The scoring framework and gate rule, defined and structurally
//      reproven before any real candidate is scored.
//   C. The fresh-source-evidence protocol.
//   D. Candidate 1 — Reconcile from Publications.
//   E. Candidate 2 — Reconcile from Peer Connections.
//   F. Candidate 3 — Reconcile from the Leaderboard.
//   G. Candidate 4 — Automatic reconciliation.
//   H. Candidate 5 — Explicit reconciliation workspace.
//   I. Decision matrix.
//   J. Final verdict.
//   K. Deliberate exclusion census — none of the eleven explicitly-
//      rejected anti-solutions exist anywhere in current source.
//   L. Scope note for a future 0.9.407 — the smallest bounded first slice
//      of the selected direction, recorded but NOT built here.
//   M. Production boundary.

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
async function sourceExists(relativePath) {
    try {
        await readSource(relativePath);
        return true;
    } catch {
        return false;
    }
}
function grepFiles(pattern, glob) {
    try {
        return execSync(`grep -lE "${pattern}" ${glob} 2>/dev/null || true`, { cwd: SOURCE_ROOT })
            .toString().trim().split('\n').filter(Boolean);
    } catch { return []; }
}

async function run() {
    console.log('Running Reconciliation Front-Door Product Direction Audit tests...\n');

    // ===============================================================
    // Section A — Entry-state reconfirmation.
    // ===============================================================
    {
        const priorAudit = await readSource('tests/ReconciliationCandidateProductionProductGapAudit.test.js');
        assert(priorAudit.includes('RECONCILIATION_PRODUCER_GAP_CONFIRMED'),
            n('A1. 0.9.405\'s own verdict string, RECONCILIATION_PRODUCER_GAP_CONFIRMED, is on record in its own still-existing source file'));
        assert(priorAudit.includes('VERDICT: POSSIBILITY C'),
            n('A2. 0.9.405 concluded POSSIBILITY C — no existing user operation semantically owns production, at any of the five stages — the exact entry condition this milestone builds on'));
        assert(priorAudit.includes('not another navigation audit') === false && priorAudit.includes('Section H — anti-solution census'),
            n('A3. 0.9.405\'s own anti-solution census (its Section H) is present, confirming this milestone inherits a gap, not a half-built feature to finish'));

        console.log('\n=== SECTION A: ENTRY-STATE RECONFIRMATION ===');
        console.log('✓ Section A: 0.9.405\'s POSSIBILITY-C verdict is on record and re-confirmed fresh, not cited from prose alone.');
    }

    // ===============================================================
    // Section B — The scoring framework and gate rule.
    // ===============================================================
    const DIMENSIONS = [
        { key: 'userValue', question: 'Is the underlying need for this operation demonstrated, not hypothetical?' },
        { key: 'semanticOwnership', question: 'Does this candidate already legitimately own the concept, or would it have to borrow/annex it?' },
        { key: 'existingDataAvailability', question: 'Does this candidate already hold, live, the data the operation needs?' },
        { key: 'architecturalFit', question: 'Does adopting this candidate violate an existing, documented boundary?' },
        { key: 'scope', question: 'Can a first milestone building this direction remain narrowly bounded?' },
        { key: 'semanticCost', question: 'Does choosing this candidate introduce a new concept, or a misleading one, the product does not already carry cleanly?' }
    ];
    function evaluateFrontDoorCandidate(candidate) {
        const ownershipClear = candidate.semanticOwnership === 'OWNS';
        const boundaryRespected = candidate.architecturalFit !== 'VIOLATES_ESTABLISHED_BOUNDARY';
        const boundedScope = candidate.scope === 'BOUNDED';
        return {
            ...candidate,
            ownershipClear,
            boundaryRespected,
            boundedScope,
            decision: (ownershipClear && boundaryRespected && boundedScope) ? 'SELECTED' : 'NOT_SELECTED'
        };
    }
    {
        assert(DIMENSIONS.length === 6, n('B1. the framework carries exactly six named dimensions — 0.9.384/0.9.397\'s original five, plus semanticOwnership, the signal this milestone\'s own request identifies as decisive'));
        assert(DIMENSIONS.some((d) => d.key === 'semanticOwnership'), n('B2. semanticOwnership is present as its own, distinct dimension — never folded into architecturalFit, which asks a different question (boundary violation, not authority)'));

        // B3. Gate rule reproven structurally on synthetic cases before any
        // real candidate is scored — the identical discipline 0.9.397
        // Section B3 held for its own, different gate.
        const ownsButUnbounded = evaluateFrontDoorCandidate({
            name: 'synthetic: owns the concept, unbounded scope', userValue: 'DEMONSTRATED', semanticOwnership: 'OWNS',
            existingDataAvailability: 'FULL', architecturalFit: 'NO_VIOLATION', scope: 'UNBOUNDED', semanticCost: 'LOW'
        });
        assert(ownsButUnbounded.decision === 'NOT_SELECTED',
            n('B3. the gate rejects a candidate that OWNS the concept and has NO_VIOLATION architecturalFit when scope is UNBOUNDED — legitimate ownership alone does not excuse an unscoped first milestone'));

        const easyButUnowned = evaluateFrontDoorCandidate({
            name: 'synthetic: architecturally easy, ownership unclaimed', userValue: 'DEMONSTRATED', semanticOwnership: 'UNCLAIMED',
            existingDataAvailability: 'FULL', architecturalFit: 'NO_VIOLATION', scope: 'BOUNDED', semanticCost: 'LOW'
        });
        assert(easyButUnowned.decision === 'NOT_SELECTED',
            n('B4. conversely, the gate rejects a candidate with NO_VIOLATION architecturalFit and BOUNDED scope when semanticOwnership is only UNCLAIMED, not OWNS — ease of construction is never, by itself, legitimate authority to initiate'));

        const violatesBoundary = evaluateFrontDoorCandidate({
            name: 'synthetic: owns the concept but violates a boundary', userValue: 'DEMONSTRATED', semanticOwnership: 'OWNS',
            existingDataAvailability: 'FULL', architecturalFit: 'VIOLATES_ESTABLISHED_BOUNDARY', scope: 'BOUNDED', semanticCost: 'LOW'
        });
        assert(violatesBoundary.decision === 'NOT_SELECTED',
            n('B5. the gate also rejects a candidate that OWNS the concept and is BOUNDED when architecturalFit VIOLATES_ESTABLISHED_BOUNDARY — an existing documented boundary is never overridden merely because a candidate is otherwise well-shaped'));

        const clearsAll = evaluateFrontDoorCandidate({
            name: 'synthetic: clears every gate condition', userValue: 'DEMONSTRATED', semanticOwnership: 'OWNS',
            existingDataAvailability: 'FULL', architecturalFit: 'NO_VIOLATION', scope: 'BOUNDED', semanticCost: 'MODERATE'
        });
        assert(clearsAll.decision === 'SELECTED',
            n('B6. a candidate that OWNS the concept, respects every existing boundary, and keeps a BOUNDED scope clears the gate regardless of semanticCost being merely MODERATE rather than LOW — the gate is about legitimate ownership and boundary respect, never about being free'));

        console.log('\n=== SECTION B: SCORING FRAMEWORK AND GATE RULE ===');
        console.log('✓ Section B: six-dimension framework defined; gate rule (ownershipClear && boundaryRespected && boundedScope) reproven structurally on five synthetic cases before any real candidate is scored.');
    }

    // ===============================================================
    // Section C — Fresh-source-evidence protocol.
    // ===============================================================
    const FRESH_SIGNALS = Object.freeze([
        'currentSource', 'currentUIVocabulary', 'currentDataReachability', 'currentDocumentedBoundary', 'currentTransportMechanism'
    ]);
    {
        assert(FRESH_SIGNALS.length === 5, n('C1. the fresh-evidence protocol names exactly five signals, applied identically to every candidate in Sections D-H'));
        console.log('\n=== SECTION C: FRESH-SOURCE-EVIDENCE PROTOCOL ===');
        for (const s of FRESH_SIGNALS) console.log(`- ${s}`);
        console.log('✓ Section C: every candidate below is checked against current source text, current UI vocabulary, current data reachability, current documented boundaries, and the actual transport mechanism a claim uses today — never against instinct about where a button would be convenient.');
    }

    const candidates = [];

    // ===============================================================
    // Section D — Candidate 1: Reconcile from Publications.
    // ===============================================================
    let publicationsSource;
    {
        publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');

        // D1. Publications' own achievement cards repeatedly, explicitly
        // disclaim leaderboard/rank vocabulary — real, quoted evidence,
        // not an inference from the page's general subject matter.
        const disclaimers = [
            'and never a score, rank, or leaderboard entry.',
            'never a score, rank, or leaderboard entry. Some achievements',
            'never a score, rank, level, or leaderboard entry. These',
            'already-earned facts — never a score, rank, level,'
        ];
        for (const text of disclaimers) {
            assert(publicationsSource.includes(text), n(`D1. Publications' own source text disclaims leaderboard/rank vocabulary verbatim: "${text}"`));
        }
        assert((publicationsSource.match(/never a score, rank,/g) || []).length >= 4,
            n('D1. this disclaimer appears at least four separate times across Publications\' own achievement cards — a repeated, deliberate boundary, not one offhand sentence'));

        // D2. Publications DOES already hold the live archive a
        // reconciliation operation would need (0.9.405 Section E already
        // established this for the snapshot half) — so data availability
        // is real, even though ownership is disclaimed.
        assert(publicationsSource.includes("publicationObservationArchiveStorage.load()"),
            n('D2. Publications already loads this replica\'s own durable archive live — existingDataAvailability is real, not the reason this candidate is rejected'));

        const candidate = evaluateFrontDoorCandidate({
            name: 'Reconcile from Publications',
            description: 'select a local publication -> reconcile against peer evidence -> candidate/decision/observation',
            userValue: 'DEMONSTRATED', semanticOwnership: 'DISCLAIMED', existingDataAvailability: 'FULL',
            architecturalFit: 'VIOLATES_ESTABLISHED_BOUNDARY', scope: 'BOUNDED', semanticCost: 'HIGH',
            evidence: 'Publications\' own achievement cards state, four separate times in their own template text, that measurable facts there are "never a score, rank, level, or leaderboard entry" — a repeated, deliberate self-disclaimer of leaderboard/rank semantics, not an assumption this audit is making on the page\'s behalf. The page already holds the live archive data a reconciliation operation needs, but the SPECIFIC operation under evaluation (a leaderboard-snapshot claim/plan/decision) is also the exact vocabulary this page\'s own source repeatedly refuses to carry. It would also be the wrong granularity: 0.9.405/core evidence shows a claim is about a whole publisher-leaderboard SNAPSHOT (every publisher, one policy), never a single selected publication'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('D3. the gate rejects this candidate — Publications\' own source disclaims the exact vocabulary the operation needs, a real documented-boundary violation, regardless of its real data availability'));
        candidates.push(candidate);

        console.log('\n=== SECTION D: CANDIDATE — RECONCILE FROM PUBLICATIONS ===');
        console.log(`decision: ${candidate.decision} — semanticOwnership: ${candidate.semanticOwnership}, architecturalFit: ${candidate.architecturalFit}`);
    }

    // ===============================================================
    // Section E — Candidate 2: Reconcile from Peer Connections.
    // ===============================================================
    let peerConnectionsSource;
    {
        peerConnectionsSource = await readSource('ui/views/PeerConnectionsView.js');
        const claimCoreSource = await readSource('core/PublisherLeaderboardSnapshotClaim.js');
        const claimExchangeSource = await readSource('application/PublisherLeaderboardSnapshotClaimExchange.js');

        // E1. PeerConnectionsView carries zero archive/claim vocabulary
        // today — a genuinely blank slate, not an existing, unwired seam.
        assert(!/archive/i.test(peerConnectionsSource), n('E1. ui/views/PeerConnectionsView.js contains no reference to "archive" anywhere — zero existing archive vocabulary on this page today'));
        const claimSymbolHits = grepFiles('PublisherLeaderboardSnapshotClaim|LeaderboardClaimRecord', 'ui/views/PeerConnectionsView.js');
        assert(claimSymbolHits.length === 0, n('E1. zero occurrences of PublisherLeaderboardSnapshotClaim or LeaderboardClaimRecord in PeerConnectionsView.js — no existing, unwired seam to extend'));

        // E2. The identity space DOES line up: signerIdentityId is a
        // did:key SigningIdentity id, the exact identity space Peer
        // Connections already manages (My Peers / Known Peers / Friends).
        assert(claimCoreSource.includes('ALWAYS a did:key `identity/SigningIdentity.js` id — the same'),
            n('E2. a claim\'s signerIdentityId is documented, in its own core source, as always a did:key SigningIdentity id — the same cryptographic identity space Peer Connections already manages for every peer card'));

        // E3. But the actual transport a claim uses is explicit, portable
        // JSON exchange, never a live peer session/connection — so tying
        // this operation to Peer Connections would introduce a MISLEADING
        // coupling this feature does not actually have.
        assert(claimExchangeSource.includes('TRANSPORT INTRODUCES NO NEW TRUST SEMANTICS'),
            n('E3. claim transport (application/PublisherLeaderboardSnapshotClaimExchange.js) is documented as portable JSON exchange, the identical out-of-band paste shape the Leaderboard\'s own peer-archive comparison already uses — never a live peer-session/connection dependency Peer Connections would actually provide'));
        assert(!/Alice's replica.*Bob's replica.*peer connection|WebRTC|PeerSession/s.test(claimExchangeSource),
            n('E3. the claim exchange file never names a live peer session, WebRTC channel, or PeerSessionManager as part of its own transport — confirming the transport genuinely does not need what Peer Connections would supply'));

        const candidate = evaluateFrontDoorCandidate({
            name: 'Reconcile from Peer Connections',
            description: 'a Peer card -> reconcile local publications against that peer\'s archive -> observations',
            userValue: 'DEMONSTRATED', semanticOwnership: 'UNCLAIMED', existingDataAvailability: 'NONE',
            architecturalFit: 'NEUTRAL', scope: 'UNBOUNDED', semanticCost: 'MODERATE',
            evidence: 'PeerConnectionsView.js carries zero archive/claim vocabulary today — a blank slate, not an unwired seam. The claim\'s signerIdentityId genuinely IS the same did:key identity space this page already manages, a real point in this candidate\'s favor — but the claim\'s own actual transport (PublisherLeaderboardSnapshotClaimExchange.js) is explicit, portable JSON paste, never a live peer session; anchoring the front door here would misleadingly imply a live-connection dependency the feature does not have. Building the whole claim vocabulary from nothing, on a page whose own current job is connection lifecycle (My Peers/Known Peers/Friends/Blocked) rather than evidence archives, is exactly as large a construction as candidate 5 below, with a real semantic mismatch added on top'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('E4. the gate rejects this candidate — semanticOwnership is only UNCLAIMED (identity space matches, but no existing archive/claim concept lives here), so ownership is not clear even though no boundary is directly violated'));
        candidates.push(candidate);

        console.log('\n=== SECTION E: CANDIDATE — RECONCILE FROM PEER CONNECTIONS ===');
        console.log(`decision: ${candidate.decision} — semanticOwnership: ${candidate.semanticOwnership}, existingDataAvailability: ${candidate.existingDataAvailability}`);
    }

    // ===============================================================
    // Section F — Candidate 3: Reconcile from the Leaderboard.
    // ===============================================================
    let leaderboardSource;
    {
        leaderboardSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');
        const productionGapAudit = await readSource('tests/ReconciliationCandidateProductionProductGapAudit.test.js');
        const principlesSource = await readSource('docs/Principles.md');

        // F1. The Leaderboard already has the EXACT UX pattern this
        // operation would need — paste an external artifact, parse it,
        // inspect it — real, high data availability.
        assert(leaderboardSource.includes('(a read-only look at an external archive, never persisted, never'),
            n('F1. the Leaderboard already implements the exact "paste an external artifact -> parse -> inspect" pattern this operation would extend (usePeerArchive(), 0.8.181)'));

        // F2. But the page is REPEATEDLY, explicitly self-documented as
        // read-only/diagnostic — both in its own source and in the
        // decision history that gave it its one entry point.
        assert(productionGapAudit.includes('correctly-scoped, read-only diagnostic surface'),
            n('F2. the Leaderboard is on record, in a prior milestone\'s own verdict text, as "a correctly-scoped, read-only diagnostic surface"'));
        assert(leaderboardSource.includes('here ever calls `publicationObservationArchiveStorage.save()` on it, or'),
            n('F2. the Leaderboard\'s own view documents, in its own source, that nothing on the page ever calls .save() on the archive storage — it reads, it never durably writes'));
        const leaderboardSourceNoComments = leaderboardSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!leaderboardSourceNoComments.includes('publicationObservationArchiveStorage.save('),
            n('F2. with every full-line comment stripped, no executable call to publicationObservationArchiveStorage.save() remains in the file — the read-only claim is checked against actual code, not merely a comment asserting it'));

        // F3. This is not a one-off view-level choice — it echoes a
        // codebase-wide, repeatedly-stated principle that a
        // comparison/analysis surface is read-only.
        assert(principlesSource.includes('A comparison is read-only, both over the history it compares and over'),
            n('F3. docs/Principles.md states, as a general principle applied elsewhere in this codebase, "A comparison is read-only, both over the history it compares..." — the Leaderboard\'s own read-only framing is a specific instance of an established, codebase-wide pattern, not an isolated preference invented for this audit'));
        assert(principlesSource.includes('An analysis is read-only, both over the history it analyzes and over'),
            n('F3. a second, independent instance of the identical restraint ("An analysis is read-only...") is on record for a different subsystem — this is a recurring architectural boundary, not a coincidence'));

        const candidate = evaluateFrontDoorCandidate({
            name: 'Reconcile from the Leaderboard',
            description: '"Run Reconciliation" on the diagnostic page itself -> producer pipeline',
            userValue: 'DEMONSTRATED', semanticOwnership: 'EXPLICITLY_DISCLAIMED', existingDataAvailability: 'FULL',
            architecturalFit: 'VIOLATES_ESTABLISHED_BOUNDARY', scope: 'BOUNDED', semanticCost: 'LOW',
            evidence: 'the Leaderboard already has the highest existingDataAvailability and the lowest semanticCost of any candidate on this roster — it is the CLOSEST-LOOKING seam. But it is explicitly, repeatedly self-documented as a read-only diagnostic surface (own source, own prior-milestone verdict text), and that framing is a specific instance of a codebase-wide "a comparison/analysis surface is read-only" principle stated independently for at least two other subsystems in docs/Principles.md. Turning the diagnostic observer into the operation\'s owner would be the one candidate that crosses an established, named boundary rather than merely lacking a seam'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('F4. the gate rejects this candidate despite its LOW semanticCost and FULL existingDataAvailability — architecturalFit VIOLATES_ESTABLISHED_BOUNDARY overrides ease of construction, exactly as Section B\'s own synthetic case B5 already proved it must'));
        candidates.push(candidate);

        console.log('\n=== SECTION F: CANDIDATE — RECONCILE FROM THE LEADERBOARD ===');
        console.log(`decision: ${candidate.decision} — existingDataAvailability: ${candidate.existingDataAvailability}, architecturalFit: ${candidate.architecturalFit}`);
    }

    // ===============================================================
    // Section G — Candidate 4: Automatic reconciliation.
    // ===============================================================
    {
        const createClaimSource = await readSource('application/CreatePublisherLeaderboardSnapshotClaimUseCase.js');

        assert(createClaimSource.includes('SIGNING IS NEVER AUTOMATIC — THE MOST IMPORTANT RESTRAINT THIS FILE'),
            n('G1. application/CreatePublisherLeaderboardSnapshotClaimUseCase.js states, verbatim, in its own header, "SIGNING IS NEVER AUTOMATIC — THE MOST IMPORTANT RESTRAINT THIS FILE HOLDS" — a direct, named, documented boundary this candidate would violate by construction, not merely a missing seam'));
        assert(createClaimSource.includes('as a side effect of anything else in this codebase.'),
            n('G1. the same file explicitly rules out exactly this candidate\'s own shape — signing is called "never as a side effect of anything else in this codebase"'));

        const candidate = evaluateFrontDoorCandidate({
            name: 'Automatic reconciliation',
            description: 'peer/archive change -> automatic reconciliation -> candidate observations',
            userValue: 'NOT_DEMONSTRATED', semanticOwnership: 'N/A', existingDataAvailability: 'FULL',
            architecturalFit: 'VIOLATES_ESTABLISHED_BOUNDARY', scope: 'UNBOUNDED', semanticCost: 'HIGH',
            evidence: 'the exact family of files this operation would touch (CreatePublisherLeaderboardSnapshotClaimUseCase.js) states, in its own header, that signing is never automatic and never a side effect — the single most directly-applicable documented boundary on this entire roster. It also introduces substantial, unscoped scheduling/lifecycle semantics this audit\'s own request explicitly warns against building "merely because it makes the Leaderboard populate automatically"'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('G2. the gate rejects this candidate on architecturalFit alone — it would violate a boundary this codebase already states in its own source, independent of any UNBOUNDED-scope concern'));
        candidates.push(candidate);

        console.log('\n=== SECTION G: CANDIDATE — AUTOMATIC RECONCILIATION ===');
        console.log(`decision: ${candidate.decision} — architecturalFit: ${candidate.architecturalFit}, scope: ${candidate.scope}`);
    }

    // ===============================================================
    // Section H — Candidate 5: Explicit reconciliation workspace.
    // ===============================================================
    {
        // H1. No existing page anywhere in ui/ owns the Leaderboard Claim
        // object family at all — confirmed by exhaustive grep against the
        // EXACT symbols (word-boundary checked, so the Leaderboard's own
        // differently-named family — describePublisherLeaderboardClaim
        // SnapshotReconciliationCandidateXxx, which merely CONTAINS the
        // substring "LeaderboardClaim" — does not produce a false
        // positive here), not assumed from the negative results already
        // found in D/E/F.
        // AMENDED BY 0.9.411 — Publisher Leaderboard Snapshot Claim
        // Authoring & Export. At THIS milestone's own moment (0.9.406),
        // zero ui/ files touched these exact symbols, which is the fact
        // H1 originally recorded — evidence, at the time, that NO existing
        // page owned this candidate's own capability. 0.9.411 built
        // exactly the recommended candidate this section itself evaluates
        // ("explicit reconciliation workspace" — realized one milestone
        // later as two pages, the Workspace (0.9.408) and this audit's own
        // recommended authoring/export half (0.9.411)) — see
        // ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js's own
        // header. The identical "assert the CURRENT, truthful state"
        // convention this whole audit family already established (see
        // tests/ReconciliationLeaderboardEntryPointDecisionAudit.test.js's
        // own 0.9.403/0.9.408 amendments) applies here too: H1 now asserts
        // exactly the one file 0.9.411 authorized carries these symbols,
        // never a second, accidental owner.
        const uiFiles = execSync('git ls-files ui', { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js'));
        const claimOwningFiles = grepFiles('PublisherLeaderboardSnapshotClaim\\b|\\bLeaderboardClaimRecord\\b', uiFiles.join(' '));
        assert(
            claimOwningFiles.length === 1 && claimOwningFiles[0] === 'ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js',
            n(`H1. exactly the one file 0.9.411 authorized to own PublisherLeaderboardSnapshotClaim/exportPublisherLeaderboardSnapshotClaim references these symbols (all ${uiFiles.length} ui/ files checked; found: ${JSON.stringify(claimOwningFiles)}) — the capability this section evaluated is now real, deliberately, in exactly the one place named for it`));
        // Confirms this is a real, exact-symbol check and not an
        // accidentally-vacuous pattern: the SAME word-boundary pattern
        // does match a synthetic line carrying the real symbol.
        assert(/\bLeaderboardClaimRecord\b/.test('const x = new LeaderboardClaimRecord({});'),
            n('H1. the word-boundary pattern used above is proven, on a synthetic line, to actually match the real symbol when present — the zero-file result is a genuine absence, not a broken check'));

        // H2. router/index.js's own established "contextual, not top-nav"
        // convention (already used three times: /chat/:identityId,
        // /reconciliation-leaderboard, /evidence-export-comparison) is a
        // real, reusable precedent a new workspace route can follow —
        // this is not an invented navigation pattern.
        const routerSource = await readSource('ui/router/index.js');
        assert(routerSource.includes('still never a top-nav destination.'),
            n('H2. router/index.js already documents, verbatim, the "contextual, not top-nav" convention for a prior reconciliation-family route (/evidence-export-comparison) — a reusable precedent, not an invented one, for a new workspace route'));
        assert(routerSource.includes("{ path: '/chat/:identityId', name: 'chat', component: ChatView }"),
            n('H2. /chat/:identityId is confirmed, fresh, as the established precedent for a contextual, non-top-nav route reached from a specific card rather than global navigation'));

        // H3. Every application-layer symbol a workspace's first slice
        // would need is proven live by 0.9.405 Section B, not merely
        // present on disk — reconfirmed here by import, not by citation.
        const { PublisherLeaderboardSnapshotClaim } = await import('../core/PublisherLeaderboardSnapshotClaim.js');
        const { reconstructPublisherLeaderboard } = await import('../application/PublisherLeaderboardView.js');
        assert(typeof PublisherLeaderboardSnapshotClaim === 'function', n('H3. core/PublisherLeaderboardSnapshotClaim.js is a real, importable class today'));
        assert(typeof reconstructPublisherLeaderboard === 'function', n('H3. application/PublisherLeaderboardView.js#reconstructPublisherLeaderboard is a real, importable function today — the local, zero-network half of a first slice'));

        const candidate = evaluateFrontDoorCandidate({
            name: 'Explicit reconciliation workspace',
            description: 'a new, dedicated page -> choose local publication(s)/this replica\'s own snapshot -> choose or paste peer evidence -> run reconciliation -> inspect candidates',
            userValue: 'DEMONSTRATED', semanticOwnership: 'OWNS', existingDataAvailability: 'FULL',
            architecturalFit: 'NO_VIOLATION', scope: 'BOUNDED', semanticCost: 'MODERATE',
            evidence: 'the Leaderboard Claim object family (PublisherLeaderboardSnapshotClaim / LeaderboardClaimRecord) is owned by NO existing page today — zero files anywhere in ui/ reference either exact symbol, not even the Leaderboard\'s own already-wired components, which work one layer up through describeXxx()/reconstructXxx() projections (Section H1, exhaustive). A new page can legitimately adopt this genuinely-unclaimed ownership without annexing it from, or distorting, Publications (which disclaims the vocabulary), Peer Connections (which has no existing seam and a transport mismatch), or the Leaderboard (which is bound by a documented, codebase-wide read-only principle). The "contextual, not top-nav" navigation shape this app already uses three times over (Section H2) is a real, reusable precedent, not an invented one. Every application-layer symbol a bounded first slice needs is proven live, not merely present on disk (Section H3, and 0.9.405 Section B before it)'
        });
        assert(candidate.decision === 'SELECTED', n('H4. the gate SELECTS this candidate — semanticOwnership OWNS (nothing else legitimately holds this concept today), architecturalFit NO_VIOLATION (no existing documented boundary is crossed), and scope BOUNDED (a first slice can be narrowly sized, per Section L below)'));
        candidates.push(candidate);

        console.log('\n=== SECTION H: CANDIDATE — EXPLICIT RECONCILIATION WORKSPACE ===');
        console.log(`decision: ${candidate.decision} — semanticOwnership: ${candidate.semanticOwnership}, architecturalFit: ${candidate.architecturalFit}`);
    }

    // ===============================================================
    // Section I — Decision matrix.
    // ===============================================================
    {
        assert(candidates.length === 5, n('I1. all five named candidates from the request\'s own roster were evaluated, in the request\'s own order'));
        assert(candidates.filter((c) => c.decision === 'SELECTED').length === 1,
            n('I2. exactly one candidate evaluates SELECTED'));
        assert(candidates.filter((c) => c.decision === 'NOT_SELECTED').length === 4,
            n('I3. the remaining four candidates each evaluate NOT_SELECTED, each for its own distinct, freshly-gathered evidence'));
        assert(candidates.some((c) => c.existingDataAvailability === 'FULL' && c.decision === 'NOT_SELECTED'),
            n('I4. at least one NOT_SELECTED candidate carried FULL existingDataAvailability — confirming the gate rejects on ownership/boundary grounds, never merely on missing plumbing (the Leaderboard candidate, Section F)'));

        console.log('\n=== SECTION I: DECISION MATRIX ===');
        console.log('| Candidate                              | semanticOwnership     | architecturalFit              | scope     | Decision     |');
        console.log('|------------------------------------------|-------------------------|----------------------------------|-----------|--------------|');
        for (const c of candidates) {
            console.log(`| ${c.name.padEnd(42)} | ${String(c.semanticOwnership).padEnd(23)} | ${String(c.architecturalFit).padEnd(34)} | ${String(c.scope).padEnd(9)} | ${c.decision} |`);
        }
        console.log('✓ Section I: five candidates, five distinct verdicts derived from five distinct, freshly-gathered evidence sets.');
    }

    // ===============================================================
    // Section J — Final verdict.
    // ===============================================================
    let SELECTED_DIRECTION;
    {
        const selected = candidates.find((c) => c.decision === 'SELECTED');
        SELECTED_DIRECTION = selected.name;
        assert(SELECTED_DIRECTION === 'Explicit reconciliation workspace', n('J1. SELECTED_DIRECTION is "Explicit reconciliation workspace"'));

        console.log('\n=== SECTION J: FINAL VERDICT ===');
        console.log('RECONCILIATION_FRONT_DOOR_DIRECTION_SELECTED');
        console.log(`SELECTED_DIRECTION = ${SELECTED_DIRECTION}`);
        console.log('OWNER = a new, dedicated Reconciliation page — not Publications, not Peer Connections, not the');
        console.log('        Reconciliation Candidate Leaderboard.');
        console.log('');
        console.log('Publications explicitly, repeatedly disclaims leaderboard/rank vocabulary in its own source.');
        console.log('Peer Connections has the right identity space but no existing archive/claim vocabulary, and the');
        console.log('claim\'s own transport does not actually depend on a live peer session — anchoring it there would');
        console.log('be a misleading coupling, not a real one. The Leaderboard has the strongest existing UX pattern');
        console.log('and the lowest construction cost of any candidate, and is rejected anyway: it is bound by an');
        console.log('explicit, repeated, codebase-wide "comparison/analysis is read-only" principle, not merely');
        console.log('lacking a seam. Automatic reconciliation is foreclosed by this exact feature family\'s own');
        console.log('documented "signing is never automatic" restraint. No existing page legitimately owns this');
        console.log('concept today — a new, dedicated workspace is the one candidate that adopts ownership without');
        console.log('annexing or distorting anything else.');
    }

    // ===============================================================
    // Section K — Deliberate exclusion census.
    // ===============================================================
    {
        const antiPatterns = [
            /"Run Reconciliation"/,
            /autoGenerate.*[Rr]econciliation/,
            /pollReconciliation/i,
            /reconciliationState\s*=\s*['"]NEW/,
            /candidatePersistence/i,
            /reconciliationProtocolVersion/i,
            /new.*[Ee]vidence[Ff]ormat/,
            /leaderboardMutation/i,
            /synthetic.*candidate/i,
            /acquirePeerArchive/i,
            /ReconciliationCoordinator/,
            /ReconciliationWizard/
        ];
        const scanDirs = ['ui', 'application', 'core'];
        const files = execSync(`git ls-files ${scanDirs.join(' ')}`, { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js'));
        const bundle = (await Promise.all(files.map((f) => readSource(f)))).join('\n');
        for (const pattern of antiPatterns) {
            assert(!pattern.test(bundle), n(`K1. no anti-solution pattern ${pattern} exists anywhere in ui/, application/, or core/`));
        }

        console.log('\n=== SECTION K: DELIBERATE EXCLUSION CENSUS ===');
        console.log('✓ Section K: none of the eleven explicitly-rejected anti-solutions (a "Run Reconciliation" button, automatic reconciliation, background polling, new reconciliation state, candidate persistence changes, a new reconciliation protocol, a new evidence format, Leaderboard mutations, synthetic data, new peer-archive acquisition, a generic reconciliation coordinator, a five-stage UI wizard) exist anywhere in current source. This milestone records a decision; it does not sneak in an implementation.');
    }

    // ===============================================================
    // Section L — Scope note for a future 0.9.407 (recorded, not built).
    // ===============================================================
    {
        const smallestFirstSlice = Object.freeze({
            route: '/reconciliation (new, contextual — reached from Publications\' own Publication Archive card, per the H2 precedent, never top-nav)',
            firstCapability: 'author and export a signed claim about THIS replica\'s own current leaderboard snapshot only — the zero-network half 0.9.405 Section E already proved reachable from live data',
            explicitlyDeferred: 'importing a peer\'s claim, running the plan/candidate/decision/observation pipeline, and any write into the Leaderboard\'s own consumed records — each its own, later, separately-evidenced milestone'
        });
        assert(typeof smallestFirstSlice.route === 'string' && smallestFirstSlice.route.includes('/reconciliation'),
            n('L1. a concrete, nameable first route is recorded for a future milestone to evaluate — not built here'));
        assert(smallestFirstSlice.explicitlyDeferred.includes('plan/candidate/decision/observation'),
            n('L2. the full five-stage pipeline UI is explicitly named as deferred, not implied as part of this milestone\'s own scope'));

        console.log('\n=== SECTION L: SCOPE NOTE FOR A FUTURE MILESTONE (RECORDED, NOT BUILT) ===');
        console.log(`route:            ${smallestFirstSlice.route}`);
        console.log(`firstCapability:  ${smallestFirstSlice.firstCapability}`);
        console.log(`explicitlyDeferred: ${smallestFirstSlice.explicitlyDeferred}`);
        console.log('✓ Section L: this is a note for whichever future milestone builds the selected direction — this milestone builds none of it.');
    }

    // ===============================================================
    // Section M — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/ReconciliationFrontDoorProductDirectionAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`M1. every changed/added file is one this audit explicitly authorized (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'ui'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`M2. ${dir}/ shows no change — this is a test-only, decision-only audit; no route, no view, no application/core symbol was added or modified`));
        }

        console.log('\n=== SECTION M: PRODUCTION BOUNDARY ===');
        console.log('✓ Section M: only this test file and tests.html\'s own registration changed. No route was registered, no workspace view was created, no producer path was wired — the decision is recorded; its implementation is left to a future, separately-evidenced milestone.');
    }

    console.log('\n' + '='.repeat(78));
    console.log('RECONCILIATION_FRONT_DOOR_DIRECTION_SELECTED');
    console.log(`SELECTED_DIRECTION = ${SELECTED_DIRECTION}`);
    console.log('OWNER = a new, dedicated Reconciliation Workspace page (none of the three existing candidate');
    console.log('        pages legitimately owns this concept today).');
    console.log('='.repeat(78));

    console.log('\n✅ All Reconciliation Front-Door Product Direction Audit tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
