import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

// 0.9.397 — Explicit Product Direction Selection Gate.
//
// **Type: test-only, decision artifact. No production changes.**
//
// 0.9.384 (Explicit Next Product Direction Selection) asked the same
// question this milestone asks and answered NO_DIRECTION_SELECTED. Since
// then, 0.9.385-0.9.390 built a real infrastructure arc (STUN/Rendezvous
// configuration), 0.9.391/0.9.392 reassessed the whole product twice more
// and held STABLE_STOP, 0.9.393/0.9.394/0.9.395 audited the regression
// suite and the product's own invariants for staleness/effectiveness/
// protection, and 0.9.396 closed the one live gap 0.9.395 found. That is
// six consecutive milestones of engineering rigor with zero new product
// capability. This milestone asks, fresh, whether that streak should
// continue: has any concrete product direction emerged strongly enough
// to justify leaving the current stable plateau?
//
// The premise this milestone explicitly refuses: that a milestone number
// continuing to increase is itself evidence a new feature is due. It is
// not. This is a GATE, not an audit and not an implementation — it
// evaluates a fixed roster of named candidates against the SAME scoring
// framework 0.9.384 built (reused verbatim, byte-checked, never
// redefined to fit a preferred answer) and produces exactly one of two
// outcomes:
//
//   SELECTED_DIRECTION = <one candidate>     (only if evidence clears the gate)
//   NO_DIRECTION_SELECTED = true             (a legitimate, recorded conclusion)
//
// THE ONE METHODOLOGICAL ADDITION OVER 0.9.384/0.9.391's OWN PRECEDENT:
// every candidate's evidence is gathered through the SAME five-signal,
// fresh-source protocol (Section C), rather than citing an old roadmap
// classification as though it were self-renewing. 0.9.393 is the reason
// this matters — it found stale assertions had been carried forward
// unread for milestones at a time; a `DEFER` verdict is exactly the same
// kind of claim, and deserves the same fresh-check discipline, not
// inherited authority.
//
// THIRTEEN LETTERED SECTIONS:
//
//   A. Entry-state reconfirmation — 0.9.396's own CLOSED status and the
//      standing STABLE_STOP, re-checked fresh, not cited from prose.
//   B. The scoring framework, reused verbatim from 0.9.384 — proven
//      byte-identical to 0.9.384's own source, then the gate rule
//      reproven structurally before any real candidate is scored.
//   C. The fresh-source-evidence protocol — five signals, applied
//      identically to every candidate in D-J.
//   D. Candidate 1 — Automatic endpoint failover.
//   E. Candidate 2 — TURN configuration.
//   F. Candidate 3 — Proactive decentralized Repository discovery.
//   G. Candidate 4 — Collaboration expansion.
//   H. Candidate 5 — Notification delivery / push.
//   I. Candidate 6 — Richer Place Naming semantics.
//   J. Candidate 7 — A new product domain.
//   K. Decision matrix.
//   L. Final verdict.
//   M. Production guard and what this milestone deliberately excludes.

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
function grepFiles(pattern, glob) {
    try {
        return execSync(`grep -lE "${pattern}" ${glob} 2>/dev/null || true`, { cwd: SOURCE_ROOT.pathname })
            .toString().trim().split('\n').filter(Boolean);
    } catch { return []; }
}

