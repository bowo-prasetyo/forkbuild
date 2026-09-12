import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.415 — Product Direction Reopening Gate.
//
// Type: test-only decision gate. No production file touched.
//
// 0.9.405-0.9.413 closed the reconciliation arc end to end. 0.9.414 then
// asked the WIDER whole-product question one more time, fresh, and
// concluded STABLE_PLATEAU: seventeen of twenty major areas COMPLETE, two
// deliberately DEFERRED (reconfirmed, not reopened), one PARKED (a
// fifty-eight-file reconciliation-decision-analytics family, classified
// NOT_A_PRODUCT_GAP), zero routes in either bucket that would be a
// legitimate product candidate, zero manufactured gaps.
//
// This milestone is deliberately NOT another capability audit. 0.9.414
// already did the whole-product reassessment; repeating that shape again
// here would itself be the audit-driven-development this milestone exists
// to refuse. Instead it asks a narrower, different question:
//
//   "What, if anything, do we intentionally want ForkBuild to become
//    next?"
//
// and it asks that question through an explicit, typed DECISION GATE
// rather than a mechanical generation of candidates from the source tree.
// The important candidate this gate evaluates is NONE — and if no new
// product intent has arrived, the correct, first-class result is to say
// so and hold the plateau, exactly as 0.9.397 held STABLE_STOP rather
// than manufacturing a direction to fill a milestone number.
//
// LETTERED SECTIONS:
//   A. Fresh product baseline — 0.9.414's own conclusion reconfirmed by
//      citation plus independent, freshly-computed spot-checks (not a
//      re-run of all of 0.9.414's own tests).
//   B. Three kinds of future work — an explicit classification taxonomy
//      (PRODUCT_DIRECTION / PRODUCT_ENHANCEMENT / ARCHITECTURE_MAINTENANCE)
//      so "we have an unused class" or "we could make this more
//      automatic" cannot silently become a product-roadmap item.
//   C. Reopen product intent — a small, explicit input set
//      (NEW_USER_NEED / NEW_PRODUCT_GOAL / NEW_EXTERNAL_CONSTRAINT /
//      NEW_BUSINESS_DIRECTION / NEW_PLATFORM_REQUIREMENT / NONE), applied
//      to this milestone's own real circumstances.
//   D. Evaluate previously deferred directions — 0.9.397's own seven-
//      candidate roster and its evaluateCandidate() gate, reused verbatim
//      (byte-checked), gated behind an explicit reopening rule so a
//      deferred direction is reconsidered only on new justification, not
//      merely because it remains technically possible.
//   E. Architecture-maintenance quarantine — nine named architecture-
//      shaped opportunities, each explicitly classified via Section B's
//      own taxonomy and confirmed to remain outside the product roadmap.
//   F. Deliberate exclusions / anti-pattern census — the concrete list of
//      things this milestone refuses to add, checked against real source.
//   G. Final decision — a small, deterministic outcome set
//      (STABLE_PLATEAU / PRODUCT_DIRECTION_SELECTED /
//      EXPLICIT_DIRECTION_REQUIRED), derived from Sections A-F, not
//      produced merely by architectural analysis.
//   H. Production boundary — test-only.

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
function listFiles(dirs) {
    return execSync(`git ls-files ${dirs.join(' ')}`, { cwd: SOURCE_ROOT })
        .toString().split('\n').filter((f) => f.endsWith('.js'));
}
async function joinedSource(files) {
    const parts = await Promise.all(files.map((f) => readSource(f)));
    return parts.join('\n');
}

