import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { fingerprintPublicationObservationArchive } from './PublicationObservationArchiveFingerprint.js';

// 0.8.87 — Durable Publication Archive Difference Projection.
//
// 0.8.84 gave two archives a comparable identity; 0.8.85 let a person check
// one fingerprint against another explicitly; 0.8.86 let a person look
// inside a second archive without ever touching the first. None of the
// three ever answered the question a person actually has the moment
// 0.8.85 reports `DIFFERENT`: WHICH durable facts differ, and how? This
// file answers exactly that — and only that.
//
//   currentArchive          externalArchive
//   (0.8.75/0.8.82,         (0.8.86's own
//    already held)           inspectPublicationObservationArchive(),
//        │                   reconstructed with fromJSON() — never
//        │                   touched by this file directly)
//        │                          │
//        └────────────┬─────────────┘
//                      ▼
//     describePublicationObservationArchiveDifference()
//                      │
//                      ▼
//   { currentFingerprint, externalFingerprint, same,
//     seven collection differences (0.8.97 adds
//     baseTransactionInclusionObservationsByTransactionHash), hasFactDifference,
//     hasProvenanceDifference, importEvents }
//
// AN ARCHIVE DIFFERENCE DESCRIBES STRUCTURAL DIFFERENCES BETWEEN TWO
// DURABLE ARCHIVE STATES; IT DOES NOT DETERMINE WHICH STATE IS CORRECT —
// THE FLAGSHIP INVARIANT, restated here one more time over a PAIR of
// archives rather than one. See docs/Principles.md, "An Archive Fingerprint
// Identifies Durable Contents; It Does Not Establish Their Truth Or Origin
// (0.8.84)," "A Fingerprint Comparison Establishes Equality Of Digests, Not
// Which Archive Is Correct (0.8.85)," and "Inspecting An External Archive
// Never Touches The Current One (0.8.86)" — all three held here once more.
// This file computes no "newer," no "better," no "should replace," no
// "correct" — see this file's own exclusion list below.
//
// FACT DIFFERENCE AND PROVENANCE DIFFERENCE ARE TWO SEPARATE QUESTIONS,
// NEVER COLLAPSED INTO ONE. Two archives can hold the byte-identical fact
// at the byte-identical identity position while disagreeing only about
// WHERE that fact entered each archive (`LOCAL` vs `IMPORTED`, 0.8.83).
// That is never reported as "the fact changed" — it is reported as
// `unchanged` at the fact level and `provenanceChanged` at the provenance
// level, independently. See this file's own flagship test, and this
// file's own second flagship, "same facts, different provenance," for the
// demonstration. `archiveImportEvents` is a THIRD, entirely separate
// question — metadata about the act of importing, never durable content —
// reported under `importEvents`, outside every fact/provenance count
// above, exactly mirroring 0.8.84's own exclusion of that field from the
// fingerprint itself.
//
// REUSES `toJSON()`'S OWN CANONICAL SERIALIZATION AND 0.8.84'S OWN
// FINGERPRINT ALGORITHM — NO SECOND SCHEMA, NO SECOND HASH. Every fact and
// provenance tag this file compares is read from `PublicationObservationArchive.js`'s
// own `toJSON()` output, unchanged — the identical canonical shape 0.8.84's
// own `fingerprintPublicationObservationArchive()` hashes. `currentFingerprint`/
// `externalFingerprint` above are computed by calling that function
// directly, never a second, competing digest. In the ordinary case — two
// archives each built by this codebase's own append-only methods — an
// empty difference (no collection reports a changed/only-in-current/
// only-in-external/provenance-changed entry) coincides with a matching
// fingerprint; `same` above is nonetheless always computed directly from
// the fingerprint comparison, never derived from the collection
// differences, so it stays the authoritative byte-level answer 0.8.85
// already established, independent of anything this file computes.
//
// IDENTITY IS EXPLICIT, NEVER INFERRED FROM CONTENT. Every collection
// below is compared using the SAME identity discipline the rest of this
// codebase already holds for it:
//
//   `ipfsPublicationRecords` / `bitcoinBroadcastRecords` /
//   `bitcoinAnchorPublicationRecords` — array POSITION (this archive's own
//   append-only history position — the identical meaning
//   `ipfsPublicationRecords`' own `recordIndex` already carries, see
//   application/PublicationObservationArchive.js's own header).
//
//   `ipfsContentVerificationObservationsByRecordIndex` — keyed by
//   `recordIndex`, then array position within that key's own history.
//
//   `bitcoinConfirmationObservationsByAnchorId` /
//   `bitcoinContentProofObservationsByAnchorId` — keyed by `anchorId`,
//   never `contentHash` or `txid` (application/
//   BitcoinAnchorObservationArchiveView.js's own identity discipline, held
//   here once more) — then array position within that anchor's own
//   history. Two anchors holding byte-identical content remain two
//   distinct identities: nothing here ever merges, deduplicates, or
//   cross-references by `contentHash`.
//
//   `baseTransactionInclusionObservationsByTransactionHash` (0.8.97) —
//   keyed by the exact `txid` a real BROADCASTED outcome named, never
//   `contentHash` — the identical explicit-identity restraint held above,
//   one chain over — then array position within that transaction's own
//   history.
//
// NEVER A SET — DUPLICATES AND POSITION REMAIN MEANINGFUL. This file
// invents no generic, unordered JSON diff. `[X, X]` and `[X]` differ — the
// second `X` in the first archive has no counterpart in the second, and is
// reported as `onlyInCurrent` at its own position, never silently absorbed
// because an `X` already "matched" elsewhere. Comparing two collections
// walks their COMMON PREFIX position-by-position (or key-by-key, then
// position-by-position within a key) — the natural shape for an
// append-only history — reporting anything beyond the shorter side's own
// length as `onlyInCurrent`/`onlyInExternal`. This file does NOT assume
// every archive comparison IS a simple prefix relationship — two archives
// need not share a common ancestor — it only assumes that WHEN a fact
// exists at the same identity position in both, comparing that one fact's
// own content is the right question to ask; a differing fact at a shared
// position is reported as `changed`, never silently ignored.
//
// A COLLECTION-LEVEL RESULT, DELIBERATELY NEVER A SINGLE ARCHIVE-LEVEL
// ENUM. `hasFactDifference`/`hasProvenanceDifference` summarize WHETHER
// differences exist, but never collapse WHERE they exist: an archive can
// simultaneously hold identical IPFS facts, an additional Bitcoin
// confirmation, and a changed provenance tag on an existing fact — a
// single top-level `SAME`/`DIFFERENT` verdict would hide exactly which of
// those three is true. Every collection below reports its own,
// independent counts and identity lists.
//
// THE RESULT IS A PLAIN, FROZEN, EPHEMERAL PROJECTION — NEVER A NEW
// DURABLE DOMAIN OBJECT, NEVER PERSISTED. A difference is derived from two
// archives that already exist; if either changes, the difference is
// simply recomputed. This file introduces no
// `PublicationObservationArchiveDifferenceHistory`, writes nothing to
// storage, and holds no field in `PublicationObservationArchive.js`'s own
// schema.
//
// BOTH ARGUMENTS MUST BE ACTUAL `PublicationObservationArchive` INSTANCES
// — NO DUCK TYPING, NO JSON PARSING. This file performs no import
// operation of its own: reconstructing an external payload into an
// archive instance is application/PublicationObservationArchiveInspection.js's
// own `inspectPublicationObservationArchive()`/`PublicationObservationArchive.fromJSON()`'s
// job, one layer below this one. Mirrors application/
// PublicationObservationArchiveFingerprint.js's own strict, throwing
// contract exactly — the identical restraint, for the identical reason:
// a caller here already holds two real archive instances (the current
// archive, always; the external one, already reconstructed by 0.8.86's own
// inspection flow) — there is nothing honest this function could do with
// anything else.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CAPABILITY OF
// ANY KIND. `describePublicationObservationArchiveDifference()` reads no
// clock, performs no import, and never mutates either archive it is
// given. Calling it twice with byte-identical arguments returns a
// byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No archive merging,
// synchronization, reconciliation, or automatic import of any difference
// found here. No "choose current/external" workflow, no archive
// replacement of any kind — that stays exactly where 0.8.82 already put
// it, behind its own explicit confirmation, entirely untouched by this
// file. No trust, authenticity, freshness, or "newer" determination of any
// kind — a difference is never a recommendation. No network-based archive
// retrieval, no peer exchange, no signed archives, no blockchain
// notarization of the difference itself. No automatic comparison after
// inspection — this function runs only when a caller explicitly calls it,
// exactly as 0.8.85's own comparison and 0.8.86's own inspection already
// require of their own callers. See docs/Roadmap.md, 0.8.87, "Deliberately
// excluded," for the complete list.
export function describePublicationObservationArchiveDifference(currentArchive, externalArchive) {
    if (!(currentArchive instanceof PublicationObservationArchive)) {
        throw new Error('describePublicationObservationArchiveDifference() requires a PublicationObservationArchive as currentArchive');
    }
    if (!(externalArchive instanceof PublicationObservationArchive)) {
        throw new Error('describePublicationObservationArchiveDifference() requires a PublicationObservationArchive as externalArchive');
    }

    const currentJSON = currentArchive.toJSON();
    const externalJSON = externalArchive.toJSON();

    const ipfsPublicationRecords = diffPositionalCollection(
        currentJSON.ipfsPublicationRecords, currentJSON.ipfsPublicationRecordProvenance,
        externalJSON.ipfsPublicationRecords, externalJSON.ipfsPublicationRecordProvenance
    );
    const bitcoinBroadcastRecords = diffPositionalCollection(
        currentJSON.bitcoinBroadcastRecords, currentJSON.bitcoinBroadcastRecordProvenance,
        externalJSON.bitcoinBroadcastRecords, externalJSON.bitcoinBroadcastRecordProvenance
    );
    const bitcoinAnchorPublicationRecords = diffPositionalCollection(
        currentJSON.bitcoinAnchorPublicationRecords, currentJSON.bitcoinAnchorPublicationRecordProvenance,
        externalJSON.bitcoinAnchorPublicationRecords, externalJSON.bitcoinAnchorPublicationRecordProvenance
    );

    const ipfsContentVerificationObservationsByRecordIndex = diffKeyedCollection(
        currentJSON.ipfsContentVerificationObservationsByRecordIndex, currentJSON.ipfsContentVerificationObservationProvenanceByRecordIndex,
        externalJSON.ipfsContentVerificationObservationsByRecordIndex, externalJSON.ipfsContentVerificationObservationProvenanceByRecordIndex,
        'recordIndex', (key) => Number(key)
    );
    const bitcoinConfirmationObservationsByAnchorId = diffKeyedCollection(
        currentJSON.bitcoinConfirmationObservationsByAnchorId, currentJSON.bitcoinConfirmationObservationProvenanceByAnchorId,
        externalJSON.bitcoinConfirmationObservationsByAnchorId, externalJSON.bitcoinConfirmationObservationProvenanceByAnchorId,
        'anchorId', (key) => key
    );
    const bitcoinContentProofObservationsByAnchorId = diffKeyedCollection(
        currentJSON.bitcoinContentProofObservationsByAnchorId, currentJSON.bitcoinContentProofObservationProvenanceByAnchorId,
        externalJSON.bitcoinContentProofObservationsByAnchorId, externalJSON.bitcoinContentProofObservationProvenanceByAnchorId,
        'anchorId', (key) => key
    );
    const baseTransactionInclusionObservationsByTransactionHash = diffKeyedCollection(
        currentJSON.baseTransactionInclusionObservationsByTransactionHash, currentJSON.baseTransactionInclusionObservationProvenanceByTransactionHash,
        externalJSON.baseTransactionInclusionObservationsByTransactionHash, externalJSON.baseTransactionInclusionObservationProvenanceByTransactionHash,
        'transactionHash', (key) => key
    );

    const collections = {
        ipfsPublicationRecords,
        ipfsContentVerificationObservationsByRecordIndex,
        bitcoinBroadcastRecords,
        bitcoinConfirmationObservationsByAnchorId,
        bitcoinContentProofObservationsByAnchorId,
        bitcoinAnchorPublicationRecords,
        baseTransactionInclusionObservationsByTransactionHash
    };

    const hasFactDifference = Object.values(collections).some(
        (collection) => collection.changedCount + collection.onlyInCurrentCount + collection.onlyInExternalCount > 0
    );
    const hasProvenanceDifference = Object.values(collections).some(
        (collection) => collection.provenanceChangedCount > 0
    );

    const currentFingerprint = fingerprintPublicationObservationArchive(currentArchive);
    const externalFingerprint = fingerprintPublicationObservationArchive(externalArchive);

    return Object.freeze({
        currentFingerprint,
        externalFingerprint,
        same: currentFingerprint === externalFingerprint,

        ...collections,

        hasFactDifference,
        hasProvenanceDifference,

        // 0.8.84's own excluded field, restated: never part of a fact or
        // provenance count above, and never folded into
        // hasFactDifference/hasProvenanceDifference.
        importEvents: Object.freeze({
            currentCount: currentJSON.archiveImportEvents.length,
            externalCount: externalJSON.archiveImportEvents.length
        })
    });
}

