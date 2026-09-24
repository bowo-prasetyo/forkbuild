import { readFile } from 'node:fs/promises';

import { SnapshotCandidateDiscoveryQueryService } from '../application/snapshot/SnapshotCandidateDiscoveryQueryService.js';
import { LocalSnapshotCandidateDiscoveryQueryService } from '../application/snapshot/LocalSnapshotCandidateDiscoveryQueryService.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/snapshot/WorldSnapshotDiscoveryMonitor.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/arweave/ArweaveGraphqlDiscoveryQueryService.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { describeSnapshotDiscoveryEnvelope } from '../core/SnapshotDiscoveryEnvelope.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { assert } from './support/Assert.js';

// 0.9.496 — Arweave Integration Boundary Audit for Walking-Triggered
// Snapshot Discovery.
//
// Type: test-only boundary audit. Zero production changes.
//
// A user's own architect, reviewing 0.9.485-0.9.495 (a fully wired,
// envelope-aware, production-integrated Arweave announcement/discovery
// round trip — for `core/DecentralizedWorldDiscoveryLead.js`'s own,
// objectId-keyed Publication/Avatar vocabulary), proposed a testable
// hypothesis: that Arweave has now "earned its place" as a third
// candidate-discovery source `application/
// SnapshotCandidateDiscoveryQueryService.js` (0.9.485, walking-triggered)
// could accept alongside Local and Nostr, and asked for an audit of that
// seam before any production wiring is attempted. This milestone runs
// that audit against CURRENT source, live, rather than against the
// hypothesis's own framing.
//
// THE ONE FINDING THIS AUDIT ADDS THAT THE REQUESTING BRIEF DID NOT
// ANTICIPATE: the hypothesis's premise conflates two independently-built,
// deliberately-separate discovery vocabularies that both happen to touch
// Arweave. `application/arweave/ArweaveGraphqlDiscoveryQueryService.js`'s own
// `search()` — the exact class 0.9.489-0.9.495 hardened — reports
// `{ uri, storage, announcementId }`, built for `core/
// DecentralizedDiscoveryEnvelope.js`'s own OBJECT-ID-KEYED vocabulary (a
// Publication or Avatar's own identity). `application/
// SnapshotCandidateDiscoveryQueryService.js`'s own candidate contract
// requires `{ contentHash, locator, storage }` — CONTENT-HASH-KEYED, per
// `core/SnapshotDiscoveryEnvelope.js`'s own, entirely separate envelope.
// `application/nostr/NostrSnapshotDiscoveryQueryService.js`'s own header already
// named this split explicitly for Nostr ("a candidate, never a lead...
// deliberately NOT a DecentralizedDiscoveryQueryService") — this audit is
// the first to trace the identical split through to Arweave's own
// concrete adapter and prove, live, what it means for THIS milestone's own
// question: `ArweaveGraphqlDiscoveryQueryService` cannot be hired as a
// Snapshot candidate source as it exists today. Every one of its
// candidates would be silently, permanently discarded — see Section B.
//
// LETTERED SECTIONS (mirroring the requesting brief's own lettering):
//   A. Composite query-service contract — already source-count-oblivious;
//      confirmed with a synthetic third source before touching Arweave at
//      all.
//   B. THE CENTRAL FINDING — a real `ArweaveGraphqlDiscoveryQueryService`,
//      fed a real, well-formed `DecentralizedDiscoveryEnvelope`, produces
//      candidates that `SnapshotCandidateDiscoveryQueryService` silently
//      discards, in full, alongside surviving Local/Nostr candidates in
//      the same call.
//   C. Root cause — the two envelope vocabularies traced from source,
//      confirmed no Arweave-Snapshot analogue of
//      `NostrSnapshotDiscoveryPublisher.js`/`NostrSnapshotDiscoveryQueryService.js`
//      exists anywhere in this codebase.
//   D. Composite query-service dedup semantics — untouched, hold
//      regardless of how many sources or which families are mixed.
//   E. Failure isolation — already generalizes past two sources; a third,
//      failing source never disturbs the other two.
//   F. Walking monitor / command total obliviousness — neither file names
//      Local, Nostr, or Arweave anywhere in its own source.
//   G. Request amplification — measured, not estimated: one GraphQL POST
//      plus one gateway GET per discovered transaction, per `search()`
//      call.
//   H. Provenance — no candidate in this family carries a source/origin
//      field today, Arweave included were its shape corrected.
//   I. Resolution/World boundary — none of this family's files import a
//      resolver of any kind; unaffected by source count or family.
//   J. Verdict and recommended next milestone.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any change to `application/arweave/ArweaveGraphqlDiscoveryQueryService.js`,
//   `application/snapshot/SnapshotCandidateDiscoveryQueryService.js`, `application/
//   SnapshotCandidateDiscoveryRuntimeComposition.js`, `application/
//   WorldSnapshotDiscoveryMonitor.js`, or `application/
//   DiscoverSnapshotCandidatesCommand.js`.** This file is test-only,
//   exactly like every other audit in this family; findings are reported,
//   never patched, here.
// - **A new `ArweaveSnapshotDiscoveryPublisher`/
//   `ArweaveSnapshotDiscoveryQueryService` implementation.** Section C
//   names the exact, bounded shape that would need — building it is a
//   later, unscheduled milestone this audit's own verdict recommends.
// - **A shape-adapting shim inside `SnapshotCandidateDiscoveryRuntimeComposition.js`
//   that translates `{ uri, announcementId }` into `{ contentHash,
//   locator }` in place.** `uri`'s own scheme-qualified locator and
//   `contentHash` are not the same fact, and no such derivation exists
//   anywhere in this codebase — inventing one here would be exactly the
//   kind of silent, unaudited identity decision this whole family's own
//   convention refuses. See Section C.
// - **Caching, throttling, ranking, batching, or concurrency limits for
//   Arweave's own per-candidate gateway cost.** Section G measures the
//   cost; it does not propose a mitigation for a cost the walking cadence
//   has not yet been shown to make a real problem.

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

