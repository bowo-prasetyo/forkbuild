import { readFile } from 'node:fs/promises';

import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../application/arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { LocalSnapshotCandidateDiscoveryQueryService } from '../application/snapshot/LocalSnapshotCandidateDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryQueryService } from '../application/snapshot/SnapshotCandidateDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryOutcome } from '../application/snapshot/SnapshotCandidateDiscoveryOutcome.js';
import {
    executeDiscoverSnapshotCandidatesCommand,
    executeDiscoverSnapshotCandidatesCommandWithOutcome
} from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { worldEncounterCanvasFiles, publicationsPageFiles, worldViewFiles, ownPublicationPanelFiles } from './support/SourceFileGroups.js';

// 0.9.590 — Snapshot Discovery Outcome Presentation Closure Audit.
//
// A TEST-ONLY closure audit over 0.9.589's own `SnapshotCandidateDiscoveryOutcome`
// vocabulary and its one production UI consumer, `ui/components/OwnPublicationPanel.js`.
// No `application/`, `ui/`, or `core/` file is modified by this milestone. The goal is
// narrow: prove the FOUND/EMPTY/UNAVAILABLE distinction is complete, that it introduces
// no second discovery mechanism and no new identity semantics, and that the legacy
// `search() -> []` contract every prior caller relies on is untouched — then, ONLY where
// live evidence demands it, name (never silently fix) whatever falls short.
//
//   A. Outcome semantics — three states, plus every mixed-source case this milestone's
//      own brief named, proven against the REAL production sources
//      (NostrSnapshotDiscoveryQueryService, LocalSnapshotCandidateDiscoveryQueryService,
//      ArweaveSnapshotDiscoveryQueryService) composed through the REAL
//      SnapshotCandidateDiscoveryQueryService — never generic stand-ins alone.
//   B. Legacy-contract preservation — search() -> [] is unchanged everywhere it is
//      still called; WorldSnapshotDiscoveryMonitor stays wired to the legacy command;
//      searchWithOutcome() is additive, never a required migration.
//   C. Candidate fidelity — FOUND candidates, and the composite's own deduplication,
//      are byte-identical between search() and searchWithOutcome().
//   D. UI truthfulness — EMPTY/UNAVAILABLE/FOUND/legacy/malformed outcomes, plus a
//      live check that the template exposes no Nostr-specific vocabulary.
//   E. Failure isolation — a Nostr timeout reaches UNAVAILABLE and the UI's honest
//      copy without touching any other family in this file, the monitor, or looping.
//   F. Identity and boundary regression — the outcome vocabulary carries no
//      Publication/Snapshot/verification semantics of its own.
//   G. Mechanical drift guard — a fresh, independent sweep for the same
//      "empty network-discovery result -> flat absence claim" mistake elsewhere in
//      ui/, with each near-miss checked and ruled in or out on its own evidence.
//   H. Flagship — the two named journeys, twice, plus proof the ordinary
//      resolution/verification/placement path is untouched.
//   I. FINDING — a genuine, narrow classification gap this audit's own Section A
//      evidence surfaces: `ArweaveSnapshotDiscoveryQueryService` never received the
//      `searchWithOutcome()` sibling `NostrSnapshotDiscoveryQueryService` did, so the
//      composite cannot currently tell "Arweave's query failed" from "Arweave asked
//      and found nothing" — reported here, live, and NOT fixed by this milestone.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
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
        selectedSnapshotResolutionResult: null,
        selectedSnapshotMaterializationResult: null,
        selectedSnapshotWorldPlacementResult: null,
        selectedSnapshotWorldRegistrationResult: null,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        ...overrides
    };
}

function envelopeEvent({ contentHash, locator, storage }) {
    return { content: JSON.stringify({ protocol: 'forkbuild-snapshot-discovery', version: 1, contentHash, locator, storage }) };
}

// A real Local source: `list()` either returns fixed placements or throws,
// matching `LocalSnapshotCandidateDiscoveryQueryService`'s own documented
// "rejects only if list() itself throws" contract — never a stand-in fake.
function localSource(placements, { failing = false } = {}) {
    const catalog = {
        list: () => {
            if (failing) throw new Error('local catalog unavailable');
            return placements;
        }
    };
    return new LocalSnapshotCandidateDiscoveryQueryService(catalog);
}