// Compares two ARRAY-shaped collections (`ipfsPublicationRecords`,
// `bitcoinBroadcastRecords`, `bitcoinAnchorPublicationRecords`) by array
// position — this archive's own append-only history position, per this
// file's own header. `currentFacts`/`externalFacts` are already-canonical
// `toJSON()` output (plain, JSON-serializable objects); `currentProvenance`/
// `externalProvenance` are the parallel origin-tag arrays at the identical
// position.
function diffPositionalCollection(currentFacts, currentProvenance, externalFacts, externalProvenance) {
    const unchanged = [];
    const changed = [];
    const onlyInCurrent = [];
    const onlyInExternal = [];
    const provenanceChanged = [];

    const commonLength = Math.min(currentFacts.length, externalFacts.length);
    for (let position = 0; position < commonLength; position++) {
        const factsEqual = JSON.stringify(currentFacts[position]) === JSON.stringify(externalFacts[position]);
        (factsEqual ? unchanged : changed).push(position);
        if (currentProvenance[position] !== externalProvenance[position]) {
            provenanceChanged.push(position);
        }
    }
    for (let position = commonLength; position < currentFacts.length; position++) onlyInCurrent.push(position);
    for (let position = commonLength; position < externalFacts.length; position++) onlyInExternal.push(position);

    return freezeCollectionDifference({
        currentCount: currentFacts.length,
        externalCount: externalFacts.length,
        unchanged, changed, onlyInCurrent, onlyInExternal, provenanceChanged
    });
}

