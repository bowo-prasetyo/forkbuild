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
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
    }

    get avatarId() { return this._avatarId; }
    get ownerIdentity() { return this._ownerIdentity; }
    get templateId() { return this._templateId; }
    get appearance() { return { ...this._appearance }; }
    get displayName() { return this._displayName; }
    get createdAt() { return this._createdAt; }
    get updatedAt() { return this._updatedAt; }

    withTemplateId(templateId) {
        return new AvatarProfile({ ...this._fields(), templateId, updatedAt: new Date() });
    }

    withAppearance(appearance) {
        return new AvatarProfile({ ...this._fields(), appearance: { ...appearance }, updatedAt: new Date() });
    }

    withDisplayName(displayName) {
        return new AvatarProfile({ ...this._fields(), displayName, updatedAt: new Date() });
    }

    _fields() {
        return {
            avatarId: this._avatarId,
            ownerIdentity: this._ownerIdentity,
            templateId: this._templateId,
            appearance: this._appearance,
            displayName: this._displayName,
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
            createdAt: json.createdAt,
            updatedAt: json.updatedAt
        });
    }
}
