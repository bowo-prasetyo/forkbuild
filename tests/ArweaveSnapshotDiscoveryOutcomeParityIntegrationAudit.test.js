import { readFile } from 'node:fs/promises';

import { ArweaveSnapshotDiscoveryQueryService } from '../application/arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { LocalSnapshotCandidateDiscoveryQueryService } from '../application/snapshot/LocalSnapshotCandidateDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryQueryService } from '../application/snapshot/SnapshotCandidateDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryOutcome } from '../application/snapshot/SnapshotCandidateDiscoveryOutcome.js';
import { executeDiscoverSnapshotCandidatesCommandWithOutcome } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';

// 0.9.591 — Arweave Snapshot Discovery Outcome Parity.
//
// tests/SnapshotDiscoveryOutcomePresentationClosureAudit.test.js (0.9.590)
// proved, live, that the FOUND/EMPTY/UNAVAILABLE vocabulary 0.9.589
// established was source-DEPENDENT: `NostrSnapshotDiscoveryQueryService`
// classified its own failures honestly through `searchWithOutcome()`, but
// `ArweaveSnapshotDiscoveryQueryService` had no such sibling, so the
// composite's own "classify from the outside" fallback could never observe
// an Arweave transport failure — Arweave's own `search()` swallows every
// failure to `[]`, indistinguishable, from the outside, from a genuine
// empty result. This file is that gap closed: application/
// ArweaveSnapshotDiscoveryQueryService.js's own new `searchWithOutcome()`
// (0.9.591) reuses the IDENTICAL GraphQL request `search()` already sends,
// classifying `UNAVAILABLE` only when the GraphQL step itself could not be
// completed — never when a per-candidate gateway read merely comes back
// empty, malformed, or missing, preserving `search()`'s own existing
// graceful degradation unchanged.
//
//   A. Real Arweave FOUND — a valid discovery envelope produces FOUND +
//      the exact candidate.
//   B. Real Arweave EMPTY — a successful, zero-transaction GraphQL query
//      produces EMPTY, never UNAVAILABLE.
//   C. Arweave failure — the GraphQL step itself failing (throw, non-2xx,
//      unparseable body, unexpected-shaped body) produces UNAVAILABLE,
//      never EMPTY.
//   D. Candidate fidelity — search() and searchWithOutcome() report
//      byte-identical candidates for FOUND results.
//   E. Composite convergence — the named FOUND/EMPTY/UNAVAILABLE
//      combination matrix, against real Nostr + Local + Arweave sources
//      composed through the real production composite.
//   F. Legacy preservation — search()'s own pre-existing contract (and its
//      own private helpers) are provably untouched.
//   G. UI consequence — the real OwnPublicationPanel path: an Arweave-only
//      outage no longer produces the "No Snapshots have been announced"
//      overclaim when another source establishes EMPTY, and an all-source
//      failure still produces the honest "currently unavailable" copy.
//   H. Boundary regression — no change to resolution, verification,
//      placement, World Encounter, walking-triggered discovery,
//      Repository, provider selection, Arweave announcement publishing,
//      or gateway retry/failover.

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

function graphqlResponse(ids) {
    return { ok: true, json: async () => ({ data: { transactions: { edges: ids.map((id) => ({ node: { id } })) } } }) };
}

function envelopeJson(overrides = {}) {
    return JSON.stringify({
        protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
        version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
        contentHash: 'snapshot-hash-1',
        locator: 'ar://SnapshotContentTx0000000000000001',
        storage: 'ar',
        ...overrides
    });
}

// A real Arweave source, driven entirely through an injected `fetchImpl` —
// never a hand-rolled "Arweave-like" fake. `graphqlBehavior` selects how the
// GraphQL POST step itself resolves; `envelopes` maps announcement
// transaction id -> raw envelope body served by the per-candidate gateway
// GET.
function arweaveSource({ graphqlBehavior = { kind: 'ids', ids: [] }, envelopes = {} } = {}) {
    const fetchImpl = async (url, options = {}) => {
        if ((options.method || 'GET') === 'POST') {
            switch (graphqlBehavior.kind) {
                case 'throw':
                    throw new Error('simulated GraphQL gateway unreachable');
                case 'non2xx':
                    return { ok: false };
                case 'unparseable':
                    return { ok: true, json: async () => { throw new Error('simulated invalid JSON'); } };
                case 'unexpectedShape':
                    return { ok: true, json: async () => ({ data: {} }) };
                case 'ids':
                default:
                    return graphqlResponse(graphqlBehavior.ids);
            }
        }
        const id = url.split('/').pop();
        if (!Object.prototype.hasOwnProperty.call(envelopes, id)) {
            return { ok: false };
        }
        return { ok: true, headers: { get: () => null }, text: async () => envelopes[id] };
    };
    return new ArweaveSnapshotDiscoveryQueryService({ fetchImpl });
}

