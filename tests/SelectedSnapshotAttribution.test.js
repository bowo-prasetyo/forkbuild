import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { resolveSnapshotPublicationAttribution } from '../application/SnapshotPublicationAttribution.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.154 — Selected Snapshot Attribution.
//
// 0.9.152 gave World View `resolveCandidate()` over an explicitly SELECTED
// candidate; 0.9.153's own end-to-end audit proved (Section E) that
// resolution alone never attributes. This milestone fills exactly that
// named gap: connecting `selectedSnapshotResolutionResult` — the
// RESOLVER's own already-verified bytes, never the candidate's own
// self-declared metadata — to the existing, unmodified
// `resolveSnapshotPublicationAttribution()` (0.9.143), through a new,
// explicit `attributeSelectedSnapshot()` UI action.
//
// NO NEW ATTRIBUTION IMPLEMENTATION, NO NEW APPLICATION COMMAND. This
// milestone adds no `application/ResolveSelectedSnapshotAttributionCommand.js`
// — `resolveSnapshotPublicationAttribution()` is pure and needs no
// collaborator to inject, so `OwnPublicationPanel.js` calls it directly,
// the identical restraint `discoverOwnSnapshot()`'s own 0.9.144 addition
// already holds for the OTHER (already-known-contentHash) attribution
// path.
//
// Section A: FLAGSHIP — select -> resolve -> attribute reports MATCH for a
//            genuinely matching Snapshot.
// Section B: the identical chain reports NO_MATCH for a genuinely
//            different, but successfully verified, Snapshot.
// Section C: THE CRITICAL INVARIANT — a candidate whose declared
//            contentHash equals the Publication's own hash, but whose real
//            locator serves DIFFERENT bytes, fails resolution
//            (CONTENT_HASH_MISMATCH) before attribution is ever reached;
//            attribution passes that failure through unchanged — never
//            fabricating MATCH from `candidate.contentHash ===
//            publication.contentReference.hash` alone.
// Section D: attribution reads the RESOLVER's verified result, never the
//            candidate's own declared contentHash — proven by a resolved
//            result whose `candidates[0].contentHash` differs from its own
//            (independently recomputed) verified bytes.
// Section E: selecting a different candidate clears any prior
//            selected-attribution result; the candidate list itself is
//            untouched.
// Section F: re-resolving the CURRENT selection clears a prior attribution
//            result computed from the earlier resolution.
// Section G: a Publication change resets candidate selection, resolution,
//            AND attribution together.
// Section H: guard clauses — no publication, no contentReference, or no
//            resolution result yet all make attributeSelectedSnapshot() a
//            no-op.
// Section I: RESOLUTION and ATTRIBUTION stay two explicit, separate
//            actions — resolveSelectedSnapshot() never itself computes
//            attribution.
// Section J: structural sweep — exactly one call site in
//            attributeSelectedSnapshot(), the pure function is imported
//            (never reimplemented), and no new outcome vocabulary exists.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    const withoutHtmlComments = text.replace(/<!--[\s\S]*?-->/g, '');
    return withoutHtmlComments.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        selectedSnapshotCandidate: null,
        selectedSnapshotResolutionExecuting: false,
        selectedSnapshotResolutionError: null,
        selectedSnapshotResolutionResult: null,
        selectedSnapshotResolutionRequestId: 0,
        selectedSnapshotAttributionResult: null,
        resolveSelectedSnapshotCommand: null,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        attributeSelectedSnapshot: OwnPublicationPanel.methods.attributeSelectedSnapshot,
        ...overrides
    };
}

