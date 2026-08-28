import { BaseAnchorPublicationRecord } from './BaseAnchorPublicationRecord.js';
import { describeBaseAnchorPublicationObservations } from './BaseAnchorPublicationObservation.js';
import { describeBaseTransactionInclusionObservationHistory } from './BaseTransactionInclusionObservationView.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { findBaseAnchorPublicationRecordByTxid } from './BaseAnchorPublicationRecordHistory.js';

// 0.8.101 — Base Anchor Publication Lifecycle Timeline.
//
// application/BaseAnchorPublicationRecord.js (0.8.99) gives this replica a
// durable IDENTITY for one Base publication attempt. application/
// BaseAnchorPublicationObservation.js (0.8.100) already correlates that
// identity, by its own explicit `txid`, to every inclusion observation
// this replica has recorded FOR IT. Neither one answers the plain
// question a person asking "what happened to THIS publication, and in
// what order?" actually has. This file is that one, single, chronological
// read — scoped to exactly ONE Base publication record, from its own
// creation onward — mirroring application/
// BitcoinAnchorPublicationLifecycleTimelineView.js (0.8.81) exactly, one
// chain over:
//
//   BaseAnchorPublicationRecord (0.8.99, identity)
//        │
//        │  createdAt
//        ▼
//   Publication record created
//        │
//        └──► inclusionObservations   (application/
//                                       BaseAnchorPublicationObservation.js,
//                                       0.8.100, itself reading application/
//                                       BaseTransactionInclusionObservationHistory.js,
//                                       0.8.96/0.8.97)
//                    │
//                    ▼ describeBaseAnchorPublicationLifecycleTimeline()
//        one, chronologically sorted array of timeline entries
//
// A LIFECYCLE TIMELINE PRESENTS RECORDED FACTS IN TEMPORAL ORDER; IT DOES
// NOT INFER MISSING STAGES OR INTERPRET THEM — the identical restraint
// application/BitcoinAnchorPublicationLifecycleTimelineView.js's own
// header already holds, held here again. A publication with no inclusion
// observation contributes no inclusion-observation entry — never a
// fabricated "Inclusion missing" row standing in for the absence.
//
// ONLY TWO ENTRY KINDS — PUBLICATION AND INCLUSION_OBSERVATION — A
// DELIBERATE DIFFERENCE FROM BITCOIN'S SIX, NOT AN OVERSIGHT OR AN
// OMISSION TO FILL IN LATER. Bitcoin's own lifecycle timeline presents
// broadcast, confirmation, content-proof, chain-placement, and consistency
// entries because every one of those is backed by its OWN durable archive
// collection (`bitcoinBroadcastRecords`, `bitcoinConfirmationObservationsByAnchorId`,
// `bitcoinContentProofObservationsByAnchorId`, both derived from the
// latter). Base has never made a broadcast fact durable — `application/
// BaseTransactionBroadcastCoordinator.js`'s own outcome (0.8.95) is
// consumed once, by a page's own ephemeral session state, and
// `application/PublicationObservationArchive.js` (0.8.97/0.8.99/0.8.100's
// own headers) has never grown a `baseBroadcastRecords` collection to
// persist it into. THIS FILE INTRODUCES NO SUCH COLLECTION EITHER — "No
// new factual records would be created" is this milestone's own
// constraint, and a timeline is a projection over what is ALREADY durable,
// never a reason to durably record something new. A stage this codebase
// has never made durable simply has no fact for a timeline to present —
// this is the SAME "absence is simply absence" restraint applied one
// layer further back: not merely "no broadcast observation was recorded
// for this publication," but "this domain has never recorded a broadcast
// observation as a durable fact at all." Should a future milestone give
// Base's own broadcast outcome the identical durable treatment
// `bitcoinBroadcastRecords` already has, this file's own BROADCAST entry
// could be added the exact same way Bitcoin's already was — but that is
// deliberately out of scope here.
//
// A COMPOSITION OF ALREADY-ESTABLISHED PROJECTIONS, NEVER A NEW SOURCE OF
// TRUTH. `describeBaseAnchorPublicationLifecycleTimeline()` invents no new
// observation, state, or label of its own. It calls application/
// BaseAnchorPublicationObservation.js#describeBaseAnchorPublicationObservations()
// (0.8.100) — UNCHANGED, the identical correlation call a caller would
// make anyway — and application/BaseTransactionInclusionObservationView.js#
// describeBaseTransactionInclusionObservationHistory() (0.8.96) to narrate
// that projection's own observations, UNCHANGED. This file's own new work
// is exactly two things: (1) flattening the publication identity and that
// narrated observation history into one array of timeline entries, each
// carrying its own explicit `kind`, and (2) sorting that one array
// chronologically. No entry's own field differs from what the composed,
// already-described projection already stated, except for the
// `kind`/`label`/`observedAt`/1-based `index` this file adds to place it
// on a timeline.
//
// EVERY ENTRY CARRIES THE SAME txid, NEVER INFERRED FROM contentHash.
// `publicationRecord` is required and explicit; every entry this function
// returns is stamped with `publicationRecord.txid` — Base's own,
// already-established correlation key (application/
// BaseAnchorPublicationRecord.js's own header, "No `anchorId` field," and
// application/BaseAnchorPublicationObservation.js's own header, "THE
// CORRELATION KEY IS `publicationRecord.txid` — NEVER `contentHash`").
// This file performs no correlation of its own beyond delegating straight
// to `describeBaseAnchorPublicationObservations()`, which already enforces
// it — see this file's own flagship test for the concrete
// two-publications-one-contentHash proof, one layer up from 0.8.100's own.
//
// REPEATED OBSERVATIONS STAY REPEATED. If this replica observed the same
// transaction's inclusion three times, the timeline holds three
// INCLUSION_OBSERVATION entries — never collapsed because the `txid` is
// identical, and `UNAVAILABLE` observations are never dropped or filtered
// out of the presented history; a replica's own honest "could not tell"
// moment stays on the record exactly like `INCLUDED` or `NOT_INCLUDED`
// does. See this file's own flagship test.
//
// TIMELINE ENTRY IDENTITY NEVER RELIES ON A TIMESTAMP ALONE. Every
// inclusion-observation entry carries its own 1-based `index` — its own
// position within THIS publication's own, already-correlated observation
// list, assigned here since neither application/
// BaseAnchorPublicationObservation.js nor application/
// BaseTransactionInclusionObservationView.js number their own output.
// Two observations sharing an identical `observedAt` are never confused
// with each other because of it.
//
// DETERMINISTIC ORDERING, THE SAME PHILOSOPHY AS 0.8.81. Every entry is
// first built into one flat array in a fixed, reproducible source order —
// the publication record, then every inclusion observation, in its own
// already-correlated array order — and only THAT fixed-order array is
// ever sorted, with a stable sort that keeps that same relative order for
// anything tied on `observedAt`. Calling this function twice on
// byte-identical input always returns a byte-identical result.
//
// PURE AND STATELESS: NO ARCHIVE ACCESS, NO NETWORK ACCESS, NO OBSERVER,
// NO BROADCASTER, NO WALLET. `describeBaseAnchorPublicationLifecycleTimeline()`
// receives facts and projects them. `reconstructBaseAnchorPublicationLifecycleTimeline()`
// below is the ONE, thin, separate function in this file that reads an
// archive — mirroring application/
// BitcoinAnchorPublicationLifecycleTimelineView.js's own
// `reconstructBitcoinAnchorPublicationLifecycleTimeline()` exactly, one
// chain over: it only ever reads whatever `archive` it is handed, and
// performs zero network operations.
//
// NO NEW DURABLE STATE. This milestone adds nothing to application/
// PublicationObservationArchive.js. A timeline is computed fresh, every
// time, from whatever the archive's own `baseAnchorPublicationRecords`
// (0.8.99) and `baseTransactionInclusionObservationsByTransactionHash`
// (0.8.96/0.8.97) already hold — destroying and restoring the archive can
// never change a timeline this file produces from the identical
// underlying facts.
//
// NO VERDICT VOCABULARY OF ANY KIND. There is no `status`, `confidence`,
// `health`, `trusted`, `valid`, `canonical`, `reliable`, `completed`,
// `successful`, `safe`, or `final` field anywhere in this file's output —
// every label an entry carries is exactly the same factual sentence
// application/BaseAnchorPublicationRecordHistoryView.js and application/
// BaseTransactionInclusionObservationView.js already produce, unchanged.
export const BaseAnchorPublicationLifecycleTimelineEntryKind = Object.freeze({
    PUBLICATION: 'publication',
    INCLUSION_OBSERVATION: 'inclusion-observation'
});

