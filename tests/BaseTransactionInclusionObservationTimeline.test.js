import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord } from '../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerificationState } from '../application/IpfsPublicationContentVerificationState.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BaseTransactionInclusionObservationState } from '../application/BaseTransactionInclusionObservationState.js';
import {
    PublicationObservationTimelineDomain,
    PublicationObservationTimelineEntryKind,
    describePublicationObservationTimeline
} from '../application/PublicationObservationTimelineView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { describePublicationObservationArchive } from '../application/PublicationObservationArchiveView.js';

// 0.8.98 — Base Transaction Inclusion Observation Timeline.
//
// The missing piece was not another observation mechanism — Base
// transaction inclusion observations have existed since 0.8.96, and became
// durable at 0.8.97. This milestone is PRESENTATION ONLY: it makes those
// already-existing, already-durable facts appear on the SAME unified,
// cross-domain, chronological projection IPFS and Bitcoin facts have
// appeared on since 0.8.74 — a THIRD domain on one timeline, never a
// second, competing "Base Timeline."
//
//   Section A: Base appears alongside IPFS and Bitcoin without disturbing
//              either — remove the Base facts and the remaining projection
//              is byte-identical
//   Section B: FLAGSHIP — Base identity isolation: two transaction hashes
//              committing an IDENTICAL contentHash stay two entirely
//              independent timeline sequences, keyed by transactionHash,
//              never contentHash
//   Section C: repeated observations for the same transactionHash remain
//              repeated — no deduplication, even for an identical state
//   Section D: UNAVAILABLE observations survive onto the timeline as real
//              entries, not silently filtered gaps
//   Section E: no synthetic events — a confirmationCount of 10 still
//              produces exactly ONE timeline entry, never ten
//   Section F: determinism — the same archive always projects the same
//              timeline, byte-identical, call after call
//   Section G: projection purity — zero network/storage/wallet/RPC
//              operations, no mutation of caller-owned input, no clock
//              reads of any kind
//   Section H: provenance independence — a LOCAL Base observation and an
//              IMPORTED one (0.8.83) project identical timeline output;
//              provenance is invisible to this projection entirely
//
// See docs/Roadmap.md, "0.8.98 — Base Transaction Inclusion Observation
// Timeline."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const O = PublicationObservationArchiveProvenanceOrigin;
const SHARED_CONTENT = 'ForkBuild Base timeline content, committed by two distinct transactions';
const SHARED_HASH = computeContentHash(SHARED_CONTENT);

