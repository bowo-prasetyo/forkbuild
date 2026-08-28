import { BlockchainKind, isValidBlockchainKind } from './BlockchainKind.js';

// 0.8.89 — Multi-Blockchain Publication Domain Boundary.
//
// Every Bitcoin-domain milestone since 0.8.80 has quietly assumed
// something this codebase never actually said out loud: that a
// publication identity belongs to Bitcoin. application/
// BitcoinAnchorPublicationRecord.js's own header (0.8.80) names its
// identity as `{ anchorId, contentHash, txid, network, createdAt }` —
// nowhere in that tuple does the word "Bitcoin" appear as data, only as
// the class's own name. That was harmless with exactly one blockchain in
// the codebase. It stops being harmless the moment a second one exists:
// a caller holding a bare `{ contentHash, chainReference }` pair has no
// way to say, in data, which chain that pair came from — and no way to
// prove two such pairs from two different chains are NOT the same
// publication, beyond hoping their `chainReference` strings never
// collide.
//
// THIS CLASS IS THAT MISSING FIELD, NAMED, AND NOTHING ELSE. It carries
// the four facts that are genuinely chain-independent — which chain
// (`blockchain`), what was published (`contentHash`), the chain's own
// opaque pointer to that publication (`chainReference` — a Bitcoin txid
// today; a future Base transaction hash would fill the identical slot),
// and when this replica minted the identity (`createdAt`). It carries
// nothing else: no PSBT, no UTXO, no gas price, no signer, no wallet
// adapter, no confirmation state. Every one of those stays exactly where
// it already lives — underneath a specific blockchain's own
// implementation (anchoring/Bitcoin*.js, application/Bitcoin*.js) — this
// class never becomes a "GenericBlockchainTransaction" that tries to
// speak for mechanics as different as Bitcoin's UTXO/PSBT model and an
// EVM chain's account/gas model. See docs/Roadmap.md, 0.8.89, for why a
// universal transaction abstraction is exactly the mistake this
// milestone exists to avoid.
//
//   Publication
//       │
//       ├── contentHash        "what was published"          (chain-independent)
//       ├── blockchain         "which chain recorded it"      (chain-independent)
//       ├── chainReference     "that chain's own pointer"     (chain-independent SHAPE,
//       │                                                      chain-specific VALUE)
//       └── createdAt          "when this replica minted it"  (chain-independent)
//
//            Bitcoin                          Base (RESERVED — not built yet)
//               │                                 │
//         txid, PSBT, UTXO,                 tx hash, EVM account,
//         Esplora broadcast/                gas, JSON-RPC broadcast/
//         confirmation                      confirmation
//
// BLOCKCHAIN + CHAINREFERENCE IS THE ONLY IDENTITY — CONTENTHASH IS
// CARRIED, NEVER COMPARED. This is the one rule this entire class exists
// to enforce, and it extends docs/Principles.md, "Correlate Evidence By
// Explicit Identity, Never By Resemblance (0.8.78)," across a second
// axis. 0.8.78 already established that a shared `contentHash` is never
// evidence of a shared Bitcoin anchor; `sameAs()` below extends that
// identical restraint to a shared `contentHash` ACROSS chains. A Bitcoin
// publication and a (future) Base publication can carry byte-identical
// `contentHash` values — the same content, independently published on
// two networks — and `sameAs()` reports them as what they are: two
// entirely separate publications, never merged, never reconciled, never
// treated as corroborating or contradicting one another. See this file's
// own flagship test in tests/BlockchainPublicationIdentity.test.js for
// the concrete two-blockchains-one-contentHash proof, and application/
// PublicationEvidenceConvergence.js for the pre-existing, unrelated
// mechanism this codebase already uses when it DOES want to state that
// several pieces of evidence describe the same publication — never this
// class inventing a second one.
//
// A PROJECTION TARGET, NEVER A REPLACEMENT. This class is never
// constructed FROM a bare object a caller assembles by hand from a
// chain-specific record's own fields — it is reached by calling that
// record's own projection method (application/
// BitcoinAnchorPublicationRecord.js#toBlockchainPublicationIdentity(),
// 0.8.89). `BitcoinAnchorPublicationRecord` keeps every field it already
// had, unchanged, in the exact same `toJSON()` shape it has produced
// since 0.8.80 — this milestone adds a derived view over it, never a
// second, competing identity a caller could construct inconsistently
// with the record it was supposed to describe. A future Base publication
// record would gain the identical projection method, never a second
// constructor path on THIS class for assembling one from raw parts.
//
// IMMUTABLE, AND NEVER GIVEN A SECOND CONSTRUCTOR PATH — the identical
// discipline application/BitcoinAnchorPublicationRecord.js's own header
// already holds: every field is validated once, at construction, and
// frozen; there is no setter, no wither, and no way to produce a
// "corrected" identity other than minting an entirely new one from its
// own source record.
export class BlockchainPublicationIdentity {
    constructor({ blockchain, contentHash, chainReference, createdAt } = {}) {
        if (!isValidBlockchainKind(blockchain)) {
            throw new Error(
                'BlockchainPublicationIdentity requires a known BlockchainKind value for blockchain — '
                + 'never an inferred, guessed, or free-text chain name'
            );
        }
        if (typeof contentHash !== 'string' || !contentHash.trim()) {
            throw new Error('BlockchainPublicationIdentity requires a non-empty contentHash');
        }
        if (typeof chainReference !== 'string' || !chainReference.trim()) {
            throw new Error('BlockchainPublicationIdentity requires a non-empty chainReference');
        }
        const createdAtDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
        if (Number.isNaN(createdAtDate.getTime())) {
            throw new Error('BlockchainPublicationIdentity: createdAt must be a valid date');
        }
        this._blockchain = blockchain;
        this._contentHash = contentHash;
        this._chainReference = chainReference;
        this._createdAt = createdAtDate;
        Object.freeze(this);
    }

    get blockchain() { return this._blockchain; }
    get contentHash() { return this._contentHash; }
    get chainReference() { return this._chainReference; }
    get createdAt() { return this._createdAt; }

    // The one equality this class recognizes. Two identities are the
    // SAME publication only when they name the same blockchain AND the
    // same chainReference — never when they merely share a contentHash,
    // and never when one side isn't even a genuine
    // BlockchainPublicationIdentity. A Bitcoin identity and a Base
    // identity that happen to carry the identical chainReference string
    // (a coincidence this class does not assume can't happen) are still
    // never the same publication, because blockchain must ALSO match —
    // the exact reason `blockchain` exists as its own field rather than
    // being folded into `chainReference` as a prefix.
    sameAs(other) {
        return other instanceof BlockchainPublicationIdentity
            && this._blockchain === other._blockchain
            && this._chainReference === other._chainReference;
    }

    toJSON() {
        return {
            blockchain: this._blockchain,
            contentHash: this._contentHash,
            chainReference: this._chainReference,
            createdAt: this._createdAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new BlockchainPublicationIdentity({
            blockchain: json.blockchain,
            contentHash: json.contentHash,
            chainReference: json.chainReference,
            createdAt: json.createdAt
        });
    }
}

export { BlockchainKind };