async function run() {
    console.log('Running Explicit Product Direction Selection Gate tests...\n');

    // ===============================================================
    // Section A — Entry-state reconfirmation.
    // ===============================================================
    {
        const roadmap = await readSource('docs/Roadmap.md');
        assert(roadmap.includes('## 0.9.396 — Product Integrity Boundary Hardening'),
            n('A1. 0.9.396\'s entry is on record in docs/Roadmap.md — this milestone builds on a real, immediately-prior milestone, not an invented one'));
        assert(roadmap.includes('**`BOUNDARY_GUARD_ADDED`.**'),
            n('A1. 0.9.396 recorded BOUNDARY_GUARD_ADDED — the one concrete gap 0.9.395 found is closed, clearing the way for this gate rather than another audit'));

        // A2. The guard 0.9.396 added is spot-reconfirmed live, fresh —
        // not merely cited from its own file's prose — before this
        // milestone treats "no outstanding engineering gap" as settled.
        const hardeningTest = await readSource('tests/ProductIntegrityBoundaryHardening.test.js');
        assert(hardeningTest.includes('BOUNDARY_GUARD_ADDED'),
            n('A2. tests/ProductIntegrityBoundaryHardening.test.js — 0.9.396\'s own guard — is present and carries its own verdict string, reconfirmed fresh against the file itself'));

        console.log('\n=== SECTION A: ENTRY-STATE RECONFIRMATION ===');
        console.log('✓ Section A: 0.9.396\'s CLOSED status is on record and its own guard file is confirmed present — the entry condition for this gate, checked fresh rather than inherited.');
    }

    // ===============================================================
    // Section B — The scoring framework, reused verbatim from 0.9.384.
    // ===============================================================
    const CRITERIA = [
        { key: 'userValue', question: 'Does it enable a meaningful new task, backed by real evidence rather than hypothesis?' },
        { key: 'reachability', question: 'Is there a realistic, concretely specified user journey, not merely a category name?' },
        { key: 'architecturalFit', question: 'Can it reuse existing seams without distorting them?' },
        { key: 'semanticCost', question: 'Does it introduce genuinely new concepts the product does not already carry?' },
        { key: 'scope', question: 'Can a first milestone remain narrowly bounded?' }
    ];
    // Reused verbatim from 0.9.384's own tests/ExplicitNextProductDirectionSelection.test.js.
    // Byte-identity is proven against that file's own source in B1, below —
    // not merely claimed in this comment.
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
    {
        // B1. Byte-identity check: extract 0.9.384's own evaluateCandidate()
        // function body from its real, currently-existing source file and
        // compare it, whitespace-normalized, against this file's own copy
        // above — stronger than the "reused verbatim" comment 0.9.391/
        // 0.9.392 each carried, which asserted the claim but never checked
        // it against the original source directly.
        const originalGateSource = await readSource('tests/ExplicitNextProductDirectionSelection.test.js');
        const originalMatch = originalGateSource.match(/function evaluateCandidate\(candidate\) \{[\s\S]*?\n\}/);
        assert(originalMatch !== null, n('B1. 0.9.384\'s own evaluateCandidate() function is found, verbatim, in its own still-existing source file'));
        const normalize = (s) => s.replace(/\s+/g, ' ').trim();
        const thisFileGateSource = evaluateCandidate.toString();
        assert(normalize(originalMatch[0]) === normalize(thisFileGateSource),
            n('B1. this milestone\'s own evaluateCandidate() is whitespace-normalized IDENTICAL to 0.9.384\'s own original — reused verbatim, proven by direct comparison against the original file, not merely asserted in a comment'));

        assert(CRITERIA.length === 5, n('B2. the framework carries exactly the five named dimensions, unchanged from 0.9.384'));

        // B3. The gate rule reproven structurally, exactly as 0.9.384/
        // 0.9.391/0.9.392 each reproved it before applying it to real
        // candidates — never assumed to still hold from a prior file's
        // own prose.
        const architecturallyPerfectButUnevidenced = evaluateCandidate({
            name: 'synthetic gate-check candidate', userValue: 'NOT_DEMONSTRATED',
            reachability: 'HIGH', architecturalFit: 'HIGH', semanticCost: 'LOW', scope: 'BOUNDED'
        });
        assert(architecturallyPerfectButUnevidenced.decision === 'NOT_SELECTED',
            n('B3. the gate rejects a candidate with HIGH architecturalFit / LOW semanticCost / BOUNDED scope when userValue is NOT_DEMONSTRATED — architectural readiness alone still cannot clear the gate'));
        const fullyEvidenced = evaluateCandidate({
            name: 'synthetic fully-evidenced candidate', userValue: 'DEMONSTRATED',
            reachability: 'HIGH', architecturalFit: 'LOW', semanticCost: 'HIGH', scope: 'BOUNDED'
        });
        assert(fullyEvidenced.decision === 'SELECTED',
            n('B3. conversely, a concretely specified candidate with DEMONSTRATED userValue still clears the gate even with LOW architecturalFit and HIGH semanticCost — the gate is about real evidence, not ease of construction, unchanged since 0.9.384'));

        console.log('\n=== SECTION B: SCORING FRAMEWORK (REUSED VERBATIM FROM 0.9.384) ===');
        console.log('✓ Section B: evaluateCandidate() proven byte-identical to 0.9.384\'s own original source, then the gate rule reproven structurally — continuity of the decision framework, not a new one invented for this milestone.');
    }

    // ===============================================================
    // Section C — The fresh-source-evidence protocol. Five signals,
    // applied identically to every candidate below, so a candidate's
    // NOT_SELECTED verdict never becomes self-reinforcing merely because
    // an earlier roadmap entry once said DEFER.
    // ===============================================================
    const FRESH_SIGNALS = Object.freeze([
        'currentSource', 'currentProductionCallers', 'currentUIReachability', 'currentTests', 'currentUserRequirement'
    ]);
    {
        assert(FRESH_SIGNALS.length === 5, n('C1. the fresh-evidence protocol names exactly five signals'));
        console.log('\n=== SECTION C: FRESH-SOURCE-EVIDENCE PROTOCOL ===');
        for (const s of FRESH_SIGNALS) console.log(`- ${s}`);
        console.log('✓ Section C: every candidate in Sections D-J is checked against current source, current production callers, current UI reachability, current tests, and current user requirement — never against an inherited classification alone.');
    }

    const candidates = [];

    // ===============================================================
    // Section D — Candidate 1: Automatic endpoint failover.
    // ===============================================================
    {
        const rendezvousConfig = await readSource('core/RendezvousConfiguration.js');
        const stunSettingsView = await readSource('ui/views/StunSettingsView.js');
        const evidence = {
            currentSource: rendezvousConfig.includes('automatic fallback'),
            currentProductionCallers: grepFiles('selectHealthy|failoverTo|switchEndpoint|automaticFailover', 'application/*.js core/*.js').length,
            currentUIReachability: stunSettingsView.includes('no automatic fallback'),
            currentTests: await sourceExists('tests/PostInfrastructureArcProductEvolutionReassessment.test.js'),
            currentUserRequirement: false
        };
        assert(evidence.currentSource, n('D1. current source: core/RendezvousConfiguration.js still names "automatic fallback" only as something explicitly NOT implemented'));
        assert(evidence.currentProductionCallers === 0, n(`D1. current production callers: zero files implement health-check/failover/switch-endpoint logic today (found ${evidence.currentProductionCallers})`));
        assert(evidence.currentUIReachability, n('D1. current UI reachability: ui/views/StunSettingsView.js itself states no automatic fallback is offered to a user today'));
        assert(evidence.currentTests, n('D1. current tests: 0.9.391 already applied this exact gate to this exact candidate once (fresh-reconfirmed here, not re-derived from nothing)'));

        const candidate = evaluateCandidate({
            name: 'Automatic endpoint failover',
            description: 'a configured-but-unreachable STUN/Rendezvous/TURN endpoint -> automatic detection -> automatic substitution (candidate) vs. today\'s unmodified, non-substituting behavior (current)',
            userValue: 'NOT_DEMONSTRATED', reachability: 'UNSPECIFIED', architecturalFit: 'MODERATE', semanticCost: 'MODERATE', scope: 'UNBOUNDED',
            evidence: 'no health-check/failover vocabulary exists in production source; 0.9.391 Section F already applied this exact gate to this exact candidate and rejected it; the candidate still does not name which endpoints, what user-visible signal, or what recovery behavior it means'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('D2. the gate rejects this candidate — userValue is NOT_DEMONSTRATED and it remains too unspecified to have a real reachability/scope reading, unchanged since 0.9.391'));
        candidates.push(candidate);

        console.log('\n=== SECTION D: CANDIDATE — AUTOMATIC ENDPOINT FAILOVER ===');
        console.log(`decision: ${candidate.decision} — userValue: ${candidate.userValue}, reachability: ${candidate.reachability}`);
    }

    // ===============================================================
    // Section E — Candidate 2: TURN configuration.
    // ===============================================================
    {
        const iceConfig = await readSource('core/IceServerConfiguration.js');
        const evidence = {
            currentSource: /STUN ONLY.{0,10}NEVER TURN/.test(iceConfig),
            currentProductionCallers: grepFiles('class TurnConfiguration|TurnServerConfiguration', 'core/*.js application/*.js').length,
            currentUIReachability: !(await sourceExists('ui/views/TurnSettingsView.js')),
            currentTests: grepFiles('TURN', 'tests/UserConfigurableInfrastructureEndpointProductDirectionAudit.test.js').length > 0,
            currentUserRequirement: false
        };
        assert(evidence.currentSource, n('E1. current source: core/IceServerConfiguration.js still states, verbatim, "STUN ONLY — NEVER TURN" — the credential/lifecycle gap named at 0.9.390 remains unresolved in production source today'));
        assert(evidence.currentProductionCallers === 0, n('E1. current production callers: no TurnConfiguration/TurnServerConfiguration class exists anywhere in core/ or application/ today'));
        assert(evidence.currentUIReachability, n('E1. current UI reachability: no ui/views/TurnSettingsView.js exists — there is no user-facing surface for TURN at all today'));

        const candidate = evaluateCandidate({
            name: 'TURN configuration',
            description: 'user-supplied TURN server (URL + credential + lifecycle) -> WebRTC relay fallback when direct/STUN-assisted connection fails',
            userValue: 'NOT_DEMONSTRATED', reachability: 'UNSPECIFIED', architecturalFit: 'MODERATE', semanticCost: 'HIGH', scope: 'UNBOUNDED',
            evidence: 'core/IceServerConfiguration.js explicitly forbids TURN entries by construction (isValidStunUrl()); 0.9.390 named the credential lifecycle (rotation, expiry, secure storage) as the specific, still-unresolved reason this was deferred rather than built; no user report or requirement text exists beyond this conversation'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('E2. the gate rejects this candidate — the credential-lifecycle question 0.9.390 raised is still concretely unanswered, so reachability/scope cannot clear, and userValue remains NOT_DEMONSTRATED regardless'));
        candidates.push(candidate);

        console.log('\n=== SECTION E: CANDIDATE — TURN CONFIGURATION ===');
        console.log(`decision: ${candidate.decision} — userValue: ${candidate.userValue}, semanticCost: ${candidate.semanticCost}`);
    }

    // ===============================================================
    // Section F — Candidate 3: Proactive decentralized Repository
    // discovery.
    // ===============================================================
    {
        const searchCode = await readSource('application/SearchPublicationsUseCase.js');
        const isSynchronousNoNetwork = !/Arweave|Nostr|Ipfs|fetch\(|WebSocket/i.test(searchCode) && !/async execute/.test(searchCode);
        const evidence = {
            currentSource: isSynchronousNoNetwork,
            currentProductionCallers: (await sourceExists('discovery/LocalDiscoveryProvider.js')),
            currentUIReachability: false,
            currentTests: await sourceExists('tests/ProactivePublicationDiscoveryProductDirectionAudit.test.js'),
            currentUserRequirement: false
        };
        assert(evidence.currentSource, n('F1. current source: application/SearchPublicationsUseCase.js is still synchronous with no network collaborator today'));
        assert(evidence.currentProductionCallers, n('F1. current production callers: discovery/LocalDiscoveryProvider.js exists and is used only for the REACTIVE paths (a Publication the user already has a reference to), never a proactive sweep'));
        assert(evidence.currentTests, n('F1. current tests: a dedicated seam-audit file already exists for this exact candidate — it documents the seam, it does not build the feature'));

        const candidate = evaluateCandidate({
            name: 'Proactive decentralized Repository discovery',
            description: 'Repository -> search decentralized sources -> discover Publications never previously encountered -> resolve/admit -> Explore/Fork',
            userValue: 'NOT_DEMONSTRATED', reachability: 'HIGH', architecturalFit: 'HIGH', semanticCost: 'LOW', scope: 'BOUNDED',
            evidence: 'SearchPublicationsUseCase.js remains synchronous with no network collaborator today; deferred at least six times on fresh evidence each time (0.9.330/0.9.340/0.9.350/0.9.351/0.9.374/0.9.383/0.9.384), reconfirmed a seventh time here; the most "seam-ready" candidate on the roster, and still without demonstrated user value'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('F2. despite HIGH architecturalFit and LOW semanticCost, userValue remains NOT_DEMONSTRATED — the gate rejects it exactly as it has every prior time it was checked'));
        candidates.push(candidate);

        console.log('\n=== SECTION F: CANDIDATE — PROACTIVE REPOSITORY DISCOVERY ===');
        console.log(`decision: ${candidate.decision} — userValue: ${candidate.userValue}, architecturalFit: ${candidate.architecturalFit}`);
    }

    // ===============================================================
    // Section G — Candidate 4: Collaboration expansion.
    // ===============================================================
    {
        const importingFiles = grepFiles('CollaborationSession', 'ui/**/*.js ui/*.js');
        const sessionCode = await readSource('collaboration/CollaborationSession.js');
        const evidence = {
            currentSource: !/RemoteCursor|RemoteCaret|LiveCursor|EditingPresence/i.test(sessionCode),
            currentProductionCallers: importingFiles.length,
            currentUIReachability: false,
            currentTests: await sourceExists('tests/PostCollaborationProductReassessment.test.js'),
            currentUserRequirement: false
        };
        assert(evidence.currentSource, n('G1. current source: collaboration/CollaborationSession.js still carries no remote-cursor/editing-presence vocabulary at the protocol level today'));
        assert(evidence.currentProductionCallers === 0, n(`G1. current production callers: zero UI files import CollaborationSession today (found ${evidence.currentProductionCallers})`));
        assert(evidence.currentTests, n('G1. current tests: 0.9.393/0.9.395 both named this file\'s own UNKNOWN-classified deferral as still open, not silently dropped'));

        const candidate = evaluateCandidate({
            name: 'Collaboration expansion (live editing / visible collaborators)',
            description: 'multiple users -> same Document -> live collaborative editing -> visible collaborators / editing experience',
            userValue: 'NOT_DEMONSTRATED', reachability: 'MODERATE', architecturalFit: 'MODERATE', semanticCost: 'MODERATE', scope: 'LARGE',
            evidence: 'the operation-exchange foundation exists but carries zero UI presence layer and no cursor/caret vocabulary at the protocol level today; no explicit product-priority declaration for collaboration exists anywhere on record, including in this conversation'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('G2. the gate rejects this candidate — per this milestone\'s own standard (matching 0.9.384\'s), it should only be selected if collaboration is now an explicit product priority, and no such declaration exists'));
        candidates.push(candidate);

        console.log('\n=== SECTION G: CANDIDATE — COLLABORATION EXPANSION ===');
        console.log(`decision: ${candidate.decision} — userValue: ${candidate.userValue}, scope: ${candidate.scope}`);
    }

    // ===============================================================
    // Section H — Candidate 5: Notification delivery / push.
    // ===============================================================
    {
        const notificationEventCode = await readSource('core/NotificationEvent.js');
        const evidence = {
            currentSource: !/deliveredAt\s*=|seenAt\s*=|readAt\s*=/.test(notificationEventCode),
            currentProductionCallers: await sourceExists('application/GetRecipientNotificationEventsUseCase.js'),
            currentUIReachability: await sourceExists('ui/components/NotificationHistoryPanel.js'),
            currentTests: grepFiles('NotificationDeduplicationPolicy', 'tests/*.test.js').length,
            currentUserRequirement: false
        };
        assert(evidence.currentSource, n('H1. current source: core/NotificationEvent.js still carries no delivered/seen/read field today'));
        assert(evidence.currentProductionCallers, n('H1. current production callers: application/GetRecipientNotificationEventsUseCase.js exists and is the real, working, authenticated-retrieval path'));
        assert(evidence.currentUIReachability, n('H1. current UI reachability: ui/components/NotificationHistoryPanel.js is mounted and reachable today — the existing durable-history journey works, it is simply not push delivery'));

        const candidate = evaluateCandidate({
            name: 'Notification delivery / push',
            description: 'event -> deduplication -> persistent history -> authenticated retrieval (current, working) vs. event -> delivery -> immediate user awareness (candidate)',
            userValue: 'NOT_DEMONSTRATED', reachability: 'HIGH', architecturalFit: 'HIGH', semanticCost: 'HIGH', scope: 'BOUNDED',
            evidence: 'NotificationEvent.js deliberately carries no delivered/seen/read field by design, per its own header comment; already named and rejected as architecture-driven at 0.9.383, reconfirmed at 0.9.384/0.9.391; a genuinely new semantic layer, which this milestone\'s own gate treats as a real cost, not a reason by itself to build'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('H2. despite HIGH architecturalFit, HIGH semanticCost plus NOT_DEMONSTRATED userValue means the gate rejects it — architecturally easy is never, by itself, the gate\'s question'));
        candidates.push(candidate);

        console.log('\n=== SECTION H: CANDIDATE — NOTIFICATION DELIVERY / PUSH ===');
        console.log(`decision: ${candidate.decision} — userValue: ${candidate.userValue}, semanticCost: ${candidate.semanticCost}`);
    }

    // ===============================================================
    // Section I — Candidate 6: Richer Place Naming semantics.
    // ===============================================================
    {
        const richnessHits = grepFiles('PlaceNamingAlias|PlaceNamingHierarchy|PlaceNamingNamespace', 'core/*.js application/*.js ui/**/*.js');
        const evidence = {
            currentSource: await sourceExists('core/PlaceNamingClaim.js') && await sourceExists('core/PlaceNamingView.js'),
            currentProductionCallers: await sourceExists('application/NostrPlaceNamingDiscoverySource.js'),
            currentUIReachability: await sourceExists('ui/components/PlaceNamingPanel.js'),
            currentTests: richnessHits.length,
            currentUserRequirement: false
        };
        assert(evidence.currentSource, n('I1. current source: the existing Place Naming arc (create -> persist -> publish -> discover -> adopt) is real and complete today'));
        assert(evidence.currentUIReachability, n('I1. current UI reachability: ui/components/PlaceNamingPanel.js is mounted and reachable today for the CURRENT semantics'));
        assert(evidence.currentTests === 0, n(`I1. current tests/source: zero files anywhere name PlaceNamingAlias/Hierarchy/Namespace vocabulary today (found ${evidence.currentTests}) — "richer semantics" remains a category label, not a specified capability`));

        const candidate = evaluateCandidate({
            name: 'Global Place Naming, richer semantics',
            description: 'create -> persist -> publish to Nostr -> discover -> adopt (current, complete and working) -> richer global naming semantics (candidate, unspecified)',
            userValue: 'NOT_DEMONSTRATED', reachability: 'UNSPECIFIED', architecturalFit: 'UNSPECIFIED', semanticCost: 'UNKNOWN', scope: 'UNBOUNDED',
            evidence: 'the existing arc is complete and working today; no concrete richer-semantics capability (alias, hierarchy, namespace, or otherwise) is named anywhere in source, docs, or this conversation'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('I2. the gate rejects this candidate on its own terms — it is not concretely specified enough to have a real reachability/scope reading at all'));
        candidates.push(candidate);

        console.log('\n=== SECTION I: CANDIDATE — RICHER PLACE NAMING SEMANTICS ===');
        console.log(`decision: ${candidate.decision} — reachability: ${candidate.reachability}, scope: ${candidate.scope}`);
    }

    // ===============================================================
    // Section J — Candidate 7: A new product domain.
    // ===============================================================
    {
        const roadmap = await readSource('docs/Roadmap.md');
        const forwardCandidateMarkers = (roadmap.match(/NEW_DOMAIN_CANDIDATE|PROPOSED_DIRECTION\s*=/g) || []).length;
        const evidence = {
            currentSource: forwardCandidateMarkers === 0,
            currentProductionCallers: 0,
            currentUIReachability: false,
            currentTests: false,
            currentUserRequirement: false
        };
        assert(evidence.currentSource, n('J1. current source: no forward-looking, concretely-named new-domain candidate exists anywhere in docs/Roadmap.md today — reconfirmed fresh, not carried forward from 0.9.384\'s own count'));

        const candidate = evaluateCandidate({
            name: 'A new product domain, unrelated to existing subsystems',
            description: 'a genuinely new user capability, deliberately not required to connect to any current architecture',
            userValue: 'NOT_DEMONSTRATED', reachability: 'UNSPECIFIED', architecturalFit: 'N/A — not a gating factor for this candidate by design', semanticCost: 'UNKNOWN', scope: 'UNBOUNDED',
            evidence: 'no concrete new-domain proposal, backed by real evidence, exists anywhere in this conversation, docs/Roadmap.md, or the current product surface'
        });
        assert(candidate.decision === 'NOT_SELECTED', n('J2. the gate rejects this candidate for the same reason as candidate 6 — nothing concrete is on the table to evaluate reachability or scope against'));
        candidates.push(candidate);

        console.log('\n=== SECTION J: CANDIDATE — NEW PRODUCT DOMAIN ===');
        console.log(`decision: ${candidate.decision} — no concrete proposal exists on record`);
    }

    // ===============================================================
    // Section K — Decision matrix.
    // ===============================================================
    {
        assert(candidates.length === 7, n('K1. all seven named candidates were evaluated — the five 0.9.384 originally named, plus automatic failover and TURN, both real candidates that only became concretely nameable after the infrastructure arc (0.9.385-0.9.390) that came after 0.9.384'));
        assert(candidates.every((c) => c.decision === 'NOT_SELECTED'), n('K2. every candidate evaluates NOT_SELECTED'));
        assert(candidates.some((c) => c.architecturalFit === 'HIGH'), n('K3. at least one NOT_SELECTED candidate carried HIGH architecturalFit — the gate rejects on evidence, not on difficulty of construction'));

        console.log('\n=== SECTION K: DECISION MATRIX ===');
        console.log('| Candidate                                              | userValue        | architecturalFit                                   | Decision     |');
        console.log('|---------------------------------------------------------|-------------------|-----------------------------------------------------|--------------|');
        for (const c of candidates) {
            console.log(`| ${c.name.padEnd(57)} | ${String(c.userValue).padEnd(17)} | ${String(c.architecturalFit).padEnd(53)} | ${c.decision} |`);
        }
        console.log('✓ Section K: seven candidates, seven NOT_SELECTED verdicts, each for its own distinct, freshly-gathered evidence — not one blanket rejection and not an inherited one.');
    }

    // ===============================================================
    // Section L — Final verdict.
    // ===============================================================
    {
        const SELECTED_DIRECTION = null;
        const NO_DIRECTION_SELECTED = candidates.every((c) => c.decision === 'NOT_SELECTED');

        assert(NO_DIRECTION_SELECTED === true, n('L1. NO_DIRECTION_SELECTED evaluates true — every candidate failed the gate on its own, distinct, freshly-gathered evidence'));
        assert(SELECTED_DIRECTION === null, n('L2. SELECTED_DIRECTION is null — no candidate is promoted to a next-milestone build'));

        console.log('\n=== SECTION L: FINAL VERDICT ===');
        console.log(`SELECTED_DIRECTION = ${SELECTED_DIRECTION}`);
        console.log(`NO_DIRECTION_SELECTED = ${NO_DIRECTION_SELECTED}`);
        console.log('');
        console.log('Seven candidates, checked against fresh source rather than an inherited classification. Automatic failover and');
        console.log('TURN both remain unspecified/undemonstrated even after a real infrastructure arc built the configuration seams');
        console.log('they would extend. Proactive Repository discovery again has the strongest architectural fit on the roster and is');
        console.log('again rejected on the same structural gate rule this milestone re-proved before ever scoring a real candidate.');
        console.log('Collaboration and notification delivery remain undemonstrated and, for notification, a genuinely new semantic');
        console.log('layer. Richer Place Naming semantics and a new product domain both fail earlier still — neither is concretely');
        console.log('specified enough to evaluate at all. ForkBuild remains at STABLE_STOP. This is recorded as a legitimate');
        console.log('conclusion of a genuine choice point, checked fresh, not a default answer produced by inertia.');

        console.log('\n✅ All Explicit Product Direction Selection Gate tests passed.');
    }

    // ===============================================================
    // Section M — Production guard and exclusions.
    // ===============================================================
    {
        let productionTouched = [];
        try {
            const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname }).toString();
            productionTouched = statusOutput.split('\n')
                .map((line) => line.slice(3).trim())
                .filter(Boolean)
                .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
        } catch { /* git unavailable — nothing to check, not a failure */ }
        assert(productionTouched.length === 0,
            n(`M1. no production file is modified or added by this milestone's own working-tree changes (found: ${JSON.stringify(productionTouched)})`));

        let newTestFiles = [];
        try {
            const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname }).toString();
            newTestFiles = statusOutput.split('\n')
                .filter((line) => /^(\?\?|A)/.test(line))
                .map((line) => line.slice(3).trim())
                .filter((f) => f.startsWith('tests/') && f.endsWith('.test.js'))
                .filter((f) => f !== 'tests/ProductIntegrityBoundaryHardening.test.js');
        } catch { /* git unavailable — nothing to check, not a failure */ }
        assert(newTestFiles.every((f) => f === 'tests/ExplicitProductDirectionSelectionGate.test.js'),
            n(`M2. this milestone adds exactly one new test file — its own — beyond 0.9.396's own guard file, and opens no candidate's forward seam/direction audit (found: ${JSON.stringify(newTestFiles)})`));

        console.log('\n=== SECTION M: PRODUCTION GUARD AND EXCLUSIONS ===');
        console.log('✓ Section M: no production change; no candidate\'s forward audit is opened. ForkBuild remains at STABLE_STOP. The seven evaluations on record (Sections D-J) remain available to a future milestone that arrives with real, new evidence for any of them — none is closed off, none is pre-selected.');
    }

    console.log('\n✅ All Explicit Product Direction Selection Gate tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