// Compares two KEYED collections (`ipfsContentVerificationObservationsByRecordIndex`,
// `bitcoinConfirmationObservationsByAnchorId`, `bitcoinContentProofObservationsByAnchorId`)
// key-by-key, then position-by-position within each key's own history —
// per this file's own header. A key present on only one side is treated as
// an empty history `[]` on the other, so every one of its own positions
// falls out as `onlyInCurrent`/`onlyInExternal` through the identical
// position logic `diffPositionalCollection()` above already uses — no
// separate "missing key" branch is needed. `keyFieldName`/`parseKey` name
// the identity field an entry's own identity object carries — `recordIndex`
// (parsed back to a number) for the IPFS collection, `anchorId` (left as a
// string) for both Bitcoin ones.
function diffKeyedCollection(currentByKey, currentProvenanceByKey, externalByKey, externalProvenanceByKey, keyFieldName, parseKey) {
    const unchanged = [];
    const changed = [];
    const onlyInCurrent = [];
    const onlyInExternal = [];
    const provenanceChanged = [];
    let currentCount = 0;
    let externalCount = 0;

    // First-seen order — current archive's own keys first, then any
    // additional keys the external archive introduces — mirrors
    // application/PublicationObservationArchiveInspection.js's own
    // `collectBitcoinAnchorIds()` "first-seen order, never re-sorted"
    // discipline.
    const keys = [];
    const seenKeys = new Set();
    function collectKeys(byKey) {
        for (const key of Object.keys(byKey)) {
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                keys.push(key);
            }
        }
    }
    collectKeys(currentByKey);
    collectKeys(externalByKey);

    for (const key of keys) {
        const currentFacts = currentByKey[key] || [];
        const externalFacts = externalByKey[key] || [];
        const currentProvenance = currentProvenanceByKey[key] || [];
        const externalProvenance = externalProvenanceByKey[key] || [];
        currentCount += currentFacts.length;
        externalCount += externalFacts.length;

        const identity = (position) => Object.freeze({ [keyFieldName]: parseKey(key), position });

        const commonLength = Math.min(currentFacts.length, externalFacts.length);
        for (let position = 0; position < commonLength; position++) {
            const factsEqual = JSON.stringify(currentFacts[position]) === JSON.stringify(externalFacts[position]);
            (factsEqual ? unchanged : changed).push(identity(position));
            if (currentProvenance[position] !== externalProvenance[position]) {
                provenanceChanged.push(identity(position));
            }
        }
        for (let position = commonLength; position < currentFacts.length; position++) onlyInCurrent.push(identity(position));
        for (let position = commonLength; position < externalFacts.length; position++) onlyInExternal.push(identity(position));
    }

    return freezeCollectionDifference({ currentCount, externalCount, unchanged, changed, onlyInCurrent, onlyInExternal, provenanceChanged });
}

// The one shape every collection difference above returns — counts
// derived directly from the identity lists that produced them, never
// tracked separately and risking drift.
function freezeCollectionDifference({ currentCount, externalCount, unchanged, changed, onlyInCurrent, onlyInExternal, provenanceChanged }) {
    return Object.freeze({
        currentCount,
        externalCount,
        unchangedCount: unchanged.length,
        changedCount: changed.length,
        onlyInCurrentCount: onlyInCurrent.length,
        onlyInExternalCount: onlyInExternal.length,
        provenanceChangedCount: provenanceChanged.length,
        unchanged: Object.freeze(unchanged),
        changed: Object.freeze(changed),
        onlyInCurrent: Object.freeze(onlyInCurrent),
        onlyInExternal: Object.freeze(onlyInExternal),
        provenanceChanged: Object.freeze(provenanceChanged)
    });
}