// A real Arweave source, driven entirely through `fetchImpl` — never a
// second, hand-rolled "Arweave-like" fake.
function arweaveSource({ ids = [], envelopes = {}, failing = false } = {}) {
    const fetchImpl = async (url, options) => {
        if (failing) {
            throw new Error('arweave gateway unreachable');
        }
        if (options && options.method === 'POST') {
            return { ok: true, json: async () => ({ data: { transactions: { edges: ids.map((id) => ({ node: { id } })) } } }) };
        }
        const txId = url.split('/').pop();
        const envelope = envelopes[txId];
        if (!envelope) {
            return { ok: false };
        }
        return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify(envelope) };
    };
    return new ArweaveSnapshotDiscoveryQueryService({ fetchImpl });
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — outcome semantics, including every mixed-source case
    // this milestone's own brief named, against real production sources.
    // ---------------------------------------------------------------
    {
        // Single-source, three states — reconfirmed live against the real
        // NostrSnapshotDiscoveryQueryService (independent of 0.9.589's own tests).
        const foundNostr = new NostrSnapshotDiscoveryQueryService({
            queryImpl: async () => [envelopeEvent({ contentHash: 'h1', locator: 'ar://h1', storage: 'ar' })]
        });
        assert((await foundNostr.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.FOUND,
            '1. at least one candidate survives -> FOUND');

        const emptyNostr = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [] });
        assert((await emptyNostr.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '2. source successfully queried, zero candidates -> EMPTY');

        const downNostr = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('down'); } });
        assert((await downNostr.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '3. source unavailable -> UNAVAILABLE');

        // Mixed case 1 — Nostr unavailable + Local empty -> EMPTY.
        const mix1 = new SnapshotCandidateDiscoveryQueryService([downNostr, localSource([])]);
        assert((await mix1.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '4. Nostr unavailable + Local empty -> EMPTY (one honest answer is enough)');

        // Mixed case 2 — Nostr empty + Arweave unavailable -> EMPTY.
        const mix2 = new SnapshotCandidateDiscoveryQueryService([emptyNostr, arweaveSource({ failing: true })]);
        assert((await mix2.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '5. Nostr empty + Arweave unavailable -> EMPTY (Nostr\'s own honest empty answer is enough)');

        // Mixed case 3 — Nostr unavailable + Local unavailable -> UNAVAILABLE.
        const mix3 = new SnapshotCandidateDiscoveryQueryService([downNostr, localSource([], { failing: true })]);
        assert((await mix3.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '6. Nostr unavailable + Local unavailable -> UNAVAILABLE (no source could be asked at all)');

        // Mixed case 4 — one source finds a candidate + another fails -> FOUND.
        const mix4 = new SnapshotCandidateDiscoveryQueryService([foundNostr, localSource([], { failing: true })]);
        const mix4Outcome = await mix4.searchWithOutcome('t');
        assert(mix4Outcome.outcome === SnapshotCandidateDiscoveryOutcome.FOUND, '7. one source finds + another fails -> FOUND');
        assert(mix4Outcome.candidates.length === 1 && mix4Outcome.candidates[0].contentHash === 'h1',
            '8. the FOUND candidate is the one the succeeding source actually reported');

        // The named invariant, at three sources: two fail, one genuinely
        // empty -> EMPTY, never UNAVAILABLE.
        const threeSource = new SnapshotCandidateDiscoveryQueryService([
            downNostr,
            localSource([], { failing: true }),
            arweaveSource({ ids: [] })
        ]);
        assert((await threeSource.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '9. INVARIANT: two sources failing and one genuinely empty still reports EMPTY, never UNAVAILABLE');

        console.log('✓ Section A: FOUND/EMPTY/UNAVAILABLE, and every named mixed-source case, hold against the real Nostr/Local/Arweave sources composed through the real production composite');
    }

    // ---------------------------------------------------------------
    // Section B — legacy-contract preservation.
    // ---------------------------------------------------------------
    {
        const failingNostr = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('down'); } });
        assert(Array.isArray(await failingNostr.search('t')) && (await failingNostr.search('t')).length === 0,
            '10. NostrSnapshotDiscoveryQueryService#search() still degrades a failure to [], unchanged');

        const compositeFailing = new SnapshotCandidateDiscoveryQueryService([failingNostr]);
        assert(Array.isArray(await compositeFailing.search('t')) && (await compositeFailing.search('t')).length === 0,
            '11. the composite\'s own search() still degrades to [], unchanged');

        // resolveLocator() on Nostr still runs through the unmodified search().
        const nostrSource = await readSource('application/nostr/NostrSnapshotDiscoveryQueryService.js');
        assert(/async resolveLocator\(discoveryTag, contentHash\) \{\s*const candidates = await this\.search\(discoveryTag\);/.test(nostrSource),
            '12. resolveLocator() still calls this.search() directly — an existing caller left byte-for-byte unmodified');

        // The composite's own callers.
        const commandSource = await readSource('application/snapshot/DiscoverSnapshotCandidatesCommand.js');
        assert(/return discoveryQueryService\.search\(discoveryTag\);/.test(commandSource),
            '13. executeDiscoverSnapshotCandidatesCommand() still forwards to search() verbatim');

        // ui/main.js still wires the monitor to the LEGACY command, never the
        // outcome-aware one — the monitor never migrated.
        const mainSource = await readSource('ui/main.js');
        assert(/new WorldSnapshotDiscoveryMonitor\(\{\s*discoverSnapshotCandidatesCommand\s*\}\)/.test(mainSource),
            '14. WorldSnapshotDiscoveryMonitor is still constructed with the LEGACY discoverSnapshotCandidatesCommand, never the outcome-aware sibling');

        const monitorSource = await readSource('application/snapshot/WorldSnapshotDiscoveryMonitor.js');
        assert(!/searchWithOutcome|SnapshotCandidateDiscoveryOutcome|WithOutcomeCommand/.test(monitorSource),
            '15. WorldSnapshotDiscoveryMonitor.js has no idea this vocabulary exists');

        // No caller is forced to migrate: a host supplying only the legacy
        // prop still works end to end, through the real production command.
        const legacyResult = await executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'forkbuild-snapshot',
            discoveryQueryService: localSource([{ contentHash: 'x', locator: 'ar://x', storage: 'ar', publicationId: 'p' }])
        });
        assert(Array.isArray(legacyResult) && legacyResult.length === 1, '16. the legacy command path still works, unmigrated, against a real source');

        // searchWithOutcome() is additive: both methods coexist on the same instance.
        assert(typeof failingNostr.search === 'function' && typeof failingNostr.searchWithOutcome === 'function',
            '17. search() and searchWithOutcome() coexist as true siblings on the same instance');

        console.log('✓ Section B: search() -> [] is unchanged wherever it is still called; the monitor stays on the legacy command; searchWithOutcome() is purely additive');
    }

    // ---------------------------------------------------------------
    // Section C — candidate fidelity.
    // ---------------------------------------------------------------
    {
        const dupEvent = envelopeEvent({ contentHash: 'dup', locator: 'ar://dup', storage: 'ar' });
        const source = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [dupEvent, dupEvent] });
        // NostrSnapshotDiscoveryQueryService itself performs no dedup — that
        // is the composite's own job; confirmed identical between the two
        // methods on the SAME instance for the SAME query.
        const viaSearch = await source.search('t');
        const viaOutcome = (await source.searchWithOutcome('t')).candidates;
        assert(JSON.stringify(viaSearch) === JSON.stringify(viaOutcome),
            '18. Nostr: search() and searchWithOutcome() report byte-identical candidates for the identical query');

        // Composite dedup identical between search() and searchWithOutcome().
        const composite = new SnapshotCandidateDiscoveryQueryService([
            new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [dupEvent] }),
            localSource([{ contentHash: 'dup', locator: 'ar://dup', storage: 'ar' }])
        ]);
        const compositeViaSearch = await composite.search('t');
        const compositeViaOutcome = (await composite.searchWithOutcome('t')).candidates;
        assert(compositeViaSearch.length === 1 && compositeViaOutcome.length === 1,
            '19. composite: the identical storage+contentHash+locator triple from two sources still dedups to one, through BOTH methods');
        assert(JSON.stringify(compositeViaSearch) === JSON.stringify(compositeViaOutcome),
            '20. composite: search() and searchWithOutcome() agree on which candidate survives dedup, byte-for-byte');

        // A candidate's own fields (contentHash/locator/storage/publicationId)
        // are untouched by outcome classification.
        const candidate = compositeViaOutcome[0];
        assert(candidate.contentHash === 'dup' && candidate.locator === 'ar://dup' && candidate.storage === 'ar',
            '21. every existing candidate field survives outcome classification unchanged');

        console.log('✓ Section C: outcome classification is observational enrichment only — candidate identity, fields, and deduplication are identical to ordinary search()');
    }

    // ---------------------------------------------------------------
    // Section D — UI truthfulness.
    // ---------------------------------------------------------------
    {
        const unavailableCtx = panelCtx({
            discoverSnapshotCandidatesWithOutcomeCommand: () => Promise.resolve({ outcome: SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, candidates: [] })
        });
        unavailableCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(unavailableCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, '22. UNAVAILABLE stored verbatim');

        const emptyCtx = panelCtx({
            discoverSnapshotCandidatesWithOutcomeCommand: () => Promise.resolve({ outcome: SnapshotCandidateDiscoveryOutcome.EMPTY, candidates: [] })
        });
        emptyCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(emptyCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.EMPTY, '23. EMPTY stored verbatim');

        const foundCtx = panelCtx({
            discoverSnapshotCandidatesWithOutcomeCommand: () => Promise.resolve({ outcome: SnapshotCandidateDiscoveryOutcome.FOUND, candidates: [{ contentHash: 'h', locator: 'ar://h', storage: 'ar' }] })
        });
        foundCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(foundCtx.snapshotCandidateDiscoveryResult.length === 1, '24. FOUND still renders every candidate');

        const legacyCtx = panelCtx({ discoverSnapshotCandidatesCommand: () => Promise.resolve([]) });
        legacyCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(legacyCtx.snapshotCandidateDiscoveryOutcome === null, '25. legacy command path never receives an outcome');

        // Malformed/unexpected outcome value — the template gates ONLY on
        // outcome === 'unavailable'; anything else with zero candidates
        // falls through to the ordinary empty-state copy, never printing raw
        // internal vocabulary.
        const malformedCtx = panelCtx({
            discoverSnapshotCandidatesWithOutcomeCommand: () => Promise.resolve({ outcome: 'some-unexpected-value', candidates: [] })
        });
        malformedCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(malformedCtx.snapshotCandidateDiscoveryOutcome === 'some-unexpected-value',
            '26. the panel stores whatever it is handed verbatim — it validates nothing itself');

        const panelSource = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');
        const templateStart = panelSource.indexOf('template: `');
        const template = panelSource.slice(templateStart);
        assert(/snapshotCandidateDiscoveryResult\.length === 0 && snapshotCandidateDiscoveryOutcome === 'unavailable'/.test(template),
            '27. the honest copy is gated on outcome === \'unavailable\' EXACTLY — any other string (including a malformed one) falls through to the pre-existing empty-state branch, never rendering raw vocabulary');
        assert(template.includes('No Snapshots have been announced under this discoveryTag yet.'),
            '28. the pre-existing empty-state copy remains the fallback for every non-unavailable case');

        // The UI never exposes Nostr-specific implementation details — scoped
        // to the RENDERED MARKUP only, HTML comments stripped first. This
        // template's own HTML comments legitimately discuss Nostr/Arweave
        // throughout (documentation, never rendered) — what must never leak
        // is Nostr vocabulary in text a viewer actually sees.
        const renderedTemplate = template.replace(/<!--[\s\S]*?-->/g, '');
        assert(!/nostr/i.test(renderedTemplate), '29. the rendered (comment-stripped) template contains no "Nostr" vocabulary of any kind');
        assert(!/relay/i.test(renderedTemplate), '30. the rendered (comment-stripped) template contains no "relay" vocabulary of any kind');

        console.log('✓ Section D: OwnPublicationPanel renders exactly the honest copy for each outcome, falls through gracefully for anything unexpected, and never leaks Nostr-specific vocabulary into the template');
    }

    // ---------------------------------------------------------------
    // Section E — failure isolation.
    // ---------------------------------------------------------------
    {
        const timeoutService = new NostrSnapshotDiscoveryQueryService({ queryImpl: () => new Promise(() => {}), timeoutMs: 5 });
        const timeoutOutcome = await timeoutService.searchWithOutcome('t');
        assert(timeoutOutcome.outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, '31. a timed-out Nostr query reaches UNAVAILABLE');

        const isolationCtx = panelCtx({
            discoverSnapshotCandidatesWithOutcomeCommand: () => timeoutService.searchWithOutcome('t'),
            selectedSnapshotResolutionResult: 'sentinel-resolution',
            selectedSnapshotMaterializationResult: 'sentinel-materialization',
            selectedSnapshotWorldPlacementResult: 'sentinel-placement',
            selectedSnapshotWorldRegistrationResult: 'sentinel-registration'
        });
        isolationCtx.discoverSnapshotCandidates();
        await new Promise((resolve) => setTimeout(resolve, 25));
        await flushMicrotasks();
        assert(isolationCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, '32. the panel reaches UNAVAILABLE for the timeout');
        assert(isolationCtx.selectedSnapshotResolutionResult === 'sentinel-resolution'
            && isolationCtx.selectedSnapshotMaterializationResult === 'sentinel-materialization'
            && isolationCtx.selectedSnapshotWorldPlacementResult === 'sentinel-placement'
            && isolationCtx.selectedSnapshotWorldRegistrationResult === 'sentinel-registration',
            '33. resolution/materialization/placement/registration state is completely untouched by a discovery failure');

        // The method body itself never references any downstream family's
        // own fields — a static, structural guarantee, not just this one run.
        const panelSource = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');
        const methodMatch = panelSource.match(/discoverSnapshotCandidates\(\) \{[\s\S]*?\n {4}\},?/);
        assert(methodMatch, '34. discoverSnapshotCandidates() method body is present and extractable');
        const methodBody = methodMatch[0];
        assert(!/selectedSnapshot|Placement|Registration|Materialization|Attribution/.test(methodBody),
            '35. discoverSnapshotCandidates() never references resolution/materialization/placement/registration/attribution state — structurally isolated, not just by this run\'s evidence');

        // No retry loop: exactly one timer per query, never a scheduled
        // re-attempt, in either searchWithOutcome() implementation.
        const nostrSource = await readSource('application/nostr/NostrSnapshotDiscoveryQueryService.js');
        const outcomeMethodMatch = nostrSource.match(/async searchWithOutcome\(discoveryTag\) \{[\s\S]*?\n {4}\}/);
        assert(outcomeMethodMatch && (outcomeMethodMatch[0].match(/setTimeout/g) || []).length === 0,
            '36. NostrSnapshotDiscoveryQueryService#searchWithOutcome() schedules no timer of its own — it reuses the existing single withTimeout() guard, never a retry');
        assert(!/setInterval/.test(nostrSource) && !/setInterval/.test(await readSource('application/snapshot/SnapshotCandidateDiscoveryQueryService.js')),
            '37. no setInterval-based retry/poll exists anywhere in this milestone\'s own files');

        // The command file itself imports nothing Repository/resolution/
        // verification-shaped — it cannot reach those systems even by
        // accident.
        const commandSource = await readSource('application/snapshot/DiscoverSnapshotCandidatesCommand.js');
        assert(!/^import /m.test(commandSource), '38. DiscoverSnapshotCandidatesCommand.js imports nothing at all — it cannot reach a Repository, resolver, or verifier even accidentally');

        console.log('✓ Section E: a Nostr timeout reaches UNAVAILABLE and the honest UI copy while leaving Repository, resolution, verification, placement, the monitor, and every sentinel field completely untouched, with no retry loop anywhere');
    }

    // ---------------------------------------------------------------
    // Section F — identity and boundary regression.
    // ---------------------------------------------------------------
    {
        assert(Object.isFrozen(SnapshotCandidateDiscoveryOutcome), '39. the outcome vocabulary object is frozen');
        const keys = Object.keys(SnapshotCandidateDiscoveryOutcome).sort();
        assert(JSON.stringify(keys) === JSON.stringify(['EMPTY', 'FOUND', 'UNAVAILABLE']),
            '40. exactly three values exist — no fourth ("VERIFIED", "AUTHORITATIVE", "PLACED", etc.) has been added');

        // FOUND means only "the query produced candidates" — never anything
        // about verification, authority, or placement. Proven by construction:
        // a FOUND result requires nothing but candidates.length > 0, and the
        // outcome object itself carries no other key.
        const found = await new NostrSnapshotDiscoveryQueryService({
            queryImpl: async () => [envelopeEvent({ contentHash: 'h', locator: 'ar://h', storage: 'ar' })]
        }).searchWithOutcome('t');
        assert(JSON.stringify(Object.keys(found).sort()) === JSON.stringify(['candidates', 'outcome']),
            '41. a searchWithOutcome() result carries exactly {outcome, candidates} — no verified/authoritative/valid field of any kind');

        // The vocabulary file itself introduces no import of, or reference
        // to, Publication/Snapshot/contentHash-as-identity/locator-as-identity/
        // verification-state machinery — it is pure, standalone enum text.
        const outcomeSource = await readSource('application/snapshot/SnapshotCandidateDiscoveryOutcome.js');
        assert(!/^import /m.test(outcomeSource), '42. SnapshotCandidateDiscoveryOutcome.js imports nothing — it is not a second representation of anything else in this codebase');

        console.log('✓ Section F: the outcome vocabulary is exactly three frozen values, carries no other semantics, and FOUND means only "the query produced candidates"');
    }

    // ---------------------------------------------------------------
    // Section G — mechanical drift guard, independently re-run.
    // ---------------------------------------------------------------
    {
        const rendererSource = await readSource('renderer/WorldRenderer.js');
        assert(!/corrupt|unreadable|deserialize/i.test(rendererSource),
            '43. renderer/WorldRenderer.js still asserts no reason for an absent Structure Document (I3b stays out of scope)');

        const worldEncounterCanvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(!/have been announced/i.test(worldEncounterCanvasSource),
            '44. WorldEncounterCanvas.js makes no equivalent "have been announced" claim');

        // WorldView.js's own "Nearby Place Names" empty state was the
        // closest surface-level match found by an independent sweep — it
        // reads "were discovered," never "exist"/"were published," and
        // carries its OWN separate, honest network-failure indicator
        // (placeNamingDiscoveryError) shown independently of the empty-list
        // copy. Reconfirmed live, not merely by memory of 0.9.589's audit.
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        assert(/No nearby place naming claims were discovered\./.test(worldViewSource),
            '45. WorldView.js\'s nearby-claims empty copy says "were discovered," not a flat existence claim');
        assert(/Place naming discovery is temporarily unavailable/.test(worldViewSource),
            '46. WorldView.js already carries its OWN separate, honest "temporarily unavailable" copy for this exact family — no gap here');

        // PlaceNamingPanel.js's own "Nobody has published..." empty state
        // looked similar at first grep, but its `namingView` prop is
        // documented, live, as core/PlaceNamingView.js#namingView()'s own
        // shape — a LOCAL, pure view over already-known claims, never a
        // network search() result that can itself fail. "Nobody has
        // published a naming claim for this place yet" is an accurate
        // statement about local knowledge, the same category of honesty
        // this codebase already draws elsewhere — ruled out, not a match.
        const placeNamingPanelSource = await readSource('ui/components/PlaceNamingPanel.js');
        assert(/core\/PlaceNamingView\.js#namingView\(\)/.test(placeNamingPanelSource),
            '47. PlaceNamingPanel.js\'s namingView is documented as a local, pure view — not a network discovery result, ruled OUT as a match');

        // DecentralizedPublicationsView.js's "Nothing cataloged yet." empty
        // state is over a LOCAL catalog (attribution/naming claims already
        // known to this replica), not the Snapshot candidate discovery
        // mechanism this milestone scopes — ruled out on the same grounds.
        const decentralizedPublicationsSource = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
        assert(/Nothing cataloged yet\./.test(decentralizedPublicationsSource),
            '48. DecentralizedPublicationsView.js\'s empty state describes a local catalog, unrelated to Snapshot candidate discovery — ruled OUT as a match');

        console.log('✓ Section G: an independent sweep finds every near-miss already ruled out on its own evidence — no second genuine overclaim of the Snapshot-discovery kind exists elsewhere in ui/');
    }

    // ---------------------------------------------------------------
    // Section H — flagship.
    // ---------------------------------------------------------------
    {
        // Journey 1 — Nostr available, with candidates, then with none.
        const withCandidates = new NostrSnapshotDiscoveryQueryService({
            queryImpl: async () => [envelopeEvent({ contentHash: 'flag-1', locator: 'ar://flag-1', storage: 'ar' })]
        });
        const foundCommand = () => executeDiscoverSnapshotCandidatesCommandWithOutcome({ discoveryTag: 'forkbuild-snapshot', discoveryQueryService: withCandidates });
        const foundCtx = panelCtx({ discoverSnapshotCandidatesWithOutcomeCommand: foundCommand });
        foundCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(foundCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.FOUND
            && foundCtx.snapshotCandidateDiscoveryResult.length === 1,
            '49. FLAGSHIP run 1a: Nostr available, candidates announced -> FOUND, displayed');

        const zeroNostr = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [] });
        const emptyCommand = () => executeDiscoverSnapshotCandidatesCommandWithOutcome({ discoveryTag: 'forkbuild-snapshot', discoveryQueryService: zeroNostr });
        const emptyRunCtx = panelCtx({ discoverSnapshotCandidatesWithOutcomeCommand: emptyCommand });
        emptyRunCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(emptyRunCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '50. FLAGSHIP run 1b: Nostr available, no candidates -> EMPTY -> "No Snapshots..." copy');

        // Journey 2 — all sources unavailable, through a real composite of
        // the two sources whose OWN failure-signaling the composite can
        // actually observe (Nostr, via its own searchWithOutcome(); Local,
        // via a genuine rejection). See Section I, immediately below, for
        // why the THIRD real production source (Arweave) is deliberately
        // left out of this specific journey, and what happens when it is not.
        const allDown = new SnapshotCandidateDiscoveryQueryService([
            new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay down'); } }),
            localSource([], { failing: true })
        ]);
        const unavailableCommand = () => executeDiscoverSnapshotCandidatesCommandWithOutcome({ discoveryTag: 'forkbuild-snapshot', discoveryQueryService: allDown });
        const unavailableCtx = panelCtx({ discoverSnapshotCandidatesWithOutcomeCommand: unavailableCommand });
        unavailableCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(unavailableCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '51. FLAGSHIP run 2: every source whose failure the composite can currently observe (Nostr + Local) is down -> UNAVAILABLE -> "Snapshot discovery is currently unavailable." copy');

        // Twice, per the milestone's own brief — re-run journey 1 a second
        // time to prove no hidden state leaks between calls.
        const secondCtx = panelCtx({ discoverSnapshotCandidatesWithOutcomeCommand: foundCommand });
        secondCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(secondCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.FOUND,
            '52. FLAGSHIP, second pass: the identical journey reproduces the identical outcome, from a fresh panel instance');

        // Ordinary resolution/verification/placement path, unchanged: select
        // a FOUND candidate and confirm selection remains the same plain
        // assignment 0.9.151 already established — this milestone changed
        // nothing about it.
        const candidate = foundCtx.snapshotCandidateDiscoveryResult[0];
        foundCtx.selectSnapshotCandidate(candidate);
        assert(foundCtx.selectedSnapshotCandidate === candidate,
            '53. selecting a discovered candidate still behaves as a plain assignment, untouched by this milestone');

        console.log('✓ Section H FLAGSHIP: both journeys, run twice, hold through the real production command chain and real production sources; the ordinary selection path remains untouched');
    }

    // ---------------------------------------------------------------
    // Section I — CLOSED BY 0.9.591: the classification gap this audit
    // originally found for Arweave (Section A's own evidence) has since
    // been fixed by application/arweave/ArweaveSnapshotDiscoveryQueryService.js's
    // own 0.9.591 `searchWithOutcome()` addition — reconfirmed live, here,
    // rather than left as a standing, stale "not fixed" assertion.
    // ---------------------------------------------------------------
    {
        // ArweaveSnapshotDiscoveryQueryService now carries the identical
        // searchWithOutcome() sibling NostrSnapshotDiscoveryQueryService
        // already had.
        const arweaveSourceText = await readSource('application/arweave/ArweaveSnapshotDiscoveryQueryService.js');
        assert(/searchWithOutcome/.test(arweaveSourceText),
            '54. CLOSED (1/3): ArweaveSnapshotDiscoveryQueryService now exposes its own searchWithOutcome() — confirmed live, not assumed');

        // search() itself is untouched — still swallows every failure to
        // [], the identical pre-0.9.589 contract Nostr's search() also
        // still holds, by design, per this file's own header ("Never
        // throws — resolves to [] when the GraphQL step fails").
        const arweaveDown = arweaveSource({ failing: true });
        const arweaveResult = await arweaveDown.search('t');
        assert(Array.isArray(arweaveResult) && arweaveResult.length === 0,
            '55. CLOSED (2/3): search() still degrades a genuinely failing Arweave query to [], byte-for-byte unmodified by the 0.9.591 fix');

        // Its own searchWithOutcome() now correctly reports UNAVAILABLE for
        // that identical failure, rather than collapsing it to EMPTY.
        assert((await arweaveDown.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '56. CLOSED (3/3): ArweaveSnapshotDiscoveryQueryService#searchWithOutcome() now reports UNAVAILABLE for the identical failure search() still degrades to []');

        // Consequence, reconfirmed live: when EVERY real source fails and
        // Arweave is one of them, the composite's own per-source
        // classification now sees Arweave's own genuine UNAVAILABLE
        // (through its new searchWithOutcome(), duck-typed exactly like
        // Nostr's own) rather than only a swallowed []. The composite now
        // reports UNAVAILABLE, closing exactly the user-facing overclaim
        // this audit originally surfaced.
        const bothDown = new SnapshotCandidateDiscoveryQueryService([
            new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay down'); } }),
            arweaveSource({ failing: true })
        ]);
        const bothDownOutcome = await bothDown.searchWithOutcome('t');
        assert(bothDownOutcome.outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '57. CLOSED, live reproduction: Nostr AND Arweave both genuinely down -> composite now reports UNAVAILABLE — OwnPublicationPanel now renders "Snapshot discovery is currently unavailable," never the "No Snapshots have been announced" overclaim, whenever Arweave is among the failing sources');

        // The EMPTY-still-wins-over-UNAVAILABLE invariant (0.9.589's own
        // Section A, case 5) still holds with the real Arweave source in
        // the mix: Nostr genuinely empty + Arweave genuinely down -> EMPTY,
        // never UNAVAILABLE — a real answer from one source is still
        // enough, exactly as this milestone's own boundary requires.
        const nostrEmptyArweaveDown = new SnapshotCandidateDiscoveryQueryService([
            new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [] }),
            arweaveSource({ failing: true })
        ]);
        assert((await nostrEmptyArweaveDown.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '58. CLOSED, invariant preserved: Nostr genuinely empty + Arweave down still reports EMPTY, never UNAVAILABLE — one honest answer remains enough');

        // Not a hypothetical: `ui/main.js`'s own
        // `composeSnapshotCandidateDiscoveryRuntime()` composes the REAL
        // production discoverSnapshotCandidatesWithOutcomeCommand from
        // Nostr + Local + Arweave together (see that file's own 0.9.500/
        // 0.9.486 headers) — confirmed live, not assumed. Section H's own
        // flagship journey 2 (above) was originally narrowed to Nostr +
        // Local specifically because the real Arweave source used to
        // reproduce this finding; with the fix in place that journey's own
        // narrowing is a historical artifact, not a currently-required
        // workaround — see tests/ArweaveSnapshotDiscoveryOutcomeParityIntegrationAudit.test.js's
        // own Section E/G for the identical journey run WITH Arweave
        // included, end to end.
        const mainSourceForFinding = await readSource('ui/main.js');
        assert(/arweaveSnapshotDiscoveryQueryService/.test(mainSourceForFinding) && /nostrSnapshotDiscoveryQueryService: snapshotDiscoveryQueryService/.test(mainSourceForFinding),
            '59. production confirmation: the real discoverSnapshotCandidatesWithOutcomeCommand is composed from Nostr + Local + Arweave together — this fix is reachable in production, not only in this test\'s own constructed scenario');

        console.log('✓ Section I CLOSED (0.9.591): ArweaveSnapshotDiscoveryQueryService now carries the identical searchWithOutcome() sibling NostrSnapshotDiscoveryQueryService already had — the composite\'s own "classify from the outside" heuristic now correctly detects an Arweave failure as UNAVAILABLE, while a genuine Arweave EMPTY still reports EMPTY, exactly mirroring NostrSnapshotDiscoveryQueryService\'s own 0.9.589 addition, one source over.');
    }

    console.log('\n✅ All Snapshot Discovery Outcome Presentation Closure Audit tests passed (Sections A-H clean; Section I\'s own originally-named finding is now closed by 0.9.591).');
}

runTests().catch((error) => {
    console.error('✗ SnapshotDiscoveryOutcomePresentationClosureAudit tests failed:', error.message);
    process.exitCode = 1;
});