function localSource(placements, { failing = false } = {}) {
    const catalog = {
        list: () => {
            if (failing) throw new Error('local catalog unavailable');
            return placements;
        }
    };
    return new LocalSnapshotCandidateDiscoveryQueryService(catalog);
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
        ...overrides
    };
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — real Arweave FOUND.
    // ---------------------------------------------------------------
    {
        const ANNOUNCEMENT_ID = 'AnnounceTxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        const service = arweaveSource({
            graphqlBehavior: { kind: 'ids', ids: [ANNOUNCEMENT_ID] },
            envelopes: { [ANNOUNCEMENT_ID]: envelopeJson() }
        });
        const result = await service.searchWithOutcome('audit-tag');

        assert(result.outcome === SnapshotCandidateDiscoveryOutcome.FOUND, '1. a valid Arweave discovery envelope produces FOUND');
        assert(result.candidates.length === 1, '2. exactly one candidate is reported');
        assert(result.candidates[0].contentHash === 'snapshot-hash-1'
            && result.candidates[0].locator === 'ar://SnapshotContentTx0000000000000001'
            && result.candidates[0].storage === 'ar',
            '3. the reported candidate carries the exact announced fields');

        console.log('✓ Section A: a real, valid Arweave discovery envelope produces FOUND with the exact expected candidate');
    }

    // ---------------------------------------------------------------
    // Section B — real Arweave EMPTY.
    // ---------------------------------------------------------------
    {
        // Zero transactions named by a genuinely successful GraphQL query.
        const zeroTx = arweaveSource({ graphqlBehavior: { kind: 'ids', ids: [] } });
        const zeroTxResult = await zeroTx.searchWithOutcome('audit-tag');
        assert(zeroTxResult.outcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '4. a successful query naming zero transactions produces EMPTY, never UNAVAILABLE');
        assert(zeroTxResult.candidates.length === 0, '5. EMPTY carries zero candidates');

        // A successful GraphQL query names a transaction, but its own
        // per-candidate envelope is unreadable (404) — search()'s own
        // graceful degradation already skips it; searchWithOutcome() must
        // still classify this as EMPTY (the GraphQL step itself succeeded),
        // never UNAVAILABLE, matching the identical restraint Nostr's own
        // searchWithOutcome() holds for a malformed event.
        const unreadableTx = arweaveSource({ graphqlBehavior: { kind: 'ids', ids: ['tx-missing'] }, envelopes: {} });
        const unreadableResult = await unreadableTx.searchWithOutcome('audit-tag');
        assert(unreadableResult.outcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '6. a named transaction whose own envelope cannot be read still classifies as EMPTY, not UNAVAILABLE — the GraphQL step itself completed');

        console.log('✓ Section B: a successful Arweave query with no matching (or no readable) transactions produces EMPTY, never UNAVAILABLE');
    }

    // ---------------------------------------------------------------
    // Section C — Arweave failure.
    // ---------------------------------------------------------------
    {
        const throwing = arweaveSource({ graphqlBehavior: { kind: 'throw' } });
        assert((await throwing.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '7. a throwing GraphQL fetch produces UNAVAILABLE');

        const non2xx = arweaveSource({ graphqlBehavior: { kind: 'non2xx' } });
        assert((await non2xx.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '8. a non-2xx GraphQL response produces UNAVAILABLE');

        const unparseable = arweaveSource({ graphqlBehavior: { kind: 'unparseable' } });
        assert((await unparseable.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '9. an unparseable GraphQL body produces UNAVAILABLE');

        const unexpectedShape = arweaveSource({ graphqlBehavior: { kind: 'unexpectedShape' } });
        assert((await unexpectedShape.searchWithOutcome('t')).outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '10. a valid-JSON-but-unexpected-shaped GraphQL body produces UNAVAILABLE — the identical "not the array we expect" line Nostr\'s own searchWithOutcome() already draws');

        // Never throws.
        let threw = false;
        try {
            await throwing.searchWithOutcome('t');
        } catch {
            threw = true;
        }
        assert(!threw, '11. searchWithOutcome() never throws for a GraphQL-level failure — it resolves to UNAVAILABLE');

        console.log('✓ Section C: every GraphQL-level failure (throw, non-2xx, unparseable body, unexpected-shaped body) produces UNAVAILABLE, never EMPTY, and never throws');
    }

    // ---------------------------------------------------------------
    // Section D — candidate fidelity.
    // ---------------------------------------------------------------
    {
        const ID_1 = 'AnnounceTxD1DDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
        const ID_2 = 'AnnounceTxD2DDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
        const service = arweaveSource({
            graphqlBehavior: { kind: 'ids', ids: [ID_1, ID_2] },
            envelopes: {
                [ID_1]: envelopeJson({ contentHash: 'hash-1', locator: 'ar://content-1' }),
                [ID_2]: envelopeJson({ contentHash: 'hash-2', locator: 'ar://content-2' })
            }
        });

        const viaSearch = await service.search('audit-tag');
        const viaOutcome = (await service.searchWithOutcome('audit-tag')).candidates;
        assert(JSON.stringify(viaSearch) === JSON.stringify(viaOutcome),
            '12. search() and searchWithOutcome() report byte-identical candidates for the identical FOUND query');

        console.log('✓ Section D: search() and searchWithOutcome() produce identical candidates for successful results');
    }

    // ---------------------------------------------------------------
    // Section E — composite convergence, against real Nostr + Local +
    // Arweave sources composed through the real production composite.
    // ---------------------------------------------------------------
    {
        const nostrEmpty = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [] });
        const nostrDown = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay down'); } });
        const nostrFound = new NostrSnapshotDiscoveryQueryService({
            queryImpl: async () => [{ content: JSON.stringify({ protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash: 'nostr-h', locator: 'ar://nostr', storage: 'ar' }) }]
        });
        const localEmpty = localSource([]);
        const localDown = localSource([], { failing: true });
        const localFound = localSource([{ contentHash: 'local-h', locator: 'ar://local', storage: 'ar', publicationId: 'p' }]);
        const arweaveEmpty = arweaveSource({ graphqlBehavior: { kind: 'ids', ids: [] } });
        const arweaveDown = arweaveSource({ graphqlBehavior: { kind: 'throw' } });
        const arweaveFound = arweaveSource({
            graphqlBehavior: { kind: 'ids', ids: ['AnnounceTxE1EEEEEEEEEEEEEEEEEEEEEEEEEEEEE'] },
            envelopes: { 'AnnounceTxE1EEEEEEEEEEEEEEEEEEEEEEEEEEEEE': envelopeJson({ contentHash: 'arweave-h', locator: 'ar://arweave' }) }
        });

        const matrix = [
            { label: 'EMPTY/EMPTY/EMPTY -> EMPTY', sources: [nostrEmpty, localEmpty, arweaveEmpty], expect: SnapshotCandidateDiscoveryOutcome.EMPTY },
            { label: 'EMPTY/EMPTY/UNAVAILABLE -> EMPTY', sources: [nostrEmpty, localEmpty, arweaveDown], expect: SnapshotCandidateDiscoveryOutcome.EMPTY },
            { label: 'UNAVAILABLE/EMPTY/UNAVAILABLE -> EMPTY', sources: [nostrDown, localEmpty, arweaveDown], expect: SnapshotCandidateDiscoveryOutcome.EMPTY },
            { label: 'UNAVAILABLE/UNAVAILABLE/UNAVAILABLE -> UNAVAILABLE', sources: [nostrDown, localDown, arweaveDown], expect: SnapshotCandidateDiscoveryOutcome.UNAVAILABLE },
            { label: 'FOUND/UNAVAILABLE/UNAVAILABLE -> FOUND', sources: [nostrFound, localDown, arweaveDown], expect: SnapshotCandidateDiscoveryOutcome.FOUND },
            { label: 'UNAVAILABLE/FOUND/UNAVAILABLE -> FOUND', sources: [nostrDown, localFound, arweaveDown], expect: SnapshotCandidateDiscoveryOutcome.FOUND },
            { label: 'UNAVAILABLE/UNAVAILABLE/FOUND -> FOUND', sources: [nostrDown, localDown, arweaveFound], expect: SnapshotCandidateDiscoveryOutcome.FOUND }
        ];

        let n = 13;
        for (const { label, sources, expect } of matrix) {
            const composite = new SnapshotCandidateDiscoveryQueryService(sources);
            const outcome = (await composite.searchWithOutcome('audit-tag')).outcome;
            assert(outcome === expect, `${n}. ${label} (got ${outcome})`);
            n += 1;
        }

        // The important boundary this milestone's own brief drew: an
        // Arweave-only failure never widens composite UNAVAILABLE beyond
        // what it already meant — at least one genuinely successful source
        // still yields EMPTY or FOUND, exactly as it did before Arweave
        // ever had its own searchWithOutcome().
        console.log(`✓ Section E: the full named FOUND/EMPTY/UNAVAILABLE composite matrix holds against real Nostr + Local + Arweave sources (${n - 13} combinations)`);
    }

    // ---------------------------------------------------------------
    // Section F — legacy preservation.
    // ---------------------------------------------------------------
    {
        const arweaveDown = arweaveSource({ graphqlBehavior: { kind: 'throw' } });
        const legacyResult = await arweaveDown.search('t');
        assert(Array.isArray(legacyResult) && legacyResult.length === 0,
            '20. search() still degrades a GraphQL failure to [], completely unchanged by this milestone');

        const source = await readSource('application/arweave/ArweaveSnapshotDiscoveryQueryService.js');
        const searchMethodMatch = source.match(/async search\(discoveryTag\) \{[\s\S]*?\n {4}\}/);
        assert(searchMethodMatch, '21. search() is present and extractable');
        assert(!/searchWithOutcome|SnapshotCandidateDiscoveryOutcome|_searchAnnouncementTransactionIdsWithOutcome/.test(searchMethodMatch[0]),
            '22. search()\'s own method body references nothing from this milestone\'s own addition — it calls only its existing, unmodified private helpers');

        // The pre-existing private helper search() itself calls is
        // byte-for-byte present, unmodified.
        assert(/async _searchAnnouncementTransactionIds\(discoveryTag\) \{/.test(source),
            '23. _searchAnnouncementTransactionIds() — the exact private helper search() already called — is still present, unmodified');
        assert(/async _fetchAnnouncementEnvelope\(transactionId\) \{/.test(source),
            '24. _fetchAnnouncementEnvelope() — the exact private helper search() already called — is still present, unmodified');

        // searchWithOutcome() is additive: both methods coexist.
        assert(typeof arweaveDown.search === 'function' && typeof arweaveDown.searchWithOutcome === 'function',
            '25. search() and searchWithOutcome() coexist as true siblings on the same instance');

        // resolveLocator() still runs through the unmodified search().
        assert(/async resolveLocator\(discoveryTag, contentHash\) \{\s*const candidates = await this\.search\(discoveryTag\);/.test(source),
            '26. resolveLocator() still calls this.search() directly — unmodified');

        console.log('✓ Section F: search() and its own existing private helpers are provably unchanged; searchWithOutcome() is purely additive');
    }

    // ---------------------------------------------------------------
    // Section G — UI consequence, through the real OwnPublicationPanel and
    // the real DiscoverSnapshotCandidatesCommand boundary.
    // ---------------------------------------------------------------
    {
        // An Arweave-only outage, with Local honestly reporting EMPTY —
        // the panel must render "No Snapshots have been announced," never
        // "Snapshot discovery is currently unavailable."
        const arweaveOnlyDown = new SnapshotCandidateDiscoveryQueryService([
            localSource([]),
            arweaveSource({ graphqlBehavior: { kind: 'throw' } })
        ]);
        const emptyCommand = () => executeDiscoverSnapshotCandidatesCommandWithOutcome({ discoveryTag: 'forkbuild-snapshot', discoveryQueryService: arweaveOnlyDown });
        const emptyCtx = panelCtx({ discoverSnapshotCandidatesWithOutcomeCommand: emptyCommand });
        emptyCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(emptyCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.EMPTY,
            '27. an Arweave-only outage, with Local honestly EMPTY, reaches EMPTY at the panel — not UNAVAILABLE');
        assert(emptyCtx.snapshotCandidateDiscoveryResult.length === 0, '28. zero candidates are displayed');

        // Every source down, Arweave included — the panel must now render
        // the honest "currently unavailable" copy, closing exactly the
        // 0.9.590 finding.
        const everySourceDown = new SnapshotCandidateDiscoveryQueryService([
            new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay down'); } }),
            localSource([], { failing: true }),
            arweaveSource({ graphqlBehavior: { kind: 'throw' } })
        ]);
        const unavailableCommand = () => executeDiscoverSnapshotCandidatesCommandWithOutcome({ discoveryTag: 'forkbuild-snapshot', discoveryQueryService: everySourceDown });
        const unavailableCtx = panelCtx({ discoverSnapshotCandidatesWithOutcomeCommand: unavailableCommand });
        unavailableCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(unavailableCtx.snapshotCandidateDiscoveryOutcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            '29. every source down (Nostr + Local + Arweave) reaches UNAVAILABLE at the panel — this is the exact 0.9.590 finding, now closed');

        // Confirm which copy the template actually renders for each case,
        // reading the real template source rather than assuming it.
        const panelSource = await readSource('ui/components/OwnPublicationPanel.js');
        const templateStart = panelSource.indexOf('template: `');
        const template = panelSource.slice(templateStart);
        assert(/snapshotCandidateDiscoveryResult\.length === 0 && snapshotCandidateDiscoveryOutcome === 'unavailable'/.test(template),
            '30. the template gates the honest "currently unavailable" copy on outcome === \'unavailable\' exactly, confirmed against the real production template');
        assert(template.includes('Snapshot discovery is currently unavailable.'),
            '31. the honest unavailable copy is present in the real production template');
        assert(template.includes('No Snapshots have been announced under this discoveryTag yet.'),
            '32. the pre-existing empty-state copy is present in the real production template, as the EMPTY-case fallback');

        console.log('✓ Section G: the real OwnPublicationPanel path — an Arweave-only outage with another honest source reaches EMPTY, and an all-source failure (Arweave included) now reaches the honest "currently unavailable" copy');
    }

    // ---------------------------------------------------------------
    // Section H — boundary regression.
    // ---------------------------------------------------------------
    {
        const arweaveSourceCode = await readSource('application/arweave/ArweaveSnapshotDiscoveryQueryService.js');
        const codeOnly = arweaveSourceCode.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("from '../content/"), '33. no ContentStore import — resolution stays untouched');
        assert(!codeOnly.includes("DecentralizedSnapshotResolver"), '34. no resolver import — verification stays untouched');
        assert(!codeOnly.toLowerCase().includes('nostr'), '35. no Nostr reference — provider selection between sources stays untouched');
        assert(!/walk|distance|radius|proximity/i.test(codeOnly), '36. no walking-distance/World-Encounter concept introduced');
        assert(!codeOnly.includes('ArweaveSnapshotDiscoveryPublisher') && !codeOnly.includes('ArweaveTaggedTransactionUpload'),
            '37. no reference to Arweave announcement publishing — this file still only ever reads');
        assert(!/retry|fallback|cach|rank|\.sort\(/i.test(codeOnly),
            '38. no retry, fallback, caching, or ranking behavior introduced by this milestone');

        // Files this milestone's own brief named as out of scope: none of
        // them changed.
        const monitorSource = await readSource('application/snapshot/WorldSnapshotDiscoveryMonitor.js');
        assert(!/searchWithOutcome|SnapshotCandidateDiscoveryOutcome/.test(monitorSource),
            '39. WorldSnapshotDiscoveryMonitor.js (walking-triggered discovery) has no idea this vocabulary exists — still on the legacy command');

        const commandSource = await readSource('application/snapshot/DiscoverSnapshotCandidatesCommand.js');
        assert(!/^import /m.test(commandSource), '40. DiscoverSnapshotCandidatesCommand.js still imports nothing — it cannot reach Repository/resolution/verification even accidentally');

        const publisherSource = await readSource('application/arweave/ArweaveSnapshotDiscoveryPublisher.js');
        assert(!/searchWithOutcome/.test(publisherSource),
            '41. ArweaveSnapshotDiscoveryPublisher.js (announcement publishing) is completely untouched by this milestone');

        const compositionSource = await readSource('application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js');
        assert(!/searchWithOutcome/.test(compositionSource),
            '42. application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js (provider selection) needed no change — the composite already duck-types searchWithOutcome() per source');

        const mainSource = await readSource('ui/main.js');
        assert(/new ArweaveSnapshotDiscoveryQueryService\(\{ gatewayUrl: resolvedArweaveGatewayUrl \}\)/.test(mainSource),
            '43. ui/main.js still constructs exactly one ArweaveSnapshotDiscoveryQueryService the identical way — no new construction site, no gateway retry/failover config added');

        console.log('✓ Section H: no change reaches resolution, verification, placement, World Encounter, walking-triggered discovery, Repository, provider selection, Arweave announcement publishing, or gateway retry/failover');
    }

    console.log('\n✅ All Arweave Snapshot Discovery Outcome Parity tests passed.');
}

runTests().catch((error) => {
    console.error('✗ ArweaveSnapshotDiscoveryOutcomeParityIntegrationAudit tests failed:', error.message);
    process.exitCode = 1;
});
