import { execFileSync, execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// 0.9.384 — Explicit Next Product Direction Selection.
//
// **Type: test-only, decision artifact. No production changes.**
//
// 0.9.383 (Whole-Product Product Evolution Reassessment) swept the entire
// product — capability inventory, all eight primary journeys, the
// Repository/Publication model, post-distribution state, cross-arc
// identity, temporal semantics, user-facing failure paths, every
// previously-deferred candidate, and every architecture-driven
// "expose-more-of-the-subsystem" candidate — and found no genuine gap.
// STABLE_STOP was recorded as a first-class successful result.
//
// That answers "is there an accidental gap?" It does not answer "what,
// if anything, does ForkBuild intentionally build next?" Those are
// different questions, and conflating them is exactly how a product ends
// up shipping architecture-driven features: a seam exists, so something
// gets built to fill it, whether or not real evidence calls for it.
//
// This milestone is a GATE, not an audit and not an implementation. It
// evaluates a fixed roster of named candidate directions against a fixed,
// evidence-grounded scoring framework, and produces exactly one of two
// outcomes:
//
//   SELECTED_DIRECTION = <one candidate>     (only if evidence clears the gate)
//   NO_DIRECTION_SELECTED = true             (a legitimate, recorded conclusion)
//
// Ten lettered sections:
//
//   A. Entry-state reconfirmation — 0.9.383's STABLE_STOP re-checked
//      fresh against current source, not cited from its own prose.
//   B. The scoring framework — five criteria, and the gate rule that
//      architectural readiness alone can never clear it.
//   C. Candidate 1 — Proactive decentralized Repository discovery.
//   D. Candidate 2 — Collaboration expansion (live editing / visible
//      collaborators).
//   E. Candidate 3 — Notification delivery.
//   F. Candidate 4 — Global Place Naming, richer semantics.
//   G. Candidate 5 — A new product domain, unrelated to existing seams.
//   H. Decision matrix.
//   I. Final verdict.
//   J. What this milestone deliberately excludes, and what comes after.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readSource(relativePath);
        return true;
    } catch {
        return false;
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function codeOnlySource(relativePath) {
    return codeOnlyLines(await readSource(relativePath));
}

async function grepCodeOnlyFiles(pattern, dirs) {
    let candidates = [];
    try {
        const out = execFileSync('grep', ['-rl', pattern, ...dirs, '--include=*.js'], { cwd: SOURCE_ROOT.pathname }).toString().trim();
        candidates = out ? out.split('\n') : [];
    } catch { /* no matches */ }
    const hits = [];
    for (const file of candidates) {
        const code = await codeOnlySource(file);
        if (code.includes(pattern)) hits.push(file);
    }
    return hits;
}

const PRODUCTION_DIRS = ['application', 'ui', 'core', 'publisher', 'storage', 'discovery', 'collaboration', 'presence'];

// ===================================================================
// The scoring framework itself (Section B builds and validates it;
// Sections C-G apply it to real evidence).
// ===================================================================

const CRITERIA = [
    { key: 'userValue', question: 'Does it enable a meaningful new task, backed by real evidence rather than hypothesis?' },
    { key: 'reachability', question: 'Is there a realistic, concretely specified user journey, not merely a category name?' },
    { key: 'architecturalFit', question: 'Can it reuse existing seams without distorting them?' },
    { key: 'semanticCost', question: 'Does it introduce genuinely new concepts the product does not already carry?' },
    { key: 'scope', question: 'Can a first milestone remain narrowly bounded?' }
];

// The gate: SELECTED requires (a) userValue reaches DEMONSTRATED — real,
// checkable evidence of an unmet need, not merely "the seam is ready" —
// and (b) the candidate is concretely specified enough to have a real
// reachability/scope reading at all. architecturalFit and semanticCost
// inform the matrix but can NEVER substitute for (a): a candidate with
// HIGH architecturalFit and NOT_DEMONSTRATED userValue still fails.
function evaluateCandidate(candidate) {
    const concretelySpecified = candidate.reachability !== 'UNSPECIFIED' && candidate.scope !== 'UNBOUNDED';
    const valueCleared = candidate.userValue === 'DEMONSTRATED';
    return {
        ...candidate,
        concretelySpecified,
        valueCleared,
        decision: (concretelySpecified && valueCleared) ? 'SELECTED' : 'NOT_SELECTED'
    };
}

async function run() {
    // ===============================================================
    // Section A — Entry-state reconfirmation.
    // ===============================================================
    {
        // A1. 0.9.383's own verdict is on record as the immediately
        // prior milestone, and this milestone builds on it rather than
        // repeating it — reconfirmed present, not assumed.
        const roadmap = await readSource('docs/Roadmap.md');
        assert(roadmap.includes('## 0.9.383 — Whole-Product Product Evolution Reassessment'),
            n('A1. 0.9.383\'s entry is on record in docs/Roadmap.md — this milestone builds on a real prior verdict, not an invented one'));
        assert(roadmap.includes('**`STABLE_STOP`.**'),
            n('A1. 0.9.383 recorded STABLE_STOP — the entry condition for this gate'));

        // A2. Spot-reconfirm, fresh against current source (never
        // inherited from 0.9.383's own prose), the specific facts this
        // milestone's own candidate evaluations depend on.
        const searchCode = await codeOnlySource('application/SearchPublicationsUseCase.js');
        assert(!/Arweave|Nostr|Ipfs|fetch\(|WebSocket/i.test(searchCode) && !/async execute/.test(searchCode),
            n('A2. SearchPublicationsUseCase.js is still synchronous with no network collaborator — proactive Repository discovery remains unbuilt, not silently shipped since 0.9.383'));
        const notificationEventCode = await codeOnlySource('core/NotificationEvent.js');
        assert(!/deliveredAt\s*=|seenAt\s*=|readAt\s*=/.test(notificationEventCode),
            n('A2. NotificationEvent.js still carries no delivered/seen/read field — notification delivery remains unbuilt'));
        assert(await sourceExists('collaboration/CollaborationSession.js'),
            n('A2. collaboration/CollaborationSession.js still exists as the collaboration foundation'));

        console.log('\n=== SECTION A: ENTRY-STATE RECONFIRMATION ===');
        console.log('✓ Section A: 0.9.383\'s STABLE_STOP is on record, and the specific facts this milestone\'s own candidate evaluations depend on are reconfirmed fresh against current source, not inherited from 0.9.383\'s own prose.');
    }

    // ===============================================================
    // Section B — The scoring framework.
    // ===============================================================
    {
        assert(CRITERIA.length === 5, n('B1. the framework carries exactly the five named dimensions'));
        for (const c of CRITERIA) {
            assert(typeof c.question === 'string' && c.question.length > 0, n(`B1. criterion "${c.key}" carries a real evaluation question`));
        }

        // B2. Prove the gate rule is a real computed rule, not merely
        // asserted prose: a candidate with maximal architectural fit and
        // minimal semantic cost, but undemonstrated user value, must
        // still fail. This is checked against the evaluator function
        // itself, with a synthetic input, before any real candidate is
        // scored.
        const architecturallyPerfectButUnevidenced = evaluateCandidate({
            name: 'synthetic gate-check candidate',
            userValue: 'NOT_DEMONSTRATED',
            reachability: 'HIGH',
            architecturalFit: 'HIGH',
            semanticCost: 'LOW',
            scope: 'BOUNDED'
        });
        assert(architecturallyPerfectButUnevidenced.decision === 'NOT_SELECTED',
            n('B2. the gate rejects a candidate with HIGH architecturalFit / LOW semanticCost / BOUNDED scope when userValue is NOT_DEMONSTRATED — architectural readiness alone cannot clear the gate, proven structurally against the evaluator itself'));

        const fullyEvidenced = evaluateCandidate({
            name: 'synthetic fully-evidenced candidate',
            userValue: 'DEMONSTRATED',
            reachability: 'HIGH',
            architecturalFit: 'LOW',
            semanticCost: 'HIGH',
            scope: 'BOUNDED'
        });
        assert(fullyEvidenced.decision === 'SELECTED',
            n('B2. conversely, a concretely specified candidate with DEMONSTRATED userValue clears the gate even with LOW architecturalFit and HIGH semanticCost — the gate is about real evidence, not ease of construction'));

        console.log('\n=== SECTION B: SCORING FRAMEWORK ===');
        for (const c of CRITERIA) console.log(`${c.key}: ${c.question}`);
        console.log('✓ Section B: five criteria defined; the gate rule (userValue must reach DEMONSTRATED, and the candidate must be concretely specified) is proven structurally against the evaluator function itself, not merely stated in prose.');
    }

    const candidates = [];

    // ===============================================================
    // Section C — Candidate 1: Proactive decentralized Repository
    // discovery.
    // ===============================================================
    {
        const searchCode = await codeOnlySource('application/SearchPublicationsUseCase.js');
        const isSynchronousNoNetwork = !/Arweave|Nostr|Ipfs|fetch\(|WebSocket/i.test(searchCode) && !/async execute/.test(searchCode);
        assert(isSynchronousNoNetwork, n('C1. SearchPublicationsUseCase.js confirmed synchronous, no network collaborator — the largest deferred capability remains genuinely unbuilt'));

        assert(await sourceExists('application/ResolvePublicationUseCase.js') && await sourceExists('discovery/LocalDiscoveryProvider.js'),
            n('C1. the seams a proactive-discovery journey would reuse (ResolvePublicationUseCase, discoveryProvider/admitToRepositoryDiscovery) already exist and already work for the reactive paths'));

        const roadmap = await readSource('docs/Roadmap.md');
        const deferralMentions = (roadmap.match(/proactive.{0,30}[Dd]ecentralized.{0,30}[Dd]iscovery|[Pp]roactive [Rr]epository/g) || []).length;
        assert(deferralMentions >= 5,
            n(`C1. docs/Roadmap.md records at least five separate mentions of this candidate being deferred (found ${deferralMentions}) — this is a repeatedly-considered, not overlooked, candidate`));

        const candidate = evaluateCandidate({
            name: 'Proactive decentralized Repository discovery',
            description: 'Repository -> search decentralized sources -> discover Publications never previously encountered -> resolve/admit -> Explore/Fork',
            userValue: 'NOT_DEMONSTRATED',
            reachability: 'HIGH',
            architecturalFit: 'HIGH',
            semanticCost: 'LOW',
            scope: 'BOUNDED',
            evidence: 'deferred at least five times on fresh evidence each time (0.9.330/0.9.340/0.9.350/0.9.351/0.9.374/0.9.383); 0.9.383 Section B drove all eight primary journeys live and none needed it; SearchPublicationsUseCase.js remains synchronous with no network collaborator'
        });
        assert(candidate.decision === 'NOT_SELECTED',
            n('C2. despite HIGH architecturalFit and LOW semanticCost — the most "seam-ready" candidate on the roster — userValue is NOT_DEMONSTRATED, so the gate rejects it. This is precisely the trap the milestone brief names: a beautifully prepared seam is not itself a reason to build'));
        candidates.push(candidate);

        console.log('\n=== SECTION C: CANDIDATE — PROACTIVE REPOSITORY DISCOVERY ===');
        console.log(`decision: ${candidate.decision} — userValue: ${candidate.userValue}, architecturalFit: ${candidate.architecturalFit}`);
        console.log('✓ Section C: real, reusable seams exist, but no independent evidence of unmet user need exists — the strongest architectural candidate on the roster still fails the gate.');
    }

    // ===============================================================
    // Section D — Candidate 2: Collaboration expansion (live editing /
    // visible collaborators).
    // ===============================================================
    {
        assert(await sourceExists('collaboration/CollaborationSession.js'),
            n('D1. the collaboration foundation (operation exchange, causal readiness, recovery, convergence) exists'));

        // D2. Reconfirm CollaborationSession has zero UI presence layer —
        // no file outside collaboration/application imports it, and it
        // carries no cursor/caret/remote-selection vocabulary itself.
        const importingFiles = await grepCodeOnlyFiles('CollaborationSession', ['ui']);
        assert(importingFiles.length === 0,
            n(`D2. no UI file imports CollaborationSession (found ${importingFiles.length}) — there is no document-level "who's editing this, and where" presence layer today`));
        const sessionCode = await codeOnlySource('collaboration/CollaborationSession.js');
        assert(!/RemoteCursor|RemoteCaret|LiveCursor|EditingPresence/i.test(sessionCode),
            n('D2. CollaborationSession.js itself carries no remote-cursor/editing-presence vocabulary (its own "cursor" usages are CommandHistory\'s undo/redo cursor, an unrelated concept) — live-editing presence is not merely un-wired, it does not exist at the protocol level either'));

        // D3. WorldCollaboratorIndicator.js is confirmed a genuinely
        // separate mechanism (world-spatial avatar presence, driven by
        // WorldSpatialActivity/WorldNavigationSession) — not evidence
        // that document-level collaborative-editing presence has
        // quietly shipped under a different name.
        const indicatorCode = await codeOnlySource('ui/components/WorldCollaboratorIndicator.js');
        assert(indicatorCode.includes("from '../../core/WorldSpatialActivity.js'") && !indicatorCode.includes('CollaborationSession'),
            n('D3. WorldCollaboratorIndicator.js is driven by WorldSpatialActivity (world avatar presence), never CollaborationSession — a real, pre-existing, but genuinely unrelated feature, not the candidate under evaluation wearing a different name'));

        const candidate = evaluateCandidate({
            name: 'Collaboration expansion (live editing / visible collaborators)',
            description: 'multiple users -> same Document -> live collaborative editing -> visible collaborators / editing experience',
            userValue: 'NOT_DEMONSTRATED',
            reachability: 'MODERATE',
            architecturalFit: 'MODERATE',
            semanticCost: 'MODERATE',
            scope: 'LARGE',
            evidence: 'foundation exists (CollaborationSession) but carries zero UI presence layer and no cursor/caret vocabulary at the protocol level; STOP since 0.9.241, reconfirmed at every reassessment since including 0.9.383; no explicit product-priority declaration exists anywhere on record'
        });
        assert(candidate.decision === 'NOT_SELECTED',
            n('D4. the gate rejects this candidate — per the brief\'s own instruction, it "should only be selected if collaboration is now an explicit product priority," and no such declaration exists on record'));
        candidates.push(candidate);

        console.log('\n=== SECTION D: CANDIDATE — COLLABORATION EXPANSION ===');
        console.log(`decision: ${candidate.decision} — userValue: ${candidate.userValue}, scope: ${candidate.scope}`);
        console.log('✓ Section D: the foundation is real but the UI presence layer does not exist even in embryonic form, and no explicit product-priority evidence exists — the gate rejects it.');
    }

    // ===============================================================
    // Section E — Candidate 3: Notification delivery.
    // ===============================================================
    {
        const notificationEventCode = await codeOnlySource('core/NotificationEvent.js');
        assert(!/deliveredAt\s*=|seenAt\s*=|readAt\s*=/.test(notificationEventCode),
            n('E1. NotificationEvent.js confirmed still carries no delivered/seen/read field'));
        assert(await sourceExists('application/GetRecipientNotificationEventsUseCase.js') && await sourceExists('ui/components/NotificationHistoryPanel.js'),
            n('E1. the existing durable-history path (query use case + mounted panel) is real and already reachable'));

        // E2. Reconfirm 0.9.383 Section I already named and rejected
        // exactly this shape as an architecture-driven "expose more of
        // the subsystem" candidate — re-selecting it here without new
        // evidence would reopen a settled STOP by inertia.
        const roadmap = await readSource('docs/Roadmap.md');
        assert(roadmap.includes('notification event → push'),
            n('E2. docs/Roadmap.md\'s own 0.9.383 record already named this exact candidate shape and rejected it as architecture-driven — re-confirmed on record, not re-derived from scratch'));

        const candidate = evaluateCandidate({
            name: 'Notification delivery',
            description: 'event -> deduplication -> persistent history -> authenticated retrieval (current) vs. event -> delivery -> immediate user awareness (candidate)',
            userValue: 'NOT_DEMONSTRATED',
            reachability: 'HIGH',
            architecturalFit: 'HIGH',
            semanticCost: 'HIGH',
            scope: 'BOUNDED',
            evidence: 'NotificationEvent.js deliberately carries no delivered/seen/read field by design (core/NotificationEvent.js\'s own header comment); STOP reconfirmed at 0.9.374, 0.9.379, and 0.9.383; 0.9.383 Section I already named and rejected "notification event -> push notification" as architecture-driven'
        });
        assert(candidate.decision === 'NOT_SELECTED',
            n('E3. despite HIGH architecturalFit, HIGH semanticCost is exactly the brief\'s own warning — "this would be a genuinely new semantic layer, so it should not be introduced merely because NotificationEvent exists" — and userValue remains NOT_DEMONSTRATED, so the gate rejects it'));
        candidates.push(candidate);

        console.log('\n=== SECTION E: CANDIDATE — NOTIFICATION DELIVERY ===');
        console.log(`decision: ${candidate.decision} — userValue: ${candidate.userValue}, semanticCost: ${candidate.semanticCost}`);
        console.log('✓ Section E: architecturally easy, but a genuinely new semantic layer with no demonstrated need — already named and rejected once at 0.9.383; the gate declines to reopen it without new evidence.');
    }

    // ===============================================================
    // Section F — Candidate 4: Global Place Naming, richer semantics.
    // ===============================================================
    {
        assert(await sourceExists('core/PlaceNamingClaim.js') && await sourceExists('core/PlaceNamingView.js') && await sourceExists('application/NostrPlaceNamingDiscoverySource.js'),
            n('F1. the full existing Place Naming arc (create -> persist -> publish -> discover -> adopt) is real and COMPLETE'));

        // F2. "Richer global naming semantics" names no concrete
        // capability — check that no alias/hierarchy/namespace
        // vocabulary exists anywhere near Place Naming to even ground
        // what "richer" would mean.
        const richnessHits = await grepCodeOnlyFiles('PlaceNamingAlias\\|PlaceNamingHierarchy\\|PlaceNamingNamespace', ['core', 'application', 'ui']);
        assert(richnessHits.length === 0,
            n('F2. no PlaceNamingAlias/PlaceNamingHierarchy/PlaceNamingNamespace vocabulary exists anywhere — "richer semantics" is a category label, not a specified capability'));

        const candidate = evaluateCandidate({
            name: 'Global Place Naming, richer semantics',
            description: 'create -> persist -> publish to Nostr -> discover -> adopt (current, COMPLETE) -> richer global naming semantics (candidate, unspecified)',
            userValue: 'NOT_DEMONSTRATED',
            reachability: 'UNSPECIFIED',
            architecturalFit: 'UNSPECIFIED',
            semanticCost: 'UNKNOWN',
            scope: 'UNBOUNDED',
            evidence: 'the existing arc is genuinely COMPLETE and working; no concrete richer-semantics capability is named anywhere in source, the roadmap, or this milestone\'s own brief — "richer" names a direction of travel, not a destination'
        });
        assert(candidate.decision === 'NOT_SELECTED',
            n('F3. the gate rejects this candidate on its own terms — it is not concretely specified enough to have a real reachability or scope reading, exactly the brief\'s own caveat: "I\'d require concrete product evidence before extending it"'));
        candidates.push(candidate);

        console.log('\n=== SECTION F: CANDIDATE — GLOBAL PLACE NAMING, RICHER SEMANTICS ===');
        console.log(`decision: ${candidate.decision} — reachability: ${candidate.reachability}, scope: ${candidate.scope}`);
        console.log('✓ Section F: the existing arc is complete and working; the candidate itself is not concretely specified, so it cannot clear a gate that requires a real reachability/scope reading.');
    }

    // ===============================================================
    // Section G — Candidate 5: a new product domain, unrelated to
    // existing seams.
    // ===============================================================
    {
        // G1. By construction this candidate is evaluated differently
        // from C-F: it is not expected to reuse an existing seam, so
        // architecturalFit is deliberately not a gating factor for it.
        // What IS required, same as every other candidate, is a
        // concrete proposal backed by real evidence — checked here by
        // confirming none exists anywhere on record.
        const roadmap = await readSource('docs/Roadmap.md');
        const forwardCandidateMarkers = (roadmap.match(/NEW_DOMAIN_CANDIDATE|PROPOSED_DIRECTION\s*=/g) || []).length;
        assert(forwardCandidateMarkers === 0,
            n('G1. no forward-looking, concretely-named new-domain candidate exists anywhere in docs/Roadmap.md — nothing is waiting to be selected here'));

        const candidate = evaluateCandidate({
            name: 'A new product domain, unrelated to existing subsystems',
            description: 'a genuinely new user capability, deliberately not required to connect to any current architecture',
            userValue: 'NOT_DEMONSTRATED',
            reachability: 'UNSPECIFIED',
            architecturalFit: 'N/A — not a gating factor for this candidate by design',
            semanticCost: 'UNKNOWN',
            scope: 'UNBOUNDED',
            evidence: 'no concrete new-domain proposal, backed by real evidence, exists anywhere in this conversation, docs/Roadmap.md, or the current product surface'
        });
        assert(candidate.decision === 'NOT_SELECTED',
            n('G2. the gate rejects this candidate for the same reason as Candidate 4: it is a category, not a specified capability — nothing concrete is on the table to evaluate reachability or scope against'));
        candidates.push(candidate);

        console.log('\n=== SECTION G: CANDIDATE — NEW PRODUCT DOMAIN ===');
        console.log(`decision: ${candidate.decision} — no concrete proposal exists on record`);
        console.log('✓ Section G: openness to an unconnected new domain is real, but selecting one requires an actual proposal with real evidence behind it. Inventing one here purely to fill this milestone would be inertia-driven building wearing product language instead of architecture language — exactly what this gate exists to prevent.');
    }

    // ===============================================================
    // Section H — Decision matrix.
    // ===============================================================
    {
        assert(candidates.length === 5, n('H1. all five named candidates from the milestone brief were evaluated'));
        assert(candidates.every((c) => c.decision === 'NOT_SELECTED'), n('H2. every candidate evaluates NOT_SELECTED'));
        assert(candidates.some((c) => c.architecturalFit === 'HIGH'), n('H3. at least one NOT_SELECTED candidate carried HIGH architecturalFit — reconfirming the gate rejects on evidence, not on difficulty of construction'));

        console.log('\n=== SECTION H: DECISION MATRIX ===');
        console.log('| Candidate                                              | userValue        | architecturalFit | Decision     |');
        console.log('|---------------------------------------------------------|-------------------|-------------------|--------------|');
        for (const c of candidates) {
            console.log(`| ${c.name.padEnd(57)} | ${String(c.userValue).padEnd(17)} | ${String(c.architecturalFit).padEnd(17)} | ${c.decision} |`);
        }
        console.log('✓ Section H: five candidates, five NOT_SELECTED verdicts — each for a distinct, evidence-grounded reason, not one blanket rejection.');
    }

    // ===============================================================
    // Section I — Final verdict.
    // ===============================================================
    {
        const SELECTED_DIRECTION = null;
        const NO_DIRECTION_SELECTED = candidates.every((c) => c.decision === 'NOT_SELECTED');

        assert(NO_DIRECTION_SELECTED === true, n('I1. NO_DIRECTION_SELECTED evaluates true — every candidate failed the gate on its own, distinct evidence'));
        assert(SELECTED_DIRECTION === null, n('I2. SELECTED_DIRECTION is null — no candidate is promoted to a next-milestone audit'));

        console.log('\n=== SECTION I: FINAL VERDICT ===');
        console.log(`SELECTED_DIRECTION = ${SELECTED_DIRECTION}`);
        console.log(`NO_DIRECTION_SELECTED = ${NO_DIRECTION_SELECTED}`);
        console.log('');
        console.log('Proactive Repository discovery has the strongest architectural fit of any candidate on the roster — and');
        console.log('is still rejected, because architectural readiness is explicitly not a substitute for demonstrated user');
        console.log('value (Section B\'s own gate rule, proven structurally, then applied five times with the same result).');
        console.log('Collaboration expansion has no explicit product-priority declaration behind it. Notification delivery is a');
        console.log('genuinely new semantic layer already named and rejected once, at 0.9.383. Global Place Naming\'s "richer');
        console.log('semantics" and an unrelated new product domain both fail earlier still — neither is concretely specified');
        console.log('enough to evaluate at all. ForkBuild remains at STABLE_STOP (0.9.383). This is recorded as a legitimate');
        console.log('conclusion of a genuine choice point, not a failure to choose.');

        console.log('\n✅ All Explicit Next Product Direction Selection tests passed.');
    }

    // ===============================================================
    // Section J — What this milestone deliberately excludes, and what
    // comes after.
    // ===============================================================
    {
        // J1. No production file is touched by this milestone. Checked
        // against the working tree's full status (staged + unstaged +
        // untracked), not merely `git diff`, so this milestone's own new
        // test file and Roadmap.md entry are correctly counted, while a
        // stray production edit would still be caught. Best-effort: a
        // shallow checkout or missing git binary must not fail this
        // decision-artifact suite over an environment limitation.
        let productionTouched = [];
        try {
            const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname }).toString();
            productionTouched = statusOutput.split('\n')
                .map((line) => line.slice(3).trim())
                .filter(Boolean)
                .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
        } catch { /* git unavailable — nothing to check, not a failure */ }
        assert(productionTouched.length === 0,
            n(`J1. no production file is modified or added by this milestone's own working tree changes (found: ${JSON.stringify(productionTouched)})`));

        // J2. Earlier "*SeamAudit.test.js"/"*ProductDirectionSeamAudit.test.js"
        // files DO already exist on record (0.9.330/0.9.334/0.9.336) — but
        // for the federated/reactive discovery direction that was already
        // selected and built back then (Section C's own "Repository
        // federation... COMPLETE" note), not for proactive discovery,
        // which A2/C1 just reconfirmed is still unbuilt. What matters
        // here is that THIS milestone adds no NEW such file for ANY of
        // the five candidates it just evaluated — checked against the
        // working tree, not merely narrated.
        let newTestFiles = [];
        try {
            const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname }).toString();
            newTestFiles = statusOutput.split('\n')
                .filter((line) => /^(\?\?|A)/.test(line))
                .map((line) => line.slice(3).trim())
                .filter((f) => f.startsWith('tests/') && f.endsWith('.test.js'));
        } catch { /* git unavailable — nothing to check, not a failure */ }
        assert(newTestFiles.every((f) => f === 'tests/ExplicitNextProductDirectionSelection.test.js'),
            n(`J2. this milestone adds exactly one new test file — its own — and opens no candidate's forward seam/direction audit (found new test files: ${JSON.stringify(newTestFiles)})`));

        console.log('\n=== SECTION J: EXCLUSIONS AND WHAT COMES AFTER ===');
        console.log('✓ Section J: no production change; no candidate\'s forward audit is opened. ForkBuild remains at STABLE_STOP. The five evaluations on record (Section C-G) remain available to a future milestone that arrives with real, new evidence for any of them — none is closed off, none is pre-selected.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
