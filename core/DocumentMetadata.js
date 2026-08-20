import { VERSION } from './version.js';
import { PROTOCOL_VERSION } from './protocolVersion.js';
import { License } from './License.js';

const DEFAULT_ENGINE_VERSION = `${VERSION.major}.${VERSION.minor}.${VERSION.patch}`;

export class DocumentMetadata {
    constructor({
        title = 'Untitled ForkBuild World',
        // 0.2.21: a free-text summary a user writes for their own
        // document — distinct from "no description was ever set"
        // (empty string), same reasoning as license's UNSPECIFIED vs a
        // real choice. Never null: absence IS the empty string here,
        // there being no permissions consequence to "no description"
        // the way there is for "no license".
        description = '',
        author = null,
        created = null,
        modified = null,
        protocolVersion = PROTOCOL_VERSION,
        engineVersion = DEFAULT_ENGINE_VERSION,
        parentDocumentId = null,
        // 0.2.81: independent of parentDocumentId — a fork of a
        // PUBLISHED WORLD (ForkPublishedWorldUseCase/DocumentCloneService)
        // sets parentDocumentId; a fork of a LIBRARY STRUCTURE
        // (application/ForkStructureUseCase.js) sets parentStructureId
        // instead. A document can carry either, both (if that ever
        // becomes a real flow), or neither — they are two different
        // provenance questions ("what document was this cloned from" vs
        // "what library structure was this forked from"), never
        // conflated into one field. See docs/Principles.md, "Forking A
        // Structure Records Provenance, Never A Live Dependency."
        parentStructureId = null,
        license = null
    } = {}) {
        this._title = title;
        this._description = description;
        this._author = author;
        this._created = created;
        this._modified = modified;
        this._protocolVersion = protocolVersion;
        this._engineVersion = engineVersion;
        this._parentDocumentId = parentDocumentId;
        this._parentStructureId = parentStructureId;
        this._license = license instanceof License ? license : (license ? License.fromJSON(license) : new License());
    }

    get title() { return this._title; }
    get description() { return this._description; }
    get author() { return this._author; }
    get created() { return this._created; }
    get modified() { return this._modified; }
    get protocolVersion() { return this._protocolVersion; }
    get engineVersion() { return this._engineVersion; }
    get parentDocumentId() { return this._parentDocumentId; }
    get parentStructureId() { return this._parentStructureId; }
    get license() { return this._license; }

    // 0.2.21: title/description become directly editable (Document
    // Properties UI) — same "value object with a few narrow, explicit
    // setters" shape license already established, not a switch to a
    // fully mutable bag. touch() is the ONE place `modified` advances;
    // callers (UpdateDocumentMetadataUseCase,
    // WorldNavigationSession.updateDocumentMetadata) call it after
    // applying edits rather than each setter stamping a timestamp
    // itself, so a batch of field changes advances `modified` once.
    set title(t) { this._title = t; }
    set description(d) { this._description = d; }
    set license(l) { this._license = l instanceof License ? l : new License(); }

    touch() {
        this._modified = new Date();
    }

    toJSON() {
        return {
            title: this._title,
            description: this._description,
            author: this._author,
            created: this._created ? this._created.toISOString() : null,
            modified: this._modified ? this._modified.toISOString() : null,
            protocolVersion: this._protocolVersion,
            engineVersion: this._engineVersion,
            parentDocumentId: this._parentDocumentId,
            parentStructureId: this._parentStructureId,
            license: this._license.toJSON()
        };
    }

    static fromJSON(json) {
        return new DocumentMetadata({
            title: json.title,
            // Pre-0.2.21 documents have no `description` field —
            // tolerant default, same pattern as parentDocumentId
            // below. No schema/protocol version bump: this is an
            // additive, backward-compatible metadata field, exactly
            // like license and parentDocumentId were when they were
            // added.
            description: json.description || '',
            author: json.author,
            created: json.created ? new Date(json.created) : null,
            modified: json.modified ? new Date(json.modified) : null,
            protocolVersion: json.protocolVersion,
            engineVersion: json.engineVersion,
            parentDocumentId: json.parentDocumentId || null,
            // Pre-0.2.81 documents have no `parentStructureId` field —
            // same tolerant-default treatment as parentDocumentId.
            parentStructureId: json.parentStructureId || null,
            license: json.license ? License.fromJSON(json.license) : null
        });
    }
}
