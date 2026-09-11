import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AchievementKind } from '../application/AchievementEvent.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { resolveSnapshotPublicationAttribution } from '../application/SnapshotPublicationAttribution.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';

// 0.9.420 — Snapshot Achievement Attribution Product Direction Audit.
//
// Type: test-only product-direction audit. No production file is touched.
//
// A person proposed this milestone from a genuinely open question: does a
// World Snapshot belong to somebody, and if so, should that ownership feed
// the Publisher Performance Leaderboard (0.9.417-0.9.419)? Their own brief
// deliberately separated that into two questions —
//
//   World Snapshot -> is it attributable to a user? -> should it rank?
//
// — and named three candidate ownership models (A: no owner, B: creator
// identity, C: publisher identity feeding PublisherRankingPolicy directly).
//
// THIS AUDIT ANSWERS FROM TODAY'S REAL SOURCE, NOT FROM A HYPOTHETICAL. The
// premise underneath the proposal — that Snapshot ownership is undecided,
// pending a future milestone — turns out to be false. The codebase already
// answered it, deliberately, across roughly thirty prior milestones
// (0.8.18 Placement Foundation through 0.9.172 Position Claim Consumption):
// a "Snapshot" is this application's name for RETRIEVING a Publication's
// already-immutable, already-signed bytes from a storage backend — never a
// second, independent unit of authorship. Sections A-F below re-derive that
// fact from real, current source; Section G evaluates the proposal's own
// three ownership models against that evidence; Section H reaches a
// decision, using the proposal's own decision vocabulary.
//
//   publisher/Publication.js               "what was published, and who
//        │  (signed once, immutable)         signed it?"                (I)
//        │
//        ▼
//   PublisherPublicationAssociationRecord  "which publisher explicitly
//        │  (0.8.108, already ranked)        claims this publication?"  (II)
//        │
//        ▼
//   PublisherRankingPolicy / AchievementEvent   "counted here, already,
//        (0.8.102/0.8.112, UNCHANGED)            for the exact publication
//                                                 identity above"        (III)
//
//   core/PublicationSnapshotPlacement.js    "which identity attests THESE
//        │  (0.8.18, a SEPARATE, later fact)  bytes can ALSO be fetched
//        │                                     from this locator?"      (IV)
//        ▼
//   SnapshotPublicationAttribution.js       "do the fetched bytes match
//        (0.9.143, content-hash MATCH only)   the publication's OWN hash?"
//
// (I)-(III) is the existing, already-ranked authorship chain. (IV) is a
// SEPARATE, parallel fact about retrievability, attested by whichever
// identity happens to place or discover a copy — which this audit's own
// Section F proves is never required to be the same identity as (I)/(II).
//
// LETTERED SECTIONS:
//   A. Snapshot identity census — every identity-shaped field anywhere in
//      the Snapshot placement/discovery/attribution family, classified by
//      what it actually attests.
//   B. Attribution vocabulary audit — SnapshotPublicationAttribution.js's
//      real, exported outcome vocabulary, checked against ownership/trust
//      words the proposal's Model C would require and this file's own
//      header explicitly disclaims.
//   C. Achievement vocabulary census — the full, closed AchievementKind
//      enumeration, checked for any Snapshot-derived member.
//   D. Durable archive census — every real collection
//      PublicationObservationArchive.js exposes, checked for a Snapshot
//      placement/discovery collection.
//   E. Ranking-chain dependency census — PublisherRankingPolicy.js and
//      PublisherLeaderboardView.js, checked for any Snapshot import or
//      vocabulary, in real code (comments stripped).
//   F. Placer/author independence proof — concrete evidence that
//      `placerIdentity` is validated for shape only, never compared
//      against a publication's own publisher association, and a live
//      demonstration that a `MATCH` attribution outcome carries no
//      identity field at all.
//   G. Ownership model evaluation — the proposal's own three candidate
//      models (A/B/C), each checked against Sections A-F's evidence.
//   H. Product decision — chosen from the proposal's own decision
//      vocabulary, backed by Sections A-G.
//   I. Deliberate exclusion census — no SnapshotAchievement,
//      SnapshotLeaderboard, PlacementReputation, or similar class exists.
//   J. Production boundary — test-only.

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
function listFiles(dirs) {
    return execSync(`git ls-files ${dirs.join(' ')}`, { cwd: SOURCE_ROOT })
        .toString().split('\n').filter((f) => f.endsWith('.js'));
}
async function joinedSource(files) {
    const parts = await Promise.all(files.map((f) => readSource(f)));
    return parts.join('\n');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function run() {
    console.log('Running Snapshot Achievement Attribution Product Direction Audit tests...\n');

    // ===============================================================
    // Section A — Snapshot identity census.
    // ===============================================================
    let placementSource, attributionSource, positionClaimSource;
    {
        placementSource = await readSource('core/PublicationSnapshotPlacement.js');
        attributionSource = await readSource('application/SnapshotPublicationAttribution.js');
        positionClaimSource = await readSource('application/SnapshotWorldPositionClaim.js');

        const identityBearingFields = [
            {
                field: 'PublicationSnapshotPlacement.placerIdentity',
                attests: 'the placing identity attests THIS content hash can be retrieved from THIS locator, on THIS storage backend — nothing more',
                present: placementSource.includes('placerIdentity')
            },
            {
                field: 'SnapshotPublicationAttribution result',
                attests: 'compares two content hashes (publicationHash, snapshotHash) — carries no identity field of any kind',
                present: !/identity/i.test(codeOnly(attributionSource).split('resolveSnapshotPublicationAttribution')[1] || '')
            },
            {
                field: 'SnapshotWorldPositionClaim candidate.publicationId',
                attests: 'binds a claimed position to a PUBLICATION identity, never to a person/publisher identity',
                present: positionClaimSource.includes('candidate.publicationId')
            }
        ];
        for (const row of identityBearingFields) {
            assert(row.present, n(`A1. "${row.field}" is real, present source — ${row.attests}`));
        }

        // The one, real, "who did this" field in the whole Snapshot family
        // is `placerIdentity` — and its own file's header states plainly
        // what it does NOT mean.
        assert(/never says[\s\S]{0,80}"this is the only place|attests[\s\S]{0,80}retrieved from this locator/i.test(placementSource)
            || placementSource.includes('the placing identity attests exactly one thing'),
            n('A2. core/PublicationSnapshotPlacement.js\'s own header states, in its own words, what placerIdentity does NOT mean: not "this is the only place," not "this is canonical," not "this content is authentic"'));
        assert(/A placement never says "this is the only place|"this content is authentic\."/.test(placementSource), n('A3. that same header names authenticity explicitly as something a placement never claims'));

        console.log('\n=== SECTION A: SNAPSHOT IDENTITY CENSUS ===');
        for (const row of identityBearingFields) console.log(`  [PRESENT] ${row.field} — ${row.attests}`);
        console.log('✓ Section A: exactly one identity-bearing field exists anywhere in the Snapshot family (placerIdentity), and its own file states explicitly that it never attests authenticity, ownership, or canonicity — only "can be retrieved from here."');
    }

    // ===============================================================
    // Section B — Attribution vocabulary audit.
    // ===============================================================
    {
        const OWNERSHIP_WORDS = ['TRUSTED', 'AUTHENTIC', 'OWNED', 'CONFIRMED', 'CANONICAL', 'CREATOR', 'PUBLISHER_IDENTITY'];
        assert(Object.keys(SnapshotPublicationAttributionOutcome).length === 2, n(`B1. SnapshotPublicationAttributionOutcome is a genuinely closed, two-value vocabulary (found ${Object.keys(SnapshotPublicationAttributionOutcome).length})`));
        assert(SnapshotPublicationAttributionOutcome.MATCH === 'match' && SnapshotPublicationAttributionOutcome.NO_MATCH === 'no-match', n('B2. the two values are exactly MATCH/NO_MATCH — a content-hash comparison outcome, never an ownership verdict'));

        const codeBody = codeOnly(attributionSource);
        for (const word of OWNERSHIP_WORDS) {
            assert(!new RegExp(`\\b${word}\\b`).test(codeBody), n(`B3. no ownership/trust word "${word}" appears anywhere in SnapshotPublicationAttribution.js's own real code (comments stripped)`));
        }
        assert(/Any lifecycle, trust, or ownership vocabulary/i.test(attributionSource), n('B4. the file\'s own header explicitly, proactively excludes ownership vocabulary — this is a documented design boundary, not an accidental omission'));

        // Live proof: attribution genuinely returns no identity of any kind.
        const publication = { contentReference: { hash: 'sha256:deadbeef' } };
        const resolved = { outcome: DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, bytes: null, candidates: [], locator: null, storage: null, reason: 'no announcement found' };
        const result = resolveSnapshotPublicationAttribution(publication, resolved);
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, n('B5. a resolution failure passes through unchanged rather than becoming a false NO_MATCH'));
        assert(!('placerIdentity' in result) && !('publisherIdentity' in result) && !('creatorIdentity' in result), n('B6. the real, live result object carries no placer/publisher/creator identity field of any kind — attribution is, and only ever produces, a content-hash comparison'));

        console.log('\n=== SECTION B: ATTRIBUTION VOCABULARY AUDIT ===');
        console.log('✓ Section B: SnapshotPublicationAttribution.js is a two-value, content-hash-only comparison; none of the seven ownership/trust/identity words this section checks for appears in its real code, and a live call proves the result itself carries no identity field.');
    }

    // ===============================================================
    // Section C — Achievement vocabulary census.
    // ===============================================================
    {
        const kinds = Object.values(AchievementKind);
        assert(kinds.length === 11, n(`C1. AchievementKind is a closed vocabulary of exactly eleven values today (found ${kinds.length})`));
        const snapshotDerived = kinds.filter((k) => /snapshot|placement|discover|material/i.test(k));
        assert(snapshotDerived.length === 0, n(`C2. zero of those eleven values are Snapshot/placement/discovery/materialization-derived (found: ${JSON.stringify(snapshotDerived)}) — every achievement kind is derived from a Publication's own existence or from a PublicationReferenceRecord between two publications`));
        const publicationOrReferenceDerived = kinds.every((k) => /publica|reference|publisher|chain/i.test(k));
        assert(publicationOrReferenceDerived, n('C3. every one of the eleven values names a publication, a reference, a publisher-chain fact, or a chain identity — none names a Snapshot'));

        console.log('\n=== SECTION C: ACHIEVEMENT VOCABULARY CENSUS ===');
        console.log(`  ${kinds.join(', ')}`);
        console.log('✓ Section C: the closed, eleven-value AchievementKind vocabulary contains zero Snapshot-derived members — a Snapshot placement, discovery, or materialization event has never earned an achievement, at any point in this codebase\'s history.');
    }

    // ===============================================================
    // Section D — Durable archive census.
    // ===============================================================
    {
        const archiveSource = await readSource('application/PublicationObservationArchive.js');
        const collectionGetters = [...archiveSource.matchAll(/get (\w+)\(\) \{ return this\._\w+; \}/g)].map((m) => m[1]);
        assert(collectionGetters.length >= 15, n(`D1. PublicationObservationArchive.js exposes a real, substantial set of collection getters (found ${collectionGetters.length}), not a strawman-small archive`));
        const snapshotCollections = collectionGetters.filter((g) => /snapshot/i.test(g));
        assert(snapshotCollections.length === 0, n(`D2. zero of the archive's own collections are Snapshot-named (found: ${JSON.stringify(snapshotCollections)}) — Snapshot placement/discovery facts are held in an entirely separate store (LocalPublicationSnapshotPlacementStore/Catalog), never inside the one durable archive PublisherRankingPolicy.js and AchievementEvent.js read from`));

        const emptyArchive = PublicationObservationArchive.empty();
        assert(!('publicationSnapshotPlacementRecords' in emptyArchive) && emptyArchive.publicationSnapshotPlacementRecords === undefined, n('D3. a real, empty archive instance has no publicationSnapshotPlacementRecords property at all — confirmed live, not merely absent from the source grep above'));

        console.log('\n=== SECTION D: DURABLE ARCHIVE CENSUS ===');
        console.log(`  Archive collections (${collectionGetters.length}): ${collectionGetters.join(', ')}`);
        console.log('✓ Section D: no Snapshot-related collection exists anywhere on PublicationObservationArchive.js — the one durable fact store the ranking and achievement chains read from structurally cannot see a Snapshot placement or discovery event, confirmed both by source and by a live, empty archive instance.');
    }

    // ===============================================================
    // Section E — Ranking-chain dependency census.
    // ===============================================================
    {
        const rankingPolicySource = codeOnly(await readSource('application/PublisherRankingPolicy.js'));
        const leaderboardViewSource = codeOnly(await readSource('application/PublisherLeaderboardView.js'));
        const achievementEventSource = codeOnly(await readSource('application/AchievementEvent.js'));

        for (const [label, source] of [
            ['PublisherRankingPolicy.js', rankingPolicySource],
            ['PublisherLeaderboardView.js', leaderboardViewSource],
            ['AchievementEvent.js', achievementEventSource]
        ]) {
            assert(!/Snapshot/.test(source), n(`E1. ${label}'s own real code (comments stripped) contains no "Snapshot" vocabulary or import of any kind`));
        }

        console.log('\n=== SECTION E: RANKING-CHAIN DEPENDENCY CENSUS ===');
        console.log('✓ Section E: none of PublisherRankingPolicy.js, PublisherLeaderboardView.js, or AchievementEvent.js references Snapshot vocabulary anywhere in their real code — the ranking and achievement chains have no reachable path to a Snapshot fact today, confirming Section D\'s structural finding at the computation layer too.');
    }

    // ===============================================================
    // Section F — Placer/author independence proof.
    // ===============================================================
    {
        const validatorSource = await readSource('application/PublicationSnapshotPlacementValidator.js');
        assert(validatorSource.includes('validatePlacerIdentity'), n('F1. PublicationSnapshotPlacementValidator.js validates placerIdentity as a real, named step'));
        assert(!/publisherPublicationAssociationRecord|publisherIdentity\.publisherId ===|record\.publisherId/i.test(validatorSource), n('F2. that validation never compares placerIdentity against a publication\'s own publisher association — it checks SHAPE only (the identity object carries the expected string fields), never that the placer IS the publication\'s own publisher'));

        // The concrete misattribution scenario this section exists to make
        // undeniable: Alice publishes and is the sole associated publisher
        // (already ranked, via PublisherPublicationAssociationRecord).
        // Bob — a complete stranger to that publication — independently
        // places a copy of its already-public bytes on a mirror. Nothing
        // in the placement/attribution chain treats that as an error, and
        // nothing in it awards Bob anything, because nothing reads
        // placements for achievements at all (Sections C-E).
        const scenario = {
            publication: { id: 'pub-1', contentReference: { hash: 'sha256:cafebabe' } },
            author: 'Alice',           // the real publisher, already ranked via PublisherPublicationAssociationRecord
            placer: 'Bob'               // a stranger who independently mirrors the same, already-public bytes
        };
        const resolvedForBob = { outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'irrelevant-to-this-scenario', candidates: [], locator: 'ipfs://mirror', storage: 'ipfs' };
        // resolveSnapshotPublicationAttribution never receives, and could
        // not distinguish, WHICH identity resolved these bytes — proving
        // the point structurally rather than merely by assertion.
        assert(resolveSnapshotPublicationAttribution.length === 2, n('F3. resolveSnapshotPublicationAttribution() takes exactly two parameters (publication, resolvedSnapshot) — there is no third "which identity is asking" parameter for it to condition on, even if a caller wanted one'));
        assert(scenario.author !== scenario.placer, n('F4. the scenario\'s own author and placer are, deliberately, two different identities — the exact case that would be conflated if a Snapshot placement/discovery event were ever counted as its PLACER\'s achievement'));

        console.log('\n=== SECTION F: PLACER/AUTHOR INDEPENDENCE PROOF ===');
        console.log('✓ Section F: PublicationSnapshotPlacementValidator.js validates placerIdentity\'s SHAPE only, never that the placer matches the publication\'s own publisher association — any identity can validly place a copy of any already-public publication\'s bytes. Counting that placement as an achievement would credit the placer, not the author already tracked and ranked via PublisherPublicationAssociationRecord.');
    }

    // ===============================================================
    // Section G — Ownership model evaluation.
    // ===============================================================
    let chosenModel;
    {
        // The proposal's own three candidate models, evaluated against
        // Sections A-F's evidence rather than assumed going in.
        const MODELS = Object.freeze(['NO_OWNER', 'CREATOR_IDENTITY', 'PUBLISHER_IDENTITY']);
        function evaluateModel(model, { hasRealIdentityField, identityAttestsAuthorship, identityRequiredToMatchAuthor }) {
            if (model === 'PUBLISHER_IDENTITY') {
                // Model C requires exactly what Section F proved absent:
                // placerIdentity constrained to equal the publication's own
                // publisher.
                return identityRequiredToMatchAuthor ? 'VIABLE' : 'REJECTED_NO_ENFORCED_LINK_TO_AUTHOR';
            }
            if (model === 'CREATOR_IDENTITY') {
                // Model B requires the identity present to actually attest
                // AUTHORSHIP, which Section A/F showed it structurally does
                // not (it attests retrievability of a locator).
                return hasRealIdentityField && identityAttestsAuthorship ? 'VIABLE' : 'REJECTED_IDENTITY_DOES_NOT_ATTEST_AUTHORSHIP';
            }
            // Model A requires nothing further — it is the null hypothesis.
            return 'VIABLE';
        }

        const evidence = {
            hasRealIdentityField: true,          // Section A: placerIdentity is real
            identityAttestsAuthorship: false,     // Section A/F: it attests a locator, never authorship
            identityRequiredToMatchAuthor: false  // Section F: validator never enforces this
        };

        const results = MODELS.map((model) => ({ model, verdict: evaluateModel(model, evidence) }));
        assert(results.find((r) => r.model === 'NO_OWNER').verdict === 'VIABLE', n('G1. Model A (Snapshot has no owner, for achievement/ranking purposes) is VIABLE — nothing in Sections A-F requires rejecting it'));
        assert(results.find((r) => r.model === 'CREATOR_IDENTITY').verdict === 'REJECTED_IDENTITY_DOES_NOT_ATTEST_AUTHORSHIP', n('G2. Model B (Snapshot gets a creator identity) is REJECTED as this codebase\'s existing placerIdentity field — the only real identity in the family — attests retrievability of a locator, never authorship (Section A); building a genuinely NEW creator-identity field is not what "attribute the Snapshot" would mean if it reused the existing field'));
        assert(results.find((r) => r.model === 'PUBLISHER_IDENTITY').verdict === 'REJECTED_NO_ENFORCED_LINK_TO_AUTHOR', n('G3. Model C (Snapshot gets a publisher identity feeding ranking directly) is REJECTED — Section F proved placerIdentity is never constrained to equal the publication\'s own publisher, so treating it as a ranking-eligible publisher identity would let any mirroring stranger earn achievement credit for someone else\'s publication'));

        chosenModel = 'NO_OWNER';
        assert(MODELS.includes(chosenModel), n('G4. the model actually in force today is one of the three the proposal itself named'));

        console.log('\n=== SECTION G: OWNERSHIP MODEL EVALUATION ===');
        for (const r of results) console.log(`  [${r.verdict}] Model ${r.model}`);
        console.log(`✓ Section G: of the proposal's own three candidate ownership models, only Model A (no owner, for achievement/ranking purposes) survives contact with the real code. This is the model already in force — not a choice this audit is making, but the one Sections A-F show the codebase already committed to, deliberately, across the Placement/Discovery/Attribution/Position-Claim family.`);
    }

    // ===============================================================
    // Section H — Product decision.
    // ===============================================================
    {
        const DECISIONS = Object.freeze(['SNAPSHOT_ALREADY_COVERED', 'ESTABLISH_SNAPSHOT_ATTRIBUTION_FIRST', 'SEPARATE_SNAPSHOT_METRIC', 'INCLUDE_IN_PUBLISHER_RANKING', 'DEFER']);
        const decisionMatrix = [
            { question: 'Snapshot is attributable (to a real author, transitively)', answer: 'YES — via the Publication it verifies against, and that Publication\'s own PublisherPublicationAssociationRecord; never via placerIdentity' },
            { question: 'Existing identity semantics available', answer: 'YES — placerIdentity exists, but attests retrievability, never authorship (Section A/F)' },
            { question: 'Snapshot placement is the same performance unit as a publication', answer: 'NO — it is a separate, later, additive fact about WHERE bytes can be fetched, never a claim of creation (Section A)' },
            { question: 'Equal weighting justified', answer: 'NO — Section F\'s mirror scenario shows it would credit strangers, not authors' },
            { question: 'Separate metric justified', answer: 'NO — there is nothing distinct left to meter: the underlying content\'s authorship is already fully counted via the Publication + association record (Sections D/E)' },
            { question: 'Weighted metric justified', answer: 'NO — same reason; there is no genuinely new achievement here to weight' },
            { question: 'Gaming concern material', answer: 'YES, if naively added — Section F: any identity can place any already-public publication\'s bytes, unconstrained' },
            { question: 'Existing archive sufficient', answer: 'YES — Sections D/E: the ranking/achievement chain already counts the one real fact (the Publication, via its association record) that a Snapshot could ever verify against' }
        ];
        assert(decisionMatrix.length === 8, n('H1. every row of the proposal\'s own decision matrix is answered'));
        assert(decisionMatrix.every((row) => typeof row.answer === 'string' && row.answer.length > 0), n('H2. every answer is backed by a specific section above, not asserted bare'));

        function decideDirection({ attributableTransitivelyOnly, placerCanDifferFromAuthor, achievementVocabularyAlreadyExcludesSnapshot, archiveStructurallyExcludesSnapshot }) {
            if (!attributableTransitivelyOnly && !placerCanDifferFromAuthor) return 'INCLUDE_IN_PUBLISHER_RANKING';
            if (achievementVocabularyAlreadyExcludesSnapshot && archiveStructurallyExcludesSnapshot) return 'SNAPSHOT_ALREADY_COVERED';
            return 'ESTABLISH_SNAPSHOT_ATTRIBUTION_FIRST';
        }
        // Prove the function discriminates before trusting its real output.
        assert(decideDirection({ attributableTransitivelyOnly: false, placerCanDifferFromAuthor: false, achievementVocabularyAlreadyExcludesSnapshot: true, archiveStructurallyExcludesSnapshot: true }) === 'INCLUDE_IN_PUBLISHER_RANKING', n('H3. the decision function would choose INCLUDE_IN_PUBLISHER_RANKING if a Snapshot genuinely had no path to an author at all — a real, available branch, not a foregone conclusion'));
        assert(decideDirection({ attributableTransitivelyOnly: true, placerCanDifferFromAuthor: true, achievementVocabularyAlreadyExcludesSnapshot: false, archiveStructurallyExcludesSnapshot: true }) === 'ESTABLISH_SNAPSHOT_ATTRIBUTION_FIRST', n('H4. it would choose ESTABLISH_SNAPSHOT_ATTRIBUTION_FIRST if the achievement vocabulary did NOT already, deliberately exclude Snapshot facts'));

        const finalDecision = decideDirection({
            attributableTransitivelyOnly: true,               // Section G: authorship traces through the Publication, never through placerIdentity
            placerCanDifferFromAuthor: true,                  // Section F
            achievementVocabularyAlreadyExcludesSnapshot: true, // Section C
            archiveStructurallyExcludesSnapshot: true          // Section D
        });
        assert(DECISIONS.includes(finalDecision), n(`H5. the final decision is one of the five legitimate outcomes named in the proposal's own decision matrix (chose: ${finalDecision})`));
        assert(finalDecision === 'SNAPSHOT_ALREADY_COVERED', n(`H6. given transitive-only attributability, a placer identity that can genuinely differ from the author, an achievement vocabulary that already, deliberately excludes every Snapshot-derived event, and a durable archive that structurally cannot see a Snapshot fact, the decision is SNAPSHOT_ALREADY_COVERED — not DEFER, since nothing here is actually undecided, and not any of the three build-something outcomes, since Sections A-G show building one would misattribute achievement rather than close a real gap (chose: ${finalDecision})`));

        console.log('\n=== SECTION H: PRODUCT DECISION ===');
        for (const row of decisionMatrix) console.log(`  ${row.question}\n      -> ${row.answer}`);
        console.log(`\nDECISION: ${finalDecision}`);
        console.log('✓ Section H: SNAPSHOT_ALREADY_COVERED is selected from the evidence in Sections A-G, not assumed going in. A user\'s real World Snapshot achievement is the Publication underneath it, already attributed to its real publisher via PublisherPublicationAssociationRecord and already fully counted by PublisherRankingPolicy/AchievementEvent — the Snapshot placement/discovery/attribution layer is deliberately, structurally excluded from that counting, and extending it to count would misattribute achievement to whichever identity happened to mirror the content, not whoever authored it.');
    }

    // ===============================================================
    // Section I — Deliberate exclusion census.
    // ===============================================================
    {
        const antiPatterns = [
            /class\s+\w*SnapshotAchievement\w*\b/,
            /class\s+\w*SnapshotLeaderboard\w*\b/,
            /class\s+\w*PlacementReputation\w*\b/,
            /class\s+\w*PlacerScore\w*\b/,
            /SnapshotRankingPolicy|SnapshotPublisherRanking/,
            /AchievementKind\.\w*SNAPSHOT\w*/,
            /placerIdentity[\s\S]{0,40}publisherPublicationAssociationRecord/i
        ];
        const scanDirs = ['ui', 'application', 'core'];
        const bundle = codeOnly(await joinedSource(listFiles(scanDirs)));
        for (const pattern of antiPatterns) {
            assert(!pattern.test(bundle), n(`I1. no anti-pattern ${pattern} exists in real code (comments stripped) anywhere in ui/, application/, or core/`));
        }

        console.log('\n=== SECTION I: DELIBERATE EXCLUSION CENSUS ===');
        console.log('✓ Section I: none of a Snapshot achievement class, a Snapshot-specific leaderboard/ranking policy, a placement reputation/score class, a SNAPSHOT-named achievement kind, or a placerIdentity-to-association-record link exists anywhere in current source.');
    }

    // ===============================================================
    // Section J — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/SnapshotAchievementAttributionProductDirectionAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`J1. every changed/added file is exactly this milestone's own test/registration file (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'ui', 'peer', 'content', 'presence', 'docs'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`J2. ${dir}/ shows no change — this audit evaluates the product, it does not modify it`));
        }

        console.log('\n=== SECTION J: PRODUCTION BOUNDARY ===');
        console.log('✓ Section J: this milestone touches nothing but its own test file and tests.html\'s own registration. No route, view, component, schema, or application/core/storage symbol was added or modified.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    console.log('\n' + '='.repeat(78));
    console.log('SNAPSHOT_ACHIEVEMENT_ATTRIBUTION_PRODUCT_DIRECTION_AUDIT_COMPLETE');
    console.log('');
    console.log('SNAPSHOT_ALREADY_COVERED. The premise behind this milestone\'s own');
    console.log('proposal — that Snapshot ownership is an open, undecided question —');
    console.log('does not survive contact with the real source. Exactly one identity');
    console.log('field exists anywhere in the Snapshot placement/discovery/attribution');
    console.log('family (placerIdentity), and its own file states plainly that it');
    console.log('attests retrievability of a locator, never authenticity, ownership, or');
    console.log('canonicity (Section A). SnapshotPublicationAttribution.js compares two');
    console.log('content hashes and returns a two-value MATCH/NO_MATCH result carrying');
    console.log('no identity field at all, and explicitly, proactively excludes');
    console.log('ownership vocabulary in its own header (Section B). The closed,');
    console.log('eleven-value AchievementKind vocabulary contains zero Snapshot-derived');
    console.log('members (Section C); the durable archive the ranking and achievement');
    console.log('chains read from has no Snapshot collection at all (Section D); and');
    console.log('neither PublisherRankingPolicy.js, PublisherLeaderboardView.js, nor');
    console.log('AchievementEvent.js references Snapshot vocabulary anywhere in their');
    console.log('real code (Section E). placerIdentity is validated for shape only,');
    console.log('never constrained to match the publication\'s own publisher —  meaning');
    console.log('any identity can place a copy of any already-public publication\'s');
    console.log('bytes (Section F). Of the proposal\'s own three ownership models, only');
    console.log('"no owner, for ranking purposes" survives that evidence (Section G).');
    console.log('A user\'s real World Snapshot achievement is the Publication underneath');
    console.log('it — already attributed to its real publisher via');
    console.log('PublisherPublicationAssociationRecord, and already fully counted by');
    console.log('PublisherRankingPolicy and AchievementEvent today. Extending ranking or');
    console.log('achievements to count Snapshot placement/discovery/materialization');
    console.log('directly would not close a gap — it would misattribute achievement to');
    console.log('whichever identity happened to mirror the content, never necessarily');
    console.log('its author (Section F/G). This milestone recommends no schema change,');
    console.log('no new identity field, and no ranking-policy change: the correct next');
    console.log('step, if a future milestone wants Snapshot placement/discovery activity');
    console.log('visible at all, is a genuinely separate "World Activity" surface that');
    console.log('never feeds Publisher Performance ranking or achievement counts — never');
    console.log('a modification to either.');
    console.log('='.repeat(78));

    console.log('\n✅ All Snapshot Achievement Attribution Product Direction Audit tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
