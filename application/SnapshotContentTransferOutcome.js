// 0.8.32 — Explicit Snapshot Content Transfer.
//
// Names every way application/ImportPublicationSnapshotTransferPackageUseCase.js
// #execute() can end, the same "one enum, one file" shape application/
// PublicationResolutionOutcome.js (0.7.1) already established for a
// content-retrieval pipeline one layer over. A malformed PACKAGE (wrong
// `kind`, missing `content`, ...) never reaches this enum at all — that
// throws PublicationSnapshotTransferPackageError straight out of
// application/PublicationSnapshotTransferPackageValidator.js, structural
// input hygiene, before the outcome of the transfer itself is even asked.
// This enum answers a narrower question than that: once a package IS
// well-formed, what happened to the bytes it carried?
//
//   STORED                — `content` verified against `contentHash` and
//                            was newly written to this replica's own
//                            ContentStore.
//   ALREADY_STORED        — `content` verified against `contentHash`, but
//                            this replica already held bytes for that
//                            hash. Never an error — the ordinary cost of
//                            the same snapshot reaching this replica more
//                            than once, the identical "duplicate is not a
//                            failure" posture every *AcquisitionKind.js in
//                            this codebase already holds for a claim.
//   CONTENT_HASH_MISMATCH — `content` does NOT hash to the package's own
//                            `contentHash`. Nothing is stored. This is the
//                            ONE outcome that says the package itself was
//                            corrupted or forged in transit — see
//                            application/PeerContentExchange.js's own
//                            header, "the only thing that ever makes a
//                            RESPONSE trustworthy is core/
//                            ContentReference.js#verify()" — restated here
//                            for an offline file instead of a live message.
export const SnapshotContentTransferOutcome = Object.freeze({
    STORED: 'stored',
    ALREADY_STORED: 'already-stored',
    CONTENT_HASH_MISMATCH: 'content-hash-mismatch'
});
