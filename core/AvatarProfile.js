import { createId } from './createId.js';

// 0.2.33 — the persistent half of the Identity/AvatarProfile/Presence
// split this milestone establishes:
//
//   Identity   -> Who is this?             (identity/Identity.js)
//   Avatar     -> What does this user       (THIS FILE — persistent)
//   Profile       look like?
//   Presence   -> Where is the user         (core/AvatarPresence.js —
//                 right now?                 ephemeral, NEVER here)
//   Document   -> What world content         (core/Document.js)
//                 exists?
//   World      -> Where is that document     (core/WorldPlacement.js)
//   Placement     located?
//
// An AvatarProfile is NOT a Document, NOT a Publication, and NOT a
// WorldPlacement. It never enters the publish/discovery/placement
// pipeline those three go through. It answers exactly one question —
// "what does this person's avatar look like?" — and nothing about
// where they are or how they're currently posed.
//
// Deliberately UNSIGNED for now, unlike Publication/PlacementRecord
// (which gained a signature layer in 0.2.16 without changing their
// already-established fields — see docs/Principles.md). An
// AvatarProfile has no cross-replica trust need YET: nothing in this
// codebase distributes one to another replica. That happens in 0.2.37
// ("Decentralized Presence Synchronization"), and when it does, a
// signature layer can be added the exact same way Publication and
// PlacementRecord got theirs — a new, optional, additive field, not a
// rewrite of what's here. `ownerIdentity` is deliberately a plain
// string (the owning username) for the same reason Publication.author
// stayed a plain string through 0.2.15: it's the simplest thing that
// answers "whose is this" today, and a richer SigningIdentity
// reference can arrive later as a new field alongside it, exactly as
// Publication.publisherIdentity did.
//
// 0.2.41 update: distribution finally happened — see
// core/AvatarProfileAdvertisement.js. This class ITSELF still never
// carries a signature (the additive `revision` field below is all it
// gained); signing happens on the ADVERTISEMENT, the wire shape
// produced FROM a profile, exactly the same split 0.2.38 drew between
// core/AvatarPresence.js (never signed) and
// core/AvatarPresenceAdvertisement.js (optionally signed).
//
// Immutable, like Publication/PlacementRecord/DocumentPreview — never
// like DocumentMetadata's in-place setters. An avatar's look changes
// rarely and deliberately (the Avatar Creator, 0.2.34), and an
// immutable snapshot is what a future signature layer will need to
// sign anyway.
export const DEFAULT_AVATAR_TEMPLATE_ID = 'humanoid-01';

export class AvatarProfile {
    constructor({
        avatarId = createId(),
        ownerIdentity,
        templateId = DEFAULT_AVATAR_TEMPLATE_ID,
        // A plain, opaque parameter bag — 0.2.34 defines what actually
        // goes in here (hair/skin/clothing/colors/...). 0.2.33
        // deliberately does not constrain its shape: this milestone is
        // the model boundary, not the customization schema.
        appearance = {},
        displayName = '',
        // 0.2.41 — a plain, monotonically-increasing integer, the
        // SAME "flat counter, not a CausalStamp" reasoning
        // core/AvatarPresence.js's own `sequence` already established:
        // one writer (this profile's owner, editing through
        // AvatarProfileUseCase.updateProfile — see its own header),
        // no offline-merge story, so a flat integer is the simplest
        // thing that lets a future receiver detect "this claim is
        // older than one I already have." Bumped on every with*() call
        // below, never left for a caller to set directly — exactly
        // like PlacementRecord's own `revision`.
        revision = 0,
        createdAt = new Date(),
        updatedAt = new Date()
    } = {}) {
        if (!ownerIdentity || typeof ownerIdentity !== 'string') {
            throw new Error('AvatarProfile requires an ownerIdentity (the owning username)');
        }
        this._avatarId = avatarId;
        this._ownerIdentity = ownerIdentity;
        this._templateId = templateId;
        this._appearance = { ...appearance };
        this._displayName = displayName;
        this._revision = revision;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
    }

    get avatarId() { return this._avatarId; }
    get ownerIdentity() { return this._ownerIdentity; }
    get templateId() { return this._templateId; }
    get appearance() { return { ...this._appearance }; }
    get displayName() { return this._displayName; }
    get revision() { return this._revision; }
    get createdAt() { return this._createdAt; }
    get updatedAt() { return this._updatedAt; }

    withTemplateId(templateId) {
        return new AvatarProfile({ ...this._fields(), templateId, revision: this._revision + 1, updatedAt: new Date() });
    }

    withAppearance(appearance) {
        return new AvatarProfile({ ...this._fields(), appearance: { ...appearance }, revision: this._revision + 1, updatedAt: new Date() });
    }

    withDisplayName(displayName) {
        return new AvatarProfile({ ...this._fields(), displayName, revision: this._revision + 1, updatedAt: new Date() });
    }

    _fields() {
        return {
            avatarId: this._avatarId,
            ownerIdentity: this._ownerIdentity,
            templateId: this._templateId,
            appearance: this._appearance,
            displayName: this._displayName,
            revision: this._revision,
            createdAt: this._createdAt
        };
    }

    toJSON() {
        return {
            avatarId: this._avatarId,
            ownerIdentity: this._ownerIdentity,
            templateId: this._templateId,
            appearance: { ...this._appearance },
            displayName: this._displayName,
            revision: this._revision,
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString()
        };
    }

    static fromJSON(json) {
        return new AvatarProfile({
            avatarId: json.avatarId,
            ownerIdentity: json.ownerIdentity,
            templateId: json.templateId,
            appearance: json.appearance || {},
            displayName: json.displayName || '',
            revision: Number.isFinite(json.revision) ? json.revision : 0,
            createdAt: json.createdAt,
            updatedAt: json.updatedAt
        });
    }
}
