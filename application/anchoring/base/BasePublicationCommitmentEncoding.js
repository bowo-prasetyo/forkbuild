const CONTENT_HASH_PATTERN = /^[0-9a-f]+$/i;
const COMMITMENT_DATA_PATTERN = /^0x[0-9a-f]*$/i;

// 0.8.91 — Explicit Base Publication Transaction Construction.
//
// The one encoding decision this milestone's own proposal named as
// needing to be "settled... because it becomes part of the durable
// meaning of a Base publication." A Base publication transaction carries
// its commitment in ordinary transaction `data`, exactly as `anchoring/
// BitcoinAnchorTransactionBuilder.js`'s own OP_RETURN output already
// carries a Bitcoin one — and this file makes the identical choice that
// class already made, one chain over: the commitment IS the raw
// `contentHash` bytes, nothing wrapped around them.
//
//   contentHash (hex string, no "0x")
//           │
//           ▼
//   encodeBasePublicationCommitment()          (THIS FILE — new)
//           │
//           ▼
//   "0x" + contentHash                  a 0x-prefixed hex byte string,
//                                        suitable as a transaction's own
//                                        `data` field, and NOTHING else
//
// NO ABI ENCODING. NO FUNCTION SELECTOR. NO FORKBUILD-SPECIFIC TAG OR
// MAGIC PREFIX. A 4-byte selector or a length-prefixed ABI tuple would
// imply a smart contract is meant to receive and decode this data —
// there is no contract in this milestone (see docs/Roadmap.md, 0.8.91,
// "The key architectural decision"), and adding selector-shaped bytes to
// a transaction nothing will ever execute would be decoration, not
// meaning. A human-readable prefix (e.g. a UTF-8 "forkbuild:" tag) was
// considered and rejected too: it would make every future Base
// publication a few bytes more expensive to publish, forever, in
// exchange for a label this codebase itself never reads back — `data`
// is decoded by calling `decodeBasePublicationCommitment()` below, not
// by a person eyeballing hex.
//
// SYMMETRIC AND LOSSLESS. `decodeBasePublicationCommitment()` is the
// exact inverse of `encodeBasePublicationCommitment()` — encoding a
// contentHash and decoding the result always returns the identical
// contentHash, byte for byte, case-normalized to lowercase on both
// sides. Neither function performs any hashing, padding, or truncation
// of its own; `contentHash` is carried through unchanged, exactly as
// `anchoring/BitcoinAnchorTransactionBuilder.js`'s own OP_RETURN output
// (`{ type: 'op_return', dataHex: contentHash, ... }`) already carries
// it unchanged on the Bitcoin side.
//
// EVEN-LENGTH HEX ONLY — A TRANSACTION'S `data` FIELD IS WHOLE BYTES.
// Mirrors exactly the same check `anchoring/
// BitcoinAnchorTransactionBuilder.js#build()` already performs on this
// identical `contentHash` value before treating it as raw OP_RETURN
// bytes; a nibble a network could not decode as bytes is refused here
// for the identical reason.
//
// Pure and stateless: no construction, no network access, no history of
// its own. Calling either function twice with the byte-identical input
// returns a byte-identical result.
export function encodeBasePublicationCommitment(contentHash) {
    if (typeof contentHash !== 'string' || !CONTENT_HASH_PATTERN.test(contentHash) || contentHash.length % 2 !== 0) {
        throw new Error('encodeBasePublicationCommitment: contentHash must be an even-length hex string to carry as raw transaction data bytes');
    }
    return '0x' + contentHash.toLowerCase();
}

export function decodeBasePublicationCommitment(data) {
    if (typeof data !== 'string' || !COMMITMENT_DATA_PATTERN.test(data) || data.length % 2 !== 0) {
        throw new Error('decodeBasePublicationCommitment: data must be a 0x-prefixed, even-length hex string');
    }
    return data.slice(2).toLowerCase();
}