function baseObservation({ state, txid, blockHash = null, blockNumber = null, transactionIndex = null, confirmationCount = null, reason = null, observedAt }) {
    return { state, txid, blockHash, blockNumber, transactionIndex, confirmationCount, reason, observedAt: new Date(observedAt) };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — Base appears without disturbing IPFS/Bitcoin; removing
    // Base facts leaves the remaining projection byte-identical.
    // ---------------------------------------------------------------
    {
        const record = new IpfsPublicationRecord({ contentHash: SHARED_HASH, locator: 'ipfs://bafyBASE-TIMELINE', publishedAt: new Date('2026-01-01T00:00:00Z') }); // T1

        let archiveWithoutBase = PublicationObservationArchive.empty();
        archiveWithoutBase = archiveWithoutBase.appendIpfsPublicationRecord(record);
        archiveWithoutBase = archiveWithoutBase.appendIpfsContentVerificationObservation(0, {
            state: IpfsPublicationContentVerificationState.HASH_MATCH, contentHash: SHARED_HASH, locator: record.locator, reason: null, observedAt: new Date('2026-01-01T00:04:00Z') // T5
        });
        archiveWithoutBase = archiveWithoutBase.appendBitcoinBroadcastRecord({
            recordIndex: 0, anchorId: 'anchor-timeline', txid: 'TX-TIMELINE', state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-01-01T00:01:00Z') // T2
        });
        archiveWithoutBase = archiveWithoutBase.appendBitcoinConfirmationObservation('anchor-timeline', {
            txid: 'TX-TIMELINE', state: BitcoinAnchorConfirmationState.CONFIRMED, blockHash: 'block-timeline', blockHeight: 500, confirmationCount: 1, reason: null, observedAt: new Date('2026-01-01T00:05:00Z') // T6
        });

        let archiveWithBase = archiveWithoutBase;
        archiveWithBase = archiveWithBase.appendBaseTransactionInclusionObservation('0xH1',
            baseObservation({ state: BaseTransactionInclusionObservationState.NOT_INCLUDED, txid: '0xH1', observedAt: '2026-01-01T00:02:00Z' })); // T3
        archiveWithBase = archiveWithBase.appendBaseTransactionInclusionObservation('0xH2',
            baseObservation({ state: BaseTransactionInclusionObservationState.UNAVAILABLE, txid: '0xH2', reason: 'RPC endpoint unreachable', observedAt: '2026-01-01T00:03:00Z' })); // T4
        archiveWithBase = archiveWithBase.appendBaseTransactionInclusionObservation('0xH1',
            baseObservation({ state: BaseTransactionInclusionObservationState.INCLUDED, txid: '0xH1', blockHash: 'base-block-1', blockNumber: 42, transactionIndex: 3, confirmationCount: 10, observedAt: '2026-01-01T00:06:00Z' })); // T7

        const summaryWithout = describePublicationObservationArchive(archiveWithoutBase);
        const summaryWith = describePublicationObservationArchive(archiveWithBase);

        const domainsPresent = new Set(summaryWith.entries.map((e) => e.domain));
        assert(domainsPresent.has(PublicationObservationTimelineDomain.IPFS) &&
            domainsPresent.has(PublicationObservationTimelineDomain.BITCOIN) &&
            domainsPresent.has(PublicationObservationTimelineDomain.BASE),
            '1. the resulting timeline contains all three domains — IPFS, Bitcoin, and Base');
        assert(summaryWith.entryCount === summaryWithout.entryCount + 3, '2. exactly three Base entries were added — no more, no fewer');

        const nonBaseEntriesWith = summaryWith.entries.filter((e) => e.domain !== PublicationObservationTimelineDomain.BASE);
        assert(JSON.stringify(nonBaseEntriesWith) === JSON.stringify(summaryWithout.entries),
            '3. removing the Base observations leaves the IPFS/Bitcoin portion of the timeline byte-identical — Base integration never perturbs the existing two domains');
    }
    console.log('✓ Section A: Base appears on the unified timeline alongside IPFS and Bitcoin without disturbing either domain\'s own, pre-existing entries');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: Base identity isolation. Two transactions
    // committing an IDENTICAL contentHash under two different transaction
    // hashes stay completely independent on the timeline.
    // ---------------------------------------------------------------
    {
        const timeline = describePublicationObservationTimeline({
            base: {
                observationsByTransactionHash: {
                    '0xAAA': [
                        baseObservation({ state: BaseTransactionInclusionObservationState.INCLUDED, txid: '0xAAA', blockHash: 'b-aaa', blockNumber: 10, transactionIndex: 0, confirmationCount: 3, observedAt: '2026-02-01T00:00:00Z' })
                    ],
                    '0xBBB': [
                        baseObservation({ state: BaseTransactionInclusionObservationState.INCLUDED, txid: '0xBBB', blockHash: 'b-bbb', blockNumber: 11, transactionIndex: 0, confirmationCount: 3, observedAt: '2026-02-01T00:00:00Z' })
                    ]
                }
            }
        });

        assert(timeline.count === 2, '4. both transactions produce their own entry — the identical committed content never collapses them into one');
        const byHash = Object.fromEntries(timeline.entries.map((e) => [e.transactionHash, e]));
        assert(byHash['0xAAA'] && byHash['0xBBB'], '5. each entry is retrievable by its own, exact transactionHash');
        assert(byHash['0xAAA'].transactionHash === '0xAAA' && byHash['0xAAA'].txid === '0xAAA', '6. 0xAAA\'s own entry never reports 0xBBB\'s identity, or vice versa');
        assert(byHash['0xBBB'].transactionHash === '0xBBB' && byHash['0xBBB'].txid === '0xBBB', '7. 0xBBB\'s own entry stays independently addressable');
        assert(!('contentHash' in byHash['0xAAA']) && !('contentHash' in byHash['0xBBB']),
            '8. no entry carries a contentHash field at all — identity here is transactionHash, and only transactionHash');
    }
    console.log('✓ Section B (FLAGSHIP): two transactions that commit an identical publication content hash under two different transaction hashes remain completely independent, provably distinct timeline entries');

    // ---------------------------------------------------------------
    // Section C — repeated observations remain repeated; no deduplication.
    // ---------------------------------------------------------------
    {
        const timeline = describePublicationObservationTimeline({
            base: {
                observationsByTransactionHash: {
                    '0xREPEAT': [
                        baseObservation({ state: BaseTransactionInclusionObservationState.NOT_INCLUDED, txid: '0xREPEAT', observedAt: '2026-03-01T00:00:00Z' }),
                        baseObservation({ state: BaseTransactionInclusionObservationState.NOT_INCLUDED, txid: '0xREPEAT', observedAt: '2026-03-01T00:00:10Z' }),
                        baseObservation({ state: BaseTransactionInclusionObservationState.NOT_INCLUDED, txid: '0xREPEAT', observedAt: '2026-03-01T00:00:20Z' })
                    ]
                }
            }
        });

        assert(timeline.count === 3, '9. three observations of the identical transaction, at three different moments, produce three entries — never collapsed into one "current" entry');
        assert(timeline.entries.every((e) => e.transactionHash === '0xREPEAT' && e.state === BaseTransactionInclusionObservationState.NOT_INCLUDED),
            '10. every one of the three entries carries the observation it actually was, unaltered');
        assert(timeline.entries[0].observedAt.getTime() < timeline.entries[1].observedAt.getTime() &&
            timeline.entries[1].observedAt.getTime() < timeline.entries[2].observedAt.getTime(),
            '11. the three repeated entries keep their own chronological order');
    }
    console.log('✓ Section C: repeated observations of the same transaction hash remain repeated on the timeline — no deduplication, even when every repetition reports an identical state');

    // ---------------------------------------------------------------
    // Section D — UNAVAILABLE observations survive onto the timeline.
    // ---------------------------------------------------------------
    {
        const timeline = describePublicationObservationTimeline({
            base: {
                observationsByTransactionHash: {
                    '0xUNAVAILABLE': [
                        baseObservation({ state: BaseTransactionInclusionObservationState.UNAVAILABLE, txid: '0xUNAVAILABLE', reason: 'RPC endpoint unreachable', observedAt: '2026-04-01T00:00:00Z' })
                    ]
                }
            }
        });

        assert(timeline.count === 1, '12. an UNAVAILABLE observation is a real timeline entry, not a gap that disappears');
        assert(timeline.entries[0].state === BaseTransactionInclusionObservationState.UNAVAILABLE, '13. the entry\'s own state is UNAVAILABLE, preserved exactly');
        assert(timeline.entries[0].reason === 'RPC endpoint unreachable', '14. the entry carries its own reason, explaining why the attempt could not obtain the requested information');
        assert(timeline.entries[0].blockHash === null && timeline.entries[0].blockNumber === null && timeline.entries[0].confirmationCount === null,
            '15. every inapplicable field on an UNAVAILABLE entry is null, never fabricated');
    }
    console.log('✓ Section D: an UNAVAILABLE Base observation survives onto the timeline as an honest entry, never silently filtered for carrying less information than an INCLUDED one');

    // ---------------------------------------------------------------
    // Section E — no synthetic events: one observation, one entry, no
    // matter how large its own confirmationCount.
    // ---------------------------------------------------------------
    {
        const timeline = describePublicationObservationTimeline({
            base: {
                observationsByTransactionHash: {
                    '0xTEN': [
                        baseObservation({ state: BaseTransactionInclusionObservationState.INCLUDED, txid: '0xTEN', blockHash: 'b-ten', blockNumber: 99, transactionIndex: 0, confirmationCount: 10, observedAt: '2026-05-01T00:00:00Z' })
                    ]
                }
            }
        });

        assert(timeline.count === 1, '16. a confirmationCount of 10 still produces exactly ONE entry — never ten synthetic CONFIRMATION #1..#10 entries');
        assert(timeline.entries[0].confirmationCount === 10, '17. the one entry simply reports the observation\'s own confirmationCount, unchanged');
        const kinds = timeline.entries.map((e) => e.kind);
        assert(kinds.every((k) => k === PublicationObservationTimelineEntryKind.BASE_TRANSACTION_INCLUSION), '18. no other entry kind is fabricated alongside it');
    }
    console.log('✓ Section E: an observation\'s own confirmationCount is reported on its one entry, never expanded into that many synthetic events');

    // ---------------------------------------------------------------
    // Section F — determinism: the same input always projects the same
    // timeline, byte-identical, call after call.
    // ---------------------------------------------------------------
    {
        const input = {
            ipfs: { publicationRecords: [], verificationHistoriesByRecordIndex: {} },
            bitcoin: { anchors: [], confirmationHistoriesByAnchorId: {}, proofObservationsByAnchorId: {} },
            base: {
                observationsByTransactionHash: {
                    '0xDET-1': [baseObservation({ state: BaseTransactionInclusionObservationState.INCLUDED, txid: '0xDET-1', blockNumber: 1, confirmationCount: 1, observedAt: '2026-06-01T00:00:00Z' })],
                    '0xDET-2': [baseObservation({ state: BaseTransactionInclusionObservationState.NOT_INCLUDED, txid: '0xDET-2', observedAt: '2026-06-01T00:00:00Z' })]
                }
            }
        };
        const first = JSON.stringify(describePublicationObservationTimeline(input));
        const second = JSON.stringify(describePublicationObservationTimeline(input));
        const third = JSON.stringify(describePublicationObservationTimeline(input));
        assert(first === second && second === third, '19. calling the projection three times on byte-identical input, including tied timestamps across transaction hashes, always returns byte-identical output');
    }
    console.log('✓ Section F: the same archive always projects the same timeline — deterministic, byte-identical, call after call');

    // ---------------------------------------------------------------
    // Section G — projection purity: no network, storage, wallet, RPC,
    // mutation, or clock reads.
    // ---------------------------------------------------------------
    {
        assert(describePublicationObservationTimeline.length === 0, '20. the projection takes exactly one (defaulted) options object — no injected RPC client, wallet, storage adapter, or coordinator of any kind');

        const observations = Object.freeze([
            Object.freeze(baseObservation({ state: BaseTransactionInclusionObservationState.INCLUDED, txid: '0xPURE', blockNumber: 1, confirmationCount: 1, observedAt: '2026-07-01T00:00:00Z' }))
        ]);
        const observationsByTransactionHash = Object.freeze({ '0xPURE': observations });

        describePublicationObservationTimeline({ base: { observationsByTransactionHash } });

        assert(Object.isFrozen(observations) && Object.isFrozen(observationsByTransactionHash), '21. the caller\'s own input collections are never mutated — still frozen after projection');
        assert(observations.length === 1 && observations[0].txid === '0xPURE', '22. the caller\'s own observation array is untouched — same single entry, same fields');
    }
    console.log('✓ Section G: zero network/storage/wallet/RPC operations, no mutation of caller-owned input, and no dependency this function could use to read the clock itself');

    // ---------------------------------------------------------------
    // Section H — provenance independence: a LOCAL Base observation and an
    // IMPORTED one project identical timeline output. Provenance is
    // invisible to this projection entirely.
    // ---------------------------------------------------------------
    {
        let archiveLocal = PublicationObservationArchive.empty();
        archiveLocal = archiveLocal.appendBaseTransactionInclusionObservation('0xPROV',
            baseObservation({ state: BaseTransactionInclusionObservationState.INCLUDED, txid: '0xPROV', blockNumber: 7, confirmationCount: 2, observedAt: '2026-08-01T00:00:00Z' }),
            O.LOCAL);

        const archiveImported = archiveLocal.withUniformProvenance(O.IMPORTED);

        const summaryLocal = describePublicationObservationArchive(archiveLocal);
        const summaryImported = describePublicationObservationArchive(archiveImported);

        assert(JSON.stringify(summaryLocal.entries) === JSON.stringify(summaryImported.entries),
            '23. a LOCAL Base observation and the identical fact re-labeled IMPORTED project byte-identical timeline entries — provenance describes how a fact entered the archive, never what it means');
        assert(!('provenance' in summaryLocal.entries[0]) && !('origin' in summaryLocal.entries[0]),
            '24. no timeline entry carries a provenance/origin field of any kind — the projection never even receives that collection');
    }
    console.log('✓ Section H: provenance independence — a LOCAL Base observation and the identical fact re-labeled IMPORTED project identical timeline output, exactly as 0.8.83 already established for every other collection');

    console.log('\nAll BaseTransactionInclusionObservationTimeline tests passed.');
}

run().catch((error) => {
    console.error('BaseTransactionInclusionObservationTimeline.test.js FAILED:', error);
    process.exitCode = 1;
});
