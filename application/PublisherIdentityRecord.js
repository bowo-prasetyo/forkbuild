// 0.8.108 — Explicit Publisher Identity Association.
//
// Every milestone through 0.8.107 could attribute an achievement to a
// PUBLICATION — a `BlockchainPublicationIdentity` (0.8.89), always
// projected from an already-durable Bitcoin or Base publication record.
// None of them could ever say which PUBLISHER stands behind one, or
// several, of those publications. This class is the missing subject, kept
// as small as this milestone's own header in `docs/Roadmap.md` insists it
// must be: an explicit, user-supplied label, and nothing else.
//
//   PublisherIdentityRecord
//       │
//       └── publisherId   "the label a person explicitly chose"
//
// NOT A CRYPTOGRAPHIC IDENTITY. NOT A KEY. NOT A SIGNATURE. This class
// carries no public key, no algorithm, no signature, and proves nothing —
// it is a bare, opaque string a person typed, wrapped so the rest of this
// milestone's own files never pass a raw string around where an identity
// is meant. See this milestone's own "Signed Association Claims" future
// work in `docs/Roadmap.md` for where a cryptographic layer could
// eventually sit ON TOP of a `PublisherIdentityRecord` — never inside it.
//
// DELIBERATELY DISTINCT FROM `identity/SigningIdentity.js`'s OWN
// `Publication.publisherIdentity` (0.2.16, `core/DecentralizedPublication.js`
// / `publisher/Publication.js`) — AN UNRELATED, PRE-EXISTING CONCEPT THIS
// CLASS DOES NOT TOUCH, EXTEND, OR REPLACE. That `publisherIdentity` is an
// Ed25519 `did:key` a logged-in user's own keypair produces, carried by
// the peer-to-peer publication protocol so a signature can be verified
// without an external identity store — a genuine cryptographic identity.
// This `PublisherIdentityRecord`, by contrast, is scoped entirely to the
// blockchain-anchor/achievement subsystem built since 0.8.75
// (`application/PublicationObservationArchive.js` and everything reading
// it) and carries no key material whatsoever — a person could type
// "Publisher A" into a text field and mint one. The two share a name in
// English only; naming this class anything that suggested otherwise (e.g.
// reusing `SigningIdentity` or importing from `identity/`) would be
// exactly the kind of conflation this header exists to head off.
//
// EQUALITY IS EXACT, CASE-SENSITIVE STRING EQUALITY OF `publisherId` —
// NEVER NORMALIZED, TRIMMED, LOWERCASED, OR FUZZY-MATCHED. "Publisher A"
// and "publisher a" are two different publisher identities under
// `sameAs()` below, deliberately: normalizing them into "the same
// publisher" would itself be exactly the resemblance-based inference
// `docs/Principles.md`, "Correlate Evidence By Explicit Identity, Never By
// Resemblance (0.8.78)," already forbids one layer down, for
// `BlockchainPublicationIdentity`'s own `blockchain`/`chainReference`
// pair. A person who wants two associations to name the same publisher
// must type the identical `publisherId` both times — this class enforces
// nothing beyond that.
//
// CARRIES NO `createdAt` OF ITS OWN — UNLIKE `BlockchainPublicationIdentity`,
// AND DELIBERATELY SO. `BlockchainPublicationIdentity` carries a
// `createdAt` because it is always PROJECTED from an already-durable
// record (`BitcoinAnchorPublicationRecord`/`BaseAnchorPublicationRecord`)
// whose own `createdAt` genuinely means "when this replica minted this
// publication's identity." A `PublisherIdentityRecord` has no such
// underlying durable record — it is constructed fresh, directly from
// whatever `publisherId` a person types, every time
// `application/CreatePublisherPublicationAssociationRecordUseCase.js`
// mints one. A `createdAt` on THIS class would answer only "when was this
// particular in-memory instance constructed," never "when was this
// publisher first established" — a fact this codebase has no way to know
// and will not pretend to record. The one honest timestamp this
// milestone keeps is `application/PublisherPublicationAssociationRecord.js`'s
// own `createdAt` — "when was THIS relationship recorded" — never
// confused with a publisher's own, unknowable first-establishment moment.
//
// IMMUTABLE, AND NEVER GIVEN A SECOND CONSTRUCTOR PATH — the identical
// discipline every other durable identity/value class in this codebase
// already holds (`application/BlockchainPublicationIdentity.js`, 0.8.89;
// `application/PublicationReferenceRecord.js`, 0.8.104). Every field is
// validated once, at construction, and frozen; there is no setter, no
// wither, and no way to produce a "corrected" publisher identity other
// than minting an entirely new one.
//
// NO VERDICT, NO WEIGHT, NO TRUST, NO "VERIFIED OWNER." This class carries
// no `valid`, `trusted`, `verified`, `official`, `authentic`, or
// `confidence` field — see `docs/Principles.md`, "The UI Displays
// Observations; It Does Not Turn Them Into A Verdict (0.8.57)," held here
// once more, over a bare, explicitly user-supplied label.
export class PublisherIdentityRecord {
    constructor({ publisherId } = {}) {
        if (typeof publisherId !== 'string' || !publisherId.trim()) {
            throw new Error('PublisherIdentityRecord requires a non-empty publisherId');
        }
        this._publisherId = publisherId;
        Object.freeze(this);
    }

    get publisherId() { return this._publisherId; }

    // The one equality this class recognizes: exact, case-sensitive string
    // equality of `publisherId` alone. Never normalized — see this file's
    // own header.
    sameAs(other) {
        return other instanceof PublisherIdentityRecord && this._publisherId === other._publisherId;
    }

    toJSON() {
        return { publisherId: this._publisherId };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new PublisherIdentityRecord({ publisherId: json.publisherId });
    }
}
