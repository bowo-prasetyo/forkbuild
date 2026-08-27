import { ContentReference } from '../core/ContentReference.js';
import { IpfsPublicationContentVerificationState } from './IpfsPublicationContentVerificationState.js';

// 0.8.69 — IPFS Publication Record & Content-Identity Binding.
//
// 0.8.67's own closing paragraph named this exact gap: "independently
// verifying that content published through this milestone's own
// pipeline actually resolves, through the gateway, to bytes that still
// hash to what was published." This class is that independent check,
// and only that check:
//
//   IpfsPublicationRecord { contentHash, locator }
//        │
//        ▼
//   contentStore.get({ hash: contentHash, uri: locator })   (injected —
//        │                                                   content/
//        │                                                   IpfsGatewayContentStore.js
//        │                                                   or content/
//        │                                                   IpfsContentStore.js,
//        │                                                   UNCHANGED)
//        ▼
//   retrieved bytes, or ContentUnavailableError
//        │
//        ▼
//   core/ContentReference.js#verify(bytes)          (UNCHANGED)
//        │
//        ▼
//   HASH_MATCH / HASH_MISMATCH / UNAVAILABLE   (application/
//                                                IpfsPublicationContentVerificationState.js)
//
// NEITHER THE GATEWAY NOR THE PINNING PROVIDER IS EVER TAUGHT ABOUT
// CONTENT IDENTITY. `content/IpfsGatewayContentStore.js` and `content/
// IpfsContentStore.js` stay exactly as 0.8.66/0.7.1 built them — neither
// one gains a `verify` option, a callback, or any awareness that this
// class exists. This class is the ONLY place a `contentHash` and a CID
// are ever brought back together after a publish — the gateway only
// ever moves bytes; this class is the one that asks whether the bytes
// it got back are the bytes that were meant.
//
// A FRESH RETRIEVAL EVERY CALL, NEVER CACHED, NEVER COMPARED AGAINST AN
// EARLIER CALL. `verify()` performs exactly one `contentStore.get()`
// per invocation and returns a new, frozen observation — the identical
// restraint `application/BitcoinAnchorProofReconciliationView.js#
// reconcile()`'s own header already holds for a Bitcoin proof check. A
// caller that wants to retry, poll, or keep a history of observations
// does so itself, one layer up; this class only ever answers "what does
// this one retrieval attempt, right now, say."
//
// UNAVAILABLE COVERS EVERY WAY BYTES COULD FAIL TO COME BACK — A THROWN
// ContentUnavailableError, ANY OTHER THROW, OR A STORE THAT SIMPLY
// RESOLVES TO `null`/`undefined` — NEVER DISTINGUISHED FROM EACH OTHER,
// NEVER TREATED AS A MISMATCH. This mirrors `application/
// PublicationResolver.js#resolve()`'s own step 4 exactly: "a ContentStore
// may THROW... or simply return nothing; both mean the identical thing
// from a caller's perspective." A locator that cannot presently be
// resolved is not evidence the content is wrong — only that it could not
// be checked right now.
//
// A MISMATCH IS ONLY EVER REPORTED FOR BYTES THAT WERE ACTUALLY
// RETRIEVED. `core/ContentReference.js#verify()` is called only once
// real bytes are in hand; there is no code path that reports
// HASH_MISMATCH for an unreachable locator.
export class IpfsPublicationContentVerifier {
    constructor({ contentStore } = {}) {
        if (!contentStore || typeof contentStore.get !== 'function') {
            throw new Error('IpfsPublicationContentVerifier: a contentStore with a get() method is required');
        }
        this._contentStore = contentStore;
    }

    // Resolves to exactly one, frozen observation:
    //
    //   { state, contentHash, locator, reason, observedAt }
    //
    // `record` may be an `application/IpfsPublicationRecord.js` instance
    // or any plain object carrying `contentHash`/`locator` strings —
    // this class never requires an `instanceof` check, mirroring
    // `application/BitcoinAnchorProofReconciliationView.js#reconcile()`'s
    // own duck-typed acceptance of a `core/PublicationAnchor.js`.
    //
    // Throws only for a caller-contract violation checked before the
    // injected contentStore is ever consulted: a missing `record`, or one
    // with no non-empty `contentHash`/`locator` string. Never throws for
    // the contentStore's own operational failure — that is always
    // reported as UNAVAILABLE.
    async verify(record) {
        if (!record || typeof record !== 'object'
            || typeof record.contentHash !== 'string' || !record.contentHash
            || typeof record.locator !== 'string' || !record.locator) {
            throw new Error('IpfsPublicationContentVerifier: a record with contentHash and locator is required');
        }

        const observedAt = new Date();
        const reference = new ContentReference({ hash: record.contentHash, uri: record.locator });

        let bytes;
        try {
            bytes = await this._contentStore.get(reference);
        } catch (error) {
            return this._outcome(IpfsPublicationContentVerificationState.UNAVAILABLE, record, error.message, observedAt);
        }
        if (bytes === null || bytes === undefined) {
            return this._outcome(
                IpfsPublicationContentVerificationState.UNAVAILABLE, record,
                'the content store returned no bytes for this locator', observedAt
            );
        }

        const matches = reference.verify(bytes);
        return this._outcome(
            matches ? IpfsPublicationContentVerificationState.HASH_MATCH : IpfsPublicationContentVerificationState.HASH_MISMATCH,
            record, null, observedAt
        );
    }

    _outcome(state, record, reason, observedAt) {
        return Object.freeze({ state, contentHash: record.contentHash, locator: record.locator, reason, observedAt });
    }
}
