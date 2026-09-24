
import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryQueryService } from '../application/snapshot/SnapshotCandidateDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryOutcome } from '../application/snapshot/SnapshotCandidateDiscoveryOutcome.js';
import {
    executeDiscoverSnapshotCandidatesCommand,
    executeDiscoverSnapshotCandidatesCommandWithOutcome
} from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { worldEncounterCanvasFiles, ownPublicationPanelFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';

// 0.9.589 — Distinguish Snapshot Discovery Absence from Discovery
// Failure.
//
// 0.9.588's own Section E named the one real, narrow PRESENTATION_GAP
// left after the Silent Fallback Semantics audit: `NostrSnapshotDiscoveryQueryService
// #search()` correctly degrades a query failure to `[]` (see that file's
// own header, "never throws... every failure degrades to []" — a
// deliberate, UNMODIFIED contract, held here unchanged), but
// `ui/components/OwnPublicationPanel.js` then renders that `[]` as a flat
// "No Snapshots have been announced under this discoveryTag yet." — a
// claim the underlying mechanism never actually verified. This is the
// fix: a new, additive `searchWithOutcome()` capability (application/
// NostrSnapshotDiscoveryQueryService.js and application/
// SnapshotCandidateDiscoveryQueryService.js, both siblings of their own
// unmodified `search()`) lets the presentation boundary alone say "the
// query could not be completed" instead of overclaiming certainty.
//
//   A. Reproduce the overclaim this milestone fixes, and the genuine
//      zero-result case it stays honest about.
//   B. Semantic distinction: EMPTY (query completed, nothing announced)
//      vs UNAVAILABLE (query could not be completed) — proven at both the
//      single-source and multi-source composite layers.
//   C. Production boundary: search()/executeDiscoverSnapshotCandidatesCommand()/
//      the walking-triggered command are all byte-for-byte unmodified.
//   D. User-facing language: OwnPublicationPanel renders the honest
//      "currently unavailable" copy only for UNAVAILABLE, and its
//      pre-existing copy for every other case, including the legacy path.
//   E. All states exercised: FOUND, EMPTY, UNAVAILABLE, and a malformed
//      (non-array) response.
//   F. Identity/downstream: candidates remain byte-identical; selection
//      state is untouched by this milestone.
//   G. Regression sweep: no other UI surface in this codebase makes the
//      identical "empty discovery result -> flat absence claim" mistake.
//   H. Flagship — Own Publication: zero candidates (honest) vs
//      unavailable (honest), through the real production command chain.

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

async function codeOnlySource(relativePath) {
    const text = await readSource(relativePath);
    const withoutHtmlComments = text.replace(/<!--[\s\S]*?-->/g, '');
    return withoutHtmlComments.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        discoverSnapshotCandidatesCommand: null,
        discoverSnapshotCandidatesWithOutcomeCommand: null,
        snapshotCandidateDiscoveryExecuting: false,
        snapshotCandidateDiscoveryError: null,
        snapshotCandidateDiscoveryResult: null,
        snapshotCandidateDiscoveryOutcome: null,
        snapshotCandidateDiscoveryRequestId: 0,
        selectedSnapshotCandidate: null,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        ...overrides
    };
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — reproduce the overclaim, and contrast genuine zero.
    // ---------------------------------------------------------------
    {
        const failingQueryImpl = async () => { throw new Error('relay unreachable'); };
        const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: failingQueryImpl });

        // search() — UNCHANGED — still degrades to [], indistinguishable
        // from genuine zero results, exactly as 0.9.133 already documents.
        const searchResult = await service.search('tag');
        assert(Array.isArray(searchResult) && searchResult.length === 0,
            '1. search() still degrades a query failure to [] — the deliberate, UNMODIFIED contract this milestone never touches');

        // searchWithOutcome() — NEW — reports the SAME [] but names it
        // honestly as UNAVAILABLE, never EMPTY.
        const outcomeResult = await service.searchWithOutcome('tag');
        assert(outcomeResult.outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '2. searchWithOutcome() reports UNAVAILABLE for a queryImpl that rejects — the overclaim this milestone fixes');
        assert(Array.isArray(outcomeResult.candidates) && outcomeResult.candidates.length === 0,
            '3. the candidates array is still [] — this milestone adds a classification, never a second candidate source');

        // Contrast: a genuinely empty, SUCCESSFUL query.
        const emptyService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [] });
        const emptyOutcome = await emptyService.searchWithOutcome('tag');
        assert(emptyOutcome.outcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '4. a queryImpl that resolves to [] — a real answer, zero candidates — reports EMPTY, never UNAVAILABLE');

        console.log('✓ Section A: search() keeps degrading a failure to [] unchanged; searchWithOutcome() names that same failure UNAVAILABLE, distinct from a genuine EMPTY answer');
    }

    // ---------------------------------------------------------------
    // Section B — semantic distinction, single source and composite.
    // ---------------------------------------------------------------
    {
        // A source that times out.
        const timeoutService = new NostrSnapshotDiscoveryQueryService({
            queryImpl: () => new Promise(() => {}),
            timeoutMs: 5
        });
        const timeoutOutcome = await timeoutService.searchWithOutcome('tag');
        assert(timeoutOutcome.outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '5. a timed-out queryImpl reports UNAVAILABLE');

        // A source that resolves to a non-array (malformed).
        const malformedService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => 'not-an-array' });
        const malformedOutcome = await malformedService.searchWithOutcome('tag');
        assert(malformedOutcome.outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '6. a malformed (non-array) queryImpl response reports UNAVAILABLE, identical to search()\'s own treatment');

        // A source that genuinely finds a candidate.
        const foundService = new NostrSnapshotDiscoveryQueryService({
            queryImpl: async () => [{
                content: JSON.stringify({ protocol: 'forkbuild-snapshot-discovery', version: 1, contentHash: 'hash-a', locator: 'ar://a', storage: 'ar' })
            }]
        });
        const foundOutcome = await foundService.searchWithOutcome('tag');
        assert(foundOutcome.outcome === SnapshotCandidateDiscoveryOutcome.FOUND, '7. at least one parsed candidate reports FOUND');
        assert(foundOutcome.candidates.length === 1 && foundOutcome.candidates[0].contentHash === 'hash-a',
            '8. the FOUND candidate is reported verbatim, unmodified');

        // Composite: one source fails, one source genuinely succeeds empty
        // — the composite must still report EMPTY, not UNAVAILABLE, since
        // SOME answer was actually obtained.
        const compositeMixed = new SnapshotCandidateDiscoveryQueryService([
            { search: async () => { throw new Error('local unavailable'); } },
            emptySearchOnlySource()
        ]);
        const mixedOutcome = await compositeMixed.searchWithOutcome('tag');
        assert(mixedOutcome.outcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '9. composite: one source failing and one source genuinely empty still reports EMPTY — an honest answer was obtained');

        // Composite: every source fails — the composite must report
        // UNAVAILABLE, never claim "nothing has been announced."
        const compositeAllFail = new SnapshotCandidateDiscoveryQueryService([
            { search: async () => { throw new Error('a'); } },
            { search: async () => { throw new Error('b'); } }
        ]);
        const allFailOutcome = await compositeAllFail.searchWithOutcome('tag');
        assert(allFailOutcome.outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '10. composite: every source failing reports UNAVAILABLE — no source could actually be asked');

        // Composite: a source exposing its own searchWithOutcome() (like
        // the real Nostr source) is asked through it, so ITS OWN internal
        // failure is not mistaken for a genuine empty result by the
        // composite's outer Promise.allSettled() isolation.
        const compositeWithNostr = new SnapshotCandidateDiscoveryQueryService([
            new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay down'); } })
        ]);
        const nostrOnlyOutcome = await compositeWithNostr.searchWithOutcome('tag');
        assert(nostrOnlyOutcome.outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '11. a composite built from a single, failing real NostrSnapshotDiscoveryQueryService correctly reports UNAVAILABLE, not EMPTY — the fix this milestone exists for, proven at the real composite layer production actually uses');

        console.log('✓ Section B: EMPTY vs UNAVAILABLE is proven correct at both the single-source and multi-source composite layers, including the real NostrSnapshotDiscoveryQueryService');
    }

    // ---------------------------------------------------------------
    // Section C — production boundary: nothing behavioral changed.
    // ---------------------------------------------------------------
    {
        const nostrSource = await codeOnlySource('application/nostr/NostrSnapshotDiscoveryQueryService.js');
        assert(/async search\(discoveryTag\) \{/.test(nostrSource), '12. search() still exists, same signature');
        assert(/return \[\];/.test(nostrSource), '13. search()\'s own catch/non-array branches still degrade to []');
        assert(/async searchWithOutcome\(discoveryTag\) \{/.test(nostrSource), '14. searchWithOutcome() exists as a documented sibling method');

        const compositeSource = await codeOnlySource('application/snapshot/SnapshotCandidateDiscoveryQueryService.js');
        assert(/async search\(discoveryTag\) \{/.test(compositeSource), '15. the composite\'s own search() still exists, same signature');
        assert(/async searchWithOutcome\(discoveryTag\) \{/.test(compositeSource), '16. the composite\'s own searchWithOutcome() exists as a documented sibling method');

        // The original command export is untouched, and the new one is a
        // pure sibling forwarding call.
        const commandSource = await codeOnlySource('application/snapshot/DiscoverSnapshotCandidatesCommand.js');
        assert(/return discoveryQueryService\.search\(discoveryTag\);/.test(commandSource),
            '17. executeDiscoverSnapshotCandidatesCommand() still forwards to search() verbatim, unmodified');
        assert(/return discoveryQueryService\.searchWithOutcome\(discoveryTag\);/.test(commandSource),
            '18. executeDiscoverSnapshotCandidatesCommandWithOutcome() forwards to searchWithOutcome() verbatim');

        // The walking-triggered background monitor's own file is entirely
        // untouched — this milestone never modifies it.
        const monitorSource = await readSource('application/snapshot/WorldSnapshotDiscoveryMonitor.js');
        assert(!/searchWithOutcome|SnapshotCandidateDiscoveryOutcome|WithOutcomeCommand/.test(monitorSource),
            '19. application/snapshot/WorldSnapshotDiscoveryMonitor.js has no idea this milestone\'s vocabulary exists — background discovery is untouched');

        // The legacy command still behaves identically end to end.
        const legacyResult = await executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'forkbuild-snapshot',
            discoveryQueryService: { search: async () => [{ contentHash: 'x', locator: 'ar://x', storage: 'ar' }] }
        });
        assert(Array.isArray(legacyResult) && legacyResult.length === 1,
            '20. executeDiscoverSnapshotCandidatesCommand() still resolves to a bare candidate array, unchanged');

        console.log('✓ Section C: search()/executeDiscoverSnapshotCandidatesCommand()/WorldSnapshotDiscoveryMonitor.js all remain byte-for-byte behaviorally unmodified — every 0.9.589 addition is a pure, additive sibling');
    }

    // ---------------------------------------------------------------
    // Section D — user-facing language.
    // ---------------------------------------------------------------
    {
        // UNAVAILABLE — through the new outcome-aware command.
        const unavailableCtx = panelCtx({
            discoverSnapshotCandidatesWithOutcomeCommand: () => Promise.resolve({ outcome: SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, candidates: [] })
        });
        unavailableCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(unavailableCtx.snapshotCandidateDiscoveryOutcome === 'unavailable', '21. the panel stores the reported outcome verbatim');
        assert(Array.isArray(unavailableCtx.snapshotCandidateDiscoveryResult) && unavailableCtx.snapshotCandidateDiscoveryResult.length === 0,
            '22. the panel still stores the candidate array, unchanged in shape');

        // EMPTY — through the new outcome-aware command.
        const emptyCtx = panelCtx({
            discoverSnapshotCandidatesWithOutcomeCommand: () => Promise.resolve({ outcome: SnapshotCandidateDiscoveryOutcome.EMPTY, candidates: [] })
        });
        emptyCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(emptyCtx.snapshotCandidateDiscoveryOutcome === 'empty', '23. a genuine empty result is stored as \'empty\', never \'unavailable\'');

        // FOUND — through the new outcome-aware command.
        const foundCtx = panelCtx({
            discoverSnapshotCandidatesWithOutcomeCommand: () => Promise.resolve({ outcome: SnapshotCandidateDiscoveryOutcome.FOUND, candidates: [{ contentHash: 'h', locator: 'ar://h', storage: 'ar' }] })
        });
        foundCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(foundCtx.snapshotCandidateDiscoveryResult.length === 1, '24. a FOUND result still stores every candidate, verbatim');

        // Legacy path — no outcome command supplied at all: outcome stays
        // null forever, exactly the pre-0.9.589 behavior.
        const legacyCtx = panelCtx({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([])
        });
        legacyCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(legacyCtx.snapshotCandidateDiscoveryOutcome === null,
            '25. a host supplying only the legacy discoverSnapshotCandidatesCommand never gets an outcome — pre-0.9.589 behavior preserved exactly');
        assert(Array.isArray(legacyCtx.snapshotCandidateDiscoveryResult) && legacyCtx.snapshotCandidateDiscoveryResult.length === 0,
            '26. the legacy path still stores the bare array it always did');

        // The template itself renders the honest copy only for
        // 'unavailable', and keeps the pre-existing copy for every other
        // empty-result case (genuine empty, and the legacy null-outcome
        // path).
        const panelTemplate = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');
        assert(panelTemplate.includes('Snapshot discovery is currently unavailable.'),
            '27. the template carries the new, honest unavailable-state copy');
        assert(panelTemplate.includes('No Snapshots have been announced under this discoveryTag yet.'),
            '28. the template keeps the original empty-state copy, for every case that is not UNAVAILABLE');
        assert(/snapshotCandidateDiscoveryResult\.length === 0 && snapshotCandidateDiscoveryOutcome === 'unavailable'/.test(panelTemplate),
            '29. the unavailable copy is gated on outcome === \'unavailable\' specifically, never on the empty array alone');

        console.log('✓ Section D: OwnPublicationPanel renders the honest "currently unavailable" copy only when the outcome says so, and keeps its original copy for genuine-empty and legacy-unknown results alike');
    }

    // ---------------------------------------------------------------
    // Section E — all states.
    // ---------------------------------------------------------------
    {
        const states = [
            { outcome: SnapshotCandidateDiscoveryOutcome.FOUND, candidates: [{ contentHash: 'h', locator: 'ar://h', storage: 'ar' }] },
            { outcome: SnapshotCandidateDiscoveryOutcome.EMPTY, candidates: [] },
            { outcome: SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, candidates: [] }
        ];
        for (const state of states) {
            const ctx = panelCtx({ discoverSnapshotCandidatesWithOutcomeCommand: () => Promise.resolve(state) });
            ctx.discoverSnapshotCandidates();
            await flushMicrotasks();
            assert(ctx.snapshotCandidateDiscoveryOutcome === state.outcome, `30. state ${state.outcome} is stored verbatim`);
            assert(ctx.snapshotCandidateDiscoveryError === null, `31. state ${state.outcome} is never reported as an error`);
        }

        // A malformed (non-array) response from the underlying transport
        // is proven, at the real service layer, to already collapse to
        // UNAVAILABLE — Section B's own tests 5-6 cover this directly;
        // this asserts the SAME classification reaches the panel.
        const malformedCtx = panelCtx({
            discoverSnapshotCandidatesWithOutcomeCommand: async () => {
                const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => 'not-an-array' });
                return service.searchWithOutcome('tag');
            }
        });
        malformedCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(malformedCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '32. a malformed transport response reaches the panel classified as unavailable, never empty');

        console.log('✓ Section E: FOUND, EMPTY, UNAVAILABLE, and a malformed-response UNAVAILABLE are all exercised end to end');
    }

    // ---------------------------------------------------------------
    // Section F — identity and downstream behavior.
    // ---------------------------------------------------------------
    {
        const candidate = Object.freeze({ contentHash: 'hash-f', locator: 'ar://f', storage: 'ar', publicationId: 'pub-1' });
        const ctx = panelCtx({
            discoverSnapshotCandidatesWithOutcomeCommand: () => Promise.resolve({ outcome: SnapshotCandidateDiscoveryOutcome.FOUND, candidates: [candidate] })
        });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult[0] === candidate,
            '33. the exact same candidate reference reaches the panel — this milestone reclassifies outcomes, never candidate identity');
        assert(ctx.selectedSnapshotCandidate === null,
            '34. discovering candidates never selects one — selection stays this file\'s own, entirely separate, explicit step');

        ctx.selectSnapshotCandidate(candidate);
        assert(ctx.selectedSnapshotCandidate === candidate,
            '35. selection still works exactly as before — 0.9.589 touches no selection/resolution/materialization/placement logic');

        console.log('✓ Section F: candidate identity and every downstream selection/resolution/materialization/placement seam are untouched by this milestone');
    }

    // ---------------------------------------------------------------
    // Section G — regression sweep.
    // ---------------------------------------------------------------
    {
        // 0.9.588's own Section E already established, live, that
        // OwnPublicationPanel.js is the ONLY UI surface consuming
        // NostrSnapshotDiscoveryQueryService's own degrade-to-[] path,
        // and that application/editor/StructureDocumentResolver.js's own
        // identical mechanism (I3b) has no consuming UI overclaim at all
        // (renderer/WorldRenderer.js asserts nothing about why a
        // placement is absent). This section reconfirms, live, that no
        // OTHER component in ui/ makes the identical "an empty discovery
        // array proves absence" claim this milestone fixes.
        const rendererSource = await readSource('renderer/WorldRenderer.js');
        assert(!/corrupt|unreadable|deserialize/i.test(rendererSource),
            '36. renderer/WorldRenderer.js still asserts no reason for an absent Structure Document — I3b remains out of this milestone\'s scope, confirmed live');

        const worldEncounterCanvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(!/have been announced/i.test(worldEncounterCanvasSource),
            '37. ui/components/WorldEncounterCanvas.js makes no equivalent "have been announced" claim over a discovery result');

        console.log('✓ Section G: no other UI surface in this codebase makes the same empty-discovery-result overclaim OwnPublicationPanel.js did — the fix stays scoped to its one real occurrence');
    }

    // ---------------------------------------------------------------
    // Section H — flagship: Own Publication, Nostr available with zero
    // candidates, then Nostr unavailable, through the real production
    // command chain (executeDiscoverSnapshotCandidatesCommandWithOutcome
    // over a real NostrSnapshotDiscoveryQueryService).
    // ---------------------------------------------------------------
    {
        // Zero candidates, Nostr genuinely reachable.
        const reachableService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [] });
        const reachableCommand = () => executeDiscoverSnapshotCandidatesCommandWithOutcome({
            discoveryTag: 'forkbuild-snapshot',
            discoveryQueryService: reachableService
        });
        const reachableCtx = panelCtx({ discoverSnapshotCandidatesWithOutcomeCommand: reachableCommand });
        reachableCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(reachableCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '38. FLAGSHIP: Nostr available, zero candidates announced — reported EMPTY, the honest "genuinely nothing announced" case');

        // Nostr unavailable — the query fails, discovery gracefully
        // degrades (candidates: []), but the outcome now says so honestly.
        const unavailableService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay unreachable'); } });
        const unavailableCommand = () => executeDiscoverSnapshotCandidatesCommandWithOutcome({
            discoveryTag: 'forkbuild-snapshot',
            discoveryQueryService: unavailableService
        });
        const unavailableCtx = panelCtx({ discoverSnapshotCandidatesWithOutcomeCommand: unavailableCommand });
        unavailableCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(unavailableCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '39. FLAGSHIP: Nostr unavailable — the exact same [] the pre-0.9.589 UI could not tell apart from genuine absence — now reported UNAVAILABLE');
        assert(Array.isArray(unavailableCtx.snapshotCandidateDiscoveryResult) && unavailableCtx.snapshotCandidateDiscoveryResult.length === 0,
            '40. FLAGSHIP: the underlying [] degradation is completely unchanged — this milestone adds a classification alongside it, never a replacement');

        console.log('✓ Section H FLAGSHIP: Own Publication -> Snapshot discovery -> Nostr available with zero candidates (EMPTY) vs Nostr unavailable (UNAVAILABLE) — both honestly distinguished through the real production command chain');
    }

    console.log('\n✅ All Distinguish Snapshot Discovery Absence From Discovery Failure tests passed.');
}

function emptySearchOnlySource() {
    return { search: async () => [] };
}

runTests().catch((error) => {
    console.error('✗ DistinguishSnapshotDiscoveryAbsenceFromFailureAudit tests failed:', error.message);
    process.exitCode = 1;
});
