import { BlockchainPublicationIdentity } from './BlockchainPublicationIdentity.js';

// 0.8.104 — Explicit Publication Reference Relationship.
//
// Every milestone through 0.8.103 could derive facts entirely ABOUT one
// publication's own lifecycle — was it published, on which chain, was it
// confirmed, did it earn a threshold. None of them could ever state a fact
// ABOUT TWO PUBLICATIONS TOGETHER:
//
//   Publication A REFERENCES Publication B.
//
// This class is that one fact, named, and nothing else:
//
//   { sourcePublicationIdentity, referencedPublicationIdentity, createdAt }
//
// DELIBERATELY NOT CALLED "FORK." A reference is the plain, factual
// primitive: one publication's own identity explicitly points at another's.
// "Fork," "derivative," "citation," and "response" are all INTERPRETATIONS
// of a reference this class refuses to make. A future milestone may add a
// `referenceKind` this class does not carry today, once this codebase
// actually has a protocol-level way to prove one of those interpretations —
// see docs/Roadmap.md, 0.8.104, "Deliberately excluded." Nothing here
// guesses at that meaning early.
//
// BOTH SIDES ARE `BlockchainPublicationIdentity` (0.8.89) INSTANCES —
// NEVER A SECOND, COMPETING IDENTITY SHAPE. This class invents no `{
// blockchain, txid }` pair of its own, and never accepts one. It reuses
// 0.8.89's own chain-independent identity verbatim, the identical
// discipline application/AchievementEvent.js's own `sourcePublicationIdentity`
// already holds (0.8.102) — extended here to name TWO identities instead
// of one. See that class's own header, "A Projection Target, Never A
// Replacement": exactly as there, a `BlockchainPublicationIdentity` handed
// to this class's own constructor is expected to have been reached by
// calling an already-durable publication record's own
// `toBlockchainPublicationIdentity()` — application/
// CreatePublicationReferenceRecordUseCase.js's own header names the one
// place this codebase is expected to do that, never assembled by hand from
// raw strings a person typed into a form.
//
// NEVER CORRELATED BY `contentHash` — THE ONE RULE THIS ENTIRE CLASS
// EXISTS TO ENFORCE. `sourcePublicationIdentity`/`referencedPublicationIdentity`
// are compared, when they need to be compared at all, only through
// `BlockchainPublicationIdentity#sameAs()` (0.8.89) — `blockchain` AND
// `chainReference`, never `contentHash`. Two publications that happen to
// carry byte-identical content, published independently under two
// different `chainReference`s, are two entirely different referenced
// publications here, exactly as they already are everywhere else in this
// codebase — see that class's own header, "Blockchain + chainReference Is
// The Only Identity — contentHash Is Carried, Never Compared."
//
// A PUBLICATION NEVER REFERENCES ITSELF. `sourcePublicationIdentity` and
// `referencedPublicationIdentity` naming the SAME identity (via `sameAs()`)
// is rejected at construction — a genuine domain rule, not an inferred
// one: a reference states that one publication points at ANOTHER, and a
// publication pointing at its own identity states nothing a person could
// not already know without this class existing at all.
//
// IMMUTABLE, AND NEVER GIVEN A SECOND CONSTRUCTOR PATH — the identical
// discipline every other durable identity record in this codebase already
// holds (application/BitcoinAnchorPublicationRecord.js, 0.8.80; application/
// BaseAnchorPublicationRecord.js, 0.8.99). Every field is validated once,
// at construction, and frozen; there is no setter, no wither, and no way
// to produce a "corrected" reference other than minting an entirely new
// one.
//
// NO VERDICT, NO WEIGHT, NO KIND. This class carries no `valid`, `trusted`,
// `weight`, `strength`, `confidence`, `verified`, or `referenceKind` field
// — see docs/Principles.md, "The UI Displays Observations; It Does Not
// Turn Them Into A Verdict (0.8.57)," held here once more, over a
// relationship between two publications rather than a single one.
export class PublicationReferenceRecord {
    constructor({ sourcePublicationIdentity, referencedPublicationIdentity, createdAt } = {}) {
        if (!(sourcePublicationIdentity instanceof BlockchainPublicationIdentity)) {
            throw new Error('PublicationReferenceRecord requires a genuine BlockchainPublicationIdentity for sourcePublicationIdentity');
        }
        if (!(referencedPublicationIdentity instanceof BlockchainPublicationIdentity)) {
            throw new Error('PublicationReferenceRecord requires a genuine BlockchainPublicationIdentity for referencedPublicationIdentity');
        }
        if (sourcePublicationIdentity.sameAs(referencedPublicationIdentity)) {
            throw new Error('PublicationReferenceRecord requires sourcePublicationIdentity and referencedPublicationIdentity to name two different publications — a publication cannot reference itself');
        }
        const createdAtDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
        if (Number.isNaN(createdAtDate.getTime())) {
            throw new Error('PublicationReferenceRecord: createdAt must be a valid date');
        }
        this._sourcePublicationIdentity = sourcePublicationIdentity;
        this._referencedPublicationIdentity = referencedPublicationIdentity;
        this._createdAt = createdAtDate;
        Object.freeze(this);
    }

    get sourcePublicationIdentity() { return this._sourcePublicationIdentity; }
    get referencedPublicationIdentity() { return this._referencedPublicationIdentity; }
    get createdAt() { return this._createdAt; }

    toJSON() {
        return {
            sourcePublicationIdentity: this._sourcePublicationIdentity.toJSON(),
            referencedPublicationIdentity: this._referencedPublicationIdentity.toJSON(),
            createdAt: this._createdAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new PublicationReferenceRecord({
            sourcePublicationIdentity: BlockchainPublicationIdentity.fromJSON(json.sourcePublicationIdentity),
            referencedPublicationIdentity: BlockchainPublicationIdentity.fromJSON(json.referencedPublicationIdentity),
            createdAt: json.createdAt
        });
    }
}
