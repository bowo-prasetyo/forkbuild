import { PublisherIdentityRecord } from './PublisherIdentityRecord.js';
import { BlockchainPublicationIdentity } from './BlockchainPublicationIdentity.js';

// 0.8.108 — Explicit Publisher Identity Association.
//
// The durable relationship this milestone exists to add — the missing
// bridge between "publication X earned achievement Y" (0.8.102-0.8.107)
// and any future "publisher P's own achievements, across every
// publication P explicitly claims":
//
//   PublisherIdentityRecord (0.8.108)
//       │
//       │  explicit, person-initiated association
//       ▼
//   BlockchainPublicationIdentity (0.8.89)
//
// This class is that one fact, named, and nothing else:
//   { publisherIdentity, publicationIdentity, createdAt }
//
// STATES ASSOCIATION, NEVER OWNERSHIP OR HUMAN IDENTITY. This record says
// exactly one thing: "this publisher identity is explicitly associated
// with this publication identity." It does NOT say "this is the legal
// owner," and it does NOT say "this person is definitely the human behind
// it" — see `application/PublisherIdentityRecord.js`'s own header for why
// `publisherIdentity` itself carries no cryptographic proof of anything.
// A future milestone may layer a signed claim on top of an association
// this class already holds (see `docs/Roadmap.md`, this milestone's own
// "Signed Association Claims" future work) — this class anticipates that
// by staying exactly this narrow today, never by inventing a `verified`,
// `ownerProven`, or `signature` field ahead of the mechanism that would
// make one honest.
//
// BOTH SIDES ARE ALREADY-CONSTRUCTED, GENUINE INSTANCES — THIS CLASS
// ASSEMBLES NEITHER FROM RAW PARTS. `publisherIdentity` must be a real
// `application/PublisherIdentityRecord.js` (0.8.108) instance;
// `publicationIdentity` must be a real `BlockchainPublicationIdentity`
// (0.8.89) instance, reached exactly the way `application/
// PublicationReferenceRecord.js`'s own header already requires — by
// calling an already-durable publication record's own
// `toBlockchainPublicationIdentity()`, never assembled by hand from raw
// strings a person typed into a form. `application/
// CreatePublisherPublicationAssociationRecordUseCase.js`'s own header
// names the one place this codebase is expected to construct both.
//
// NEVER CORRELATED BY `contentHash`, A SHARED WALLET, OR ANY OTHER
// RESEMBLANCE — THE ONE RULE THIS ENTIRE MILESTONE EXISTS TO ENFORCE.
// Two publications that happen to share a `contentHash`, or whose
// underlying transactions happen to share a sending address, are NEVER
// treated as evidence they share a publisher. The only thing that
// associates a publication with a publisher is a
// `PublisherPublicationAssociationRecord` a person explicitly caused to
// exist — see `application/CreatePublisherPublicationAssociationRecordUseCase.js`'s
// own header, "No Automatic Call Site," and `docs/Principles.md`,
// "Correlate Evidence By Explicit Identity, Never By Resemblance
// (0.8.78)," held here once more, one layer over a relationship between a
// publisher and a publication rather than between two publications.
//
// NO SELF-REFERENCE CHECK — UNLIKE `PublicationReferenceRecord`. A
// publisher identity and a publication identity are never the same KIND
// of thing (`PublisherIdentityRecord` vs. `BlockchainPublicationIdentity`)
// and could never collide the way two `BlockchainPublicationIdentity`
// instances naming the same publication can; this class therefore adds no
// analogous rejection.
//
// NEVER DEDUPLICATED — THE IDENTICAL RESTRAINT `PublicationReferenceRecord.js`
// ALREADY HOLDS. A person associating the same publisher with the same
// publication twice (perhaps by mistake, perhaps deliberately re-asserting
// it) produces two independent, equally durable records — never merged,
// never treated as "already recorded, so skip it." See `application/
// PublisherPublicationAssociationRecordHistory.js`'s own header for where
// that append-only discipline lives.
//
// IMMUTABLE, AND NEVER GIVEN A SECOND CONSTRUCTOR PATH — the identical
// discipline every other durable relationship record in this codebase
// already holds (`application/PublicationReferenceRecord.js`, 0.8.104).
// Every field is validated once, at construction, and frozen; there is no
// setter, no wither, and no way to produce a "corrected" association other
// than minting an entirely new one.
//
// NO VERDICT, NO WEIGHT, NO KIND. This class carries no `valid`,
// `trusted`, `weight`, `strength`, `confidence`, `verified`, or
// `associationKind` field — see `docs/Principles.md`, "The UI Displays
// Observations; It Does Not Turn Them Into A Verdict (0.8.57)," held here
// once more, over a relationship between a publisher and a publication
// rather than between two publications or a single one.
export class PublisherPublicationAssociationRecord {
    constructor({ publisherIdentity, publicationIdentity, createdAt } = {}) {
        if (!(publisherIdentity instanceof PublisherIdentityRecord)) {
            throw new Error('PublisherPublicationAssociationRecord requires a genuine PublisherIdentityRecord for publisherIdentity');
        }
        if (!(publicationIdentity instanceof BlockchainPublicationIdentity)) {
            throw new Error('PublisherPublicationAssociationRecord requires a genuine BlockchainPublicationIdentity for publicationIdentity');
        }
        const createdAtDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
        if (Number.isNaN(createdAtDate.getTime())) {
            throw new Error('PublisherPublicationAssociationRecord: createdAt must be a valid date');
        }
        this._publisherIdentity = publisherIdentity;
        this._publicationIdentity = publicationIdentity;
        this._createdAt = createdAtDate;
        Object.freeze(this);
    }

    get publisherIdentity() { return this._publisherIdentity; }
    get publicationIdentity() { return this._publicationIdentity; }
    get createdAt() { return this._createdAt; }

    toJSON() {
        return {
            publisherIdentity: this._publisherIdentity.toJSON(),
            publicationIdentity: this._publicationIdentity.toJSON(),
            createdAt: this._createdAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new PublisherPublicationAssociationRecord({
            publisherIdentity: PublisherIdentityRecord.fromJSON(json.publisherIdentity),
            publicationIdentity: BlockchainPublicationIdentity.fromJSON(json.publicationIdentity),
            createdAt: json.createdAt
        });
    }
}