function observedAtMillis(entry) {
    return entry.observedAt instanceof Date ? entry.observedAt.getTime() : 0;
}

function publicationEntry(publicationRecord) {
    return Object.freeze({
        kind: BaseAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION,
        observedAt: publicationRecord.createdAt,
        txid: publicationRecord.txid,
        index: null,
        label: 'Publication record created',
        contentHash: publicationRecord.contentHash,
        network: publicationRecord.network
    });
}

function inclusionObservationEntries(txid, describedObservationHistory) {
    return describedObservationHistory.observations
        .filter((entry) => entry.observedAt instanceof Date)
        .map((entry, i) => Object.freeze({
            kind: BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION,
            observedAt: entry.observedAt,
            txid,
            index: i + 1,
            label: `Inclusion observation #${i + 1}`,
            state: entry.state,
            stateLabel: entry.stateLabel,
            stateShortLabel: entry.stateShortLabel,
            blockHash: entry.blockHash,
            blockNumber: entry.blockNumber,
            transactionIndex: entry.transactionIndex,
            confirmationCount: entry.confirmationCount,
            reason: entry.reason
        }));
}

export function describeBaseAnchorPublicationLifecycleTimeline(
    publicationRecord,
    observationsByTransactionHash = {}
) {
    if (!(publicationRecord instanceof BaseAnchorPublicationRecord)) return null;

    const projection = describeBaseAnchorPublicationObservations(publicationRecord, observationsByTransactionHash);
    const describedObservationHistory = describeBaseTransactionInclusionObservationHistory(projection.observations);

    const insertionOrder = [
        publicationEntry(publicationRecord),
        ...inclusionObservationEntries(publicationRecord.txid, describedObservationHistory)
    ];

    const entries = insertionOrder
        .map((entry, sourceIndex) => ({ entry, sourceIndex }))
        .sort((a, b) => {
            const delta = observedAtMillis(a.entry) - observedAtMillis(b.entry);
            return delta !== 0 ? delta : a.sourceIndex - b.sourceIndex;
        })
        .map(({ entry }) => entry);

    return Object.freeze({ txid: publicationRecord.txid, count: entries.length, entries: Object.freeze(entries) });
}

// reconstructBaseAnchorPublicationLifecycleTimeline() — the ONE, thin
// archive-reading entry point, mirroring application/
// BitcoinAnchorPublicationLifecycleTimelineView.js#
// reconstructBitcoinAnchorPublicationLifecycleTimeline() (0.8.81) exactly,
// one chain over. It pulls one publication's own record and its own
// correlated observation collection back out of `archive` and hands them,
// unchanged, to the pure function above. Returns `null` when no
// publication record exists for `txid` — a lifecycle timeline is scoped
// to an explicit, durable identity, never to a txid this replica merely
// happens to hold Base facts for (the identical "no record, no
// inspection" restraint held here once more, one chain over from
// Bitcoin's own 0.8.80).
export function reconstructBaseAnchorPublicationLifecycleTimeline(archive, txid) {
    if (typeof txid !== 'string' || !txid) return null;
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

    const record = findBaseAnchorPublicationRecordByTxid(safeArchive.baseAnchorPublicationRecords, txid);
    if (!record) return null;

    return describeBaseAnchorPublicationLifecycleTimeline(record, safeArchive.baseTransactionInclusionObservationsByTransactionHash);
}