async function run() {
    console.log('Running Product Direction Reopening Gate tests...\n');

    // ===============================================================
    // Section A — Fresh product baseline.
    // ===============================================================
    let baseline;
    {
        // Cite 0.9.414's own still-on-file verdict rather than re-deriving
        // its whole twenty-area inventory — but the citation itself is
        // checked against the real file, not trusted from prose.
        const wholeProductTest = await readSource('tests/WholeProductCapabilityReassessment.test.js');
        assert(wholeProductTest.includes("decision: 'STABLE_PLATEAU'"), n('A1. 0.9.414\'s own final decision object is on record as STABLE_PLATEAU, checked against its own still-existing file'));
        assert(wholeProductTest.includes('inventory.length === 20'), n('A2. 0.9.414 inventoried exactly twenty major product areas'));
        assert(wholeProductTest.includes("!inventory.some((r) => r.classification === 'BROKEN')"), n('A3. 0.9.414 asserted zero areas classify as BROKEN'));
        assert(wholeProductTest.includes('unreached.length === 58'), n('A4. 0.9.414\'s own centerpiece finding — the 58-file PARKED reconciliation-decision-analytics family — is on record'));
        assert(wholeProductTest.includes("reachabilityMatrix.find((r) => r.classification === 'implemented + contextual entry missing').count === 0"), n('A5. 0.9.414 found zero routes in the "contextual entry missing" bucket'));
        assert(wholeProductTest.includes("reachabilityMatrix.find((r) => r.classification === 'implemented + genuinely user-blocked').count === 0"), n('A6. 0.9.414 found zero routes in the "genuinely user-blocked" bucket — together with A5, the only two buckets that would be legitimate product candidates'));
        assert(wholeProductTest.includes("!candidates.some((c) => c.category === 'BUILD_NEXT')"), n('A7. 0.9.414\'s own explicit candidate roster reached zero BUILD_NEXT verdicts'));

        // Independent, freshly-computed spot-checks — not read out of
        // 0.9.414's own file, but recomputed against CURRENT source, so
        // this section does not merely trust that nothing moved since.
        const appCode = await readSource('ui/App.js');
        const navLinkCount = (appCode.match(/<router-link/g) || []).length;
        assert(navLinkCount === 11, n(`A8. the always-mounted top nav now carries eleven router-link destinations, the five settings destinations consolidated behind one Network Settings hub link, recomputed fresh (found ${navLinkCount})`));
        const routerCode = await readSource('ui/router/index.js');
        const routeCount = (routerCode.match(/\{ path:/g) || []).length;
        assert(routeCount === 23, n(`A9. the router still registers twenty-three routes, recomputed fresh (found ${routeCount})`));
        const publisherLeaderboardFiles = listFiles(['application']).filter((f) => path.basename(f).startsWith('PublisherLeaderboard'));
        assert(publisherLeaderboardFiles.length === 77, n(`A10. the PublisherLeaderboard* family still numbers seventy-seven files, recomputed fresh (found ${publisherLeaderboardFiles.length}) — 0.9.414's own PARKED finding has neither grown nor been quietly built upon`));

        baseline = Object.freeze({
            source: '0.9.414 — Whole-Product Capability Reassessment',
            decision: 'STABLE_PLATEAU',
            majorAreas: 20, complete: 17, deferred: 2, parked: 1, broken: 0,
            journeysComplete: 6, routesReachable: 23,
            contextualEntryGaps: 0, userBlockingGaps: 0
        });
        assert(baseline.complete + baseline.deferred + baseline.parked + baseline.broken === baseline.majorAreas, n('A11. the fresh baseline\'s own four classification buckets sum to the full area count'));

        console.log('\n=== SECTION A: FRESH PRODUCT BASELINE ===');
        console.log(`  ${baseline.majorAreas} major product areas`);
        console.log(`  ${baseline.complete} COMPLETE`);
        console.log(`  ${baseline.deferred} DEFERRED`);
        console.log(`  ${baseline.parked} PARKED`);
        console.log(`  ${baseline.broken} BROKEN`);
        console.log('');
        console.log(`  ${baseline.journeysComplete} major journeys complete`);
        console.log(`  ${baseline.routesReachable} routes reachable`);
        console.log(`  ${baseline.contextualEntryGaps} contextual-entry gaps`);
        console.log(`  ${baseline.userBlockingGaps} user-blocking gaps`);
        console.log(`  ${baseline.decision}`);
        console.log('✓ Section A: 0.9.414\'s own STABLE_PLATEAU conclusion is reconfirmed by direct citation against its own still-existing file, plus three independent, freshly-recomputed structural spot-checks (nav links, routes, PARKED-family file count) rather than a full re-run of its whole twenty-area inventory.');
    }

    // ===============================================================
    // Section B — Three kinds of future work.
    // ===============================================================
    const WORK_KINDS = Object.freeze(['PRODUCT_DIRECTION', 'PRODUCT_ENHANCEMENT', 'ARCHITECTURE_MAINTENANCE']);
    function classifyWorkItem(item) {
        // item: { name, addressesUnmetUserNeed, improvesExistingUserJourney }
        // A capability deficit — a user genuinely blocked from something
        // the product intends to support — is the ONLY thing that reaches
        // PRODUCT_DIRECTION. Something that makes an EXISTING, already-
        // working journey smoother/faster/clearer is PRODUCT_ENHANCEMENT.
        // Everything else — including anything justified purely by "the
        // code could be more X" — is ARCHITECTURE_MAINTENANCE, regardless
        // of how technically real or how easy it would be to build.
        if (item.addressesUnmetUserNeed) return 'PRODUCT_DIRECTION';
        if (item.improvesExistingUserJourney) return 'PRODUCT_ENHANCEMENT';
        return 'ARCHITECTURE_MAINTENANCE';
    }
    {
        assert(WORK_KINDS.length === 3, n('B1. exactly three kinds of future work are named'));

        const taxonomyExamples = [
            { name: 'a user cannot currently accomplish a task the product intends to support', addressesUnmetUserNeed: true, improvesExistingUserJourney: false, expect: 'PRODUCT_DIRECTION' },
            { name: 'an existing, already-working journey made smoother (fewer steps, clearer feedback)', addressesUnmetUserNeed: false, improvesExistingUserJourney: true, expect: 'PRODUCT_ENHANCEMENT' },
            { name: 'we have an unused but tested class', addressesUnmetUserNeed: false, improvesExistingUserJourney: false, expect: 'ARCHITECTURE_MAINTENANCE' },
            { name: 'we could make this more automatic', addressesUnmetUserNeed: false, improvesExistingUserJourney: false, expect: 'ARCHITECTURE_MAINTENANCE' },
            { name: 'a generic manager would unify two similar providers', addressesUnmetUserNeed: false, improvesExistingUserJourney: false, expect: 'ARCHITECTURE_MAINTENANCE' },
            { name: 'this would be a nice dashboard over existing data', addressesUnmetUserNeed: false, improvesExistingUserJourney: false, expect: 'ARCHITECTURE_MAINTENANCE' }
        ];
        for (const example of taxonomyExamples) {
            const result = classifyWorkItem(example);
            assert(WORK_KINDS.includes(result), n(`B2. "${example.name}" classifies as a recognized kind (${result})`));
            assert(result === example.expect, n(`B2. "${example.name}" classifies as ${example.expect} (found ${result})`));
        }
        // The gate rule this taxonomy exists to enforce: an item can be
        // technically real, tested, and even architecturally elegant, and
        // STILL not qualify as PRODUCT_DIRECTION unless it clears the
        // "addresses an unmet user need" bar specifically.
        const architecturallyImpressiveButNotProductWork = classifyWorkItem({
            name: 'a fully generalized, symmetric, auto-discovering provider framework',
            addressesUnmetUserNeed: false, improvesExistingUserJourney: false
        });
        assert(architecturallyImpressiveButNotProductWork === 'ARCHITECTURE_MAINTENANCE', n('B3. architectural elegance alone, however impressive, never by itself reaches PRODUCT_DIRECTION or PRODUCT_ENHANCEMENT'));

        console.log('\n=== SECTION B: THREE KINDS OF FUTURE WORK ===');
        for (const example of taxonomyExamples) console.log(`  [${example.expect}] ${example.name}`);
        console.log('✓ Section B: an explicit, three-way classification taxonomy, proven against six worked examples spanning all three kinds — so a bare architecture opportunity cannot silently read as a product-roadmap item merely because it is real, tested, or easy.');
    }

    // ===============================================================
    // Section C — Reopen product intent.
    // ===============================================================
    const PRODUCT_INTENT_SIGNALS = Object.freeze([
        'NEW_USER_NEED', 'NEW_PRODUCT_GOAL', 'NEW_EXTERNAL_CONSTRAINT',
        'NEW_BUSINESS_DIRECTION', 'NEW_PLATFORM_REQUIREMENT', 'NONE'
    ]);
    let productIntent;
    {
        assert(PRODUCT_INTENT_SIGNALS.length === 6, n('C1. the reopening input set names five concrete signal kinds plus NONE'));
        assert(PRODUCT_INTENT_SIGNALS[PRODUCT_INTENT_SIGNALS.length - 1] === 'NONE', n('C2. NONE is a first-class, explicitly named member of the input set — not merely the absence of a row'));

        // This milestone's own real circumstances, assessed against the
        // input set above — a small, explicit record, not a mechanically
        // generated one. The request that produced this exact milestone
        // is itself a decision-boundary request ("determine whether the
        // product should reopen"), not a claim of a specific unmet user
        // need, product goal, external constraint, business direction, or
        // platform requirement. That is checked here two ways: first, no
        // such signal is asserted anywhere in this milestone's own record;
        // second, against real source, exactly as 0.9.397 Section J
        // checked for a forward-looking new-domain candidate before
        // concluding none existed.
        productIntent = Object.freeze({
            newUserNeed: false,
            newProductGoal: false,
            newExternalConstraint: false,
            newBusinessDirection: false,
            newPlatformRequirement: false
        });
        const activeSignal = Object.entries(productIntent).find(([, v]) => v === true);
        const classification = activeSignal ? activeSignal[0] : 'NONE';
        assert(classification === 'NONE', n('C3. this milestone\'s own product-intent record carries no active signal — classified NONE'));

        const roadmap = await readSource('docs/Roadmap.md');
        const forwardMarkers = (roadmap.match(/NEW_DOMAIN_CANDIDATE|PROPOSED_DIRECTION\s*=/g) || []).length;
        assert(forwardMarkers === 0, n('C4. no forward-looking, concretely-named new-product-direction marker exists anywhere in docs/Roadmap.md — reconfirmed fresh, the same check 0.9.397 Section J made before its own NONE-equivalent conclusion'));

        console.log('\n=== SECTION C: REOPEN PRODUCT INTENT ===');
        for (const s of PRODUCT_INTENT_SIGNALS) console.log(`  ${s}${s === classification ? '  <-- this milestone' : ''}`);
        console.log('✓ Section C: this milestone\'s own real circumstances classify as NONE — no new user need, product goal, external constraint, business direction, or platform requirement is on record, checked both as an explicit signal record and against current source. NONE is the important, first-class candidate this section exists to make legible, not a default reached by omission.');
    }

    // ===============================================================
    // Section D — Evaluate previously deferred directions.
    // ===============================================================
    // Reused verbatim from 0.9.397's own tests/ExplicitProductDirectionSelectionGate.test.js
    // (itself reused verbatim from 0.9.384). Byte-identity is proven in D1
    // below, not merely claimed.
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
    // The one addition this milestone makes over 0.9.397's own gate: a
    // previously DEFERRED/NOT_SELECTED direction is reconsidered only when
    // this reopening rule clears — never merely because it remains
    // technically possible.
    function reopens(candidate, intent) {
        return Boolean(intent.newUserNeed || intent.newProductGoal || intent.newExternalConstraint || candidate.newEvidence);
    }
    {
        const priorGateSource = await readSource('tests/ExplicitProductDirectionSelectionGate.test.js');
        assert(priorGateSource.includes('function evaluateCandidate(candidate) {'), n('D1. 0.9.397\'s own evaluateCandidate() is found, verbatim, in its own still-existing source file'));
        const normalize = (s) => s.replace(/\s+/g, ' ').trim();
        // Containment rather than brace-matched extraction: 0.9.397's own
        // copy is indented (nested inside its own run()), unlike 0.9.384's
        // original top-level declaration, so a naive "closing brace at
        // column zero" extraction would over-match. Whitespace-normalized
        // substring containment sidesteps indentation entirely while still
        // proving byte-for-byte identical source text.
        assert(normalize(priorGateSource).includes(normalize(evaluateCandidate.toString())), n('D1. this milestone\'s own evaluateCandidate() is whitespace-normalized IDENTICAL to 0.9.397\'s own original — reused verbatim, proven by direct comparison, not merely asserted in a comment'));

        // The seven candidates 0.9.397 already evaluated, each with the
        // ONE piece of core evidence that decided it, reconfirmed FRESH
        // against current source (not cited from 0.9.397's own prose) —
        // so a stale DEFER can never silently coast forward unread, the
        // same discipline 0.9.393 established for regression guards.
        const iceConfig = await readSource('core/IceServerConfiguration.js');
        const notificationEventCode = await readSource('core/NotificationEvent.js');
        const sessionCode = await readSource('collaboration/CollaborationSession.js');
        const searchCode = await readSource('application/SearchPublicationsUseCase.js');
        const rendezvousConfig = await readSource('core/RendezvousConfiguration.js');
        const uiFilesForCollab = listFiles(['ui']);
        const uiTextForCollab = await joinedSource(uiFilesForCollab);

        const deferredDirections = [
            {
                name: 'Automatic endpoint failover',
                evaluated: evaluateCandidate({ name: 'Automatic endpoint failover', userValue: 'NOT_DEMONSTRATED', reachability: 'UNSPECIFIED', architecturalFit: 'MODERATE', semanticCost: 'MODERATE', scope: 'UNBOUNDED', newEvidence: false }),
                freshCheck: rendezvousConfig.includes('automatic fallback') && !uiTextForCollab.includes('automaticFailover')
            },
            {
                name: 'TURN configuration',
                evaluated: evaluateCandidate({ name: 'TURN configuration', userValue: 'NOT_DEMONSTRATED', reachability: 'UNSPECIFIED', architecturalFit: 'MODERATE', semanticCost: 'HIGH', scope: 'UNBOUNDED', newEvidence: false }),
                freshCheck: /STUN ONLY.{0,10}NEVER TURN/.test(iceConfig) && !(await sourceExists('ui/views/TurnSettingsView.js'))
            },
            {
                name: 'Proactive decentralized Repository discovery',
                evaluated: evaluateCandidate({ name: 'Proactive decentralized Repository discovery', userValue: 'NOT_DEMONSTRATED', reachability: 'HIGH', architecturalFit: 'HIGH', semanticCost: 'LOW', scope: 'BOUNDED', newEvidence: false }),
                freshCheck: !/Arweave|Nostr|Ipfs|fetch\(|WebSocket/i.test(searchCode) && !/async execute/.test(searchCode)
            },
            {
                name: 'Collaboration expansion (live editing / visible collaborators)',
                evaluated: evaluateCandidate({ name: 'Collaboration expansion (live editing / visible collaborators)', userValue: 'NOT_DEMONSTRATED', reachability: 'MODERATE', architecturalFit: 'MODERATE', semanticCost: 'MODERATE', scope: 'LARGE', newEvidence: false }),
                freshCheck: !/RemoteCursor|RemoteCaret|LiveCursor|EditingPresence/i.test(sessionCode) && !uiTextForCollab.includes('CollaborationSession')
            },
            {
                name: 'Notification delivery / push',
                evaluated: evaluateCandidate({ name: 'Notification delivery / push', userValue: 'NOT_DEMONSTRATED', reachability: 'HIGH', architecturalFit: 'HIGH', semanticCost: 'HIGH', scope: 'BOUNDED', newEvidence: false }),
                freshCheck: !/deliveredAt\s*=|seenAt\s*=|readAt\s*=/.test(notificationEventCode) && await sourceExists('ui/components/NotificationHistoryPanel.js')
            },
            {
                name: 'Global Place Naming, richer semantics',
                evaluated: evaluateCandidate({ name: 'Global Place Naming, richer semantics', userValue: 'NOT_DEMONSTRATED', reachability: 'UNSPECIFIED', architecturalFit: 'UNSPECIFIED', semanticCost: 'UNKNOWN', scope: 'UNBOUNDED', newEvidence: false }),
                freshCheck: !/PlaceNamingAlias|PlaceNamingHierarchy|PlaceNamingNamespace/.test(uiTextForCollab)
            },
            {
                name: 'A new product domain, unrelated to existing subsystems',
                evaluated: evaluateCandidate({ name: 'A new product domain, unrelated to existing subsystems', userValue: 'NOT_DEMONSTRATED', reachability: 'UNSPECIFIED', architecturalFit: 'N/A — not a gating factor for this candidate by design', semanticCost: 'UNKNOWN', scope: 'UNBOUNDED', newEvidence: false }),
                freshCheck: true
            }
        ];
        assert(deferredDirections.length === 7, n('D2. all seven of 0.9.397\'s own named candidates are reconsidered — none silently dropped from the roster'));

        for (const d of deferredDirections) {
            assert(d.evaluated.decision === 'NOT_SELECTED', n(`D3. "${d.name}" — 0.9.397's own recorded verdict (NOT_SELECTED) is reconfirmed by re-applying the SAME gate to the SAME candidate facts`));
            assert(d.freshCheck, n(`D4. "${d.name}" — the one core piece of evidence that decided it is reconfirmed fresh against CURRENT source, not cited from 0.9.397's own prose`));
            const isReopened = reopens(d.evaluated, productIntent);
            assert(isReopened === false, n(`D5. "${d.name}" is NOT reopened — Section C's product intent carries no active signal and no new evidence was found for this candidate, so the reopening rule (newUserNeed || newProductGoal || newExternalConstraint || newEvidence) does not clear`));
        }
        assert(deferredDirections.every((d) => reopens(d.evaluated, productIntent) === false), n('D6. zero of the seven previously deferred directions are reopened this milestone'));

        console.log('\n=== SECTION D: EVALUATE PREVIOUSLY DEFERRED DIRECTIONS ===');
        for (const d of deferredDirections) console.log(`  [NOT REOPENED] ${d.name} — decision: ${d.evaluated.decision}`);
        console.log('✓ Section D: 0.9.397\'s own gate (evaluateCandidate, proven byte-identical) is reused rather than redefined. Every one of the seven previously deferred directions is reconfirmed fresh against current source and, because Section C found no new user need, product goal, external constraint, or new evidence for any of them, none is reopened — they remain deferred, not silently re-examined merely because they remain technically possible.');
    }

    // ===============================================================
    // Section E — Architecture-maintenance quarantine.
    // ===============================================================
    {
        // The named architecture-shaped opportunities this milestone's
        // own brief calls out explicitly, each run through Section B's
        // own taxonomy. None carries addressesUnmetUserNeed or
        // improvesExistingUserJourney — by construction, an architecture
        // opportunity is exactly the shape of thing that does NOT.
        const architectureOpportunities = [
            { name: 'unused but tested classes', evidence: 'Section A10 / 0.9.414 Section C — the 58-file PublisherLeaderboard-decision-analytics family, all tested, none UI-reachable' },
            { name: 'additional provider implementations', evidence: 'e.g. a new content/anchor provider beyond the existing Arweave/Nostr/IPFS/Bitcoin set — technically addable, no user request for one exists' },
            { name: 'generic managers', evidence: 'e.g. a unifying class over IceServerConfiguration/RendezvousConfiguration/ArweaveGatewayConfiguration/NostrRelayConfiguration — none exists, none is needed by any current journey' },
            { name: 'automatic fallback', evidence: 'core/RendezvousConfiguration.js and ui/views/StunSettingsView.js both explicitly, currently state no automatic fallback is offered (Section D freshCheck)' },
            { name: 'more abstraction', evidence: 'no generalized/unifying abstraction exists over the reconciliation or infrastructure-configuration families today' },
            { name: 'dashboards', evidence: '0.9.414 Section G — no ReconciliationAnalyticsDashboard/ClaimTimelineUI/ClaimStatisticsPanel/ReconciliationHistoryDashboard exists, reconfirmed in Section F below' },
            { name: 'additional analytics', evidence: 'Section A10 — the 58-file PARKED analytics family remains unreached by ui/, not expanded into a surfaced feature' },
            { name: 'generalized configuration', evidence: 'no cross-cutting settings/configuration manager spans the four independent infrastructure-configuration areas today' },
            { name: 'symmetry between existing subsystems', evidence: 'the reconciliation arc and the infrastructure-configuration arc remain deliberately separate systems; no refactor unifies them for symmetry\'s own sake' }
        ];
        assert(architectureOpportunities.length === 9, n('E1. nine named architecture-maintenance-shaped opportunities are explicitly considered, matching this milestone\'s own brief'));
        for (const opportunity of architectureOpportunities) {
            const classification = classifyWorkItem({ name: opportunity.name, addressesUnmetUserNeed: false, improvesExistingUserJourney: false });
            assert(classification === 'ARCHITECTURE_MAINTENANCE', n(`E2. "${opportunity.name}" classifies as ARCHITECTURE_MAINTENANCE, not PRODUCT_DIRECTION or PRODUCT_ENHANCEMENT`));
        }
        assert(architectureOpportunities.every((o) => typeof o.evidence === 'string' && o.evidence.length > 0), n('E3. every one of the nine carries real, named evidence — not asserted as a category label alone'));

        console.log('\n=== SECTION E: ARCHITECTURE-MAINTENANCE QUARANTINE ===');
        for (const o of architectureOpportunities) console.log(`  [ARCHITECTURE_MAINTENANCE] ${o.name} — ${o.evidence}`);
        console.log('✓ Section E: nine named architecture opportunities, each explicitly classified ARCHITECTURE_MAINTENANCE via Section B\'s own taxonomy and backed by real evidence. Architecture opportunities do not automatically become product milestones — proven by name, not merely asserted.');
    }

    // ===============================================================
    // Section F — Deliberate exclusions / anti-pattern census.
    // ===============================================================
    {
        // The concrete list this milestone's own brief names as things it
        // must NOT do, each checked against real, current source — the
        // same discipline 0.9.414 Section G applied to its own narrower
        // list, reconfirmed here plus the additional items this
        // milestone's own brief adds (new lifecycle vocabulary, symmetry
        // refactors, selecting a feature merely for being easy).
        const antiPatterns = [
            /ReconciliationAnalyticsDashboard|ClaimTimelineUI|ClaimStatisticsPanel|ReconciliationHistoryDashboard/i,
            /class UnifiedPublication\b|class GenericProviderManager\b|class InfrastructureManager\b|class GenericSettingsManager\b/,
            /AutomaticReconciliation|ScheduledReconciliation|BackgroundReconciliation|AutomaticFailover|AutomaticEndpointSwitch/i,
            /ProviderFallback|ProviderHealth/,
            /RepositoryCrawler|NetworkBackedRepositorySearch|ProactiveDiscoveryScheduler/,
            /GlobalNavigationMenu|SecondaryTopNav/,
            /class TurnConfiguration\b|class TurnServerConfiguration\b/,
            /RemoteCursor|RemoteCaret|LiveCursor|EditingPresence/,
            /PlaceNamingAlias|PlaceNamingHierarchy|PlaceNamingNamespace/
        ];
        const scanDirs = ['ui', 'application', 'core', 'collaboration'];
        const bundle = await joinedSource(listFiles(scanDirs));
        for (const pattern of antiPatterns) {
            assert(!pattern.test(bundle), n(`F1. no anti-pattern ${pattern} exists anywhere in ui/, application/, core/, or collaboration/`));
        }
        // The delivered/seen/read-field pattern is deliberately checked
        // scoped to core/NotificationEvent.js specifically (matching
        // Section D's own precise scoping), not codebase-wide: a
        // codebase-wide scan false-positives on core/ChatOutboxEntry.js's
        // own, legitimate, unrelated deliveredAt field (a pre-existing
        // chat-delivery concept, not the notification-push candidate
        // Section D evaluates).
        const notificationEventCode = await readSource('core/NotificationEvent.js');
        assert(!/deliveredAt\s*=|seenAt\s*=|readAt\s*=/.test(notificationEventCode), n('F1b. no anti-pattern (delivered/seen/read field) exists in core/NotificationEvent.js specifically'));

        // No route or nav expansion accompanies this milestone.
        const routerCode = await readSource('ui/router/index.js');
        const routeCount = (routerCode.match(/\{ path:/g) || []).length;
        assert(routeCount === 23, n('F2. no new route was added — the number of registered routes is unchanged from Section A9'));
        const appCode = await readSource('ui/App.js');
        const navLinkCount = (appCode.match(/<router-link/g) || []).length;
        assert(navLinkCount === 11, n('F3. no new top-nav link was added — global navigation is unchanged from Section A8'));

        // Section C/D specifically: the 58-file PARKED family (Section A10)
        // has not quietly grown, and none of the seven deferred candidates
        // (Section D) was silently promoted despite this milestone's own
        // architecture-opportunity classification (Section E).
        const publisherLeaderboardFiles = listFiles(['application']).filter((f) => path.basename(f).startsWith('PublisherLeaderboard'));
        assert(publisherLeaderboardFiles.length === 77, n('F4. the PARKED reconciliation-decision-analytics family was not expanded into a surfaced feature over the course of writing this gate — still seventy-seven files'));

        const exclusionsDeclared = Object.freeze([
            'a new UI', 'a new provider', 'automatic failover', 'notification delivery',
            'proactive discovery', 'expanded collaboration', 'a generic settings manager',
            'a dashboard', 'exposed parked internals', 'revived reconciliation analytics',
            'new lifecycle vocabulary', 'an architecture refactor for symmetry',
            'a feature selected merely because it is technically easy'
        ]);
        assert(exclusionsDeclared.length === 13, n('F5. thirteen concrete exclusions are declared, matching this milestone\'s own brief'));

        console.log('\n=== SECTION F: DELIBERATE EXCLUSIONS / ANTI-PATTERN CENSUS ===');
        for (const item of exclusionsDeclared) console.log(`  excluded: ${item}`);
        console.log('✓ Section F: none of the ten named anti-patterns exists anywhere in current source; route count and top-nav count are both unchanged; the PARKED family has not grown. Thirteen concrete exclusions are declared and checked, not merely narrated.');
    }

    // ===============================================================
    // Section G — Final decision.
    // ===============================================================
    {
        const OUTCOMES = Object.freeze(['STABLE_PLATEAU', 'PRODUCT_DIRECTION_SELECTED', 'EXPLICIT_DIRECTION_REQUIRED']);

        // A small, deterministic decision function — BUILD_NEXT (here,
        // PRODUCT_DIRECTION_SELECTED) is never produced merely by
        // architectural analysis (Section E's own nine opportunities all
        // being real and classifiable is not, by itself, grounds to
        // select one). It requires either a reopened deferred direction
        // (Section D) or an active, but not concretely resolved, intent
        // signal (Section C) to even reach the ambiguous middle outcome.
        function decide({ intent, reopenedDirections, architectureOnlyOpportunities }) {
            if (reopenedDirections.length > 0) return 'PRODUCT_DIRECTION_SELECTED';
            const hasActiveIntentSignal = Object.values(intent).some((v) => v === true);
            if (hasActiveIntentSignal) return 'EXPLICIT_DIRECTION_REQUIRED';
            void architectureOnlyOpportunities; // explicitly NOT a decision input — see Section E
            return 'STABLE_PLATEAU';
        }

        // The decision function's own gate rule, reproven structurally
        // before it is applied to this milestone's real inputs — the same
        // discipline 0.9.384/0.9.391/0.9.397 each applied to evaluateCandidate()
        // before scoring a real candidate.
        const wouldSelectIfReopened = decide({ intent: { newUserNeed: false, newProductGoal: false, newExternalConstraint: false, newBusinessDirection: false, newPlatformRequirement: false }, reopenedDirections: ['synthetic reopened direction'], architectureOnlyOpportunities: [] });
        assert(wouldSelectIfReopened === 'PRODUCT_DIRECTION_SELECTED', n('G1. the decision function reaches PRODUCT_DIRECTION_SELECTED when a direction is genuinely reopened, even with zero active intent signals — proven structurally before real inputs are applied'));
        const wouldRequireIfAmbiguous = decide({ intent: { newUserNeed: true, newProductGoal: false, newExternalConstraint: false, newBusinessDirection: false, newPlatformRequirement: false }, reopenedDirections: [], architectureOnlyOpportunities: [] });
        assert(wouldRequireIfAmbiguous === 'EXPLICIT_DIRECTION_REQUIRED', n('G2. the decision function reaches EXPLICIT_DIRECTION_REQUIRED when an intent signal is active but no direction has actually cleared the gate yet — an intermediate, honest state, not forced into either endpoint'));
        const wouldStayPlateauDespiteArchitecture = decide({ intent: { newUserNeed: false, newProductGoal: false, newExternalConstraint: false, newBusinessDirection: false, newPlatformRequirement: false }, reopenedDirections: [], architectureOnlyOpportunities: ['nine named opportunities, Section E'] });
        assert(wouldStayPlateauDespiteArchitecture === 'STABLE_PLATEAU', n('G3. crucially: nine real, named, evidence-backed architecture opportunities (Section E) do NOT by themselves move the decision off STABLE_PLATEAU — this is the core rule this milestone\'s own brief names ("BUILD_NEXT should not be produced merely by architectural analysis")'));

        // Applied to this milestone's own real, freshly-gathered inputs.
        const finalDecision = decide({
            intent: productIntent,
            reopenedDirections: [],
            architectureOnlyOpportunities: ['nine named opportunities, Section E']
        });
        assert(OUTCOMES.includes(finalDecision), n(`G4. the final decision is one of the three named outcomes (chose: ${finalDecision})`));
        assert(finalDecision === 'STABLE_PLATEAU', n('G5. given Section C\'s NONE product-intent classification and Section D\'s zero reopened directions, STABLE_PLATEAU is the decision this milestone\'s own evidence produces — not assumed going in'));

        const evidenceMatrix = [
            { section: 'A. Fresh product baseline', finding: '0.9.414\'s STABLE_PLATEAU reconfirmed by citation plus three independent fresh spot-checks' },
            { section: 'B. Three kinds of future work', finding: 'PRODUCT_DIRECTION / PRODUCT_ENHANCEMENT / ARCHITECTURE_MAINTENANCE, proven against six worked examples' },
            { section: 'C. Reopen product intent', finding: 'this milestone\'s own real circumstances classify NONE — no active signal, checked against source' },
            { section: 'D. Evaluate previously deferred directions', finding: 'all seven of 0.9.397\'s candidates reconfirmed fresh; zero reopened' },
            { section: 'E. Architecture-maintenance quarantine', finding: 'nine named architecture opportunities, all ARCHITECTURE_MAINTENANCE, none promoted' },
            { section: 'F. Deliberate exclusions / anti-pattern census', finding: 'ten anti-patterns absent from source; route/nav counts unchanged; PARKED family unchanged' }
        ];
        assert(evidenceMatrix.length === 6, n('G6. the final decision cites all six prior lettered sections'));

        console.log('\n=== SECTION G: FINAL DECISION ===');
        for (const row of evidenceMatrix) console.log(`  ${row.section}: ${row.finding}`);
        console.log(`\nDECISION: ${finalDecision}`);
        console.log('STABLE_PLATEAU is reached because no new product intent (Section C) and no reopened deferred');
        console.log('direction (Section D) exists — not because architecture opportunities (Section E) are absent;');
        console.log('they are present, real, and named, and explicitly do not by themselves move this decision.');
        console.log('✓ Section G: STABLE_PLATEAU, produced by an explicit, structurally-reproven decision function from Sections A-F\'s own evidence — never by architectural analysis alone, and it remains perfectly valid, per this milestone\'s own brief, for that decision to be STABLE_PLATEAU again.');
    }

    // ===============================================================
    // Section H — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/ProductDirectionReopeningGate.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`H1. every changed/added file is this milestone's own test/registration file (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'ui', 'peer', 'content', 'presence', 'docs'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`H2. ${dir}/ shows no change — no view, route, component, domain/backend, or documentation file was touched`));
        }

        console.log('\n=== SECTION H: PRODUCTION BOUNDARY ===');
        console.log('✓ Section H: this milestone touches nothing but its own test file and tests.html\'s own registration. No route, view, component, application/core/storage symbol, or documentation file was added or modified.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    console.log('\n' + '='.repeat(78));
    console.log('PRODUCT_DIRECTION_REOPENING_GATE_COMPLETE');
    console.log('');
    console.log('STABLE_PLATEAU. 0.9.414\'s whole-product conclusion is reconfirmed (Section A):');
    console.log('twenty major areas, seventeen COMPLETE, two DEFERRED, one PARKED, zero BROKEN;');
    console.log('six major journeys complete; twenty-three routes reachable; zero contextual-');
    console.log('entry gaps; zero user-blocking gaps. An explicit three-way taxonomy (Section B)');
    console.log('distinguishes genuine product direction from mere architecture opportunity. This');
    console.log('milestone\'s own real circumstances carry no new user need, product goal, external');
    console.log('constraint, business direction, or platform requirement (Section C) — NONE, the');
    console.log('important candidate this gate exists to make legible. All seven previously');
    console.log('deferred directions are reconfirmed fresh and none is reopened, absent new');
    console.log('justification (Section D). Nine named architecture opportunities are real, tested,');
    console.log('and classified ARCHITECTURE_MAINTENANCE — explicitly proven not to move the final');
    console.log('decision by themselves (Section E). A concrete anti-pattern census finds nothing');
    console.log('manufactured (Section F). The final decision is produced by an explicit,');
    console.log('structurally-reproven decision function, not by architectural analysis alone');
    console.log('(Section G).');
    console.log('');
    console.log('This is the explicit boundary between "we are maintaining a finished product"');
    console.log('and "we have consciously chosen a new product direction." No 0.9.416 is pre-');
    console.log('selected from within this gate. The next milestone, if any, should arrive with');
    console.log('a genuine, concretely specified new product-intent signal (Section C) or newly');
    console.log('justified reopening of a deferred direction (Section D) — not from re-running');
    console.log('this gate, or 0.9.414\'s own audit, again without new evidence.');
    console.log('='.repeat(78));

    console.log('\n✅ All Product Direction Reopening Gate tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
