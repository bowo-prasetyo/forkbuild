import { VERSION } from './version.js';
import { PROTOCOL_VERSION } from './protocolVersion.js';
import { License } from './License.js';

const DEFAULT_ENGINE_VERSION = `${VERSION.major}.${VERSION.minor}.${VERSION.patch}`;

export class DocumentMetadata {
    constructor({
        title = 'Untitled ForkBuild World',
        author = null,
        created = null,
        modified = null,
        protocolVersion = PROTOCOL_VERSION,
        engineVersion = DEFAULT_ENGINE_VERSION,
        parentDocumentId = null,
        license = null
    } = {}) {
        this._title = title;
        this._author = author;
        this._created = created;
        this._modified = modified;
        this._protocolVersion = protocolVersion;
        this._engineVersion = engineVersion;
        this._parentDocumentId = parentDocumentId;
        this._license = license instanceof License ? license : (license ? License.fromJSON(license) : new License());
    }

    get title() { return this._title; }
    get author() { return this._author; }
    get created() { return this._created; }
    get modified() { return this._modified; }
    get protocolVersion() { return this._protocolVersion; }
    get engineVersion() { return this._engineVersion; }
    get parentDocumentId() { return this._parentDocumentId; }
    get license() { return this._license; }
    
    set license(l) { this._license = l instanceof License ? l : new License(); }

    toJSON() {
        return {
            title: this._title,
            author: this._author,
            created: this._created ? this._created.toISOString() : null,
            modified: this._modified ? this._modified.toISOString() : null,
            protocolVersion: this._protocolVersion,
            engineVersion: this._engineVersion,
            parentDocumentId: this._parentDocumentId,
            license: this._license.toJSON()
        };
    }

    static fromJSON(json) {
        return new DocumentMetadata({
            title: json.title,
            author: json.author,
            created: json.created ? new Date(json.created) : null,
            modified: json.modified ? new Date(json.modified) : null,
            protocolVersion: json.protocolVersion,
            engineVersion: json.engineVersion,
            parentDocumentId: json.parentDocumentId || null,
            license: json.license ? License.fromJSON(json.license) : null
        });
    }
}