function resolvedResult(overrides = {}) {
    return {
        outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED,
        bytes: 'default-bytes',
        candidates: [],
        locator: 'ar://default',
        storage: 'ar',
        reason: null,
        ...overrides
    };
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

function run() {
    // ===============================================================
    // Section A — FLAGSHIP: select -> resolve -> attribute -> MATCH.
    // ===============================================================
    {
        const bytes = 'Section A: the Publication\'s own real content';
        const hash = computeContentHash(bytes);
        const publication = new Publication({ id: 'pub-154-a', documentId: 'doc-154-a', contentReference: new ContentReference({ hash }) });
        const candidate = { contentHash: hash, locator: 'ar://section-a-locator', storage: 'ar' };

        const ctx = panelCtx({
            publication,
            selectedSnapshotCandidate: candidate,
            selectedSnapshotResolutionResult: resolvedResult({ bytes, candidates: [candidate], locator: candidate.locator })
        });

        ctx.attributeSelectedSnapshot();

        assert(ctx.selectedSnapshotAttributionResult !== null, 'A1. attributeSelectedSnapshot() populates a result');
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'A2. FLAGSHIP — a genuinely matching, verified Snapshot reports MATCH');
        assert(ctx.selectedSnapshotAttributionResult.publicationHash === hash, 'A3. publicationHash is the Publication\'s own hash');
        assert(ctx.selectedSnapshotAttributionResult.snapshotHash === hash, 'A4. snapshotHash is the recomputed verified hash');

        console.log('✓ Section A: select -> resolve -> attribute reports MATCH for a genuinely matching, independently verified Snapshot');
    }

    // ===============================================================
    // Section B — the identical chain reports NO_MATCH for a genuinely
    // different, but successfully verified, Snapshot.
    // ===============================================================
    {
        const publicationBytes = 'Section B: the Publication\'s own real content';
        const publicationHash = computeContentHash(publicationBytes);
        const publication = new Publication({ id: 'pub-154-b', documentId: 'doc-154-b', contentReference: new ContentReference({ hash: publicationHash }) });

        const otherBytes = 'Section B: a different, but genuinely verified, Snapshot';
        const otherHash = computeContentHash(otherBytes);
        const candidate = { contentHash: otherHash, locator: 'ar://section-b-locator', storage: 'ar' };

        const ctx = panelCtx({
            publication,
            selectedSnapshotCandidate: candidate,
            selectedSnapshotResolutionResult: resolvedResult({ bytes: otherBytes, candidates: [candidate], locator: candidate.locator })
        });

        ctx.attributeSelectedSnapshot();

        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
            'B1. a successfully verified but genuinely different Snapshot reports NO_MATCH, never MATCH');

        console.log('✓ Section B: a genuinely different, but successfully verified, Snapshot reports NO_MATCH');
    }

    // ===============================================================
    // Section C — THE CRITICAL INVARIANT: a candidate whose DECLARED
    // contentHash equals the Publication's own hash, but whose real
    // locator serves different bytes, fails resolution before
    // attribution is ever reached — never fabricating MATCH from
    // candidate.contentHash === publication.contentReference.hash alone.
    // ===============================================================
    {
        const publicationBytes = 'Section C: the real Publication content';
        const publicationHash = computeContentHash(publicationBytes);
        const publication = new Publication({ id: 'pub-154-c', documentId: 'doc-154-c', contentReference: new ContentReference({ hash: publicationHash }) });

        // A LYING candidate: it CLAIMS the Publication's own hash, but its
        // real locator (simulated here by the resolver's own reported
        // outcome) actually served different bytes, so resolution itself
        // already refused it with CONTENT_HASH_MISMATCH — exactly what
        // application/DecentralizedSnapshotResolver.js#resolveCandidate()
        // would report for a locator whose real bytes disagree with the
        // candidate's own declared contentHash.
        const lyingCandidate = { contentHash: publicationHash, locator: 'ar://section-c-lying-locator', storage: 'ar' };
        const failedResolution = {
            outcome: DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            bytes: null,
            candidates: [lyingCandidate],
            locator: null,
            storage: null,
            reason: 'declared contentHash does not match retrieved bytes'
        };

        const ctx = panelCtx({
            publication,
            selectedSnapshotCandidate: lyingCandidate,
            selectedSnapshotResolutionResult: failedResolution
        });

        ctx.attributeSelectedSnapshot();

        assert(ctx.selectedSnapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'C1. FLAGSHIP — the resolution failure is passed through unchanged, never spelled NO_MATCH');
        assert(ctx.selectedSnapshotAttributionResult.outcome !== SnapshotPublicationAttributionOutcome.MATCH,
            'C2. attribution NEVER reports MATCH merely because candidate.contentHash === publication.contentReference.hash — resolution must succeed first');
        assert(ctx.selectedSnapshotAttributionResult.snapshotHash === null,
            'C3. no snapshotHash is ever computed for a resolution that never reached RESOLVED');

        console.log('✓ Section C: a candidate whose declared contentHash equals the Publication\'s own, but whose real bytes do not, is refused at resolution and never fabricates MATCH at attribution');
    }

    // ===============================================================
    // Section D — attribution reads the RESOLVER'S verified result, never
    // the candidate's own declared contentHash: a resolved result whose
    // candidates[0].contentHash differs from its own independently
    // recomputed, verified bytes still attributes correctly off the bytes.
    // ===============================================================
    {
        const realBytes = 'Section D: the actually retrieved and verified bytes';
        const realHash = computeContentHash(realBytes);
        const publication = new Publication({ id: 'pub-154-d', documentId: 'doc-154-d', contentReference: new ContentReference({ hash: realHash }) });

        // The candidate's own self-declared contentHash field is
        // deliberately something else here — attribution must never read
        // it; only resolvedSnapshot.bytes (recomputed) matters.
        const candidateWithStaleDeclaredHash = { contentHash: 'not-the-real-hash', locator: 'ar://section-d-locator', storage: 'ar' };
        const resolution = resolvedResult({ bytes: realBytes, candidates: [candidateWithStaleDeclaredHash], locator: candidateWithStaleDeclaredHash.locator });

        const ctx = panelCtx({ publication, selectedSnapshotCandidate: candidateWithStaleDeclaredHash, selectedSnapshotResolutionResult: resolution });
        ctx.attributeSelectedSnapshot();

        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'D1. attribution recomputes the hash from resolvedSnapshot.bytes, ignoring the candidate\'s own (here deliberately wrong) declared contentHash field');
        assert(ctx.selectedSnapshotAttributionResult.snapshotHash === realHash, 'D2. the reported snapshotHash is the recomputed one, never the candidate\'s own declared field');

        console.log('✓ Section D: attribution is computed from the resolver\'s own recomputed, verified bytes — never from a candidate\'s own self-declared contentHash field');
    }

    // ===============================================================
    // Section E — selecting a DIFFERENT candidate clears any prior
    // selected-attribution result; the candidate list is untouched (not
    // exercised here — see SelectedSnapshotResolutionEndToEndAudit.test.js
    // Section H for that existing coverage; this section is scoped to the
    // NEW attribution field).
    // ===============================================================
    {
        const candidateOne = { contentHash: 'hash-one', locator: 'ar://one', storage: 'ar' };
        const candidateTwo = { contentHash: 'hash-two', locator: 'ar://two', storage: 'ar' };

        const ctx = panelCtx({
            selectedSnapshotCandidate: candidateOne,
            selectedSnapshotResolutionResult: resolvedResult({ locator: candidateOne.locator }),
            selectedSnapshotAttributionResult: { outcome: SnapshotPublicationAttributionOutcome.MATCH, publicationHash: 'h', snapshotHash: 'h', reason: null }
        });

        ctx.selectSnapshotCandidate(candidateTwo);

        assert(ctx.selectedSnapshotAttributionResult === null, 'E1. selecting a different candidate clears the prior selected-attribution result');
        assert(ctx.selectedSnapshotResolutionResult === null, 'E2. sanity: the prior resolution result is cleared too (0.9.152, unchanged)');
        assert(ctx.selectedSnapshotCandidate === candidateTwo, 'E3. the new selection itself is recorded');

        // Re-selecting the SAME candidate is a no-op, exactly like 0.9.152's
        // own existing behavior — no state is touched.
        const ctx2 = panelCtx({
            selectedSnapshotCandidate: candidateOne,
            selectedSnapshotAttributionResult: { outcome: SnapshotPublicationAttributionOutcome.MATCH, publicationHash: 'h', snapshotHash: 'h', reason: null }
        });
        ctx2.selectSnapshotCandidate(candidateOne);
        assert(ctx2.selectedSnapshotAttributionResult !== null, 'E4. re-selecting the SAME candidate never clears an existing attribution result');

        console.log('✓ Section E: selecting a different candidate clears a stale selected-attribution result; re-selecting the same candidate leaves it untouched');
    }

    // ===============================================================
    // Section F — re-resolving the CURRENT selection clears a prior
    // attribution result computed from the earlier resolution.
    // ===============================================================
    {
        const candidate = { contentHash: 'hash-f', locator: 'ar://f', storage: 'ar' };
        // The command never actually needs to settle — this section only
        // asserts what happens SYNCHRONOUSLY the instant a fresh resolution
        // attempt begins, before the microtask that invokes this command
        // even runs.
        const resolveSelectedSnapshotCommand = () => new Promise(() => {});

        const ctx = panelCtx({
            selectedSnapshotCandidate: candidate,
            selectedSnapshotResolutionResult: resolvedResult({ locator: candidate.locator }),
            selectedSnapshotAttributionResult: { outcome: SnapshotPublicationAttributionOutcome.MATCH, publicationHash: 'h', snapshotHash: 'h', reason: null },
            resolveSelectedSnapshotCommand
        });

        ctx.resolveSelectedSnapshot();

        assert(ctx.selectedSnapshotAttributionResult === null, 'F1. starting a fresh resolution of the CURRENT selection immediately clears the prior attribution result, before the new resolution even settles');

        console.log('✓ Section F: re-resolving the current selection clears a stale attribution result computed from the earlier resolution');
    }

    // ===============================================================
    // Section G — a Publication change resets candidate selection,
    // resolution, AND attribution together.
    // ===============================================================
    {
        const candidate = { contentHash: 'hash-g', locator: 'ar://g', storage: 'ar' };
        const ctx = panelCtx({
            publication: new Publication({ id: 'pub-154-g-old', documentId: 'doc-154-g-old' }),
            selectedSnapshotCandidate: candidate,
            selectedSnapshotResolutionResult: resolvedResult({ locator: candidate.locator }),
            selectedSnapshotAttributionResult: { outcome: SnapshotPublicationAttributionOutcome.MATCH, publicationHash: 'h', snapshotHash: 'h', reason: null }
        });

        const newPublication = new Publication({ id: 'pub-154-g-new', documentId: 'doc-154-g-new' });
        OwnPublicationPanel.watch.publication.call(ctx, newPublication, ctx.publication);
        ctx.publication = newPublication;

        assert(ctx.selectedSnapshotCandidate === null, 'G1. a Publication change clears the selected candidate');
        assert(ctx.selectedSnapshotResolutionResult === null, 'G2. ...and the resolution result');
        assert(ctx.selectedSnapshotAttributionResult === null, 'G3. ...and the attribution result, all together');

        console.log('✓ Section G: a Publication change resets candidate selection, resolution, and attribution together');
    }

    // ===============================================================
    // Section H — guard clauses: attributeSelectedSnapshot() is a no-op
    // without a publication, without a contentReference, or without a
    // resolution result yet.
    // ===============================================================
    {
        const candidate = { contentHash: 'hash-h', locator: 'ar://h', storage: 'ar' };
        const resolution = resolvedResult({ locator: candidate.locator });

        const ctxNoPublication = panelCtx({ publication: null, selectedSnapshotCandidate: candidate, selectedSnapshotResolutionResult: resolution });
        ctxNoPublication.attributeSelectedSnapshot();
        assert(ctxNoPublication.selectedSnapshotAttributionResult === null, 'H1. no publication -> no-op');

        const ctxNoContentReference = panelCtx({
            publication: new Publication({ id: 'pub-154-h', documentId: 'doc-154-h' }),
            selectedSnapshotCandidate: candidate,
            selectedSnapshotResolutionResult: resolution
        });
        ctxNoContentReference.attributeSelectedSnapshot();
        assert(ctxNoContentReference.selectedSnapshotAttributionResult === null, 'H2. a publication with no contentReference yet -> no-op (the pure function itself would throw)');

        const publication = new Publication({ id: 'pub-154-h2', documentId: 'doc-154-h2', contentReference: new ContentReference({ hash: 'h' }) });
        const ctxNoResolution = panelCtx({ publication, selectedSnapshotCandidate: candidate, selectedSnapshotResolutionResult: null });
        ctxNoResolution.attributeSelectedSnapshot();
        assert(ctxNoResolution.selectedSnapshotAttributionResult === null, 'H3. no resolution result yet -> no-op');

        console.log('✓ Section H: attributeSelectedSnapshot() is a safe no-op without a publication, a contentReference, or a resolution result');
    }

    // ===============================================================
    // Section I — RESOLUTION and ATTRIBUTION stay two explicit, separate
    // actions: resolveSelectedSnapshot() never itself computes attribution.
    // ===============================================================
    {
        const candidate = { contentHash: 'hash-i', locator: 'ar://i', storage: 'ar' };
        const publication = new Publication({ id: 'pub-154-i', documentId: 'doc-154-i', contentReference: new ContentReference({ hash: candidate.contentHash }) });
        const resolveSelectedSnapshotCommand = () => Promise.resolve(resolvedResult({ bytes: candidate.contentHash, locator: candidate.locator, candidates: [candidate] }));

        const ctx = panelCtx({ publication, selectedSnapshotCandidate: candidate, resolveSelectedSnapshotCommand });
        ctx.resolveSelectedSnapshot();

        return flushMicrotasks().then(() => {
            assert(ctx.selectedSnapshotResolutionResult !== null, 'I1. sanity: resolution completed');
            assert(ctx.selectedSnapshotAttributionResult === null,
                'I2. FLAGSHIP — resolveSelectedSnapshot() never itself populates selectedSnapshotAttributionResult; only an explicit attributeSelectedSnapshot() call does');

            console.log('✓ Section I: resolution and attribution remain two explicit, separate actions — a successful resolution never automatically attributes');

            return runSectionJ();
        });
    }

    function runSectionJ() {
        // ===============================================================
        // Section J — structural sweep.
        // ===============================================================
        return (async () => {
            const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');

            assert(panelCode.includes("from '../../application/SnapshotPublicationAttribution.js'"),
                'J1. OwnPublicationPanel.js imports the existing pure function — never reimplements it');

            const attributeBody = (panelCode.match(/attributeSelectedSnapshot\(\)\s*\{[\s\S]*?\n\s{8}\}/) || [''])[0];
            assert(attributeBody.length > 0, 'J2. sanity: attributeSelectedSnapshot() method body was found');
            const callSites = attributeBody.match(/resolveSnapshotPublicationAttribution\(/g) || [];
            assert(callSites.length === 1, 'J3. attributeSelectedSnapshot() calls resolveSnapshotPublicationAttribution() exactly once');
            assert(attributeBody.includes('this.selectedSnapshotResolutionResult') && !attributeBody.includes('this.selectedSnapshotCandidate.contentHash'),
                'J4. FLAGSHIP — attributeSelectedSnapshot() reads the RESOLVER\'s own verified result, never selectedSnapshotCandidate.contentHash directly');

            // No new application command file introduced for this seam.
            const forbiddenModules = [
                "from '../../application/ResolveSelectedSnapshotAttributionCommand.js'"
            ];
            for (const term of forbiddenModules) {
                assert(!panelCode.includes(term), `J5. OwnPublicationPanel.js never imports a new, second attribution command file ('${term}')`);
            }

            // No new outcome vocabulary was introduced by this milestone.
            const outcomeKeys = Object.keys(SnapshotPublicationAttributionOutcome);
            assert(outcomeKeys.length === 2 && outcomeKeys.includes('MATCH') && outcomeKeys.includes('NO_MATCH'),
                'J6. SnapshotPublicationAttributionOutcome still carries exactly its two pre-existing values');
            const resolutionKeys = Object.keys(DecentralizedSnapshotResolutionOutcome);
            assert(resolutionKeys.length === 5, 'J7. DecentralizedSnapshotResolutionOutcome still carries exactly its five pre-existing values');

            // resolveSelectedSnapshot()'s own body never calls the
            // attribution function — mirrors 0.9.153's own Section E5,
            // confirmed here as part of this milestone's own sweep.
            const resolveSelectedSnapshotBody = (panelCode.match(/resolveSelectedSnapshot\(\)\s*\{[\s\S]*?\n\s{8}\},/) || [''])[0];
            assert(!resolveSelectedSnapshotBody.includes('resolveSnapshotPublicationAttribution'),
                'J8. resolveSelectedSnapshot() itself never calls resolveSnapshotPublicationAttribution()');

            // selectSnapshotCandidate()'s own body never calls it either —
            // selection alone must never attribute.
            const selectSnapshotCandidateBody = (panelCode.match(/selectSnapshotCandidate\(candidate\)\s*\{[\s\S]*?\n\s{8}\},/) || [''])[0];
            assert(!selectSnapshotCandidateBody.includes('resolveSnapshotPublicationAttribution'),
                'J9. selectSnapshotCandidate() never calls resolveSnapshotPublicationAttribution()');

            console.log('✓ Section J: structural sweep — exactly one call site inside attributeSelectedSnapshot(), reading the resolver\'s own verified result; no new command file and no new outcome vocabulary were introduced');

            console.log('\n✅ All Selected Snapshot Attribution tests passed.');
        })();
    }
}

Promise.resolve()
    .then(() => run())
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