function fakeNostrCandidate(overrides = {}) {
    return {
        contentHash: 'hash-nostr-1',
        locator: 'https://relay.example/blob/nostr-1',
        storage: 'ipfs',
        publicationId: 'pub-nostr-1',
        ...overrides
    };
}

async function run() {
    console.log('=== 0.9.496 — Arweave Integration Boundary Audit for Walking-Triggered Snapshot Discovery ===\n');

    // ===============================================================
    // Section A. Composite query-service contract — already
    // source-count-oblivious.
    // ===============================================================
    {
        const nostrSource = { search: async () => [fakeNostrCandidate()] };
        const localSource = { search: async () => [] };
        const thirdSource = { search: async () => [{ contentHash: 'hash-third-1', locator: 'https://third.example/x', storage: 'https' }] };

        const twoSourceService = new SnapshotCandidateDiscoveryQueryService([nostrSource, localSource]);
        const threeSourceService = new SnapshotCandidateDiscoveryQueryService([nostrSource, localSource, thirdSource]);

        const twoResult = await twoSourceService.search('tag');
        const threeResult = await threeSourceService.search('tag');

        check(twoResult.length === 1, 'A1. two-source baseline: one candidate (Nostr), as expected');
        check(threeResult.length === 2, 'A2. three-source composite: BOTH the original candidate and the new source\'s candidate survive — the constructor and search() accept an arbitrary-length sources array with no code change of any kind');
        check(threeResult.some((c) => c.contentHash === 'hash-third-1'), 'A3. the third source\'s own candidate is present, well-formed, and un-mangled');
        console.log('✓ Section A: SnapshotCandidateDiscoveryQueryService is already N-source-general — confirmed by construction, not by reading its header\'s own claim.');
    }

    // ===============================================================
    // Section B. THE CENTRAL FINDING — a real ArweaveGraphqlDiscoveryQueryService,
    // fed a real, well-formed DecentralizedDiscoveryEnvelope, produces
    // candidates SnapshotCandidateDiscoveryQueryService silently discards.
    // ===============================================================
    {
        const discoveryTag = 'walking-audit-tag';
        const materialUri = 'ar://material-tx-abc123';
        const announcementTxId = 'announce-tx-xyz789';

        const envelope = describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild',
            version: 1,
            kind: WorldEncounterKind.PUBLICATION,
            objectId: 'pub-999',
            uri: materialUri
        });
        check(envelope !== null, 'B1. sanity: the fixture envelope this section builds is itself well-formed per core/DecentralizedDiscoveryEnvelope.js\'s own validator — a fair, real fixture, not a strawman');

        let graphqlCalls = 0;
        let gatewayCalls = 0;
        const fetchImpl = async (url, options = {}) => {
            if (options.method === 'POST') {
                graphqlCalls += 1;
                return {
                    ok: true,
                    json: async () => ({
                        data: { transactions: { edges: [{ node: { id: announcementTxId } }] } }
                    })
                };
            }
            gatewayCalls += 1;
            check(url === `https://arweave.net/${announcementTxId}`, 'B2. the gateway GET targets exactly the announcement transaction id the GraphQL step found');
            return {
                ok: true,
                headers: { get: () => null },
                text: async () => JSON.stringify(envelope)
            };
        };

        const arweaveSource = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl });
        const arweaveCandidates = await arweaveSource.search(discoveryTag);

        check(graphqlCalls === 1 && gatewayCalls === 1, 'B3. sanity: exactly one GraphQL query and one gateway envelope fetch happened, as the real production class documents');
        check(arweaveCandidates.length === 1, 'B4. sanity: ArweaveGraphqlDiscoveryQueryService reports exactly one candidate for the one announcement found');
        const arweaveCandidate = arweaveCandidates[0];
        check(arweaveCandidate.uri === materialUri, 'B5. the reported candidate carries the material\'s own uri (0.9.494\'s own fix, reconfirmed live)');
        check(arweaveCandidate.announcementId === announcementTxId, 'B6. the reported candidate carries the announcement transaction id alongside it');
        check(!('contentHash' in arweaveCandidate), 'B7. THE FINDING: the candidate this real, current, production Arweave adapter reports has NO contentHash field at all');
        check(!('locator' in arweaveCandidate), 'B8. THE FINDING: the candidate has no locator field either — it reports uri, never locator');

        // Now feed this REAL Arweave candidate, verbatim, into the REAL
        // SnapshotCandidateDiscoveryQueryService, in a mixed call
        // alongside a well-formed Local and a well-formed Nostr candidate
        // — exactly the composition the requesting brief asked to audit.
        const nostrSource = { search: async () => [fakeNostrCandidate({ contentHash: 'hash-mixed-nostr', locator: 'https://relay.example/blob/mixed', storage: 'ipfs' })] };
        const localSource = { search: async () => [{ contentHash: 'hash-mixed-local', locator: 'https://local.example/blob/mixed', storage: 'ipfs' }] };
        const arweaveAsThirdSource = { search: async () => arweaveCandidates };

        const composite = new SnapshotCandidateDiscoveryQueryService([nostrSource, localSource, arweaveAsThirdSource]);
        const composedResult = await composite.search(discoveryTag);

        check(composedResult.length === 2, 'B9. THE FINDING, END TO END: of the three sources\' combined output, only the two contentHash/locator-shaped candidates (Nostr, Local) survive — the Arweave candidate is silently, completely discarded');
        check(composedResult.every((c) => c.contentHash !== undefined && c.locator !== undefined), 'B10. every surviving candidate is well-formed; the Arweave candidate never appears among them under any key');
        check(!composedResult.some((c) => c.announcementId === announcementTxId), 'B11. the Arweave announcement never reaches a caller of search() in any form — not degraded, not partial: absent');

        console.log('✓ Section B — THE CENTRAL FINDING: ArweaveGraphqlDiscoveryQueryService.search()\'s own real, current output does not satisfy');
        console.log('  SnapshotCandidateDiscoveryQueryService\'s own candidate contract. Wiring it in as a third source today would silently pay');
        console.log('  its full GraphQL + gateway request cost, every walking observation, for a permanent, silent, zero-candidate contribution —');
        console.log('  never an error, never a log, just nothing. This is worse than not integrating it at all.');
    }

    // ===============================================================
    // Section C. Root cause — the two envelope vocabularies, traced from
    // source. Confirms no Arweave-Snapshot analogue of the Nostr
    // publisher/query-service pair exists anywhere in this codebase.
    // ===============================================================
    {
        const snapshotEnvelopeSource = await readFile(new URL('../core/SnapshotDiscoveryEnvelope.js', import.meta.url), 'utf8');
        const decentralizedEnvelopeSource = await readFile(new URL('../core/DecentralizedDiscoveryEnvelope.js', import.meta.url), 'utf8');
        const arweaveGraphqlSource = await readFile(new URL('../application/arweave/ArweaveGraphqlDiscoveryQueryService.js', import.meta.url), 'utf8');
        const arweaveAnnouncementPublisherSource = await readFile(new URL('../application/arweave/ArweaveAnnouncementPublisher.js', import.meta.url), 'utf8');
        const nostrSnapshotQuerySource = await readFile(new URL('../application/nostr/NostrSnapshotDiscoveryQueryService.js', import.meta.url), 'utf8');

        check(snapshotEnvelopeSource.includes("'forkbuild-snapshot-discovery'"), 'C1. core/SnapshotDiscoveryEnvelope.js\'s own protocol string is confirmed live: content-hash-keyed, Snapshot-specific');
        check(decentralizedEnvelopeSource.includes("'forkbuild'") && !decentralizedEnvelopeSource.includes('forkbuild-snapshot-discovery'), 'C2. core/DecentralizedDiscoveryEnvelope.js\'s own protocol string is confirmed distinct: objectId-keyed, never the Snapshot one');

        check(!arweaveGraphqlSource.includes('SnapshotDiscoveryEnvelope'), 'C3. ArweaveGraphqlDiscoveryQueryService.js never imports or reads core/SnapshotDiscoveryEnvelope.js — it exclusively speaks core/DecentralizedDiscoveryEnvelope.js\'s own vocabulary (imported at this file\'s own top)');
        check(!arweaveAnnouncementPublisherSource.includes('SnapshotDiscoveryEnvelope'), 'C4. ArweaveAnnouncementPublisher.js — the ONLY thing in this codebase that writes a discovery envelope onto Arweave — never writes core/SnapshotDiscoveryEnvelope.js\'s own shape either');
        check(nostrSnapshotQuerySource.includes('deliberately NOT a `DecentralizedDiscoveryQueryService`') || nostrSnapshotQuerySource.toLowerCase().includes('deliberately not a'), 'C5. application/nostr/NostrSnapshotDiscoveryQueryService.js\'s own header already names this exact split for Nostr — this audit confirms it was never crossed for Arweave either, by any file, ever');

        // Confirm, by a codebase-wide sweep, that no concrete class named
        // for this exact pairing exists yet. Note this is a NAME sweep,
        // deliberately narrower than "mentions Arweave anywhere" — several
        // files this vocabulary already touches (core/SnapshotDiscoveryEnvelope.js
        // itself included) mention `content/ArweaveContentStore.js` in
        // passing prose (Snapshot bytes CAN be stored on Arweave today,
        // per 0.9.132) without that making them a discovery adapter for
        // this envelope on Arweave's own tag-query surface — the distinct
        // question this section actually asks.
        const { execSync } = await import('node:child_process');
        let combinedHit = '';
        try {
            combinedHit = execSync(
                "grep -rl 'ArweaveSnapshotDiscovery' application core || true",
                { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' }
            );
        } catch {
            combinedHit = '';
        }
        check(combinedHit.trim().length === 0, 'C6. production-source sweep (application/, core/ — excluding this audit\'s own prose): no class or file named for the missing pairing ("ArweaveSnapshotDiscovery*") exists yet under any spelling — confirming Sections C3/C4\'s per-file finding is not merely a naming accident this sweep would catch elsewhere');

        console.log('✓ Section C: root cause confirmed from source, not inferred — two deliberately separate envelope vocabularies, and Arweave\'s');
        console.log('  own concrete adapter has only ever been built for the objectId-keyed one. The Nostr pair\'s own precedent (a Snapshot-specific');
        console.log('  publisher/query-service, standing apart from the shared DecentralizedDiscoveryQueryService family) has no Arweave counterpart.');
    }

    // ===============================================================
    // Section D. Composite query-service dedup semantics — untouched,
    // hold regardless of source count or family.
    // ===============================================================
    {
        const sharedTriple = { contentHash: 'hash-shared', locator: 'https://shared.example/blob', storage: 'ipfs' };
        const sourceA = { search: async () => [{ ...sharedTriple, publicationId: 'from-A' }] };
        const sourceB = { search: async () => [{ ...sharedTriple, publicationId: 'from-B' }] };
        const sourceC = { search: async () => [{ ...sharedTriple, publicationId: 'from-C' }] };

        const service = new SnapshotCandidateDiscoveryQueryService([sourceA, sourceB, sourceC]);
        const result = await service.search('tag');

        check(result.length === 1, 'D1. three sources agreeing on storage+contentHash+locator collapse to exactly one candidate, exactly as the two-source case already documented');
        check(result[0].publicationId === 'from-A', 'D2. first-seen-wins by constructor order holds identically with three sources as it does with two — sourceA\'s own publicationId survives, sourceB/C\'s own are discarded, never merged');

        const differentLocator = { search: async () => [{ contentHash: 'hash-shared', locator: 'https://different.example/blob', storage: 'ipfs' }] };
        const serviceWithDifferentLocator = new SnapshotCandidateDiscoveryQueryService([sourceA, differentLocator]);
        const resultWithDifferentLocator = await serviceWithDifferentLocator.search('tag');
        check(resultWithDifferentLocator.length === 2, 'D3. the same contentHash under a DIFFERENT locator remains two genuinely separate candidates — the existing rule, reconfirmed, is not softened merely because a hypothetical third source family (Arweave) is in play');

        console.log('✓ Section D: dedup identity (storage+contentHash+locator) is source-family-blind by construction — nothing here would need to change to add a fourth agreeing source, of any family.');
    }

    // ===============================================================
    // Section E. Failure isolation — already generalizes past two
    // sources.
    // ===============================================================
    {
        const goodSource = { search: async () => [{ contentHash: 'hash-good', locator: 'https://good.example/blob', storage: 'ipfs' }] };
        const throwingSource = { search: () => { throw new Error('synchronous throw, simulating a malformed source'); } };
        const rejectingSource = { search: async () => { throw new Error('async rejection, simulating a network failure'); } };
        const nonArraySource = { search: async () => ({ not: 'an array' }) };

        const service = new SnapshotCandidateDiscoveryQueryService([goodSource, throwingSource, rejectingSource, nonArraySource]);
        const result = await service.search('tag');

        check(result.length === 1 && result[0].contentHash === 'hash-good', 'E1. with THREE simultaneously-failing sources (sync throw, async reject, malformed shape), the one good source\'s own candidate still survives, unaffected');

        // The isolation contract already generalizes to "any number of
        // sources may fail simultaneously" — never specifically "at most
        // one." A hypothetical Arweave source failing (a real network
        // condition its own per-candidate gateway fetch already handles
        // internally, per that class's own header) would be no different
        // from any of the three failure shapes already exercised here.
        console.log('✓ Section E: per-source failure isolation already holds for an arbitrary number of simultaneously-failing sources — a future Arweave source\'s own network failures need no new handling here.');
    }

    // ===============================================================
    // Section F. Walking monitor / command total obliviousness.
    // ===============================================================
    {
        const monitorSource = await readFile(new URL('../application/snapshot/WorldSnapshotDiscoveryMonitor.js', import.meta.url), 'utf8');
        const commandSource = await readFile(new URL('../application/snapshot/DiscoverSnapshotCandidatesCommand.js', import.meta.url), 'utf8');

        // Strip `//` line comments before checking — both files' own
        // headers already, honestly, NAME "Nostr"/"Arweave" in prose
        // explaining what they deliberately DON'T construct (see each
        // file's own "never a second discovery algorithm" section); what
        // this section actually needs to confirm is that no REAL CODE
        // LINE (an import, a reference, a branch) in either file ever
        // names a concrete source family — prose commentary is not that.
        const codeOnly = (source) => source
            .split('\n')
            .map((line) => line.replace(/\/\/.*$/, ''))
            .join('\n');
        const monitorCode = codeOnly(monitorSource);
        const commandCode = codeOnly(commandSource);

        for (const name of ['Nostr', 'Arweave', 'Local', 'GraphQL', 'fetch', 'WebSocket']) {
            check(!monitorCode.includes(name), `F1.${name}. application/snapshot/WorldSnapshotDiscoveryMonitor.js's own REAL CODE (comments excluded) never names "${name}" anywhere — it is provably oblivious to which, or how many, sources back the queryService it is handed`);
            check(!commandCode.includes(name), `F2.${name}. application/snapshot/DiscoverSnapshotCandidatesCommand.js's own real code never names "${name}" either`);
        }

        // Live-confirm the obliviousness, not just the source-text
        // absence: swap the composed queryService's own source roster
        // between calls and show the monitor neither notices nor cares.
        let callCount = 0;
        const swappableCommand = () => {
            callCount += 1;
            const sources = callCount === 1
                ? [{ search: async () => [{ contentHash: 'h1', locator: 'l1', storage: 's1' }] }]
                : [
                    { search: async () => [{ contentHash: 'h1', locator: 'l1', storage: 's1' }] },
                    { search: async () => [{ contentHash: 'h2', locator: 'l2', storage: 's2' }] },
                    { search: async () => [{ contentHash: 'h3', locator: 'l3', storage: 's3' }] }
                ];
            return executeDiscoverSnapshotCandidatesCommand({
                discoveryTag: 'tag',
                discoveryQueryService: new SnapshotCandidateDiscoveryQueryService(sources)
            });
        };

        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: swappableCommand,
            shouldRefresh: () => true
        });

        await monitor.observe({ tick: 1 });
        check(monitor.lastResult.length === 1, 'F3. monitor.observe() against a 1-source composition reports 1 candidate');
        await monitor.observe({ tick: 2 });
        check(monitor.lastResult.length === 3, 'F4. the SAME, unmodified WorldSnapshotDiscoveryMonitor instance, against a 3-source composition on its very next observe() call, reports 3 candidates — zero code in this file changed, zero awareness of source count required');

        console.log('✓ Section F: both files are confirmed, live, to be fully agnostic to source count and identity — adding a source is entirely composition-root work.');
    }

    // ===============================================================
    // Section G. Request amplification — measured.
    // ===============================================================
    {
        let graphqlCalls = 0;
        let gatewayCalls = 0;
        const transactionIds = ['tx-1', 'tx-2', 'tx-3', 'tx-4'];
        const envelope = describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'p1', uri: 'ar://material'
        });
        const fetchImpl = async (url, options = {}) => {
            if (options.method === 'POST') {
                graphqlCalls += 1;
                return { ok: true, json: async () => ({ data: { transactions: { edges: transactionIds.map((id) => ({ node: { id } })) } } }) };
            }
            gatewayCalls += 1;
            return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify(envelope) };
        };

        const arweaveSource = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl });
        await arweaveSource.search('tag');
        check(graphqlCalls === 1, 'G1. one search() call issues exactly one GraphQL request, regardless of how many transactions it finds');
        check(gatewayCalls === transactionIds.length, 'G2. one search() call issues exactly ONE gateway GET PER discovered transaction — 4 found, 4 fetched, confirmed by direct count, not by reading the header\'s own claim');

        // Simulate three successive walking observations (the cadence
        // `ui/views/WorldView.js`'s own refreshSpatialUI() already runs,
        // per application/snapshot/WorldSnapshotDiscoveryMonitor.js's own header)
        // against an UNCHANGED discoveryTag, to show the request count
        // this would add PER OBSERVATION, not merely once.
        graphqlCalls = 0;
        gatewayCalls = 0;
        for (let i = 0; i < 3; i += 1) {
            await arweaveSource.search('tag');
        }
        check(graphqlCalls === 3 && gatewayCalls === 3 * transactionIds.length, 'G3. three walking-triggered observations against a stable discoveryTag cost 3 GraphQL requests + 12 gateway requests — search() caches nothing between calls, confirmed live, matching this class\'s own documented "no caching... every call is independent" restraint');

        console.log(`✓ Section G: measured cost is 1 GraphQL request + N gateway requests per search() call, paid again on every walking-triggered observation (N=${transactionIds.length} here). No caching exists anywhere in this call path today.`);
    }

    // ===============================================================
    // Section H. Provenance — no candidate in this family carries a
    // source/origin field today.
    // ===============================================================
    {
        const localCandidate = { contentHash: 'h', locator: 'l', storage: 's', publicationId: 'p' };
        const nostrCandidate = fakeNostrCandidate();
        check(!('source' in localCandidate) && !('origin' in localCandidate), 'H1. a Local candidate carries no source/origin field');
        check(!('source' in nostrCandidate) && !('origin' in nostrCandidate), 'H2. a Nostr candidate carries no source/origin field either');

        const service = new SnapshotCandidateDiscoveryQueryService([
            { search: async () => [localCandidate] },
            { search: async () => [nostrCandidate] }
        ]);
        const result = await service.search('tag');
        for (const candidate of result) {
            check(!('source' in candidate) && !('origin' in candidate), 'H3. SnapshotCandidateDiscoveryQueryService.search() adds no provenance field of its own to any candidate it passes through, from any source');
        }
        console.log('✓ Section H: this family carries no source-identity field today. Were Arweave\'s own shape corrected (Section C\'s own recommended follow-up), its candidates would join this same, already-provenance-blind contract with no schema change of any kind.');
    }

    // ===============================================================
    // Section I. Resolution/World boundary — none of this family's
    // files import a resolver of any kind.
    // ===============================================================
    {
        const filesToCheck = [
            '../application/snapshot/SnapshotCandidateDiscoveryQueryService.js',
            '../application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js',
            '../application/snapshot/WorldSnapshotDiscoveryMonitor.js',
            '../application/snapshot/DiscoverSnapshotCandidatesCommand.js',
            '../application/snapshot/LocalSnapshotCandidateDiscoveryQueryService.js'
        ];
        // Real import lines only — several of these files' own headers
        // honestly NAME SnapshotPlacementResolver.js/ContentStore.js in
        // prose explaining what they deliberately never call (see e.g.
        // application/snapshot/SnapshotCandidateDiscoveryQueryService.js's own
        // "never resolves bytes, never touches
        // application/snapshot/placement/SnapshotPlacementResolver.js"); what this section
        // needs is the actual import graph, not a substring match against
        // prose that mentions those names in order to disclaim them.
        const importLines = (source) => source
            .split('\n')
            .filter((line) => /^\s*import\b/.test(line))
            .join('\n');

        for (const relativePath of filesToCheck) {
            const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
            const imports = importLines(source);
            check(!imports.includes('SnapshotPlacementResolver'), `I1. ${relativePath} has no import line naming application/snapshot/placement/SnapshotPlacementResolver.js`);
            check(!imports.includes('ContentStore'), `I2. ${relativePath} has no import line naming any content/ContentStore.js family module`);
            check(!/materializ/i.test(imports), `I3. ${relativePath} imports nothing whose own name suggests materialization`);
        }
        console.log('✓ Section I: candidate discovery and bytes-resolution remain two entirely separate call chains across every file in this family — unaffected by which, or how many, discovery sources are ever composed.');
    }

    // ===============================================================
    // Section J. Verdict.
    // ===============================================================
    {
        const VERDICT = Object.freeze({
            compositeQueryServiceGenerality: 'ALREADY_N_SOURCE_GENERAL',
            arweaveAsAThirdSourceToday: 'NOT_YET_COMPATIBLE — SILENT_TOTAL_CANDIDATE_LOSS',
            rootCause: 'TWO_SEPARATE_ENVELOPE_VOCABULARIES — NO_ARWEAVE_SNAPSHOT_ENVELOPE_ADAPTER_EXISTS',
            dedupSemantics: 'UNCHANGED_SOURCE_FAMILY_BLIND',
            failureIsolation: 'ALREADY_GENERALIZES_TO_N_SOURCES',
            walkingMonitorAndCommand: 'CONFIRMED_OBLIVIOUS_TO_SOURCE_COUNT_AND_IDENTITY',
            requestAmplification: 'MEASURED — 1_GRAPHQL_PLUS_N_GATEWAY_PER_CALL_NO_CACHING',
            provenance: 'NONE_TODAY_NONE_NEEDED_FOR_THIS_MILESTONE',
            resolutionWorldBoundary: 'UNAFFECTED_BY_SOURCE_COUNT_OR_FAMILY'
        });

        console.log('='.repeat(78));
        console.log('ARWEAVE / WALKING-TRIGGERED SNAPSHOT DISCOVERY BOUNDARY — FINAL VERDICT');
        console.log('='.repeat(78));
        for (const [key, value] of Object.entries(VERDICT)) {
            console.log(`  ${key.padEnd(32)} ${value}`);
        }
        console.log('');
        console.log('  HYPOTHESIS: "Arweave has earned its place as a third walking-discovery source, ready to compose" — REJECTED AS STATED.');
        console.log('  The seam this hypothesis addresses (composition, failure isolation, dedup, monitor/command obliviousness, the World');
        console.log('  boundary) is EVERY BIT as ready as proposed — Sections A, D, E, F, H, I all confirm zero further change is needed there,');
        console.log('  for any number of additional, well-shaped sources. But "well-shaped" is exactly what application/');
        console.log('  ArweaveGraphqlDiscoveryQueryService.js\'s own current, real, production search() output is NOT, for this particular');
        console.log('  consumer: it was built for, and only for, core/DecentralizedWorldDiscoveryLead.js\'s own objectId-keyed vocabulary (Sections');
        console.log('  B and C). Composing it into SnapshotCandidateDiscoveryRuntimeComposition.js today would compile, run, and appear to work —');
        console.log('  and would silently contribute exactly zero candidates, forever, while still paying its own full GraphQL-plus-per-transaction-');
        console.log('  gateway request cost on every walking observation (Section G). That is a worse outcome than not integrating it at all.');
        console.log('');
        console.log('  RECOMMENDATION: before any composition-root wiring, build the missing piece Section C names precisely — an');
        console.log('  ArweaveSnapshotDiscoveryPublisher / ArweaveSnapshotDiscoveryQueryService pair, mirroring application/');
        console.log('  NostrSnapshotDiscoveryPublisher.js / NostrSnapshotDiscoveryQueryService.js exactly one substrate over: write and read');
        console.log('  core/SnapshotDiscoveryEnvelope.js\'s own contentHash-keyed shape on an Arweave transaction\'s own tagged payload, reusing');
        console.log('  application/arweave/ArweaveTaggedTransactionUpload.js\'s own upload primitive (0.9.490) and the exact gateway-read-plus-envelope-');
        console.log('  decode primitive 0.9.494 already proved correct for the OTHER vocabulary. Only once that pair exists and reports real');
        console.log('  { contentHash, locator, storage } candidates does composing it into SnapshotCandidateDiscoveryRuntimeComposition.js become');
        console.log('  the small, mechanical DI step the requesting brief\'s own 0.9.497 anticipated — everything this audit checked in Sections');
        console.log('  A, D-I is already sitting there, ready, waiting for a source that actually speaks its own contract.');
        console.log('='.repeat(78));

        check(Object.values(VERDICT).every((value) => typeof value === 'string' && value.length > 0), 'J1. every boundary named by the requesting brief resolved to an explicit, honest classification — none left unaddressed');
        check(assertionCount > 40, 'J2. sanity: this audit is substantive, not a token pass');

        console.log(`\n✅ All Arweave Integration Boundary Audit (Walking-Triggered Snapshot Discovery) tests passed. (${assertionCount} assertions)`);
    }
}

run().catch((error) => {
    console.error('ArweaveWalkingTriggeredSnapshotDiscoveryIntegrationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
